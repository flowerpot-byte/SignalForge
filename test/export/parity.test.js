// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max Leopold Blumenschein
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runJobs } from '../harness/render.js';
import { meanDifference, maxDifference, meanBrightness } from '../harness/pixels.js';
import { buildEffectHtml } from '../../src/export/build-effect.js';
import { effectControls, withLiveMotion } from '../../src/export/effect-controls.js';
import { normalizeDocument } from '../../src/engine/document.js';
import { foregroundOf, backgroundOf } from '../../src/engine/slots.js';

const QUADRANTS = 'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAHklEQVR42mXJsQ0AAAgDIOr/P9fVRFZSkMI4QtE/C5t8BQM0UanVAAAAAElFTkSuQmCC';

// One layer of every type the engine can draw, in one document.
//
// The guarantee this file exists for — the preview's pixels and the exported
// file's pixels are identical, through the same dist/engine.bundle.js — is
// only ever as wide as this document is. With two image layers it covered one
// layer type out of three, and the two newest ones are exactly the shape of
// thing that diverges: the gradient is the first layer type with a state cache
// keyed on its own content (buildSource's sourceKey in
// src/engine/layers/gradient.js) and the first to build a CanvasGradient per
// frame. A cache that one day outlived a document would show up here and
// nowhere else.
//
// The colour layers are deliberately translucent and over the pictures
// rather than under them: a solid layer at full opacity fills all 320 x 200
// and would hide every image pixel, which would narrow this test in the act of
// widening it.
//
// THE THREE REPEATING SHAPES, AND WHY THEY BELONG HERE ABOVE ALL
//
// conic, stripes and waves are the first shapes whose pixels do not come out
// of one CanvasGradient built from the document's own stops:
//
//   stripes/waves  generate their colour stops per frame — dozens of them,
//                  computed from the band count — so a ramp built even
//                  slightly differently on the two paths lands on different
//                  pixels.
//   conic          is the first shape in this engine that draws through an
//                  offscreen canvas of its own, keeps it in the layer's state
//                  between frames under a cache key, and then paints it
//                  through a rotation. Three separate ways for the preview
//                  and the exported file to disagree, and this is the only
//                  test that would notice.
//
// The angles and band counts below are deliberately awkward numbers rather
// than round ones, so a boundary landing half a pixel differently shows up as
// a difference instead of falling on a symmetry that hides it.
const DOC = {
  name: 'Parity',
  description: 'preview and export must agree',
  publisher: 'SignalForge',
  assets: { q: { kind: 'image', mime: 'image/png', data: QUADRANTS } },
  layers: [
    { id: 'a1', type: 'image', asset: 'q', fit: 'cover', motion: { kind: 'none' } },
    { id: 'a2', type: 'image', asset: 'q', fit: 'stretch', opacity: 0.4, blend: 'screen', motion: { kind: 'none' } },
    {
      id: 'a3', type: 'solid', color: '#2f7d5a', opacity: 0.35, blend: 'screen',
      motions: [{ kind: 'none' }]
    },
    {
      id: 'a4', type: 'gradient', shape: 'linear', angle: 35, opacity: 0.5, blend: 'screen',
      // Three stops at uneven positions, so a ramp built even slightly
      // differently on the two paths lands on different pixels rather than on
      // a symmetry that hides the difference.
      stops: [
        { at: 0, color: '#ff0066' },
        { at: 35, color: '#00b3ff' },
        { at: 100, color: '#1b2430' }
      ],
      motions: [{ kind: 'none' }]
    },
    {
      id: 'a5', type: 'gradient', shape: 'conic', bands: 2, angle: 37,
      opacity: 0.4, blend: 'screen',
      stops: [{ at: 0, color: '#ffcc00' }, { at: 60, color: '#00ff88' }, { at: 100, color: '#3300ff' }],
      // A spin entry that is standing still — see the note on the clock below.
      motions: [{ kind: 'spin', speed: 0, amount: 100 }]
    },
    {
      id: 'a6', type: 'gradient', shape: 'stripes', bands: 5, angle: 113,
      opacity: 0.35, blend: 'lighten',
      stops: [{ at: 0, color: '#ff0066' }, { at: 100, color: '#0b1020' }],
      motions: [{ kind: 'pulse', speed: 0, amount: 80 }]
    },
    {
      id: 'a7', type: 'gradient', shape: 'waves', bands: 3, angle: 22,
      opacity: 0.3, blend: 'screen',
      stops: [{ at: 10, color: '#12233a' }, { at: 90, color: '#8844ff' }],
      motions: [{ kind: 'none' }]
    },
    // -----------------------------------------------------------------------
    // ONE OF EVERY FIGURE, AND WHY ALL FOUR RATHER THAN ONE
    // -----------------------------------------------------------------------
    //
    // The four figures are not four settings of one drawing: they are four
    // different sets of canvas calls, and each has its own way of coming out
    // differently on the two paths.
    //
    //   circle  one arc. The control, and the cheapest thing that could fail.
    //   ring    two arcs wound opposite ways, so the middle is TRANSPARENT.
    //           This is the only layer in this document whose own interior
    //           lets what is under it through, so it is the only one that
    //           would catch the two paths compositing a hole differently.
    //   star    the first layer type in this engine that caches GEOMETRY (the
    //           unit vertices, keyed on the point count) rather than a
    //           picture. A cache that one day outlived its key would show up
    //           here and, for this layer type, nowhere else.
    //   heart   four bezierCurveTo, which nothing else in this project draws
    //           and which the corpus records exactly one host effect using.
    //
    // Deliberately overlapping and off-centre, at awkward sizes, so an edge
    // landing half a pixel differently shows up as a difference rather than
    // falling on a symmetry that hides it.
    {
      id: 'a8', type: 'shape', figure: 'circle', size: 37,
      position: { x: 23, y: 41 }, color: '#ff8800', opacity: 0.55, blend: 'screen',
      motions: [{ kind: 'none' }]
    },
    {
      id: 'a9', type: 'shape', figure: 'ring', size: 58, thickness: 31,
      position: { x: 71, y: 33 }, color: '#22ffcc', opacity: 0.6, blend: 'screen',
      motions: [{ kind: 'none' }]
    },
    {
      id: 'a10', type: 'shape', figure: 'star', points: 7, size: 44,
      position: { x: 39, y: 72 }, color: '#ffee00', opacity: 0.5, blend: 'lighten',
      // A spin that is standing still — the same trick the conic above uses,
      // and here it also drives the geometry cache: the vertices are built, the
      // rotate is decided against, and both paths must do both.
      motions: [{ kind: 'spin', speed: 0, amount: 100 }]
    },
    {
      id: 'a11', type: 'shape', figure: 'heart', size: 51,
      position: { x: 79, y: 68 }, color: '#ff2277', opacity: 0.45, blend: 'screen',
      motions: [{ kind: 'none' }]
    },
    // -----------------------------------------------------------------------
    // A SWARM, AND WHY IT IS THE HARSHEST LAYER IN THIS DOCUMENT
    // -----------------------------------------------------------------------
    //
    // Every other layer here is drawn from the document's own numbers. This one
    // is drawn from an integer hash of them (src/engine/hash.js), and it draws
    // 120 separate discs from it — so it is the only layer whose picture would
    // come apart completely, rather than shift slightly, if the two paths
    // computed one bit differently.
    //
    // Three ways it could diverge that nothing else in this file would catch:
    //
    //   the hash        Math.imul on 32-bit integers, three rounds of it, per
    //                   particle per channel. A bundler that folded one of
    //                   those constants to a double, or an engine that got
    //                   `>>>` wrong on a negative, would put every particle
    //                   somewhere else.
    //   the cache       the per-particle draws and the colour buckets are built
    //                   once and kept on the layer's state, keyed on the seed,
    //                   the count and the number of stops — the second cache of
    //                   that kind in this engine, after the conic's.
    //   the draw order  particles are drawn grouped BY COLOUR rather than by
    //                   index (see particleCache), so where two overlap, which
    //                   is on top depends on a counting sort. Both paths have
    //                   to sort identically, and with three colours and 120
    //                   particles there is plenty here to overlap.
    //
    // Deliberately at an awkward angle and an awkward seed, and translucent
    // over everything else, so a particle landing half a pixel differently
    // shows up as a difference rather than falling on a symmetry that hides it.
    {
      id: 'a12', type: 'particles', pattern: 'drift', count: 120, size: 6,
      tilt: 37, seed: 13, opacity: 0.7, blend: 'screen',
      // Three colours, which is what the corpus's commonest particle effect
      // uses (`Poison` and its eight copies pick `colors[this.ssi]`), and what
      // makes the colour bucketing above load-bearing here.
      stops: [
        { at: 0, color: '#ffdd55' }, { at: 50, color: '#55ffdd' }, { at: 100, color: '#dd55ff' }
      ],
      // STILL, in the one way this layer type can be still: travel speed 0.
      // That is not a motion switched off, it is a real setting somebody can
      // choose (a field of points that does not move — see the note beside
      // `speed` in src/engine/document.js), and every line of the position
      // arithmetic still runs to produce it. See the note on the clock below
      // for why nothing in this document may actually move.
      speed: 0,
      motions: [{ kind: 'pulse', speed: 0, amount: 60 }]
    }
  ],
  controls: []
};

// Every layer above is deliberately STILL, and adding a moving one would
// WEAKEN this test rather than strengthen it.
//
// The exported effect drives itself from its own requestAnimationFrame clock,
// while the engine job renders at an explicit timeSec we hand it. With any
// motion actually running the two would be sampled at different phases, so the
// comparison would measure clock alignment instead of engine equivalence — and
// would be flaky for a reason that has nothing to do with what this test exists
// to prove. With still layers the time is irrelevant and the comparison is
// exact.
//
// "Still" now has two spellings, and both are here on purpose. `kind: 'none'`
// is an entry the renderer skips outright. `speed: 0` is a spin and a pulse
// that genuinely RUN — their code is entered, their arithmetic is done, their
// result is written into the angle and into globalAlpha on both paths — and
// that arithmetic is exactly zero at every instant, because speedToRate(0) is
// exactly 0 and both motions are anchored so that a phase of zero means
// "unturned" and "full brightness". So the new motion paths are covered here
// without the comparison depending on a clock. That the two also move
// IDENTICALLY over time is a different claim and has its own test — see
// test/export/moving-shapes.test.js, which drives the exported file's own
// clock and requires it to animate.

// ---------------------------------------------------------------------------
// WHAT PARITY MEANS ONCE A DOCUMENT CAN CARRY A TRAIL
// ---------------------------------------------------------------------------
//
// The test below compares ONE frame, and it can, because every document it
// knows about is a pure function of (document, assets, time): render at t and
// you get the same pixels whenever and however often you ask.
//
// A trail gives that up on purpose — frame N is composited over frame N-1, so
// there is no such thing as "the frame at t = 0.8" without the frames that led
// to it (docs/effekt-inventur.md, section C2, names this price in advance).
// The guarantee that replaces it is the honest one, and it is what the second
// test proves:
//
//   two renderers that both start from frame 0 and are given the SAME SEQUENCE
//   of frames end on the same pixels.
//
// Both halves are needed. The single-frame test stays exactly as it was, and
// stays the stronger claim, for every document without a trail — which is
// still every document this app makes unless somebody moves that slider.
//
// The two clocks have to be made to agree, and that is the fiddly part rather
// than an incidental. The exported effect accumulates its own seconds from the
// timestamps its host hands it (see `advance` in src/export/build-effect.js);
// the engine job is given seconds outright. So the stamps are handed to the
// effect and the very same accumulation is done here, in the same order, on
// the same doubles — not a tidier equivalent of it — and the resulting seconds
// are what the engine renders at. A tidier equivalent (t = i / 25, say) would
// differ in the last bits and turn an exact comparison into a fuzzy one.
const TRAIL_STAMPS = Array.from({ length: 30 }, (unused, i) => 1000 + i * 40);

/** The seconds the exported effect's own clock will arrive at, stamp by stamp. */
function secondsFrom(stamps) {
  const seconds = [];
  let elapsed = 0;
  let previous = null;
  for (const stamp of stamps) {
    // The first frame is always t = 0, whatever the host started counting
    // from; after that it is the gap, in seconds, added on.
    if (previous !== null) elapsed += (stamp - previous) / 1000;
    previous = stamp;
    seconds.push(elapsed);
  }
  return seconds;
}

const TRAIL_DOC = {
  name: 'Parity with a wake',
  description: 'preview and export must agree frame for frame',
  publisher: 'SignalForge',
  // Strong enough that several seconds of history are visibly still in the
  // frame at the end, so a renderer that quietly cleared instead of veiling
  // could not pass this by drawing the last frame correctly.
  trail: 75,
  // And a hue that is turning, so the second thing this change added is under
  // the same comparison: it is time-dependent, it runs in the shared pixel
  // pass, and it is applied to the composite AFTER the veil.
  hueCycle: 45,
  hueShift: 20,
  // HALF TRANSPARENT, AND THAT IS NOT A DETAIL OF THIS TEST BUT OF THE FEATURE.
  // The veil goes UNDER the frame being drawn, which is what the eight effects
  // in docs/effekt-inventur.md section A2 do — so an opaque layer covering all
  // 320 x 200 repaints every pixel and hides its own wake completely. Something
  // has to let the past through: an opacity below 1 here, or an additive blend,
  // or (once there are any) particles that only cover part of the canvas.
  //
  // AND THE SECOND LAYER IS THE ONE THAT WAS BEING WAITED FOR. The note above
  // was written when the only way to see a wake was to hold a layer's opacity
  // down, and it names the missing piece — something that only covers part of
  // the canvas. A drifting figure is exactly that, at full opacity: it leaves
  // every pixel it is not on untouched, so its wake is the real thing rather
  // than a half-transparent ramp showing through itself. It is here because a
  // wake accumulated over thirty frames is the harshest comparison in this file
  // — one pixel out on frame 3 is still there, compounded, on frame 30 — and
  // the layer type that finally makes wakes worth having should be under it.
  layers: [
    {
      id: 'a1', type: 'gradient', shape: 'stripes', bands: 4, angle: 113,
      opacity: 0.45,
      stops: [{ at: 0, color: '#ff0066' }, { at: 100, color: '#0b1020' }],
      motions: [{ kind: 'drift', speed: 55, amount: 90 }]
    },
    {
      id: 'a2', type: 'shape', figure: 'star', points: 5, size: 26,
      position: { x: 50, y: 50 }, color: '#ffee88', blend: 'screen',
      motions: [
        { kind: 'drift', speed: 62, amount: 85 },
        { kind: 'spin', speed: 48, amount: 70 }
      ]
    },
    // AND THE LAYER THIS WHOLE SEQUENCE COMPARISON WAS BUILT FOR.
    //
    // The single-frame test above holds its swarm still, because a moving layer
    // there would measure clock alignment instead of engine equivalence. This
    // test has no such limit — it drives both sides through the SAME thirty
    // stamps — so here the swarm actually travels, which is the only way the
    // time-dependent half of the arithmetic gets under a byte-for-byte
    // comparison at all: the fractional part that wraps, the per-particle speed
    // spread, the sway, the growth.
    //
    // It is also the pairing docs/effekt-inventur.md has been pointing at from
    // the beginning. Section C2 ends by naming particles as the trail's real
    // beneficiary — "die decken die Fläche nie" — and this is the first
    // document in this project where the two are in the same frame under an
    // exact comparison. Thirty frames of accumulated wake is the harshest thing
    // in this file: one particle a pixel out on frame 3 is still there,
    // compounded, on frame 30.
    {
      id: 'a3', type: 'particles', pattern: 'rain', count: 90, size: 4,
      tilt: 10, seed: 7, speed: 55, blend: 'screen',
      stops: [{ at: 0, color: '#aaddff' }, { at: 100, color: '#ffffff' }],
      motions: [{ kind: 'breathe', speed: 30, amount: 40 }]
    }
  ],
  controls: []
};

test('a trailing effect and the engine agree frame for frame from frame zero', async () => {
  const engineSource = readFileSync(new URL('../../dist/engine.bundle.js', import.meta.url), 'utf8');
  const dir = mkdtempSync(join(tmpdir(), 'signalforge-parity-trail-'));
  const file = join(dir, 'effect.html');
  writeFileSync(file, buildEffectHtml({ doc: TRAIL_DOC, engineSource, lang: 'en' }), 'utf8');

  try {
    const [viaEngine, viaExport, noTrail] = await runJobs([
      { name: 'engine', kind: 'engine', doc: TRAIL_DOC, frames: secondsFrom(TRAIL_STAMPS) },
      // restart: the effect draws frames of its own from the moment it loads —
      // its animation-frame loop, and the interval that keeps a stalled effect
      // alive — and with a trail every one of those lands in the picture and
      // stays. So it is put back to frame zero and both ways in are withheld,
      // and this list becomes its entire history. See restartFromFrameZero in
      // test/harness/electron-main.cjs.
      { name: 'export', kind: 'html', file, stamps: TRAIL_STAMPS, restart: true, settleMs: 0 },
      // The control: the same sequence with the trail switched off. If this
      // came back identical to the trailing run, the comparison above would be
      // proving nothing at all.
      {
        name: 'no-trail', kind: 'engine',
        doc: { ...TRAIL_DOC, trail: 0 }, frames: secondsFrom(TRAIL_STAMPS)
      }
    ]);

    assert.ok(meanBrightness(viaEngine.pixels) > 5, 'engine frame is blank');
    assert.ok(meanBrightness(viaExport.pixels) > 5, 'exported frame is blank');
    assert.equal(viaEngine.width, viaExport.width);
    assert.equal(viaEngine.height, viaExport.height);

    assert.ok(
      maxDifference(viaEngine.pixels, noTrail.pixels) > 0,
      'the trail must actually change the frame, or this test compares nothing'
    );

    assert.equal(maxDifference(viaEngine.pixels, viaExport.pixels), 0,
      `after ${TRAIL_STAMPS.length} frames the two paths differ; mean difference `
        + `${meanDifference(viaEngine.pixels, viaExport.pixels)}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the exported effect renders the same pixels as the engine does', async () => {
  const engineSource = readFileSync(new URL('../../dist/engine.bundle.js', import.meta.url), 'utf8');
  const dir = mkdtempSync(join(tmpdir(), 'signalforge-parity-'));
  const file = join(dir, 'effect.html');
  writeFileSync(file, buildEffectHtml({ doc: DOC, engineSource, lang: 'en' }), 'utf8');

  try {
    const [viaEngine, viaExport] = await runJobs([
      { name: 'engine', kind: 'engine', doc: DOC, timeSec: 0 },
      { name: 'export', kind: 'html', file, settleMs: 400 }
    ]);

    // Something must actually be on screen, otherwise "identical" is meaningless.
    assert.ok(meanBrightness(viaEngine.pixels) > 5, 'engine frame is blank');
    assert.ok(meanBrightness(viaExport.pixels) > 5, 'exported frame is blank');

    assert.equal(viaEngine.width, viaExport.width);
    assert.equal(viaEngine.height, viaExport.height);

    // Still motion at t=0: the two paths must land on the same pixels.
    assert.equal(maxDifference(viaEngine.pixels, viaExport.pixels), 0,
      `mean difference was ${meanDifference(viaEngine.pixels, viaExport.pixels)}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ============================================================================
// A BACKGROUND UNDER THE LAYER THE APP EDITS
// ============================================================================
//
// Every document above carries its layers as data and no controls at all, which
// is the right shape for asking "do the two renderers agree". These two ask a
// narrower question that only a document with two slots can ask, and it needs
// the REAL control list baked in to ask it: every control's bind path names its
// layer by ID ("background.angle"), and applyControls resolves that name to a
// POSITION on every single frame of the exported effect (resolveLayerPath in
// src/engine/bind.js) while the engine job is handed the document untouched.
//
// So if the export ever bound the background's knobs to the foreground — which
// is exactly what reading layers[0] used to do the moment a document had two
// layers — the exported file would write the gradient's angle into the swarm
// and these comparisons would come apart. With the ids right, every control
// writes back the value it was defaulted from and the two paths land on the
// same pixels.
//
// The pairing is the one the whole feature was asked for: rain over a conic
// that turns.

/** The document as export-effect.js would prepare it, controls and all. */
function withRealControls(raw) {
  const normalized = normalizeDocument(raw).doc;
  const layerId = foregroundOf(normalized.layers).id;
  const backgroundId = backgroundOf(normalized.layers)?.id ?? null;
  let prepared = withLiveMotion(normalized, layerId);
  if (backgroundId) prepared = withLiveMotion(prepared, backgroundId);
  return { ...prepared, controls: effectControls(prepared, layerId, backgroundId) };
}

const RAIN_OVER_CONIC = {
  name: 'Regen vor einem Farbkreis',
  description: 'a background under the layer the app edits',
  publisher: 'SignalForge',
  layers: [
    {
      id: 'background', type: 'gradient', shape: 'conic', bands: 3, angle: 113,
      stops: [{ at: 0, color: '#20106a' }, { at: 100, color: '#0aa3c2' }],
      motions: [{ kind: 'spin', speed: 48, amount: 70 }]
    },
    {
      id: 'fill', type: 'particles', pattern: 'rain', count: 90, size: 4,
      tilt: 10, seed: 7, speed: 55,
      stops: [{ at: 0, color: '#aaddff' }, { at: 100, color: '#ffffff' }],
      motions: [{ kind: 'breathe', speed: 30, amount: 40 }]
    }
  ]
};

/**
 * The same document held still, DERIVED rather than written out a second time.
 *
 * The single-frame comparison drives the exported effect from its own clock and
 * the engine from an explicit second, so anything that moves would be measuring
 * clock alignment rather than engine equivalence — the same reason DOC at the
 * top of this file holds its own swarm still. Deriving it means the two cases
 * cannot drift into being about different pictures.
 */
const STILL_RAIN_OVER_CONIC = {
  ...RAIN_OVER_CONIC,
  layers: RAIN_OVER_CONIC.layers.map((layer) => ({
    ...layer, motions: [], ...(layer.type === 'particles' ? { speed: 0 } : {})
  }))
};

test('a still background under a still swarm renders the same on both paths', async () => {
  const engineSource = readFileSync(new URL('../../dist/engine.bundle.js', import.meta.url), 'utf8');
  const dir = mkdtempSync(join(tmpdir(), 'signalforge-parity-background-'));
  const file = join(dir, 'effect.html');
  const doc = withRealControls(STILL_RAIN_OVER_CONIC);
  writeFileSync(file, buildEffectHtml({ doc, engineSource, lang: 'en' }), 'utf8');

  try {
    const [viaEngine, viaExport] = await runJobs([
      { name: 'engine', kind: 'engine', doc, timeSec: 0 },
      { name: 'export', kind: 'html', file, settleMs: 400 }
    ]);

    assert.ok(meanBrightness(viaEngine.pixels) > 5, 'engine frame is blank');
    assert.ok(meanBrightness(viaExport.pixels) > 5, 'exported frame is blank');
    assert.equal(viaEngine.width, viaExport.width);
    assert.equal(viaEngine.height, viaExport.height);
    assert.equal(maxDifference(viaEngine.pixels, viaExport.pixels), 0,
      `mean difference was ${meanDifference(viaEngine.pixels, viaExport.pixels)}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/**
 * The same pairing with the wake switched on — and this is the harshest
 * comparison in this file, because it is the only one where BOTH kinds of state
 * this engine keeps are running at once and feeding each other.
 *
 * The trailing document at the top of the file has no background, so it renders
 * through the veil canvas: an opaque buffer dimmed by Chromium's own
 * source-over. This one renders through the OTHER wake (renderOverBackground in
 * src/engine/engine.js): a transparent buffer whose alpha is eaten away by
 * arithmetic of the engine's own, read back with getImageData and written back
 * with putImageData once per frame.
 *
 * That read-back is exactly why this test has to exist rather than being
 * implied by the two above it. Everywhere else the two paths agree because they
 * hand the same drawing commands to the same browser; here the engine takes
 * 64000 pixels out of a canvas, changes them and puts them back, thirty times,
 * with each frame's arithmetic standing on the previous frame's result. One bit
 * different anywhere in that chain on either side and the last frame is visibly
 * not the same picture.
 */
const RAINING_OVER_CONIC = { ...RAIN_OVER_CONIC, name: 'Regen mit Spur', trail: 70 };

test('a wake over a turning background agrees frame for frame from frame zero', async () => {
  const engineSource = readFileSync(new URL('../../dist/engine.bundle.js', import.meta.url), 'utf8');
  const dir = mkdtempSync(join(tmpdir(), 'signalforge-parity-background-wake-'));
  const file = join(dir, 'effect.html');
  const doc = withRealControls(RAINING_OVER_CONIC);
  writeFileSync(file, buildEffectHtml({ doc, engineSource, lang: 'en' }), 'utf8');

  try {
    const [viaEngine, viaExport, noTrail] = await runJobs([
      { name: 'engine', kind: 'engine', doc, frames: secondsFrom(TRAIL_STAMPS) },
      { name: 'export', kind: 'html', file, stamps: TRAIL_STAMPS, restart: true, settleMs: 0 },
      // The control: the same thirty frames with the wake switched off. This is
      // the assertion that used to be impossible to make — until 12.08.2026 a
      // trail under a background changed nothing whatsoever, so this run and the
      // one above it would have come back identical and the comparison would
      // have proved nothing at all about the wake.
      {
        name: 'no-trail', kind: 'engine',
        doc: withRealControls({ ...RAINING_OVER_CONIC, trail: 0 }),
        frames: secondsFrom(TRAIL_STAMPS)
      }
    ]);

    assert.ok(meanBrightness(viaEngine.pixels) > 5, 'engine frame is blank');
    assert.ok(meanBrightness(viaExport.pixels) > 5, 'exported frame is blank');
    assert.ok(maxDifference(viaEngine.pixels, noTrail.pixels) > 0,
      'the wake must actually change the frame, or this test compares nothing');
    assert.equal(maxDifference(viaEngine.pixels, viaExport.pixels), 0,
      `after ${TRAIL_STAMPS.length} frames the two paths differ; mean difference `
        + `${meanDifference(viaEngine.pixels, viaExport.pixels)}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('rain over a turning background agrees frame for frame from frame zero', async () => {
  const engineSource = readFileSync(new URL('../../dist/engine.bundle.js', import.meta.url), 'utf8');
  const dir = mkdtempSync(join(tmpdir(), 'signalforge-parity-background-seq-'));
  const file = join(dir, 'effect.html');
  const doc = withRealControls(RAIN_OVER_CONIC);
  writeFileSync(file, buildEffectHtml({ doc, engineSource, lang: 'en' }), 'utf8');

  try {
    const [viaEngine, viaExport, still] = await runJobs([
      { name: 'engine', kind: 'engine', doc, frames: secondsFrom(TRAIL_STAMPS) },
      { name: 'export', kind: 'html', file, stamps: TRAIL_STAMPS, restart: true, settleMs: 0 },
      // The control: the same document with nothing moving. If the moving run
      // came back identical to this, the sequence above would be proving
      // nothing about time at all.
      {
        name: 'still', kind: 'engine',
        doc: withRealControls(STILL_RAIN_OVER_CONIC), frames: secondsFrom(TRAIL_STAMPS)
      }
    ]);

    assert.ok(meanBrightness(viaEngine.pixels) > 5, 'engine frame is blank');
    assert.ok(meanBrightness(viaExport.pixels) > 5, 'exported frame is blank');
    assert.ok(maxDifference(viaEngine.pixels, still.pixels) > 0,
      'nothing moved in thirty frames, so this compares nothing');
    assert.equal(maxDifference(viaEngine.pixels, viaExport.pixels), 0,
      `after ${TRAIL_STAMPS.length} frames the two paths differ; mean difference `
        + `${meanDifference(viaEngine.pixels, viaExport.pixels)}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
