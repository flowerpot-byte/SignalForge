// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max Leopold Blumenschein
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Work the particle tile from one end to the other in the real window, and
 * photograph it — without ever showing it.
 *
 *   npx electron test/harness/particle-shots.js [folder]
 *
 * The same shape as shape-layer-shots.js, and for the reasons set out at length
 * there: `windowDisplay.show = false` before app/main.js opens its window,
 * `capturePage()` twice per picture (the first commits the canvas's own layer),
 * and a frame pump installed in the page because a window Chromium is not
 * showing never ticks requestAnimationFrame. Nothing here ever calls show(),
 * focus() or maximize().
 *
 * WHAT THIS ONE HAS TO PROVE THAT ITS PREDECESSORS DID NOT
 *
 * Every layer type before this one is a STILL PICTURE until a motion is added
 * to it, and every shots harness in this folder is written on that assumption.
 * A particle layer is the first that moves with an empty `motions` list,
 * because the travel is the layer rather than something done to it. Three
 * consequences, each measured below rather than looked at:
 *
 *   moves-by-itself  two hashes of the stage a second apart, with NOTHING in
 *                    the motion list, which must differ. This is the claim no
 *                    other layer type could even make.
 *   patterns         all four, driven from the real dropdown, each photographed
 *                    — because there is one tile rather than four (gallery.js
 *                    says why), the dropdown is the only place they can be seen.
 *   wake             rain with a trail behind it: the pairing
 *                    docs/effekt-inventur.md C2 says this layer type exists to
 *                    make worth having. Proved by the frame filling in over
 *                    real seconds, not by a screenshot of a smear.
 */
import { app, BrowserWindow } from 'electron';
import { writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { folderDialog, discardDialog } from '../../app/main.js';
import { driver, runHarness, wait } from './driver.js';
import { harnessSandbox } from './sandbox.js';

const { effectsFolder } = harnessSandbox('particle-shots', { show: false });

// Starting an effect from a tile leaves unsaved work, so the NEXT tile asks
// about it through a native, window-modal message box. Answered here at the
// same seam shape-layer-shots.js answers it: "discard", because everything this
// run throws away it made itself seconds earlier. THAT the question is asked is
// proved elsewhere, against the real document (test/harness/unsaved.js).
discardDialog.ask = async () => ({ response: 1 });

const OUT = resolve(process.argv[2] || join(process.cwd(), 'work', 'particles-shots'));
mkdirSync(OUT, { recursive: true });

/** The window's smallest supported size — the shelf is photographed here. */
const SMALLEST = [1040, 700];

const PATTERNS = ['rain', 'rise', 'drift', 'snow'];

async function main() {
  const [win] = BrowserWindow.getAllWindows();
  const d = driver(win);
  const notes = {};

  await d.until(`document.getElementById('footer-export') !== null`, 'the window is built', 300);
  await d.installPump();

  /**
   * Let the preview really run for `frames` frames.
   *
   * NOT `d.pump(n)` — the reason is written out in full in
   * shape-layer-shots.js: the pump hands the page's queued animation-frame
   * callbacks a real performance.now(), and the preview loop drops any frame
   * arriving less than 1000/30 ms after the last one it drew, so forty pumps in
   * a row produce ONE render. Anything that accumulates across frames (a wake)
   * or that has to advance a clock (a swarm travelling) needs real time.
   */
  async function run(frames, gap = 40) {
    for (let i = 0; i < frames; i += 1) {
      await d.pump(1);
      await wait(gap);
    }
  }

  async function shot(name, { frames = 10 } = {}) {
    await d.pump(frames);
    await wait(200);
    const file = join(OUT, `${name}.png`);
    await win.capturePage();
    await wait(140);
    writeFileSync(file, (await win.capturePage()).toPNG());
    process.stdout.write(`shot ${file}\n`);
    return file;
  }

  win.setContentSize(SMALLEST[0], SMALLEST[1]);
  await wait(300);

  folderDialog.open = async () => ({ canceled: false, filePaths: [effectsFolder] });
  await d.js(`document.getElementById('first-run-choose').click(), true`);
  await d.until(`document.getElementById('first-run').hidden === true`, 'the question is answered', 100);

  // --------------------------------------------- the shelf, measured not eyed
  notes.shelf = await d.js(`(() => {
    const rail = document.getElementById('gallery-rail');
    const tiles = [...rail.querySelectorAll('.tile')];
    const rect = (node) => { const r = node.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
    const boxes = tiles.map(rect);
    return {
      windowWidth: window.innerWidth,
      count: tiles.length,
      labels: tiles.map((t) => t.textContent.trim()),
      // One row or several: a rail that wrapped would show two different y
      // values here, which a photograph of the visible part would never reveal.
      rows: [...new Set(boxes.map((b) => b.y))].length,
      scrollWidth: rail.scrollWidth,
      clientWidth: rail.clientWidth,
      scrollable: rail.scrollWidth > rail.clientWidth,
      // The particle tile is the last one, so this says whether it is reachable
      // only by scrolling — which is the cost of it being on the shelf at all.
      hasParticleTile: tiles.some((t) => t.dataset.tile === 'particles')
    };
  })()`);
  await shot('01-shelf');

  // Scrolled to the far end with a REAL wheel, so the particle tile past the
  // edge is photographed as well as counted. Assigning scrollLeft would move
  // any element with room to move whatever the stylesheet says about overflow
  // and would prove nothing; the wheel goes through the same pipeline a mouse
  // does, which is why the debugger is attached at all.
  await win.webContents.debugger.attach('1.3');
  for (let turn = 0; turn < 18; turn += 1) {
    const box = await d.box('#gallery-rail');
    await d.send('Input.dispatchMouseEvent', {
      type: 'mouseWheel', x: box.cx, y: box.cy, deltaX: 240, deltaY: 240, pointerType: 'mouse'
    });
    await wait(40);
  }
  await wait(200);
  notes.scroll = {
    at: await d.js(`document.getElementById('gallery-rail').scrollLeft`),
    end: await d.js(`(() => { const r = document.getElementById('gallery-rail');
      return r.scrollWidth - r.clientWidth; })()`)
  };
  notes.scroll.reachedTheEnd = notes.scroll.at >= notes.scroll.end - 1;
  await shot('02-shelf-scrolled-to-the-particles');

  /** Start the swarm from its tile and wait for the stage to take it. */
  async function start() {
    await d.js(`document.getElementById('gallery-rail').scrollLeft = 0, true`);
    await d.js(`document.getElementById('gallery-particles').click(), true`);
    await d.until(
      `document.getElementById('preview-body').classList.contains('has-picture')`,
      'the particle effect is on the stage',
      200
    );
    await d.pump(6);
  }

  /** What the window is showing, in numbers rather than in a picture. */
  const state = () => d.js(`(() => ({
    name: document.getElementById('footer-name').value,
    pattern: document.getElementById('sf-layers-0-pattern')?.value ?? null,
    // Every control in the column, by id: this is the list that says which
    // cards a swarm is offered and which it is not.
    controls: [...document.querySelectorAll('#inspector-body input, #inspector-body select')]
      .map((e) => e.id).filter(Boolean),
    patternOptions: [...(document.getElementById('sf-layers-0-pattern')?.options ?? [])]
      .map((o) => ({ value: o.value, label: o.textContent })),
    values: {
      count: document.getElementById('sf-layers-0-count')?.value ?? null,
      size: document.getElementById('sf-layers-0-size')?.value ?? null,
      tilt: document.getElementById('sf-layers-0-tilt')?.value ?? null,
      speed: document.getElementById('sf-layers-0-speed')?.value ?? null,
      seed: document.getElementById('sf-layers-0-seed')?.value ?? null
    }
  }))()`);

  await start();
  await d.js(`document.getElementById('inspector').scrollTop = 0, true`);
  await wait(120);
  notes.opening = await state();
  await shot('03-swarm-as-it-opens');

  // ------------------------------------------------- IT MOVES BY ITSELF
  //
  // The claim no other layer type in this app could make. The motion list is
  // empty — `motions: []` is what the tile starts with, and nothing below adds
  // to it — and the picture still has to change over a second of real time,
  // because the travel is the layer rather than something applied to it.
  notes.movesByItself = {
    motionRows: await d.js(
      `document.querySelectorAll('#inspector-body select[id*="-kind-"]').length`
    )
  };
  await run(4);
  const beforeTravel = await d.stats();
  await run(24);
  const afterTravel = await d.stats();
  notes.movesByItself.hashBefore = beforeTravel.hash;
  notes.movesByItself.hashAfter = afterTravel.hash;
  notes.movesByItself.moved = beforeTravel.hash !== afterTravel.hash;

  // And it stops when it is told to, which is what makes travel speed 0 a real
  // setting rather than a mistake (a still field of points — `Starlight`).
  await d.setInput('sf-layers-0-speed', '0');
  await run(6);
  const stillA = await d.stats();
  await run(18);
  const stillB = await d.stats();
  notes.stillAtSpeedZero = { hashA: stillA.hash, hashB: stillB.hash, stood: stillA.hash === stillB.hash };
  await shot('04-swarm-held-still');
  await d.setInput('sf-layers-0-speed', '45');

  // ----------------------------------------------------------- the arrangement
  //
  // The seed slider, which is the reason seeded noise is worth having rather
  // than merely necessary: a different scatter of the same effect, and the same
  // one again whenever it is asked for.
  await d.setInput('sf-layers-0-speed', '0');
  await run(6);
  const seedOne = await d.stats();
  await d.setInput('sf-layers-0-seed', '7');
  await run(6);
  const seedSeven = await d.stats();
  await d.setInput('sf-layers-0-seed', '0');
  await run(6);
  const seedBack = await d.stats();
  notes.seed = {
    atZero: seedOne.hash,
    atSeven: seedSeven.hash,
    backAtZero: seedBack.hash,
    reshuffled: seedOne.hash !== seedSeven.hash,
    // The half that matters more: going back to a seed gives back the very same
    // arrangement. `Math.random` could do the first half and never this one.
    cameBack: seedOne.hash === seedBack.hash
  };
  await shot('05-another-arrangement');
  await d.setInput('sf-layers-0-speed', '45');

  // ------------------------------------------------------------ the four looks
  //
  // There is ONE tile, so the dropdown is the only place the four patterns can
  // be seen at all — which is exactly the trade gallery.js records. Each is
  // driven from the real control and photographed after real frames, so what is
  // in the picture is the pattern moving rather than its first frame.
  notes.patterns = {};
  for (const [index, pattern] of PATTERNS.entries()) {
    await d.setSelect('sf-layers-0-pattern', pattern);
    await wait(200);
    await run(20);
    const before = await d.stats();
    await run(10);
    const after = await d.stats();
    notes.patterns[pattern] = {
      chosen: await d.js(`document.getElementById('sf-layers-0-pattern').value`),
      // The lean stays where it is when the pattern is switched, and that is
      // now the RIGHT answer rather than the bug it used to be: the direction
      // belongs to the pattern, so "rise" rises whatever the lean says.
      tilt: await d.js(`document.getElementById('sf-layers-0-tilt').value`),
      // Which way the swarm is really going, read off the engine rather than
      // off the control — this is the number that caught the original design.
      direction: await d.js(`window.SignalForgeEngine.PARTICLE_PATTERN_LOOKS['${pattern}'].direction`),
      mean: after.mean,
      moving: before.hash !== after.hash
    };
    await shot(`0${6 + index}-${pattern}`);
  }

  // ------------------------------- the combination this layer type exists for
  //
  // Rain with a wake behind it. Measured rather than looked at: with the trail
  // off, the mean brightness of the frame is whatever the drops themselves
  // cover; with it on, their paths fill in behind them and the mean rises and
  // keeps rising for a second or two. A screenshot of a wake and a screenshot
  // of a smear look alike; these two numbers do not.
  await d.setSelect('sf-layers-0-pattern', 'rain');
  await wait(200);
  await d.setInput('sf-layers-0-count', '120');
  await d.setInput('sf-layers-0-size', '3');
  await d.setInput('sf-layers-0-tilt', '7');

  // ---------------------------------------------------------------------
  // TWO SPEEDS, BECAUSE THE WAKE LOOKS LIKE TWO DIFFERENT THINGS
  // ---------------------------------------------------------------------
  //
  // A wake is the particle's own past positions, one per drawn frame, and
  // whether they read as a STREAK or as a STRING OF BEADS is decided by one
  // comparison: how far a particle travels between frames against how wide it
  // is. At 30 frames a second a drop covers `rate * spanAlong / 30` pixels a
  // frame; the default size is a diameter of six. So:
  //
  //   at the default travel speed (30)  rate 0.50 crossings a second, about
  //                                     3.6 px a frame against a 6 px drop —
  //                                     the marks overlap, and the wake is a
  //                                     continuous streak. This is rain.
  //   at travel speed 55                rate 1.47, about 10.7 px a frame — the
  //                                     marks no longer touch and the wake is
  //                                     a dotted line, a bead curtain. Not a
  //                                     fault, and a good-looking thing in its
  //                                     own right, but it is not rain.
  //
  // Both are photographed and both numbers are recorded, because "the trail
  // makes particles look like rain" is only true of one of them and this is the
  // file that has to say so.
  await d.setInput('sf-layers-0-speed', '30');
  await run(30);
  const noWake = await d.stats();
  await shot('10-rain-no-trail');
  await d.setInput('sf-trail', '70');
  await run(50);
  const withWake = await d.stats();
  await shot('11-rain-with-a-trail');

  await d.setInput('sf-layers-0-speed', '55');
  await run(50);
  const fastWake = await d.stats();
  await shot('11b-rain-with-a-trail-fast');
  await d.setInput('sf-layers-0-speed', '30');
  await run(30);

  /** How far a drop moves between two drawn frames, against how wide it is. */
  notes.wakeGeometry = await d.js(`(() => {
    const SF = window.SignalForgeEngine;
    const doc = SF.normalizeDocument({ layers: [{ id: 'p', type: 'particles',
      pattern: 'rain', size: 3, count: 120 }] }).doc;
    const out = {};
    for (const speed of [30, 55]) {
      const field = SF.particleField({ ...doc.layers[0], speed });
      out[speed] = {
        pxPerFrame: Math.round((field.rate * field.spanAlong / 30) * 10) / 10,
        diameter: Math.round(field.baseRadius * 2 * 10) / 10
      };
      out[speed].marksOverlap = out[speed].pxPerFrame < out[speed].diameter;
    }
    return out;
  })()`);

  notes.trail = {
    meanWithout: noWake.mean,
    meanWith: withWake.mean,
    meanWithFast: fastWake.mean,
    wakeIsBrighter: withWake.mean > noWake.mean * 1.5,
    trailControl: await d.js(`document.getElementById('sf-trail').value`)
  };

  // ----------------------------------------- exported, cover picture and all
  await d.setInput('footer-name', 'SF Regen');
  const exportBox = await d.box('#footer-export');
  await d.click(exportBox.cx, exportBox.cy);
  await d.until(
    `document.querySelector('.drop-message').textContent.includes('SF Regen.html')`,
    'the rain effect is exported'
  );
  notes.export = { message: await d.message() };
  await shot('12-exported');

  notes.export.folder = readdirSync(effectsFolder).sort().map((name) => ({
    name, bytes: statSync(join(effectsFolder, name)).size
  }));
  // The .png beside the .html is what SignalRGB lists the effect by, and an
  // effect with no tile in his own list is the complaint that put covers in
  // this app in the first place (docs/messung-titelbilder.md).
  notes.export.hasCover = notes.export.folder.some((entry) => entry.name === 'SF Regen.png');
  notes.export.coverBytes =
    notes.export.folder.find((entry) => entry.name === 'SF Regen.png')?.bytes ?? 0;
  notes.export.htmlBytes =
    notes.export.folder.find((entry) => entry.name === 'SF Regen.html')?.bytes ?? 0;

  // ---------------------------------- and the same window in the other language
  //
  // One tile label, one dropdown label with four options and three card labels
  // were added to two dictionaries, and a key that reached only one of them
  // shows up in the window as the key itself (see createI18n in
  // app/renderer/i18n/i18n.js, which deliberately returns the key rather than
  // an empty string). So both languages are read off the real window rather
  // than off the JSON.
  const readLabels = () => d.js(`({
    tiles: [...document.querySelectorAll('#gallery-rail .tile-label')].map((e) => e.textContent.trim()),
    cards: [...document.querySelectorAll('#inspector-body label')].map((e) => e.textContent.trim()),
    patterns: [...(document.getElementById('sf-layers-0-pattern')?.options ?? [])]
      .map((o) => o.textContent.trim())
  })`);
  await start();
  notes.labels = { before: await readLabels() };
  await d.js(`document.getElementById('footer-settings').click(), true`);
  await d.until(`document.getElementById('settings-language') !== null`, 'the app settings are open', 100);
  const other = await d.js(`(() => { const s = document.getElementById('settings-language');
    return [...s.options].map((o) => o.value).find((v) => v !== s.value); })()`);
  await d.setSelect('settings-language', other);
  await wait(400);
  notes.otherLanguage = other;
  notes.labels.after = await readLabels();
  // A key that reached neither file, or only one, shows up as the key itself.
  notes.labels.anyRawKeys = [
    ...notes.labels.before.tiles, ...notes.labels.before.cards, ...notes.labels.before.patterns,
    ...notes.labels.after.tiles, ...notes.labels.after.cards, ...notes.labels.after.patterns
  ].filter((text) => /^(gallery|inspector)\./.test(text));
  await shot('13-other-language');

  process.stdout.write(`${JSON.stringify(notes, null, 2)}\n`);
  writeFileSync(join(OUT, 'notes.json'), JSON.stringify(notes, null, 2), 'utf8');
}

// runHarness ends this process however main() ends — see test/harness/driver.js.
runHarness('particle-shots', main);
