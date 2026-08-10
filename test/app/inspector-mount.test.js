// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { mountInspector } from '../../app/renderer/components/inspector.js';
import { fillPercent } from '../../app/renderer/components/field.js';
import { normalizeDocument, colorAtPosition } from '../../src/engine/document.js';
import { getByPath, setByPath } from '../../src/engine/bind.js';

// mountInspector and field.js read `document` and `window.SignalForgeEngine`
// as plain globals (they run in the renderer), and there is no jsdom in this
// project. This is the smallest fake that lets a real button be pressed: what
// is under test is where a failure goes, not how anything looks.
function makeElement(tag) {
  const node = {
    tagName: tag,
    children: [],
    // field.js paints a slider's filled track by setting a custom property on
    // it, which a bare object literal has no method for.
    style: { properties: {}, setProperty(name, value) { this.properties[name] = value; } },
    attributes: {},
    listeners: {},
    // The column's sections now carry a data attribute saying which one they
    // are and a class saying whether the left column is pointing at them, and
    // its headings carry a hand-drawn line icon. None of that is what this
    // file is about; the stand-in just has to survive it.
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

// A motion's kind and that motion's two sliders are one thing and now live in
// one card. They used to be in two separate fieldsets several rows apart — a
// list of dropdowns under "Bewegungen" and a stack of slider groups under
// "Bewegung 1", "Bewegung 2" below it — which is what made the column say its
// own structure twice.
test('a motion\'s kind and its sliders sit inside one card', () => {
  const container = makeElement('div');
  installFakeDom(container);

  mountInspector(container, {
    t,
    getDocument: () => normalizeDocument({
      assets: { q: { kind: 'image', mime: 'image/png', data: 'AAAA' } },
      layers: [{
        id: 'image', type: 'image', asset: 'q',
        motions: [{ kind: 'drift' }, { kind: 'warp' }]
      }]
    }).doc,
    onChange: () => {},
    onError: () => {}
  });

  /** The nearest enclosing element with this class name. */
  const cardHolding = (id) => {
    let found = null;
    const walk = (node, card) => {
      const inside = node.className === 'motion' ? node : card;
      if (node.id === id) found = inside;
      (node.children || []).forEach((kid) => walk(kid, inside));
    };
    walk(container, null);
    return found;
  };

  for (const index of [0, 1]) {
    const card = cardHolding(`sf-layers-0-kind-${index}`);
    assert.ok(card, `motion ${index}'s dropdown must be inside a motion card`);
    assert.equal(
      cardHolding(`sf-layers-0-motions-${index}-speed`),
      card,
      `motion ${index}'s speed slider must be in the same card as its dropdown`
    );
    assert.equal(
      cardHolding(`sf-layers-0-motions-${index}-amount`),
      card,
      `motion ${index}'s strength slider must be in the same card as its dropdown`
    );
  }

  // And the two motions are two cards, not one holding everything.
  assert.notEqual(
    cardHolding('sf-layers-0-kind-0'),
    cardHolding('sf-layers-0-kind-1'),
    'each motion must have a card of its own'
  );

  // The button that adds another comes after them, outside every card.
  assert.equal(
    cardHolding('sf-layers-0-add'),
    null,
    'the add button belongs to the section, not to the last motion'
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

// The filled part of a slider's track is painted from a CSS custom property
// (--sf-fill) that field.js sets, not from anything the browser tracks on
// its own — see styles/app.css and styles/tokens.css (--track-fill /
// --track-empty). That only does anyone any good if it is kept in step with
// the value on every path a value can change through. This test is
// falsifiable on purpose: comment out the `paint(input.value)` call in
// field.js's 'input' listener, or the `paint(value)` call at slider
// construction, and one of the two assertions below fails.
test('the fill custom property tracks the value, driven by an arrow-key-style input event', async () => {
  const container = makeElement('div');
  installFakeDom(container);

  mountInspector(container, { t, getDocument: docWithMotion, onChange: () => {}, onError: () => {} });

  const slider = byId(container, 'sf-brightness');
  // brightness offers 5..100 (see CONTROL_RANGES); this is the same event a
  // real ArrowLeft/ArrowRight press fires on a range input, distinct from a
  // drag only in how the value got set, not in which event follows it.
  slider.value = '62';
  slider.fire('input');

  assert.equal(
    slider.style.properties['--sf-fill'],
    `${fillPercent({ min: 5, max: 100 }, 62)}%`,
    '--sf-fill must move to match the value an arrow key just set'
  );
});

// The real gesture, through the real button, in the real settings column --
// not just the standalone function. Presses the gradient's own "add stop"
// button and checks what onChange actually receives.
test('pressing the stop add button gives the new stop the colour the gradient already showed there, not a default', () => {
  const container = makeElement('div');
  installFakeDom(container);

  const doc = normalizeDocument({ layers: [{ id: 'a1', type: 'gradient' }] }).doc;
  const changes = [];

  mountInspector(container, {
    t,
    getDocument: () => doc,
    onChange: (path, value) => { changes.push([path, value]); },
    onError: () => {}
  });

  const add = byId(container, 'sf-layers-0-stop-add');
  assert.ok(add, 'the stop add button must be on screen for a gradient layer');
  add.fire('click');

  assert.equal(changes.length, 1);
  const [path, stops] = changes[0];
  assert.equal(path, 'layers.0.stops');
  assert.equal(stops.length, 3, 'the default two stops plus the new one');
  assert.deepEqual(stops[0], doc.layers[0].stops[0], 'the existing stops must be untouched');
  assert.deepEqual(stops[1], doc.layers[0].stops[1], 'the existing stops must be untouched');
  assert.equal(stops[2].at, 50, 'the widest (only) gap in the default two-stop gradient is the whole ramp');
  assert.equal(
    stops[2].color,
    colorAtPosition(doc.layers[0].stops, 50),
    'the new stop\'s colour must be what the gradient already showed at position 50, not a fresh default'
  );
});

test('the fill custom property is set correctly by a redraw, not only by a live drag', () => {
  // Stands in for the two real callers of inspector.refresh() that are not a
  // drag: opening a saved project (app/renderer/main.js, after
  // preview.setDocument) and switching the language (applyLanguage). Both
  // throw the whole settings column away and rebuild it from whatever the
  // document says right now — so a slider that only painted itself in
  // response to its own 'input' event would come back on screen showing the
  // old value's fill next to the new value's number.
  let brightness = 12;
  const container = makeElement('div');
  installFakeDom(container);

  const doc = () => ({
    ...docWithMotion(),
    // Only brightness needs to move for this test; everything else about
    // the document is the fixture's normal shape.
    brightness
  });

  const inspector = mountInspector(container, { t, getDocument: doc, onChange: () => {}, onError: () => {} });
  assert.equal(
    byId(container, 'sf-brightness').style.properties['--sf-fill'],
    `${fillPercent({ min: 5, max: 100 }, 12)}%`,
    'the first paint must match the first document'
  );

  // Nothing dragged this slider; the document underneath it changed and the
  // column was told to redraw, exactly as a freshly opened project or a
  // language switch does.
  brightness = 91;
  inspector.refresh();

  assert.equal(
    byId(container, 'sf-brightness').style.properties['--sf-fill'],
    `${fillPercent({ min: 5, max: 100 }, 91)}%`,
    'a redraw must paint the fill for the NEW value, not leave the old fill standing'
  );
});
