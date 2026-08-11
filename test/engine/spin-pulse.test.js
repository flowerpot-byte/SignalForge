// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { runJobs } from '../harness/render.js';
import { pixelAt, isColour, meanDifference, meanBrightness } from '../harness/pixels.js';
import {
  MOTION_KINDS, SOLID_MOTION_KINDS, IMAGE_MOTION_KINDS, GRADIENT_MOTION_KINDS, motionKindsFor
} from '../../src/engine/document.js';
import { spinDegrees } from '../../src/engine/motion/spin.js';
import { pulseFactor } from '../../src/engine/motion/pulse.js';
import { breatheFactor, motionPhase } from '../../src/engine/motion/breathe.js';

/**
 * The two new motions, measured rather than described.
 *
 * Spin is asserted by RENDERING two frames and requiring the ramp to have
 * turned a quarter of the way round between them — a spin that merely changed
 * some pixels would pass a "the frame moved" test while turning by any amount
 * at all, including the wrong one.
 *
 * Pulse is asserted against breathe at the very same instant, because the one
 * claim that matters about it is that it is NOT breathe with another name.
 */

const A = '#ff0066';
const B = '#00b3ff';
const at = (frame, x, y) => pixelAt(frame.pixels, frame.width, x, y);
const chan = (p) => [p.r, p.g, p.b];
const apart = (p, q) => Math.max(...chan(p).map((v, i) => Math.abs(v - chan(q)[i])));

// ------------------------------------------------------ which type gets what

test('spin is offered where it can be seen, and nowhere else', () => {
  // A flat colour is invariant under rotation for exactly the reason it is
  // invariant under drift (see src/engine/layers/solid.js), and a rotated
  // photograph either shows its own corners or has to be cropped so hard that
  // half the picture is thrown away — see src/engine/document.js.
  assert.ok(GRADIENT_MOTION_KINDS.includes('spin'));
  assert.ok(!IMAGE_MOTION_KINDS.includes('spin'));
  assert.ok(!SOLID_MOTION_KINDS.includes('spin'));

  // Pulse is a factor on globalAlpha and needs to know nothing about what is
  // being drawn, so every layer type can perform it — exactly like breathe.
  for (const list of [GRADIENT_MOTION_KINDS, IMAGE_MOTION_KINDS, SOLID_MOTION_KINDS]) {
    assert.ok(list.includes('pulse'));
    assert.ok(list.includes('breathe'));
  }

  assert.deepEqual([...motionKindsFor('gradient')], [...GRADIENT_MOTION_KINDS]);
  assert.deepEqual([...motionKindsFor('image')], [...IMAGE_MOTION_KINDS]);
  assert.deepEqual([...motionKindsFor('solid')], [...SOLID_MOTION_KINDS]);
  // Every offered kind must be one the document itself accepts, or the
  // dropdown would write a value normalizeDocument then drops.
  for (const list of [GRADIENT_MOTION_KINDS, IMAGE_MOTION_KINDS, SOLID_MOTION_KINDS]) {
    for (const kind of list) assert.ok(MOTION_KINDS.includes(kind), `${kind} is not a motion kind`);
  }
});

// ---------------------------------------------------------------------- spin

test('spin turns the ramp, and by the amount the arithmetic says', async () => {
  const motion = { kind: 'spin', speed: 100, amount: 100 };
  // Linear in time, so the moment of a quarter turn is one division away
  // rather than a constant copied out of the implementation.
  const quarterTurn = 90 / spinDegrees(motion, 1);
  assert.ok(quarterTurn > 0 && Number.isFinite(quarterTurn), 'spin must actually advance with time');

  const doc = {
    name: 'Spin',
    layers: [{
      id: 'fill', type: 'gradient', shape: 'linear', angle: 0,
      stops: [{ at: 0, color: A }, { at: 100, color: B }],
      motions: [motion]
    }]
  };

  const [start, turned] = await runJobs([
    { name: 'start', kind: 'engine', timeSec: 0, doc },
    { name: 'turned', kind: 'engine', timeSec: quarterTurn, doc }
  ]);

  // At rest the ramp runs left to right: the two ends differ, the two rows do not.
  assert.ok(apart(at(start, 10, 100), at(start, 310, 100)) > 100, 'the ramp should run across');
  assert.ok(apart(at(start, 160, 10), at(start, 160, 190)) < 6, 'and not down');

  // A quarter turn later it runs top to bottom, which is the whole claim.
  assert.ok(apart(at(turned, 160, 10), at(turned, 160, 190)) > 100,
    'after a quarter turn the ramp must run down the canvas');
  assert.ok(apart(at(turned, 10, 100), at(turned, 310, 100)) < 6,
    'and no longer across it');
});

test('spin at strength zero stands still, however fast the tempo', async () => {
  const doc = (amount) => ({
    name: 'Spin',
    layers: [{
      id: 'fill', type: 'gradient', shape: 'stripes', bands: 3, angle: 0,
      stops: [{ at: 0, color: A }, { at: 100, color: B }],
      motions: [{ kind: 'spin', speed: 100, amount }]
    }]
  });
  const [still, moving] = await runJobs([
    { name: 'still', kind: 'engine', timeSec: 4.2, doc: doc(0) },
    { name: 'moving', kind: 'engine', timeSec: 4.2, doc: doc(100) }
  ]);
  const [reference] = await runJobs([{ name: 'ref', kind: 'engine', timeSec: 0, doc: doc(0) }]);
  assert.equal(meanDifference(still.pixels, reference.pixels), 0,
    'strength 0 must be exactly the resting picture, at any time');
  assert.ok(meanDifference(moving.pixels, reference.pixels) > 1,
    'strength 100 must not be — otherwise the test above measures nothing');
});

test('spin turns a conic without rebuilding it: a whole turn comes back to itself', async () => {
  const motion = { kind: 'spin', speed: 100, amount: 100 };
  const wholeTurn = 360 / spinDegrees(motion, 1);
  const doc = {
    name: 'Spin',
    layers: [{
      id: 'fill', type: 'gradient', shape: 'conic', bands: 1, angle: 0,
      stops: [{ at: 0, color: A }, { at: 100, color: B }],
      motions: [motion]
    }]
  };
  const [start, round] = await runJobs([
    { name: 'start', kind: 'engine', timeSec: 0, doc },
    { name: 'round', kind: 'engine', timeSec: wholeTurn, doc }
  ]);
  // Not byte-identical — the wheel is resampled through a rotation, and a
  // rotation by exactly 360 degrees is still a resample — but it must land
  // back on the same picture rather than somewhere else on the turn.
  assert.ok(meanDifference(start.pixels, round.pixels) < 3,
    `a full turn should return the wheel to where it started, mean difference `
      + `${meanDifference(start.pixels, round.pixels)}`);
});

// --------------------------------------------------------------------- pulse

test('pulse is a hard beat and a decay, not breathe under another name', () => {
  const motion = { kind: 'pulse', speed: 100, amount: 100 };
  const cycle = (2 * Math.PI) / motionPhase(motion, 1);

  // Full at the beat itself, and the frame after it is already falling.
  assert.equal(pulseFactor(motion, 0), 1);
  assert.ok(pulseFactor(motion, cycle * 0.05) < 0.85, 'the attack must be hard');
  // Still falling all the way through the cycle — a sine would have turned
  // back up by three quarters of the way.
  const quarter = pulseFactor(motion, cycle * 0.25);
  const half = pulseFactor(motion, cycle * 0.5);
  const most = pulseFactor(motion, cycle * 0.95);
  assert.ok(quarter > half && half > most, 'pulse must fall through the whole cycle');
  // And it snaps back to full at the next beat, which is exactly the edge a
  // sine does not have. Read just PAST the beat rather than exactly on it:
  // `cycle` is itself a division, so landing on it to the last bit is not
  // something to make an assertion depend on.
  assert.ok(pulseFactor(motion, cycle * 1.01) - most > 0.5, 'the next beat must snap back');

  // At the same instant, breathe is somewhere else entirely.
  assert.ok(Math.abs(quarter - breatheFactor(motion, cycle * 0.25)) > 0.2,
    'a quarter cycle in, pulse and breathe must not agree');

  // Strength 0 is no pulse at all, at any moment.
  const silent = { kind: 'pulse', speed: 100, amount: 0 };
  for (const t of [0, 0.3, 1.1, 4.7]) assert.equal(pulseFactor(silent, t), 1);
});

test('a solid colour can pulse, and it is visibly not the same as breathing', async () => {
  const cycle = (2 * Math.PI) / motionPhase({ speed: 100 }, 1);
  const doc = (kind) => ({
    name: 'Pulse',
    layers: [{ id: 'fill', type: 'solid', color: A, motions: [{ kind, speed: 100, amount: 100 }] }]
  });

  const [beat, faded, breathing] = await runJobs([
    { name: 'beat', kind: 'engine', timeSec: 0, doc: doc('pulse') },
    { name: 'faded', kind: 'engine', timeSec: cycle * 0.5, doc: doc('pulse') },
    { name: 'breathing', kind: 'engine', timeSec: cycle * 0.5, doc: doc('breathe') }
  ]);

  // On the beat the colour is undimmed.
  assert.ok(isColour(at(beat, 160, 100), [255, 0, 102], 3), 'the beat must be the full colour');
  // Half a cycle later it is far down.
  assert.ok(meanBrightness(faded.pixels) < meanBrightness(beat.pixels) * 0.4,
    'half a cycle after the beat the colour must have fallen away');
  // And breathe at the same instant is somewhere else.
  assert.ok(meanDifference(faded.pixels, breathing.pixels) > 5,
    'pulse and breathe must not render the same frame at the same time');
});

test('pulse and breathe together are both applied, not one instead of the other', async () => {
  const cycle = (2 * Math.PI) / motionPhase({ speed: 100 }, 1);
  const t = cycle * 0.25;
  const doc = (motions) => ({
    name: 'Both',
    layers: [{ id: 'fill', type: 'solid', color: A, motions }]
  });
  const [onlyPulse, both] = await runJobs([
    { name: 'pulse', kind: 'engine', timeSec: t, doc: doc([{ kind: 'pulse', speed: 100, amount: 100 }]) },
    { name: 'both', kind: 'engine', timeSec: t, doc: doc([
      { kind: 'pulse', speed: 100, amount: 100 },
      { kind: 'breathe', speed: 100, amount: 100 }
    ]) }
  ]);
  assert.ok(meanBrightness(both.pixels) < meanBrightness(onlyPulse.pixels),
    'the two alpha factors must multiply, not replace each other');
});
