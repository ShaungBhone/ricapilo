export type SourceSize = {
  height: number;
  width: number;
};
export type FrameSize = {
  height: number;
  width: number;
};
export type Rect = {
  height: number;
  left: number;
  top: number;
  width: number;
};
/**
 * Placement of the sharp video, expressed relative to the contain-fit rather
 * than as an explicit rect. `scale` multiplies the contain size, so the aspect
 * ratio cannot distort: width and height both derive from one scalar. `x` and
 * `y` shift the video's centre away from the frame's centre, normalised against
 * the frame so the meaning survives a resize.
 */
export type VideoTransform = {
  scale: number;
  x: number;
  y: number;
};
export type LayoutMode = "custom" | "fill" | "fit";
export type ResizeCorner = "ne" | "nw" | "se" | "sw";
export type CoverLayout = {
  height: number;
  left: number;
  slackX: number;
  slackY: number;
  top: number;
  width: number;
};
export declare const fitTransform: VideoTransform;
export declare const MIN_SCALE = 0.1;
export declare const MAX_SCALE = 8;
export declare const TRANSFORM_NUDGE = 0.02;
export declare const SCALE_NUDGE = 0.05;
export declare const getContainScale: (
  frame: FrameSize,
  source: SourceSize,
) => number;
export declare const getCoverScale: (
  frame: FrameSize,
  source: SourceSize,
) => number;
/**
 * How far past the contain-fit the video must scale to cover the frame. When
 * the source and frame share an aspect ratio this is exactly 1, so fit and fill
 * describe the same placement.
 */
export declare const getFillScale: (
  frame: FrameSize,
  source: SourceSize,
) => number;
export declare const fillTransform: (
  frame: FrameSize,
  source: SourceSize,
) => VideoTransform;
export declare const getTransformRect: ({
  frame,
  source,
  transform,
}: {
  frame: FrameSize;
  source: SourceSize;
  transform: VideoTransform;
}) => Rect;
/**
 * Scales the source to cover the frame. Used for the blurred backdrop, which
 * always fills the stage regardless of where the sharp video sits.
 */
export declare const getCoverLayout: ({
  frame,
  source,
}: {
  frame: FrameSize;
  source: SourceSize;
}) => CoverLayout;
export declare const BACKDROP_OVERSCALE = 1.35;
export declare const getBackdropBlur: (frame: FrameSize) => number;
/**
 * Fit and fill are derived from the transform rather than stored alongside it,
 * so a stored mode can never contradict where the video actually sits. Anything
 * the user has moved or resized by hand reads as `custom`.
 */
export declare const getLayoutMode: ({
  frame,
  source,
  transform,
}: {
  frame: FrameSize;
  source: SourceSize;
  transform: VideoTransform;
}) => LayoutMode;
/**
 * Converts a pointer delta measured in displayed CSS pixels into composition
 * pixels. The preview is drawn at whatever size the panel allows, so the frame
 * is uniformly scaled and one factor covers both axes.
 */
export declare const toCompositionDelta: ({
  deltaX,
  deltaY,
  displayWidth,
  frameWidth,
}: {
  deltaX: number;
  deltaY: number;
  displayWidth: number;
  frameWidth: number;
}) => {
  x: number;
  y: number;
};
/**
 * Moves the video by a drag measured from where the pointer went down. Deltas
 * are totals rather than per-move increments: accumulating them would let a
 * drag that overshoots a clamp silently desynchronise from the cursor, so the
 * video would start moving again before the pointer came back.
 */
export declare const moveTransform: ({
  deltaX,
  deltaY,
  displayWidth,
  frame,
  transform,
}: {
  deltaX: number;
  deltaY: number;
  displayWidth: number;
  frame: FrameSize;
  transform: VideoTransform;
}) => VideoTransform;
/**
 * Resizes from a corner while pinning the opposite one. A corner drag has two
 * degrees of freedom but an aspect-locked box allows only one, so the pointer
 * delta is projected onto the box diagonal as a least-squares uniform scale.
 */
export declare const resizeTransform: ({
  corner,
  deltaX,
  deltaY,
  displayWidth,
  frame,
  source,
  transform,
}: {
  corner: ResizeCorner;
  deltaX: number;
  deltaY: number;
  displayWidth: number;
  frame: FrameSize;
  source: SourceSize;
  transform: VideoTransform;
}) => VideoTransform;
/**
 * In fill mode the video must never expose a gap, so it is held at or above the
 * cover scale and pinned within its own overflow. Fit and custom placements are
 * allowed to leave gaps — that is what the blurred backdrop is for — and are
 * only stopped from being flung entirely out of the frame.
 */
export declare const clampTransform: ({
  frame,
  mode,
  source,
  transform,
}: {
  frame: FrameSize;
  mode: LayoutMode;
  source: SourceSize;
  transform: VideoTransform;
}) => VideoTransform;
export declare const nudgeTransform: ({
  scale,
  transform,
  x,
  y,
}: {
  scale?: number;
  transform: VideoTransform;
  x?: number;
  y?: number;
}) => VideoTransform;
export declare const isSameTransform: (
  a: VideoTransform,
  b: VideoTransform,
) => boolean;
