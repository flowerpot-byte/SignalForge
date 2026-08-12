// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max Leopold Blumenschein
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { mountInspector } from '../../app/renderer/components/inspector.js';
import { mountFooter } from '../../app/renderer/components/footer.js';
import { normalizeDocument, defaultValueAt } from '../../src/engine/document.js';
import { getByPath, setByPath } from '../../src/engine/bind.js';

/**
 * Every icon-only control in the window must carry BOTH an accessible name
 * (`aria-label`) and a `title` that says the same thing to a pointer — see
 * emil-design-eng's polish pass and iconButton's own doc comment in
 * components/field.js. This is the falsifiable guard for that rule: it mounts
 * the real components (not a description of them) against a hand-made stand-in
 * DOM — the same one test/app/inspector-mount.test.js uses, there being no
 * jsdom in this project — and walks what actually got built.
 *
 * "Icon-only" is derived, not named: a <button> that has an <svg> somewhere
 * inside it and no visible text anywhere inside it (an icon beside a word,
 * like the footer's Export/Save/Open buttons, is excluded because the word IS
 * its visible text). That is deliberately the same test a sighted user's eye
 * and a screen reader's ear each apply on their own, from opposite sides.
 *
 * Falsifiable: comment out either `element.setAttribute('aria-label', name)`
 * or `element.title = name` in field.js's iconButton, or footer.js's own
 * `settings.title = t('inspector.title')` line, and this goes red.
 */

function makeElement(tag) {
  const node = {
    tagName: tag,
    children: [],
    style: { properties: {}, setProperty(name, value) { this.properties[name] = value; } },
    attributes: {},
    listeners: {},
    dataset: {},
    classList: { toggle() {}, add() {}, remove() {} },
    id: '',
    textContent: '',
    append(...kids) { node.children.push(...kids); },
    replaceChildren(...kids) { node.children = [...kids]; },
    addEventListener(type, fn) { (node.listeners[type] ||= []).push(fn); },
    setAttribute(name, value) { node.attributes[name] = value; },
    contains(other) {
      if (other === node) return true;
      return node.children.some((kid) => kid.contains && kid.contains(other));
    },
    fire(type) { (node.listeners[type] || []).forEach((fn) => fn()); }
  };
  return node;
}

function installFakeDom() {
  globalThis.document = { createElement: makeElement, activeElement: null, getElementById: () => null };
  globalThis.window = { SignalForgeEngine: { getByPath, setByPath } };
}

const t = (key) => key;

/** Every <button> in the mounted tree, depth-first. */
function collectButtons(node, out = []) {
  if (node.tagName === 'button') out.push(node);
  for (const kid of node.children || []) collectButtons(kid, out);
  return out;
}

/** Whether an <svg> (a drawn icon — see components/icons.js) sits anywhere inside. */
function hasSvgChild(node) {
  if (node.tagName === 'svg') return true;
  return (node.children || []).some(hasSvgChild);
}

/**
 * The visible words inside a node, aggregated — SVG subtrees excluded, since
 * an icon's own `aria-label` (set only when it stands alone; see icon() in
 * components/icons.js) is not text a sighted user reads on screen.
 */
function visibleText(node) {
  if (node.tagName === 'svg') return '';
  let text = node.textContent || '';
  for (const kid of node.children || []) text += visibleText(kid);
  return text;
}

test('every icon-only control carries a title that matches its accessible name', () => {
  const found = [];

  // The motion list: a remove button per motion, and the section's own add
  // button (see createMotions in components/field.js).
  installFakeDom();
  const motionContainer = makeElement('div');
  const motionDoc = normalizeDocument({
    assets: { q: { kind: 'image', mime: 'image/png', data: 'AAAA' } },
    layers: [{ id: 'image', type: 'image', asset: 'q', motions: [{ kind: 'drift' }] }]
  }).doc;
  mountInspector(motionContainer, {
    t,
    getDocument: () => motionDoc,
    onChange: () => {},
    onError: () => {},
    // Wired exactly as app/renderer/main.js wires it, so the per-slider reset
    // buttons are BUILT here and therefore fall under this rule. Without it
    // the column drawn in this test would be missing the newest icon-only
    // control in the window, and the guard would go on reporting green over a
    // button it had never seen.
    defaultAt: (path) => defaultValueAt(motionDoc, path)
  });
  found.push(...collectButtons(motionContainer));

  // A gradient layer: the stop list's own remove and add buttons (see
  // createStops in components/field.js) — a different call site of the same
  // iconButton helper, checked separately so a regression specific to one of
  // the two cannot hide behind the other passing.
  installFakeDom();
  const gradientContainer = makeElement('div');
  const gradientDoc = normalizeDocument({ layers: [{ id: 'a1', type: 'gradient' }] }).doc;
  mountInspector(gradientContainer, {
    t,
    getDocument: () => gradientDoc,
    onChange: () => {},
    onError: () => {},
    defaultAt: (path) => defaultValueAt(gradientDoc, path)
  });
  found.push(...collectButtons(gradientContainer));

  // The transport bar: its one icon-only control is the app-settings toggle
  // (see components/footer.js) — everything else in that row carries a word.
  installFakeDom();
  const footerContainer = makeElement('div');
  mountFooter(footerContainer, {
    t,
    onNameChange: () => {}, onExport: () => {}, onOverwrite: () => {},
    onSave: () => {}, onOpen: () => {}, onSettings: () => {}
  });
  found.push(...collectButtons(footerContainer));

  const iconOnly = found.filter((button) => hasSvgChild(button) && visibleText(button).trim() === '');

  // A vacuous pass would be worthless — this is exactly the five call sites
  // the window has today (motion remove, motion add, stop remove, stop add,
  // the settings toggle), so five or more says the walk found them.
  assert.ok(
    iconOnly.length >= 5,
    `only ${iconOnly.length} icon-only buttons were found — has the walk stopped finding them?`
  );

  // And the sixth call site by name, because it is the one that arrives in
  // NUMBERS: a reset per slider, up to twenty of them in a column. A floor
  // that only counts would go on passing if every one of them vanished, since
  // the five above already clear it.
  const resets = iconOnly.filter((button) => String(button.attributes['aria-label'] || '')
    .startsWith('inspector.reset'));
  assert.ok(
    resets.length > 0,
    'no per-slider reset button was found — the column builds one for every slider'
  );

  const offences = [];
  for (const button of iconOnly) {
    const label = button.attributes['aria-label'];
    const { title } = button;
    if (!label || !String(label).trim()) {
      offences.push(`#${button.id || '(no id)'}: no aria-label — an icon-only control has no accessible name`);
      continue;
    }
    if (!title || !String(title).trim()) {
      offences.push(`#${button.id || '(no id)'}: aria-label "${label}" but no title — nothing shows on hover`);
      continue;
    }
    if (title !== label) {
      offences.push(`#${button.id || '(no id)'}: title "${title}" disagrees with aria-label "${label}"`);
    }
  }

  assert.deepEqual(offences, [], `icon-only controls without a matching title:\n${offences.join('\n')}`);
});
