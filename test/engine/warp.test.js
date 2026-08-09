// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { createWarpField, WARP_PEAK_FACTOR } from '../../src/engine/motion/warp.js';

const peak = (array) => array.reduce((m, v) => Math.max(m, Math.abs(v)), 0);

test('amplitude zero means no displacement at all', () => {
  const field = createWarpField(160, 100);
  field.update(12.5, 0);
  assert.equal(peak(field.rowDX), 0);
  assert.equal(peak(field.rowDY), 0);
  assert.equal(peak(field.colDX), 0);
  assert.equal(peak(field.colDY), 0);
});

test('same time gives the same field — the engine must be deterministic', () => {
  const a = createWarpField(160, 100);
  const b = createWarpField(160, 100);
  a.update(7.25, 3);
  b.update(7.25, 3);
  assert.deepEqual(Array.from(a.rowDX), Array.from(b.rowDX));
  assert.deepEqual(Array.from(a.colDY), Array.from(b.colDY));
});

test('the field actually moves over time', () => {
  const field = createWarpField(160, 100);
  field.update(0, 3);
  const before = Array.from(field.rowDX);
  field.update(9, 3);
  const after = Array.from(field.rowDX);
  assert.notDeepEqual(before, after);
});

test('displacement never exceeds amplitude * WARP_PEAK_FACTOR', () => {
  const field = createWarpField(160, 100);
  const amplitude = 5;
  const limit = amplitude * WARP_PEAK_FACTOR + 1e-4;
  for (let t = 0; t < 60; t += 0.37) {
    field.update(t, amplitude);
    assert.ok(peak(field.rowDX) + peak(field.colDX) <= limit, `x overflow at t=${t}`);
    assert.ok(peak(field.rowDY) + peak(field.colDY) <= limit, `y overflow at t=${t}`);
  }
});

test('field arrays match the requested size', () => {
  const field = createWarpField(160, 100);
  assert.equal(field.rowDX.length, 100);
  assert.equal(field.colDX.length, 160);
});
