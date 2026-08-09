// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import { CANVAS_HEIGHT } from './document.js';

/**
 * Shrink a picture down to what a 320x200 canvas can actually show and
 * soften the worst compression blocking.
 *
 * Height is what matters: 'cover' scales to fill the height, so anything
 * taller than the canvas is wasted bytes in the effect file.
 */
export async function prepareImageAsset(dataUrl, { maxHeight = CANVAS_HEIGHT, blur = 1.4 } = {}) {
  const image = await new Promise((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error('could not decode image'));
    element.src = dataUrl;
  });

  const scale = Math.min(1, maxHeight / image.naturalHeight);
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  if (blur > 0) ctx.filter = `blur(${blur}px)`;
  ctx.drawImage(image, 0, 0, width, height);
  ctx.filter = 'none';

  const out = canvas.toDataURL('image/png');
  return {
    kind: 'image',
    mime: 'image/png',
    data: out.slice(out.indexOf(',') + 1),
    width,
    height
  };
}
