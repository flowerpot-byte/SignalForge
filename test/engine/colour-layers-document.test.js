// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeDocument, normalizeColor, motionKindsFor,
  DEFAULT_SOLID_COLOR, DEFAULT_GRADIENT_STOPS,
  MIN_GRADIENT_STOPS, MAX_GRADIENT_STOPS, MOTION_KINDS, SOLID_MOTION_KINDS
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
  // Nothing to fit, nothing to crop, no asset to name.
  for (const absent of ['asset', 'fit', 'offset', 'stops', 'shape', 'angle']) {
    assert.ok(!Object.hasOwn(layer, absent), `a solid layer must not carry ${absent}`);
  }
});

test('a solid layer keeps the colour it was given', () => {
  assert.equal(layerOf({ id: 'a1', type: 'solid', color: '#12AB34' }).color, '#12ab34');
});

test('a solid layer offers only the motion a flat colour can actually perform', () => {
  assert.deepEqual([...motionKindsFor('solid')], [...SOLID_MOTION_KINDS]);
  assert.ok(SOLID_MOTION_KINDS.includes('breathe'));
  assert.ok(!SOLID_MOTION_KINDS.includes('drift'));
  assert.ok(!SOLID_MOTION_KINDS.includes('warp'));
  // Everything else gets the full list.
  assert.deepEqual([...motionKindsFor('gradient')], [...MOTION_KINDS]);
  assert.deepEqual([...motionKindsFor('image')], [...MOTION_KINDS]);
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

test('a layer type nothing knows about still gets nothing but the common fields', () => {
  const layer = layerOf({ id: 'a1', type: 'shapes' });
  assert.deepEqual(Object.keys(layer).sort(), ['blend', 'id', 'name', 'opacity', 'type', 'visible']);
});
