// SignalForge — build SignalRGB effects from images, gradients, shapes and particles.
// Copyright (C) 2026 Max Leopold Blumenschein
// SPDX-License-Identifier: GPL-3.0-or-later

/** Rec. 601 luma weights — the same ones the eye-weighted grey uses. */
const LUMA_R = 0.299;
const LUMA_G = 0.587;
const LUMA_B = 0.114;

/** Largest push either colour axis can apply, in 0..255 units at full tilt. */
const AXIS_REACH = 40;

export const NEUTRAL_COLOR = Object.freeze({
  saturation: 100, greenMagenta: 0, blueYellow: 0, hue: 0
});

/**
 * The hue rotation a colour setting asks for, in degrees 0..360.
 *
 * Read through one function by both isNeutral and adjustColor, so the two can
 * never disagree about what a given `hue` means — an angle one of them called
 * neutral and the other did not would be a pass that skips the pixel loop and
 * a loop that would have changed every pixel, or the other way round.
 *
 * A missing `hue` is 0 rather than NaN: every caller that predates the hue axis
 * hands over an object with three fields, and those must go on being neutral
 * (test/engine/color.test.js does exactly that). A hue that is not a finite
 * number is 0 too — the alternative is Math.cos(NaN), which would turn every
 * pixel of the frame black.
 */
function hueOf(color) {
  const degrees = Number(color.hue);
  if (!Number.isFinite(degrees)) return 0;
  return ((degrees % 360) + 360) % 360;
}

/** True when the settings would leave every pixel exactly as it is. */
export function isNeutral(color) {
  return color.saturation === 100 && color.greenMagenta === 0 && color.blueYellow === 0
    && hueOf(color) === 0;
}

/**
 * The three numbers a hue rotation needs, for an angle in degrees.
 *
 * WHAT THIS ROTATES ABOUT, AND WHY NOT THE OTHER ONE
 *
 * Turning every hue in a picture is a rotation of RGB space about the grey
 * diagonal (1, 1, 1) — the line every grey lies on. Rodrigues' formula for a
 * rotation about that axis collapses to three coefficients, because the axis is
 * symmetric in the three channels:
 *
 *   a = cos + (1 - cos)/3            the channel's own share
 *   b = (1 - cos)/3 - sin/sqrt(3)    the share it takes from the one below it
 *   c = (1 - cos)/3 + sin/sqrt(3)    the share it takes from the one above it
 *
 * and the matrix is those three, cycled: r' = a*r + b*g + c*b, g' = c*r + a*g +
 * b*b, b' = b*r + c*g + a*b. Nine multiplies and six adds per pixel, with the
 * three coefficients computed once per frame — which is the whole reason this
 * is a matrix and not the RGB->HSL->RGB round trip eight effects in
 * docs/effekt-inventur.md copy from each other. They convert a handful of
 * CONTROL colours per frame and can afford it; this runs over all 64000 pixels.
 *
 * Two properties are worth having in writing, because both were the reason for
 * choosing this rotation over the other candidate:
 *
 *  1. a + b + c = cos + (1 - cos) = 1, exactly, at every angle. So grey stays
 *     grey to the last bit, and the sum r + g + b is preserved — the picture
 *     cannot get brighter or darker as the hue turns, which on a light strip is
 *     the difference between a colour cycle and a flicker.
 *  2. At 120 degrees a, b, c come to exactly 0, 0, 1: the channels are simply
 *     swapped round, so red becomes green, green becomes blue and blue becomes
 *     red — no approximation at all. The same at 240.
 *
 * The candidate NOT taken is the matrix CSS `hue-rotate` and SVG's
 * feColorMatrix use, which rotates about the LUMA axis instead (0.213, 0.715,
 * 0.072). It preserves luma rather than the channel sum, and the price is that
 * it is openly an approximation: red at 120 degrees comes out a dark green
 * roughly half as far round the wheel as asked for. For a control whose whole
 * job is "put the picture's colours somewhere else", landing where it was
 * asked to land matters more than holding a weighted brightness constant.
 *
 * THE COST IS CLIPPING, AND IT IS THE SAME COST BRIGHTNESS ALREADY PAYS. A
 * fully saturated colour sits on the surface of the RGB cube, and turning it
 * about the grey axis can take it outside — pure red at 60 degrees wants
 * (170, 170, -85), i.e. yellow with a negative blue. Uint8ClampedArray clamps
 * that on write, so it lands on (170, 170, 0): the right hue, less bright than
 * a fully saturated yellow would be. There is nothing above full power on an
 * LED either, so this is the honest answer rather than a compromise.
 */
export function hueCoefficients(degrees) {
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const share = (1 - cos) / 3;
  const swing = Math.sin(radians) / Math.sqrt(3);
  return { a: cos + share, b: share - swing, c: share + swing };
}

/**
 * Adjust an RGBA buffer in place.
 *
 * Hue turns every colour in the frame the same way round the wheel — see
 * hueCoefficients above for what it rotates about and what it costs.
 *
 * Saturation pulls each pixel towards or away from its own grey, so a grey
 * pixel can never gain colour and brightness is preserved.
 *
 * The two axes are the pairs a photo editor offers: green against magenta,
 * and blue against yellow. Each moves one channel one way and the other two
 * the other way by half as much, which keeps the overall brightness roughly
 * where it was instead of darkening the picture as you tint it.
 *
 * THE ORDER IS HUE, THEN SATURATION, THEN THE TWO AXES, and it is not
 * arbitrary: the hue is what the picture's colour IS and the other three are a
 * grade applied to it, exactly the order somebody would name them out loud.
 * They do not commute — saturation measures each pixel's distance from its own
 * Rec. 601 grey, and the hue rotation does not preserve that grey (it preserves
 * the plain channel sum instead), so grading first and turning afterwards would
 * grade a colour nobody asked to see.
 *
 * All three run on one set of floating-point channels and are written back
 * once, at the end. Nothing is clamped in between on purpose: a hue rotation
 * that pushes a saturated colour just outside the cube (see hueCoefficients)
 * is often pulled back inside by the saturation step that follows it, and
 * rounding to a byte in the middle would have thrown that away.
 *
 * Alpha is never touched. ctx.filter is deliberately not used: it does not
 * exist on SignalRGB's browser (measured — see docs/erkenntnisse-signalrgb-motor.md).
 */
export function adjustColor(data, color) {
  if (isNeutral(color)) return;

  const hue = hueOf(color);
  const { a: ha, b: hb, c: hc } = hueCoefficients(hue);
  const sat = color.saturation / 100;
  const gm = (color.greenMagenta / 100) * AXIS_REACH;
  const by = (color.blueYellow / 100) * AXIS_REACH;

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];

    if (hue !== 0) {
      const turnedR = ha * r + hb * g + hc * b;
      const turnedG = hc * r + ha * g + hb * b;
      const turnedB = hb * r + hc * g + ha * b;
      r = turnedR;
      g = turnedG;
      b = turnedB;
    }

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
