// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import { motionPhase } from './breathe.js';

/**
 * Where the whole document's colour wheel stands at `timeSec`.
 *
 * TWO FIELDS, NOT ONE, AND THAT IS WHAT THE CORPUS DOES
 *
 * docs/effekt-inventur.md, section A4, reads the same recipe out of eight
 * shipped effects: a hue offset that the user can park anywhere, plus a speed
 * that adds to it every frame ("Color Cycle", "Rainbow Mode"). Both halves are
 * real settings there — `Gradient Wave` alone offers a fixed hue AND a cycle
 * speed, and setting the speed to zero is how somebody keeps the one without
 * the other. So:
 *
 *   hueShift  degrees, 0..360, where the wheel sits when nothing is turning
 *   hueCycle  a tempo, 0..100, and 0 means it does not turn at all
 *
 * A single "speed" field could not express a standing colour change, and a
 * single "shift" field could not turn; the corpus needs both and so does this.
 *
 * THE TEMPO IS THE APP'S OWN TEMPO. One cycle of hueCycle is one whole turn of
 * the wheel, and one cycle is the same length of time as one breath, one pulse
 * or one spin at that same number — motionPhase is the shared clock every
 * motion in this app reads (see SPEED_SCALE in motion/breathe.js). At 100 that
 * is a turn every 1.5 seconds; at the usual 15, one every 70. This is
 * deliberately NOT the corpus's own mapping (`globalColorCycle += speed / 50`
 * per frame, which is a per-frame count and therefore tied to how fast the host
 * happens to be drawing): a tempo that means something different here from
 * everywhere else in the app would break the one promise the tempo control
 * makes.
 *
 * Wrapped into 0..360 rather than left to grow, unlike spinDegrees. A rotation
 * cares about how far it has turned in total (a caller comparing two times must
 * not get a negative answer once per turn); a hue does not — 370 degrees of hue
 * IS 10 degrees of hue, there is nothing else it could mean, and the value is
 * handed to a cosine that would agree either way. Wrapping keeps the number
 * readable and keeps a long-running effect from drifting into the range where
 * doubles lose whole degrees.
 *
 * Reads no clock and holds no state: the same (fields, timeSec) always gives
 * the same angle, which is what lets the preview and the exported file agree.
 */
export function hueDegrees(hueShift, hueCycle, timeSec) {
  const parked = Number(hueShift);
  const base = Number.isFinite(parked) ? parked : 0;
  // motionPhase is radians of the shared cycle; one cycle is one whole turn.
  const turned = (motionPhase({ speed: hueCycle }, timeSec) / (2 * Math.PI)) * 360;
  const total = base + turned;
  return ((total % 360) + 360) % 360;
}

/**
 * The hueShift that keeps the wheel where it stands when the CYCLE changes.
 *
 * The complaint this answers (Max, 12.08.2026): dragging the Farbwechsel
 * slider made the colour JUMP. It has to, with nothing else moving — the
 * angle is hueShift + turn(cycle, t), and t is whatever moment the preview
 * happens to be at, so a new cycle re-prices the whole elapsed time at the
 * new speed. The fix is arithmetic, not rendering: at the moment the cycle
 * changes from `fromCycle` to `toCycle`, move the PARKED half of the angle by
 * exactly the difference the turning half is about to lose or gain,
 *
 *     shift' = shift + turn(from, t) - turn(to, t)      (wrapped into 0..360)
 *
 * so hueDegrees(shift', to, t) === hueDegrees(shift, from, t) and only the
 * SPEED changes from that moment on.
 *
 * This lives in the engine because it is arithmetic over the engine's own
 * motionPhase — but the engine never CALLS it. Rendering stays a pure
 * function of (document, t); remembering that a slider used to say something
 * else is a job for whoever owns the slider (the settings column, see
 * mountInspector in app/renderer/components/inspector.js). The exported
 * effect has no such owner — SignalRGB's own panel writes values with no
 * before/after seam to hook — so a cycle change there still jumps, exactly
 * as it does in every corpus effect with the same two controls.
 *
 * NOT ROUNDED, deliberately, and the first version's rounding was a measured
 * mistake: a slider drag fires one change per input tick, each tick rebases
 * FROM THE PREVIOUS TICK'S RESULT, and rounding inside this function made
 * that chain a random walk of half-degree errors — 400 ticks of dragging the
 * cycle slider back and forth drifted the hue by up to 177 degrees, the very
 * jump this function exists to remove. So the arithmetic is exact and stays
 * exact through any chain (each step is angle-preserving by construction);
 * whoever shows the value in a step-1 control rounds FOR DISPLAY ONCE and
 * keeps the exact figure for the next step of the chain (see the hueCycle
 * note in mountInspector). Half a degree of display rounding, paid once, is
 * invisible; paid per tick it is not.
 *
 * `timeSec` is guarded like `hueShift` — this is an exported engine function
 * now, and a NaN time would otherwise ride the chain into the document.
 */
export function rebasedHueShift(hueShift, fromCycle, toCycle, timeSec) {
  const parked = Number(hueShift);
  const base = Number.isFinite(parked) ? parked : 0;
  const at = Number(timeSec);
  const time = Number.isFinite(at) ? at : 0;
  const turnOf = (cycle) => (motionPhase({ speed: cycle }, time) / (2 * Math.PI)) * 360;
  const total = base + turnOf(fromCycle) - turnOf(toCycle);
  return ((total % 360) + 360) % 360;
}
