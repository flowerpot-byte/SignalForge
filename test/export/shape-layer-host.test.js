// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runJobs } from '../harness/render.js';
import { meanDifference, maxDifference, meanBrightness, blackShare } from '../harness/pixels.js';
import { buildEffectHtml } from '../../src/export/build-effect.js';
import { effectControls } from '../../src/export/effect-controls.js';
import { normalizeDocument, SHAPE_FIGURES } from '../../src/engine/document.js';

/**
 * The shape layer, in a real exported file, under the conditions the REAL host
 * can impose.
 *
 * The sister file test/export/moving-shapes.test.js does exactly this for the
 * gradient layer, and its opening note explains the division of labour:
 * parity.test.js proves the exported file and the preview paint the same
 * pixels, and it can only do that with everything standing still. This is the
 * other half for the layer type that arrived last — that a figure actually
 * MOVES in the exported file, and that it keeps moving when the host's
 * animation-frame loop is taken away or its timestamp stops advancing. Both of
 * those are routine in SignalRGB (see test/export/host-conditions.js for the
 * evidence about the host), not hypothetical.
 *
 * It is a file of its own rather than four more tests in that one because the
 * two are about different layer types and each is already a long file; the
 * naming says so, and neither has to be opened to work on the other.
 *
 * Every document below is built through the real effectControls, so a field
 * that never reached the exported control list fails here too.
 */

/** One shape layer, alone, through the real effectControls. */
function figureEffect(layer) {
  const doc = normalizeDocument({
    name: 'MovingFigures',
    description: 'a figure must move in the exported file',
    publisher: 'SignalForge',
    assets: {},
    layers: [{ id: 'fig', type: 'shape', color: '#ff0066', ...layer }]
  }).doc;
  const engineSource = readFileSync(new URL('../../dist/engine.bundle.js', import.meta.url), 'utf8');
  const dir = mkdtempSync(join(tmpdir(), 'signalforge-figures-'));
  const file = join(dir, 'effect.html');
  writeFileSync(file, buildEffectHtml({
    doc: { ...doc, controls: effectControls(doc, 'fig') }, engineSource, lang: 'en'
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

test('every figure survives the trip into an exported file and draws its own picture', async () => {
  const built = SHAPE_FIGURES.map((figure) => ({
    figure,
    // Big enough that the four are unmistakably different pictures rather than
    // four small blobs a tolerance could confuse.
    ...figureEffect({ figure, size: 90, points: 5, motions: [{ kind: 'none' }] })
  }));
  try {
    const frames = await runJobs(built.map((entry) => ({
      name: entry.figure, kind: 'html', file: entry.file, settleMs: 200
    })));
    for (const frame of frames) {
      assert.ok(meanBrightness(frame.pixels) > 5, `the exported ${frame.name} is blank`);
      // ...and it is a FIGURE, not a filled canvas. This is the one property
      // the layer type exists for (a wake needs somewhere to survive), and an
      // exported file is exactly where it could quietly be lost — so it is
      // asserted on the far side of the export and not only in the engine.
      assert.ok(blackShare(frame.pixels) > 0.2,
        `the exported ${frame.name} covers the whole canvas`);
    }
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

test('a spinning star keeps turning when the host stops delivering animation frames', async () => {
  // The condition that used to freeze an effect outright. Nothing but the
  // effect's own fallback pump can reach the render step here.
  const { dir, file } = figureEffect({
    figure: 'star', size: 90, motions: [{ kind: 'spin', speed: 100, amount: 100 }]
  });
  try {
    const [early, late] = await runJobs([
      { name: 'early', kind: 'html', file, stopRaf: true, settleMs: 40 },
      { name: 'late', kind: 'html', file, stopRaf: true, settleMs: 900 }
    ]);
    assertMoved(early, late, 'a spinning star with no animation frames');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a drifting heart keeps moving when the host repeats the same timestamp', async () => {
  const { dir, file } = figureEffect({
    figure: 'heart', size: 70, motions: [{ kind: 'drift', speed: 100, amount: 100 }]
  });
  try {
    const [first, later] = await runJobs([
      { name: 'stuck-1', kind: 'html', file, stamps: [1000] },
      { name: 'stuck-30', kind: 'html', file, stamps: Array.from({ length: 30 }, () => 1000) }
    ]);
    assertMoved(first, later, 'a drifting heart on a standing clock');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a pulsing ring keeps beating when the host passes no timestamp at all', async () => {
  const { dir, file } = figureEffect({
    figure: 'ring', size: 90, thickness: 40, motions: [{ kind: 'pulse', speed: 100, amount: 100 }]
  });
  try {
    const [first, later] = await runJobs([
      { name: 'nostamp-1', kind: 'html', file, stamps: [null] },
      { name: 'nostamp-20', kind: 'html', file, stamps: Array.from({ length: 20 }, () => null) }
    ]);
    assertMoved(first, later, 'a pulsing ring with no timestamp');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('every control the figure added really changes the picture', async () => {
  // Seven controls, seven chances for a bind path that resolves and writes
  // nowhere — the exact bug this project has already shipped once. Set each
  // global the way SignalRGB would and require the pixels to move.
  //
  // posX and posY get particular attention: they are the first controls in this
  // project whose exported name is not the document's field name (the document
  // says position.x, the control says posX, because a control's property
  // becomes a global in the finished page and `x` is not a name to claim
  // there). A crossing between the two would leave both sliders dead, and
  // nothing but this test would notice.
  const { dir, file } = figureEffect({
    figure: 'ring', size: 60, thickness: 20, points: 5,
    position: { x: 50, y: 50 }, motions: [{ kind: 'none' }]
  });
  try {
    const cases = [
      { name: 'figure', setGlobals: { figure: 'heart' } },
      { name: 'size', setGlobals: { size: 120 } },
      { name: 'posX', setGlobals: { posX: 20 } },
      { name: 'posY', setGlobals: { posY: 20 } },
      { name: 'thickness', setGlobals: { thickness: 95 } },
      // The point count needs the figure to be a star before it can mean
      // anything, which is precisely the case the exported list keeps every
      // field for: both globals are there whatever the figure is, so somebody
      // who switches to a star from this panel finds the one number a star is
      // about waiting for them.
      { name: 'points', setGlobals: { figure: 'star', points: 11 } },
      { name: 'color', setGlobals: { color: '#00ff00' } }
    ];
    const frames = await runJobs([
      { name: 'untouched', kind: 'html', file, settleMs: 300 },
      ...cases.map((entry) => ({
        name: entry.name, kind: 'html', file, settleMs: 300,
        setGlobals: entry.setGlobals, afterSetGlobalsMs: 60
      }))
    ]);
    const [untouched, ...changed] = frames;
    assert.ok(meanBrightness(untouched.pixels) > 5, 'the untouched export is blank');
    for (const frame of changed) {
      assert.ok(meanDifference(untouched.pixels, frame.pixels) > 1,
        `setting the ${frame.name} control had no visible effect`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the Figure control draws the very figure it names, not merely a different one', async () => {
  // A combobox that silently fell through to its first value would move pixels
  // and still be broken, so "it changed" is not enough for this one control:
  // switching a ring to a heart has to land on the same pixels an exported
  // heart lands on, byte for byte.
  const ring = figureEffect({
    figure: 'ring', size: 60, thickness: 20, points: 5,
    position: { x: 50, y: 50 }, motions: [{ kind: 'none' }]
  });
  const heart = figureEffect({
    figure: 'heart', size: 60, thickness: 20, points: 5,
    position: { x: 50, y: 50 }, motions: [{ kind: 'none' }]
  });
  try {
    const [switched, reference] = await runJobs([
      {
        name: 'switched', kind: 'html', file: ring.file, settleMs: 300,
        setGlobals: { figure: 'heart' }, afterSetGlobalsMs: 60
      },
      { name: 'reference', kind: 'html', file: heart.file, settleMs: 300 }
    ]);
    assert.equal(maxDifference(switched.pixels, reference.pixels), 0,
      'switching the Figure control to "heart" must draw the very heart an exported heart draws');
  } finally {
    rmSync(ring.dir, { recursive: true, force: true });
    rmSync(heart.dir, { recursive: true, force: true });
  }
});
