// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max Leopold Blumenschein
// SPDX-License-Identifier: GPL-3.0-or-later
import { motionPhase } from './breathe.js';

/**
 * Where a drifting thing has swung to, as two numbers between -1 and 1.
 *
 * This used to be a private function inside layers/gradient.js, and it is here
 * now because a second layer type needs the same wander: a shape layer's figure
 * moves about the canvas exactly as a radial gradient's centre does. Copying it
 * would have been six lines, and the six lines would have drifted apart in the
 * one way that matters — "drift at strength 60" has to mean the same amount of
 * wandering wherever it is written, which is the same argument that put the
 * warp field in layers/warp-buffer.js instead of in two layer files.
 *
 * WHY IT SWINGS RATHER THAN MARCHES. A sine and a cosine, so the thing returns
 * to where it began instead of leaving. For a gradient the reason is a seam: an
 * endless march would need the ramp to wrap, and the wrap between the last
 * colour and the first is a hard edge crossing the surface. For a shape the
 * reason is simpler — a figure that marched in one direction would leave the
 * canvas and never come back, and an effect whose picture is empty after twenty
 * seconds is not an effect.
 *
 * WHY THE TWO PERIODS ARE 0.37 AND 0.23. Their ratio is irrational enough over
 * any run anybody watches (37/23 has no small common factor), so the path is a
 * Lissajous figure that does not close: the thing does not retrace the same oval
 * every few seconds. The two phase offsets, 0.4 and 1.1, keep it away from the
 * corners of its own box at t = 0, so an effect does not open on the extreme of
 * its own travel.
 *
 * Kept EXACTLY as it was, down to the constants, because changing it would move
 * every pixel of every drifting gradient anybody has already exported.
 */
export function driftSwing(motion, timeSec) {
  const at = motionPhase(motion, timeSec);
  return { x: Math.sin(at * 0.37 + 0.4), y: Math.cos(at * 0.23 + 1.1) };
}

/**
 * At full strength, a drift moves a POINT this much of the canvas.
 *
 * The gradient's radial and conic centres wander by this much, and so does a
 * shape's figure — one constant, so "drift at strength 60" moves a heart as far
 * as it moves a radial gradient's middle, which is what somebody switching
 * between the two expects and what two separate numbers would quietly break.
 *
 * 0.3 rather than 0.5: at 0.5 the point reaches the very edge of the canvas and
 * a figure spends the ends of its travel mostly off it.
 */
export const DRIFT_CENTRE_REACH = 0.3;
