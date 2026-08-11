// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CANVAS_WIDTH, CANVAS_HEIGHT, PARTICLE_PATTERNS, MAX_PARTICLE_TILT, DEFAULT_PARTICLE_TILT,
  MIN_PARTICLE_COUNT, MAX_PARTICLE_COUNT, DEFAULT_PARTICLE_COUNT,
  MIN_PARTICLE_SIZE, MAX_PARTICLE_SIZE, DEFAULT_PARTICLE_SIZE,
  DEFAULT_PARTICLE_SPEED, MIN_PARTICLE_SEED, MAX_PARTICLE_SEED, DEFAULT_PARTICLE_SEED,
  normalizeDocument
} from '../../src/engine/document.js';
import {
  particleField, particleCache, particleAt,
  PARTICLE_PATTERN_LOOKS, PARTICLE_SPEED_SCALE, PARTICLE_MIN_ALPHA
} from '../../src/engine/layers/particles.js';
import { speedToRate } from '../../src/engine/motion/speed.js';

/**
 * The particle layer's ARITHMETIC, checked without a canvas anywhere near it.
 *
 * The claim this whole layer type rests on is that particle i's position at
 * time t is a pure function of i and t — no state between frames, no dice
 * rolled at render time, no respawning. That claim is not something pixels can
 * confirm or deny: a frame that looks like rain looks like rain either way. So
 * it is checked here, on the numbers, and the pixels are checked separately in
 * test/engine/particles-render.test.js for the things only pixels can answer
 * (does it cover the canvas, does it leave the layers below alone, does a wake
 * appear behind it).
 *
 * The one function under all of it is particleAt, which is exported precisely
 * so this file can interrogate it. Everything below asks it a question whose
 * right answer is computed from the engine's own constants rather than written
 * down here — a test that hardcoded a coordinate would go on passing after
 * somebody stopped reading the field that produced it.
 */

/** One particle layer, alone, with everything else left to normalizeDocument. */
function layerFor(extra = {}) {
  return normalizeDocument({
    name: 'Swarm',
    layers: [{ id: 'swarm', type: 'particles', motions: [], ...extra }],
    controls: []
  }).doc.layers[0];
}

/** The field and the cache a layer would render through. */
function setUp(extra = {}) {
  const layer = layerFor(extra);
  const field = particleField(layer);
  const cache = particleCache(field.seed, field.count, layer.stops.length);
  return { layer, field, cache };
}

const spot = () => ({ x: 0, y: 0, radius: 0, alpha: 1, colour: 0, phase: 0 });

/**
 * The leans swept wherever a claim has to hold at every heading.
 *
 * Deliberately awkward numbers as well as the round ones: the spans are
 * computed from the |cos| and |sin| of the heading, and a projection written
 * the wrong way round can still come out right at a multiple of 90 degrees.
 * The full circle either way, because a lean of -180 and one of +180 are both
 * reachable from the slider.
 */
const TILT_SWEEP = [0, 17, -43, 90, -90, 133, 180, -180, -124];

/**
 * How far along its direction of travel a particle stands, in canvas pixels.
 *
 * The across axis is at right angles to the along axis, so projecting the
 * particle's offset from the middle of the canvas onto the along axis recovers
 * exactly the `along` the renderer computed — every sideways term (the spawn
 * spread, the slant, the sway) drops out of the dot product. That is what makes
 * the travel measurable from the OUTPUT rather than from the internals.
 */
const alongOf = (field, point) =>
  (point.x - CANVAS_WIDTH / 2) * field.alongX + (point.y - CANVAS_HEIGHT / 2) * field.alongY;

// ---------------------------------------------------------------- the travel

test('a particle travels the distance the rate says, at a steady speed', () => {
  // The heart of the closed form: `x = x0 + v*t`, not `x += v`. Two things have
  // to be true and a mutable respawning system would fail both — the step over
  // any interval is the same as the step over any other interval of the same
  // length (steady), and its size is exactly the rate times the span (correct).
  const { field, cache } = setUp({ pattern: 'rain', speed: 40, seed: 5, count: 40 });

  // The rate is computed from the engine's own pieces here rather than read off
  // `field`, so a change to either half of it has to be a deliberate one.
  const expectedRate = speedToRate(40) * PARTICLE_SPEED_SCALE * PARTICLE_PATTERN_LOOKS.rain.speed;
  assert.ok(Math.abs(field.rate - expectedRate) < 1e-12,
    `the swarm's rate is ${field.rate}, the arithmetic says ${expectedRate}`);

  const step = 0.05;
  for (let index = 0; index < cache.count; index += 1) {
    const a = particleAt(field, cache, index, 1, spot());
    const b = particleAt(field, cache, index, 1 + step, spot());
    // Recover THIS particle's own speed from the two samples, then use it to
    // predict a completely different interval. If the motion were not linear in
    // t, the prediction would miss.
    //
    // Unwrapped, because the pair may straddle a wrap: the phase is a
    // fractional part, so a step that crosses the seam comes back NEGATIVE.
    // Adding one puts it right, and it is only right because a step this short
    // cannot cover a whole traversal — at the top of the slider the fastest
    // particle covers 0.5 of one in 0.05 s.
    const advance = b.phase - a.phase;
    const perSecond = (advance < 0 ? advance + 1 : advance) / step;
    const speedFactor = perSecond / field.rate;
    assert.ok(
      speedFactor >= 1 - PARTICLE_PATTERN_LOOKS.rain.speedSpread - 1e-9
      && speedFactor <= 1 + PARTICLE_PATTERN_LOOKS.rain.speedSpread + 1e-9,
      `particle ${index} runs at ${speedFactor} of the swarm's rate, outside the spread`
    );

    // A different interval, a different starting moment, and the along-axis
    // displacement predicted from the rate alone.
    const longer = 0.31;
    const from = particleAt(field, cache, index, 3.7, spot());
    const to = particleAt(field, cache, index, 3.7 + longer, spot());
    // Only when the two samples did not straddle a wrap, which is a different
    // claim with its own test below.
    if (to.phase > from.phase) {
      const moved = alongOf(field, to) - alongOf(field, from);
      const predicted = field.rate * speedFactor * longer * field.spanAlong;
      assert.ok(Math.abs(moved - predicted) < 1e-6,
        `particle ${index} moved ${moved} px along, the rate predicts ${predicted}`);
    }
  }
});

test('a particle at rest does not move at all, however long you wait', () => {
  // speed 0 is inside the range on purpose — a still field of points, which is
  // what `Starlight` in the corpus is. It has to be genuinely still: a swarm
  // that crept would make the setting a lie.
  const { field, cache } = setUp({ speed: 0, count: 20 });
  assert.equal(field.rate, 0);
  for (let index = 0; index < cache.count; index += 1) {
    const a = particleAt(field, cache, index, 0, spot());
    const b = particleAt(field, cache, index, 600, spot());
    assert.equal(a.x, b.x);
    assert.equal(a.y, b.y);
    assert.equal(a.radius, b.radius);
  }
});

test('the same document renders the same particles from two fresh starts', () => {
  // The parity promise, at its narrowest: nothing here may depend on when it
  // was asked or on how often. Two caches built from nothing, two fields built
  // from nothing, and every number the same.
  for (const pattern of PARTICLE_PATTERNS) {
    const first = setUp({ pattern, seed: 12, count: 50 });
    const second = setUp({ pattern, seed: 12, count: 50 });
    assert.deepEqual([...first.cache.units], [...second.cache.units], pattern);
    assert.deepEqual([...first.cache.order], [...second.cache.order], pattern);
    for (const timeSec of [0, 0.37, 4.2, 91.5]) {
      for (let index = 0; index < 50; index += 1) {
        assert.deepEqual(
          particleAt(first.field, first.cache, index, timeSec, spot()),
          particleAt(second.field, second.cache, index, timeSec, spot()),
          `${pattern}, particle ${index} at ${timeSec}`
        );
      }
    }
  }
});

test('two seeds give two genuinely different swarms', () => {
  // What the seed field is for. Nothing else about the document changes, so if
  // this failed the field would be a slider that does nothing — which is the
  // exact failure the conic gradient's cache once had.
  const a = setUp({ seed: 1, count: 60 });
  const b = setUp({ seed: 2, count: 60 });
  let moved = 0;
  for (let index = 0; index < 60; index += 1) {
    const one = particleAt(a.field, a.cache, index, 1.5, spot());
    const two = particleAt(b.field, b.cache, index, 1.5, spot());
    if (Math.hypot(one.x - two.x, one.y - two.y) > 4) moved += 1;
  }
  // Essentially all of them should have moved somewhere unrelated; the bound is
  // loose because two independent draws land near each other now and then.
  assert.ok(moved > 50, `only ${moved} of 60 particles moved between seed 1 and seed 2`);
});

// ------------------------------------------------------------------ the seam

test('a particle is off the canvas at the moment it wraps', () => {
  // THE ONE THING THAT HAD TO BE EXACTLY RIGHT. A closed-form swarm wraps by
  // taking the fractional part of its travel, which is a jump; the whole design
  // of the spans is arranged so that jump always happens where nothing is
  // drawn. If this ever fails, particles blink from one edge of the canvas to
  // the other and the layer looks broken in the most obvious possible way.
  //
  // Swept over every pattern and a spread of angles, because the margin is
  // measured in the rotated frame and an angle that got the projection wrong
  // would show up at 30 or 200 degrees and nowhere else.
  for (const pattern of PARTICLE_PATTERNS) {
    for (const tilt of TILT_SWEEP) {
      // The largest size there is, so the margin is being asked for the most it
      // ever has to cover.
      const { field, cache } = setUp({
        pattern, tilt, size: MAX_PARTICLE_SIZE, count: 30, speed: 70
      });

      // The invariant the margin exists to guarantee, stated directly: the
      // travel span reaches two whole maximum radii past the furthest the
      // canvas does, at each end.
      const margin = (field.spanAlong - field.shadowAlong) / 2;
      assert.ok(margin >= 2 * field.maxRadius - 1e-9,
        `${pattern} leaning ${tilt}: the margin is ${margin}, two radii is ${2 * field.maxRadius}`);

      // And the same thing demonstrated rather than asserted: walk a particle
      // through several full traversals and require that every time its disc
      // touches the canvas at all, it is nowhere near either end of its phase.
      const marginPhase = margin / field.spanAlong;
      for (let index = 0; index < cache.count; index += 1) {
        for (let step = 0; step < 600; step += 1) {
          const p = particleAt(field, cache, index, step * 0.01, spot());
          if (!touchesCanvas(p)) continue;
          assert.ok(p.phase > marginPhase / 2 && p.phase < 1 - marginPhase / 2,
            `${pattern} leaning ${tilt}: particle ${index} is visible at phase ${p.phase}, `
            + `which is inside the ${marginPhase} margin the wrap needs`);
        }
      }
    }
  }
});

/**
 * Whether a particle's disc overlaps the canvas at all — the EXACT test, not
 * the bounding box.
 *
 * Written out properly because the loose version got this wrong and the wrong
 * answer looked like a bug in the engine rather than in the test. A disc's
 * bounding box can overlap the canvas while the disc itself does not, and it
 * does exactly that near a corner: at 214 degrees a particle sitting at
 * (-34, -27) with a radius of 36 has a box that reaches the origin and a disc
 * that stops 43 pixels short of it. The margin the wrap needs is measured along
 * the direction of travel, which runs diagonally there, so a box test disagrees
 * with the guarantee in precisely the cases the guarantee is about.
 *
 * The real question is the distance from the centre to the NEAREST POINT of the
 * canvas rectangle, which is what clamping the centre into the rectangle gives.
 */
function touchesCanvas(p) {
  const nearestX = Math.min(Math.max(p.x, 0), CANVAS_WIDTH);
  const nearestY = Math.min(Math.max(p.y, 0), CANVAS_HEIGHT);
  return Math.hypot(p.x - nearestX, p.y - nearestY) < p.radius;
}

test('the sway ends a traversal exactly where it began it', () => {
  // The sway is a sine of the PHASE with a WHOLE number of cycles in it, which
  // is what makes the path periodic rather than merely discontinuous somewhere
  // invisible. A fractional cycle count would still look right — the jump is
  // off-canvas either way — so this is the assertion that keeps the stronger
  // property true instead of the weaker one.
  for (const [pattern, look] of Object.entries(PARTICLE_PATTERN_LOOKS)) {
    assert.equal(look.cycles, Math.round(look.cycles), `${pattern} has ${look.cycles} cycles`);
    if (look.cycles === 0) continue;

    const { field, cache } = setUp({ pattern, count: 12, speed: 50 });
    // One full traversal of the slowest particle takes longer than of the
    // fastest, so each particle is asked about its own period.
    for (let index = 0; index < cache.count; index += 1) {
      const start = particleAt(field, cache, index, 0, spot());
      // Find the moment this particle is back at the same phase, by advancing
      // exactly one traversal at its own speed.
      const perSecond = (particleAt(field, cache, index, 0.001, spot()).phase - start.phase) / 0.001;
      const period = 1 / perSecond;
      const back = particleAt(field, cache, index, period, spot());
      assert.ok(Math.abs(back.phase - start.phase) < 1e-9,
        `${pattern} particle ${index} came back to phase ${back.phase}, not ${start.phase}`);
      // The across component is what the sway lives on. Recovered the same way
      // `along` is, by projecting onto the other axis.
      const acrossOf = (p) => (p.x - CANVAS_WIDTH / 2) * field.acrossX
        + (p.y - CANVAS_HEIGHT / 2) * field.acrossY;
      assert.ok(Math.abs(acrossOf(back) - acrossOf(start)) < 1e-6,
        `${pattern} particle ${index}: the sway did not close, ${acrossOf(start)} -> ${acrossOf(back)}`);
    }
  }
});

// ----------------------------------------------------------------- the spans

test('the swarm is spread across the whole canvas at every angle', () => {
  // The spans are the canvas's own shadow in the rotated frame, so a swarm has
  // to reach every corner whichever way it is pointed. Checked on where the
  // particles ARE rather than on the arithmetic that placed them: a projection
  // written the wrong way round would still produce a plausible-looking span
  // and would leave a wedge of the canvas empty.
  for (const tilt of TILT_SWEEP) {
    const { field, cache } = setUp({ tilt, count: MAX_PARTICLE_COUNT, size: 2, seed: 3 });
    // A four by four grid; every cell has to see a particle centre at some
    // point over a couple of seconds.
    const seen = new Set();
    for (let step = 0; step < 60; step += 1) {
      for (let index = 0; index < cache.count; index += 1) {
        const p = particleAt(field, cache, index, step * 0.05, spot());
        if (p.x < 0 || p.x >= CANVAS_WIDTH || p.y < 0 || p.y >= CANVAS_HEIGHT) continue;
        seen.add(`${Math.floor(p.x / (CANVAS_WIDTH / 4))},${Math.floor(p.y / (CANVAS_HEIGHT / 4))}`);
      }
    }
    assert.equal(seen.size, 16, `leaning ${tilt} only ${seen.size} of 16 cells ever saw a particle`);
  }
});

test('every particle stays inside the size and opacity it is promised', () => {
  // maxRadius is what every margin in the layer is measured in, so a particle
  // bigger than it would quietly break the seam guarantee above rather than
  // showing up as anything obvious.
  for (const pattern of PARTICLE_PATTERNS) {
    const { field, cache } = setUp({ pattern, size: 8, count: 80, speed: 60 });
    for (let index = 0; index < cache.count; index += 1) {
      for (let step = 0; step < 120; step += 1) {
        const p = particleAt(field, cache, index, step * 0.03, spot());
        assert.ok(p.radius > 0 && p.radius <= field.maxRadius + 1e-9,
          `${pattern}: a particle reached radius ${p.radius} against a promised ${field.maxRadius}`);
        assert.ok(p.alpha >= PARTICLE_MIN_ALPHA - 1e-9 && p.alpha <= 1,
          `${pattern}: a particle reached opacity ${p.alpha}`);
      }
    }
  }
});

// --------------------------------------------------------------- the colours

test('every colour gets particles and every particle gets a colour', () => {
  // The counting sort behind the colour buckets: every particle appears in the
  // draw order exactly once, and the buckets between them account for all of
  // them. A sort that dropped one would simply not draw it, which nothing else
  // in this suite would notice.
  for (const stopCount of [2, 3, 4]) {
    const stops = Array.from({ length: stopCount }, (unused, at) => ({
      at: (at / (stopCount - 1)) * 100, color: '#ff0066'
    }));
    const { layer, field, cache } = setUp({ stops, count: 200, seed: 9 });
    assert.equal(layer.stops.length, stopCount);

    assert.equal(cache.bucketStart[0], 0);
    assert.equal(cache.bucketStart[stopCount], field.count);
    const drawn = new Set(cache.order);
    assert.equal(drawn.size, field.count, 'a particle is missing from the draw order');

    for (let bucket = 0; bucket < stopCount; bucket += 1) {
      const from = cache.bucketStart[bucket];
      const to = cache.bucketStart[bucket + 1];
      assert.ok(to > from, `colour ${bucket} of ${stopCount} was given no particles at all`);
      for (let slot = from; slot < to; slot += 1) {
        assert.equal(cache.colour[cache.order[slot]], bucket,
          'a particle is in the wrong colour bucket');
      }
    }
  }
});

// ------------------------------------------------------- the document itself

test('an unknown pattern falls back to the safe default and says so', () => {
  const { doc, problems } = normalizeDocument({
    layers: [{ id: 'swarm', type: 'particles', pattern: 'hurricane' }]
  });
  assert.equal(doc.layers[0].pattern, PARTICLE_PATTERNS[0]);
  assert.ok(problems.some((line) => line.includes('hurricane')), problems.join('\n'));
});

test('a particle layer carries every field, clamped, whatever arrived', () => {
  const { doc } = normalizeDocument({
    layers: [{
      id: 'swarm', type: 'particles',
      count: 99999, size: -4, speed: 1000, seed: 12345.6
    }]
  });
  const layer = doc.layers[0];
  assert.equal(layer.count, MAX_PARTICLE_COUNT);
  assert.equal(layer.size, MIN_PARTICLE_SIZE);
  assert.equal(layer.speed, 100);
  assert.equal(layer.seed, MAX_PARTICLE_SEED);
  // And the two lists every layer with motions has.
  assert.deepEqual(layer.motions, []);
  assert.equal(layer.stops.length, 2);
});

test('a particle layer with nothing said takes the defaults, and they are reproducible', () => {
  const layer = layerFor();
  assert.equal(layer.pattern, PARTICLE_PATTERNS[0]);
  assert.equal(layer.count, DEFAULT_PARTICLE_COUNT);
  assert.equal(layer.size, DEFAULT_PARTICLE_SIZE);
  assert.equal(layer.speed, DEFAULT_PARTICLE_SPEED);
  assert.equal(layer.seed, DEFAULT_PARTICLE_SEED);
  // The seed's floor is a real value the default sits on, so this is also the
  // check that the hash's one fixed point does not reach the default document.
  assert.equal(MIN_PARTICLE_SEED, DEFAULT_PARTICLE_SEED);
  const { field, cache } = setUp();
  const first = particleAt(field, cache, 0, 0, spot());
  assert.ok(Number.isFinite(first.x) && Number.isFinite(first.y));
  assert.ok(first.radius > 0);
});

test('each pattern travels the way its name says, whatever else is set', () => {
  // A "rise" that fell would be indefensible -- and it is exactly what the
  // first design did once a layer had been normalized once, because the
  // direction was a per-pattern DEFAULT for an absolute angle field rather than
  // a property of the pattern. See MAX_PARTICLE_TILT in
  // src/engine/document.js.
  const expected = { rain: [0, 1], rise: [0, -1], drift: [1, 0], snow: [0, 1] };
  for (const pattern of PARTICLE_PATTERNS) {
    const [wantX, wantY] = expected[pattern];
    const field = particleField(layerFor({ pattern }));
    assert.ok(Math.abs(field.alongX - wantX) < 1e-9 && Math.abs(field.alongY - wantY) < 1e-9,
      `${pattern} travels (${field.alongX}, ${field.alongY}), not (${wantX}, ${wantY})`);
  }
});

test('switching the pattern really switches the direction, on a layer that has one', () => {
  // THE REGRESSION TEST FOR THE FAULT THE WALKTHROUGH FOUND. Every unit test in
  // this file passed while "rise" fell, because they all built their layer from
  // nothing and a default only fills in a field that was never set. This one
  // does what a person does: normalize a document, then change one field of the
  // ALREADY NORMALIZED layer, which is what the settings column and SignalRGB's
  // own panel both do.
  const rain = normalizeDocument({
    layers: [{ id: 'swarm', type: 'particles', pattern: 'rain' }]
  }).doc.layers[0];
  assert.ok(particleField(rain).alongY > 0.99, 'rain does not fall');

  const rise = normalizeDocument({ layers: [{ ...rain, pattern: 'rise' }] }).doc.layers[0];
  assert.ok(particleField(rise).alongY < -0.99,
    'a layer switched from rain to rise is still falling -- the pattern name is a lie');
});

test('a lean the document carries survives a change of pattern, and only leans it', () => {
  // The lean is the user's and stays theirs; what it must NOT do is decide the
  // direction. Leaning 20 degrees means 20 degrees off whatever the pattern
  // does, so the same number is the same visible lean on all four.
  const leaned = normalizeDocument({
    layers: [{ id: 'swarm', type: 'particles', pattern: 'rain', tilt: 20 }]
  }).doc.layers[0];
  assert.equal(leaned.tilt, 20);
  const asRise = normalizeDocument({ layers: [{ ...leaned, pattern: 'rise' }] }).doc.layers[0];
  assert.equal(asRise.tilt, 20);

  // 20 degrees off falling and 20 degrees off rising: opposite headings, the
  // same lean.
  const heading = (field) => (Math.atan2(field.alongY, field.alongX) * 180) / Math.PI;
  assert.ok(Math.abs(heading(particleField(leaned)) - 110) < 1e-9);
  assert.ok(Math.abs(heading(particleField(asRise)) - -70) < 1e-9);
});

test('the lean is clamped and defaults to leaning not at all', () => {
  assert.equal(layerFor().tilt, DEFAULT_PARTICLE_TILT);
  const over = normalizeDocument({
    layers: [{ id: 'swarm', type: 'particles', tilt: 5000 }]
  }).doc.layers[0];
  assert.equal(over.tilt, MAX_PARTICLE_TILT);
  const under = normalizeDocument({
    layers: [{ id: 'swarm', type: 'particles', tilt: -5000 }]
  }).doc.layers[0];
  assert.equal(under.tilt, -MAX_PARTICLE_TILT);
});

test('a raw count or size of 0 clamps to the floor rather than jumping to the default', () => {
  // The distinction Number.isFinite makes and `|| fallback` does not — the same
  // one src/engine/layers/shape.js had to be fixed for. It matters because
  // SignalRGB's own panel writes raw values straight into the layer, so 0 is a
  // thing that genuinely arrives here.
  const field = particleField({ type: 'particles', pattern: 'rain', count: 0, size: 0, seed: 0, speed: 0 });
  assert.equal(field.count, MIN_PARTICLE_COUNT);
  assert.equal(field.baseRadius, (MIN_PARTICLE_SIZE / 100) * CANVAS_HEIGHT / 2);
  assert.equal(field.seed, MIN_PARTICLE_SEED);
  assert.equal(field.rate, 0);
});

test('a control panel handing back numeric strings still renders a swarm', () => {
  // applyControls (src/engine/bind.js) writes whatever SignalRGB sent straight
  // into the layer, and a control panel handing back "40" instead of 40 is the
  // documented shape of that risk — the trail and the hue shift both had to be
  // fixed for it.
  const field = particleField({
    type: 'particles', pattern: 'snow', count: '120', size: '5', speed: '45', tilt: '80', seed: '7'
  });
  assert.equal(field.count, 120);
  assert.equal(field.seed, 7);
  assert.ok(field.rate > 0);
  assert.ok(Math.abs(field.baseRadius - (5 / 100) * CANVAS_HEIGHT / 2) < 1e-12);
});

test('the cache is rebuilt for every input it is a function of', () => {
  // The conic gradient's lesson, applied before it could bite: the cache holds
  // the per-particle draws and the colour buckets, and those are a function of
  // the seed, the count and the number of stops. Each one is moved on its own
  // and the cache has to come back different.
  const base = particleCache(4, 30, 2);
  assert.notDeepEqual([...particleCache(5, 30, 2).units], [...base.units], 'the seed did nothing');
  assert.notEqual(particleCache(4, 31, 2).units.length, base.units.length, 'the count did nothing');
  assert.notEqual(particleCache(4, 30, 3).bucketStart.length, base.bucketStart.length,
    'the stop count did nothing');
});
