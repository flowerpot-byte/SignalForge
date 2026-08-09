// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { speedToRate } from '../../src/engine/motion/speed.js';

test('speedToRate starts at 0 and ends at exactly 1', () => {
  assert.equal(speedToRate(0), 0);
  assert.equal(speedToRate(100), 1);
});

test('speedToRate is monotonically increasing across the whole slider range, including across the join at the default', () => {
  // A coarse, integer-only sweep would step clean over a discontinuity or a
  // non-monotonic wobble sitting inside a single integer step -- especially
  // right at the join (speed 15), where two independently-curved segments
  // meet. Sample in hundredths of a slider unit instead.
  let previous = -Infinity;
  for (let hundredths = 0; hundredths <= 10000; hundredths += 1) {
    const s = hundredths / 100;
    const value = speedToRate(s);
    assert.ok(value > previous, `speedToRate(${s})=${value} did not increase past ${previous}`);
    previous = value;
  }
});

test('speedToRate(15), the tempo default, equals the old linear value exactly', () => {
  // The whole point of anchoring a third point at the default: unlike a
  // single exponential across the full range (which is mathematically
  // forced to pull every interior point below the chord), two segments
  // joined exactly at the default reproduce today's linear value there
  // bit-for-bit, while both segments remain free to curve on either side.
  assert.equal(speedToRate(15), 0.15);
});

test('speedToRate is flatter than the old linear mapping near the very bottom of the range', () => {
  // Reading B (the one implemented): the low segment starts flat at speed 0
  // and only steepens as it approaches the default (speed 15) -- its
  // average slope across [0, 15] is pinned to the old constant 1/100 (the
  // chord from (0,0) to (15, 0.15) has exactly that slope), so a flatter
  // start necessarily means a steeper finish, not an optional extra. This
  // checks the "flatter start" half directly, near speed 1: small slider
  // moves there should change the rate less than the old flat 1/100 slope
  // did, freeing up slider room for fine adjustment at the slow end.
  const step = 0.001;
  const slope = (speedToRate(1 + step) - speedToRate(1 - step)) / (2 * step);
  assert.ok(slope < 1 / 100, `local slope near speed 1 (${slope}) is not flatter than the old constant 0.01`);
});

test('speedToRate compresses the top of the range', () => {
  // The slope must end up bigger than the old constant by speed 100 -- that
  // is what makes the top of the slider coarse (many slider positions look
  // the same), continuing the character the single-curve version had.
  const step = 0.001;
  const slope = (speedToRate(100) - speedToRate(100 - step)) / step;
  assert.ok(slope > 1 / 100, `local slope at speed 100 (${slope}) is not steeper than the old constant 0.01`);
});

test('speedToRate clamps out-of-range and non-numeric input instead of producing NaN', () => {
  assert.equal(speedToRate(-50), 0);
  assert.equal(speedToRate(500), 1);
  assert.equal(speedToRate(NaN), 0);
  assert.equal(speedToRate(undefined), 0);
});
