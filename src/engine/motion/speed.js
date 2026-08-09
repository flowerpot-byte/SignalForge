// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import { clamp } from '../document.js';

/**
 * The tempo control's default slider position (matches the `tempo`
 * control's `default` in bin/sfexport.js). Under today's linear mapping,
 * `speed / 100`, this is literally the identity function in normalized
 * coordinates: normalizing the slider (divide by 100) already gives the
 * old rate. So the default's old rate, in normalized terms, is exactly its
 * own normalized slider position — S0 and R0 below are the same number,
 * 0.15, not by coincidence but because the mapping being replaced was
 * y = x.
 */
const DEFAULT_SPEED = 15;

/** Default slider position, normalized to 0..1. */
const S0 = DEFAULT_SPEED / 100;

/** Rate at the default. Equal to S0 — see the comment on DEFAULT_SPEED. */
const R0 = S0;

/**
 * Curvature of the segment below the default (speed 0..15) and the segment
 * above it (speed 15..100). 0 means no curve at all — a straight line
 * across that segment, i.e. today's linear mapping restricted to it.
 * Positive bends the segment so it starts flat (small slope) and ends
 * steep (large slope), same shape the single-curve version this replaces
 * had across its whole domain.
 *
 * Splitting the curve into two segments anchored at the default (see S0/R0
 * above) is what makes it possible to satisfy two goals at once that a
 * single exponential anchored only at the endpoints cannot: a curve convex
 * across its whole domain necessarily lies below the chord connecting its
 * endpoints, so easing the low end with one curve was mathematically
 * guaranteed to also pull the default's value down. Anchoring a third
 * point exactly AT the default removes that constraint: each segment's
 * curvature is now free, independently, because each is its own
 * self-contained exponential ease between two fixed endpoints.
 *
 * Two different readings of "the tempo slider isn't good enough" were
 * raised, and which one is right has not been confirmed on hardware yet:
 *
 *  - Reading A, "the slider does too little": the whole range should feel
 *    wider — the same slider travel should produce a bigger change near
 *    BOTH extremes (very slow, very fast), even if that means the middle
 *    of the range (around the default) responds less per slider step.
 *    That means the low segment should be steep near speed 0 and flatten
 *    out approaching the default: LOW_SEGMENT_K NEGATIVE (concave).
 *  - Reading B, "I cannot set it finely enough" — the one implemented
 *    below. Only the low end is the complaint: the segment below the
 *    default should be flat near speed 0 (small slider moves near "almost
 *    stopped" barely change the rate, leaving room to dial in a precise
 *    slow setting) and steepen approaching the default: LOW_SEGMENT_K
 *    POSITIVE (convex). This matches the rationale the single-curve
 *    version it replaces was already built on (see git history) — the
 *    hardware-confirmed complaint was specifically about distinguishing
 *    slow, ambient settings, not about the fast end.
 *
 * Both readings agree the high segment can stay compressed the same way
 * the single-curve version already had it (HIGH_SEGMENT_K positive) — the
 * top of the range was never the complaint either way.
 *
 * To switch to reading A, flip ONE constant:
 *   const LOW_SEGMENT_K = -1.6;
 * Nothing else in this file needs to change.
 */
const LOW_SEGMENT_K = 1.6;
const HIGH_SEGMENT_K = 1.6;

/**
 * Normalized exponential ease over t in [0, 1], with curvature k. k === 0
 * is handled specially as the identity (straight line) because the general
 * formula divides by exp(k) - 1, which is exactly 0 there.
 */
function ease(t, k) {
  return k === 0 ? t : (Math.exp(k * t) - 1) / (Math.exp(k) - 1);
}

/** Ease x from the range [x0, x1] onto [y0, y1], with curvature k. */
function easeSegment(x, x0, x1, y0, y1, k) {
  return y0 + (y1 - y0) * ease((x - x0) / (x1 - x0), k);
}

/**
 * Turn a motion "speed" control value (0..100) into a phase-rate multiplier,
 * replacing the old flat `speed / 100`. Every motion kind (drift, breathe,
 * warp) calls this same function and then applies its own fixed scale on
 * top, so the slider means the same thing everywhere.
 *
 * Two exponential segments joined exactly at the default (see S0/R0 and the
 * LOW_SEGMENT_K/HIGH_SEGMENT_K comment above): speedToRate(0) is exactly 0,
 * speedToRate(DEFAULT_SPEED) is exactly the old linear value at that
 * position (0.15), and speedToRate(100) is exactly 1 — the same ceiling the
 * old linear mapping had, so "speed 100 means rate 1" still holds
 * everywhere that assumed it.
 *
 *   speed    old (speed/100)   speedToRate
 *   0        0.0000            0.0000
 *   1        0.0100            0.0043
 *   5        0.0500            0.0267
 *   15       0.1500            0.1500   <- default: identical to old, by construction
 *   30       0.3000            0.2202
 *   50       0.5000            0.3505
 *   100      1.0000            1.0000
 *
 * Below the default, the curve is flatter than the old linear mapping (a
 * given slider nudge near the very bottom changes the rate less), giving
 * more usable slider room exactly where the "I cannot set it finely
 * enough" complaint was aimed. Above the default it continues to compress
 * the top of the range, same as the single-curve version this replaces.
 * Monotonic across the whole range, including across the join at the
 * default — verified in test/engine/speed.test.js with a fine-grained
 * sweep, not just per-segment.
 */
export function speedToRate(speed) {
  const u = clamp(Number(speed) || 0, 0, 100) / 100;
  if (u <= S0) return easeSegment(u, 0, S0, 0, R0, LOW_SEGMENT_K);
  return easeSegment(u, S0, 1, R0, 1, HIGH_SEGMENT_K);
}
