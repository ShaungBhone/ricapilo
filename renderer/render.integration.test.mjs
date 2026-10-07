import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  ratios,
  layouts,
  templates,
  regions,
} from "../frontend/lib/editor-core.mjs";
import { subtitles } from "./captions.mjs";
import { renderPlan } from "./render.mjs";
const enabled = process.env.RENDER_TEST === "1";
test(
  "FFmpeg renders every aspect ratio/layout and all caption templates with Burmese text",
  { skip: !enabled },
  () => {
    const dir = mkdtempSync(
      path.join(process.env.RENDER_ARTIFACTS ?? tmpdir(), "editor-render-"),
    );
    const run = (args) => {
      const r = spawnSync(
        "ffmpeg",
        ["-hide_banner", "-loglevel", "error", ...args],
        { encoding: "utf8", timeout: 60000 },
      );
      assert.equal(r.status, 0, r.stderr);
    };
    const source = path.join(dir, "source.mp4"),
      voice = path.join(dir, "voice.wav"),
      music = path.join(dir, "music.wav");
    run([
      "-y",
      "-f",
      "lavfi",
      "-i",
      "testsrc2=size=320x180:rate=30:duration=0.6",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:duration=0.6",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-shortest",
      source,
    ]);
    run(["-y", "-f", "lavfi", "-i", "sine=frequency=880:duration=0.6", voice]);
    run(["-y", "-f", "lavfi", "-i", "sine=frequency=220:duration=0.2", music]);
    let i = 0;
    for (const [ratio, [width, height]] of Object.entries(ratios))
      for (const layout of layouts) {
        const s = {
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
        };
        const style = templates[i++ % templates.length],
          ass = path.join(dir, `${ratio.replace(":", "-")}-${layout}.ass`),
          out = ass.replace(".ass", ".mp4");
        writeFileSync(
          ass,
          subtitles(
            [{ text: "မြန်မာစာ စာတန်း", startMs: 0, endMs: 600 }],
            true,
            style,
            { width, height, settings: s, duration: 0.6 },
          ),
        );
        const plan = renderPlan(
          { editorSettings: s, audioPath: voice },
          [
            {
              id: "source",
              kind: "video",
              path: source,
              width: 320,
              height: 180,
              hasAudio: true,
            },
            { id: "music", kind: "audio", path: music },
          ],
          0.6,
          ass,
          out,
        );
        run(plan.args);
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
              out,
            ],
            { encoding: "utf8" },
          ),
        );
        assert.equal(
          info.streams.find((s) => s.codec_type === "video").width,
          width,
        );
        assert.equal(
          info.streams.find((s) => s.codec_type === "video").height,
          height,
        );
        assert.ok(info.streams.some((s) => s.codec_type === "audio"));
        assert.ok(Math.abs(Number(info.format.duration) - 0.6) < 0.1);
      }
    // Also render an audio-only project with all video and captions hidden.
    const s = {
      version: 1,
      aspectRatio: "1:1",
      layout: "fill",
      slots: [
        {
          assetId: null,
          mode: "fill",
          x: 0.5,
          y: 0.5,
          scale: 1,
          visible: true,
        },
      ],
      textOverlays: [],
      videoVisible: false,
      captionsVisible: false,
      audio: {
        sourceMuted: true,
        sourceVolume: 1,
        narrationVolume: 1,
        musicAssetId: null,
        musicVolume: 0,
      },
    };
    const ass = path.join(dir, "plain.ass");
    writeFileSync(
      ass,
      subtitles([], true, "clean-bottom", {
        width: 720,
        height: 720,
        settings: s,
        duration: 0.6,
      }),
    );
    run(
      renderPlan(
        { editorSettings: s, audioPath: voice },
        [],
        0.6,
        ass,
        path.join(dir, "plain.mp4"),
      ).args,
    );
    console.log(`Render artifacts: ${dir}`);
  },
);
