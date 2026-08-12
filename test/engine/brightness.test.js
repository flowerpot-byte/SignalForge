// SignalForge — build SignalRGB effects from images, gradients, shapes and particles.
// Copyright (C) 2026 Max Leopold Blumenschein
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

// A picture whose channels are nowhere near 255, so "brighter" can be measured
// without the ceiling swallowing the answer. The quadrant PNG above is made of
// pure red, green, blue and white -- every one of its channels is either 0 or
// 255, so at brightness 150 it would come back byte-identical to 100 and prove
// nothing. This is the same 4x4 shape in four dim greys instead (32/64/96/128).
const DIM_QUADRANTS = 'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAF0lEQVR42mNQAAMHMGBA4SSAQQMYoHAAL0MPAVJGgowAAAAASUVORK5CYII=';

function dimDocWith(brightness) {
  const doc = {
    assets: { q: { kind: 'image', mime: 'image/png', data: DIM_QUADRANTS } },
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

test('brightness above 100 actually brightens, and 100 is byte-identical to no brightness at all', async () => {
  // The complaint this exists for: 100 used to be the ceiling, so the slider
  // could only ever darken. Rendered pixels, not arithmetic on paper -- the
  // value has to survive normalizeDocument, the clamp in applyFinish and the
  // pixel pass to count.
  const jobs = [
    { name: 'none', kind: 'engine', timeSec: 0, doc: dimDocWith(undefined) },
    { name: 'b100', kind: 'engine', timeSec: 0, doc: dimDocWith(100) },
    { name: 'b150', kind: 'engine', timeSec: 0, doc: dimDocWith(150) },
    { name: 'b200', kind: 'engine', timeSec: 0, doc: dimDocWith(200) }
  ];
  const byName = Object.fromEntries((await runJobs(jobs)).map((r) => [r.name, r]));

  // 100 must still be the exact no-op it was before the range widened: same
  // pixels as a document that carries no brightness field at all.
  assert.equal(meanDifference(byName.none.pixels, byName.b100.pixels), 0);

  const at100 = meanBrightness(byName.b100.pixels);
  const at150 = meanBrightness(byName.b150.pixels);
  const at200 = meanBrightness(byName.b200.pixels);

  assert.ok(at100 > 0, 'the reference frame must actually show something');
  assert.ok(at150 > at100, `150 (${at150}) must be brighter than 100 (${at100})`);
  assert.ok(at200 > at150, `200 (${at200}) must be brighter than 150 (${at150})`);

  // And brighter by the amount a plain linear gain promises, not by a token
  // nudge. The test picture's channels top out at 128, so nothing clips even
  // at 200 and the ratios are exact rather than approximate.
  assert.ok(Math.abs(at150 / at100 - 1.5) < 0.02, `expected 1.5x at 150, got ${at150 / at100}`);
  assert.ok(Math.abs(at200 / at100 - 2.0) < 0.02, `expected 2.0x at 200, got ${at200 / at100}`);
});
