import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ratios,
  layouts,
  templates,
  regions,
  placement,
  captionDownload,
} from "../frontend/lib/editor-core.mjs";
import { renderPlan } from "./render.mjs";
import { subtitles } from "./captions.mjs";
const slot = (assetId = null) => ({
  assetId,
  mode: "fill",
  x: 0.5,
  y: 0.5,
  scale: 1,
  visible: true,
});
export const settings = (ratio = "9:16", layout = "fill") => ({
  version: 1,
  aspectRatio: ratio,
  layout,
  slots: regions(layout, ...ratios[ratio]).map(() => slot("source")),
  textOverlays: [],
  videoVisible: true,
  captionsVisible: true,
  audio: {
    sourceMuted: true,
    sourceVolume: 1,
    narrationVolume: 1,
    musicAssetId: null,
    musicVolume: 0.22,
  },
});
for (const [ratio, [width, height]] of Object.entries(ratios))
  for (const layout of layouts)
    test(`${ratio} ${layout} uses matching bounded even slot geometry`, () => {
      for (const region of regions(layout, width, height)) {
        assert.ok(
          region.x >= 0 &&
            region.y >= 0 &&
            region.x + region.width <= width &&
            region.y + region.height <= height,
        );
        assert.equal(region.width % 2, 0);
        assert.equal(region.height % 2, 0);
        const p = placement(region, { width: 640, height: 360 }, slot());
        assert.ok(p.width >= region.width && p.height >= region.height);
      }
    });
test("render mixes narration, primary source and non-looping music with narration duration", () => {
  const s = settings();
  s.audio.sourceMuted = false;
  s.audio.musicAssetId = "music";
  const plan = renderPlan(
    { editorSettings: s, audioPath: "voice.mp3" },
    [
      {
        id: "source",
        kind: "video",
        path: "source.mp4",
        width: 640,
        height: 360,
        hasAudio: true,
      },
      { id: "music", kind: "audio", path: "music.mp3" },
    ],
    4,
    "captions.ass",
    "output.mp4",
  );
  const filter = plan.args[plan.args.indexOf("-filter_complex") + 1];
  assert.match(filter, /amix=inputs=3/);
  assert.equal(plan.args[plan.args.indexOf("-t") + 1], "4");
  assert.equal(plan.args[plan.args.indexOf("music.mp3") - 1], "-i");
});
test("caption exports keep segment timing, Unicode and VTT header", () => {
  const captions = [{ text: "မင်္ဂလာပါ", startMs: 61010, endMs: 63050 }];
  assert.match(
    captionDownload(captions, "srt"),
    /00:01:01,010 --> 00:01:03,050/,
  );
  assert.match(captionDownload(captions, "vtt"), /^WEBVTT\n\n00:01:01.010/);
  assert.equal(captionDownload(captions, "txt"), "မင်္ဂလာပါ");
});
for (const style of templates)
  test(`${style} and text overlays honor visibility and literal text`, () => {
    const s = settings();
    s.textOverlays = [
      {
        text: "မင်္ဂလာပါ {\\pos(0,0)}",
        x: 0.5,
        y: 0.2,
        fontSize: 36,
        color: "#ffffff",
        align: "center",
        bold: true,
        background: true,
        visible: true,
      },
    ];
    const result = subtitles(
      [{ text: "Caption", startMs: 0, endMs: 1000 }],
      true,
      style,
      { width: 720, height: 1280, settings: s, duration: 2 },
    );
    assert.match(result, /မင်္ဂလာပါ/);
    assert.ok(!result.includes("{\\pos(0,0)}"));
    s.captionsVisible = false;
    s.textOverlays[0].visible = false;
    assert.ok(
      !subtitles([{ text: "Caption", startMs: 0, endMs: 1000 }], true, style, {
        settings: s,
      }).includes("Dialogue:"),
    );
  });
