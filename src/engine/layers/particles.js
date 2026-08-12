// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max Leopold Blumenschein
// SPDX-License-Identifier: GPL-3.0-or-later
import {
  CANVAS_WIDTH, CANVAS_HEIGHT, clamp, normalizeColor, DEFAULT_SOLID_COLOR,
  PARTICLE_PATTERNS, MAX_PARTICLE_TILT, DEFAULT_PARTICLE_TILT,
  MIN_PARTICLE_COUNT, MAX_PARTICLE_COUNT, DEFAULT_PARTICLE_COUNT,
  MIN_PARTICLE_SIZE, MAX_PARTICLE_SIZE, DEFAULT_PARTICLE_SIZE,
  DEFAULT_PARTICLE_SPEED,
  MIN_PARTICLE_SEED, MAX_PARTICLE_SEED, DEFAULT_PARTICLE_SEED
} from '../document.js';
import { seedHash, unitFrom } from '../hash.js';
import { speedToRate } from '../motion/speed.js';
import { breatheFactor } from '../motion/breathe.js';
import { pulseFactor } from '../motion/pulse.js';

/**
 * A swarm of particles, as a closed formula.
 *
 * ===========================================================================
 * THE ONE IDEA THIS FILE IS BUILT ON
 * ===========================================================================
 *
 * The corpus keeps a LIST of particle objects and mutates it: every frame it
 * adds `speedX` to `x`, grows a radius, deletes whatever has left the canvas
 * and pushes new ones in at the top. docs/effekt-inventur.md, section A1,
 * quotes the whole of it in nine lines. This engine cannot do any of that —
 * `Math.random` is banned, and a frame must be a function of (document, assets,
 * t) rather than of the frame before it — so the same picture is reached the
 * other way round:
 *
 *   PARTICLE i's POSITION AT TIME t IS A PURE FUNCTION OF i AND t.
 *
 * There is no list, no state between frames, no birth and no death. Where the
 * corpus writes `x += v` thirty times a second, this writes `x = x0 + v*t` and
 * asks for whatever moment it needs; where the corpus deletes a drop that has
 * gone past the bottom and pushes a new one in at the top, this takes the
 * FRACTIONAL PART of the elapsed distance, which is the same thing said in one
 * step instead of two. The inventory names this path in advance (section C1)
 * and it is exactly as capable as the mutable version, because the mutable
 * version's own arithmetic — `x += v` accumulated — IS `x0 + v*t` written the
 * long way.
 *
 * The per-particle constants the corpus draws once with `Math.random` at
 * construction — spawn position, phase, size, speed, which colour — are looked
 * up here instead, from an integer hash of the particle's index and the layer's
 * seed. Same scatter to the eye, identical bytes on every run. See
 * src/engine/hash.js, which is the whole of that argument.
 *
 * ===========================================================================
 * THE ROTATED FRAME, WHICH IS WHAT MAKES ANY ANGLE WORK
 * ===========================================================================
 *
 * Every particle travels along one direction — `angle`, in the same convention
 * a gradient's angle uses (0 is left to right, growing clockwise, so 90 is
 * falling). Rather than special-casing "down" and "sideways", the whole
 * swarm is computed in a frame rotated to that angle:
 *
 *   ALONG    the direction of travel. A particle marches along this and wraps.
 *   ACROSS   at right angles to it. A particle's spawn position is spread over
 *            this, and the sway and the slant push it about on this axis.
 *
 * The two spans are the canvas's own extent measured in that frame:
 *
 *   spanAlong  = W*|cos| + H*|sin| + margin
 *   spanAcross = W*|sin| + H*|cos| + margin
 *
 * — which is just the width of the shadow a 320 x 200 rectangle casts along
 * each axis. Spreading the spawn positions across those two spans covers the
 * canvas evenly at EVERY angle, with no gap at any corner and no special case
 * for the four right angles.
 *
 * ---------------------------------------------------------------------------
 * WHY THERE IS NO POP WHEN A PARTICLE WRAPS
 * ---------------------------------------------------------------------------
 *
 * This is the one thing about the design that had to be got exactly right
 * rather than approximately, because a visible seam — a drop blinking from the
 * bottom of the canvas to the top — is the single most obvious way a closed-form
 * particle system can look worse than a mutable one.
 *
 * It cannot happen, and the reason is arithmetic rather than tuning. The margin
 * added to spanAlong is FOUR TIMES the largest radius any particle can reach.
 * So at the two ends of its travel — phase 0 and phase 1, the two sides of the
 * wrap — a particle's centre is 2 * maxRadius beyond the furthest the canvas
 * reaches in that direction, and its own radius is at most maxRadius. The disc
 * is therefore entirely off the canvas at the instant it jumps, at every angle
 * and every size. 'a particle is off the canvas at the moment it wraps' in
 * test/engine/particles.test.js asserts exactly that, for every pattern, over a
 * sweep of angles.
 *
 * The two things that DO move continuously across the seam move continuously on
 * purpose:
 *
 *  - THE SWAY. It is a sine of the PHASE, not of the time, and it is given a
 *    WHOLE NUMBER of cycles per traversal. A whole number is what makes
 *    sin(2*PI*(n*phase + offset)) end the traversal on exactly the value it
 *    started it with, so the sway has no seam of its own hiding inside the one
 *    the margin already covers. A fractional cycle count would work just as
 *    well visibly — the jump is off-canvas either way — and it is still not
 *    done, because "the path is periodic" is a much easier property to keep
 *    true than "the path's discontinuity happens to be hidden".
 *  - NOTHING ELSE. The radius does jump at the seam, from fully grown back to
 *    newborn, and that is fine for the same reason the position's jump is: it
 *    happens where nothing is drawn.
 *
 * ===========================================================================
 * WHAT A PATTERN IS
 * ===========================================================================
 *
 * A pattern is a row of PARTICLE_PATTERN_LOOKS below: how fast, how much the
 * speeds and the sizes vary between particles, how far each one leans off the
 * common direction, how far and how often it sways, and whether it grows as it
 * travels. Its DEFAULT DIRECTION is in document.js beside the other defaults.
 * Nothing else distinguishes the four, which is why they are one layer type
 * with a dropdown and not four layer types.
 *
 * ===========================================================================
 * WHAT THIS RENDERER MUST NEVER DO
 * ===========================================================================
 *
 * FILL THE CANVAS. The same absolute rule the shape layer carries, and here it
 * matters even more, because this is the layer type docs/effekt-inventur.md
 * section C2 names as the trail's real reason for existing: "Der eigentliche
 * Nutznießer ist C1, die Partikel: die decken die Fläche nie." Every pixel a
 * particle is not on keeps what was underneath it — the layers below, and the
 * veil of the frames before. There is no fillRect in this file and there must
 * never be one.
 */

/**
 * How much of its own span a swarm crosses per second, per unit of speedToRate.
 *
 * The unit is deliberately CROSSINGS and not pixels. A particle layer's
 * interesting quantity is how often the picture renews itself, not how many
 * pixels a dot covers on the way — and because the span is measured in the
 * rotated frame, "one crossing" means the same thing (in from one edge, out at
 * the other) whichever way the swarm is pointed. The cost of that choice,
 * written down rather than left to be discovered: a sideways swarm covers 320
 * pixels in the time a falling one covers 200, so it IS faster in pixels per
 * second at the same setting. That is the right way round — turning the angle
 * dial should not change how busy the effect looks.
 *
 * 0.7 was chosen against the default rather than by feel. speedToRate(30) is
 * 0.7153 (the table in motion/speed.js states it), so the default particle
 * speed gives 0.7153 * 0.7 = 0.50 crossings a second — two seconds for a drop
 * to fall the height of the canvas, which is rain. At the top of the slider
 * (rate 7) it is 4.9 crossings a second, and at the bottom it stops.
 *
 * Like SPEED_SCALE in motion/breathe.js, this is NOT the place to make things
 * faster: it multiplies every speed alike, so raising it would change the
 * tempo of every particle effect already exported. The slider's own ceiling is
 * MAX_RATE in motion/speed.js.
 */
export const PARTICLE_SPEED_SCALE = 0.7;

/**
 * The faintest a particle can be drawn, as a fraction of the layer's opacity.
 *
 * Every particle gets its own opacity between this and 1, drawn from the hash.
 * That is the second half of what the corpus does with colour: `Poison` draws
 * every particle at a flat `+ "88"` (0.53), while `Arctic` gives each flake its
 * own `1 - this.mod` and `Starlight` fades each point in and out. A swarm all
 * at one opacity reads as a pattern; a swarm at mixed opacities reads as depth,
 * and it costs one hash draw.
 *
 * 0.35 rather than 0: a particle at nearly zero opacity is a particle that was
 * counted, drawn and paid for and cannot be seen, which makes the count field
 * lie about how much is on screen.
 */
export const PARTICLE_MIN_ALPHA = 0.35;

/**
 * What each pattern actually means, once the direction is taken out of it.
 *
 *   direction    which way it travels, in degrees, in the same convention a
 *                gradient's angle uses: 0 is left to right and it grows
 *                clockwise, and canvas y grows downwards, so 90 is falling and
 *                270 is rising. This is a property of THE PATTERN and not a
 *                field, which is what keeps "rise" rising however the rest of
 *                the layer is set — see MAX_PARTICLE_TILT in document.js for
 *                the version of this that did not, and how it was caught.
 *   speed        how fast this pattern runs against the others, at one setting
 *                of the speed slider. Rain is the fast one and the reference.
 *   speedSpread  how much the particles differ from each other in speed, as a
 *                fraction either side. `Poison` draws a `Math.random` value times 2 plus 0.5,
 *                i.e. a fivefold spread; that reads as chaos rather than as
 *                rain, so these are gentler.
 *   sizeSpread   the same, for the radius.
 *   slant        how far a particle may lean off the common direction, as a
 *                sideways drift per unit of forward travel. This is what stops
 *                rain being a comb: 0.12 is about seven degrees either way, so
 *                no two drops fall quite parallel. `Poison`'s equivalent is its
 *                `speedX`, which is random and independent of `speedY`.
 *   sway         how far the particle wanders sideways as it travels, as a
 *                fraction of the canvas height.
 *   cycles       how many complete sways one traversal contains. A WHOLE
 *                NUMBER, always, and the note at the top of this file says why.
 *                Zero means no sway at all.
 *   growth       how much larger a particle is at the end of its travel than at
 *                the start. This is the corpus's `this.radius += ...` — the
 *                growing ring that nine effects of the 31 are built out of.
 *
 * Rain and snow do not grow, because water does not; the two patterns whose
 * corpus ancestors are rings and bubbles do.
 *
 * These numbers are a LOOK and not a measurement, and that is said plainly
 * rather than dressed up. What they are answerable to is the corpus they came
 * from and the screenshots in work/particles-shots/.
 */
export const PARTICLE_PATTERN_LOOKS = Object.freeze({
  rain: Object.freeze({
    direction: 90,
    speed: 1, speedSpread: 0.35, sizeSpread: 0.45, slant: 0.12, sway: 0, cycles: 0, growth: 0
  }),
  rise: Object.freeze({
    direction: 270,
    speed: 0.55, speedSpread: 0.45, sizeSpread: 0.55, slant: 0.05, sway: 0.05, cycles: 3, growth: 0.6
  }),
  drift: Object.freeze({
    direction: 0,
    speed: 0.4, speedSpread: 0.55, sizeSpread: 0.7, slant: 0.04, sway: 0.02, cycles: 1, growth: 0.9
  }),
  snow: Object.freeze({
    direction: 90,
    speed: 0.3, speedSpread: 0.35, sizeSpread: 0.55, slant: 0.03, sway: 0.1, cycles: 2, growth: 0
  })
});

/**
 * Which hash channel each per-particle constant is drawn from.
 *
 * Named rather than written as bare numbers because the numbers are otherwise
 * meaningless AND because they must never be reshuffled: swapping two of these
 * rearranges every particle of every effect anybody has exported, without
 * changing a single visible line of this file. The one safe edit is APPENDING a
 * new one.
 */
const CHANNEL_ACROSS = 0;
const CHANNEL_PHASE = 1;
const CHANNEL_SIZE = 2;
const CHANNEL_SPEED = 3;
const CHANNEL_SWAY = 4;
const CHANNEL_COLOUR = 5;
const CHANNEL_ALPHA = 6;
const CHANNEL_SLANT = 7;

/** How many of those are kept per particle in the cache below. */
const UNITS_PER_PARTICLE = 7;
/** Where each one sits in that flat run of numbers. */
const UNIT_ACROSS = 0;
const UNIT_PHASE = 1;
const UNIT_SIZE = 2;
const UNIT_SPEED = 3;
const UNIT_SWAY = 4;
const UNIT_ALPHA = 5;
const UNIT_SLANT = 6;

export function createState() {
  return { key: null, cache: null };
}

/** The pattern this layer draws, however the document arrived. */
function patternOf(layer) {
  const raw = typeof layer.pattern === 'string' ? layer.pattern : '';
  return PARTICLE_PATTERNS.includes(raw) ? raw : PARTICLE_PATTERNS[0];
}

/**
 * Every number below is re-read and re-clamped from the raw layer on every
 * frame rather than trusted, for the reason every other layer type does the
 * same: applyControls (src/engine/bind.js) writes a SignalRGB control's raw
 * value straight into the layer, so what arrives here is whatever that panel
 * sent and not what normalizeDocument last approved.
 *
 * Number.isFinite rather than `|| fallback` throughout, so that a real,
 * in-range 0 — which `speed` and `seed` and `angle` all have — clamps to the
 * floor instead of jumping to the default.
 */
function whole(value, fallback, lo, hi) {
  const raw = Math.round(Number(value));
  return clamp(Number.isFinite(raw) ? raw : fallback, lo, hi);
}

function real(value, fallback, lo, hi) {
  const raw = Number(value);
  return clamp(Number.isFinite(raw) ? raw : fallback, lo, hi);
}

/**
 * The per-particle constants, built once and kept on the layer's state.
 *
 * THE CACHE KEY IS EVERY INPUT THE VALUE IS A FUNCTION OF, AND THIS IS THE
 * PROJECT'S SECOND GO AT THAT LESSON. The conic gradient's cache
 * (layers/gradient.js) once left the stop positions out of its key and the
 * Position slider silently did nothing until the app was restarted. So: these
 * numbers are a function of the SEED (which particle family), the COUNT (how
 * many of them) and the NUMBER OF STOPS (which decides the colour buckets
 * below) — and the key names all three. Nothing else can reach them, and that
 * is not luck, it is how they are built: the pattern, the angle, the size and
 * the speed are all applied AFTERWARDS, to these raw fractions, when a frame is
 * drawn. Anything that ever reaches in here has to join the key in the same
 * edit.
 *
 * WHAT IS STORED AND WHY IT IS TWO THINGS
 *
 *  1. `units` — the raw hash draws, seven per particle, flat in one
 *     Float64Array rather than seven arrays or one array of objects. It is the
 *     shape that costs nothing to walk.
 *  2. `order` and `bucketStart` — the particle indices SORTED BY COLOUR, and
 *     where each colour's run begins.
 *
 * The second one exists for a measured reason. Assigning `ctx.fillStyle` makes
 * the browser parse a colour string, and doing that once per particle is up to
 * 400 string parses a frame, forever. Walking the particles grouped by colour
 * instead means the fill style is assigned two to four times a frame — once per
 * stop — and the per-particle work is a number written into ctx.globalAlpha,
 * which parses nothing.
 *
 * The cost of that: particles are DRAWN in colour order rather than in index
 * order. Where two particles overlap, the one from the later colour is on top,
 * always, instead of the one with the larger index. That is a real difference
 * to the picture and it is a stable one — the same on both sides of the parity
 * test, the same on every run — which is the only property it has to have.
 */
export function particleCache(seed, count, stopCount) {
  const units = new Float64Array(count * UNITS_PER_PARTICLE);
  const colour = new Int32Array(count);
  const bucketStart = new Int32Array(stopCount + 1);

  for (let index = 0; index < count; index += 1) {
    const base = seedHash(seed, index);
    const at = index * UNITS_PER_PARTICLE;
    units[at + UNIT_ACROSS] = unitFrom(base, CHANNEL_ACROSS);
    units[at + UNIT_PHASE] = unitFrom(base, CHANNEL_PHASE);
    units[at + UNIT_SIZE] = unitFrom(base, CHANNEL_SIZE);
    units[at + UNIT_SPEED] = unitFrom(base, CHANNEL_SPEED);
    units[at + UNIT_SWAY] = unitFrom(base, CHANNEL_SWAY);
    units[at + UNIT_ALPHA] = unitFrom(base, CHANNEL_ALPHA);
    units[at + UNIT_SLANT] = unitFrom(base, CHANNEL_SLANT);
    // floor of a half-open [0, 1) draw times the count can never be the count
    // itself — see the note on unitFrom in src/engine/hash.js, which is why
    // this needs no clamp of its own.
    colour[index] = Math.floor(unitFrom(base, CHANNEL_COLOUR) * stopCount);
    bucketStart[colour[index] + 1] += 1;
  }

  // A counting sort: turn the per-bucket tallies into starting offsets, then
  // drop every particle into its own bucket's next free slot. One pass, no
  // comparisons, and the result is stable — within a colour the particles stay
  // in index order, so the picture does not depend on a sort's tie-breaking.
  for (let bucket = 1; bucket <= stopCount; bucket += 1) {
    bucketStart[bucket] += bucketStart[bucket - 1];
  }
  const order = new Int32Array(count);
  const filled = new Int32Array(stopCount);
  for (let index = 0; index < count; index += 1) {
    const bucket = colour[index];
    order[bucketStart[bucket] + filled[bucket]] = index;
    filled[bucket] += 1;
  }

  return { units, colour, order, bucketStart, count, stopCount };
}

/**
 * Everything about a swarm that is the same for all of its particles, worked
 * out once per frame.
 *
 * Exported because it is what makes the maths testable: a test can ask where
 * particle 12 is at t and at t + 0.1 and check it moved by exactly the distance
 * this says it should, rather than squinting at pixels.
 */
export function particleField(layer) {
  const pattern = patternOf(layer);
  const look = PARTICLE_PATTERN_LOOKS[pattern];

  const count = whole(layer.count, DEFAULT_PARTICLE_COUNT, MIN_PARTICLE_COUNT, MAX_PARTICLE_COUNT);
  const seed = whole(layer.seed, DEFAULT_PARTICLE_SEED, MIN_PARTICLE_SEED, MAX_PARTICLE_SEED);
  const size = real(layer.size, DEFAULT_PARTICLE_SIZE, MIN_PARTICLE_SIZE, MAX_PARTICLE_SIZE);
  const speed = real(layer.speed, DEFAULT_PARTICLE_SPEED, 0, 100);
  // The pattern's own direction, leaned by however much the layer asks for.
  const tilt = real(layer.tilt, DEFAULT_PARTICLE_TILT, -MAX_PARTICLE_TILT, MAX_PARTICLE_TILT);
  const angle = look.direction + tilt;

  // `size` is a DIAMETER as a percent of the canvas height, exactly as it is on
  // a shape layer — so the radius is half of it.
  const baseRadius = (size / 100) * CANVAS_HEIGHT / 2;
  // The largest any particle can ever get: the widest of the size spread, fully
  // grown. This is what every margin below is measured in.
  const maxRadius = baseRadius * (1 + look.sizeSpread) * (1 + look.growth);

  const radians = (angle * Math.PI) / 180;
  const alongX = Math.cos(radians);
  const alongY = Math.sin(radians);
  // At right angles to the travel, turned the same way the angle grows.
  const acrossX = -alongY;
  const acrossY = alongX;

  // The shadow the canvas casts on each axis of the rotated frame, plus room
  // for the wrap to happen out of sight (four times the largest radius — see
  // the note on the seam at the top of this file).
  const shadowAlong = CANVAS_WIDTH * Math.abs(alongX) + CANVAS_HEIGHT * Math.abs(alongY);
  const shadowAcross = CANVAS_WIDTH * Math.abs(alongY) + CANVAS_HEIGHT * Math.abs(alongX);
  const spanAlong = shadowAlong + 4 * maxRadius;
  const sway = look.sway * CANVAS_HEIGHT;
  // The across span has to hold three things beyond the canvas's own shadow:
  // a particle's radius at each edge, the whole excursion the slant can produce
  // over a full traversal, and the sway. Without them the swarm would thin out
  // along both edges instead of covering evenly.
  const spanAcross = shadowAcross + 2 * maxRadius + look.slant * spanAlong + 2 * sway;

  return {
    pattern,
    look,
    count,
    seed,
    // Crossings per second. Zero at speed 0, which is a still field of points
    // rather than a mistake — see the note beside `speed` in document.js.
    rate: speedToRate(speed) * PARTICLE_SPEED_SCALE * look.speed,
    alongX, alongY, acrossX, acrossY,
    spanAlong, spanAcross, sway,
    baseRadius, maxRadius,
    shadowAlong, shadowAcross
  };
}

/**
 * Where particle `index` is at `timeSec`, how big it is and how bright.
 *
 * Written into `out` rather than returned fresh, so that a frame of 400
 * particles allocates nothing at all. The caller owns the object; the tests
 * hand over a new one each time and the renderer reuses one.
 *
 * THIS IS THE WHOLE OF THE MOTION. There is nothing else anywhere in this file
 * that moves a particle, which is what makes the claim at the top — a pure
 * function of index and time — checkable rather than aspirational.
 */
export function particleAt(field, cache, index, timeSec, out) {
  const at = index * UNITS_PER_PARTICLE;
  const units = cache.units;
  const look = field.look;

  // How fast THIS particle goes: the swarm's rate, spread either side.
  const speedFactor = 1 + look.speedSpread * (units[at + UNIT_SPEED] * 2 - 1);
  // The fractional part, which is the whole of the wrap. Written as
  // `x - floor(x)` rather than `x % 1` so that it is still correct for a
  // negative argument — nothing hands one over today, but `%` keeps the sign in
  // JavaScript and would put a particle outside its own span if anything ever
  // did.
  const travelled = units[at + UNIT_PHASE] + timeSec * field.rate * speedFactor;
  const phase = travelled - Math.floor(travelled);

  const along = (phase - 0.5) * field.spanAlong;
  // How far this particle leans off the common direction, as sideways travel
  // per unit of forward travel. Multiplied by `along` rather than by time, so
  // it is a fixed LINE through the swarm and not an acceleration.
  const slant = look.slant * (units[at + UNIT_SLANT] * 2 - 1);
  // A whole number of cycles per traversal, so the sway ends a traversal on
  // exactly the value it began it with.
  const swaying = look.cycles === 0 ? 0 : field.sway * Math.sin(
    Math.PI * 2 * (look.cycles * phase + units[at + UNIT_SWAY])
  );
  const across = (units[at + UNIT_ACROSS] - 0.5) * field.spanAcross + slant * along + swaying;

  out.x = CANVAS_WIDTH / 2 + field.alongX * along + field.acrossX * across;
  out.y = CANVAS_HEIGHT / 2 + field.alongY * along + field.acrossY * across;
  out.radius = field.baseRadius
    * (1 + look.sizeSpread * (units[at + UNIT_SIZE] * 2 - 1))
    * (1 + look.growth * phase);
  out.alpha = PARTICLE_MIN_ALPHA + (1 - PARTICLE_MIN_ALPHA) * units[at + UNIT_ALPHA];
  out.colour = cache.colour[index];
  out.phase = phase;
  return out;
}

/** The colours this layer draws with, re-parsed every frame like every other layer's. */
function coloursOf(layer) {
  const stops = Array.isArray(layer.stops) ? layer.stops : [];
  if (stops.length === 0) return [DEFAULT_SOLID_COLOR];
  return stops.map((stop) => normalizeColor(stop && stop.color, DEFAULT_SOLID_COLOR));
}

export function render(ctx, layer, asset, timeSec, state, aspect = 1) {
  const colours = coloursOf(layer);
  const field = particleField(layer);

  const key = `${field.seed}|${field.count}|${colours.length}`;
  if (state.key !== key || !state.cache) {
    state.cache = particleCache(field.seed, field.count, colours.length);
    state.key = key;
  }
  const cache = state.cache;

  // The two motions this layer type offers, both of them on opacity alone —
  // see PARTICLE_MOTION_KINDS in document.js for why the other three are not
  // offered. A drift or a spin stored on the layer by hand is kept in the
  // document and NOT performed, exactly as a solid layer keeps and ignores one.
  const motions = Array.isArray(layer.motions) ? layer.motions : [];
  const pulse = motions.find((motion) => motion.kind === 'pulse') ?? null;
  const breathe = motions.find((motion) => motion.kind === 'breathe') ?? null;

  const previousAlpha = ctx.globalAlpha;
  let base = previousAlpha;
  if (pulse) base *= pulseFactor(pulse, timeSec);
  if (breathe) base *= breatheFactor(breathe, timeSec);
  base = clamp(base, 0, 1);

  // One object for the whole frame — see particleAt.
  const spot = { x: 0, y: 0, radius: 0, alpha: 1, colour: 0, phase: 0 };

  // The host-stretch compensation (aspectFactorOf in document.js), the same
  // sentence the shape layer's render carries — but a swarm is up to four
  // hundred discs, so the squish is set ONCE for the whole layer and each
  // particle's x is pre-multiplied back out by the factor: the centre lands
  // exactly where it always did (a * x/a = x), only the disc itself is drawn
  // narrower. drawLayers' save/restore around every layer is what takes the
  // transform off again. Skipped entirely at 1, so an untouched document
  // renders through the very calls it always did, byte for byte.
  const squish = Number.isFinite(aspect) && aspect > 0 && aspect !== 1 ? aspect : 1;
  if (squish !== 1) ctx.scale(1 / squish, 1);

  // Colour by colour, so ctx.fillStyle is assigned once per stop instead of
  // once per particle. See particleCache for the measurement behind that and
  // for what it costs.
  for (let bucket = 0; bucket < colours.length; bucket += 1) {
    const from = cache.bucketStart[bucket];
    const to = cache.bucketStart[bucket + 1];
    if (from === to) continue;
    ctx.fillStyle = colours[bucket];
    for (let slot = from; slot < to; slot += 1) {
      particleAt(field, cache, cache.order[slot], timeSec, spot);
      ctx.globalAlpha = base * spot.alpha;
      ctx.beginPath();
      ctx.arc(squish === 1 ? spot.x : spot.x * squish, spot.y, spot.radius, 0, Math.PI * 2, false);
      ctx.fill();
    }
  }

  ctx.globalAlpha = previousAlpha;
}
