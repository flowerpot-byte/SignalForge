// SignalForge — build SignalRGB effects from images, gradients, shapes and particles.
// Copyright (C) 2026 Max Leopold Blumenschein
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { effectControls } from '../../src/export/effect-controls.js';
import { buildEffectHtml } from '../../src/export/build-effect.js';
import {
  normalizeDocument, MOTION_KINDS, IMAGE_MOTION_KINDS, GRADIENT_MOTION_KINDS,
  GRADIENT_SHAPES, FIT_MODES
} from '../../src/engine/document.js';
import { resolveBindingPath } from '../../src/engine/bind.js';
import { runJobs } from '../harness/render.js';
import { meanDifference, maxDifference, meanBrightness } from '../harness/pixels.js';

// 4x4 PNG: red / green / blue / white quadrants — the same picture the other
// export tests use. Four saturated, different colours are what makes a
// saturation or a colour-cast change impossible to miss.
const QUADRANTS = 'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAHklEQVR42mXJsQ0AAAgDIOr/P9fVRFZSkMI4QtE/C5t8BQM0UanVAAAAAElFTkSuQmCC';

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

test('the shared list is Motion, Speed, Strength, Fit, then the document-wide seven', () => {
  const controls = effectControls(docWith(), 'a1');
  assert.deepEqual(
    controls.map((control) => control.property),
    ['motion', 'tempo', 'strength', 'fit',
      'trail', 'hueShift', 'hueCycle',
      'brightness', 'saturation', 'greenMagenta', 'blueYellow']
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
  // A picture layer, so the Motion dropdown is the picture's own list — every
  // kind but spin, which a photograph cannot perform inside its own frame.
  assert.deepEqual(byProperty.motion.values, [...IMAGE_MOTION_KINDS]);
  assert.deepEqual(byProperty.fit.values, [...FIT_MODES]);
  assert.ok(IMAGE_MOTION_KINDS.every((kind) => MOTION_KINDS.includes(kind)),
    'the offer must be a subset of what the document accepts');
});

test('the colour controls span exactly what normalizeDocument accepts', () => {
  const byProperty = Object.fromEntries(effectControls(docWith(), 'a1').map((c) => [c.property, c]));
  for (const field of ['saturation', 'greenMagenta', 'blueYellow']) {
    const { min, max } = clampRange(field);
    assert.equal(byProperty[field].min, min, `${field} control min must match the engine's clamp`);
    assert.equal(byProperty[field].max, max, `${field} control max must match the engine's clamp`);
  }
});

test('the gradient controls span exactly what normalizeDocument accepts', () => {
  // The same rule as the colour controls above, for the two ranges that live
  // on a LAYER rather than on the document: discovered by asking
  // normalizeDocument what it keeps, never by copying CONTROL_RANGES' numbers
  // into this file. A widened engine clamp with a forgotten control range
  // fails right here.
  const clampLayerRange = (field) => ({
    min: normalizeDocument({ layers: [{ id: 'a1', type: 'gradient', [field]: -1e6 }] }).doc.layers[0][field],
    max: normalizeDocument({ layers: [{ id: 'a1', type: 'gradient', [field]: 1e6 }] }).doc.layers[0][field]
  });
  const controls = effectControls(docWith({}, { type: 'gradient' }), 'a1');
  const byProperty = Object.fromEntries(controls.map((c) => [c.property, c]));

  for (const field of ['angle', 'bands']) {
    const { min, max } = clampLayerRange(field);
    assert.equal(byProperty[field].min, min, `the ${field} control min must match the engine's clamp`);
    assert.equal(byProperty[field].max, max, `the ${field} control max must match the engine's clamp`);
  }

  // And the shape dropdown offers every shape the engine can draw, so a new
  // one cannot be added to the engine and left out of the finished effect.
  assert.deepEqual(byProperty.shape.values, [...GRADIENT_SHAPES]);
  // A gradient is the one layer type with structure at every angle, so it is
  // offered every motion there is.
  assert.deepEqual(byProperty.motion.values, [...GRADIENT_MOTION_KINDS]);
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

test('the three colour controls actually change the picture, they are not just listed', async () => {
  // A control that resolves on paper and moves nothing is the exact bug this
  // project has already shipped once (see the regression guard in
  // test/export/motion-control.test.js). These three are new to the exported
  // effect, so they get the same treatment: render the real thing, set the
  // control the way SignalRGB would, and require the pixels to move.
  const doc = normalizeDocument({
    name: 'ColourControls',
    assets: { q: { kind: 'image', mime: 'image/png', data: QUADRANTS } },
    // No motion, so any difference between the frames can only come from the
    // control that was set, not from where the animation happened to be.
    layers: [{ id: 'a1', type: 'image', asset: 'q', fit: 'cover', motions: [{ kind: 'none' }] }]
  }).doc;
  const engineSource = readFileSync(new URL('../../dist/engine.bundle.js', import.meta.url), 'utf8');
  const dir = mkdtempSync(join(tmpdir(), 'signalforge-colour-controls-'));
  const file = join(dir, 'effect.html');
  writeFileSync(file, buildEffectHtml({
    doc: { ...doc, controls: effectControls(doc, 'a1') }, engineSource, lang: 'en'
  }), 'utf8');

  try {
    const [untouched, grey, magenta, yellow] = await runJobs([
      { name: 'untouched', kind: 'html', file, settleMs: 400 },
      { name: 'saturation-0', kind: 'html', file, settleMs: 400, setGlobals: { saturation: 0 }, afterSetGlobalsMs: 100 },
      { name: 'green-magenta', kind: 'html', file, settleMs: 400, setGlobals: { greenMagenta: 100 }, afterSetGlobalsMs: 100 },
      { name: 'blue-yellow', kind: 'html', file, settleMs: 400, setGlobals: { blueYellow: -100 }, afterSetGlobalsMs: 100 }
    ]);

    assert.ok(meanBrightness(untouched.pixels) > 5, 'the untouched export is blank');
    for (const [name, result] of [['saturation', grey], ['greenMagenta', magenta], ['blueYellow', yellow]]) {
      assert.ok(
        maxDifference(untouched.pixels, result.pixels) > 0,
        `setting the ${name} control had no visible effect — it exists on paper but not in effect`
      );
      assert.ok(
        meanDifference(untouched.pixels, result.pixels) > 1,
        `expected a clearly visible change from ${name}, mean difference was only `
          + `${meanDifference(untouched.pixels, result.pixels)}`
      );
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a document with no image layer still gets the document-wide controls', () => {
  const doc = normalizeDocument({ name: 'Empty' }).doc;
  assert.deepEqual(
    effectControls(doc, 'a1').map((c) => c.property),
    ['trail', 'hueShift', 'hueCycle', 'brightness', 'saturation', 'greenMagenta', 'blueYellow']
  );
});

/**
 * The three new controls, set the way SignalRGB sets one, on the real exported
 * file.
 *
 * The same treatment the colour controls got above and for the same reason: a
 * control that appears in the panel and moves no pixel is a control that
 * exists on paper only. Both of these reach the frame through a document field
 * rather than through a layer, which is a path nothing else in this file
 * exercises — `hueShift` lands in the shared pixel pass, `trail` in the choice
 * between clearing the frame and veiling it.
 *
 * The trail is driven with `restart` and an explicit sequence, because a wake
 * is the one thing here that is not a function of a single frame: what it
 * looks like depends on the frames before it, so the frames before it have to
 * be the same on both runs (see runSequenceFromFrameZero in
 * test/harness/electron-main.cjs).
 */
test('the hue and the trail controls reach the exported effect\'s own frame', async () => {
  const doc = normalizeDocument({
    name: 'DocumentControls',
    // Half transparent so a wake can be seen at all: the veil goes UNDER the
    // frame being drawn, so an opaque layer covering the whole canvas hides
    // its own trail (see the note in test/export/parity.test.js).
    layers: [{
      id: 'a1', type: 'gradient', shape: 'stripes', bands: 5, angle: 20, opacity: 0.5,
      stops: [{ at: 0, color: '#ff0066' }, { at: 100, color: '#00b3ff' }],
      motions: [{ kind: 'drift', speed: 50, amount: 80 }]
    }]
  }).doc;
  const engineSource = readFileSync(new URL('../../dist/engine.bundle.js', import.meta.url), 'utf8');
  const dir = mkdtempSync(join(tmpdir(), 'signalforge-document-controls-'));
  const file = join(dir, 'effect.html');
  writeFileSync(file, buildEffectHtml({
    doc: { ...doc, controls: effectControls(doc, 'a1') }, engineSource, lang: 'en'
  }), 'utf8');

  const stamps = Array.from({ length: 25 }, (unused, i) => 1000 + i * 40);

  try {
    const [plain, turned, cycling, wake] = await runJobs([
      { name: 'plain', kind: 'html', file, stamps, restart: true, settleMs: 0 },
      {
        name: 'turned', kind: 'html', file, stamps, restart: true, settleMs: 0,
        setGlobals: { hueShift: 120 }
      },
      {
        name: 'cycling', kind: 'html', file, stamps, restart: true, settleMs: 0,
        setGlobals: { hueCycle: 70 }
      },
      {
        name: 'wake', kind: 'html', file, stamps, restart: true, settleMs: 0,
        setGlobals: { trail: 90 }
      }
    ]);

    assert.ok(meanBrightness(plain.pixels) > 5, 'the untouched export is blank');
    for (const [name, result] of [['hueShift', turned], ['hueCycle', cycling], ['trail', wake]]) {
      assert.ok(
        maxDifference(plain.pixels, result.pixels) > 0,
        `setting the ${name} control had no visible effect — it exists on paper but not in effect`
      );
      assert.ok(
        meanDifference(plain.pixels, result.pixels) > 1,
        `expected a clearly visible change from ${name}, mean difference was only `
          + `${meanDifference(plain.pixels, result.pixels)}`
      );
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
