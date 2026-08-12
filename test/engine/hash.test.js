// SignalForge — build SignalRGB effects from images, gradients, shapes and particles.
// Copyright (C) 2026 Max Leopold Blumenschein
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { mix32, seedHash, unitFrom, hashUnit, HASH_RANGE } from '../../src/engine/hash.js';

/**
 * The seeded-noise primitive, which is what stands where `Math.random` is
 * banned (see the long note in src/engine/hash.js).
 *
 * Two kinds of test here and both are needed:
 *
 *  - THE VECTORS pin the exact numbers. They are a regression lock and nothing
 *    else: they cannot tell a good mixer from a bad one, they can only tell
 *    that this one has not changed. That matters because every particle effect
 *    anybody exports bakes this scatter into itself — retune a constant and
 *    every saved effect rearranges itself.
 *  - THE PROPERTIES are the falsifiable claims the doc comment makes: one to
 *    one, evenly spread, channels unrelated to each other, seeds unrelated to
 *    each other. A mixer that passed the vectors but failed these would be a
 *    mixer that had been copied down wrong.
 */

test('mix32 hands back the same numbers it always has', () => {
  // Generated from the implementation and then frozen. If this test goes red,
  // the question to ask is NOT "what are the new numbers" — it is "who changed
  // the mixer, and do they know it rearranges every exported particle effect".
  assert.deepEqual(
    [0, 1, 2, 3, 42, 1000, 0x7fffffff, 0x80000000, 0xffffffff].map(mix32),
    [0, 69681622, 4057983209, 3237000519, 2590465940, 400571038,
      943411498, 963800214, 310335631]
  );
});

test('mix32 has exactly one fixed point and the seed is salted past it', () => {
  // Zero maps to zero: shifting, xoring and multiplying zero all give zero, so
  // every step of the mixer leaves it alone. The doc comment says so out loud
  // rather than hiding it, and this is the assertion that keeps that honest.
  assert.equal(mix32(0), 0);
  // ...which is exactly why seedHash salts. Without the salt, seed 0 particle 0
  // would draw a fraction of exactly 0.0 on channel 0 — one dot pinned to the
  // edge of its span in the default document, for ever.
  assert.notEqual(seedHash(0, 0), 0);
  assert.notEqual(unitFrom(seedHash(0, 0), 0), 0);
});

test('mix32 is one to one, so no two particles can collide', () => {
  // The property the whole design leans on: distinct inputs, distinct outputs,
  // always. Swept rather than trusted — a mixer copied down with one wrong
  // shift is still a function, it is just no longer a bijection, and the
  // visible symptom would be two particles sharing a position now and then.
  const seen = new Set();
  const sweep = 400000;
  for (let value = 0; value < sweep; value += 1) seen.add(mix32(value));
  assert.equal(seen.size, sweep, 'mix32 collided within the first 400000 inputs');
});

test('mix32 fills the whole 32-bit range and stays a non-negative whole number', () => {
  // Math.imul hands back a SIGNED 32-bit value, so a missing `>>> 0` at the end
  // would let negative numbers out — and dividing one of those by HASH_RANGE
  // gives a negative "fraction", which as a spawn position is off the canvas
  // and as a list index is a crash. Cheap to assert, and it is the one mistake
  // this function is genuinely easy to make.
  let sawHigh = false;
  for (let value = 0; value < 20000; value += 1) {
    const mixed = mix32(value);
    assert.ok(Number.isInteger(mixed) && mixed >= 0 && mixed < HASH_RANGE,
      `mix32(${value}) = ${mixed} is not a uint32`);
    if (mixed > HASH_RANGE / 2) sawHigh = true;
  }
  assert.ok(sawHigh, 'nothing ever landed in the top half of the range');
});

test('seedHash and unitFrom hand back the numbers they always have', () => {
  assert.deepEqual(
    [[0, 0], [0, 1], [1, 0], [7, 3], [9999, 199]].map(([seed, i]) => seedHash(seed, i)),
    [146975875, 3088977911, 2811877909, 773962746, 3885575658]
  );
  assert.deepEqual(
    [[0, 0, 0], [0, 0, 1], [7, 3, 2]].map(([seed, i, c]) => unitFrom(seedHash(seed, i), c)),
    [0.66354153980501, 0.32329954602755606, 0.6690576458349824]
  );
});

test('a draw is a fraction in [0, 1) and never reaches either bad end', () => {
  // Half open is what lets a caller write floor(u * stops.length) and know the
  // index can never be one past the end, and put a particle at u * span and
  // know it never lands exactly on the far edge. Swept over the whole domain a
  // real document can reach: every seed a slider can produce is more than this,
  // but 201 seeds x 400 particles x 8 channels is 643200 draws and none of them
  // may be 0 or 1.
  let lowest = 1;
  let highest = 0;
  for (let seed = 0; seed <= 200; seed += 1) {
    for (let index = 0; index < 400; index += 1) {
      const base = seedHash(seed, index);
      for (let channel = 0; channel < 8; channel += 1) {
        const drawn = unitFrom(base, channel);
        assert.ok(drawn >= 0 && drawn < 1, `draw out of range: ${drawn}`);
        // Exactly 0 is the fixed point leaking through; exactly 1 is impossible
        // by construction but would mean the divisor was wrong.
        assert.notEqual(drawn, 0);
        if (drawn < lowest) lowest = drawn;
        if (drawn > highest) highest = drawn;
      }
    }
  }
  // And it does genuinely use the whole span rather than hugging the middle.
  assert.ok(lowest < 0.001, `nothing ever landed near 0, lowest was ${lowest}`);
  assert.ok(highest > 0.999, `nothing ever landed near 1, highest was ${highest}`);
});

test('draws spread evenly rather than clumping', () => {
  // Sixteen buckets over twenty thousand particles: 1250 each if it were
  // perfect. The bound is deliberately loose — this is a check for a BROKEN
  // mixer (one that leaves the high bits untouched puts everything in one or
  // two buckets), not a statistical proof of anything.
  const buckets = new Array(16).fill(0);
  const draws = 20000;
  for (let index = 0; index < draws; index += 1) {
    buckets[Math.floor(unitFrom(seedHash(7, index), 0) * 16)] += 1;
  }
  const expected = draws / 16;
  for (const [at, count] of buckets.entries()) {
    assert.ok(Math.abs(count - expected) < expected * 0.25,
      `bucket ${at} held ${count} of an expected ${expected}: ${buckets.join(' ')}`);
  }
});

test('two channels of one particle are unrelated to each other', () => {
  // The claim that lets one particle's spawn position, phase, size and speed
  // all come off the same base hash without any of them predicting another. If
  // the channel were sliced out of the base's bits instead of mixed in, this is
  // the test that would notice.
  const draws = 20000;
  let sumA = 0;
  let sumB = 0;
  let sumAB = 0;
  let sumAA = 0;
  let sumBB = 0;
  for (let index = 0; index < draws; index += 1) {
    const base = seedHash(3, index);
    const a = unitFrom(base, 0);
    const b = unitFrom(base, 1);
    sumA += a; sumB += b; sumAB += a * b; sumAA += a * a; sumBB += b * b;
  }
  const correlation = (draws * sumAB - sumA * sumB)
    / Math.sqrt((draws * sumAA - sumA * sumA) * (draws * sumBB - sumB * sumB));
  assert.ok(Math.abs(correlation) < 0.05,
    `channel 0 and channel 1 are correlated at ${correlation}`);
});

test('two seeds one apart give two unrelated scatters', () => {
  // What the seed field is FOR: nudging it by one has to reshuffle everything,
  // not shift it. Without mixing the seed before folding the index in, seed 1
  // particle 0 and seed 0 particle 1 would be the same particle and the two
  // families would overlap almost entirely.
  const draws = 5000;
  let almostSame = 0;
  for (let index = 0; index < draws; index += 1) {
    const a = unitFrom(seedHash(1, index), 0);
    const b = unitFrom(seedHash(2, index), 0);
    if (Math.abs(a - b) < 0.001) almostSame += 1;
  }
  // Two independent uniform draws land within 0.001 of each other about 0.2 %
  // of the time, so about 10 of 5000 is what chance alone gives. A seed that
  // merely shifted the family would put this in the thousands.
  assert.ok(almostSame < 50,
    `${almostSame} of ${draws} particles barely moved between seed 1 and seed 2`);
});

test('hashUnit is the two halves in one call', () => {
  // The convenience form exists so a caller with a single draw to make does not
  // have to know the primitive comes in two halves. It must not be a second
  // implementation of it.
  for (const [seed, index, channel] of [[0, 0, 0], [7, 3, 2], [9999, 199, 5]]) {
    assert.equal(hashUnit(seed, index, channel), unitFrom(seedHash(seed, index), channel));
  }
});
