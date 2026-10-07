import { captionAppearance } from "../frontend/lib/editor-core.mjs";
export function time(ms) {
  const n = Math.max(0, Math.round(ms / 10));
  return `${Math.floor(n / 360000)}:${String(Math.floor(n / 6000) % 60).padStart(2, "0")}:${String(Math.floor(n / 100) % 60).padStart(2, "0")}.${String(n % 100).padStart(2, "0")}`;
}
export function escapeAss(text) {
  return String(text)
    .replace(/\\/g, "")
    .replace(/[{}]/g, "")
    .replace(/[\r\n]+/g, "\\N");
}
const assColor = (hex) =>
  `&H${hex.slice(5, 7)}${hex.slice(3, 5)}${hex.slice(1, 3)}&`;
export function subtitles(
  captions,
  vertical,
  style = "clean-bottom",
  options = {},
) {
  const width = options.width ?? (vertical ? 720 : 1280),
    height = options.height ?? (vertical ? 1280 : 720);
  const appearance = captionAppearance(style, width, height),
    settings = options.settings;
  let header = `[Script Info]\nScriptType: v4.00+\nPlayResX: ${width}\nPlayResY: ${height}\nWrapStyle: 0\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Noto Sans Myanmar,${appearance.fontSize},&H00FFFFFF,&H00FFFFFF,&H00000000,&H60000000,0,0,0,0,100,100,0,0,1,2,0,5,${Math.round(width * 0.07)},${Math.round(width * 0.07)},0,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n`;
  const defaultStyle = header
    .split("\n")
    .find((line) => line.startsWith("Style: Default"));
  const boxStyle = defaultStyle
    .replace("Style: Default,", "Style: Box,")
    .replace(",100,100,0,0,1,2,0,5,", ",100,100,0,0,3,10,0,5,");
  header = header.replace("\n\n[Events]", `\n${boxStyle}\n\n[Events]`);
  const events = [];
  if (settings?.captionsVisible !== false)
    for (const c of captions) {
      const tags = `\\an5\\pos(${appearance.x},${Math.round(appearance.y)})\\fs${appearance.fontSize}\\b${appearance.bold ? 1 : 0}\\1c${assColor(appearance.color)}\\bord${appearance.background ? 10 : 2}${appearance.background ? "\\3a&H60&\\3c&H000000&\\shad0" : ""}`;
      events.push(
        `Dialogue: 1,${time(c.startMs)},${time(c.endMs)},${appearance.background ? "Box" : "Default"},,0,0,0,,{${tags}}${escapeAss(c.text)}`,
      );
    }
  for (const overlay of settings?.textOverlays ?? []) {
    if (!overlay.visible || !overlay.text) continue;
    const align = { left: 4, center: 5, right: 6 }[overlay.align];
    const tags = `\\an${align}\\pos(${Math.round(overlay.x * width)},${Math.round(overlay.y * height)})\\fs${(overlay.fontSize * width) / 720}\\b${overlay.bold ? 1 : 0}\\1c${assColor(overlay.color)}\\bord${overlay.background ? 10 : 0}\\3c&H000000&\\3a&H60&\\shad0`;
    events.push(
      `Dialogue: 0,${time(0)},${time((options.duration ?? 3600) * 1000)},${overlay.background ? "Box" : "Default"},,0,0,0,,{${tags}}${escapeAss(overlay.text)}`,
    );
  }
  return header + events.join("\n") + "\n";
}
