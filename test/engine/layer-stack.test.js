// SignalForge — build SignalRGB effects from images, gradients, shapes and particles.
// Copyright (C) 2026 Max Leopold Blumenschein
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  foregroundLayersOf, movedLayer, withoutLayer, withAddedLayer
} from '../../src/engine/slots.js';

/**
 * The layer stack's arithmetic — Bauplan 3's first stone. Pure array
 * operations, so the whole of it is asked here in plain node, before any
 * card or button exists to click.
 */

const L = (id, type = 'shape') => ({ id, type });
const ids = (layers) => layers.map((layer) => layer.id);

test('the stack is everything above the background — or everything at all', () => {
  assert.deepEqual(ids(foregroundLayersOf([L('bg', 'gradient'), L('a'), L('b')])), ['a', 'b']);
  assert.deepEqual(ids(foregroundLayersOf([L('bg', 'solid'), L('a')])), ['a']);
});

test('a first layer that is no background kind is the bottom of the stack, not a slot', () => {
  // The hand-written document the slot words never covered: an image below a
  // figure. backgroundKindOf reads "none", so BOTH are stack layers — the
  // middle-layer hole in the two-slot model closes here.
  const layers = [L('picture', 'image'), L('fig')];
  assert.deepEqual(ids(foregroundLayersOf(layers)), ['picture', 'fig']);
});

test('a single layer is a stack of one, never a background', () => {
  assert.deepEqual(ids(foregroundLayersOf([L('only')])), ['only']);
  assert.deepEqual(foregroundLayersOf([]), []);
  assert.deepEqual(foregroundLayersOf('junk'), []);
});

test('moving steps through the stack and never into the background slot', () => {
  const layers = [L('bg', 'solid'), L('a'), L('b'), L('c')];
  assert.deepEqual(ids(movedLayer(layers, 'a', +1)), ['bg', 'b', 'a', 'c']);
  assert.deepEqual(ids(movedLayer(layers, 'c', -1)), ['bg', 'a', 'c', 'b']);
  // The edges: top stays top, bottom stays above the background.
  assert.deepEqual(ids(movedLayer(layers, 'c', +1)), ['bg', 'a', 'b', 'c']);
  assert.deepEqual(ids(movedLayer(layers, 'a', -1)), ['bg', 'a', 'b', 'c']);
  // The background itself is not the stack's to move.
  assert.deepEqual(ids(movedLayer(layers, 'bg', +1)), ['bg', 'a', 'b', 'c']);
  // An unknown id moves nothing.
  assert.deepEqual(ids(movedLayer(layers, 'ghost', +1)), ['bg', 'a', 'b', 'c']);
  // And the input array is never touched.
  assert.deepEqual(ids(layers), ['bg', 'a', 'b', 'c']);
});

test('without a background the bottom stack layer still cannot sink below zero', () => {
  const layers = [L('a'), L('b')];
  assert.deepEqual(ids(movedLayer(layers, 'a', -1)), ['a', 'b']);
  assert.deepEqual(ids(movedLayer(layers, 'a', +1)), ['b', 'a']);
});

test('removing takes a stack layer out, but never the last one and never the slot', () => {
  const layers = [L('bg', 'gradient'), L('a'), L('b')];
  assert.deepEqual(ids(withoutLayer(layers, 'a')), ['bg', 'b']);
  // The last stack layer stays — removing it would promote the background by
  // pure position and silently change what every slot word means.
  assert.deepEqual(ids(withoutLayer([L('bg', 'solid'), L('only')], 'only')), ['bg', 'only']);
  assert.deepEqual(ids(withoutLayer([L('only')], 'only')), ['only']);
  // The background slot is withBackgroundKind's to empty, not this function's.
  assert.deepEqual(ids(withoutLayer(layers, 'bg')), ['bg', 'a', 'b']);
  assert.deepEqual(ids(withoutLayer(layers, 'ghost')), ['bg', 'a', 'b']);
});

test('adding puts a fresh layer of the named type on top, under a free id', () => {
  const grown = withAddedLayer([L('bg', 'solid'), L('shape')], 'shape');
  assert.deepEqual(ids(grown), ['bg', 'shape', 'shape-2']);
  assert.equal(grown[2].type, 'shape');
  assert.deepEqual(grown[2].motions, []);
  // Nothing but the type is named — normalizeDocument fills the rest in.
  assert.deepEqual(Object.keys(grown[2]).sort(), ['id', 'motions', 'type']);
  const third = withAddedLayer(grown, 'shape');
  assert.equal(third[3].id, 'shape-3');
});
