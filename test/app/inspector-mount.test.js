// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { mountInspector } from '../../app/renderer/components/inspector.js';
import { normalizeDocument } from '../../src/engine/document.js';
import { getByPath, setByPath } from '../../src/engine/bind.js';

// mountInspector and field.js read `document` and `window.SignalForgeEngine`
// as plain globals (they run in the renderer), and there is no jsdom in this
// project. This is the smallest fake that lets a real button be pressed: what
// is under test is where a failure goes, not how anything looks.
function makeElement(tag) {
  const node = {
    tagName: tag,
    children: [],
    style: {},
    attributes: {},
    listeners: {},
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
    focus() { globalThis.document.activeElement = node; },
    /** Fire what a real gesture fires, so the app's own handler runs. */
    fire(type) { (node.listeners[type] || []).forEach((fn) => fn()); }
  };
  return node;
}

/** Depth-first search for the one control with this id. */
function byId(node, id) {
  if (node.id === id) return node;
  for (const kid of node.children || []) {
    const found = byId(kid, id);
    if (found) return found;
  }
  return null;
}

function installFakeDom(container) {
  globalThis.document = {
    createElement: makeElement,
    activeElement: null,
    getElementById: (id) => byId(container, id)
  };
  globalThis.window = { SignalForgeEngine: { getByPath, setByPath } };
}

const t = (key) => key;
const docWithMotion = () => normalizeDocument({
  assets: { q: { kind: 'image', mime: 'image/png', data: 'AAAA' } },
  layers: [{ id: 'image', type: 'image', asset: 'q', motions: [{ kind: 'drift' }] }]
}).doc;

// Adding or removing a motion is the only change that returns a promise, and
// the only one that can genuinely fail — it is the only one that reloads the
// picture. Before this, its rejection reached console.error alone: the user
// presses the button, the picture stops matching the list, and the window
// says nothing. Every other failure in this app reaches the one line of
// feedback.
test('a failed motion add is reported, not only logged to the console', async () => {
  const container = makeElement('div');
  installFakeDom(container);

  const failure = new Error('the picture could not be loaded');
  const errors = [];
  const doc = docWithMotion();

  mountInspector(container, {
    t,
    getDocument: () => doc,
    onChange: async () => { throw failure; },
    onError: (err) => errors.push(err)
  });

  const add = byId(container, 'sf-layers-0-add');
  assert.ok(add, 'the add button must be on screen for this test to mean anything');
  add.fire('click');

  // The rejection travels through a promise chain, so let the microtasks run.
  await Promise.resolve();
  await Promise.resolve();

  assert.deepEqual(errors, [failure], 'the failure must reach the caller-supplied onError');
});

test('a failed motion remove is reported the same way', async () => {
  const container = makeElement('div');
  installFakeDom(container);

  const errors = [];
  mountInspector(container, {
    t,
    getDocument: docWithMotion,
    onChange: async () => { throw new Error('nope'); },
    onError: (err) => errors.push(err)
  });

  byId(container, 'sf-layers-0-remove-0').fire('click');
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(errors.length, 1, 'removing a motion must report its failure too');
});

test('a change that succeeds reports nothing', async () => {
  const container = makeElement('div');
  installFakeDom(container);

  const errors = [];
  mountInspector(container, {
    t,
    getDocument: docWithMotion,
    onChange: async () => {},
    onError: (err) => errors.push(err)
  });

  byId(container, 'sf-layers-0-add').fire('click');
  await Promise.resolve();
  await Promise.resolve();

  assert.deepEqual(errors, [], 'a change that worked must not put a warning in the window');
});

/** Every piece of text the column would print, in order. */
function texts(node, out = []) {
  if (node.textContent) out.push(node.textContent);
  for (const kid of node.children || []) texts(kid, out);
  return out;
}

// The motion's name was printed twice: once as the row's own label and once
// as the legend of the fieldset holding that motion's sliders, a few pixels
// below. It was the one thing in the settings column that read as a bug to a
// first-time user.
test('a motion is named once in the column, and its dropdown is still named for a screen reader', () => {
  const container = makeElement('div');
  installFakeDom(container);

  mountInspector(container, {
    t,
    getDocument: docWithMotion,
    onChange: () => {},
    onError: () => {}
  });

  const name = `${t('inspector.motion')} 1`;
  assert.equal(
    texts(container).filter((text) => text === name).length,
    1,
    `"${name}" must appear exactly once in the settings column`
  );

  const select = byId(container, 'sf-layers-0-kind-0');
  assert.equal(
    select.attributes['aria-label'],
    name,
    'the row\'s dropdown must still say which motion it belongs to, even without a visible label'
  );
});

// Every other control keeps its label bound to its id: that association is
// what makes the label clickable and what a screen reader reads out.
test('the sliders and the fit dropdown keep their label bound to their control', () => {
  const container = makeElement('div');
  installFakeDom(container);

  mountInspector(container, { t, getDocument: docWithMotion, onChange: () => {}, onError: () => {} });

  for (const id of ['sf-brightness', 'sf-layers-0-fit', 'sf-layers-0-motions-0-speed']) {
    const control = byId(container, id);
    assert.ok(control, `${id} must be on screen`);
    const labels = [];
    const walk = (node) => {
      if (node.tagName === 'label' && node.htmlFor === id) labels.push(node);
      (node.children || []).forEach(walk);
    };
    walk(container);
    assert.equal(labels.length, 1, `${id} must have exactly one <label for> pointing at it`);
  }
});

// A slider reports a change on every pixel of a drag; rebuilding the column
// underneath a held-down mouse would throw the focus away mid-gesture. That
// restraint must not have been weakened into "sliders are also silent about
// failure" — a slider's onChange writes straight into the live document and
// returns nothing, so there is nothing to report.
test('a slider still neither redraws nor reports', async () => {
  const container = makeElement('div');
  installFakeDom(container);

  const errors = [];
  const changes = [];
  mountInspector(container, {
    t,
    getDocument: docWithMotion,
    onChange: (path, value) => { changes.push([path, value]); },
    onError: (err) => errors.push(err)
  });

  const slider = byId(container, 'sf-brightness');
  slider.value = '60';
  slider.fire('input');
  await Promise.resolve();

  assert.deepEqual(changes, [['brightness', 60]]);
  assert.deepEqual(errors, []);
});
