// SignalForge — build SignalRGB effects from images, gradients, shapes and particles.
// Copyright (C) 2026 Max Leopold Blumenschein
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  rememberColor, isRecentColor, RECENT_COLORS_LIMIT
} from '../../app/renderer/components/recent-colors.js';
import { createField } from '../../app/renderer/components/field.js';

/**
 * The remembered swatches: the list's arithmetic, and the colour field's two
 * gestures around it. The main-process side (the allowlist and value check in
 * app/main.js's sf:settings:set) is five lines guarded by review and by the
 * fact that this renderer only ever sends what rememberColor produced — which
 * is exactly what these tests pin.
 */

// ------------------------------------------------------------ the arithmetic

test('a used colour goes in front, once, and the tail is cut at the limit', () => {
  assert.deepEqual(rememberColor([], '#112233'), ['#112233']);
  assert.deepEqual(rememberColor(['#aabbcc'], '#112233'), ['#112233', '#aabbcc']);
  // Using a colour again promotes it rather than duplicating it.
  assert.deepEqual(rememberColor(['#112233', '#aabbcc'], '#aabbcc'), ['#aabbcc', '#112233']);
  const full = Array.from({ length: RECENT_COLORS_LIMIT }, (_, i) => `#00000${i}`);
  const after = rememberColor(full, '#112233');
  assert.equal(after.length, RECENT_COLORS_LIMIT);
  assert.equal(after[0], '#112233');
  assert.ok(!after.includes(full[RECENT_COLORS_LIMIT - 1]), 'the oldest falls off the end');
});

test('junk neither joins the list nor poisons it', () => {
  assert.deepEqual(rememberColor(['#112233'], 'red'), ['#112233']);
  assert.deepEqual(rememberColor(['#112233'], '#12AB34'), ['#112233'],
    'a colour input never produces uppercase, so uppercase is junk here');
  assert.deepEqual(rememberColor(['#112233', 'junk', 42, null], '#445566'),
    ['#445566', '#112233'], 'a broken persisted list is cleaned, not kept');
  assert.deepEqual(rememberColor('not a list', '#445566'), ['#445566']);
  assert.ok(isRecentColor('#0a1b2c'));
  assert.ok(!isRecentColor('#0A1B2C'));
  assert.ok(!isRecentColor('#abc'));
});

// ---------------------------------------------------------- the colour field

function makeElement(tag) {
  const attributes = {};
  const node = {
    tagName: tag,
    children: [],
    style: { properties: {}, setProperty(name, value) { this.properties[name] = value; } },
    listeners: {},
    id: '',
    textContent: '',
    className: '',
    title: '',
    type: '',
    value: '',
    attributes,
    append(...kids) { node.children.push(...kids); },
    replaceChildren(...kids) { node.children = [...kids]; },
    addEventListener(type, fn) { (node.listeners[type] ||= []).push(fn); },
    setAttribute(name, value) { attributes[name] = value; },
    getAttribute: (name) => attributes[name] ?? null,
    removeAttribute(name) { delete attributes[name]; },
    fire(type) { (node.listeners[type] || []).forEach((fn) => fn()); },
    dispatchEvent(event) { node.fire(event.type); }
  };
  return node;
}

function findAll(node, want, out = []) {
  if (want(node)) out.push(node);
  for (const kid of node.children || []) findAll(kid, want, out);
  return out;
}

function mountColour({ list = [] } = {}) {
  globalThis.document = { createElement: makeElement };
  const remembered = [];
  let colours = [...list];
  const recents = {
    list: () => colours,
    remember(color) { remembered.push(color); colours = rememberColor(colours, color); }
  };
  const changes = [];
  const wrapper = createField(
    { path: 'layers.0.color', type: 'color', labelKey: 'inspector.colour' },
    { t: (k) => k, value: '#123456', onChange: (path, value) => changes.push([path, value]), recents }
  );
  const input = findAll(wrapper, (n) => n.tagName === 'input')[0];
  const swatchRow = findAll(wrapper, (n) => n.className === 'recent-colours')[0];
  const swatches = () => findAll(wrapper, (n) => n.className === 'recent-colour');
  return { wrapper, input, swatchRow, swatches, changes, remembered, recents };
}

test('the picker closing is what remembers a colour — not every shade crossed', () => {
  const { input, remembered } = mountColour();
  input.value = '#0a0b0c';
  input.fire('input');
  input.fire('input');
  assert.deepEqual(remembered, [], 'the open picker\'s stream must not fill the list');
  input.fire('change');
  assert.deepEqual(remembered, ['#0a0b0c']);
});

test('a swatch hands its colour to the document through the input\'s own path', () => {
  const { swatches, changes, remembered } = mountColour({ list: ['#aabbcc', '#112233'] });
  assert.equal(swatches().length, 2);
  swatches()[1].fire('click');
  assert.deepEqual(changes, [['layers.0.color', '#112233']],
    'the click must travel the input path, so document and readout move together');
  assert.deepEqual(remembered, ['#112233'], 'and the colour moves back to the front');
});

test('an empty list is a hidden row, and it appears with the first colour', () => {
  const { input, swatchRow, swatches } = mountColour();
  assert.equal(swatchRow.getAttribute('hidden'), '', 'nothing remembered, nothing shown');
  input.value = '#0a0b0c';
  input.fire('change');
  assert.equal(swatchRow.getAttribute('hidden'), null);
  assert.equal(swatches().length, 1);
  assert.equal(swatches()[0].style.properties['--swatch'], '#0a0b0c',
    'the swatch face is the remembered colour itself');
});

test('without a keeper there is no row at all — the tests\' own old world', () => {
  globalThis.document = { createElement: makeElement };
  const wrapper = createField(
    { path: 'layers.0.color', type: 'color', labelKey: 'inspector.colour' },
    { t: (k) => k, value: '#123456', onChange: () => {} }
  );
  assert.equal(findAll(wrapper, (n) => n.className === 'recent-colours').length, 0);
});
