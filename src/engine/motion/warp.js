// SignalForge — build SignalRGB effects from images, gradients, shapes and particles.
// Copyright (C) 2026 Max Leopold Blumenschein
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Largest displacement the field can produce, as a multiple of amplitude.
 * The per-row and per-column coefficients below add up to exactly this on
 * both axes. Callers size their padding from it.
 */
export const WARP_PEAK_FACTOR = 2;

/**
 * Warp's equivalent of SPEED_SCALE (src/engine/motion/breathe.js): how many
 * radians of field phase one second buys per unit of speedToRate. Larger than
 * breathe's on purpose — warp's visible motion is more subtle per radian, so
 * it needs a faster phase to read as comparably fast.
 *
 * It lives beside the field it drives, and there is exactly one of it. It used
 * to be written out separately in src/engine/layers/image.js and
 * src/engine/layers/gradient.js — two copies of a number whose whole job is to
 * make "tempo 40 means the same tempo whatever is moving" true, which is
 * precisely the promise two copies quietly break.
 *
 * Like SPEED_SCALE, this is deliberately NOT the knob for making things
 * faster: it multiplies every speed alike, default included. The slider's
 * ceiling is MAX_RATE in src/engine/motion/speed.js.
 */
export const WARP_SPEED_SCALE = 2.0;

/**
 * A slow organic warp built from overlaid sine waves.
 *
 * The displacement is split into a row part and a column part, so one frame
 * costs (height + width) trig calls instead of height * width. Frequencies are
 * deliberately unrelated to each other so no visible pattern repeats.
 */
export function createWarpField(width, height) {
  const rowDX = new Float32Array(height);
  const rowDY = new Float32Array(height);
  const colDX = new Float32Array(width);
  const colDY = new Float32Array(width);

  return {
    rowDX,
    rowDY,
    colDX,
    colDY,
    update(timeSec, amplitude) {
      for (let y = 0; y < height; y += 1) {
        rowDX[y] = amplitude * (Math.sin(y * 0.055 + timeSec * 0.31)
          + 0.55 * Math.sin(y * 0.021 - timeSec * 0.19 + 1.7));
        rowDY[y] = amplitude * (0.50 * Math.cos(y * 0.037 + timeSec * 0.23 + 0.9));
      }
      for (let x = 0; x < width; x += 1) {
        colDX[x] = amplitude * (0.45 * Math.sin(x * 0.029 + timeSec * 0.13 + 2.4));
        colDY[x] = amplitude * (Math.cos(x * 0.041 - timeSec * 0.27)
          + 0.50 * Math.cos(x * 0.017 + timeSec * 0.16 + 0.4));
      }
    }
  };
}
