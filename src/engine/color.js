// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later

/** Rec. 601 luma weights — the same ones the eye-weighted grey uses. */
const LUMA_R = 0.299;
const LUMA_G = 0.587;
const LUMA_B = 0.114;

/** Largest push either colour axis can apply, in 0..255 units at full tilt. */
const AXIS_REACH = 40;

export const NEUTRAL_COLOR = Object.freeze({ saturation: 100, greenMagenta: 0, blueYellow: 0 });

/** True when the settings would leave every pixel exactly as it is. */
export function isNeutral(color) {
  return color.saturation === 100 && color.greenMagenta === 0 && color.blueYellow === 0;
}

/**
 * Adjust an RGBA buffer in place.
 *
 * Saturation pulls each pixel towards or away from its own grey, so a grey
 * pixel can never gain colour and brightness is preserved.
 *
 * The two axes are the pairs a photo editor offers: green against magenta,
 * and blue against yellow. Each moves one channel one way and the other two
 * the other way by half as much, which keeps the overall brightness roughly
 * where it was instead of darkening the picture as you tint it.
 *
 * Alpha is never touched. ctx.filter is deliberately not used: it does not
 * exist on SignalRGB's browser (measured — see docs/erkenntnisse-signalrgb-motor.md).
 */
export function adjustColor(data, color) {
  if (isNeutral(color)) return;

  const sat = color.saturation / 100;
  const gm = (color.greenMagenta / 100) * AXIS_REACH;
  const by = (color.blueYellow / 100) * AXIS_REACH;

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];

    if (sat !== 1) {
      const grey = LUMA_R * r + LUMA_G * g + LUMA_B * b;
      r = grey + (r - grey) * sat;
      g = grey + (g - grey) * sat;
      b = grey + (b - grey) * sat;
    }

    if (gm !== 0) {
      g -= gm;
      r += gm / 2;
      b += gm / 2;
    }
    if (by !== 0) {
      b -= by;
      r += by / 2;
      g += by / 2;
    }

    // Uint8ClampedArray clamps on write, so no manual clamping is needed.
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
  }
}
