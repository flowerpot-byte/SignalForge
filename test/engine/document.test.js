// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDocument, BLEND_MODES, CANVAS_WIDTH, CANVAS_HEIGHT } from '../../src/engine/document.js';

test('canvas size is fixed at 320x200', () => {
  assert.equal(CANVAS_WIDTH, 320);
  assert.equal(CANVAS_HEIGHT, 200);
});

test('empty input produces a valid empty document', () => {
  const { doc, problems } = normalizeDocument(undefined);
  assert.equal(doc.version, 1);
  assert.equal(doc.name, 'Untitled');
  assert.deepEqual(doc.layers, []);
  assert.deepEqual(doc.controls, []);
  assert.deepEqual(doc.assets, {});
  assert.deepEqual(problems, []);
});

test('image layer gets full defaults', () => {
  const { doc } = normalizeDocument({ layers: [{ type: 'image', asset: 'a' }] });
  const layer = doc.layers[0];
  assert.equal(layer.id, 'layer-0');
  assert.equal(layer.visible, true);
  assert.equal(layer.opacity, 1);
  assert.equal(layer.blend, 'normal');
  assert.equal(layer.fit, 'cover');
  assert.deepEqual(layer.offset, { x: 0, y: 0 });
  assert.deepEqual(layer.motion, { kind: 'none', speed: 15, amount: 30 });
});

test('unknown blend falls back to normal and is reported', () => {
  const { doc, problems } = normalizeDocument({ layers: [{ id: 'x', type: 'image', blend: 'burn' }] });
  assert.equal(doc.layers[0].blend, 'normal');
  assert.equal(problems.length, 1);
  assert.match(problems[0], /blend/);
});

test('opacity is clamped into 0..1', () => {
  const { doc } = normalizeDocument({ layers: [{ type: 'image', opacity: 5 }, { type: 'image', opacity: -2 }] });
  assert.equal(doc.layers[0].opacity, 1);
  assert.equal(doc.layers[1].opacity, 0);
});

test('offset is clamped into -1..1', () => {
  const { doc } = normalizeDocument({ layers: [{ type: 'image', offset: { x: 9, y: -9 } }] });
  assert.deepEqual(doc.layers[0].offset, { x: 1, y: -1 });
});

test('duplicate layer ids are made unique and reported', () => {
  const { doc, problems } = normalizeDocument({
    layers: [{ id: 'same', type: 'image' }, { id: 'same', type: 'image' }]
  });
  assert.notEqual(doc.layers[0].id, doc.layers[1].id);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /duplicate/i);
});

test('control labels must be ASCII', () => {
  const { doc, problems } = normalizeDocument({
    controls: [{ property: 'speed', label: { de: 'Staerke', en: 'Strength' }, type: 'number' },
               { property: 'x', label: { de: 'Stärke', en: 'Strength' }, type: 'number' }]
  });
  assert.equal(doc.controls.length, 2);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /ASCII/);
});

test('control property must be a valid javascript identifier', () => {
  const { problems } = normalizeDocument({
    controls: [{ property: '2speed', label: { de: 'A', en: 'A' }, type: 'number' }]
  });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /identifier/i);
});

test('blend mode table maps onto canvas composite operations', () => {
  assert.equal(BLEND_MODES.normal, 'source-over');
  assert.equal(BLEND_MODES.add, 'lighter');
  assert.equal(Object.keys(BLEND_MODES).length, 5);
});
