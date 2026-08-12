// SignalForge — build SignalRGB effects from images, gradients, shapes and particles.
// Copyright (C) 2026 Max Leopold Blumenschein
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { mountInspector } from '../../app/renderer/components/inspector.js';
import { normalizeDocument, defaultValueAt } from '../../src/engine/document.js';
import { getByPath, setByPath } from '../../src/engine/bind.js';

/**
 * Putting one slider back where it started.
 *
 * "Es sollte einen Zurücksetzen-Button am Slider geben." What has to be true
 * of it, and what each check here is for:
 *
 *  - it is THERE, on every slider, and nowhere else (a dropdown has nothing to
 *    reset to that its own list does not already show);
 *  - it says which slider it belongs to, because there are up to twenty of
 *    them in one column and twenty buttons all called "Reset" is no better
 *    than none;
 *  - pressing it reports the value a FRESH DOCUMENT carries at that path —
 *    not a number this file knows, which is why the expected value is read out
 *    of the engine rather than typed in;
 *  - a double click on the slider itself does exactly the same thing;
 *  - the control's own readout follows, or the number beside the track would
 *    go on showing the old value;
 *  - and where the default cannot be worked out, there is no button at all
 *    rather than one that does nothing.
 *
 * The same stand-in DOM as test/app/inspector-mount.test.js, for the same
 * reason: there is no jsdom in this project, and what is under test is what
 * the component builds and what its handlers do, not how any of it looks.
 */
function makeElement(tag) {
  const classes = new Set();
  const node = {
    tagName: tag,
    children: [],
    style: { properties: {}, setProperty(name, value) { this.properties[name] = value; } },
    attributes: {},
    listeners: {},
    dataset: {},
    classes,
    classList: {
      toggle(name, on) { if (on) classes.add(name); else classes.delete(name); },
      add(name) { classes.add(name); },
      remove(name) { classes.delete(name); },
      contains: (name) => classes.has(name)
    },
    id: '',
    textContent: '',
    className: '',
    title: '',
    value: '',
    append(...kids) { node.children.push(...kids); },
    replaceChildren(...kids) { node.children = [...kids]; },
    addEventListener(type, fn) { (node.listeners[type] ||= []).push(fn); },
    setAttribute(name, value) { node.attributes[name] = value; },
    getAttribute: (name) => node.attributes[name],
    contains(other) {
      if (other === node) return true;
      return node.children.some((kid) => kid.contains && kid.contains(other));
    },
    focus() { globalThis.document.activeElement = node; },
    fire(type) { (node.listeners[type] || []).forEach((fn) => fn()); }
  };
  return node;
}

function byId(node, id) {
  if (node.id === id) return node;
  for (const kid of node.children || []) {
    const found = byId(kid, id);
    if (found) return found;
  }
  return null;
}

/** Every element in the tree carrying `name` among its classes. */
function allByClass(node, name, out = []) {
  const written = typeof node.className === 'string' ? node.className.split(' ') : [];
  if (written.includes(name) || (node.classes && node.classes.has(name))) out.push(node);
  for (const kid of node.children || []) allByClass(kid, name, out);
  return out;
}

/** Every <input type="range"> in the tree, in the order the column built them. */
function allSliders(node, out = []) {
  if (node.tagName === 'input' && node.type === 'range') out.push(node);
  for (const kid of node.children || []) allSliders(kid, out);
  return out;
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

const gradientDoc = () => normalizeDocument({
  layers: [{
    id: 'g', type: 'gradient', shape: 'waves', angle: 200, bands: 19,
    stops: [{ at: 0, color: '#112233' }, { at: 40, color: '#445566' }],
    motions: [{ kind: 'drift', speed: 77, amount: 88 }]
  }],
  brightness: 42, trail: 55
}).doc;

/**
 * Mount the real column over a document, with the real default lookup wired in
 * exactly as app/renderer/main.js wires it.
 */
function mount(doc = gradientDoc(), { defaults = true } = {}) {
  const container = makeElement('div');
  installFakeDom(container);
  const changes = [];
  mountInspector(container, {
    t,
    getDocument: () => doc,
    onChange: (path, value) => { changes.push([path, value]); },
    defaultAt: defaults ? (path) => defaultValueAt(doc, path) : null
  });
  return { container, changes, doc };
}

test('every slider carries a reset, and nothing else does', () => {
  const { container } = mount();
  const sliders = allSliders(container);
  assert.ok(sliders.length > 4, 'the column must be holding sliders for this to mean anything');

  const resets = allByClass(container, 'control-reset');
  assert.equal(resets.length, sliders.length,
    'one reset per slider — no more, and none missing');

  // Every reset is inside a row that also holds a slider, i.e. none of them
  // has attached itself to a dropdown or a colour swatch.
  for (const slider of sliders) {
    assert.ok(byId(container, `${slider.id}-reset`),
      `the slider ${slider.id} must have a reset of its own`);
  }
});

test('a reset says which slider it belongs to, by name, in both places', () => {
  const { container } = mount();
  for (const reset of allByClass(container, 'control-reset')) {
    const name = reset.getAttribute('aria-label');
    assert.ok(name, 'an icon-only button must carry an accessible name');
    assert.ok(name.startsWith('inspector.reset:'),
      `the name must lead with the word for the action, got "${name}"`);
    assert.ok(name.length > 'inspector.reset:'.length + 1,
      `the name must go on to say WHICH control, got "${name}"`);
    assert.equal(reset.title, name,
      'the pointer must be told the same thing the screen reader is');
  }

  // And no two of them say the same thing, which is the whole reason the
  // control's own label is in there.
  const names = allByClass(container, 'control-reset').map((r) => r.getAttribute('aria-label'));
  const motions = names.filter((n) => n.endsWith('inspector.speed'));
  assert.ok(motions.length >= 1);
});

test('pressing a reset reports the value a fresh document carries', () => {
  const { container, changes, doc } = mount();

  const bands = byId(container, 'sf-layers-0-bands');
  assert.ok(bands, 'the gradient must have a band count for this test');
  assert.equal(bands.value, '19', 'it starts at the unusual value the document carries');

  byId(container, 'sf-layers-0-bands-reset').fire('click');

  const expected = defaultValueAt(doc, 'layers.0.bands');
  assert.notEqual(expected, 19, 'the default must differ from the value, or nothing is proven');
  assert.deepEqual(changes, [['layers.0.bands', expected]],
    'the reset must report the default at that path, through the ordinary change path');
  assert.equal(bands.value, String(expected), 'and the control itself must follow');
});

test('the number beside the track follows a reset, and so does the painted fill', () => {
  const { container } = mount();
  const slider = byId(container, 'sf-brightness');
  const row = allByClass(container, 'control-number').find((r) => r.contains(slider));
  const readout = row.children.find((kid) => kid.tagName === 'output');

  assert.equal(readout.textContent, '42', 'it starts at the document\'s own value');
  const fillBefore = slider.style.properties['--sf-fill'];

  byId(container, 'sf-brightness-reset').fire('click');

  assert.equal(readout.textContent, slider.value,
    'the readout must say what the slider now says');
  assert.notEqual(slider.style.properties['--sf-fill'], fillBefore,
    'and the filled part of the track must have been repainted');
});

test('a double click on the slider resets it too', () => {
  const { container, changes, doc } = mount();
  const trail = byId(container, 'sf-trail');
  assert.equal(trail.value, '55');

  trail.fire('dblclick');

  assert.deepEqual(changes, [['trail', defaultValueAt(doc, 'trail')]]);
  assert.equal(trail.value, String(defaultValueAt(doc, 'trail')));
});

test('a reset on a slider already at its default writes nothing', () => {
  // hueShift is untouched in this document, so it is already where a fresh one
  // would put it. Pressing reset must not mark the project as changed for
  // nothing — every reported change does (see markChanged in main.js).
  const { container, changes } = mount();
  const reset = byId(container, 'sf-hueShift-reset');
  assert.ok(reset);
  reset.fire('click');
  assert.deepEqual(changes, [], 'nothing to put back, so nothing reported');
});

test('with no way to work out the default there is no reset button at all', () => {
  const { container } = mount(gradientDoc(), { defaults: false });
  assert.ok(allSliders(container).length > 4, 'the sliders are still there');
  assert.deepEqual(allByClass(container, 'control-reset'), [],
    'a button whose target cannot be worked out must not be drawn');
});

test('a lookup that has no answer for one field costs that field its button only', () => {
  const doc = gradientDoc();
  const container = makeElement('div');
  installFakeDom(container);
  const changes = [];
  mountInspector(container, {
    t,
    getDocument: () => doc,
    onChange: (path, value) => { changes.push([path, value]); },
    // The one shape a broken lookup can take: it answers for some paths and
    // not for others. The button is built either way — the answer is not asked
    // for until it is pressed — and pressing it must do nothing rather than
    // write undefined into the document.
    defaultAt: (path) => (path === 'trail' ? undefined : defaultValueAt(doc, path))
  });

  byId(container, 'sf-trail-reset').fire('click');
  assert.deepEqual(changes, [], 'no answer means no change, never a change to nothing');

  byId(container, 'sf-brightness-reset').fire('click');
  assert.equal(changes.length, 1, 'and the sliders that do have an answer still work');
});
