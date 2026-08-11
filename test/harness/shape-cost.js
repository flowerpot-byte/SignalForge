// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * What one frame of each shape and each motion really costs.
 *
 *   npx electron test/harness/shape-cost.js [out.json]
 *
 * Deliberately NOT a `*.test.js`. A timing measurement on a machine somebody
 * else is also using is not something to fail a build on — it would be red on
 * a busy laptop and green on an idle one, which is the definition of a flaky
 * test. It is run by hand when the engine gains something, and its numbers go
 * into the report; what the SUITE guards is correctness, which every other
 * file in here does.
 *
 * HOW IT MEASURES
 *
 *  - The real engine bundle, in a real Chromium, on a real 320 x 200 canvas —
 *    the same size, the same code and the same context options the exported
 *    effect uses. Software rendering (app.disableHardwareAcceleration), which
 *    is the honest setting: SignalRGB runs effects in an offscreen view with
 *    `is_accelerated: 0`.
 *  - One layer with one motion per measurement, which is the case the cost
 *    readout in the window reports on and the case the 15 % warning is about.
 *  - Every frame at a DIFFERENT time, so nothing that caches per frame can
 *    look cheap by being asked the same question twice. That matters most for
 *    the conic, whose whole design is a cache: a run at one fixed time would
 *    measure the cache and not the shape.
 *  - The median of the run rather than the mean, and a warm-up run thrown
 *    away first, so one scheduling hiccup does not decide the number.
 */
import { app, BrowserWindow } from 'electron';
import { writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runHarness } from './driver.js';

app.disableHardwareAcceleration();

const here = fileURLToPath(new URL('.', import.meta.url));
const OUT = resolve(process.argv[2] || join(process.cwd(), 'work', 'shapes-shots', 'cost.json'));

/** Every case worth a line in the table. */
const CASES = [];
const STOPS = [{ at: 0, color: '#ff0066' }, { at: 100, color: '#00b3ff' }];
const SHAPES = ['linear', 'radial', 'conic', 'stripes', 'waves'];

// Each shape standing still, so the shape's own cost is separated from the
// motion's.
for (const shape of SHAPES) {
  CASES.push({ name: `${shape} (still)`, shape, motions: [] });
}
// Each shape with each motion it is offered, one at a time.
for (const shape of SHAPES) {
  for (const kind of ['spin', 'pulse', 'drift', 'warp', 'breathe']) {
    CASES.push({ name: `${shape} + ${kind}`, shape, motions: [{ kind, speed: 60, amount: 80 }] });
  }
}
// The worst case a single layer can be asked for: the most bands there are,
// the most colours there are, and the most expensive motion on top.
CASES.push({
  name: 'stripes, 24 bands, 4 colours + warp',
  shape: 'stripes',
  bands: 24,
  stops: [
    { at: 0, color: '#ff0066' }, { at: 33, color: '#00b3ff' },
    { at: 66, color: '#ffcc00' }, { at: 100, color: '#22ff88' }
  ],
  motions: [{ kind: 'warp', speed: 60, amount: 100 }]
});
CASES.push({
  name: 'waves, 24 bands, 4 colours + warp',
  shape: 'waves',
  bands: 24,
  stops: [
    { at: 0, color: '#ff0066' }, { at: 33, color: '#00b3ff' },
    { at: 66, color: '#ffcc00' }, { at: 100, color: '#22ff88' }
  ],
  motions: [{ kind: 'warp', speed: 60, amount: 100 }]
});
CASES.push({
  name: 'conic + spin + warp (both at once)',
  shape: 'conic',
  bands: 3,
  motions: [{ kind: 'spin', speed: 60, amount: 100 }, { kind: 'warp', speed: 60, amount: 100 }]
});

const FRAMES = 400;

const MEASURE = `(function (cases, frames) {
  var SF = window.SignalForgeEngine;
  var canvas = document.getElementById('exCanvas');
  canvas.width = SF.CANVAS_WIDTH;
  canvas.height = SF.CANVAS_HEIGHT;
  var ctx = canvas.getContext('2d', { willReadFrequently: true });

  function run(entry) {
    var raw = { name: 'Cost', layers: [{ id: 'fill', type: 'gradient', shape: entry.shape,
      bands: entry.bands, stops: entry.stops, angle: 20, motions: entry.motions }] };
    var doc = SF.normalizeDocument(raw).doc;
    var renderer = SF.createRenderer();
    var assets = new Map();
    // Timed in BATCHES rather than frame by frame, and that is not a detail:
    // Chromium deliberately coarsens performance.now() to 100 microseconds, so
    // a single frame of a cheap shape reads as either 0.0 ms or 0.1 ms and the
    // measurement is a coin toss. A batch of 20 frames divided by 20 gives an
    // effective resolution of 5 microseconds, which is finer than anything
    // here needs.
    var batch = 20;
    var samples = [];
    var frame = 0;
    for (var b = 0; b * batch < frames; b += 1) {
      var before = performance.now();
      for (var i = 0; i < batch; i += 1) {
        // A different second every frame: nothing that caches per frame can
        // look cheap here by being asked the same question twice.
        renderer.render(ctx, doc, assets, frame * 0.037);
        frame += 1;
      }
      samples.push((performance.now() - before) / batch);
    }
    renderer.dispose();
    samples.sort(function (a, b) { return a - b; });
    return {
      median: samples[Math.floor(samples.length / 2)],
      worst: samples[samples.length - 1],
      // The 90th batch of a hundred, which is the honest "a bad moment, not
      // the worst moment" figure. The MAX is reported beside it rather than
      // instead of it: a single batch occasionally comes back tens of
      // milliseconds slow on this machine, for every warping layer including
      // the ones that predate this work, and that is the browser's own
      // rasteriser or its garbage collector rather than a cost the effect
      // makes anybody pay every second. Reporting the max as if it were the
      // frame cost would say a linear gradient with a warp on it needs 130 %
      // of a core, which is measurably not what it does for the other 95 % of
      // its frames.
      p95: samples[Math.floor(samples.length * 0.9)]
    };
  }

  var out = [];
  for (var c = 0; c < cases.length; c += 1) {
    run(cases[c]);              // warm-up, thrown away
    var measured = run(cases[c]);
    out.push({ name: cases[c].name, median: measured.median, p95: measured.p95, worst: measured.worst });
  }
  return out;
})(${JSON.stringify(CASES)}, ${FRAMES})`;

runHarness('shape-cost', async () => {
  const win = new BrowserWindow({
    show: false,
    width: 400,
    height: 300,
    webPreferences: { offscreen: false, backgroundThrottling: false }
  });
  await win.loadFile(join(here, 'page.html'));
  const rows = await win.webContents.executeJavaScript(MEASURE);

  // The one place the thresholds live is the window's own cost readout, so
  // they are read from it rather than restated here.
  const { coreShare, WARN_SHARE, FRAMES_PER_SECOND } = await import('../../app/renderer/components/cost.js');
  const table = rows.map((row) => ({
    ...row,
    shareMedian: coreShare(row.median),
    shareP95: coreShare(row.p95)
  }));

  writeFileSync(OUT, JSON.stringify({
    framesPerSecond: FRAMES_PER_SECOND,
    warnShare: WARN_SHARE,
    frames: FRAMES,
    rows: table
  }, null, 2), 'utf8');

  const worst = table.reduce((a, b) => (b.shareP95 > a.shareP95 ? b : a));
  process.stdout.write(`${table.map((row) =>
    `${row.name.padEnd(38)} ${row.median.toFixed(3)} ms  ${(row.shareMedian * 100).toFixed(2)} %`
      + `   (p95 ${row.p95.toFixed(3)} ms, ${(row.shareP95 * 100).toFixed(2)} %)`).join('\n')}\n`);
  process.stdout.write(`worst: ${worst.name} at ${(worst.shareP95 * 100).toFixed(2)} % of a core\n`);
  win.destroy();
  return 0;
});
