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

const QUADRANTS = 'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAHklEQVR42mXJsQ0AAAgDIOr/P9fVRFZSkMI4QtE/C5t8BQM0UanVAAAAAElFTkSuQmCC';

const DOC = {
  name: 'Parity',
  description: 'preview and export must agree',
  publisher: 'SignalForge',
  assets: { q: { kind: 'image', mime: 'image/png', data: QUADRANTS } },
  layers: [
    { id: 'a1', type: 'image', asset: 'q', fit: 'cover', motion: { kind: 'none' } },
    { id: 'a2', type: 'image', asset: 'q', fit: 'stretch', opacity: 0.4, blend: 'screen', motion: { kind: 'none' } }
  ],
  controls: []
};

// Every layer above is deliberately motion: 'none', and adding a moving one
// would WEAKEN this test rather than strengthen it.
//
// The exported effect drives itself from its own requestAnimationFrame clock,
// while the engine job renders at an explicit timeSec we hand it. With any
// motion the two would be sampled at different phases, so the comparison would
// measure clock alignment instead of engine equivalence — and would be flaky
// for a reason that has nothing to do with what this test exists to prove.
// With still layers the time is irrelevant and the comparison is exact.

test('the exported effect renders the same pixels as the engine does', async () => {
  const engineSource = readFileSync(new URL('../../dist/engine.bundle.js', import.meta.url), 'utf8');
  const dir = mkdtempSync(join(tmpdir(), 'signalforge-parity-'));
  const file = join(dir, 'effect.html');
  writeFileSync(file, buildEffectHtml({ doc: DOC, engineSource, lang: 'en' }), 'utf8');

  try {
    const [viaEngine, viaExport] = await runJobs([
      { name: 'engine', kind: 'engine', doc: DOC, timeSec: 0 },
      { name: 'export', kind: 'html', file, settleMs: 400 }
    ]);

    // Something must actually be on screen, otherwise "identical" is meaningless.
    assert.ok(meanBrightness(viaEngine.pixels) > 5, 'engine frame is blank');
    assert.ok(meanBrightness(viaExport.pixels) > 5, 'exported frame is blank');

    assert.equal(viaEngine.width, viaExport.width);
    assert.equal(viaEngine.height, viaExport.height);

    // Still motion at t=0: the two paths must land on the same pixels.
    assert.equal(maxDifference(viaEngine.pixels, viaExport.pixels), 0,
      `mean difference was ${meanDifference(viaEngine.pixels, viaExport.pixels)}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
