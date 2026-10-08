"use client";

import { useRef, type PointerEvent } from "react";
import { useTranslations } from "next-intl";
import {
  clampTransform,
  getLayoutMode,
  getTransformRect,
  moveTransform,
  nudgeTransform,
  resizeTransform,
  SCALE_NUDGE,
  TRANSFORM_NUDGE,
  type FrameSize,
  type LayoutMode,
  type ResizeCorner,
  type SourceSize,
  type VideoTransform,
} from "@/lib/crop.mjs";
import { cn } from "@/lib/utils";

export type TransformChange = (
  transform: VideoTransform,
  phase: "start" | "move" | "end",
) => void;

const corners: ResizeCorner[] = ["nw", "ne", "sw", "se"];
const arrows: Record<string, { x: number; y: number }> = {
  ArrowDown: { x: 0, y: TRANSFORM_NUDGE },
  ArrowLeft: { x: -TRANSFORM_NUDGE, y: 0 },
  ArrowRight: { x: TRANSFORM_NUDGE, y: 0 },
  ArrowUp: { x: 0, y: -TRANSFORM_NUDGE },
};

export function VideoPlacementOverlay({
  frame,
  source,
  transform,
  onChange,
  label,
}: {
  frame: FrameSize & { circle?: boolean };
  source: SourceSize;
  transform: VideoTransform;
  onChange: TransformChange;
  label?: string;
}) {
  const t = useTranslations("editor");
  const element = useRef<HTMLDivElement>(null);
  const gesture = useRef<{
    corner: ResizeCorner | null;
    displayWidth: number;
    mode: LayoutMode;
    pointerId: number;
    start: VideoTransform;
    next: VideoTransform;
    x: number;
    y: number;
  } | null>(null);
  const rect = getTransformRect({ frame, source, transform });
  const mode = getLayoutMode({ frame, source, transform });
  const percent = (n: number, size: number) => `${(n / size) * 100}%`;
  // Keep handles reachable when the sharp video's corners extend past the crop.
  const insetX = Math.min(8, frame.width / 4);
  const insetY = Math.min(8, frame.height / 4);
  const handleX = (right: boolean) =>
    Math.max(
      insetX,
      Math.min(frame.width - insetX, rect.left + (right ? rect.width : 0)),
    );
  const handleY = (bottom: boolean) =>
    Math.max(
      insetY,
      Math.min(frame.height - insetY, rect.top + (bottom ? rect.height : 0)),
    );

  const handlePoint = (corner: ResizeCorner) => {
    let x = handleX(corner.endsWith("e"));
    let y = handleY(corner.startsWith("s"));
    if (frame.circle) {
      const dx = x - frame.width / 2;
      const dy = y - frame.height / 2;
      const radius = Math.max(
        0,
        Math.min(frame.width, frame.height) / 2 - Math.max(insetX, insetY),
      );
      const length = Math.hypot(dx, dy);
      if (length > radius) {
        x = frame.width / 2 + (dx * radius) / length;
        y = frame.height / 2 + (dy * radius) / length;
      }
    }
    return { left: percent(x, frame.width), top: percent(y, frame.height) };
  };

  const begin = (
    event: PointerEvent<HTMLElement>,
    corner: ResizeCorner | null,
  ) => {
    if (event.button !== 0 || gesture.current) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.focus();
    gesture.current = {
      corner,
      displayWidth:
        element.current?.getBoundingClientRect().width ?? frame.width,
      mode,
      pointerId: event.pointerId,
      start: transform,
      next: transform,
      x: event.clientX,
      y: event.clientY,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    onChange(transform, "start");
  };
  const move = (event: PointerEvent<HTMLElement>) => {
    event.stopPropagation();
    const drag = gesture.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const args = {
      deltaX: event.clientX - drag.x,
      deltaY: event.clientY - drag.y,
      displayWidth: drag.displayWidth,
      frame,
      source,
      transform: drag.start,
    };
    drag.next = clampTransform({
      frame,
      source,
      mode: drag.mode,
      transform: drag.corner
        ? resizeTransform({ ...args, corner: drag.corner })
        : moveTransform(args),
    });
    onChange(drag.next, "move");
  };
  const end = (event: PointerEvent<HTMLElement>) => {
    const drag = gesture.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    gesture.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    onChange(drag.next, "end");
  };
  return (
    <div
      ref={element}
      aria-label={label ?? t("moveVideo")}
      className="absolute inset-0 cursor-grab touch-none focus-visible:outline-2 focus-visible:outline-primary active:cursor-grabbing"
      role="application"
      tabIndex={0}
      onPointerDown={(event) => begin(event, null)}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      onLostPointerCapture={end}
      onKeyDown={(event) => {
        if (event.ctrlKey || event.metaKey || event.altKey || gesture.current)
          return;
        const nudge = arrows[event.key];
        const scale = ["+", "="].includes(event.key)
          ? SCALE_NUDGE
          : ["-", "_"].includes(event.key)
            ? -SCALE_NUDGE
            : undefined;
        if (!nudge && scale === undefined) return;
        event.preventDefault();
        event.stopPropagation();
        const next = clampTransform({
          frame,
          source,
          mode,
          transform: nudgeTransform({ transform, scale, ...nudge }),
        });
        onChange(transform, "start");
        onChange(next, "end");
      }}
    >
      <div
        className="pointer-events-none absolute border-2 border-primary"
        style={{
          left: percent(rect.left, frame.width),
          top: percent(rect.top, frame.height),
          width: percent(rect.width, frame.width),
          height: percent(rect.height, frame.height),
        }}
      />
      {corners.map((corner) => (
        <button
          key={corner}
          type="button"
          aria-label={t(`resize${corner.toUpperCase()}`)}
          className={cn(
            "absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-primary bg-background shadow focus-visible:outline-2 focus-visible:outline-primary",
            corner === "nw" || corner === "se"
              ? "cursor-nwse-resize"
              : "cursor-nesw-resize",
          )}
          style={{
            ...handlePoint(corner),
          }}
          onPointerDown={(event) => begin(event, corner)}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
          onLostPointerCapture={end}
        />
      ))}
    </div>
  );
}
