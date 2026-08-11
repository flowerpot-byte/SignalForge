// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { runJobs } from '../harness/render.js';
import { pixelAt, isColour, maxDifference, meanBrightness } from '../harness/pixels.js';
import { CANVAS_WIDTH } from '../../src/engine/document.js';

/** "#rrggbb" as the three numbers isColour compares against. */
const rgb = (hex) => [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16));

/**
 * What a background actually DOES to the pixels — measured, not argued.
 *
 * Every job here goes through one Electron launch, because starting Electron
 * costs a second or two and rendering a frame costs milliseconds (see
 * test/harness/render.js). The window is `show: false` throughout.
 *
 * The colours are deliberately far apart and are named here rather than taken
 * from the document's defaults: this file has to be able to say WHICH layer a
 * pixel came from, and two colours a few steps apart could not.
 */
const BEHIND = '#0000ff';
const FRONT = '#ff0000';

/** A figure small enough and central enough to leave every corner uncovered. */
const figure = () => ({
  id: 'front', type: 'shape', figure: 'circle', color: FRONT, size: 30, motions: []
});

const solidBehind = () => ({ id: 'background', type: 'solid', color: BEHIND, motions: [] });

/** Rain, and enough of it that a wake would be unmissable if there were one. */
const rain = (extra = {}) => ({
  id: 'front',
  type: 'particles',
  pattern: 'rain',
  stops: [{ at: 0, color: '#ffffff' }, { at: 100, color: '#ffffff' }],
  count: 120,
  size: 4,
  speed: 40,
  motions: [],
  ...extra
});

const conicBehind = (motions = []) => ({
  id: 'background',
  type: 'gradient',
  shape: 'conic',
  bands: 3,
  stops: [{ at: 0, color: '#00ff00' }, { at: 100, color: '#0000ff' }],
  motions
});

/** Ten frames at a thirtieth of a second, which is a third of a second of wake. */
const FRAMES = Array.from({ length: 10 }, (unused, i) => i / 30);

test('a background is drawn UNDER the layer above it, and only where that layer is not', async () => {
  const [alone, over, moving0, moving1] = await runJobs([
    // The figure by itself: everything it does not cover is the hard clear,
    // which is black. That is the control — without it, "the corner is blue"
    // could just as well mean the figure had been made huge.
    { name: 'alone', kind: 'engine', doc: { layers: [figure()] }, timeSec: 0 },
    { name: 'over', kind: 'engine', doc: { layers: [solidBehind(), figure()] }, timeSec: 0 },
    // A background that MOVES under a foreground that does not: any pixel the
    // figure does not cover has to change between these two frames, and the
    // figure itself must not.
    {
      name: 'moving0',
      kind: 'engine',
      doc: { layers: [conicBehind([{ kind: 'spin', speed: 60, amount: 100 }]), figure()] },
      timeSec: 0
    },
    {
      name: 'moving1',
      kind: 'engine',
      doc: { layers: [conicBehind([{ kind: 'spin', speed: 60, amount: 100 }]), figure()] },
      timeSec: 1.5
    }
  ]);

  const corner = (job) => pixelAt(job.pixels, CANVAS_WIDTH, 6, 6);
  const middle = (job) => pixelAt(job.pixels, CANVAS_WIDTH, CANVAS_WIDTH / 2, 100);

  assert.ok(isColour(corner(alone), rgb('#000000')),
    `with no background the corner is the hard clear, got ${JSON.stringify(corner(alone))}`);
  assert.ok(isColour(corner(over), rgb(BEHIND)),
    `the corner must show the background, got ${JSON.stringify(corner(over))}`);
  assert.ok(isColour(middle(over), rgb(FRONT)),
    `the figure must still be in front, got ${JSON.stringify(middle(over))}`);
  assert.ok(isColour(middle(alone), rgb(FRONT)), 'the figure is unchanged by what is behind it');

  // The moving background at two different moments.
  assert.notDeepEqual(corner(moving0), corner(moving1),
    'a spinning background must show a different colour in the corner a second and a half later');
  assert.ok(isColour(middle(moving0), rgb(FRONT)) && isColour(middle(moving1), rgb(FRONT)),
    'and the figure on top of it must not move with it');
});

/**
 * THE WAKE AND AN OPAQUE BACKGROUND DO NOT COMBINE, and this is where that is
 * pinned down rather than left as a claim.
 *
 * docs/effekt-inventur.md said so in advance, in section C2: "Eine Ebene, die
 * alle 320 x 200 Pixel deckend uebermalt, verdeckt damit ihr eigenes
 * Nachziehen. Ein Verlauf tut genau das." The arithmetic is in
 * src/engine/engine.js: with a trail the layers are composited onto a veil
 * canvas which is DIMMED rather than cleared, and the wake is what survives
 * that dimming — but every layer then draws on top of it, and a background
 * covers all 64000 pixels with source-over. What was still faintly there is
 * gone before the foreground is drawn at all.
 *
 * So the trail slider does nothing whatsoever while a background is switched
 * on. That is a fact about the composition order and not a bug in it: the veil
 * holds the COMPOSITE, and a background is part of the composite. The corpus
 * gets both at once by a different route entirely — it has no background layer,
 * it draws its veil IN the background colour (`ctx.fillStyle = bgColor + "22"`,
 * section A2) — which is a different feature, not this one.
 *
 * This test is what stops that from being discovered again by somebody
 * wondering why their rain has stopped smearing: if the engine ever grows a
 * wake that survives a background, the second assertion goes red and says so.
 */
test('an opaque background hides the wake, exactly and measurably', async () => {
  const [alone, aloneFlat, over, overFlat] = await runJobs([
    { name: 'alone', kind: 'engine', doc: { trail: 75, layers: [rain()] }, frames: FRAMES },
    { name: 'aloneFlat', kind: 'engine', doc: { trail: 0, layers: [rain()] }, frames: FRAMES },
    {
      name: 'over',
      kind: 'engine',
      doc: { trail: 75, layers: [conicBehind(), rain()] },
      frames: FRAMES
    },
    {
      name: 'overFlat',
      kind: 'engine',
      doc: { trail: 0, layers: [conicBehind(), rain()] },
      frames: FRAMES
    }
  ]);

  // The control: on transparent ground a trail of 75 really does leave
  // something behind, so the comparison below is measuring the background and
  // not a trail that never worked in this fixture.
  assert.ok(maxDifference(alone.pixels, aloneFlat.pixels) > 0,
    'a wake over nothing must differ from no wake at all');
  assert.ok(meanBrightness(alone.pixels) > meanBrightness(aloneFlat.pixels),
    'and it must ADD light, which is what a wake is');

  // And the finding.
  assert.equal(maxDifference(over.pixels, overFlat.pixels), 0,
    'with an opaque background the trail changes nothing: the background repaints '
    + 'every pixel of the veil before the foreground is drawn on it');
});
