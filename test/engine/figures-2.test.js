// SignalForge — build SignalRGB effects from images, gradients, shapes and particles.
// Copyright (C) 2026 Max Leopold Blumenschein
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { runJobs } from '../harness/render.js';
import { pixelAt, isColour, maxDifference } from '../harness/pixels.js';
import {
  CANVAS_WIDTH, CANVAS_HEIGHT, SHAPE_FIGURES, SPINNABLE_FIGURES, normalizeDocument
} from '../../src/engine/document.js';
import {
  DIAMOND_WIDTH_RATIO, CROSS_ARM_RATIO, MOON_OFFSET, MOON_INNER_RATIO
} from '../../src/engine/layers/shape.js';
import { zoomFactor, ZOOM_MAX_DEPTH } from '../../src/engine/motion/zoom.js';
import { motionPhase } from '../../src/engine/motion/breathe.js';

/**
 * The 12.08. figures, the standing rotation and the zoom — each measured at
 * coordinates COMPUTED from the engine's own constants, with a companion
 * point that must still be black, exactly as the first four figures are
 * proven in shape-layer.test.js.
 */

const INK = '#ff0066';
const INK_RGB = [255, 0, 102];
const BLACK = [0, 0, 0];
const at = (frame, x, y) => pixelAt(frame.pixels, frame.width, Math.round(x), Math.round(y));

const SIZE = 60;
const R = (SIZE / 100) * CANVAS_HEIGHT / 2;
const CX = CANVAS_WIDTH / 2;
const CY = CANVAS_HEIGHT / 2;

function figureDoc(layer, extra = {}) {
  return {
    name: 'Figures 2',
    layers: [{ id: 'fig', type: 'shape', color: INK, size: SIZE, motions: [], ...layer }],
    controls: [],
    ...extra
  };
}

test('the five new figures exist, and the engine accepts each by name', () => {
  for (const figure of ['triangle', 'hexagon', 'diamond', 'cross', 'moon']) {
    assert.ok(SHAPE_FIGURES.includes(figure), `${figure} missing from SHAPE_FIGURES`);
    assert.ok(SPINNABLE_FIGURES.includes(figure), `${figure} should be spinnable`);
    const { doc, problems } = normalizeDocument(figureDoc({ figure }));
    assert.equal(doc.layers[0].figure, figure);
    assert.deepEqual(problems, []);
  }
  assert.ok(!SPINNABLE_FIGURES.includes('circle'));
  assert.ok(!SPINNABLE_FIGURES.includes('ring'));
});

test('each figure puts ink where its own numbers say, and nowhere past them', async () => {
  const [triangle, hexagon, diamond, cross, moon] = await runJobs(
    ['triangle', 'hexagon', 'diamond', 'cross', 'moon'].map((figure) => ({
      name: figure, kind: 'engine', doc: figureDoc({ figure }), timeSec: 0
    }))
  );

  // Triangle: apex up on the contract circle; the space under the apex's
  // mirror (straight down) is outside the triangle.
  assert.ok(isColour(at(triangle, CX, CY - R * 0.85), INK_RGB), 'triangle apex');
  assert.ok(isColour(at(triangle, CX, CY + R * 0.9), BLACK), 'below a triangle is empty');

  // Hexagon: corner up; ink most of the way to the top, and wider at the
  // waist than a triangle.
  assert.ok(isColour(at(hexagon, CX, CY - R * 0.85), INK_RGB), 'hexagon top');
  assert.ok(isColour(at(hexagon, CX - R * 0.8, CY), INK_RGB), 'hexagon waist');
  assert.ok(isColour(at(hexagon, CX - R * 1.15, CY), BLACK), 'past the hexagon');

  // Diamond: full height, DIAMOND_WIDTH_RATIO of the radius wide.
  assert.ok(isColour(at(diamond, CX, CY - R * 0.85), INK_RGB), 'diamond top');
  assert.ok(isColour(at(diamond, CX + R * DIAMOND_WIDTH_RATIO * 0.8, CY), INK_RGB), 'diamond side');
  assert.ok(isColour(at(diamond, CX + R * DIAMOND_WIDTH_RATIO * 1.25, CY), BLACK),
    'a diamond is narrower than its height');

  // Cross: ink on both axes at the tips, none on the diagonal past the arm.
  assert.ok(isColour(at(cross, CX + R * 0.9, CY), INK_RGB), 'cross arm tip');
  assert.ok(isColour(at(cross, CX, CY - R * 0.9), INK_RGB), 'cross upright tip');
  assert.ok(isColour(at(cross, CX + R * 0.75, CY - R * 0.75), BLACK),
    'the diagonal between arms is empty');

  // Moon: ink on the dark limb (left), the bite (right of centre) empty —
  // and, the review's own find, NOTHING outside the contract circle: the
  // first winding-based construction leaked a free-floating lens of ink out
  // to 1.3R where the overhanging bite's winding was -1. The outline
  // construction has no outside to leak into, and this point is the proof.
  assert.ok(isColour(at(moon, CX - R * 0.9, CY), INK_RGB), 'moon limb');
  assert.ok(isColour(at(moon, CX + R * MOON_OFFSET * 0.9, CY), BLACK), 'the bite is empty');
  assert.ok(isColour(at(moon, CX + R * 1.15, CY), BLACK),
    'no ink may exist outside the circle the size promises');

  // Cross, the same contract at its own weakest point: the arms' outer
  // CORNERS are the farthest ink, and they sit ON the circle now — the first
  // version put the flat tips' midpoints there and the corners 7.7% outside.
  const cornerAngle = Math.atan2(CROSS_ARM_RATIO, 1);
  const past = R * 1.06;
  assert.ok(isColour(at(cross, CX + past * Math.cos(cornerAngle), CY - past * Math.sin(cornerAngle)), BLACK),
    'a cross corner must not reach past the contract circle');
});

test('rotation poses a figure, adds to spin, and cannot touch a ring', async () => {
  const [up, down, ringPlain, ringTurned] = await runJobs([
    { name: 'apex-up', kind: 'engine', doc: figureDoc({ figure: 'triangle' }), timeSec: 0 },
    { name: 'apex-down', kind: 'engine', doc: figureDoc({ figure: 'triangle', rotation: 180 }), timeSec: 0 },
    { name: 'ring-plain', kind: 'engine', doc: figureDoc({ figure: 'ring' }), timeSec: 0 },
    { name: 'ring-turned', kind: 'engine', doc: figureDoc({ figure: 'ring', rotation: 90 }), timeSec: 0 }
  ]);
  // 180 degrees: the apex is now at the bottom, the top is empty.
  assert.ok(isColour(at(down, CX, CY + R * 0.85), INK_RGB), 'turned apex points down');
  assert.ok(isColour(at(down, CX, CY - R * 0.9), BLACK), 'nothing above a turned triangle');
  assert.ok(maxDifference(up.pixels, down.pixels) > 0, 'the turn changed the picture');
  // A ring is symmetric under every angle, so the bytes must not move at all.
  assert.equal(maxDifference(ringPlain.pixels, ringTurned.pixels), 0,
    'rotation on a ring must not move a byte');
});

test('zoom swells the figure about its own size on the shared clock', async () => {
  // A quarter cycle in, sin is 1 and the swell is at its fullest.
  const speed = 50;
  const perSecond = motionPhase({ speed }, 1);
  const quarter = (Math.PI / 2) / perSecond;
  const motion = { kind: 'zoom', speed, amount: 100 };
  assert.ok(Math.abs(zoomFactor(motion, quarter) - (1 + ZOOM_MAX_DEPTH)) < 1e-9);
  assert.ok(Math.abs(zoomFactor(motion, 0) - 1) < 1e-9, 'zoom opens at the set size');

  const doc = figureDoc({ figure: 'circle', motions: [motion] });
  const [rest, swollen] = await runJobs([
    { name: 'zoom-rest', kind: 'engine', doc, timeSec: 0 },
    { name: 'zoom-full', kind: 'engine', doc, timeSec: quarter }
  ]);
  const grown = R * (1 + ZOOM_MAX_DEPTH);
  assert.ok(isColour(at(rest, CX + R * 1.15, CY), BLACK), 'at t=0 the set size holds');
  assert.ok(isColour(at(swollen, CX + grown * 0.9, CY), INK_RGB), 'a quarter in it has swollen');
  assert.ok(isColour(at(swollen, CX + grown * 1.15, CY), BLACK), 'and no further');
});
