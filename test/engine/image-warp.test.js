// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { runJobs } from '../harness/render.js';
import { meanBrightness, meanDifference, pixelAt } from '../harness/pixels.js';

const QUADRANTS = 'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAHklEQVR42mXJsQ0AAAgDIOr/P9fVRFZSkMI4QtE/C5t8BQM0UanVAAAAAElFTkSuQmCC';

function warpDoc(amount, timeSecIgnored) {
  return {
    assets: { q: { kind: 'image', mime: 'image/png', data: QUADRANTS } },
    layers: [{ type: 'image', asset: 'q', fit: 'stretch', motion: { kind: 'warp', speed: 60, amount } }]
  };
}

test('warp moves the picture without draining or blowing out its colours', async () => {
  const jobs = [
    { name: 'still', kind: 'engine', timeSec: 0, doc: { assets: warpDoc(0).assets, layers: [{ type: 'image', asset: 'q', fit: 'stretch', motion: { kind: 'none' } }] } },
    { name: 'zero-a', kind: 'engine', timeSec: 0, doc: warpDoc(0) },
    { name: 'zero-b', kind: 'engine', timeSec: 30, doc: warpDoc(0) },
    { name: 'warp-a', kind: 'engine', timeSec: 0, doc: warpDoc(60) },
    { name: 'warp-b', kind: 'engine', timeSec: 12, doc: warpDoc(60) },
    { name: 'warp-a-again', kind: 'engine', timeSec: 0, doc: warpDoc(60) },
    { name: 'warp-max', kind: 'engine', timeSec: 5, doc: warpDoc(100) }
  ];
  const r = Object.fromEntries((await runJobs(jobs)).map((x) => [x.name, x]));

  // Amount 0 is a still picture, whatever the clock says.
  assert.equal(meanDifference(r['zero-a'].pixels, r['zero-b'].pixels), 0);

  // Same time, same frame — the engine must be deterministic.
  assert.equal(meanDifference(r['warp-a'].pixels, r['warp-a-again'].pixels), 0);

  // Different time, different frame.
  assert.ok(meanDifference(r['warp-a'].pixels, r['warp-b'].pixels) > 1);

  // Warping moves colour around, it does not create or destroy it.
  const still = meanBrightness(r.still.pixels);
  for (const name of ['warp-a', 'warp-b', 'warp-max']) {
    const value = meanBrightness(r[name].pixels);
    assert.ok(Math.abs(value - still) / still < 0.12, `${name} brightness drifted to ${value} from ${still}`);
  }

  // The padded buffer must keep the frame edges filled — no black border creeping in.
  for (const [x, y] of [[0, 0], [319, 0], [0, 199], [319, 199], [160, 0], [0, 100]]) {
    const p = pixelAt(r['warp-max'].pixels, 320, x, y);
    assert.ok(p.r + p.g + p.b > 30, `edge pixel ${x},${y} went black: ${JSON.stringify(p)}`);
  }
});
