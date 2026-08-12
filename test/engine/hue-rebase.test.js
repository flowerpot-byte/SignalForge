// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max Leopold Blumenschein
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { hueDegrees, rebasedHueShift } from '../../src/engine/motion/hue.js';

/**
 * The whole point of rebasedHueShift, measured rather than believed: at the
 * moment the cycle changes, the angle must not. hueDegrees is the one
 * definition of "the angle", so the invariant is stated against it —
 *
 *     hueDegrees(rebased, to, t) === hueDegrees(shift, from, t)
 *
 * to within the half degree the deliberate whole-degree rounding may cost
 * (see the note on rounding beside rebasedHueShift in src/engine/motion/hue.js).
 */

/** Distance between two angles on the wheel, so 359.8 and 0.1 are 0.3 apart. */
function angleGap(a, b) {
  const raw = Math.abs(a - b) % 360;
  return raw > 180 ? 360 - raw : raw;
}

test('changing the cycle re-parks the shift so the angle stands still', () => {
  const shifts = [0, 1, 100, 137.25, 359.5];
  const cycles = [0, 1, 15, 40, 100];
  const times = [0, 0.4, 7.31, 59.97, 600];
  let checked = 0;
  for (const shift of shifts) {
    for (const from of cycles) {
      for (const to of cycles) {
        for (const t of times) {
          const rebased = rebasedHueShift(shift, from, to, t);
          const before = hueDegrees(shift, from, t);
          const after = hueDegrees(rebased, to, t);
          // Exact, not "within the rounding": the function no longer rounds
          // (a chain of rounded steps drifted, see its note), so all that is
          // left between the two sides is float noise.
          assert.ok(angleGap(before, after) <= 1e-9,
            `shift ${shift}, cycle ${from} -> ${to} at t=${t}: `
              + `angle moved ${before} -> ${after}`);
          checked += 1;
        }
      }
    }
  }
  assert.ok(checked >= 600, `only ${checked} combinations were tried`);
});

test('the result is wrapped into [0, 360), whatever went in', () => {
  for (const [shift, from, to, t] of [
    [137.25, 15, 40, 7.31], [0, 100, 1, 600], [359.5, 0, 100, 0.4]
  ]) {
    const rebased = rebasedHueShift(shift, from, to, t);
    assert.ok(Number.isFinite(rebased), `${rebased} is not a number`);
    assert.ok(rebased >= 0 && rebased < 360, `${rebased} is outside [0, 360)`);
  }
});

test('a drag is a CHAIN of rebases, and the chain does not drift', () => {
  // The measured fault of the first version: each input tick of a drag
  // rebases from the previous tick's result, and rounding inside the
  // function made 400 ticks of dragging back and forth drift the hue by up
  // to 177 degrees. The function is exact now, so the whole chain must hold
  // the angle to float noise — this is the test that pins that, and with
  // rounding put back it fails by three digits.
  const t = 9.13;
  let shift = 123;
  let cycle = 50;
  const before = hueDegrees(shift, cycle, t);
  // Back and forth across the slider's whole range, twice — 400 ticks.
  const walk = [];
  for (let pass = 0; pass < 2; pass += 1) {
    for (let v = 1; v <= 100; v += 1) walk.push(v);
    for (let v = 100; v >= 1; v -= 1) walk.push(v);
  }
  for (const next of walk) {
    shift = rebasedHueShift(shift, cycle, next, t);
    cycle = next;
  }
  const after = hueDegrees(shift, cycle, t);
  assert.ok(angleGap(before, after) <= 1e-6,
    `400 ticks drifted the angle: ${before} -> ${after}`);
});

test('at t=0 nothing has turned, so nothing is re-parked', () => {
  assert.equal(rebasedHueShift(123, 15, 80, 0), 123);
  assert.equal(rebasedHueShift(0, 0, 100, 0), 0);
});

test('a broken time is treated as t=0, not ridden into the document', () => {
  // rebasedHueShift is exported engine arithmetic now; a NaN time from some
  // future caller must not come back as NaN and be written into a slider.
  assert.equal(rebasedHueShift(100, 15, 40, undefined), 100);
  assert.equal(rebasedHueShift(100, 15, 40, NaN), 100);
  assert.equal(rebasedHueShift(100, 15, 40, 'junk'), 100);
});

test('the same cycle twice is not a change', () => {
  assert.equal(rebasedHueShift(200, 40, 40, 123.45), 200);
});

test('junk arrives as the fallback the renderer would use, not a crash', () => {
  const rebased = rebasedHueShift('junk', 15, 40, 5);
  assert.ok(Number.isFinite(rebased) && rebased >= 0 && rebased < 360);
  // The renderer treats an unreadable shift as 0 (hueDegrees does), so the
  // rebase must start from the same 0 — the invariant, on the junk itself.
  assert.ok(angleGap(hueDegrees(rebased, 40, 5), hueDegrees('junk', 15, 5)) <= 1e-9);
});
