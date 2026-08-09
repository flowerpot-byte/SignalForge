// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { getByPath, setByPath, resolveLayerPath, applyControls } from '../../src/engine/bind.js';

const base = () => ({
  layers: [
    { id: 'a1', type: 'image', opacity: 1, motion: { kind: 'warp', speed: 15, amount: 30 } },
    { id: 'b2', type: 'image', opacity: 1, motion: { kind: 'warp', speed: 15, amount: 30 } }
  ],
  controls: [
    { property: 'tempo', type: 'number', default: 15, bind: ['a1.motion.speed', 'b2.motion.speed'] },
    { property: 'fade', type: 'number', default: 100, bind: ['a1.opacity'] }
  ]
});

test('getByPath walks dotted paths including array indices', () => {
  assert.equal(getByPath(base(), 'layers.0.motion.speed'), 15);
  assert.equal(getByPath(base(), 'layers.9.motion.speed'), undefined);
  assert.equal(getByPath(base(), 'nope.nope'), undefined);
});

test('setByPath writes through dotted paths', () => {
  const doc = base();
  setByPath(doc, 'layers.1.motion.amount', 77);
  assert.equal(doc.layers[1].motion.amount, 77);
});

test('setByPath refuses to create missing branches', () => {
  const doc = base();
  setByPath(doc, 'layers.0.nothing.here', 1);
  assert.equal(doc.layers[0].nothing, undefined);
});

test('resolveLayerPath turns a layer id into an index path', () => {
  const doc = base();
  assert.equal(resolveLayerPath(doc, 'b2.motion.speed'), 'layers.1.motion.speed');
  assert.equal(resolveLayerPath(doc, 'ghost.motion.speed'), null);
});

test('applyControls writes every bound value', () => {
  const doc = applyControls(base(), { tempo: 90, fade: 40 });
  assert.equal(doc.layers[0].motion.speed, 90);
  assert.equal(doc.layers[1].motion.speed, 90);
  assert.equal(doc.layers[0].opacity, 40);
});

test('applyControls leaves the original document untouched', () => {
  const original = base();
  applyControls(original, { tempo: 90 });
  assert.equal(original.layers[0].motion.speed, 15);
});

test('missing values fall back to the control default', () => {
  const doc = applyControls(base(), {});
  assert.equal(doc.layers[0].motion.speed, 15);
});

test('unknown bindings are ignored rather than throwing', () => {
  const input = base();
  input.controls.push({ property: 'x', type: 'number', default: 1, bind: ['ghost.motion.speed'] });
  assert.doesNotThrow(() => applyControls(input, { x: 5 }));
});

test('setByPath refuses a __proto__ segment and leaves Object.prototype untouched', () => {
  const originalToString = Object.prototype.toString;
  const doc = { layers: [{ id: 'a1', opacity: 1 }] };
  const result = setByPath(doc, 'layers.0.__proto__.toString', 'POLLUTED');
  assert.equal(result, false);
  assert.equal(Object.prototype.toString, originalToString);
  assert.equal(({}).toString(), '[object Object]');
});

test('setByPath refuses a constructor segment', () => {
  const doc = { layers: [{ id: 'a1', opacity: 1 }] };
  const result = setByPath(doc, 'layers.0.constructor.prototype.polluted', 'BAD');
  assert.equal(result, false);
  assert.equal(({}).polluted, undefined);
});

test('setByPath refuses an inherited-only key that is not an own property', () => {
  const doc = { layers: [{ id: 'a1', opacity: 1 }] };
  const result = setByPath(doc, 'layers.0.toString', 'HACKED');
  assert.equal(result, false);
  assert.equal(Object.hasOwn(doc.layers[0], 'toString'), false);
  assert.equal(doc.layers[0].toString, Object.prototype.toString);
});

test('getByPath returns undefined for a path containing __proto__ instead of walking into it', () => {
  const doc = { layers: [{ id: 'a1', opacity: 1 }] };
  assert.equal(getByPath(doc, 'layers.0.__proto__.toString'), undefined);
});

test('applyControls does not deep-copy assets', () => {
  const doc = base();
  doc.assets = { thumbnail: 'data:image/png;base64,verylongpayload' };
  const result = applyControls(doc, { tempo: 90 });
  assert.equal(result.assets, doc.assets);
});

test('applyControls still prevents a nested write from reaching the original document', () => {
  const original = base();
  const result = applyControls(original, { tempo: 90 });
  assert.equal(original.layers[0].motion.speed, 15);
  assert.equal(result.layers[0].motion.speed, 90);
  assert.notEqual(result.layers[0].motion, original.layers[0].motion);
});
