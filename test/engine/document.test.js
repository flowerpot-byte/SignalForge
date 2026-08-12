// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max Leopold Blumenschein
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
  assert.equal(doc.brightness, 100);
  assert.deepEqual(problems, []);
});

test('brightness defaults to 100 (unchanged) and is clamped into 0..200', () => {
  assert.equal(normalizeDocument({}).doc.brightness, 100);
  assert.equal(normalizeDocument({ brightness: 50 }).doc.brightness, 50);
  assert.equal(normalizeDocument({ brightness: 500 }).doc.brightness, 200);
  assert.equal(normalizeDocument({ brightness: -50 }).doc.brightness, 0);
  assert.equal(normalizeDocument({ brightness: 'nonsense' }).doc.brightness, 100);
});

test('brightness above 100 survives normalisation instead of being clipped back to it', () => {
  // The whole point of the widened range: the ceiling used to BE the default,
  // so the control could only darken. A value between 100 and 200 has to reach
  // the renderer untouched, or the headroom exists on the slider only.
  assert.equal(normalizeDocument({ brightness: 150 }).doc.brightness, 150);
  assert.equal(normalizeDocument({ brightness: 200 }).doc.brightness, 200);
});

test('a document written before the headroom existed normalises exactly as it did', () => {
  // Backwards compatibility, stated as an assertion rather than as a comment:
  // every value an older project or an older exported effect can carry sits in
  // 0..100, and widening the clamp's ceiling must not move any of them.
  for (const value of [0, 1, 5, 42, 78, 99, 100]) {
    assert.equal(normalizeDocument({ brightness: value }).doc.brightness, value);
  }
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
  assert.deepEqual(layer.motions, []);
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

test('unknown motion kind is dropped, not substituted, and is reported', () => {
  // "somersault" and not "spin": spin is a motion this engine has, and a test
  // whose example of "unknown" quietly becomes known stops testing anything.
  const { doc, problems } = normalizeDocument({ layers: [{ id: 'x', type: 'image', motion: { kind: 'somersault' } }] });
  assert.deepEqual(doc.layers[0].motions, []);
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
  const { doc } = normalizeDocument({
    layers: [{ type: 'image', motion: { kind: 'warp', speed: 200, amount: -50 } }]
  });
  assert.equal(doc.layers[0].motions[0].speed, 100);
  assert.equal(doc.layers[0].motions[0].amount, 0);
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

/**
 * An asset whose id happens to be "__proto__".
 *
 * `assets[id] = ...` on a plain object does not make a key when the id is
 * "__proto__" — it reaches Object.prototype's setter instead, and the asset
 * disappeared without a word while every layer pointing at it drew nothing. A
 * document is data, and that is a legal name for a picture in it: JSON.parse
 * makes it an ordinary own property, so any document that has been through a
 * file can carry one, and only this one assignment lost it.
 *
 * The prototype must be left alone at the same time — an id out of a foreign
 * file writing into Object.prototype would be the other half of the same bug,
 * and a worse half.
 */
test('an asset called "__proto__" survives as a key rather than vanishing', () => {
  // Built with JSON.parse, and it has to be: in an object LITERAL, `__proto__:`
  // sets the prototype instead of making a key, so a literal here would be
  // testing something else entirely. JSON.parse makes an ordinary own property,
  // which is exactly what a document read out of a file arrives as.
  const input = JSON.parse('{"assets":{"__proto__":{"data":"base64stuff"},"ordinary":{"file":"image.png"}}}');
  const { doc } = normalizeDocument({ ...input, layers: [{ type: 'image', asset: '__proto__' }] });

  assert.ok(
    Object.prototype.hasOwnProperty.call(doc.assets, '__proto__'),
    'it has to be an own key, not a write into the prototype'
  );
  assert.equal(doc.assets.__proto__.data, 'base64stuff');
  assert.deepEqual(Object.keys(doc.assets).sort(), ['__proto__', 'ordinary']);

  // And nothing was poisoned on the way: the object is still an ordinary one.
  assert.equal(Object.getPrototypeOf(doc.assets), Object.prototype);
  assert.equal({}.data, undefined, 'Object.prototype must be exactly as it was');
});

test('an asset called "__proto__" survives being written to a file and read back', () => {
  // The round trip is the reason this matters at all: JSON.parse produces an
  // own "__proto__" property, so a document that has been through an .sfx or an
  // exported effect arrives here with one.
  const parsed = JSON.parse('{"assets":{"__proto__":{"data":"AAAA"}}}');
  const { doc } = normalizeDocument(parsed);
  assert.equal(doc.assets.__proto__.data, 'AAAA');
});

test('blend mode table maps onto canvas composite operations', () => {
  assert.equal(BLEND_MODES.normal, 'source-over');
  assert.equal(BLEND_MODES.add, 'lighter');
  assert.equal(Object.keys(BLEND_MODES).length, 5);
});
