// SignalForge — build SignalRGB effects from images, gradients, shapes and particles.
// Copyright (C) 2026 Max Leopold Blumenschein
// SPDX-License-Identifier: GPL-3.0-or-later
import { speedToRate } from './speed.js';

/**
 * Radians per second per unit of speedToRate, for drift and breathe. Warp gets
 * its own, larger scale (see motion/warp.js) — its visible motion is more
 * subtle per radian, so it needs a faster phase to read as comparably fast.
 *
 * It lives here rather than in one layer type because "speed 40 means the same
 * tempo whatever is moving" is a promise across the whole app, and a second
 * copy of the number in a second layer type is how that promise gets broken.
 *
 * DELIBERATELY NOT THE PLACE TO MAKE THINGS FASTER. This constant multiplies
 * every speed alike, so raising it would speed up the default along with the
 * top of the slider and change the tempo of every effect already exported.
 * The slider's ceiling is MAX_RATE in speed.js, which moves the top without
 * touching the default. That is where the "far too slow at maximum" fix went.
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
