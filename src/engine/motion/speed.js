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
 * Rate at the very top of the slider — the ceiling this whole mapping ends at.
 *
 * It used to be 1, inherited from the linear `speed / 100` that this curve
 * replaced, where 1 was simply what 100/100 comes to. Nothing ever chose it.
 * What it meant in practice was measured (.superpowers/sdd/
 * signalrgb-motion-bug-report.md, section 5) and then re-measured here by
 * rendering: at tempo 100, a full breathe cycle took 10.47 seconds. A ten-
 * and-a-half-second breath at the far end of a slider labelled "Tempo" is not
 * a fast setting, and "even at maximum speed far too slow" is exactly what
 * came back from hardware.
 *
 * 7 was picked from the measurement, not by feel: a full breathe cycle is
 * 2*PI / (rate * SPEED_SCALE) seconds, so the rate needed for a cycle of
 * about a second and a half — a brisk breath, the top of what this control
 * should be able to ask for — is 2*PI / (1.5 * 0.6) = 6.98. Rounded to 7 that
 * is 1.50 seconds, measured by rendering (test/engine/speed.test.js states
 * the pair, and the report records the sweep).
 *
 * Raising THIS rather than SPEED_SCALE (src/engine/motion/breathe.js) or
 * WARP_SPEED_SCALE (src/engine/layers/image.js, gradient.js) is the whole
 * point. Those two are per-motion constants: multiplying them speeds
 * everything up including the default, which would change the tempo of every
 * effect Max has already built and exported. The ceiling of the curve is the
 * one number that can move while the anchor at the default stays nailed down,
 * because the curve is anchored at both ends independently — see S0/R0 and
 * the segment comment below. The promise "tempo 40 means the same tempo
 * whatever is moving" also survives untouched: every motion still reads the
 * same rate out of the same function.
 */
const MAX_RATE = 7;

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
 * raised. Hardware testing confirmed which one is right:
 *
 *  - Reading A, "the slider does too little" — the one implemented below.
 *    The whole range should feel wider: the same slider travel should
 *    produce a bigger change near BOTH extremes (very slow, very fast),
 *    even if that means the middle of the range (around the default)
 *    responds less per slider step. That means the low segment is steep
 *    near speed 0 and flattens out approaching the default:
 *    LOW_SEGMENT_K NEGATIVE (concave).
 *  - Reading B, "I cannot set it finely enough". Only the low end would be
 *    the complaint: the segment below the default flat near speed 0
 *    (small slider moves near "almost stopped" barely change the rate,
 *    leaving room to dial in a precise slow setting) and steepening
 *    approaching the default: LOW_SEGMENT_K POSITIVE (convex). Rejected —
 *    Max confirmed on hardware he meant Reading A instead.
 *
 * Both readings agree the high segment can stay compressed the same way
 * the single-curve version already had it (HIGH_SEGMENT_K positive) — the
 * top of the range was never the complaint either way. That segment is
 * already steep near speed 100 (see the table below), which is what gives
 * Reading A its "bigger change near the fast extreme" too — no separate
 * change needed there.
 *
 * To switch back to reading B, flip ONE constant:
 *   const LOW_SEGMENT_K = 1.6;
 * Nothing else in this file needs to change.
 */
const LOW_SEGMENT_K = -1.6;
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
 * position (0.15), and speedToRate(100) is exactly MAX_RATE.
 *
 * Three anchors, and only the top one has ever moved. When the ceiling went
 * from 1 to 7 (see MAX_RATE), the segment BELOW the default did not change at
 * all — it ends at the default, which is nailed down — and the segment above
 * kept its exact shape, because it is the same normalized ease stretched onto
 * a taller range. Every rate above the default is therefore the old one with
 * its distance above 0.15 multiplied by the same (7 - 0.15) / (1 - 0.15) =
 * 8.06. One factor, uniformly, rather than a re-tuned curve: the feel of the
 * slider is what it was, the top of it simply reaches somewhere worth going.
 *
 *   speed    linear (speed/100)   was      now      breathe cycle now
 *   0        0.0000               0.0000   0.0000   (stopped)
 *   1        0.0100               0.0190   0.0190   551 s
 *   5        0.0500               0.0777   0.0777   135 s
 *   10       0.1000               0.1233   0.1233   85 s
 *   15       0.1500               0.1500   0.1500   69.8 s  <- default: unchanged
 *   20       0.2000               0.1712   0.3210   32.6 s
 *   30       0.3000               0.2202   0.7153   14.6 s
 *   50       0.5000               0.3505   1.7659   5.9 s
 *   100      1.0000               1.0000   7.0000   1.5 s
 *
 * The cycle column is 2*PI / (rate * SPEED_SCALE) with SPEED_SCALE 0.6, and
 * the two ends of it were confirmed by rendering rather than by trusting the
 * arithmetic — see test/engine/speed.test.js and .superpowers/sdd/
 * quickfixes-report.md.
 *
 * Below the default, the curve is steeper than the old linear mapping near
 * speed 0 (a given slider nudge near the very bottom changes the rate
 * MORE than before) and flattens out approaching the default, giving a
 * bigger felt change at the slow extreme — where the "the slider does too
 * little" complaint was aimed. Above the default it continues to compress
 * the middle of the top segment but steepens again near speed 100, same
 * as the single-curve version this replaces, giving the fast extreme the
 * same "bigger change" character without needing its own tuning.
 * Monotonic across the whole range, including across the join at the
 * default — verified in test/engine/speed.test.js with a fine-grained
 * sweep, not just per-segment.
 */
export function speedToRate(speed) {
  const u = clamp(Number(speed) || 0, 0, 100) / 100;
  if (u <= S0) return easeSegment(u, 0, S0, 0, R0, LOW_SEGMENT_K);
  return easeSegment(u, S0, 1, R0, MAX_RATE, HIGH_SEGMENT_K);
}
