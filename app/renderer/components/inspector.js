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
import { createField } from './field.js';

/**
 * Ranges for the sliders.
 *
 * Every number here must stay inside what normalizeDocument (src/engine/
 * document.js) clamps the same field to, otherwise the slider would offer
 * values the engine silently throws away. Where the exported effect's own
 * control list (bin/sfexport.js) already picked a narrower range for the
 * same field, that narrower range is used, so the app and the finished
 * effect present the same choices:
 *
 *   speed        clamp 0..100   exported "tempo"      1..100  -> 1..100
 *   amount       clamp 0..100   exported "strength"   0..100  -> 0..100
 *   brightness   clamp 0..100   exported "brightness" 5..100  -> 5..100
 *   saturation   clamp 0..200   no exported control           -> 0..200
 *   greenMagenta clamp -100..100                              -> -100..100
 *   blueYellow   clamp -100..100                              -> -100..100
 *
 * Step is 1 throughout: all six are whole-number percentages, and a step of
 * 1 is also what one arrow-key press moves, which is the resolution someone
 * working from the keyboard actually wants.
 */
const RANGES = Object.freeze({
  speed: { min: 1, max: 100, step: 1 },
  amount: { min: 0, max: 100, step: 1 },
  brightness: { min: 5, max: 100, step: 1 },
  saturation: { min: 0, max: 200, step: 1 },
  greenMagenta: { min: -100, max: 100, step: 1 },
  blueYellow: { min: -100, max: 100, step: 1 }
});

/** The fields that belong to the document itself, in the order they appear. */
const DOCUMENT_FIELDS = Object.freeze(['saturation', 'greenMagenta', 'blueYellow', 'brightness']);

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
    fields.push({ path: `${at}.fit`, type: 'select', labelKey: 'inspector.fit', values: [...FIT_MODES] });
    fields.push({ path: at, type: 'motions', labelKey: 'inspector.motions', values: [...MOTION_KINDS] });
    layer.motions.forEach((_, i) => {
      fields.push({ path: `${at}.motions.${i}.speed`, type: 'number', labelKey: 'inspector.speed', ...RANGES.speed });
      fields.push({ path: `${at}.motions.${i}.amount`, type: 'number', labelKey: 'inspector.amount', ...RANGES.amount });
    });
  }

  for (const name of DOCUMENT_FIELDS) {
    fields.push({ path: name, type: 'number', labelKey: `inspector.${name}`, ...RANGES[name] });
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
export function mountInspector(container, { getDocument, onChange, t }) {
  const SF = window.SignalForgeEngine;

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

  function render() {
    const focused = rememberFocus();
    const doc = getDocument();
    const layerId = doc.layers.length > 0 ? doc.layers[0].id : null;

    container.replaceChildren();
    let groupIndex = null;
    let group = null;

    for (const field of describeInspector(doc, layerId)) {
      const value = SF.getByPath(doc, field.path);
      const element = createField(widenToInclude(field, value), {
        t,
        value,
        onChange: (path, value) => {
          const result = onChange(path, value);
          // A slider must never pull the ground out from under the drag it
          // is in the middle of; everything else may.
          if (field.type === 'number') return;
          Promise.resolve(result).then(render, (err) => console.error('inspector change failed:', err));
        }
      });
      if (!element) continue;

      // Every motion's sliders are wrapped in their own fieldset so the
      // repeated "Speed"/"Strength" labels are told apart by something a
      // screen reader announces, not just by where they sit on screen.
      const motion = motionIndexOf(field.path);
      if (motion === null) {
        groupIndex = null;
        group = null;
        container.append(element);
        continue;
      }
      if (motion !== groupIndex) {
        groupIndex = motion;
        group = document.createElement('fieldset');
        group.className = 'motion-group';
        const legend = document.createElement('legend');
        legend.textContent = `${t('inspector.motion')} ${motion + 1}`;
        group.append(legend);
        container.append(group);
      }
      group.append(element);
    }

    restoreFocus(focused);
  }

  render();
  return { refresh: render };
}
