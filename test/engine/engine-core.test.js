// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { runJobs } from '../harness/render.js';
import { meanBrightness, pixelAt } from '../harness/pixels.js';

test('engine renders a 320x200 canvas and clears unknown layers to black', async (t) => {
  t.diagnostic('launches Electron once for both jobs');
  const [empty, unknown] = await runJobs([
    { name: 'empty', kind: 'engine', doc: { layers: [] }, timeSec: 0 },
    { name: 'unknown', kind: 'engine', doc: { layers: [{ type: 'does-not-exist' }] }, timeSec: 3 }
  ]);

  assert.equal(empty.width, 320);
  assert.equal(empty.height, 200);
  assert.equal(meanBrightness(empty.pixels), 0);
  assert.deepEqual(pixelAt(empty.pixels, 320, 0, 0), { r: 0, g: 0, b: 0, a: 255 });

  // An unknown layer type must be skipped, not crash the whole effect.
  assert.equal(meanBrightness(unknown.pixels), 0);
});
