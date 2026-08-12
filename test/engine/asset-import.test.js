// SignalForge — build SignalRGB effects from images, gradients, shapes and particles.
// Copyright (C) 2026 Max Leopold Blumenschein
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { hasTransparentPixel, JPEG_QUALITY } from '../../src/engine/asset-import.js';

/** Build an RGBA buffer of `count` pixels, all opaque white. */
function opaque(count) {
  const data = new Uint8ClampedArray(count * 4);
  data.fill(255);
  return data;
}

test('a picture whose every pixel is fully opaque does not count as transparent', () => {
  assert.equal(hasTransparentPixel(opaque(1000)), false);
});

test('a single not-quite-opaque pixel counts, wherever it sits', () => {
  const first = opaque(1000);
  first[3] = 254;
  assert.equal(hasTransparentPixel(first), true);

  const last = opaque(1000);
  last[last.length - 1] = 254;
  assert.equal(hasTransparentPixel(last), true);
});

// A PNG may carry an alpha channel in which every pixel is 255 — most
// screenshots do. Those must not be mistaken for transparent pictures, or the
// whole saving is lost on exactly the images Max feeds this thing.
test('an alpha channel that is fully opaque everywhere is not transparency', () => {
  const data = opaque(64);
  for (let i = 3; i < data.length; i += 4) assert.equal(data[i], 255);
  assert.equal(hasTransparentPixel(data), false);
});

test('colour channels are ignored — only alpha decides', () => {
  const data = opaque(4);
  data[0] = 0;
  data[1] = 0;
  data[2] = 0;
  assert.equal(hasTransparentPixel(data), false);
});

test('an empty buffer is not transparent', () => {
  assert.equal(hasTransparentPixel(new Uint8ClampedArray(0)), false);
});

// Measured on Max' own screenshot and on a photo (see
// docs/erkenntnisse-signalrgb-motor.md): at 0.92 the rendered 320x200 frame
// differs from the PNG-embedded one by at most 9/255 on any channel and by
// under 0.9/255 on average, while the embedded bytes shrink about ninefold.
//
// Not pinned to the exact 0.92: the report names raising it to 0.95 as the
// intended response if the constant ever needs revisiting (e.g. Max finds the
// picture quality lacking), and a test asserting exact equality would fail
// for that being done correctly. A range still catches a fat-fingered value
// like 0.2 or 1 that was never measured against anything.
test('the jpeg quality is in the measured, sensible range', () => {
  assert.ok(JPEG_QUALITY > 0.8 && JPEG_QUALITY <= 0.95,
    `JPEG_QUALITY (${JPEG_QUALITY}) is outside the range the measurements in docs/erkenntnisse-signalrgb-motor.md cover`);
});
