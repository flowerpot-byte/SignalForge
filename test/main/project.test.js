// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { serializeProject, parseProject, PROJECT_FORMAT } from '../../src/main/project.js';
import { normalizeDocument } from '../../src/engine/document.js';

const doc = normalizeDocument({
  name: 'Abend',
  assets: { q: { kind: 'image', mime: 'image/png', data: 'AAAA' } },
  layers: [{ id: 'a1', type: 'image', asset: 'q', motions: [{ kind: 'warp', speed: 20, amount: 40 }] }],
  brightness: 80, saturation: 120
}).doc;

test('a saved project reads back the same document', () => {
  const back = parseProject(serializeProject(doc));
  assert.deepEqual(back.doc, doc);
  assert.deepEqual(back.problems, []);
});

test('the file carries its format number', () => {
  assert.equal(JSON.parse(serializeProject(doc)).format, PROJECT_FORMAT);
});

test('a file from a newer format is refused with a clear message, not half-loaded', () => {
  const text = JSON.stringify({ format: PROJECT_FORMAT + 1, document: doc });
  assert.throws(() => parseProject(text), /newer version/i);
});

test('a file with no format number is refused', () => {
  assert.throws(() => parseProject(JSON.stringify({ document: doc })), /format/i);
});

test('unreadable content is refused with a clear message', () => {
  assert.throws(() => parseProject('{not json'), /could not be read/i);
});

// Not "the fields somebody happened to think of": every field a normalized
// document has, each one away from its default, so a round trip that dropped
// or reset any single one of them shows up here.
test('every field of a document survives the round trip, not just the obvious ones', () => {
  const full = normalizeDocument({
    name: 'Everything', description: 'a description', publisher: 'someone',
    brightness: 33, saturation: 177, greenMagenta: -44, blueYellow: 55,
    layers: [
      {
        id: 'front', type: 'image', name: 'the front one', visible: false,
        opacity: 0.35, blend: 'multiply', asset: 'pic', fit: 'stretch',
        offset: { x: -0.75, y: 0.5 },
        motions: [{ kind: 'warp', speed: 3, amount: 97 }, { kind: 'breathe', speed: 61, amount: 8 }]
      },
      { id: 'back', type: 'gradient', name: 'behind', opacity: 0.9, blend: 'add' }
    ],
    controls: [{
      property: 'tempo', label: { de: 'Tempo', en: 'Speed' }, type: 'number',
      min: 1, max: 100, values: ['a', 'b'], default: 42, bind: ['layers.front.motions.0.speed']
    }],
    assets: {
      pic: { kind: 'image', mime: 'image/webp', data: 'QUJD' },
      sibling: { kind: 'image', mime: 'image/png', file: 'beside.png' }
    }
  }).doc;

  const back = parseProject(serializeProject(full));
  assert.deepEqual(back.doc, full);
  assert.deepEqual(back.problems, []);
  // Falsifiability: the comparison is only worth anything if these really are
  // non-default values that a dropped field would change.
  assert.equal(back.doc.layers[0].visible, false);
  assert.equal(back.doc.layers[0].offset.x, -0.75);
  assert.equal(back.doc.controls[0].default, 42);
  assert.equal(back.doc.assets.sibling.file, 'beside.png');
});

// Cases the brief does not name, all of them "some other JSON file was
// chosen in the open dialog". Each one must throw, because a project that
// half-loads is exactly the blank/wrong window this feature must not produce.
test('JSON that is not an object at all is refused', () => {
  for (const text of ['null', '42', '"a string"', '[1,2,3]']) {
    assert.throws(() => parseProject(text), /could not be read/i, text);
  }
});

test('a file whose format number is not a whole number is refused', () => {
  for (const format of ['1', 1.5, true, null]) {
    assert.throws(() => parseProject(JSON.stringify({ format, document: doc })), /format/i, String(format));
  }
});

test('a file with a format number but no document is refused, not opened empty', () => {
  assert.throws(() => parseProject(JSON.stringify({ format: PROJECT_FORMAT })), /document/i);
  assert.throws(() => parseProject(JSON.stringify({ format: PROJECT_FORMAT, document: 7 })), /document/i);
});

test('the file is written indented so it stays readable in git and in an editor', () => {
  assert.match(serializeProject(doc), /\n {2}"format"/);
});

test('a document with problems still loads, and the problems come along', () => {
  const text = JSON.stringify({
    format: PROJECT_FORMAT,
    document: { layers: [{ id: 'a1', type: 'image', blend: 'nonsense' }] }
  });
  const back = parseProject(text);
  assert.equal(back.doc.layers[0].blend, 'normal');
  assert.equal(back.problems.length, 1);
});
