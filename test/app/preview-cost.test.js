// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max Leopold Blumenschein
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { coreShare, costLevel, FRAMES_PER_SECOND, WARN_SHARE } from '../../app/renderer/components/cost.js';

test('one millisecond per frame is three percent of a core at 30 fps', () => {
  assert.equal(FRAMES_PER_SECOND, 30);
  assert.ok(Math.abs(coreShare(1) - 0.03) < 0.0005);
});

test('the warning threshold is five milliseconds, which is fifteen percent', () => {
  assert.ok(Math.abs(coreShare(5) - WARN_SHARE) < 0.0005);
  assert.equal(costLevel(4.9), 'ok');
  assert.equal(costLevel(5.1), 'warn');
});

test('the level is monotonic', () => {
  const order = { ok: 0, warn: 1 };
  let last = -1;
  for (let ms = 0; ms < 12; ms += 0.25) {
    const level = order[costLevel(ms)];
    assert.ok(level >= last, `level went down at ${ms} ms`);
    last = level;
  }
});
