"use client";
import { Player } from "@remotion/player";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { Caption } from "@/lib/api";
function CaptionPreview({
  captions,
  title,
  style,
}: {
  captions: Caption[];
  title: string;
  style: string;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const ms = (frame / fps) * 1000;
  const caption = captions.find((c) => ms >= c.startMs && ms < c.endMs);
  return (
    <AbsoluteFill
      style={{
        background: "var(--muted)",
        color: "var(--foreground)",
        padding: 60,
        fontFamily: "Noto Sans Myanmar",
        justifyContent: "space-between",
      }}
    >
      <div style={{ fontSize: 26 }}>RICAPILO</div>
      <div style={{ fontSize: 44, fontWeight: 600, lineHeight: 1.8 }}>
        {title}
      </div>
      <div
        style={{
          fontSize: 36,
          lineHeight: 1.8,
          textAlign: "center",
          background:
            style === "boxed-minimal" ? "var(--background)" : "transparent",
          borderRadius: 16,
          padding: 16,
        }}
      >
        {caption?.text}
      </div>
    </AbsoluteFill>
  );
}
export function VideoPreview({
  captions,
  title,
  format,
  style,
}: {
  captions: Caption[];
  title: string;
  format: string;
  style: string;
}) {
  const frames = Math.max(
    30,
    Math.ceil(((captions.at(-1)?.endMs || 3000) / 1000) * 30),
  );
  return (
    <Player
      component={CaptionPreview}
      inputProps={{ captions, title, style }}
      durationInFrames={frames}
      fps={30}
      compositionWidth={format === "vertical" ? 720 : 1280}
      compositionHeight={format === "vertical" ? 1280 : 720}
      controls
      className="mx-auto w-full max-w-lg overflow-hidden rounded-xl"
    />
  );
}
