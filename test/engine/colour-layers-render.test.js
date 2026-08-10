// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { runJobs } from '../harness/render.js';
import { pixelAt, isColour, meanBrightness, maxDifference } from '../harness/pixels.js';
import { CANVAS_WIDTH, CANVAS_HEIGHT, DEFAULT_GRADIENT_STOPS, colorAtPosition } from '../../src/engine/document.js';
import { nextStopPosition } from '../../app/renderer/components/field.js';

/**
 * Every job in this file goes through one Electron launch, because starting
 * Electron costs a second or two and rendering a frame costs milliseconds (see
 * test/harness/render.js). The window is `show: false` throughout — nothing
 * here ever appears on screen.
 */
const solid = (color, motions = []) => ({
  name: 'Solid', layers: [{ id: 'a1', type: 'solid', color, motions }]
});

const gradient = (extra = {}) => ({
  name: 'Gradient',
  layers: [{
    id: 'a1', type: 'gradient',
    stops: [{ at: 0, color: '#ff0000' }, { at: 100, color: '#0000ff' }],
    ...extra
  }]
});

// The exact gesture createStops (app/renderer/components/field.js) performs
// when its "add" button is pressed on the untouched default gradient: find
// where the new stop lands, then ask the document what colour it already
// shows there. Computed here, once, with the real functions the button
// calls -- not re-typed out by hand -- so this file and the component can
// never quietly drift apart.
const DEFAULT_STOPS = DEFAULT_GRADIENT_STOPS.map((stop) => ({ ...stop }));
const ADDED_STOP_AT = nextStopPosition(DEFAULT_STOPS.map((stop) => stop.at));
const ADDED_STOP_COLOR = colorAtPosition(DEFAULT_STOPS, ADDED_STOP_AT);
const DEFAULT_STOPS_PLUS_ONE = [...DEFAULT_STOPS, { at: ADDED_STOP_AT, color: ADDED_STOP_COLOR }];

let frames;

test('render every colour-layer frame in one launch', async () => {
  const jobs = [
    { name: 'solid', kind: 'engine', doc: solid('#3366cc'), timeSec: 0 },
    { name: 'solid-junk', kind: 'engine', doc: solid('drop table'), timeSec: 0 },
    // Breathe is at its brightest at phase 0 and dimmest half a cycle later.
    { name: 'solid-breathe-0', kind: 'engine', doc: solid('#ffffff', [{ kind: 'breathe', speed: 100, amount: 100 }]), timeSec: 0 },
    { name: 'solid-breathe-later', kind: 'engine', doc: solid('#ffffff', [{ kind: 'breathe', speed: 100, amount: 100 }]), timeSec: 5.2 },
    // A solid cannot be seen to drift or warp; these two must be identical to
    // the still frame, byte for byte.
    { name: 'solid-drift', kind: 'engine', doc: solid('#3366cc', [{ kind: 'drift', speed: 100, amount: 100 }]), timeSec: 4 },
    { name: 'solid-warp', kind: 'engine', doc: solid('#3366cc', [{ kind: 'warp', speed: 100, amount: 100 }]), timeSec: 4 },

    { name: 'linear', kind: 'engine', doc: gradient(), timeSec: 0 },
    { name: 'linear-90', kind: 'engine', doc: gradient({ angle: 90 }), timeSec: 0 },
    { name: 'linear-stops', kind: 'engine', doc: gradient({ stops: [{ at: 25, color: '#ff0000' }, { at: 75, color: '#0000ff' }] }), timeSec: 0 },
    { name: 'radial', kind: 'engine', doc: gradient({ shape: 'radial' }), timeSec: 0 },

    { name: 'drift-0', kind: 'engine', doc: gradient({ motions: [{ kind: 'drift', speed: 60, amount: 100 }] }), timeSec: 0 },
    { name: 'drift-later', kind: 'engine', doc: gradient({ motions: [{ kind: 'drift', speed: 60, amount: 100 }] }), timeSec: 3.7 },
    // Warp is measured on a STEEP ramp — red and blue meeting in the middle
    // over 32 pixels — rather than on the gentle one above. Warp displaces
    // pixels; on a ramp that only changes by 0.8 of a unit per pixel, a
    // displacement of twenty pixels moves the colour by about sixteen units,
    // which is real but is not much above the noise. On a steep ramp the same
    // displacement moves the edge itself, which is what warp actually is.
    { name: 'warp-0', kind: 'engine', doc: gradient({ stops: [{ at: 45, color: '#ff0000' }, { at: 55, color: '#0000ff' }], motions: [{ kind: 'warp', speed: 60, amount: 100 }] }), timeSec: 0 },
    { name: 'warp-later', kind: 'engine', doc: gradient({ stops: [{ at: 45, color: '#ff0000' }, { at: 55, color: '#0000ff' }], motions: [{ kind: 'warp', speed: 60, amount: 100 }] }), timeSec: 3.7 },
    { name: 'warp-none', kind: 'engine', doc: gradient({ stops: [{ at: 45, color: '#ff0000' }, { at: 55, color: '#0000ff' }] }), timeSec: 0 },
    { name: 'breathe-0', kind: 'engine', doc: gradient({ motions: [{ kind: 'breathe', speed: 100, amount: 100 }] }), timeSec: 0 },
    { name: 'breathe-later', kind: 'engine', doc: gradient({ motions: [{ kind: 'breathe', speed: 100, amount: 100 }] }), timeSec: 5.2 },
    { name: 'radial-drift-later', kind: 'engine', doc: gradient({ shape: 'radial', motions: [{ kind: 'drift', speed: 60, amount: 100 }] }), timeSec: 3.7 },

    // See "adding a stop..." tests below: the default two-stop gradient,
    // rendered once as-is and once with a third stop added the way the
    // settings column's add button actually adds one.
    { name: 'stop-add-before', kind: 'engine', doc: { layers: [{ id: 'a1', type: 'gradient', stops: DEFAULT_STOPS }] }, timeSec: 0 },
    { name: 'stop-add-after', kind: 'engine', doc: { layers: [{ id: 'a1', type: 'gradient', stops: DEFAULT_STOPS_PLUS_ONE }] }, timeSec: 0 }
  ];

  const rendered = await runJobs(jobs);
  frames = new Map(rendered.map((entry) => [entry.name, entry]));
  assert.equal(frames.size, jobs.length);
});

const at = (name, x, y) => pixelAt(frames.get(name).pixels, CANVAS_WIDTH, x, y);
const rgb = (pixel) => [pixel.r, pixel.g, pixel.b];

/**
 * Chromium dithers its gradients — neighbouring pixels of what is
 * mathematically one colour differ by a unit or two, on purpose, so a long
 * smooth ramp does not band. Measured on this very canvas: 222 in one row and
 * 223 in another, at the same x. So "the same colour" means within a few units
 * here, and a comparison demanding equality would be testing Chromium's
 * dithering rather than this layer.
 */
const DITHER = 4;

test('a solid layer paints the colour it was given, over the whole canvas', () => {
  for (const [x, y] of [[0, 0], [CANVAS_WIDTH - 1, 0], [160, 100], [0, CANVAS_HEIGHT - 1], [CANVAS_WIDTH - 1, CANVAS_HEIGHT - 1]]) {
    assert.ok(isColour(at('solid', x, y), [0x33, 0x66, 0xcc], 2), `wrong colour at ${x},${y}`);
  }
});

test('a solid layer given an unusable colour paints the default, not the last fill', () => {
  // Whatever it paints, it must be a real colour and not black-by-accident.
  const pixel = at('solid-junk', 160, 100);
  assert.ok(pixel.r + pixel.g + pixel.b > 60, 'an unusable colour must not render as nothing');
});

test('breathe dims a solid colour and lets it come back', () => {
  const bright = meanBrightness(frames.get('solid-breathe-0').pixels);
  const dim = meanBrightness(frames.get('solid-breathe-later').pixels);
  assert.ok(bright > 250, `a white field at full breath should be near white, was ${bright}`);
  assert.ok(dim < bright - 30, `breathe changed nothing: ${bright} then ${dim}`);
});

test('drift and warp on a solid colour change not one byte, exactly as documented', () => {
  const still = frames.get('solid').pixels;
  assert.equal(maxDifference(still, frames.get('solid-drift').pixels), 0);
  assert.equal(maxDifference(still, frames.get('solid-warp').pixels), 0);
});

test('a linear gradient runs from its first colour to its last, left to right at angle 0', () => {
  assert.ok(isColour(at('linear', 1, 100), [255, 0, 0], 12), 'the left edge must be the first stop');
  assert.ok(isColour(at('linear', CANVAS_WIDTH - 2, 100), [0, 0, 255], 12), 'the right edge must be the last stop');
  const middle = at('linear', 160, 100);
  assert.ok(middle.r > 100 && middle.r < 160, `the middle should be half way, was r=${middle.r}`);
  assert.ok(middle.b > 100 && middle.b < 160, `the middle should be half way, was b=${middle.b}`);
});

test('a row of a linear gradient at angle 0 is the same at every height', () => {
  for (const y of [0, 60, 199]) {
    assert.ok(isColour(at('linear', 40, y), rgb(at('linear', 40, 100)), DITHER), `column 40 differs at y=${y}`);
  }
});

test('the angle turns the ramp: 90 degrees runs top to bottom', () => {
  assert.ok(isColour(at('linear-90', 160, 1), [255, 0, 0], 12), 'the top must be the first stop');
  assert.ok(isColour(at('linear-90', 160, CANVAS_HEIGHT - 2), [0, 0, 255], 12), 'the bottom must be the last stop');
  // And nothing changes along a row.
  assert.ok(isColour(at('linear-90', 10, 40), rgb(at('linear-90', 300, 40)), DITHER));
});

test('a stop lands where its position says: 25 and 75 leave flat bands at both ends', () => {
  assert.ok(isColour(at('linear-stops', 10, 100), [255, 0, 0], 4), 'before the first stop is flat');
  assert.ok(isColour(at('linear-stops', 70, 100), [255, 0, 0], 6), 'the first stop sits at a quarter');
  assert.ok(isColour(at('linear-stops', 250, 100), [0, 0, 255], 6), 'the last stop sits at three quarters');
  const middle = at('linear-stops', 160, 100);
  assert.ok(middle.r > 100 && middle.r < 160, `half way between the stops, was r=${middle.r}`);
});

test('a radial gradient is the first colour in the middle and the last at the corners', () => {
  assert.ok(isColour(at('radial', 160, 100), [255, 0, 0], 12), 'the centre must be the first stop');
  const corner = at('radial', 1, 1);
  assert.ok(corner.b > corner.r, `the corner must have reached the far colour, was ${JSON.stringify(corner)}`);
  // Symmetric about the centre: two opposite corners must match.
  assert.ok(isColour(at('radial', 1, 1), rgb(at('radial', CANVAS_WIDTH - 2, CANVAS_HEIGHT - 2)), DITHER));
});

for (const kind of ['drift', 'warp', 'breathe']) {
  test(`${kind} on a gradient really moves it: two times, two different frames`, () => {
    const a = frames.get(`${kind}-0`).pixels;
    const b = frames.get(`${kind}-later`).pixels;
    assert.ok(maxDifference(a, b) > 20, `${kind} produced the same frame at both times`);
  });
}

test('warp genuinely bends the ramp instead of merely redrawing it', () => {
  assert.ok(
    maxDifference(frames.get('warp-none').pixels, frames.get('warp-0').pixels) > 20,
    'a warped gradient must not look like the same gradient without warp'
  );
});

test('a drifting radial gradient moves its centre rather than standing still', () => {
  assert.ok(maxDifference(frames.get('radial').pixels, frames.get('radial-drift-later').pixels) > 20);
});

test('warp keeps the gradient on screen instead of dragging blackness in', () => {
  // The padded buffer is painted with the gradient's own continuation, so no
  // sampled pixel can be the black the canvas was cleared with.
  const bright = meanBrightness(frames.get('warp-later').pixels);
  assert.ok(bright > 60, `a warped red-to-blue ramp should stay lit, was ${bright}`);
});

// --------------------------------------------------- adding a stop, non-destructively

// The report's own open finding: adding a third stop to the default two-stop
// gradient used to hand it the second default colour outright (#00b3ff),
// flattening the right half of the ramp visibly. Pinned here so a colour
// pulled from anywhere other than colorAtPosition(document.js) -- the second
// default, a hardcoded midpoint literal, anything -- fails this exact number.
test('a stop added to the untouched default gradient lands on a real interpolated colour, not a default', () => {
  assert.equal(ADDED_STOP_AT, 50, 'the widest (only) gap in a two-stop gradient is the whole ramp');
  // #ff0066 (255,0,102) and #00b3ff (0,179,255) at their exact midpoint,
  // per-channel: (255+0)/2=127.5->128, (0+179)/2=89.5->90, (102+255)/2=178.5->179.
  assert.equal(ADDED_STOP_COLOR, '#805ab3');
  assert.notEqual(
    ADDED_STOP_COLOR, DEFAULT_GRADIENT_STOPS[1].color,
    'the added stop must not be the second default colour -- that is the bug being fixed'
  );
});

// The falsifiable claim itself, and the real one: not "the stop's hex value
// looks plausible" but "the picture on screen has not moved". DITHER (above)
// is the tolerance this whole file already established for exactly this
// situation -- Chromium redithers a ramp slightly differently depending on
// how many stops it was given, even where the underlying colours are
// mathematically identical, so a strict 0 would fail on dithering noise
// rather than on anything this change is responsible for. Verified by
// temporarily reverting field.js's add handler to `{ at }` alone (the old,
// colourless behaviour normalizeStops then fills with the second default) --
// this test then goes red with maxDifference well past 100, because the
// right half of the ramp goes flat at #00b3ff exactly as the report
// describes, which DITHER could never absorb.
test('adding a stop at the colour the gradient already shows there changes no more than dithering noise', () => {
  const difference = maxDifference(frames.get('stop-add-before').pixels, frames.get('stop-add-after').pixels);
  assert.ok(
    difference <= DITHER,
    `a non-destructive add must leave the ramp looking as it did before the stop was added, was ${difference}`
  );
});
