// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max Leopold Blumenschein
// SPDX-License-Identifier: GPL-3.0-or-later
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../document.js';
import { createWarpField, WARP_PEAK_FACTOR } from '../motion/warp.js';

/**
 * The half-resolution warping machinery, shared by every layer type that can
 * be warped.
 *
 * It used to live inside layers/image.js and was the picture layer's private
 * business. The gradient layer needs exactly the same thing — a padded source
 * buffer, a wave field, a bilinear resample, one scaled draw — so it is here
 * rather than written a second time: the two would otherwise drift apart in
 * the way that matters most, which is that "warp at strength 60" would stop
 * meaning the same amount of bend in the two places.
 *
 * What is NOT here is where the source pixels come from, because that is the
 * one genuinely different part: the picture layer builds its buffer out of the
 * cropped image plus stretched edge pixels, the gradient layer simply paints
 * the gradient across the padded area, where the padding is the gradient's own
 * natural continuation and needs no edge trick at all.
 */

/** Warping is computed at half the canvas edge length and scaled back up. */
export const BUFFER_WIDTH = 160;
export const BUFFER_HEIGHT = 100;
/** Spare border around the buffer, so warping never pulls in blackness. */
export const BUFFER_PAD = 10;
/** Largest warp amplitude that still fits inside BUFFER_PAD. */
export const MAX_AMPLITUDE = BUFFER_PAD / WARP_PEAK_FACTOR;

/** How many canvas pixels one buffer pixel is worth. */
export const BUFFER_SCALE = BUFFER_WIDTH / CANVAS_WIDTH;

/** The full size of a padded source buffer. */
export const SOURCE_WIDTH = BUFFER_WIDTH + 2 * BUFFER_PAD;
export const SOURCE_HEIGHT = BUFFER_HEIGHT + 2 * BUFFER_PAD;

/**
 * The scratch a warped layer needs, made once and kept on the layer's state.
 * A layer type's createState() may return a bare object; these three fields
 * are filled in on the first warped frame and reused for every one after it.
 */
export function ensureWarpTarget(state) {
  if (!state.buffer) {
    state.buffer = document.createElement('canvas');
    state.buffer.width = BUFFER_WIDTH;
    state.buffer.height = BUFFER_HEIGHT;
    state.bufferCtx = state.buffer.getContext('2d', { willReadFrequently: true });
    state.imageData = state.bufferCtx.createImageData(BUFFER_WIDTH, BUFFER_HEIGHT);
  }
  if (!state.warp) state.warp = createWarpField(BUFFER_WIDTH, BUFFER_HEIGHT);
  return state;
}

/**
 * Warp `source` onto the whole canvas.
 *
 * `source` is `{ data, width, height }` — the padded buffer's RGBA bytes, as
 * getImageData hands them over. `amplitude` and `phase` are the caller's, so
 * each layer type keeps its own feel; `driftX` / `driftY` shift the sampling
 * window inside the padding, which is how a drifting layer moves without its
 * cached buffer having to be rebuilt.
 */
export function drawWarped(ctx, state, source, { amplitude, phase, driftX = 0, driftY = 0 }) {
  ensureWarpTarget(state);
  state.warp.update(phase, amplitude);

  const { rowDX, rowDY, colDX, colDY } = state.warp;
  const src = source.data;
  const srcW = source.width;
  const out = state.imageData.data;
  const maxX = srcW - 1.001;
  const maxY = source.height - 1.001;
  let o = 0;

  for (let y = 0; y < BUFFER_HEIGHT; y += 1) {
    const rdx = rowDX[y];
    const rdy = rowDY[y];
    const baseY = y + BUFFER_PAD;
    for (let x = 0; x < BUFFER_WIDTH; x += 1) {
      let sx = x + BUFFER_PAD + driftX + rdx + colDX[x];
      let sy = baseY + driftY + rdy + colDY[x];
      if (sx < 0) sx = 0; else if (sx > maxX) sx = maxX;
      if (sy < 0) sy = 0; else if (sy > maxY) sy = maxY;

      const x0 = sx | 0;
      const y0 = sy | 0;
      const fx = sx - x0;
      const fy = sy - y0;
      const gx = 1 - fx;
      const gy = 1 - fy;

      const i00 = (y0 * srcW + x0) * 4;
      const i10 = i00 + 4;
      const i01 = i00 + srcW * 4;
      const i11 = i01 + 4;
      const w00 = gx * gy;
      const w10 = fx * gy;
      const w01 = gx * fy;
      const w11 = fx * fy;

      out[o] = src[i00] * w00 + src[i10] * w10 + src[i01] * w01 + src[i11] * w11;
      out[o + 1] = src[i00 + 1] * w00 + src[i10 + 1] * w10 + src[i01 + 1] * w01 + src[i11 + 1] * w11;
      out[o + 2] = src[i00 + 2] * w00 + src[i10 + 2] * w10 + src[i01 + 2] * w01 + src[i11 + 2] * w11;
      out[o + 3] = 255;
      o += 4;
    }
  }

  state.bufferCtx.putImageData(state.imageData, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(state.buffer, 0, 0, BUFFER_WIDTH, BUFFER_HEIGHT, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
}
