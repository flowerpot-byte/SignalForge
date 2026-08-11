// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import { clamp } from '../document.js';
import { motionPhase } from './breathe.js';

/**
 * A continuous turn of the whole field about the middle of the canvas.
 *
 * WHAT THE TWO CONTROLS MEAN, AND WHY NEITHER OF THEM IS DEAD
 *
 * Every motion in this app is steered by the same pair — a tempo and a
 * strength — and the promise attached to the tempo is that "tempo 40 means the
 * same tempo whatever is moving" (see SPEED_SCALE in motion/breathe.js). A
 * rotation has an obvious reading of tempo (how fast it turns) and no obvious
 * reading of strength at all, which is the trap: the easy answer is to let
 * strength scale the speed too, and then two sliders do one thing and the
 * effect has a control that is a duplicate of the one above it.
 *
 * So the split is made where it is honest. TEMPO is the shared clock, exactly
 * the clock breathe and drift and warp run on — one cycle of it is one cycle
 * of everything. STRENGTH is HOW FAR THE FIELD TURNS IN ONE OF THOSE CYCLES: a
 * whole turn at 100, a third of a turn at 33, standing perfectly still at 0.
 * Both controls therefore change different things, both are readable off the
 * picture, and a spin set to the same tempo as a breathe on another layer
 * keeps step with it.
 *
 * The result is degrees, always increasing, never wrapped: a caller adds it to
 * a layer's own angle and the trigonometry downstream does not care whether it
 * is handed 370 or 10. Not wrapping here is deliberate — the moment this
 * function wrapped, a caller that compares two times to ask "how far has it
 * turned" would get a negative answer once per turn.
 *
 * It reads no clock and holds no state: the same (motion, timeSec) always
 * gives the same angle, which is what makes the exported effect and the
 * preview agree.
 */

/** How many degrees this spin has turned through by `timeSec`. */
export function spinDegrees(motion, timeSec) {
  const turnsPerCycle = clamp(Number(motion.amount) || 0, 0, 100) / 100;
  // motionPhase is in radians of the shared cycle; one cycle is 2*PI of it.
  return (motionPhase(motion, timeSec) / (2 * Math.PI)) * 360 * turnsPerCycle;
}

/** The same turn in radians, for the callers that rotate a context. */
export function spinRadians(motion, timeSec) {
  return (spinDegrees(motion, timeSec) * Math.PI) / 180;
}
