// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prepareImageFile } from '../../src/main/prepare-image.js';
import { runJobs } from '../harness/render.js';
import { pixelAt, isColour, meanBrightness } from '../harness/pixels.js';

// Three real 320x200 PNGs, written by hand with node:zlib (see the report in
// .superpowers/sdd/jpeg-report.md) so that each one isolates exactly one case.
//
// OPAQUE:       colour type 2 — no alpha channel at all.
// OPAQUE_ALPHA: colour type 6 — an alpha channel in which every pixel is 255,
//               which is what a Windows screenshot looks like.
// HOLED:        colour type 6 — the right half is fully transparent.
//
// All three are left-half blue (0,64,255); OPAQUE and OPAQUE_ALPHA are
// right-half red (255,48,0), HOLED is right-half see-through.
const OPAQUE = 'iVBORw0KGgoAAAANSUhEUgAAAUAAAADICAIAAAAWZq/8AAACmklEQVR42u3TQQ0AAAjEsJOEBPybAhH8SJNJWJMePW4qelwsDrAAFsACWAALYAEMsAAWwAJYAAtgAQywABbAAlgAC2ABDLAAFsACWAALYAEsgAEWwAJYAAtgASyAARbAAlgAC2ABLIABFsACWAALYAEsgAEWwAJYAAtgASyABTDAAlgAC2ABLIAFMMACWAALYAEsgAUwwAJYAAtgASyABTDALgdYAAtgASyABbAABlgAC2ABLIAFsAAGWAALYAEsgAWwAAZYAAtgASyABbAAlsUBFsACWAALYAEsgAEWwAJYAAtgASyAARbAAlgAC2ABLIABFsACWAALYAEsgAUwwAJYAAtgASyABTDAAlgAC2ABLIAFMMACWAALYAEsgAUwwAJYAAtgASyABbAABlgAC2ABLIAFsAAGWAALYAEsgAWwAAZYAAtgASyABbAABtjlAAtgASyABbAAFsAAC2ABLIAFsAAWwAALYAEsgAWwABbAAAtgASyABbAAFsACGGABLIAFsAAWwAIYYAEsgAWwABbAAhhgASyABbAAFsACGGABLIAFsAAWwAJYAAMsgAWwABbAAlgAAyyABbAAFsACWAADLIAFsAAWwAJYAAMsgAWwABbAAlgAC2CABbAAFsACWAALYIAFsAAWwAJYAAtggAWwABbAAlgAC2CAXQ6wABbAAlgAC2ABDLAAFsACWAALYAEMsAAWwAJYAAtgAQywABbAAlgAC2ABLIABFsACWAALYAEsgAEWwAJYAAtgASyAARbAAlgAC2ABLIABFsACWAALYAEsgAUwwAJYAAtgASyABTDAAlgAC2ABLIAFMMACWAALYAEsgAUwwAJYAAtgASyABbAABlgAC2ABLIAFsAAGWAALYAEsgHVpAUXrx8K/nP0dAAAAAElFTkSuQmCC';
const OPAQUE_ALPHA = 'iVBORw0KGgoAAAANSUhEUgAAAUAAAADICAYAAACZBDirAAADFUlEQVR42u3UMQEAMAzDsEAahPInld1F0EeHINjJtHClL3AmIsQAMUAwQAwQDBADBAPEAMEAMUAwQAwQDBADBAPEAMEAMUAwQAwQDBADBAPEAMEAMUAwQAwQAxQhBogBggFigGCAGCAYIAYIBogBggFigGCAGCAYIAYIBogBggFigGCAGCAYIAYIBogBggFigBigEDFADBAMEAMEA8QAwQAxQDBADBAMEAMEA8QAwQAxQDBADBAMEAMEA8QAwQAxQDBADBAMEAPEAMEAMUAwQAwQDBADBAPEAMEAMUAwQAwQDBADBAPEAMEAMUAwQAwQDBADBAPEAMEAMUAwQAwQAwQDxADBADFAMEAMEAwQAwQDxADBADFAMEAMEAwQAwQDxADBADFAMEAMEAwQAwQDxABBhBggBggGiAGCAWKAYIAYIBggBggGiAGCAWKAYIAYIBggBggGiAGCAWKAYIAYIBggBggGiAFigCLEADFAMEAMEAwQAwQDxADBADFAMEAMEAwQAwQDxADBADFAMEAMEAwQAwQDxADBADFAMEAMEAMUIQaIAYIBYoBggBggGCAGCAaIAYIBYoBggBggGCAGCAaIAYIBYoBggBggGCAGCAaIAYIBYoAYoBAxQAwQDBADBAPEAMEAMUAwQAwQDBADBAPEAMEAMUAwQAwQDBADBAPEAMEAMUAwQAwQDBADxADBADFAMEAMEAwQAwQDxADBADFAMEAMEAwQAwQDxADBADFAMEAMEAwQAwQDxADBADFAMEAMEAMEA8QAwQAxQDBADBAMEAMEA8QAwQAxQDBADBAMEAMEA8QAwQAxQDBADBAMEAMEA8QAQYQYIAYIBogBggFigGCAGCAYIAYIBogBggFigGCAGCAYIAYIBogBggFigGCAGCAYIAYIBogBYoAixAAxQDBADBAMEAMEA8QAwQAxQDBADBAMEAMEA8QAwQAxQDBADBAMEAMEA8QAwQAxQDBADBADFCEGiAGCAWKAYIAYIBggBggGiAGCAWKAYIAYIBggBggGiAGCAWKAYIAYIBggBgjbB/DD3Fm5P0DKAAAAAElFTkSuQmCC';
const HOLED = 'iVBORw0KGgoAAAANSUhEUgAAAUAAAADICAYAAACZBDirAAADSUlEQVR42u3UMREAAAwCMaTVvyk6V0GX/B0SSDKt2duk15zQACgAmgFQADQDoABoBkAB0AyAAqAZAAVAMwAKgGYAFADNACgAmgFQADQDoABoBkAB0AyAAqAZAAVAA6AEQAOgBEADoARAA6AEQAOgBEADoARAA6AEQAOgBEADoARAA6AEQAOgBEADoARAA6AEQAOgBEADoABoBkAB0AyAAqAZAAVAMwAKgGYAFADNACgAmgFQADQDoABoBkAB0AyAAqAZAAVAMwAKgGYAFADNACgAGgAlABoAJQAaACUAGgAlABoAJQAaACUAGgAlABoAJQAaACUAGgAlABoAJQAaACUAGgAlABoAJQAaAAVAMwAKgGYAFADNACgAmgFQADQDoABoBkAB0AyAAqAZAAVAMwAKgGYAFADNACgAmgFQADQDoABo5oACoAFQAqABUAKgAVACoAFQAqABUAKgAVACoAFQAqABUAKgAVACoAFQAqABUAKgAVACoAFQAqABUHJCA6AAaAZAAdAMgAKgGQAFQDMACoBmABQAzQAoAJoBUAA0A6AAaAZAAdAMgAKgGQAFQDMACoBmABQADYASAA2AEgANgBIADYASAA2AEgANgBIADYASAA2AEgANgBIADYASAA2AEgANgBIADYASAA2AEgANgAKgGQAFQDMACoBmABQAzQAoAJoBUAA0A6AAaAZAAdAMgAKgGQAFQDMACoBmABQAzQAoAJoBUAA0A6AAaACUAGgAlABoAJQAaACUAGgAlABoAJQAaACUAGgAlABoAJQAaACUAGgAlABoAJQAaACUAGgAlABoABQAzQAoAJoBUAA0A6AAaAZAAdAMgAKgGQAFQDMACoBmABQAzQAoAJoBUAA0A6AAaAZAAdAMgAKgmQMKgAZACYAGQAmABkAJgAZACYAGQAmABkAJgAZACYAGQAmABkAJgAZACYAGQAmABkAJgAZACYAGQMkJDYACoBkABUAzAAqAZgAUAM0AKACaAVAANAOgAGgGQAHQDIACoBkABUAzAAqAZgAUAM0AKACaAVAANABKADQASgA0AEoANABKADQASgA0AEoANABKADQASgA0AEoANABKADQASgA0AEoANABKpwVEQ1ZpfNcCxwAAAABJRU5ErkJggg==';

// A 640x400 PNG (colour type 6) with exactly one genuinely transparent pixel
// (alpha 0, at (320,200), roughly the middle) and every other pixel opaque —
// left half blue, right half red, same as the others. Generated with
// node:zlib the same way (see .superpowers/sdd/jpeg-report.md).
//
// Everything above is already 320x200, so the default maxHeight (200) never
// actually scales anything down — the scale factor is always 1. This one is
// twice the canvas height, so `prepareImageAsset` must halve it to 320x200,
// and the transparency probe has to still find the one transparent pixel
// after that downscale (see the "scaling is safe to judge on" note in
// src/engine/asset-import.js — this fixture is what proves it, not just
// measures it by hand).
const WIDE_HOLED = 'iVBORw0KGgoAAAANSUhEUgAAAoAAAAGQCAYAAAA+89ElAAAIW0lEQVR42u3YMREAMAwDsYdUCOVPKiWRrRqEwX+uOwPwozkBfCkjAAhAAAEIIAABBCCAAAQQgAACEEAAAghAAAEIIAABBCCAAAQQgAACEEAAAghAAAEIIAABBCCAAAQQgAACEEAAAghAAAEIYAQAAQggAAEEIIAABBCAAAIQQAACCEAAAQggAAEEIIAABBCAAAIQQAACCEAAAQggAAEEIIAABBCAAAIQQAACCEAAAQggAAEEICAAAQQggAAEEIAAAhBAAAIIQAABCCAAAQQggAAEEIAAAhBAAAIIQAABCCAAAQQggAAEEIAAAhBAAAIIQAABCCAAAQQggAAEBCCAAAQQgAACEEAAAghAAAEIIAABBCCAAAQQgAACEEAAAghAAAEIIAABBCCAAAQQgAACEEAAAghAAAEIIAABBCCAAAQQgIAABBCAAAIQQAACCEAAAQggAAEEIIAABBCAAAIQQAACCEAAAQggAAEEIIAABBCAAAIQQAACCEAAAQggAAEEIIAABBCAAAIQEIBGABCAAAIQQAACCEAAAQggAAEEIIAABBCAAAIQQAACCEAAAQggAAEEIIAABBCAAAIQQAACCEAAAQggAAEEIIAABBCAAAIQEIBGABCAAAIQQAACCEAAAQggAAEEIIAABBCAAAIQQAACCEAAAQggAAEEIIAABBCAAAIQQAACCEAAAQggAAEEIIAABBCAAAIQQAACAhBAAAIIQAABCCAAAQQggAAEEIAAAhBAAAIIQAABCCAAAQQggAAEEIAAAhBAAAIIQAABCCAAAQQggAAEEIAAAhBAAAIIQEAAAghAAAEIIAABBCCAAAQQgAACEEAAAghAAAEIIAABBCCAAAQQgAACEEAAAghAAAEIIAABBCCAAAQQgAACEEAAAghAAAEICEAAAQggAAEEIIAABBCAAAIQQAACCEAAAQggAAEEIIAABBCAAAIQQAACCEAAAQggAAEEIIAABBCAAAIQQAACCEAAAQggAAEBCCAAAQQggAAEEIAAAhBAAAIIQAABCCAAAQQggAAEEIAAAhBAAAIIQAABCCAAAQQggAAEEIAAAhBAAAIIQAABCCAAAQQgIAABBCCAAAQQgAACEEAAAghAAAEIIAABBCCAAAQQgAACEEAAAghAAAEIIAABBCCAAAQQgAACEEAAAghAAAEIIAABBCCAAAQEoBEABCCAAAQQgAACEEAAAghAAAEIIAABBCCAAAQQgAACEEAAAghAAAEIIAABBCCAAAQQgAACEEAAAghAAAEIIAABBCCAAAQwAoAABBCAAAIQQAACCEAAAQggAAEEIIAABBCAAAIQQAACCEAAAQggAAEEIIAABBCAAAIQQAACCEAAAQggAAEEIIAABBCAAAIQEIAAAhBAAAIIQAABCCAAAQQggAAEEIAAAhBAAAIIQAABCCAAAQQggAAEEIAAAhBgW2UIAAEI4AEEEIAAAhBAAAIIQAABCCAAAQQggAAEEIAAAhBAAAIIQAABCCAAAQQggAAEEIAAAhBAAAIIQAABCCAAAQQggAAEBKARAAQggAAEEIAAAhBAAAIIQAABCCAAAQQggAAEEIAAAhBAAAIIQAABCCAAAQQggAAEEIAAAhBAAAIIQAABCCAAAQQggAAEBKARAAQggAAEEIAAAhBAAAIIQAABCCAAAQQggAAEEIAAAhBAAAIIQAABCCAAAQQggAAEEIAAAhBAAAIIQAABCCAAAQQggAAEEICAAAQQgAACEEAAAghAAAEIIAABBCCAAAQQgAACEEAAAghAAAEIIAABBCCAAAQQgAACEEAAAghAAAEIIAABBCCAAAQQgAACEBCAAAIQQAACCEAAAQggAAEEIIAABBCAAAIQQAACCEAAAQggAAEEIIAABBCAAAIQQAACCEAAAQggAAEEIIAABBCAAAIQQAACAhBAAAIIQAABCCAAAQQggAAEEIAAAhBAAAIIQAABCCAAAQQggAAEEIAAAhBAAAIIQAABCCAAAQQggAAEEIAAAhBAAAIIQEAAAghAAAEIIAABBCCAAAQQgAACEEAAAghAAAEIIAABBCCAAAQQgAACEEAAAghAAAEIIAABBCCAAAQQgAACEEAAAghAAAEICEAAAQggAAEEIIAABBCAAAIQQAACCEAAAQggAAEEIIAABBCAAAIQQAACCEAAAQggAAEEIIAABBCAAAIQQAACCEAAAQggAAEBaAQAAQggAAEEIIAABBCAAAIQQAACCEAAAQggAAEEIIAABBCAAAIQQAACCEAAAQggAAEEIIAABBCAAAIQQAACCEAAAQggAAGMACAAAQQggAAEEIAAAhBAAAIIQAABCCAAAQQggAAEEIAAAhBAAAIIQAABCCAAAQQggAAEEIAAAhBAAAIIQAABCCAAAQQggAAEBCCAAAQQgAACEEAAAghAAAEIIAABBCCAAAQQgAACEEAAAghAAAEIIAABBCCAAAQQgAACEEAAAghAAAEIIAABBCCAAAQQgIAABBCAAAIQQAACCEAAAQggAAEEIIAABBCAAAIQQAACCEAAAQggAAEEIIAABBCAAAIQQAACCEAAAQggAAEEIIAABBCAAAIQEIAAAhBAAAIIQAABCCAAAQQggAAEEIAAAhBAAAIIQAABCCAAAQQggAAEEIAAAhBAAAIIQAABCCAAAQQggAAEEIAAAhBAAAIC0BAAAhBAAAIIQAABCCAAAQQggAAEEIAAAhBAAAIIQAABCCAAAQQggAAEEIAAAhBAAAIIQAABCCAAAQQggAAEEIAAAhBAAAIC0AgAAhBAAAIIQAABCCAAAQQggAAEEIAAAhBAAAIIQAABCCAAAQQggAAEEIAAAhBAAAIsemw7b2BdjEfxAAAAAElFTkSuQmCC';

// A tiny solid red backdrop, embedded as-is (not through the importer), so
// that the transparent picture has something to be transparent ONTO.
const RED_8x8 = 'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEUlEQVR42mP4z8CAFTEMLQkAKP8/wc53yE8AAAAASUVORK5CYII=';

const BLUE = [0, 64, 255];
const RED = [255, 48, 0];
const PURE_RED = [255, 0, 0];

function writeFixtures(dir) {
  const paths = {};
  for (const [name, base64] of [['opaque', OPAQUE], ['opaqueAlpha', OPAQUE_ALPHA], ['holed', HOLED]]) {
    paths[name] = join(dir, `${name}.png`);
    writeFileSync(paths[name], Buffer.from(base64, 'base64'));
  }
  return paths;
}

test('the importer picks JPEG for opaque pictures and PNG only for real transparency', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'signalforge-encoding-'));
  try {
    const paths = writeFixtures(dir);
    // One Electron launch each, run together so the wall time is one launch.
    const [opaque, opaqueAlpha, holed] = await Promise.all([
      prepareImageFile(paths.opaque),
      prepareImageFile(paths.opaqueAlpha),
      prepareImageFile(paths.holed)
    ]);

    // Assert the actual bytes, not the mime label the code attached to them —
    // `mime` is read back from what toDataURL produced (see asset-import.js),
    // but a test that only re-checks that same label would never notice the
    // encoder silently falling back to PNG. '/9j/' is the base64 encoding of
    // JPEG's FF D8 FF magic; 'iVBORw0KGgo' is PNG's.
    assert.ok(opaque.data.startsWith('/9j/'),
      `a picture without an alpha channel must become real JPEG bytes, got ${opaque.data.slice(0, 12)}`);
    assert.ok(opaqueAlpha.data.startsWith('/9j/'),
      `an alpha channel that is opaque everywhere is not transparency and must still become real JPEG bytes, got ${opaqueAlpha.data.slice(0, 12)}`);
    assert.ok(holed.data.startsWith('iVBORw0KGgo'),
      `a genuinely see-through picture must stay real PNG bytes, got ${holed.data.slice(0, 12)}`);

    assert.equal(opaque.mime, 'image/jpeg');
    assert.equal(opaqueAlpha.mime, 'image/jpeg');
    assert.equal(holed.mime, 'image/png');

    // The picture itself is unchanged, only how it is stored.
    for (const asset of [opaque, opaqueAlpha, holed]) {
      assert.equal(asset.kind, 'image');
      assert.equal(asset.width, 320);
      assert.equal(asset.height, 200);
      assert.ok(asset.data.length > 0);
    }

    // Deliberately no size assertion here. These fixtures are two flat
    // colours, which is the one thing PNG compresses better than JPEG — a
    // "JPEG is smaller" check would fail on them while being true for every
    // real picture. The size measurements live in
    // docs/erkenntnisse-signalrgb-motor.md, taken on Max' own screenshot and
    // on a photo.
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('both encodings still render — and the transparent one is still see-through', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'signalforge-encoding-render-'));
  try {
    const paths = writeFixtures(dir);
    const [opaque, holed] = await Promise.all([
      prepareImageFile(paths.opaque),
      prepareImageFile(paths.holed)
    ]);

    // Stated here too, so this test provably exercises both encodings rather
    // than quietly rendering two PNGs — checked on the bytes, not the label.
    assert.ok(opaque.data.startsWith('/9j/'));
    assert.ok(holed.data.startsWith('iVBORw0KGgo'));
    assert.equal(opaque.mime, 'image/jpeg');
    assert.equal(holed.mime, 'image/png');

    const backdrop = { kind: 'image', mime: 'image/png', data: RED_8x8 };
    const [asJpeg, asPng] = await runJobs([
      {
        name: 'jpeg',
        kind: 'engine',
        timeSec: 0,
        doc: {
          name: 'jpeg',
          assets: { pic: opaque },
          layers: [{ id: 'pic', type: 'image', asset: 'pic', fit: 'stretch', motions: [] }]
        }
      },
      {
        // The transparent picture sits on a solid red backdrop. If it had been
        // flattened to JPEG its see-through half would come back black, since
        // JPEG has no alpha and the canvas underneath is black — so "red here"
        // is exactly the proof that the transparency survived.
        name: 'png',
        kind: 'engine',
        timeSec: 0,
        doc: {
          name: 'png',
          assets: { back: backdrop, pic: holed },
          layers: [
            { id: 'back', type: 'image', asset: 'back', fit: 'stretch', motions: [] },
            { id: 'pic', type: 'image', asset: 'pic', fit: 'stretch', motions: [] }
          ]
        }
      }
    ]);

    for (const frame of [asJpeg, asPng]) {
      assert.ok(meanBrightness(frame.pixels) > 5, 'frame is blank');
    }

    // x = 40 and x = 280 are far from the middle seam and from the edges, so
    // neither the 1.4px blur nor JPEG ringing reaches them.
    const jpegLeft = pixelAt(asJpeg.pixels, asJpeg.width, 40, 100);
    const jpegRight = pixelAt(asJpeg.pixels, asJpeg.width, 280, 100);
    assert.ok(isColour(jpegLeft, BLUE), `JPEG left half was ${JSON.stringify(jpegLeft)}`);
    assert.ok(isColour(jpegRight, RED), `JPEG right half was ${JSON.stringify(jpegRight)}`);

    const pngLeft = pixelAt(asPng.pixels, asPng.width, 40, 100);
    const pngRight = pixelAt(asPng.pixels, asPng.width, 280, 100);
    assert.ok(isColour(pngLeft, BLUE), `PNG left half was ${JSON.stringify(pngLeft)}`);
    assert.ok(isColour(pngRight, PURE_RED),
      `the see-through half should show the red backdrop, not ${JSON.stringify(pngRight)}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a transparent pixel is still found after the picture is downscaled', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'signalforge-encoding-downscale-'));
  try {
    const path = join(dir, 'wideHoled.png');
    writeFileSync(path, Buffer.from(WIDE_HOLED, 'base64'));

    // Default maxHeight (200) halves this 640x400 source, exercising the
    // scale path the other fixtures (already 320x200) never touch.
    const asset = await prepareImageFile(path);

    assert.equal(asset.width, 320);
    assert.equal(asset.height, 200);
    assert.ok(asset.data.startsWith('iVBORw0KGgo'),
      `a picture downscaled while carrying one transparent pixel must stay real PNG bytes, got ${asset.data.slice(0, 12)}`);
    assert.equal(asset.mime, 'image/png');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
