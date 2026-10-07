export const ratios = {
  "9:16": [720, 1280],
  "16:9": [1280, 720],
  "1:1": [720, 720],
  "4:5": [720, 900],
};
export const layouts = [
  "fill",
  "fit",
  "split",
  "three",
  "four",
  "picture-in-picture",
  "screen-share",
  "gameplay",
];
export const templates = [
  "clean-bottom",
  "boxed-minimal",
  "bold-center",
  "karaoke-highlight",
];
export function regions(layout, width, height) {
  const even = (v) => Math.max(2, Math.round(v / 2) * 2);
  const rect = (x, y, w, h, circle = false) => ({
    x: even(x) === 2 && x === 0 ? 0 : even(x),
    y: even(y) === 2 && y === 0 ? 0 : even(y),
    width: even(w),
    height: even(h),
    circle,
  });
  const gap = even(Math.min(width, height) * 0.012);
  switch (layout) {
    case "split":
      return [
        rect(0, 0, (width - gap) / 2, height),
        rect((width + gap) / 2, 0, (width - gap) / 2, height),
      ];
    case "three": {
      const side = even((width - gap) / 3),
        row = even((height - gap) / 2);
      return [
        rect(0, 0, width - side - gap, height),
        rect(width - side, 0, side, row),
        rect(width - side, row + gap, side, row),
      ];
    }
    case "four":
      return [0, 1, 2, 3].map((i) =>
        rect(
          i % 2 ? (width + gap) / 2 : 0,
          i > 1 ? (height + gap) / 2 : 0,
          (width - gap) / 2,
          (height - gap) / 2,
        ),
      );
    case "picture-in-picture": {
      const w = even(width * 0.28),
        h = even((w * 9) / 16),
        m = even(width * 0.035);
      return [
        rect(0, 0, width, height),
        rect(width - w - m, height - h - m, w, h),
      ];
    }
    case "screen-share": {
      const m = even(width * 0.035),
        c = even(Math.min(width, height) * 0.2);
      return [
        rect(m, m, width - m * 2, height - m * 2),
        rect(width - c - m, height - c - m, c, c, true),
      ];
    }
    case "gameplay": {
      const w = even(width * 0.24),
        h = even((w * 9) / 16),
        m = even(width * 0.03);
      return [rect(0, 0, width, height), rect(m, m, w, h)];
    }
    default:
      return [rect(0, 0, width, height)];
  }
}
export function placement(region, asset, slot) {
  const base =
    (slot.mode === "fit" ? Math.min : Math.max)(
      region.width / asset.width,
      region.height / asset.height,
    ) * slot.scale;
  const width = Math.max(2, Math.round((asset.width * base) / 2) * 2),
    height = Math.max(2, Math.round((asset.height * base) / 2) * 2);
  return {
    width,
    height,
    x: Math.round(region.width * slot.x - width / 2),
    y: Math.round(region.height * slot.y - height / 2),
  };
}
export function captionAppearance(style, width, height) {
  return {
    fontSize: Math.round(width * (style === "bold-center" ? 0.0625 : 0.0472)),
    x: width / 2,
    y: style === "bold-center" ? height / 2 : height * 0.86,
    bold: style === "bold-center" || style === "karaoke-highlight",
    background: style === "boxed-minimal",
    color: style === "karaoke-highlight" ? "#bef264" : "#ffffff",
    maxWidth: width * 0.86,
  };
}
export function captionDownload(captions, format) {
  const stamp = (ms, comma) => {
    const n = Math.max(0, Math.round(ms));
    return `${String(Math.floor(n / 3600000)).padStart(2, "0")}:${String(Math.floor(n / 60000) % 60).padStart(2, "0")}:${String(Math.floor(n / 1000) % 60).padStart(2, "0")}${comma ? "," : "."}${String(n % 1000).padStart(3, "0")}`;
  };
  if (format === "txt") return captions.map((c) => c.text).join("\n");
  return (
    (format === "vtt" ? "WEBVTT\n\n" : "") +
    captions
      .map(
        (c, i) =>
          `${format === "srt" ? `${i + 1}\n` : ""}${stamp(c.startMs, format === "srt")} --> ${stamp(c.endMs, format === "srt")}\n${c.text.replace(/-->/g, "→")}\n`,
      )
      .join("\n")
  );
}
