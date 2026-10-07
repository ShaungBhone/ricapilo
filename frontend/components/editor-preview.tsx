"use client";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import { Button } from "@/components/ui/button";
import { Play, Pause, Maximize } from "lucide-react";
import { useTranslations } from "next-intl";
import { Player, type PlayerRef } from "@remotion/player";
import {
  AbsoluteFill,
  Audio,
  Loop,
  Sequence,
  Video,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { API } from "@/lib/api";
import type { EditorAsset, EditorDraft } from "@/lib/editor";
import {
  ratios,
  regions,
  placement,
  captionAppearance,
} from "@/lib/editor-core.mjs";
export type DragChange = (
  kind: "slot" | "text",
  id: number | string,
  x: number,
  y: number,
  phase: "start" | "move" | "end",
) => void;
function Draggable({
  children,
  label,
  onDrag,
  style,
  anchor,
}: {
  children?: React.ReactNode;
  label: string;
  onDrag: (x: number, y: number, phase: "start" | "move" | "end") => void;
  style: React.CSSProperties;
  anchor: { x: number; y: number };
}) {
  const drag = useRef<{ x: number; y: number; parent: DOMRect } | null>(null);
  const point = (
    e: PointerEvent<HTMLButtonElement>,
    phase: "start" | "move" | "end",
  ) => {
    if (phase === "start") {
      const parent = e.currentTarget.parentElement!.getBoundingClientRect();
      drag.current = {
        x: e.clientX - parent.left - anchor.x * parent.width,
        y: e.clientY - parent.top - anchor.y * parent.height,
        parent,
      };
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    if (!drag.current) return;
    const { parent, x, y } = drag.current;
    onDrag(
      Math.max(0, Math.min(1, (e.clientX - x - parent.left) / parent.width)),
      Math.max(0, Math.min(1, (e.clientY - y - parent.top) / parent.height)),
      phase,
    );
    if (phase === "end") drag.current = null;
  };
  return (
    <button
      type="button"
      aria-label={label}
      style={{
        ...style,
        touchAction: "none",
        cursor: "move",
        outlineOffset: 2,
      }}
      onPointerDown={(e) => point(e, "start")}
      onPointerMove={(e) => point(e, "move")}
      onPointerUp={(e) => point(e, "end")}
      onPointerCancel={(e) => point(e, "end")}
      onKeyDown={(e) => {
        if (
          !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)
        )
          return;
        e.preventDefault();
        e.stopPropagation();
        const x =
            anchor.x +
            (e.key === "ArrowLeft" ? -0.01 : e.key === "ArrowRight" ? 0.01 : 0),
          y =
            anchor.y +
            (e.key === "ArrowUp" ? -0.01 : e.key === "ArrowDown" ? 0.01 : 0);
        onDrag(
          Math.max(0, Math.min(1, x)),
          Math.max(0, Math.min(1, y)),
          "start",
        );
        onDrag(Math.max(0, Math.min(1, x)), Math.max(0, Math.min(1, y)), "end");
      }}
    >
      {children}
    </button>
  );
}
function Composition({
  draft,
  assets,
  projectId,
  hasAudio,
  revision,
  tool,
  disabled,
  onDrag,
  labels,
}: {
  draft: EditorDraft;
  assets: EditorAsset[];
  projectId: number;
  hasAudio: boolean;
  revision: string;
  tool: string;
  disabled: boolean;
  onDrag: DragChange;
  labels: { moveVideo: string; moveText: string };
}) {
  const { width, height } = useVideoConfig(),
    frame = useCurrentFrame();
  const settings = draft.editor_settings,
    ms = (frame / 30) * 1000;
  const caption = settings.captionsVisible
    ? draft.captions.find((c) => ms >= c.startMs && ms < c.endMs)
    : null;
  const appearance = captionAppearance(draft.caption_style, width, height);
  const src = (id: string) =>
    `${API}/projects/${projectId}/assets/${id}/stream`;
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
                durationInFrames={Math.max(1, Math.ceil(asset.duration * 30))}
              >
                <Video
                  src={src(asset.id)}
                  muted
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
              {tool === "Media" && !disabled && (
                <Draggable
                  label={`${labels.moveVideo} ${i + 1}`}
                  anchor={slot}
                  style={{
                    position: "absolute",
                    left: p.x,
                    top: p.y,
                    width: p.width,
                    height: p.height,
                    maxWidth: "none",
                    border: "2px solid #bef264",
                    background: "transparent",
                  }}
                  onDrag={(x, y, phase) => onDrag("slot", i, x, y, phase)}
                />
              )}
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
            border: tool === "Text" ? "1px dashed #bef264" : undefined,
          };
          return tool === "Text" && !disabled ? (
            <Draggable
              key={o.id}
              label={labels.moveText}
              anchor={o}
              style={style}
              onDrag={(x, y, phase) => onDrag("text", o.id, x, y, phase)}
            >
              {o.text}
            </Draggable>
          ) : (
            <div key={o.id} style={style}>
              {o.text}
            </div>
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
      {hasAudio && (
        <Audio
          src={`${API}/projects/${projectId}/download/audio?v=${revision}`}
          volume={settings.audio.narrationVolume}
        />
      )}
      {primary?.hasAudio && !settings.audio.sourceMuted && (
        <Loop durationInFrames={Math.max(1, Math.ceil(primary.duration * 30))}>
          <Audio src={src(primary.id)} volume={settings.audio.sourceVolume} />
        </Loop>
      )}
      {music && (
        <Sequence
          durationInFrames={Math.max(1, Math.floor(music.duration * 30))}
        >
          <Audio src={src(music.id)} volume={settings.audio.musicVolume} />
        </Sequence>
      )}
    </AbsoluteFill>
  );
}
export function EditorPreview({
  draft,
  assets,
  projectId,
  revision,
  hasAudio,
  narrationDuration,
  tool,
  disabled,
  onDrag,
  playerRef,
  onFrame,
  labels,
  onError,
}: {
  draft: EditorDraft;
  assets: EditorAsset[];
  projectId: number;
  revision: string;
  hasAudio: boolean;
  narrationDuration: number;
  tool: string;
  disabled: boolean;
  onDrag: DragChange;
  playerRef: React.RefObject<PlayerRef | null>;
  onFrame: (frame: number) => void;
  labels: { moveVideo: string; moveText: string };
  onError: (error: Error) => void;
}) {
  const t = useTranslations("editor");
  const [playing, setPlaying] = useState(false),
    [currentFrame, setCurrentFrame] = useState(0);
  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    const frameHandler = (event: { detail: { frame: number } }) => {
      onFrame(event.detail.frame);
      setCurrentFrame(event.detail.frame);
    };
    const errorHandler = (event: { detail: { error: Error } }) =>
      onError(event.detail.error);
    const playHandler = () => setPlaying(true),
      pauseHandler = () => setPlaying(false);
    player.addEventListener("play", playHandler);
    player.addEventListener("pause", pauseHandler);
    player.addEventListener("frameupdate", frameHandler);
    player.addEventListener("error", errorHandler);
    return () => {
      player.removeEventListener("play", playHandler);
      player.removeEventListener("pause", pauseHandler);
      player.removeEventListener("frameupdate", frameHandler);
      player.removeEventListener("error", errorHandler);
    };
  }, [playerRef, onFrame, onError]);
  const [width, height] = ratios[draft.editor_settings.aspectRatio];
  const primary = assets.find(
    (a) => a.id === draft.editor_settings.slots[0]?.assetId,
  );
  const duration = hasAudio ? narrationDuration : (primary?.duration ?? 5);
  const totalFrames = Math.max(1, Math.ceil(duration * 30));
  const stamp = (f: number) =>
    `${Math.floor(f / 30 / 60)}:${String(Math.floor(f / 30) % 60).padStart(2, "0")}`;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        className="flex min-h-0 flex-1 items-center justify-center overflow-hidden p-4 md:p-6"
        style={{ containerType: "size" }}
      >
        <Player
          ref={playerRef}
          component={Composition}
          inputProps={{
            draft,
            assets,
            projectId,
            revision,
            hasAudio,
            tool,
            disabled,
            onDrag,
            labels,
          }}
          compositionWidth={width}
          compositionHeight={height}
          durationInFrames={Math.max(1, Math.ceil(duration * 30))}
          fps={30}
          controls={false}
          clickToPlay={false}
          doubleClickToFullscreen={false}
          acknowledgeRemotionLicense
          style={{ width: `min(100cqw, ${(width / height) * 100}cqh)` }}
        />
      </div>
      <div className="flex shrink-0 items-center gap-3 border-t bg-background px-4 py-3">
        <Button
          variant="ghost"
          size="icon"
          aria-label={t(playing ? "pause" : "play")}
          onClick={() => playerRef.current?.toggle()}
        >
          {playing ? <Pause /> : <Play />}
        </Button>
        <input
          type="range"
          aria-label={t("seek")}
          aria-valuetext={`${stamp(currentFrame)} / ${stamp(totalFrames)}`}
          min={0}
          max={totalFrames - 1}
          step={1}
          value={Math.min(currentFrame, totalFrames - 1)}
          className="min-w-0 flex-1 accent-primary"
          onChange={(e) => playerRef.current?.seekTo(Number(e.target.value))}
        />
        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
          {stamp(currentFrame)} / {stamp(totalFrames)}
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t("fullscreen")}
          onClick={() => playerRef.current?.requestFullscreen()}
        >
          <Maximize />
        </Button>
      </div>
    </div>
  );
}
