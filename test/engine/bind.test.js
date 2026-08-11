// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getByPath, setByPath, resolveLayerPath, resolveBindingPath, applyControls, resolveChoice
} from '../../src/engine/bind.js';
import { BINDABLE_DOCUMENT_FIELDS, MOTION_KINDS } from '../../src/engine/document.js';

const base = () => ({
  brightness: 100,
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

// ---------------------------------------------------------------------------
// Combobox values, whatever shape the host hands them over in
// ---------------------------------------------------------------------------
//
// WHY THIS EXISTS. An exported effect's control values come from SignalRGB,
// which writes them into page globals (`var motion = "warp";`, seen verbatim
// in SignalRgb.exe's own injection template). They used to be copied into the
// document exactly as received, and the renderer decides what moves with a
// strict string match — `motions.find((m) => m.kind === 'warp')` in
// layers/gradient.js and layers/image.js. So a value that is not letter-for-
// letter one of the declared options does not fall back to anything: it
// matches nothing, every motion lookup comes back null, and the effect draws a
// perfect, completely still picture. That is precisely the bug report this
// file's guards were written for — "the picture shows, the motions do not
// run" — and it is silent: nothing throws, nothing is logged, the frame looks
// right.
//
// The rule now: a combobox value ALWAYS lands on one of its declared options.

const comboDoc = () => ({
  layers: [{ id: 'a1', type: 'image', opacity: 1, motions: [{ kind: 'warp', speed: 15, amount: 30 }] }],
  controls: [
    { property: 'motion', type: 'combobox', values: [...MOTION_KINDS], default: 'warp',
      bind: ['a1.motions.0.kind'] }
  ]
});

test('resolveChoice takes the declared option unchanged', () => {
  assert.equal(resolveChoice('warp', ['none', 'warp', 'drift'], 'none'), 'warp');
});

test('resolveChoice accepts an index, as a number or as digits', () => {
  assert.equal(resolveChoice(1, ['none', 'warp', 'drift'], 'none'), 'warp');
  assert.equal(resolveChoice('2', ['none', 'warp', 'drift'], 'none'), 'drift');
});

test('resolveChoice forgives case and surrounding space', () => {
  assert.equal(resolveChoice(' Warp ', ['none', 'warp', 'drift'], 'none'), 'warp');
});

test('resolveChoice falls back to the default rather than inventing a value', () => {
  assert.equal(resolveChoice('nonsense', ['none', 'warp', 'drift'], 'warp'), 'warp');
  assert.equal(resolveChoice(null, ['none', 'warp', 'drift'], 'warp'), 'warp');
  assert.equal(resolveChoice(undefined, ['none', 'warp', 'drift'], 'warp'), 'warp');
  // A default that is itself not on the list cannot be handed back either.
  assert.equal(resolveChoice('nonsense', ['none', 'warp'], 'ghost'), 'none');
});

test('a combobox value the host delivers as an index still selects a real motion', () => {
  const doc = applyControls(comboDoc(), { motion: 1 });
  assert.equal(doc.layers[0].motions[0].kind, MOTION_KINDS[1]);
  assert.ok(MOTION_KINDS.includes(doc.layers[0].motions[0].kind));
});

test('a combobox value the host delivers as junk never switches the motion off silently', () => {
  for (const junk of ['', 'Warp', ' warp', 'wobble', 3.5, {}, []]) {
    const doc = applyControls(comboDoc(), { motion: junk });
    assert.ok(MOTION_KINDS.includes(doc.layers[0].motions[0].kind),
      `a "${String(junk)}" motion value left kind = ${JSON.stringify(doc.layers[0].motions[0].kind)}, `
      + 'which matches no motion at all and would freeze the effect');
  }
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

test('resolveBindingPath resolves a bare name (no dot) straight onto the document', () => {
  assert.equal(resolveBindingPath(base(), 'brightness'), 'brightness');
});

test('resolveBindingPath still delegates a dotted binding to resolveLayerPath', () => {
  const doc = base();
  assert.equal(resolveBindingPath(doc, 'b2.motion.speed'), resolveLayerPath(doc, 'b2.motion.speed'));
  assert.equal(resolveBindingPath(doc, 'ghost.motion.speed'), null);
});

test('a document-level bind writes straight onto the document, not into a layer', () => {
  const input = base();
  input.controls.push({ property: 'brightness', type: 'number', default: 100, bind: ['brightness'] });
  const doc = applyControls(input, { brightness: 42 });
  assert.equal(doc.brightness, 42);
});

test('a document-level bind leaves the original document untouched', () => {
  const original = base();
  original.controls.push({ property: 'brightness', type: 'number', default: 100, bind: ['brightness'] });
  applyControls(original, { brightness: 42 });
  assert.equal(original.brightness, 100);
});

test('a document-level bind for a field that does not exist on the document is ignored, not thrown', () => {
  const input = base();
  input.controls.push({ property: 'ghostField', type: 'number', default: 1, bind: ['thisFieldDoesNotExist'] });
  assert.doesNotThrow(() => applyControls(input, { ghostField: 5 }));
  const doc = applyControls(input, { ghostField: 5 });
  assert.equal(Object.hasOwn(doc, 'thisFieldDoesNotExist'), false);
});

test('a document-level bind refuses a __proto__ binding and leaves Object.prototype untouched', () => {
  const originalToString = Object.prototype.toString;
  const input = base();
  input.controls.push({ property: 'evil', type: 'number', default: 1, bind: ['__proto__'] });
  applyControls(input, { evil: 1 });
  assert.equal(Object.prototype.toString, originalToString);
  assert.equal(({}).toString(), '[object Object]');
});

test('applyControls writes a combobox string through to motion.kind untouched', () => {
  const input = base();
  input.controls.push({ property: 'motion', type: 'combobox', values: ['none', 'warp', 'drift', 'breathe'],
    default: 'warp', bind: ['a1.motion.kind'] });
  const doc = applyControls(input, { motion: 'drift' });
  assert.equal(doc.layers[0].motion.kind, 'drift');
  assert.equal(typeof doc.layers[0].motion.kind, 'string');
});

test('applyControls writes a combobox string through to fit untouched', () => {
  const input = base();
  input.layers[0].fit = 'cover';
  input.controls.push({ property: 'fit', type: 'combobox', values: ['cover', 'stretch', 'contain'],
    default: 'cover', bind: ['a1.fit'] });
  const doc = applyControls(input, { fit: 'stretch' });
  assert.equal(doc.layers[0].fit, 'stretch');
});

test('a combobox control with no value supplied falls back to its own default, not the number coercion path', () => {
  // control.type !== 'number', so `Number(raw)` is never applied and the
  // NaN-guard (`type === 'number' && !Number.isFinite(value)`) never fires
  // for a combobox -- confirm the fallback-to-default path alone accounts
  // for a missing value, the same as it does for a number control.
  const input = base();
  input.controls.push({ property: 'motion', type: 'combobox', values: ['none', 'warp'],
    default: 'warp', bind: ['a1.motion.kind'] });
  const doc = applyControls(input, {});
  assert.equal(doc.layers[0].motion.kind, 'warp');
});

test('applyControls resolves a combobox value that is not on the control\'s own values list '
  + 'onto one that is, instead of writing it through', () => {
  // THIS TEST USED TO ASSERT THE OPPOSITE, and the reasoning it gave was
  // correct as far as it went: applyControls has no opinion on values,
  // normalizeDocument does, and normalizeDocument only ever runs once, on the
  // document loaded at startup — never on the per-frame document produced
  // here. What the old reasoning missed is what "written through exactly as
  // handed over" costs downstream. The renderer picks its motions by strict
  // equality on `kind`, so a value that is on no list matches no motion, and
  // the effect renders a flawless STILL picture with nothing to indicate why.
  // Since nothing else in the chain ever validates it, this IS the last place
  // that can, so it does. See resolveChoice in src/engine/bind.js.
  const input = base();
  input.controls.push({ property: 'motion', type: 'combobox', values: ['none', 'warp'],
    default: 'warp', bind: ['a1.motion.kind'] });
  const doc = applyControls(input, { motion: 'not-a-real-motion-kind' });
  assert.equal(doc.layers[0].motion.kind, 'warp');
});

test('a control can mix a layer binding and a document binding side by side', () => {
  const input = base();
  input.controls.push({ property: 'brightness', type: 'number', default: 100, bind: ['brightness'] });
  const doc = applyControls(input, { tempo: 77, brightness: 33 });
  assert.equal(doc.layers[0].motion.speed, 77);
  assert.equal(doc.layers[1].motion.speed, 77);
  assert.equal(doc.brightness, 33);
});

// --- Finding 1: document-level bindings are gated by an explicit allowlist ---
// (BINDABLE_DOCUMENT_FIELDS in document.js), not by "is this an own
// property" the way a first attempt at this feature briefly allowed. A bare
// binding to a real, own-property top-level field like `layers`, `controls`,
// `assets` or `version` must still be ignored unless it is on that list. Use
// a fixture that actually has all four as own properties, so this exercises
// the allowlist gate rather than incidentally passing because the field is
// missing.

// Deliberately no pre-existing controls here (unlike base()): the point of
// this fixture is to isolate what ONE pushed "evil" control's binding does.
// If this reused base()'s `tempo`/`fade` controls, their own legitimate
// layer bindings would fall back to their defaults on every applyControls
// call below (since no value is supplied for them) and change `layers`
// for reasons that have nothing to do with the allowlist being tested.
const fullDoc = () => ({
  brightness: 100,
  layers: [
    { id: 'a1', type: 'image', opacity: 1, motion: { kind: 'warp', speed: 15, amount: 30 } },
    { id: 'b2', type: 'image', opacity: 1, motion: { kind: 'warp', speed: 15, amount: 30 } }
  ],
  controls: [],
  version: 1,
  assets: { thumb: { kind: 'image', mime: 'image/png', data: 'x' } }
});

test('brightness is on the document-bind allowlist', () => {
  assert.ok(BINDABLE_DOCUMENT_FIELDS.includes('brightness'));
});

for (const field of ['layers', 'controls', 'assets', 'version']) {
  test(`resolveBindingPath refuses an unlisted bare binding to the real own-property field "${field}"`, () => {
    const doc = fullDoc();
    assert.equal(Object.hasOwn(doc, field), true);
    assert.equal(BINDABLE_DOCUMENT_FIELDS.includes(field), false);
    assert.equal(resolveBindingPath(doc, field), null);
  });

  test(`applyControls ignores an unlisted bare binding and never overwrites "${field}"`, () => {
    const input = fullDoc();
    // Snapshot by value, not by reference: `controls` in particular is
    // about to have a control pushed onto it, and applyControls only
    // shallow-copies the document, so comparing against a live reference
    // to the same array would trivially "pass" no matter what happened.
    const before = structuredClone(input[field]);
    input.controls.push({ property: 'evil', type: 'number', default: 1, bind: [field] });
    const doc = applyControls(input, { evil: 12345 });
    assert.notEqual(doc[field], 12345);
    if (field === 'controls') {
      // `before` predates the pushed control, so compare everything else.
      assert.deepEqual(doc.controls.slice(0, before.length), before);
    } else {
      assert.deepEqual(doc[field], before);
    }
  });
}

test('resolveBindingPath rejects a bare "__proto__" binding via the allowlist, not just setByPath', () => {
  assert.equal(resolveBindingPath(base(), '__proto__'), null);
});

test('resolveBindingPath rejects a bare "constructor" binding via the allowlist', () => {
  assert.equal(resolveBindingPath(base(), 'constructor'), null);
});

test('resolveBindingPath rejects a bare "prototype" binding via the allowlist', () => {
  assert.equal(resolveBindingPath(base(), 'prototype'), null);
});

test('a document-level bind to "constructor" is ignored and leaves Object.prototype untouched', () => {
  const originalToString = Object.prototype.toString;
  const input = base();
  input.controls.push({ property: 'evil', type: 'number', default: 1, bind: ['constructor'] });
  applyControls(input, { evil: 1 });
  assert.equal(Object.prototype.toString, originalToString);
  assert.equal(({}).toString(), '[object Object]');
});
