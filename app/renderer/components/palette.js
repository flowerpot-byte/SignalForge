// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * The colours the backdrop takes from the picture that was imported.
 *
 * This is the idea the whole look rests on: the window is made of glass so
 * that what is behind the glass can be the effect being edited. Until now
 * mountBackdrop was called once with three fixed seeds and never again, which
 * left the glass showing nothing but itself — cost with no reason.
 *
 * Two halves, split so the arithmetic can be checked without a browser:
 * paletteFromPixels() below is pure and takes raw RGBA bytes;
 * samplePalette() is the six lines that need a DOM to produce them.
 */

/** How many hue buckets the wheel is cut into when looking for the main colours. */
const BUCKETS = 12;

/**
 * The size the picture is scaled down to before it is looked at. Small on
 * purpose: this runs once per import, and 48 x 30 is 1440 pixels — enough to
 * know what colour a picture is, few enough that the cost never shows.
 */
export const SAMPLE_WIDTH = 48;
export const SAMPLE_HEIGHT = 30;

/**
 * The band the sampled colours are pulled into, in HSL.
 *
 * The hue comes from the picture; the lightness does not, and that is the
 * point. The blobs sit behind translucent panels, and a picture of a snowy
 * field would otherwise raise the panel surface far enough to take
 * --text-muted below the 4.5:1 it has to keep (measured: 3.5:1 before this
 * clamp existed). Fixing the lightness makes the contrast a property of the
 * stylesheet again rather than of whatever the user dropped in. It also
 * simply looks better: a bright wash behind frosted glass reads as a smear,
 * a dark one reads as depth.
 *
 * Three slightly different lightnesses rather than one, so the three blobs
 * stay distinguishable where they overlap.
 */
const LIGHTNESS = [0.30, 0.24, 0.34];
const MIN_SATURATION = 0.28;
/* The ceiling is low on purpose. The backdrop is blurred and then saturated
   again by the filter over it (see #backdrop in styles/app.css), so a fully
   saturated blob comes out as a poster paint rather than as a tint, and the
   picture stops being the most colourful thing in the window. */
const MAX_SATURATION = 0.55;

const clamp01 = (value) => (value < 0 ? 0 : value > 1 ? 1 : value);

/** 0..255 per channel -> { h: 0..360, s: 0..1, l: 0..1 }. */
export function rgbToHsl(r, g, b) {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const l = (max + min) / 2;
  const span = max - min;
  if (span === 0) return { h: 0, s: 0, l };
  const s = span / (1 - Math.abs(2 * l - 1));
  let h;
  if (max === red) h = ((green - blue) / span) % 6;
  else if (max === green) h = (blue - red) / span + 2;
  else h = (red - green) / span + 4;
  h *= 60;
  return { h: h < 0 ? h + 360 : h, s, l };
}

/** { h, s, l } -> "#rrggbb". */
export function hslToHex({ h, s, l }) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x]
    : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  const hex = (value) => Math.round(clamp01(value + m) * 255).toString(16).padStart(2, '0');
  // Built from computed numbers rather than written out: a colour that comes
  // from the user's own picture cannot live in tokens.css, and there is no
  // literal here for test/app/color-literals.test.js to find.
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

/**
 * The `count` colours a picture is mostly made of, as "#rrggbb" strings.
 *
 * `pixels` is raw RGBA, the shape getImageData() hands back. Pixels are
 * weighted by how colourful they are (`0.2 + saturation`) so a photograph
 * that is four fifths grey sky still reports the one thing in it that has a
 * colour, without a picture that is genuinely grey reporting nothing at all.
 * Nearly transparent pixels are skipped: they contribute nothing on screen
 * and their colour is usually black padding.
 *
 * Buckets are taken strongest first and each one is answered with the mean
 * colour of the pixels that fell into it, so what comes back is a colour the
 * picture actually contains rather than the middle of a hue range. Fewer
 * distinct buckets than asked for is normal (a picture can be one colour),
 * and the answer simply repeats — with the lightness band below making the
 * three blobs different from one another anyway.
 *
 * An empty or fully transparent picture yields an empty array, which the
 * caller reads as "keep the seed colours".
 */
export function paletteFromPixels(pixels, count = 3) {
  const weight = new Float64Array(BUCKETS);
  const sums = [new Float64Array(BUCKETS), new Float64Array(BUCKETS), new Float64Array(BUCKETS)];
  let seen = 0;

  for (let i = 0; i + 3 < pixels.length; i += 4) {
    if (pixels[i + 3] < 128) continue;
    seen += 1;
    const { h, s } = rgbToHsl(pixels[i], pixels[i + 1], pixels[i + 2]);
    const bucket = Math.min(BUCKETS - 1, Math.floor((h / 360) * BUCKETS));
    const w = 0.2 + s;
    weight[bucket] += w;
    sums[0][bucket] += pixels[i] * w;
    sums[1][bucket] += pixels[i + 1] * w;
    sums[2][bucket] += pixels[i + 2] * w;
  }
  if (seen === 0) return [];

  const order = [...weight.keys()]
    .filter((bucket) => weight[bucket] > 0)
    .sort((a, b) => weight[b] - weight[a]);
  if (order.length === 0) return [];

  const out = [];
  for (let i = 0; i < count; i += 1) {
    const bucket = order[i % order.length];
    const w = weight[bucket];
    const { h, s } = rgbToHsl(sums[0][bucket] / w, sums[1][bucket] / w, sums[2][bucket] / w);
    out.push(hslToHex({
      h,
      s: Math.max(MIN_SATURATION, Math.min(MAX_SATURATION, s)),
      l: LIGHTNESS[i % LIGHTNESS.length]
    }));
  }
  return out;
}

/**
 * The same thing, from a decoded Image object: scale it down once, read it
 * once.
 *
 * Deliberately not per frame and not on the preview canvas — the picture only
 * changes when one is imported or a project is opened, so this runs exactly
 * then. A canvas that cannot be read (there is no realistic way for a
 * same-origin data: URL to be tainted, but a browser that refused would throw
 * here rather than anywhere that matters) yields an empty array.
 */
export function samplePalette(image, count = 3) {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = SAMPLE_WIDTH;
    canvas.height = SAMPLE_HEIGHT;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(image, 0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT);
    return paletteFromPixels(ctx.getImageData(0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT).data, count);
  } catch (error) {
    console.error('could not read the picture\'s colours:', error);
    return [];
  }
}
