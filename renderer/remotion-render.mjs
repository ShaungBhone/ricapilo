import {
  makeCancelSignal,
  renderMedia,
  selectComposition,
} from "@remotion/renderer";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serveMedia } from "./private-media.mjs";

export async function renderRemotion(input, assets, duration, output) {
  const media = await serveMedia([
    input.audioPath,
    ...assets.map((asset) => asset.path),
  ]);
  const { cancelSignal, cancel } = makeCancelSignal();
  const timer = setTimeout(cancel, 1200000);
  try {
    const inputProps = {
      duration,
      narrationSrc: media.urls[0],
      assets: assets.map(({ path: _path, ...asset }, i) => ({
        ...asset,
        src: media.urls[i + 1],
      })),
      draft: {
        title: input.title ?? "",
        transcript: "",
        script: "",
        captions: input.captions,
        caption_style: input.captionStyle,
        editor_settings: input.editorSettings,
      },
    };
    const serveUrl = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "bundle",
    );
    const chromiumOptions = { enableMultiProcessOnLinux: true };
    const composition = await selectComposition({
      serveUrl,
      id: "Recap",
      inputProps,
      chromiumOptions,
      timeoutInMilliseconds: 60000,
    });
    await renderMedia({
      serveUrl,
      composition,
      inputProps,
      outputLocation: output,
      codec: "h264",
      audioCodec: "aac",
      audioBitrate: "128k",
      crf: 23,
      pixelFormat: "yuv420p",
      x264Preset: "veryfast",
      concurrency: 1,
      offthreadVideoThreads: 1,
      cancelSignal,
      chromiumOptions,
      timeoutInMilliseconds: 60000,
    });
  } finally {
    clearTimeout(timer);
    await media.close();
  }
}
