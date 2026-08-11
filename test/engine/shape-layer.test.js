// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { runJobs } from '../harness/render.js';
import { pixelAt, isColour, blackShare, maxDifference } from '../harness/pixels.js';
import {
  CANVAS_WIDTH, CANVAS_HEIGHT, SHAPE_FIGURES, DEFAULT_SHAPE_SIZE, DEFAULT_STAR_POINTS,
  DEFAULT_SHAPE_THICKNESS, normalizeDocument
} from '../../src/engine/document.js';
import {
  STAR_INNER_RATIO, STAR_FIRST_POINT, HEART_LOBE_TOP, HEART_INK_HEIGHT
} from '../../src/engine/layers/shape.js';

/**
 * The four figures, measured on the pixels they produce, against the places
 * the arithmetic says the ink has to be.
 *
 * Every assertion below names a coordinate COMPUTED from the engine's own
 * constants — a star's outer point from STAR_FIRST_POINT and the point count, a
 * ring's hole from its thickness, a heart's centre from HEART_LOBE_TOP — and
 * then asks the frame what is there. A test that only said "the frame is not
 * blank" would pass on a blob, and a test that hardcoded the coordinates would
 * pass on a renderer that had quietly stopped reading the field.
 *
 * The pairing is what makes each one falsifiable: at nearly every coordinate
 * this file checks, it checks the colour is THERE and that a companion
 * coordinate a few pixels away is still black. One without the other is
 * satisfied by a figure that is too big, or by one that is not drawn at all.
 */

const INK = '#ff0066';
const INK_RGB = [255, 0, 102];
const UNDER = '#00b3ff';
const UNDER_RGB = [0, 179, 255];
const BLACK = [0, 0, 0];

/** One shape layer, alone, with everything else at its default. */
function shapeDoc(layer, extra = {}) {
  return {
    name: 'Figures',
    layers: [{ id: 'fig', type: 'shape', color: INK, motions: [], ...layer }],
    controls: [],
    ...extra
  };
}

/** The outer radius `size` names, in canvas pixels — the engine's own contract. */
const radiusFor = (size) => (size / 100) * CANVAS_HEIGHT / 2;

/** Where a shape at these percents sits, in canvas pixels. */
const centreFor = (x = 50, y = 50) => ({
  x: (x / 100) * CANVAS_WIDTH, y: (y / 100) * CANVAS_HEIGHT
});

/** A point at `radius` along `angle` from `centre`, rounded to a pixel. */
function along(centre, angle, radius) {
  return {
    x: Math.round(centre.x + Math.cos(angle) * radius),
    y: Math.round(centre.y + Math.sin(angle) * radius)
  };
}

const at = (frame, point) => pixelAt(frame.pixels, frame.width, point.x, point.y);

// ---------------------------------------------------------------- the circle

test('a circle fills to the radius its size names and not one step past it', async () => {
  const size = 50;
  const r = radiusFor(size);
  const centre = centreFor();
  const [frame] = await runJobs([
    { name: 'circle', kind: 'engine', doc: shapeDoc({ figure: 'circle', size }), timeSec: 0 }
  ]);

  // Sampled around the whole circle rather than at one compass point: a figure
  // drawn as an ellipse, or one whose radius came out of the canvas WIDTH
  // instead of its height, passes a single sample and fails this.
  for (let step = 0; step < 8; step += 1) {
    const angle = (step / 8) * Math.PI * 2;
    const inside = at(frame, along(centre, angle, r * 0.85));
    const outside = at(frame, along(centre, angle, r * 1.15));
    assert.ok(isColour(inside, INK_RGB),
      `at ${Math.round((angle * 180) / Math.PI)} degrees the inside of the circle is not the `
        + `layer's colour: ${JSON.stringify(inside)}`);
    assert.ok(isColour(outside, BLACK),
      `at ${Math.round((angle * 180) / Math.PI)} degrees the circle reaches past its own radius: `
        + `${JSON.stringify(outside)}`);
  }

  // And the corners are untouched, which is the whole difference between this
  // layer type and every other one this engine has.
  for (const corner of [{ x: 0, y: 0 }, { x: CANVAS_WIDTH - 1, y: 0 },
    { x: 0, y: CANVAS_HEIGHT - 1 }, { x: CANVAS_WIDTH - 1, y: CANVAS_HEIGHT - 1 }]) {
    assert.ok(isColour(at(frame, corner), BLACK, 0),
      'a shape layer must never cover the whole canvas');
  }
});

test('a shape sits where its position says, in percents of each edge', async () => {
  const size = 30;
  const r = radiusFor(size);
  const centre = centreFor(25, 75);
  const [frame] = await runJobs([{
    name: 'placed',
    kind: 'engine',
    doc: shapeDoc({ figure: 'circle', size, position: { x: 25, y: 75 } }),
    timeSec: 0
  }]);

  assert.ok(isColour(at(frame, { x: Math.round(centre.x), y: Math.round(centre.y) }), INK_RGB),
    'nothing is drawn where the position says the middle is');
  // The middle of the canvas is where it would be if the position were ignored.
  const middle = centreFor();
  assert.ok(isColour(at(frame, { x: middle.x, y: middle.y }), BLACK, 0),
    'the figure is in the middle of the canvas, i.e. the position was ignored');
  assert.ok(isColour(at(frame, along(centre, 0, r * 1.2)), BLACK),
    'the figure is wider than its size allows');
});

// ------------------------------------------------------------------ the ring

test('a ring has a hole in it, and the hole is genuinely transparent', async () => {
  const size = 60;
  const r = radiusFor(size);
  const centre = centreFor();
  const hole = 1 - DEFAULT_SHAPE_THICKNESS / 100;

  const [alone, over] = await runJobs([
    { name: 'alone', kind: 'engine', doc: shapeDoc({ figure: 'ring', size }), timeSec: 0 },
    {
      name: 'over',
      kind: 'engine',
      timeSec: 0,
      // The same ring over a colour that covers the canvas. If the hole were
      // merely BLACK rather than untouched — a filled disc in the clear
      // colour, say — this is the frame that would show it.
      doc: {
        name: 'Ring over a colour',
        layers: [
          { id: 'under', type: 'solid', color: UNDER, motions: [] },
          { id: 'fig', type: 'shape', figure: 'ring', size, color: INK, motions: [] }
        ],
        controls: []
      }
    }
  ]);

  // The wall: between the inner radius and the outer one.
  const wall = r * (1 + hole) / 2;
  for (let step = 0; step < 8; step += 1) {
    const angle = (step / 8) * Math.PI * 2;
    assert.ok(isColour(at(alone, along(centre, angle, wall)), INK_RGB),
      `the ring's wall is missing at ${Math.round((angle * 180) / Math.PI)} degrees`);
    assert.ok(isColour(at(alone, along(centre, angle, r * 1.15)), BLACK),
      'the ring reaches past its own outer radius');
  }

  // The hole, well inside the inner radius so anti-aliasing cannot reach it.
  const inHole = { x: Math.round(centre.x), y: Math.round(centre.y) };
  assert.ok(isColour(at(alone, inHole), BLACK, 0),
    `the middle of a ring on its own must be untouched, got ${JSON.stringify(at(alone, inHole))}`);
  assert.ok(isColour(at(over, inHole), UNDER_RGB),
    'the layer underneath must show through the hole — the hole is not transparent, it is filled');
  // ...and the wall really is over that layer, so the two samples above are not
  // both just "the layer underneath".
  assert.ok(isColour(at(over, along(centre, 0, wall)), INK_RGB),
    'the ring is not drawn over the layer beneath it at all');
});

test('a ring at full thickness is a filled disc, with no hole left', async () => {
  const size = 60;
  const centre = centreFor();
  const [frame] = await runJobs([{
    name: 'thick',
    kind: 'engine',
    doc: shapeDoc({ figure: 'ring', size, thickness: 100 }),
    timeSec: 0
  }]);
  assert.ok(isColour(at(frame, { x: centre.x, y: centre.y }), INK_RGB),
    'at thickness 100 the wall reaches the middle, so there is nothing left to see through');
});

// ------------------------------------------------------------------ the star

test('every one of a star\'s points lands exactly where the arithmetic says', async () => {
  const size = 70;
  const r = radiusFor(size);
  const centre = centreFor();
  const points = DEFAULT_STAR_POINTS;
  const [frame] = await runJobs([
    { name: 'star', kind: 'engine', doc: shapeDoc({ figure: 'star', size }), timeSec: 0 }
  ]);

  for (let index = 0; index < points; index += 1) {
    // The k-th outer point: the first one straight up, then one every full
    // turn divided by the point count. Two half-steps of Math.PI/points make
    // one whole step, which is how the engine walks it.
    const angle = STAR_FIRST_POINT + (index * 2 * Math.PI) / points;

    // Just inside the tip — the ink reaches almost the whole way out. 0.92
    // rather than 0.99 because a tip is a sharp corner and the last few pixels
    // of it are anti-aliased down to a sliver.
    assert.ok(isColour(at(frame, along(centre, angle, r * 0.92)), INK_RGB),
      `point ${index + 1} of the star does not reach out to its own radius`);
    // Just outside it — nothing at all.
    assert.ok(isColour(at(frame, along(centre, angle, r * 1.12)), BLACK),
      `point ${index + 1} of the star reaches past its own radius`);

    // And the notch between this point and the next: the outline dives in to
    // STAR_INNER_RATIO there, so a place beyond that ratio but well inside the
    // outer radius has to be empty. This is the assertion a filled circle
    // would fail, which is what makes the ones above about a STAR.
    const notch = angle + Math.PI / points;
    const beyondNotch = r * (STAR_INNER_RATIO + (1 - STAR_INNER_RATIO) * 0.55);
    assert.ok(isColour(at(frame, along(centre, notch, beyondNotch)), BLACK),
      `the notch after point ${index + 1} is filled in — this is not a star`);
    // ...while inside the inner radius it is solid, so the star has a body.
    assert.ok(isColour(at(frame, along(centre, notch, r * STAR_INNER_RATIO * 0.8)), INK_RGB),
      `the body of the star is missing at the notch after point ${index + 1}`);
  }
});

test('the point count is read, not assumed — a seven-pointed star has seven notches',
  async () => {
    const size = 70;
    const r = radiusFor(size);
    const centre = centreFor();
    const points = 7;
    const [frame] = await runJobs([{
      name: 'seven', kind: 'engine', doc: shapeDoc({ figure: 'star', size, points }), timeSec: 0
    }]);

    for (let index = 0; index < points; index += 1) {
      const angle = STAR_FIRST_POINT + (index * 2 * Math.PI) / points;
      assert.ok(isColour(at(frame, along(centre, angle, r * 0.9)), INK_RGB),
        `point ${index + 1} of seven is missing`);
      const notch = angle + Math.PI / points;
      const beyondNotch = r * (STAR_INNER_RATIO + (1 - STAR_INNER_RATIO) * 0.6);
      assert.ok(isColour(at(frame, along(centre, notch, beyondNotch)), BLACK),
        `the notch after point ${index + 1} of seven is filled in`);
    }
  });

// ----------------------------------------------------------------- the heart

/**
 * A drawing surface that records the coordinates instead of painting them.
 *
 * The heart's symmetry is a claim about the PATH, and the path is where it can
 * be checked exactly: every bezier control point has to have a mirror image,
 * to the last bit of the double. The rendered frame cannot answer that
 * question exactly and the test below this one says why.
 */
function recordingContext() {
  const path = [];
  return {
    path,
    globalAlpha: 1,
    fillStyle: '',
    save() {}, restore() {},
    translate(x, y) { path.push(['translate', x, y]); },
    rotate(radians) { path.push(['rotate', radians]); },
    beginPath() { path.push(['beginPath']); },
    closePath() { path.push(['closePath']); },
    moveTo(x, y) { path.push(['moveTo', x, y]); },
    lineTo(x, y) { path.push(['lineTo', x, y]); },
    arc(x, y, r, from, to, anti) { path.push(['arc', x, y, r, from, to, anti]); },
    bezierCurveTo(...args) { path.push(['bezierCurveTo', ...args]); },
    fill() { path.push(['fill']); }
  };
}

/** Every (x, y) pair the path was built out of, in order. */
function pointsOfPath(path) {
  const out = [];
  for (const [op, ...args] of path) {
    if (op === 'moveTo' || op === 'lineTo') out.push([args[0], args[1]]);
    if (op === 'bezierCurveTo') {
      for (let i = 0; i < 6; i += 2) out.push([args[i], args[i + 1]]);
    }
  }
  return out;
}

test('the heart\'s path is mirror-symmetric to the last bit, not merely nearly', async () => {
  const { render } = await import('../../src/engine/layers/shape.js');
  const { doc } = normalizeDocument(shapeDoc({ figure: 'heart', size: 80 }));
  const ctx = recordingContext();
  render(ctx, doc.layers[0], null, 0, { starKey: null, starUnit: null });

  // The path is built in LOCAL coordinates about (0, 0) — the translate to the
  // figure's position is a separate call — so the mirror of (x, y) is exactly
  // (-x, y), with no centre to subtract and no rounding to argue about.
  const points = pointsOfPath(ctx.path);
  assert.ok(points.length >= 13, `a heart is four curves and a start, got ${points.length} points`);
  const mirrored = points.map(([x, y]) => [-x, y]);
  // Every point has a partner, and the multiset of partners is the same set.
  const key = (p) => `${p[0]}|${p[1]}`;
  assert.deepEqual(points.map(key).sort(), mirrored.map(key).sort(),
    'the heart has a control point with no mirror image');

  // And the path is laid down about the origin, then moved — which is what
  // makes the spin turn it about its own middle.
  assert.deepEqual(ctx.path[0], ['translate', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2]);
});

/**
 * How far the ink in each row sits from a vertical axis, in canvas pixels.
 *
 * The centre of mass rather than a mirror-pixel comparison, and the difference
 * matters: a mirror comparison answers "did these two pixels come out the
 * same", which on an anti-aliased edge is a question about the rasteriser. The
 * centre of mass answers "is the ink in this row balanced about the axis",
 * which is a question about the FIGURE — a lopsided lobe, a control point with
 * the wrong sign, a heart drawn from the wrong half — and a fault of that kind
 * moves it by whole pixels, not by fractions.
 */
function rowBalance(frame, axis, floor = 500) {
  const offsets = [];
  for (let y = 0; y < frame.height; y += 1) {
    let mass = 0;
    let moment = 0;
    for (let x = 0; x < frame.width; x += 1) {
      const value = pixelAt(frame.pixels, frame.width, x, y).r;
      if (value === 0) continue;
      mass += value;
      moment += value * (x + 0.5);
    }
    if (mass >= floor) offsets.push({ y, off: moment / mass - axis });
  }
  return offsets;
}

test('a rendered heart is balanced about its own axis, to the rasteriser\'s floor', async () => {
  const size = 80;
  const centre = centreFor();
  // A circle in the same run is the CONTROL, and it is what makes the bound
  // below a measurement rather than a number somebody liked: it is the figure
  // whose balance nothing but the rasteriser can disturb, drawn by the same
  // browser into the same frame size at the same moment.
  const [heart, circle] = await runJobs([
    { name: 'heart', kind: 'engine', doc: shapeDoc({ figure: 'heart', size }), timeSec: 0 },
    { name: 'circle', kind: 'engine', doc: shapeDoc({ figure: 'circle', size }), timeSec: 0 }
  ]);

  const heartRows = rowBalance(heart, centre.x);
  const circleRows = rowBalance(circle, centre.x);
  assert.ok(heartRows.length > 100, 'nothing was drawn, so balance proves nothing');
  assert.ok(circleRows.length > 100, 'the control figure is missing');

  const worst = (rows) => rows.reduce((most, row) => Math.max(most, Math.abs(row.off)), 0);
  const worstCircle = worst(circleRows);
  const worstHeart = worst(heartRows);

  // The circle establishes the floor: whatever it comes out at is what an
  // exactly symmetric figure costs on this rasteriser.
  assert.ok(worstCircle < 0.1,
    `even a circle is ${worstCircle.toFixed(3)} px out of balance — the measurement is unusable`);

  // WHERE THE HEART'S NUMBER COMES FROM. Measured at three sizes (40, 80, 150
  // percent): a worst row imbalance of 0.27 canvas pixels, growing towards the
  // bottom tip where the figure narrows to under two pixels. It is the canvas
  // flattening a bezier — see the long note in src/engine/layers/shape.js. 0.5
  // is that measurement with room to move on another machine, and it is still
  // an order of magnitude under anything a wrong control point could do: the
  // narrowest thing that could go wrong here (one lobe half a lobe-width out)
  // moves this by 20 pixels.
  assert.ok(worstHeart < 0.5,
    `the heart is ${worstHeart.toFixed(3)} px out of balance, against ${worstCircle.toFixed(3)} `
      + 'for a circle in the same frame — that is a lopsided figure, not a rasteriser');

  // And it is not merely narrow: the ink reaches both sides of the axis in
  // every row it is in, which a half-heart would fail outright.
  for (const row of heartRows) {
    assert.ok(Math.abs(row.off) < 0.5, `row ${row.y} is ${row.off.toFixed(3)} px out of balance`);
  }
  assert.ok(blackShare(heart.pixels) < 0.95, 'nothing was drawn, so balance proves nothing');
});

/** The smallest box holding every pixel brighter than `floor`. */
function inkBounds(frame, floor = 8) {
  let top = Infinity;
  let bottom = -Infinity;
  let left = Infinity;
  let right = -Infinity;
  for (let y = 0; y < frame.height; y += 1) {
    for (let x = 0; x < frame.width; x += 1) {
      const p = pixelAt(frame.pixels, frame.width, x, y);
      if (Math.max(p.r, p.g, p.b) <= floor) continue;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
      if (x < left) left = x;
      if (x > right) right = x;
    }
  }
  return { top, bottom, left, right };
}

test('a heart is centred on its own ink, not on its bounding box', async () => {
  const size = 80;
  const r = radiusFor(size);
  const centre = centreFor();
  const s = 2 * r;
  const [frame] = await runJobs([
    { name: 'heart', kind: 'engine', doc: shapeDoc({ figure: 'heart', size }), timeSec: 0 }
  ]);

  const bounds = inkBounds(frame);
  const half = (HEART_INK_HEIGHT * s) / 2;

  // WHAT IS BEING CAUGHT. `Vibe`'s heart is drawn inside a box of side s whose
  // top HEART_LOBE_TOP * s carries no ink at all, so centring the BOX hangs the
  // figure HEART_LOBE_TOP / 2 * s below where it claims to be — 6 canvas pixels
  // at this size, which is four times the tolerance below. That is exactly the
  // kind of error nobody sees and nobody can find afterwards, which is why it
  // is measured rather than eyeballed.
  assert.ok(Math.abs(bounds.top - (centre.y - half)) <= 2,
    `the top of the ink is at row ${bounds.top}, the contract says ${centre.y - half}`);
  // The bottom is a CUSP: both bottom curves arrive at the tip travelling
  // straight down, so the figure is a fraction of a pixel wide for the last
  // couple of rows and the rasteriser cannot put ink in them. Hence 4 rather
  // than 2 here, and hence a one-sided allowance would be wrong — it may fall
  // short, it may not overshoot.
  assert.ok(bounds.bottom <= centre.y + half,
    `the heart hangs past its own ink height: ${bounds.bottom} against ${centre.y + half}`);
  assert.ok(centre.y + half - bounds.bottom <= 4,
    `the heart stops well short of its own tip: ${bounds.bottom} against ${centre.y + half}`);

  // And it is exactly as wide as its size promises — the other half of the
  // contract, and the one with no cusp in it: the widest point of each lobe is
  // a true extremum, so the rasteriser lands on it.
  assert.ok(Math.abs(bounds.left - (centre.x - s / 2)) <= 2,
    `the heart's left edge is at ${bounds.left}, the contract says ${centre.x - s / 2}`);
  assert.ok(Math.abs(bounds.right - (centre.x + s / 2 - 1)) <= 2,
    `the heart's right edge is at ${bounds.right}, the contract says ${centre.x + s / 2 - 1}`);
});

// -------------------------------------------------------------- the recovery

test('an unknown figure draws the first one rather than throwing or drawing nothing', async () => {
  const size = 50;
  const centre = centreFor();
  const [odd, circle] = await runJobs([
    { name: 'odd', kind: 'engine', doc: shapeDoc({ figure: 'dodecahedron', size }), timeSec: 0 },
    { name: 'circle', kind: 'engine', doc: shapeDoc({ figure: 'circle', size }), timeSec: 0 }
  ]);
  assert.equal(maxDifference(odd.pixels, circle.pixels), 0,
    'an unknown figure must fall back to the first one, drawn exactly as that one is');
  assert.ok(isColour(at(odd, { x: centre.x, y: centre.y }), INK_RGB));
});

test('normalizeDocument clamps every field of a shape layer, and never throws', () => {
  const { doc, problems } = normalizeDocument({
    layers: [{
      id: 'fig', type: 'shape', figure: 'pentagram', color: 'not a colour',
      size: 9000, thickness: -5, points: 99, position: { x: -40, y: 900 }
    }]
  });
  const layer = doc.layers[0];
  assert.equal(layer.figure, SHAPE_FIGURES[0]);
  assert.equal(layer.size, 200);
  assert.equal(layer.thickness, 1);
  assert.equal(layer.points, 12);
  assert.deepEqual(layer.position, { x: 0, y: 100 });
  // An unusable colour becomes the document's own default rather than nothing.
  assert.match(layer.color, /^#[0-9a-f]{6}$/);
  assert.ok(problems.some((p) => p.includes('unknown figure')),
    'the correction must be reported, not made silently');
});

test('a shape layer that says nothing but its type gets a whole figure', () => {
  const { doc } = normalizeDocument({ layers: [{ id: 'fig', type: 'shape' }] });
  const layer = doc.layers[0];
  assert.equal(layer.figure, SHAPE_FIGURES[0]);
  assert.equal(layer.size, DEFAULT_SHAPE_SIZE);
  assert.equal(layer.points, DEFAULT_STAR_POINTS);
  assert.equal(layer.thickness, DEFAULT_SHAPE_THICKNESS);
  assert.deepEqual(layer.position, { x: 50, y: 50 });
  assert.deepEqual(layer.motions, []);
});

// -------------------------------------------------------------- the motions

test('spin turns a star and provably cannot turn a circle', async () => {
  const size = 60;
  const spin = [{ kind: 'spin', speed: 80, amount: 100 }];
  const [starStill, starTurned, circleStill, circleTurned] = await runJobs([
    { name: 'star-0', kind: 'engine', doc: shapeDoc({ figure: 'star', size, motions: spin }), timeSec: 0 },
    { name: 'star-t', kind: 'engine', doc: shapeDoc({ figure: 'star', size, motions: spin }), timeSec: 0.7 },
    { name: 'circ-0', kind: 'engine', doc: shapeDoc({ figure: 'circle', size, motions: spin }), timeSec: 0 },
    { name: 'circ-t', kind: 'engine', doc: shapeDoc({ figure: 'circle', size, motions: spin }), timeSec: 0.7 }
  ]);
  assert.ok(maxDifference(starStill.pixels, starTurned.pixels) > 0,
    'a spinning star must actually turn');
  // The claim motionKindsFor makes, held to the pixels: a circle is symmetric
  // about the pivot, so the turn is invisible — which is WHY spin is not
  // offered on it, and why performing it anyway is harmless.
  assert.equal(maxDifference(circleStill.pixels, circleTurned.pixels), 0,
    'a spinning circle changed a pixel, so refusing to offer the motion is now wrong');
});

test('spin turns the figure about its own middle, not about the canvas\'s', async () => {
  // An off-centre heart. About its own middle it turns in place; about the
  // canvas centre it would orbit, and the two are told apart by whether the
  // figure is still anywhere near where it started.
  const size = 40;
  const spin = [{ kind: 'spin', speed: 100, amount: 50 }];
  const layer = { figure: 'heart', size, position: { x: 20, y: 30 }, motions: spin };
  const centre = centreFor(20, 30);
  const [turned] = await runJobs([
    { name: 'heart-t', kind: 'engine', doc: shapeDoc(layer), timeSec: 0.9 }
  ]);
  assert.ok(isColour(at(turned, { x: Math.round(centre.x), y: Math.round(centre.y) }), INK_RGB),
    'a spinning figure left its own position, so the pivot is not its own middle');
});

test('drift moves the figure, and by the same reach a radial gradient uses', async () => {
  const size = 30;
  const drift = [{ kind: 'drift', speed: 60, amount: 100 }];
  const [first, later] = await runJobs([
    { name: 'd-0', kind: 'engine', doc: shapeDoc({ figure: 'circle', size, motions: drift }), timeSec: 0 },
    { name: 'd-t', kind: 'engine', doc: shapeDoc({ figure: 'circle', size, motions: drift }), timeSec: 1.4 }
  ]);
  assert.ok(maxDifference(first.pixels, later.pixels) > 0, 'a drifting shape must move');
  // It stays on the canvas: a figure that marched away would be a black frame
  // within seconds, and DRIFT_CENTRE_REACH is what keeps it from doing that.
  assert.ok(blackShare(later.pixels) < 0.999, 'the figure has drifted off the canvas');
});

test('pulse and breathe dim the figure without moving it', async () => {
  const size = 50;
  const centre = centreFor();
  const [bright, dim] = await runJobs([
    {
      name: 'breathe-0', kind: 'engine', timeSec: 0,
      doc: shapeDoc({ figure: 'circle', size, motions: [{ kind: 'breathe', speed: 50, amount: 100 }] })
    },
    {
      name: 'breathe-t', kind: 'engine', timeSec: 1.6,
      doc: shapeDoc({ figure: 'circle', size, motions: [{ kind: 'breathe', speed: 50, amount: 100 }] })
    }
  ]);
  const a = at(bright, { x: centre.x, y: centre.y });
  const b = at(dim, { x: centre.x, y: centre.y });
  assert.ok(a.r > b.r, `breathe must dim the figure: ${a.r} then ${b.r}`);
  // Dimmer, not moved: the pixel is still the figure's own hue, just darker.
  assert.ok(b.r > 0, 'breathe took the figure away entirely rather than dimming it');
});

// ----------------------------------------------------------------- the trail

test('a drifting shape with a trail leaves an attenuated ghost behind it', async () => {
  // The claim docs/effekt-inventur.md C2 could not make when the trail was
  // built: "the real beneficiary is a layer that never covers the canvas".
  // This is the first one, so this is the first test that can measure it.
  const size = 20;
  const motions = [{ kind: 'drift', speed: 70, amount: 100 }];
  const frames = Array.from({ length: 24 }, (unused, i) => i / 30);

  const [withTrail, without] = await runJobs([
    {
      name: 'wake', kind: 'engine', frames,
      doc: shapeDoc({ figure: 'circle', size, motions }, { trail: 70 })
    },
    {
      name: 'no-wake', kind: 'engine', frames,
      doc: shapeDoc({ figure: 'circle', size, motions }, { trail: 0 })
    }
  ]);

  // Somewhere the wake covers and the last frame's figure does not: the two
  // runs draw the same last frame, so every pixel that differs between them IS
  // the wake, and there has to be a great many of them.
  let ghostPixels = 0;
  let brightestGhost = 0;
  let figurePixels = 0;
  for (let i = 0; i < withTrail.pixels.length; i += 4) {
    const lit = Math.max(without.pixels[i], without.pixels[i + 1], without.pixels[i + 2]);
    const wake = Math.max(withTrail.pixels[i], withTrail.pixels[i + 1], withTrail.pixels[i + 2]);
    if (lit > 8) { figurePixels += 1; continue; }
    if (wake > 8) {
      ghostPixels += 1;
      if (wake > brightestGhost) brightestGhost = wake;
    }
  }

  assert.ok(figurePixels > 100, 'the figure itself is missing, so there is nothing to trail');
  assert.ok(ghostPixels > 200,
    `a wake should cover far more than the figure does; only ${ghostPixels} pixels of it survived`);
  // ATTENUATED, which is the word that makes this a wake rather than a smear:
  // every pixel of it is dimmer than the figure that made it.
  assert.ok(brightestGhost < 255,
    `the ghost is as bright as the figure (${brightestGhost}) — it is not fading at all`);

  // ...and every pixel the figure itself lights in the trail-free run must be
  // just as lit in the trailing one. Both runs draw the identical last frame,
  // so this is the other half of the no-ghost property the loop above does
  // not check: it counts a `without`-lit pixel as figurePixels and moves on
  // without ever looking at what withTrail holds there. If the veil ever
  // dimmed the CURRENT frame's own figure -- rather than only the frames
  // behind it -- a pixel lit here would go dark there, and this is what would
  // catch it.
  let strayPixels = 0;
  for (let i = 0; i < without.pixels.length; i += 4) {
    const lit = Math.max(without.pixels[i], without.pixels[i + 1], without.pixels[i + 2]);
    if (lit <= 8) continue;
    const stillLit = Math.max(withTrail.pixels[i], withTrail.pixels[i + 1], withTrail.pixels[i + 2]);
    if (stillLit <= 8) strayPixels += 1;
  }
  assert.equal(strayPixels, 0,
    `${strayPixels} pixel(s) of the figure are lit without a trail but dark with one`);
  assert.ok(blackShare(without.pixels) > blackShare(withTrail.pixels),
    'the trailing run must have fewer untouched pixels than the clearing one');
});

test('a shape leaves every pixel it does not cover exactly as it found it', async () => {
  // The structural promise the trail rests on, checked directly rather than
  // through the wake: draw a figure over a colour and require every pixel
  // outside the figure to be that colour, bit for bit.
  const size = 40;
  const [over] = await runJobs([{
    name: 'over', kind: 'engine', timeSec: 0,
    doc: {
      name: 'Untouched',
      layers: [
        { id: 'under', type: 'solid', color: UNDER, motions: [] },
        { id: 'fig', type: 'shape', figure: 'star', size, color: INK, motions: [] }
      ],
      controls: []
    }
  }]);
  const r = radiusFor(size);
  const centre = centreFor();
  // Well outside the figure's own radius, all round it.
  for (let step = 0; step < 16; step += 1) {
    const angle = (step / 16) * Math.PI * 2;
    const point = along(centre, angle, r * 1.4);
    assert.ok(isColour(at(over, point), UNDER_RGB, 0),
      `the shape layer changed a pixel ${Math.round(r * 1.4)} away from its own middle`);
  }
});
