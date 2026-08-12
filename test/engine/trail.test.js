// SignalForge — build SignalRGB effects from images, gradients, shapes and particles.
// Copyright (C) 2026 Max Leopold Blumenschein
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  trailAlpha, TRAIL_STRONGEST_VEIL, TRAIL_WEAKEST_VEIL, createRenderer
} from '../../src/engine/engine.js';
import { normalizeDocument, MAX_TRAIL } from '../../src/engine/document.js';
import { runJobs } from '../harness/render.js';
import { maxDifference, pixelAt, meanBrightness } from '../harness/pixels.js';

// ------------------------------------------------------------- the mapping

test('no trail is a hard clear, whatever junk the field carries', () => {
  assert.equal(trailAlpha(0), 1);
  assert.equal(trailAlpha(-5), 1);
  assert.equal(trailAlpha(NaN), 1);
  assert.equal(trailAlpha(undefined), 1);
  assert.equal(trailAlpha('a lot'), 1);
});

test('the two ends of the slider are the two measured veils', () => {
  assert.equal(trailAlpha(1), TRAIL_STRONGEST_VEIL);
  assert.equal(trailAlpha(MAX_TRAIL), TRAIL_WEAKEST_VEIL);
  assert.equal(trailAlpha(1e6), TRAIL_WEAKEST_VEIL, 'past the top is the top');
});

test('every step of the slider makes the wake longer, never shorter', () => {
  let previous = trailAlpha(1);
  for (let trail = 2; trail <= MAX_TRAIL; trail += 1) {
    const alpha = trailAlpha(trail);
    assert.ok(alpha < previous, `trail ${trail} veils harder than ${trail - 1} does`);
    previous = alpha;
  }
});

test('the slider is geometric, so each step lengthens the wake by the same factor', () => {
  // A straight line from 0.5 to 0.02 would put every long ghost in the last
  // few steps; this is the claim that it does not. The ratio between two
  // neighbouring steps is the same everywhere along the slider.
  const ratio = (trail) => trailAlpha(trail + 1) / trailAlpha(trail);
  const first = ratio(1);
  for (const trail of [5, 25, 50, 75, 99]) {
    assert.ok(Math.abs(ratio(trail) - first) < 1e-12, `the step at ${trail} is not the step at 1`);
  }
});

test('a document says there is no trail until it is told otherwise, and clamps what it is told', () => {
  assert.equal(normalizeDocument({}).doc.trail, 0);
  assert.equal(normalizeDocument({ trail: 1e6 }).doc.trail, MAX_TRAIL);
  assert.equal(normalizeDocument({ trail: -1e6 }).doc.trail, 0);
  assert.equal(normalizeDocument({ trail: 'lots' }).doc.trail, 0);
});

/**
 * The OTHER place trail is read, and the one normalizeDocument's own coercion
 * cannot stand in for: render() re-reads doc.trail every frame rather than
 * trusting what normalizeDocument last approved, for the same reason radiusOf
 * does in src/engine/layers/shape.js -- applyControls (src/engine/bind.js)
 * writes a SignalRGB control's raw value straight into the document, and a
 * numeric string ("50") is exactly what a panel can hand back.
 *
 * hueDegrees already reads hueShift with `Number(hueShift)` before checking
 * it is finite, so a string survives; render() used to check
 * `Number.isFinite(doc.trail)` directly, which is false for a string
 * regardless of what it contains, and silently treated "50" as 0 (off).
 *
 * Run in plain Node, no Electron: a document with no layers and every colour
 * field neutral never reaches a pixel, and the veil canvas render() builds
 * for a trail is stubbed out here the same way ctx is, rather than needing a
 * real one -- see the neutral-document tests in color.test.js for the
 * pattern this borrows.
 */
test('trail arriving as a numeric string is read, not dropped', () => {
  let veilCanvasesBuilt = 0;
  let veilCopiedToVisibleCanvas = 0;
  const fakeVeilCtx = {
    fillStyle: '', globalAlpha: 1, globalCompositeOperation: 'source-over',
    fillRect() {}
  };
  const originalDocument = globalThis.document;
  globalThis.document = {
    createElement(tag) {
      assert.equal(tag, 'canvas', 'the veil is the only thing render() ever asks document for');
      veilCanvasesBuilt += 1;
      return { width: 0, height: 0, getContext: () => fakeVeilCtx };
    }
  };

  const ctx = {
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    fillStyle: '',
    fillRect() {},
    save() {},
    restore() {},
    drawImage() { veilCopiedToVisibleCanvas += 1; },
    getImageData() { throw new Error('must not read pixels back for a neutral document'); },
    putImageData() { throw new Error('must not write pixels for a neutral document'); }
  };

  // Bypasses normalizeDocument entirely -- this is what applyControls hands
  // render(), not what a freshly opened project file looks like.
  const doc = {
    layers: [], controls: [], version: 1,
    brightness: 100, saturation: 100, greenMagenta: 0, blueYellow: 0,
    hueShift: 0, hueCycle: 0,
    trail: '50'
  };

  try {
    const renderer = createRenderer();
    renderer.render(ctx, doc, new Map(), 0);
  } finally {
    globalThis.document = originalDocument;
  }

  // A trail read as 0 takes the hard-clear path straight on `ctx` and never
  // builds a veil canvas at all -- the failure this test would have caught.
  assert.equal(veilCanvasesBuilt, 1, 'trail "50" must take the veil path, the same as trail 50');
  assert.equal(veilCopiedToVisibleCanvas, 1, 'and the veil must be copied back onto the visible canvas');
});

// ------------------------------------------------------------- the rendering
//
// Everything below needs a real canvas, because what a translucent black
// rectangle laid over an opaque one comes to is the browser's arithmetic and
// not this project's. It runs in the same Electron the exported effect is
// judged in.

/** A full-canvas white field, so a wake is unmistakable against black. */
const LIT = {
  name: 'Lit',
  layers: [{ id: 'a1', type: 'solid', color: '#ffffff', motions: [] }],
  controls: []
};
/** The same document with nothing drawn at all: only the clear or the veil. */
const DARK = { name: 'Dark', layers: [], controls: [] };

const withTrail = (doc, trail) => ({ ...doc, trail });

test('a trail keeps the previous frame, and no trail wipes it — measured, not assumed', async () => {
  // One lit frame, then a document with nothing in it. Without a trail the
  // second frame is the hard clear this engine has always done and comes back
  // pure black; with one it comes back at very nearly the fraction the veil
  // leaves standing. That is the whole feature in two frames.
  const [off, on] = await runJobs([
    {
      name: 'off',
      kind: 'engine',
      doc: withTrail(LIT, 0),
      frames: [{ timeSec: 0 }, { doc: withTrail(DARK, 0), timeSec: 1 / 30 }]
    },
    {
      name: 'on',
      kind: 'engine',
      doc: withTrail(LIT, 60),
      frames: [{ timeSec: 0 }, { doc: withTrail(DARK, 60), timeSec: 1 / 30 }]
    }
  ]);

  const wiped = pixelAt(off.pixels, off.width, 160, 100);
  assert.deepEqual([wiped.r, wiped.g, wiped.b], [0, 0, 0], 'no trail must leave nothing behind');

  const ghost = pixelAt(on.pixels, on.width, 160, 100);
  const expected = 255 * (1 - trailAlpha(60));
  assert.ok(
    Math.abs(ghost.r - expected) <= 2,
    `frame N must hold frame N-1 attenuated: expected about ${expected.toFixed(1)}, got ${ghost.r}`
  );
  assert.equal(ghost.r, ghost.g, 'the veil is black, so it cannot tint what it dims');
  assert.equal(ghost.g, ghost.b);
});

test('the wake goes on fading, frame after frame, and reaches nothing at all', async () => {
  // The claim the whole trail rests on, and the one that could have gone the
  // other way: an 8-bit multiply can STALL. If `value * (1 - alpha)` ever
  // rounds back to `value`, the pixel is stuck and the effect keeps a
  // permanent smear of everything it has ever drawn. Measured here at the
  // weakest veil there is — the case where a stall would be worst — over more
  // frames than the fade is supposed to need.
  const frames = [{ timeSec: 0 }];
  for (let i = 1; i < 400; i += 1) {
    frames.push(i === 1 ? { doc: withTrail(DARK, MAX_TRAIL), timeSec: i / 30 } : { timeSec: i / 30 });
  }

  const [run] = await runJobs([{
    name: 'fade', kind: 'engine', doc: withTrail(LIT, MAX_TRAIL), frames, trace: true
  }]);

  const brightest = run.trace.map((entry) => entry.max);
  assert.equal(brightest[0], 255, 'the lit frame must actually be lit');
  // Monotonic all the way down: never brighter than the frame before it.
  for (let i = 2; i < brightest.length; i += 1) {
    assert.ok(
      brightest[i] <= brightest[i - 1],
      `frame ${i} got brighter (${brightest[i - 1]} -> ${brightest[i]}) with nothing drawing`
    );
  }
  const settled = brightest.indexOf(0);
  assert.ok(settled > 30, `a wake that is gone in ${settled} frames is not a wake`);
  assert.ok(settled < 200, `the wake had not gone after ${brightest.length} frames`);
  // And it stays gone rather than sitting on a residue floor.
  assert.equal(brightest[brightest.length - 1], 0);
  assert.equal(meanBrightness(run.pixels), 0, 'the frame must end exactly black');
});

test('a long run settles instead of drifting: frame 999 and frame 1000 are the same bytes', async () => {
  // The other way a feedback loop can go wrong. The document below draws a
  // half-transparent field every frame over whatever the veil left, so the
  // picture climbs towards a fixed point rather than towards black — and the
  // question is whether it STOPS there or keeps creeping. A thousand frames,
  // and then two frames compared byte for byte.
  const climbing = {
    name: 'Climbing',
    trail: 80,
    layers: [{ id: 'a1', type: 'solid', color: '#ffffff', opacity: 0.5, motions: [] }],
    controls: []
  };
  const upTo = (count) => Array.from({ length: count }, (unused, i) => i / 30);

  const [ninth, thousandth] = await runJobs([
    { name: '999', kind: 'engine', doc: climbing, frames: upTo(999) },
    { name: '1000', kind: 'engine', doc: climbing, frames: upTo(1000) }
  ]);

  // A single frame of a half-transparent white field over black is 127; the
  // veil piles it on itself until it settles at 127.5 / (1 - 0.5 * (1 - alpha))
  // = about 245. Requiring well over 200 is therefore also the proof that a
  // thousand frames really were rendered one after another rather than one
  // frame a thousand times.
  const settled = meanBrightness(thousandth.pixels);
  assert.ok(settled > 200, `the wake must actually pile up; the frame came back at ${settled}`);
  assert.ok(settled <= 255, `and it must stay a possible picture; got ${settled}`);
  assert.equal(
    maxDifference(ninth.pixels, thousandth.pixels), 0,
    'a thousand frames in, one more frame must change nothing: the wake has settled, not drifted'
  );
});

// -------------------------------------------- the wake life, remeasured
//
// The frame counts in the table beside TRAIL_STRONGEST_VEIL were measured for
// the veil over black. The wake over a background fades by different arithmetic
// (attenuateWake in src/engine/engine.js eats an ALPHA away, because the
// compositor provably cannot: work/wake-probe.cjs), so the counts have to be
// asked for again rather than assumed to carry over.
//
// The instrument is deliberately the SAME one the old counts were taken with —
// a full-brightness white field, traced frame by frame until it reaches zero —
// and the background is BLACK, so the only thing that differs between this
// measurement and the one above it is which path the renderer takes. A black
// background is a real background as far as this engine is concerned
// (backgroundKindOf says `solid`), and it makes the pixel value read out as the
// wake's own alpha: white at coverage a over black is exactly a.

/** A background, so the renderer takes the wake path rather than the veil. */
const BLACK_BEHIND = { id: 'background', type: 'solid', color: '#000000', motions: [] };
/** The foreground that lights one frame and is then switched off. */
const WHITE_FRONT = { id: 'front', type: 'solid', color: '#ffffff', motions: [] };
// Opacity 0 rather than a shorter layer list: dropping the layer would leave a
// ONE-layer document, which has no background, which is the other path.
const FRONT_OFF = { ...WHITE_FRONT, opacity: 0 };

/** One lit frame over a background, then `count` frames of nothing but the wake. */
async function wakeLife(name, trail, count) {
  const frames = [{ timeSec: 0 }];
  for (let i = 1; i < count; i += 1) {
    frames.push(i === 1
      ? { doc: { trail, layers: [BLACK_BEHIND, FRONT_OFF] }, timeSec: i / 30 }
      : { timeSec: i / 30 });
  }
  const [run] = await runJobs([{
    name, kind: 'engine', doc: { trail, layers: [BLACK_BEHIND, WHITE_FRONT] }, frames, trace: true
  }]);
  return run;
}

test('the wake over a background reaches exactly nothing, in the frames the table says', async () => {
  // THE TWO ENDS OF THE SLIDER, WHICH ARE THE TWO ENDS OF THE TABLE.
  //
  // 8 frames at alpha 0.50 and 114 at alpha 0.02 are what attenuateWake's rule
  // comes to, and the two ends are checked here against the real engine in a
  // real Chromium so that the round trip through getImageData/putImageData —
  // the one part of that rule that is not plain integer arithmetic — cannot
  // quietly perturb an alpha on the way through.
  //
  // AND THE FLOOR, WHICH IS THE WHOLE REASON attenuateWake EXISTS. Every way of
  // asking the compositor to do this multiply stalls: at trail 100 a
  // `destination-out` wake stops at 25/255 and stays there for ever, which is a
  // permanent haze over every pixel anything has ever crossed. `settled` being
  // a number at all, rather than -1, is that failure not happening.
  const [strong, weak] = await Promise.all([
    wakeLife('strongest', 1, 40),
    wakeLife('weakest', MAX_TRAIL, 260)
  ]);

  for (const [label, run, expected] of [['trail 1', strong, 8], ['trail 100', weak, 114]]) {
    const brightest = run.trace.map((entry) => entry.max);
    assert.equal(brightest[0], 255, `${label}: the lit frame must actually be lit`);
    for (let i = 1; i < brightest.length; i += 1) {
      assert.ok(brightest[i] <= brightest[i - 1],
        `${label}: frame ${i} got brighter (${brightest[i - 1]} -> ${brightest[i]})`);
    }
    assert.equal(brightest.indexOf(0), expected,
      `${label}: the table says the wake is gone after ${expected} frames`);
    assert.equal(meanBrightness(run.pixels), 0,
      `${label}: the frame must end exactly black, with no residue floor at all`);
  }
});

test('with no trail a sequence lands exactly where a single frame does', async () => {
  // The promise that the old path is untouched. A document with no trail is
  // still a pure function of its time: ten frames of history must leave the
  // renderer in exactly the state it would have been in with none.
  const still = {
    name: 'Still',
    layers: [{
      id: 'a1', type: 'gradient', shape: 'stripes', bands: 5, angle: 37,
      stops: [{ at: 0, color: '#ff0066' }, { at: 100, color: '#0b1020' }],
      motions: [{ kind: 'drift', speed: 40, amount: 70 }]
    }],
    controls: []
  };

  const [alone, afterHistory] = await runJobs([
    { name: 'alone', kind: 'engine', doc: still, frames: [0.3] },
    { name: 'history', kind: 'engine', doc: still, frames: [0, 0.1, 0.2, 0.25, 0.28, 0.3] }
  ]);

  assert.ok(meanBrightness(alone.pixels) > 5, 'the frame must not be blank');
  assert.equal(
    maxDifference(alone.pixels, afterHistory.pixels), 0,
    'without a trail, what came before must not reach the frame at all'
  );
});
