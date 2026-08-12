// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { normalizeDocument } from '../../src/engine/document.js';
import { COVER_WIDTH, COVER_HEIGHT, renderCoverPng } from '../../src/main/cover-image.js';
import { runJobs } from '../harness/render.js';
import { pixelAt, maxDifference } from '../harness/pixels.js';

/**
 * The chosen tile picture — "eigenes Titelbild".
 *
 * A document whose `cover` names an asset must export THAT picture as its
 * tile, cover-cropped to the measured 512 x 288; a document that names
 * nothing (every document so far) must keep the automatic frame-0 render,
 * byte for byte the same mechanism as before. Proven on the pixels of the
 * PNGs renderCoverPng actually produces, through the same spawned Electron
 * route bin/sfexport.js takes.
 */

// The same 4x4 four-quadrant PNG the parity and cover tests use: four flat
// colours, so a sampled point well inside a quadrant has one right answer.
const QUADRANTS = 'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAHklEQVR42mXJsQ0AAAgDIOr/P9fVRFZSkMI4QtE/C5t8BQM0UanVAAAAAElFTkSuQmCC';

/** One empty-layered document; `cover`/`assets` vary per test. */
function coverDoc(extra = {}) {
  return {
    name: 'Tile test',
    layers: [],
    controls: [],
    ...extra
  };
}

// ------------------------------------------------------------ normalization

test('a cover naming a real asset stays; anything else is dropped with a word', () => {
  const kept = normalizeDocument(coverDoc({
    cover: 'art',
    assets: { art: { kind: 'image', mime: 'image/png', data: QUADRANTS } }
  }));
  assert.equal(kept.doc.cover, 'art');
  assert.deepEqual(kept.problems, []);

  const dangling = normalizeDocument(coverDoc({ cover: 'gone' }));
  assert.equal(dangling.doc.cover, null);
  assert.equal(dangling.problems.length, 1);
  assert.match(dangling.problems[0], /names no asset/);

  assert.equal(normalizeDocument(coverDoc()).doc.cover, null);
  assert.equal(normalizeDocument(coverDoc({ cover: 42 })).doc.cover, null);
});

// ------------------------------------------------------------- the pixels

test('a chosen cover becomes the tile, and no cover keeps the automatic render', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'signalforge-cover-test-'));
  try {
    const chosen = await renderCoverPng(coverDoc({
      cover: 'art',
      assets: { art: { kind: 'image', mime: 'image/png', data: QUADRANTS } }
    }));
    const automatic = await renderCoverPng(coverDoc({
      assets: { art: { kind: 'image', mime: 'image/png', data: QUADRANTS } }
    }));
    const chosenFile = join(dir, 'chosen.png');
    const automaticFile = join(dir, 'automatic.png');
    writeFileSync(chosenFile, chosen);
    writeFileSync(automaticFile, automatic);

    const [chosenTile, automaticTile] = await runJobs([
      { name: 'chosen', kind: 'png', file: chosenFile },
      { name: 'automatic', kind: 'png', file: automaticFile }
    ]);

    assert.equal(chosenTile.width, COVER_WIDTH);
    assert.equal(chosenTile.height, COVER_HEIGHT);

    // The chosen tile is the quadrant picture: four flat regions, pairwise
    // different — sampled well inside each quarter, where the upscale from
    // 4 x 4 has nothing to blur across.
    const corners = [
      pixelAt(chosenTile.pixels, chosenTile.width, 128, 72),
      pixelAt(chosenTile.pixels, chosenTile.width, 384, 72),
      pixelAt(chosenTile.pixels, chosenTile.width, 128, 216),
      pixelAt(chosenTile.pixels, chosenTile.width, 384, 216)
    ];
    for (let a = 0; a < corners.length; a += 1) {
      for (let b = a + 1; b < corners.length; b += 1) {
        const gap = Math.abs(corners[a].r - corners[b].r)
          + Math.abs(corners[a].g - corners[b].g)
          + Math.abs(corners[a].b - corners[b].b);
        assert.ok(gap > 30,
          `quadrants ${a} and ${b} look the same — the chosen picture was not used`);
      }
    }

    // The automatic tile of an empty document is the renderer's own black
    // frame — and, decisively, NOT the quadrant picture.
    const centre = pixelAt(automaticTile.pixels, automaticTile.width, 256, 144);
    assert.ok(centre.r + centre.g + centre.b < 24,
      'an empty document\'s automatic tile is the black frame it renders');
    assert.ok(maxDifference(chosenTile.pixels, automaticTile.pixels) > 100,
      'the two routes must not produce the same picture');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a cover whose asset cannot be decoded falls back to the automatic tile', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'signalforge-cover-test-'));
  try {
    const broken = await renderCoverPng(coverDoc({
      cover: 'art',
      assets: { art: { kind: 'image', mime: 'image/png', data: 'AAAA' } }
    }));
    const file = join(dir, 'broken.png');
    writeFileSync(file, broken);
    const [tile] = await runJobs([{ name: 'broken', kind: 'png', file }]);
    const centre = pixelAt(tile.pixels, tile.width, 256, 144);
    assert.ok(centre.r + centre.g + centre.b < 24,
      'a broken cover asset must fall back to the frame, not ship a broken image');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
