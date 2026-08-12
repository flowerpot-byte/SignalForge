// SignalForge — build SignalRGB effects from images, gradients, shapes and particles.
// Copyright (C) 2026 Max Leopold Blumenschein
// SPDX-License-Identifier: GPL-3.0-or-later

/** Decode the base64 RGBA blob the harness page returns. */
export function decodePixels(base64) {
  return new Uint8Array(Buffer.from(base64, 'base64'));
}

export function pixelAt(pixels, width, x, y) {
  const i = (y * width + x) * 4;
  return { r: pixels[i], g: pixels[i + 1], b: pixels[i + 2], a: pixels[i + 3] };
}

export function meanBrightness(pixels) {
  let sum = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    sum += (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3;
  }
  return sum / (pixels.length / 4);
}

/** Largest per-channel difference between two equally sized frames. */
export function maxDifference(a, b) {
  if (a.length !== b.length) throw new Error('maxDifference: frames differ in size');
  let max = 0;
  for (let i = 0; i < a.length; i += 1) {
    const d = Math.abs(a[i] - b[i]);
    if (d > max) max = d;
  }
  return max;
}

/** Mean per-channel difference. Small values mean "visually identical". */
export function meanDifference(a, b) {
  if (a.length !== b.length) throw new Error('meanDifference: frames differ in size');
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) sum += Math.abs(a[i] - b[i]);
  return sum / a.length;
}

/**
 * The share of the frame that is pure black, 0..1.
 *
 * Pure black is what the renderer fills the frame with before any layer draws
 * on it (`ctx.fillStyle = '#000'` in createRenderer), so a pixel that is still
 * exactly 0,0,0 is a pixel no layer covered. That makes this the measurement
 * for "did the shape reach the whole canvas" — exactly, not approximately: a
 * layer whose own darkest colour is #000000 would count here too, which is why
 * the checks that use it are drawn in colours that are nowhere near it.
 */
export function blackShare(pixels) {
  let black = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i] === 0 && pixels[i + 1] === 0 && pixels[i + 2] === 0) black += 1;
  }
  return black / (pixels.length / 4);
}

/** True when the colour is within tolerance of the expected one. */
export function isColour(actual, expected, tolerance = 12) {
  return Math.abs(actual.r - expected[0]) <= tolerance
    && Math.abs(actual.g - expected[1]) <= tolerance
    && Math.abs(actual.b - expected[2]) <= tolerance;
}
