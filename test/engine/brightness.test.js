// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { runJobs } from '../harness/render.js';
import { meanBrightness, meanDifference } from '../harness/pixels.js';

// 4x4 PNG: red / green / blue / white quadrants, two pixels each way. Not a
// flat colour, so a brightness bug that only touched, say, one channel or
// one quadrant would still show up in the mean.
const QUADRANTS = 'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAHklEQVR42mXJsQ0AAAgDIOr/P9fVRFZSkMI4QtE/C5t8BQM0UanVAAAAAElFTkSuQmCC';

function docWith(brightness) {
  const doc = {
    assets: { q: { kind: 'image', mime: 'image/png', data: QUADRANTS } },
    layers: [{ type: 'image', asset: 'q', fit: 'stretch' }]
  };
  if (brightness !== undefined) doc.brightness = brightness;
  return doc;
}

test('document brightness dims the finished frame, and 100 leaves it unchanged', async () => {
  const jobs = [
    { name: 'no-field', kind: 'engine', timeSec: 0, doc: docWith(undefined) },
    { name: 'full', kind: 'engine', timeSec: 0, doc: docWith(100) },
    { name: 'half', kind: 'engine', timeSec: 0, doc: docWith(50) },
    { name: 'zero', kind: 'engine', timeSec: 0, doc: docWith(0) }
  ];
  const byName = Object.fromEntries((await runJobs(jobs)).map((r) => [r.name, r]));

  // Omitting brightness entirely must behave exactly like today: normalizeDocument
  // defaults it to 100, and 100 must be a byte-for-byte no-op.
  assert.equal(meanDifference(byName['no-field'].pixels, byName.full.pixels), 0);

  const full = meanBrightness(byName.full.pixels);
  const half = meanBrightness(byName.half.pixels);
  const zero = meanBrightness(byName.zero.pixels);

  assert.ok(full > 0, 'the full-brightness frame must actually show something');
  assert.ok(Math.abs(half / full - 0.5) < 0.02, `expected half brightness at 50, got ${half / full}`);
  assert.ok(zero < full * 0.02, `expected brightness 0 to be (near) black, got ${zero} vs ${full}`);
});
