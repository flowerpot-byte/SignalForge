// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import {
  CANVAS_WIDTH, CANVAS_HEIGHT, clamp, normalizeColor, DEFAULT_SOLID_COLOR
} from '../document.js';
import { breatheFactor } from '../motion/breathe.js';

/**
 * One colour, everywhere.
 *
 * The smallest layer type there is, and it exists for the smallest reason:
 * until now an effect could only begin with a picture, so somebody who wanted
 * a single colour on their keyboard could not begin at all.
 *
 * WHAT MOTIONS DO HERE
 *
 * Breathe, and only breathe. That is not a shortcut — it is arithmetic. Drift
 * and warp both work by moving pixels: drift slides the whole field, warp
 * bends it. On a field where every pixel has the same colour, every pixel
 * either motion moves is replaced by a pixel of exactly that colour, so the
 * frame is bit-for-bit what it was before. Implementing them here would
 * produce a control that provably cannot change a single byte of output, which
 * is the one thing worse than an option that was never offered.
 *
 * So they are not offered: SOLID_MOTION_KINDS (src/engine/document.js) is what
 * the settings column and the exported effect's Motion dropdown are built
 * from. A drift entry that reaches this renderer anyway — from a project file
 * edited by hand, or from a layer whose type was switched — is kept in the
 * document and simply renders as nothing, exactly as a "none" entry does.
 * Breathe, by contrast, is a factor on ctx.globalAlpha and needs to know
 * nothing at all about what is being drawn, so a flat colour can perform it
 * perfectly: the whole field swells and fades.
 *
 * WHAT THAT ARGUMENT RESTS ON — read this before adding a field
 *
 * "Every pixel has the same colour" is true of a solid layer today only
 * because of three things this layer type deliberately does NOT have:
 *
 *   1. no `offset` — nothing that could move the fill away from the canvas
 *      edge and leave an uncovered strip for drift to expose;
 *   2. no mask or shape — nothing that gives the field an edge, and an edge is
 *      a place where displacing pixels is visible;
 *   3. no per-pixel alpha — the fill is opaque across the whole rectangle, so
 *      what a displaced pixel is replaced by is that same colour and not some
 *      blend with whatever lies under it.
 *
 * Add any one of those and the field stops being uniform, drift and warp
 * become visible, and TWO files become wrong at once: motionKindsFor in
 * src/engine/document.js goes on hiding motions that would now do something,
 * and the renderer below goes on ignoring them. Both are silent failures —
 * test/engine/colour-layers-render.test.js would keep measuring "maximum
 * difference exactly 0" and keep passing, because what that measurement
 * actually records is that this renderer ignores drift and warp, not that a
 * uniform field is invariant under displacement. Whoever adds the field has to
 * fix both places; no test will ask them to.
 */

export function render(ctx, layer, asset, timeSec) {
  const motions = Array.isArray(layer.motions) ? layer.motions : [];
  const breathe = motions.find((motion) => motion.kind === 'breathe') ?? null;

  const previousAlpha = ctx.globalAlpha;
  if (breathe) {
    ctx.globalAlpha = clamp(previousAlpha * breatheFactor(breathe, timeSec), 0, 1);
  }

  // Parsed on every frame rather than trusted, because layer.color is not only
  // what normalizeDocument put there: applyControls writes a SignalRGB colour
  // control's raw value straight into it (see src/engine/bind.js), and an
  // unparseable string handed to fillStyle is a silent no-op that would paint
  // whatever colour the canvas last used.
  ctx.fillStyle = normalizeColor(layer.color, DEFAULT_SOLID_COLOR);
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  ctx.globalAlpha = previousAlpha;
}
