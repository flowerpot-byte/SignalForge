// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max Leopold Blumenschein
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDocument } from '../../src/engine/document.js';
import { runJobs } from '../harness/render.js';
import { meanDifference, meanBrightness } from '../harness/pixels.js';

test('a single legacy motion becomes a one-entry list', () => {
  const { doc } = normalizeDocument({
    layers: [{ type: 'image', motion: { kind: 'warp', speed: 40, amount: 60 } }]
  });
  assert.deepEqual(doc.layers[0].motions, [{ kind: 'warp', speed: 40, amount: 60 }]);
  assert.equal(doc.layers[0].motion, undefined, 'the old singular field must not survive');
});

test('a layer with neither motion nor motions gets an empty list, not a "none" entry', () => {
  const { doc } = normalizeDocument({ layers: [{ type: 'image' }] });
  assert.deepEqual(doc.layers[0].motions, []);
});

test('several motions are kept in order', () => {
  const { doc } = normalizeDocument({
    layers: [{ type: 'image', motions: [
      { kind: 'warp', speed: 20, amount: 30 },
      { kind: 'breathe', speed: 8, amount: 50 }
    ] }]
  });
  assert.equal(doc.layers[0].motions.length, 2);
  assert.equal(doc.layers[0].motions[0].kind, 'warp');
  assert.equal(doc.layers[0].motions[1].kind, 'breathe');
});

test('each entry gets its own defaults and clamping', () => {
  const { doc } = normalizeDocument({
    layers: [{ type: 'image', motions: [{ kind: 'drift' }, { kind: 'breathe', speed: 500, amount: -20 }] }]
  });
  assert.deepEqual(doc.layers[0].motions[0], { kind: 'drift', speed: 15, amount: 30 });
  assert.deepEqual(doc.layers[0].motions[1], { kind: 'breathe', speed: 100, amount: 0 });
});

test('an unknown kind is dropped and reported, not silently rendered as nothing', () => {
  const { doc, problems } = normalizeDocument({
    layers: [{ id: 'a1', type: 'image', motions: [{ kind: 'wobble' }, { kind: 'warp' }] }]
  });
  assert.equal(doc.layers[0].motions.length, 1);
  assert.equal(doc.layers[0].motions[0].kind, 'warp');
  assert.equal(problems.length, 1);
  assert.match(problems[0], /wobble/);
});

test('a "none" entry is kept as an honest inert placeholder, not dropped', () => {
  // "none" is a real member of MOTION_KINDS -- it is the motion combobox's
  // own default value -- so it is normalized like any other kind (clamped
  // speed/amount, kept in the list) instead of being special-cased away.
  // render() (layers/image.js) already ignores any entry whose kind isn't
  // drift/warp/breathe, so a stored "none" entry renders exactly like an
  // empty list. See test/export/motion-control.test.js for the reason this
  // matters: it is what lets sfexport.js bake a truthful `--motion none`
  // document instead of a fake "warp" placeholder.
  const { doc } = normalizeDocument({
    layers: [{ type: 'image', motions: [{ kind: 'none', speed: 40, amount: 60 }, { kind: 'warp' }] }]
  });
  assert.equal(doc.layers[0].motions.length, 2);
  assert.deepEqual(doc.layers[0].motions[0], { kind: 'none', speed: 40, amount: 60 });
  assert.equal(doc.layers[0].motions[1].kind, 'warp');
});

test('duplicate motion kinds: the first occurrence wins and the later one is dropped and reported', () => {
  // render() picks a kind's entry with `motions.find(...)`, which would
  // otherwise silently pick whichever of two same-kind entries happens to
  // come first in the array -- a "depends on how the user sorted the list"
  // surprise. normalizeDocument resolves this explicitly instead.
  const { doc, problems } = normalizeDocument({
    layers: [{ id: 'a1', type: 'image', motions: [
      { kind: 'warp', speed: 10, amount: 20 },
      { kind: 'warp', speed: 90, amount: 95 }
    ] }]
  });
  assert.equal(doc.layers[0].motions.length, 1);
  assert.deepEqual(doc.layers[0].motions[0], { kind: 'warp', speed: 10, amount: 20 });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /duplicate/i);
  assert.match(problems[0], /warp/);
});

test('duplicate motion kinds of an unrelated kind do not interfere with each other', () => {
  const { doc, problems } = normalizeDocument({
    layers: [{ id: 'a1', type: 'image', motions: [
      { kind: 'warp', speed: 10, amount: 20 },
      { kind: 'breathe', speed: 50, amount: 50 },
      { kind: 'warp', speed: 90, amount: 95 }
    ] }]
  });
  assert.equal(doc.layers[0].motions.length, 2);
  assert.equal(doc.layers[0].motions[0].kind, 'warp');
  assert.equal(doc.layers[0].motions[0].speed, 10);
  assert.equal(doc.layers[0].motions[1].kind, 'breathe');
  assert.equal(problems.length, 1);
  assert.match(problems[0], /duplicate/i);
});

test('motions wins when both fields are present, and that is reported', () => {
  const { doc, problems } = normalizeDocument({
    layers: [{ id: 'a1', type: 'image', motion: { kind: 'drift' }, motions: [{ kind: 'warp' }] }]
  });
  assert.equal(doc.layers[0].motions.length, 1);
  assert.equal(doc.layers[0].motions[0].kind, 'warp');
  assert.equal(problems.length, 1);
  assert.match(problems[0], /both/i);
});

const QUADRANTS = 'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAHklEQVR42mXJsQ0AAAgDIOr/P9fVRFZSkMI4QtE/C5t8BQM0UanVAAAAAElFTkSuQmCC';

function doc(motions) {
  return {
    assets: { q: { kind: 'image', mime: 'image/png', data: QUADRANTS } },
    layers: [{ id: 'a1', type: 'image', asset: 'q', fit: 'stretch', motions }]
  };
}

test('warp and breathe together differ from either alone', async () => {
  const t = 3.3;
  const r = Object.fromEntries((await runJobs([
    { name: 'warp', kind: 'engine', timeSec: t, doc: doc([{ kind: 'warp', speed: 60, amount: 60 }]) },
    { name: 'breathe', kind: 'engine', timeSec: t, doc: doc([{ kind: 'breathe', speed: 60, amount: 80 }]) },
    { name: 'both', kind: 'engine', timeSec: t, doc: doc([
      { kind: 'warp', speed: 60, amount: 60 }, { kind: 'breathe', speed: 60, amount: 80 }]) },
    { name: 'still', kind: 'engine', timeSec: t, doc: doc([]) }
  ])).map((x) => [x.name, x]));

  assert.ok(meanDifference(r.both.pixels, r.warp.pixels) > 1, 'both should differ from warp alone');
  assert.ok(meanDifference(r.both.pixels, r.breathe.pixels) > 1, 'both should differ from breathe alone');
  // breathe dims; the combination must be dimmer than warp alone at the same instant
  assert.ok(meanBrightness(r.both.pixels) < meanBrightness(r.warp.pixels));
  // an empty list really is still
  assert.equal(meanDifference(r.still.pixels, r.still.pixels), 0);
});

test('a stored "none" entry renders pixel-identical to an empty motions list, at any time', async () => {
  const t = 7.1;
  const [none, empty] = await runJobs([
    { name: 'none', kind: 'engine', timeSec: t, doc: doc([{ kind: 'none', speed: 80, amount: 90 }]) },
    { name: 'empty', kind: 'engine', timeSec: t, doc: doc([]) }
  ]);
  assert.equal(meanDifference(none.pixels, empty.pixels), 0,
    'a "none" entry must render exactly like having no motion at all, whatever speed/amount it carries');
});
