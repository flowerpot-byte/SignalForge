// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max Leopold Blumenschein
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeDocument, normalizeColor, motionKindsFor, colorAtPosition,
  DEFAULT_SOLID_COLOR, DEFAULT_GRADIENT_STOPS,
  MIN_GRADIENT_STOPS, MAX_GRADIENT_STOPS, MOTION_KINDS, SOLID_MOTION_KINDS, IMAGE_MOTION_KINDS,
  DEFAULT_BANDS
} from '../../src/engine/document.js';

const layerOf = (raw) => normalizeDocument({ layers: [raw] }).doc.layers[0];
const problemsOf = (raw) => normalizeDocument({ layers: [raw] }).problems;

// --------------------------------------------------------------- the colour

test('a colour is normalised to lower-case #rrggbb whichever way it arrived', () => {
  assert.equal(normalizeColor('#FF0066'), '#ff0066');
  assert.equal(normalizeColor('ff0066'), '#ff0066');
  assert.equal(normalizeColor('#F06'), '#ff0066');
  assert.equal(normalizeColor('rgb(255, 0, 102)'), '#ff0066');
  assert.equal(normalizeColor('rgba(255, 0, 102, 0.5)'), '#ff0066');
});

test('an unusable colour hands back the fallback rather than an unusable fillStyle', () => {
  assert.equal(normalizeColor('not a colour', '#010203'), '#010203');
  assert.equal(normalizeColor('', '#010203'), '#010203');
  assert.equal(normalizeColor(null, '#010203'), '#010203');
  assert.equal(normalizeColor(undefined, '#010203'), '#010203');
  assert.equal(normalizeColor(42, '#010203'), '#010203');
  // A hex string of the wrong length is not "close enough" — it is refused.
  assert.equal(normalizeColor('#ff00', '#010203'), '#010203');
});

test('an rgb() call outside 0..255 is clamped instead of producing junk hex', () => {
  assert.equal(normalizeColor('rgb(300, -20, 12.6)'), '#ff000d');
});

// ---------------------------------------------------------------- the solid

test('a solid layer carries a colour and motions, and no picture fields at all', () => {
  const layer = layerOf({ id: 'a1', type: 'solid' });
  assert.equal(layer.type, 'solid');
  assert.equal(layer.color, DEFAULT_SOLID_COLOR);
  assert.deepEqual(layer.motions, []);
  // The colour cycle's two fields, at rest: the default stop pair ready to be
  // edited, and a tempo of 0 — which is OFF, so the resting colour above is
  // still the whole story (src/engine/motion/color-cycle.js).
  assert.equal(layer.cycleSpeed, 0);
  assert.equal(layer.stops.length, 2);
  // Nothing to fit, nothing to crop, no asset to name.
  for (const absent of ['asset', 'fit', 'offset', 'shape', 'angle']) {
    assert.ok(!Object.hasOwn(layer, absent), `a solid layer must not carry ${absent}`);
  }
});

test('a solid layer keeps the colour it was given', () => {
  assert.equal(layerOf({ id: 'a1', type: 'solid', color: '#12AB34' }).color, '#12ab34');
});

test('a solid layer offers only the motions a flat colour can actually perform', () => {
  assert.deepEqual([...motionKindsFor('solid')], [...SOLID_MOTION_KINDS]);
  // The two that work on opacity alone, and none of the three that move pixels.
  assert.ok(SOLID_MOTION_KINDS.includes('breathe'));
  assert.ok(SOLID_MOTION_KINDS.includes('pulse'));
  for (const moves of ['drift', 'warp', 'spin']) {
    assert.ok(!SOLID_MOTION_KINDS.includes(moves), `a flat colour cannot be seen to ${moves}`);
  }
  // A gradient has structure at every angle, so it performs every DISPLACING
  // motion — but not zoom, which its renderer never reads (a gradient fills
  // the canvas at every scale; see GRADIENT_MOTION_KINDS, its own frozen
  // list since the live MOTION_KINDS alias quietly offered a dead slider).
  assert.deepEqual([...motionKindsFor('gradient')],
    ['none', 'warp', 'drift', 'breathe', 'spin', 'pulse']);
  assert.ok(!motionKindsFor('gradient').includes('zoom'),
    'a gradient must not offer a motion its renderer never reads');
  // A picture gets everything but spin — see IMAGE_MOTION_KINDS for the
  // arithmetic on how much of a crop turning one would cost.
  assert.deepEqual([...motionKindsFor('image')], [...IMAGE_MOTION_KINDS]);
  assert.ok(!IMAGE_MOTION_KINDS.includes('spin'));
});

test('a drift stored on a solid layer by hand is kept, not thrown away', () => {
  const { doc, problems } = normalizeDocument({
    layers: [{ id: 'a1', type: 'solid', motions: [{ kind: 'drift' }] }]
  });
  assert.equal(doc.layers[0].motions[0].kind, 'drift');
  assert.deepEqual(problems, []);
});

// ------------------------------------------------------------- the gradient

test('a gradient layer gets a shape, an angle and two stops by default', () => {
  const layer = layerOf({ id: 'a1', type: 'gradient' });
  assert.equal(layer.shape, 'linear');
  assert.equal(layer.angle, 0);
  assert.deepEqual(layer.stops, DEFAULT_GRADIENT_STOPS.map((stop) => ({ ...stop })));
  assert.deepEqual(layer.motions, []);
  for (const absent of ['asset', 'fit', 'offset', 'color']) {
    assert.ok(!Object.hasOwn(layer, absent), `a gradient layer must not carry ${absent}`);
  }
});

test('radial is a shape of the one gradient type, not a type of its own', () => {
  const layer = layerOf({ id: 'a1', type: 'gradient', shape: 'radial' });
  assert.equal(layer.type, 'gradient');
  assert.equal(layer.shape, 'radial');
});

test('an unknown gradient shape falls back to linear and is reported', () => {
  const problems = problemsOf({ id: 'a1', type: 'gradient', shape: 'spiral' });
  assert.equal(layerOf({ id: 'a1', type: 'gradient', shape: 'spiral' }).shape, 'linear');
  assert.match(problems.join(' '), /unknown gradient shape "spiral"/);
});

test('the angle is clamped into 0..360', () => {
  assert.equal(layerOf({ id: 'a1', type: 'gradient', angle: -30 }).angle, 0);
  assert.equal(layerOf({ id: 'a1', type: 'gradient', angle: 999 }).angle, 360);
  assert.equal(layerOf({ id: 'a1', type: 'gradient', angle: 'north' }).angle, 0);
  assert.equal(layerOf({ id: 'a1', type: 'gradient', angle: 45 }).angle, 45);
});

test('stop positions are whole percent, clamped into 0..100', () => {
  const layer = layerOf({
    id: 'a1', type: 'gradient',
    stops: [{ at: -5, color: '#000000' }, { at: 400, color: '#ffffff' }]
  });
  assert.deepEqual(layer.stops, [{ at: 0, color: '#000000' }, { at: 100, color: '#ffffff' }]);
});

test('too few stops are filled up to two and reported', () => {
  const raw = { id: 'a1', type: 'gradient', stops: [{ at: 20, color: '#010203' }] };
  const layer = layerOf(raw);
  assert.equal(layer.stops.length, MIN_GRADIENT_STOPS);
  assert.deepEqual(layer.stops[0], { at: 20, color: '#010203' });
  assert.equal(layer.stops[1].color, DEFAULT_GRADIENT_STOPS[1].color);
  assert.match(problemsOf(raw).join(' '), /at least 2 colour stops/);
});

test('too many stops are cut to the most a gradient may carry, and reported', () => {
  const stops = ['#111111', '#222222', '#333333', '#444444', '#555555', '#666666']
    .map((color, index) => ({ at: index * 20, color }));
  const raw = { id: 'a1', type: 'gradient', stops };
  const layer = layerOf(raw);
  assert.equal(layer.stops.length, MAX_GRADIENT_STOPS);
  assert.equal(layer.stops[MAX_GRADIENT_STOPS - 1].color, '#444444');
  assert.match(problemsOf(raw).join(' '), /only the first 4 are kept/);
});

test('a stop with no usable position is spaced evenly instead of collapsing onto zero', () => {
  const layer = layerOf({
    id: 'a1', type: 'gradient',
    stops: [{ color: '#000000' }, { color: '#888888' }, { color: '#ffffff' }]
  });
  assert.deepEqual(layer.stops.map((stop) => stop.at), [0, 50, 100]);
});

test('a stop with an unusable colour takes a default rather than losing the layer', () => {
  const layer = layerOf({
    id: 'a1', type: 'gradient',
    stops: [{ at: 0, color: 'periwinkle' }, { at: 100, color: '#00ff00' }]
  });
  assert.equal(layer.stops[0].color, DEFAULT_GRADIENT_STOPS[0].color);
  assert.equal(layer.stops[1].color, '#00ff00');
});

test('stops keep the order they were given, so a control never changes stop', () => {
  const layer = layerOf({
    id: 'a1', type: 'gradient',
    stops: [{ at: 90, color: '#111111' }, { at: 10, color: '#222222' }]
  });
  assert.deepEqual(layer.stops.map((stop) => stop.at), [90, 10]);
});

// ------------------------------------------- colorAtPosition (the add gesture)

test('colorAtPosition returns the interpolated colour between the two stops the position falls between', () => {
  const stops = [{ at: 0, color: '#000000' }, { at: 100, color: '#ffffff' }];
  assert.equal(colorAtPosition(stops, 50), '#808080');
  assert.equal(colorAtPosition(stops, 0), '#000000');
  assert.equal(colorAtPosition(stops, 100), '#ffffff');
});

test('colorAtPosition matches the real default gradient at its midpoint, per-channel and unrounded-to-taste', () => {
  // #ff0066 = (255, 0, 102), #00b3ff = (0, 179, 255). Straight per-channel
  // averages, the same blend CanvasGradient.addColorStop performs between
  // two fully-opaque stops: (255+0)/2=127.5->128=0x80, (0+179)/2=89.5->90=0x5a,
  // (102+255)/2=178.5->179=0xb3.
  assert.equal(colorAtPosition(DEFAULT_GRADIENT_STOPS, 50), '#805ab3');
});

test('colorAtPosition finds the pair a position falls between out of more than two stops', () => {
  const stops = [{ at: 0, color: '#000000' }, { at: 50, color: '#ff0000' }, { at: 100, color: '#0000ff' }];
  assert.equal(colorAtPosition(stops, 25), '#800000');
  assert.equal(colorAtPosition(stops, 75), '#800080');
  // Unsorted input is handled the same way -- document order is not ramp order.
  const reversed = [...stops].reverse();
  assert.equal(colorAtPosition(reversed, 25), '#800000');
});

// Edge case: a position at or beyond either end. Not reachable through
// nextStopPosition (field.js), which only ever returns the midpoint of two
// real neighbouring stops, but colorAtPosition must still answer sensibly if
// ever asked -- the same clamping addColorStop applies to an offset outside
// 0..1.
test('colorAtPosition clamps a position before the first or after the last stop to that stop\'s own colour', () => {
  const stops = [{ at: 20, color: '#111111' }, { at: 80, color: '#eeeeee' }];
  assert.equal(colorAtPosition(stops, 0), '#111111');
  assert.equal(colorAtPosition(stops, 20), '#111111');
  assert.equal(colorAtPosition(stops, 80), '#eeeeee');
  assert.equal(colorAtPosition(stops, 100), '#eeeeee');
});

// Edge case: two stops at the same position make a hard step with nothing to
// interpolate. The exact position of the step has no single right answer
// (it depends which side you approach from); colorAtPosition must still
// return something real and deterministic rather than NaN or a crash.
test('colorAtPosition treats two stops at the same position as a hard step, not a division by zero', () => {
  const stops = [{ at: 50, color: '#111111' }, { at: 50, color: '#eeeeee' }];
  assert.equal(colorAtPosition(stops, 50), '#111111');
  assert.equal(colorAtPosition(stops, 0), '#111111');
  assert.equal(colorAtPosition(stops, 100), '#eeeeee');
});

// Edge case: fewer than two usable stops -- nothing to interpolate between.
test('colorAtPosition with one stop, or none, answers without interpolating', () => {
  assert.equal(colorAtPosition([{ at: 40, color: '#123456' }], 0), '#123456');
  assert.equal(colorAtPosition([{ at: 40, color: '#123456' }], 100), '#123456');
  assert.equal(colorAtPosition([], 50), DEFAULT_SOLID_COLOR);
});

// An unusable colour on one side is normalizeColor's job to catch, and
// colorAtPosition is built on the same guarantee normalizeStops relies on:
// every stop it is handed has already been normalized. Confirms it does not
// silently propagate garbage if it were ever handed a raw, unnormalized stop.
test('colorAtPosition normalizes a stop colour it is handed before interpolating', () => {
  assert.equal(colorAtPosition([{ at: 0, color: 'not a colour' }, { at: 100, color: '#ffffff' }], 0), DEFAULT_SOLID_COLOR);
});

test('a gradient carries motions exactly as an image layer does', () => {
  const layer = layerOf({
    id: 'a1', type: 'gradient',
    motions: [{ kind: 'drift', speed: 200, amount: -4 }, { kind: 'drift' }]
  });
  assert.deepEqual(layer.motions, [{ kind: 'drift', speed: 100, amount: 0 }]);
});

// ------------------------------------------------------ nothing else moved

// The one promise the whole of this change hangs on: a project or an exported
// effect written before any of it must normalise to exactly the same document
// as it did before. Written out in full rather than as a set of spot checks,
// so an extra field appearing on an image layer fails here instead of being
// discovered later by a file that stopped opening.
test('a document from before the colour layers normalises to exactly what it did', () => {
  const { doc, problems } = normalizeDocument({
    name: 'Old One',
    description: 'from before',
    publisher: 'SignalForge',
    brightness: 78,
    saturation: 118,
    greenMagenta: -8,
    blueYellow: 12,
    layers: [{
      id: 'a1',
      type: 'image',
      name: 'Picture',
      asset: 'picture',
      fit: 'contain',
      offset: { x: -0.5, y: 0.25 },
      opacity: 0.8,
      blend: 'screen',
      motions: [{ kind: 'warp', speed: 20, amount: 40 }]
    }],
    controls: [{ property: 'tempo', label: { de: 'Tempo', en: 'Speed' }, type: 'number', min: 1, max: 100, default: 20, bind: ['a1.motions.0.speed'] }],
    assets: { picture: { kind: 'image', mime: 'image/jpeg', data: 'AAAA' } }
  });

  assert.deepEqual(problems, []);
  assert.deepEqual(doc, {
    version: 1,
    name: 'Old One',
    description: 'from before',
    publisher: 'SignalForge',
    brightness: 78,
    saturation: 118,
    greenMagenta: -8,
    blueYellow: 12,
    // The fields a document from before this change cannot carry, at the
    // values that mean "nothing here has been turned on": no hue rotation, no
    // hue cycle, the hard clear the engine has always done, and no host
    // stretch to compensate for.
    hueShift: 0,
    hueCycle: 0,
    trail: 0,
    aspect: 100,
    // No tile picture chosen — the automatic frame-0 render, which is all
    // any document from before this field ever had.
    cover: null,
    layers: [{
      id: 'a1',
      type: 'image',
      name: 'Picture',
      visible: true,
      opacity: 0.8,
      blend: 'screen',
      asset: 'picture',
      fit: 'contain',
      offset: { x: -0.5, y: 0.25 },
      motions: [{ kind: 'warp', speed: 20, amount: 40 }]
    }],
    controls: [{
      property: 'tempo',
      label: { de: 'Tempo', en: 'Speed' },
      type: 'number',
      min: 1,
      max: 100,
      values: [],
      default: 20,
      bind: ['a1.motions.0.speed']
    }],
    assets: { picture: { kind: 'image', mime: 'image/jpeg', data: 'AAAA' } }
  });
});

// The same promise, made about the layer type the new field actually landed
// on. The check above is written out in full for an IMAGE layer, which is
// exactly why it could not have caught `bands` appearing on a gradient: a
// gradient document was never compared field for field with anything. A project
// written before the repeating shapes existed carries a gradient with no
// `bands` in it, and what it must normalise to is written out here in full,
// `bands` included at its default -- so the next field added to a gradient
// fails here rather than in somebody's file that stopped opening.
test('a gradient from before the band count normalises to exactly what it must', () => {
  const { doc, problems } = normalizeDocument({
    name: 'Old Ramp',
    description: 'a gradient from before the repeating shapes',
    publisher: 'SignalForge',
    brightness: 90,
    layers: [{
      id: 'a1',
      type: 'gradient',
      name: 'Gradient',
      shape: 'radial',
      angle: 45,
      opacity: 0.7,
      blend: 'lighten',
      stops: [{ at: 0, color: '#ff0066' }, { at: 100, color: '#00b3ff' }],
      motions: [{ kind: 'drift', speed: 20, amount: 40 }]
    }]
  });

  assert.deepEqual(problems, []);
  assert.deepEqual(doc, {
    version: 1,
    name: 'Old Ramp',
    description: 'a gradient from before the repeating shapes',
    publisher: 'SignalForge',
    brightness: 90,
    saturation: 100,
    greenMagenta: 0,
    blueYellow: 0,
    hueShift: 0,
    hueCycle: 0,
    trail: 0,
    aspect: 100,
    cover: null,
    layers: [{
      id: 'a1',
      type: 'gradient',
      name: 'Gradient',
      visible: true,
      opacity: 0.7,
      blend: 'lighten',
      shape: 'radial',
      angle: 45,
      bands: DEFAULT_BANDS,
      stops: [{ at: 0, color: '#ff0066' }, { at: 100, color: '#00b3ff' }],
      motions: [{ kind: 'drift', speed: 20, amount: 40 }]
    }],
    controls: [],
    assets: {}
  });
});

test('a layer type nothing knows about still gets nothing but the common fields', () => {
  const layer = layerOf({ id: 'a1', type: 'shapes' });
  assert.deepEqual(Object.keys(layer).sort(), ['blend', 'id', 'name', 'opacity', 'type', 'visible']);
});
