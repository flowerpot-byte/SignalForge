// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { mountGallery, TILES } from '../../app/renderer/components/gallery.js';
import {
  CANVAS_WIDTH, CANVAS_HEIGHT, DEFAULT_SOLID_COLOR, DEFAULT_GRADIENT_STOPS,
  SHAPE_FIGURES, DEFAULT_SHAPE_SIZE, DEFAULT_STAR_POINTS, DEFAULT_SHAPE_THICKNESS,
  normalizeDocument, clamp
} from '../../src/engine/document.js';
import { createRenderer } from '../../src/engine/engine.js';
import { STAR_INNER_RATIO } from '../../src/engine/layers/shape.js';
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

/**
 * A 2D context that records instead of painting.
 *
 * It answers every call the layer renderers make, including the ones the
 * conic sweep needs — a wedge is moveTo/arc/fill and the sweep is then painted
 * through translate/rotate/drawImage. Deliberately complete rather than
 * forgiving: a renderer reaching for a canvas call that is not here throws,
 * which is the right answer, because a silently swallowed call would let a
 * tile "draw" something nobody ever asked the canvas for.
 */
function recordingContext(calls) {
  return {
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    imageSmoothingEnabled: false,
    imageSmoothingQuality: 'low',
    set fillStyle(value) { calls.push({ op: 'fillStyle', value }); },
    fillRect(x, y, width, height) { calls.push({ op: 'fillRect', x, y, width, height }); },
    clearRect(x, y, width, height) { calls.push({ op: 'clearRect', x, y, width, height }); },
    save() { calls.push({ op: 'save' }); },
    restore() { calls.push({ op: 'restore' }); },
    translate(x, y) { calls.push({ op: 'translate', x, y }); },
    rotate(radians) { calls.push({ op: 'rotate', radians }); },
    beginPath() { calls.push({ op: 'beginPath' }); },
    closePath() { calls.push({ op: 'closePath' }); },
    moveTo(x, y) { calls.push({ op: 'moveTo', x, y }); },
    // The two the shape layer needs on top of the ones the sweep already used.
    // `lineTo` walks a star's points; `bezierCurveTo` draws a heart, and the
    // engine uses it rather than approximating the curve out of arcs because
    // docs/effekt-inventur.md, section A15, records exactly one occurrence of it
    // in 31 host effects — which is the only evidence there is that the host's
    // canvas has it, and it is evidence.
    lineTo(x, y) { calls.push({ op: 'lineTo', x, y }); },
    bezierCurveTo(...points) { calls.push({ op: 'bezierCurveTo', points }); },
    // `arc` is recorded WITH its anticlockwise flag, which the sweep never
    // passed and the ring depends on: a ring is an outer circle and an inner
    // one wound the other way, and a fake that dropped the flag would record
    // two identical circles and call a filled disc a ring.
    arc(x, y, r, from, to, anti) { calls.push({ op: 'arc', x, y, r, from, to, anti }); },
    fill() { calls.push({ op: 'fill' }); },
    drawImage(source, ...rest) { calls.push({ op: 'drawImage', source, rest }); },
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
const SHAPE_STARTERS = ['linear', 'radial', 'conic', 'stripes', 'waves'];
const FIGURE_STARTERS = [...SHAPE_FIGURES];
const STARTERS = {
  solid: { layers: [{ id: 'fill', type: 'solid', motions: [] }] },
  ...Object.fromEntries(SHAPE_STARTERS.map((shape) => [
    shape, { layers: [{ id: 'fill', type: 'gradient', shape, motions: [] }] }
  ])),
  ...Object.fromEntries(FIGURE_STARTERS.map((figure) => [
    figure, { layers: [{ id: 'fill', type: 'shape', figure, motions: [] }] }
  ]))
};
const defaults = (kind) => STARTERS[kind] ?? null;

// --------------------------------------------------------- the three previews

test('every starting tile draws on a canvas of the engine\'s own size', () => {
  const { drawings } = mountWith(defaults);
  assert.deepEqual(Object.keys(drawings).sort(),
    [...SHAPE_STARTERS, ...FIGURE_STARTERS, 'solid'].sort());
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

test('linear and radial run from the canvas centre, the way the engine lays them out', () => {
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
    if (SHAPE_FIGURES.includes(kind)) {
      return { layers: [{ id: 'fill', type: 'shape', figure: kind, color: '#654321' }] };
    }
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

  // And the figures the same way round: the fill they set is the one the
  // document carries, never a colour this file or that one chose.
  for (const kind of SHAPE_FIGURES) {
    const set = drawings[kind].calls.filter((call) => call.op === 'fillStyle').map((c) => c.value);
    assert.equal(set.at(-1), '#654321', `the ${kind} tile paints a colour of its own`);
    assert.notEqual(set.at(-1), DEFAULT_SOLID_COLOR);
  }
});

// ------------------------------------------------ the three shapes that repeat

test('the stripes tile draws hard-edged bands, not a ramp', () => {
  const { drawings } = mountWith(defaults);
  const ramp = drawings.stripes.calls.find((call) => call.op === 'linear');
  assert.ok(ramp, 'stripes run along a line, so they are built on a linear ramp');
  // A hard edge is two stops at the same offset. With the engine's default two
  // colours and its default band count, every boundary but the two ends is one.
  const doubled = ramp.stops.filter((stop, index) =>
    index > 0 && stop.at === ramp.stops[index - 1].at);
  assert.ok(doubled.length > 0, 'a stripe boundary must be two stops at one offset');
  // Every stop carries one of the layer's own colours — never a blend, which
  // is exactly what tells a band from a ramp.
  const colours = new Set(ramp.stops.map((stop) => stop.color));
  assert.deepEqual([...colours].sort(), DEFAULT_GRADIENT_STOPS.map((s) => s.color).sort());
});

test('the waves tile draws a smooth repeat with no doubled stop anywhere', () => {
  const { drawings } = mountWith(defaults);
  const ramp = drawings.waves.calls.find((call) => call.op === 'linear');
  assert.ok(ramp, 'waves run along a line too');
  for (let index = 1; index < ramp.stops.length; index += 1) {
    assert.notEqual(ramp.stops[index].at, ramp.stops[index - 1].at,
      'a wave has no hard edge in it, so no two stops may share an offset');
  }
  // It swings out and back: the first and the last stop of the whole ramp are
  // the same colour, which is what makes the repeat seamless.
  assert.equal(ramp.stops[0].color, ramp.stops.at(-1).color);
  // And it passes through colours neither stop names — the blend between them.
  const named = new Set(DEFAULT_GRADIENT_STOPS.map((stop) => stop.color));
  assert.ok(ramp.stops.some((stop) => !named.has(stop.color)),
    'a wave must pass through the middle of the ramp, not step between its ends');
});

test('the conic tile sweeps wedges into a picture and paints it turned', () => {
  const { drawings } = mountWith(defaults);
  const calls = drawings.conic.calls;
  // The sweep itself is not drawn on the tile's canvas — it is drawn once into
  // a canvas of its own and then painted here, which is what lets it be turned
  // every frame for the price of one drawImage.
  const painted = calls.filter((call) => call.op === 'drawImage');
  assert.equal(painted.length, 1, 'the wheel is painted exactly once');
  assert.ok(calls.some((call) => call.op === 'rotate'), 'and it is painted through a rotation');
  // The wedges are on the OTHER canvas. It is a real canvas element made by
  // this very DOM, so its own recording is reachable through the drawImage.
  const wedges = painted[0].source.calls.filter((call) => call.op === 'arc');
  assert.ok(wedges.length >= 180,
    `a sweep needs enough wedges not to band, got ${wedges.length}`);
  // Deliberately NOT createConicGradient: the host's real browser version is
  // unknown (see src/engine/layers/gradient.js), so the sweep must be built
  // out of calls canvas has always had.
  assert.equal(typeof recordingContext([]).createConicGradient, 'undefined',
    'this fake offers no createConicGradient, so the engine cannot be using one');
});

// ------------------------------------------------------- the four figure tiles

/**
 * Each figure tile is checked against what the FIGURE is, not against "it drew
 * something". A tile whose canvas received one arc is a tile that drew a
 * circle, whatever the label under it says — and four tiles that all drew a
 * circle is exactly the failure a single "Form" tile with a dropdown was
 * rejected for (see the note in app/renderer/components/gallery.js).
 */

test('the circle tile draws one arc, at the size and place the engine defaults to', () => {
  const { drawings } = mountWith(defaults);
  const arcs = drawings.circle.calls.filter((call) => call.op === 'arc');
  assert.equal(arcs.length, 1, 'a circle is one arc and nothing else');
  // The engine's own size contract: `size` is the diameter of the circle the
  // figure sits in, as a percent of the canvas height. Read from the default
  // rather than written out, so retuning it moves the tile with it.
  assert.equal(arcs[0].r, (DEFAULT_SHAPE_SIZE / 100) * CANVAS_HEIGHT / 2);
  // Drawn about the origin and moved there, which is what lets a spin turn a
  // figure about its own middle.
  assert.deepEqual([arcs[0].x, arcs[0].y], [0, 0]);
  const move = drawings.circle.calls.find((call) => call.op === 'translate');
  assert.deepEqual([move.x, move.y], [CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2]);
  // And it never fills the canvas — the whole reason this layer type exists.
  const covers = drawings.circle.calls.filter((call) =>
    call.op === 'fillRect' && call.width === CANVAS_WIDTH && call.height === CANVAS_HEIGHT);
  assert.equal(covers.length, 1, 'only the renderer\'s own clear may cover the canvas');
});

test('the ring tile draws two arcs wound opposite ways, which is what makes the hole', () => {
  const { drawings } = mountWith(defaults);
  const arcs = drawings.ring.calls.filter((call) => call.op === 'arc');
  assert.equal(arcs.length, 2, 'a ring is an outer circle and an inner one');
  const outer = (DEFAULT_SHAPE_SIZE / 100) * CANVAS_HEIGHT / 2;
  assert.equal(arcs[0].r, outer);
  assert.equal(arcs[1].r, outer * (1 - DEFAULT_SHAPE_THICKNESS / 100));
  // THE FLAG IS THE FEATURE. Two circles wound the same way under the non-zero
  // rule are a filled disc; wound opposite ways they cancel where they overlap,
  // and the middle comes out transparent. Nothing else in the recorded calls
  // distinguishes a ring from a disc.
  assert.equal(arcs[0].anti, false);
  assert.equal(arcs[1].anti, true);
  // Deliberately not a fill rule and deliberately not a stroke: no stroke call
  // is made at all, so a ring cannot be sitting half a wall outside its radius.
  assert.equal(drawings.ring.calls.filter((call) => call.op === 'stroke').length, 0);
});

test('the star tile walks two vertices per point, in and out between two radii', () => {
  const { drawings } = mountWith(defaults);
  const calls = drawings.star.calls;
  const moves = calls.filter((call) => call.op === 'moveTo');
  const lines = calls.filter((call) => call.op === 'lineTo');
  // One moveTo to start, then a lineTo for every remaining vertex: a star of
  // n points has 2n vertices, outer and inner alternating.
  assert.equal(moves.length + lines.length, DEFAULT_STAR_POINTS * 2);
  assert.equal(calls.filter((call) => call.op === 'arc').length, 0, 'a star has no arcs in it');

  const outer = (DEFAULT_SHAPE_SIZE / 100) * CANVAS_HEIGHT / 2;
  const radii = [...moves, ...lines].map((v) => Math.hypot(v.x, v.y)).sort((a, b) => a - b);
  // Exactly two distances from the middle, and the inner one is half the outer
  // — `Vibe`'s own ratio, which is what makes a five-pointed star read as one.
  assert.ok(Math.abs(radii.at(-1) - outer) < 1e-9, 'the points do not reach the outer radius');
  assert.ok(Math.abs(radii[0] - outer * STAR_INNER_RATIO) < 1e-9,
    'the notches do not dive to the inner radius');
  // The first vertex is straight up, so a star does not open lying on its side.
  assert.ok(Math.abs(moves[0].x) < 1e-9 && moves[0].y < 0,
    'the first point of a star must be at the top');
});

test('the heart tile draws four bezier curves and nothing else', () => {
  const { drawings } = mountWith(defaults);
  const curves = drawings.heart.calls.filter((call) => call.op === 'bezierCurveTo');
  assert.equal(curves.length, 4, 'a heart is two lobes and two bottom curves');
  assert.equal(drawings.heart.calls.filter((call) => call.op === 'arc').length, 0);
  // Every x that appears has its own negative somewhere in the set, which is
  // the whole of what "symmetric" means for this path. Checked here as well as
  // in the engine's own tests because this is the tile somebody LOOKS at.
  const xs = curves.flatMap((call) => [call.points[0], call.points[2], call.points[4]]);
  for (const x of xs) {
    assert.ok(xs.some((other) => Math.abs(other + x) < 1e-9),
      `the heart has a control point at x = ${x} with no mirror image`);
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
  // must still be a strip of working buttons, one per tile.
  installFakeDom();
  const container = makeElement('div');
  const started = [];
  mountGallery(container, { t: (key) => key, onPicture: () => {}, onStart: (k) => started.push(k) });
  const tiles = all(container).filter((node) => node.dataset.tile);
  assert.equal(tiles.length, TILES.length);
  assert.equal(find(container, 'tile-canvas').length, 0);
  for (const tile of tiles) tile.click();
  assert.deepEqual(started, TILES.filter((tile) => tile.starts).map((tile) => tile.starts));
});
