// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
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

/**
 * WHAT THIS FILE IS FOR
 *
 * The bug report was "the exported effect shows the picture but does not
 * move". Every existing export test drives the effect the way a healthy
 * Chromium does — requestAnimationFrame ticking, and a timestamp that always
 * advances in milliseconds — so all of them stayed green while the real host
 * froze. This file is the missing half: the effect driven the way the REAL
 * host can drive it.
 *
 * What is known about that host, from the machine itself rather than from
 * assumption (SignalRGB 2.5.74's own log and its own binary):
 *
 *  - the effect runs in an offscreen Ultralight 1.4 view (WebKit 615),
 *    320x200, `is_accelerated: 0`, `force_repaint: disabled`;
 *  - SignalRGB replaces window.requestAnimationFrame with a shim that keeps
 *    exactly ONE callback (`window.__lastRAFCallback`), and
 *    UltralightView::TryRecoverIfBehind re-kicks it when the view has gone
 *    stale — with a log line for "Still stale after {} frames: recovery did
 *    not help". A stalled animation-frame loop is therefore a routine,
 *    designed-for condition in this host, not a hypothetical.
 *
 * So the effect must not have a single point of failure between the host and
 * its own render step. Each test below removes one of them and requires the
 * picture to keep moving anyway.
 */

// A gradient with a warp on it: no image asset to decode (so nothing here can
// pass or fail for asset-loading reasons), and warp displaces every row
// separately, so any advance of the clock at all changes many pixels.
const DOC = {
  name: 'HostConditions',
  description: 'the effect must move under the real host s conditions',
  publisher: 'SignalForge',
  assets: {},
  layers: [{
    id: 'fill',
    type: 'gradient',
    shape: 'linear',
    angle: 57,
    stops: [{ at: 0, color: '#ff0066' }, { at: 100, color: '#00b3ff' }],
    motions: [{ kind: 'warp', speed: 100, amount: 90 }]
  }],
  controls: [
    { property: 'motion', label: { de: 'Modus', en: 'Motion' }, type: 'combobox',
      values: ['none', 'warp', 'drift', 'breathe'], default: 'warp', bind: ['fill.motions.0.kind'] },
    { property: 'tempo', label: { de: 'Tempo', en: 'Speed' }, type: 'number', min: 1, max: 100,
      default: 100, bind: ['fill.motions.0.speed'] },
    { property: 'strength', label: { de: 'Staerke', en: 'Strength' }, type: 'number', min: 0, max: 100,
      default: 90, bind: ['fill.motions.0.amount'] }
  ]
};

function writeEffect() {
  const engineSource = readFileSync(new URL('../../dist/engine.bundle.js', import.meta.url), 'utf8');
  const dir = mkdtempSync(join(tmpdir(), 'signalforge-host-conditions-'));
  const file = join(dir, 'effect.html');
  writeFileSync(file, buildEffectHtml({ doc: DOC, engineSource, lang: 'en' }), 'utf8');
  return { dir, file };
}

function assertMoved(before, after, what) {
  assert.ok(meanBrightness(before.pixels) > 5, `${what}: the first frame is blank`);
  assert.ok(meanBrightness(after.pixels) > 5, `${what}: the later frame is blank`);
  assert.ok(maxDifference(before.pixels, after.pixels) > 0,
    `${what}: not one pixel changed — the effect is showing a picture and standing still, `
    + 'which is exactly the reported failure');
  assert.ok(meanDifference(before.pixels, after.pixels) > 0.2,
    `${what}: expected clearly visible movement, mean difference was only `
    + `${meanDifference(before.pixels, after.pixels)}`);
}

test('the effect keeps moving when the host repeats the same animation-frame timestamp', async () => {
  // The failure this reproduces: an effect whose whole clock is
  // `(stamp - start) / 1000` renders one correct frame and then nothing ever
  // changes again, because every later frame computes the same elapsed time.
  // A 30fps gate written as `stamp - lastFrame < FRAME_GAP` makes it worse
  // still: with a standing stamp that test is true forever, so the render is
  // not merely repeated, it is never reached again at all.
  const { dir, file } = writeEffect();
  try {
    const [first, later] = await runJobs([
      { name: 'stuck-1', kind: 'html', file, stamps: [1000] },
      { name: 'stuck-30', kind: 'html', file, stamps: Array.from({ length: 30 }, () => 1000) }
    ]);
    assertMoved(first, later, 'a repeated timestamp');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the effect keeps moving when the host passes no timestamp at all', async () => {
  // Every effect SignalRGB itself ships ignores the timestamp argument and
  // steps a counter per frame instead (`hue += speed / 10` in Rainbow.html),
  // so an effect that cannot cope without one is relying on something the
  // host's own effects never rely on. Before the fix this rendered a black
  // canvas: undefined - undefined is NaN, and every motion computed from NaN
  // paints nothing.
  const { dir, file } = writeEffect();
  try {
    const [first, later] = await runJobs([
      { name: 'nostamp-1', kind: 'html', file, stamps: [null] },
      { name: 'nostamp-30', kind: 'html', file, stamps: Array.from({ length: 30 }, () => null) }
    ]);
    assertMoved(first, later, 'no timestamp');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the effect keeps moving when the animation-frame loop stops delivering', async () => {
  // requestAnimationFrame is taken away right after load, so nothing but the
  // effect's own fallback pump can reach the render step. A hidden window
  // stops ticking animation frames by itself within a few frames anyway (300
  // measured launches, see test/harness/electron-main.cjs), which is why the
  // two jobs here differ only in how long they are left alone.
  const { dir, file } = writeEffect();
  try {
    const [early, late] = await runJobs([
      { name: 'norafi-early', kind: 'html', file, stopRaf: true, settleMs: 40 },
      { name: 'noraf-late', kind: 'html', file, stopRaf: true, settleMs: 900 }
    ]);
    assertMoved(early, late, 'no animation frames');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a motion the host names by index still moves the exported effect', async () => {
  // The engine-level guard for this is in test/engine/bind.test.js; this is
  // the same rule proven end to end, on a real exported file rendered in a
  // real browser: whatever shape the value arrives in, the motion runs.
  const { dir, file } = writeEffect();
  try {
    const [first, later] = await runJobs([
      { name: 'index-1', kind: 'html', file, stamps: [0], setGlobals: { motion: 1 }, afterSetGlobalsMs: 0 },
      {
        name: 'index-many',
        kind: 'html',
        file,
        stamps: [0, 200, 400, 600, 800, 1000],
        setGlobals: { motion: 1 },
        afterSetGlobalsMs: 0
      }
    ]);
    assertMoved(first, later, 'a motion named by index');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
