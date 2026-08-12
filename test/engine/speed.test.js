// SignalForge — build SignalRGB effects from images, gradients, shapes and particles.
// Copyright (C) 2026 Max Leopold Blumenschein
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { speedToRate } from '../../src/engine/motion/speed.js';
import { SPEED_SCALE } from '../../src/engine/motion/breathe.js';

// The three anchors this curve is built on, pinned here so moving one is a
// decision somebody has to make on purpose rather than a side effect.
//
//   0   -> 0        the slider's bottom is a full stop, not a crawl
//   15  -> 0.15     the default, and the ONE anchor that must never move:
//                   every project and every exported effect already out there
//                   was built against it
//   100 -> 7        the ceiling, raised from 1
//
// The ceiling was 1 only because the mapping this curve replaced was
// speed/100, where 100/100 is 1; nothing ever chose it. What it came to in
// practice was measured: a full breathe cycle at tempo 100 took 10.47
// seconds, which is why "even at maximum speed far too slow" came back from
// hardware. 7 makes that cycle 1.50 seconds. Both numbers were confirmed by
// rendering, not by arithmetic on paper -- see .superpowers/sdd/
// quickfixes-report.md.
const ANCHORS = Object.freeze([[0, 0], [15, 0.15], [100, 7]]);

test('speedToRate hits its three anchors exactly', () => {
  for (const [speed, rate] of ANCHORS) {
    assert.equal(speedToRate(speed), rate, `speedToRate(${speed}) must be exactly ${rate}`);
  }
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

test('raising the ceiling left every rate at and below the default exactly where it was', () => {
  // The anchor rule, stated as an assertion instead of as a promise in a
  // comment. These are the values the curve produced before MAX_RATE moved
  // from 1 to 7, taken from the table in src/engine/motion/speed.js. The whole
  // segment below the default ends AT the default, which is nailed down, so
  // nothing in it may shift by so much as a bit -- an effect Max exported
  // yesterday at tempo 5 must still run at tempo 5's old speed today.
  const unchanged = [
    [1, 0.019015347785635947],
    [5, 0.07768800471550884],
    [10, 0.12326337898313962],
    [15, 0.15]
  ];
  for (const [speed, rate] of unchanged) {
    assert.equal(speedToRate(speed), rate, `speedToRate(${speed}) must not have moved`);
  }
});

test('the whole segment above the default is the old curve scaled by one single factor', () => {
  // Not a re-tuned curve: the same normalized ease, stretched onto a taller
  // range. Every rate above the default keeps its shape and gains the same
  // multiple of its distance above the default, which is why the slider still
  // feels the way it did and simply reaches further.
  const factor = (7 - 0.15) / (1 - 0.15);
  // What the old curve produced above the default, before the ceiling moved.
  const before = [
    [20, 0.1712205814323405],
    [30, 0.22015113614802845],
    [50, 0.3505143759213063],
    [80, 0.6658796769486909]
  ];
  for (const [speed, old] of before) {
    const expected = 0.15 + (old - 0.15) * factor;
    const actual = speedToRate(speed);
    assert.ok(
      Math.abs(actual - expected) < 1e-12,
      `speedToRate(${speed})=${actual} is not the old ${old} scaled by ${factor} (${expected})`
    );
  }
});

test('speedToRate(100) is far enough above the old ceiling to answer "far too slow at maximum"', () => {
  // Falsifiable on purpose, and aimed at the complaint rather than at the
  // constant: a full breathe cycle is 2*PI / (rate * SPEED_SCALE) seconds.
  // Anything slower than about two seconds at the very top of the slider is
  // the thing that was reported; anything faster than about one second stops
  // reading as a breath at all and starts reading as a flicker.
  const cycleSeconds = (2 * Math.PI) / (speedToRate(100) * SPEED_SCALE);
  assert.ok(cycleSeconds < 2, `a breathe cycle at tempo 100 takes ${cycleSeconds}s, which is still slow`);
  assert.ok(cycleSeconds > 1, `a breathe cycle at tempo 100 takes ${cycleSeconds}s, which is a flicker, not a breath`);
});

test('speedToRate is steeper than the old linear mapping near the very bottom of the range', () => {
  // Reading A (the one implemented): the low segment starts steep at speed 0
  // and flattens out as it approaches the default (speed 15) -- its
  // average slope across [0, 15] is pinned to the old constant 1/100 (the
  // chord from (0,0) to (15, 0.15) has exactly that slope), so a steeper
  // start necessarily means a flatter finish, not an optional extra. This
  // checks the "steeper start" half directly, near speed 1: small slider
  // moves there should change the rate MORE than the old flat 1/100 slope
  // did, giving a bigger felt change at the slow extreme.
  const step = 0.001;
  const slope = (speedToRate(1 + step) - speedToRate(1 - step)) / (2 * step);
  assert.ok(slope > 1 / 100, `local slope near speed 1 (${slope}) is not steeper than the old constant 0.01`);
});

test('speedToRate flattens out just below the default, the mirror of the steep start', () => {
  // The low segment's average slope across [0, 15] is pinned to 1/100 (see
  // above), so the steep start near speed 1 must be balanced by a flatter
  // finish just below the default (speed 15) -- checked near speed 14.
  const step = 0.001;
  const slope = (speedToRate(14 + step) - speedToRate(14 - step)) / (2 * step);
  assert.ok(slope < 1 / 100, `local slope near speed 14 (${slope}) is not flatter than the old constant 0.01`);
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
  assert.equal(speedToRate(500), 7);
  assert.equal(speedToRate(NaN), 0);
  assert.equal(speedToRate(undefined), 0);
});
