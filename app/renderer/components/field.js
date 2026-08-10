// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import { icon } from './icons.js';
// Frozen metadata and pure document arithmetic only, the same import
// inspector.js already makes and for the same reason (see its own comment):
// this is not the render path, which still reaches the window solely through
// window.SignalForgeEngine. colorAtPosition is arithmetic on the document's
// own stop colours -- it never invents one of its own -- so reading it from
// here keeps every colour this file can ever write traceable back to the
// document (test/app/color-literals.test.js).
import { colorAtPosition } from '../../../src/engine/document.js';

/**
 * A control's id, derived from the field's path so it is the same before and
 * after a redraw — that is what lets the settings column give the keyboard
 * focus back to the control the user was on (see mountInspector).
 */
export function fieldId(path) {
  return `sf-${path.replace(/[^A-Za-z0-9]+/g, '-')}`;
}

/** A dropdown option's text lives under the field's own key: "inspector.fit" -> "inspector.fit.cover". */
const optionKey = (field, value) => `${field.labelKey}.${value}`;

function labelFor(id, text) {
  const label = document.createElement('label');
  label.htmlFor = id;
  label.textContent = text;
  return label;
}

function row(className) {
  const element = document.createElement('div');
  element.className = className;
  return element;
}

function button(id, text, ariaLabel) {
  const element = document.createElement('button');
  element.type = 'button';
  element.id = id;
  element.textContent = text;
  if (ariaLabel) element.setAttribute('aria-label', ariaLabel);
  return element;
}

/**
 * A small button that is nothing but a glyph — the shape SignalRGB puts in a
 * section's heading. It has no visible text, so the accessible name is not
 * optional: it is passed to icon() itself, which turns the glyph into a
 * `role="img"` with that name instead of hiding it, and is repeated as the
 * button's own aria-label so the button is announced whether or not a screen
 * reader descends into it.
 */
function iconButton(id, glyph, name) {
  const element = document.createElement('button');
  element.type = 'button';
  element.id = id;
  element.className = 'icon-button';
  element.setAttribute('aria-label', name);
  element.title = name;
  element.append(icon(glyph, name));
  return element;
}

/**
 * How far along its range a slider is standing, as a percentage.
 *
 * The stylesheet paints the track from this (see --sf-fill in styles/app.css)
 * so the filled part is visible without reading the number. It is computed
 * here rather than left to the browser's own accent-color because a range
 * with `appearance: none` — which is what gives the track its size and its
 * colours — is no longer painted by the browser at all.
 *
 * A zero-width range (min === max, which widenToInclude can never produce but
 * a future field could) would divide by zero; it reads as full instead.
 */
export function fillPercent({ min, max }, value) {
  const span = Number(max) - Number(min);
  if (!(span > 0)) return 100;
  const along = ((Number(value) - Number(min)) / span) * 100;
  return Math.max(0, Math.min(100, along));
}

/**
 * A slider with the number beside it.
 *
 * `input` fires while the slider is being dragged AND on every arrow-key
 * press, so both ways of working report a change the same way.
 */
function numberField(field, { t, value, onChange }) {
  // One control, in the shape every control in the reference has: its name on
  // the left, its current value on the right, the track across the full width
  // underneath. Whether that control gets a card of its own or shares one with
  // the rest of a motion is mountInspector's decision, not this one's.
  const wrapper = row('control');
  const id = fieldId(field.path);

  const input = document.createElement('input');
  input.type = 'range';
  input.id = id;
  input.min = String(field.min);
  input.max = String(field.max);
  input.step = String(field.step);
  input.value = String(value);

  const readout = document.createElement('output');
  readout.setAttribute('for', id);
  readout.textContent = String(value);

  const paint = (at) => input.style.setProperty('--sf-fill', `${fillPercent(field, at)}%`);
  paint(value);

  input.addEventListener('input', () => {
    readout.textContent = input.value;
    paint(input.value);
    onChange(field.path, Number(input.value));
  });

  wrapper.append(labelFor(id, t(field.labelKey)), readout, input);
  return wrapper;
}

/**
 * A colour, picked with the operating system's own colour picker.
 *
 * `<input type="color">` and deliberately nothing hand-built. A colour picker
 * is a project of its own — a wheel or a square, a hue strip, a hex field,
 * keyboard access to all of it — and this app has one job that is not that.
 * The native control is the affordance everybody already knows, it is
 * reachable from the keyboard for free, and it is what the "prefer the
 * system's own control" rule this window is built on actually means.
 *
 * What can and cannot be styled about it is worth recording, because it is not
 * obvious: the BOX is ours (its size, its corners, the sunken card colour
 * around it — see styles/app.css), the swatch inside it is the value, and the
 * picker that opens on click is the operating system's and cannot be styled at
 * all. That last part is the trade, and it is accepted.
 *
 * `input` fires while the picker is open, so the preview follows the colour as
 * it is being chosen rather than only when the dialog is dismissed.
 */
function colorField(field, { t, value, onChange }) {
  const wrapper = row('control control-row');
  const id = fieldId(field.path);

  const input = document.createElement('input');
  input.type = 'color';
  input.id = id;
  input.value = String(value ?? '');
  input.addEventListener('input', () => onChange(field.path, input.value));

  wrapper.append(labelFor(id, t(field.labelKey)), input);
  return wrapper;
}

function selectField(field, { t, value, onChange }) {
  // A dropdown shows its own value, so this one is a single row: name left,
  // control right — the shape the reference's "Color Mode" card has.
  const wrapper = row('control control-row');
  const id = fieldId(field.path);

  const select = document.createElement('select');
  select.id = id;
  for (const option of field.values) {
    const node = document.createElement('option');
    node.value = option;
    node.textContent = t(optionKey(field, option));
    select.append(node);
  }
  select.value = String(value);
  select.addEventListener('change', () => onChange(field.path, select.value));

  wrapper.append(labelFor(id, t(field.labelKey)), select);
  return wrapper;
}

/**
 * The motion list, as pieces rather than as a finished block: one row per
 * motion, and the button that adds another.
 *
 * Handed back separately on purpose. A motion's kind and that motion's two
 * sliders belong in one place, and the sliders are separate fields that
 * mountInspector receives one at a time — so mountInspector is the only thing
 * that can put a motion together, and it can only do that if it is given the
 * rows loose. What this used to return instead was a fieldset of its own
 * holding every row, which left the column saying "Bewegungen" over a list of
 * dropdowns and then "Bewegung 1", "Bewegung 2" over a stack of sliders
 * further down: the same structure stated twice, with each motion's name a
 * long way from its own controls.
 *
 * `value` is the layer the motions belong to (the field's path addresses the
 * layer, see describeInspector), so the paths reported back get ".motions"
 * appended here.
 *
 * A kind already taken by another row is left out of that row's dropdown,
 * and the add button offers the first kind nobody is using. Two motions of
 * the same kind are not an error the engine crashes on — it renders the
 * first and ignores the rest (see layers/image.js) — but a slider that
 * quietly does nothing is worse than an option that was never offered.
 * "none" can be chosen for a row but is never what the add button adds:
 * adding a motion that does not move would be a strange thing to hand
 * somebody who just asked for one.
 *
 * A new entry is added as `{ kind }` alone. The speed and amount it starts
 * with are normalizeDocument's business, not a second copy of those numbers
 * kept here.
 */
export function createMotions(field, { t, value, onChange }) {
  const motions = value && Array.isArray(value.motions) ? value.motions : [];
  const base = fieldId(field.path);
  const listPath = `${field.path}.motions`;

  const used = new Set(motions.map((motion) => motion.kind));

  const rows = motions.map((motion, index) => {
    const line = row('motion-row');
    const id = `${base}-kind-${index}`;

    const select = document.createElement('select');
    select.id = id;
    // Named for a screen reader, not on screen: the fieldset this row is put
    // into already prints "Bewegung 1" as its legend a few pixels above (see
    // mountInspector), and a visible label here would print the very same
    // words a second time. An aria-label keeps the dropdown announced as the
    // motion it belongs to without saying it twice to the eye.
    select.setAttribute('aria-label', `${t('inspector.motion')} ${index + 1}`);
    for (const kind of field.values) {
      if (kind !== motion.kind && used.has(kind)) continue;
      const node = document.createElement('option');
      node.value = kind;
      node.textContent = t(optionKey(field, kind));
      select.append(node);
    }
    select.value = motion.kind;
    select.addEventListener('change', () => onChange(`${listPath}.${index}.kind`, select.value));

    // Icon-only, because it sits at the end of a row that already says which
    // motion it is: the aria-label carries the number, so it is announced as
    // "Remove 2" rather than as one of two identical "Remove" buttons.
    const remove = iconButton(
      `${base}-remove-${index}`,
      'minus',
      `${t('inspector.removeMotion')} ${index + 1}`
    );
    remove.addEventListener('click', () => {
      onChange(listPath, motions.filter((_, other) => other !== index));
    });

    line.append(select, remove);
    return line;
  });

  const addable = field.values.filter((kind) => kind !== 'none' && !used.has(kind));
  // The add button lives in the section's own heading (see mountInspector), in
  // the place the reference puts a section's actions, so it is a glyph with a
  // name rather than a full-width bar under the list.
  const add = iconButton(`${base}-add`, 'plus', t('inspector.addMotion'));
  add.disabled = addable.length === 0;
  add.addEventListener('click', () => onChange(listPath, [...motions, { kind: addable[0] }]));

  return { rows, add };
}

/**
 * Turn one field description into something you can actually operate.
 *
 * `onChange(path, value)` reports the dot path that changed and its new
 * value; the field never writes into the document itself. A 'motions' field
 * is not one element and is built by createMotions above; an unknown type
 * yields null rather than throwing, so a field description from a newer
 * version of the document simply does not appear.
 */
export function createField(field, options) {
  if (field.type === 'number') return numberField(field, options);
  if (field.type === 'select') return selectField(field, options);
  if (field.type === 'color') return colorField(field, options);
  return null;
}

/**
 * Where a newly added colour stop should sit: the middle of the widest gap.
 *
 * Not simply "at the end" and not "at 50": a stop dropped on top of one that
 * is already there is invisible, and the first thing the user would have to do
 * is drag it off its neighbour to find out that it exists. The widest gap is
 * the one place on the ramp where a new colour has the most room to be seen.
 *
 * `positions` is the stops' `at` values, in document order (they need not be
 * sorted). A list of fewer than two is not a gradient; 50 is the honest answer
 * there, and it is the only case where the result is not a real midpoint.
 */
export function nextStopPosition(positions) {
  const sorted = [...positions].map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (sorted.length < 2) return 50;
  let bestGap = -1;
  let best = 50;
  for (let index = 1; index < sorted.length; index += 1) {
    const gap = sorted[index] - sorted[index - 1];
    if (gap > bestGap) {
      bestGap = gap;
      best = (sorted[index] + sorted[index - 1]) / 2;
    }
  }
  return Math.round(best);
}

/**
 * The colour stops, as pieces — the same shape as createMotions above and for
 * the same reason: a stop's colour and its position are separate fields that
 * mountInspector receives one at a time, so only mountInspector can put a stop
 * together, and it can only do that if it is handed the remove buttons loose.
 *
 * `value` is the layer the stops belong to (the field's path addresses the
 * layer, see describeInspector), so the paths reported back get ".stops"
 * appended here — exactly as the motion list does.
 *
 * Both buttons can be unavailable, and both say so by being disabled rather
 * than by disappearing: a gradient below `min` is not a gradient at all
 * (normalizeDocument would fill it back up behind the user's back), and above
 * `max` the document would drop what was added.
 */
export function createStops(field, { t, value, onChange }) {
  const stops = value && Array.isArray(value.stops) ? value.stops : [];
  const base = fieldId(field.path);
  const listPath = `${field.path}.stops`;

  const rows = stops.map((stop, index) => {
    const line = row('stop-row');
    const remove = iconButton(
      `${base}-stop-remove-${index}`,
      'minus',
      `${t('inspector.removeStop')} ${index + 1}`
    );
    remove.disabled = stops.length <= field.min;
    remove.addEventListener('click', () => {
      onChange(listPath, stops.filter((_, other) => other !== index));
    });
    line.append(remove);
    return line;
  });

  const add = iconButton(`${base}-stop-add`, 'plus', t('inspector.addStop'));
  add.disabled = stops.length >= field.max;
  add.addEventListener('click', () => {
    // The new stop starts out as the colour the gradient already shows at its
    // chosen position, not a fresh default -- so adding a stop changes what
    // can be edited, not how the ramp currently looks. That colour is read
    // off the existing stops with colorAtPosition (src/engine/document.js),
    // never written here as a literal (see the import above and
    // test/app/color-literals.test.js).
    const at = nextStopPosition(stops.map((stop) => stop.at));
    onChange(listPath, [...stops, { at, color: colorAtPosition(stops, at) }]);
  });

  return { rows, add };
}
