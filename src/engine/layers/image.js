// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import { CANVAS_WIDTH, CANVAS_HEIGHT, clamp } from '../document.js';
import { computeSourceRect } from '../util/fit.js';

/** Motion speed 0..100 maps onto this many radians per second at full tilt. */
const SPEED_SCALE = 0.6;
/** Drift eats at most this fraction of the source rect to make room to pan. */
const DRIFT_MAX_INSET = 0.12;
/** Breathe dims by at most this fraction at full amount. */
const BREATHE_MAX_DEPTH = 0.7;

export function createState() {
  return { warp: null, source: null, sourceKey: null, buffer: null, bufferCtx: null, imageData: null };
}

/** Slide and shrink the source rect so the picture wanders without deforming. */
function applyDrift(rect, motion, timeSec) {
  const phase = timeSec * (motion.speed / 100) * SPEED_SCALE;
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
  const phase = timeSec * (motion.speed / 100) * SPEED_SCALE;
  const depth = (motion.amount / 100) * BREATHE_MAX_DEPTH;
  return 1 - depth * (0.5 - 0.5 * Math.cos(phase));
}

export function render(ctx, layer, asset, timeSec, state) {
  if (!asset || !asset.element) return;

  const motion = layer.motion ?? { kind: 'none', speed: 15, amount: 30 };

  if (motion.kind === 'warp') {
    renderWarped(ctx, layer, asset, timeSec, state, motion);
    return;
  }

  let rect = computeSourceRect({
    srcW: asset.width,
    srcH: asset.height,
    dstW: CANVAS_WIDTH,
    dstH: CANVAS_HEIGHT,
    fit: layer.fit,
    offsetX: layer.offset.x,
    offsetY: layer.offset.y
  });

  if (motion.kind === 'drift') rect = applyDrift(rect, motion, timeSec);

  const previousAlpha = ctx.globalAlpha;
  if (motion.kind === 'breathe') {
    ctx.globalAlpha = clamp(previousAlpha * breatheFactor(motion, timeSec), 0, 1);
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(asset.element, rect.sx, rect.sy, rect.sw, rect.sh, rect.dx, rect.dy, rect.dw, rect.dh);

  ctx.globalAlpha = previousAlpha;
}

/** Filled in by Task 7. Until then warp falls back to a still picture. */
function renderWarped(ctx, layer, asset, timeSec, state, motion) {
  const rect = computeSourceRect({
    srcW: asset.width,
    srcH: asset.height,
    dstW: CANVAS_WIDTH,
    dstH: CANVAS_HEIGHT,
    fit: layer.fit,
    offsetX: layer.offset.x,
    offsetY: layer.offset.y
  });
  ctx.drawImage(asset.element, rect.sx, rect.sy, rect.sw, rect.sh, rect.dx, rect.dy, rect.dw, rect.dh);
}
