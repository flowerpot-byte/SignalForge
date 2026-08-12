// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import {
  MOTION_KINDS, FIT_MODES, GRADIENT_SHAPES, MIN_BANDS, MAX_BANDS,
  MAX_HUE_SHIFT, MAX_TRAIL, motionKindsFor, normalizeDocument,
  SHAPE_FIGURES, MIN_SHAPE_SIZE, MAX_SHAPE_SIZE,
  MIN_SHAPE_THICKNESS, MAX_SHAPE_THICKNESS, MIN_STAR_POINTS, MAX_STAR_POINTS,
  PARTICLE_PATTERNS, MIN_PARTICLE_COUNT, MAX_PARTICLE_COUNT,
  MIN_PARTICLE_SIZE, MAX_PARTICLE_SIZE, MIN_PARTICLE_SEED, MAX_PARTICLE_SEED,
  MAX_PARTICLE_TILT, MIN_ASPECT, MAX_ASPECT
} from '../engine/document.js';

/**
 * The one list of controls an exported effect offers.
 *
 * There is exactly one of these in the project. Both the command line
 * (bin/sfexport.js) and the app's export button (src/main/export-effect.js)
 * call this; neither keeps a copy. A second copy is precisely the mistake
 * this project has already made twice, and the symptom is always the same —
 * one side gains a control or a range and the other quietly does not.
 *
 * Labels must be ASCII only (32..126): src/export/build-effect.js refuses to
 * build with anything else, because SignalRGB's handling of non-ASCII labels
 * has never been measured. That is why the German labels read "Staerke" and
 * "Gruen/Magenta" rather than using the letters they should.
 */

/**
 * Ranges the controls offer — the exported effect's and the app's alike.
 *
 * There is exactly one of these in the project, for the same reason there is
 * exactly one control list: a second copy is the mistake this project has
 * already made twice, and the symptom is always that one side gains a range
 * and the other quietly does not. The settings column in the window imports
 * this table (app/renderer/components/inspector.js) and maps it onto the names
 * the document uses — tempo is a motion's `speed`, strength its `amount` — so
 * the app and the finished effect present the same choices by construction
 * rather than by two doc comments promising they do.
 *
 * Frozen metadata, nothing else: the renderer is permitted to import it for
 * the same reason it may import FIT_MODES and MOTION_KINDS, and
 * test/engine/boundary.test.js keeps this whole directory free of Node.
 *
 * Every one of these must stay inside what normalizeDocument (src/engine/
 * document.js) clamps the same field to, otherwise the control would offer
 * values the engine silently throws away:
 *
 *   tempo        <- motions[].speed  clamp 0..100   offered 1..100 (0 is "stopped", not a speed)
 *   strength     <- motions[].amount clamp 0..100   offered 0..100
 *   brightness   <- brightness       clamp 0..200   offered 5..200 (never fully black by accident)
 *   saturation   <- saturation       clamp 0..200   offered 0..200
 *   greenMagenta <- greenMagenta     clamp -100..100 offered -100..100
 *   blueYellow   <- blueYellow       clamp -100..100 offered -100..100
 *   angle        <- gradient angle   clamp 0..360   offered 0..360
 *   bands        <- gradient bands   clamp 1..24    offered 1..24
 *   stop         <- stops[].at       clamp 0..100   offered 0..100
 *   size         <- shape size       clamp 1..200   offered 1..200
 *   posX / posY  <- shape position   clamp 0..100   offered 0..100
 *   thickness    <- shape thickness  clamp 1..100   offered 1..100
 *   points       <- shape points     clamp 3..12    offered 3..12
 *   hueShift     <- hueShift         clamp 0..360   offered 0..360
 *   hueCycle     <- hueCycle         clamp 0..100   offered 0..100 (0 is off, not slow)
 *   trail        <- trail            clamp 0..100   offered 0..100 (0 is off, not short)
 *
 * `stop` is the one entry here the exported effect does NOT offer, and it is
 * in this table anyway because it is a range and this is where ranges live —
 * the settings column reads it like all the others. Why the finished effect
 * does not get stop-position sliders: SignalRGB's control panel has no
 * gradient bar to see them against, so the number would have to be judged
 * against the keyboard alone; and dragging stop 1 past stop 2 turns the ramp
 * inside out, which reads as a bug rather than as a setting. The same looks
 * are reachable by changing the colours, which the effect DOES offer. Where
 * along the ramp each colour sits is a decision that belongs in SignalForge,
 * where the gradient is on screen while it is being made.
 *
 * test/export/effect-controls.test.js checks the three colour ranges against
 * normalizeDocument itself rather than against these numbers, so a change to
 * the engine's clamps cannot leave this table quietly wrong.
 *
 * NOTE, unverified: docs/erkenntnisse-signalrgb-motor.md records nothing about
 * how SignalRGB renders a number control with a negative minimum, so the two
 * -100..100 controls are the first of their kind this project ships. If they
 * misbehave in SignalRGB's own UI, that is the thing to look at first.
 */
const FOREGROUND_RANGES = Object.freeze({
  tempo: Object.freeze({ min: 1, max: 100 }),
  strength: Object.freeze({ min: 0, max: 100 }),
  // 100 is the middle of this range on purpose, and it is the default: a
  // ceiling of 100 meant the control could only ever darken, which is exactly
  // what it was reported for. Above 100 brightens (see applyFinish in
  // src/engine/engine.js). The floor stays at 5 rather than dropping to 0 --
  // that is a separate, deliberate guard ("never fully black by accident")
  // and nothing about the missing headroom above 100 touches it.
  brightness: Object.freeze({ min: 5, max: 200 }),
  saturation: Object.freeze({ min: 0, max: 200 }),
  greenMagenta: Object.freeze({ min: -100, max: 100 }),
  blueYellow: Object.freeze({ min: -100, max: 100 }),
  angle: Object.freeze({ min: 0, max: 360 }),
  // Whole repeats of the ramp. Its floor is 1 and not 0 because zero repeats
  // is not a picture — the engine's own clamp says the same thing, and
  // test/export/effect-controls.test.js reads both ends of this range out of
  // normalizeDocument rather than trusting these two numbers.
  bands: Object.freeze({ min: MIN_BANDS, max: MAX_BANDS }),
  stop: Object.freeze({ min: 0, max: 100 }),
  // How big the figure is, as a percent of the canvas height — see
  // MIN_SHAPE_SIZE in src/engine/document.js for why the ceiling is 200 and
  // not 100, and why the floor is 1 rather than 0.
  size: Object.freeze({ min: MIN_SHAPE_SIZE, max: MAX_SHAPE_SIZE }),
  // Where the figure sits, as a percent of each edge. Both ends are real
  // places to be — 0 puts the middle of the figure on the edge and most of it
  // off the canvas, which is a thing to want (an arc of colour coming in from
  // the side) and not a mistake to guard against.
  //
  // NAMED posX AND posY, NOT x AND y. Every control's `property` becomes a
  // global in the exported effect (see build-effect.js, which splices it
  // straight into the bootstrap), and a global called `x` in a page that also
  // holds the whole engine bundle is a name asking for a collision. The two
  // sliders SignalRGB shows are still called "Position X" and "Position Y",
  // so nobody outside this file meets the longer name.
  posX: Object.freeze({ min: 0, max: 100 }),
  posY: Object.freeze({ min: 0, max: 100 }),
  // The ring's wall, as a percent of its own outer radius. 100 is a filled
  // disc rather than an error, so the range runs continuously into the circle.
  thickness: Object.freeze({ min: MIN_SHAPE_THICKNESS, max: MAX_SHAPE_THICKNESS }),
  // How many points the star has. Whole numbers only, and the engine's clamp
  // says the same thing — test/export/effect-controls.test.js reads both ends
  // out of normalizeDocument rather than trusting these two.
  points: Object.freeze({ min: MIN_STAR_POINTS, max: MAX_STAR_POINTS }),
  // Where the colour wheel is parked, in degrees. The full circle is offered
  // because the full circle is what there is — unlike `tempo`, whose floor is
  // 1 because zero is not a speed, every number here is a real place to be.
  hueShift: Object.freeze({ min: 0, max: MAX_HUE_SHIFT }),
  // How fast it keeps turning, and 0 is deliberately IN the range where the
  // tempo control's is not. The difference is what the zero means: a motion
  // set to tempo 0 is a motion that was chosen and then stopped, which is a
  // state worth having a different way of expressing (choose "none"). There is
  // no such dropdown here — this slider IS the on switch, so it has to be able
  // to reach off, and off is its default.
  hueCycle: Object.freeze({ min: 0, max: 100 }),
  // Same shape, same reason: 0 is not "a very short wake", it is the hard
  // clear this engine has always done, and it is where the slider starts.
  trail: Object.freeze({ min: 0, max: MAX_TRAIL }),
  // How much wider the host stretches the finished canvas, in percent — the
  // engine's own clamp restated (see MIN_ASPECT in src/engine/document.js for
  // the measurement behind it). 100, the default, is "not at all".
  aspect: Object.freeze({ min: MIN_ASPECT, max: MAX_ASPECT }),

  // ------------------------------------------------------------ the particles
  //
  // FOUR ENTRIES WITH NAMES OF THEIR OWN, AND NOT ONE OF THEM SHARES A KEY WITH
  // A CONTROL THAT ALREADY EXISTS. Two of them look at first glance as though
  // they could — a particle has a `size` and a tempo, and this table already
  // holds a `size` and a `tempo` — and both would have been wrong:
  //
  //   `size` is already the SHAPE layer's, clamped 1..200 because a figure is
  //   the whole picture and is allowed to be bigger than the canvas. A particle
  //   is one of up to four hundred and is clamped 1..25, so sharing the key
  //   would offer a control eight times wider than the engine accepts and
  //   quietly throw away everything above 25 — the exact fault the note at the
  //   head of this table warns about.
  //
  //   `tempo` is a MOTION's rate, and the collision there is worse than a
  //   range. SignalRGB's own panel is FLAT: it has no section headings, so the
  //   list this file builds arrives as one run of sliders. A particle layer
  //   that also carries a breathe would then show two sliders both labelled
  //   "Tempo", one after the other, with nothing whatsoever to tell them apart.
  //   So the layer's own travel gets a name and a label of its own.
  particleCount: Object.freeze({ min: MIN_PARTICLE_COUNT, max: MAX_PARTICLE_COUNT }),
  particleSize: Object.freeze({ min: MIN_PARTICLE_SIZE, max: MAX_PARTICLE_SIZE }),
  // 0 is deliberately IN this range where a motion's `tempo` floor is 1, and
  // the difference is what the zero means. A motion set to tempo 0 is a motion
  // that was chosen and then stopped, which "none" already says better. A
  // particle layer at travel speed 0 is a still field of points — which is
  // exactly what `Starlight` is in the 31 effects read for
  // docs/effekt-inventur.md: its points never move, they only fade.
  travelSpeed: Object.freeze({ min: 0, max: 100 }),
  // How far off its pattern's own direction the swarm leans. Signed, so that
  // leaning each way is a step either side of nothing — the third control in
  // this table with a negative minimum, after the two colour axes, and the same
  // unverified note applies to it (see the bottom of the block above).
  tilt: Object.freeze({ min: -MAX_PARTICLE_TILT, max: MAX_PARTICLE_TILT }),
  seed: Object.freeze({ min: MIN_PARTICLE_SEED, max: MAX_PARTICLE_SEED })
});

/**
 * The same table, plus the background's four sliders.
 *
 * FOUR ALIASES AND NOT FOUR NUMBERS. A background is a solid or a gradient, so
 * every range it needs is a range this table already holds — the aliases point
 * at the very same frozen objects rather than restating 0..360 and 1..24, which
 * is what stops the two from ever drifting apart. What they buy is a NAME: an
 * exported control's `property` becomes a global in the finished effect and is
 * the label's only companion in SignalRGB's flat panel, so a background's angle
 * cannot be called `angle` while the foreground's already is.
 *
 * The same collision the four particle entries met, met again one layer down
 * and answered the same way — see the note beside particleCount above. It is
 * worse here than there, because a gradient over a gradient really can put two
 * sliders called "Winkel" one under the other with nothing to tell them apart.
 *
 * There is deliberately no `bgStop`: stop POSITIONS are not offered in an
 * exported panel at all (see the `stop` note above), for the foreground or for
 * the background.
 */
export const CONTROL_RANGES = Object.freeze({
  ...FOREGROUND_RANGES,
  bgAngle: FOREGROUND_RANGES.angle,
  bgBands: FOREGROUND_RANGES.bands,
  bgTempo: FOREGROUND_RANGES.tempo,
  bgStrength: FOREGROUND_RANGES.strength
});

/**
 * A colour picker.
 *
 * SECOND NOTE, unverified, and a larger one than the negative minimum above:
 * `type="color"` has been in this project's CONTROL_TYPES since the first
 * commit but has never been exported, and docs/erkenntnisse-signalrgb-motor.md
 * — which is the record of what SignalRGB's browser was actually MEASURED to
 * do — says nothing about it. So two things are unknown until somebody runs
 * one of these in SignalRGB: whether the control appears at all, and what
 * shape the value it writes into the global has. The second is handled rather
 * than assumed: normalizeColor (src/engine/document.js) accepts "#RRGGBB",
 * "RRGGBB", "#RGB" and "rgb(r,g,b)" and falls back to the document's own
 * colour for anything else, so the worst case is a control that does nothing,
 * not an effect that goes black.
 */
function colour(property, de, en, value, bind) {
  return { property, label: { de, en }, type: 'color', default: value, bind: [bind] };
}

/**
 * A slider, with its range stretched if the document carries a value the
 * usual range cannot reach.
 *
 * The ranges above are on purpose narrower than what normalizeDocument
 * clamps the same field to (brightness 5..200 against a clamp of 0..200). A
 * document is under no such obligation: a project file edited by hand can
 * legitimately carry brightness 3. Shipping a control whose default sits
 * outside its own min/max would leave SignalRGB to decide what that means, so
 * the range gives way and never the value — the same rule, and the same
 * reasoning, as widenToInclude in app/renderer/components/inspector.js.
 */
function slider(property, de, en, value, bind) {
  const { min, max } = CONTROL_RANGES[property];
  return {
    property,
    label: { de, en },
    type: 'number',
    min: Math.min(min, value),
    max: Math.max(max, value),
    default: value,
    bind: [bind]
  };
}

function dropdown(property, de, en, values, value, bind) {
  return { property, label: { de, en }, type: 'combobox', values: [...values], default: value, bind: [bind] };
}

/**
 * Build the control list for a document that is about to be exported.
 *
 * `doc` must already have been through normalizeDocument — every default
 * below is read straight out of it, so an un-normalized document would put
 * `undefined` into the effect's meta tags.
 *
 * `layerId` names the image layer the layer-level controls address. A
 * document with no such layer still gets the four document-wide controls, so
 * the list is never empty.
 *
 * Only the FIRST motion entry is exposed. That matches what the command line
 * has always produced (it bakes exactly one), and it is a deliberate limit:
 * the app allows several motions at once, and all of them are baked into the
 * exported effect and render, but SignalRGB's own UI only gets to steer the
 * first. Exposing every entry would mean inventing property names like
 * `motion2`, which is a feature, not this task.
 *
 * `backgroundId` names the layer UNDERNEATH, if there is one, and its knobs come
 * out as a block of their own after the foreground's and before the
 * document-wide ones. Two things decide that order and neither is taste:
 *
 *  - SignalRGB's panel is FLAT. It has no headings, so the only thing that can
 *    group a background's controls is that they are next to each other and that
 *    every one of them says "Hintergrund" in its label. Sprinkling them among
 *    the foreground's would leave two "Farbe" sliders with a "Muster" between
 *    them.
 *  - The foreground is what the effect IS. Somebody who installs rain over a
 *    gradient reaches for the rain first, so the rain is at the top; what is
 *    behind it comes next; and the grade that is applied to both of them
 *    together stays where it has always been, at the bottom.
 *
 * Both ids are looked up by id and not by position (`doc.layers.find`), which
 * is what makes this safe against a document whose layers were reordered — see
 * src/engine/slots.js for the id-and-position decision in full.
 */
export function effectControls(doc, layerId, backgroundId = null) {
  const controls = [];
  const layer = doc.layers.find((entry) => entry.id === layerId);

  /**
   * The three motion controls, for whichever layer type has motions.
   *
   * The Motion dropdown offers motionKindsFor(type) and not MOTION_KINDS
   * flat: on a solid colour that is "none" and "breathe" alone, because drift
   * and warp on a uniform field provably cannot change a pixel (see
   * src/engine/layers/solid.js). Offering them would put two options in
   * somebody's SignalRGB panel that do nothing whatsoever when chosen.
   *
   * On a SHAPE layer the same question has an answer that depends on the
   * figure, which is why the layer's own figure is handed over: a spin is the
   * whole point of a star and invisible on a circle. What it CANNOT do is
   * follow the Figure dropdown afterwards — this list is baked once, at export,
   * and somebody who switches a circle to a star inside SignalRGB keeps the
   * circle's shorter Motion list. That is the honest trade and it is the one
   * this project already makes for the picture layer's fit; the alternative is
   * a dropdown offering a motion that does nothing for the figure showing.
   * Which way round to be wrong is decided by which is recoverable: a missing
   * option is fixed by exporting again from the app, where the whole list is
   * live; a dead option is a control somebody drags and blames themselves for.
   */
  const motionControlsFor = (target, id, names) => {
    const motion = target.motions?.[0];
    if (!motion) return;
    // The same rule the sliders follow (see slider() above): the offer gives
    // way, never the document's own value. A hand-edited project can carry a
    // warp on a solid layer, and a dropdown whose default is not one of its
    // own options leaves SignalRGB to decide what that means.
    const offered = motionKindsFor(target.type, target.figure);
    const kinds = offered.includes(motion.kind) ? offered : [...offered, motion.kind];
    controls.push(
      dropdown(names.motion[0], names.motion[1], names.motion[2], kinds, motion.kind,
        `${id}.motions.0.kind`),
      slider(names.tempo[0], names.tempo[1], names.tempo[2], motion.speed, `${id}.motions.0.speed`),
      slider(names.strength[0], names.strength[1], names.strength[2], motion.amount,
        `${id}.motions.0.amount`)
    );
  };

  /** What the foreground's three motion controls are called. */
  const MOTION_NAMES = Object.freeze({
    motion: ['motion', 'Modus', 'Motion'],
    tempo: ['tempo', 'Tempo', 'Speed'],
    strength: ['strength', 'Staerke', 'Strength']
  });

  const motionControls = () => motionControlsFor(layer, layerId, MOTION_NAMES);

  if (layer && layer.type === 'image') {
    motionControls();
    controls.push(dropdown('fit', 'Bildausschnitt', 'Fit', FIT_MODES, layer.fit, `${layerId}.fit`));
  }

  // For a picture the motion leads, because the picture itself is already
  // baked in and cannot be changed from SignalRGB at all. For a colour effect
  // the colour IS the effect and everything else is applied to it, so it comes
  // first — somebody who installs a gradient wants to try their own two
  // colours in it before they wonder how fast it should move.
  if (layer && layer.type === 'solid') {
    controls.push(colour('color', 'Farbe', 'Colour', layer.color, `${layerId}.color`));
    motionControls();
  }

  if (layer && layer.type === 'gradient') {
    layer.stops.forEach((stop, index) => {
      const at = index + 1;
      controls.push(colour(`color${at}`, `Farbe ${at}`, `Colour ${at}`, stop.color,
        `${layerId}.stops.${index}.color`));
    });
    controls.push(
      dropdown('shape', 'Form', 'Shape', GRADIENT_SHAPES, layer.shape, `${layerId}.shape`),
      // Offered whatever the shape is, and deliberately so. A radial gradient
      // ignores it (it runs outwards from the middle, which has no angle), but
      // the Shape dropdown above can be switched to linear at any moment from
      // this very panel — so a hidden angle would mean switching to linear and
      // finding no way to turn the ramp. The angle is remembered rather than
      // conditional; the cost is one slider that does nothing while radial is
      // chosen, against a dead end if it were left out.
      slider('angle', 'Winkel', 'Angle', layer.angle, `${layerId}.angle`),
      // Offered whatever the shape is, for exactly the reason the angle is:
      // "linear" and "radial" have nothing for a repeat count to do, but the
      // Shape dropdown right above it can be switched to stripes, waves or the
      // conic at any moment from this very panel, and a band count that only
      // appeared for some shapes would leave somebody who switched with no way
      // to set the one thing those shapes are about.
      slider('bands', 'Baender', 'Bands', layer.bands, `${layerId}.bands`)
    );
    motionControls();
  }

  // A figure. Colour first for the same reason a gradient's is — the colour IS
  // the effect and everything else is applied to it — then what the figure is,
  // then where and how big, then how it moves.
  //
  // EVERY GEOMETRY FIELD IS OFFERED WHATEVER THE FIGURE IS, including the two
  // only one figure reads. That is the decision `angle` and `bands` already
  // made on a gradient (their notes are a few lines up) and it is made here for
  // the same reason: the Figure dropdown is in this very panel, so a thickness
  // that only appeared while "ring" was chosen would leave somebody who
  // switched to the ring with no way to set the one thing a ring is about. The
  // cost is two sliders that do nothing for three figures out of four; the cost
  // of the alternative is a dead end.
  if (layer && layer.type === 'shape') {
    controls.push(
      colour('color', 'Farbe', 'Colour', layer.color, `${layerId}.color`),
      dropdown('figure', 'Figur', 'Figure', SHAPE_FIGURES, layer.figure, `${layerId}.figure`),
      slider('size', 'Groesse', 'Size', layer.size, `${layerId}.size`),
      slider('posX', 'Position X', 'Position X', layer.position.x, `${layerId}.position.x`),
      slider('posY', 'Position Y', 'Position Y', layer.position.y, `${layerId}.position.y`),
      slider('thickness', 'Randstaerke', 'Thickness', layer.thickness, `${layerId}.thickness`),
      slider('points', 'Zacken', 'Points', layer.points, `${layerId}.points`)
    );
    motionControls();
  }

  // A swarm. Colours first for the same reason a gradient's and a figure's are
  // — the colour IS the effect and everything else is applied to it — then what
  // the swarm does, then how many and how big, then which way and how fast, and
  // last the one control that is not a quality of the picture at all.
  //
  // A STOP'S POSITION IS NOT OFFERED HERE AND IS NOT READ BY THE RENDERER. On a
  // gradient the position is left out of the exported panel for a reason of
  // taste (there is no gradient bar to judge it against — see the note on
  // `stop` above); here it is left out because it MEANS nothing. A particle
  // takes one of these colours whole, chosen by its own hash, exactly as
  // `Poison` and its eight copies pick `colors[this.ssi]`. The colours have an
  // order; there is nothing for them to have a position along.
  if (layer && layer.type === 'particles') {
    layer.stops.forEach((stop, index) => {
      const at = index + 1;
      controls.push(colour(`color${at}`, `Farbe ${at}`, `Colour ${at}`, stop.color,
        `${layerId}.stops.${index}.color`));
    });
    controls.push(
      dropdown('pattern', 'Muster', 'Pattern', PARTICLE_PATTERNS, layer.pattern,
        `${layerId}.pattern`),
      slider('particleCount', 'Anzahl', 'Count', layer.count, `${layerId}.count`),
      slider('particleSize', 'Groesse', 'Size', layer.size, `${layerId}.size`),
      // A LEAN off the pattern's own direction, not an absolute angle — which
      // is what makes the Pattern dropdown right above it tell the truth in
      // this panel. Switching to "rise" here really does make the swarm rise,
      // because the direction belongs to the pattern and this only leans it.
      // The earlier design, an absolute angle with a per-pattern default, could
      // not do that from a panel like this one at all: SignalRGB's controls
      // write one value each and there is nowhere to put a rule that changes a
      // second field. See MAX_PARTICLE_TILT in src/engine/document.js.
      slider('tilt', 'Neigung', 'Tilt', layer.tilt, `${layerId}.tilt`),
      slider('travelSpeed', 'Reisetempo', 'Travel Speed', layer.speed, `${layerId}.speed`),
      slider('seed', 'Anordnung', 'Arrangement', layer.seed, `${layerId}.seed`)
    );
    motionControls();
  }

  // ----------------------------------------------------------- the background
  //
  // Everything it offers is prefixed `bg` and labelled "Hintergrund" /
  // "Background", because SignalRGB's panel is one flat run of controls and
  // there is nothing else that can say which layer a knob belongs to. See the
  // note on the four aliases in CONTROL_RANGES for why sharing a name with the
  // foreground would have been a bug and not a tidy-up.
  //
  // Only the two types a background can be are answered here. That is not a gap
  // to fill in later: BACKGROUND_KINDS (src/engine/slots.js) is exactly `solid`
  // and `gradient`, because a background has to cover the canvas and those are
  // the two types that do. A document hand-edited to put something else
  // underneath still RENDERS — the engine draws every layer it is given — it
  // simply gets no controls of its own, which is the same thing that happens to
  // a foreground of an unknown type a few lines up.
  const background = backgroundId
    ? doc.layers.find((entry) => entry.id === backgroundId)
    : null;

  if (background && background.type === 'solid') {
    controls.push(colour('bgColor', 'Hintergrund Farbe', 'Background Colour', background.color,
      `${backgroundId}.color`));
  }

  if (background && background.type === 'gradient') {
    background.stops.forEach((stop, index) => {
      const at = index + 1;
      controls.push(colour(`bgColor${at}`, `Hintergrund Farbe ${at}`, `Background Colour ${at}`,
        stop.color, `${backgroundId}.stops.${index}.color`));
    });
    controls.push(
      dropdown('bgShape', 'Hintergrund Form', 'Background Shape', GRADIENT_SHAPES, background.shape,
        `${backgroundId}.shape`),
      // Offered whatever the shape is, for exactly the reason the foreground's
      // angle and bands are — the Form dropdown right above it can be switched
      // from this very panel, and a slider that only appeared for some shapes
      // would leave somebody who switched with no way to set the one thing
      // those shapes are about.
      slider('bgAngle', 'Hintergrund Winkel', 'Background Angle', background.angle,
        `${backgroundId}.angle`),
      slider('bgBands', 'Hintergrund Baender', 'Background Bands', background.bands,
        `${backgroundId}.bands`)
    );
  }

  if (background) {
    motionControlsFor(background, backgroundId, {
      motion: ['bgMotion', 'Hintergrund Modus', 'Background Motion'],
      tempo: ['bgTempo', 'Hintergrund Tempo', 'Background Speed'],
      strength: ['bgStrength', 'Hintergrund Staerke', 'Background Strength']
    });
  }

  // The three document-wide settings that are about the picture rather than
  // about one layer, put ahead of the grade because that is the order somebody
  // reads them in: how it smears, what colour it is, and only then how bright
  // and how strong. `trail` leads because it is the one that changes what the
  // effect IS rather than how it is tinted — see docs/effekt-inventur.md,
  // section A2, where a veil is what makes a whole family of effects look the
  // way they do.
  controls.push(
    slider('trail', 'Nachziehen', 'Trail', doc.trail, 'trail'),
    slider('hueShift', 'Farbdrehung', 'Hue Shift', doc.hueShift, 'hueShift'),
    slider('hueCycle', 'Farbwechsel', 'Colour Cycle', doc.hueCycle, 'hueCycle')
  );

  // The host-stretch compensation, offered exactly when it can do something:
  // `aspect` is read by the two layer types that draw round things (shape,
  // particles) and by nothing else, so a document with neither would export a
  // slider that provably cannot change a byte — the exact fault the Motion
  // dropdown's motionKindsFor exists to prevent. Checked against the WHOLE
  // layer list rather than the two ids this function was handed, because a
  // hand-written document can carry a swarm on a third layer and its slider
  // must not vanish for sitting outside the two named slots.
  if (doc.layers.some((entry) => entry.type === 'shape' || entry.type === 'particles')) {
    controls.push(slider('aspect', 'Breitenausgleich', 'Aspect Fix', doc.aspect, 'aspect'));
  }

  controls.push(
    slider('brightness', 'Helligkeit', 'Brightness', doc.brightness, 'brightness'),
    slider('saturation', 'Farbstaerke', 'Saturation', doc.saturation, 'saturation'),
    slider('greenMagenta', 'Gruen/Magenta', 'Green/Magenta', doc.greenMagenta, 'greenMagenta'),
    slider('blueYellow', 'Blau/Gelb', 'Blue/Yellow', doc.blueYellow, 'blueYellow')
  );

  return controls;
}

/**
 * Give a layer a motion entry to bind to, if it has none.
 *
 * setByPath (src/engine/bind.js) deliberately refuses to create a missing
 * branch, so an empty `motions` list would leave the motion/tempo/strength
 * controls with nowhere to write — three sliders that exist on paper and do
 * nothing. A baked `kind: 'none'` entry is not a placeholder standing in for
 * something else: normalizeDocument keeps "none" as an ordinary, inert entry
 * and the renderer ignores it exactly as it ignores an empty list, so the
 * picture is unchanged and the controls are alive.
 *
 * Returns a normalized document; the original is not touched.
 */
export function withLiveMotion(doc, layerId) {
  const layer = doc.layers.find((entry) => entry.id === layerId);
  // Every layer type that carries motions at all, not just the picture: a
  // gradient's and a solid's motion controls would be just as dead without an
  // entry to write into. A layer type with no motions field (an unknown one)
  // is left exactly as it is.
  if (!layer || !Array.isArray(layer.motions) || layer.motions.length > 0) return doc;
  return normalizeDocument({
    ...doc,
    layers: doc.layers.map((entry) => (entry === layer ? { ...entry, motions: [{ kind: 'none' }] } : entry))
  }).doc;
}
