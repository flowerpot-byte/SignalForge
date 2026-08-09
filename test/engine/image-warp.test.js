// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { runJobs } from '../harness/render.js';
import { meanBrightness, meanDifference, pixelAt } from '../harness/pixels.js';

const QUADRANTS = 'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAHklEQVR42mXJsQ0AAAgDIOr/P9fVRFZSkMI4QtE/C5t8BQM0UanVAAAAAElFTkSuQmCC';

// 40x10 PNG: four vertical stripes — red, green, blue, white, ten pixels each.
// Wide enough (aspect 4.0 against the buffer's 1.6) that 'cover' leaves real
// content beyond the crop on both sides, which is the case the padded buffer
// exists for and the one the old geometry bug broke.
const STRIPES = 'iVBORw0KGgoAAAANSUhEUgAAACgAAAAKCAIAAABJ+IsHAAAAIUlEQVR42mP8z4APMFIg/R+vXiaGAQKjFo9aPGrx0LcYALLUBRE2hoRCAAAAAElFTkSuQmCC';

function warpDoc(amount, timeSecIgnored) {
  return {
    assets: { q: { kind: 'image', mime: 'image/png', data: QUADRANTS } },
    layers: [{ type: 'image', asset: 'q', fit: 'stretch', motion: { kind: 'warp', speed: 60, amount } }]
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
    layers: [{ type: 'image', asset: 's', fit: 'cover', motion: { kind: 'warp', speed: 60, amount } }]
  };
}

test('warp moves the picture without draining or blowing out its colours', async () => {
  const jobs = [
    { name: 'still', kind: 'engine', timeSec: 0, doc: { assets: warpDoc(0).assets, layers: [{ type: 'image', asset: 'q', fit: 'stretch', motion: { kind: 'none' } }] } },
    { name: 'zero-a', kind: 'engine', timeSec: 0, doc: warpDoc(0) },
    { name: 'zero-b', kind: 'engine', timeSec: 30, doc: warpDoc(0) },
    { name: 'warp-a', kind: 'engine', timeSec: 0, doc: warpDoc(60) },
    { name: 'warp-b', kind: 'engine', timeSec: 12, doc: warpDoc(60) },
    { name: 'warp-a-again', kind: 'engine', timeSec: 0, doc: warpDoc(60) },
    { name: 'warp-max', kind: 'engine', timeSec: 5, doc: warpDoc(100) }
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
    { name: 'warp-b', kind: 'engine', timeSec: 12, doc: coverDoc(60) },
    { name: 'warp-a-again', kind: 'engine', timeSec: 0, doc: coverDoc(60) },
    { name: 'warp-max', kind: 'engine', timeSec: 5, doc: coverDoc(100) }
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

  // With STRIPES, 'cover' leaves horizontal slack the crop spills real content
  // into (destX=0, destW=180 — see the derivation above buildSource fills the
  // padded buffer edge-to-edge). That is exactly the geometry the old bug got
  // wrong, shifting content right and dropping it off the buffer's right edge,
  // which showed up as a black border in the final frame. Confirm it stays lit.
  for (const [x, y] of [[0, 0], [319, 0], [0, 199], [319, 199], [160, 0], [0, 100]]) {
    const p = pixelAt(r['warp-max'].pixels, 320, x, y);
    assert.ok(p.r + p.g + p.b > 30, `edge pixel ${x},${y} went black: ${JSON.stringify(p)}`);
  }
});
