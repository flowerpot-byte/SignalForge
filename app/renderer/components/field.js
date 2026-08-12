// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max Leopold Blumenschein
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
import {
  backgroundKindOf, withBackgroundKind, movedLayer, withoutLayer, withAddedLayer
} from '../../../src/engine/slots.js';

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
 * A slider with the number beside it, and the way back to where it started.
 *
 * `input` fires while the slider is being dragged AND on every arrow-key
 * press, so both ways of working report a change the same way.
 *
 * `defaultValue()` is asked, not told: it is called at the moment somebody
 * reaches for the reset and hands back the value a fresh document would carry
 * at this field's path. A function rather than a number because answering the
 * question means normalizing a document (see defaultValueAt in
 * src/engine/document.js), and doing that for every slider on every rebuild of
 * this column would be twenty normalizations to answer a question nobody had
 * asked yet. Absent — a caller with no engine to hand, which is what the unit
 * tests are — and there is simply no reset button, which is the honest thing
 * to draw when the value it would return to cannot be found out.
 */
function numberField(field, { t, value, onChange, defaultValue = null }) {
  // One control, in the shape every control in the reference has: its name on
  // the left, its current value on the right, the track across the full width
  // underneath. Whether that control gets a card of its own or shares one with
  // the rest of a motion is mountInspector's decision, not this one's.
  const wrapper = row('control control-number');
  const id = fieldId(field.path);
  const labelText = t(field.labelKey);

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

  /** Report what the control now says, exactly as a drag of it would. */
  const report = () => {
    readout.textContent = input.value;
    paint(input.value);
    onChange(field.path, Number(input.value));
  };

  input.addEventListener('input', report);

  wrapper.append(labelFor(id, labelText), readout, input);

  if (defaultValue) {
    /**
     * Back to the starting value, through the very same path every other
     * change takes: the control is set, and then the ordinary change is
     * reported. So the picture updates on its next frame and the document is
     * marked unsaved, both without this file knowing that either happens.
     *
     * Nothing is written if there is no answer, or if the answer is outside
     * the range this slider is currently showing — the range gives way to a
     * value, never the other way round (see widenToInclude in
     * components/inspector.js), and silently clamping a reset would put a
     * number in the document that is not the default and is not what was
     * there before either.
     */
    const revert = () => {
      const to = Number(defaultValue());
      if (!Number.isFinite(to)) return;
      if (to < Number(field.min) || to > Number(field.max)) return;
      if (to === Number(input.value)) return;
      input.value = String(to);
      report();
    };

    // The fast path, and the reason the button can afford to be as quiet as it
    // is: a double click on the slider itself. It is the gesture every other
    // tool with sliders uses for this, so it does not have to be advertised —
    // and the two clicks that precede it have already moved the value, which
    // this then overrides, so the outcome is the same either way.
    input.addEventListener('dblclick', revert);

    // Icon-only, so the accessible name is not optional — and it names the
    // control it belongs to, because there are up to twenty of these in the
    // column and "Reset" twenty times over tells a screen reader user nothing
    // about which one they are on.
    const name = `${t('inspector.reset')}: ${labelText}`;
    const button = iconButton(`${id}-reset`, 'revert', name);
    button.classList.add('control-reset');
    button.addEventListener('click', revert);
    // After the slider in the document, not before it: tabbing through this
    // column should reach a control and then that control's reset, rather than
    // meeting the way back before the way forward.
    wrapper.append(button);
  }

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
/**
 * A line of text the person types — today, exactly one: who made the effect.
 *
 * WHY IT COMMITS ON EVERY KEYSTROKE. `input` and not `change`, the same event
 * the colour picker and the sliders report on, because everything in this
 * column is live: the document is the thing being edited, and a name that only
 * arrived on blur would be a field that behaves unlike every other field
 * beside it. Nothing expensive hangs off it — the name is not painted — so
 * there is no reason to make the person press anything to confirm.
 *
 * `spellcheck` off and `autocomplete` off: this is a name, and the browser
 * underlining somebody's surname in red or offering them a saved email address
 * would both be wrong.
 */
function textField(field, { t, value, onChange }) {
  const wrapper = row('control control-row');
  const id = fieldId(field.path);

  const input = document.createElement('input');
  input.type = 'text';
  input.id = id;
  input.value = String(value ?? '');
  input.spellcheck = false;
  input.setAttribute('autocomplete', 'off');
  if (field.placeholderKey) input.placeholder = t(field.placeholderKey);
  input.addEventListener('input', () => onChange(field.path, input.value));

  wrapper.append(labelFor(id, t(field.labelKey)), input);
  return wrapper;
}

function colorField(field, { t, value, onChange, recents = null }) {
  const wrapper = row('control control-row');
  const id = fieldId(field.path);

  const input = document.createElement('input');
  input.type = 'color';
  input.id = id;
  input.value = String(value ?? '');
  input.addEventListener('input', () => onChange(field.path, input.value));

  wrapper.append(labelFor(id, t(field.labelKey)), input);

  // The remembered swatches, when a keeper of them was handed over (see
  // components/recent-colors.js for the list's arithmetic and app/main.js
  // for its persistence). Two moments feed the list and one reads it:
  //
  //  - the picker CLOSING ('change') is when a colour counts as used — the
  //    'input' stream while it is open is every shade the pointer crosses,
  //    and remembering those would fill all eight slots with one drag;
  //  - a swatch being pressed re-remembers that colour (it moves back to the
  //    front) and hands it to the document through the input's own 'input'
  //    path, so the readout, the document and the unsaved mark all move
  //    exactly as if the picker had chosen it.
  //
  // The row redraws itself on both; sibling colour fields pick the new list
  // up when the column next rebuilds, which is the next structural change —
  // a staleness of minutes that costs nothing, against cross-field wiring
  // that would cost real complexity.
  if (recents) {
    const swatches = document.createElement('div');
    swatches.className = 'recent-colours';
    swatches.id = `${id}-recents`;

    const redraw = () => {
      const colours = recents.list();
      swatches.replaceChildren();
      if (!colours.length) {
        swatches.setAttribute('hidden', '');
        return;
      }
      swatches.removeAttribute('hidden');
      for (const colour of colours) {
        const swatch = document.createElement('button');
        swatch.type = 'button';
        swatch.className = 'recent-colour';
        // The colour IS the button face. A document/settings value, not a
        // palette of the window's own — the rule test/app/color-literals
        // keeps is about colours this code names, and this code names none.
        swatch.style.setProperty('--swatch', colour);
        swatch.title = `${t('inspector.recentColour')}: ${colour}`;
        swatch.setAttribute('aria-label', `${t('inspector.recentColour')}: ${colour}`);
        swatch.addEventListener('click', () => {
          input.value = colour;
          input.dispatchEvent(new Event('input'));
          recents.remember(colour);
          redraw();
        });
        swatches.append(swatch);
      }
    };

    input.addEventListener('change', () => {
      recents.remember(input.value);
      redraw();
    });

    redraw();
    wrapper.append(swatches);
  }

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
 * Whether there is a background, and what it is made of.
 *
 * A dropdown like any other to look at, and the one control in this column
 * whose value is not the thing it writes: it SHOWS a word out of
 * BACKGROUND_KINDS and it REPORTS the document's whole layer list with that
 * background put into it (or taken out of it). Everything about how that is
 * done lives in src/engine/slots.js, which is arithmetic over a plain array and
 * is tested without a DOM.
 *
 * That indirection is what lets one dropdown add and remove a layer without
 * this window learning how to build one. The list it reports goes back through
 * setDocument and therefore through normalizeDocument, exactly as adding a
 * motion or a colour stop already does — so a background arrives with the
 * engine's own defaults in it and no colour is ever named here (the rule
 * test/app/color-literals.test.js keeps over this whole tree).
 *
 * `value` is the layer list itself, because the field's path is `layers`.
 */
function backgroundField(field, { t, value, onChange }) {
  const wrapper = row('control control-row');
  const id = fieldId(field.path);

  const select = document.createElement('select');
  select.id = id;
  for (const kind of field.values) {
    const node = document.createElement('option');
    node.value = kind;
    node.textContent = t(optionKey(field, kind));
    select.append(node);
  }
  select.value = backgroundKindOf(value);
  select.addEventListener('change', () => {
    onChange(field.path, withBackgroundKind(value, select.value));
  });

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
  if (field.type === 'text') return textField(field, options);
  if (field.type === 'background') return backgroundField(field, options);
  if (field.type === 'cover') return coverField(field, options);
  if (field.type === 'layers') return layersField(field, options);
  return null;
}

/**
 * The layer stack's cards — Bauplan 3's face.
 *
 * One control whose value is the document's layer array, like the background
 * combobox one type up: every structural press reports the WHOLE array
 * (through the stack arithmetic in src/engine/slots.js) and main.js's
 * existing array path runs it through setDocument. The one gesture that is
 * not a document write is choosing a card — that is onSelectLayer, the
 * column's own state, and it must never touch the document.
 *
 * SHOWN TOP-FIRST: `field.entries` arrive in draw order (bottom first,
 * exactly as the engine paints), and every layer tool a person has ever used
 * shows the stack the other way up — the thing drawn last, sitting visually
 * on top, listed first. So the display reverses, and "up" on a card means
 * towards the viewer: movedLayer(+1), later in draw order.
 *
 * The visibility toggle is a native checkbox rather than an icon button:
 * there is no eye glyph in this window's icon set, a checkbox is the one
 * control whose two states need no explaining, and it is keyboard-reachable
 * for free. Its write is a single-field report (layers.N.visible), not an
 * array — nothing structural changed.
 */
function layersField(field, { t, value, onChange, onSelectLayer = null, liveLayers = null }) {
  const wrapper = row('control layer-stack');
  // EVERY handler asks for the layers at the moment it fires, never the
  // array this build was drawn from: setDocument awaits a real asset reload
  // for any picture in the document, and during that window the old cards
  // are still clickable — two structural presses computed from the same
  // stale capture would silently lose the first one (review measured the
  // window; it is real for exactly the picture-under-figures documents this
  // feature exists for). The capture below is only the DRAWING's input.
  const layersNow = () => {
    const live = liveLayers ? liveLayers() : value;
    return Array.isArray(live) ? live : [];
  };
  const entries = Array.isArray(field.entries) ? field.entries : [];
  const stack = [...entries].reverse();

  for (const entry of stack) {
    const cardRow = document.createElement('div');
    cardRow.className = 'layer-card';

    const pick = document.createElement('button');
    pick.type = 'button';
    pick.className = 'layer-pick';
    pick.id = `sf-layer-${entry.id}`;
    pick.setAttribute('aria-pressed', String(entry.id === field.selectedId));
    const label = t(`inspector.layer.${entry.type}`);
    pick.textContent = entry.figure
      ? `${label} · ${t(`inspector.figure.${entry.figure}`)}`
      : label;
    pick.addEventListener('click', () => onSelectLayer?.(entry.id));

    const seen = document.createElement('input');
    seen.type = 'checkbox';
    seen.id = `sf-layer-${entry.id}-visible`;
    seen.checked = entry.visible;
    seen.title = t('inspector.layers.visible');
    seen.setAttribute('aria-label', `${t('inspector.layers.visible')}: ${pick.textContent}`);
    seen.addEventListener('change', () => {
      const at = layersNow().findIndex((layer) => layer && layer.id === entry.id);
      if (at >= 0) onChange(`layers.${at}.visible`, seen.checked);
    });

    // Plain glyph buttons, not iconButton: this window's icon set has no
    // arrows, and borrowing an unrelated glyph would be a picture that lies.
    // The arrow characters are the label; the accessible name says the rest.
    const step = (glyph, wordKey, direction) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'icon-button layer-step';
      button.id = `sf-layer-${entry.id}-${direction > 0 ? 'up' : 'down'}`;
      button.textContent = glyph;
      button.title = `${t(wordKey)}: ${pick.textContent}`;
      button.setAttribute('aria-label', `${t(wordKey)}: ${pick.textContent}`);
      button.addEventListener('click', () => onChange('layers', movedLayer(layersNow(), entry.id, direction)));
      return button;
    };
    const up = step('↑', 'inspector.layers.up', +1);
    const down = step('↓', 'inspector.layers.down', -1);

    const remove = iconButton(`sf-layer-${entry.id}-remove-stack`, 'minus',
      `${t('inspector.layers.remove')}: ${pick.textContent}`);
    remove.disabled = entries.length <= 1;
    remove.addEventListener('click', () => onChange('layers', withoutLayer(layersNow(), entry.id)));

    cardRow.append(pick, seen, up, down, remove);
    wrapper.append(cardRow);
  }

  // What a new layer can be: the stack types, in the order the gallery
  // teaches them. `image` is not here for the reason the background combobox
  // gives — a picture arrives by being imported, and this row has no way to
  // ask for a file.
  const adder = document.createElement('div');
  adder.className = 'layer-add';
  const kind = document.createElement('select');
  kind.id = 'sf-layer-add-kind';
  for (const type of ['shape', 'particles', 'solid', 'gradient']) {
    const option = document.createElement('option');
    option.value = type;
    option.textContent = t(`inspector.layer.${type}`);
    kind.append(option);
  }
  const add = iconButton('sf-layer-add', 'plus', t('inspector.layers.add'));
  add.addEventListener('click', () => {
    const grown = withAddedLayer(layersNow(), kind.value);
    // The new layer is what the person is about to shape, so it is the
    // selection — set WITHOUT a rerender (second argument false): the write
    // below rebuilds the column once the document really carries the layer,
    // and rendering before that would find the id in no stack and throw the
    // selection away again.
    onSelectLayer?.(grown[grown.length - 1].id, false);
    onChange('layers', grown);
  });
  adder.append(kind, add);
  wrapper.append(adder);

  return wrapper;
}

/**
 * The exported effect's tile picture: automatic, or a picture of the
 * person's own choosing.
 *
 * The one control in this column whose changes do not travel through
 * onChange at all: choosing a picture means a file dialog, a crop in the
 * main process and an asset landing in the document — a whole gesture that
 * lives in main.js's coverPicker (the same division backgroundField
 * describes for the layer list). This row only SHOWS which of the two
 * states the document is in and offers the two ways out of it; the column
 * is rebuilt by the picker once the document has actually changed, so what
 * is shown is never a guess.
 */
function coverField(field, { t, value, coverPicker = null }) {
  const wrapper = row('control control-row');
  const id = fieldId(field.path);

  const state = document.createElement('output');
  state.id = id;
  state.textContent = t(value ? 'inspector.cover.custom' : 'inspector.cover.auto');

  const actions = document.createElement('div');
  actions.className = 'cover-actions';

  const choose = document.createElement('button');
  choose.type = 'button';
  choose.id = `${id}-choose`;
  choose.textContent = t('inspector.cover.choose');
  choose.disabled = !coverPicker;
  choose.addEventListener('click', () => coverPicker?.choose());
  actions.append(choose);

  if (value) {
    const reset = document.createElement('button');
    reset.type = 'button';
    reset.id = `${id}-reset`;
    reset.textContent = t('inspector.cover.reset');
    reset.disabled = !coverPicker;
    reset.addEventListener('click', () => coverPicker?.clear());
    actions.append(reset);
  }

  wrapper.append(labelFor(id, t(field.labelKey)), state, actions);
  return wrapper;
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

  // The button says what it adds: the gradient's ramp adds a "Farbstopp", the
  // colour cycle's ring adds a "Wechselfarbe" — the list field carries the
  // word (addLabelKey) because only it knows which of the two it is.
  const add = iconButton(`${base}-stop-add`, 'plus', t(field.addLabelKey ?? 'inspector.addStop'));
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
