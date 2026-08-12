// SignalForge — build SignalRGB effects from images, gradients, shapes and particles.
// Copyright (C) 2026 Max Leopold Blumenschein
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * What the two document-wide additions really cost, per frame.
 *
 *   npx electron test/harness/finish-cost.js [out.json]
 *
 * Deliberately NOT a `*.test.js`, for the reason shape-cost.js gives at
 * length: a timing measurement on a machine somebody else is also using would
 * be red on a busy laptop and green on an idle one. It is run by hand and its
 * numbers go into the report.
 *
 * WHAT IS BEING SEPARATED
 *
 * The hue rides in the shared pixel pass (applyFinish in src/engine/engine.js),
 * which is skipped entirely while everything is neutral. So there are three
 * different questions and they need three different rows:
 *
 *   neutral            what a document nobody has touched pays. Must be the
 *                      same as the layer alone: the pass must not run at all.
 *   brightness only    what the pass costs when it runs WITHOUT the hue —
 *                      the read-back, the write, and one loop.
 *   hue only           the same pass with the hue instead of the brightness.
 *   hue + brightness   both, which is still one read and one write.
 *
 * The hue's own price is the third row minus the second: everything else about
 * those two rows is identical. That is the number the brief asks for, and it
 * is a subtraction of two measurements rather than a guess at what a matrix
 * multiply costs.
 *
 * The trail is measured the same way and separately, because it is not part of
 * that pass at all: it is a veil instead of a clear, plus one drawImage of the
 * whole canvas.
 *
 * Same method as shape-cost.js: the real engine bundle, a real 320 x 200
 * canvas, software rendering, batches of 20 frames (Chromium coarsens
 * performance.now() to 100 microseconds, so single frames are a coin toss), a
 * warm-up run thrown away, and the median of the batches rather than the mean.
 */
import { app, BrowserWindow } from 'electron';
import { writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runHarness } from './driver.js';

app.disableHardwareAcceleration();

const here = fileURLToPath(new URL('.', import.meta.url));
const OUT = resolve(process.argv[2] || join(process.cwd(), 'work', 'trail-hue-shots', 'cost.json'));

/**
 * One ordinary layer under all of them — a stripes gradient, which is what the
 * brief's own pictures use and is squarely in the middle of what this engine
 * draws. The point is the DIFFERENCE between the rows, so the layer only has
 * to be the same in every one of them.
 */
const LAYER = {
  id: 'fill', type: 'gradient', shape: 'stripes', bands: 6, angle: 20,
  stops: [{ at: 0, color: '#ff0066' }, { at: 100, color: '#00b3ff' }],
  motions: [{ kind: 'drift', speed: 40, amount: 60 }]
};

const CASES = [
  { name: 'neutral (nothing turned on)', doc: {} },
  { name: 'brightness only', doc: { brightness: 140 } },
  { name: 'hue shift only', doc: { hueShift: 90 } },
  { name: 'hue cycle only', doc: { hueCycle: 60 } },
  { name: 'hue + brightness', doc: { hueShift: 90, brightness: 140 } },
  { name: 'hue + brightness + saturation + both axes',
    doc: { hueCycle: 60, brightness: 140, saturation: 130, greenMagenta: -20, blueYellow: 15 } },
  { name: 'trail 50, no hue', doc: { trail: 50 } },
  { name: 'trail 100, no hue', doc: { trail: 100 } },
  { name: 'trail 100 + hue cycle', doc: { trail: 100, hueCycle: 60 } },
  { name: 'everything at once',
    doc: { trail: 100, hueCycle: 60, brightness: 140, saturation: 130, greenMagenta: -20, blueYellow: 15 } }
];

const FRAMES = 600;

const MEASURE = `(function (cases, frames) {
  var SF = window.SignalForgeEngine;
  var canvas = document.getElementById('exCanvas');
  canvas.width = SF.CANVAS_WIDTH;
  canvas.height = SF.CANVAS_HEIGHT;
  var ctx = canvas.getContext('2d', { willReadFrequently: true });
  var layer = ${JSON.stringify(LAYER)};

  function run(entry) {
    var raw = { name: 'Cost', layers: [layer] };
    for (var key in entry.doc) raw[key] = entry.doc[key];
    var doc = SF.normalizeDocument(raw).doc;
    var renderer = SF.createRenderer();
    var assets = new Map();
    var batch = 20;
    var samples = [];
    var frame = 0;
    for (var b = 0; b * batch < frames; b += 1) {
      var before = performance.now();
      for (var i = 0; i < batch; i += 1) {
        // A different second every frame, so nothing that caches per frame can
        // look cheap by being asked the same question twice — and, for the
        // trail rows, so the wake is a real one rather than the same picture
        // laid on itself.
        renderer.render(ctx, doc, assets, frame * 0.037);
        frame += 1;
      }
      samples.push((performance.now() - before) / batch);
    }
    renderer.dispose();
    samples.sort(function (a, b) { return a - b; });
    return {
      median: samples[Math.floor(samples.length / 2)],
      p95of20: samples[Math.floor(samples.length * 0.9)],
      worst: samples[samples.length - 1]
    };
  }

  var out = [];
  for (var c = 0; c < cases.length; c += 1) {
    run(cases[c]);
    var measured = run(cases[c]);
    out.push({ name: cases[c].name, median: measured.median,
      p95of20: measured.p95of20, worst: measured.worst });
  }
  return out;
})(${JSON.stringify(CASES)}, ${FRAMES})`;

runHarness('finish-cost', async () => {
  const win = new BrowserWindow({
    show: false, width: 400, height: 300,
    webPreferences: { offscreen: false, backgroundThrottling: false }
  });
  await win.loadFile(join(here, 'page.html'));
  const rows = await win.webContents.executeJavaScript(MEASURE);

  const { coreShare, WARN_SHARE, FRAMES_PER_SECOND } = await import('../../app/renderer/components/cost.js');
  const table = rows.map((row) => ({ ...row, share: coreShare(row.median) }));
  const by = (name) => table.find((row) => row.name === name).median;

  const summary = {
    // The hue's own price, twice over: against a pass that was already running
    // (the honest marginal cost of the rotation) and against a document where
    // nothing was running at all (what somebody who only turns the hue on
    // pays, which includes the read-back and the write-back the pass needs).
    hueOnTopOfAPassAlreadyRunning: by('hue + brightness') - by('brightness only'),
    hueFromNeutral: by('hue shift only') - by('neutral (nothing turned on)'),
    trailFromNothing: by('trail 100, no hue') - by('neutral (nothing turned on)')
  };

  writeFileSync(OUT, JSON.stringify({
    framesPerSecond: FRAMES_PER_SECOND, warnShare: WARN_SHARE, frames: FRAMES,
    rows: table, summary
  }, null, 2), 'utf8');

  process.stdout.write(`${table.map((row) =>
    `${row.name.padEnd(42)} ${row.median.toFixed(3)} ms  ${(row.share * 100).toFixed(2)} % of a core`
  ).join('\n')}\n`);
  process.stdout.write(`\nhue on top of a pass already running: ${summary.hueOnTopOfAPassAlreadyRunning.toFixed(3)} ms\n`);
  process.stdout.write(`hue from a neutral document:          ${summary.hueFromNeutral.toFixed(3)} ms\n`);
  process.stdout.write(`trail from a neutral document:        ${summary.trailFromNothing.toFixed(3)} ms\n`);
  win.destroy();
  return 0;
});
