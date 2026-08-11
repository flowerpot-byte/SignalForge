// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Work the real window's three new starting tiles, and photograph it — without
 * ever showing it.
 *
 *   npx electron test/harness/gradient-shots.js [folder]
 *
 * The same shape as shots.js, and for the same reason: `windowDisplay.show =
 * false` before app/main.js opens its window, `capturePage()` twice per
 * picture, and a frame pump installed in the page because a window Chromium is
 * not showing never ticks requestAnimationFrame. Nothing here ever calls
 * show(), focus() or maximize().
 *
 * WHAT IS DELIBERATELY NOT DONE HERE
 *
 * The colour swatches are set by assigning a value and firing `input` — the
 * event Chromium itself fires while its colour dialog is open — and never by
 * clicking them. Clicking an <input type="color"> opens the operating system's
 * colour picker, a real modal window that nobody is there to answer and that
 * would appear on the machine's own screen. That is the one gesture in this
 * window that cannot be rehearsed without a human, and it is left alone.
 */
import { app, BrowserWindow } from 'electron';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { serializeProject } from '../../src/main/project.js';
import { normalizeDocument } from '../../src/engine/document.js';
import { projectDialogs, folderDialog, discardDialog } from '../../app/main.js';
import { driver, runHarness, wait } from './driver.js';
import { harnessSandbox } from './sandbox.js';

// The throwaway directory, the sandbox around the effects folder, and the one
// setting this file exists for: `show: false`. See test/harness/sandbox.js.
const { runDir, effectsFolder } = harnessSandbox('gradient-shots', { show: false });

/**
 * And the line that keeps a REAL modal question off the machine's screen.
 *
 * Starting an effect from a tile leaves unsaved work, exactly as importing a
 * picture does — so the NEXT tile, and the next "open project", ask about it
 * through a native window-modal message box (see discardDialog in app/main.js).
 * With nobody there to answer, that box would sit in front of whatever the
 * machine's owner is actually doing until this run gave up. Answered here
 * instead, at the same seam the two file dialogs are answered at: "discard",
 * because everything this run throws away it made itself, seconds earlier.
 *
 * That the question is asked at all is not this file's business to prove; the
 * three answers are checked one at a time, against the real document, in
 * test/harness/unsaved.js.
 */
discardDialog.ask = async () => ({ response: 1 });

const OUT = resolve(process.argv[2] || join(process.cwd(), 'work', 'gradient-shots'));
mkdirSync(OUT, { recursive: true });

async function main() {
  const [win] = BrowserWindow.getAllWindows();
  const d = driver(win);
  const notes = {};

  await d.until(`document.getElementById('footer-export') !== null`, 'the window is built', 300);
  await d.installPump();

  async function shot(name, { size = null, frames = 10 } = {}) {
    if (size) {
      win.setContentSize(size[0], size[1]);
      await wait(300);
    }
    await d.pump(frames);
    await wait(200);
    const file = join(OUT, `${name}.png`);
    // Twice, and only the second kept: the first capture of a window nobody is
    // showing is what commits the canvas's own layer, so a single one comes
    // back with an empty stage (measured in shots.js).
    await win.capturePage();
    await wait(140);
    writeFileSync(file, (await win.capturePage()).toPNG());
    process.stdout.write(`shot ${file}\n`);
    return file;
  }

  win.setContentSize(1280, 820);
  await wait(300);

  // The first-start question, answered through the real handler so every
  // picture after this one is the ordinary working window.
  folderDialog.open = async () => ({ canceled: false, filePaths: [effectsFolder] });
  await d.js(`document.getElementById('first-run-choose').click(), true`);
  await d.until(`document.getElementById('first-run').hidden === true`, 'the question is answered', 100);

  // ------------------------------------------------------------ the gallery
  notes.gallery = await d.js(`(() => {
    const tiles = [...document.querySelectorAll('.tile')];
    return {
      count: tiles.length,
      disabled: tiles.filter((t) => t.disabled).map((t) => t.id),
      labels: tiles.map((t) => t.textContent.trim()),
      badges: document.querySelectorAll('.tile-badge').length
    };
  })()`);
  await shot('01-gallery');

  /** Start an effect from a tile and wait for the stage to take it. */
  async function start(tile) {
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
      section: document.querySelector('.nav-entry.is-active')?.dataset.destination ?? null,
      navDisabled: [...document.querySelectorAll('.nav-entry')]
        .filter((e) => e.disabled).map((e) => e.dataset.destination),
      headings: [...document.querySelectorAll('.field-group > h2')].map((h) => h.textContent.trim()),
      controls: [...document.querySelectorAll('#inspector-body input, #inspector-body select')]
        .map((e) => e.id || e.type),
      swatches: [...document.querySelectorAll('input[type=color]')].map((e) => e.value),
      // Whether the crop is inert: with nothing to crop the canvas must not be
      // a tab stop, must not claim to be an application, and must show no grab
      // cursor.
      canvasRole: canvas.getAttribute('role'),
      canvasTabIndex: canvas.getAttribute('tabindex'),
      canvasCursor: canvas.style.cursor,
      corners: { topLeft: px(2, 2), middle: px(160, 100), topRight: px(317, 2), bottomRight: px(317, 197) }
    };
  })()`);

  // ------------------------------------------------------------ a flat colour
  await start('solid');
  notes.solid = await state();
  await shot('02-solid');

  // A colour set the way the OS dialog sets it — value plus `input` — never by
  // clicking the swatch, which would open a real modal picker.
  const solidSwatch = await d.js(`document.querySelector('#inspector-body input[type=color]').id`);
  await d.setInput(solidSwatch, '#12c2a0');
  await d.pump(4);
  notes.solidRecoloured = await state();
  await shot('03-solid-recoloured');

  // ---------------------------------------------------------- a linear ramp
  await start('linear');
  notes.linear = await state();
  await shot('04-linear');

  // The settings column of a gradient, on its own destination.
  await d.js(`document.getElementById('nav-fill').click(), true`);
  await wait(120);
  notes.linearSettings = await state();
  await shot('05-linear-settings');

  // Turn it: the angle slider is the one control a radial gradient does not get.
  await d.setInput('sf-layers-0-angle', '90');
  await d.pump(4);
  notes.turned = await state();
  await shot('06-linear-turned');

  // A third colour stop, added by the button in the section heading.
  await d.js(`document.getElementById('sf-layers-0-stop-add').click(), true`);
  await wait(150);
  await d.pump(4);
  notes.threeStops = await state();
  await shot('07-three-stops');

  // ---------------------------------------------------------- a radial ramp
  await start('radial');
  notes.radial = await state();
  await d.js(`document.getElementById('nav-fill').click(), true`);
  await wait(120);
  await shot('08-radial');

  // ------------------------------------------------------ a motion running
  await d.js(`document.getElementById('nav-motions').click(), true`);
  await wait(120);
  await d.js(`document.getElementById('sf-layers-0-add').click(), true`);
  await d.until(`document.getElementById('sf-layers-0-motions-0-speed') !== null`, 'a motion was added', 100);
  await d.setInput('sf-layers-0-motions-0-speed', '80');
  await d.setInput('sf-layers-0-motions-0-amount', '100');
  await d.pump(10);
  const before = await d.stats();
  await shot('09-radial-with-motion');
  await d.pump(40);
  const after = await d.stats();
  notes.motion = {
    kind: await d.js(`document.getElementById('sf-layers-0-kind-0').value`),
    hashBefore: before.hash,
    hashAfter: after.hash,
    moved: before.hash !== after.hash
  };
  await shot('10-radial-with-motion-later');

  // ------------------------------------------- a gradient saved and opened
  const saved = join(runDir, 'gradient.sfx');
  projectDialogs.save = async () => ({ canceled: false, filePath: saved });
  await d.clickAndWait('footer-save');
  await d.js(`document.getElementById('gallery-solid').click(), true`);
  await d.until(`document.getElementById('sf-layers-0-color') !== null`, 'a solid took over', 100);
  projectDialogs.open = async () => ({ canceled: false, filePaths: [saved] });
  await d.clickAndWait('footer-open');
  await d.pump(6);
  notes.reopened = await state();
  await shot('11-gradient-reopened');

  // --------------------------------------------- and the export it produces
  const message = await d.clickAndWait('footer-export');
  notes.export = message;
  await shot('12-exported');

  // ----------------------------------- the picture path, still exactly as it was
  const wideUrl = await d.js(`(() => {
    const c = document.createElement('canvas');
    c.width = 960; c.height = 300;
    const g = c.getContext('2d');
    const bg = g.createLinearGradient(0, 0, 960, 0);
    bg.addColorStop(0, '#123');
    bg.addColorStop(1, '#514');
    g.fillStyle = bg; g.fillRect(0, 0, 960, 300);
    g.fillStyle = '#ffffff'; g.fillRect(470, 0, 20, 300);
    return c.toDataURL('image/png');
  })()`);
  const wide = normalizeDocument({
    name: 'Crop Check',
    layers: [{ id: 'image', type: 'image', asset: 'image', fit: 'cover', motions: [] }],
    assets: { image: { kind: 'image', mime: 'image/png', data: wideUrl.split(',')[1] } }
  }).doc;
  const wideFile = join(runDir, 'crop-check.sfx');
  writeFileSync(wideFile, serializeProject(wide), 'utf8');
  projectDialogs.open = async () => ({ canceled: false, filePaths: [wideFile] });
  await d.clickAndWait('footer-open');
  await d.pump(4);
  notes.picture = await state();

  await win.webContents.debugger.attach('1.3');
  const canvas = await d.box('#preview-canvas');
  const perCanvasPixel = canvas.width / 320;
  const markerBefore = (await d.stats()).brightestColumn;
  await d.drag(canvas.cx, canvas.cy, canvas.cx - 20 * perCanvasPixel, canvas.cy);
  await d.pump(4);
  const markerAfter = (await d.stats()).brightestColumn;
  notes.crop = { markerBefore, markerAfter, moved: markerAfter - markerBefore };
  await shot('13-picture-still-works');

  process.stdout.write(`${JSON.stringify(notes, null, 2)}\n`);
  writeFileSync(join(OUT, 'notes.json'), JSON.stringify(notes, null, 2), 'utf8');
}

// runHarness ends this process however main() ends — see test/harness/driver.js.
runHarness('gradient-shots', main);
