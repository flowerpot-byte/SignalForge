// SignalForge — build SignalRGB effects from images, gradients, shapes and particles.
// Copyright (C) 2026 Max Leopold Blumenschein
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  offsetFromDrag, cropSlack, mountCrop,
  dragFromKey, CROP_KEY_STEP, CROP_KEY_STEP_COARSE
} from '../../app/renderer/components/crop.js';
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

// --- one key press, as a drag ------------------------------------------
//
// The whole point of dragFromKey() is that the keyboard has no arithmetic of
// its own: it produces the same dx/dy a mouse drag produces and hands them to
// the same offsetFromDrag(). So the assertions below are about SIGNS and about
// agreement with the mouse — a test that only checked "the offset changed"
// would pass just as happily with every arrow reversed, which is the one
// mistake this feature can actually make.

test('ArrowRight is the same thing as dragging right, so the picture moves the same way', () => {
  const key = dragFromKey({ key: 'ArrowRight' });
  assert.equal(key.dy, 0);
  assert.ok(key.dx > 0, 'a rightward press must be a rightward drag, not a leftward one');
  // Identical, not merely similar: the same numbers through the same function.
  assert.deepEqual(
    offsetFromDrag({ ...base, dx: key.dx, dy: key.dy }),
    offsetFromDrag({ ...base, dx: CROP_KEY_STEP, dy: 0 })
  );
  // And the direction spelled out at the far end: the crop window goes LEFT,
  // which is what makes the picture itself travel right.
  assert.ok(offsetFromDrag({ ...base, dx: key.dx, dy: key.dy }).x < 0);
});

test('ArrowLeft is the mirror of ArrowRight', () => {
  const right = dragFromKey({ key: 'ArrowRight' });
  const left = dragFromKey({ key: 'ArrowLeft' });
  assert.ok(left.dx < 0, 'a leftward press must be a leftward drag');
  assert.equal(left.dx, -right.dx);
  assert.ok(offsetFromDrag({ ...base, dx: left.dx, dy: 0 }).x > 0);
});

test('ArrowDown pushes the picture down and ArrowUp pushes it up', () => {
  const down = dragFromKey({ key: 'ArrowDown' });
  const up = dragFromKey({ key: 'ArrowUp' });
  assert.equal(down.dx, 0);
  assert.equal(up.dx, 0);
  assert.ok(down.dy > 0, 'down must be the same sign a downward drag has');
  assert.ok(up.dy < 0);
  assert.equal(up.dy, -down.dy);
  // Through the vertical axis: down moves the crop window UP the picture.
  const vertical = { ...base, slackX: 0, slackY: 100 };
  assert.ok(offsetFromDrag({ ...vertical, dx: 0, dy: down.dy }).y < 0);
  assert.ok(offsetFromDrag({ ...vertical, dx: 0, dy: up.dy }).y > 0);
});

test('a press is four canvas pixels, and Shift makes it ten times that', () => {
  assert.equal(CROP_KEY_STEP, 4);
  assert.equal(CROP_KEY_STEP_COARSE, 40);
  assert.equal(dragFromKey({ key: 'ArrowRight' }).dx, CROP_KEY_STEP);
  assert.equal(dragFromKey({ key: 'ArrowRight', shiftKey: true }).dx, CROP_KEY_STEP_COARSE);
  assert.equal(dragFromKey({ key: 'ArrowUp', shiftKey: true }).dy, -CROP_KEY_STEP_COARSE);
  // Bigger, not smaller — Shift is the coarse step here, as in every drawing
  // program, and swapping the two would sail past a mere "they differ" check.
  assert.ok(CROP_KEY_STEP_COARSE > CROP_KEY_STEP);
});

// The press counts the two step sizes were chosen by, kept here so the numbers
// in crop.js's comment are checkable rather than merely asserted. The
// acceptance walkthrough's picture is 800 x 200; at `cover` that is 240 canvas
// pixels of slack, i.e. 480 pixels of travel from one end to the other.
test('the coarse step crosses a wide picture in a reasonable number of presses', () => {
  installEngine();
  const { slackX } = cropSlack({
    sourceWidth: 800, sourceHeight: 200,
    canvasWidth: CANVAS_WIDTH, canvasHeight: CANVAS_HEIGHT, fit: 'cover'
  });
  // Pins the geometry against the engine — kept as an equality deliberately.
  assert.equal(slackX, 240);
  const travel = slackX * 2;
  // Shaped like the coarse-step check below, not an equality: this must fail
  // if the fine step alone is unreasonable, not if CROP_KEY_STEP ever improves.
  // A step of 5 would give 96 presses and still read as a marathon.
  assert.ok(
    Math.ceil(travel / CROP_KEY_STEP) > 60,
    'the fine step alone would be a marathon'
  );
  assert.ok(
    Math.ceil(travel / CROP_KEY_STEP_COARSE) <= 15,
    'the coarse step must get from one end to the other without wearing anybody out'
  );
});

test('keys this control has no business with are left alone', () => {
  for (const key of ['Tab', 'Enter', ' ', 'a', 'Home', 'End', 'PageUp', 'PageDown']) {
    assert.equal(dragFromKey({ key }), null, key);
  }
});

test('an arrow held with a shortcut modifier belongs to the shortcut, not to us', () => {
  for (const modifier of ['ctrlKey', 'altKey', 'metaKey']) {
    assert.equal(dragFromKey({ key: 'ArrowRight', [modifier]: true }), null, modifier);
  }
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
    this.attributes = new Map();
  }
  getBoundingClientRect() { return this.box; }
  setPointerCapture(id) { this.captured.add(id); }
  hasPointerCapture(id) { return this.captured.has(id); }
  releasePointerCapture(id) { this.captured.delete(id); }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
  removeAttribute(name) { this.attributes.delete(name); }
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

// --- the keyboard ------------------------------------------------------

function keyEvent(key, extras = {}) {
  const event = new Event('keydown', { cancelable: true });
  event.key = key;
  Object.assign(event, { shiftKey: false, ctrlKey: false, altKey: false, metaKey: false }, extras);
  return event;
}

/**
 * A tall picture: 100 canvas pixels of slack vertically, none sideways.
 * `cover` only ever crops the one axis the aspect ratios disagree on, so a
 * layer with slack on both is not a thing that can exist — the vertical
 * direction has to be checked on a picture of its own.
 */
function tallLayer() {
  return { id: 'image', fit: 'cover', offset: { x: 0, y: 0 }, sourceWidth: 320, sourceHeight: 400 };
}

test('an arrow key moves the picture the same way the mouse does', () => {
  installEngine();
  const canvas = new FakeCanvas();
  const layer = wideLayer();
  const seen = [];
  mountCrop(canvas, { getLayer: () => layer, onChange: (offset) => seen.push(offset) });

  canvas.dispatchEvent(keyEvent('ArrowRight'));
  // 160 canvas pixels of slack, four pixels a press: one fortieth of a unit,
  // and negative — the crop window goes left so the picture goes right, which
  // is exactly what dragging right does above.
  assert.ok(seen.at(-1).x < 0, 'ArrowRight must move the picture right, as a rightward drag does');
  assert.ok(Math.abs(seen.at(-1).x - -(CROP_KEY_STEP / 160)) < 1e-9, `got ${seen.at(-1).x}`);

  canvas.dispatchEvent(keyEvent('ArrowLeft'));
  assert.ok(seen.at(-1).x > 0, 'ArrowLeft must go the other way');
});

test('a press consumes the key, so the panel does not scroll under it', () => {
  installEngine();
  const canvas = new FakeCanvas();
  mountCrop(canvas, { getLayer: () => wideLayer(), onChange: () => {} });

  const moved = keyEvent('ArrowRight');
  canvas.dispatchEvent(moved);
  assert.equal(moved.defaultPrevented, true);

  // The vertical axis has no slack on this picture, so up and down are not
  // this control's keys and must be handed on untouched.
  const vertical = keyEvent('ArrowDown');
  canvas.dispatchEvent(vertical);
  assert.equal(vertical.defaultPrevented, false, 'an axis with no slack must not swallow the key');

  // Neither is anything that is not an arrow at all.
  const tab = keyEvent('Tab');
  canvas.dispatchEvent(tab);
  assert.equal(tab.defaultPrevented, false);
});

test('presses accumulate and stop at the edge, exactly as dragging does', () => {
  installEngine();
  const canvas = new FakeCanvas();
  const layer = wideLayer();
  mountCrop(canvas, { getLayer: () => layer, onChange: (offset) => { layer.offset = offset; } });

  canvas.dispatchEvent(keyEvent('ArrowRight'));
  canvas.dispatchEvent(keyEvent('ArrowRight'));
  assert.ok(Math.abs(layer.offset.x - -(2 * CROP_KEY_STEP / 160)) < 1e-9, `got ${layer.offset.x}`);

  // 160 pixels of slack at 40 a press is four presses to the end; a fifth and
  // a sixth must change nothing.
  for (let i = 0; i < 20; i += 1) canvas.dispatchEvent(keyEvent('ArrowRight', { shiftKey: true }));
  assert.equal(layer.offset.x, -1);
  canvas.dispatchEvent(keyEvent('ArrowRight'));
  assert.equal(layer.offset.x, -1, 'the edge is the edge');

  for (let i = 0; i < 20; i += 1) canvas.dispatchEvent(keyEvent('ArrowLeft', { shiftKey: true }));
  assert.equal(layer.offset.x, 1);
});

test('a tall picture moves up and down, and sideways not at all', () => {
  installEngine();
  const canvas = new FakeCanvas();
  const layer = tallLayer();
  mountCrop(canvas, { getLayer: () => layer, onChange: (offset) => { layer.offset = offset; } });

  canvas.dispatchEvent(keyEvent('ArrowDown'));
  assert.ok(layer.offset.y < 0, 'ArrowDown must move the picture down, as a downward drag does');
  assert.ok(Math.abs(layer.offset.y - -(CROP_KEY_STEP / 100)) < 1e-9, `got ${layer.offset.y}`);
  canvas.dispatchEvent(keyEvent('ArrowUp'));
  canvas.dispatchEvent(keyEvent('ArrowUp'));
  assert.ok(layer.offset.y > 0);

  const sideways = keyEvent('ArrowRight');
  canvas.dispatchEvent(sideways);
  assert.equal(layer.offset.x, 0, 'there is no slack sideways on a tall picture');
  assert.equal(sideways.defaultPrevented, false);
});

test('a movable picture is a tab stop with a name, and says it handles its own keys', () => {
  installEngine();
  const canvas = new FakeCanvas();
  mountCrop(canvas, {
    getLayer: () => wideLayer(),
    onChange: () => {},
    t: (key) => `<${key}>`
  });

  assert.equal(canvas.getAttribute('tabindex'), '0');
  assert.equal(canvas.getAttribute('role'), 'application');
  assert.equal(canvas.getAttribute('aria-label'), '<preview.cropLabel>');
});

test('with nothing to move the canvas is not a tab stop at all', () => {
  installEngine();
  for (const layer of [null, { ...wideLayer(), fit: 'contain' }, { ...wideLayer(), fit: 'stretch' }]) {
    const canvas = new FakeCanvas();
    const seen = [];
    mountCrop(canvas, {
      getLayer: () => layer,
      onChange: (offset) => seen.push(offset),
      t: (key) => `<${key}>`
    });

    const label = String(layer && layer.fit);
    // Not -1 either: -1 would still let a click put the focus somewhere no key
    // does anything.
    assert.equal(canvas.getAttribute('tabindex'), null, label);
    assert.equal(canvas.getAttribute('role'), 'img', label);
    assert.equal(canvas.getAttribute('aria-label'), '<preview.canvasLabel>', label);

    const event = keyEvent('ArrowRight');
    canvas.dispatchEvent(event);
    assert.equal(seen.length, 0, label);
    assert.equal(event.defaultPrevented, false, label);
  }
});

test('the tab stop appears and disappears with the fit mode, not only at mount', () => {
  installEngine();
  const canvas = new FakeCanvas();
  const layer = { ...wideLayer(), fit: 'contain' };
  const crop = mountCrop(canvas, { getLayer: () => layer, onChange: () => {} });
  assert.equal(canvas.getAttribute('tabindex'), null);

  // What the fit dropdown does, followed by what main.js does about it.
  layer.fit = 'cover';
  crop.refresh();
  assert.equal(canvas.getAttribute('tabindex'), '0', 'switching to cover makes it croppable');
  assert.equal(canvas.getAttribute('role'), 'application');

  layer.fit = 'stretch';
  crop.refresh();
  assert.equal(canvas.getAttribute('tabindex'), null, 'and switching away takes the tab stop back');
  assert.equal(canvas.getAttribute('role'), 'img');
});

test('the accessible name follows a language switch', () => {
  installEngine();
  const canvas = new FakeCanvas();
  let language = 'de';
  const crop = mountCrop(canvas, {
    getLayer: () => wideLayer(),
    onChange: () => {},
    t: (key) => `${language}:${key}`
  });
  assert.equal(canvas.getAttribute('aria-label'), 'de:preview.cropLabel');
  language = 'en';
  crop.refresh();
  assert.equal(canvas.getAttribute('aria-label'), 'en:preview.cropLabel');
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

// --- the keyboard announcement -----------------------------------------
//
// role="application" takes the canvas out of a screen reader's own
// navigation (see syncAffordance() in crop.js), so without an explicit
// announcement an arrow press is not merely unannounced — it is silent to
// anyone not looking at the screen. `t` below distinguishes the two message
// keys so a test can tell which one actually fired, rather than merely that
// *something* was said.
const announceT = (key) => (
  key === 'preview.cropPosition' ? '{x},{y}'
    : key === 'preview.cropEdge' ? 'EDGE'
      : key
);

test('a successful arrow-key move announces the new position', () => {
  installEngine();
  const canvas = new FakeCanvas();
  const layer = wideLayer();
  const seen = [];
  mountCrop(canvas, {
    getLayer: () => layer,
    onChange: (offset) => { layer.offset = offset; },
    t: announceT,
    announce: (message) => seen.push(message)
  });

  canvas.dispatchEvent(keyEvent('ArrowRight'));
  // Falsifiable the way this suite already insists on: if the announcement
  // were never wired up, seen would still be empty here.
  assert.equal(seen.length, 1, 'a move that actually happened must announce something');
  // 160 canvas pixels of slack, four pixels a press: x moves from the centre
  // (50%) to 49%, y is untouched at 50% — spelled out, not merely non-empty,
  // so a message that forgot to interpolate the numbers would also fail this.
  assert.equal(seen[0], '49,50', `expected the new position spelled out, got ${seen[0]}`);
});

test('hitting the edge announces that, not a repeated position', () => {
  installEngine();
  const canvas = new FakeCanvas();
  const layer = wideLayer();
  const seen = [];
  mountCrop(canvas, {
    getLayer: () => layer,
    onChange: (offset) => { layer.offset = offset; },
    t: announceT,
    announce: (message) => seen.push(message)
  });

  // Drive it all the way to the edge first (four presses of the coarse step
  // cover the 160 pixels of slack), then discard those announcements — the
  // assertion below is only about the press that changes nothing.
  for (let i = 0; i < 10; i += 1) canvas.dispatchEvent(keyEvent('ArrowRight', { shiftKey: true }));
  assert.equal(layer.offset.x, -1, 'must be pinned at the edge before the real assertion');
  seen.length = 0;

  canvas.dispatchEvent(keyEvent('ArrowRight', { shiftKey: true }));
  assert.equal(layer.offset.x, -1, 'the edge is still the edge');
  // Falsifiable the other way round: a press that is swallowed (the axis has
  // slack) but refused by the clamp must still say something — and say the
  // RIGHT thing. An implementation that always announces the position
  // regardless of whether it moved would print '0,50' here (percentAlong of
  // offset -1), not 'EDGE', so this catches "fired without saying so" too.
  assert.equal(seen.length, 1, 'a refused press must still announce something');
  assert.equal(seen[0], 'EDGE', `must say the edge was hit, not repeat a position — got ${seen[0]}`);
});
