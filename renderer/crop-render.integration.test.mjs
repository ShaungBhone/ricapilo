import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { renderStill, selectComposition } from "@remotion/renderer";
import { serveMedia } from "./private-media.mjs";
import { renderPlan } from "./render.mjs";
import { regions } from "../frontend/lib/editor-core.mjs";

// Run after building the bundle: CROP_RENDER_TEST=1 node --test this-file.mjs.
test(
  "cropped FFmpeg exports match the shared preview, including blurred gaps",
  {
    skip: process.env.CROP_RENDER_TEST !== "1",
    timeout: 180000,
  },
  async (t) => {
    const root = await mkdtemp(
      path.join(process.env.RENDER_ARTIFACTS ?? tmpdir(), "crop-parity-"),
    );
    const source = path.join(root, "source.mp4");
    const voice = path.join(root, "voice.wav");
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
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-colorspace",
      "bt709",
      "-color_primaries",
      "bt709",
      "-color_trc",
      "bt709",
      source,
    ]);
    ffmpeg([
      "-y",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=880:duration=0.2",
      voice,
    ]);
    const ass = path.join(root, "captions.ass");
    await writeFile(
      ass,
      "[Script Info]\nScriptType: v4.00+\nPlayResX: 720\nPlayResY: 1280\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Arial,36,&HFFFFFF,&HFFFFFF,&H000000,&H000000,0,0,0,0,100,100,0,0,1,0,0,2,0,0,0,1\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n",
    );
    const media = await serveMedia([source]);
    const asset = {
      id: "source",
      kind: "video",
      width: 320,
      height: 180,
      duration: 0.2,
      hasAudio: false,
      path: source,
    };
    try {
      for (const [name, layout, mode, scale, x, y] of [
        ["fit", "fit", "fit", 1, 0.5, 0.5],
        ["fill", "fill", "fill", 1, 0.5, 0.5],
        ["custom", "fit", "fit", 0.7, 0.65, 0.35],
        ["split", "split", "fit", 0.8, 0.6, 0.4],
        ["picture-in-picture", "picture-in-picture", "fit", 0.8, 0.5, 0.5],
        ["circle", "screen-share", "fit", 0.65, 0.5, 0.5],
      ]) {
        await t.test(name, async () => {
          const s = {
            version: 1,
            aspectRatio: "9:16",
            layout,
            slots: [],
            textOverlays: [],
            videoVisible: true,
            captionsVisible: false,
            audio: {
              sourceMuted: true,
              sourceVolume: 1,
              narrationVolume: 1,
              musicAssetId: null,
              musicVolume: 0,
            },
          };
          s.slots = regions(layout, 720, 1280).map(() => ({
            assetId: "source",
            visible: true,
            mode,
            scale,
            x,
            y,
          }));
          const output = path.join(root, `${name}.mp4`);
          ffmpeg(
            renderPlan(
              { editorSettings: s, audioPath: voice },
              [asset],
              0.2,
              ass,
              output,
            ).args,
          );
          const exported = path.join(root, `${name}-export.png`);
          ffmpeg(["-y", "-i", output, "-frames:v", "1", exported]);
          const inputProps = {
            duration: 0.2,
            narrationSrc: null,
            assets: [{ ...asset, src: media.urls[0] }],
            draft: {
              title: "",
              transcript: "",
              script: "",
              captions: [],
              caption_style: "clean-bottom",
              editor_settings: s,
            },
          };
          const serveUrl = path.resolve("bundle");
          const composition = await selectComposition({
            serveUrl,
            id: "Recap",
            inputProps,
          });
          const preview = path.join(root, `${name}-preview.png`);
          await renderStill({
            serveUrl,
            composition,
            inputProps,
            frame: 0,
            output: preview,
          });
          const comparison = spawnSync(
            "ffmpeg",
            [
              "-hide_banner",
              "-i",
              preview,
              "-i",
              exported,
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
          assert.ok(
            psnr && Number(psnr[1]) > 28,
            `preview/export mismatch: ${comparison.stderr}`,
          );
        });
      }
    } finally {
      await media.close();
    }
  },
);
