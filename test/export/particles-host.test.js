// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runJobs } from '../harness/render.js';
import { meanDifference, maxDifference, meanBrightness } from '../harness/pixels.js';
import { buildEffectHtml } from '../../src/export/build-effect.js';
import { effectControls, withLiveMotion } from '../../src/export/effect-controls.js';
import { normalizeDocument } from '../../src/engine/document.js';

/**
 * A SWARM UNDER THE REAL HOST'S CONDITIONS.
 *
 * test/export/host-conditions.test.js established what those conditions are,
 * from SignalRGB 2.5.74's own log and binary rather than from assumption: an
 * offscreen Ultralight view with no acceleration, a requestAnimationFrame
 * replaced by a shim that keeps exactly one callback, and a documented recovery
 * path for when that callback goes stale. Each test there removes one prop and
 * requires the picture to keep moving.
 *
 * WHY THE PARTICLE LAYER NEEDS ITS OWN COPY OF THAT, when it is "obviously"
 * fine. Every layer that came before moves because a MOTION moves it, and a
 * motion is a function of the seconds the effect has accumulated. A particle
 * layer moves because the LAYER ITSELF travels — there is no motion entry on
 * the document below at all — so it reaches the clock by a different route (its
 * own `speed` field through speedToRate, in particleField) and it is the first
 * layer type in this engine of which that is true. "It is a pure function of t,
 * so it must be fine" is a claim about the arithmetic; whether the exported
 * file ever HANDS it a t under these three conditions is a claim about the
 * bootstrap, and only this file tests it.
 *
 * There is a second thing here that host-conditions.test.js cannot cover: a
 * swarm draws from a CACHE built on first use and kept afterwards. A bootstrap
 * that quietly restarted the renderer on every frame — which a stalled
 * animation loop plus a fallback pump is exactly the shape of bug to produce —
 * would rebuild that cache every time, and this is where it would show.
 */

const RAW = {
  name: 'ParticleHostConditions',
  description: 'a swarm must keep travelling under the real host s conditions',
  publisher: 'SignalForge',
  assets: {},
  layers: [{
    id: 'swarm',
    type: 'particles',
    pattern: 'rain',
    // Fast, plentiful and small: any advance of the clock at all moves many
    // particles, so "did it move" is never a marginal measurement.
    speed: 80,
    count: 200,
    size: 4,
    tilt: 0,
    seed: 3,
    stops: [{ at: 0, color: '#ff0066' }, { at: 100, color: '#00b3ff' }],
    // DELIBERATELY NO MOTIONS. The whole point of this file is that the layer
    // travels on its own — if a motion were on it, a bootstrap that never
    // reached the particle arithmetic could still pass by fading the swarm in
    // and out.
    motions: []
  }],
  controls: []
};

const DOC = (() => {
  const { doc } = normalizeDocument(RAW);
  // The real control list rather than a hand-written one, so this also proves
  // the swarm's own controls survive being baked and read back.
  const live = withLiveMotion(doc, 'swarm');
  return { ...live, controls: effectControls(live, 'swarm') };
})();

function writeEffect() {
  const engineSource = readFileSync(new URL('../../dist/engine.bundle.js', import.meta.url), 'utf8');
  const dir = mkdtempSync(join(tmpdir(), 'signalforge-particles-host-'));
  const file = join(dir, 'effect.html');
  writeFileSync(file, buildEffectHtml({ doc: DOC, engineSource, lang: 'en' }), 'utf8');
  return { dir, file };
}

function assertMoved(before, after, what) {
  assert.ok(meanBrightness(before.pixels) > 1, `${what}: the first frame is blank`);
  assert.ok(meanBrightness(after.pixels) > 1, `${what}: the later frame is blank`);
  assert.ok(maxDifference(before.pixels, after.pixels) > 0,
    `${what}: not one pixel changed — the swarm is on screen and standing still`);
  assert.ok(meanDifference(before.pixels, after.pixels) > 0.05,
    `${what}: expected clearly visible travel, mean difference was only `
    + `${meanDifference(before.pixels, after.pixels)}`);
}

test('a swarm keeps travelling when the host repeats the same animation-frame timestamp', async () => {
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

test('a swarm keeps travelling when the host passes no timestamp at all', async () => {
  // Every effect SignalRGB itself ships ignores the timestamp argument and
  // steps a counter per frame instead, so an effect that cannot cope without
  // one relies on something the host's own effects never rely on.
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

test('a swarm keeps travelling when the animation-frame loop stops delivering', async () => {
  // requestAnimationFrame is taken away right after load, so nothing but the
  // effect's own fallback pump can reach the render step.
  const { dir, file } = writeEffect();
  try {
    const [early, late] = await runJobs([
      { name: 'noraf-early', kind: 'html', file, stopRaf: true, settleMs: 40 },
      { name: 'noraf-late', kind: 'html', file, stopRaf: true, settleMs: 900 }
    ]);
    assertMoved(early, late, 'no animation frames');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the swarm\'s own controls reach the exported effect\'s frame', async () => {
  // The layer's controls are baked into the file and read on every frame
  // (applyControls, src/engine/bind.js), so a binding that pointed at the wrong
  // path would leave a slider that does nothing in somebody's SignalRGB panel.
  // Two of them are worth proving end to end rather than at the unit level:
  //
  //   `seed`          because it is the whole reason seeded noise is worth
  //                   having, and because it is the one control whose effect is
  //                   invisible unless it genuinely rebuilds the cache — a
  //                   cache keyed on anything less would leave the frame alone.
  //   `particleCount` because it is the one clamped by a measurement.
  const { dir, file } = writeEffect();
  try {
    const [asBuilt, reseeded, thinned] = await runJobs([
      { name: 'as-built', kind: 'html', file, stamps: [0], afterSetGlobalsMs: 0 },
      {
        name: 'reseeded', kind: 'html', file, stamps: [0],
        setGlobals: { seed: 42 }, afterSetGlobalsMs: 0
      },
      {
        name: 'thinned', kind: 'html', file, stamps: [0],
        setGlobals: { particleCount: 5 }, afterSetGlobalsMs: 0
      }
    ]);

    assert.ok(meanBrightness(asBuilt.pixels) > 1, 'the effect drew nothing as built');
    assert.ok(maxDifference(asBuilt.pixels, reseeded.pixels) > 0,
      'changing the seed changed no pixel — the arrangement control is dead, or the '
      + 'per-particle cache is not keyed on the seed');
    assert.ok(meanBrightness(thinned.pixels) < meanBrightness(asBuilt.pixels) / 2,
      `cutting the count from 200 to 5 should empty the canvas: `
      + `${meanBrightness(asBuilt.pixels).toFixed(2)} became `
      + `${meanBrightness(thinned.pixels).toFixed(2)}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
