// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { mountGallery, TILES } from '../../app/renderer/components/gallery.js';
import {
  CANVAS_WIDTH, CANVAS_HEIGHT, DEFAULT_SOLID_COLOR, DEFAULT_GRADIENT_STOPS,
  normalizeDocument, clamp
} from '../../src/engine/document.js';
import { createRenderer } from '../../src/engine/engine.js';
import '../../src/engine/index.js';

/**
 * The guard against a tile that lies.
 *
 * Each starting tile now shows what pressing it produces, and the only reason
 * to trust that is that the picture is made by the engine out of the very
 * document the press would make (see components/gallery.js). This file holds
 * that claim to the fire in both directions:
 *
 *  - what a tile paints IS the engine's default (read from
 *    src/engine/document.js, so changing a default moves both sides at once
 *    and the tile keeps up), and
 *  - what a tile paints is not a CONSTANT: handed a starting document with a
 *    different colour in it, the tile paints that colour instead. A
 *    hand-drawn swatch, or a CSS gradient written out a second time, passes
 *    the first half on the day it is written and fails this one immediately.
 *
 * There is no canvas in Node, so the drawing surface below is a stand-in that
 * writes down what was asked of it rather than pixels. That is the stronger
 * record for this purpose anyway: "fillStyle was set to #ff0066 and a
 * 320 x 200 rectangle was filled with it" is exactly the claim being made,
 * and it cannot be confused with a screenshot that happens to look right.
 */

/** A 2D context that records instead of painting. */
function recordingContext(calls) {
  return {
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    set fillStyle(value) { calls.push({ op: 'fillStyle', value }); },
    fillRect(x, y, width, height) { calls.push({ op: 'fillRect', x, y, width, height }); },
    save() {}, restore() {},
    createLinearGradient(x0, y0, x1, y1) {
      const stops = [];
      calls.push({ op: 'linear', x0, y0, x1, y1, stops });
      return { addColorStop: (at, color) => stops.push({ at, color }) };
    },
    createRadialGradient(x0, y0, r0, x1, y1, r1) {
      const stops = [];
      calls.push({ op: 'radial', x0, y0, r0, x1, y1, r1, stops });
      return { addColorStop: (at, color) => stops.push({ at, color }) };
    }
  };
}

function makeElement(tag) {
  const node = {
    tagName: tag,
    children: [],
    attributes: {},
    listeners: {},
    dataset: {},
    classList: { add() {}, remove() {}, toggle() {} },
    style: { properties: {}, setProperty(name, value) { this.properties[name] = value; } },
    id: '',
    className: '',
    textContent: '',
    calls: [],
    width: 0,
    height: 0,
    append(...kids) { node.children.push(...kids); },
    addEventListener(type, fn) { (node.listeners[type] ||= []).push(fn); },
    setAttribute(name, value) { node.attributes[name] = value; },
    getContext() { return recordingContext(node.calls); },
    click() { node.listeners.click?.forEach((fn) => fn()); }
  };
  return node;
}

function installFakeDom() {
  globalThis.document = {
    createElement: makeElement,
    createElementNS: (_namespace, tag) => makeElement(tag)
  };
  // The very bundle the window loads, in the shape the window sees it: the
  // renderer reaches for window.SignalForgeEngine and nothing else.
  globalThis.window = {
    SignalForgeEngine: {
      CANVAS_WIDTH, CANVAS_HEIGHT, normalizeDocument, createRenderer, clamp
    }
  };
}

/** Every element under `node`, depth first. */
function all(node, out = []) {
  out.push(node);
  for (const kid of node.children || []) all(kid, out);
  return out;
}

const find = (root, className) =>
  all(root).filter((node) => String(node.className).split(' ').includes(className));

/** Mount the strip and hand back one canvas's recorded drawing per tile. */
function mountWith(starterDocument) {
  installFakeDom();
  const container = makeElement('div');
  mountGallery(container, {
    t: (key) => key,
    onPicture: () => {},
    onStart: () => {},
    starterDocument
  });
  const drawings = {};
  for (const canvas of find(container, 'tile-canvas')) {
    drawings[canvas.id.replace('gallery-', '').replace('-preview', '')] = canvas;
  }
  return { container, drawings };
}

/** What main.js's own starterDocument hands over, in one place for this file. */
const STARTERS = {
  solid: { layers: [{ id: 'fill', type: 'solid', motions: [] }] },
  linear: { layers: [{ id: 'fill', type: 'gradient', shape: 'linear', motions: [] }] },
  radial: { layers: [{ id: 'fill', type: 'gradient', shape: 'radial', motions: [] }] }
};
const defaults = (kind) => STARTERS[kind] ?? null;

// --------------------------------------------------------- the three previews

test('every starting tile draws on a canvas of the engine\'s own size', () => {
  const { drawings } = mountWith(defaults);
  assert.deepEqual(Object.keys(drawings).sort(), ['linear', 'radial', 'solid']);
  for (const [kind, canvas] of Object.entries(drawings)) {
    assert.equal(canvas.width, CANVAS_WIDTH, `${kind} draws at the wrong width`);
    assert.equal(canvas.height, CANVAS_HEIGHT, `${kind} draws at the wrong height`);
  }
});

test('the solid tile paints the engine\'s default colour, whatever that is', () => {
  const { drawings } = mountWith(defaults);
  const fills = drawings.solid.calls.filter((call) => call.op === 'fillStyle').map((c) => c.value);
  // The renderer clears to black first, so the LAST fill is the layer's own.
  assert.equal(fills.at(-1), DEFAULT_SOLID_COLOR);
  const rect = drawings.solid.calls.filter((call) => call.op === 'fillRect').at(-1);
  assert.deepEqual(
    [rect.x, rect.y, rect.width, rect.height],
    [0, 0, CANVAS_WIDTH, CANVAS_HEIGHT],
    'the colour must cover the whole tile, as it covers the whole effect'
  );
});

test('the gradient tiles carry the engine\'s default colour stops', () => {
  const { drawings } = mountWith(defaults);
  const expected = DEFAULT_GRADIENT_STOPS.map((stop) => ({ at: stop.at / 100, color: stop.color }));
  for (const kind of ['linear', 'radial']) {
    const ramp = drawings[kind].calls.find((call) => call.op === 'linear' || call.op === 'radial');
    assert.ok(ramp, `the ${kind} tile never built a gradient`);
    assert.deepEqual(ramp.stops, expected, `the ${kind} tile's stops are not the engine's`);
  }
});

test('linear and radial are the two shapes the engine draws, at the canvas centre', () => {
  const { drawings } = mountWith(defaults);
  const linear = drawings.linear.calls.find((call) => call.op === 'linear');
  const radial = drawings.radial.calls.find((call) => call.op === 'radial');
  assert.ok(linear, 'the linear tile must use a linear ramp');
  assert.ok(radial, 'the radial tile must use a radial ramp');
  // The default angle is 0 — left to right — so the ramp is exactly
  // horizontal and spans the full canvas width.
  assert.equal(linear.y0, linear.y1);
  assert.equal(linear.x1 - linear.x0, CANVAS_WIDTH);
  assert.deepEqual([radial.x0, radial.y0, radial.r0], [CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, 0]);
});

// ------------------------------------------------------- and it is not a fake

test('a tile paints what the document says, not a colour of its own', () => {
  // The same tiles, handed a starting document that carries its own colours.
  // A preview drawn by hand — a swatch, a second CSS gradient — cannot follow
  // this, which is the whole point of the check: it is what turns "the tile
  // agrees with the default today" into "the tile cannot disagree".
  const other = (kind) => {
    if (kind === 'solid') return { layers: [{ id: 'fill', type: 'solid', color: '#123456' }] };
    return {
      layers: [{
        id: 'fill',
        type: 'gradient',
        shape: kind === 'radial' ? 'radial' : 'linear',
        stops: [{ at: 0, color: '#010203' }, { at: 100, color: '#0a0b0c' }]
      }]
    };
  };
  const { drawings } = mountWith(other);

  const fills = drawings.solid.calls.filter((call) => call.op === 'fillStyle').map((c) => c.value);
  assert.equal(fills.at(-1), '#123456');
  assert.notEqual(fills.at(-1), DEFAULT_SOLID_COLOR);

  for (const kind of ['linear', 'radial']) {
    const ramp = drawings[kind].calls.find((call) => call.op === 'linear' || call.op === 'radial');
    assert.deepEqual(ramp.stops, [{ at: 0, color: '#010203' }, { at: 1, color: '#0a0b0c' }]);
  }
});

// ------------------------------------------------------------- the fourth tile

test('the picture tile shows the empty stage, not a preview and not a blank', () => {
  const { container } = mountWith(defaults);
  const picture = all(container).find((node) => node.dataset.tile === 'picture');
  assert.ok(picture, 'the picture tile must be in the strip');
  assert.equal(find(picture, 'tile-canvas').length, 0, 'it has no output to preview yet');
  const blank = find(picture, 'tile-blank');
  assert.equal(blank.length, 1, 'it shows the frame the picture will land in');
  assert.ok(blank[0].children.length > 0, 'and the sign that frame carries');
  // The glyph is the stage's own, so the two states are visibly the same idea
  // rather than two different drawings of "no picture yet".
  assert.equal(TILES.find((tile) => tile.key === 'picture').glyph, 'drop');
});

test('every other tile is a preview and none of them is a glyph', () => {
  const { container } = mountWith(defaults);
  for (const tile of TILES) {
    if (!tile.starts) continue;
    assert.equal(tile.glyph, null, `${tile.key} must not carry a glyph any more`);
    const node = all(container).find((entry) => entry.dataset.tile === tile.key);
    assert.equal(find(node, 'tile-canvas').length, 1);
    assert.equal(find(node, 'tile-blank').length, 0);
  }
});

test('a preview is decoration beside its own name, not something to read out', () => {
  const { drawings } = mountWith(defaults);
  for (const canvas of Object.values(drawings)) {
    assert.equal(canvas.attributes['aria-hidden'], 'true');
  }
});

test('the tiles still work when nobody hands them a document to draw', () => {
  // The stand-in DOM of another test, or any caller with no engine: the strip
  // must still be a strip of four working buttons.
  installFakeDom();
  const container = makeElement('div');
  const started = [];
  mountGallery(container, { t: (key) => key, onPicture: () => {}, onStart: (k) => started.push(k) });
  const tiles = all(container).filter((node) => node.dataset.tile);
  assert.equal(tiles.length, 4);
  assert.equal(find(container, 'tile-canvas').length, 0);
  for (const tile of tiles) tile.click();
  assert.deepEqual(started, ['solid', 'linear', 'radial']);
});
