// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runJobs } from '../harness/render.js';
import { meanBrightness, maxDifference, meanDifference } from '../harness/pixels.js';
import { buildEffectHtml } from '../../src/export/build-effect.js';

/**
 * A trailing effect under the hosts SignalRGB really is.
 *
 * test/export/host-conditions.test.js already proves an effect keeps MOVING
 * when the host repeats a timestamp, passes none, or stops delivering
 * animation frames altogether — SignalRGB runs effects in an offscreen
 * Ultralight view and carries its own recovery code for one whose frames have
 * gone stale, so all three are conditions that host really has.
 *
 * A trail meets those conditions differently from everything before it,
 * because it is the first thing in this engine that carries state from one
 * frame into the next. Three ways it could go wrong, and each has a check:
 *
 *  1. FLICKER TO BLACK. A recovery that re-entered the render with a fresh
 *     renderer, or a veil laid over a canvas that had been cleared behind its
 *     back, would blink. The frame must stay lit.
 *  2. RUNAWAY ACCUMULATION. A veil is a feedback loop, and a host that draws
 *     twice as many frames as intended feeds it twice as fast. It must settle,
 *     not climb to white.
 *  3. STANDING STILL. Everything the trail does must not cost the effect the
 *     property the other file exists to defend: it still has to move.
 */

const DOC = {
  name: 'Wake',
  description: 'a trailing effect under a difficult host',
  publisher: 'SignalForge',
  trail: 80,
  layers: [{
    id: 'fill',
    type: 'gradient',
    shape: 'stripes',
    bands: 4,
    angle: 113,
    // Half transparent so the wake is in the picture at all — an opaque layer
    // covering the whole canvas repaints every pixel and hides its own trail.
    opacity: 0.45,
    stops: [{ at: 0, color: '#ff0066' }, { at: 100, color: '#0b1020' }],
    motions: [{ kind: 'drift', speed: 55, amount: 90 }]
  }],
  controls: []
};

function writeEffect() {
  const engineSource = readFileSync(new URL('../../dist/engine.bundle.js', import.meta.url), 'utf8');
  const dir = mkdtempSync(join(tmpdir(), 'signalforge-trail-host-'));
  const file = join(dir, 'effect.html');
  writeFileSync(file, buildEffectHtml({ doc: DOC, engineSource, lang: 'en' }), 'utf8');
  return { dir, file };
}

/** Neither black nor blown out: a picture somebody would call a picture. */
function assertSane(frame, what) {
  const mean = meanBrightness(frame.pixels);
  assert.ok(mean > 5, `${what}: the frame went black (mean ${mean})`);
  assert.ok(mean < 250, `${what}: the frame ran away towards white (mean ${mean})`);
}

test('a trailing effect survives a host that repeats the same timestamp for ever', async () => {
  const { dir, file } = writeEffect();
  try {
    const [first, later, muchLater] = await runJobs([
      { name: 'stuck-1', kind: 'html', file, stamps: [1000], restart: true, settleMs: 0 },
      {
        name: 'stuck-40', kind: 'html', file,
        stamps: Array.from({ length: 40 }, () => 1000), restart: true, settleMs: 0
      },
      {
        name: 'stuck-400', kind: 'html', file,
        stamps: Array.from({ length: 400 }, () => 1000), restart: true, settleMs: 0
      }
    ]);

    assertSane(first, 'a repeated timestamp, one frame');
    assertSane(later, 'a repeated timestamp, forty frames');
    assertSane(muchLater, 'a repeated timestamp, four hundred frames');

    // It still moves: the frame-count fallback advances the clock even though
    // the timestamp never does, so the wake is being laid down over a picture
    // that is going somewhere.
    assert.ok(maxDifference(first.pixels, later.pixels) > 0,
      'a repeated timestamp: the effect froze');
    assert.ok(meanDifference(later.pixels, muchLater.pixels) > 0.2,
      'a repeated timestamp: the effect stopped somewhere between frame 40 and frame 400');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a trailing effect survives a host that passes no timestamp at all', async () => {
  const { dir, file } = writeEffect();
  try {
    const [first, later] = await runJobs([
      { name: 'nostamp-1', kind: 'html', file, stamps: [null], restart: true, settleMs: 0 },
      {
        name: 'nostamp-200', kind: 'html', file,
        stamps: Array.from({ length: 200 }, () => null), restart: true, settleMs: 0
      }
    ]);
    assertSane(first, 'no timestamp, one frame');
    assertSane(later, 'no timestamp, two hundred frames');
    assert.ok(meanDifference(first.pixels, later.pixels) > 0.2, 'no timestamp: the effect froze');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a trailing effect left to its own two ways in neither goes black nor runs away', async () => {
  // No restart and no stamps here, deliberately: this is the effect running
  // ITSELF, with its animation-frame loop and its interval fallback both
  // alive, exactly as they are in the host — a full second of whatever
  // Chromium chooses to give a hidden window, which is the closest this
  // project can get to "leave it alone and come back later".
  const { dir, file } = writeEffect();
  try {
    const [early, late] = await runJobs([
      { name: 'itself-early', kind: 'html', file, settleMs: 120 },
      { name: 'itself-late', kind: 'html', file, settleMs: 1200 }
    ]);
    assertSane(early, 'left to itself, early');
    assertSane(late, 'left to itself, a second later');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a stalled trailing effect keeps its picture instead of fading to black', async () => {
  // The one that would be a real fault rather than an inconvenience. If a host
  // stops delivering frames, the veil must stop too — a wake that went on
  // being laid down without anything drawing over it would dim the picture to
  // nothing while the user watched. It cannot happen, because the veil is part
  // of the render and the render is what stopped; this is the check that says
  // so out loud.
  const { dir, file } = writeEffect();
  try {
    const [stalled] = await runJobs([
      {
        name: 'stalled', kind: 'html', file,
        stamps: Array.from({ length: 30 }, (unused, i) => 1000 + i * 40),
        restart: true,
        // restart takes both ways in away and then disables the render step
        // itself, so this second of waiting is a second in which the effect
        // genuinely cannot draw — which is what "stalled" means.
        settleMs: 1000
      }
    ]);
    assertSane(stalled, 'a stalled effect');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
