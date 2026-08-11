// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import {
  MOTION_KINDS, FIT_MODES, GRADIENT_SHAPES, motionKindsFor, normalizeDocument
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
 *   stop         <- stops[].at       clamp 0..100   offered 0..100
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
export const CONTROL_RANGES = Object.freeze({
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
  stop: Object.freeze({ min: 0, max: 100 })
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
 */
export function effectControls(doc, layerId) {
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
   */
  const motionControls = () => {
    const motion = layer.motions?.[0];
    if (!motion) return;
    // The same rule the sliders follow (see slider() above): the offer gives
    // way, never the document's own value. A hand-edited project can carry a
    // warp on a solid layer, and a dropdown whose default is not one of its
    // own options leaves SignalRGB to decide what that means.
    const offered = motionKindsFor(layer.type);
    const kinds = offered.includes(motion.kind) ? offered : [...offered, motion.kind];
    controls.push(
      dropdown('motion', 'Modus', 'Motion', kinds, motion.kind, `${layerId}.motions.0.kind`),
      slider('tempo', 'Tempo', 'Speed', motion.speed, `${layerId}.motions.0.speed`),
      slider('strength', 'Staerke', 'Strength', motion.amount, `${layerId}.motions.0.amount`)
    );
  };

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
      slider('angle', 'Winkel', 'Angle', layer.angle, `${layerId}.angle`)
    );
    motionControls();
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
