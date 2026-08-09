// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runJobs } from '../harness/render.js';
import { meanDifference, maxDifference, meanBrightness } from '../harness/pixels.js';
import { buildEffectHtml } from '../../src/export/build-effect.js';
import { MOTION_KINDS } from '../../src/engine/document.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const cli = join(root, 'bin', 'sfexport.js');

// 4x4 PNG: red / green / blue / white quadrants, two pixels each way -- the
// same picture test/export/fit-control.test.js uses, for the same reason:
// its asymmetry makes any warping/panning/dimming of the frame show up
// clearly, instead of a flat colour that could shift underneath a control
// change without moving a single visibly different pixel.
const QUADRANTS = 'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAHklEQVR42mXJsQ0AAAgDIOr/P9fVRFZSkMI4QtE/C5t8BQM0UanVAAAAAElFTkSuQmCC';

/**
 * The document this stands in for `sfexport.js --motion <kind>` producing:
 * exactly one motion entry on the layer, with the motion/tempo/strength
 * controls bound into it exactly the way buildImageDocument wires them up
 * (see bin/sfexport.js). `kind: 'none'` is baked as-is -- normalizeDocument
 * keeps a stored 'none' entry as an ordinary, inert one (document.js), so it
 * renders exactly like having no motion at all without needing a
 * placeholder kind.
 *
 * NOTE: these three tests (tempo/strength/motion combobox) exercise the
 * render mechanism with a hand-built document, which is fine for them --
 * they are about whether a bound control reaches the renderer at all, not
 * about whether sfexport.js's own bind paths are the right ones. The
 * regression guard below is the one that must exercise the CLI's real
 * output; see its own comment.
 */
function docWithMotion({ motion, tempo = 15, strength = 30, fit = 'cover' }) {
  return {
    name: 'MotionControl',
    description: 'motion controls reach the renderer',
    publisher: 'SignalForge',
    assets: { q: { kind: 'image', mime: 'image/png', data: QUADRANTS } },
    layers: [{
      id: 'a1',
      type: 'image',
      asset: 'q',
      fit,
      motions: [{ kind: motion, speed: tempo, amount: strength }]
    }],
    controls: [
      { property: 'motion', label: { de: 'Modus', en: 'Motion' }, type: 'combobox',
        values: [...MOTION_KINDS], default: motion, bind: ['a1.motions.0.kind'] },
      { property: 'tempo', label: { de: 'Tempo', en: 'Speed' }, type: 'number', min: 1, max: 100,
        default: tempo, bind: ['a1.motions.0.speed'] },
      { property: 'strength', label: { de: 'Staerke', en: 'Strength' }, type: 'number', min: 0, max: 100,
        default: strength, bind: ['a1.motions.0.amount'] }
    ]
  };
}

async function writeEffect(doc) {
  const engineSource = readFileSync(new URL('../../dist/engine.bundle.js', import.meta.url), 'utf8');
  const dir = mkdtempSync(join(tmpdir(), 'signalforge-motion-control-'));
  const file = join(dir, 'effect.html');
  writeFileSync(file, buildEffectHtml({ doc, engineSource, lang: 'en' }), 'utf8');
  return { dir, file };
}

test('the tempo control changes what is rendered over time', async () => {
  // Strong, fast-varying motion (warp) and a high strength, so a change in
  // playback speed shows up clearly within one settle window.
  const doc = docWithMotion({ motion: 'warp', tempo: 15, strength: 90 });
  const { dir, file } = await writeEffect(doc);

  try {
    const [slow, fast] = await runJobs([
      // Untouched: renders at the baked-in tempo default (15).
      { name: 'tempo-default', kind: 'html', file, settleMs: 400 },
      // Simulate SignalRGB delivering a much higher tempo at runtime.
      { name: 'tempo-fast', kind: 'html', file, settleMs: 400, setGlobals: { tempo: 95 }, afterSetGlobalsMs: 50 }
    ]);

    assert.ok(meanBrightness(slow.pixels) > 5, 'default-tempo frame is blank');
    assert.ok(meanBrightness(fast.pixels) > 5, 'fast-tempo frame is blank');

    assert.ok(maxDifference(slow.pixels, fast.pixels) > 0,
      'setting the tempo control had no visible effect -- the control exists on paper but not in effect');
    assert.ok(meanDifference(slow.pixels, fast.pixels) > 0.3,
      `expected a clearly visible change, mean difference was only ${meanDifference(slow.pixels, fast.pixels)}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the strength control changes what is rendered', async () => {
  // Tempo is left untouched in both jobs -- only strength (amount) varies --
  // so the difference can only come from the strength binding, not from
  // incidentally also nudging the playback speed.
  const doc = docWithMotion({ motion: 'warp', tempo: 40, strength: 5 });
  const { dir, file } = await writeEffect(doc);

  try {
    const [weak, strong] = await runJobs([
      { name: 'strength-default', kind: 'html', file, settleMs: 400 },
      { name: 'strength-max', kind: 'html', file, settleMs: 400, setGlobals: { strength: 100 }, afterSetGlobalsMs: 50 }
    ]);

    assert.ok(meanBrightness(weak.pixels) > 5, 'default-strength frame is blank');
    assert.ok(meanBrightness(strong.pixels) > 5, 'max-strength frame is blank');

    assert.ok(maxDifference(weak.pixels, strong.pixels) > 0,
      'setting the strength control had no visible effect -- the control exists on paper but not in effect');
    assert.ok(meanDifference(weak.pixels, strong.pixels) > 0.3,
      `expected a clearly visible change, mean difference was only ${meanDifference(weak.pixels, strong.pixels)}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the motion combobox changes what is rendered', async () => {
  // drift pans the sampling window, warp distorts it -- different enough
  // that switching kinds must change the frame even at matching elapsed time.
  const doc = docWithMotion({ motion: 'drift', tempo: 40, strength: 80 });
  const { dir, file } = await writeEffect(doc);

  try {
    const [drift, warp] = await runJobs([
      { name: 'motion-default', kind: 'html', file, settleMs: 400 },
      { name: 'motion-warp', kind: 'html', file, settleMs: 400, setGlobals: { motion: 'warp' }, afterSetGlobalsMs: 50 }
    ]);

    assert.ok(meanBrightness(drift.pixels) > 5, 'drift frame is blank');
    assert.ok(meanBrightness(warp.pixels) > 5, 'warp frame is blank');

    assert.ok(maxDifference(drift.pixels, warp.pixels) > 0,
      'switching the motion combobox had no visible effect -- the control exists on paper but not in effect');
    assert.ok(meanDifference(drift.pixels, warp.pixels) > 0.3,
      `expected a clearly visible change, mean difference was only ${meanDifference(drift.pixels, warp.pixels)}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('regression guard: with --motion none, the exported effect still renders the picture, '
  + 'and its motion/tempo/strength sliders are not silently dead', async () => {
  // This test drives the real `bin/sfexport.js` CLI and renders the file it
  // actually wrote, instead of hand-building a document with the bind paths
  // already known to be correct. That distinction matters: a hand-built
  // document, however faithfully it mirrors buildImageDocument today, proves
  // nothing about whether sfexport.js itself still wires those bindings the
  // same way tomorrow. This is the guard against exactly the bug that
  // shipped once already -- an image layer's `motion` object became a
  // `motions` array, and sfexport.js kept binding controls to
  // `a1.motion.*`, which setByPath (src/engine/bind.js) silently refuses to
  // write, leaving three dead sliders in every exported effect. Revert
  // sfexport.js's bind paths back to `a1.motion.*` and this test must fail:
  // see the "Fix round 2" section of task-1-report.md for that experiment's
  // actual red/green output.
  const dir = mkdtempSync(join(tmpdir(), 'signalforge-motion-none-cli-'));
  const image = join(dir, 'quadrants.png');
  const outDir = join(dir, 'Effects');
  writeFileSync(image, Buffer.from(QUADRANTS, 'base64'));

  try {
    execFileSync(process.execPath, [
      cli, '--image', image, '--name', 'MotionNoneCli', '--out', outDir, '--motion', 'none', '--fit', 'cover'
    ], { encoding: 'utf8', cwd: root });

    const file = join(outDir, 'MotionNoneCli.html');
    const html = readFileSync(file, 'utf8');

    // The reference for "genuinely no motion" is built from the exact asset
    // bytes the CLI actually embedded (prepareImageFile re-encodes the
    // source picture, so it is not byte-identical to QUADRANTS above) --
    // read straight back out of the CLI's own output, not re-derived.
    const bakedDocMatch = html.match(/<script id="sf-document" type="application\/json">([\s\S]*?)<\/script>/);
    assert.ok(bakedDocMatch, 'could not find the baked document in the CLI output');
    const bakedDoc = JSON.parse(bakedDocMatch[1]);
    const bakedLayer = bakedDoc.layers.find((layer) => layer.id === 'a1');
    assert.ok(bakedLayer, 'CLI output has no "a1" layer');

    const [untouched, forced, engineStill] = await runJobs([
      // Baseline: nothing touched, must render the picture (not black, not
      // broken) exactly as a genuinely motionless layer would.
      { name: 'none-untouched', kind: 'html', file, settleMs: 400 },
      // The regression this guards against: before the fix, `motion`,
      // `tempo` and `strength` all bound to a path under the old singular
      // `motion` field that no longer existed on a `motions`-shaped layer,
      // so setByPath silently refused every one of these writes and an
      // effect exported with --motion none could never be turned into a
      // moving one from SignalRGB's UI. Forcing all three here at once must
      // visibly animate the picture despite the CLI having said "none".
      { name: 'none-forced-motion', kind: 'html', file, settleMs: 400,
        setGlobals: { motion: 'warp', tempo: 95, strength: 100 }, afterSetGlobalsMs: 50 },
      // An independent, motion-free reference rendered straight through the
      // engine, using the CLI's own baked layer with motions replaced by an
      // empty list (the true "no motion" shape, see test/engine/motions.test.js).
      { name: 'engine-still', kind: 'engine', timeSec: 0, doc: {
        assets: bakedDoc.assets,
        layers: [{ ...bakedLayer, motions: [] }]
      } }
    ]);

    assert.ok(meanBrightness(untouched.pixels) > 5, 'untouched --motion none export is blank');
    assert.ok(meanBrightness(forced.pixels) > 5, 'forced-motion export is blank');

    // The baseline must be pixel-identical to a genuinely still render --
    // motion 'none' isn't just visually similar to no motion, it IS no
    // motion, at any point in time.
    assert.equal(maxDifference(untouched.pixels, engineStill.pixels), 0,
      `a --motion none export should render pixel-identical to a layer with no motion at all, `
      + `mean difference was ${meanDifference(untouched.pixels, engineStill.pixels)}`);

    // The regression guard itself: touching the controls from a --motion
    // none export must still change the picture. This is only meaningful
    // because `untouched`/`forced` above were rendered from the CLI's own
    // output file -- if sfexport.js's bind paths regress, this is the
    // assertion that goes red.
    assert.ok(maxDifference(untouched.pixels, forced.pixels) > 0,
      'the motion/tempo/strength controls had no visible effect on a --motion none export -- '
      + 'they exist on paper but are dead, exactly the regression this test guards against');
    assert.ok(meanDifference(untouched.pixels, forced.pixels) > 0.3,
      `expected a clearly visible change, mean difference was only `
      + `${meanDifference(untouched.pixels, forced.pixels)}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
