// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import {
  clamp, normalizeColor, colorAtPosition, DEFAULT_SOLID_COLOR
} from '../document.js';
import { motionPhase } from './breathe.js';

/**
 * The colour a solid or a figure shows at `timeSec`, when it cycles.
 *
 * THE WISH THIS ANSWERS (Max, 12.08. 04:45): "wie bei einem Regenbogen aber
 * nur zwischen 2 oder mehr bestimmten Farben" — the full hue wheel
 * (hueCycle) turns through every colour there is; this blends through the
 * two to four the person actually chose. The corpus's own "Color Cycle"
 * (docs/effekt-inventur.md, A4) is the wheel, not this: it HSL-rotates the
 * chosen colours, so a chosen red still visits green on the way round.
 * Nothing in the corpus holds a swatch list and blends along it.
 *
 * WHAT THE FIELDS MEAN, so the two colour truths cannot be misread:
 *
 *   color        the layer's RESTING colour — everything a solid or a shape
 *                has always shown, and still the whole story at cycleSpeed 0.
 *   stops        the CYCLE's colours, the same field the gradient and the
 *                particles already carry ({at, color}; `at` is stored and
 *                ignored, exactly as the particles ignore it — the colours
 *                have an order, there is nothing for a position to mean).
 *   cycleSpeed   the tempo, 0..100 on the shared motionPhase clock, and 0 is
 *                OFF — not slow. One cycle is one trip through the WHOLE
 *                list, the same sentence one hueCycle is one trip round the
 *                wheel, so the two tempos feel the same.
 *
 * The blend is a RING: last colour back to first, evenly spaced, linear in
 * sRGB — colorAtPosition's own arithmetic, reached by handing it the ring
 * with the first colour appended at the end, so the wrap is an ordinary
 * segment and not a special case. Per-frame allocation of that little stop
 * list is deliberate simplicity: five small objects against the 64000-pixel
 * passes a frame already makes; cache it only if a cost readout ever says
 * to.
 *
 * At cycleSpeed 0 — or with fewer than two stops, which is what every
 * document from before this field says — the return is EXACTLY the resting
 * colour through the very normalizeColor call the two renderers have always
 * made, so old documents render byte for byte as they did.
 *
 * `cyclePhase` (0..100, default 0) is where in the ring the cycle STANDS at
 * t = 0 — the anchor that lets a tempo change keep the colour still, exactly
 * as hueShift anchors hueCycle (src/engine/motion/hue.js). It is a document
 * field with no slider of its own: the settings column writes it through
 * rebasedCyclePhase below whenever the tempo changes, and an exported effect
 * simply bakes it in — a tempo change from SignalRGB's own panel still jumps
 * there, exactly as hueCycle's does, and for the same reason (the panel has
 * no before/after seam to hook).
 */
export function cyclePaint(layer, timeSec) {
  const rest = normalizeColor(layer.color, DEFAULT_SOLID_COLOR);
  const raw = Number(layer.cycleSpeed);
  const speed = clamp(Number.isFinite(raw) ? raw : 0, 0, 100);
  const stops = Array.isArray(layer.stops) ? layer.stops : [];
  if (speed <= 0 || stops.length < 2) return rest;

  const ring = stops.map((stop, index) => ({
    at: (index / stops.length) * 100,
    color: normalizeColor(stop && stop.color, DEFAULT_SOLID_COLOR)
  }));
  ring.push({ at: 100, color: ring[0].color });

  const phase = motionPhase({ speed }, timeSec) / (2 * Math.PI) + anchorOf(layer) / 100;
  return colorAtPosition(ring, (phase - Math.floor(phase)) * 100);
}

/** The layer's anchor, read the way every field is read: raw, then clamped. */
function anchorOf(layer) {
  const raw = Number(layer.cyclePhase);
  return clamp(Number.isFinite(raw) ? raw : 0, 0, 100);
}

/**
 * The cyclePhase that keeps the ring where it stands when the TEMPO changes.
 *
 * The same sentence rebasedHueShift says one file over, in ring units: at the
 * moment cycleSpeed changes from `fromSpeed` to `toSpeed`, move the anchor by
 * exactly the turns the elapsed time is about to be re-priced by, so
 * cyclePaint shows the same colour at the same t and only the SPEED changes.
 *
 * EXACT, NEVER ROUNDED — the lesson rebasedHueShift's first version paid to
 * learn (a drag rebases once per input tick from the previous tick's result,
 * and a chain of rounded steps drifted by up to 177 degrees). It is cheaper
 * here: cyclePhase has no slider, so the exact figure goes straight into the
 * document and the chain needs no display-rounding side-car at all.
 */
export function rebasedCyclePhase(cyclePhase, fromSpeed, toSpeed, timeSec) {
  const at = Number(timeSec);
  const time = Number.isFinite(at) ? at : 0;
  const turnsOf = (speed) => motionPhase({ speed }, time) / (2 * Math.PI);
  const total = anchorOf({ cyclePhase }) / 100 + turnsOf(fromSpeed) - turnsOf(toSpeed);
  return ((total % 1) + 1) % 1 * 100;
}
