// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later

// Frozen metadata only: the two lists of allowed values, so the dropdowns
// offer exactly what normalizeDocument accepts and nothing else. This is
// NOT the render path — createRenderer/loadAssets/normalizeDocument still
// reach the window solely through window.SignalForgeEngine (the bundle
// index.html loads), which is what keeps test/export/parity.test.js
// meaningful. src/engine/document.js imports nothing at all, so it loads in
// the browser as a plain ES module just as it does in node:test, where this
// file is imported with no DOM whatsoever.
import {
  FIT_MODES, GRADIENT_SHAPES, SHAPE_FIGURES, SPINNABLE_FIGURES, PARTICLE_PATTERNS,
  MIN_GRADIENT_STOPS, MAX_GRADIENT_STOPS, motionKindsFor
} from '../../../src/engine/document.js';
import {
  BACKGROUND_KINDS, backgroundOf, foregroundOf, offersBackground, foregroundLayersOf
} from '../../../src/engine/slots.js';
import { CONTROL_RANGES } from '../../../src/export/effect-controls.js';
import { createField, createMotions, createStops } from './field.js';
import { icon } from './icons.js';
import { enter } from './motion.js';

/** A range plus the one thing a slider needs that a baked control does not. */
const withStep = (range) => Object.freeze({ ...range, step: 1 });

/**
 * Ranges for the sliders: the exported effect's own, under the names the
 * document uses.
 *
 * The obligation — the app and the finished effect must present the same
 * choices — used to be stated in a doc comment on each side of two identical
 * tables, with nothing enforcing it: widen one and the other stayed silently
 * narrower. Now there is one table (CONTROL_RANGES in
 * src/export/effect-controls.js, the same file that holds the one control
 * list) and this is a mapping of its names onto the document's: the exported
 * control called "tempo" steers a motion's `speed`, "strength" its `amount`.
 * The mapping itself is checked in test/app/inspector.test.js, pair by pair,
 * so getting it crossed is not a silent mistake either.
 *
 * Those ranges are on purpose sometimes narrower than what normalizeDocument
 * clamps the same field to (brightness 5..200 against a clamp of 0..200); see
 * widenToInclude below for what happens when a document carries a value
 * outside them.
 *
 * Step is 1 throughout: all six are whole-number percentages, and a step of 1
 * is also what one arrow-key press moves, which is the resolution someone
 * working from the keyboard actually wants. It lives here rather than in the
 * shared table because SignalRGB's own controls have no such notion.
 */
const RANGES = Object.freeze({
  speed: withStep(CONTROL_RANGES.tempo),
  amount: withStep(CONTROL_RANGES.strength),
  brightness: withStep(CONTROL_RANGES.brightness),
  saturation: withStep(CONTROL_RANGES.saturation),
  greenMagenta: withStep(CONTROL_RANGES.greenMagenta),
  blueYellow: withStep(CONTROL_RANGES.blueYellow),
  angle: withStep(CONTROL_RANGES.angle),
  bands: withStep(CONTROL_RANGES.bands),
  hueShift: withStep(CONTROL_RANGES.hueShift),
  hueCycle: withStep(CONTROL_RANGES.hueCycle),
  trail: withStep(CONTROL_RANGES.trail),
  aspect: withStep(CONTROL_RANGES.aspect),
  cycleTempo: withStep(CONTROL_RANGES.cycleTempo),
  // The shape layer's five numbers. Two of the names differ from the
  // document's, exactly as `speed`/`amount` do: the exported controls are
  // called posX and posY because their `property` becomes a global in the
  // finished effect and `x` is not a name to claim there (see CONTROL_RANGES),
  // while the document simply calls them position.x and position.y.
  size: withStep(CONTROL_RANGES.size),
  rotation: withStep(CONTROL_RANGES.rotation),
  positionX: withStep(CONTROL_RANGES.posX),
  positionY: withStep(CONTROL_RANGES.posY),
  thickness: withStep(CONTROL_RANGES.thickness),
  points: withStep(CONTROL_RANGES.points),
  // The particle layer's four. Two of the names differ from the document's for
  // the same reason posX and posY do — the exported control's `property`
  // becomes a global in the finished effect and has to say which `size` and
  // which tempo it is, while the document, which has one layer type per
  // branch, can simply call them `size` and `speed`. See the note beside
  // particleCount in CONTROL_RANGES for why sharing either key would have been
  // a bug rather than a tidy-up.
  particleCount: withStep(CONTROL_RANGES.particleCount),
  particleSize: withStep(CONTROL_RANGES.particleSize),
  travelSpeed: withStep(CONTROL_RANGES.travelSpeed),
  tilt: withStep(CONTROL_RANGES.tilt),
  seed: withStep(CONTROL_RANGES.seed),
  // The one range in this table the exported effect does not also offer, and
  // src/export/effect-controls.js says why at length: a stop position needs a
  // gradient to be seen against, and SignalRGB's panel has none.
  stop: withStep(CONTROL_RANGES.stop),
  // The background's four. They hold the same two numbers their foreground
  // counterparts do — they are aliases over there (see CONTROL_RANGES) — and
  // they are listed separately here for the same reason they exist at all:
  // this table is what pins the app's sliders to the exported effect's
  // controls, one pair at a time, and a background angle that borrowed the
  // foreground's entry would leave `bgAngle` with no slider on this side and
  // nothing to notice it (test/app/inspector.test.js).
  bgAngle: withStep(CONTROL_RANGES.bgAngle),
  bgBands: withStep(CONTROL_RANGES.bgBands),
  bgTempo: withStep(CONTROL_RANGES.bgTempo),
  bgStrength: withStep(CONTROL_RANGES.bgStrength)
});

/**
 * The same ranges as seen from the background, which is four entries renamed
 * and nothing else.
 *
 * The field-building functions below take a range table rather than reading
 * RANGES directly, so the very same code draws a gradient's cards whether that
 * gradient is the thing on top or the thing behind it — which is what "reuse
 * the card vocabulary for a second layer" has to mean if the two are not to
 * drift apart. The entries a background can never reach (a figure's size, a
 * swarm's seed) are carried across untouched rather than left out: a table with
 * holes in it would make the lookup conditional, and the layer types that would
 * need them cannot be a background in the first place.
 */
const BACKGROUND_RANGES = Object.freeze({
  ...RANGES,
  angle: RANGES.bgAngle,
  bands: RANGES.bgBands,
  speed: RANGES.bgTempo,
  amount: RANGES.bgStrength
});

/**
 * The gradient shapes built out of a repeat of the ramp, and therefore the
 * only ones with anything for a band count to do.
 *
 * Derived from the engine's list rather than written out, so a sixth shape
 * added over there has to answer this question here instead of silently
 * arriving with no band control: everything that is not one of the two
 * single-traversal shapes repeats.
 */
const REPEATING_SHAPES = Object.freeze(
  GRADIENT_SHAPES.filter((shape) => shape !== 'linear' && shape !== 'radial')
);

/**
 * The colour fields that belong to the document itself, in the order they
 * appear.
 *
 * THE TWO HUE CONTROLS LEAD, AND THE OTHER FOUR DID NOT MOVE. Everything under
 * this heading answers a question about colour, and there is an order to those
 * questions: WHICH colour (the hue and the speed it turns at), then how much of
 * it (saturation), then which way it leans (the two axes), then how bright.
 * The hue is the only one of the six that changes what colour the effect IS
 * rather than grading a colour already chosen, so it comes first — and it is
 * also, by a distance, the most used control in the 31 effects read for
 * docs/effekt-inventur.md (section A4), which is a good reason for it to be the
 * first thing under the heading rather than the last.
 *
 * The existing four keep their exact relative order. Two controls arriving
 * above a list is something somebody reads once; the same list re-sorted under
 * them is something they have to learn again, and there was no reason to ask
 * for that.
 *
 * The pair is adjacent and in this order — where it is parked, then how fast it
 * moves — which is the shape every motion card in this column already has (what
 * kind, then how fast, then how strongly).
 */
const DOCUMENT_FIELDS = Object.freeze([
  'hueShift', 'hueCycle', 'saturation', 'greenMagenta', 'blueYellow', 'brightness'
]);

/**
 * The three headed sections the column is read in, and the heading each one
 * carries. A flat list of fifteen controls has no rhythm and nothing to steer
 * by; these are the three questions somebody actually asks in order — which
 * part of the picture, how it moves, what colour it is.
 *
 * Named here and not in field.js because which section a field belongs to is
 * arithmetic over the document, like everything else in this file, and is
 * checked in plain node (test/app/inspector.test.js).
 */
export const SECTION_TITLES = Object.freeze({
  layers: 'inspector.section.layers',
  fill: 'inspector.section.fill',
  image: 'inspector.section.image',
  motions: 'inspector.motions',
  background: 'inspector.section.background',
  colour: 'inspector.section.colour',
  display: 'inspector.section.display'
});

/**
 * The glyph that leads each section's heading.
 *
 * It used to be exported because the left column's entries carried the very
 * same icons and the two tables had to be pinned to each other. That column is
 * gone (see components/shell.js), and with it the second table — so this is
 * now the ONE place a section's picture is decided, which is what that pinning
 * was only ever an approximation of. It stays exported so that
 * test/app/fill-section.test.js can still check the pairing that survives:
 * every section this file can build has both a word and a picture, and neither
 * table names a section the other has never heard of.
 */
export const SECTION_GLYPHS = Object.freeze({
  layers: 'background',
  fill: 'solid',
  image: 'image',
  motions: 'motion',
  background: 'background',
  colour: 'colour',
  display: 'settings'
});

/**
 * "layers.0.motions.1.speed" -> 1, or null for anything that is not an entry
 * of that list. One function for both repeating lists in the column — the
 * motions and a gradient's colour stops — because they are drawn the same way:
 * a card per entry, the entry's own controls inside it, and its number in the
 * legend so the repeated labels are told apart by something a screen reader
 * announces and not only by where they sit.
 */
function entryIndexOf(path, list) {
  const match = new RegExp(`^layers\\.\\d+\\.${list}\\.(\\d+)\\.`).exec(path);
  return match ? Number(match[1]) : null;
}

/**
 * Which motion kinds a layer's dropdowns may offer: the engine's own list for
 * that type, widened by whatever the layer actually carries.
 *
 * The offer gives way, never the value — the same rule the sliders follow (see
 * widenToInclude below) and the same one the exported effect's Motion dropdown
 * follows (src/export/effect-controls.js). Without this a hand-written `drift`
 * on a solid layer would be built from 'none'/'breathe' alone, `select.value =
 * 'drift'` would match no option, and the dropdown would render BLANK: a
 * control that shows nothing, and whose first touch would silently write some
 * other kind into a document that said drift.
 *
 * Widened by every kind in the list, not only the first: field.js builds every
 * row's dropdown from this one array, so a second entry the offer does not
 * name would go blank exactly as the first would.
 */
function motionKindsWide(layer) {
  // The figure matters for one layer type and is ignored for the other three
  // — a star may spin and a circle may not (see motionKindsFor). Passed
  // unconditionally rather than behind a type test, so this stays one line and
  // the question of which types care stays in the engine, where it is answered.
  const offered = motionKindsFor(layer.type, layer.figure);
  const extra = layer.motions
    .map((motion) => motion.kind)
    .filter((kind, index, all) => !offered.includes(kind) && all.indexOf(kind) === index);
  return extra.length === 0 ? offered : [...offered, ...extra];
}

/**
 * The cards that say what one layer is MADE OF, for whichever type it is.
 *
 * ONE FUNCTION AND NOT TWO, which is the whole of what makes a background
 * possible without a second settings column. It used to be the body of
 * describeInspector, addressing "the" layer; it is now handed a layer, the path
 * that reaches it, the section its cards belong under and the table its sliders
 * take their ranges from — so the same code draws a gradient's colour stops
 * whether that gradient is the effect or the thing behind it.
 *
 * `at` is a dot path into the document ("layers.0", "layers.1"), derived by the
 * caller from the layer's ID at the moment it asks. See src/engine/slots.js:
 * an index in this column lives exactly as long as one build of it.
 *
 * `R` is a range table keyed by the document's own field names — RANGES for the
 * foreground, BACKGROUND_RANGES for what is underneath.
 */
function fillFields(layer, at, section, R) {
  const fields = [];

  /**
   * The colour cycle's three pieces: the tempo, the list, and one colour per
   * entry — the same card vocabulary the gradient's stops already use, so
   * there is nothing new to learn (see src/engine/motion/color-cycle.js for
   * what the fields mean). FOREGROUND ONLY for now: the engine cycles a
   * background solid just as well, but the exported effect deliberately
   * offers no background cycle controls yet, and this column showing a knob
   * the export then quietly lacks would be the two halves disagreeing.
   */
  const cycleFields = () => {
    if (section !== 'fill') return;
    fields.push({
      path: `${at}.cycleSpeed`, type: 'number', section,
      labelKey: 'inspector.cycleSpeed', ...R.cycleTempo
    });
    // The colours appear WITH the cycle and not before it.
    //
    // Reported 12.08.2026: the palette knobs were turned in SignalRGB and
    // nothing happened. Nothing was broken — cyclePaint returns the resting
    // colour while the tempo is 0 and never reads the palette
    // (src/engine/motion/color-cycle.js) — but a knob that quietly does
    // nothing is indistinguishable from a knob that is broken, and the person
    // it happened to is the one who wrote the engine.
    //
    // The tempo slider is directly above, so the way to make them appear is
    // the same gesture that makes them mean something. The export follows the
    // same rule (src/export/effect-controls.js), which is what keeps the panel
    // and this column saying the same thing.
    if (!(Number(layer.cycleSpeed) > 0)) return;
    // The cards carry the cycle's OWN words — "Wechselfarbe", the same name
    // the exported controls already use — rather than inheriting the
    // gradient's "Farbstopp": there is no ramp here and nothing for a stop to
    // stop at, and a card called "Farbe" two rows under the resting "Farbe"
    // field would be told apart by nothing at all.
    fields.push({
      path: at, type: 'stops', section,
      min: MIN_GRADIENT_STOPS, max: MAX_GRADIENT_STOPS,
      entryLabelKey: 'inspector.cycleColour', addLabelKey: 'inspector.addCycleColour'
    });
    layer.stops.forEach((_, i) => {
      fields.push({
        path: `${at}.stops.${i}.color`, type: 'color', section,
        labelKey: 'inspector.cycleColour'
      });
    });
  };

  // What the layer is made of, for the two types that are made of colour.
  if (layer && layer.type === 'solid') {
    fields.push({
      path: `${at}.color`, type: 'color', section, labelKey: 'inspector.colour'
    });
    cycleFields();
  }

  if (layer && layer.type === 'gradient') {
    fields.push({
      path: `${at}.shape`, type: 'select', section,
      labelKey: 'inspector.shape', values: [...GRADIENT_SHAPES]
    });
    // Each of the next two only while it means something. This column's whole
    // rule is that a control which is there can be used, so a control that
    // provably cannot change a pixel for the shape currently chosen is not
    // drawn at all. (The EXPORTED effect keeps both whatever the shape, and
    // src/export/effect-controls.js says why: over there the shape can be
    // switched from the same panel, so a hidden field would be a dead end
    // rather than a tidy-up. Here the shape dropdown is two rows up and this
    // column redraws the moment it changes.)
    //
    // The angle: a radial gradient runs outwards from the middle and has no
    // direction to turn. Every other shape does — including the conic, whose
    // angle is where its sweep begins.
    if (layer.shape !== 'radial') {
      fields.push({
        path: `${at}.angle`, type: 'number', section,
        labelKey: 'inspector.angle', ...R.angle
      });
    }
    // The band count: only the three shapes that repeat have anything to
    // repeat. "linear" and "radial" ARE one traversal of the ramp by
    // definition (see MIN_BANDS in src/engine/document.js).
    if (REPEATING_SHAPES.includes(layer.shape)) {
      fields.push({
        path: `${at}.bands`, type: 'number', section,
        labelKey: 'inspector.bands', ...R.bands
      });
    }
    // The list itself carries no label of its own: unlike the motion list it
    // has no per-entry dropdown to name, and the heading it lives under
    // already says what these are. What it does carry is the two limits, so
    // the add and remove buttons can say "no more" by being disabled rather
    // than by a change that normalizeDocument then quietly undoes.
    fields.push({
      path: at, type: 'stops', section,
      min: MIN_GRADIENT_STOPS, max: MAX_GRADIENT_STOPS
    });
    layer.stops.forEach((_, i) => {
      fields.push({
        path: `${at}.stops.${i}.color`, type: 'color', section,
        labelKey: 'inspector.stopColour'
      });
      // And the same rule once more, for the one shape that does not read a
      // stop's POSITION: a stripe is one colour from edge to edge, so there is
      // nothing along it for a position to mean, and the engine builds its
      // bands from the colours and their order alone (see addRepeatingStops in
      // src/engine/layers/gradient.js). The colours stay, because those are
      // the whole of what a stripe is.
      if (layer.shape !== 'stripes') {
        fields.push({
          path: `${at}.stops.${i}.at`, type: 'number', section,
          labelKey: 'inspector.stopAt', ...R.stop
        });
      }
    });
  }

  // A figure: what it is, what colour, how big, where — and then the one extra
  // number the chosen figure actually reads.
  //
  // THE SAME RULE AS THE GRADIENT'S ANGLE AND BANDS, APPLIED THE SAME WAY. This
  // column's whole discipline is that a control which is there can be used, so
  // a control that provably cannot change a pixel for the figure currently
  // chosen is not drawn at all: a thickness means nothing to a star, a point
  // count means nothing to a heart. The EXPORTED effect keeps both whatever the
  // figure (src/export/effect-controls.js says why at length), and the two are
  // not in conflict — over there the figure can be switched from the same panel
  // with nothing to redraw the list, here the figure dropdown is two rows up
  // and this column rebuilds the moment it changes.
  if (layer && layer.type === 'shape') {
    fields.push({
      path: `${at}.figure`, type: 'select', section,
      labelKey: 'inspector.figure', values: [...SHAPE_FIGURES]
    });
    fields.push({
      path: `${at}.color`, type: 'color', section, labelKey: 'inspector.colour'
    });
    cycleFields();
    fields.push({
      path: `${at}.size`, type: 'number', section,
      labelKey: 'inspector.size', ...R.size
    });
    fields.push({
      path: `${at}.position.x`, type: 'number', section,
      labelKey: 'inspector.positionX', ...R.positionX
    });
    fields.push({
      path: `${at}.position.y`, type: 'number', section,
      labelKey: 'inspector.positionY', ...R.positionY
    });
    if (layer.figure === 'ring') {
      fields.push({
        path: `${at}.thickness`, type: 'number', section,
        labelKey: 'inspector.thickness', ...R.thickness
      });
    }
    if (layer.figure === 'star') {
      fields.push({
        path: `${at}.points`, type: 'number', section,
        labelKey: 'inspector.points', ...R.points
      });
    }
    // The standing pose — only for the figures a turn can be SEEN on, the
    // same gate thickness and points obey for their figures (the engine
    // ignores a rotation on a circle or a ring outright, see layers/shape.js,
    // so a slider here would be the one thing worse than a missing one).
    if (SPINNABLE_FIGURES.includes(layer.figure)) {
      fields.push({
        path: `${at}.rotation`, type: 'number', section,
        labelKey: 'inspector.rotation', ...R.rotation
      });
    }
  }

  // A swarm: what it does, what colours it is made of, then how many and how
  // big, then which way and how fast, and last which arrangement.
  //
  // THE PATTERN LEADS, and the colours come straight after it rather than last
  // the way a gradient's do. That is not inconsistency, it is the same rule
  // read correctly: a gradient's stops carry a POSITION along the ramp, so the
  // ramp's own shape and repeat have to be settled before a position on it
  // means anything, which is why colour comes after them over there. A particle
  // takes one of these colours whole and there is nothing to position it along
  // — so a stop here is nothing but a colour, which is the shape layer's
  // `colour` field in every way that matters, and that one sits second, right
  // after `figure`. This follows the shape layer.
  //
  // AND A STOP'S POSITION IS NOT DRAWN, for the same reason it is not drawn for
  // the `stripes` gradient a few lines up: the renderer does not read it (see
  // src/engine/layers/particles.js), so a slider for it would be a control that
  // provably cannot change a pixel — which is the one thing this column does
  // not do.
  if (layer && layer.type === 'particles') {
    fields.push({
      path: `${at}.pattern`, type: 'select', section,
      labelKey: 'inspector.pattern', values: [...PARTICLE_PATTERNS]
    });
    fields.push({
      path: at, type: 'stops', section,
      min: MIN_GRADIENT_STOPS, max: MAX_GRADIENT_STOPS
    });
    layer.stops.forEach((unused, i) => {
      fields.push({
        path: `${at}.stops.${i}.color`, type: 'color', section,
        labelKey: 'inspector.stopColour'
      });
    });
    fields.push({
      path: `${at}.count`, type: 'number', section,
      labelKey: 'inspector.count', ...R.particleCount
    });
    fields.push({
      path: `${at}.size`, type: 'number', section,
      labelKey: 'inspector.size', ...R.particleSize
    });
    fields.push({
      path: `${at}.tilt`, type: 'number', section,
      labelKey: 'inspector.tilt', ...R.tilt
    });
    fields.push({
      path: `${at}.speed`, type: 'number', section,
      labelKey: 'inspector.travelSpeed', ...R.travelSpeed
    });
    fields.push({
      path: `${at}.seed`, type: 'number', section,
      labelKey: 'inspector.seed', ...R.seed
    });
  }

  return fields;
}

/**
 * The motion list for one layer, and a card per entry.
 *
 * Motions belong to the layer, not to the picture: every type that carries a
 * motions list gets the list, the add button and a card per entry. Which kinds
 * are on offer is the engine's answer and not this file's — a solid colour
 * cannot be seen to drift or warp, so it is offered neither.
 *
 * Takes its section and its ranges the way fillFields does, and for the same
 * reason: a background has motions of its own, they are steered by exactly
 * these two sliders, and they appear under the background's own heading rather
 * than mixed in with the foreground's.
 */
function motionFields(layer, at, section, R) {
  const fields = [];
  if (!layer || !Array.isArray(layer.motions)) return fields;

  fields.push({
    path: at, type: 'motions', section,
    labelKey: 'inspector.motions', values: [...motionKindsWide(layer)]
  });
  layer.motions.forEach((_, i) => {
    fields.push({
      path: `${at}.motions.${i}.speed`, type: 'number', section,
      labelKey: 'inspector.speed', ...R.speed
    });
    fields.push({
      path: `${at}.motions.${i}.amount`, type: 'number', section,
      labelKey: 'inspector.amount', ...R.amount
    });
  });
  return fields;
}

/**
 * What the settings column should show, as plain data.
 *
 * Deliberately free of any DOM: which fields exist is arithmetic over the
 * document and is tested in plain node (test/app/inspector.test.js); how
 * they look is field.js's job.
 *
 * Each field is `{ path, type, labelKey, min, max, step, values, group }`,
 * where `path` is a dot path into the document so a change runs through the
 * very same setByPath mechanism the exported effect's controls use. `type` is
 * 'number' (a slider), 'select' (a dropdown), 'color', 'motions' or 'stops'
 * (the lists with their add and remove buttons), or 'background' (the one
 * control that decides whether there is a second layer at all). `group` is
 * optional and only says that a run of fields should be boxed together — see
 * the background section below.
 *
 * The order of the array is the order in the window.
 *
 * An unknown layer id, or a layer that is not an image, simply contributes
 * nothing — the document-wide fields are still returned, so the column is
 * never empty and never throws.
 *
 * Note the 'motions' field's path: it addresses the LAYER, not the layer's
 * motions array, and field.js appends `.motions` to it when it reports a
 * change. That is on purpose — "no motions" must mean no motion entries in
 * this list at all (see test/app/inspector.test.js), and a path ending in
 * ".motions" would still be one.
 *
 * THE ORDER OF THE FIVE SECTIONS, AND WHY THE BACKGROUND SITS FOURTH
 *
 *   Fläche / Bild   what the effect IS
 *   Bewegungen      how it moves (and, at the end, what it leaves behind)
 *   Hintergrund     what is behind it
 *   Farbe           the grade over all of it
 *
 * The background comes after the foreground is completely described rather than
 * beside it, because it is the secondary thing and because its own motions have
 * to travel with it: putting the section between "Fläche" and "Bewegungen"
 * would print the background's motion cards ABOVE the foreground's, which reads
 * as the wrong layer's list. And it comes before "Farbe" because the grade is
 * document-wide and applies to the two of them together, so it belongs last.
 */
export function describeInspector(doc, layerId) {
  const index = doc.layers.findIndex((entry) => entry.id === layerId);
  const layer = index < 0 ? null : doc.layers[index];
  const at = `layers.${index}`;

  const fields = [];

  // The stack, above everything: which layer the rest of this column is
  // ABOUT is the first question, so the cards that answer it come first.
  // One field, like 'background' — the card list is one control whose value
  // is the document's layer array; what each card SHOWS is precomputed here
  // (arithmetic over the document belongs in this file, testable in node),
  // what pressing its buttons DOES is field.js walking the stack functions
  // in src/engine/slots.js. Emitted only once there is something to stack —
  // a document mid-boot with no layers gets no empty section.
  const stack = foregroundLayersOf(doc.layers);
  if (stack.length > 0) {
    fields.push({
      path: 'layers',
      type: 'layers',
      section: 'layers',
      selectedId: layerId,
      entries: stack.map((entry) => ({
        id: entry.id,
        type: entry.type,
        figure: entry.type === 'shape' ? entry.figure : null,
        visible: entry.visible !== false
      }))
    });
  }

  fields.push(...fillFields(layer, at, 'fill', RANGES));

  if (layer && layer.type === 'image') {
    fields.push({
      path: `${at}.fit`, type: 'select', section: 'image',
      labelKey: 'inspector.fit', values: [...FIT_MODES]
    });
  }

  fields.push(...motionFields(layer, at, 'motions', RANGES));

  // The trail belongs to the DOCUMENT and it belongs under this heading, which
  // is the one place in this column those two things pull apart.
  //
  // It is not a colour, so it cannot go with the six below; and it is not a
  // property of a layer, so it cannot go in a motion card. What it actually
  // describes is what happens BETWEEN two frames — whether the picture the
  // motions just moved is wiped or left to fade — which is why it reads
  // correctly at the end of "Bewegungen" and nowhere else. Somebody wondering
  // why their drift does not smear looks under motion.
  //
  // Emitted whatever the layer is, exactly like the six colour fields, so the
  // heading is there even for a document with no layers at all. The cost of
  // that is one section holding one slider on an empty window; the cost of the
  // alternative — a control that comes and goes with the layer type — is a
  // setting somebody can store and then not find again.
  fields.push({
    path: 'trail', type: 'number', section: 'motions',
    labelKey: 'inspector.trail', ...RANGES.trail
  });

  // ------------------------------------------------------------ what is behind
  //
  // Offered only to the layer that IS the foreground, and only when a
  // background under it could be seen at all (offersBackground, in
  // src/engine/slots.js, answers both halves). Asking this column about the
  // background layer itself — which nothing in the app does, but tests and a
  // future layer list will — describes that layer's own cards and does NOT
  // offer it a background of its own. There is one slot, not a stack.
  //
  // THE COMBOBOX'S PATH IS `layers`, AND ITS VALUE IS THE WHOLE LIST. That is
  // the same shape the motion list and the stop list already use, deliberately:
  // adding or removing a layer changes the document's SHAPE, and the one
  // mechanism this window has for that is "report an array, let setDocument put
  // it through normalizeDocument" (see app/renderer/main.js). So a background
  // arrives with its colour, its stops and its band count filled in by the
  // engine's own defaults, and this file names none of them — which is what
  // keeps the whole renderer free of colours of its own.
  const foreground = foregroundOf(doc.layers);
  if (layer && layer === foreground && offersBackground(doc.layers)) {
    fields.push({
      path: 'layers', type: 'background', section: 'background',
      labelKey: 'inspector.background', values: [...BACKGROUND_KINDS]
    });

    const background = backgroundOf(doc.layers);
    if (background) {
      // Always index 0 — that is what being the background MEANS (slots.js) —
      // but derived rather than written down, so this line goes on being true
      // if the slot ever moves.
      const behind = `layers.${doc.layers.indexOf(background)}`;
      // `group` is what makes the cards that come and go read as ONE thing
      // arriving under a heading that was already there, rather than as the
      // column jumping: mountInspector puts a run of fields sharing a group
      // into a box of its own and plays the window's one entrance on it. The
      // combobox above is deliberately NOT in the group — it is the control
      // that caused the change, and a control that animates itself when it is
      // used is a control that flinches.
      for (const field of fillFields(background, behind, 'background', BACKGROUND_RANGES)) {
        fields.push({ ...field, group: 'background' });
      }
      // ITS MOTIONS ARE A SECOND GROUP, AND THAT IS NOT TIDINESS. Each of the
      // two lists in this section — the colour stops and the motions — carries
      // a button that adds another entry, and a list's add button goes into the
      // heading of whatever it is inside (see closeList in mountInspector).
      // Both in one section put two identical "+" glyphs side by side in the
      // "Hintergrund" heading, with nothing but a tooltip to say which added a
      // colour and which added a motion. That is the fault this column refuses
      // everywhere else, photographed doing it: work/background-shots, first
      // run.
      //
      // A group of its own with a caption of its own takes one of them out of
      // that heading and puts it beside the word for what it adds — which is
      // exactly the arrangement the foreground already has, where the two lists
      // are in two sections. The caption is a sub-heading and NOT a section: a
      // section is a thing the column scrolls between, and a background's
      // motions are part of the background.
      const motions = motionFields(background, behind, 'background', BACKGROUND_RANGES);
      for (const field of motions) {
        fields.push({ ...field, group: 'background-motions', groupLabel: 'inspector.motions' });
      }
    }
  }

  for (const name of DOCUMENT_FIELDS) {
    fields.push({
      path: name, type: 'number', section: 'colour',
      labelKey: `inspector.${name}`, ...RANGES[name]
    });
  }

  // The host-stretch compensation, last because it is the only setting here
  // that is not about the picture but about the machine SHOWING the picture
  // (see MIN_ASPECT in src/engine/document.js for the measurement). Emitted
  // whatever the layers are, exactly like trail: the preview's own frame
  // follows this value (components/preview.js), so it is visibly doing
  // something on every document — and a control that comes and goes with the
  // layer type is a setting somebody can store and then not find again. The
  // EXPORTED control is the one that is conditional (effect-controls.js),
  // because inside SignalRGB there is no preview frame to follow it.
  fields.push({
    path: 'aspect', type: 'number', section: 'display',
    labelKey: 'inspector.aspect', ...RANGES.aspect
  });
  // The exported tile: automatic, or the person's own picture. Under the
  // same heading as aspect because both are about how the effect is SHOWN
  // rather than what it is — and, like aspect, emitted for every document,
  // because the tile exists for every export.
  fields.push({
    path: 'cover', type: 'cover', section: 'display', labelKey: 'inspector.cover'
  });
  // Who made it. SignalRGB shows this under the effect's name on its own
  // page — "Stern / von ..." — and until now there was no way to fill it in
  // from anywhere, so every effect this app has ever exported arrived there
  // with an empty line under its title. The document field existed the whole
  // time (`publisher`, written into the file's head by build-effect.js);
  // what was missing was somewhere to type it.
  //
  // Under this heading because it is the same kind of thing as the tile: not
  // what the effect IS, but what shows around it once it is somewhere else.
  fields.push({
    path: 'publisher', type: 'text', section: 'display',
    labelKey: 'inspector.publisher', placeholderKey: 'inspector.publisherHint'
  });
  return fields;
}

/**
 * Stretch one slider's range far enough to show a value it would otherwise
 * misreport, and hand back the field unchanged when it already fits.
 *
 * The ranges above are on purpose narrower than what normalizeDocument
 * clamps the same field to (brightness 5..200 against a clamp of 0..200,
 * speed 1..100 against 0..100), so the app offers what the exported effect
 * offers. A document is under no such obligation: an effect exported by hand,
 * a project file edited in a text editor, or a future version with wider
 * controls can all legitimately carry brightness 3. An `<input type=range>`
 * given a value outside its min/max shows the nearest end instead — the
 * slider would sit at 5, and the first touch of it would write 5 into a
 * document that said 3. Quietly losing the user's value that way is worse
 * than briefly offering one step more range than usual, so the range gives
 * way, never the value.
 *
 * Only that one control, only while the value is out of range: as soon as
 * the user drags it back inside, the next redraw restores the normal range.
 */
export function widenToInclude(field, value) {
  if (field.type !== 'number' || !Number.isFinite(value)) return field;
  if (value >= field.min && value <= field.max) return field;
  return { ...field, min: Math.min(field.min, value), max: Math.max(field.max, value) };
}

/**
 * Put the settings column on screen and keep it in step with the document.
 *
 * `getDocument()` returns the one live document — the same object the crop
 * drag reads and writes, so there is never a second copy to fall out of
 * date. `onChange(path, value)` applies a change and may return a promise;
 * the caller decides whether that means writing straight into the live
 * document or reloading it (see app/renderer/main.js).
 *
 * `onError(err)` is where a rejected `onChange` goes. It has exactly one
 * source: adding or removing a motion is the only change that returns a
 * promise, and the only one that can genuinely fail, because it is the only
 * one that reloads the picture. Without somewhere to send it, that failure
 * reached the console alone — the user presses "add motion", the picture
 * stops matching the list, and the window says nothing. Every other failure
 * in this app arrives on the one line of feedback, and so must this one.
 *
 * Redrawing is deliberately restrained. A slider reports a change on every
 * pixel of a drag, and rebuilding the column underneath a held-down mouse
 * (or an arrow key being repeated) would throw the focus away mid-gesture —
 * so a 'number' change never redraws. Everything else does, once the caller
 * is finished, because it can change which fields exist or which values the
 * other dropdowns may still offer. The focused control is restored
 * afterwards by its id, which is derived from the field's path and is
 * therefore stable across a redraw.
 *
 * `defaultAt(path)` answers "what would a fresh document carry here", and is
 * what puts a reset button on every slider. It is passed IN rather than
 * reached for, and that is deliberate on two counts. The engine's
 * defaultValueAt works by normalizing a document (src/engine/document.js says
 * why that is the only honest way to ask), and normalizeDocument reaches this
 * window solely through window.SignalForgeEngine — see the note at the head of
 * this file, and test/export/parity.test.js, which is what that rule protects.
 * Making it an argument also means the unit tests can hand over the very same
 * function and get the very same buttons, instead of a column that is one
 * control poorer everywhere it is checked.
 *
 * Absent, every slider is drawn exactly as it was before: no reset, nothing
 * else changed. A reset button whose target cannot be worked out would be a
 * control that does nothing, which is the one thing this column does not do.
 *
 * There is no layer list yet (that is a later task), so the layer shown is
 * the document's first one.
 */
export function mountInspector(container, {
  getDocument, onChange, t, onError, defaultAt = null,
  // The effect time of the frame on screen (components/preview.js's
  // currentTime), asked at the moment the Farbwechsel tempo changes so the
  // hue can be re-parked at the very angle the person is looking at — see
  // the hueCycle note beside `report` below. Optional, like defaultAt and
  // for the same reason: a caller with no preview to hand (the unit tests)
  // simply gets a column whose cycle slider behaves as it always did.
  previewTime = null,
  // The keeper of the remembered swatches ({ list, remember } — see
  // components/recent-colors.js), handed to every colour field. Optional for
  // the same reason again: without one there is simply no swatch row.
  recents = null,
  // The cover picker ({ choose, clear } — main.js owns the dialog, the crop
  // and the document change), handed to the tile row. Optional again: a
  // caller without one gets the row with its buttons disabled.
  coverPicker = null,
  // Told whenever the stack selection changes — the crop's tab stop follows
  // the selected layer, and choosing a card is the one gesture that reaches
  // no onChange for it to piggyback on. Optional like everything above.
  onSelectionChange = null
}) {
  const SF = window.SignalForgeEngine;

  /**
   * Which sections this column was holding the last time it was built, so the
   * ones that were NOT can be seen to arrive.
   *
   * That is the whole condition, and it is exact rather than approximate,
   * which is the reason this is a set of names and not a flag. A language
   * switch rebuilds every control in the column and changes no section, so
   * nothing moves. Adding a motion rebuilds it and changes no section, so
   * nothing moves. Dropping a picture on a window that had none genuinely
   * grows the column a "Bild" it did not have, and that one animates — because
   * something appeared, which is exactly what the movement says.
   *
   * `null` until the first build: the window opening is not something arriving
   * in it, and an entrance played over the whole column at boot would be an
   * animation nobody caused.
   */
  let previousSections = null;

  // Which stack card the column is about — renderer state, validated against
  // the live stack at the top of every render() (see the note there). null
  // until the first build, which lands it on the stack's top.
  let selectedId = null;

  /**
   * The same question one level down: which BOXES the column was holding.
   *
   * A background's own cards appear under a heading that was already there and
   * beside a combobox that does not move, so `previousSections` cannot see them
   * — the "Hintergrund" section existed a moment ago and exists now. What
   * arrived is the box inside it, and this is what notices that.
   *
   * Keyed by section and group together, because a group name only means
   * anything inside its own section.
   */
  let previousGroups = null;

  function rememberFocus() {
    const active = document.activeElement;
    return active && container.contains(active) && active.id ? active.id : null;
  }

  function restoreFocus(id) {
    if (!id) return;
    const again = document.getElementById(id);
    if (again && container.contains(again)) { again.focus(); return; }
    // The control is gone — a removed motion, or the tile row's reset, which
    // only exists while a picture is chosen and therefore always vanishes
    // under the very click that used it. Land on the nearest control that is
    // still there rather than dumping the keyboard user at the top of the
    // window.
    const remove = /^(.*)-remove-\d+$/.exec(id);
    if (remove) { document.getElementById(`${remove[1]}-add`)?.focus(); return; }
    const reset = /^(.*)-reset$/.exec(id);
    if (reset) { document.getElementById(`${reset[1]}-choose`)?.focus(); return; }
    // A removed stack card takes its own remove button with it — land on the
    // add control, the same answer the motion list's vanished remove gets.
    if (/-remove-stack$/.test(id)) document.getElementById('sf-layer-add')?.focus();
  }

  /**
   * A headed section of the column, appended and handed back to fill.
   *
   * The heading is the section's own glyph and name on the left, its actions
   * on the right — which is where the reference puts a section's icon buttons,
   * and where the "add a motion" button now lives.
   *
   * There used to be an `is-active` mark on one of them, taking the accent
   * under its heading to echo whichever entry the left column was pointing at.
   * With no left column there is nothing to echo: all of these sections are on
   * screen, in one scroll, and none of them is more current than the others.
   * Marking one would be answering a question nobody is now asking.
   */
  function openSection(name) {
    const group = document.createElement('section');
    group.className = 'field-group';
    group.dataset.section = name;

    const heading = document.createElement('h2');
    heading.append(icon(SECTION_GLYPHS[name]));
    const word = document.createElement('span');
    word.textContent = t(SECTION_TITLES[name]);
    heading.append(word);

    const actions = document.createElement('span');
    actions.className = 'section-actions';
    heading.append(actions);

    group.append(heading);
    container.append(group);
    return { group, actions };
  }

  function render() {
    const focused = rememberFocus();
    const doc = getDocument();
    // The layer this column edits is WHICHEVER STACK CARD IS SELECTED — the
    // layer list is here now (Bauplan 3, the "later task" this comment used
    // to name). The selection is renderer state and never a document field:
    // which layer somebody is looking at is not part of what the effect is.
    // Validated against the live stack on every build, so a selection whose
    // layer was removed, or a freshly opened document, lands on the stack's
    // top — which is foregroundOf, exactly what this column edited when the
    // stack could only hold one.
    const stack = foregroundLayersOf(doc.layers);
    if (!stack.some((entry) => entry.id === selectedId)) {
      selectedId = foregroundOf(doc.layers)?.id ?? null;
    }
    const layerId = selectedId;

    container.replaceChildren();

    const fields = describeInspector(doc, layerId);

    // With nothing started at all the column holds nothing but the four colour
    // sliders, and stops. That read as truncated rather than as short: most of
    // the settings were missing with no sign that they exist or that anything
    // brings them back. One sentence, in the place the missing sections will
    // take, naming what brings them — not greyed-out stand-in sections, which
    // would be a picture of an interface rather than the interface.
    //
    // Said only when the document is genuinely empty. It used to appear
    // whenever there was no "image" section, which as of the colour layers
    // would mean printing "choose something below" over a gradient's own
    // controls.
    if (doc.layers.length === 0) {
      const note = document.createElement('p');
      note.className = 'section-note';
      note.textContent = t('inspector.awaitingImage');
      container.append(note);
    }

    let sectionName = null;
    let section = null;
    let sectionActions = null;
    /** Every section this build produced, by name, so the new ones can be told. */
    const built = new Map();
    /** And every boxed group inside them, for the same reason. */
    const builtGroups = new Map();
    // The box a run of fields sharing a `group` goes into, or null when the
    // cards are going straight into the section as they always have.
    let groupName = null;
    let groupBox = null;
    let groupActions = null;

    /** Where a card belongs right now: its group's box, or the section itself. */
    const host = () => groupBox ?? section;

    /**
     * And where an "add another" button belongs: the nearest heading there is.
     *
     * A captioned group has one of its own, which is the whole reason captions
     * exist here — two lists under one section heading would otherwise put two
     * identical glyphs in it.
     */
    const actionsHost = () => groupActions ?? sectionActions;

    const closeGroup = () => {
      groupName = null;
      groupBox = null;
      groupActions = null;
    };

    /**
     * A box for the cards that come and go together.
     *
     * Nothing but a plain element with the cards inside it, which is the whole
     * point: the entrance below has to be played on ONE thing, or five cards
     * fade in as five separate events and the column reads as though it
     * scattered rather than grew. It carries no heading and no border of its
     * own (see .field-cards in styles/app.css) — a second frame inside a
     * section would say there is a second section, and there is not.
     */
    const openGroup = (name, labelKey) => {
      const box = document.createElement('div');
      box.className = 'field-cards';
      box.dataset.group = name;
      if (labelKey) {
        // The same small-caps word a motion card's own legend is set in, so a
        // sub-heading reads as one level under the section rather than as a
        // second section. Its actions sit at the right end of the same row,
        // which is where a section puts its own.
        const caption = document.createElement('p');
        caption.className = 'group-heading';
        const word = document.createElement('span');
        word.textContent = t(labelKey);
        groupActions = document.createElement('span');
        groupActions.className = 'section-actions';
        caption.append(word, groupActions);
        box.append(caption);
      }
      section.append(box);
      groupName = name;
      groupBox = box;
      builtGroups.set(`${sectionName}:${name}`, box);
    };
    // The repeating list currently open — 'motions' or 'stops' — with its
    // rows and the button that adds another, taken when the list itself comes
    // past and put in their places as the controls that belong to them arrive.
    let listName = null;
    let listRows = [];
    let listAdd = null;
    let entryIndex = null;
    let entryCard = null;
    // What one entry of the open list is CALLED in its legend — the list
    // field's own entryLabelKey when it carries one (the colour cycle's cards
    // say "Wechselfarbe", not the gradient's "Farbstopp"), the old ternary's
    // answer otherwise.
    let listEntryLabel = null;

    /** The add button goes into the nearest heading above what it adds to. */
    const closeList = () => {
      const where = actionsHost();
      if (listAdd && where) where.append(listAdd);
      listName = null;
      listAdd = null;
      listRows = [];
      entryIndex = null;
      entryCard = null;
      listEntryLabel = null;
    };

    /**
     * One control, in a card of its own — the shape of every card in the
     * reference: the name on the left, the value on the right, the control
     * across the width beneath, on a fill one step up from the column with an
     * 8px gap to the next.
     */
    const card = (element) => {
      const box = document.createElement('div');
      box.className = 'card';
      box.append(element);
      return box;
    };

    /** The first range input inside a built field, in real DOM and fake alike. */
    const rangeOf = (element) => {
      if (!element) return null;
      if (String(element.tagName ?? '').toLowerCase() === 'input' && element.type === 'range') {
        return element;
      }
      for (const kid of element.children ?? []) {
        const found = rangeOf(kid);
        if (found) return found;
      }
      return null;
    };

    // The hueShift slider of THIS build, remembered as it is built (hueShift
    // sits before hueCycle in DOCUMENT_FIELDS, so it exists by the time the
    // cycle's first change can arrive) — the hueCycle handler below re-parks
    // it. Per build rather than looked up by id, so a rebuild can never leave
    // this pointing at a control that is no longer in the document.
    let hueShiftSlider = null;
    // The unrounded shift the re-parking chain is really standing at. The
    // document and the slider carry the rounded display value; a drag rebases
    // once per input tick FROM THE PREVIOUS TICK'S RESULT, and a chain of
    // rounded steps was measured drifting by up to 177 degrees (see
    // rebasedHueShift in src/engine/motion/hue.js). Reset per build like the
    // slider itself; checked against the document before every use, because
    // an exact figure whose rounding the document no longer shows describes a
    // value somebody has since replaced.
    let hueShiftExact = null;

    for (const field of fields) {
      if (field.section !== sectionName) {
        closeList();
        closeGroup();
        sectionName = field.section;
        const opened = openSection(sectionName);
        section = opened.group;
        sectionActions = opened.actions;
        built.set(sectionName, section);
      }

      // A run of fields carrying the same `group` is boxed together. The list
      // machinery is closed on the way in and on the way out, so a repeating
      // list cannot straddle the edge of a box — a motion whose dropdown was
      // inside and whose sliders were outside would be one card cut in half.
      const group = field.group ?? null;
      if (group !== groupName) {
        closeList();
        closeGroup();
        if (group) openGroup(group, field.groupLabel);
      }

      const value = SF.getByPath(doc, field.path);
      const report = (path, next) => {
        // The one control whose change is answered by moving a SECOND control
        // first: a new cycle tempo re-prices the whole elapsed time at the
        // new speed, so with nothing else moving the colour JUMPS (Max,
        // 12.08.2026). Re-park hueShift at the angle the person is looking at
        // — rebasedHueShift in src/engine/motion/hue.js holds the arithmetic
        // and the reasoning — BEFORE the cycle is written, while the document
        // still says what the old tempo was. The slider is set and its own
        // 'input' event dispatched, so the write, the readout, the painted
        // fill and markChanged all travel the one path every change takes;
        // report() below then writes the cycle itself. Skipped when the
        // re-parked value is the one already showing (a cycle change at t=0
        // turns nothing), and entirely absent without a preview to ask.
        if (path === 'hueCycle' && previewTime && hueShiftSlider) {
          const live = getDocument();
          const base = hueShiftExact !== null
            && Math.round(hueShiftExact) % 360 === Number(live.hueShift)
            ? hueShiftExact
            : live.hueShift;
          const exact = SF.rebasedHueShift(base, live.hueCycle, next, previewTime());
          hueShiftExact = exact;
          // Rounded ONCE, for the step-1 slider and the document it writes —
          // the chain above keeps the exact figure.
          const shown = Math.round(exact) % 360;
          if (shown !== Number(hueShiftSlider.value)) {
            hueShiftSlider.value = String(shown);
            hueShiftSlider.dispatchEvent(new Event('input'));
          }
        }
        // The colour cycle's tempo, held to the same promise: the anchor is
        // re-parked at the angle on screen before the tempo is written — the
        // very fault the hueCycle branch above exists for, caught arriving
        // again one feature later. Cheaper here than there: cyclePhase has no
        // slider to keep honest, so the EXACT figure goes straight into the
        // document (no display rounding, hence no side-car chain — see
        // rebasedCyclePhase in src/engine/motion/color-cycle.js).
        if (path.endsWith('.cycleSpeed') && previewTime) {
          const layerPath = path.slice(0, -'.cycleSpeed'.length);
          const live = SF.getByPath(getDocument(), layerPath);
          if (live) {
            onChange(`${layerPath}.cyclePhase`,
              SF.rebasedCyclePhase(live.cyclePhase, live.cycleSpeed, next, previewTime()));
          }
        }
        const result = onChange(path, next);
        // A slider must never pull the ground out from under the drag it is in
        // the middle of, and neither must a colour picker: the native one
        // reports every colour the pointer passes over while it is open, and
        // rebuilding the column under it would take the input the OS dialog is
        // attached to out of the document. Neither changes which fields exist,
        // so neither needs a redraw. Everything else may.
        if (field.type === 'number' || field.type === 'color') return;
        Promise.resolve(result).then(render, (err) => {
          console.error('inspector change failed:', err);
          // Deliberately no redraw: the change did not take, so the column
          // is already showing what the document actually holds (see
          // setDocument in components/preview.js, which commits the new
          // document and its assets together or neither).
          onError?.(err);
        });
      };

      if (field.type === 'motions' || field.type === 'stops') {
        const list = field.type === 'motions'
          ? createMotions(field, { t, value, onChange: report })
          : createStops(field, { t, value, onChange: report });
        closeList();
        listName = field.type;
        listRows = list.rows;
        listAdd = list.add;
        listEntryLabel = field.entryLabelKey ?? null;
        continue;
      }

      const element = createField(widenToInclude(field, value), {
        t,
        value,
        onChange: report,
        recents,
        coverPicker,
        // The stack cards' selection gesture: no document write, only which
        // layer this column is about. `rerender` is false for exactly one
        // caller — the add button, whose following array write rebuilds the
        // column itself once the document really carries the new layer.
        // Either way whoever outside cares about the selection (the crop's
        // tab stop does) hears about it.
        onSelectLayer: (id, rerender = true) => {
          selectedId = id;
          if (rerender) render();
          onSelectionChange?.();
        },
        // The layers as they are AT THE MOMENT a card's button fires — see
        // layersField for the measured stale-closure window this closes.
        liveLayers: () => getDocument().layers,
        // Only a slider has a reset, and it is asked at the moment it is
        // pressed rather than now: the answer costs a normalization of the
        // document, and this loop runs for every control in the column. The
        // document is fetched then as well, not captured here, so the answer
        // is about the document as it stands when somebody reaches for it.
        defaultValue: defaultAt && field.type === 'number'
          ? () => defaultAt(field.path)
          : null
      });
      if (!element) continue;
      if (field.path === 'hueShift') hueShiftSlider = rangeOf(element);

      // An entry of a repeating list is one card: for a motion, the dropdown
      // that says what kind it is and the two sliders that steer it; for a
      // colour stop, the colour and where along the ramp it sits. The card is
      // a fieldset with the entry's number as its legend, so the repeated
      // "Tempo"/"Farbe" labels are told apart by something a screen reader
      // announces and not only by where they sit on screen.
      const entry = listName ? entryIndexOf(field.path, listName) : null;
      if (entry === null) {
        host().append(card(element));
        continue;
      }
      if (entry !== entryIndex) {
        entryIndex = entry;
        entryCard = document.createElement('fieldset');
        entryCard.className = listName === 'stops' ? 'motion stop' : 'motion';
        const legend = document.createElement('legend');
        const word = listEntryLabel
          ?? (listName === 'stops' ? 'inspector.stop' : 'inspector.motion');
        legend.textContent = `${t(word)} ${entry + 1}`;
        entryCard.append(legend);
        if (listRows[entry]) entryCard.append(listRows[entry]);
        host().append(entryCard);
      }
      entryCard.append(element);
    }

    closeList();
    restoreFocus(focused);

    // The sections the document has just grown, and only those: a column that
    // is one control longer than it was says so by that control arriving,
    // which is the difference between a window that answered and a window that
    // was simply different the next time it was looked at.
    if (previousSections) {
      for (const [name, group] of built) {
        if (!previousSections.has(name)) enter(group);
      }
    }
    previousSections = new Set(built.keys());

    // And the boxes inside them. A background being chosen does not grow the
    // column a section — the heading and the combobox that did the choosing
    // were both already there — it fills one, and this is what says so. The
    // heading and the combobox stay perfectly still while the cards under them
    // arrive as one thing, which is the difference between an answer and a
    // jump.
    //
    // Nothing is played on the way OUT. The column is rebuilt in one go, so a
    // group that has gone is simply not built; an exit would mean holding a box
    // on screen that the document no longer has anything in, which is a picture
    // of a background that is not there.
    if (previousGroups) {
      for (const [key, box] of builtGroups) {
        if (!previousGroups.has(key)) enter(box);
      }
    }
    previousGroups = new Set(builtGroups.keys());
  }

  render();
  return {
    refresh: render,
    /**
     * Which stack card the column is about right now — what main.js's crop
     * asks so its drag can serve the layer the person is actually editing,
     * not blindly the top of the stack (review found a picture moved under a
     * figure whose crop went dead: the fit dropdown followed the selection,
     * the drag did not).
     */
    selectedLayerId: () => selectedId
  };
}
