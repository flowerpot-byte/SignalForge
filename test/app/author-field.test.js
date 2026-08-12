// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { createField } from '../../app/renderer/components/field.js';
import { describeInspector } from '../../app/renderer/components/inspector.js';
import { normalizeDocument } from '../../src/engine/document.js';
import { buildEffectHtml } from '../../src/export/build-effect.js';

/**
 * Who made the effect — the field, and the line it ends up on.
 *
 * SignalRGB prints the publisher under an effect's title on its own page. Every
 * effect this app exported before 12.08.2026 arrived there with that line
 * empty, because the document field existed and nothing could fill it in.
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
    type: '',
    value: '',
    placeholder: '',
    spellcheck: true,
    htmlFor: '',
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
const doc = () => normalizeDocument({ layers: [{ id: 'fill', type: 'solid' }] }).doc;

test('the column offers an author field, under the same heading as the tile', () => {
  const field = describeInspector(doc(), null).find((entry) => entry.path === 'publisher');
  assert.ok(field, 'there is a field for the publisher');
  assert.equal(field.type, 'text');
  assert.equal(field.section, 'display',
    'beside the tile picture: both are about what shows around the effect elsewhere');
});

test('typing in it reports the document path on every keystroke', () => {
  globalThis.document = { createElement: makeElement };
  const changes = [];
  const wrapper = createField(
    { path: 'publisher', type: 'text', labelKey: 'inspector.publisher', placeholderKey: 'hint' },
    { t, value: '', onChange: (path, value) => changes.push([path, value]) }
  );
  const input = findAll(wrapper, (n) => n.tagName === 'input')[0];
  assert.ok(input, 'the field is a text input');
  assert.equal(input.type, 'text');
  assert.equal(input.placeholder, 'hint');
  assert.equal(input.spellcheck, false, 'a name is not a spelling mistake');
  assert.equal(input.getAttribute('autocomplete'), 'off');

  input.value = 'Max Leopold Blumenschein';
  input.fire('input');
  assert.deepEqual(changes, [['publisher', 'Max Leopold Blumenschein']],
    'reported on input, like every other live control in this column');
});

test('an existing name is shown, not silently dropped', () => {
  globalThis.document = { createElement: makeElement };
  const wrapper = createField(
    { path: 'publisher', type: 'text', labelKey: 'inspector.publisher' },
    { t, value: 'Someone Else', onChange: () => {} }
  );
  const input = findAll(wrapper, (n) => n.tagName === 'input')[0];
  assert.equal(input.value, 'Someone Else');
});

test('the name reaches the exported file, where SignalRGB reads it', () => {
  const { doc: signed } = normalizeDocument({
    name: 'Signed',
    publisher: 'Max Leopold Blumenschein',
    layers: [{ id: 'fill', type: 'solid', color: '#ff0066' }]
  });
  const html = buildEffectHtml({ doc: signed, engineSource: '/* engine */', lang: 'de' });
  assert.match(html, /<meta publisher="Max Leopold Blumenschein" \/>/,
    'the head carries the publisher SignalRGB prints under the title');
});
