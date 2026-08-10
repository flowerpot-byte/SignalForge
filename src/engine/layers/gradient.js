// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import {
  CANVAS_WIDTH, CANVAS_HEIGHT, clamp, normalizeColor, DEFAULT_GRADIENT_STOPS
} from '../document.js';
import { speedToRate } from '../motion/speed.js';
import { breatheFactor, motionPhase } from '../motion/breathe.js';
import {
  BUFFER_PAD, BUFFER_SCALE, SOURCE_WIDTH, SOURCE_HEIGHT, MAX_AMPLITUDE, drawWarped
} from './warp-buffer.js';

/**
 * A ramp between colours, linear along an angle or radial from the middle.
 *
 * One type covers both — see GRADIENT_SHAPES in src/engine/document.js for why
 * "radial" is a field and not a second layer type.
 *
 * WHAT MOTIONS DO HERE, AND WHY THEY ARE NOT THE PICTURE LAYER'S
 *
 * All three are real on a gradient, because unlike a solid colour a gradient
 * has structure to move:
 *
 *   drift    the ramp slides. Linear: along its own axis, so the colours sweep
 *            across the surface. Radial: the centre wanders in a slow ellipse.
 *            It swings back and forth (a sine) rather than marching endlessly
 *            in one direction, exactly as the picture layer's drift does — an
 *            endless march would need the ramp to wrap around, and a wrap
 *            between the last colour and the first is a hard seam crossing the
 *            surface unless the two happen to match.
 *   warp     the same half-resolution wave field the picture layer uses (see
 *            layers/warp-buffer.js), so "warp at strength 60" means the same
 *            amount of bend whatever is underneath it. On a ramp it reads as
 *            the colour bands rippling.
 *   breathe  a factor on ctx.globalAlpha, identical to every other layer type.
 *
 * The one place this deliberately differs from the picture layer: when drift
 * and warp run together, the picture layer halves both their budgets and
 * shifts its sampling window inside the padding, because rebuilding its source
 * buffer means decoding and rescaling a photograph. A gradient's source buffer
 * is four canvas calls, so drift is painted straight into it at full strength
 * and warp keeps its whole amplitude. Drift therefore means the same thing
 * with and without warp here, which on the picture layer it does not.
 */

/** Warp's phase scale — the picture layer's own, so the tempo means the same. */
const WARP_SPEED_SCALE = 2.0;

/** At full strength, a linear drift slides the ramp this much of its length. */
const LINEAR_DRIFT_REACH = 0.5;
/** At full strength, a radial drift moves the centre this much of the canvas. */
const RADIAL_DRIFT_REACH = 0.3;

/** Half the canvas diagonal: a radial gradient that reaches every corner. */
const RADIAL_RADIUS = Math.sqrt(CANVAS_WIDTH * CANVAS_WIDTH + CANVAS_HEIGHT * CANVAS_HEIGHT) / 2;

export function createState() {
  return {
    warp: null, buffer: null, bufferCtx: null, imageData: null,
    paint: null, paintCtx: null, source: null, sourceKey: null
  };
}

/** How far a drifting gradient has swung, on the same curve the picture uses. */
function driftSwing(motion, timeSec) {
  const at = motionPhase(motion, timeSec);
  return { x: Math.sin(at * 0.37 + 0.4), y: Math.cos(at * 0.23 + 1.1) };
}

/**
 * Build the CanvasGradient for this layer, in CANVAS coordinates (0..320,
 * 0..200) whatever it is about to be painted into. The buffer path below
 * scales the drawing context instead of scaling these numbers, so there is one
 * definition of where the ramp runs and both paths are provably the same
 * gradient.
 */
function buildGradient(g, layer, drift, timeSec) {
  const cx = CANVAS_WIDTH / 2;
  const cy = CANVAS_HEIGHT / 2;
  const swing = drift ? driftSwing(drift, timeSec) : null;

  let gradient;
  if (layer.shape === 'radial') {
    let ox = 0;
    let oy = 0;
    if (swing) {
      const reach = (drift.amount / 100) * RADIAL_DRIFT_REACH;
      ox = reach * CANVAS_WIDTH * swing.x;
      oy = reach * CANVAS_HEIGHT * swing.y;
    }
    gradient = g.createRadialGradient(cx + ox, cy + oy, 0, cx + ox, cy + oy, RADIAL_RADIUS);
  } else {
    const radians = (layer.angle * Math.PI) / 180;
    const dx = Math.cos(radians);
    const dy = Math.sin(radians);
    // How far the canvas reaches along that direction: the projection of the
    // rectangle onto it. Using the diagonal instead would leave the extreme
    // colours off the edge at every angle but 45 degrees.
    const length = Math.abs(CANVAS_WIDTH * dx) + Math.abs(CANVAS_HEIGHT * dy);
    const shift = swing ? (drift.amount / 100) * LINEAR_DRIFT_REACH * length * swing.x : 0;
    const half = length / 2;
    gradient = g.createLinearGradient(
      cx + dx * (shift - half), cy + dy * (shift - half),
      cx + dx * (shift + half), cy + dy * (shift + half)
    );
  }

  // Sorted only here, at the moment of painting. The document keeps the stops
  // in the order the user's controls address them (stop 1 is stops[0] however
  // far along it has been dragged), so re-ordering them in the document would
  // move a colour control onto a different stop mid-drag.
  const stops = (Array.isArray(layer.stops) && layer.stops.length > 0
    ? [...layer.stops]
    : DEFAULT_GRADIENT_STOPS.map((stop) => ({ ...stop })))
    .sort((a, b) => a.at - b.at);

  stops.forEach((stop, index) => {
    const fallback = DEFAULT_GRADIENT_STOPS[Math.min(index, DEFAULT_GRADIENT_STOPS.length - 1)];
    // Parsed every frame for the same reason the solid layer parses its
    // colour: a SignalRGB control writes its raw value straight in here.
    gradient.addColorStop(clamp(Number(stop.at) || 0, 0, 100) / 100,
      normalizeColor(stop.color, fallback.color));
  });

  return gradient;
}

/**
 * The padded half-resolution source the warp path samples from.
 *
 * The padding needs no edge trick at all: the gradient is simply painted
 * across the padded area as well, so what warp reaches into out there is the
 * ramp's own natural continuation rather than a stretched border.
 *
 * Cached whenever the layer is still, and rebuilt every frame when it drifts —
 * which is what lets drift keep its full meaning under warp (see the note at
 * the top of this file). The cache key is everything the painting depends on;
 * `null` while drifting so a later still frame cannot reuse a drifted buffer.
 */
function buildSource(layer, state, drift, timeSec) {
  const key = drift ? null : `${layer.shape}|${layer.angle}|`
    + (Array.isArray(layer.stops) ? layer.stops.map((s) => `${s.at}:${s.color}`).join(',') : '');
  if (key !== null && state.sourceKey === key && state.source) return state.source;

  if (!state.paint) {
    state.paint = document.createElement('canvas');
    state.paint.width = SOURCE_WIDTH;
    state.paint.height = SOURCE_HEIGHT;
    state.paintCtx = state.paint.getContext('2d', { willReadFrequently: true });
  }
  const g = state.paintCtx;
  // Canvas coordinates in, buffer pixels out: the visible 320 x 200 lands on
  // the buffer's inner area and the pad is whatever lies just outside it.
  g.setTransform(BUFFER_SCALE, 0, 0, BUFFER_SCALE, BUFFER_PAD, BUFFER_PAD);
  const overhang = BUFFER_PAD / BUFFER_SCALE;
  g.fillStyle = buildGradient(g, layer, drift, timeSec);
  g.fillRect(-overhang, -overhang, CANVAS_WIDTH + 2 * overhang, CANVAS_HEIGHT + 2 * overhang);
  g.setTransform(1, 0, 0, 1, 0, 0);

  const source = {
    data: g.getImageData(0, 0, SOURCE_WIDTH, SOURCE_HEIGHT).data,
    width: SOURCE_WIDTH,
    height: SOURCE_HEIGHT
  };
  state.source = source;
  state.sourceKey = key;
  return source;
}

export function render(ctx, layer, asset, timeSec, state) {
  // The same fixed order as every other layer type: drift, then warp, then
  // breathe, decided by kind and never by the order the list happens to be in.
  const motions = Array.isArray(layer.motions) ? layer.motions : [];
  const drift = motions.find((motion) => motion.kind === 'drift') ?? null;
  const warp = motions.find((motion) => motion.kind === 'warp') ?? null;
  const breathe = motions.find((motion) => motion.kind === 'breathe') ?? null;

  const previousAlpha = ctx.globalAlpha;
  if (breathe) {
    ctx.globalAlpha = clamp(previousAlpha * breatheFactor(breathe, timeSec), 0, 1);
  }

  if (warp) {
    drawWarped(ctx, state, buildSource(layer, state, drift, timeSec), {
      amplitude: (warp.amount / 100) * MAX_AMPLITUDE,
      phase: timeSec * speedToRate(warp.speed) * WARP_SPEED_SCALE
    });
  } else {
    // No buffer, no resample: a gradient with no warp on it is one fill of the
    // real canvas at full resolution, which is both cheaper and sharper than
    // going through the half-resolution buffer would be.
    ctx.fillStyle = buildGradient(ctx, layer, drift, timeSec);
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  }

  ctx.globalAlpha = previousAlpha;
}
