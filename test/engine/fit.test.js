// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { computeSourceRect } from '../../src/engine/util/fit.js';

const CANVAS = { dstW: 320, dstH: 200 };

test('stretch uses the whole source and the whole destination', () => {
  const r = computeSourceRect({ srcW: 100, srcH: 50, ...CANVAS, fit: 'stretch' });
  assert.deepEqual(r, { sx: 0, sy: 0, sw: 100, sh: 50, dx: 0, dy: 0, dw: 320, dh: 200 });
});

test('cover on a wide source crops the sides, centred by default', () => {
  // 488x200 is the prototype working image: aspect 2.44 against 1.6.
  const r = computeSourceRect({ srcW: 488, srcH: 200, ...CANVAS, fit: 'cover' });
  assert.equal(r.sh, 200);
  assert.equal(r.sw, 320);
  assert.equal(r.sx, 84);
  assert.equal(r.sy, 0);
  assert.equal(r.dw, 320);
  assert.equal(r.dh, 200);
});

test('cover offset -1 pins to the left edge, +1 to the right', () => {
  const left = computeSourceRect({ srcW: 488, srcH: 200, ...CANVAS, fit: 'cover', offsetX: -1 });
  const right = computeSourceRect({ srcW: 488, srcH: 200, ...CANVAS, fit: 'cover', offsetX: 1 });
  assert.equal(left.sx, 0);
  assert.equal(right.sx, 168);
});

test('cover offset beyond the range is clamped, never off the image', () => {
  const r = computeSourceRect({ srcW: 488, srcH: 200, ...CANVAS, fit: 'cover', offsetX: 4 });
  assert.equal(r.sx, 168);
  assert.ok(r.sx + r.sw <= 488);
});

test('cover on a tall source crops top and bottom', () => {
  const r = computeSourceRect({ srcW: 100, srcH: 100, ...CANVAS, fit: 'cover' });
  assert.equal(r.sw, 100);
  assert.equal(r.sh, 62.5);
  assert.equal(r.sy, 18.75);
});

test('contain letterboxes instead of cropping', () => {
  const r = computeSourceRect({ srcW: 488, srcH: 200, ...CANVAS, fit: 'contain' });
  assert.equal(r.sw, 488);
  assert.equal(r.sh, 200);
  assert.equal(r.dw, 320);
  assert.ok(Math.abs(r.dh - 131.147) < 0.01);
  assert.ok(Math.abs(r.dy - 34.426) < 0.01);
  assert.equal(r.dx, 0);
});

test('matching aspect ratios crop nothing', () => {
  const r = computeSourceRect({ srcW: 640, srcH: 400, ...CANVAS, fit: 'cover' });
  assert.equal(r.sx, 0);
  assert.equal(r.sy, 0);
  assert.equal(r.sw, 640);
  assert.equal(r.sh, 400);
});

test('zero or negative sizes are rejected loudly', () => {
  assert.throws(() => computeSourceRect({ srcW: 0, srcH: 10, ...CANVAS, fit: 'cover' }), /positive/);
});
