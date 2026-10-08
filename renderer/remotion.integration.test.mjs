import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  access,
  rm,
} from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { once } from "node:events";
import { renderStill, selectComposition } from "@remotion/renderer";
import { serveMedia } from "./private-media.mjs";
import {
  ratios,
  layouts,
  templates,
  regions,
} from "../frontend/lib/editor-core.mjs";

test(
  "Remotion exports all ratios/layouts and preserves the authenticated render contract",
  { skip: process.env.REMOTION_RENDER_TEST !== "1", timeout: 600000 },
  async (t) => {
    const root = await mkdtemp(
      path.join(process.env.RENDER_ARTIFACTS ?? tmpdir(), "remotion-render-"),
    );
    const dir = path.join(root, "projects/1");
    await mkdir(dir, { recursive: true });
    const ffmpeg = (args) =>
      execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", ...args], {
        timeout: 60000,
      });
    ffmpeg([
      "-y",
      "-f",
      "lavfi",
      "-i",
      "testsrc2=size=320x180:rate=30:duration=0.2",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:duration=0.2",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-shortest",
      path.join(dir, "source.mp4"),
    ]);
    ffmpeg([
      "-y",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=880:duration=0.4",
      path.join(dir, "voice.wav"),
    ]);
    ffmpeg([
      "-y",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=220:duration=0.2",
      path.join(dir, "music.wav"),
    ]);
    const server = spawn(process.execPath, ["server.mjs"], {
      env: {
        ...process.env,
        PORT: "4100",
        MEDIA_ROOT: root,
        RENDERER_TOKEN: "integration-token",
        RENDERER_ENGINE: "remotion",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let logs = "";
    server.stdout.on("data", (data) => {
      logs += data;
    });
    server.stderr.on("data", (data) => {
      logs += data;
    });
    const url = "http://127.0.0.1:4100";
    const request = (body, auth = true) =>
      fetch(`${url}/render`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(auth ? { Authorization: "Bearer integration-token" } : {}),
        },
        body: JSON.stringify(body),
      });
    try {
      for (let n = 0; n < 100; n++) {
        try {
          if ((await fetch(`${url}/health`)).ok) break;
        } catch {}
        if (server.exitCode !== null) throw Error(logs);
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      assert.equal((await request({}, false)).status, 401);
      let index = 0;
      let lastInput;
      for (const [ratio, [width, height]] of Object.entries(ratios)) {
        for (const layout of layouts) {
          const input = {
            projectId: "1",
            format: "vertical",
            audioPath: "projects/1/voice.wav",
            mediaPath: "projects/1/source.mp4",
            captionStyle: templates[index++ % templates.length],
            captions: [{ text: "မြန်မာစာ စာတန်း", startMs: 0, endMs: 400 }],
            assets: [{ id: "music", path: "projects/1/music.wav" }],
            editorSettings: {
              version: 1,
              aspectRatio: ratio,
              layout,
              slots: regions(layout, width, height).map((_, n) => ({
                assetId: "source",
                mode: n % 2 ? "fit" : "fill",
                x: 0.5,
                y: 0.5,
                scale: 1,
                visible: true,
              })),
              textOverlays: [
                {
                  id: "text",
                  text: "မင်္ဂလာပါ",
                  x: 0.5,
                  y: 0.2,
                  fontSize: 36,
                  color: "#ffffff",
                  align: "center",
                  bold: true,
                  background: true,
                  visible: true,
                },
              ],
              videoVisible: true,
              captionsVisible: true,
              audio: {
                sourceMuted: false,
                sourceVolume: 0.2,
                narrationVolume: 0.8,
                musicAssetId: "music",
                musicVolume: 0.1,
              },
            },
          };
          await t.test(`${ratio} ${layout}`, async () => {
            const responses =
              index === 1
                ? await Promise.all([request(input), request(input)])
                : [await request(input)];
            if (index === 1)
              assert.deepEqual(
                responses.map((response) => response.status).sort(),
                [200, 409],
              );
            const response = responses.find(
              (response) => response.status === 200,
            );
            assert.ok(response, logs);
            assert.deepEqual(await response.json(), {
              path: "projects/1/recap.mp4",
            });
            const info = JSON.parse(
              execFileSync(
                "ffprobe",
                [
                  "-v",
                  "error",
                  "-show_entries",
                  "format=duration:stream=codec_type,width,height",
                  "-of",
                  "json",
                  path.join(dir, "recap.mp4"),
                ],
                { encoding: "utf8" },
              ),
            );
            const video = info.streams.find(
              (stream) => stream.codec_type === "video",
            );
            assert.equal(video.width, width);
            assert.equal(video.height, height);
            assert.ok(
              info.streams.some((stream) => stream.codec_type === "audio"),
            );
            assert.ok(Math.abs(Number(info.format.duration) - 0.4) < 0.1);
            if (index === 1) {
              const pcm = execFileSync("ffmpeg", [
                "-v",
                "error",
                "-i",
                path.join(dir, "recap.mp4"),
                "-vn",
                "-ac",
                "1",
                "-ar",
                "8000",
                "-f",
                "f32le",
                "pipe:1",
              ]);
              const amplitude = (frequency, offset) => {
                let real = 0,
                  imaginary = 0;
                for (let sample = 0; sample < 800; sample++) {
                  const value = pcm.readFloatLE((offset + sample) * 4);
                  const angle = (2 * Math.PI * frequency * sample) / 8000;
                  real += value * Math.cos(angle);
                  imaginary += value * Math.sin(angle);
                }
                return Math.hypot(real, imaginary) / 400;
              };
              assert.ok(amplitude(880, 240) > 0.02, "narration is audible");
              assert.ok(amplitude(440, 240) > 0.005, "source audio is audible");
              assert.ok(amplitude(220, 240) > 0.003, "music is audible");
              assert.ok(
                amplitude(220, 2240) < amplitude(220, 240) * 0.35,
                "music stops at its end instead of looping",
              );
              ffmpeg([
                "-y",
                "-i",
                path.join(dir, "recap.mp4"),
                "-frames:v",
                "1",
                path.join(root, "burmese-captions.png"),
              ]);
              const media = await serveMedia([
                path.join(dir, "voice.wav"),
                path.join(dir, "source.mp4"),
                path.join(dir, "music.wav"),
              ]);
              try {
                const inputProps = {
                  duration: 0.4,
                  narrationSrc: media.urls[0],
                  assets: [
                    {
                      id: "source",
                      kind: "video",
                      width: 320,
                      height: 180,
                      duration: 0.2,
                      hasAudio: true,
                      src: media.urls[1],
                    },
                    {
                      id: "music",
                      kind: "audio",
                      duration: 0.2,
                      hasAudio: true,
                      src: media.urls[2],
                    },
                  ],
                  draft: {
                    title: "",
                    transcript: "",
                    script: "",
                    captions: input.captions,
                    caption_style: input.captionStyle,
                    editor_settings: input.editorSettings,
                  },
                };
                const serveUrl = path.resolve("bundle");
                const composition = await selectComposition({
                  serveUrl,
                  id: "Recap",
                  inputProps,
                });
                await renderStill({
                  serveUrl,
                  composition,
                  inputProps,
                  frame: 0,
                  output: path.join(root, "preview.png"),
                });
                const comparison = spawnSync(
                  "ffmpeg",
                  [
                    "-hide_banner",
                    "-i",
                    path.join(root, "preview.png"),
                    "-i",
                    path.join(root, "burmese-captions.png"),
                    "-lavfi",
                    "psnr",
                    "-f",
                    "null",
                    "-",
                  ],
                  { encoding: "utf8", timeout: 60000 },
                );
                assert.equal(comparison.status, 0, comparison.stderr);
                const psnr = /average:([\d.]+)/.exec(comparison.stderr);
                assert.ok(psnr && Number(psnr[1]) > 30, comparison.stderr);
              } finally {
                await media.close();
              }
            }
          });
          lastInput = input;
        }
      }
      lastInput.editorSettings.videoVisible = false;
      lastInput.editorSettings.captionsVisible = false;
      lastInput.editorSettings.textOverlays = [];
      assert.equal((await request(lastInput)).status, 200, logs);
      const previous = await readFile(path.join(dir, "recap.mp4"));
      await writeFile(path.join(dir, "broken.mp4"), "broken");
      assert.equal(
        (await request({ ...lastInput, mediaPath: "projects/1/broken.mp4" }))
          .status,
        500,
      );
      assert.deepEqual(await readFile(path.join(dir, "recap.mp4")), previous);
      await assert.rejects(access(path.join(dir, "recap.pending.mp4")));
      assert.equal(
        (
          await request({
            ...lastInput,
            audioPath: "projects/1/../2/voice.wav",
          })
        ).status,
        500,
      );
      assert.equal((await request(lastInput)).status, 200, logs);
      console.log(`Remotion render artifacts: ${root}`);
    } finally {
      const exited = once(server, "exit");
      server.kill();
      await exited;
      if (!process.env.RENDER_ARTIFACTS)
        await rm(root, { recursive: true, force: true });
    }
  },
);
