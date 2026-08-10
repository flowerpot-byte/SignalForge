// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import { MOTION_KINDS, FIT_MODES, normalizeDocument } from '../engine/document.js';

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
 * Ranges the exported controls offer.
 *
 * Every one of these must stay inside what normalizeDocument (src/engine/
 * document.js) clamps the same field to, otherwise the control would offer
 * values the engine silently throws away:
 *
 *   tempo        <- motions[].speed  clamp 0..100   offered 1..100 (0 is "stopped", not a speed)
 *   strength     <- motions[].amount clamp 0..100   offered 0..100
 *   brightness   <- brightness       clamp 0..100   offered 5..100 (never fully black by accident)
 *   saturation   <- saturation       clamp 0..200   offered 0..200
 *   greenMagenta <- greenMagenta     clamp -100..100 offered -100..100
 *   blueYellow   <- blueYellow       clamp -100..100 offered -100..100
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
const RANGES = Object.freeze({
  tempo: { min: 1, max: 100 },
  strength: { min: 0, max: 100 },
  brightness: { min: 5, max: 100 },
  saturation: { min: 0, max: 200 },
  greenMagenta: { min: -100, max: 100 },
  blueYellow: { min: -100, max: 100 }
});

/**
 * A slider, with its range stretched if the document carries a value the
 * usual range cannot reach.
 *
 * The ranges above are on purpose narrower than what normalizeDocument
 * clamps the same field to (brightness 5..100 against a clamp of 0..100). A
 * document is under no such obligation: a project file edited by hand can
 * legitimately carry brightness 3. Shipping a control whose default sits
 * outside its own min/max would leave SignalRGB to decide what that means, so
 * the range gives way and never the value — the same rule, and the same
 * reasoning, as widenToInclude in app/renderer/components/inspector.js.
 */
function slider(property, de, en, value, bind) {
  const { min, max } = RANGES[property];
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

  if (layer && layer.type === 'image') {
    const motion = layer.motions[0];
    if (motion) {
      controls.push(
        dropdown('motion', 'Modus', 'Motion', MOTION_KINDS, motion.kind, `${layerId}.motions.0.kind`),
        slider('tempo', 'Tempo', 'Speed', motion.speed, `${layerId}.motions.0.speed`),
        slider('strength', 'Staerke', 'Strength', motion.amount, `${layerId}.motions.0.amount`)
      );
    }
    controls.push(dropdown('fit', 'Bildausschnitt', 'Fit', FIT_MODES, layer.fit, `${layerId}.fit`));
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
 * Give an image layer a motion entry to bind to, if it has none.
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
  if (!layer || layer.type !== 'image' || layer.motions.length > 0) return doc;
  return normalizeDocument({
    ...doc,
    layers: doc.layers.map((entry) => (entry === layer ? { ...entry, motions: [{ kind: 'none' }] } : entry))
  }).doc;
}
