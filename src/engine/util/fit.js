// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max Leopold Blumenschein
// SPDX-License-Identifier: GPL-3.0-or-later
import { clamp } from '../document.js';

/**
 * Work out which part of a source image goes where on the canvas.
 * Returns the eight values ctx.drawImage() wants in its nine-argument form.
 *
 * offsetX / offsetY run from -1 to +1 and slide the crop window across the
 * slack that cropping leaves over. They do nothing when there is no slack.
 */
export function computeSourceRect({ srcW, srcH, dstW, dstH, fit = 'cover', offsetX = 0, offsetY = 0 }) {
  if (!(srcW > 0 && srcH > 0 && dstW > 0 && dstH > 0)) {
    throw new Error('computeSourceRect: all sizes must be positive');
  }

  if (fit === 'stretch') {
    return { sx: 0, sy: 0, sw: srcW, sh: srcH, dx: 0, dy: 0, dw: dstW, dh: dstH };
  }

  const srcAspect = srcW / srcH;
  const dstAspect = dstW / dstH;

  if (fit === 'contain') {
    let dw;
    let dh;
    if (srcAspect > dstAspect) {
      dw = dstW;
      dh = dstW / srcAspect;
    } else {
      dh = dstH;
      dw = dstH * srcAspect;
    }
    return { sx: 0, sy: 0, sw: srcW, sh: srcH, dx: (dstW - dw) / 2, dy: (dstH - dh) / 2, dw, dh };
  }

  // cover
  let sw;
  let sh;
  if (srcAspect > dstAspect) {
    sh = srcH;
    sw = srcH * dstAspect;
  } else {
    sw = srcW;
    sh = srcW / dstAspect;
  }

  const slackX = srcW - sw;
  const slackY = srcH - sh;
  const sx = (slackX * (clamp(offsetX, -1, 1) + 1)) / 2;
  const sy = (slackY * (clamp(offsetY, -1, 1) + 1)) / 2;

  return { sx, sy, sw, sh, dx: 0, dy: 0, dw: dstW, dh: dstH };
}
