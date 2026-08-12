// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import { motionPhase } from './breathe.js';

/** Zoom swells and shrinks by at most this fraction of the size at full amount. */
export const ZOOM_MAX_DEPTH = 0.5;

/**
 * A slow swell of SIZE, symmetric about the size the layer is set to.
 *
 * The figure's own radius is multiplied by this every frame — geometry, not
 * opacity, which is what tells it apart from breathe: a breathing star fades,
 * a zooming star grows and shrinks. sin rather than breathe's raised cosine,
 * so t = 0 is exactly factor 1 — the figure opens at the very size its slider
 * says, and the first motion is outward (a swell reads as "alive", a shrink
 * as "wilting").
 *
 * On the shared motionPhase clock like every tempo in this app, so zoom at
 * speed 40 breathes at the pace a breathe at 40 does. Offered on shape layers
 * only: a picture would tear its crop open (the spin note in document.js
 * walks the same arithmetic), a gradient fills the canvas at every scale so
 * only the conic/radial centre would appear to move — which drift already
 * does better — and a solid is invariant under any scale at all.
 */
export function zoomFactor(motion, timeSec) {
  const depth = (motion.amount / 100) * ZOOM_MAX_DEPTH;
  return 1 + depth * Math.sin(motionPhase(motion, timeSec));
}
