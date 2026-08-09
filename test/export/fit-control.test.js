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

// 4x4 PNG: red / green / blue / white quadrants, two pixels each way. Square,
// so it renders differently under 'cover' (crops top/bottom to fill the wide
// 320x200 canvas) than under 'stretch' (squeezes the whole square in) --
// exactly the kind of picture that makes a wrong fit look "cropped", which is
// the real-world symptom this control exists to fix.
const QUADRANTS = 'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAHklEQVR42mXJsQ0AAAgDIOr/P9fVRFZSkMI4QtE/C5t8BQM0UanVAAAAAElFTkSuQmCC';

function docWithFit(fit) {
  return {
    name: 'FitControl',
    description: 'fit control reaches the renderer',
    publisher: 'SignalForge',
    assets: { q: { kind: 'image', mime: 'image/png', data: QUADRANTS } },
    // motion: 'none' makes the render time-invariant, same reasoning as
    // test/export/parity.test.js: the exported effect drives itself from its
    // own requestAnimationFrame clock, so comparing against an engine job
    // rendered at an arbitrary timeSec is only exact if motion cannot make
    // the two land on different phases.
    layers: [{ id: 'a1', type: 'image', asset: 'q', fit, motion: { kind: 'none' } }],
    controls: [
      { property: 'fit', label: { de: 'Bildausschnitt', en: 'Fit' }, type: 'combobox',
        values: ['cover', 'stretch', 'contain'], default: fit, bind: ['a1.fit'] }
    ]
  };
}

test('the fit control reaches the renderer: an effect exported with --fit cover renders '
  + 'differently once the control is set to stretch, and matches the engine exactly either way', async () => {
  const engineSource = readFileSync(new URL('../../dist/engine.bundle.js', import.meta.url), 'utf8');
  const dir = mkdtempSync(join(tmpdir(), 'signalforge-fit-control-'));
  // The document this stands in for `sfexport.js --fit cover` producing: the
  // layer's baked-in fit is 'cover' (what --fit cover writes), and the fit
  // control's default matches it, exactly as buildImageDocument wires it up.
  const file = join(dir, 'effect.html');
  writeFileSync(file, buildEffectHtml({ doc: docWithFit('cover'), engineSource, lang: 'en' }), 'utf8');

  try {
    const [engineCover, engineStretch, exportDefault, exportOverridden] = await runJobs([
      { name: 'engine-cover', kind: 'engine', doc: docWithFit('cover'), timeSec: 0 },
      { name: 'engine-stretch', kind: 'engine', doc: docWithFit('stretch'), timeSec: 0 },
      // No control touched: must render the baked-in --fit cover default.
      { name: 'export-default', kind: 'html', file, settleMs: 400 },
      // Simulate SignalRGB delivering a new combobox selection at runtime.
      { name: 'export-overridden', kind: 'html', file, settleMs: 400, setGlobals: { fit: 'stretch' }, afterSetGlobalsMs: 400 }
    ]);

    // Sanity: something is actually on screen in every job.
    for (const [label, result] of [['engine-cover', engineCover], ['engine-stretch', engineStretch],
      ['export-default', exportDefault], ['export-overridden', exportOverridden]]) {
      assert.ok(meanBrightness(result.pixels) > 5, `${label} frame is blank`);
    }

    // The whole point: touching the control must change what is on screen.
    assert.ok(maxDifference(exportDefault.pixels, exportOverridden.pixels) > 0,
      'setting the fit control had no visible effect -- the control exists on paper but not in effect');
    assert.ok(meanDifference(exportDefault.pixels, exportOverridden.pixels) > 1,
      `expected a clearly visible change, mean difference was only ${meanDifference(exportDefault.pixels, exportOverridden.pixels)}`);

    // Not just "different" -- exactly what the engine itself produces for
    // each fit, proving the control's value (not some other side effect)
    // is what changed the frame.
    assert.equal(maxDifference(exportDefault.pixels, engineCover.pixels), 0,
      'export with the untouched control should render pixel-identical to the engine under fit "cover"');
    assert.equal(maxDifference(exportOverridden.pixels, engineStretch.pixels), 0,
      'export with the control set to "stretch" should render pixel-identical to the engine under fit "stretch"');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
