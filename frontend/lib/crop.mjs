export const fitTransform = { scale: 1, x: 0, y: 0 };
export const MIN_SCALE = 0.1;
export const MAX_SCALE = 8;
export const TRANSFORM_NUDGE = 0.02;
export const SCALE_NUDGE = 0.05;
// Corner sign pairs: -1 means that edge moves with the pointer, +1 means the
// opposite edge does.
const cornerSigns = {
  ne: { x: 1, y: -1 },
  nw: { x: -1, y: -1 },
  se: { x: 1, y: 1 },
  sw: { x: -1, y: 1 },
};
const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
// Negating a zero product yields `-0`, which is invisible in CSS but leaks into
// state comparisons and snapshots. `+ 0` normalises it back.
const normalizeZero = (value) => value + 0;
const hasSize = (size) => size.width > 0 && size.height > 0;
export const getContainScale = (frame, source) =>
  hasSize(source)
    ? Math.min(frame.width / source.width, frame.height / source.height)
    : 1;
export const getCoverScale = (frame, source) =>
  hasSize(source)
    ? Math.max(frame.width / source.width, frame.height / source.height)
    : 1;
/**
 * How far past the contain-fit the video must scale to cover the frame. When
 * the source and frame share an aspect ratio this is exactly 1, so fit and fill
 * describe the same placement.
 */
export const getFillScale = (frame, source) => {
  const contain = getContainScale(frame, source);
  return contain > 0 ? getCoverScale(frame, source) / contain : 1;
};
export const fillTransform = (frame, source) => ({
  scale: getFillScale(frame, source),
  x: 0,
  y: 0,
});
export const getTransformRect = ({ frame, source, transform }) => {
  if (!hasSize(source)) {
    return { height: frame.height, left: 0, top: 0, width: frame.width };
  }
  const scale = getContainScale(frame, source) * transform.scale;
  const width = source.width * scale;
  const height = source.height * scale;
  return {
    height,
    left: normalizeZero((frame.width - width) / 2 + transform.x * frame.width),
    top: normalizeZero(
      (frame.height - height) / 2 + transform.y * frame.height,
    ),
    width,
  };
};
/**
 * Scales the source to cover the frame. Used for the blurred backdrop, which
 * always fills the stage regardless of where the sharp video sits.
 */
export const getCoverLayout = ({ frame, source }) => {
  const rect = getTransformRect({
    frame,
    source,
    transform: fillTransform(frame, source),
  });
  return {
    height: rect.height,
    left: rect.left,
    // Rounding can leave a hair of negative slack on the axis that fits
    // exactly, which would let the video drift a subpixel off the frame edge.
    slackX: Math.max(0, rect.width - frame.width),
    slackY: Math.max(0, rect.height - frame.height),
    top: rect.top,
    width: rect.width,
  };
};
// CSS `blur()` treats everything outside the element as transparent and fades
// out over roughly three times the radius, so the backdrop is grown until that
// fade lands well outside the frame. 1.3 is the exact threshold for these
// presets; 1.35 leaves margin.
export const BACKDROP_OVERSCALE = 1.35;
const BACKDROP_BLUR_FRACTION = 0.05;
// Derived from the frame so the blur keeps its weight if a preset is ever added
// at a different resolution.
export const getBackdropBlur = (frame) =>
  BACKDROP_BLUR_FRACTION * Math.min(frame.width, frame.height);
const MODE_TOLERANCE = 0.005;
const isNear = (a, b) => Math.abs(a - b) < MODE_TOLERANCE;
/**
 * Fit and fill are derived from the transform rather than stored alongside it,
 * so a stored mode can never contradict where the video actually sits. Anything
 * the user has moved or resized by hand reads as `custom`.
 */
export const getLayoutMode = ({ frame, source, transform }) => {
  if (!isNear(transform.x, 0) || !isNear(transform.y, 0)) return "custom";
  if (isNear(transform.scale, 1)) return "fit";
  if (isNear(transform.scale, getFillScale(frame, source))) return "fill";
  return "custom";
};
/**
 * Converts a pointer delta measured in displayed CSS pixels into composition
 * pixels. The preview is drawn at whatever size the panel allows, so the frame
 * is uniformly scaled and one factor covers both axes.
 */
export const toCompositionDelta = ({
  deltaX,
  deltaY,
  displayWidth,
  frameWidth,
}) => {
  if (displayWidth <= 0 || frameWidth <= 0) return { x: 0, y: 0 };
  const scale = frameWidth / displayWidth;
  return { x: deltaX * scale, y: deltaY * scale };
};
/**
 * Moves the video by a drag measured from where the pointer went down. Deltas
 * are totals rather than per-move increments: accumulating them would let a
 * drag that overshoots a clamp silently desynchronise from the cursor, so the
 * video would start moving again before the pointer came back.
 */
export const moveTransform = ({
  deltaX,
  deltaY,
  displayWidth,
  frame,
  transform,
}) => {
  if (displayWidth <= 0 || !hasSize(frame)) return transform;
  const delta = toCompositionDelta({
    deltaX,
    deltaY,
    displayWidth,
    frameWidth: frame.width,
  });
  return {
    scale: transform.scale,
    // Each axis is normalised against its own frame dimension, so a vertical
    // drag travels exactly as far as the pointer does.
    x: transform.x + delta.x / frame.width,
    y: transform.y + delta.y / frame.height,
  };
};
/**
 * Resizes from a corner while pinning the opposite one. A corner drag has two
 * degrees of freedom but an aspect-locked box allows only one, so the pointer
 * delta is projected onto the box diagonal as a least-squares uniform scale.
 */
export const resizeTransform = ({
  corner,
  deltaX,
  deltaY,
  displayWidth,
  frame,
  source,
  transform,
}) => {
  if (displayWidth <= 0 || frame.width <= 0 || !hasSize(source)) {
    return transform;
  }
  const rect = getTransformRect({ frame, source, transform });
  if (rect.width <= 0 || rect.height <= 0) return transform;
  const toComposition = frame.width / displayWidth;
  const sign = cornerSigns[corner];
  const dx = deltaX * toComposition * sign.x;
  const dy = deltaY * toComposition * sign.y;
  const projection =
    (dx * rect.width + dy * rect.height) /
    (rect.width * rect.width + rect.height * rect.height);
  const containScale = getContainScale(frame, source);
  const nextScale = clamp(
    transform.scale * (1 + projection),
    MIN_SCALE,
    MAX_SCALE,
  );
  const nextWidth = source.width * containScale * nextScale;
  const nextHeight = source.height * containScale * nextScale;
  // The corner opposite the one being dragged stays exactly where it was.
  const anchorX = rect.left + (sign.x < 0 ? rect.width : 0);
  const anchorY = rect.top + (sign.y < 0 ? rect.height : 0);
  const nextLeft = anchorX - (sign.x < 0 ? nextWidth : 0);
  const nextTop = anchorY - (sign.y < 0 ? nextHeight : 0);
  return {
    scale: nextScale,
    x: (nextLeft - (frame.width - nextWidth) / 2) / frame.width,
    y: (nextTop - (frame.height - nextHeight) / 2) / frame.height,
  };
};
/**
 * In fill mode the video must never expose a gap, so it is held at or above the
 * cover scale and pinned within its own overflow. Fit and custom placements are
 * allowed to leave gaps — that is what the blurred backdrop is for — and are
 * only stopped from being flung entirely out of the frame.
 */
export const clampTransform = ({ frame, mode, source, transform }) => {
  if (!hasSize(source) || !hasSize(frame)) return transform;
  if (mode === "fill") {
    const scale = clamp(
      Math.max(transform.scale, getFillScale(frame, source)),
      MIN_SCALE,
      Math.max(MAX_SCALE, getFillScale(frame, source)),
    );
    const rect = getTransformRect({
      frame,
      source,
      transform: { ...transform, scale },
    });
    // Half the overflow on each axis is how far the centre may travel before an
    // edge would pull inside the frame.
    const limitX = Math.min(
      0.5,
      Math.max(0, (rect.width - frame.width) / 2) / frame.width,
    );
    const limitY = Math.min(
      0.5,
      Math.max(0, (rect.height - frame.height) / 2) / frame.height,
    );
    return {
      scale,
      x: clamp(transform.x, -limitX, limitX),
      y: clamp(transform.y, -limitY, limitY),
    };
  }
  return {
    scale: clamp(transform.scale, MIN_SCALE, MAX_SCALE),
    // Keeping the centre inside the frame leaves the video always grabbable.
    x: clamp(transform.x, -0.5, 0.5),
    y: clamp(transform.y, -0.5, 0.5),
  };
};
export const nudgeTransform = ({ scale, transform, x, y }) => ({
  scale: clamp(transform.scale * (1 + (scale ?? 0)), MIN_SCALE, MAX_SCALE),
  x: transform.x + (x ?? 0),
  y: transform.y + (y ?? 0),
});
export const isSameTransform = (a, b) =>
  a.scale === b.scale && a.x === b.x && a.y === b.y;
