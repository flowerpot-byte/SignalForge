// SignalForge — build SignalRGB effects from images, gradients, shapes and particles.
// Copyright (C) 2026 Max Leopold Blumenschein
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDocument } from '../../src/engine/document.js';
import { cyclePaint, rebasedCyclePhase } from '../../src/engine/motion/color-cycle.js';
import { motionPhase } from '../../src/engine/motion/breathe.js';
import { runJobs } from '../harness/render.js';
import { pixelAt, isColour, maxDifference } from '../harness/pixels.js';

/**
 * The colour cycle: blending through the CHOSEN colours, not the wheel.
 *
 * The arithmetic half is asked directly of cyclePaint; the rendering half is
 * asked of the frames, because "the solid really is that colour at that
 * moment" is a claim about pixels. The moments are not guessed: the time a
 * given phase falls on is computed by inverting the same motionPhase the
 * engine reads, so the expected colour and the rendered colour come from one
 * clock.
 */

const RED = '#ff0000';
const BLUE = '#0000ff';
const GREEN = '#00ff00';
const REST = '#123456';

/** The time at which a cycle at `speed` reaches `phase` (0..1) of its ring. */
function timeAtPhase(speed, phase) {
  // motionPhase({speed}, t) is linear in t: rate * 2PI * t.
  const perSecond = motionPhase({ speed }, 1);
  return (phase * 2 * Math.PI) / perSecond;
}

const cycler = (over = {}) => ({
  color: REST,
  cycleSpeed: 50,
  stops: [{ at: 0, color: RED }, { at: 100, color: BLUE }],
  ...over
});

// -------------------------------------------------------------- arithmetic

test('speed 0 and missing stops both mean the resting colour, exactly', () => {
  assert.equal(cyclePaint({ color: REST, cycleSpeed: 0, stops: [] }, 5), REST);
  assert.equal(cyclePaint({ color: REST }, 5), REST);
  assert.equal(cyclePaint({ color: REST, cycleSpeed: 50, stops: [{ at: 0, color: RED }] }, 5), REST);
  assert.equal(cyclePaint({ color: 'junk', cycleSpeed: 0, stops: [] }, 5), '#ff0066');
});

test('the ring starts on the first colour and visits each in order', () => {
  const layer = cycler({ stops: [{ at: 0, color: RED }, { at: 50, color: BLUE }, { at: 100, color: GREEN }] });
  assert.equal(cyclePaint(layer, 0), RED);
  // A third of the way round a three-colour ring is exactly the second colour.
  assert.equal(cyclePaint(layer, timeAtPhase(50, 1 / 3)), BLUE);
  assert.equal(cyclePaint(layer, timeAtPhase(50, 2 / 3)), GREEN);
});

test('between two colours it blends, and across the wrap it comes home', () => {
  const layer = cycler();
  // Halfway between red and blue on a two-colour ring: a quarter of the turn.
  assert.equal(cyclePaint(layer, timeAtPhase(50, 0.25)), '#800080');
  // Halfway through the SECOND segment — blue back to red — same blend.
  assert.equal(cyclePaint(layer, timeAtPhase(50, 0.75)), '#800080');
  // A whole turn is the first colour again.
  assert.equal(cyclePaint(layer, timeAtPhase(50, 1)), RED);
});

test('the at positions are stored and ignored, exactly like the particles\'', () => {
  const shuffled = cycler({ stops: [{ at: 90, color: RED }, { at: 10, color: BLUE }] });
  // Were `at` read, blue (at 10) would lead; the ORDER leads instead.
  assert.equal(cyclePaint(shuffled, 0), RED);
});

// ----------------------------------------------------- the tempo's anchor

test('changing the tempo re-parks the anchor so the colour stands still', () => {
  // The same promise the hue's cycle makes, in ring units: at the moment the
  // tempo changes, the colour must not. Checked on the painted string itself,
  // across speeds and moments.
  for (const [from, to, t, anchor] of [
    [20, 70, 9.13, 0], [70, 20, 9.13, 37.25], [1, 100, 123.4, 80],
    [50, 50, 7.7, 12], [100, 1, 0.4, 99.5]
  ]) {
    const before = cyclePaint(cycler({ cycleSpeed: from, cyclePhase: anchor }), t);
    const rebased = rebasedCyclePhase(anchor, from, to, t);
    const after = cyclePaint(cycler({ cycleSpeed: to, cyclePhase: rebased }), t);
    assert.equal(after, before,
      `tempo ${from} -> ${to} at t=${t}, anchor ${anchor}: ${before} -> ${after}`);
    assert.ok(rebased >= 0 && rebased < 100, `anchor ${rebased} left its range`);
  }
});

test('a drag is a chain of re-parks, and the chain does not drift', () => {
  // The lesson the hue rebase paid 177 degrees to learn, applied here from
  // the start: the anchor is exact (no slider, no display rounding), so 400
  // ticks of dragging the tempo back and forth must land on the very colour
  // the drag began with.
  const t = 9.13;
  let anchor = 0;
  let speed = 50;
  const before = cyclePaint(cycler({ cycleSpeed: speed, cyclePhase: anchor }), t);
  for (let pass = 0; pass < 2; pass += 1) {
    for (let v = 1; v <= 100; v += 1) { anchor = rebasedCyclePhase(anchor, speed, v, t); speed = v; }
    for (let v = 100; v >= 1; v -= 1) { anchor = rebasedCyclePhase(anchor, speed, v, t); speed = v; }
  }
  const after = cyclePaint(cycler({ cycleSpeed: speed, cyclePhase: anchor }), t);
  assert.equal(after, before, `400 ticks drifted the colour: ${before} -> ${after}`);
});

// -------------------------------------------------------------- the fields

test('a solid and a shape carry the cycle fields, filled in and clamped', () => {
  const { doc } = normalizeDocument({
    layers: [
      { id: 's', type: 'solid', cycleSpeed: 999 },
      { id: 'f', type: 'shape', cycleSpeed: -4 }
    ]
  });
  assert.equal(doc.layers[0].cycleSpeed, 100);
  assert.equal(doc.layers[1].cycleSpeed, 0);
  // The stops arrive as the gradient's own default pair, ready to be edited.
  assert.equal(doc.layers[0].stops.length, 2);
  assert.equal(doc.layers[1].stops.length, 2);
  // And the anchor: 0 by default, clamped, and NOT whole-number rounded —
  // the re-parking chain writes exact figures (see rebasedCyclePhase).
  assert.equal(doc.layers[0].cyclePhase, 0);
  const anchored = normalizeDocument({
    layers: [{ id: 's', type: 'solid', cyclePhase: 37.25 }]
  }).doc;
  assert.equal(anchored.layers[0].cyclePhase, 37.25);
});

// -------------------------------------------------------------- the pixels

test('a cycling solid renders the ring\'s own colours at the ring\'s own moments', async () => {
  const doc = {
    name: 'Cycle',
    layers: [{ id: 's', type: 'solid', ...cycler() }],
    controls: []
  };
  const [atRed, atBlend, atBlue] = await runJobs([
    { name: 'cycle-red', kind: 'engine', doc, timeSec: 0 },
    { name: 'cycle-blend', kind: 'engine', doc, timeSec: timeAtPhase(50, 0.25) },
    { name: 'cycle-blue', kind: 'engine', doc, timeSec: timeAtPhase(50, 0.5) }
  ]);
  assert.ok(isColour(pixelAt(atRed.pixels, atRed.width, 160, 100), [255, 0, 0], 0));
  assert.ok(isColour(pixelAt(atBlend.pixels, atBlend.width, 160, 100), [128, 0, 128], 1));
  assert.ok(isColour(pixelAt(atBlue.pixels, atBlue.width, 160, 100), [0, 0, 255], 0));
});

test('at speed 0 a document from before the cycle renders byte-identically', async () => {
  const before = {
    name: 'Old solid',
    layers: [{ id: 's', type: 'solid', color: REST, motions: [{ kind: 'breathe', speed: 40, amount: 60 }] }],
    controls: []
  };
  const after = {
    ...before,
    layers: [{ ...before.layers[0], stops: [{ at: 0, color: RED }, { at: 100, color: BLUE }], cycleSpeed: 0 }]
  };
  const [plain, carrying] = await runJobs([
    { name: 'no-cycle-fields', kind: 'engine', doc: before, timeSec: 1.7 },
    { name: 'cycle-at-rest', kind: 'engine', doc: after, timeSec: 1.7 }
  ]);
  assert.equal(maxDifference(plain.pixels, carrying.pixels), 0,
    'cycleSpeed 0 must be the untouched code path, stops or no stops');
});
