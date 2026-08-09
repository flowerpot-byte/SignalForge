// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import { CANVAS_WIDTH, CANVAS_HEIGHT, clamp } from '../document.js';
import { computeSourceRect } from '../util/fit.js';
import { createWarpField, WARP_PEAK_FACTOR } from '../motion/warp.js';
import { speedToRate } from '../motion/speed.js';

/**
 * speedToRate(motion.speed) maps onto this many radians per second at full
 * tilt (rate 1, i.e. speed 100) for drift and breathe. Warp gets its own,
 * larger scale below — its visible motion is more subtle per radian, so it
 * needs a faster phase to read as comparably fast.
 */
const SPEED_SCALE = 0.6;
/** Warp's equivalent of SPEED_SCALE: radians per second at full tilt. */
const WARP_SPEED_SCALE = 2.0;
/** Drift eats at most this fraction of the source rect to make room to pan. */
const DRIFT_MAX_INSET = 0.12;
/** Breathe dims by at most this fraction at full amount. */
const BREATHE_MAX_DEPTH = 0.7;

/** Warping is computed at half the canvas edge length and scaled back up. */
export const BUFFER_WIDTH = 160;
export const BUFFER_HEIGHT = 100;
/** Spare border of stretched edge pixels, so warping never pulls in blackness. */
export const BUFFER_PAD = 10;
/** Largest warp amplitude that still fits inside BUFFER_PAD. */
const MAX_AMPLITUDE = BUFFER_PAD / WARP_PEAK_FACTOR;

export function createState() {
  return { warp: null, source: null, sourceKey: null, buffer: null, bufferCtx: null, imageData: null };
}

/** Slide and shrink the source rect so the picture wanders without deforming. */
function applyDrift(rect, motion, timeSec) {
  const phase = timeSec * speedToRate(motion.speed) * SPEED_SCALE;
  const inset = (motion.amount / 100) * DRIFT_MAX_INSET;
  const insetX = rect.sw * inset;
  const insetY = rect.sh * inset;
  return {
    ...rect,
    sx: rect.sx + insetX * (1 + Math.sin(phase * 0.37 + 0.4)),
    sy: rect.sy + insetY * (1 + Math.cos(phase * 0.23 + 1.1)),
    sw: rect.sw - 2 * insetX,
    sh: rect.sh - 2 * insetY
  };
}

/** A slow swell between full brightness and BREATHE_MAX_DEPTH below it. */
function breatheFactor(motion, timeSec) {
  const phase = timeSec * speedToRate(motion.speed) * SPEED_SCALE;
  const depth = (motion.amount / 100) * BREATHE_MAX_DEPTH;
  return 1 - depth * (0.5 - 0.5 * Math.cos(phase));
}

export function render(ctx, layer, asset, timeSec, state) {
  if (!asset || !asset.element) return;

  // Each motion kind acts on a different stage of the draw (drift moves the
  // sampling window, warp distorts while sampling, breathe scales opacity),
  // so they compose regardless of order. The application order below is
  // therefore fixed by kind, deliberately NOT by the order layer.motions
  // lists them in — otherwise the same three entries would render
  // differently depending on how the user happened to sort them, which
  // would be a surprising, undocumented dependency on list order.
  const motions = Array.isArray(layer.motions) ? layer.motions : [];
  const drift = motions.find((m) => m.kind === 'drift') ?? null;
  const warp = motions.find((m) => m.kind === 'warp') ?? null;
  const breathe = motions.find((m) => m.kind === 'breathe') ?? null;

  const previousAlpha = ctx.globalAlpha;
  if (breathe) {
    ctx.globalAlpha = clamp(previousAlpha * breatheFactor(breathe, timeSec), 0, 1);
  }

  if (warp) {
    renderWarped(ctx, layer, asset, timeSec, state, warp, drift);
  } else {
    let rect = computeSourceRect({
      srcW: asset.width,
      srcH: asset.height,
      dstW: CANVAS_WIDTH,
      dstH: CANVAS_HEIGHT,
      fit: layer.fit,
      offsetX: layer.offset.x,
      offsetY: layer.offset.y
    });
    if (drift) rect = applyDrift(rect, drift, timeSec);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(asset.element, rect.sx, rect.sy, rect.sw, rect.sh, rect.dx, rect.dy, rect.dw, rect.dh);
  }

  ctx.globalAlpha = previousAlpha;
}

/**
 * Draw the visible part of the picture into a padded buffer.
 *
 * The padding is real image content wherever the picture extends past the
 * crop, and stretched edge pixels where it does not. Warping then has
 * something to reach into instead of pulling black in from outside.
 */
function buildSource(asset, layer, state) {
  const key = `${layer.asset}|${layer.fit}|${layer.offset.x}|${layer.offset.y}|${asset.width}x${asset.height}`;
  if (state.sourceKey === key && state.source) return state.source;

  const width = BUFFER_WIDTH + 2 * BUFFER_PAD;
  const height = BUFFER_HEIGHT + 2 * BUFFER_PAD;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext('2d', { willReadFrequently: true });
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  g.fillStyle = '#000';
  g.fillRect(0, 0, width, height);

  const rect = computeSourceRect({
    srcW: asset.width,
    srcH: asset.height,
    dstW: BUFFER_WIDTH,
    dstH: BUFFER_HEIGHT,
    fit: layer.fit,
    offsetX: layer.offset.x,
    offsetY: layer.offset.y
  });

  // How many source pixels one buffer pixel is worth.
  const scaleX = rect.sw / rect.dw;
  const scaleY = rect.sh / rect.dh;

  // Reach BUFFER_PAD buffer pixels further out, then clamp to the real image.
  const wantX = rect.sx - BUFFER_PAD * scaleX;
  const wantY = rect.sy - BUFFER_PAD * scaleY;
  const wantW = rect.sw + 2 * BUFFER_PAD * scaleX;
  const wantH = rect.sh + 2 * BUFFER_PAD * scaleY;

  const gotX = Math.max(0, wantX);
  const gotY = Math.max(0, wantY);
  const gotW = Math.min(asset.width, wantX + wantW) - gotX;
  const gotH = Math.min(asset.height, wantY + wantH) - gotY;

  // Anchor on the crop origin, NOT on the want origin. A source pixel s sits at
  // BUFFER_PAD + rect.d? + (s - rect.s?) / scale — that is what puts the crop
  // itself at BUFFER_PAD and lets whatever real content exists beyond it spill
  // into the padding. Measuring from wantX instead shifts everything by one
  // BUFFER_PAD and, in cover mode, pushes the right edge off the buffer.
  const destX = BUFFER_PAD + rect.dx + (gotX - rect.sx) / scaleX;
  const destY = BUFFER_PAD + rect.dy + (gotY - rect.sy) / scaleY;
  const destW = gotW / scaleX;
  const destH = gotH / scaleY;

  g.drawImage(asset.element, gotX, gotY, gotW, gotH, destX, destY, destW, destH);

  // Fill whatever padding the picture did not reach by stretching its edges.
  const left = Math.max(0, Math.ceil(destX));
  const top = Math.max(0, Math.ceil(destY));
  const right = Math.min(width, Math.floor(destX + destW));
  const bottom = Math.min(height, Math.floor(destY + destH));
  const innerW = Math.max(1, right - left);
  const innerH = Math.max(1, bottom - top);

  if (top > 0) g.drawImage(canvas, left, top, innerW, 1, left, 0, innerW, top);
  if (bottom < height) g.drawImage(canvas, left, bottom - 1, innerW, 1, left, bottom, innerW, height - bottom);
  if (left > 0) g.drawImage(canvas, left, 0, 1, height, 0, 0, left, height);
  if (right < width) g.drawImage(canvas, right - 1, 0, 1, height, right, 0, width - right, height);

  const source = { data: g.getImageData(0, 0, width, height).data, width, height };
  state.source = source;
  state.sourceKey = key;
  return source;
}

function renderWarped(ctx, layer, asset, timeSec, state, warp, drift) {
  const source = buildSource(asset, layer, state);

  if (!state.buffer) {
    state.buffer = document.createElement('canvas');
    state.buffer.width = BUFFER_WIDTH;
    state.buffer.height = BUFFER_HEIGHT;
    state.bufferCtx = state.buffer.getContext('2d', { willReadFrequently: true });
    state.imageData = state.bufferCtx.createImageData(BUFFER_WIDTH, BUFFER_HEIGHT);
  }
  if (!state.warp) state.warp = createWarpField(BUFFER_WIDTH, BUFFER_HEIGHT);

  // The padded buffer only has BUFFER_PAD pixels of margin, and warp alone at
  // full amplitude already uses all of it (WARP_PEAK_FACTOR * MAX_AMPLITUDE
  // === BUFFER_PAD). Adding drift on top would sample past the edge, so when
  // both are active each gets only half the padding budget.
  const headroom = drift ? 0.5 : 1;
  const amplitude = (warp.amount / 100) * MAX_AMPLITUDE * headroom;
  const phase = timeSec * speedToRate(warp.speed) * WARP_SPEED_SCALE;
  state.warp.update(phase, amplitude);

  // Drift shifts the sampling window inside the padded buffer instead of
  // moving the crop, so the cached buffer stays valid across frames.
  let driftX = 0;
  let driftY = 0;
  if (drift) {
    const phase = timeSec * speedToRate(drift.speed) * SPEED_SCALE;
    const reach = (drift.amount / 100) * (BUFFER_PAD * 0.5);
    driftX = reach * Math.sin(phase * 0.37 + 0.4);
    driftY = reach * Math.cos(phase * 0.23 + 1.1);
  }

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
