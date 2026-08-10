// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Photograph the real window without ever showing it.
 *
 *   npx electron test/harness/shots.js [folder]
 *
 * The same shape as selftest.js and walkthrough.js — it imports the real
 * app/main.js, which registers every IPC handler and opens the real window —
 * with one difference that is the whole point of the file: it asks
 * test/harness/sandbox.js for `show: false` first, so the window is created,
 * loaded, driven and captured but never appears on screen and never takes the
 * focus. Judging how this app LOOKS used to mean a window jumping in front of
 * whoever is using the machine, once per run. It does not any more.
 *
 * WHY THERE IS A FRAME PUMP
 *
 * A window Chromium is not showing does not tick requestAnimationFrame, and
 * the preview's render loop is a requestAnimationFrame chain — so with no help
 * the canvas in every picture would be empty. `d.installPump()` and `d.pump()`
 * (see test/harness/driver.js, which says at length how and why) take those
 * frames over from the outside; it is why `driver.settle()` is not used here,
 * because settle() waits for two REAL animation frames and a hidden window
 * never produces any.
 *
 * WHY THE PICTURE ARRIVES BY OPENING A PROJECT
 *
 * The drag-and-drop path is the other way a picture gets in, and
 * test/harness/unsaved.js proves it works — but it has to raise and focus the
 * window to do it, because Chromium's drag pipeline will not serve a window
 * nobody is looking at. That is exactly the interruption this file exists to
 * avoid, so the picture comes in through the app's own "open project" button
 * instead: same renderer, same document, same render loop, no window in
 * anybody's face.
 *
 * Nothing here touches the machine's real SignalRGB folder: userData, the
 * export sandbox and the search for an installation all point into a throwaway
 * directory, exactly as the self-test arranges them.
 */
import { app, BrowserWindow } from 'electron';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { serializeProject } from '../../src/main/project.js';
import { normalizeDocument } from '../../src/engine/document.js';
import { projectDialogs, folderDialog } from '../../app/main.js';
import { driver, wait } from './driver.js';
import { harnessSandbox } from './sandbox.js';

// The throwaway directory, the sandbox around the effects folder, and the one
// setting this file exists for: `show: false`. All of it in test/harness/
// sandbox.js, which is where the five Electron harnesses share it.
const { runDir, effectsFolder } = harnessSandbox('shots', { show: false });

const OUT = resolve(process.argv[2] || join(process.cwd(), 'work', 'redesign-shots', 'signalrgb'));
mkdirSync(OUT, { recursive: true });

/**
 * A picture worth looking at, drawn in the window's own canvas and handed back
 * as PNG bytes: three soft colour fields, a horizon and one bright vertical
 * bar. The bar is there so a crop drag can be SEEN to have moved in a
 * screenshot, not only measured.
 */
const DRAW_SAMPLE = `(() => {
  const c = document.createElement('canvas');
  c.width = 960; c.height = 600;
  const g = c.getContext('2d');
  const sky = g.createLinearGradient(0, 0, 0, 600);
  sky.addColorStop(0, '#10204a');
  sky.addColorStop(0.55, '#8a2b5c');
  sky.addColorStop(1, '#f0a154');
  g.fillStyle = sky; g.fillRect(0, 0, 960, 600);
  const sun = g.createRadialGradient(660, 250, 10, 660, 250, 210);
  sun.addColorStop(0, '#fff2c4');
  sun.addColorStop(1, 'rgba(255,200,120,0)');
  g.fillStyle = sun; g.fillRect(0, 0, 960, 600);
  g.fillStyle = '#141a2e';
  g.beginPath(); g.moveTo(0, 430);
  for (let x = 0; x <= 960; x += 40) g.lineTo(x, 430 - Math.sin(x / 110) * 46 - (x % 240 === 0 ? 40 : 0));
  g.lineTo(960, 600); g.lineTo(0, 600); g.closePath(); g.fill();
  g.fillStyle = '#ffffff'; g.fillRect(300, 0, 12, 600);
  return c.toDataURL('image/png');
})()`;

/**
 * A picture with slack in it: 960 x 300, i.e. far wider than the 320 x 200
 * frame, with one white bar to follow. On `cover` it is scaled to 640 x 200,
 * so there are 320 canvas pixels the crop can actually travel — which is what
 * the 1:1 check below needs and what the 16:10 picture above cannot give.
 */
const WIDE_SAMPLE = `(() => {
  const c = document.createElement('canvas');
  c.width = 960; c.height = 300;
  const g = c.getContext('2d');
  const bg = g.createLinearGradient(0, 0, 960, 0);
  bg.addColorStop(0, '#123');
  bg.addColorStop(1, '#514');
  g.fillStyle = bg; g.fillRect(0, 0, 960, 300);
  g.fillStyle = '#ffffff'; g.fillRect(470, 0, 20, 300);
  return c.toDataURL('image/png');
})()`;

async function main() {
  const [win] = BrowserWindow.getAllWindows();
  const d = driver(win);
  const notes = {};

  // Real mouse events go through the debugging protocol, which has to be
  // attached before driver.drag() can send anything — the same line
  // test/harness/unsaved.js and walkthrough.js open with.
  await win.webContents.debugger.attach('1.3');

  await d.until(`document.getElementById('footer-export') !== null`, 'the window is built', 300);
  await d.installPump();

  /**
   * One photograph. Pumps a few frames first so what is captured is the state
   * after the change rather than the frame before it, then gives the
   * compositor a moment — capturePage() renders on demand, which is what makes
   * a window nobody can see photographable at all.
   */
  let at = [1280, 820];

  async function shot(name, { size = null, frames = 10 } = {}) {
    if (size) {
      at = size;
      win.setContentSize(at[0], at[1]);
      await wait(300);
    }
    await d.pump(frames);
    await wait(200);
    const file = join(OUT, `${name}.png`);
    // Captured twice, and only the second one kept. capturePage() on a window
    // nobody is showing renders on demand, and the FIRST such render is what
    // finally commits the canvas's own layer — so the first picture of a
    // freshly drawn frame shows an EMPTY stage and the second shows the
    // effect. That is measured, not guessed: with a single capture the canvas
    // came out blank in the file while getImageData on that very canvas
    // reported a full picture (see notes.canvas at the end of this run).
    await win.capturePage();
    await wait(140);
    writeFileSync(file, (await win.capturePage()).toPNG());
    process.stdout.write(`shot ${file}\n`);
    return file;
  }

  // ------------------------------------------------------- the empty window
  await shot('01-empty', { size: [1280, 820] });

  // The first-start question is answered through the real handler, so every
  // shot after this one is the ordinary working window rather than the one
  // that is still asking where to put things.
  folderDialog.open = async () => ({ canceled: false, filePaths: [effectsFolder] });
  await d.js(`document.getElementById('first-run-choose').click(), true`);
  await d.until(`document.getElementById('first-run').hidden === true`, 'the question is answered', 100);
  await shot('02-empty-settled');

  // ------------------------------------------------------------ a picture in
  const dataUrl = await d.js(DRAW_SAMPLE);
  const seed = normalizeDocument({
    name: 'Sunset Ridge',
    brightness: 78, saturation: 118, greenMagenta: -8, blueYellow: 12,
    layers: [{
      id: 'image', type: 'image', asset: 'image', fit: 'cover',
      offset: { x: -0.15, y: 0.1 },
      motions: [{ kind: 'drift', speed: 24, amount: 40 }]
    }],
    assets: { image: { kind: 'image', mime: 'image/png', data: dataUrl.split(',')[1] } }
  }).doc;
  const seedFile = join(runDir, 'sunset-ridge.sfx');
  writeFileSync(seedFile, serializeProject(seed), 'utf8');
  projectDialogs.open = async () => ({ canceled: false, filePaths: [seedFile] });

  await d.clickAndWait('footer-open');
  await d.until(
    `document.getElementById('preview-body').classList.contains('has-picture')`,
    'the picture is on the stage',
    200
  );
  // Enough frames that the rolling cost average has something in it and the
  // drift motion has visibly moved.
  await d.pump(60);
  notes.canvas = await d.stats();
  notes.cost = await d.cost();
  await shot('03-picture-loaded');

  // ------------------------------------------------- the settings column, all
  for (const [key, name] of [['image', '04-settings-image'], ['motions', '05-settings-motions'],
    ['colour', '06-settings-colour'], ['settings', '07-settings-app']]) {
    await d.js(`document.getElementById('nav-${key}').click(), true`);
    await wait(120);
    await shot(name, { frames: 4 });
  }
  await d.js(`document.getElementById('nav-colour').click(), true`);

  // -------------------------------------------------------- the two extremes
  await shot('08-smallest-1040x700', { size: [1040, 700] });
  await shot('09-large-1760x1000', { size: [1760, 1000] });

  // Back to the ordinary size for the one that goes beside the reference.
  await shot('10-beside-the-reference', { size: [1280, 820] });

  // And the empty window at the smallest size, which is where blank space
  // shows first if there is any.
  await d.js(`document.getElementById('nav-colour').click(), true`);
  notes.regions = await d.js(`(() => {
    const box = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { w: Math.round(b.width), h: Math.round(b.height) };
    };
    return {
      nav: box('#nav'), stage: box('#preview'), settings: box('#inspector'),
      transport: box('#footer'), canvas: box('#preview-canvas'), gallery: box('#gallery'),
      // What the left column actually holds, and where every slider and value
      // in the window really is. A capture of a window nobody is showing can
      // put stale compositor tiles in the wrong place — one run drew fragments
      // of the settings column over the left one — so the DOM is asked
      // directly rather than the picture being trusted.
      navHolds: document.getElementById('nav').textContent.replace(/\\s+/g, ' ').trim(),
      controlsLeftOf200: [...document.querySelectorAll('input[type=range], output')]
        .filter((e) => e.getBoundingClientRect().left < 200)
        .map((e) => e.id)
    };
  })()`);

  // ------------------------------------------ the crop drag, still 1:1
  //
  // LAST, and that is not tidiness: a crop drag leaves the document unsaved,
  // and opening another project after it makes the app ask the question it is
  // supposed to ask - a real, window-modal OS dialog that would sit here
  // waiting for a human. So nothing follows it.
  //
  // The canvas's DISPLAY size changed in this pass (its backing store did not
  // and never may — it is SF.CANVAS_WIDTH x SF.CANVAS_HEIGHT), and mountCrop
  // converts screen pixels to canvas pixels through getBoundingClientRect().
  // So the conversion is only right if it is measured at the size the canvas
  // is actually drawn at, which is what this does: a real protocol mouse drag
  // across a picture wide enough to have slack, and the white marker bar in
  // the rendered frame read before and after.
  //
  // A picture of 960 x 300 into a 320 x 200 frame on `cover` is scaled to
  // 640 x 200, i.e. 320 canvas pixels of horizontal slack — the earlier one is
  // 16:10 like the frame itself and has none, which is why it cannot be used
  // for this.
  const wideUrl = await d.js(WIDE_SAMPLE);
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

  const canvas = await d.box('#preview-canvas');
  // Twenty canvas pixels, expressed in the screen pixels this canvas is
  // currently drawn at.
  const perCanvasPixel = canvas.width / 320;
  const before = (await d.stats()).brightestColumn;
  await d.drag(canvas.cx, canvas.cy, canvas.cx - 20 * perCanvasPixel, canvas.cy);
  await d.pump(4);
  const after = (await d.stats()).brightestColumn;
  notes.crop = {
    cssPixelsPerCanvasPixel: Number(perCanvasPixel.toFixed(4)),
    draggedCanvasPixels: -20,
    markerBefore: before,
    markerAfter: after,
    movedCanvasPixels: after - before
  };
  await shot('12-crop-dragged-1to1');
  process.stdout.write(`${JSON.stringify(notes)}\n`);
  app.exit(0);
}

app.whenReady().then(() => {
  // app/main.js's own whenReady handler runs first and has already created the
  // window (see the comment there on registration order), so there is one to
  // find.
  main().catch((err) => {
    process.stderr.write(`${err && err.stack ? err.stack : err}\n`);
    app.exit(1);
  });
});
