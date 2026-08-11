// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { runJobs } from '../harness/render.js';
import { pixelAt, isColour, blackShare, meanBrightness, maxDifference } from '../harness/pixels.js';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../../src/engine/document.js';

/**
 * The particle layer's PIXELS, in a real browser.
 *
 * test/engine/particles.test.js has already proved the arithmetic without a
 * canvas anywhere near it. This file asks the questions only a frame can
 * answer: is anything actually drawn, does it leave the layers underneath
 * alone, does it cover the canvas rather than clumping in a corner, does it
 * move — and does a wake appear behind it, which is the whole reason
 * docs/effekt-inventur.md section C2 says this layer type is the one the trail
 * was built for.
 */

const INK = '#ff0066';
const UNDER = '#00b3ff';
const UNDER_RGB = [0, 179, 255];

/** One particle layer, alone, with everything else left to normalizeDocument. */
function swarm(layer = {}, extra = {}) {
  return {
    name: 'Swarm',
    layers: [{
      id: 'swarm', type: 'particles', motions: [],
      stops: [{ at: 0, color: INK }, { at: 100, color: INK }],
      ...layer
    }],
    controls: [],
    ...extra
  };
}

test('a swarm draws something, and leaves the layer underneath showing between the particles', async () => {
  // THE RULE THIS LAYER TYPE CANNOT BREAK. A particle layer that ever reached
  // for a fillRect would cover the canvas, hide every layer beneath it and hide
  // its own wake — which is the one thing src/engine/layers/particles.js says
  // it exists not to do. Nothing else in this suite would notice: the frame
  // would still be full of colour and still be different from the frame before.
  //
  // So: a flat blue underneath, a swarm of pink on top, and BOTH have to be in
  // the finished frame.
  const [frame, alone] = await runJobs([
    {
      name: 'over-solid',
      kind: 'engine',
      doc: {
        name: 'Swarm over a colour',
        layers: [
          { id: 'under', type: 'solid', color: UNDER, motions: [] },
          {
            id: 'swarm', type: 'particles', count: 60, size: 4, speed: 0, seed: 4,
            stops: [{ at: 0, color: INK }, { at: 100, color: INK }], motions: []
          }
        ],
        controls: []
      },
      timeSec: 0
    },
    { name: 'alone', kind: 'engine', doc: swarm({ count: 60, size: 4, speed: 0, seed: 4 }), timeSec: 0 }
  ]);

  // The swarm on its own leaves most of the canvas untouched — that is what
  // "never covers" means, measured rather than asserted.
  assert.ok(blackShare(alone.pixels) > 0.6,
    `a swarm of 60 small particles covered ${((1 - blackShare(alone.pixels)) * 100).toFixed(1)} % `
    + 'of the canvas; it is not supposed to cover it at all');
  assert.ok(meanBrightness(alone.pixels) > 1, 'the swarm drew nothing at all');

  // Over the solid, the solid must still be visible somewhere: count the pixels
  // that are still exactly the layer underneath.
  let untouched = 0;
  for (let y = 0; y < CANVAS_HEIGHT; y += 1) {
    for (let x = 0; x < CANVAS_WIDTH; x += 1) {
      if (isColour(pixelAt(frame.pixels, frame.width, x, y), UNDER_RGB)) untouched += 1;
    }
  }
  const share = untouched / (CANVAS_WIDTH * CANVAS_HEIGHT);
  assert.ok(share > 0.6,
    `only ${(share * 100).toFixed(1)} % of the layer underneath survived the swarm — `
    + 'a particle layer must not paint the pixels it is not on');
});

test('the swarm reaches every part of the canvas, at every angle', async () => {
  // The spans are the canvas's own shadow in the rotated frame, so a swarm
  // covers evenly whichever way it is pointed. A projection written the wrong
  // way round would leave a wedge or a band empty, and at a right angle it
  // might well look fine — which is why the awkward angles are here.
  const tilts = [0, 37, -37, 90, 143, -124, 180];
  const jobs = tilts.map((tilt) => ({
    name: `lean-${tilt}`,
    kind: 'engine',
    doc: swarm({ tilt, count: 400, size: 5, speed: 0, seed: 2 }),
    timeSec: 0
  }));
  const frames = await runJobs(jobs);

  for (const [at, frame] of frames.entries()) {
    // A four by three grid of the canvas; every cell has to hold some ink.
    const cellW = CANVAS_WIDTH / 4;
    const cellH = CANVAS_HEIGHT / 3;
    for (let row = 0; row < 3; row += 1) {
      for (let column = 0; column < 4; column += 1) {
        let lit = 0;
        for (let y = Math.floor(row * cellH); y < (row + 1) * cellH; y += 1) {
          for (let x = Math.floor(column * cellW); x < (column + 1) * cellW; x += 1) {
            const dot = pixelAt(frame.pixels, frame.width, x, y);
            if (dot.r + dot.g + dot.b > 20) lit += 1;
          }
        }
        assert.ok(lit > 0,
          `leaning ${tilts[at]} the cell at row ${row}, column ${column} is completely empty`);
      }
    }
  }
});

test('the swarm travels, and two seeds put it in different places', async () => {
  const [early, later, otherSeed] = await runJobs([
    { name: 'early', kind: 'engine', doc: swarm({ count: 120, size: 5, seed: 1 }), timeSec: 0 },
    { name: 'later', kind: 'engine', doc: swarm({ count: 120, size: 5, seed: 1 }), timeSec: 0.9 },
    { name: 'other-seed', kind: 'engine', doc: swarm({ count: 120, size: 5, seed: 2 }), timeSec: 0 }
  ]);
  assert.ok(meanBrightness(early.pixels) > 1, 'nothing was drawn');
  assert.ok(maxDifference(early.pixels, later.pixels) > 0,
    'not one pixel changed in nine tenths of a second — the swarm is standing still');
  assert.ok(maxDifference(early.pixels, otherSeed.pixels) > 0,
    'two seeds produced the identical frame — the seed slider does nothing');
});

test('the same document renders the same frame twice, from two fresh renderers', async () => {
  // The parity promise stated at the level of a whole frame. Two jobs, two
  // renderers, two caches built from nothing — and not one byte between them.
  const doc = swarm({ pattern: 'snow', count: 200, size: 6, tilt: 23, seed: 21, speed: 40 });
  const [once, twice] = await runJobs([
    { name: 'once', kind: 'engine', doc, timeSec: 2.5 },
    { name: 'twice', kind: 'engine', doc, timeSec: 2.5 }
  ]);
  assert.ok(meanBrightness(once.pixels) > 1, 'nothing was drawn');
  assert.equal(maxDifference(once.pixels, twice.pixels), 0,
    'two fresh renderers disagreed about the same document at the same second');
});

test('rain with a trail leaves a wake, and the wake is behind the drops', async () => {
  // ------------------------------------------------------------------------
  // THE PAIRING THIS WHOLE LAYER TYPE WAS BUILT FOR
  // ------------------------------------------------------------------------
  //
  // docs/effekt-inventur.md, section A2, counts a veil in at least eight of the
  // 31 effects read and says it is what makes particles look like sparks and
  // rain rather than like dots. Section C2 ends by naming particles as the
  // veil's real beneficiary, because they never cover the canvas.
  //
  // A wake cannot be measured from one frame — it is what is LEFT of the frames
  // before — so both sides are run as a sequence from frame zero, which is the
  // only honest way to ask a trailing document anything (see the note on
  // parity in src/engine/engine.js).
  const doc = swarm({ pattern: 'rain', count: 40, size: 4, speed: 45, seed: 6 });
  const frames = Array.from({ length: 24 }, (unused, i) => i / 30);
  const [withWake, without] = await runJobs([
    { name: 'trail', kind: 'engine', doc: { ...doc, trail: 70 }, frames },
    { name: 'no-trail', kind: 'engine', doc: { ...doc, trail: 0 }, frames }
  ]);

  // There is simply more light on the canvas, because the past is still on it.
  const lit = meanBrightness(withWake.pixels);
  const bare = meanBrightness(without.pixels);
  assert.ok(lit > bare * 1.5,
    `a wake should put visibly more light on the canvas: ${lit.toFixed(2)} with a trail `
    + `against ${bare.toFixed(2)} without`);

  // AND IT IS IN THE RIGHT PLACE, which is the assertion that makes this about
  // a wake rather than about brightness. Rain at angle 90 falls DOWNWARDS, so
  // every drop's tail is ABOVE it. Take each column's brightest pixel — the
  // drop itself — and look at how much light sits above it against below it.
  let above = 0;
  let below = 0;
  for (let x = 0; x < CANVAS_WIDTH; x += 1) {
    let brightestAt = -1;
    let brightest = 0;
    for (let y = 0; y < CANVAS_HEIGHT; y += 1) {
      const dot = pixelAt(withWake.pixels, withWake.width, x, y);
      const value = dot.r + dot.g + dot.b;
      if (value > brightest) { brightest = value; brightestAt = y; }
    }
    // Only columns that actually hold a drop, and only where there is room on
    // both sides to compare.
    if (brightest < 60 || brightestAt < 30 || brightestAt > CANVAS_HEIGHT - 30) continue;
    for (let step = 1; step <= 25; step += 1) {
      const up = pixelAt(withWake.pixels, withWake.width, x, brightestAt - step);
      const down = pixelAt(withWake.pixels, withWake.width, x, brightestAt + step);
      above += up.r + up.g + up.b;
      below += down.r + down.g + down.b;
    }
  }
  assert.ok(above > 0, 'no drop with room around it was found at all');
  assert.ok(above > below * 1.3,
    `the wake must sit behind the drops: ${above} of light above them against ${below} below, `
    + 'which is not a tail, it is a glow');
});
