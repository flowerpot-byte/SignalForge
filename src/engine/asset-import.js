// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import { CANVAS_HEIGHT } from './document.js';

/**
 * How hard the JPEG encoder is pushed for pictures that have no transparency.
 *
 * Measured, not guessed (numbers in docs/erkenntnisse-signalrgb-motor.md): on
 * Max' screenshot the embedded bytes drop from 139,900 to 15,656 base64
 * characters, on a photo from 67,884 to 8,744. The price, measured on the
 * finished 320x200 frame rather than on the source picture, is at most 9/255
 * on any one channel and under 0.9/255 on average — far below anything an LED
 * can show. Going down to 0.85 would save another ~4 KB but quadruples the
 * number of noticeably different pixels; going up to 0.95 costs about a
 * quarter more bytes for another 0.1/255. So 0.92.
 */
export const JPEG_QUALITY = 0.92;

/**
 * Whether an RGBA pixel buffer genuinely uses transparency.
 *
 * The question matters because JPEG has no alpha: a picture that really is
 * see-through has to stay PNG or it would come out on a black background.
 * But an alpha *channel* is not transparency — most screenshots carry one in
 * which every single pixel is 255, and treating those as transparent would
 * throw the whole saving away on exactly the pictures Max feeds this thing.
 * So this reads the actual pixels instead of the file's colour type.
 */
export function hasTransparentPixel(data) {
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 255) return true;
  }
  return false;
}

/**
 * Shrink a picture down to what a 320x200 canvas can actually show and
 * soften the worst compression blocking.
 *
 * Height is what matters: 'cover' scales to fill the height, so anything
 * taller than the canvas is wasted bytes in the effect file.
 *
 * The result is embedded as JPEG unless the picture really is see-through,
 * in which case it stays PNG — see hasTransparentPixel above.
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

  // Ask about transparency on an UNBLURRED draw, and only then blur.
  //
  // The blur is the reason this cannot be read off the finished canvas: it
  // samples outside the picture, so it lays a soft, half-transparent halo
  // around all four edges. Measured on Max' screenshot — a picture without a
  // single see-through pixel — that halo alone is 4,086 of 97,400 pixels, with
  // alpha down to 101. Judging by the blurred canvas would therefore call
  // every picture transparent and never reach JPEG at all.
  //
  // Scaling itself is safe to judge on: shrinking an opaque picture never
  // produces alpha below 255 (measured), and one genuinely transparent pixel
  // in a 2000x1200 image still shows up as alpha 249 after being scaled to
  // 333x200.
  ctx.drawImage(image, 0, 0, width, height);
  const transparent = hasTransparentPixel(ctx.getImageData(0, 0, width, height).data);

  if (blur > 0) {
    // clearRect first: the blurred draw is source-over and would otherwise
    // composite on top of the sharp one above.
    ctx.clearRect(0, 0, width, height);
    ctx.filter = `blur(${blur}px)`;
    ctx.drawImage(image, 0, 0, width, height);
    ctx.filter = 'none';
  }

  const mime = transparent ? 'image/png' : 'image/jpeg';
  const out = transparent
    ? canvas.toDataURL('image/png')
    : canvas.toDataURL('image/jpeg', JPEG_QUALITY);

  return {
    kind: 'image',
    mime,
    data: out.slice(out.indexOf(',') + 1),
    width,
    height
  };
}
