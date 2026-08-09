// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDocument, isValidIdentifier, BLEND_MODES, CANVAS_WIDTH, CANVAS_HEIGHT } from '../../src/engine/document.js';

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

test('isValidIdentifier accepts usable javascript identifiers', () => {
  assert.equal(isValidIdentifier('speed'), true);
  assert.equal(isValidIdentifier('_weird$Name123'), true);
  assert.equal(isValidIdentifier('$'), true);
});

test('isValidIdentifier rejects strings that are not usable javascript identifiers', () => {
  assert.equal(isValidIdentifier('2speed'), false);
  assert.equal(isValidIdentifier(''), false);
  assert.equal(isValidIdentifier('x; alert(1); //'), false);
  assert.equal(isValidIdentifier('has space'), false);
});

test('unknown layer fit falls back to cover and is reported', () => {
  const { doc, problems } = normalizeDocument({ layers: [{ id: 'x', type: 'image', fit: 'invalid-fit' }] });
  assert.equal(doc.layers[0].fit, 'cover');
  assert.equal(problems.length, 1);
  assert.match(problems[0], /fit/);
});

test('unknown motion kind falls back to none and is reported', () => {
  const { doc, problems } = normalizeDocument({ layers: [{ id: 'x', type: 'image', motion: { kind: 'spin' } }] });
  assert.equal(doc.layers[0].motion.kind, 'none');
  assert.equal(problems.length, 1);
  assert.match(problems[0], /motion/);
});

test('unknown control type falls back to number and is reported', () => {
  const { doc, problems } = normalizeDocument({ controls: [{ property: 'x', type: 'slider' }] });
  assert.equal(doc.controls[0].type, 'number');
  assert.equal(problems.length, 1);
  assert.match(problems[0], /type/);
});

test('motion speed and amount are clamped into 0..100', () => {
  const { doc } = normalizeDocument({ layers: [{ type: 'image', motion: { speed: 200, amount: -50 } }] });
  assert.equal(doc.layers[0].motion.speed, 100);
  assert.equal(doc.layers[0].motion.amount, 0);
});

test('normalizeAsset defaults and mutually excludes data vs file', () => {
  const { doc } = normalizeDocument({
    assets: {
      withData: { data: 'base64stuff' },
      withFile: { file: 'image.png' },
      empty: {}
    }
  });

  // Embedded asset with data
  assert.equal(doc.assets.withData.kind, 'image');
  assert.equal(doc.assets.withData.mime, 'image/png');
  assert.equal(doc.assets.withData.data, 'base64stuff');
  assert.equal(doc.assets.withData.file, undefined);

  // Sibling asset with file
  assert.equal(doc.assets.withFile.kind, 'image');
  assert.equal(doc.assets.withFile.mime, 'image/png');
  assert.equal(doc.assets.withFile.file, 'image.png');
  assert.equal(doc.assets.withFile.data, undefined);

  // Empty asset defaults to empty file
  assert.equal(doc.assets.empty.kind, 'image');
  assert.equal(doc.assets.empty.mime, 'image/png');
  assert.equal(doc.assets.empty.file, '');
  assert.equal(doc.assets.empty.data, undefined);
});

test('blend mode table maps onto canvas composite operations', () => {
  assert.equal(BLEND_MODES.normal, 'source-over');
  assert.equal(BLEND_MODES.add, 'lighter');
  assert.equal(Object.keys(BLEND_MODES).length, 5);
});
