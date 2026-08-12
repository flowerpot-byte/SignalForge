// SignalForge — build SignalRGB effects from images, gradients, shapes and particles.
// Copyright (C) 2026 Max Leopold Blumenschein
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { runJobs } from '../harness/render.js';
import { meanBrightness, pixelAt, isColour, meanDifference } from '../harness/pixels.js';
import { speedToRate } from '../../src/engine/motion/speed.js';
import { SPEED_SCALE } from '../../src/engine/motion/breathe.js';

// 4x4 PNG: red / green / blue / white quadrants, two pixels each way.
const QUADRANTS = 'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAHklEQVR42mXJsQ0AAAgDIOr/P9fVRFZSkMI4QtE/C5t8BQM0UanVAAAAAElFTkSuQmCC';

// The breathe cycle starts at full brightness and dips. Its darkest point is
// half a cycle in: phase = timeSec * speedToRate(speed) * SPEED_SCALE must
// equal PI. Both numbers are read out of the engine rather than written down
// here, because both have moved once already: speedToRate(100) is the tempo
// curve's ceiling, which was raised from 1 to 7 to answer "far too slow even
// at maximum speed". A hand-computed constant would have quietly started
// sampling some arbitrary point of a much faster cycle instead of its darkest.
const BREATHE_DARKEST_AT = Math.PI / (speedToRate(100) * SPEED_SCALE);

function docWith(layer) {
  return {
    assets: { q: { kind: 'image', mime: 'image/png', data: QUADRANTS } },
    layers: [{ type: 'image', asset: 'q', ...layer }]
  };
}

test('image layer draws the picture and honours fit, opacity and motion', async () => {
  const jobs = [
    { name: 'stretch', kind: 'engine', timeSec: 0, doc: docWith({ fit: 'stretch' }) },
    { name: 'half', kind: 'engine', timeSec: 0, doc: docWith({ fit: 'stretch', opacity: 0.5 }) },
    { name: 'contain', kind: 'engine', timeSec: 0, doc: docWith({ fit: 'contain' }) },
    { name: 'still-a', kind: 'engine', timeSec: 0, doc: docWith({ fit: 'stretch', motion: { kind: 'none' } }) },
    { name: 'still-b', kind: 'engine', timeSec: 40, doc: docWith({ fit: 'stretch', motion: { kind: 'none' } }) },
    { name: 'breathe-bright', kind: 'engine', timeSec: 0, doc: docWith({ fit: 'stretch', motion: { kind: 'breathe', speed: 100, amount: 100 } }) },
    { name: 'breathe-dark', kind: 'engine', timeSec: BREATHE_DARKEST_AT, doc: docWith({ fit: 'stretch', motion: { kind: 'breathe', speed: 100, amount: 100 } }) },
    { name: 'drift-a', kind: 'engine', timeSec: 0, doc: docWith({ fit: 'cover', motion: { kind: 'drift', speed: 100, amount: 100 } }) },
    { name: 'drift-b', kind: 'engine', timeSec: 20, doc: docWith({ fit: 'cover', motion: { kind: 'drift', speed: 100, amount: 100 } }) },
    { name: 'missing', kind: 'engine', timeSec: 0, doc: { layers: [{ type: 'image', asset: 'nope' }] } }
  ];
  const byName = Object.fromEntries((await runJobs(jobs)).map((r) => [r.name, r]));

  // Stretch: each corner of the canvas shows its quadrant's colour.
  const s = byName.stretch;
  assert.ok(isColour(pixelAt(s.pixels, 320, 8, 8), [255, 0, 0]), 'top left should be red');
  assert.ok(isColour(pixelAt(s.pixels, 320, 311, 8), [0, 255, 0]), 'top right should be green');
  assert.ok(isColour(pixelAt(s.pixels, 320, 8, 191), [0, 0, 255]), 'bottom left should be blue');
  assert.ok(isColour(pixelAt(s.pixels, 320, 311, 191), [255, 255, 255]), 'bottom right should be white');

  // Opacity 0.5 over black halves the brightness.
  const full = meanBrightness(s.pixels);
  const half = meanBrightness(byName.half.pixels);
  assert.ok(Math.abs(half / full - 0.5) < 0.02, `expected half brightness, got ${half / full}`);

  // Contain letterboxes rather than cropping. The test picture is SQUARE, so on
  // a 320x200 canvas it fills the full height and the bars fall left and right
  // (dw = 200, dx = 60) — not top and bottom.
  assert.deepEqual(pixelAt(byName.contain.pixels, 320, 8, 100), { r: 0, g: 0, b: 0, a: 255 }, 'left bar');
  assert.deepEqual(pixelAt(byName.contain.pixels, 320, 311, 100), { r: 0, g: 0, b: 0, a: 255 }, 'right bar');
  assert.ok(meanBrightness(byName.contain.pixels) > 0, 'something must be drawn between the bars');

  // motion "none" must be perfectly still.
  assert.equal(meanDifference(byName['still-a'].pixels, byName['still-b'].pixels), 0);

  // breathe starts at full brightness and dips to its darkest half a cycle in.
  const bright = meanBrightness(byName['breathe-bright'].pixels);
  assert.ok(Math.abs(bright - full) < 0.5, `breathe at t=0 should be full brightness, got ${bright} vs ${full}`);
  assert.ok(meanBrightness(byName['breathe-dark'].pixels) < full * 0.45);

  // drift moves the picture without changing what is in it.
  const driftDelta = meanDifference(byName['drift-a'].pixels, byName['drift-b'].pixels);
  assert.ok(driftDelta > 1, `drift should move, mean delta was ${driftDelta}`);

  // A missing asset is skipped, not a crash.
  assert.equal(meanBrightness(byName.missing.pixels), 0);
});
