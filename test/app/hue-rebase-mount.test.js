// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max Leopold Blumenschein
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { mountInspector } from '../../app/renderer/components/inspector.js';
import { normalizeDocument } from '../../src/engine/document.js';
import { getByPath, setByPath } from '../../src/engine/bind.js';
import { hueDegrees, rebasedHueShift } from '../../src/engine/motion/hue.js';
import { cyclePaint, rebasedCyclePhase } from '../../src/engine/motion/color-cycle.js';

/**
 * The Farbwechsel slider must change the SPEED and nothing else.
 *
 * What the column has to do for that (the arithmetic itself is proven in
 * test/engine/hue-rebase.test.js): the moment the cycle changes, re-park
 * hueShift at the angle the preview is showing — through the hueShift
 * slider's own 'input' path, so the readout, the painted fill and the
 * document all move together — and only then write the cycle. Checked here
 * on the real mounted column over the same stand-in DOM every mount test
 * uses (there is no jsdom in this project), extended by dispatchEvent,
 * which is how the column pulls the hueShift slider's own string.
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
    fire(type) { (node.listeners[type] || []).forEach((fn) => fn()); },
    dispatchEvent(event) { node.fire(event.type); }
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

function installFakeDom(container) {
  globalThis.document = {
    createElement: makeElement,
    activeElement: null,
    getElementById: (id) => byId(container, id)
  };
  globalThis.window = {
    SignalForgeEngine: { getByPath, setByPath, rebasedHueShift, rebasedCyclePhase }
  };
}

const t = (key) => key;

/**
 * Mounted the way main.js mounts it: onChange writes into the live document
 * through setByPath — the rebase reads the document mid-gesture, so a fake
 * that only recorded would hand it stale values and prove nothing.
 */
function mount(doc, { previewTime } = {}) {
  const container = makeElement('div');
  installFakeDom(container);
  const changes = [];
  mountInspector(container, {
    t,
    getDocument: () => doc,
    onChange: (path, value) => {
      changes.push([path, value]);
      setByPath(doc, path, value);
    },
    previewTime
  });
  return { container, changes, doc };
}

const hueDoc = () => normalizeDocument({
  layers: [{ id: 's', type: 'solid' }],
  hueShift: 100,
  hueCycle: 20
}).doc;

/** Distance between two angles on the wheel. */
function angleGap(a, b) {
  const raw = Math.abs(a - b) % 360;
  return raw > 180 ? 360 - raw : raw;
}

test('changing the cycle re-parks the shift first, through the shift slider itself', () => {
  const timeSec = 9.13;
  const { container, changes, doc } = mount(hueDoc(), { previewTime: () => timeSec });

  const angleBefore = hueDegrees(100, 20, timeSec);

  const cycle = byId(container, 'sf-hueCycle');
  assert.ok(cycle, 'the cycle slider exists');
  cycle.value = '70';
  cycle.fire('input');

  // The shift arrived before the cycle — while the document still said 20 —
  // and both landed in the document.
  const paths = changes.map(([path]) => path);
  const shiftAt = paths.indexOf('hueShift');
  const cycleAt = paths.indexOf('hueCycle');
  assert.ok(shiftAt !== -1, `hueShift was never written: ${JSON.stringify(changes)}`);
  assert.ok(cycleAt !== -1, 'hueCycle was never written');
  assert.ok(shiftAt < cycleAt, 'the shift must be re-parked BEFORE the cycle changes');

  // The document and the slider carry the DISPLAY value: the exact figure,
  // rounded once for a step-1 control (the chain itself stays exact inside
  // the column — the drag test below is what pins that).
  const expected = Math.round(rebasedHueShift(100, 20, 70, timeSec)) % 360;
  assert.equal(doc.hueShift, expected);
  assert.equal(doc.hueCycle, 70);

  // The slider shows what the document now holds — the readout path was the
  // one that wrote it, so the two cannot disagree.
  const shift = byId(container, 'sf-hueShift');
  assert.equal(shift.value, String(expected));

  // And the angle on screen did not move: the whole point, measured. Half a
  // degree is the single display rounding's own bound.
  const angleAfter = hueDegrees(doc.hueShift, doc.hueCycle, timeSec);
  assert.ok(angleGap(angleBefore, angleAfter) <= 0.5 + 1e-9,
    `the colour jumped: ${angleBefore} -> ${angleAfter}`);
});

test('a whole drag across the range holds the angle — the chain must not drift', () => {
  // The measured fault the exact chain exists for: one input tick per value,
  // back and forth across the whole slider, 400 ticks. With the chain seeded
  // from the rounded document value on every tick this drifted by up to 177
  // degrees; with the exact figure held inside the column it must stay
  // within the ONE display rounding the document carries.
  const timeSec = 9.13;
  const { container, doc } = mount(hueDoc(), { previewTime: () => timeSec });
  const angleBefore = hueDegrees(doc.hueShift, doc.hueCycle, timeSec);

  const cycle = byId(container, 'sf-hueCycle');
  for (let pass = 0; pass < 2; pass += 1) {
    for (let v = 1; v <= 100; v += 1) { cycle.value = String(v); cycle.fire('input'); }
    for (let v = 100; v >= 1; v -= 1) { cycle.value = String(v); cycle.fire('input'); }
  }

  const angleAfter = hueDegrees(doc.hueShift, doc.hueCycle, timeSec);
  assert.ok(angleGap(angleBefore, angleAfter) <= 0.5 + 1e-9,
    `400 drag ticks drifted the colour: ${angleBefore} -> ${angleAfter}`);
});

test('moving the shift by hand re-seeds the chain instead of overriding it', () => {
  // The exact figure describes the value the chain last wrote. The moment
  // the person moves hueShift THEMSELVES, the document no longer shows the
  // chain's rounding and the next cycle change must start from the hand-set
  // value — an exact figure that overrode it would snap the slider back to
  // wherever the chain left off.
  const timeSec = 9.13;
  const { container, doc } = mount(hueDoc(), { previewTime: () => timeSec });

  const cycle = byId(container, 'sf-hueCycle');
  cycle.value = '70';
  cycle.fire('input');

  const shift = byId(container, 'sf-hueShift');
  shift.value = '250';
  shift.fire('input');
  assert.equal(doc.hueShift, 250);

  const angleAtHand = hueDegrees(250, doc.hueCycle, timeSec);
  cycle.value = '30';
  cycle.fire('input');
  const angleAfter = hueDegrees(doc.hueShift, doc.hueCycle, timeSec);
  assert.ok(angleGap(angleAtHand, angleAfter) <= 0.5 + 1e-9,
    `the chain overrode a hand-set shift: ${angleAtHand} -> ${angleAfter}`);
});

test('without a preview to ask, the cycle slider behaves as it always did', () => {
  const { container, changes, doc } = mount(hueDoc());
  const slider = byId(container, 'sf-hueCycle');
  slider.value = '70';
  slider.fire('input');
  assert.deepEqual(changes, [['hueCycle', 70]], 'only the cycle itself may be written');
  assert.equal(doc.hueShift, 100, 'the shift stays untouched');
});

test('a cycle change at t=0 writes no shift, because nothing has turned', () => {
  const { container, changes, doc } = mount(hueDoc(), { previewTime: () => 0 });
  const cycle = byId(container, 'sf-hueCycle');
  cycle.value = '70';
  cycle.fire('input');
  assert.deepEqual(changes, [['hueCycle', 70]],
    'a re-park to the value already showing must not write at all');
  assert.equal(doc.hueShift, 100);
});

test('the colour cycle\'s tempo re-parks its anchor too — the fault must not arrive twice', () => {
  // The very promise the hueCycle branch above keeps, on the layer's own
  // tempo: caught missing by review one feature after it was first paid for.
  const timeSec = 9.13;
  const doc = normalizeDocument({
    layers: [{
      id: 's', type: 'solid', color: '#123456', cycleSpeed: 20,
      stops: [{ at: 0, color: '#ff0000' }, { at: 100, color: '#0000ff' }]
    }]
  }).doc;
  const { container, changes } = mount(doc, { previewTime: () => timeSec });

  const colourBefore = cyclePaint(doc.layers[0], timeSec);

  const tempo = byId(container, 'sf-layers-0-cycleSpeed');
  assert.ok(tempo, 'the tempo slider exists');
  tempo.value = '70';
  tempo.fire('input');

  // The anchor arrived before the tempo — while the layer still said 20 —
  // exact and unrounded, and the painted colour did not move.
  const paths = changes.map(([path]) => path);
  const anchorAt = paths.indexOf('layers.0.cyclePhase');
  const tempoAt = paths.indexOf('layers.0.cycleSpeed');
  assert.ok(anchorAt !== -1, `the anchor was never written: ${JSON.stringify(changes)}`);
  assert.ok(anchorAt < tempoAt, 'the anchor must be re-parked BEFORE the tempo changes');
  assert.equal(doc.layers[0].cyclePhase,
    rebasedCyclePhase(0, 20, 70, timeSec));
  assert.equal(cyclePaint(doc.layers[0], timeSec), colourBefore,
    'the colour jumped on a tempo change');
});
