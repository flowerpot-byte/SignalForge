// SignalForge — build SignalRGB effects from images, gradients, shapes and particles.
// Copyright (C) 2026 Max Leopold Blumenschein
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDocument } from '../../src/engine/document.js';
import { effectControls } from '../../src/export/effect-controls.js';
import { resolveBindingPath } from '../../src/engine/bind.js';

/**
 * The exported colour-cycle controls: the two layer types that carry a cycle
 * offer its colours and its tempo, everything else is untouched, and every
 * knob binds somewhere the document really has.
 */

function docWith(layers) {
  return normalizeDocument({ name: 'Cycle controls', layers, controls: [] }).doc;
}

test('a solid offers its cycle colours and the tempo, bound to the layer', () => {
  const doc = docWith([{
    id: 's', type: 'solid',
    stops: [{ at: 0, color: '#ff0000' }, { at: 100, color: '#0000ff' }],
    cycleSpeed: 40
  }]);
  const controls = effectControls(doc, 's');
  const names = controls.map((control) => control.property);

  assert.ok(names.includes('cycleColor1') && names.includes('cycleColor2'),
    `cycle colours missing: ${names.join(', ')}`);
  const tempo = controls.find((control) => control.property === 'cycleTempo');
  assert.ok(tempo, 'the tempo is the on switch and must be there');
  assert.equal(tempo.default, 40);
  assert.deepEqual(tempo.bind, ['s.cycleSpeed']);

  const first = controls.find((control) => control.property === 'cycleColor1');
  assert.equal(first.default, '#ff0000');
  assert.deepEqual(first.bind, ['s.stops.0.color']);

  for (const control of controls) {
    for (const binding of control.bind) {
      assert.ok(resolveBindingPath(doc, binding),
        `${control.property} binds nowhere: ${binding}`);
    }
  }
});

test('a figure offers them too, right after its resting colour', () => {
  const doc = docWith([{ id: 'f', type: 'shape', figure: 'star', cycleSpeed: 40 }]);
  const names = effectControls(doc, 'f').map((control) => control.property);
  const colourAt = names.indexOf('color');
  const cycleAt = names.indexOf('cycleColor1');
  const tempoAt = names.indexOf('cycleTempo');
  const figureAt = names.indexOf('figure');
  assert.ok(colourAt !== -1 && cycleAt !== -1 && tempoAt !== -1, names.join(', '));
  assert.ok(colourAt < cycleAt && cycleAt < tempoAt && tempoAt < figureAt,
    `the cycle sits between the colour and the figure: ${names.join(', ')}`);
});

test('a standing cycle offers its tempo and NOT its colours', () => {
  // Where the report of 12.08.2026 landed. cyclePaint returns the resting
  // colour while the tempo is 0 and never reads the palette, so palette knobs
  // in the panel could not move a single pixel — indistinguishable, from the
  // outside, from knobs that are broken. The tempo stays: it is the on switch,
  // and it works.
  const doc = docWith([{ id: 'f', type: 'shape', figure: 'star', cycleSpeed: 0 }]);
  const names = effectControls(doc, 'f').map((control) => control.property);
  assert.ok(names.includes('cycleTempo'), `the on switch must stay: ${names.join(', ')}`);
  assert.deepEqual(names.filter((name) => name.startsWith('cycleColor')), [],
    `a standing cycle must offer no palette: ${names.join(', ')}`);
});

test('a gradient and a swarm are untouched — their stops already have names', () => {
  for (const layer of [
    { id: 'g', type: 'gradient' },
    { id: 'p', type: 'particles' }
  ]) {
    const names = effectControls(docWith([layer]), layer.id).map((control) => control.property);
    assert.ok(!names.some((name) => name.startsWith('cycle')),
      `${layer.type} must not gain cycle controls: ${names.join(', ')}`);
  }
});

test('no two controls share a property on a cycling document', () => {
  const doc = docWith([
    { id: 'behind', type: 'gradient' },
    { id: 'front', type: 'shape', figure: 'heart', cycleSpeed: 20 }
  ]);
  const names = effectControls(doc, 'front', 'behind').map((control) => control.property);
  assert.equal(new Set(names).size, names.length,
    `a property repeats: ${names.filter((n, i) => names.indexOf(n) !== i).join(', ')}`);
});
