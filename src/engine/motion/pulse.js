// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max Leopold Blumenschein
// SPDX-License-Identifier: GPL-3.0-or-later
import { clamp } from '../document.js';
import { motionPhase } from './breathe.js';

/**
 * A hard beat and a fall away from it — the other thing an opacity factor can
 * be, and the one breathe deliberately is not.
 *
 * HOW IT DIFFERS FROM BREATHE, IN ONE SENTENCE EACH
 *
 *   breathe   a cosine: it leaves full brightness slowly, reaches the bottom
 *             halfway through the cycle and comes back up just as slowly.
 *             There is no instant in it you could point at and call "the
 *             beat", which is exactly right for a swell and exactly wrong for
 *             a rhythm.
 *   pulse     full brightness at the start of every cycle, then an exponential
 *             fall the whole way to the next one, where it snaps back. The
 *             snap is a genuine discontinuity and it is the point: it is the
 *             only thing in this app that gives an effect a downbeat.
 *
 * Two consequences worth writing down, because both were choices:
 *
 *  1. The decay runs across the WHOLE cycle rather than finishing early and
 *     sitting dark. A pulse that reaches its floor at a quarter of the cycle
 *     and waits there reads as flicker at a fast tempo, because three
 *     quarters of every beat is a flat dark stretch. Falling continuously
 *     means the tempo slider changes how long the tail is, which is what
 *     somebody setting a rhythm is actually reaching for.
 *  2. STRENGTH IS THE DEPTH OF THE FALL, not the sharpness of the attack.
 *     Sharpness is what makes it a pulse at all, so making it adjustable
 *     would put "stop being a pulse" on a slider. At strength 0 the factor is
 *     exactly 1 at every instant — no pulse whatsoever, not a shallow one —
 *     which is what makes a strength of zero honest rather than nearly quiet.
 *
 * PULSE_MAX_DEPTH is deeper than breathe's 0.7 on purpose: a beat that only
 * ever dips to a third reads as a wobble. At full strength the tail reaches
 * 10 % of the layer's own opacity, which is nearly out and still not a
 * blackout — a layer that vanished completely would let whatever is beneath it
 * show through as a separate picture rather than as this one pulsing.
 *
 * Like every other motion here it reads no clock and holds no state.
 */

export const PULSE_MAX_DEPTH = 0.9;

/**
 * How steeply the beat falls away, as an exponential rate over one cycle. 5
 * means the tail has lost 99.3 % of its height by the time the next beat
 * arrives, so the snap back to full is unmistakable at any tempo; a much
 * smaller number turns the fall into a slope and a much larger one puts the
 * whole beat into the first few frames and leaves the rest dark (see note 1
 * above).
 */
const PULSE_DECAY = 5;

/**
 * The factor to multiply a layer's opacity by at `timeSec`.
 *
 * 1 on the beat, falling to 1 - depth just before the next one.
 */
export function pulseFactor(motion, timeSec) {
  const depth = (clamp(Number(motion.amount) || 0, 0, 100) / 100) * PULSE_MAX_DEPTH;
  if (depth === 0) return 1;
  // Where we are inside the current cycle, 0 at the beat and approaching 1
  // just before the next one. motionPhase is radians of the shared cycle.
  const cycles = motionPhase(motion, timeSec) / (2 * Math.PI);
  const into = cycles - Math.floor(cycles);
  return 1 - depth * (1 - Math.exp(-into * PULSE_DECAY));
}
