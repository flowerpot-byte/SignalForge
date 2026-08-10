// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later

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
 * A slider with the number beside it.
 *
 * `input` fires while the slider is being dragged AND on every arrow-key
 * press, so both ways of working report a change the same way.
 */
function numberField(field, { t, value, onChange }) {
  const wrapper = row('field');
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

  input.addEventListener('input', () => {
    readout.textContent = input.value;
    onChange(field.path, Number(input.value));
  });

  wrapper.append(labelFor(id, t(field.labelKey)), readout, input);
  return wrapper;
}

function selectField(field, { t, value, onChange }) {
  const wrapper = row('field');
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
 * The motion list: one row per motion, plus the button that adds another.
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
function motionsField(field, { t, value, onChange }) {
  const motions = value && Array.isArray(value.motions) ? value.motions : [];
  const base = fieldId(field.path);
  const listPath = `${field.path}.motions`;

  const group = document.createElement('fieldset');
  group.className = 'motion-list';
  const legend = document.createElement('legend');
  legend.textContent = t(field.labelKey);
  group.append(legend);

  const used = new Set(motions.map((motion) => motion.kind));

  motions.forEach((motion, index) => {
    const line = row('motion-row');
    const id = `${base}-kind-${index}`;

    const select = document.createElement('select');
    select.id = id;
    for (const kind of field.values) {
      if (kind !== motion.kind && used.has(kind)) continue;
      const node = document.createElement('option');
      node.value = kind;
      node.textContent = t(optionKey(field, kind));
      select.append(node);
    }
    select.value = motion.kind;
    select.addEventListener('change', () => onChange(`${listPath}.${index}.kind`, select.value));

    const remove = button(
      `${base}-remove-${index}`,
      t('inspector.removeMotion'),
      `${t('inspector.removeMotion')} ${index + 1}`
    );
    remove.addEventListener('click', () => {
      onChange(listPath, motions.filter((_, other) => other !== index));
    });

    line.append(labelFor(id, `${t('inspector.motion')} ${index + 1}`), select, remove);
    group.append(line);
  });

  const addable = field.values.filter((kind) => kind !== 'none' && !used.has(kind));
  const add = button(`${base}-add`, t('inspector.addMotion'));
  add.className = 'add-motion';
  add.disabled = addable.length === 0;
  add.addEventListener('click', () => onChange(listPath, [...motions, { kind: addable[0] }]));
  group.append(add);

  return group;
}

/**
 * Turn one field description into something you can actually operate.
 *
 * `onChange(path, value)` reports the dot path that changed and its new
 * value; the field never writes into the document itself. An unknown type
 * yields null rather than throwing, so a field description from a newer
 * version of the document simply does not appear.
 */
export function createField(field, options) {
  if (field.type === 'number') return numberField(field, options);
  if (field.type === 'select') return selectField(field, options);
  if (field.type === 'motions') return motionsField(field, options);
  return null;
}
