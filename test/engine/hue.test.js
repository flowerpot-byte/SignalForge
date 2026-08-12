// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max Leopold Blumenschein
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { adjustColor, isNeutral, hueCoefficients, NEUTRAL_COLOR } from '../../src/engine/color.js';
import { hueDegrees } from '../../src/engine/motion/hue.js';
import { speedToRate } from '../../src/engine/motion/speed.js';
import { SPEED_SCALE } from '../../src/engine/motion/breathe.js';
import { normalizeDocument, MAX_HUE_SHIFT } from '../../src/engine/document.js';

const NEUTRAL = { saturation: 100, greenMagenta: 0, blueYellow: 0 };
const px = (r, g, b) => Uint8ClampedArray.from([r, g, b, 255]);
const close = (actual, expected, tolerance, what) => assert.ok(
  Math.abs(actual - expected) <= tolerance,
  `${what}: expected about ${expected}, got ${actual}`
);

// --------------------------------------------------------- the three numbers

test('the rotation leaves grey exactly where it was, at every angle', () => {
  // a + b + c === 1 is the whole of this claim: every channel of a grey pixel
  // is the same number, so it comes out multiplied by the row sum. If that
  // sum ever drifted from 1 the picture would brighten or darken as the hue
  // turned, which on a light strip reads as a flicker rather than a colour
  // cycle.
  for (const degrees of [0, 1, 17, 45, 90, 120, 180, 217, 240, 300, 359, 360]) {
    const { a, b, c } = hueCoefficients(degrees);
    close(a + b + c, 1, 1e-12, `row sum at ${degrees} degrees`);
  }
});

test('no rotation at all is the identity', () => {
  const { a, b, c } = hueCoefficients(0);
  assert.equal(a, 1);
  assert.equal(b, 0);
  assert.equal(c, 0);
});

test('a third of a turn is exactly a swap of the three channels', () => {
  // The reason this rotation was chosen over the luma one CSS uses: at 120
  // degrees it is not an approximation of anything, it is r -> g -> b -> r.
  const { a, b, c } = hueCoefficients(120);
  close(a, 0, 1e-12, 'a');
  close(b, 0, 1e-12, 'b');
  close(c, 1, 1e-12, 'c');
});

// ------------------------------------------------------ known colours moving

test('red turned a third of a turn is green, and another third is blue', () => {
  const red = px(255, 0, 0);
  adjustColor(red, { ...NEUTRAL, hue: 120 });
  assert.deepEqual(Array.from(red), [0, 255, 0, 255]);

  const alsoRed = px(255, 0, 0);
  adjustColor(alsoRed, { ...NEUTRAL, hue: 240 });
  assert.deepEqual(Array.from(alsoRed), [0, 0, 255, 255]);
});

test('red turned a sixth of a turn is the yellow the arithmetic says it is', () => {
  // Worked out by hand rather than by running the code, which is the only way
  // this test can catch the code being wrong. At 60 degrees:
  //   cos = 0.5, share = (1 - 0.5) / 3 = 1/6, swing = sin(60) / sqrt(3) = 0.5
  //   a = 0.5 + 1/6 = 2/3,  b = 1/6 - 0.5 = -1/3,  c = 1/6 + 0.5 = 2/3
  // so (255, 0, 0) wants (2/3 * 255, 2/3 * 255, -1/3 * 255) = (170, 170, -85),
  // and the negative blue is clamped away on write. The hue is exactly the
  // yellow that was asked for; what is lost is brightness, because a fully
  // saturated red has nowhere to go but outside the cube. See hueCoefficients.
  const data = px(255, 0, 0);
  adjustColor(data, { ...NEUTRAL, hue: 60 });
  assert.deepEqual(Array.from(data), [170, 170, 0, 255]);
});

test('a colour that stays inside the cube keeps its total brightness', () => {
  // (150, 100, 50) sums to 300 and sits well inside, so nothing clips and the
  // sum-preserving property is measurable rather than hidden by the clamp.
  for (const degrees of [30, 90, 150, 210, 330]) {
    const data = px(150, 100, 50);
    adjustColor(data, { ...NEUTRAL, hue: degrees });
    for (let i = 0; i < 3; i += 1) {
      assert.ok(data[i] > 0 && data[i] < 255, `channel ${i} clipped at ${degrees} degrees`);
    }
    close(data[0] + data[1] + data[2], 300, 2, `channel sum at ${degrees} degrees`);
  }
});

test('a grey pixel is still exactly that grey after any rotation', () => {
  for (const degrees of [7, 45, 120, 200, 359]) {
    const data = px(128, 128, 128);
    adjustColor(data, { ...NEUTRAL, hue: degrees });
    assert.deepEqual(Array.from(data).slice(0, 3), [128, 128, 128], `at ${degrees} degrees`);
  }
});

test('the alpha channel is never touched by a rotation', () => {
  const data = Uint8ClampedArray.from([10, 200, 30, 77]);
  adjustColor(data, { ...NEUTRAL, hue: 95 });
  assert.equal(data[3], 77);
});

test('no rotation of any colour can leave the byte range', () => {
  for (const [r, g, b] of [[0, 0, 0], [255, 255, 255], [255, 0, 0], [0, 255, 0], [0, 0, 255],
    [255, 255, 0], [1, 254, 3]]) {
    for (const degrees of [15, 75, 135, 195, 255, 315]) {
      const data = px(r, g, b);
      adjustColor(data, { ...NEUTRAL, hue: degrees });
      for (let i = 0; i < 3; i += 1) {
        assert.ok(data[i] >= 0 && data[i] <= 255, `channel ${i} = ${data[i]}`);
      }
    }
  }
});

// ------------------------------------------------------------- what is neutral

test('a hue of nothing is neutral, and so is a whole turn', () => {
  assert.equal(isNeutral({ ...NEUTRAL, hue: 0 }), true);
  assert.equal(isNeutral({ ...NEUTRAL, hue: 360 }), true);
  assert.equal(isNeutral({ ...NEUTRAL, hue: -360 }), true);
  assert.equal(isNeutral({ ...NEUTRAL, hue: 1 }), false);
  assert.equal(isNeutral({ ...NEUTRAL, hue: 359 }), false);
});

test('a caller from before the hue axis is still neutral, and so is a broken one', () => {
  // Three fields and no hue at all is what every caller written before this
  // hands over, and it has to go on meaning "change nothing" — otherwise the
  // shared pixel pass would start running for documents nobody has touched.
  assert.equal(isNeutral(NEUTRAL), true);
  // NaN is the dangerous one: it is not equal to 0, so a naive test would call
  // it a rotation, and cos(NaN) would turn the whole frame black.
  assert.equal(isNeutral({ ...NEUTRAL, hue: NaN }), true);
  assert.equal(isNeutral({ ...NEUTRAL, hue: Infinity }), true);
  assert.equal(isNeutral({ ...NEUTRAL, hue: 'purple' }), true);
});

test('the stated neutral carries the hue axis too', () => {
  assert.equal(isNeutral(NEUTRAL_COLOR), true);
  assert.equal(NEUTRAL_COLOR.hue, 0);
});

test('a rotation of nothing changes not one byte', () => {
  const data = px(200, 40, 90);
  adjustColor(data, { ...NEUTRAL, hue: 0 });
  assert.deepEqual(Array.from(data), [200, 40, 90, 255]);
});

// ------------------------------------------------------ where the wheel stands

test('with no cycle the wheel simply sits where it was parked', () => {
  for (const timeSec of [0, 1, 60, 3600]) {
    assert.equal(hueDegrees(137, 0, timeSec), 137);
  }
});

test('a cycle turns the wheel and a parked angle adds to it', () => {
  // One cycle of the shared clock is one whole turn, so the angle at any
  // moment is the phase in turns, times 360 — computed here from the same two
  // published constants the rest of the app's motions use, not from a copy of
  // the number this function came up with.
  const cycle = 40;
  const timeSec = 0.7;
  const expected = ((timeSec * speedToRate(cycle) * SPEED_SCALE) / (2 * Math.PI)) * 360;
  close(hueDegrees(0, cycle, timeSec), expected, 1e-9, 'turned by the cycle alone');
  close(hueDegrees(50, cycle, timeSec), (50 + expected) % 360, 1e-9, 'parked plus turned');
});

test('a whole turn at full tempo takes as long as a breath does', () => {
  // The promise the tempo control makes across the whole app: the same number
  // means the same tempo whatever is moving. speedToRate(100) is 7 and
  // SPEED_SCALE is 0.6, so one cycle — one breath, one pulse, one whole turn
  // of the colour wheel — is 2*PI / (7 * 0.6) = 1.496 seconds.
  const cycleSeconds = (2 * Math.PI) / (speedToRate(100) * SPEED_SCALE);
  close(cycleSeconds, 1.496, 0.01, 'one cycle at tempo 100');
  // Half a turn halfway through it, and back to the start at the end of it.
  close(hueDegrees(0, 100, cycleSeconds / 2), 180, 1e-6, 'halfway');
  close(hueDegrees(0, 100, cycleSeconds), 0, 1e-6, 'a whole turn is back where it started');
});

test('the angle is always somewhere on the wheel, however long it has been running', () => {
  for (const timeSec of [0, 3, 97, 4000]) {
    const degrees = hueDegrees(200, 80, timeSec);
    assert.ok(degrees >= 0 && degrees < 360, `${degrees} is not on the wheel at t=${timeSec}`);
  }
});

test('junk in either field is no rotation rather than a black frame', () => {
  assert.equal(hueDegrees(undefined, undefined, 5), 0);
  assert.equal(hueDegrees(NaN, NaN, 5), 0);
  assert.equal(hueDegrees('left a bit', 'quickly', 5), 0);
});

// -------------------------------------------------------------- the document

test('a document says the wheel is unturned and still until it is told otherwise', () => {
  const { doc } = normalizeDocument({});
  assert.equal(doc.hueShift, 0);
  assert.equal(doc.hueCycle, 0);
});

test('both hue fields are clamped to what the sliders offer', () => {
  const high = normalizeDocument({ hueShift: 1e6, hueCycle: 1e6 }).doc;
  assert.equal(high.hueShift, MAX_HUE_SHIFT);
  assert.equal(high.hueCycle, 100);
  const low = normalizeDocument({ hueShift: -1e6, hueCycle: -1e6 }).doc;
  assert.equal(low.hueShift, 0);
  assert.equal(low.hueCycle, 0);
  const junk = normalizeDocument({ hueShift: 'round a bit', hueCycle: null }).doc;
  assert.equal(junk.hueShift, 0);
  assert.equal(junk.hueCycle, 0);
});
