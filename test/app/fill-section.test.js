// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  describeInspector, SECTION_TITLES, SECTION_GLYPHS
} from '../../app/renderer/components/inspector.js';
import { nextStopPosition } from '../../app/renderer/components/field.js';
import { TILES } from '../../app/renderer/components/gallery.js';
import {
  normalizeDocument, GRADIENT_SHAPES, SOLID_MOTION_KINDS, MOTION_KINDS,
  MIN_GRADIENT_STOPS, MAX_GRADIENT_STOPS
} from '../../src/engine/document.js';
import { getByPath, setByPath } from '../../src/engine/bind.js';

const docOf = (layer) => normalizeDocument({ layers: [{ id: 'a1', ...layer }] }).doc;
const fieldsOf = (layer) => describeInspector(docOf(layer), 'a1');
const pathsOf = (layer) => fieldsOf(layer).map((field) => field.path);

// ------------------------------------------------- what the column offers

test('a solid layer offers one colour, its motions and the document colours', () => {
  const fields = fieldsOf({ type: 'solid' });
  assert.deepEqual(fields.filter((f) => f.section === 'fill').map((f) => f.path), ['layers.0.color']);
  assert.equal(fields.find((f) => f.path === 'layers.0.color').type, 'color');
  // No picture means no "Bild" section at all — not an empty one.
  assert.equal(fields.filter((f) => f.section === 'image').length, 0);
  assert.ok(fields.some((f) => f.section === 'colour'));
});

test('a solid layer is offered only the motions a flat colour can perform', () => {
  const list = fieldsOf({ type: 'solid' }).find((f) => f.type === 'motions');
  assert.deepEqual(list.values, [...SOLID_MOTION_KINDS]);
});

test('a gradient offers its shape, its angle, its stops and its motions', () => {
  const paths = pathsOf({ type: 'gradient' });
  assert.ok(paths.includes('layers.0.shape'));
  assert.ok(paths.includes('layers.0.angle'));
  assert.ok(paths.includes('layers.0.stops.0.color'));
  assert.ok(paths.includes('layers.0.stops.0.at'));
  assert.ok(paths.includes('layers.0.stops.1.color'));
  assert.equal(paths.filter((p) => p === 'layers.0.fit').length, 0, 'there is nothing to fit');
});

test('the shape dropdown offers exactly what the engine accepts', () => {
  const shape = fieldsOf({ type: 'gradient' }).find((f) => f.path === 'layers.0.shape');
  assert.deepEqual(shape.values, [...GRADIENT_SHAPES]);
});

test('a radial gradient is not offered an angle, because turning it does nothing', () => {
  assert.ok(!pathsOf({ type: 'gradient', shape: 'radial' }).includes('layers.0.angle'));
  assert.ok(pathsOf({ type: 'gradient', shape: 'linear' }).includes('layers.0.angle'));
});

test('a gradient gets every motion there is, unlike a solid colour', () => {
  const list = fieldsOf({ type: 'gradient' }).find((f) => f.type === 'motions');
  // The one layer type with structure at every angle, so nothing is withheld.
  assert.deepEqual(list.values, [...MOTION_KINDS]);
});

test('the band count is offered exactly for the shapes that repeat', () => {
  // The column's rule: a control that is there can be used. "linear" and
  // "radial" are one traversal of the ramp, so there is nothing to repeat.
  for (const shape of ['linear', 'radial']) {
    assert.ok(!pathsOf({ type: 'gradient', shape }).includes('layers.0.bands'),
      `a ${shape} gradient must not be offered a band count`);
  }
  for (const shape of ['conic', 'stripes', 'waves']) {
    assert.ok(pathsOf({ type: 'gradient', shape }).includes('layers.0.bands'),
      `a ${shape} gradient must be offered a band count`);
  }
});

test('a conic is offered an angle, because that is where its sweep begins', () => {
  assert.ok(pathsOf({ type: 'gradient', shape: 'conic' }).includes('layers.0.angle'));
  assert.ok(pathsOf({ type: 'gradient', shape: 'stripes' }).includes('layers.0.angle'));
});

test('stripes keep their colours and lose their positions, because a band has none', () => {
  const paths = pathsOf({ type: 'gradient', shape: 'stripes' });
  assert.ok(paths.includes('layers.0.stops.0.color'), 'a stripe IS its colour');
  assert.ok(!paths.includes('layers.0.stops.0.at'),
    'a stripe is one colour edge to edge, so a position along it means nothing');
  // And every other shape still reads them.
  assert.ok(pathsOf({ type: 'gradient', shape: 'waves' }).includes('layers.0.stops.0.at'));
});

test('a third stop brings its own pair of controls', () => {
  const paths = pathsOf({
    type: 'gradient',
    stops: [{ at: 0, color: '#000000' }, { at: 50, color: '#888888' }, { at: 100, color: '#ffffff' }]
  });
  assert.ok(paths.includes('layers.0.stops.2.color'));
  assert.ok(paths.includes('layers.0.stops.2.at'));
});

test('the stop list addresses the layer and carries the two limits', () => {
  const list = fieldsOf({ type: 'gradient' }).find((f) => f.type === 'stops');
  assert.equal(list.path, 'layers.0');
  assert.equal(list.min, MIN_GRADIENT_STOPS);
  assert.equal(list.max, MAX_GRADIENT_STOPS);
});

test('every field of a colour layer says which section it is in, and each has a heading', () => {
  for (const layer of [{ type: 'solid' }, { type: 'gradient' }]) {
    for (const field of fieldsOf(layer)) {
      assert.ok(Object.hasOwn(SECTION_TITLES, field.section),
        `${field.path} is in the unknown section "${field.section}"`);
    }
  }
});

test('a section is never left and returned to, for a colour layer either', () => {
  for (const layer of [{ type: 'solid' }, { type: 'gradient' }]) {
    const runs = [];
    for (const field of fieldsOf(layer)) {
      if (runs[runs.length - 1] !== field.section) runs.push(field.section);
    }
    assert.deepEqual(runs, [...new Set(runs)], `a section is opened twice: ${runs.join(', ')}`);
  }
});

// The column writes through the engine's own setByPath, which refuses to
// create a branch that is not already there — so a field whose path does not
// exist in the document is a control that silently does nothing.
test('every path the column offers is one the document really has', () => {
  for (const layer of [{ type: 'solid' }, { type: 'gradient' },
    { type: 'gradient', shape: 'radial' }, { type: 'image', asset: 'q' }]) {
    for (const field of fieldsOf(layer)) {
      if (field.type === 'motions' || field.type === 'stops') continue;
      const doc = docOf(layer);
      assert.notEqual(getByPath(doc, field.path), undefined, `${field.path} is not in the document`);
      const value = getByPath(doc, field.path);
      assert.ok(setByPath(doc, field.path, value), `${field.path} is not writable`);
    }
  }
});

test('no colour slider offers a value the engine would clamp away', () => {
  for (const field of fieldsOf({ type: 'gradient' })) {
    if (field.type !== 'number') continue;
    for (const value of [field.min, field.max]) {
      const doc = docOf({ type: 'gradient' });
      assert.ok(setByPath(doc, field.path, value), `${field.path} is not a writable path`);
      assert.equal(getByPath(normalizeDocument(doc).doc, field.path), value,
        `${field.path} = ${value} does not survive normalizeDocument`);
    }
  }
});

// --------------------------------------------- every section is headed

/**
 * These three used to be a cross-check between two files: the settings
 * column's own tables of section words and section glyphs on one side, and the
 * left column's DESTINATIONS on the other, which carried a copy of both so
 * that an entry and the heading it led to could be pinned to each other.
 *
 * That column is gone (see app/renderer/components/shell.js), and with it the
 * second copy — which is a better outcome than the pinning was, because the
 * only reliable way to keep two tables agreeing is for there to be one. What
 * is left to guard is what was underneath the pinning all along: a section
 * this column can build must arrive with a word AND a picture, and neither
 * table may name a section the other has never heard of. Both halves have gone
 * missing before; neither can now go missing quietly.
 */
test('every section the column can build has both a heading word and a glyph', () => {
  const sections = new Set();
  for (const layer of [{ type: 'solid' }, { type: 'gradient' }, { type: 'image', asset: 'q' }]) {
    for (const field of fieldsOf(layer)) sections.add(field.section);
  }
  // Every layer type this app has must contribute something, or the loop above
  // is passing vacuously over an empty set.
  assert.ok(sections.size >= 3, `only ${sections.size} sections were produced at all`);
  for (const section of sections) {
    assert.ok(SECTION_TITLES[section], `the section "${section}" is built with no heading word`);
    assert.ok(SECTION_GLYPHS[section], `the section "${section}" is built with no glyph`);
  }
});

test('neither table names a section the other has never heard of', () => {
  assert.deepEqual(Object.keys(SECTION_GLYPHS).sort(), Object.keys(SECTION_TITLES).sort());
});

// And no table may quietly keep a section no layer type produces — the shape
// of dead weight the left column's fifth entry could once hide.
test('no section is headed that nothing ever builds', () => {
  const sections = new Set();
  for (const layer of [{ type: 'solid' }, { type: 'gradient' }, { type: 'image', asset: 'q' }]) {
    for (const field of fieldsOf(layer)) sections.add(field.section);
  }
  for (const name of Object.keys(SECTION_TITLES)) {
    assert.ok(sections.has(name), `"${name}" is headed and glyphed, but no layer type produces it`);
  }
});

// ---------------------------------------------------------- the gallery

test('every tile in the starting gallery does something', () => {
  assert.equal(TILES.length, 7);
  const picture = TILES.filter((tile) => tile.starts === null);
  assert.equal(picture.length, 1, 'exactly one tile opens a file dialog');
  assert.deepEqual(
    TILES.filter((tile) => tile.starts).map((tile) => tile.starts),
    ['solid', 'linear', 'radial', 'conic', 'stripes', 'waves']
  );
});

test('every gradient shape the engine can draw has a tile that starts one', () => {
  // The shelf is how an effect BEGINS, so a shape somebody can only reach by
  // starting a different effect and then changing a dropdown is a shape that
  // is effectively hidden. Derived from the engine's list rather than written
  // out, so a sixth shape cannot be added to the engine and quietly left off.
  const started = new Set(TILES.map((tile) => tile.starts).filter(Boolean));
  for (const shape of GRADIENT_SHAPES) {
    assert.ok(started.has(shape), `no tile starts a ${shape} gradient`);
  }
});

// ------------------------------------------------ where a new stop lands

test('a new stop lands in the middle of the widest gap, not on top of another', () => {
  assert.equal(nextStopPosition([0, 100]), 50);
  // With stops at 0, 60 and 100 the widest gap is 0..60, so the new one lands
  // at 30 and not in the narrow 60..100 gap.
  assert.equal(nextStopPosition([0, 60, 100]), 30);
  // And the other way round: the widest gap here is 40..100.
  assert.equal(nextStopPosition([0, 40, 100]), 70);
  // Order in the document says nothing about order along the ramp.
  assert.equal(nextStopPosition([100, 0]), 50);
});

test('a stop position is always a whole percent, like every other number here', () => {
  assert.equal(nextStopPosition([0, 25]), 13);
  assert.ok(Number.isInteger(nextStopPosition([0, 33, 100])));
});

test('a list too short to have a gap still answers with something usable', () => {
  assert.equal(nextStopPosition([]), 50);
  assert.equal(nextStopPosition([20]), 50);
  assert.equal(nextStopPosition(['nonsense', null]), 50);
});
