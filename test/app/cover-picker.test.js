// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { createCoverPicker } from '../../app/renderer/components/cover-picker.js';

/**
 * The picker's own arithmetic, driven as main.js drives it. The scenario the
 * review caught the first version leaking on: choosing a picture twice left
 * the first tile behind as an orphaned asset — in the document, in every
 * saved project, in every exported file.
 */

function harness({ doc, results }) {
  const state = { doc, errors: [], changed: 0, refreshed: 0 };
  const queue = [...results];
  const picker = createCoverPicker({
    chooseCover: async () => queue.shift(),
    getDocument: () => state.doc,
    setDocument: async (next) => { state.doc = next; },
    markChanged: () => { state.changed += 1; },
    refresh: () => { state.refreshed += 1; },
    onError: (message) => state.errors.push(message)
  });
  return { picker, state };
}

const tile = (data) => ({ ok: true, canceled: false, asset: { kind: 'image', mime: 'image/png', data } });

test('choosing twice replaces the tile — it must not pile up orphans', async () => {
  const { picker, state } = harness({
    doc: { cover: null, layers: [], assets: {} },
    results: [tile('AAAA'), tile('BBBB'), tile('CCCC')]
  });
  await picker.choose();
  await picker.choose();
  await picker.choose();
  assert.equal(Object.keys(state.doc.assets).length, 1,
    `three choices left ${Object.keys(state.doc.assets).join(', ')}`);
  assert.equal(state.doc.assets[state.doc.cover].data, 'CCCC', 'the last choice is the tile');
  assert.equal(state.changed, 3);
  assert.equal(state.refreshed, 3);
});

test('a cover that is also a layer\'s picture is never deleted', async () => {
  const { picker, state } = harness({
    doc: {
      cover: 'photo',
      layers: [{ id: 'a', type: 'image', asset: 'photo' }],
      assets: { photo: { kind: 'image', mime: 'image/png', data: 'PIC' } }
    },
    results: [tile('NEW')]
  });
  await picker.choose();
  assert.ok(state.doc.assets.photo, 'the layer still has its picture');
  assert.equal(state.doc.assets[state.doc.cover].data, 'NEW');

  await picker.clear();
  assert.ok(state.doc.assets.photo, 'clearing must not blank the layer either');
  assert.equal(state.doc.cover, null);
  assert.equal(Object.keys(state.doc.assets).length, 1, 'only the layer picture remains');
});

test('cancel changes nothing; an error reaches the one visible line', async () => {
  const { picker, state } = harness({
    doc: { cover: null, layers: [], assets: {} },
    results: [{ ok: false, canceled: true }, { ok: false, canceled: false, message: 'zu gross' }]
  });
  await picker.choose();
  assert.equal(state.changed, 0);
  assert.deepEqual(state.errors, []);
  await picker.choose();
  assert.equal(state.changed, 0);
  assert.deepEqual(state.errors, ['zu gross']);
});

test('clear on an automatic tile is a no-op', async () => {
  const { picker, state } = harness({
    doc: { cover: null, layers: [], assets: { kept: { kind: 'image', mime: 'image/png', data: 'X' } } },
    results: []
  });
  await picker.clear();
  assert.equal(state.changed, 0);
  assert.ok(state.doc.assets.kept);
});
