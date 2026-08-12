// SignalForge — build SignalRGB effects from images, gradients, shapes and particles.
// Copyright (C) 2026 Max Leopold Blumenschein
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * What one frame of a swarm really costs, and what the count ceiling should be.
 *
 *   npx electron test/harness/particle-cost.js [out.json]
 *
 * Deliberately NOT a `*.test.js`, for the reason test/harness/shape-cost.js
 * gives at length: a timing measurement on a machine somebody else is also
 * using would be red on a busy laptop and green on an idle one, which is the
 * definition of a flaky test. It is run by hand when the engine gains
 * something, and its numbers go into the report.
 *
 * THIS ONE HAS A JOB THE OTHER DOES NOT. The shape layer's costs were measured
 * to be reported; these are measured to DECIDE something. MAX_PARTICLE_COUNT
 * (src/engine/document.js) is set from the sweep below rather than guessed, so
 * the ceiling on the count slider is a reading rather than a preference.
 *
 * HOW IT MEASURES — the same way shape-cost.js does, on purpose, so the two
 * tables can be read side by side without anybody having to trust that two
 * harnesses were set up alike:
 *
 *  - the real engine bundle, in a real Chromium, on a real 320 x 200 canvas,
 *    with hardware acceleration off (SignalRGB runs effects in an offscreen
 *    view with `is_accelerated: 0`, so software rendering is the honest
 *    setting, not a pessimistic one);
 *  - every frame at a DIFFERENT time, so nothing that caches per frame can look
 *    cheap by being asked the same question twice;
 *  - timed in batches of 20, because Chromium coarsens performance.now() to 100
 *    microseconds and a single cheap frame would otherwise read as a coin toss;
 *  - the median of the run, with a warm-up run thrown away first;
 *  - AND THE FRAME IS FORCED TO RASTERISE BEFORE THE CLOCK IS READ. See the
 *    note beside `flush` in MEASURE below — without it this harness measures
 *    almost nothing at all, and the first run of it said so plainly by
 *    reporting the same 0.05 ms for 400, 800 and 1600 particles.
 */
import { app, BrowserWindow } from 'electron';
import { writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runHarness } from './driver.js';
import { MAX_PARTICLE_COUNT } from '../../src/engine/document.js';

app.disableHardwareAcceleration();

const here = fileURLToPath(new URL('.', import.meta.url));
const OUT = resolve(process.argv[2] || join(process.cwd(), 'work', 'particles-shots', 'cost.json'));

const CASES = [];
const particleCase = (name, layer, extra = {}) => CASES.push({
  name,
  layer: { id: 'swarm', type: 'particles', motions: [], ...layer },
  ...extra
});

// ---------------------------------------------------------------------------
// THE SWEEP THAT SET THE CEILING
// ---------------------------------------------------------------------------
//
// The cost of a swarm is one filled disc per particle, so it is linear in the
// count — and that is not an assumption, it is what the sweep below measures.
// Two sweeps, at the default size and at the largest size the slider offers,
// because a disc's cost is its AREA and the default is an eighth of the top.
//
// EVERY ROW IS INSIDE MAX_PARTICLE_COUNT, ON PURPOSE, so this harness measures
// the same thing every time anybody runs it. A row above the ceiling would be
// silently clamped by normalizeDocument and would report the ceiling's cost
// under a bigger number's name — which is exactly what the first run of this
// file did, reporting an identical 0.44 ms for 400, 800 and 1600.
//
// The ceiling is therefore derived rather than bracketed: the runner below fits
// a straight line to these rows and reports the count at which it would cross
// the 5 ms budget. That extrapolation was checked once against reality, by
// lifting MAX_PARTICLE_COUNT to 6400 and measuring for real:
//
//     count   predicted   measured
//      800      0.82 ms    0.845 ms
//     1600      1.62 ms    1.705 ms
//
// — so the line holds to within about 5 % four times past the last measured
// point, which is as much as an extrapolation of this kind is ever owed.
const COUNT_SWEEP = [25, 50, 100, 200, 400];
for (const count of COUNT_SWEEP) {
  particleCase(`rain, ${count} particles (default size)`, { pattern: 'rain', count }, { sweep: 'default' });
}
for (const count of COUNT_SWEEP) {
  particleCase(`rain, ${count} particles at size 25`, { pattern: 'rain', count, size: 25 }, { sweep: 'largest' });
}

// ---------------------------------------------------------------------------
// The patterns, so a pattern that turned out to cost more than the others has
// somewhere to show up. They should be within noise of each other — the sway
// is one sine per particle and the growth is one multiply — and if one is not,
// that is worth knowing before it is shipped.
// ---------------------------------------------------------------------------
for (const pattern of ['rain', 'rise', 'drift', 'snow']) {
  particleCase(`${pattern} (default count)`, { pattern });
}

// Four colours rather than two: the draw loop assigns ctx.fillStyle once per
// colour, so this is what proves that going from two buckets to four is not
// what costs anything (against the naive one-assignment-per-particle version
// the bucketing replaced).
particleCase('rain, 4 colours', {
  pattern: 'rain',
  stops: [
    { at: 0, color: '#ff0066' }, { at: 33, color: '#00b3ff' },
    { at: 66, color: '#ffcc00' }, { at: 100, color: '#22ff88' }
  ]
});

// Each motion this layer type offers, one at a time. Only the two that work on
// opacity are on the list, because those are the only two offered — see
// PARTICLE_MOTION_KINDS in src/engine/document.js.
for (const kind of ['breathe', 'pulse']) {
  particleCase(`rain + ${kind}`, { pattern: 'rain', motions: [{ kind, speed: 60, amount: 80 }] });
}

// An angle that is not a right angle, so the rotated frame is doing real
// trigonometry rather than multiplying by 0 and 1.
particleCase('rain leaning 37 degrees', { pattern: 'rain', tilt: 37 });

// ---------------------------------------------------------------------------
// THE COMBINATION PEOPLE WILL ACTUALLY BUILD
// ---------------------------------------------------------------------------
//
// Rain with a wake. docs/effekt-inventur.md section A2 counts a veil in at
// least eight of the 31 effects read and says it is what makes particles look
// like sparks and rain rather than like dots; C2 says particles are the veil's
// real beneficiary. So the pair is the headline case, and it is not free — the
// engine composites into a canvas of its own and copies it back every frame.
for (const count of [100, 200, 400]) {
  particleCase(`rain, ${count} + trail 70`, { pattern: 'rain', count }, { trail: 70 });
}

// And the worst a single particle layer can be asked for: the most particles
// the ceiling allows, the largest size, four colours, an awkward angle, a
// motion running, a long wake — and the whole-frame colour pass switched on
// with it, because a hue that is turning makes applyFinish walk all 64000
// pixels on top of everything else.
particleCase('worst case: 400 at size 25, 4 colours, trail, hue cycle', {
  pattern: 'drift', count: 400, size: 25, tilt: 37,
  stops: [
    { at: 0, color: '#ff0066' }, { at: 33, color: '#00b3ff' },
    { at: 66, color: '#ffcc00' }, { at: 100, color: '#22ff88' }
  ],
  motions: [{ kind: 'breathe', speed: 60, amount: 80 }]
}, { trail: 70, hueCycle: 45, brightness: 130 });

// The one gesture the app itself performs that this layer makes expensive: the
// count and the seed are both sliders somebody DRAGS, and both are in the
// cache's key — so every frame of that drag throws the per-particle draws away
// and builds them again. Everything above measures the cache doing its job;
// this measures it not being able to.
particleCase('rain, 400, seed under a moving mouse', { pattern: 'rain', count: 400 }, { dragSeed: true });

const FRAMES = 400;

const MEASURE = `(function (cases, frames) {
  var SF = window.SignalForgeEngine;
  var canvas = document.getElementById('exCanvas');
  canvas.width = SF.CANVAS_WIDTH;
  canvas.height = SF.CANVAS_HEIGHT;
  var ctx = canvas.getContext('2d', { willReadFrequently: true });

  function run(entry) {
    var raw = {
      name: 'Cost',
      layers: [entry.layer],
      trail: entry.trail || 0,
      hueCycle: entry.hueCycle || 0,
      brightness: entry.brightness === undefined ? 100 : entry.brightness
    };
    var doc = SF.normalizeDocument(raw).doc;
    var renderer = SF.createRenderer();
    var assets = new Map();
    var batch = 20;
    var samples = [];
    var frame = 0;
    for (var b = 0; b * batch < frames; b += 1) {
      var before = performance.now();
      for (var i = 0; i < batch; i += 1) {
        // The seed under a moving mouse: one whole step per frame, the way the
        // app's own slider writes it. The cache's key changes with it, so this
        // is the case where the per-particle draws are rebuilt every frame
        // instead of never.
        if (entry.dragSeed) doc.layers[0].seed = frame % 100;
        renderer.render(ctx, doc, assets, frame * 0.037);
        // ---------------------------------------------------------------
        // FORCE THE FRAME TO ACTUALLY BE DRAWN, AND WHY THAT IS NOT CHEATING
        // ---------------------------------------------------------------
        //
        // Chromium's canvas is DEFERRED: ctx.arc/ctx.fill record into a display
        // list and the rasteriser is not run until something needs the pixels.
        // Without this line the loop below times the recording and not the
        // drawing, and the first run of this harness proved it by reporting the
        // identical 0.050 ms for 400, 800 AND 1600 particles — four times the
        // work for the same money — while the p95 column showed the real cost
        // arriving later in occasional 2 to 8 ms bursts as the pipeline caught
        // up.
        //
        // Reading one pixel forces the whole display list to rasterise, which
        // is what makes the number below the cost of a FRAME rather than the
        // cost of describing one. One pixel rather than the whole canvas so
        // that the readback copy itself is not what is being measured.
        //
        // It is also what the real host does, which is the part that matters:
        // SignalRGB samples this canvas every single frame to work out what to
        // send the LEDs, and applyFinish (src/engine/engine.js) already calls
        // getImageData on every frame of any document whose brightness or
        // colour is not neutral. A frame that is never rasterised is not a
        // state any real effect is ever in.
        ctx.getImageData(0, 0, 1, 1);
        frame += 1;
      }
      samples.push((performance.now() - before) / batch);
    }
    renderer.dispose();
    samples.sort(function (a, b) { return a - b; });
    return {
      median: samples[Math.floor(samples.length / 2)],
      worst: samples[samples.length - 1],
      p95of20: samples[Math.floor(samples.length * 0.9)]
    };
  }

  var out = [];
  for (var c = 0; c < cases.length; c += 1) {
    run(cases[c]);              // warm-up, thrown away
    var measured = run(cases[c]);
    out.push({
      name: cases[c].name,
      median: measured.median,
      p95of20: measured.p95of20,
      worst: measured.worst
    });
  }
  return out;
})(${JSON.stringify(CASES)}, ${FRAMES})`;

runHarness('particle-cost', async () => {
  const win = new BrowserWindow({
    show: false,
    width: 400,
    height: 300,
    webPreferences: { offscreen: false, backgroundThrottling: false }
  });
  await win.loadFile(join(here, 'page.html'));
  const rows = await win.webContents.executeJavaScript(MEASURE);

  // The one place the thresholds live is the window's own cost readout, so they
  // are read from it rather than restated here.
  const { coreShare, WARN_SHARE, FRAMES_PER_SECOND } = await import('../../app/renderer/components/cost.js');
  const table = rows.map((row) => ({
    ...row,
    shareMedian: coreShare(row.median),
    shareP95of20: coreShare(row.p95of20)
  }));

  /**
   * The straight line through one count sweep, and where it meets the budget.
   *
   * Least squares on (count, ms), which is the whole of the ceiling argument:
   * `slope` is what one more particle costs and `crossing` is how many of them
   * the frame budget buys. MAX_PARTICLE_COUNT is then set well under the
   * smaller crossing, and the report says by how much.
   */
  const fit = (which) => {
    const points = CASES
      .map((entry, at) => ({ count: entry.layer.count, ms: table[at].median, sweep: entry.sweep }))
      .filter((point) => point.sweep === which);
    const n = points.length;
    const sumX = points.reduce((a, p) => a + p.count, 0);
    const sumY = points.reduce((a, p) => a + p.ms, 0);
    const sumXY = points.reduce((a, p) => a + p.count * p.ms, 0);
    const sumXX = points.reduce((a, p) => a + p.count * p.count, 0);
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    const budgetMs = (WARN_SHARE * 1000) / FRAMES_PER_SECOND;
    return { which, slope, intercept, budgetMs, crossing: (budgetMs - intercept) / slope };
  };
  const fits = [fit('default'), fit('largest')];

  writeFileSync(OUT, JSON.stringify({
    framesPerSecond: FRAMES_PER_SECOND,
    warnShare: WARN_SHARE,
    frames: FRAMES,
    maxParticleCount: MAX_PARTICLE_COUNT,
    fits,
    rows: table
  }, null, 2), 'utf8');

  process.stdout.write(`${table.map((row) =>
    `${row.name.padEnd(48)} ${row.median.toFixed(3)} ms  ${(row.shareMedian * 100).toFixed(2)} %`
      + `   (p95-of-20 ${row.p95of20.toFixed(3)} ms, ${(row.shareP95of20 * 100).toFixed(2)} %)`).join('\n')}\n\n`);
  const worst = table.reduce((a, b) => (b.shareP95of20 > a.shareP95of20 ? b : a));
  process.stdout.write(`worst: ${worst.name} at ${(worst.shareP95of20 * 100).toFixed(2)} % of a core\n`);
  process.stdout.write(`the warning line is ${(WARN_SHARE * 100).toFixed(0)} % of a core `
    + `(${((WARN_SHARE * 1000) / FRAMES_PER_SECOND).toFixed(2)} ms a frame)\n`);
  for (const one of fits) {
    process.stdout.write(`${one.which.padEnd(8)} size: ${(one.slope * 1000).toFixed(4)} us per particle, `
      + `crosses the budget at ${Math.round(one.crossing)} particles `
      + `(the ceiling is ${MAX_PARTICLE_COUNT}, i.e. `
      + `${(one.crossing / MAX_PARTICLE_COUNT).toFixed(1)}x headroom)\n`);
  }
  win.destroy();
  return 0;
});
