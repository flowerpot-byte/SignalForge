// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { effectControls } from '../../src/export/effect-controls.js';
import { normalizeDocument, MOTION_KINDS, FIT_MODES } from '../../src/engine/document.js';
import { resolveBindingPath } from '../../src/engine/bind.js';

const ASCII_PRINTABLE = /^[\x20-\x7E]*$/;

function docWith(overrides = {}, layer = {}) {
  return normalizeDocument({
    name: 'Controls',
    layers: [{
      id: 'a1',
      type: 'image',
      asset: 'picture',
      fit: 'cover',
      motions: [{ kind: 'warp', speed: 15, amount: 30 }],
      ...layer
    }],
    assets: { picture: { kind: 'image', mime: 'image/png', data: 'x' } },
    ...overrides
  }).doc;
}

/**
 * What normalizeDocument actually clamps a document field to, discovered by
 * asking it rather than by copying its numbers here. A control whose range is
 * wider than this offers values the engine silently throws away; one that is
 * narrower hides values the document can legitimately carry.
 */
function clampRange(field) {
  return {
    min: normalizeDocument({ [field]: -1e6 }).doc[field],
    max: normalizeDocument({ [field]: 1e6 }).doc[field]
  };
}

test('the shared list is Motion, Speed, Strength, Fit, Brightness plus the three colour fields', () => {
  const controls = effectControls(docWith(), 'a1');
  assert.deepEqual(
    controls.map((control) => control.property),
    ['motion', 'tempo', 'strength', 'fit', 'brightness', 'saturation', 'greenMagenta', 'blueYellow']
  );
});

test('every label is ASCII only, in both languages', () => {
  for (const control of effectControls(docWith(), 'a1')) {
    for (const lang of ['de', 'en']) {
      assert.ok(
        ASCII_PRINTABLE.test(control.label[lang]),
        `${control.property}: ${lang} label "${control.label[lang]}" is not ASCII — `
          + 'src/export/build-effect.js refuses to build with it'
      );
    }
  }
});

test('every binding resolves against the document, so no control is dead on arrival', () => {
  const doc = docWith();
  for (const control of effectControls(doc, 'a1')) {
    assert.ok(control.bind.length > 0, `${control.property} binds to nothing`);
    for (const binding of control.bind) {
      assert.notEqual(
        resolveBindingPath(doc, binding),
        null,
        `${control.property}: binding "${binding}" resolves to nothing — the control would be a dead slider`
      );
    }
  }
});

test('the comboboxes offer exactly the engine\'s own value lists', () => {
  const byProperty = Object.fromEntries(effectControls(docWith(), 'a1').map((c) => [c.property, c]));
  assert.deepEqual(byProperty.motion.values, [...MOTION_KINDS]);
  assert.deepEqual(byProperty.fit.values, [...FIT_MODES]);
});

test('the colour controls span exactly what normalizeDocument accepts', () => {
  const byProperty = Object.fromEntries(effectControls(docWith(), 'a1').map((c) => [c.property, c]));
  for (const field of ['saturation', 'greenMagenta', 'blueYellow']) {
    const { min, max } = clampRange(field);
    assert.equal(byProperty[field].min, min, `${field} control min must match the engine's clamp`);
    assert.equal(byProperty[field].max, max, `${field} control max must match the engine's clamp`);
  }
});

test('the defaults are the document\'s own values, not fixed numbers', () => {
  const doc = docWith(
    { brightness: 42, saturation: 133, greenMagenta: -20, blueYellow: 15 },
    { fit: 'contain', motions: [{ kind: 'drift', speed: 7, amount: 66 }] }
  );
  const byProperty = Object.fromEntries(effectControls(doc, 'a1').map((c) => [c.property, c]));
  assert.equal(byProperty.motion.default, 'drift');
  assert.equal(byProperty.tempo.default, 7);
  assert.equal(byProperty.strength.default, 66);
  assert.equal(byProperty.fit.default, 'contain');
  assert.equal(byProperty.brightness.default, 42);
  assert.equal(byProperty.saturation.default, 133);
  assert.equal(byProperty.greenMagenta.default, -20);
  assert.equal(byProperty.blueYellow.default, 15);
});

test('a stored value the usual range cannot reach widens the range instead of being clamped away', () => {
  // brightness stops at 5 on purpose, but a document may legitimately carry
  // less (see widenToInclude in app/renderer/components/inspector.js). The
  // exported effect must show what the preview showed, so the range gives
  // way, never the value.
  const doc = docWith({ brightness: 3 });
  const brightness = effectControls(doc, 'a1').find((c) => c.property === 'brightness');
  assert.equal(brightness.default, 3);
  assert.ok(brightness.min <= 3, `min ${brightness.min} cannot reach the stored value 3`);
});

test('a layer with no motion still gets live motion controls, bound to a real entry', () => {
  // setByPath refuses to create a missing branch (src/engine/bind.js), so a
  // motions list with no entry would leave three silently dead sliders.
  const doc = docWith({}, { motions: [] });
  const prepared = normalizeDocument({
    ...doc,
    layers: [{ ...doc.layers[0], motions: [{ kind: 'none' }] }]
  }).doc;
  const controls = effectControls(prepared, 'a1');
  const motion = controls.find((c) => c.property === 'motion');
  assert.equal(motion.default, 'none');
  assert.notEqual(resolveBindingPath(prepared, motion.bind[0]), null);
});

test('a document with no image layer still gets the document-wide controls', () => {
  const doc = normalizeDocument({ name: 'Empty' }).doc;
  assert.deepEqual(
    effectControls(doc, 'a1').map((c) => c.property),
    ['brightness', 'saturation', 'greenMagenta', 'blueYellow']
  );
});
