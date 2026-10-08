import { Audio, Video } from "@remotion/media";
import type { Caption } from "@remotion/captions";
import {
  Fragment,
  useEffect,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  AbsoluteFill,
  Loop,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
  delayRender,
  continueRender,
  cancelRender,
} from "remotion";
import type {
  EditorAsset,
  EditorDraft,
  Slot,
  TextOverlay,
} from "../lib/editor";
import { regions, placement, captionAppearance } from "../lib/editor-core.mjs";
import "@fontsource/noto-sans-myanmar/400.css";
import "@fontsource/noto-sans-myanmar/600.css";
import "@fontsource/noto-sans-myanmar/700.css";

export type VideoCompositionProps = {
  draft: EditorDraft;
  assets: (EditorAsset & { src: string })[];
  narrationSrc: string | null;
};
type Controls = {
  renderSlotControl?: (
    index: number,
    position: ReturnType<typeof placement>,
    slot: Slot,
  ) => ReactNode;
  renderTextControl?: (overlay: TextOverlay, style: CSSProperties) => ReactNode;
};
export function VideoComposition({
  draft,
  assets,
  narrationSrc,
  renderSlotControl,
  renderTextControl,
}: VideoCompositionProps & Controls) {
  const [fontHandle] = useState(() => delayRender("Load Burmese fonts"));
  useEffect(() => {
    let active = true;
    Promise.all(
      [400, 600, 700].map((weight) =>
        document.fonts.load(
          `${weight} 36px "Noto Sans Myanmar"`,
          "မြန်မာစာ English",
        ),
      ),
    )
      .then(() => {
        if (active) continueRender(fontHandle);
      })
      .catch((error) => {
        if (active) cancelRender(error);
      });
    return () => {
      active = false;
    };
  }, [fontHandle]);
  const { width, height, fps } = useVideoConfig(),
    frame = useCurrentFrame();
  const settings = draft.editor_settings,
    ms = (frame / fps) * 1000;
  const captions: Caption[] = draft.captions.map((caption) => ({
    ...caption,
    timestampMs: null,
    confidence: null,
  }));
  const caption = settings.captionsVisible
    ? captions.find((c) => ms >= c.startMs && ms < c.endMs)
    : null;
  const appearance = captionAppearance(draft.caption_style, width, height);
  const primary = assets.find((a) => a.id === settings.slots[0]?.assetId);
  const music = assets.find((a) => a.id === settings.audio.musicAssetId);
  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#050505",
        fontFamily: "Noto Sans Myanmar, sans-serif",
        color: "white",
        overflow: "hidden",
      }}
    >
      {settings.videoVisible &&
        regions(settings.layout, width, height).map((region, i) => {
          const slot = settings.slots[i],
            asset = assets.find(
              (a) => a.id === slot?.assetId && a.kind === "video",
            );
          if (!slot?.visible || !asset) return null;
          const p = placement(region, asset, slot);
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: region.x,
                top: region.y,
                width: region.width,
                height: region.height,
                overflow: "hidden",
                borderRadius: region.circle ? "50%" : undefined,
                backgroundColor: "#050505",
              }}
            >
              <Loop
                durationInFrames={Math.max(1, Math.ceil(asset.duration * fps))}
              >
                <Video
                  src={asset.src}
                  muted
                  premountFor={fps}
                  style={{
                    position: "absolute",
                    left: p.x,
                    top: p.y,
                    width: p.width,
                    height: p.height,
                    maxWidth: "none",
                  }}
                />
              </Loop>
              {renderSlotControl?.(i, p, slot)}
            </div>
          );
        })}
      {settings.textOverlays
        .filter((o) => o.visible)
        .map((o) => {
          const style: React.CSSProperties = {
            position: "absolute",
            left: `${o.x * 100}%`,
            top: `${o.y * 100}%`,
            transform: `translate(${o.align === "left" ? "0" : o.align === "right" ? "-100%" : "-50%"},-50%)`,
            width: "max-content",
            maxWidth: "86%",
            color: o.color,
            fontSize: (o.fontSize * width) / 720,
            fontWeight: o.bold ? 700 : 400,
            lineHeight: 1.4,
            textAlign: o.align,
            whiteSpace: "pre-wrap",
            background: o.background ? "rgba(0,0,0,.62)" : undefined,
            padding: o.background ? 10 : 0,
          };
          return (
            <Fragment key={o.id}>
              {renderTextControl ? (
                renderTextControl(o, style)
              ) : (
                <div style={style}>{o.text}</div>
              )}
            </Fragment>
          );
        })}
      {caption && (
        <div
          style={{
            position: "absolute",
            left: appearance.x,
            top: appearance.y,
            transform: "translate(-50%,-50%)",
            width: "86%",
            textAlign: "center",
            fontSize: appearance.fontSize,
            fontWeight: appearance.bold ? 700 : 400,
            lineHeight: 1.4,
            color: appearance.color,
            whiteSpace: "pre-wrap",
            pointerEvents: "none",
            textShadow: "0 1px 2px black",
          }}
        >
          <span
            style={{
              background: appearance.background ? "rgba(0,0,0,.62)" : undefined,
              padding: appearance.background ? 10 : 0,
              boxDecorationBreak: "clone",
            }}
          >
            {caption.text}
          </span>
        </div>
      )}
      {narrationSrc && (
        <Audio
          src={narrationSrc}
          volume={settings.audio.narrationVolume}
          premountFor={fps}
        />
      )}
      {primary?.hasAudio && !settings.audio.sourceMuted && (
        <Loop durationInFrames={Math.max(1, Math.ceil(primary.duration * fps))}>
          <Audio
            src={primary.src}
            volume={settings.audio.sourceVolume}
            premountFor={fps}
          />
        </Loop>
      )}
      {music && (
        <Sequence
          premountFor={fps}
          durationInFrames={Math.max(1, Math.floor(music.duration * fps))}
        >
          <Audio
            src={music.src}
            volume={settings.audio.musicVolume}
            premountFor={fps}
          />
        </Sequence>
      )}
    </AbsoluteFill>
  );
}
