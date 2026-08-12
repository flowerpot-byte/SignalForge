// SignalForge — build SignalRGB effects from images, gradients, shapes and particles.
// Copyright (C) 2026 Max Leopold Blumenschein
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { createField } from '../../app/renderer/components/field.js';

/**
 * The tile row: it SHOWS which of the two states the document is in and
 * offers the two ways out — everything else (the dialog, the crop, the
 * document change) is the picker's, which lives in main.js and is handed in.
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
    type: '',
    disabled: false,
    append(...kids) { node.children.push(...kids); },
    addEventListener(type, fn) { (node.listeners[type] ||= []).push(fn); },
    setAttribute() {},
    fire(type) { (node.listeners[type] || []).forEach((fn) => fn()); }
  };
  return node;
}

function findAll(node, want, out = []) {
  if (want(node)) out.push(node);
  for (const kid of node.children || []) findAll(kid, want, out);
  return out;
}

function mountCover(value, picker) {
  globalThis.document = { createElement: makeElement };
  return createField(
    { path: 'cover', type: 'cover', labelKey: 'inspector.cover' },
    { t: (k) => k, value, onChange: () => {}, coverPicker: picker }
  );
}

const buttonsOf = (wrapper) => findAll(wrapper, (n) => n.tagName === 'button');

test('automatic: one button, and it asks the picker to choose', () => {
  const calls = [];
  const wrapper = mountCover(null, { choose: () => calls.push('choose'), clear: () => calls.push('clear') });
  const buttons = buttonsOf(wrapper);
  assert.equal(buttons.length, 1, 'nothing to reset while the tile is automatic');
  assert.equal(buttons[0].textContent, 'inspector.cover.choose');
  buttons[0].fire('click');
  assert.deepEqual(calls, ['choose']);
  const state = findAll(wrapper, (n) => n.tagName === 'output')[0];
  assert.equal(state.textContent, 'inspector.cover.auto');
});

test('a chosen picture: the way back appears, and it asks the picker to clear', () => {
  const calls = [];
  const wrapper = mountCover('cover', { choose: () => calls.push('choose'), clear: () => calls.push('clear') });
  const buttons = buttonsOf(wrapper);
  assert.equal(buttons.length, 2);
  assert.equal(buttons[1].textContent, 'inspector.cover.reset');
  buttons[1].fire('click');
  assert.deepEqual(calls, ['clear']);
  const state = findAll(wrapper, (n) => n.tagName === 'output')[0];
  assert.equal(state.textContent, 'inspector.cover.custom');
});

test('without a picker the row still stands, disabled rather than dead-ended', () => {
  const wrapper = mountCover(null, null);
  const buttons = buttonsOf(wrapper);
  assert.equal(buttons.length, 1);
  assert.equal(buttons[0].disabled, true);
});
