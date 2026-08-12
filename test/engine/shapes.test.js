// SignalForge — build SignalRGB effects from images, gradients, shapes and particles.
// Copyright (C) 2026 Max Leopold Blumenschein
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { runJobs } from '../harness/render.js';
import { pixelAt, isColour, maxDifference, meanBrightness, blackShare } from '../harness/pixels.js';
import {
  CANVAS_WIDTH, CANVAS_HEIGHT, GRADIENT_SHAPES, DEFAULT_BANDS,
  MIN_BANDS, MAX_BANDS, normalizeDocument, colorAtPosition
} from '../../src/engine/document.js';

/**
 * The three shapes that are not a plain ramp, measured on the pixels they
 * actually produce.
 *
 * Every assertion below names a place on the canvas and the colour arithmetic
 * says must be there — a conic's colour at a given angle, a stripe's band
 * edges, a wave's period — rather than "the frame changed". A shape that is
 * merely different from linear would pass a change test and still be wrong.
 *
 * The tolerances are stated per group and are not slack: the conic is built
 * from wedges and scaled, so it is sampled away from its own boundaries and
 * compared with a wider tolerance than the stripes, which have exact edges.
 */

const A = '#ff0066';
const B = '#00b3ff';

const rgb = (hex) => [
  parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)
];

/** One gradient layer, alone, with everything else at its default. */
function shapeDoc(layer) {
  return {
    name: 'Shapes',
    layers: [{
      id: 'fill', type: 'gradient',
      stops: [{ at: 0, color: A }, { at: 100, color: B }],
      motions: [],
      ...layer
    }]
  };
}

const at = (frame, x, y) => pixelAt(frame.pixels, frame.width, x, y);

// ------------------------------------------------------------- the shape list

test('the engine offers five gradient shapes and nothing it cannot draw', () => {
  assert.deepEqual([...GRADIENT_SHAPES], ['linear', 'radial', 'conic', 'stripes', 'waves']);
});

test('a gradient carries a band count, clamped to what the engine can draw', () => {
  const layerOf = (raw) => normalizeDocument({ layers: [raw] }).doc.layers[0];
  assert.equal(layerOf({ id: 'g', type: 'gradient' }).bands, DEFAULT_BANDS);
  assert.equal(layerOf({ id: 'g', type: 'gradient', bands: 0 }).bands, MIN_BANDS);
  assert.equal(layerOf({ id: 'g', type: 'gradient', bands: 9999 }).bands, MAX_BANDS);
  // Whole bands only: half a repeat is not a thing the ramp can be built from.
  assert.equal(layerOf({ id: 'g', type: 'gradient', bands: 4.7 }).bands, 5);
});

// ------------------------------------------------------------------- stripes

test('stripes put hard band edges exactly where the band count says', async () => {
  // Two colours and two repeats across the width: four bands of 80px each,
  // A B A B, with edges at x = 80, 160, 240.
  const [frame] = await runJobs([{
    name: 'stripes', kind: 'engine', timeSec: 0,
    doc: shapeDoc({ shape: 'stripes', bands: 2, angle: 0 })
  }]);

  const y = CANVAS_HEIGHT / 2;
  for (const [x, want] of [[40, A], [120, B], [200, A], [280, B]]) {
    assert.ok(isColour(at(frame, x, y), rgb(want), 6),
      `the middle of the band at x=${x} should be ${want}, was `
        + JSON.stringify(at(frame, x, y)));
  }

  // And the edge is HARD: two pixels either side of x=80 are already the two
  // different colours. A ramp would blend across that boundary.
  assert.ok(isColour(at(frame, 76, y), rgb(A), 12), 'just before the edge is not the first colour');
  assert.ok(isColour(at(frame, 84, y), rgb(B), 12), 'just after the edge is not the second colour');
});

test('stripes are the same bands whatever row they are read on, at angle 0', async () => {
  const [frame] = await runJobs([{
    name: 'stripes-rows', kind: 'engine', timeSec: 0,
    doc: shapeDoc({ shape: 'stripes', bands: 3, angle: 0 })
  }]);
  for (const y of [10, 100, 190]) {
    assert.ok(isColour(at(frame, 20, y), rgb(A), 6), `row ${y} does not carry the band`);
  }
});

test('the angle turns the bands: at 90 degrees they run across instead of down', async () => {
  const [frame] = await runJobs([{
    name: 'stripes-90', kind: 'engine', timeSec: 0,
    doc: shapeDoc({ shape: 'stripes', bands: 2, angle: 90 })
  }]);
  // Now the bands are horizontal: one row is one colour all the way across.
  // The axis is the canvas HEIGHT at this angle, so two repeats of two colours
  // is four bands of 50px — y=20 is the first, y=70 the second.
  const top = at(frame, 40, 20);
  const topRight = at(frame, 280, 20);
  assert.ok(isColour(topRight, [top.r, top.g, top.b], 6), 'a row should be one colour now');
  assert.ok(maxDifference(
    new Uint8Array([top.r, top.g, top.b]),
    new Uint8Array([at(frame, 40, 70).r, at(frame, 40, 70).g, at(frame, 40, 70).b])
  ) > 40, 'the next band down must be the other colour');
  // And a whole period further down it is back to the first.
  assert.ok(isColour(at(frame, 40, 120), [top.r, top.g, top.b], 6),
    'a whole period down must be the same band colour again');
});

// --------------------------------------------------------------------- waves

test('waves swing from the first colour to the second and back, once per band', async () => {
  // Two repeats across 320px: a period of 160px. The wave is
  // ramp(0.5 - 0.5*cos(2*pi*u)), so u=0 is the first colour, u=1/2 (x = 80
  // into the period) is the second, and u=1/4 is the midpoint of the ramp.
  const [frame] = await runJobs([{
    name: 'waves', kind: 'engine', timeSec: 0,
    doc: shapeDoc({ shape: 'waves', bands: 2, angle: 0 })
  }]);

  const y = CANVAS_HEIGHT / 2;
  assert.ok(isColour(at(frame, 2, y), rgb(A), 10), 'the wave should start at the first colour');
  assert.ok(isColour(at(frame, 80, y), rgb(B), 10), 'half a period in should be the second colour');
  assert.ok(isColour(at(frame, 160, y), rgb(A), 10), 'a whole period in should be the first again');
  assert.ok(isColour(at(frame, 240, y), rgb(B), 10), 'and it repeats');

  // A quarter of the way in is the middle of the ramp — which is what makes
  // this a wave and not a square: a stripe would still be the first colour.
  const mid = rgb(colorAtPosition([{ at: 0, color: A }, { at: 100, color: B }], 50));
  assert.ok(isColour(at(frame, 40, y), mid, 14),
    `a quarter period in should be the middle of the ramp, was ${JSON.stringify(at(frame, 40, y))}`);
});

test('waves have no hard edge anywhere, which is what tells them from stripes', async () => {
  const [waves, stripes] = await runJobs([
    { name: 'waves', kind: 'engine', timeSec: 0, doc: shapeDoc({ shape: 'waves', bands: 2 }) },
    { name: 'stripes', kind: 'engine', timeSec: 0, doc: shapeDoc({ shape: 'stripes', bands: 2 }) }
  ]);

  const y = CANVAS_HEIGHT / 2;
  const jump = (frame) => {
    let worst = 0;
    for (let x = 1; x < CANVAS_WIDTH; x += 1) {
      const a = at(frame, x - 1, y);
      const b = at(frame, x, y);
      worst = Math.max(worst, Math.abs(a.r - b.r), Math.abs(a.g - b.g), Math.abs(a.b - b.b));
    }
    return worst;
  };

  assert.ok(jump(stripes) > 100, 'a stripe boundary must be a jump');
  assert.ok(jump(waves) < 20, `a wave must never jump, its worst step was ${jump(waves)}`);
});

// --------------------------------------------------------------------- conic

test('a conic sweeps the ramp around the middle: the colour at an angle is the ramp at that angle', async () => {
  const [frame] = await runJobs([{
    name: 'conic', kind: 'engine', timeSec: 0,
    doc: shapeDoc({ shape: 'conic', bands: 1, angle: 0 })
  }]);

  const cx = CANVAS_WIDTH / 2;
  const cy = CANVAS_HEIGHT / 2;
  const stops = [{ at: 0, color: A }, { at: 100, color: B }];
  const radius = 70;

  // Read the colour at four angles and compare each with the ramp at that
  // fraction of the turn. Sampled at a radius well away from the centre (where
  // every angle meets and the wedges are narrow) and away from the seam at
  // zero, where the last colour meets the first.
  for (const degrees of [45, 90, 180, 270]) {
    const radians = (degrees * Math.PI) / 180;
    const x = Math.round(cx + radius * Math.cos(radians));
    const y = Math.round(cy + radius * Math.sin(radians));
    const want = rgb(colorAtPosition(stops, (degrees / 360) * 100));
    assert.ok(isColour(at(frame, x, y), want, 16),
      `at ${degrees} degrees the conic should be ${JSON.stringify(want)}, was `
        + JSON.stringify(at(frame, x, y)));
  }
});

test('the conic\'s angle turns the whole wheel', async () => {
  const [zero, quarter] = await runJobs([
    { name: 'conic-0', kind: 'engine', timeSec: 0, doc: shapeDoc({ shape: 'conic', bands: 1, angle: 0 }) },
    { name: 'conic-90', kind: 'engine', timeSec: 0, doc: shapeDoc({ shape: 'conic', bands: 1, angle: 90 }) }
  ]);
  const cx = CANVAS_WIDTH / 2;
  const cy = CANVAS_HEIGHT / 2;
  // What sat at 90 degrees before must now sit at 180.
  const before = at(zero, cx, cy + 70);
  const after = at(quarter, cx - 70, cy);
  assert.ok(isColour(after, [before.r, before.g, before.b], 16),
    'turning the conic by 90 degrees must move its colours by 90 degrees');
});

test('more bands means the conic sweeps the ramp more than once around', async () => {
  const [one, three] = await runJobs([
    { name: 'conic-1', kind: 'engine', timeSec: 0, doc: shapeDoc({ shape: 'conic', bands: 1 }) },
    { name: 'conic-3', kind: 'engine', timeSec: 0, doc: shapeDoc({ shape: 'conic', bands: 3 }) }
  ]);
  const cx = CANVAS_WIDTH / 2;
  const cy = CANVAS_HEIGHT / 2;
  const sample = (frame, degrees) => {
    const radians = (degrees * Math.PI) / 180;
    return at(frame, Math.round(cx + 70 * Math.cos(radians)), Math.round(cy + 70 * Math.sin(radians)));
  };

  // With three bands the ramp is traversed once every 120 degrees, so two
  // points a third of a turn apart carry the same colour. Read away from the
  // wrap, where the last colour meets the first: 30 and 150 degrees are both
  // a quarter of the way into their own band.
  const [near, far] = [sample(three, 30), sample(three, 150)];
  assert.ok(isColour(far, [near.r, near.g, near.b], 16),
    'with three bands, a third of a turn apart must be the same colour');

  // With one band those two points are a sixth of the ramp apart, so they
  // must NOT agree — otherwise the assertion above measures nothing.
  const [oneNear, oneFar] = [sample(one, 30), sample(one, 150)];
  assert.ok(!isColour(oneFar, [oneNear.r, oneNear.g, oneNear.b], 30),
    'with one band they must differ');
});

// The conic is the one shape drawn from a CACHED picture, so it is the one
// shape that can go on showing a setting nobody has any more. Every check above
// renders on a renderer of its own, which is the one state the app is never in:
// the window keeps a single renderer alive across every frame and every edit.
// So this one moves a stop on a renderer that has ALREADY drawn a wheel, which
// is what a person dragging the Position slider does.
test('moving a stop repaints the conic on a renderer that has already drawn one', async () => {
  const wheel = (at) => shapeDoc({
    shape: 'conic', bands: 1, angle: 0,
    stops: [{ at: 0, color: A }, { at, color: B }, { at: 100, color: A }]
  });

  const [fiftyFresh, twentyFresh, twentyAfterFifty] = await runJobs([
    { name: 'fifty-fresh', kind: 'engine', timeSec: 0, doc: wheel(50) },
    { name: 'twenty-fresh', kind: 'engine', timeSec: 0, doc: wheel(20) },
    {
      name: 'twenty-after-fifty', kind: 'engine', timeSec: 0,
      doc: wheel(20),
      before: [{ doc: wheel(50), timeSec: 0 }]
    }
  ]);

  // It moved at all: the two positions are different pictures on a cold start.
  assert.ok(maxDifference(fiftyFresh.pixels, twentyFresh.pixels) > 0,
    'the two stop positions must draw different wheels, or this proves nothing');

  // And the live renderer draws the SAME different picture — not merely a
  // changed one. Byte for byte: the wheel is a function of the stops, so having
  // drawn an earlier one may not leave a trace of it.
  assert.equal(maxDifference(twentyAfterFifty.pixels, twentyFresh.pixels), 0,
    'a conic drawn after another one must match a conic drawn on a fresh renderer');
  assert.ok(maxDifference(twentyAfterFifty.pixels, fiftyFresh.pixels) > 0,
    'the wheel is still the one built for the old stop position');
});

// A conic centred on the middle of the canvas only has to cover a turning
// square; a DRIFTING one has to cover it from wherever the centre has wandered
// to. It did not, and the corner it missed was left as the renderer's own black
// (up to 11 % of the frame). Measured across the drift range rather than at one
// setting, because the gap opens gradually with the amount.
test('a drifting conic covers the whole canvas, at every strength and moment', async () => {
  const moments = [0, 1.3, 2.9, 4.7, 6.1, 8.3, 11.9, 15.5];
  const jobs = [];
  for (const amount of [40, 70, 100]) {
    for (const angle of [0, 45]) {
      for (const timeSec of moments) {
        jobs.push({
          name: `conic-drift-${amount}-${angle}-${timeSec}`,
          kind: 'engine',
          timeSec,
          doc: shapeDoc({
            shape: 'conic', bands: 3, angle,
            motions: [{ kind: 'drift', speed: 70, amount }]
          })
        });
      }
    }
  }

  for (const frame of await runJobs(jobs)) {
    assert.equal(blackShare(frame.pixels), 0,
      `${frame.name} left ${(blackShare(frame.pixels) * 100).toFixed(2)} % of the canvas uncovered`);
  }
});

// The same fault on the warp path shows up differently and is worse: the source
// buffer a warp samples is never cleared, so an area the wheel does not cover
// keeps whatever the PREVIOUS frame put there. That cannot be seen as black —
// it is seen as a frame that depends on its own history, which is what this
// compares away.
test('a drifting, warping conic draws the same frame however it got there', async () => {
  const doc = shapeDoc({
    shape: 'conic', bands: 3, angle: 0,
    motions: [{ kind: 'drift', speed: 70, amount: 100 }, { kind: 'warp', speed: 60, amount: 100 }]
  });
  const [fresh, afterHistory] = await runJobs([
    { name: 'fresh', kind: 'engine', timeSec: 9.4, doc },
    {
      name: 'after-history', kind: 'engine', timeSec: 9.4, doc,
      // Frames whose centres sit elsewhere entirely, so anything left standing
      // in the buffer from them would be in the measured frame's corners.
      before: [0.4, 2.2, 5.8, 7.1].map((timeSec) => ({ doc, timeSec }))
    }
  ]);
  assert.equal(maxDifference(fresh.pixels, afterHistory.pixels), 0,
    'the frame depends on which frames were drawn before it');
});

// ------------------------------------------------------- nothing went missing

test('every shape draws something, and no two of them draw the same thing', async () => {
  const jobs = GRADIENT_SHAPES.map((shape) => ({
    name: shape, kind: 'engine', timeSec: 0, doc: shapeDoc({ shape, bands: 3, angle: 20 })
  }));
  const frames = await runJobs(jobs);
  for (const frame of frames) {
    assert.ok(meanBrightness(frame.pixels) > 5, `${frame.name} rendered a blank frame`);
  }
  for (let i = 0; i < frames.length; i += 1) {
    for (let j = i + 1; j < frames.length; j += 1) {
      assert.ok(maxDifference(frames[i].pixels, frames[j].pixels) > 0,
        `${frames[i].name} and ${frames[j].name} draw the same picture`);
    }
  }
});
