// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COVER_WIDTH, COVER_HEIGHT, renderCoverPng } from '../../src/main/cover-image.js';
import { runJobs } from '../harness/render.js';
import { pixelAt } from '../harness/pixels.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const cli = join(root, 'bin', 'sfexport.js');

// A 4x4 PNG of four flat quadrants — the same picture the parity test uses.
// Flat blocks mean a sample taken away from an edge has exactly one right
// answer, so a tile that is a real render can be told from one that is not.
const QUADRANTS = 'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAHklEQVR42mXJsQ0AAAgDIOr/P9fVRFZSkMI4QtE/C5t8BQM0UanVAAAAAElFTkSuQmCC';

/**
 * The document an exported effect actually runs, taken out of the effect file
 * itself.
 *
 * Deliberately read back rather than rebuilt here: rebuilding it would mean a
 * second copy of what bin/sfexport.js assembles (asset preparation included),
 * and the two could then agree with each other while both disagreeing with the
 * file that was shipped. This way the tile is compared against the very
 * document sitting inside the .html beside it.
 */
function documentInside(htmlFile) {
  const html = readFileSync(htmlFile, 'utf8');
  const match = html.match(/<script id="sf-document" type="application\/json">([\s\S]*?)<\/script>/);
  assert.ok(match, `no embedded document found in ${htmlFile}`);
  return JSON.parse(match[1].replace(/<\\\//g, '</'));
}

// -------------------------------------------------------------- the choices

test('the tile is written at the one size SignalRGB has been seen to accept', () => {
  // 512 x 288: the size of every Static effect SignalRGB ships, and the size
  // of the probe image that was seen rendering as a tile in Max' own list
  // (docs/messung-titelbilder.md). Guarded because "whatever looks nice" is
  // exactly how a measured number quietly becomes an invented one.
  assert.equal(COVER_WIDTH, 512);
  assert.equal(COVER_HEIGHT, 288);
});

// ------------------------------------------------- where the render happens

test('inside Electron the tile is drawn here, without spawning anything', async () => {
  // The same trap prepare-image.js documents: a packaged executable ignores a
  // script argument and would start a second copy of SignalForge instead of
  // rendering anything.
  let asked = null;
  const png = await renderCoverPng({ name: 'x' }, {
    inElectron: true,
    inProcess: async (document_) => { asked = document_; return Buffer.from('hi').toString('base64'); },
    // Short enough that a spawn, if one happened after all, could not
    // possibly finish first and hide the mistake.
    timeoutMs: 1
  });

  assert.deepEqual(asked, { name: 'x' }, 'the document must be handed straight through');
  assert.equal(png.toString(), 'hi', 'and the base64 it hands back must become bytes');
});

test('outside Electron it spawns, because a plain Node process has no canvas', async () => {
  await assert.rejects(
    () => renderCoverPng({ name: 'x' }, {
      inElectron: false,
      inProcess: async () => Buffer.from('drawn here after all').toString('base64'),
      timeoutMs: 1
    }),
    /cover render timed out after 1ms/
  );
});

// ------------------------------------------------------------- end to end

/**
 * Two real exports, and the question this whole feature turns on: is the file
 * beside the effect a picture OF that effect?
 *
 * "It exists" would pass for a blank rectangle, and a blank rectangle is
 * exactly what a broken render produces. So each tile is decoded and compared,
 * pixel by sampled pixel, against the engine's own frame zero of the document
 * embedded in the effect file next to it — and, as the falsifying half,
 * against the OTHER effect's frame, which it must not match.
 */
test('an exported effect gets a tile that really is a render of that effect', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'signalforge-cover-e2e-'));
  const outDir = join(dir, 'Effects');
  const image = join(dir, 'quadrants.png');
  writeFileSync(image, Buffer.from(QUADRANTS, 'base64'));

  try {
    execFileSync(process.execPath, [
      cli, '--image', image, '--name', 'Cover Picture', '--out', outDir, '--motion', 'warp', '--fit', 'cover'
    ], { encoding: 'utf8', cwd: root });
    execFileSync(process.execPath, [
      cli, '--gradient', '#ff0066,#00b3ff', '--name', 'Cover Gradient', '--out', outDir,
      '--shape', 'linear', '--angle', '35'
    ], { encoding: 'utf8', cwd: root });

    const pictureHtml = join(outDir, 'Cover Picture.html');
    const gradientHtml = join(outDir, 'Cover Gradient.html');
    const picturePng = join(outDir, 'Cover Picture.png');
    const gradientPng = join(outDir, 'Cover Gradient.png');

    for (const file of [pictureHtml, gradientHtml, picturePng, gradientPng]) {
      assert.ok(existsSync(file), `${file} is missing`);
    }

    const [pictureCover, gradientCover, pictureFrame, gradientFrame] = await runJobs([
      { name: 'pictureCover', kind: 'png', file: picturePng },
      { name: 'gradientCover', kind: 'png', file: gradientPng },
      { name: 'pictureFrame', doc: documentInside(pictureHtml), timeSec: 0 },
      { name: 'gradientFrame', doc: documentInside(gradientHtml), timeSec: 0 }
    ]);

    for (const cover of [pictureCover, gradientCover]) {
      assert.equal(cover.width, COVER_WIDTH);
      assert.equal(cover.height, COVER_HEIGHT);
    }

    /**
     * Compare a tile against a 320 x 200 frame, through the same centred
     * cover-crop the tile was made with — worked out here from the two sizes
     * rather than imported, so a change to the crop has to be defended twice.
     *
     * Sampling rather than a whole-image diff: scaling is an interpolation, so
     * the tile is not a pixel copy of anything. Points are taken well inside
     * the flat regions of both documents, where interpolation has nothing to
     * blur across and a real render must land on the source colour.
     */
    const compare = (cover, frame) => {
      const scale = Math.max(COVER_WIDTH / frame.width, COVER_HEIGHT / frame.height);
      const sourceHeight = COVER_HEIGHT / scale;
      const offsetY = (frame.height - sourceHeight) / 2;

      let total = 0;
      let points = 0;
      let worst = 0;
      for (let sx = 12; sx < frame.width - 12; sx += 8) {
        for (let sy = Math.ceil(offsetY) + 12; sy < frame.height - offsetY - 12; sy += 8) {
          const cx = Math.round((sx + 0.5) * scale - 0.5);
          const cy = Math.round((sy + 0.5 - offsetY) * scale - 0.5);
          if (cx < 0 || cy < 0 || cx >= COVER_WIDTH || cy >= COVER_HEIGHT) continue;
          const a = pixelAt(cover.pixels, cover.width, cx, cy);
          const b = pixelAt(frame.pixels, frame.width, sx, sy);
          const difference = (Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b)) / 3;
          total += difference;
          worst = Math.max(worst, difference);
          points += 1;
        }
      }
      assert.ok(points > 200, `only ${points} points compared`);
      return { mean: total / points, worst };
    };

    const picture = compare(pictureCover, pictureFrame);
    const gradient = compare(gradientCover, gradientFrame);
    t.diagnostic(`picture tile vs its own frame: mean ${picture.mean.toFixed(2)}, worst ${picture.worst}`);
    t.diagnostic(`gradient tile vs its own frame: mean ${gradient.mean.toFixed(2)}, worst ${gradient.worst}`);

    assert.ok(picture.mean < 4, `the picture tile is not its own effect (mean difference ${picture.mean})`);
    assert.ok(gradient.mean < 4, `the gradient tile is not its own effect (mean difference ${gradient.mean})`);

    // The falsifying half. Without this, a tile that was black — or any two
    // tiles that were the same — would sail through the two checks above if
    // the frames happened to be black too.
    const crossed = compare(pictureCover, gradientFrame);
    t.diagnostic(`picture tile vs the OTHER effect's frame: mean ${crossed.mean.toFixed(2)}`);
    assert.ok(crossed.mean > 30, `the two effects are too alike for this test to prove anything (${crossed.mean})`);

    // A tile, not an icon: every corner opaque, and none of them the black of
    // an untouched canvas showing through where a letterbox bar would be.
    for (const [x, y] of [[0, 0], [COVER_WIDTH - 1, 0], [0, COVER_HEIGHT - 1], [COVER_WIDTH - 1, COVER_HEIGHT - 1]]) {
      const corner = pixelAt(gradientCover.pixels, COVER_WIDTH, x, y);
      assert.equal(corner.a, 255, `corner ${x},${y} is not opaque`);
      assert.ok(corner.r + corner.g + corner.b > 40, `corner ${x},${y} is black, which is what a bar looks like`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
