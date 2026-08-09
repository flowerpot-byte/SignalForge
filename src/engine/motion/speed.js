// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import { clamp } from '../document.js';

/**
 * How pronounced the exponential bend is. 0 would be a straight line (the
 * old, linear `speed / 100` mapping this replaces); bigger values buy more
 * low-end resolution at the cost of pulling the default (speed 15) further
 * from its old value. 0.9 was chosen by trying values and checking the
 * table in speedToRate's own doc comment: it keeps the default within
 * about a third of where it used to be while meaningfully separating the
 * slider positions the user actually turns the knob between.
 */
const EXP_K = 0.9;

/**
 * Turn a motion "speed" control value (0..100) into a phase-rate multiplier,
 * replacing the old flat `speed / 100`. Every motion kind (drift, breathe,
 * warp) calls this same function and then applies its own fixed scale on
 * top, so the slider means the same thing everywhere.
 *
 * A linear mapping spreads resolution evenly across the whole slider, but
 * on real hardware that is the wrong trade: confirmed on real hardware, the
 * useful, visually distinguishable "slow ambient" settings all live in
 * roughly the bottom third of the range, while everything above ~40 already
 * reads as the same high-frequency churn. This curve trades resolution the
 * user never uses (the top of the range) for resolution around the range
 * they actually use:
 *
 *   speed    old (speed/100)   speedToRate
 *   0        0.0000            0.0000
 *   1        0.0100            0.0062
 *   15       0.1500            0.0990   <- tempo control's default
 *   50       0.5000            0.3894
 *   100      1.0000            1.0000
 *
 * speedToRate(100) is exactly 1 — the same ceiling the old linear mapping
 * had — so the fastest setting is unchanged; nothing that depended on
 * "speed 100 means rate 1" needs to change. The default (speed 15) moves to
 * about two thirds of its old value, close enough to stay a recognisably
 * similar, slow ambient pace, while the *slope* right around it is now
 * gentler than the old constant 1/100 (about 0.0071 vs. 0.01, only crossing
 * back above 0.01 past speed ~54) — so slider positions near the default
 * now produce visibly different, controllable results instead of the old
 * mapping's evenly-spread but practically useless precision.
 */
export function speedToRate(speed) {
  const s = clamp(Number(speed) || 0, 0, 100) / 100;
  return (Math.exp(EXP_K * s) - 1) / (Math.exp(EXP_K) - 1);
}
