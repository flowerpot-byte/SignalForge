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
import { FIT_MODES, MOTION_KINDS } from '../../../src/engine/document.js';
import { CONTROL_RANGES } from '../../../src/export/effect-controls.js';
import { createField, createMotions } from './field.js';
import { icon } from './icons.js';

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
 * clamps the same field to (brightness 5..100 against a clamp of 0..100); see
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
  blueYellow: withStep(CONTROL_RANGES.blueYellow)
});

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
  image: 'inspector.section.image',
  motions: 'inspector.motions',
  colour: 'inspector.section.colour'
});

/** The glyph that leads each section's heading, and the left column's entry. */
const SECTION_GLYPHS = Object.freeze({
  image: 'image',
  motions: 'motion',
  colour: 'colour'
});

/** "layers.0.motions.1.speed" -> 1, or null for anything that is not a motion field. */
function motionIndexOf(path) {
  const match = /^layers\.\d+\.motions\.(\d+)\./.exec(path);
  return match ? Number(match[1]) : null;
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

  if (layer && layer.type === 'image') {
    const at = `layers.${index}`;
    fields.push({
      path: `${at}.fit`, type: 'select', section: 'image',
      labelKey: 'inspector.fit', values: [...FIT_MODES]
    });
    fields.push({
      path: at, type: 'motions', section: 'motions',
      labelKey: 'inspector.motions', values: [...MOTION_KINDS]
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
 * clamps the same field to (brightness 5..100 against a clamp of 0..100,
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
export function mountInspector(container, { getDocument, onChange, t, onError, visibleSection }) {
  const SF = window.SignalForgeEngine;

  /**
   * Which of the three sections the left column is pointing at.
   *
   * All three are on screen at once, and the one this names is merely MARKED —
   * its heading takes the accent — rather than being the only one drawn.
   *
   * That is the second answer to this question, and the first one is worth
   * recording because it looked better on paper. The column started out
   * showing exactly one section at a time, which is what a left column full of
   * destinations promises. Photographed, it was indefensible: "Bild" is one
   * control, so choosing it produced a 300px column holding a single card with
   * six hundred pixels of nothing under it — precisely the blank space this
   * whole pass exists to kill (the screenshot is kept at
   * work/redesign-shots/signalrgb/00-rejected-one-group-at-a-time.png). Three
   * sections together fill the column; one at a time cannot, because this app
   * does not have enough controls for four screens.
   *
   * So the left column scrolls to a group and says which one you are in, and
   * the column stays whole. Every control also stays in the document, which
   * the self-test, the acceptance walkthrough and the unsaved-work harness all
   * depend on — each of them reads the fit, the motions and the colour sliders
   * in one breath.
   */
  const showing = () => (visibleSection ? visibleSection() : null);

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
   * The heading is the column's header row: the section's own glyph and name
   * on the left, its actions on the right — which is where the reference puts
   * a section's icon buttons, and where the "add a motion" button now lives.
   * Because exactly one section is on screen at a time, that heading reads as
   * the header of the whole column rather than as one of three stacked rules.
   */
  function openSection(name) {
    const group = document.createElement('section');
    group.className = 'field-group';
    group.dataset.section = name;
    group.classList.toggle('is-active', showing() === name);

    const heading = document.createElement('h3');
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

    // With no picture the column holds nothing but the four colour sliders,
    // and stops. That read as truncated rather than as short: two thirds of
    // the settings were missing with no sign that they exist or that anything
    // brings them back. One sentence, in the place the missing sections will
    // take, naming them — not two greyed-out stand-in sections, which would be
    // a picture of an interface rather than the interface.
    if (!fields.some((field) => field.section === 'image')) {
      const note = document.createElement('p');
      note.className = 'section-note';
      note.textContent = t('inspector.awaitingImage');
      container.append(note);
    }

    let sectionName = null;
    let section = null;
    let sectionActions = null;
    // The motion rows, and the button that adds another, taken from
    // createMotions when the motion list itself comes past and put in their
    // places as the sliders that belong to them arrive.
    let motionRows = [];
    let addMotion = null;
    let motionIndex = null;
    let motionCard = null;

    /** The add button goes into the heading of the section it adds to. */
    const closeMotions = () => {
      if (addMotion && sectionActions) sectionActions.append(addMotion);
      addMotion = null;
      motionRows = [];
      motionIndex = null;
      motionCard = null;
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
        closeMotions();
        sectionName = field.section;
        const opened = openSection(sectionName);
        section = opened.group;
        sectionActions = opened.actions;
      }

      const value = SF.getByPath(doc, field.path);
      const report = (path, next) => {
        const result = onChange(path, next);
        // A slider must never pull the ground out from under the drag it
        // is in the middle of; everything else may.
        if (field.type === 'number') return;
        Promise.resolve(result).then(render, (err) => {
          console.error('inspector change failed:', err);
          // Deliberately no redraw: the change did not take, so the column
          // is already showing what the document actually holds (see
          // setDocument in components/preview.js, which commits the new
          // document and its assets together or neither).
          onError?.(err);
        });
      };

      if (field.type === 'motions') {
        const motions = createMotions(field, { t, value, onChange: report });
        motionRows = motions.rows;
        addMotion = motions.add;
        continue;
      }

      const element = createField(widenToInclude(field, value), { t, value, onChange: report });
      if (!element) continue;

      // A motion is one card: the dropdown that says what kind it is, and the
      // two sliders that steer it. The card is a fieldset with the motion's
      // name as its legend, so the repeated "Tempo"/"Staerke" labels are told
      // apart by something a screen reader announces and not only by where
      // they sit on screen.
      const motion = motionIndexOf(field.path);
      if (motion === null) {
        section.append(card(element));
        continue;
      }
      if (motion !== motionIndex) {
        motionIndex = motion;
        motionCard = document.createElement('fieldset');
        motionCard.className = 'motion';
        const legend = document.createElement('legend');
        legend.textContent = `${t('inspector.motion')} ${motion + 1}`;
        motionCard.append(legend);
        if (motionRows[motion]) motionCard.append(motionRows[motion]);
        section.append(motionCard);
      }
      motionCard.append(element);
    }

    closeMotions();
    restoreFocus(focused);
  }

  render();
  return { refresh: render };
}
