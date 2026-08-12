// SignalForge — build SignalRGB effects from images, gradients, shapes and particles.
// Copyright (C) 2026 Max Leopold Blumenschein
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Work the four new figure tiles from one end to the other in the real window,
 * and photograph it — without ever showing it.
 *
 *   npx electron test/harness/shape-layer-shots.js [folder]
 *
 * The same shape as shapes-shots.js and gradient-shots.js, and for the reasons
 * set out at length there: `windowDisplay.show = false` before app/main.js
 * opens its window, `capturePage()` twice per picture (the first commits the
 * canvas's own layer), and a frame pump installed in the page because a window
 * Chromium is not showing never ticks requestAnimationFrame. Nothing here ever
 * calls show(), focus() or maximize().
 *
 * WHAT THIS ONE ADDS OVER ITS TWO PREDECESSORS
 *
 * They stop at the stage. This walks the whole way a person does — tile,
 * effect, settings cards, export, and the cover picture SignalRGB lists the
 * effect by — because a layer type is not finished when it renders. Each step
 * leaves a number in `notes.json` beside the pictures, so every claim in the
 * report is something that was measured rather than something that was looked
 * at:
 *
 *   shelf        eleven tiles, one row, and how far the rail now scrolls at
 *                the smallest supported window size. A photograph can hide a
 *                rail that has quietly become two rows; a measured top edge
 *                per tile cannot.
 *   cards        which controls each figure is offered, read off the real
 *                column — this is where "a ring gets a thickness and a star
 *                gets points, and neither gets the other's" stops being a
 *                claim about describeInspector and becomes a claim about the
 *                window.
 *   motions      which kinds the dropdown offers per figure, and that a spin
 *                on a star really moves the picture (two hashes a pump apart).
 *   trail        the one combination this layer type exists for: a drifting
 *                figure with a wake behind it, proved by the frame getting
 *                brighter as the wake fills in rather than by a screenshot.
 *   export       the .html and the .png that land in the folder, and the sizes
 *                of both.
 */
import { app, BrowserWindow } from 'electron';
import { writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { folderDialog, discardDialog } from '../../app/main.js';
import { driver, runHarness, wait } from './driver.js';
import { harnessSandbox } from './sandbox.js';

const { effectsFolder } = harnessSandbox('shape-layer-shots', { show: false });

// Starting an effect from a tile leaves unsaved work, so the NEXT tile asks
// about it through a native, window-modal message box. With nobody there to
// answer, that box would sit in front of whatever the machine's owner is
// actually doing until this run gave up. Answered here at the same seam
// shapes-shots.js answers it: "discard", because everything this run throws
// away it made itself seconds earlier. THAT the question is asked is proved
// elsewhere, against the real document (test/harness/unsaved.js).
discardDialog.ask = async () => ({ response: 1 });

const OUT = resolve(process.argv[2] || join(process.cwd(), 'work', 'shape-layer-shots'));
mkdirSync(OUT, { recursive: true });

/**
 * The window's smallest supported size.
 *
 * The shelf held seven tiles in one row here and now has to hold eleven, so
 * this is the size the shelf pictures are taken at. A strip that only works on
 * a maximised window is a strip that does not work.
 */
const SMALLEST = [1040, 700];

const FIGURES = ['circle', 'ring', 'star', 'heart'];

async function main() {
  const [win] = BrowserWindow.getAllWindows();
  const d = driver(win);
  const notes = {};

  await d.until(`document.getElementById('footer-export') !== null`, 'the window is built', 300);
  await d.installPump();

  /**
   * Let the preview really run for `frames` frames.
   *
   * NOT `d.pump(n)`, and the difference cost an hour to find, so it is written
   * down. The pump hands the page's queued animation-frame callbacks a REAL
   * performance.now(), and the preview loop drops any frame that arrives less
   * than 1000/30 ms after the last one it drew (see `frame` in
   * app/renderer/components/preview.js). Forty pumps in a row therefore take a
   * few milliseconds of wall clock and produce ONE render — which is plenty for
   * "did the picture change" and useless for anything that accumulates across
   * frames.
   *
   * A wake is exactly that: the trail composites frame N over frame N-1, so it
   * needs frames, not one frame at a later time. Measured with the pump alone,
   * a trail of 70 changed the frame's mean brightness by -0.2 % and looked for
   * all the world like a feature that did nothing. Given real time it is what
   * it should be. Anything in this file that watches something build up uses
   * this; anything that only needs a later moment can still use the pump.
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
      windowHeight: window.innerHeight,
      count: tiles.length,
      labels: tiles.map((t) => t.textContent.trim()),
      // One row or several: every tile must sit on the same top edge. A rail
      // that wrapped would show two different y values here, which is the
      // failure a photograph of the visible part would never reveal — and it
      // is the failure four extra tiles could plausibly have caused.
      rows: [...new Set(boxes.map((b) => b.y))].length,
      heights: [...new Set(boxes.map((b) => b.h))],
      widths: [...new Set(boxes.map((b) => b.w))],
      railHeight: Math.round(rail.getBoundingClientRect().height),
      scrollWidth: rail.scrollWidth,
      clientWidth: rail.clientWidth,
      scrollable: rail.scrollWidth > rail.clientWidth,
      // How many tiles fit before the edge, which is the number the decision to
      // ship four tiles instead of one actually trades against.
      visibleTiles: boxes.filter((b) => b.x + b.w <= rail.getBoundingClientRect().right).length,
      // And the shelf must not have pushed the stage off the window.
      stageBottom: Math.round(document.getElementById('preview-body').getBoundingClientRect().bottom),
      railBottom: Math.round(rail.getBoundingClientRect().bottom)
    };
  })()`);
  await shot('01-shelf-1040x700');

  // Scrolled to the far end with a REAL wheel, so the four figure tiles past
  // the edge are photographed as well as counted — and so what is photographed
  // is a rail a person could actually have reached. Assigning scrollLeft would
  // move any element with room to move whatever the stylesheet says about
  // overflow, and would have proved nothing; the wheel goes through the same
  // pipeline a mouse does, which is why the debugger is attached at all.
  await win.webContents.debugger.attach('1.3');
  notes.scroll = { before: await d.js(`document.getElementById('gallery-rail').scrollLeft`) };
  for (let turn = 0; turn < 16; turn += 1) {
    const box = await d.box('#gallery-rail');
    await d.send('Input.dispatchMouseEvent', {
      type: 'mouseWheel', x: box.cx, y: box.cy, deltaX: 240, deltaY: 240, pointerType: 'mouse'
    });
    await wait(40);
  }
  await wait(200);
  notes.scroll.after = await d.js(`document.getElementById('gallery-rail').scrollLeft`);
  notes.scroll.end = await d.js(`(() => { const r = document.getElementById('gallery-rail');
    return r.scrollWidth - r.clientWidth; })()`);
  notes.scroll.moved = notes.scroll.after > notes.scroll.before;
  notes.scroll.reachedTheEnd = notes.scroll.after >= notes.scroll.end - 1;
  // The four figure tiles are the ones at the far end, so this is the picture
  // that shows all four previews at once.
  await shot('02-shelf-scrolled-to-the-figures');

  /** Start an effect from a tile and wait for the stage to take it. */
  async function start(tile) {
    await d.js(`document.getElementById('gallery-rail').scrollLeft = 0, true`);
    await d.js(`document.getElementById('gallery-${tile}').click(), true`);
    await d.until(
      `document.getElementById('preview-body').classList.contains('has-picture')`,
      `the ${tile} effect is on the stage`,
      200
    );
    await d.pump(6);
  }

  /** What the window is showing, in numbers rather than in a picture. */
  const state = () => d.js(`(() => {
    const canvas = document.getElementById('preview-canvas');
    const g = canvas.getContext('2d', { willReadFrequently: true });
    const px = (x, y) => { const d = g.getImageData(x, y, 1, 1).data; return [d[0], d[1], d[2]]; };
    return {
      name: document.getElementById('footer-name').value,
      figure: document.getElementById('sf-layers-0-figure')?.value ?? null,
      // Every control in the column, by id: this is the list that says a ring
      // is offered a thickness and a star is not.
      controls: [...document.querySelectorAll('#inspector-body input, #inspector-body select')]
        .map((e) => e.id).filter(Boolean),
      figureOptions: [...(document.getElementById('sf-layers-0-figure')?.options ?? [])]
        .map((o) => ({ value: o.value, label: o.textContent })),
      // The middle of the canvas is inside every figure but the ring, whose
      // middle is its hole — so these four samples alone tell the figures apart.
      samples: {
        middle: px(160, 100), justOff: px(160, 60),
        corner: px(4, 4), edge: px(300, 100)
      }
    };
  })()`);

  // ------------------------------------------------------- the four figures
  notes.figures = {};
  for (const [index, figure] of FIGURES.entries()) {
    await start(figure);
    await d.js(`document.getElementById('inspector').scrollTop = 0, true`);
    await wait(120);
    notes.figures[figure] = await state();
    // Which motions this figure's dropdown offers. Read after a motion is added
    // because the per-entry dropdown is what carries the list.
    await d.js(`document.getElementById('sf-layers-0-add').click(), true`);
    await d.until(`document.getElementById('sf-layers-0-kind-0') !== null`, 'a motion was added', 100);
    notes.figures[figure].motionOptions = await d.js(
      `[...document.getElementById('sf-layers-0-kind-0').options].map((o) => o.value)`
    );
    await shot(`0${3 + index}-${figure}`);
  }

  // The two figure-specific cards, each set while its own figure is on the
  // stage so the picture shows what it did.
  await start('ring');
  await d.setInput('sf-layers-0-thickness', '85');
  await d.pump(6);
  notes.thickCard = await state();
  await shot('07-ring-thick-wall');

  await start('star');
  await d.setInput('sf-layers-0-points', '12');
  await d.pump(6);
  notes.twelvePoints = await state();
  await shot('08-star-twelve-points');

  // The position cards, which are the two that move the figure off the middle.
  await start('heart');
  await d.setInput('sf-layers-0-position-x', '22');
  await d.setInput('sf-layers-0-position-y', '70');
  await d.setInput('sf-layers-0-size', '35');
  await d.pump(6);
  notes.placed = await state();
  await shot('09-heart-placed-and-small');

  // ------------------------------------------------- a spin that really turns
  //
  // Two hashes of the stage, taken a pump apart, which must differ — the same
  // proof shapes-shots.js uses, applied to the motion this layer type added a
  // reason for.
  await start('star');
  await d.js(`document.getElementById('sf-layers-0-add').click(), true`);
  await d.until(`document.getElementById('sf-layers-0-motions-0-speed') !== null`, 'a motion was added', 100);
  await d.setSelect('sf-layers-0-kind-0', 'spin');
  await wait(200);
  await d.setInput('sf-layers-0-motions-0-speed', '85');
  await d.setInput('sf-layers-0-motions-0-amount', '100');
  await run(6);
  const spinBefore = await d.stats();
  await shot('10-star-spinning-a');
  await run(12);
  const spinAfter = await d.stats();
  await shot('10-star-spinning-b');
  notes.spin = {
    chosen: await d.js(`document.getElementById('sf-layers-0-kind-0').value`),
    hashBefore: spinBefore.hash, hashAfter: spinAfter.hash,
    moved: spinBefore.hash !== spinAfter.hash
  };

  // ------------------------------- the combination this layer type exists for
  //
  // A drifting figure with a trail behind it. Measured rather than looked at:
  // with the wake off, the mean brightness of the frame is whatever one figure
  // covers; with it on, the same figure's path fills in behind it and the mean
  // rises and keeps rising for a second or two. A screenshot of a wake and a
  // screenshot of a smear look alike; these two numbers do not.
  await start('circle');
  await d.js(`document.getElementById('sf-layers-0-add').click(), true`);
  await d.until(`document.getElementById('sf-layers-0-motions-0-speed') !== null`, 'a motion was added', 100);
  await d.setSelect('sf-layers-0-kind-0', 'drift');
  await wait(200);
  await d.setInput('sf-layers-0-motions-0-speed', '75');
  await d.setInput('sf-layers-0-motions-0-amount', '100');
  await d.setInput('sf-layers-0-size', '18');
  // Real frames over real time, for the reason spelled out at `run` above: a
  // wake is the one thing in this window that cannot be measured by pumping.
  await run(30);
  const noWake = await d.stats();
  await shot('11-drifting-circle-no-trail');
  await d.setInput('sf-trail', '70');
  await run(45);
  const withWake = await d.stats();
  await shot('12-drifting-circle-with-a-wake');
  notes.trail = {
    meanWithout: noWake.mean,
    meanWith: withWake.mean,
    // A wake covers many times what the figure alone does, so this is not a
    // marginal difference and the threshold does not have to be a fine one.
    wakeIsBrighter: withWake.mean > noWake.mean * 1.5,
    trailControl: await d.js(`document.getElementById('sf-trail').value`)
  };

  // ----------------------------------------- exported, cover picture and all
  await d.setInput('footer-name', 'SF Formen');
  const exportBox = await d.box('#footer-export');
  await d.click(exportBox.cx, exportBox.cy);
  await d.until(
    `document.querySelector('.drop-message').textContent.includes('SF Formen.html')`,
    'the figure effect is exported'
  );
  notes.export = { message: await d.message() };
  await shot('13-exported');

  notes.export.folder = readdirSync(effectsFolder).sort().map((name) => ({
    name, bytes: statSync(join(effectsFolder, name)).size
  }));
  // The .png beside the .html is what SignalRGB lists the effect by, and an
  // effect with no tile in his own list is the complaint that put covers in
  // this app in the first place (docs/messung-titelbilder.md).
  notes.export.hasCover = notes.export.folder.some((entry) => entry.name === 'SF Formen.png');
  notes.export.coverBytes =
    notes.export.folder.find((entry) => entry.name === 'SF Formen.png')?.bytes ?? 0;

  // ---------------------------------- and the same shelf in the other language
  //
  // Four tiles, one dropdown label and nine card labels were added in two
  // dictionaries, and a key that reached only one of them shows up in the
  // window as the key itself (see createI18n in app/renderer/i18n/i18n.js,
  // which deliberately returns the key rather than an empty string). So both
  // languages are read off the real window rather than off the JSON.
  notes.labels = { before: {} };
  const readLabels = () => d.js(`({
    tiles: [...document.querySelectorAll('#gallery-rail .tile-label')].map((e) => e.textContent.trim()),
    cards: [...document.querySelectorAll('#inspector-body label')].map((e) => e.textContent.trim()),
    figures: [...(document.getElementById('sf-layers-0-figure')?.options ?? [])]
      .map((o) => o.textContent.trim())
  })`);
  await start('ring');
  notes.labels.before = await readLabels();
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
    ...notes.labels.before.tiles, ...notes.labels.before.cards, ...notes.labels.before.figures,
    ...notes.labels.after.tiles, ...notes.labels.after.cards, ...notes.labels.after.figures
  ].filter((text) => /^(gallery|inspector)\./.test(text));
  await shot('14-shelf-other-language');

  process.stdout.write(`${JSON.stringify(notes, null, 2)}\n`);
  writeFileSync(join(OUT, 'notes.json'), JSON.stringify(notes, null, 2), 'utf8');
}

// runHarness ends this process however main() ends — see test/harness/driver.js.
runHarness('shape-layer-shots', main);
