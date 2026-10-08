import {
  ratios,
  regions,
  placement,
  backdropPlacement,
} from "../frontend/lib/editor-core.mjs";

export function renderPlan(input, assets, duration, assPath, output) {
  const settings = input.editorSettings;
  const [width, height] = ratios[settings.aspectRatio];
  const args = [
    "-y",
    "-f",
    "lavfi",
    "-i",
    `color=c=0x050505:s=${width}x${height}:r=30:d=${duration}`,
  ];
  const filters = [];
  let index = 1,
    base = "0:v";
  const sources = [];
  for (const [i, region] of regions(settings.layout, width, height).entries()) {
    const slot = settings.slots[i],
      asset = assets.find((a) => a.id === slot?.assetId && a.kind === "video");
    if (!settings.videoVisible || !slot?.visible || !asset) continue;
    const fileIndex = index++;
    args.push("-stream_loop", "-1", "-i", asset.path);
    sources.push({ index: fileIndex, asset, primary: i === 0 });
    const p = placement(region, asset, slot);
    const backdrop = backdropPlacement(region, asset);
    // Compose within a slot canvas so neighbouring slots cannot bleed into each other.
    filters.push(
      `[${fileIndex}:v]split=2[sharpinput${i}][blurinput${i}]`,
      `[blurinput${i}]scale=${backdrop.width}:${backdrop.height},setsar=1,fps=30,format=gbrp,gblur=sigma=${backdrop.blur}:steps=6,crop=${region.width}:${region.height}:${-backdrop.x}:${-backdrop.y}[slotbg${i}]`,
    );
    filters.push(
      `[sharpinput${i}]scale=${p.width}:${p.height},setsar=1,fps=30,format=gbrp[scaled${i}]`,
    );
    filters.push(
      `[slotbg${i}][scaled${i}]overlay=x=${p.x}:y=${p.y}:shortest=1:format=auto[placed${i}]`,
    );
    let label = `placed${i}`;
    if (region.circle) {
      filters.push(
        `[${label}]format=rgba,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='if(lte(pow(X-W/2,2)+pow(Y-H/2,2),pow(W/2,2)),255,0)'[masked${i}]`,
      );
      label = `masked${i}`;
    }
    filters.push(
      `[${base}][${label}]overlay=x=${region.x}:y=${region.y}:shortest=1:format=auto[canvas${i}]`,
    );
    base = `canvas${i}`;
  }
  const narration = index++;
  args.push("-i", input.audioPath);
  filters.push(
    `[${narration}:a]volume=${settings.audio.narrationVolume},apad,atrim=duration=${duration}[narration]`,
  );
  const audio = ["narration"];
  // Source audio remains independent of video visibility, matching the mute/volume controls.
  const primaryAsset = assets.find((a) => a.id === settings.slots[0]?.assetId);
  if (
    !settings.audio.sourceMuted &&
    settings.audio.sourceVolume > 0 &&
    primaryAsset?.hasAudio
  ) {
    let source = sources.find((s) => s.primary)?.index;
    if (source === undefined) {
      source = index++;
      args.push("-stream_loop", "-1", "-i", primaryAsset.path);
    }
    filters.push(
      `[${source}:a]volume=${settings.audio.sourceVolume},apad,atrim=duration=${duration}[sourceaudio]`,
    );
    audio.push("sourceaudio");
  }
  const music = assets.find(
    (a) => a.id === settings.audio.musicAssetId && a.kind === "audio",
  );
  if (music && settings.audio.musicVolume > 0) {
    const musicIndex = index++;
    args.push("-i", music.path);
    filters.push(
      `[${musicIndex}:a]volume=${settings.audio.musicVolume},apad,atrim=duration=${duration}[music]`,
    );
    audio.push("music");
  }
  filters.push(
    `${audio.map((a) => `[${a}]`).join("")}amix=inputs=${audio.length}:duration=first:normalize=0,alimiter=limit=1:level=false[aout]`,
  );
  filters.push(`[${base}]subtitles=filename=${assPath}[vout]`);
  args.push(
    "-filter_complex_threads",
    "1",
    "-filter_complex",
    filters.join(";"),
    "-map",
    "[vout]",
    "-map",
    "[aout]",
    "-t",
    String(duration),
    "-r",
    "30",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-preset",
    "veryfast",
    "-crf",
    "23",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-movflags",
    "+faststart",
    output,
  );
  return { args, width, height };
}
