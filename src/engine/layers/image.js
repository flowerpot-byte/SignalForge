// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max Leopold Blumenschein
// SPDX-License-Identifier: GPL-3.0-or-later
import { CANVAS_WIDTH, CANVAS_HEIGHT, clamp } from '../document.js';
import { computeSourceRect } from '../util/fit.js';
import { speedToRate } from '../motion/speed.js';
import { breatheFactor, motionPhase } from '../motion/breathe.js';
import { pulseFactor } from '../motion/pulse.js';
import { WARP_SPEED_SCALE } from '../motion/warp.js';
import {
  BUFFER_WIDTH, BUFFER_HEIGHT, BUFFER_PAD, MAX_AMPLITUDE, drawWarped
} from './warp-buffer.js';

/** Drift eats at most this fraction of the source rect to make room to pan. */
const DRIFT_MAX_INSET = 0.12;

// Re-exported because this module's own tests and comments have always named
// them here; the numbers themselves now live in warp-buffer.js, shared with
// every other layer type that can be warped.
export { BUFFER_WIDTH, BUFFER_HEIGHT, BUFFER_PAD };

export function createState() {
  return { warp: null, source: null, sourceKey: null, buffer: null, bufferCtx: null, imageData: null };
}

/** Slide and shrink the source rect so the picture wanders without deforming. */
function applyDrift(rect, motion, timeSec) {
  const phase = motionPhase(motion, timeSec);
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

export function render(ctx, layer, asset, timeSec, state) {
  if (!asset || !asset.element) return;

  // Each motion kind acts on a different stage of the draw (drift moves the
  // sampling window, warp distorts while sampling, pulse and breathe scale
  // opacity), so they compose regardless of order. The application order below
  // is therefore fixed by kind, deliberately NOT by the order layer.motions
  // lists them in — otherwise the same entries would render differently
  // depending on how the user happened to sort them, which would be a
  // surprising, undocumented dependency on list order.
  //
  // The whole-project order is spin -> drift -> warp -> pulse -> breathe (it
  // is written out in full in src/engine/layers/gradient.js). Spin is missing
  // from this file on purpose and not by omission: a picture cannot be turned
  // inside its own frame without either showing its corners or being cropped
  // to 28 % of what the user chose, so it is not offered on this layer type at
  // all — see IMAGE_MOTION_KINDS in src/engine/document.js. A spin entry that
  // reaches here anyway (a hand-edited project) renders as nothing, exactly
  // like a "none" entry, which is the same treatment a drift gets on a solid.
  const motions = Array.isArray(layer.motions) ? layer.motions : [];
  const drift = motions.find((m) => m.kind === 'drift') ?? null;
  const warp = motions.find((m) => m.kind === 'warp') ?? null;
  const pulse = motions.find((m) => m.kind === 'pulse') ?? null;
  const breathe = motions.find((m) => m.kind === 'breathe') ?? null;

  const previousAlpha = ctx.globalAlpha;
  let alpha = previousAlpha;
  if (pulse) alpha *= pulseFactor(pulse, timeSec);
  if (breathe) alpha *= breatheFactor(breathe, timeSec);
  if (alpha !== previousAlpha) ctx.globalAlpha = clamp(alpha, 0, 1);

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

  // The padded buffer only has BUFFER_PAD pixels of margin, and warp alone at
  // full amplitude already uses all of it (WARP_PEAK_FACTOR * MAX_AMPLITUDE
  // === BUFFER_PAD). Adding drift on top would sample past the edge, so when
  // both are active each gets only half the padding budget.
  const headroom = drift ? 0.5 : 1;
  const amplitude = (warp.amount / 100) * MAX_AMPLITUDE * headroom;
  const phase = timeSec * speedToRate(warp.speed) * WARP_SPEED_SCALE;

  // Drift shifts the sampling window inside the padded buffer instead of
  // moving the crop, so the cached buffer stays valid across frames.
  let driftX = 0;
  let driftY = 0;
  if (drift) {
    const driftAt = motionPhase(drift, timeSec);
    const reach = (drift.amount / 100) * (BUFFER_PAD * 0.5);
    driftX = reach * Math.sin(driftAt * 0.37 + 0.4);
    driftY = reach * Math.cos(driftAt * 0.23 + 1.1);
  }

  drawWarped(ctx, state, source, { amplitude, phase, driftX, driftY });
}
