// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BACKGROUND_KINDS, BACKGROUND_LAYER_ID,
  foregroundOf, backgroundOf, backgroundKindOf, withBackgroundKind,
  showsBackground, offersBackground
} from '../../src/engine/slots.js';
import { normalizeDocument } from '../../src/engine/document.js';

const layersOf = (raw) => normalizeDocument({ layers: raw }).doc.layers;

test('one layer is the foreground and has no background under it', () => {
  const layers = layersOf([{ id: 'fill', type: 'particles' }]);
  assert.equal(foregroundOf(layers).id, 'fill');
  assert.equal(backgroundOf(layers), null);
  assert.equal(backgroundKindOf(layers), 'none');
});

test('two layers are a background under a foreground, by position', () => {
  const layers = layersOf([{ id: 'background', type: 'gradient' }, { id: 'fill', type: 'particles' }]);
  assert.equal(backgroundOf(layers).id, 'background');
  assert.equal(foregroundOf(layers).id, 'fill');
  assert.equal(backgroundKindOf(layers), 'gradient');
});

test('an empty document has neither', () => {
  assert.equal(foregroundOf([]), null);
  assert.equal(backgroundOf([]), null);
  assert.equal(backgroundKindOf([]), 'none');
});

test('nothing here throws on a value that is not a list at all', () => {
  for (const junk of [undefined, null, 'layers', 7, {}]) {
    assert.equal(foregroundOf(junk), null);
    assert.equal(backgroundOf(junk), null);
    assert.equal(backgroundKindOf(junk), 'none');
    assert.deepEqual(withBackgroundKind(junk, 'solid'), []);
    assert.equal(offersBackground(junk), false);
  }
});

test('adding a background puts it first and leaves the foreground last', () => {
  const before = layersOf([{ id: 'fill', type: 'shape' }]);
  const after = withBackgroundKind(before, 'solid');
  assert.equal(after.length, 2);
  assert.equal(after[0].id, BACKGROUND_LAYER_ID);
  assert.equal(after[0].type, 'solid');
  assert.equal(foregroundOf(after).id, 'fill');
});

test('adding a background does not touch the array it was given', () => {
  const before = layersOf([{ id: 'fill', type: 'shape' }]);
  const copy = [...before];
  withBackgroundKind(before, 'gradient');
  assert.deepEqual(before, copy, 'the caller\'s own list must be untouched');
  assert.equal(before.length, 1);
});

test('a new background names no colour of its own — normalizeDocument fills it in', () => {
  const added = withBackgroundKind(layersOf([{ id: 'fill', type: 'shape' }]), 'gradient');
  assert.deepEqual(Object.keys(added[0]).sort(), ['id', 'motions', 'type']);
});

test('switching kind keeps the same layer, and with it its motions', () => {
  const withSolid = normalizeDocument({
    layers: withBackgroundKind(layersOf([{ id: 'fill', type: 'particles' }]), 'solid')
  }).doc.layers;
  withSolid[0].motions = [{ kind: 'breathe', speed: 40, amount: 70 }];

  const switched = normalizeDocument({ layers: withBackgroundKind(withSolid, 'gradient') }).doc.layers;
  assert.equal(switched.length, 2);
  assert.equal(switched[0].type, 'gradient');
  assert.equal(switched[0].id, withSolid[0].id, 'the same layer, not a new one');
  assert.deepEqual(switched[0].motions, [{ kind: 'breathe', speed: 40, amount: 70 }]);
});

test('removing the background restores the previous list exactly', () => {
  const before = layersOf([{ id: 'fill', type: 'particles' }]);
  const after = withBackgroundKind(withBackgroundKind(before, 'gradient'), 'none');
  assert.deepEqual(after, before);
});

test('removing a background that is not there changes nothing', () => {
  const before = layersOf([{ id: 'fill', type: 'particles' }]);
  assert.deepEqual(withBackgroundKind(before, 'none'), before);
});

test('a kind nothing knows about is refused rather than stored', () => {
  const before = layersOf([{ id: 'fill', type: 'particles' }]);
  assert.deepEqual(withBackgroundKind(before, 'image'), before);
  assert.deepEqual(withBackgroundKind(before, 'nonsense'), before);
});

test('an empty document cannot be given a background — the first layer is the foreground', () => {
  assert.deepEqual(withBackgroundKind([], 'solid'), []);
});

test('the two types that leave ground show a background; the ones that cover it do not', () => {
  assert.equal(showsBackground({ type: 'particles' }), true);
  assert.equal(showsBackground({ type: 'shape' }), true);
  assert.equal(showsBackground({ type: 'solid' }), false);
  assert.equal(showsBackground({ type: 'gradient' }), false);
  assert.equal(showsBackground(null), false);
});

test('a picture shows a background only where it does not fill the canvas', () => {
  assert.equal(showsBackground({ type: 'image', fit: 'contain' }), true);
  assert.equal(showsBackground({ type: 'image', fit: 'cover' }), false);
  assert.equal(showsBackground({ type: 'image', fit: 'stretch' }), false);
});

test('a background already stored is always offered, so it can be taken off again', () => {
  const covered = layersOf([{ id: 'background', type: 'solid' }, { id: 'fill', type: 'image', fit: 'cover' }]);
  assert.equal(showsBackground(foregroundOf(covered)), false, 'the picture covers everything');
  assert.equal(offersBackground(covered), true, 'and it must still be removable');
});

test('a foreground that covers the canvas is offered nothing to hide behind it', () => {
  assert.equal(offersBackground(layersOf([{ id: 'fill', type: 'solid' }])), false);
  assert.equal(offersBackground(layersOf([{ id: 'fill', type: 'gradient' }])), false);
  assert.equal(offersBackground(layersOf([{ id: 'fill', type: 'image', fit: 'cover' }])), false);
  assert.equal(offersBackground([]), false);
});

test('the kinds a background may be are exactly the two that cover the canvas, plus none', () => {
  assert.deepEqual([...BACKGROUND_KINDS], ['none', 'solid', 'gradient']);
});
