// SignalForge — build SignalRGB effects from images, gradients, shapes and particles.
// Copyright (C) 2026 Max Leopold Blumenschein
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { runJobs } from '../harness/render.js';
import { pixelAt, isColour, maxDifference } from '../harness/pixels.js';
import {
  CANVAS_WIDTH, CANVAS_HEIGHT, normalizeDocument,
  MIN_ASPECT, MAX_ASPECT, DEFAULT_ASPECT, aspectFactorOf
} from '../../src/engine/document.js';

/**
 * The width compensation for SignalRGB's own stretching.
 *
 * Measured on 12.08.2026 (see work/nachtschicht_2026-08-12.md): SignalRGB
 * renders every effect in an Ultralight view of exactly 320 x 200 and then
 * stretches the finished picture onto a preview panel of a WIDER ratio
 * (~2.46:1 against the canvas's 1.6:1 on Max' machine, a factor of ~1.54).
 * None of the 27 effects read for the corpus compensates for it, so every
 * circle in every community effect shows up oval.
 *
 * `aspect` is the document's answer: the factor (as a percent, 100 = off) by
 * which the host is known to stretch the canvas. Layers that draw ROUND
 * things — a figure, a particle — pre-squish them horizontally about their
 * own centre by exactly 1/factor, so that after the host's stretch they come
 * out round. Everything that has no shape of its own to keep (a picture, a
 * gradient, a solid) is deliberately left alone.
 *
 * The tests below measure the two halves of that sentence on the pixels:
 * the squish is exactly 1/factor about the figure's own centre, and a
 * document that says nothing (or says 100) renders byte-for-byte as it
 * always did.
 */

const INK = '#ff0066';
const INK_RGB = [255, 0, 102];
const BLACK = [0, 0, 0];

const at = (frame, x, y) => pixelAt(frame.pixels, frame.width, Math.round(x), Math.round(y));

/** One shape layer, alone, everything else default. */
function shapeDoc(layer, extra = {}) {
  return {
    name: 'Aspect',
    layers: [{ id: 'fig', type: 'shape', color: INK, motions: [], ...layer }],
    controls: [],
    ...extra
  };
}

/** The ink's bounding box, for frames that hold one connected figure. */
function inkBox(frame) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let y = 0; y < frame.height; y += 1) {
    for (let x = 0; x < frame.width; x += 1) {
      const p = pixelAt(frame.pixels, frame.width, x, y);
      if (p.r + p.g + p.b > 24) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  assert.ok(minX <= maxX && minY <= maxY, 'expected some ink on the frame');
  return {
    minX, maxX, minY, maxY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2
  };
}

// ------------------------------------------------------------- normalization

test('a document that says nothing carries aspect 100, and the clamps hold', () => {
  assert.equal(normalizeDocument({}).doc.aspect, DEFAULT_ASPECT);
  assert.equal(DEFAULT_ASPECT, 100);
  assert.equal(normalizeDocument({ aspect: '154' }).doc.aspect, 154);
  assert.equal(normalizeDocument({ aspect: 9999 }).doc.aspect, MAX_ASPECT);
  assert.equal(normalizeDocument({ aspect: -3 }).doc.aspect, MIN_ASPECT);
  assert.equal(normalizeDocument({ aspect: 'junk' }).doc.aspect, DEFAULT_ASPECT);
});

test('aspectFactorOf reads the live document the way the renderer must', () => {
  // The factor, not the percent — and clamped against a control panel writing
  // whatever it likes into the live document (applyControls writes raw).
  assert.equal(aspectFactorOf({ aspect: 200 }), 2);
  assert.equal(aspectFactorOf({ aspect: 100 }), 1);
  assert.equal(aspectFactorOf({}), 1);
  assert.equal(aspectFactorOf({ aspect: 'junk' }), 1);
  assert.equal(aspectFactorOf({ aspect: '154' }), 1.54);
  assert.equal(aspectFactorOf({ aspect: 100000 }), MAX_ASPECT / 100);
  assert.equal(aspectFactorOf({ aspect: 0 }), MIN_ASPECT / 100);
});

// ------------------------------------------------- the circle becomes an ellipse

test('aspect 200 squishes a circle to half its width about its own centre', async () => {
  const size = 60;
  const r = (size / 100) * CANVAS_HEIGHT / 2;
  const cx = CANVAS_WIDTH / 2;
  const cy = CANVAS_HEIGHT / 2;
  const [frame] = await runJobs([{
    name: 'squished-circle',
    kind: 'engine',
    doc: shapeDoc({ figure: 'circle', size }, { aspect: 200 }),
    timeSec: 0
  }]);

  // Vertically nothing changes: the full radius up and down.
  assert.ok(isColour(at(frame, cx, cy - r * 0.85), INK_RGB), 'top inside should be ink');
  assert.ok(isColour(at(frame, cx, cy + r * 0.85), INK_RGB), 'bottom inside should be ink');
  assert.ok(isColour(at(frame, cx, cy - r * 1.15), BLACK), 'top outside should be black');
  assert.ok(isColour(at(frame, cx, cy + r * 1.15), BLACK), 'bottom outside should be black');

  // Horizontally the radius is halved: inside half the radius is still ink,
  // outside half the radius — where the untouched circle was solid ink — is
  // black now.
  assert.ok(isColour(at(frame, cx - (r / 2) * 0.85, cy), INK_RGB), 'left inside should be ink');
  assert.ok(isColour(at(frame, cx + (r / 2) * 0.85, cy), INK_RGB), 'right inside should be ink');
  assert.ok(isColour(at(frame, cx - (r / 2) * 1.15, cy), BLACK), 'left outside should be black');
  assert.ok(isColour(at(frame, cx + (r / 2) * 1.15, cy), BLACK), 'right outside should be black');
});

test('the squish is about the figure\'s own centre, wherever it sits', async () => {
  const size = 40;
  const posX = 25;
  const cx = (posX / 100) * CANVAS_WIDTH;
  const [plain, squished] = await runJobs([
    {
      name: 'off-centre-plain',
      kind: 'engine',
      doc: shapeDoc({ figure: 'circle', size, position: { x: posX, y: 50 } }),
      timeSec: 0
    },
    {
      name: 'off-centre-squished',
      kind: 'engine',
      doc: shapeDoc({ figure: 'circle', size, position: { x: posX, y: 50 } }, { aspect: 200 }),
      timeSec: 0
    }
  ]);

  const before = inkBox(plain);
  const after = inkBox(squished);
  // The centre stays put — a squish about the canvas middle instead would
  // have dragged a figure at 25 % towards the middle by 40 canvas pixels.
  assert.ok(Math.abs(after.cx - cx) <= 1,
    `centre moved: expected ~${cx}, got ${after.cx}`);
  assert.ok(Math.abs(after.cx - before.cx) <= 1, 'centre must not move under aspect');
  assert.ok(Math.abs(after.cy - before.cy) <= 1, 'vertical centre must not move under aspect');
  // Half the width, same height.
  assert.ok(Math.abs(after.width - before.width / 2) <= 2,
    `width should halve: ${before.width} -> ${after.width}`);
  assert.ok(Math.abs(after.height - before.height) <= 1,
    `height should hold: ${before.height} -> ${after.height}`);
});

// ------------------------------------------------------------- the regression

test('aspect 100 and no aspect at all render byte-identically', async () => {
  const doc = shapeDoc({ figure: 'star', size: 70, points: 5 });
  const [plain, at100] = await runJobs([
    { name: 'no-aspect', kind: 'engine', doc, timeSec: 0.4 },
    { name: 'aspect-100', kind: 'engine', doc: { ...doc, aspect: 100 }, timeSec: 0.4 }
  ]);
  assert.equal(maxDifference(plain.pixels, at100.pixels), 0,
    'aspect 100 must be the untouched code path, byte for byte');
});

// ------------------------------------------------------------- spin under aspect

test('a spinning star squishes by the same factor at every angle of its turn', async () => {
  // The one claim in shape.js that is winkelabhängig: the squish sits OUTSIDE
  // the spin (translate → squish → rotate), so it is the exact inverse of the
  // host's stretch at EVERY angle — the other order would make a spinning
  // star wobble fat and thin twice a turn. A rotating star's ink box changes
  // with the angle even untouched, so what must hold is not one ratio but a
  // pairwise one: at each moment, the squished frame is the plain frame at
  // half the width and the same height, about the same centre.
  const star = (aspect) => ({
    name: 'Spin under aspect',
    aspect,
    layers: [{
      id: 'fig',
      type: 'shape',
      figure: 'star',
      color: INK,
      size: 60,
      points: 5,
      motions: [{ kind: 'spin', speed: 40, amount: 100 }]
    }],
    controls: []
  });

  // Four moments spread across a turn; the exact angles do not matter, only
  // that they differ — the claim is "at every angle", so it is probed at
  // several rather than at the one the untouched tests already cover.
  for (const timeSec of [0, 0.7, 1.9, 3.3]) {
    const [plain, squished] = await runJobs([
      { name: `spin-plain-${timeSec}`, kind: 'engine', doc: star(100), timeSec },
      { name: `spin-squished-${timeSec}`, kind: 'engine', doc: star(200), timeSec }
    ]);
    const before = inkBox(plain);
    const after = inkBox(squished);
    assert.ok(Math.abs(after.width - before.width / 2) <= 2,
      `at t=${timeSec} the width should halve: ${before.width} -> ${after.width}`);
    assert.ok(Math.abs(after.height - before.height) <= 1,
      `at t=${timeSec} the height should hold: ${before.height} -> ${after.height}`);
    assert.ok(Math.abs(after.cx - before.cx) <= 1,
      `at t=${timeSec} the centre moved: ${before.cx} -> ${after.cx}`);
    assert.ok(Math.abs(after.cy - before.cy) <= 1,
      `at t=${timeSec} the vertical centre moved: ${before.cy} -> ${after.cy}`);
  }
});

// ------------------------------------------------------------- the particles

test('aspect squishes each particle about its own centre, not the swarm', async () => {
  // One still particle (count 1, speed 0), as big as a particle can be, both
  // colours the ink. Its position comes from the hash; some seeds put it off
  // or half off the canvas, so the test walks the seeds and measures the
  // first one whose ink sits clear of every edge in the PLAIN frame — a fixed
  // walk over fixed hashes, deterministic on every run.
  const particleDoc = (seed, aspect) => ({
    name: 'Aspect particles',
    aspect,
    layers: [{
      id: 'p',
      type: 'particles',
      pattern: 'rain',
      count: 1,
      size: 25,
      speed: 0,
      seed,
      stops: [{ at: 0, color: INK }, { at: 100, color: INK }],
      motions: []
    }],
    controls: []
  });

  for (let seed = 0; seed <= 30; seed += 1) {
    const [plain] = await runJobs([
      { name: `p-plain-${seed}`, kind: 'engine', doc: particleDoc(seed, 100), timeSec: 0 }
    ]);
    let box;
    try {
      box = inkBox(plain);
    } catch {
      continue; // this seed's particle is entirely off the canvas
    }
    const clearOfEdges = box.minX > 2 && box.minY > 2
      && box.maxX < CANVAS_WIDTH - 3 && box.maxY < CANVAS_HEIGHT - 3;
    if (!clearOfEdges) continue;
    // A particle needs real extent for the halving to be measurable.
    if (box.width < 16) continue;

    const [squished] = await runJobs([
      { name: `p-squished-${seed}`, kind: 'engine', doc: particleDoc(seed, 200), timeSec: 0 }
    ]);
    const after = inkBox(squished);
    assert.ok(Math.abs(after.cx - box.cx) <= 1,
      `particle centre moved under aspect: ${box.cx} -> ${after.cx}`);
    assert.ok(Math.abs(after.cy - box.cy) <= 1,
      `particle vertical centre moved under aspect: ${box.cy} -> ${after.cy}`);
    assert.ok(Math.abs(after.width - box.width / 2) <= 2,
      `particle width should halve: ${box.width} -> ${after.width}`);
    assert.ok(Math.abs(after.height - box.height) <= 1,
      `particle height should hold: ${box.height} -> ${after.height}`);
    return;
  }
  assert.fail('no seed in 0..30 put a clear, measurable particle on the canvas');
});
