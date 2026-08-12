// SignalForge — build SignalRGB effects from images, gradients, shapes and particles.
// Copyright (C) 2026 Max Leopold Blumenschein
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { createField } from '../../app/renderer/components/field.js';
import { describeInspector } from '../../app/renderer/components/inspector.js';
import { normalizeDocument } from '../../src/engine/document.js';
import { getByPath, setByPath } from '../../src/engine/bind.js';

/**
 * The layer stack's cards — what the column DESCRIBES and what each gesture
 * REPORTS, in the same stand-in DOM every mount test uses. The stack
 * arithmetic itself is proven in test/engine/layer-stack.test.js; here the
 * question is the wiring: top-first display, selection that never writes,
 * structural presses that report whole arrays, a visibility toggle that
 * reports one field.
 */

function makeElement(tag) {
  const node = {
    tagName: tag,
    children: [],
    style: { setProperty() {} },
    listeners: {},
    id: '',
    textContent: '',
    className: '',
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    title: '',
    type: '',
    value: '',
    checked: false,
    disabled: false,
    attributes: {},
    append(...kids) { node.children.push(...kids); },
    addEventListener(type, fn) { (node.listeners[type] ||= []).push(fn); },
    setAttribute(name, value) { node.attributes[name] = value; },
    getAttribute: (name) => node.attributes[name] ?? null,
    fire(type) { (node.listeners[type] || []).forEach((fn) => fn()); }
  };
  return node;
}

function findAll(node, want, out = []) {
  if (want(node)) out.push(node);
  for (const kid of node.children || []) findAll(kid, want, out);
  return out;
}

const t = (key) => key;

const doc = () => normalizeDocument({
  layers: [
    { id: 'bg', type: 'gradient' },
    { id: 'fig', type: 'shape', figure: 'star' },
    { id: 'rain', type: 'particles' }
  ]
}).doc;

function mountStack(selectedId = 'rain') {
  globalThis.document = { createElement: makeElement };
  globalThis.window = { SignalForgeEngine: { getByPath, setByPath } };
  const d = doc();
  const field = describeInspector(d, selectedId).find((entry) => entry.type === 'layers');
  assert.ok(field, 'the stack field exists');
  const changes = [];
  const selections = [];
  const wrapper = createField(field, {
    t,
    value: d.layers,
    onChange: (path, value) => changes.push([path, value]),
    onSelectLayer: (id) => selections.push(id)
  });
  return { field, wrapper, changes, selections };
}

test('the description: the stack field leads, entries bottom-first, selection carried', () => {
  const fields = describeInspector(doc(), 'fig');
  assert.equal(fields[0].type, 'layers', 'the stack is the first thing the column says');
  assert.deepEqual(fields[0].entries.map((entry) => entry.id), ['fig', 'rain'],
    'draw order, background excluded');
  assert.equal(fields[0].selectedId, 'fig');
  assert.equal(fields[0].entries[0].figure, 'star', 'a figure card can say which figure');
});

test('the cards show top-first, and picking one selects without writing', () => {
  const { wrapper, changes, selections } = mountStack();
  const picks = findAll(wrapper, (n) => n.className === 'layer-pick');
  assert.deepEqual(picks.map((pick) => pick.id), ['sf-layer-rain', 'sf-layer-fig'],
    'the layer drawn last sits visually on top, listed first');
  assert.equal(picks[0].attributes['aria-pressed'], 'true', 'rain is the selection');
  picks[1].fire('click');
  assert.deepEqual(selections, ['fig']);
  assert.deepEqual(changes, [], 'choosing a card must never touch the document');
});

test('up, down, remove and add report whole arrays through the stack arithmetic', () => {
  const { wrapper, changes } = mountStack();
  const byId = (id) => findAll(wrapper, (n) => n.id === id)[0];

  byId('sf-layer-fig-up').fire('click');
  assert.equal(changes.at(-1)[0], 'layers');
  assert.deepEqual(changes.at(-1)[1].map((layer) => layer.id), ['bg', 'rain', 'fig'],
    'up means towards the viewer: later in draw order');

  byId('sf-layer-rain-down').fire('click');
  assert.deepEqual(changes.at(-1)[1].map((layer) => layer.id), ['bg', 'rain', 'fig']);

  byId('sf-layer-fig-remove-stack').fire('click');
  assert.deepEqual(changes.at(-1)[1].map((layer) => layer.id), ['bg', 'rain']);

  const kind = byId('sf-layer-add-kind');
  kind.value = 'particles';
  byId('sf-layer-add').fire('click');
  const grown = changes.at(-1)[1];
  assert.deepEqual(grown.map((layer) => layer.id), ['bg', 'fig', 'rain', 'particles']);
  assert.equal(grown.at(-1).type, 'particles');
});

test('adding selects the new layer — the thing the person is about to shape', () => {
  const { wrapper, selections } = mountStack();
  const byId = (id) => findAll(wrapper, (n) => n.id === id)[0];
  byId('sf-layer-add-kind').value = 'solid';
  byId('sf-layer-add').fire('click');
  assert.deepEqual(selections, ['solid'],
    'the new layer is the selection, set before the write rebuilds the column');
});

test('the visibility toggle reports the one field it changed, not an array', () => {
  const { wrapper, changes } = mountStack();
  const toggle = findAll(wrapper, (n) => n.id === 'sf-layer-fig-visible')[0];
  assert.equal(toggle.checked, true);
  toggle.checked = false;
  toggle.fire('change');
  assert.deepEqual(changes, [['layers.1.visible', false]],
    'nothing structural changed, so no array travels');
});

test('the last stack card cannot be removed, and a lone layer still stacks', () => {
  globalThis.document = { createElement: makeElement };
  const d = normalizeDocument({ layers: [{ id: 'only', type: 'shape' }] }).doc;
  const field = describeInspector(d, 'only').find((entry) => entry.type === 'layers');
  assert.deepEqual(field.entries.map((entry) => entry.id), ['only']);
  const wrapper = createField(field, {
    t, value: d.layers, onChange: () => {}, onSelectLayer: () => {}
  });
  const remove = findAll(wrapper, (n) => n.id === 'sf-layer-only-remove-stack')[0];
  assert.equal(remove.disabled, true, 'a stack of one keeps its one');
});
