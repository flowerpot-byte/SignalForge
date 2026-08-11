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
 * THE WAKE OVER A BACKGROUND — what it looks like, measured rather than argued.
 *
 * UNTIL 12.08.2026 THIS FILE PINNED THE OPPOSITE, and it is worth saying what
 * changed and why the old pin was not wrong when it was written. The veil used
 * to hold the whole COMPOSITE: layers were drawn onto a canvas that was dimmed
 * instead of cleared, so the wake was whatever survived the dimming — and a
 * background covers all 64000 pixels with source-over before the foreground is
 * drawn at all. The wake was therefore gone every single frame, and the trail
 * slider provably did nothing while a background was switched on. That was a
 * fact about the composition order, it was measured, and it was pinned here so
 * nobody would rediscover it by wondering why their rain had stopped smearing.
 *
 * The composition order is what changed (see createRenderer in
 * src/engine/engine.js): the wake now lives on a SECOND, TRANSPARENT canvas
 * that only ever holds the FOREGROUND, and the background is drawn fresh
 * underneath it every frame. So the two claims below are the ones that replace
 * the old one, and both are falsifiable:
 *
 *   1. a wake IS visible over a background, and every pixel of it is a mixture
 *      of the figure's colour and the background's — it fades TOWARDS the
 *      background rather than towards black;
 *   2. where nothing moved, the background is byte-for-byte the background. The
 *      wake does not veil it, so its own motion is not smeared into mud.
 */

/** A figure that travels, so it leaves pixels behind it to measure. */
const drifting = () => ({
  ...figure(), motions: [{ kind: 'drift', speed: 70, amount: 60 }]
});

test('a wake over a background fades towards the background, not towards black', async () => {
  const [over, overFlat] = await runJobs([
    {
      name: 'over',
      kind: 'engine',
      doc: { trail: 75, layers: [solidBehind(), drifting()] },
      frames: FRAMES
    },
    {
      name: 'overFlat',
      kind: 'engine',
      doc: { trail: 0, layers: [solidBehind(), drifting()] },
      frames: FRAMES
    }
  ]);

  // The finding, the other way up. This assertion is the whole point of the
  // change and it is the one that used to read `=== 0`.
  assert.ok(maxDifference(over.pixels, overFlat.pixels) > 0,
    'the trail must now change the frame while a background is switched on');

  // EVERY GHOST PIXEL IS A MIXTURE OF THE TWO COLOURS, and this is what makes
  // "fades towards the background" a measurement instead of a description.
  // The figure is pure red and the background pure blue, so a ghost at
  // coverage t is exactly (255t, 0, 255(1-t)): the green channel stays at zero
  // and the red and the blue add up to 255. A wake that faded towards BLACK
  // would leave red over a darkened blue and the sum would fall short.
  const ghosts = [];
  for (let x = 0; x < CANVAS_WIDTH; x += 1) {
    const flat = pixelAt(overFlat.pixels, CANVAS_WIDTH, x, 100);
    const trailing = pixelAt(over.pixels, CANVAS_WIDTH, x, 100);
    const isBackground = (p) => p.r === 0 && p.g === 0 && p.b === 255;
    if (isBackground(flat) && !isBackground(trailing)) ghosts.push({ x, ...trailing });
  }

  assert.ok(ghosts.length > 4,
    `the figure must leave a wake on pixels it is no longer on; found ${ghosts.length}`);
  for (const ghost of ghosts) {
    assert.equal(ghost.g, 0, `the ghost at x=${ghost.x} picked up light from nowhere`);
    assert.ok(ghost.r > 0 && ghost.r < 255,
      `the ghost at x=${ghost.x} is not attenuated: red ${ghost.r}`);
    assert.ok(ghost.b > 0, `the ghost at x=${ghost.x} hides the background entirely`);
    assert.ok(Math.abs(ghost.r + ghost.b - 255) <= 2,
      `the ghost at x=${ghost.x} is not the figure OVER the background: `
        + `${ghost.r} + ${ghost.b} should come to 255`);
  }
});

test('where nothing moved, a moving background under a wake is untouched', async () => {
  // The second half, and the one that says the background is exempt from the
  // wake it carries. A conic that spins, with a figure travelling across the
  // middle: the two top corners are places the figure never reaches, so with a
  // wake switched on they must hold EXACTLY what they hold without one — the
  // background's own turning colour, at full strength, not a smeared average
  // of the last few dozen frames of it.
  const spinning = () => conicBehind([{ kind: 'spin', speed: 60, amount: 100 }]);
  const [over, overFlat] = await runJobs([
    {
      name: 'over', kind: 'engine',
      doc: { trail: 100, layers: [spinning(), drifting()] }, frames: FRAMES
    },
    {
      name: 'overFlat', kind: 'engine',
      doc: { trail: 0, layers: [spinning(), drifting()] }, frames: FRAMES
    }
  ]);

  for (const [x, y] of [[6, 6], [CANVAS_WIDTH - 7, 6], [6, 193], [CANVAS_WIDTH - 7, 193]]) {
    assert.deepEqual(
      pixelAt(over.pixels, CANVAS_WIDTH, x, y),
      pixelAt(overFlat.pixels, CANVAS_WIDTH, x, y),
      `the background at (${x}, ${y}) was touched by a wake that never passed over it`
    );
  }

  // And the control: the wake really is switched on in that run, somewhere.
  assert.ok(maxDifference(over.pixels, overFlat.pixels) > 0,
    'nothing differs at all, so the corners above prove nothing');
});

/**
 * THE SECOND PASS, AND THE ONE DOCUMENT THAT NEEDS IT.
 *
 * renderOverBackground draws the foreground into the wake and composites the
 * wake over the background — one draw, because source-over is associative and
 * the two orders provably land on the same picture. A foreground on a BLEND
 * MODE breaks that: `screen` against a nearly empty wake is not `screen`
 * against the background, so such a document is drawn twice, once onto each
 * canvas.
 *
 * The claim that makes it falsifiable: on the FIRST frame the wake is empty, so
 * whatever a trail does later, the first frame of a trailing document must be
 * the frame it would have had with no trail at all. If the second pass were
 * dropped, a screened foreground would stop seeing the background and the first
 * frame would change the moment the slider left zero.
 *
 * Exactly, not nearly: the wake is empty, so compositing it changes nothing at
 * all, and the foreground draw that follows is the same call onto the same
 * pixels.
 */
test('a blended foreground over a background still blends with the background', async () => {
  const screened = (trail) => ({
    trail,
    layers: [
      solidBehind(),
      { ...figure(), blend: 'screen', size: 60 }
    ]
  });

  // A one-entry SEQUENCE rather than a single frame: the harness renders a
  // single-frame job twice, to warm every lazy buffer before the frame that is
  // kept (test/harness/page.html), and "twice" is a second frame as far as a
  // wake is concerned. The sequence path renders each frame exactly once, which
  // is what "the first frame" has to mean here.
  const [withWake, without] = await runJobs([
    { name: 'withWake', kind: 'engine', doc: screened(75), frames: [{ timeSec: 0 }] },
    { name: 'without', kind: 'engine', doc: screened(0), frames: [{ timeSec: 0 }] }
  ]);

  // Red screened over blue is magenta; without the second pass it would be the
  // plain red of a figure screened against nothing.
  const middle = pixelAt(withWake.pixels, CANVAS_WIDTH, CANVAS_WIDTH / 2, 100);
  assert.ok(isColour(middle, [255, 0, 255]),
    `the figure must screen with the background, got ${JSON.stringify(middle)}`);
  assert.equal(maxDifference(withWake.pixels, without.pixels), 0,
    'the first frame of a wake is the frame without one: the wake is still empty');
});

test('a swarm over a background wakes too, and adds light doing it', async () => {
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

  // And the same, now, with a background under it — the pairing the whole
  // feature was asked for.
  assert.ok(maxDifference(over.pixels, overFlat.pixels) > 0,
    'a wake under a background must differ from no wake at all');
  assert.ok(meanBrightness(over.pixels) > meanBrightness(overFlat.pixels),
    'white rain over a background must ADD light where it has been');
});
