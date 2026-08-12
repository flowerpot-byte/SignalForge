// SignalForge — build SignalRGB effects from images, gradients, shapes and particles.
// Copyright (C) 2026 Max Leopold Blumenschein
// SPDX-License-Identifier: GPL-3.0-or-later
import {
  CANVAS_WIDTH, CANVAS_HEIGHT, clamp, normalizeColor, colorAtPosition,
  DEFAULT_GRADIENT_STOPS, MIN_BANDS, MAX_BANDS, DEFAULT_BANDS
} from '../document.js';
import { speedToRate } from '../motion/speed.js';
import { breatheFactor } from '../motion/breathe.js';
import { pulseFactor } from '../motion/pulse.js';
import { spinDegrees } from '../motion/spin.js';
import { driftSwing, DRIFT_CENTRE_REACH } from '../motion/drift.js';
import { WARP_SPEED_SCALE } from '../motion/warp.js';
import {
  BUFFER_PAD, BUFFER_SCALE, SOURCE_WIDTH, SOURCE_HEIGHT, MAX_AMPLITUDE, drawWarped
} from './warp-buffer.js';

/**
 * Colour laid across the canvas, in five arrangements.
 *
 * One layer type covers all five — see GRADIENT_SHAPES in
 * src/engine/document.js for why the shape is a FIELD and not five layer
 * types. Three of them are new since the two the app opened with, and the
 * reason each earned its place on a light strip rather than on a screen is
 * worth stating, because "more shapes" is not by itself a reason for any of
 * them:
 *
 *   linear   the ramp runs across the canvas along `angle`.
 *   radial   the ramp runs outwards from the middle.
 *   conic    the ramp is swept around the middle: the colour at a point
 *            depends on the ANGLE from the centre rather than the distance.
 *            This is the one arrangement in which every LED around a case
 *            gets a different colour while the ones on the same side of it
 *            agree, which is what a colour wheel looks like on hardware and
 *            what nothing else here can produce.
 *   stripes  the ramp repeated with hard edges. The only shape in the set with
 *            a discontinuity in it, and that is the point: an LED strip
 *            sampling a smooth ramp shows neighbouring lamps that differ by a
 *            few units, which reads as one colour. Bands are what make
 *            individual lamps visibly different from their neighbours.
 *   waves    the ramp repeated smoothly, swinging out to the far colour and
 *            back with no seam at all. Stripes' opposite: the same repetition
 *            with every edge taken out of it.
 *
 * ---------------------------------------------------------------------------
 * WHAT MOTIONS DO HERE, AND IN WHICH ORDER
 * ---------------------------------------------------------------------------
 *
 * THIS IS THE PROJECT'S CANONICAL STATEMENT OF THE ORDER, and it is here rather
 * than in a document because this is the only layer type that performs all five
 * — the other three files each say which of them they leave out and why, and
 * each points back here rather than restating the list. (layers/image.js: no
 * spin, a picture cannot be turned inside its own frame. layers/solid.js: no
 * spin, drift or warp, a uniform field is invariant under all three.
 * layers/shape.js: no warp, the warp buffer is opaque by construction.)
 *
 * The order is fixed by KIND and never by the order the list happens to be in
 * (the same rule every layer type follows), and it is:
 *
 *      spin -> drift -> warp -> pulse -> breathe
 *
 * ONE KIND MEANS SOMETHING DIFFERENT ON ONE LAYER TYPE, and it is written down
 * in both places so neither can quietly drift. Spin turns the field about the
 * middle of the CANVAS here, because a gradient has no other centre to turn
 * about; on a shape layer it turns the figure about ITS OWN centre, because a
 * figure does have one and its own is what "the star is spinning" means. Its
 * place in the order is the same on both, and for the same reason: it is the
 * only motion that changes the geometry the rest are then built on.
 *
 *   spin     turns the whole arrangement about the middle of the canvas. It is
 *            FIRST because it is the only motion that changes the GEOMETRY the
 *            others then work on: it is folded into the angle before a single
 *            colour stop is placed, so everything downstream — the drift along
 *            the axis, the buffer the warp samples — is built from the turned
 *            field rather than applied to a picture that is turned afterwards.
 *            Turning it afterwards would mean turning the warped result, and
 *            the warp's own waves would visibly turn with the colours, which
 *            is not what "the pattern is spinning" means.
 *   drift    the ramp slides. Linear, stripes and waves: along their own axis,
 *            so the colours sweep across the surface. Radial and conic: the
 *            centre wanders in a slow ellipse. It swings back and forth (a
 *            sine) rather than marching endlessly in one direction — an
 *            endless march would need the ramp to wrap around, and a wrap
 *            between the last colour and the first is a hard seam crossing the
 *            surface unless the two happen to match.
 *   warp     the same half-resolution wave field the picture layer uses (see
 *            layers/warp-buffer.js), so "warp at strength 60" means the same
 *            amount of bend whatever is underneath it. On a ramp it reads as
 *            the colour bands rippling.
 *   pulse    a factor on ctx.globalAlpha.
 *   breathe  a factor on ctx.globalAlpha as well.
 *
 * The last two are multiplications into the same number, so their order
 * between themselves cannot change a pixel; it is written down all the same,
 * because "it does not matter" is a fact about today's two alpha motions and
 * not a licence for the next one.
 *
 * The one place this deliberately differs from the picture layer: when drift
 * and warp run together, the picture layer halves both their budgets and
 * shifts its sampling window inside the padding, because rebuilding its source
 * buffer means decoding and rescaling a photograph. A gradient's source buffer
 * is a handful of canvas calls, so drift is painted straight into it at full
 * strength and warp keeps its whole amplitude. Drift therefore means the same
 * thing with and without warp here, which on the picture layer it does not.
 */

/** At full strength, a linear drift slides the ramp this much of its length. */
const LINEAR_DRIFT_REACH = 0.5;
/**
 * At full strength, a radial drift moves the centre this much of the canvas.
 *
 * The number and the swing it is multiplied by both live in motion/drift.js
 * now, because the shape layer wanders by exactly the same amount along
 * exactly the same curve — see the note over driftSwing there. This name is
 * kept as a local alias so the four places below that read it still say which
 * of the two reaches they mean.
 */
const RADIAL_DRIFT_REACH = DRIFT_CENTRE_REACH;

/** The canvas diagonal, which is also how far a drifting centre can wander at most. */
const CANVAS_DIAGONAL = Math.sqrt(CANVAS_WIDTH * CANVAS_WIDTH + CANVAS_HEIGHT * CANVAS_HEIGHT);

/** Half the canvas diagonal: a radial gradient that reaches every corner. */
const RADIAL_RADIUS = CANVAS_DIAGONAL / 2;

/**
 * How many colour samples one repeat of a wave is built from.
 *
 * A wave's colour is ramp(0.5 - 0.5*cos(2*pi*u)) — a curve, and a CanvasGradient
 * can only interpolate straight lines between the stops it is given, so the
 * curve is approximated by chords. 16 per repeat puts each chord across 22.5
 * degrees of the cosine, whose greatest departure from the true curve is
 * 1 - cos(11.25 degrees) = 1.9 % of the swing: under half a unit on an
 * 8-bit channel, i.e. below what the canvas could show even if somebody
 * looked for it. Doubling it would double the per-frame stop count for
 * nothing.
 */
const WAVE_SAMPLES = 16;

/**
 * The cached picture of a conic sweep, and what sizes it.
 *
 * WHY A CACHED PICTURE AND NOT createConicGradient
 *
 * Chromium has had createConicGradient since version 92 and Electron's
 * certainly does. SignalRGB's does not certainly: its user agent claims
 * Chrome 85 and is known to be a frozen lie (structuredClone is present, which
 * needs 98), so the honest statement about the host's real version is that
 * nobody knows it — see docs/erkenntnisse-signalrgb-motor.md. A shape built on
 * an API that might be absent would export an effect that renders black on
 * somebody's keyboard while the preview here looked perfect, which is exactly
 * the class of failure this project has spent its measurements avoiding. So
 * the sweep is built out of wedges — moveTo, arc, fill — which have been in
 * canvas since it existed.
 *
 * WHY IT IS CACHED, AND WHAT THE CACHE IS KEYED ON
 *
 * 360 wedge fills is not something to do 30 times a second. It does not have
 * to be: turning a conic sweep is the same thing as turning the picture of
 * one, so the wheel is drawn once and every frame after that is one rotated
 * drawImage. The cache is keyed on everything the PICTURE depends on — the
 * band count, and each stop's COLOUR AND ITS POSITION — and deliberately not
 * on the angle or on the spin, which are the transform and change every frame.
 *
 * The positions belong in that key and were once missing from it, which is
 * worth writing down because the bug it caused was invisible from the outside:
 * every wedge takes its colour from colorAtPosition(stops, ...), so a stop
 * dragged from 50 to 20 changes every pixel of the wheel — but on a renderer
 * that had already drawn one, the key was unchanged and the old picture was
 * handed straight back. The Position slider did nothing at all on a colour
 * wheel until the app was restarted. A cache key must list everything its value
 * is a function of; anything less is a stale picture waiting for the right
 * gesture.
 *
 * CONIC_TEXTURE is the size it is drawn at and conicSpan() below says how many
 * canvas units wide it is then painted. Drawn smaller than it is shown on
 * purpose: a sweep is a smooth ramp with no detail in it to lose, the up-scale
 * costs one bilinear pass the GPU-less host does anyway, and building it at 256
 * instead of at its painted size is several times less area to fill on every
 * rebuild — which is what a colour-stop drag does, once per frame, while the
 * mouse is down.
 */
const CONIC_TEXTURE = 256;
const CONIC_WEDGES = 360;

/** How far outside the canvas the warp buffer's padding reaches, in canvas units. */
const CONIC_OVERHANG = BUFFER_PAD / BUFFER_SCALE;

/**
 * Half the diagonal of the area that has to end up covered: the canvas plus
 * the warp buffer's padding (360 x 240 canvas units), measured from the middle
 * of the canvas. A square of side 2 * this, however it is rotated, contains
 * every point of that area — its inscribed circle already does.
 */
const CONIC_REACH = Math.sqrt(
  (CANVAS_WIDTH + 2 * CONIC_OVERHANG) * (CANVAS_WIDTH + 2 * CONIC_OVERHANG)
  + (CANVAS_HEIGHT + 2 * CONIC_OVERHANG) * (CANVAS_HEIGHT + 2 * CONIC_OVERHANG)
) / 2;

/**
 * How wide the wheel is painted, in canvas units.
 *
 * A fixed 440 used to be enough, and the reasoning behind it was right about
 * everything except the centre: it covered the padded area at any ROTATION,
 * because a conic standing still is centred on the middle of the canvas and
 * only turns. A conic that DRIFTS does not stay there — driftedCentre below
 * moves it by up to RADIAL_DRIFT_REACH of the canvas in each direction, i.e.
 * 96 x 60 units at full strength — and the square went with it, so the far
 * corner of the canvas fell outside the picture. What was left there was black
 * (up to 11 % of the frame, measured), or, under warp, whatever the previous
 * frame had put in that corner of the source buffer, which nothing clears.
 *
 * So the span is sized from the drift as well: the wheel must reach from
 * wherever the centre has wandered to (at most `wander` from the middle) out to
 * the far corner of the padded area (CONIC_REACH from the middle). This fixes
 * the cause rather than painting over it — the alternative, clearing or filling
 * the whole padded area before every conic frame, would charge every conic
 * effect for a fault only a drifting one can have, and the cost table would
 * stop matching what a still conic really does. A conic that does not drift
 * pays nothing here: with no drift this is 433, which is the old 440 without
 * its rounding.
 *
 * What it does cost is sharpness, and only while drifting: the same 256-pixel
 * texture is stretched across a wider square, so at full drift the visible
 * canvas is drawn from a 2.6x up-scale instead of a 1.7x one. On a smooth
 * sweep that is nothing to see; on its one hard edge (where the last colour
 * meets the first) it widens the blend from under two canvas pixels to under
 * three, which is still narrower than one LED.
 */
function conicSpan(drift) {
  const amount = drift ? Math.abs(Number(drift.amount) || 0) : 0;
  const wander = (amount / 100) * RADIAL_DRIFT_REACH * CANVAS_DIAGONAL;
  return 2 * (CONIC_REACH + wander);
}

export function createState() {
  return {
    warp: null, buffer: null, bufferCtx: null, imageData: null,
    paint: null, paintCtx: null, source: null, sourceKey: null,
    conic: null, conicCtx: null, conicKey: null
  };
}

/** The layer's stops, in ramp order, with every colour parsed. */
function rampStops(layer) {
  const raw = Array.isArray(layer.stops) && layer.stops.length > 0
    ? layer.stops
    : DEFAULT_GRADIENT_STOPS;
  // Sorted only here, at the moment of painting. The document keeps the stops
  // in the order the user's controls address them (stop 1 is stops[0] however
  // far along it has been dragged), so re-ordering them in the document would
  // move a colour control onto a different stop mid-drag.
  return raw.map((stop, index) => {
    const fallback = DEFAULT_GRADIENT_STOPS[Math.min(index, DEFAULT_GRADIENT_STOPS.length - 1)];
    return {
      // Parsed every frame for the same reason the solid layer parses its
      // colour: a SignalRGB control writes its raw value straight in here.
      at: clamp(Number(stop.at) || 0, 0, 100),
      color: normalizeColor(stop.color, fallback.color)
    };
  }).sort((a, b) => a.at - b.at);
}

/** Whole repeats of the ramp, however the document arrived. */
function bandCount(layer) {
  const raw = Math.round(Number(layer.bands));
  return clamp(Number.isFinite(raw) ? raw : DEFAULT_BANDS, MIN_BANDS, MAX_BANDS);
}

/**
 * Place the colour stops of a repeating shape onto an already-built ramp.
 *
 * `add(offset, color)` is CanvasGradient.addColorStop with the offset already
 * known to be inside 0..1. Both shapes below walk the axis once and hand over
 * a stop per boundary, so the cost is proportional to bands and not to pixels.
 */
function addRepeatingStops(add, layer, stops) {
  const bands = bandCount(layer);

  if (layer.shape === 'stripes') {
    // Equal, hard-edged bands: one per colour, repeated. A hard edge is two
    // stops at the SAME offset — the one before it ends the outgoing colour,
    // the one after begins the incoming one, and the canvas paints no ramp
    // between two stops that share a position.
    //
    // The stop POSITIONS are deliberately not used here, only the colours and
    // their order. A band has one colour throughout, so there is nothing along
    // it for a position to mean, and the two ends of the default ramp (0 and
    // 100) would degenerate to a single band covering everything. The settings
    // column therefore stops offering the position sliders while stripes is
    // chosen, the same way it stops offering the angle for a radial — see
    // describeInspector in app/renderer/components/inspector.js.
    const total = bands * stops.length;
    for (let index = 0; index < total; index += 1) {
      const color = stops[index % stops.length].color;
      add(index / total, color);
      add((index + 1) / total, color);
    }
    return;
  }

  // waves: the ramp swung out and back by a cosine, once per band, so the
  // repeat has no seam in it at all — position 0 and position 1 of every
  // repeat are both the ramp's own first colour.
  const samples = bands * WAVE_SAMPLES;
  for (let index = 0; index <= samples; index += 1) {
    const into = (index % WAVE_SAMPLES) / WAVE_SAMPLES;
    const along = 0.5 - 0.5 * Math.cos(2 * Math.PI * into);
    add(index / samples, colorAtPosition(stops, along * 100));
  }
}

/**
 * Build the CanvasGradient for a shape that runs along a line or outwards from
 * a point, in CANVAS coordinates (0..320, 0..200) whatever it is about to be
 * painted into. The buffer path below scales the drawing context instead of
 * scaling these numbers, so there is one definition of where the ramp runs and
 * both paths are provably the same gradient.
 *
 * `angle` arrives already turned by any spin — see the order at the top of
 * this file.
 */
function buildGradient(g, layer, angle, centre, drift, timeSec) {
  const swing = drift ? driftSwing(drift, timeSec) : null;
  const stops = rampStops(layer);

  let gradient;
  if (layer.shape === 'radial') {
    gradient = g.createRadialGradient(centre.x, centre.y, 0, centre.x, centre.y, RADIAL_RADIUS);
  } else {
    const radians = (angle * Math.PI) / 180;
    const dx = Math.cos(radians);
    const dy = Math.sin(radians);
    // How far the canvas reaches along that direction: the projection of the
    // rectangle onto it. Using the diagonal instead would leave the extreme
    // colours off the edge at every angle but 45 degrees.
    const length = Math.abs(CANVAS_WIDTH * dx) + Math.abs(CANVAS_HEIGHT * dy);
    const shift = swing ? (drift.amount / 100) * LINEAR_DRIFT_REACH * length * swing.x : 0;
    const half = length / 2;
    const cx = CANVAS_WIDTH / 2;
    const cy = CANVAS_HEIGHT / 2;
    gradient = g.createLinearGradient(
      cx + dx * (shift - half), cy + dy * (shift - half),
      cx + dx * (shift + half), cy + dy * (shift + half)
    );
  }

  const add = (offset, color) => gradient.addColorStop(clamp(offset, 0, 1), color);
  if (layer.shape === 'stripes' || layer.shape === 'waves') addRepeatingStops(add, layer, stops);
  else for (const stop of stops) add(stop.at / 100, stop.color);

  return gradient;
}

/**
 * Draw (or reuse) the picture of the conic sweep — see the note on
 * CONIC_TEXTURE above for why it is a picture at all.
 */
function ensureConic(layer, state) {
  const stops = rampStops(layer);
  const bands = bandCount(layer);
  // Everything the picture is a function of. The positions are in here because
  // every wedge's colour comes out of colorAtPosition, which reads them — see
  // the note above CONIC_TEXTURE for what leaving them out cost.
  const key = `${bands}|${stops.map((stop) => `${stop.at}:${stop.color}`).join(',')}`;
  if (state.conicKey === key && state.conic) return state.conic;

  if (!state.conic) {
    state.conic = document.createElement('canvas');
    state.conic.width = CONIC_TEXTURE;
    state.conic.height = CONIC_TEXTURE;
    state.conicCtx = state.conic.getContext('2d');
  }
  const g = state.conicCtx;
  const middle = CONIC_TEXTURE / 2;
  // Radius past the corners of its own square, so no wedge leaves a gap: the
  // half-diagonal is middle * sqrt(2), and CONIC_TEXTURE is comfortably above it.
  const radius = CONIC_TEXTURE;
  const step = (2 * Math.PI) / CONIC_WEDGES;

  // An OPAQUE base under the wedges, and not a clearRect, which is what used to
  // be here. 360 wedges meeting at one point do not add up to an opaque
  // picture: each is drawn anti-aliased, and near the apex a wedge is narrower
  // than a pixel, so what a pixel there gets is 360 partial coverages composited
  // over each other — which approaches full opacity without reaching it.
  // Measured: a disc of some 57 texture pixels' radius around the middle (that
  // being where one wedge stops being a pixel wide) came out between 77 % and
  // 100 % opaque.
  //
  // A picture meant to cover everything must itself cover everything, and the
  // consequences of its not doing so were real: on the warp path the source
  // buffer is not cleared, so the PREVIOUS frame showed through the middle of
  // the wheel by up to 23 %; on the direct path the black the renderer fills
  // with did, darkening the middle; and on a document with a layer underneath,
  // that layer would have.
  //
  // The base is the ramp's own starting colour. It can only show through where
  // the wedges are thinner than a pixel, i.e. right at the middle — which is the
  // one place on a colour wheel where every colour of the ramp meets anyway, and
  // is at most three canvas pixels wide once the texture is scaled up.
  g.fillStyle = colorAtPosition(stops, 0);
  g.fillRect(0, 0, CONIC_TEXTURE, CONIC_TEXTURE);
  for (let index = 0; index < CONIC_WEDGES; index += 1) {
    // The colour of the middle of the wedge, so the ramp is sampled evenly
    // rather than at one of its ends.
    const around = ((index + 0.5) / CONIC_WEDGES) * bands;
    const along = around - Math.floor(around);
    g.fillStyle = colorAtPosition(stops, along * 100);
    g.beginPath();
    g.moveTo(middle, middle);
    // A hair of overlap between neighbours (the extra `step`), because a seam
    // of background between two wedges would be a black hairline running out
    // from the centre 360 times.
    g.arc(middle, middle, radius, index * step, (index + 2) * step);
    g.closePath();
    g.fill();
  }

  state.conicKey = key;
  return state.conic;
}

/**
 * Paint the layer across `area`, in canvas coordinates.
 *
 * The one place the five shapes part company: four of them are a CanvasGradient
 * and one fill, the conic is a rotated picture. Everything before this point —
 * the angle, the drifted centre — is worked out the same way for all five.
 */
function paintGradient(g, layer, angle, centre, drift, timeSec, area, state) {
  if (layer.shape === 'conic') {
    const wheel = ensureConic(layer, state);
    // Wide enough to reach past the far corner from wherever the drift has
    // taken the centre, so the whole area is covered and nothing has to be
    // cleared first — see conicSpan.
    const span = conicSpan(drift);
    g.save();
    g.translate(centre.x, centre.y);
    g.rotate((angle * Math.PI) / 180);
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    g.drawImage(wheel, -span / 2, -span / 2, span, span);
    g.restore();
    return;
  }
  g.fillStyle = buildGradient(g, layer, angle, centre, drift, timeSec);
  g.fillRect(area.x, area.y, area.width, area.height);
}

/**
 * Where the middle of a radial or conic sweep sits this frame.
 *
 * Still in the middle of the canvas unless the layer drifts, in which case it
 * wanders in a slow ellipse — and a spin turns that wandering point about the
 * canvas centre with it, which is the only way spin is visible on a shape that
 * is otherwise symmetric about its own middle. A radial that does not drift
 * therefore looks the same spinning as standing still, and that is not a bug
 * to fix: it is what "a ramp running outwards from the middle" means. The
 * motion is offered on the layer type all the same, for the same reason the
 * angle slider is (see src/export/effect-controls.js) — the shape can be
 * switched from SignalRGB's own panel, and a motion that vanished from the
 * list on one shape would be a dead end on the next.
 */
function driftedCentre(drift, spinAngle, timeSec) {
  const cx = CANVAS_WIDTH / 2;
  const cy = CANVAS_HEIGHT / 2;
  if (!drift) return { x: cx, y: cy };
  const swing = driftSwing(drift, timeSec);
  const reach = (drift.amount / 100) * RADIAL_DRIFT_REACH;
  const ox = reach * CANVAS_WIDTH * swing.x;
  const oy = reach * CANVAS_HEIGHT * swing.y;
  const radians = (spinAngle * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return { x: cx + ox * cos - oy * sin, y: cy + ox * sin + oy * cos };
}

/**
 * The padded half-resolution source the warp path samples from.
 *
 * The padding needs no edge trick at all: the gradient is simply painted
 * across the padded area as well, so what warp reaches into out there is the
 * ramp's own natural continuation rather than a stretched border.
 *
 * Cached whenever the layer is still, and rebuilt every frame when it drifts or
 * spins — which is what lets those two keep their full meaning under warp (see
 * the note at the top of this file). The cache key is everything the painting
 * depends on; `null` while moving so a later still frame cannot reuse a moved
 * buffer.
 */
function buildSource(layer, state, angle, centre, drift, moving, timeSec) {
  const key = moving ? null : `${layer.shape}|${layer.angle}|${bandCount(layer)}|`
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
  paintGradient(g, layer, angle, centre, drift, timeSec, {
    x: -overhang,
    y: -overhang,
    width: CANVAS_WIDTH + 2 * overhang,
    height: CANVAS_HEIGHT + 2 * overhang
  }, state);
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
  // The same fixed order as every other layer type: spin, then drift, then
  // warp, then the two opacity motions — decided by kind and never by the
  // order the list happens to be in. See the note at the top of this file.
  const motions = Array.isArray(layer.motions) ? layer.motions : [];
  const spin = motions.find((motion) => motion.kind === 'spin') ?? null;
  const drift = motions.find((motion) => motion.kind === 'drift') ?? null;
  const warp = motions.find((motion) => motion.kind === 'warp') ?? null;
  const pulse = motions.find((motion) => motion.kind === 'pulse') ?? null;
  const breathe = motions.find((motion) => motion.kind === 'breathe') ?? null;

  const turned = spin ? spinDegrees(spin, timeSec) : 0;
  const angle = (Number(layer.angle) || 0) + turned;
  const centre = driftedCentre(drift, turned, timeSec);

  const previousAlpha = ctx.globalAlpha;
  let alpha = previousAlpha;
  if (pulse) alpha *= pulseFactor(pulse, timeSec);
  if (breathe) alpha *= breatheFactor(breathe, timeSec);
  if (alpha !== previousAlpha) ctx.globalAlpha = clamp(alpha, 0, 1);

  if (warp) {
    // "Moving" is what makes the cached source buffer unusable: a spin that is
    // standing still (strength 0) must not cost a rebuild per frame, so it is
    // the turn that counts and not the presence of an entry.
    const moving = Boolean(drift) || turned !== 0;
    drawWarped(ctx, state, buildSource(layer, state, angle, centre, drift, moving, timeSec), {
      amplitude: (warp.amount / 100) * MAX_AMPLITUDE,
      phase: timeSec * speedToRate(warp.speed) * WARP_SPEED_SCALE
    });
  } else {
    // No buffer, no resample: a gradient with no warp on it is one fill of the
    // real canvas at full resolution, which is both cheaper and sharper than
    // going through the half-resolution buffer would be.
    paintGradient(ctx, layer, angle, centre, drift, timeSec, {
      x: 0, y: 0, width: CANVAS_WIDTH, height: CANVAS_HEIGHT
    }, state);
  }

  ctx.globalAlpha = previousAlpha;
}
