// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max Leopold Blumenschein
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDocument, MIN_ASPECT, MAX_ASPECT } from '../../src/engine/document.js';
import { effectControls, CONTROL_RANGES } from '../../src/export/effect-controls.js';

/**
 * The exported "Aspect Fix" control.
 *
 * It exists exactly when it can do something: the aspect field is read by the
 * two layer types that draw round things (shape, particles) and by nothing
 * else, so a document with neither would export a slider that provably cannot
 * change a byte — the exact fault motionKindsFor exists to prevent, one
 * control up.
 */

function docWith(layers, extra = {}) {
  return normalizeDocument({
    name: 'Aspect control',
    layers,
    controls: [],
    ...extra
  }).doc;
}

const aspectControl = (controls) => controls.find((control) => control.property === 'aspect');

test('a figure document exports the aspect control, bound to the document field', () => {
  const doc = docWith([{ id: 'fig', type: 'shape', figure: 'circle' }], { aspect: 154 });
  const control = aspectControl(effectControls(doc, 'fig'));
  assert.ok(control, 'a shape document should offer the aspect control');
  assert.equal(control.type, 'number');
  assert.equal(control.default, 154);
  assert.deepEqual(control.bind, ['aspect']);
  assert.equal(control.min, MIN_ASPECT);
  assert.equal(control.max, MAX_ASPECT);
});

test('a particle document exports it too, wherever the swarm sits', () => {
  const doc = docWith([
    { id: 'bg', type: 'gradient' },
    { id: 'p', type: 'particles' }
  ]);
  const control = aspectControl(effectControls(doc, 'p', 'bg'));
  assert.ok(control, 'a particles document should offer the aspect control');
  assert.equal(control.default, 100);
});

test('a document with nothing round to keep round does not offer it', () => {
  const solid = docWith([{ id: 's', type: 'solid' }]);
  assert.equal(aspectControl(effectControls(solid, 's')), undefined,
    'a solid alone gains nothing from aspect');

  const gradient = docWith([{ id: 'g', type: 'gradient' }]);
  assert.equal(aspectControl(effectControls(gradient, 'g')), undefined,
    'a gradient alone gains nothing from aspect');
});

test('the range table carries aspect inside what the engine accepts', () => {
  const { doc } = normalizeDocument({ aspect: -10000 });
  assert.equal(doc.aspect, MIN_ASPECT);
  const { doc: high } = normalizeDocument({ aspect: 10000 });
  assert.equal(high.aspect, MAX_ASPECT);
  assert.equal(CONTROL_RANGES.aspect.min, MIN_ASPECT);
  assert.equal(CONTROL_RANGES.aspect.max, MAX_ASPECT);
});
