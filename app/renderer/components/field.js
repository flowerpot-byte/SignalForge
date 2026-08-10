// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import { icon } from './icons.js';

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
  return null;
}
