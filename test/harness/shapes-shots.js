// SignalForge — build SignalRGB effects from images, gradients, shapes and particles.
// Copyright (C) 2026 Max Leopold Blumenschein
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Work the three new starting tiles and the two new motions in the real
 * window, and photograph it — without ever showing it.
 *
 *   npx electron test/harness/shapes-shots.js [folder]
 *
 * The same shape as gradient-shots.js and for the same reasons, which are set
 * out at length there: `windowDisplay.show = false` before app/main.js opens
 * its window, `capturePage()` twice per picture (the first commits the
 * canvas's own layer), and a frame pump installed in the page because a window
 * Chromium is not showing never ticks requestAnimationFrame. Nothing here ever
 * calls show(), focus() or maximize().
 *
 * WHAT IT IS FOR BEYOND THE PICTURES
 *
 * The `notes.json` beside them is the measurement: the shelf at the window's
 * SMALLEST supported size, so "seven tiles still fit" is a number (how far the
 * rail scrolls, whether the row wrapped, whether any tile lost its height)
 * rather than an impression off a screenshot. A photograph can hide a rail
 * that has quietly become two rows; a measured height cannot.
 */
import { app, BrowserWindow } from 'electron';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { folderDialog, discardDialog } from '../../app/main.js';
import { driver, runHarness, wait } from './driver.js';
import { harnessSandbox } from './sandbox.js';

const { effectsFolder } = harnessSandbox('shapes-shots', { show: false });

// Starting an effect from a tile leaves unsaved work, so the NEXT tile asks
// about it through a native, window-modal message box. With nobody there to
// answer, that box would sit in front of whatever the machine's owner is
// actually doing until this run gave up. Answered here, at the same seam
// gradient-shots.js answers it: "discard", because everything this run throws
// away it made itself seconds earlier. THAT the question is asked is proved
// elsewhere, against the real document (test/harness/unsaved.js).
discardDialog.ask = async () => ({ response: 1 });

const OUT = resolve(process.argv[2] || join(process.cwd(), 'work', 'shapes-shots'));
mkdirSync(OUT, { recursive: true });

/**
 * The window's smallest supported size.
 *
 * This is the size the shelf has to hold seven tiles at, so it is the size
 * most of these pictures are taken at — a strip that only works on a maximised
 * window is a strip that does not work.
 */
const SMALLEST = [1040, 700];

async function main() {
  const [win] = BrowserWindow.getAllWindows();
  const d = driver(win);
  const notes = {};

  await d.until(`document.getElementById('footer-export') !== null`, 'the window is built', 300);
  await d.installPump();

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

  // ----------------------------------------------- the shelf, measured not eyed
  notes.shelf = await d.js(`(() => {
    const rail = document.getElementById('gallery-rail');
    const tiles = [...rail.querySelectorAll('.tile')];
    const rect = (node) => { const r = node.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
    const boxes = tiles.map(rect);
    return {
      windowWidth: window.innerWidth,
      windowHeight: window.innerHeight,
      count: tiles.length,
      labels: tiles.map((t) => t.textContent.trim()),
      // One row or several: every tile must sit on the same top edge. A rail
      // that wrapped would show two different y values here, which is the
      // failure a photograph of the visible part would never reveal.
      rows: [...new Set(boxes.map((b) => b.y))].length,
      heights: [...new Set(boxes.map((b) => b.h))],
      widths: [...new Set(boxes.map((b) => b.w))],
      // What the rail is for: it scrolls sideways rather than growing taller.
      railHeight: Math.round(rail.getBoundingClientRect().height),
      scrollWidth: rail.scrollWidth,
      clientWidth: rail.clientWidth,
      scrollable: rail.scrollWidth > rail.clientWidth,
      // And the shelf must not have pushed the stage off the window.
      stageBottom: Math.round(document.getElementById('preview-body').getBoundingClientRect().bottom),
      railBottom: Math.round(rail.getBoundingClientRect().bottom)
    };
  })()`);
  await shot('01-shelf-1040x700');

  // Scrolled to the far end with a REAL wheel, so the tiles past the edge are
  // photographed as well as counted — and so what is photographed is a rail a
  // person could actually have reached.
  //
  // It used to be `rail.scrollLeft = rail.scrollWidth`, an assignment, and that
  // proved nothing about scrolling: assigning scrollLeft moves any element with
  // room to move, whatever the stylesheet says about overflow, and the picture
  // beside it would have looked exactly the same on a rail nobody could scroll.
  // The wheel goes through the same pipeline a mouse does — which is why the
  // debugger is attached at all — and the numbers on either side of it are what
  // says the gesture arrived.
  await win.webContents.debugger.attach('1.3');
  notes.scroll = { before: await d.js(`document.getElementById('gallery-rail').scrollLeft`) };
  for (let turn = 0; turn < 12; turn += 1) {
    const box = await d.box('#gallery-rail');
    await d.send('Input.dispatchMouseEvent', {
      type: 'mouseWheel',
      x: box.cx,
      y: box.cy,
      // Sideways on a rail that scrolls sideways. deltaY is sent as well
      // because a rail may be turning a vertical wheel into a horizontal
      // scroll, which is what a mouse without a tilt wheel produces.
      deltaX: 240,
      deltaY: 240,
      pointerType: 'mouse'
    });
    await wait(40);
  }
  await wait(200);
  notes.scroll.after = await d.js(`document.getElementById('gallery-rail').scrollLeft`);
  notes.scroll.end = await d.js(`(() => { const r = document.getElementById('gallery-rail');
    return r.scrollWidth - r.clientWidth; })()`);
  notes.scroll.moved = notes.scroll.after > notes.scroll.before;
  await shot('02-shelf-scrolled-by-a-real-wheel');

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
      shape: document.getElementById('sf-layers-0-shape')?.value ?? null,
      controls: [...document.querySelectorAll('#inspector-body input, #inspector-body select')]
        .map((e) => e.id).filter(Boolean),
      motionOptions: [...(document.getElementById('sf-layers-0-kind-0')?.options ?? [])].map((o) => o.value),
      shapeOptions: [...(document.getElementById('sf-layers-0-shape')?.options ?? [])]
        .map((o) => ({ value: o.value, label: o.textContent })),
      samples: { left: px(20, 100), middle: px(160, 100), right: px(300, 100), top: px(160, 12) }
    };
  })()`);

  // ------------------------------------------------------- the three new shapes
  for (const [index, tile] of ['conic', 'stripes', 'waves'].entries()) {
    await start(tile);
    await d.js(`document.getElementById('inspector').scrollTop = 0, true`);
    await wait(120);
    notes[tile] = await state();
    await shot(`0${3 + index}-${tile}`);
  }

  // The band count, which is the control the repeating shapes are about. Set
  // while waves is on the stage, so the picture shows what it did.
  await d.setInput('sf-layers-0-bands', '14');
  await d.pump(6);
  notes.wavesManyBands = await state();
  await shot('06-waves-fourteen-bands');

  // ----------------------------------------------------------- the two motions
  //
  // Both proved to MOVE rather than merely to be selectable: two hashes of the
  // stage, taken a pump apart, which must differ.
  async function motion(kind, shape, name) {
    await start(shape);
    await d.js(`document.getElementById('sf-layers-0-add').click(), true`);
    await d.until(`document.getElementById('sf-layers-0-motions-0-speed') !== null`, 'a motion was added', 100);
    await d.js(`(() => { const s = document.getElementById('sf-layers-0-kind-0'); s.value = '${kind}';
      s.dispatchEvent(new Event('change', { bubbles: true })); })(), true`);
    await wait(200);
    await d.setInput('sf-layers-0-motions-0-speed', '85');
    await d.setInput('sf-layers-0-motions-0-amount', '100');
    await d.pump(10);
    const before = await d.stats();
    await shot(`${name}-a`);
    await d.pump(40);
    const after = await d.stats();
    await shot(`${name}-b`);
    return {
      chosen: await d.js(`document.getElementById('sf-layers-0-kind-0').value`),
      hashBefore: before.hash,
      hashAfter: after.hash,
      moved: before.hash !== after.hash
    };
  }

  notes.spin = await motion('spin', 'conic', '07-conic-spinning');
  notes.pulse = await motion('pulse', 'stripes', '08-stripes-pulsing');

  // ------------------------------------- and the same shelf in the other language
  //
  // Three tiles and three dropdown entries were added in two dictionaries, and
  // a key that reached only one of them shows up in the window as the key
  // itself (see createI18n in app/renderer/i18n/i18n.js, which deliberately
  // returns the key rather than an empty string). So both languages are read
  // off the real shelf rather than off the JSON.
  notes.labels = {};
  notes.labels.before = await d.js(`[...document.querySelectorAll('#gallery-rail .tile-label')]
    .map((e) => e.textContent.trim())`);
  await d.js(`document.getElementById('footer-settings').click(), true`);
  await d.until(`document.getElementById('settings-language') !== null`, 'the app settings are open', 100);
  const other = await d.js(`(() => { const s = document.getElementById('settings-language');
    return [...s.options].map((o) => o.value).find((v) => v !== s.value); })()`);
  await d.js(`(() => { const s = document.getElementById('settings-language'); s.value = '${other}';
    s.dispatchEvent(new Event('change', { bubbles: true })); })(), true`);
  await wait(400);
  notes.otherLanguage = other;
  notes.labels.after = await d.js(`[...document.querySelectorAll('#gallery-rail .tile-label')]
    .map((e) => e.textContent.trim())`);
  await shot('09-shelf-other-language');

  process.stdout.write(`${JSON.stringify(notes, null, 2)}\n`);
  writeFileSync(join(OUT, 'notes.json'), JSON.stringify(notes, null, 2), 'utf8');
}

// runHarness ends this process however main() ends — see test/harness/driver.js.
runHarness('shapes-shots', main);
