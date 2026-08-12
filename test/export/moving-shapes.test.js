// SignalForge — build SignalRGB effects from images, gradients, shapes and particles.
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
import { effectControls } from '../../src/export/effect-controls.js';
import { normalizeDocument, GRADIENT_SHAPES } from '../../src/engine/document.js';

/**
 * The new shapes and the new motions, in a real exported file, under the
 * conditions the REAL host can impose.
 *
 * test/export/parity.test.js proves the exported file and the preview paint
 * the same pixels, and it can only do that with everything standing still (its
 * own note says why). This file is the other half and covers what that one
 * deliberately cannot: that the new motions actually MOVE in the exported
 * file, and that they keep moving when the host's animation-frame loop is
 * taken away or its timestamp stops advancing — both of which SignalRGB's own
 * recovery code proves are routine there (see test/export/host-conditions.js
 * for the evidence about the host).
 *
 * Every document below is built through the real effectControls, so a shape or
 * a band count that never reached the exported control list fails here too.
 */

function effectWith(layer) {
  const doc = normalizeDocument({
    name: 'MovingShapes',
    description: 'the new shapes and motions must move in the exported file',
    publisher: 'SignalForge',
    assets: {},
    layers: [{
      id: 'fill', type: 'gradient',
      stops: [{ at: 0, color: '#ff0066' }, { at: 100, color: '#00b3ff' }],
      ...layer
    }]
  }).doc;
  const engineSource = readFileSync(new URL('../../dist/engine.bundle.js', import.meta.url), 'utf8');
  const dir = mkdtempSync(join(tmpdir(), 'signalforge-moving-shapes-'));
  const file = join(dir, 'effect.html');
  writeFileSync(file, buildEffectHtml({
    doc: { ...doc, controls: effectControls(doc, 'fill') }, engineSource, lang: 'en'
  }), 'utf8');
  return { dir, file };
}

function assertMoved(before, after, what) {
  assert.ok(meanBrightness(before.pixels) > 5, `${what}: the first frame is blank`);
  assert.ok(meanBrightness(after.pixels) > 5, `${what}: the later frame is blank`);
  assert.ok(maxDifference(before.pixels, after.pixels) > 0,
    `${what}: not one pixel changed — the effect is showing a picture and standing still`);
  assert.ok(meanDifference(before.pixels, after.pixels) > 0.2,
    `${what}: expected clearly visible movement, mean difference was only `
      + `${meanDifference(before.pixels, after.pixels)}`);
}

test('every shape survives the trip into an exported file and draws something', async () => {
  const built = GRADIENT_SHAPES.map((shape) => ({
    shape, ...effectWith({ shape, bands: 3, angle: 25, motions: [{ kind: 'none' }] })
  }));
  try {
    const frames = await runJobs(built.map((entry) => ({
      name: entry.shape, kind: 'html', file: entry.file, settleMs: 200
    })));
    for (const frame of frames) {
      assert.ok(meanBrightness(frame.pixels) > 5, `the exported ${frame.name} effect is blank`);
    }
    // And they are five different pictures, not five copies of the fallback.
    for (let i = 0; i < frames.length; i += 1) {
      for (let j = i + 1; j < frames.length; j += 1) {
        assert.ok(maxDifference(frames[i].pixels, frames[j].pixels) > 0,
          `the exported ${frames[i].name} and ${frames[j].name} are the same picture`);
      }
    }
  } finally {
    for (const entry of built) rmSync(entry.dir, { recursive: true, force: true });
  }
});

test('a spinning conic keeps turning when the host stops delivering animation frames', async () => {
  // The one condition that used to freeze an effect outright. Nothing but the
  // effect's own fallback pump can reach the render step here.
  const { dir, file } = effectWith({
    shape: 'conic', bands: 1, angle: 0, motions: [{ kind: 'spin', speed: 100, amount: 100 }]
  });
  try {
    const [early, late] = await runJobs([
      { name: 'early', kind: 'html', file, stopRaf: true, settleMs: 40 },
      { name: 'late', kind: 'html', file, stopRaf: true, settleMs: 900 }
    ]);
    assertMoved(early, late, 'a spinning conic with no animation frames');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('spinning stripes keep turning when the host repeats the same timestamp', async () => {
  const { dir, file } = effectWith({
    shape: 'stripes', bands: 4, angle: 0, motions: [{ kind: 'spin', speed: 100, amount: 100 }]
  });
  try {
    const [first, later] = await runJobs([
      { name: 'stuck-1', kind: 'html', file, stamps: [1000] },
      { name: 'stuck-30', kind: 'html', file, stamps: Array.from({ length: 30 }, () => 1000) }
    ]);
    assertMoved(first, later, 'spinning stripes on a standing clock');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a pulsing wave keeps beating when the host passes no timestamp at all', async () => {
  const { dir, file } = effectWith({
    shape: 'waves', bands: 3, angle: 40, motions: [{ kind: 'pulse', speed: 100, amount: 100 }]
  });
  try {
    const [first, later] = await runJobs([
      { name: 'nostamp-1', kind: 'html', file, stamps: [null] },
      { name: 'nostamp-20', kind: 'html', file, stamps: Array.from({ length: 20 }, () => null) }
    ]);
    assertMoved(first, later, 'a pulsing wave with no timestamp');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the exported Shape and Bands controls really change the picture', async () => {
  // The exact bug this project has already shipped once: a control that
  // resolves on paper and moves nothing. Both of these are new to the exported
  // effect, so both get the same treatment — set the global the way SignalRGB
  // would, and require the pixels to move.
  const { dir, file } = effectWith({
    shape: 'stripes', bands: 2, angle: 0, motions: [{ kind: 'none' }]
  });
  try {
    const [untouched, otherShape, moreBands] = await runJobs([
      { name: 'untouched', kind: 'html', file, settleMs: 300 },
      { name: 'conic', kind: 'html', file, settleMs: 300, setGlobals: { shape: 'conic' }, afterSetGlobalsMs: 60 },
      { name: 'bands', kind: 'html', file, settleMs: 300, setGlobals: { bands: 12 }, afterSetGlobalsMs: 60 }
    ]);
    assert.ok(meanBrightness(untouched.pixels) > 5, 'the untouched export is blank');
    assert.ok(meanDifference(untouched.pixels, otherShape.pixels) > 1,
      'setting the Shape control had no visible effect');
    assert.ok(meanDifference(untouched.pixels, moreBands.pixels) > 1,
      'setting the Bands control had no visible effect');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
