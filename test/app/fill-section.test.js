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
  normalizeDocument, GRADIENT_SHAPES, SHAPE_FIGURES, SOLID_MOTION_KINDS, MOTION_KINDS,
  MIN_GRADIENT_STOPS, MAX_GRADIENT_STOPS
} from '../../src/engine/document.js';
import { getByPath, setByPath } from '../../src/engine/bind.js';

const docOf = (layer) => normalizeDocument({ layers: [{ id: 'a1', ...layer }] }).doc;

/**
 * One layer of every type this column can be asked about, and every variant of
 * a type whose fields DEPEND on one of its own settings.
 *
 * There is one of these because there were four copies of it, written out
 * inline in four loops, and they had drifted: two of them knew about the
 * gradient's radial variant and two did not, so the checks that mattered most
 * for `bands` walked straight past it. A new layer type or a new figure added
 * here is covered by every check below at once, which is the only arrangement
 * that cannot go quietly out of date.
 *
 * The figures are all four rather than one, because the shape layer's field
 * list genuinely differs between them: a ring is offered a thickness and a star
 * a point count, and neither is offered to the other two.
 */
const LAYER_TYPES = Object.freeze([
  { type: 'solid' },
  { type: 'gradient' },
  ...GRADIENT_SHAPES.map((shape) => ({ type: 'gradient', shape })),
  ...SHAPE_FIGURES.map((figure) => ({ type: 'shape', figure })),
  { type: 'image', asset: 'q' }
]);

const fieldsOf = (layer) => describeInspector(docOf(layer), 'a1');
const pathsOf = (layer) => fieldsOf(layer).map((field) => field.path);

// ------------------------------------------------- what the column offers

test('a solid layer offers one colour, its motions and the document colours', () => {
  const fields = fieldsOf({ type: 'solid' });
  // The resting colour, then the cycle: its tempo, the stop list itself
  // (path = the layer, exactly like the gradient's) and one colour per stop.
  assert.deepEqual(fields.filter((f) => f.section === 'fill').map((f) => f.path), [
    'layers.0.color', 'layers.0.cycleSpeed', 'layers.0',
    'layers.0.stops.0.color', 'layers.0.stops.1.color'
  ]);
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
  for (const layer of LAYER_TYPES) {
    for (const field of fieldsOf(layer)) {
      assert.ok(Object.hasOwn(SECTION_TITLES, field.section),
        `${field.path} is in the unknown section "${field.section}"`);
    }
  }
});

test('a section is never left and returned to, for a colour layer either', () => {
  for (const layer of LAYER_TYPES) {
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
  for (const layer of LAYER_TYPES) {
    for (const field of fieldsOf(layer)) {
      if (field.type === 'motions' || field.type === 'stops') continue;
      const doc = docOf(layer);
      assert.notEqual(getByPath(doc, field.path), undefined, `${field.path} is not in the document`);
      const value = getByPath(doc, field.path);
      assert.ok(setByPath(doc, field.path, value), `${field.path} is not writable`);
    }
  }
});

// Every shape, and not just the one a fresh gradient happens to be. A default
// gradient is linear, which is offered no band count at all (see the check
// above), so a loop over that one layer walked straight past the very control
// this guarantee was written for: the offered range and the engine's clamp
// agreeing. `bands` was covered by nothing here until the shapes that carry it
// were named.
test('no colour slider offers a value the engine would clamp away, whatever the shape', () => {
  const seen = new Set();
  for (const shape of GRADIENT_SHAPES) {
    const layer = { type: 'gradient', shape };
    for (const field of fieldsOf(layer)) {
      if (field.type !== 'number') continue;
      seen.add(field.path.replace(/^layers\.0\./, ''));
      for (const value of [field.min, field.max]) {
        const doc = docOf(layer);
        assert.ok(setByPath(doc, field.path, value), `${field.path} is not a writable path`);
        assert.equal(getByPath(normalizeDocument(doc).doc, field.path), value,
          `${field.path} = ${value} does not survive normalizeDocument on a ${shape} gradient`);
      }
    }
  }
  // And the loop above really did reach the control this was widened for,
  // rather than passing over shapes that all offer the same three sliders.
  assert.ok(seen.has('bands'), `the band count was never checked; only saw ${[...seen].join(', ')}`);
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
  for (const layer of LAYER_TYPES) {
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
  // LAYER_TYPES and not a hand-written three. It used to name solid, gradient
  // and image inline, which was every type there was when it was written and
  // has been a shrinking fraction of them ever since — and the moment a section
  // existed that only one of the OTHER types produces ("Hintergrund", which is
  // offered to the two types that leave ground for it), the guard called that
  // section dead weight. The maintained list cannot go out of date that way.
  for (const layer of LAYER_TYPES) {
    for (const field of fieldsOf(layer)) sections.add(field.section);
  }
  for (const name of Object.keys(SECTION_TITLES)) {
    assert.ok(sections.has(name), `"${name}" is headed and glyphed, but no layer type produces it`);
  }
});

// ---------------------------------------------------------- the gallery

test('every tile in the starting gallery does something', () => {
  // WHAT IS ASSERTED AND WHAT IS DELIBERATELY NOT. There used to be a literal
  // 7 here and a literal list of the six starting kinds beside it, and both
  // went stale the moment a tile was added — which is the third guard in this
  // project to rot by counting (see the note in test/engine/boundary.test.js).
  // So the RULE is asserted instead: exactly one tile opens a file dialog, every
  // other tile starts something, and no two start the same thing. A count of
  // tiles is not a property of a correct shelf; those three are.
  const picture = TILES.filter((tile) => tile.starts === null);
  assert.equal(picture.length, 1, 'exactly one tile opens a file dialog');
  const started = TILES.filter((tile) => tile.starts).map((tile) => tile.starts);
  assert.equal(started.length, TILES.length - 1, 'every other tile must start something');
  assert.equal(new Set(started).size, started.length, 'two tiles start the same effect');
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

test('every figure the engine can draw has a tile that starts one', () => {
  // The same rule, from the same reasoning, for the layer type that arrived
  // after it — and this is also the check that keeps the shelf's decision
  // honest. One "Form" tile with a Figure dropdown behind it would fail here,
  // which is the point: three of the four figures would then be reachable only
  // by starting a fourth and changing a setting, and the tile would be showing
  // a picture of one figure while standing for four (see the long note in
  // app/renderer/components/gallery.js).
  const started = new Set(TILES.map((tile) => tile.starts).filter(Boolean));
  for (const figure of SHAPE_FIGURES) {
    assert.ok(started.has(figure), `no tile starts a ${figure}`);
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
