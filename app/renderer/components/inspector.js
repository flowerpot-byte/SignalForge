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
  FIT_MODES, GRADIENT_SHAPES, MIN_GRADIENT_STOPS, MAX_GRADIENT_STOPS, motionKindsFor
} from '../../../src/engine/document.js';
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
  // The one range in this table the exported effect does not also offer, and
  // src/export/effect-controls.js says why at length: a stop position needs a
  // gradient to be seen against, and SignalRGB's panel has none.
  stop: withStep(CONTROL_RANGES.stop)
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

/** The fields that belong to the document itself, in the order they appear. */
const DOCUMENT_FIELDS = Object.freeze(['saturation', 'greenMagenta', 'blueYellow', 'brightness']);

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
  fill: 'inspector.section.fill',
  image: 'inspector.section.image',
  motions: 'inspector.motions',
  colour: 'inspector.section.colour'
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
  fill: 'solid',
  image: 'image',
  motions: 'motion',
  colour: 'colour'
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
  const offered = motionKindsFor(layer.type);
  const extra = layer.motions
    .map((motion) => motion.kind)
    .filter((kind, index, all) => !offered.includes(kind) && all.indexOf(kind) === index);
  return extra.length === 0 ? offered : [...offered, ...extra];
}

/**
 * What the settings column should show, as plain data.
 *
 * Deliberately free of any DOM: which fields exist is arithmetic over the
 * document and is tested in plain node (test/app/inspector.test.js); how
 * they look is field.js's job.
 *
 * Each field is `{ path, type, labelKey, min, max, step, values }`, where
 * `path` is a dot path into the document so a change runs through the very
 * same setByPath mechanism the exported effect's controls use. `type` is
 * 'number' (a slider), 'select' (a dropdown) or 'motions' (the list with
 * its add and remove buttons).
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
 */
export function describeInspector(doc, layerId) {
  const fields = [];
  const index = doc.layers.findIndex((layer) => layer.id === layerId);
  const layer = index < 0 ? null : doc.layers[index];
  const at = `layers.${index}`;

  // What the layer is made of, for the two types that are made of colour.
  if (layer && layer.type === 'solid') {
    fields.push({
      path: `${at}.color`, type: 'color', section: 'fill', labelKey: 'inspector.colour'
    });
  }

  if (layer && layer.type === 'gradient') {
    fields.push({
      path: `${at}.shape`, type: 'select', section: 'fill',
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
        path: `${at}.angle`, type: 'number', section: 'fill',
        labelKey: 'inspector.angle', ...RANGES.angle
      });
    }
    // The band count: only the three shapes that repeat have anything to
    // repeat. "linear" and "radial" ARE one traversal of the ramp by
    // definition (see MIN_BANDS in src/engine/document.js).
    if (REPEATING_SHAPES.includes(layer.shape)) {
      fields.push({
        path: `${at}.bands`, type: 'number', section: 'fill',
        labelKey: 'inspector.bands', ...RANGES.bands
      });
    }
    // The list itself carries no label of its own: unlike the motion list it
    // has no per-entry dropdown to name, and the heading it lives under
    // already says what these are. What it does carry is the two limits, so
    // the add and remove buttons can say "no more" by being disabled rather
    // than by a change that normalizeDocument then quietly undoes.
    fields.push({
      path: at, type: 'stops', section: 'fill',
      min: MIN_GRADIENT_STOPS, max: MAX_GRADIENT_STOPS
    });
    layer.stops.forEach((_, i) => {
      fields.push({
        path: `${at}.stops.${i}.color`, type: 'color', section: 'fill',
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
          path: `${at}.stops.${i}.at`, type: 'number', section: 'fill',
          labelKey: 'inspector.stopAt', ...RANGES.stop
        });
      }
    });
  }

  if (layer && layer.type === 'image') {
    fields.push({
      path: `${at}.fit`, type: 'select', section: 'image',
      labelKey: 'inspector.fit', values: [...FIT_MODES]
    });
  }

  // Motions belong to the layer, not to the picture: every type that carries a
  // motions list gets the list, the add button and a card per entry. Which
  // kinds are on offer is the engine's answer and not this file's — a solid
  // colour cannot be seen to drift or warp, so it is offered neither.
  if (layer && Array.isArray(layer.motions)) {
    fields.push({
      path: at, type: 'motions', section: 'motions',
      labelKey: 'inspector.motions', values: [...motionKindsWide(layer)]
    });
    layer.motions.forEach((_, i) => {
      fields.push({
        path: `${at}.motions.${i}.speed`, type: 'number', section: 'motions',
        labelKey: 'inspector.speed', ...RANGES.speed
      });
      fields.push({
        path: `${at}.motions.${i}.amount`, type: 'number', section: 'motions',
        labelKey: 'inspector.amount', ...RANGES.amount
      });
    });
  }

  for (const name of DOCUMENT_FIELDS) {
    fields.push({
      path: name, type: 'number', section: 'colour',
      labelKey: `inspector.${name}`, ...RANGES[name]
    });
  }
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
 * There is no layer list yet (that is a later task), so the layer shown is
 * the document's first one.
 */
export function mountInspector(container, { getDocument, onChange, t, onError }) {
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

  function rememberFocus() {
    const active = document.activeElement;
    return active && container.contains(active) && active.id ? active.id : null;
  }

  function restoreFocus(id) {
    if (!id) return;
    const again = document.getElementById(id);
    if (again && container.contains(again)) { again.focus(); return; }
    // The control is gone — the only way that happens is a removed motion.
    // Land on the add button of the same list rather than dumping the
    // keyboard user back at the top of the window.
    const remove = /^(.*)-remove-\d+$/.exec(id);
    if (remove) document.getElementById(`${remove[1]}-add`)?.focus();
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
    const layerId = doc.layers.length > 0 ? doc.layers[0].id : null;

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
    // The repeating list currently open — 'motions' or 'stops' — with its
    // rows and the button that adds another, taken when the list itself comes
    // past and put in their places as the controls that belong to them arrive.
    let listName = null;
    let listRows = [];
    let listAdd = null;
    let entryIndex = null;
    let entryCard = null;

    /** The add button goes into the heading of the section it adds to. */
    const closeList = () => {
      if (listAdd && sectionActions) sectionActions.append(listAdd);
      listName = null;
      listAdd = null;
      listRows = [];
      entryIndex = null;
      entryCard = null;
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

    for (const field of fields) {
      if (field.section !== sectionName) {
        closeList();
        sectionName = field.section;
        const opened = openSection(sectionName);
        section = opened.group;
        sectionActions = opened.actions;
        built.set(sectionName, section);
      }

      const value = SF.getByPath(doc, field.path);
      const report = (path, next) => {
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
        continue;
      }

      const element = createField(widenToInclude(field, value), { t, value, onChange: report });
      if (!element) continue;

      // An entry of a repeating list is one card: for a motion, the dropdown
      // that says what kind it is and the two sliders that steer it; for a
      // colour stop, the colour and where along the ramp it sits. The card is
      // a fieldset with the entry's number as its legend, so the repeated
      // "Tempo"/"Farbe" labels are told apart by something a screen reader
      // announces and not only by where they sit on screen.
      const entry = listName ? entryIndexOf(field.path, listName) : null;
      if (entry === null) {
        section.append(card(element));
        continue;
      }
      if (entry !== entryIndex) {
        entryIndex = entry;
        entryCard = document.createElement('fieldset');
        entryCard.className = listName === 'stops' ? 'motion stop' : 'motion';
        const legend = document.createElement('legend');
        const word = listName === 'stops' ? 'inspector.stop' : 'inspector.motion';
        legend.textContent = `${t(word)} ${entry + 1}`;
        entryCard.append(legend);
        if (listRows[entry]) entryCard.append(listRows[entry]);
        section.append(entryCard);
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
  }

  render();
  return { refresh: render };
}
