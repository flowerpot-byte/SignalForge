// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { offsetFromDrag, cropSlack, mountCrop } from '../../app/renderer/components/crop.js';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../../src/engine/document.js';
import { computeSourceRect } from '../../src/engine/util/fit.js';

const base = { startOffset: { x: 0, y: 0 }, canvasWidth: 320, canvasHeight: 200, slackX: 160, slackY: 0 };

test('dragging right moves the crop window left, so the picture follows the mouse', () => {
  const r = offsetFromDrag({ ...base, dx: 40, dy: 0 });
  assert.ok(r.x < 0, 'the picture must move with the pointer, not against it');
});

test('dragging the full slack reaches the end and no further', () => {
  const far = offsetFromDrag({ ...base, dx: 10_000, dy: 0 });
  assert.equal(far.x, -1);
  const back = offsetFromDrag({ ...base, dx: -10_000, dy: 0 });
  assert.equal(back.x, 1);
});

test('an axis with no slack does not move at all', () => {
  const r = offsetFromDrag({ ...base, dx: 0, dy: 500 });
  assert.equal(r.y, 0);
});

test('the mapping is proportional: half the slack is half the offset', () => {
  const r = offsetFromDrag({ ...base, dx: 80, dy: 0 });
  assert.ok(Math.abs(r.x - -0.5) < 1e-9, `expected -0.5, got ${r.x}`);
});

test('a drag starting from an existing offset accumulates', () => {
  const r = offsetFromDrag({ ...base, startOffset: { x: 0.5, y: 0 }, dx: 80, dy: 0 });
  assert.ok(Math.abs(r.x - 0) < 1e-9);
});

// --- the geometry half -------------------------------------------------
//
// cropSlack() must agree with the engine's own computeSourceRect(), which is
// the single authority on what offsetX/offsetY mean. These cases check that
// agreement against numbers derived straight from that function rather than
// against hand-copied constants, so a change in the engine's fit rules shows
// up here as a failure instead of being silently duplicated.

/** What the engine actually crops away, converted to canvas pixels, halved. */
function expectedSlack(sourceWidth, sourceHeight, fit) {
  const rect = computeSourceRect({
    srcW: sourceWidth, srcH: sourceHeight,
    dstW: CANVAS_WIDTH, dstH: CANVAS_HEIGHT,
    fit, offsetX: 0, offsetY: 0
  });
  return {
    slackX: ((sourceWidth - rect.sw) * (rect.dw / rect.sw)) / 2,
    slackY: ((sourceHeight - rect.sh) * (rect.dh / rect.sh)) / 2
  };
}

function installEngine() {
  globalThis.window = { SignalForgeEngine: { computeSourceRect } };
}

test('a wide picture in cover mode has horizontal slack and none vertically', () => {
  installEngine();
  // 640x200 against 320x200: cover keeps the full height and shows half the
  // width, so exactly half the picture is croppable sideways.
  const slack = cropSlack({
    sourceWidth: 640, sourceHeight: 200,
    canvasWidth: CANVAS_WIDTH, canvasHeight: CANVAS_HEIGHT, fit: 'cover'
  });
  assert.deepEqual(slack, expectedSlack(640, 200, 'cover'));
  assert.equal(slack.slackX, 160, 'one full offset unit must be 160 canvas pixels here');
  assert.equal(slack.slackY, 0);
});

test('a tall picture in cover mode has vertical slack and none horizontally', () => {
  installEngine();
  const slack = cropSlack({
    sourceWidth: 320, sourceHeight: 400,
    canvasWidth: CANVAS_WIDTH, canvasHeight: CANVAS_HEIGHT, fit: 'cover'
  });
  assert.deepEqual(slack, expectedSlack(320, 400, 'cover'));
  assert.equal(slack.slackX, 0);
  assert.ok(slack.slackY > 0);
});

test('contain and stretch crop nothing, so there is no slack to drag', () => {
  installEngine();
  for (const fit of ['contain', 'stretch']) {
    const slack = cropSlack({
      sourceWidth: 640, sourceHeight: 200,
      canvasWidth: CANVAS_WIDTH, canvasHeight: CANVAS_HEIGHT, fit
    });
    assert.deepEqual(slack, { slackX: 0, slackY: 0 }, fit);
  }
});

test('a missing or zero source size yields no slack instead of throwing', () => {
  installEngine();
  // computeSourceRect() throws on a non-positive size; a layer whose asset
  // failed to load must simply not be draggable.
  assert.deepEqual(
    cropSlack({ sourceWidth: 0, sourceHeight: 0, canvasWidth: CANVAS_WIDTH, canvasHeight: CANVAS_HEIGHT, fit: 'cover' }),
    { slackX: 0, slackY: 0 }
  );
  assert.deepEqual(
    cropSlack({ sourceWidth: undefined, sourceHeight: undefined, canvasWidth: CANVAS_WIDTH, canvasHeight: CANVAS_HEIGHT, fit: 'cover' }),
    { slackX: 0, slackY: 0 }
  );
});

// --- the drag itself ---------------------------------------------------
//
// Enough of a canvas for mountCrop: it listens, reads its own pixel size and
// its displayed size, captures the pointer and sets a cursor. Nothing here
// renders, so nothing more is needed.
class FakeCanvas extends EventTarget {
  constructor({ cssWidth = CANVAS_WIDTH, cssHeight = CANVAS_HEIGHT } = {}) {
    super();
    this.width = CANVAS_WIDTH;
    this.height = CANVAS_HEIGHT;
    this.style = {};
    this.box = { left: 0, top: 0, width: cssWidth, height: cssHeight };
    this.captured = new Set();
  }
  getBoundingClientRect() { return this.box; }
  setPointerCapture(id) { this.captured.add(id); }
  hasPointerCapture(id) { return this.captured.has(id); }
  releasePointerCapture(id) { this.captured.delete(id); }
}

function pointerEvent(type, clientX, clientY, pointerId = 7) {
  const event = new Event(type, { cancelable: true });
  event.clientX = clientX;
  event.clientY = clientY;
  event.pointerId = pointerId;
  return event;
}

/** A wide picture: 160 canvas pixels of slack sideways, none vertically. */
function wideLayer() {
  return { id: 'image', fit: 'cover', offset: { x: 0, y: 0 }, sourceWidth: 640, sourceHeight: 200 };
}

test('a real drag on the canvas moves the picture with the pointer', () => {
  installEngine();
  const canvas = new FakeCanvas();
  const layer = wideLayer();
  const seen = [];
  mountCrop(canvas, { getLayer: () => layer, onChange: (offset) => seen.push(offset) });

  canvas.dispatchEvent(pointerEvent('pointerdown', 100, 50));
  canvas.dispatchEvent(pointerEvent('pointermove', 180, 50));
  canvas.dispatchEvent(pointerEvent('pointerup', 180, 50));

  assert.equal(seen.length, 1);
  // 80 canvas pixels to the right out of 160 pixels of slack: the crop window
  // slides half a unit LEFT, which is what makes the picture follow the hand.
  assert.ok(Math.abs(seen[0].x - -0.5) < 1e-9, `expected -0.5, got ${seen[0].x}`);
  assert.equal(seen[0].y, 0);
});

test('screen pixels are converted to canvas pixels, because CSS scales the canvas up', () => {
  installEngine();
  // Displayed at twice its pixel size, so a 160 pixel drag on screen is only
  // 80 canvas pixels of movement.
  const canvas = new FakeCanvas({ cssWidth: CANVAS_WIDTH * 2, cssHeight: CANVAS_HEIGHT * 2 });
  const layer = wideLayer();
  const seen = [];
  mountCrop(canvas, { getLayer: () => layer, onChange: (offset) => seen.push(offset) });

  canvas.dispatchEvent(pointerEvent('pointerdown', 0, 0));
  canvas.dispatchEvent(pointerEvent('pointermove', 160, 0));

  // Without the conversion this would be -1 (clamped from -160/160).
  assert.ok(Math.abs(seen.at(-1).x - -0.5) < 1e-9, `expected -0.5, got ${seen.at(-1).x}`);
});

test('a drag that runs past the edge stops there', () => {
  installEngine();
  const canvas = new FakeCanvas();
  const layer = wideLayer();
  const seen = [];
  mountCrop(canvas, { getLayer: () => layer, onChange: (offset) => seen.push(offset) });

  canvas.dispatchEvent(pointerEvent('pointerdown', 0, 0));
  canvas.dispatchEvent(pointerEvent('pointermove', 5000, 0));
  assert.equal(seen.at(-1).x, -1);
  canvas.dispatchEvent(pointerEvent('pointermove', -5000, 0));
  assert.equal(seen.at(-1).x, 1);
});

test('a second drag starts from where the first one left off', () => {
  installEngine();
  const canvas = new FakeCanvas();
  const layer = wideLayer();
  // Stands in for the caller writing the new offset back into the document.
  mountCrop(canvas, { getLayer: () => layer, onChange: (offset) => { layer.offset = offset; } });

  canvas.dispatchEvent(pointerEvent('pointerdown', 0, 0));
  canvas.dispatchEvent(pointerEvent('pointermove', 40, 0));
  canvas.dispatchEvent(pointerEvent('pointerup', 40, 0));
  assert.ok(Math.abs(layer.offset.x - -0.25) < 1e-9);

  canvas.dispatchEvent(pointerEvent('pointerdown', 0, 0));
  canvas.dispatchEvent(pointerEvent('pointermove', 40, 0));
  assert.ok(Math.abs(layer.offset.x - -0.5) < 1e-9, `expected -0.5, got ${layer.offset.x}`);
});

test('the pointer is released on pointerup, so moving afterwards changes nothing', () => {
  installEngine();
  const canvas = new FakeCanvas();
  const layer = wideLayer();
  const seen = [];
  mountCrop(canvas, { getLayer: () => layer, onChange: (offset) => seen.push(offset) });

  canvas.dispatchEvent(pointerEvent('pointerdown', 0, 0));
  canvas.dispatchEvent(pointerEvent('pointermove', 40, 0));
  canvas.dispatchEvent(pointerEvent('pointerup', 40, 0));
  assert.equal(canvas.captured.size, 0, 'the pointer capture must be given back');

  const after = seen.length;
  canvas.dispatchEvent(pointerEvent('pointermove', 200, 0));
  assert.equal(seen.length, after, 'a move after the drag ended must not change the crop');
});

test('a cancelled drag ends just like a released one', () => {
  installEngine();
  const canvas = new FakeCanvas();
  const layer = wideLayer();
  const seen = [];
  mountCrop(canvas, { getLayer: () => layer, onChange: (offset) => seen.push(offset) });

  canvas.dispatchEvent(pointerEvent('pointerdown', 0, 0));
  canvas.dispatchEvent(pointerEvent('pointercancel', 0, 0));
  assert.equal(canvas.captured.size, 0);
  canvas.dispatchEvent(pointerEvent('pointermove', 200, 0));
  assert.equal(seen.length, 0);
});

test('a fit that crops nothing offers no drag and leaves the cursor alone', () => {
  installEngine();
  for (const fit of ['contain', 'stretch']) {
    const canvas = new FakeCanvas();
    const layer = { ...wideLayer(), fit };
    const seen = [];
    mountCrop(canvas, { getLayer: () => layer, onChange: (offset) => seen.push(offset) });

    canvas.dispatchEvent(pointerEvent('pointermove', 10, 10));
    assert.equal(canvas.style.cursor ?? '', '', `${fit}: the cursor must stay the default one`);

    canvas.dispatchEvent(pointerEvent('pointerdown', 0, 0));
    assert.equal(canvas.captured.size, 0, `${fit}: nothing to drag, so nothing to capture`);
    canvas.dispatchEvent(pointerEvent('pointermove', 200, 0));
    assert.equal(seen.length, 0, `${fit}: a fit that crops nothing must not move anything`);
  }
});

test('with no layer at all there is nothing to drag', () => {
  installEngine();
  const canvas = new FakeCanvas();
  const seen = [];
  mountCrop(canvas, { getLayer: () => null, onChange: (offset) => seen.push(offset) });

  canvas.dispatchEvent(pointerEvent('pointermove', 10, 10));
  assert.equal(canvas.style.cursor ?? '', '');
  canvas.dispatchEvent(pointerEvent('pointerdown', 0, 0));
  canvas.dispatchEvent(pointerEvent('pointermove', 80, 0));
  assert.equal(seen.length, 0);
});

test('hovering a draggable picture shows the grab cursor, and dragging shows the closed one', () => {
  installEngine();
  const canvas = new FakeCanvas();
  const layer = wideLayer();
  mountCrop(canvas, { getLayer: () => layer, onChange: () => {} });

  canvas.dispatchEvent(pointerEvent('pointermove', 10, 10));
  assert.equal(canvas.style.cursor, 'grab');
  canvas.dispatchEvent(pointerEvent('pointerdown', 10, 10));
  assert.equal(canvas.style.cursor, 'grabbing');
  canvas.dispatchEvent(pointerEvent('pointerup', 10, 10));
  assert.equal(canvas.style.cursor, 'grab');
});
