// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import {
  CANVAS_WIDTH, CANVAS_HEIGHT, clamp, normalizeColor, DEFAULT_SOLID_COLOR,
  SHAPE_FIGURES, MIN_SHAPE_SIZE, MAX_SHAPE_SIZE, DEFAULT_SHAPE_SIZE,
  MIN_SHAPE_THICKNESS, MAX_SHAPE_THICKNESS, DEFAULT_SHAPE_THICKNESS,
  MIN_STAR_POINTS, MAX_STAR_POINTS, DEFAULT_STAR_POINTS, SPINNABLE_FIGURES
} from '../document.js';
import { breatheFactor } from '../motion/breathe.js';
import { pulseFactor } from '../motion/pulse.js';
import { spinRadians } from '../motion/spin.js';
import { driftSwing, DRIFT_CENTRE_REACH } from '../motion/drift.js';

/**
 * One filled figure on transparent ground.
 *
 * ===========================================================================
 * WHY THIS LAYER TYPE EXISTS AT ALL
 * ===========================================================================
 *
 * Two reasons, and the second is the one nothing else in this engine could
 * supply.
 *
 * The first is the complaint: "zu wenig Formen". Every layer this app had
 * before this one paints the WHOLE canvas — a picture, a colour, a ramp — so
 * there was no way to put a thing somewhere. docs/effekt-inventur.md, section
 * A5, counts six of the 31 effects read as figures built out of angle
 * arithmetic, and C4 puts this fourth on the list of what to build.
 *
 * The second is the trail. docs/effekt-inventur.md, section C2, closes with an
 * admission: a veil is laid UNDER what is being drawn, so any layer that
 * repaints all 320 x 200 opaquely hides its own wake completely, and the trail
 * slider therefore did nothing on the documents the app could actually make
 * unless a layer's opacity was pulled down or an alpha motion was running.
 * "The real beneficiary is C1, the particles: they never cover the canvas."
 * Neither does this. A drifting figure with a trail behind it is the first
 * thing in SignalForge that shows a wake for the reason a wake exists.
 *
 * SO: THIS RENDERER MUST NEVER FILL THE CANVAS. It draws a path and fills the
 * path, and it clears nothing, ever. Every pixel outside the figure keeps
 * whatever was underneath it — the layers below, and the veil of the frames
 * before. Reaching for a fillRect here, for any reason at all (a background, a
 * clear, a "let me just wipe the padding"), takes that away and there is no
 * test in this project that would obviously go red for it except the one that
 * was written for exactly this: 'a drifting shape with a trail leaves a ghost'
 * in test/engine/shape-layer.test.js.
 *
 * ===========================================================================
 * WHERE THE MATHS COMES FROM
 * ===========================================================================
 *
 * The star and the heart are `Vibe`'s, the one effect in the corpus that draws
 * figures for their own sake — `C:\Users\Max\AppData\Local\WhirlwindFX\
 * SignalRgb\cache\effects\-NyghEBs8-mYkxU6qRFv\effect.html`, its `drawStar`
 * (ten lineTo in and out between two radii) and `drawHeart` (four
 * bezierCurveTo). docs/effekt-inventur.md A5 names both and A15 records that
 * `bezierCurveTo` occurs exactly once in 31 files — in this one — which is the
 * only evidence there is that the host's canvas has it. That is why the heart
 * is drawn with the same call rather than approximated out of arcs.
 *
 * WHAT WAS CHANGED, AND WHY EACH TIME
 *
 *  - `Vibe`'s drawHeart carries `sizeScale = 2` and `yOffset = -60`: two magic
 *    numbers that place the heart in ITS canvas, not in a description of the
 *    heart. They are gone. What replaces them is a size contract that holds
 *    for all four figures (see SIZE, below), so switching the figure from
 *    SignalRGB's own panel does not change how big the thing is.
 *  - `Vibe`'s drawStar hardcodes `spikes = 5` and `innerRadius = outer * 0.5`.
 *    The point count is a field here, because it is the one number that makes
 *    a star a different star; the ratio stays 0.5, because that is what makes
 *    a five-pointed star look like the one everybody pictures, and a second
 *    slider for it would be a control whose whole range is "still a star".
 *  - Both of `Vibe`'s helpers call ctx.fill() themselves and drawHeart also
 *    calls beginPath(). Here every figure only BUILDS a path and the one fill
 *    is below, so the ring can be two subpaths and nothing else has to know.
 *
 * ===========================================================================
 * SIZE, POSITION AND THE PIVOT
 * ===========================================================================
 *
 * SIZE is a percent of the canvas height and it names the diameter of the
 * circle the figure is drawn inside — the same sentence for all four figures,
 * so the size does not change meaning when the figure does. See MIN_SHAPE_SIZE
 * in src/engine/document.js.
 *
 * POSITION is a percent of each edge, 50/50 being the middle of the canvas.
 *
 * THE PATH IS BUILT IN LOCAL COORDINATES around (0, 0) and the context is
 * translated to the figure's centre. That is not tidiness: it is what makes
 * the spin below turn the figure about its own middle with no arithmetic at
 * all, and it is what lets the star's cached vertices be independent of where
 * the figure is (see ensureStar).
 *
 * ---------------------------------------------------------------------------
 * WHAT MOTIONS DO HERE, AND IN WHICH ORDER
 * ---------------------------------------------------------------------------
 *
 * The order is fixed by KIND and never by the order the list happens to be in
 * — the same rule every layer type in this engine follows. The project's whole
 * order, and the reasoning behind it, is written out once in
 * layers/gradient.js, which is the only layer type that performs all five; this
 * is that order with the one kind this file does not offer taken out of it:
 *
 *      spin -> drift -> pulse -> breathe
 *
 *   spin     turns the figure about ITS OWN centre. This is the one place a
 *            motion means something different here than on a gradient, where
 *            spin turns the whole field about the middle of the CANVAS. A
 *            gradient has no other centre to turn about; a figure does, and
 *            its own is the one that makes "the star is spinning" mean what
 *            the words say. Turning an off-centre figure about the canvas
 *            middle instead would make it orbit, which is what drift already
 *            does and does better.
 *
 *            It is FIRST for the same reason it is first on a gradient: it
 *            changes the geometry everything downstream is built on. Drift
 *            then moves the turned figure rather than the turn moving the
 *            drifted one, so a shape that both drifts and spins wanders while
 *            rotating instead of being swung around on a string.
 *
 *            NOT OFFERED ON A CIRCLE OR A RING (see motionKindsFor in
 *            src/engine/document.js): both are symmetric about that very
 *            pivot, so the turn cannot change the figure. A spin entry that
 *            reaches this renderer anyway — a hand-edited project, or a figure
 *            switched from star to circle with the entry still on the layer —
 *            is kept in the document and NOT PERFORMED, exactly as the solid
 *            layer keeps and ignores a drift.
 *
 *            Ignored rather than performed, and the difference was measured
 *            rather than assumed. The mathematical circle is invariant under
 *            the turn; the RASTERISED one is not quite, because a canvas
 *            flattens an arc into a polyline in device space, so turning the
 *            context turns where the polyline's corners fall and the
 *            anti-aliased rim comes back a unit or two different. Measured on
 *            a 60-percent circle: a largest per-channel difference of 69 at
 *            the rim, none of it visible, all of it confined to the boundary.
 *            Invisible is not the standard this project works to — parity
 *            (test/export/parity.test.js) compares BYTES — so a motion that
 *            is documented as unable to change the picture must not change
 *            the bytes either. Skipping the rotate is what makes the claim
 *            exact instead of nearly true, and it is why
 *            'spin ... provably cannot turn a circle' in
 *            test/engine/shape-layer.test.js can demand a difference of 0.
 *   drift    moves the figure about the canvas, on the same swing and by the
 *            same reach a radial gradient's centre uses (motion/drift.js), so
 *            "drift at strength 60" is the same amount of wandering in both.
 *   pulse    a factor on ctx.globalAlpha.
 *   breathe  a factor on ctx.globalAlpha as well.
 *
 * WARP IS NOT HERE AND IS NOT OFFERED, and the reason is measurable rather
 * than aesthetic: drawWarped (layers/warp-buffer.js) writes an alpha of 255
 * into every pixel of the canvas by construction, so warping a figure would
 * paint an opaque 320 x 200 rectangle — hiding every layer beneath it and its
 * own wake with them, which is the one thing this layer type exists not to do.
 * Making that buffer carry alpha is a change to a file the picture and the
 * gradient both render through, under two parity tests; it is a real piece of
 * work and it is not this one. The note is also in document.js, beside the
 * list that does the refusing.
 */

/**
 * Where a star's inner vertices sit, as a fraction of the outer radius.
 *
 * `Vibe`'s own `innerRadius = outerRadius * 0.5`, kept rather than made a
 * field: the whole reachable range of such a slider is "still a star", and 0.5
 * is the ratio that makes the five-pointed one look like the shape the word
 * calls up. Named rather than inlined because the tests compute against it —
 * a point that lands where the arithmetic says is only a falsifiable claim if
 * both sides read the same number.
 */
export const STAR_INNER_RATIO = 0.5;

/**
 * Where a star's first outer point sits, in radians.
 *
 * `Vibe`'s `rot = Math.PI / 2 * 3`, i.e. straight up in canvas coordinates
 * (y grows downwards, so -y is up). A star that opened lying on its side would
 * be a star nobody recognises.
 */
export const STAR_FIRST_POINT = (Math.PI / 2) * 3;

/**
 * The heart's proportions, in units of its own width.
 *
 * `Vibe`'s heart is built inside a box of side `scaledSize` whose top-left is
 * at (x - S/2, y): the bottom tip is exactly at y + S and the sides are exactly
 * at x +/- S/2, so it is exactly S wide. It is NOT S tall, and that is the
 * number worth writing down rather than eyeballing.
 *
 * The two top lobes are cubic beziers whose ends are both at y + 0.3 S and
 * whose two control points are both at y. A cubic with P0y = P3y = a and
 * C1y = C2y = 0 is highest (in the -y sense) at t = 0.5, where it reads
 * a * ((1-t)^3 + t^3) = a * 0.25. So the topmost ink is at y + 0.3 * 0.25 S =
 * y + 0.075 S exactly, and the drawn figure is 0.925 S tall, not S.
 *
 * Which matters for one reason: the size contract says the figure is centred
 * on its own position. Centring the BOX would hang the heart 0.0375 S below
 * where it says it is — under 4 canvas pixels at size 50, which is exactly the
 * kind of error nobody sees and nobody can find afterwards. Centring the INK
 * is what these two constants are for, and it is what makes 'a heart is
 * vertically centred on its own position' a thing a test can measure.
 */
export const HEART_LOBE_TOP = 0.075;
export const HEART_INK_HEIGHT = 1 - HEART_LOBE_TOP;
/** Where the lobes' shoulders sit, and where the two bottom curves bend. */
const HEART_SHOULDER = 0.3;
const HEART_WAIST = (1 + HEART_SHOULDER) / 2;

export function createState() {
  return { starKey: null, starUnit: null };
}

/** The figure this layer draws, however the document arrived. */
function figureOf(layer) {
  const raw = typeof layer.figure === 'string' ? layer.figure : '';
  return SHAPE_FIGURES.includes(raw) ? raw : SHAPE_FIGURES[0];
}

/**
 * The figure's outer radius in canvas pixels — half the diameter `size` names.
 *
 * Clamped here and not trusted, for the reason every other layer re-reads its
 * own fields every frame: applyControls (src/engine/bind.js) writes a SignalRGB
 * control's raw value straight into the layer, so what arrives is whatever that
 * panel sent and not what normalizeDocument last approved.
 */
function radiusOf(layer) {
  const size = clamp(Number(layer.size) || DEFAULT_SHAPE_SIZE, MIN_SHAPE_SIZE, MAX_SHAPE_SIZE);
  return (size / 100) * CANVAS_HEIGHT / 2;
}

/** How many points a star has, however the document arrived. */
function pointsOf(layer) {
  const raw = Math.round(Number(layer.points));
  return clamp(Number.isFinite(raw) ? raw : DEFAULT_STAR_POINTS, MIN_STAR_POINTS, MAX_STAR_POINTS);
}

/** The ring's inner radius, as a fraction of its outer one. */
function holeOf(layer) {
  const thickness = clamp(
    Number(layer.thickness) || DEFAULT_SHAPE_THICKNESS, MIN_SHAPE_THICKNESS, MAX_SHAPE_THICKNESS
  );
  return 1 - thickness / 100;
}

/**
 * Where the middle of the figure sits this frame, in canvas pixels.
 *
 * The stored position, plus wherever the drift has swung it to. A shape with no
 * drift on it is exactly where the document says, to the pixel.
 */
export function shapeCentre(layer, drift, timeSec) {
  const position = layer.position && typeof layer.position === 'object' ? layer.position : {};
  const x = (clamp(Number(position.x) || 0, 0, 100) / 100) * CANVAS_WIDTH;
  const y = (clamp(Number(position.y) || 0, 0, 100) / 100) * CANVAS_HEIGHT;
  if (!drift) return { x, y };
  const swing = driftSwing(drift, timeSec);
  const reach = (clamp(Number(drift.amount) || 0, 0, 100) / 100) * DRIFT_CENTRE_REACH;
  return {
    x: x + reach * CANVAS_WIDTH * swing.x,
    y: y + reach * CANVAS_HEIGHT * swing.y
  };
}

/**
 * The star's vertices at UNIT radius, built once and kept on the layer's state.
 *
 * THE CACHE KEY IS THE POINT COUNT AND NOTHING ELSE, and that is a claim about
 * the VALUE rather than a shortcut. The conic's cache (layers/gradient.js) once
 * left the stop positions out of its key and the Position slider silently did
 * nothing until the app was restarted; the lesson written down there is that a
 * key must list everything its value is a function of. So the value here is
 * built to be a function of as little as possible: unit radius, origin at
 * (0, 0), no rotation. The outer radius is a multiplication applied when the
 * path is walked, the position is a translate, and the spin is a rotate — none
 * of the three can reach these numbers, so none of the three belongs in the
 * key. Anything that DID reach them (a second radius ratio as a field, a
 * per-point jitter) would have to be added to the key in the same edit.
 *
 * Worth caching at all because it is `points` sines and cosines per frame at 30
 * frames a second forever, against one multiply per vertex — and because the
 * point count is a slider somebody drags, so "rebuild when it changes" is a
 * real event and not a theoretical one.
 */
function ensureStar(layer, state) {
  const points = pointsOf(layer);
  if (state.starKey === points && state.starUnit) return state.starUnit;

  // x, y per vertex, outer and inner alternating: 2 vertices per point.
  const unit = new Float64Array(points * 4);
  const step = Math.PI / points;
  let rot = STAR_FIRST_POINT;
  let at = 0;
  for (let index = 0; index < points; index += 1) {
    unit[at] = Math.cos(rot);
    unit[at + 1] = Math.sin(rot);
    rot += step;
    unit[at + 2] = Math.cos(rot) * STAR_INNER_RATIO;
    unit[at + 3] = Math.sin(rot) * STAR_INNER_RATIO;
    rot += step;
    at += 4;
  }

  state.starKey = points;
  state.starUnit = unit;
  return unit;
}

/**
 * Lay the figure's path down around the origin. Builds only — the single fill
 * is the caller's, which is what lets the ring be two subpaths.
 */
function tracePath(ctx, layer, figure, radius, state) {
  ctx.beginPath();

  if (figure === 'circle') {
    ctx.arc(0, 0, radius, 0, Math.PI * 2, false);
    return;
  }

  if (figure === 'ring') {
    // A hole rather than a stroke, and the difference is the whole point: what
    // is inside a ring has to be TRANSPARENT, so that the layers underneath and
    // the wake of the frames before show through it. Two subpaths wound in
    // OPPOSITE directions do that under the canvas's default non-zero fill
    // rule — the outer circle contributes +1 to the winding number, the inner
    // one -1, and the two cancel exactly where they overlap.
    //
    // Deliberately not fill('evenodd'), which would say the same thing: the
    // rule argument to fill() is a later addition to the canvas API and the
    // host's real browser version is unknown (see the note on the conic in
    // layers/gradient.js), whereas arc()'s anticlockwise flag has been there
    // since canvas existed. Deliberately not a stroke either: a stroke is
    // centred on its path, so the outer edge of the figure would sit half a
    // wall-thickness outside the radius `size` promises.
    ctx.arc(0, 0, radius, 0, Math.PI * 2, false);
    ctx.arc(0, 0, radius * holeOf(layer), 0, Math.PI * 2, true);
    return;
  }

  if (figure === 'star') {
    const unit = ensureStar(layer, state);
    ctx.moveTo(unit[0] * radius, unit[1] * radius);
    for (let at = 2; at < unit.length; at += 2) {
      ctx.lineTo(unit[at] * radius, unit[at + 1] * radius);
    }
    ctx.closePath();
    return;
  }

  // heart. `Vibe`'s four curves, with its two magic numbers replaced by the
  // size contract: S is the figure's width, and the box is lifted so that the
  // INK (not the box) is centred on the origin — see HEART_LOBE_TOP.
  const s = radius * 2;
  const top = -(HEART_INK_HEIGHT / 2 + HEART_LOBE_TOP) * s;
  const half = s / 2;
  const shoulder = top + HEART_SHOULDER * s;
  const waist = top + HEART_WAIST * s;
  const tip = top + s;

  // `Vibe`'s own single closed outline: down the left side, back up the right.
  // Every control point is an exact negative of its partner and every one of
  // the eight numbers above is a whole number of canvas pixels at the default
  // size, so the PATH is symmetric to the last bit — which is not a claim to
  // take on trust, it is checked in test/engine/shape-layer.test.js against the
  // coordinates themselves rather than against the frame.
  //
  // WHAT THE FRAME SAYS, AND WHY IT IS NOT QUITE THE SAME, MEASURED
  //
  // A rendered heart is NOT pixel-exactly symmetric. Mirror pixel against
  // mirror pixel, at the sizes probed (40, 80 and 150 percent), the largest
  // per-channel difference is 59, 124 and 128 out of 255, and the ink's centre
  // of mass in a row sits up to 0.27 canvas pixels left of the axis. A circle
  // and a star of the same size in the same frame come back at 16, 16 and 0 —
  // so this belongs to the curves and not to the position, the size or the
  // engine.
  //
  // It is the canvas's own rasteriser. A bezier is flattened into a polyline
  // before it is scan-converted, and Chromium's flattening of a mirrored curve
  // is not the mirror of its flattening of the original. Two things were tried
  // and neither moved the number: building the heart as two halves both walked
  // in the same direction (so the two sides get identical parameterisation)
  // took 126 to 124, i.e. nothing, so the direction of travel is not the cause
  // and the extra construction was reverted to this, which is what the cited
  // source does. What remains is under a third of a pixel on a canvas SignalRGB
  // samples down to a few dozen LEDs, and it is recorded here rather than
  // papered over: the test above asserts the geometry exactly and the one below
  // it asserts the pixels to a bound this measurement sets.
  ctx.moveTo(0, shoulder);
  ctx.bezierCurveTo(0, top, -half, top, -half, shoulder);
  ctx.bezierCurveTo(-half, waist, 0, waist, 0, tip);
  ctx.bezierCurveTo(0, waist, half, waist, half, shoulder);
  ctx.bezierCurveTo(half, top, 0, top, 0, shoulder);
  ctx.closePath();
}

export function render(ctx, layer, asset, timeSec, state) {
  const motions = Array.isArray(layer.motions) ? layer.motions : [];
  const spin = motions.find((motion) => motion.kind === 'spin') ?? null;
  const drift = motions.find((motion) => motion.kind === 'drift') ?? null;
  const pulse = motions.find((motion) => motion.kind === 'pulse') ?? null;
  const breathe = motions.find((motion) => motion.kind === 'breathe') ?? null;

  const previousAlpha = ctx.globalAlpha;
  let alpha = previousAlpha;
  if (pulse) alpha *= pulseFactor(pulse, timeSec);
  if (breathe) alpha *= breatheFactor(breathe, timeSec);
  if (alpha !== previousAlpha) ctx.globalAlpha = clamp(alpha, 0, 1);

  const figure = figureOf(layer);
  const radius = radiusOf(layer);
  const centre = shapeCentre(layer, drift, timeSec);

  ctx.save();
  ctx.translate(centre.x, centre.y);
  // Only where the turn can be seen — see the note on spin above for why
  // performing it on a circle or a ring would move bytes without moving the
  // picture.
  if (spin && SPINNABLE_FIGURES.includes(figure)) ctx.rotate(spinRadians(spin, timeSec));
  tracePath(ctx, layer, figure, radius, state);
  // Parsed every frame rather than trusted, for the reason the solid layer
  // gives at length: applyControls writes a SignalRGB colour control's raw
  // value straight into layer.color, and an unparseable string handed to
  // fillStyle is a silent no-op that paints whatever colour was last used.
  ctx.fillStyle = normalizeColor(layer.color, DEFAULT_SOLID_COLOR);
  ctx.fill();
  ctx.restore();

  ctx.globalAlpha = previousAlpha;
}
