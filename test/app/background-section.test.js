// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { describeInspector, SECTION_TITLES } from '../../app/renderer/components/inspector.js';
import {
  normalizeDocument, GRADIENT_SHAPES, SHAPE_FIGURES, PARTICLE_PATTERNS
} from '../../src/engine/document.js';
import { BACKGROUND_KINDS, withBackgroundKind } from '../../src/engine/slots.js';
import { getByPath, setByPath } from '../../src/engine/bind.js';

/**
 * The settings column's second slot: what it offers, to whom, and — the part
 * that had to be got right — what it does NOT disturb on the way in.
 */

const docOf = (layers) => normalizeDocument({ layers }).doc;
const FRONT = { id: 'fill', type: 'particles' };

/** The exact gesture the combobox performs, document in and document out. */
const choose = (doc, kind) => normalizeDocument({
  ...doc, layers: withBackgroundKind(doc.layers, kind)
}).doc;

const fieldsFor = (doc) => describeInspector(doc, 'fill');
const pathsFor = (doc) => fieldsFor(doc).map((field) => field.path);
const sectionsFor = (doc) => {
  const runs = [];
  for (const field of fieldsFor(doc)) {
    if (runs[runs.length - 1] !== field.section) runs.push(field.section);
  }
  return runs;
};

// ---------------------------------------------------- who is offered one

test('the two types that draw on transparent ground are offered a background', () => {
  for (const figure of SHAPE_FIGURES) {
    const doc = docOf([{ id: 'fill', type: 'shape', figure }]);
    assert.ok(sectionsFor(doc).includes('background'), `a ${figure} was offered none`);
  }
  for (const pattern of PARTICLE_PATTERNS) {
    const doc = docOf([{ id: 'fill', type: 'particles', pattern }]);
    assert.ok(sectionsFor(doc).includes('background'), `${pattern} was offered none`);
  }
});

test('a foreground that covers the canvas is offered none, whatever its shape', () => {
  assert.equal(sectionsFor(docOf([{ id: 'fill', type: 'solid' }])).includes('background'), false);
  for (const shape of GRADIENT_SHAPES) {
    const doc = docOf([{ id: 'fill', type: 'gradient', shape }]);
    assert.equal(sectionsFor(doc).includes('background'), false, `a ${shape} gradient was offered one`);
  }
  const covering = docOf([{ id: 'fill', type: 'image', asset: 'q', fit: 'cover' }]);
  assert.equal(sectionsFor(covering).includes('background'), false);
});

test('a picture is offered one exactly where it does not fill the canvas', () => {
  const fitted = docOf([{ id: 'fill', type: 'image', asset: 'q', fit: 'contain' }]);
  assert.ok(sectionsFor(fitted).includes('background'),
    'a contained picture leaves bars, and a background is what can be seen in them');
});

test('an empty document is offered nothing to put behind nothing', () => {
  assert.equal(describeInspector(docOf([]), null).some((f) => f.section === 'background'), false);
});

test('the background layer itself is not offered a background of its own', () => {
  const doc = choose(docOf([FRONT]), 'gradient');
  const behind = describeInspector(doc, doc.layers[0].id);
  assert.equal(behind.some((f) => f.section === 'background'), false,
    'there is one slot underneath, not a stack');
});

// ---------------------------------------------------- where it sits

test('the background is described after the foreground moves and before the grade', () => {
  const runs = sectionsFor(choose(docOf([FRONT]), 'gradient'));
  assert.deepEqual(runs, ['fill', 'motions', 'background', 'colour']);
});

test('every section it builds has a heading, and it is never left and returned to', () => {
  for (const kind of BACKGROUND_KINDS) {
    const doc = choose(docOf([FRONT]), kind);
    const runs = sectionsFor(doc);
    assert.deepEqual(runs, [...new Set(runs)], `a section is opened twice: ${runs.join(', ')}`);
    for (const field of fieldsFor(doc)) {
      assert.ok(Object.hasOwn(SECTION_TITLES, field.section), `${field.path} is in "${field.section}"`);
    }
  }
});

// ---------------------------------------------------- the control itself

test('the combobox offers exactly the kinds a background may be, and addresses the list', () => {
  const control = fieldsFor(docOf([FRONT])).find((f) => f.type === 'background');
  assert.ok(control, 'the section exists but has no control in it');
  assert.equal(control.path, 'layers', 'it reports the whole layer list, like the motion list does');
  assert.equal(control.section, 'background');
  assert.deepEqual(control.values, [...BACKGROUND_KINDS]);
  assert.equal(control.group, undefined,
    'the control that causes the change must not be inside the box that arrives');
});

test('with no background chosen, the section holds nothing but that one control', () => {
  const fields = fieldsFor(docOf([FRONT])).filter((f) => f.section === 'background');
  assert.equal(fields.length, 1);
  assert.equal(fields[0].type, 'background');
});

test('a chosen background brings its own cards, and every one of them is boxed', () => {
  const doc = choose(docOf([FRONT]), 'gradient');
  const own = fieldsFor(doc).filter((f) => f.section === 'background' && f.type !== 'background');
  assert.ok(own.length >= 4, `only ${own.length} cards came with it`);
  for (const field of own) {
    assert.ok(field.group === 'background' || field.group === 'background-motions',
      `${field.path} is not in a box that arrives`);
    assert.ok(field.path.startsWith('layers.0'), `${field.path} does not address the layer behind`);
  }
});

test('the two lists behind are in two boxes, so each add button says what it adds', () => {
  // Both of a background's repeating lists live under one heading, and a list's
  // add button goes into the nearest heading above it. One box would put two
  // identical "+" glyphs side by side in "Hintergrund" with nothing but a
  // tooltip between them, which is the fault this column refuses everywhere
  // else.
  const own = fieldsFor(choose(docOf([FRONT]), 'gradient'))
    .filter((f) => f.section === 'background' && f.type !== 'background');
  const stops = own.filter((f) => f.type === 'stops' || f.path.includes('.stops.'));
  const motions = own.filter((f) => f.type === 'motions' || f.path.includes('.motions.'));
  assert.ok(stops.length > 0 && motions.length > 0);
  for (const field of stops) assert.equal(field.group, 'background');
  for (const field of motions) {
    assert.equal(field.group, 'background-motions');
    assert.equal(field.groupLabel, 'inspector.motions', 'and the second box says what it holds');
  }
});

test('the background gets the same cards a foreground of that type gets', () => {
  // Everything that says what the layer is MADE OF, with the layer's own number
  // taken off, so the two lists can be compared at all. The motion list is left
  // out on both sides and has its own check below — the point here is that the
  // fill vocabulary is one vocabulary and not two.
  const fill = (fields, section) => fields
    .filter((f) => f.section === section && f.type !== 'background' && f.type !== 'motions'
      && !f.path.includes('.motions.'))
    .map((f) => `${f.path.replace(/^layers\.\d+\.?/, '')}:${f.type}`);

  const behind = fill(fieldsFor(choose(docOf([FRONT]), 'gradient')), 'background');
  const infront = fill(describeInspector(docOf([{ id: 'fill', type: 'gradient' }]), 'fill'), 'fill');
  assert.ok(infront.length > 0, 'the comparison must not be empty on both sides');
  assert.deepEqual(behind, infront);
});

test('a solid background offers a colour and a gradient offers stops', () => {
  const solid = fieldsFor(choose(docOf([FRONT]), 'solid'))
    .filter((f) => f.section === 'background' && f.type !== 'background');
  assert.deepEqual(solid.filter((f) => f.type === 'color').map((f) => f.path), ['layers.0.color']);

  const gradient = fieldsFor(choose(docOf([FRONT]), 'gradient'))
    .filter((f) => f.section === 'background' && f.type === 'color');
  assert.deepEqual(gradient.map((f) => f.path),
    ['layers.0.stops.0.color', 'layers.0.stops.1.color']);
});

test('the background has a motion list of its own, under its own heading', () => {
  const doc = choose(docOf([FRONT]), 'solid');
  const lists = fieldsFor(doc).filter((f) => f.type === 'motions');
  assert.equal(lists.length, 2, 'the foreground has one and the background has one');
  assert.deepEqual(lists.map((f) => f.section), ['motions', 'background']);
  assert.deepEqual(lists.map((f) => f.path), ['layers.1', 'layers.0']);
});

test('every path the background section offers is one the document really has', () => {
  for (const kind of BACKGROUND_KINDS) {
    const doc = choose(docOf([FRONT]), kind);
    for (const field of fieldsFor(doc)) {
      if (field.type === 'motions' || field.type === 'stops') continue;
      assert.notEqual(getByPath(doc, field.path), undefined, `${field.path} is not in the document`);
      assert.ok(setByPath(doc, field.path, getByPath(doc, field.path)),
        `${field.path} is not writable`);
    }
  }
});

// ------------------------------------- THE TRAP: what an insert must not move

test('the foreground keeps its own cards when a background is put under it', () => {
  const before = docOf([FRONT]);
  const after = choose(before, 'gradient');

  assert.ok(pathsFor(before).includes('layers.0.pattern'), 'the swarm was at index 0');
  assert.ok(pathsFor(after).includes('layers.1.pattern'), 'and is at index 1 with something under it');
  assert.equal(pathsFor(after).includes('layers.0.pattern'), false,
    'and nothing addresses the swarm by its old number any more');

  // Every card the foreground had, it still has — under whatever number it is
  // now. That is the whole guarantee: the paths are rebuilt, not remembered.
  const forward = (doc, at) => fieldsFor(doc)
    .filter((f) => f.path.startsWith(`${at}.`))
    .map((f) => `${f.path.slice(at.length + 1)}:${f.type}`);
  assert.deepEqual(forward(after, 'layers.1'), forward(before, 'layers.0'));
});

test('a card of the foreground writes into the foreground, not into what is under it', () => {
  const doc = choose(docOf([FRONT]), 'solid');
  const field = fieldsFor(doc).find((f) => f.path.endsWith('.count'));
  assert.ok(setByPath(doc, field.path, 123));
  assert.equal(doc.layers[1].count, 123, 'the swarm took it');
  assert.equal(doc.layers[0].count, undefined, 'and the background did not');
});

test('taking the background off again restores the document byte for byte', () => {
  const before = docOf([FRONT]);
  for (const kind of ['solid', 'gradient']) {
    const withOne = choose(before, kind);
    const after = choose(withOne, 'none');
    assert.equal(JSON.stringify(after), JSON.stringify(before),
      `a ${kind} background left something behind when it was removed`);
    assert.deepEqual(pathsFor(after), pathsFor(before), 'and the column is exactly what it was');
  }
});

test('a crop survives a background arriving and leaving', () => {
  // The one field a picture layer carries that a person has dragged by hand,
  // and the reason the crop reads its layer by id rather than by number.
  const before = docOf([{ id: 'fill', type: 'image', asset: 'q', fit: 'contain', offset: { x: -0.6, y: 0.35 } }]);
  const withOne = choose(before, 'gradient');
  assert.deepEqual(withOne.layers[1].offset, { x: -0.6, y: 0.35 });
  assert.equal(withOne.layers[1].id, 'fill', 'and it is still the same layer');
  assert.equal(JSON.stringify(choose(withOne, 'none')), JSON.stringify(before));
});
