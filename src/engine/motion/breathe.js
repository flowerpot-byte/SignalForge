// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import { speedToRate } from './speed.js';

/**
 * speedToRate(motion.speed) maps onto this many radians per second at full
 * tilt (rate 1, i.e. speed 100) for drift and breathe. Warp gets its own,
 * larger scale (see layers/image.js) — its visible motion is more subtle per
 * radian, so it needs a faster phase to read as comparably fast.
 *
 * It lives here rather than in one layer type because "speed 40 means the same
 * tempo whatever is moving" is a promise across the whole app, and a second
 * copy of the number in a second layer type is how that promise gets broken.
 */
export const SPEED_SCALE = 0.6;

/** Breathe dims by at most this fraction at full amount. */
export const BREATHE_MAX_DEPTH = 0.7;

/** Where a motion stands on its own cycle at `timeSec`, in radians. */
export function motionPhase(motion, timeSec) {
  return timeSec * speedToRate(motion.speed) * SPEED_SCALE;
}

/**
 * A slow swell between full brightness and BREATHE_MAX_DEPTH below it.
 *
 * Applied by every layer type the same way — as a factor on ctx.globalAlpha —
 * which is why it is the one motion that needs no knowledge whatsoever of what
 * is being drawn, and therefore the one motion a flat colour can perform.
 */
export function breatheFactor(motion, timeSec) {
  const depth = (motion.amount / 100) * BREATHE_MAX_DEPTH;
  return 1 - depth * (0.5 - 0.5 * Math.cos(motionPhase(motion, timeSec)));
}
