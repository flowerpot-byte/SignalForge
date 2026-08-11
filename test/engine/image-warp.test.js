// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { runJobs } from '../harness/render.js';
import { meanBrightness, meanDifference, pixelAt, isColour } from '../harness/pixels.js';
import { speedToRate } from '../../src/engine/motion/speed.js';
import { WARP_SPEED_SCALE } from '../../src/engine/motion/warp.js';

// Every moving sample below is taken at a stated point of the warp field's own
// cycle, not at a stated wall-clock second.
//
// warp's field phase is timeSec * speedToRate(speed) * WARP_SPEED_SCALE, and
// the tempo curve's ceiling has moved once already (MAX_RATE in
// src/engine/motion/speed.js went from 1 to 7 to answer "far too slow even at
// maximum speed"). A hard-coded `timeSec: 12` therefore stopped meaning "a
// good way into the cycle" and started meaning "eight cycles further on,
// wherever that lands" -- which, on this fixture, landed close enough to the
// starting frame that "different time, different frame" failed on a motion
// that was working perfectly. The phases below are the ones this file has
// always tested at; they are now stated as such.
const WARP_SPEED = 60;
const atPhase = (phase) => phase / (speedToRate(WARP_SPEED) * WARP_SPEED_SCALE);
/** A good way into the field's slowest wave -- what `timeSec: 12` used to buy. */
const MOVED = atPhase(10.478);
/** A different point of the same field -- what `timeSec: 5` used to buy. */
const MOVED_ELSEWHERE = atPhase(4.366);

const QUADRANTS = 'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAHklEQVR42mXJsQ0AAAgDIOr/P9fVRFZSkMI4QtE/C5t8BQM0UanVAAAAAElFTkSuQmCC';

// 40x10 PNG: four vertical stripes — red, green, blue, white, ten pixels each.
// Wide enough (aspect 4.0 against the buffer's 1.6) that 'cover' leaves real
// content beyond the crop on both sides, which is the case the padded buffer
// exists for and the one the old geometry bug broke.
const STRIPES = 'iVBORw0KGgoAAAANSUhEUgAAACgAAAAKCAIAAABJ+IsHAAAAIUlEQVR42mP8z4APMFIg/R+vXiaGAQKjFo9aPGrx0LcYALLUBRE2hoRCAAAAAElFTkSuQmCC';

function warpDoc(amount, timeSecIgnored) {
  return {
    assets: { q: { kind: 'image', mime: 'image/png', data: QUADRANTS } },
    layers: [{ type: 'image', asset: 'q', fit: 'stretch', motion: { kind: 'warp', speed: WARP_SPEED, amount } }]
  };
}

// fit: 'cover' geometry for STRIPES (srcW=40, srcH=10) into the BUFFER_WIDTH x
// BUFFER_HEIGHT (160x100) working buffer, via computeSourceRect:
//   srcAspect = 40/10 = 4.0, dstAspect = 160/100 = 1.6, srcAspect > dstAspect
//   -> sh = srcH = 10, sw = srcH * dstAspect = 16
//   slackX = 40 - 16 = 24, slackY = 10 - 10 = 0
//   sx = slackX / 2 = 12 (offsetX defaults to 0), sy = 0
//   rect = { sx: 12, sy: 0, sw: 16, sh: 10, dx: 0, dy: 0, dw: 160, dh: 100 }
// buildSource then reaches BUFFER_PAD (10) buffer-pixels further out on every
// side and clamps to the real image (scaleX = scaleY = 0.1):
//   wantX = 12 - 10*0.1 = 11, wantW = 16 + 2 = 18  -> gotX = 11, gotW = min(40, 29) - 11 = 18
//   wantY = 0 - 10*0.1 = -1,  wantH = 10 + 2 = 12  -> gotY = 0,  gotH = min(10, 11) - 0 = 10
//   destX = 10 + (11 - 12)/0.1 = 0,   destW = 18/0.1 = 180
//   destY = 10 + (0 - 0)/0.1 = 10,    destH = 10/0.1 = 100
// destX=0, destW=180 exactly spans the padded buffer's full width (160 + 2*10)
// with real stripe pixels, not stretched-edge fill — this is the unclamped
// case the old bug broke (it used to land at destX=10, running to 190 and
// clipping the right edge). Vertically there is no slack (slackY=0), so that
// axis stays clamped: content sits at destY=10..110 and the top/bottom 10px
// are edge-stretch fill.
function coverDoc(amount) {
  return {
    assets: { s: { kind: 'image', mime: 'image/png', data: STRIPES } },
    layers: [{ type: 'image', asset: 's', fit: 'cover', motion: { kind: 'warp', speed: WARP_SPEED, amount } }]
  };
}

test('warp moves the picture without draining or blowing out its colours', async () => {
  const jobs = [
    { name: 'still', kind: 'engine', timeSec: 0, doc: { assets: warpDoc(0).assets, layers: [{ type: 'image', asset: 'q', fit: 'stretch', motion: { kind: 'none' } }] } },
    { name: 'zero-a', kind: 'engine', timeSec: 0, doc: warpDoc(0) },
    { name: 'zero-b', kind: 'engine', timeSec: 30, doc: warpDoc(0) },
    { name: 'warp-a', kind: 'engine', timeSec: 0, doc: warpDoc(60) },
    { name: 'warp-b', kind: 'engine', timeSec: MOVED, doc: warpDoc(60) },
    { name: 'warp-a-again', kind: 'engine', timeSec: 0, doc: warpDoc(60) },
    { name: 'warp-max', kind: 'engine', timeSec: MOVED_ELSEWHERE, doc: warpDoc(100) }
  ];
  const r = Object.fromEntries((await runJobs(jobs)).map((x) => [x.name, x]));

  // Amount 0 is a still picture, whatever the clock says.
  assert.equal(meanDifference(r['zero-a'].pixels, r['zero-b'].pixels), 0);

  // Same time, same frame — the engine must be deterministic.
  assert.equal(meanDifference(r['warp-a'].pixels, r['warp-a-again'].pixels), 0);

  // Different time, different frame.
  assert.ok(meanDifference(r['warp-a'].pixels, r['warp-b'].pixels) > 1);

  // Warping moves colour around, it does not create or destroy it.
  const still = meanBrightness(r.still.pixels);
  for (const name of ['warp-a', 'warp-b', 'warp-max']) {
    const value = meanBrightness(r[name].pixels);
    assert.ok(Math.abs(value - still) / still < 0.12, `${name} brightness drifted to ${value} from ${still}`);
  }

  // The padded buffer must keep the frame edges filled — no black border creeping in.
  for (const [x, y] of [[0, 0], [319, 0], [0, 199], [319, 199], [160, 0], [0, 100]]) {
    const p = pixelAt(r['warp-max'].pixels, 320, x, y);
    assert.ok(p.r + p.g + p.b > 30, `edge pixel ${x},${y} went black: ${JSON.stringify(p)}`);
  }
});

test('warp holds up under fit: cover, where the old padding bug actually broke', async () => {
  const jobs = [
    { name: 'still', kind: 'engine', timeSec: 0, doc: { assets: coverDoc(0).assets, layers: [{ type: 'image', asset: 's', fit: 'cover', motion: { kind: 'none' } }] } },
    { name: 'zero-a', kind: 'engine', timeSec: 0, doc: coverDoc(0) },
    { name: 'zero-b', kind: 'engine', timeSec: 30, doc: coverDoc(0) },
    { name: 'warp-a', kind: 'engine', timeSec: 0, doc: coverDoc(60) },
    { name: 'warp-b', kind: 'engine', timeSec: MOVED, doc: coverDoc(60) },
    { name: 'warp-a-again', kind: 'engine', timeSec: 0, doc: coverDoc(60) },
    { name: 'warp-max', kind: 'engine', timeSec: MOVED_ELSEWHERE, doc: coverDoc(100) }
  ];
  const r = Object.fromEntries((await runJobs(jobs)).map((x) => [x.name, x]));

  // Amount 0 is a still picture, whatever the clock says.
  assert.equal(meanDifference(r['zero-a'].pixels, r['zero-b'].pixels), 0);

  // Same time, same frame — the engine must be deterministic.
  assert.equal(meanDifference(r['warp-a'].pixels, r['warp-a-again'].pixels), 0);

  // Different time, different frame.
  assert.ok(meanDifference(r['warp-a'].pixels, r['warp-b'].pixels) > 1);

  // Warping moves colour around, it does not create or destroy it.
  const still = meanBrightness(r.still.pixels);
  for (const name of ['warp-a', 'warp-b', 'warp-max']) {
    const value = meanBrightness(r[name].pixels);
    assert.ok(Math.abs(value - still) / still < 0.12, `${name} brightness drifted to ${value} from ${still}`);
  }

  // Zero-amplitude warp is pure geometry (no displacement, see below) and must
  // line up with a plain, un-warped still. They will not be byte-identical —
  // buildSource's padded buffer is a half-resolution round trip (drawImage at
  // 10x into the buffer, then the buffer back out at 2x) that softens the hard
  // stripe edges a direct single-pass draw keeps sharp — but that softening is
  // confined to a couple of stripe boundaries. Measured on this fixture,
  // meanDifference(still, zero-amplitude) is ~0.2; a genuine 20-canvas-pixel
  // geometry shift (the old bug's magnitude, reproduced here via `offset.x`
  // for calibration, not committed) measures ~8.0 on the same pair. 1.5 sits
  // with real headroom above the softening noise and far below a real shift.
  assert.ok(
    meanDifference(r.still.pixels, r['zero-a'].pixels) < 1.5,
    `zero-amplitude warp should line up with the still picture, got meanDifference ${meanDifference(r.still.pixels, r['zero-a'].pixels)}`
  );

  // Positional check for the geometry itself, at amplitude 0 so only buildSource's
  // crop math is under test (no warp displacement to confound it).
  //
  // STRIPES is 40x10: red x0-9, green x10-19, blue x20-29, white x30-39.
  // computeSourceRect for fit:'cover' into the 160x100 working buffer:
  //   srcAspect=4.0, dstAspect=1.6 -> sh=10, sw=16, slackX=24, sx=12, sy=0
  //   rect = { sx:12, sy:0, sw:16, sh:10, dx:0, dy:0, dw:160, dh:100 }
  // buildSource (scaleX=scaleY=0.1) reaches BUFFER_PAD(10) further out and clamps:
  //   gotX=11, gotW=18, destX = BUFFER_PAD + (gotX-rect.sx)/scaleX = 10 + (11-12)/0.1 = 0
  //   -> source x=s maps into the padded (180-wide) buffer at d(s) = (s-11)*10
  // Dropping the BUFFER_PAD offset (buffer x = d-10) and the final 2x buffer-to-canvas
  // scale gives canvas_x = 2*(d(s)-10) = 20*s - 240, valid for s in [12,28) (the
  // visible crop). The green/blue boundary sits at source s=20, so:
  //   canvas_x(20) = 20*20 - 240 = 160
  // The old bug anchored on the padding's own origin (wantX) instead of the crop's
  // (rect.sx), which for this geometry put destX at 10 instead of 0 — the whole
  // picture, including that boundary, shifts 10 buffer px = 20 canvas px right.
  // x=150 and x=170 straddle 160 exactly at the edge of measured colour purity
  // (verified empirically: still/zero-a are flat pure colour at both, see the
  // scanline dump in this change's report) and are pure translations of each
  // other under any pure-geometry shift, so:
  //   - a +20 shift moves the boundary to 180: x=170 (< 180) reads what x=150
  //     reads today - pure green, not blue - failing the blue assertion below.
  //   - a -20 shift moves the boundary to 140: x=150 (> 140) reads what x=170
  //     reads today - pure blue, not green - failing the green assertion below.
  // Either direction is caught.
  assert.ok(isColour(pixelAt(r['zero-a'].pixels, 320, 150, 100), [0, 255, 0]),
    `x=150,y=100 should read as the green stripe, got ${JSON.stringify(pixelAt(r['zero-a'].pixels, 320, 150, 100))}`);
  assert.ok(isColour(pixelAt(r['zero-a'].pixels, 320, 170, 100), [0, 0, 255]),
    `x=170,y=100 should read as the blue stripe, got ${JSON.stringify(pixelAt(r['zero-a'].pixels, 320, 170, 100))}`);

  // With STRIPES, 'cover' leaves horizontal slack the crop spills real content
  // into (destX=0, destW=180 — see the derivation above buildSource fills the
  // padded buffer edge-to-edge). That is exactly the geometry the old bug got
  // wrong, shifting content right and dropping it off the buffer's right edge,
  // which showed up as a black border in the final frame. Confirm it stays lit,
  // sampling all four corners plus the midpoint of each edge (8 points).
  for (const [x, y] of [[0, 0], [319, 0], [0, 199], [319, 199], [160, 0], [160, 199], [0, 100], [319, 100]]) {
    const p = pixelAt(r['warp-max'].pixels, 320, x, y);
    assert.ok(p.r + p.g + p.b > 30, `edge pixel ${x},${y} went black: ${JSON.stringify(p)}`);
  }
});
