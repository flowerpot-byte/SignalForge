// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { describeInspector, widenToInclude } from '../../app/renderer/components/inspector.js';
import { normalizeDocument, FIT_MODES, MOTION_KINDS } from '../../src/engine/document.js';
import { getByPath, setByPath } from '../../src/engine/bind.js';

const docWith = (layer) => normalizeDocument({
  assets: { q: { kind: 'image', mime: 'image/png', data: 'AAAA' } },
  layers: [{ id: 'a1', type: 'image', asset: 'q', ...layer }]
}).doc;

test('an image layer offers fit, and one entry per active motion', () => {
  const doc = docWith({ motions: [{ kind: 'warp' }, { kind: 'breathe' }] });
  const fields = describeInspector(doc, 'a1');
  const paths = fields.map((f) => f.path);
  assert.ok(paths.includes('layers.0.fit'));
  assert.ok(paths.includes('layers.0.motions.0.speed'));
  assert.ok(paths.includes('layers.0.motions.1.amount'));
});

test('a layer with no motions offers no motion sliders', () => {
  const fields = describeInspector(docWith({ motions: [] }), 'a1');
  assert.equal(fields.filter((f) => f.path.includes('motions')).length, 0);
});

test('the document-wide fields are always present, exactly once each', () => {
  const fields = describeInspector(docWith({}), 'a1');
  for (const path of ['brightness', 'saturation', 'greenMagenta', 'blueYellow']) {
    assert.equal(fields.filter((f) => f.path === path).length, 1, path);
  }
});

test('every field carries the range and step the control needs', () => {
  for (const field of describeInspector(docWith({ motions: [{ kind: 'warp' }] }), 'a1')) {
    if (field.type !== 'number') continue;
    assert.equal(typeof field.min, 'number', field.path);
    assert.equal(typeof field.max, 'number', field.path);
    assert.ok(field.max > field.min, field.path);
  }
});

test('an unknown layer id yields the document fields only, not a crash', () => {
  const fields = describeInspector(docWith({}), 'ghost');
  assert.ok(fields.length > 0);
  assert.equal(fields.filter((f) => f.path.startsWith('layers.')).length, 0);
});

// The ranges are the part most easily got wrong by hand, so they are checked
// against the engine itself rather than against copied-out numbers: a slider
// that offers a value normalizeDocument clamps away would let someone drag to
// a setting the picture never takes.
test('no slider offers a value the engine would clamp away', () => {
  const doc = docWith({ motions: [{ kind: 'warp' }] });
  for (const field of describeInspector(doc, 'a1')) {
    if (field.type !== 'number') continue;
    for (const value of [field.min, field.max]) {
      const probe = docWith({ motions: [{ kind: 'warp' }] });
      assert.ok(setByPath(probe, field.path, value), `${field.path} is not a writable path`);
      const again = normalizeDocument(probe).doc;
      assert.equal(getByPath(again, field.path), value,
        `${field.path} = ${value} does not survive normalizeDocument`);
    }
  }
});

test('the dropdowns offer exactly the values the engine accepts', () => {
  const fields = describeInspector(docWith({ motions: [{ kind: 'warp' }] }), 'a1');
  assert.deepEqual(fields.find((f) => f.path === 'layers.0.fit').values, [...FIT_MODES]);
  assert.deepEqual(fields.find((f) => f.type === 'motions').values, [...MOTION_KINDS]);
});

test('the motion list is offered even when there are none, so one can be added', () => {
  const lists = describeInspector(docWith({ motions: [] }), 'a1').filter((f) => f.type === 'motions');
  assert.equal(lists.length, 1);
  // It addresses the layer, not the layer's motions: "no motions" has to mean
  // no field mentioning motions at all (see the second test above).
  assert.equal(lists[0].path, 'layers.0');
});

test('the paths point at the layer that was asked for, not always the first', () => {
  const doc = normalizeDocument({
    layers: [{ id: 'a0', type: 'image' }, { id: 'a1', type: 'image', motions: [{ kind: 'drift' }] }]
  }).doc;
  const paths = describeInspector(doc, 'a1').map((f) => f.path);
  assert.ok(paths.includes('layers.1.fit'), 'the second layer must be addressed as layers.1');
  assert.ok(paths.includes('layers.1.motions.0.speed'));
});

test('a layer that is not an image contributes nothing of its own', () => {
  // normalizeDocument gives a non-image layer no fit, offset or motions at
  // all, so offering those controls would write to paths that do not exist.
  const doc = normalizeDocument({ layers: [{ id: 'a1', type: 'gradient' }] }).doc;
  const fields = describeInspector(doc, 'a1');
  assert.equal(fields.filter((f) => f.path.startsWith('layers.')).length, 0);
  assert.ok(fields.length > 0);
});

// A saved project may legitimately carry a value the sliders do not offer:
// the engine clamps brightness to 0..100 while the slider deliberately stops
// at 5 (and speed at 1), to match the ranges the exported effect's own
// controls use. Without this, opening such a project would show 5 where the
// document says 3 and write 5 back the moment the slider was touched —
// silently changing the user's value.
test('a stored value below the slider range widens that one slider instead of misreporting it', () => {
  const field = { path: 'brightness', type: 'number', labelKey: 'inspector.brightness', min: 5, max: 100, step: 1 };
  const widened = widenToInclude(field, 3);
  assert.equal(widened.min, 3);
  assert.equal(widened.max, 100);
  // Everything else about the field is untouched.
  assert.equal(widened.path, 'brightness');
  assert.equal(widened.step, 1);
});

test('a stored value above the slider range widens it upwards', () => {
  const field = { path: 'saturation', type: 'number', labelKey: 'inspector.saturation', min: 0, max: 200, step: 1 };
  assert.equal(widenToInclude(field, 260).max, 260);
});

test('a value already inside the range hands back the very same field object', () => {
  const field = { path: 'brightness', type: 'number', labelKey: 'inspector.brightness', min: 5, max: 100, step: 1 };
  assert.equal(widenToInclude(field, 40), field);
});

test('only sliders are widened, and only by a real number', () => {
  const select = { path: 'layers.0.fit', type: 'select', labelKey: 'inspector.fit', values: ['cover'] };
  assert.equal(widenToInclude(select, 3), select);
  const field = { path: 'brightness', type: 'number', labelKey: 'inspector.brightness', min: 5, max: 100, step: 1 };
  assert.equal(widenToInclude(field, undefined), field);
  assert.equal(widenToInclude(field, NaN), field);
});
