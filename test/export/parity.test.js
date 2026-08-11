// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runJobs } from '../harness/render.js';
import { meanDifference, maxDifference, meanBrightness } from '../harness/pixels.js';
import { buildEffectHtml } from '../../src/export/build-effect.js';

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
  layers: [{
    id: 'a1', type: 'gradient', shape: 'stripes', bands: 4, angle: 113,
    opacity: 0.45,
    stops: [{ at: 0, color: '#ff0066' }, { at: 100, color: '#0b1020' }],
    motions: [{ kind: 'drift', speed: 55, amount: 90 }]
  }],
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
