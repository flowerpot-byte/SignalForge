// SignalForge — build SignalRGB effects from images, gradients, shapes and particles.
// Copyright (C) 2026 Max Leopold Blumenschein
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { paletteFromPixels, rgbToHsl, hslToHex } from '../../app/renderer/components/palette.js';

/** `count` copies of one RGBA pixel, as getImageData() would hand them over. */
function pixels(colours) {
  const out = new Uint8ClampedArray(colours.length * 4);
  colours.forEach(([r, g, b, a = 255], i) => {
    out[i * 4] = r; out[i * 4 + 1] = g; out[i * 4 + 2] = b; out[i * 4 + 3] = a;
  });
  return out;
}
const repeat = (colour, times) => Array.from({ length: times }, () => colour);

/** "#rrggbb" -> the hue and lightness it stands for. */
function readBack(hex) {
  const n = parseInt(hex.slice(1), 16);
  return rgbToHsl((n >> 16) & 255, (n >> 8) & 255, n & 255);
}

test('the colours come back as hex, three of them, from a picture with colour in it', () => {
  const palette = paletteFromPixels(pixels([
    ...repeat([220, 60, 40], 40),   // red
    ...repeat([40, 90, 220], 30),   // blue
    ...repeat([50, 200, 90], 20)    // green
  ]));
  assert.equal(palette.length, 3);
  for (const colour of palette) assert.match(colour, /^#[0-9a-f]{6}$/);
});

test('the strongest colour in the picture is the first one reported', () => {
  const palette = paletteFromPixels(pixels([
    ...repeat([40, 90, 220], 60),   // blue, by far the most of it
    ...repeat([220, 60, 40], 5)
  ]));
  const { h } = readBack(palette[0]);
  assert.ok(h > 190 && h < 260, `expected a blue hue, got ${h}`);
});

// The hue is the picture's; the lightness is not, and must not be. The blobs
// sit behind translucent panels, so a picture of a snowy field would
// otherwise lift the panel surface far enough to take --text-muted below
// 4.5:1. This is what keeps the contrast a property of the stylesheet.
test('a picture of pure white and one of near black yield the same lightnesses', () => {
  const white = paletteFromPixels(pixels(repeat([255, 255, 255], 50)));
  const black = paletteFromPixels(pixels(repeat([6, 6, 8], 50)));
  const lightness = (palette) => palette.map((c) => Number(readBack(c).l.toFixed(2)));
  assert.deepEqual(lightness(white), lightness(black));
  for (const l of lightness(white)) {
    assert.ok(l >= 0.2 && l <= 0.36, `a backdrop blob must stay in its band, got ${l}`);
  }
});

test('two very different pictures do not produce the same colours', () => {
  const warm = paletteFromPixels(pixels(repeat([230, 120, 40], 50)));
  const cool = paletteFromPixels(pixels(repeat([30, 130, 190], 50)));
  assert.notDeepEqual(warm, cool);
  assert.ok(Math.abs(readBack(warm[0]).h - readBack(cool[0]).h) > 60);
});

// The caller reads an empty array as "keep the seed colours", so a picture
// with nothing visible in it must never come back as a black wash.
test('a fully transparent picture reports nothing at all', () => {
  assert.deepEqual(paletteFromPixels(pixels(repeat([200, 30, 60, 0], 20))), []);
  assert.deepEqual(paletteFromPixels(new Uint8ClampedArray(0)), []);
});

test('a picture of exactly one colour still fills all three blobs', () => {
  const palette = paletteFromPixels(pixels(repeat([180, 40, 120], 30)));
  assert.equal(palette.length, 3);
  // The same hue three times over, told apart by the lightness band. "The
  // same" to within a degree: the three are rounded to whole bytes at three
  // different lightnesses, so they cannot land on exactly the same hue.
  const hues = palette.map((c) => readBack(c).h);
  assert.ok(Math.max(...hues) - Math.min(...hues) < 2, `hues drifted apart: ${hues.join(', ')}`);
  assert.equal(new Set(palette).size, 3, 'the three blobs must not be the same colour');
});

test('a grey picture is not reported as a colour it does not have', () => {
  const palette = paletteFromPixels(pixels(repeat([128, 128, 128], 30)));
  assert.equal(palette.length, 3);
  // Grey has no hue, so the saturation floor is what decides; what must not
  // happen is a wild colour appearing out of a picture that has none.
  for (const colour of palette) {
    const { h } = readBack(colour);
    assert.ok(h >= 0 && h < 40, `a grey picture must not turn into hue ${h}`);
  }
});

test('the two colour conversions are each other\'s inverse', () => {
  for (const [r, g, b] of [[220, 60, 40], [40, 90, 220], [12, 200, 130], [255, 255, 255], [0, 0, 0]]) {
    const round = hslToHex(rgbToHsl(r, g, b));
    const back = readBack(round);
    const again = hslToHex(back);
    assert.equal(again, round, `${r},${g},${b} did not survive the round trip`);
  }
});
