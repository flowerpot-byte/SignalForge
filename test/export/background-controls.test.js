// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max Leopold Blumenschein
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { effectControls, withLiveMotion, CONTROL_RANGES } from '../../src/export/effect-controls.js';
import {
  normalizeDocument, motionKindsFor, GRADIENT_SHAPES
} from '../../src/engine/document.js';
import { foregroundOf, backgroundOf, BACKGROUND_KINDS } from '../../src/engine/slots.js';
import { resolveBindingPath } from '../../src/engine/bind.js';

const ASCII_PRINTABLE = /^[\x20-\x7E]*$/;

/**
 * What an exported effect offers for the layer underneath — and, above all,
 * that nothing it offers collides with what the foreground already offers.
 *
 * SignalRGB's panel is one flat run of controls with no headings, and every
 * control's `property` becomes a page global the bootstrap reads by name (see
 * src/export/build-effect.js). Two controls sharing a name is therefore not a
 * cosmetic problem: the second `<meta>` decides what the one global holds, and
 * one of the two sliders silently steers the other one's field.
 */

/** The two slots, prepared exactly as src/main/export-effect.js prepares them. */
function controlsFor(layers) {
  const normalized = normalizeDocument({ layers }).doc;
  const layerId = foregroundOf(normalized.layers).id;
  const backgroundId = backgroundOf(normalized.layers)?.id ?? null;
  let prepared = withLiveMotion(normalized, layerId);
  if (backgroundId) prepared = withLiveMotion(prepared, backgroundId);
  return { doc: prepared, controls: effectControls(prepared, layerId, backgroundId) };
}

const propertiesOf = (layers) => controlsFor(layers).controls.map((control) => control.property);

const RAIN = { id: 'front', type: 'particles', pattern: 'rain' };
// `aspect` is in this list because every document in this file carries a
// particle layer — the control exists exactly when something round is drawn
// (see the aspect note in src/export/effect-controls.js).
const DOCUMENT_WIDE = [
  'trail', 'hueShift', 'hueCycle', 'aspect',
  'brightness', 'saturation', 'greenMagenta', 'blueYellow'
];

test('a document with no background offers exactly what it always did', () => {
  const properties = propertiesOf([RAIN]);
  assert.equal(properties.some((name) => name.startsWith('bg')), false,
    'nothing about a background may appear when there is none');
  assert.deepEqual(properties.slice(-DOCUMENT_WIDE.length), DOCUMENT_WIDE);
});

test('a gradient background comes out after the foreground and before the grade', () => {
  const properties = propertiesOf([{ id: 'behind', type: 'gradient' }, RAIN]);
  assert.deepEqual(properties, [
    // the swarm
    'color1', 'color2', 'pattern', 'particleCount', 'particleSize', 'tilt', 'travelSpeed', 'seed',
    'motion', 'tempo', 'strength',
    // what is behind it, in one block of its own
    'bgColor1', 'bgColor2', 'bgShape', 'bgAngle', 'bgBands', 'bgMotion', 'bgTempo', 'bgStrength',
    // and the grade over both
    ...DOCUMENT_WIDE
  ]);
});

test('a flat colour behind offers one colour and its two motions', () => {
  const properties = propertiesOf([{ id: 'behind', type: 'solid' }, RAIN]);
  const background = properties.filter((name) => name.startsWith('bg'));
  assert.deepEqual(background, ['bgColor', 'bgMotion', 'bgTempo', 'bgStrength']);
});

test('no two controls ever share a property, for any background at all', () => {
  // Every kind a background may be, under every foreground that can carry one,
  // and every gradient shape either of them may take: the collision this guards
  // against is a pair of names, so it has to be looked for across the pairs
  // that can actually occur.
  const foregrounds = [
    RAIN,
    { id: 'front', type: 'shape', figure: 'star' },
    { id: 'front', type: 'image', asset: 'q', fit: 'contain' }
  ];
  const backgrounds = [
    ...BACKGROUND_KINDS.filter((kind) => kind !== 'none').map((type) => ({ id: 'behind', type })),
    ...GRADIENT_SHAPES.map((shape) => ({ id: 'behind', type: 'gradient', shape }))
  ];
  let checked = 0;
  for (const front of foregrounds) {
    for (const behind of backgrounds) {
      const properties = propertiesOf([behind, front]);
      assert.equal(new Set(properties).size, properties.length,
        `${front.type} over ${behind.type}/${behind.shape ?? '-'} repeats a property: `
        + properties.filter((name, at) => properties.indexOf(name) !== at).join(', '));
      checked += 1;
    }
  }
  assert.ok(checked >= 21, `only ${checked} combinations were tried`);
});

test('every background control writes somewhere the document really has', () => {
  const { doc, controls } = controlsFor([{ id: 'behind', type: 'gradient' }, RAIN]);
  for (const control of controls) {
    for (const binding of control.bind) {
      assert.ok(resolveBindingPath(doc, binding), `${control.property} binds nowhere: ${binding}`);
    }
  }
  // And the background's really do reach the background, rather than resolving
  // to the layer the foreground's controls already own.
  for (const control of controls.filter((entry) => entry.property.startsWith('bg'))) {
    assert.ok(control.bind[0].startsWith('behind.'),
      `${control.property} binds to ${control.bind[0]}, which is not the layer underneath`);
  }
});

test('every background label is ASCII, in both languages', () => {
  const { controls } = controlsFor([{ id: 'behind', type: 'gradient' }, RAIN]);
  for (const control of controls.filter((entry) => entry.property.startsWith('bg'))) {
    for (const lang of ['de', 'en']) {
      assert.ok(ASCII_PRINTABLE.test(control.label[lang]),
        `${control.property} (${lang}) is not ASCII: ${control.label[lang]}`);
      assert.ok(/background|hintergrund/i.test(control.label[lang]),
        `${control.property} (${lang}) does not say which layer it steers: ${control.label[lang]}`);
    }
  }
});

test('the background sliders offer the ranges their own entries name', () => {
  const { controls } = controlsFor([
    { id: 'behind', type: 'gradient', shape: 'stripes' }, RAIN
  ]);
  for (const property of ['bgAngle', 'bgBands', 'bgTempo', 'bgStrength']) {
    const control = controls.find((entry) => entry.property === property);
    assert.ok(control, `${property} is not offered`);
    assert.equal(control.min, CONTROL_RANGES[property].min);
    assert.equal(control.max, CONTROL_RANGES[property].max);
  }
});

test('the background motion dropdown offers what that layer type can perform', () => {
  for (const type of ['solid', 'gradient']) {
    const { controls } = controlsFor([{ id: 'behind', type }, RAIN]);
    const dropdown = controls.find((entry) => entry.property === 'bgMotion');
    assert.deepEqual(dropdown.values, [...motionKindsFor(type)],
      `a ${type} background is offered the wrong motions`);
  }
});

test('the shape dropdown behind is the whole list, and its default is the document\'s', () => {
  const { controls } = controlsFor([{ id: 'behind', type: 'gradient', shape: 'waves' }, RAIN]);
  const dropdown = controls.find((entry) => entry.property === 'bgShape');
  assert.deepEqual(dropdown.values, [...GRADIENT_SHAPES]);
  assert.equal(dropdown.default, 'waves');
});

test('every default comes out of the document rather than out of this file', () => {
  const layers = [
    {
      id: 'behind',
      type: 'gradient',
      shape: 'conic',
      angle: 210,
      bands: 9,
      stops: [{ at: 0, color: '#123456' }, { at: 100, color: '#abcdef' }],
      motions: [{ kind: 'spin', speed: 44, amount: 77 }]
    },
    RAIN
  ];
  const { controls } = controlsFor(layers);
  const value = (property) => controls.find((entry) => entry.property === property).default;
  assert.equal(value('bgAngle'), 210);
  assert.equal(value('bgBands'), 9);
  assert.equal(value('bgColor1'), '#123456');
  assert.equal(value('bgColor2'), '#abcdef');
  assert.equal(value('bgMotion'), 'spin');
  assert.equal(value('bgTempo'), 44);
  assert.equal(value('bgStrength'), 77);
});

test('a background with no motion still gets three live motion controls', () => {
  // withLiveMotion has to be run for the second slot as well, or the three
  // sliders would have nowhere to write and would do nothing at all — see the
  // note on it in src/export/effect-controls.js.
  const { doc, controls } = controlsFor([{ id: 'behind', type: 'solid', motions: [] }, RAIN]);
  assert.deepEqual(doc.layers[0].motions, [{ kind: 'none', speed: 15, amount: 30 }]);
  const dropdown = controls.find((entry) => entry.property === 'bgMotion');
  assert.equal(dropdown.default, 'none');
  assert.ok(resolveBindingPath(doc, dropdown.bind[0]), 'and it has somewhere to write');
});

test('a layer type that cannot be a background gets no controls of its own', () => {
  // A hand-edited document may put anything underneath and the engine will
  // draw it — but a first layer that is no background KIND is not a
  // background at all any more, it is the bottom of the stack (backgroundOf
  // carries the kind gate since the stack arithmetic landed; the earlier
  // reading dressed this heart in bgMotion/bgTempo/bgStrength knobs bound to
  // a layer the engine never treated as a background).
  const properties = propertiesOf([{ id: 'behind', type: 'shape', figure: 'heart' }, RAIN]);
  assert.deepEqual(properties.filter((name) => name.startsWith('bg')), [],
    'no background, no background knobs — the heart is stack, not slot');
  assert.deepEqual(properties.slice(-DOCUMENT_WIDE.length), DOCUMENT_WIDE);
});
