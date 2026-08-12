// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultValueAt, normalizeDocument, DEFAULT_BANDS, DEFAULT_SHAPE_SIZE,
  DEFAULT_STAR_POINTS, DEFAULT_PARTICLE_COUNT
} from '../../src/engine/document.js';

/**
 * What a fresh document carries, asked of the one thing that knows.
 *
 * The whole point of defaultValueAt is that this project holds NO table of
 * defaults for the settings column to reset a slider to — a third copy of
 * numbers that already exist in normalizeDocument and are already baked into
 * the exported effect by effect-controls.js. So the checks below are written
 * the way the function has to be right: not against numbers typed out here
 * (which would be that third copy, in the test instead of the app), but
 * against a document that genuinely never mentioned the field.
 *
 * That is the falsifiable form. Change the default for `bands` in
 * normalizeLayer and both sides of every assertion move together and stay
 * green — which is correct, because the app would follow it too. Break the
 * lookup itself, or let it read the CURRENT value back instead of the default,
 * and the two sides part company.
 */

const gradientDoc = () => normalizeDocument({
  layers: [{
    id: 'g', type: 'gradient', shape: 'stripes', angle: 200, bands: 19,
    stops: [{ at: 0, color: '#112233' }, { at: 40, color: '#445566' },
      { at: 90, color: '#778899' }],
    motions: [{ kind: 'drift', speed: 77, amount: 88 }]
  }],
  brightness: 42, saturation: 180, trail: 55, hueShift: 210, hueCycle: 9
}).doc;

/** The same document with one field never written at all. */
const withoutField = (build) => normalizeDocument(build()).doc;

test('a document-wide slider resets to what a document that never named it gets', () => {
  const doc = gradientDoc();
  const bare = withoutField(() => ({ layers: [] }));

  for (const field of ['brightness', 'saturation', 'trail', 'hueShift', 'hueCycle',
    'greenMagenta', 'blueYellow']) {
    assert.equal(
      defaultValueAt(doc, field), bare[field],
      `${field} must reset to the value a document that never mentioned it carries`
    );
    assert.notEqual(
      defaultValueAt(doc, field), undefined,
      `${field} must have an answer at all`
    );
  }
});

test('the reset value is genuinely the default and not the value that is there', () => {
  const doc = gradientDoc();
  // Every one of these was set to something unusual on purpose above, so a
  // lookup that quietly handed the current value back would pass every other
  // check in this file.
  assert.notEqual(defaultValueAt(doc, 'brightness'), doc.brightness);
  assert.notEqual(defaultValueAt(doc, 'trail'), doc.trail);
  assert.notEqual(defaultValueAt(doc, 'layers.0.bands'), doc.layers[0].bands);
  assert.notEqual(defaultValueAt(doc, 'layers.0.motions.0.speed'), doc.layers[0].motions[0].speed);
});

test('a field inside a layer resets to that layer type\'s own starting value', () => {
  const doc = gradientDoc();
  assert.equal(defaultValueAt(doc, 'layers.0.bands'), DEFAULT_BANDS);
  // The angle a gradient starts at is not a named constant — it is written
  // into normalizeLayer as the fallback — so it is read out of a gradient that
  // never carried one rather than typed here.
  const freshGradient = withoutField(() => ({
    layers: [{ id: 'g', type: 'gradient', shape: 'stripes' }]
  }));
  assert.equal(defaultValueAt(doc, 'layers.0.angle'), freshGradient.layers[0].angle);
});

test('a motion entry resets to the speed and strength a new motion is given', () => {
  const doc = gradientDoc();
  const fresh = withoutField(() => ({
    layers: [{ id: 'g', type: 'gradient', motions: [{ kind: 'drift' }] }]
  }));
  assert.equal(defaultValueAt(doc, 'layers.0.motions.0.speed'), fresh.layers[0].motions[0].speed);
  assert.equal(defaultValueAt(doc, 'layers.0.motions.0.amount'), fresh.layers[0].motions[0].amount);
});

test('the other layer types answer for their own numbers', () => {
  const shape = normalizeDocument({
    layers: [{ id: 's', type: 'shape', figure: 'star', size: 199, points: 11 }]
  }).doc;
  assert.equal(defaultValueAt(shape, 'layers.0.size'), DEFAULT_SHAPE_SIZE);
  assert.equal(defaultValueAt(shape, 'layers.0.points'), DEFAULT_STAR_POINTS);

  const swarm = normalizeDocument({
    layers: [{ id: 'p', type: 'particles', count: 399, tilt: 90 }]
  }).doc;
  assert.equal(defaultValueAt(swarm, 'layers.0.count'), DEFAULT_PARTICLE_COUNT);
  assert.equal(defaultValueAt(swarm, 'layers.0.tilt'), 0);
});

/**
 * A stop's position is the one answer that depends on the document around it,
 * and it has to: a stop with no position of its own is spaced evenly among the
 * stops that ARE there (see normalizeStops), so the honest reset for the
 * middle stop of three is the middle of the ramp and not some fixed number.
 */
test('a colour stop resets to where it would be spaced among the stops there are', () => {
  const doc = gradientDoc();
  assert.equal(defaultValueAt(doc, 'layers.0.stops.1.at'), 50);
  assert.equal(defaultValueAt(doc, 'layers.0.stops.0.at'), 0);
  assert.equal(defaultValueAt(doc, 'layers.0.stops.2.at'), 100);
});

test('a nested position resets without disturbing the axis beside it', () => {
  const doc = normalizeDocument({
    layers: [{ id: 's', type: 'shape', figure: 'circle', position: { x: 12, y: 88 } }]
  }).doc;
  const fresh = normalizeDocument({ layers: [{ id: 's', type: 'shape', figure: 'circle' }] }).doc;
  assert.equal(defaultValueAt(doc, 'layers.0.position.x'), fresh.layers[0].position.x);
  assert.equal(defaultValueAt(doc, 'layers.0.position.y'), fresh.layers[0].position.y);
  // And the document it was asked about is untouched — this is a question, not
  // a change. A lookup that normalized in place would quietly reset the
  // picture on screen the moment somebody hovered a slider.
  assert.equal(doc.layers[0].position.x, 12);
  assert.equal(doc.layers[0].position.y, 88);
});

test('the document handed in is never modified', () => {
  const doc = gradientDoc();
  const before = JSON.stringify(doc);
  defaultValueAt(doc, 'brightness');
  defaultValueAt(doc, 'layers.0.motions.0.speed');
  defaultValueAt(doc, 'layers.0.stops.1.at');
  assert.equal(JSON.stringify(doc), before);
});

/**
 * The cases with no honest answer. Each returns undefined rather than a
 * plausible number, because the settings column turns "no answer" into "no
 * reset button" — and a reset button that wrote the wrong value would be worse
 * than no button at all.
 */
test('a path with no honest answer says so rather than guessing', () => {
  const doc = gradientDoc();
  for (const path of [
    'nothingLikeThis',
    'layers.9.bands',
    'layers.0.notAField',
    'layers.0.motions.5.speed',
    // A whole array element: removing it would shift every index after it, so
    // the path being asked about would come back pointing at a different entry.
    'layers.0',
    'layers.0.motions.0',
    '',
    'layers..bands'
  ]) {
    assert.equal(defaultValueAt(doc, path), undefined, `${path} must have no answer`);
  }
});

test('a path that walks onto the prototype chain is refused', () => {
  const doc = gradientDoc();
  for (const path of ['__proto__', 'constructor', 'layers.0.__proto__.bands',
    'layers.0.constructor', 'toString']) {
    assert.equal(defaultValueAt(doc, path), undefined, `${path} must be refused`);
  }
  // And nothing was written onto Object.prototype on the way past.
  assert.equal({}.bands, undefined);
});
