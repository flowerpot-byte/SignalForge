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

test('speedToRate is monotonically increasing across the whole slider range', () => {
  let previous = speedToRate(0);
  for (let s = 1; s <= 100; s += 1) {
    const value = speedToRate(s);
    assert.ok(value > previous, `speedToRate(${s})=${value} did not increase past ${previous}`);
    previous = value;
  }
});

test('speedToRate(15), the tempo default, stays close to the old linear value of 0.15', () => {
  const value = speedToRate(15);
  // Not identical -- the whole point is a gentler slope around the default
  // -- but "recognisably close" means the same order of magnitude and a
  // clearly slow-ambient pace, not a different-feeling default.
  assert.ok(value > 0.05 && value < 0.15, `speedToRate(15)=${value} is not close to 0.15`);
});

test('speedToRate gives a gentler slope around the default than the old linear mapping', () => {
  // The old mapping's slope was a flat 1/100 everywhere. Right around the
  // default (speed 15), the new curve's local slope must be smaller, so the
  // same slider nudge produces a smaller change in rate there -- finer,
  // more deliberate control exactly where the user complained it was missing.
  const step = 0.001;
  const slope = (speedToRate(15 + step) - speedToRate(15 - step)) / (2 * step);
  assert.ok(slope < 1 / 100, `local slope at speed 15 (${slope}) is not gentler than the old constant 0.01`);
});

test('speedToRate compresses the top of the range instead of the bottom', () => {
  // The slope must end up bigger than the old constant by speed 100 -- that
  // is what makes the top of the slider coarse (many slider positions look
  // the same) instead of the bottom.
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
