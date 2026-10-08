import { test } from "node:test";
import assert from "node:assert/strict";
import {
  clampTransform,
  fillTransform,
  fitTransform,
  getTransformRect,
  getLayoutMode,
  moveTransform,
  resizeTransform,
  nudgeTransform,
  getFillScale,
} from "../frontend/lib/crop.mjs";
import {
  slotTransform,
  transformedSlot,
  placement,
  backdropPlacement,
  regions,
  ratios,
  layouts,
} from "../frontend/lib/editor-core.mjs";

const frame = { width: 720, height: 1280, x: 0, y: 0 };
const source = { width: 1920, height: 1080 };
const slot = {
  assetId: "source",
  mode: "fill",
  x: 0.5,
  y: 0.5,
  scale: 1,
  visible: true,
};
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);

for (const corner of ["nw", "ne", "sw", "se"]) {
  test(`${corner} resize preserves the aspect ratio and opposite corner`, () => {
    const start = { scale: 1.5, x: 0.1, y: -0.1 };
    const before = getTransformRect({ frame, source, transform: start });
    const next = resizeTransform({
      frame,
      source,
      transform: start,
      corner,
      deltaX: 35,
      deltaY: -20,
      displayWidth: 360,
    });
    const after = getTransformRect({ frame, source, transform: next });
    near(after.width / after.height, source.width / source.height);
    near(
      before.left + (corner.endsWith("w") ? before.width : 0),
      after.left + (corner.endsWith("w") ? after.width : 0),
    );
    near(
      before.top + (corner.startsWith("n") ? before.height : 0),
      after.top + (corner.startsWith("n") ? after.height : 0),
    );
  });
}

test("pointer deltas use each slot's displayed width and axis dimensions", () => {
  const next = moveTransform({
    frame,
    transform: fitTransform,
    deltaX: 36,
    deltaY: 64,
    displayWidth: 360,
  });
  near(next.x, 0.1);
  near(next.y, 0.1);
  assert.deepEqual(
    moveTransform({
      frame,
      transform: fitTransform,
      deltaX: 72,
      deltaY: 128,
      displayWidth: 720,
    }),
    next,
  );
});

test("total deltas return from clamp overshoot without cursor drift", () => {
  const args = {
    frame,
    source,
    mode: "custom",
    transform: fitTransform,
    displayWidth: 360,
    deltaY: 0,
  };
  const overshoot = clampTransform({
    ...args,
    transform: moveTransform({ ...args, deltaX: 400 }),
  });
  assert.equal(overshoot.x, 0.5);
  const returning = clampTransform({
    ...args,
    transform: moveTransform({ ...args, deltaX: 90 }),
  });
  near(returning.x, 0.25);
});

test("fill gestures cannot expose gaps, including very narrow slots", () => {
  for (const frame of [
    { width: 720, height: 1280 },
    { width: 80, height: 1280 },
  ]) {
    const next = clampTransform({
      frame,
      source,
      mode: "fill",
      transform: { scale: 0.1, x: 100, y: -100 },
    });
    const rect = getTransformRect({ frame, source, transform: next });
    assert.ok(rect.left <= 1e-8 && rect.top <= 1e-8);
    assert.ok(rect.left + rect.width >= frame.width - 1e-8);
    assert.ok(rect.top + rect.height >= frame.height - 1e-8);
    const saved = transformedSlot({ ...frame, x: 0, y: 0 }, source, slot, next);
    assert.ok(
      saved.scale >= 0.1 &&
        saved.scale <= 8 &&
        saved.x >= 0 &&
        saved.x <= 1 &&
        saved.y >= 0 &&
        saved.y <= 1,
    );
  }
});

test("fit, fill, and custom derive from geometry and presets center the video", () => {
  for (const [expected, transform] of [
    ["fit", fitTransform],
    ["fill", fillTransform(frame, source)],
    ["custom", { scale: 2, x: 0.1, y: 0 }],
  ]) {
    assert.equal(getLayoutMode({ frame, source, transform }), expected);
    const saved = transformedSlot(frame, source, slot, transform);
    const restored = slotTransform(frame, source, saved);
    near(restored.scale, transform.scale);
    near(restored.x, transform.x);
    near(restored.y, transform.y);
  }
  assert.equal(
    nudgeTransform({ transform: fitTransform, scale: 0.05 }).scale,
    1.05,
  );
  assert.equal(
    nudgeTransform({ transform: fitTransform, scale: -0.05 }).scale,
    0.95,
  );
  const clamped = clampTransform({
    frame,
    source,
    mode: "custom",
    transform: { scale: 100, x: 2, y: -2 },
  });
  assert.deepEqual(clamped, { scale: 8, x: 0.5, y: -0.5 });
  assert.equal(
    clampTransform({
      frame,
      source,
      mode: "custom",
      transform: { scale: 0.01, x: 0, y: 0 },
    }).scale,
    0.1,
  );
});

test("legacy fit/fill crops keep their pixels through conversion and JSON reload", () => {
  for (const [ratio, [width, height]] of Object.entries(ratios)) {
    for (const layout of layouts) {
      for (const region of regions(layout, width, height)) {
        for (const mode of ["fit", "fill"]) {
          const saved = { ...slot, mode, x: 0.3, y: 0.65, scale: 1.7 };
          const initial = placement(region, source, saved);
          const canonical = transformedSlot(
            region,
            source,
            saved,
            slotTransform(region, source, saved),
          );
          assert.deepEqual(
            placement(region, source, JSON.parse(JSON.stringify(canonical))),
            initial,
            `${ratio} ${layout} ${mode}`,
          );
          const background = backdropPlacement(region, source);
          assert.ok(
            background.width > region.width &&
              background.height > region.height,
          );
          assert.ok(background.blur > 0);
        }
      }
    }
  }
});

test("invalid source sizes leave gestures unchanged", () => {
  const invalid = { width: 0, height: 0 };
  assert.deepEqual(
    clampTransform({
      frame,
      source: invalid,
      mode: "fill",
      transform: fitTransform,
    }),
    fitTransform,
  );
  assert.deepEqual(
    resizeTransform({
      frame,
      source: invalid,
      transform: fitTransform,
      corner: "se",
      deltaX: 10,
      deltaY: 20,
      displayWidth: 360,
    }),
    fitTransform,
  );
  assert.equal(getFillScale(frame, invalid), 1);
});

test("a no-op gesture preserves the saved legacy base and creates no settings change", () => {
  assert.equal(
    transformedSlot(frame, source, slot, slotTransform(frame, source, slot)),
    slot,
  );
});
