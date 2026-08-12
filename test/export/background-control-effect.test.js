// SignalForge — build SignalRGB effects from images, gradients, shapes and particles.
// Copyright (C) 2026 Max Leopold Blumenschein
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runJobs } from '../harness/render.js';
import { meanDifference } from '../harness/pixels.js';
import { buildEffectHtml } from '../../src/export/build-effect.js';
import { effectControls } from '../../src/export/effect-controls.js';
import { normalizeDocument } from '../../src/engine/document.js';
import { foregroundOf, backgroundOf } from '../../src/engine/slots.js';

/**
 * Turning a background's colour knob in SignalRGB has to change the picture.
 *
 * THE BUG REPORT THIS FILE COMES FROM: "the colour slider in SignalRGB for the
 * background does not work" (12.08.2026), against an effect with a figure on a
 * gradient — exactly the shape the star tile produces.
 *
 * WHY NOTHING CAUGHT IT. test/export/background-controls.test.js proves the
 * knobs are DECLARED: the right meta tags, the right bind paths, the right
 * defaults. Every other export test renders with no host values set at all, so
 * every control in the corpus has only ever been exercised at its default.
 * Declared and honoured are two different claims, and only the first one had a
 * test. This file asks the second: set the value the way the host sets it and
 * look at the pixels.
 *
 * The host's way is a plain global — SignalRGB's own injection template is
 * `var %1 = "%2";` — which is what the harness's setGlobals does.
 */

/** A figure on a gradient: the star tile's shape, and the report's shape. */
function starOnGradient() {
  const { doc } = normalizeDocument({
    name: 'BackgroundControl',
    description: 'a background colour knob must reach the picture',
    publisher: 'SignalForge',
    assets: {},
    layers: [
      {
        id: 'fill',
        type: 'gradient',
        shape: 'linear',
        angle: 0,
        stops: [{ at: 0, color: '#00ff00' }, { at: 100, color: '#ff0066' }]
      },
      { id: 'shape', type: 'shape', figure: 'star', color: '#ff0000', size: 40 }
    ]
  });
  const layerId = foregroundOf(doc.layers).id;
  const backgroundId = backgroundOf(doc.layers).id;
  return { ...doc, controls: effectControls(doc, layerId, backgroundId) };
}

function writeEffect(doc) {
  const dir = mkdtempSync(join(tmpdir(), 'signalforge-bgctl-'));
  const file = join(dir, 'effect.html');
  const engineSource = readFileSync(new URL('../../dist/engine.bundle.js', import.meta.url), 'utf8');
  writeFileSync(file, buildEffectHtml({ doc, engineSource, lang: 'en' }), 'utf8');
  return { dir, file };
}

test('a background colour knob changes the picture, the way the host turns it', async () => {
  const { dir, file } = writeEffect(starOnGradient());
  try {
    // Deep blue against a green-to-pink ramp: a miss cannot hide in rounding.
    const [asExported, blueFirstStop, blueSecondStop, redFigure] = await runJobs([
      { name: 'plain', kind: 'html', file, stamps: [1000] },
      { name: 'bg1', kind: 'html', file, stamps: [1000], setGlobals: { bgColor1: '#0000ff' } },
      { name: 'bg2', kind: 'html', file, stamps: [1000], setGlobals: { bgColor2: '#0000ff' } },
      // The control group. The figure's own colour is known to work — the
      // report says so — so if this one moved and the two above did not, the
      // difference is the background and not the harness.
      { name: 'fg', kind: 'html', file, stamps: [1000], setGlobals: { color: '#00ffff' } }
    ]);

    const movedByFigure = meanDifference(asExported.pixels, redFigure.pixels);
    assert.ok(movedByFigure > 2,
      `the control group must move: the figure colour changed the picture by ${movedByFigure}`);

    const movedByFirst = meanDifference(asExported.pixels, blueFirstStop.pixels);
    assert.ok(movedByFirst > 2,
      `turning "Background Colour 1" changed the picture by ${movedByFirst} — the knob does not reach the background`);

    const movedBySecond = meanDifference(asExported.pixels, blueSecondStop.pixels);
    assert.ok(movedBySecond > 2,
      `turning "Background Colour 2" changed the picture by ${movedBySecond} — the knob does not reach the background`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
