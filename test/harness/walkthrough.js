// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * The acceptance walkthrough: the whole app, worked through from the outside
 * the way a person works through it, with a picture of every step.
 *
 * This is an Electron main entry of its own. It imports app/main.js — the real
 * one, unchanged — which registers every IPC handler and opens the real window
 * on its own; this file then reaches into that window with Chrome DevTools
 * Protocol input events, so the mouse and the keyboard arrive the way the
 * operating system's do rather than as JavaScript calling functions directly.
 * That distinction has caught real bugs in this project before: a handler can
 * be "called successfully" and still be unreachable with an actual pointer.
 *
 * What is driven by genuine input events, and what is not, spelled out rather
 * than buried, because a walkthrough that claims more than it did is worse
 * than one that admits its edges:
 *
 *  - Genuine CDP input: dragging the picture in (a real drag carrying a real
 *    file path), the crop drag (press, a run of moves, release), every button
 *    press at its own coordinates, the pointer move that makes the grab cursor
 *    appear, Tab and the arrow keys, and — point 11 — tabbing to the preview
 *    canvas and moving the crop there with plain and Shift-held arrows.
 *  - Set on the element, with the same event a person's gesture fires: the
 *    dropdowns (a <select>'s popup is drawn by the operating system and is out
 *    of reach of page input) and the sliders (these steps are about exact
 *    values — 0, 30, 100 — which a mouse landing on a track cannot promise).
 *    Point 11 closes that gap from the other side: it moves a slider with real
 *    arrow keys and checks the number really changed.
 *  - Stubbed: the three OS file dialogs, through the seams app/main.js
 *    exports. A modal dialog would sit waiting for a human.
 *  - Built in the page: the ".mp4 is refused" drop, because that refusal is
 *    decided by the file's name before anything touches the disk.
 *
 * Everything the app itself does — the import, the crop arithmetic, the render
 * loop, the export, the project file — is its own code doing its own work.
 *
 * Run it in two phases, as two separate processes, because "restart the app
 * and open the project again" is only worth anything if the app really does
 * stop and start:
 *
 *   SF_WALK_OUT=<folder> npx electron test/harness/walkthrough.js
 *   SF_WALK_OUT=<folder> SF_WALK_PHASE=2 npx electron test/harness/walkthrough.js
 *
 * Phase 1 writes state.json into SF_WALK_OUT; phase 2 reads it, so the second
 * process finds the same settings, the same effects folder and the same saved
 * project. Both write screenshots and a report-<phase>.json next to it.
 *
 * Nothing here may touch the machine's real SignalRGB folder. Three separate
 * things see to that: userData is redirected into SF_WALK_OUT, a settings file
 * naming a throwaway effects folder is put there before the app starts, and
 * phase 1 reads the folder back off the footer and refuses to go on if it is
 * not the throwaway one. The first of those alone was not enough, and finding
 * that out is why the other two exist.
 */
import { app, BrowserWindow } from 'electron';
import { writeFileSync, readFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { projectDialogs, folderDialog } from '../../app/main.js';
import { driver, wait } from './driver.js';

const OUT = process.env.SF_WALK_OUT;
const PHASE = process.env.SF_WALK_PHASE === '2' ? 2 : 1;
if (!OUT) throw new Error('SF_WALK_OUT must name a folder to write the walkthrough into');
mkdirSync(OUT, { recursive: true });

const STATE_FILE = join(OUT, 'state.json');
const shotsDir = join(OUT, 'shots');
const userDataDir = join(OUT, 'userdata');
const effectsFolder = join(OUT, 'Effects');
mkdirSync(shotsDir, { recursive: true });
mkdirSync(userDataDir, { recursive: true });
mkdirSync(effectsFolder, { recursive: true });

// This block has to run before app/main.js's own app.whenReady handler does,
// and it does: importing that module only REGISTERS the handler, and every
// module body finishes before the ready event fires.
//
// The first run of this walkthrough got it wrong and it mattered. Redirecting
// userData alone is not enough, because resolveEffectsTarget falls back to
// LOOKING for an installation under the real Documents folder when the
// settings name none — so the exports went straight into the machine owner's
// actual SignalRGB folder. Naming the throwaway folder in a settings file the
// app finds on startup is what stops that; the check in phaseOne() reads the
// footer back before pressing any export button, so a future mistake of the
// same shape stops the run instead of writing somewhere real.
app.setPath('userData', userDataDir);
// A window that ends up behind another one is "occluded", and Chromium then
// stops giving it animation frames. Everything here waits for two of those
// before it photographs anything, so a run that happens to lose the foreground
// half way through does not fail — it hangs, silently, forever. That happened.
// These three switches keep the renderer running at full speed whatever is in
// front of it; they belong to this harness and change nothing about the app.
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
// The fourth guard, and the only one that is not specific to this file: name
// the sandbox app/main.js must stay inside (src/main/effects-target.js). It is
// set here rather than passed in because app/main.js reads it at call time, not
// at import time — an ES import runs before every statement in this file, so
// setting it earlier is not possible. With it set, even a settings file that
// named somewhere real would be refused rather than written into.
process.env.SF_EFFECTS_SANDBOX = OUT;
const settingsFile = join(userDataDir, 'settings.json');
if (!existsSync(settingsFile)) {
  // Deliberately no language: phase 1 is meant to be a genuine first start for
  // the language, which is what point 1 is about.
  writeFileSync(settingsFile, JSON.stringify({ effectsFolder, lastProjectFolder: OUT }, null, 2), 'utf8');
}

/** Every measurement and every judgement, written out at the end. */
const report = { phase: PHASE, points: {}, notes: [] };
const note = (text) => { report.notes.push(text); process.stdout.write(`note: ${text}\n`); };

// ---------------------------------------------------------------------------
// A test picture, built here rather than shipped: 800 x 200, a hue sweep left
// to right (so saturation and the two colour axes have something to bite on)
// with one pure-white bar in the middle of it. The bar is the marker the crop
// drag is measured against — "the picture follows the pointer" is a claim
// about which direction a recognisable thing moves, and a gradient alone has
// nothing recognisable in it.
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** h in 0..360, s and l in 0..1 -> [r, g, b] in 0..255. */
function hsl(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x]
    : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

const IMAGE_WIDTH = 800;
const IMAGE_HEIGHT = 200;
/** Where the white marker bar sits in the source picture. */
const BAR_FROM = 396;
const BAR_TO = 404;

function writeTestImage(file) {
  const raw = Buffer.alloc(IMAGE_HEIGHT * (1 + IMAGE_WIDTH * 3));
  let o = 0;
  for (let y = 0; y < IMAGE_HEIGHT; y += 1) {
    raw[o] = 0; // filter: none
    o += 1;
    for (let x = 0; x < IMAGE_WIDTH; x += 1) {
      const inBar = x >= BAR_FROM && x < BAR_TO;
      const [r, g, b] = inBar ? [255, 255, 255] : hsl((x / IMAGE_WIDTH) * 300, 1, 0.5);
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b;
      o += 3;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(IMAGE_WIDTH, 0);
  ihdr.writeUInt32BE(IMAGE_HEIGHT, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 2;  // colour type: truecolour
  writeFileSync(file, Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0))
  ]));
}

// ---------------------------------------------------------------------------
// Working the window
// ---------------------------------------------------------------------------

/**
 * How this walkthrough drives the window: see test/harness/driver.js, which
 * test/harness/selftest.js uses too. The screenshots land in SF_WALK_OUT/shots
 * and are named relative to SF_WALK_OUT in the report, so a reader of
 * report-<phase>.json can follow them from where the report itself is.
 */
const DRIVING = { shotsDir, shotLabel: (name) => `shots/${name}.png` };

/** How far apart two brightness profiles are, after taking the level out. */
function shapeDistance(a, b) {
  const meanA = a.reduce((s, v) => s + v, 0) / a.length;
  const meanB = b.reduce((s, v) => s + v, 0) / b.length;
  if (meanA <= 0 || meanB <= 0) return 0;
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) sum += Math.abs(a[i] / meanA - b[i] / meanB);
  return sum / a.length;
}

// ---------------------------------------------------------------------------
// The eleven points
// ---------------------------------------------------------------------------

async function phaseOne(win, state) {
  const d = driver(win, DRIVING);
  const p = report.points;

  await d.until(`document.getElementById('footer-export') !== null`, 'the window is built');

  // Before anything is exported: the folder on screen is the one that will be
  // written to, so reading it back is the last chance to notice that this run
  // is pointed at a real installation rather than a throwaway folder.
  report.exportTargetOnScreen = await d.js(`document.getElementById('footer-target').textContent`);
  if (!report.exportTargetOnScreen.includes(state.effectsFolder)) {
    throw new Error(
      `the window is not pointed at the throwaway effects folder (${state.effectsFolder}), ` +
      `it says: ${report.exportTargetOnScreen}`
    );
  }

  p['1'] = { name: 'start fresh, switch the language to English and back', shots: [] };

  // --- 1. language --------------------------------------------------------
  const words = () => d.js(`({
    settings: document.getElementById('nav-settings-label').textContent,
    section: document.querySelector('#inspector-body .field-group > h3').textContent,
    exportButton: document.getElementById('footer-export').textContent,
    brightness: document.querySelector('label[for="sf-brightness"]').textContent,
    hint: document.getElementById('preview-empty-title').textContent,
    formats: document.getElementById('preview-empty-formats').textContent,
    lang: document.documentElement.lang
  })`);
  p['1'].startedIn = await words();
  p['1'].storedAtStart = await d.js(`window.sf.settings.all().then((s) => s.language)`);
  p['1'].shots.push(await d.shot('p1-a-fresh-start'));

  // Operated with the mouse, on the control itself: open the dropdown, pick
  // the other entry. A <select>'s popup is drawn by the operating system and
  // is out of reach of page-level input events, so the value is set on the
  // element and the change event fired — the same event the user's click
  // produces, arriving at the same listener.
  const setLanguage = async (code) => {
    await d.setSelect('settings-language', code);
    await wait(80);
  };
  await setLanguage('en');
  p['1'].inEnglish = await words();
  p['1'].shots.push(await d.shot('p1-b-english'));
  await setLanguage('de');
  p['1'].backInGerman = await words();
  p['1'].shots.push(await d.shot('p1-c-german-again'));
  p['1'].storedAfterwards = await d.js(`window.sf.settings.all().then((s) => s.language)`);
  p['1'].result =
    p['1'].inEnglish.settings === 'Settings' &&
    p['1'].inEnglish.section === 'Colour' &&
    p['1'].inEnglish.brightness === 'Brightness' &&
    p['1'].backInGerman.settings === 'Einstellungen' &&
    p['1'].backInGerman.section === 'Farbe' &&
    p['1'].storedAfterwards === 'de' ? 'pass' : 'fail';

  // --- 2. drag a picture in ----------------------------------------------
  p['2'] = { name: 'drag an image in - does it appear?', shots: [] };
  const preview = await d.box('#preview-body');
  const before = await d.stats();

  // A real drag, carried by the browser's own drag pipeline with a real file
  // path in it — which is the only kind webUtils.getPathForFile in the preload
  // can resolve, so this also proves the import is reachable by dragging and
  // not merely by calling the handler.
  const dragData = { items: [], files: [state.imageFile], dragOperationsMask: 1 };
  try {
    await d.send('Input.setInterceptDrags', { enabled: false });
  } catch {
    // Older protocol revisions do not have it; dispatchDragEvent below is
    // what actually matters and reports its own failure.
  }
  for (const type of ['dragEnter', 'dragOver', 'drop']) {
    await d.send('Input.dispatchDragEvent', { type, x: preview.cx, y: preview.cy, data: dragData });
    await wait(120);
  }
  try {
    // "the message went blank" used to be the proof the picture arrived. It
    // cannot be any more: the line starts blank now, because the invitation it
    // used to carry moved into the empty frame — so waiting for blank would be
    // satisfied before the drag had done anything at all. The class the window
    // puts on the panel when it HAS a picture says the same thing positively.
    await d.until(
      `document.getElementById('preview-body').classList.contains('has-picture')`,
      'the picture is loaded',
      100
    );
    p['2'].howDriven = 'CDP Input.dispatchDragEvent carrying a real file path';
  } catch (error) {
    p['2'].dragError = String(error.message || error);
    throw new Error(`the drag-and-drop import did not work: ${p['2'].dragError}`);
  }
  await wait(300);
  const after = await d.stats();
  p['2'].message = await d.message();
  p['2'].nameField = await d.js(`document.getElementById('footer-name').value`);
  p['2'].canvasChanged = before.hash !== after.hash;
  p['2'].meanBefore = before.mean;
  p['2'].meanAfter = after.mean;
  p['2'].shots.push(await d.shot('p2-picture-dropped'));
  p['2'].result = p['2'].canvasChanged && after.mean > 20 ? 'pass' : 'fail';

  // --- 3. drag inside the preview ----------------------------------------
  p['3'] = { name: 'drag inside the preview - does the picture follow, does it stop at the edge?', shots: [] };
  const canvas = await d.box('#preview-canvas');
  const start = await d.stats();
  p['3'].barAtStart = start.brightestColumn;
  // The cursor is set by the app when the pointer moves over the canvas, so it
  // has to be moved there first — reading the property without moving anything
  // reports the empty string and says nothing about the app.
  await d.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: canvas.cx, y: canvas.cy, buttons: 0 });
  await wait(80);
  p['3'].cursor = await d.js(`document.getElementById('preview-canvas').style.cursor`);

  await d.drag(canvas.cx, canvas.cy, canvas.cx + 200, canvas.cy);
  const movedRight = await d.stats();
  p['3'].barAfterDraggingRight = movedRight.brightestColumn;
  p['3'].shots.push(await d.shot('p3-a-dragged-right'));

  await d.drag(canvas.cx, canvas.cy, canvas.cx - 400, canvas.cy);
  const movedLeft = await d.stats();
  p['3'].barAfterDraggingLeft = movedLeft.brightestColumn;

  // Far past the end, then far past it again: at the edge the two must be the
  // same picture, which is the only honest way to say "it stops".
  await d.drag(canvas.cx, canvas.cy, canvas.cx - 3000, canvas.cy, 20);
  const atEdge = await d.stats();
  await d.drag(canvas.cx, canvas.cy, canvas.cx - 3000, canvas.cy, 20);
  const pastEdge = await d.stats();
  p['3'].stopsAtTheEdge = atEdge.hash === pastEdge.hash;
  p['3'].shots.push(await d.shot('p3-b-at-the-edge'));

  // Back to the middle for everything that follows.
  await d.drag(canvas.cx, canvas.cy, canvas.cx + 3000, canvas.cy, 20);
  await d.drag(canvas.cx, canvas.cy, canvas.cx - 620, canvas.cy, 20);
  p['3'].followsThePointer = p['3'].barAfterDraggingRight > p['3'].barAtStart
    && p['3'].barAfterDraggingLeft < p['3'].barAtStart;
  p['3'].result = p['3'].followsThePointer && p['3'].stopsAtTheEdge && p['3'].cursor === 'grab'
    ? 'pass' : 'fail';

  // --- 4. fit mode --------------------------------------------------------
  p['4'] = { name: 'change the fit mode - does the view change?', shots: [] };
  const setSelect = async (id, value) => {
    await d.setSelect(id, value);
    await wait(200);
  };
  const cover = await d.stats();
  await setSelect('sf-layers-0-fit', 'contain');
  const contain = await d.stats();
  p['4'].shots.push(await d.shot('p4-a-contain'));
  await setSelect('sf-layers-0-fit', 'stretch');
  const stretch = await d.stats();
  p['4'].shots.push(await d.shot('p4-b-stretch'));
  await setSelect('sf-layers-0-fit', 'cover');
  const coverAgain = await d.stats();
  p['4'].means = { cover: cover.mean, contain: contain.mean, stretch: stretch.mean };
  p['4'].containIsLetterboxed = contain.mean < cover.mean * 0.75;
  p['4'].allThreeDiffer = new Set([cover.hash, contain.hash, stretch.hash]).size === 3;
  p['4'].returnsToCover = coverAgain.hash === cover.hash;
  p['4'].result = p['4'].allThreeDiffer && p['4'].containIsLetterboxed && p['4'].returnsToCover
    ? 'pass' : 'fail';

  // --- 6. saturation and the colour axes (before brightness, so the
  //        measurements are taken on a picture at full strength) ------------
  p['6'] = { name: 'saturation to 0 - grey? colour axes - does the tint shift?', shots: [] };
  const slider = async (id, value) => {
    await d.setInput(id, value);
    await wait(150);
  };
  const colourful = await d.stats();
  await slider('sf-saturation', 0);
  const grey = await d.stats();
  p['6'].shots.push(await d.shot('p6-a-saturation-zero'));
  p['6'].saturationFull = colourful.saturation;
  p['6'].saturationZero = grey.saturation;
  p['6'].greyChannelSpread = Math.max(
    Math.abs(grey.r - grey.g), Math.abs(grey.g - grey.b), Math.abs(grey.r - grey.b)
  );
  await slider('sf-saturation', 100);

  const neutral = await d.stats();
  await slider('sf-greenMagenta', -100);
  const green = await d.stats();
  p['6'].shots.push(await d.shot('p6-b-green'));
  await slider('sf-greenMagenta', 100);
  const magenta = await d.stats();
  p['6'].shots.push(await d.shot('p6-c-magenta'));
  await slider('sf-greenMagenta', 0);
  await slider('sf-blueYellow', -100);
  const blue = await d.stats();
  p['6'].shots.push(await d.shot('p6-d-blue'));
  await slider('sf-blueYellow', 100);
  const yellow = await d.stats();
  p['6'].shots.push(await d.shot('p6-e-yellow'));
  await slider('sf-blueYellow', 0);

  // Which way each axis runs is the photo editor's convention and matches the
  // label read left to right: greenMagenta -100 is green and +100 is magenta,
  // blueYellow -100 is blue and +100 is yellow (src/engine/color.js takes the
  // named channel DOWN as the value goes up). The first run of this
  // walkthrough asserted the opposite and reported a failure that was its own.
  p['6'].greenMagenta = {
    neutralGreenMinusRed: neutral.g - neutral.r,
    atMinus100_green: green.g - green.r,
    atPlus100_magenta: magenta.g - magenta.r
  };
  p['6'].blueYellow = {
    neutralBlueMinusRed: neutral.b - neutral.r,
    atMinus100_blue: blue.b - blue.r,
    atPlus100_yellow: yellow.b - yellow.r
  };
  p['6'].result =
    grey.saturation < 0.02 && colourful.saturation > 0.5 && p['6'].greyChannelSpread < 2 &&
    green.g - green.r > neutral.g - neutral.r && magenta.g - magenta.r < neutral.g - neutral.r &&
    blue.b - blue.r > neutral.b - neutral.r && yellow.b - yellow.r < neutral.b - neutral.r
      ? 'pass' : 'fail';

  // --- 7. brightness and the cost readout ---------------------------------
  p['7'] = { name: 'brightness - does it darken? cost readout - under 15 %?', shots: [] };
  const bright = await d.stats();
  await slider('sf-brightness', 30);
  const dim = await d.stats();
  p['7'].shots.push(await d.shot('p7-a-dimmed'));
  p['7'].meanAt100 = bright.mean;
  p['7'].meanAt30 = dim.mean;
  await slider('sf-brightness', 100);
  // The readout is a rolling average over 30 frames, so it has to be given
  // those frames before it is read — otherwise it still carries the cost of
  // whatever was on screen a moment ago.
  await wait(1500);
  p['7'].costWithoutMotion = await d.cost();
  p['7'].darkens = dim.mean < bright.mean * 0.6;

  // --- 9a. export, and the same picture read back out of the exported file --
  p['9'] = { name: 'export, and confirm the result', shots: [] };
  const stillPreview = await d.stats();
  await d.setInput('footer-name', 'Walkthrough Still');
  const exportBox = await d.box('#footer-export');
  await d.click(exportBox.cx, exportBox.cy);
  await d.until(
    `document.querySelector('.drop-message').textContent.includes('Walkthrough Still.html')`,
    'the still effect is exported'
  );
  p['9'].stillMessage = await d.message();
  p['9'].shots.push(await d.shot('p9-a-exported'));

  // --- 5. two motions at once ---------------------------------------------
  p['5'] = { name: 'turn on warp and breathe at the same time - can you see both?', shots: [] };
  const addBox = await d.box('#sf-layers-0-add');
  await d.click(addBox.cx, addBox.cy);
  await wait(250);
  p['5'].firstKind = await d.js(`document.getElementById('sf-layers-0-kind-0').value`);
  const addAgain = await d.box('#sf-layers-0-add');
  await d.click(addAgain.cx, addAgain.cy);
  await wait(250);
  await setSelect('sf-layers-0-kind-1', 'breathe');
  p['5'].kinds = await d.js(`Array.from(document.querySelectorAll('#inspector-body select'))
    .filter((s) => s.id.includes('-kind-')).map((s) => s.value)`);
  // Both motions right up, so what they do is unmistakable rather than subtle.
  await slider('sf-layers-0-motions-0-amount', 100);
  await slider('sf-layers-0-motions-0-speed', 60);
  await slider('sf-layers-0-motions-1-amount', 100);
  await slider('sf-layers-0-motions-1-speed', 60);

  const frames = [];
  for (let i = 0; i < 12; i += 1) {
    frames.push(await d.stats());
    await wait(160);
  }
  p['5'].shots.push(await d.shot('p5-a-warp-and-breathe'));
  await wait(500);
  p['5'].shots.push(await d.shot('p5-b-warp-and-breathe-later'));

  const means = frames.map((f) => f.mean);
  // Breathe shows up as the LEVEL moving: it scales the whole frame's opacity
  // and shifts nothing.
  p['5'].brightnessSwing = (Math.max(...means) - Math.min(...means)) / (Math.max(...means) || 1);
  // Warp shows up as the marker bar MOVING, per row and independently: it
  // displaces pixels and leaves the level alone. Two different measurements of
  // two different things in one recording, which is what "you can see both"
  // has to mean.
  p['5'].markerTravel = [0, 1, 2].map((row) => {
    const xs = frames.map((f) => f.bars[row]);
    return Math.max(...xs) - Math.min(...xs);
  });
  p['5'].rowsDisagree = Math.max(...frames.map((f) => Math.max(...f.bars) - Math.min(...f.bars)));
  p['5'].largestProfileChange = Math.max(
    ...frames.map((f, i) => (i === 0 ? 0 : shapeDistance(frames[0].columns, f.columns)))
  );
  p['5'].framesDiffer = new Set(frames.map((f) => f.hash)).size === frames.length;
  p['5'].result = p['5'].brightnessSwing > 0.1 && Math.max(...p['5'].markerTravel) >= 2
    && p['5'].framesDiffer ? 'pass' : 'fail';

  // The cost readout again, now with the most expensive thing the app can do
  // switched on — which is the number the 15 % rule is actually about.
  await wait(1500);
  p['7'].costWithMotion = await d.cost();
  p['7'].shots.push(await d.shot('p7-b-cost-with-motion'));

  // And the worst case the app can actually produce: both motions running AND
  // the colour pass switched on, which is skipped entirely while the colour
  // settings are neutral. That is the number the 15 % rule is about.
  await slider('sf-saturation', 140);
  await slider('sf-brightness', 80);
  await wait(1800);
  p['7'].costWorstCase = await d.cost();
  p['7'].shots.push(await d.shot('p7-c-cost-worst-case'));
  await slider('sf-saturation', 100);
  await slider('sf-brightness', 100);
  await wait(1500);

  const share = (text) => Number(/([\d.]+)\s*%/.exec(text)?.[1] ?? NaN);
  p['7'].shareWithoutMotion = share(p['7'].costWithoutMotion);
  p['7'].shareWithMotion = share(p['7'].costWithMotion);
  p['7'].shareWorstCase = share(p['7'].costWorstCase);
  p['7'].result = p['7'].darkens && p['7'].shareWithoutMotion < 15
    && p['7'].shareWithMotion < 15 && p['7'].shareWorstCase < 15 ? 'pass' : 'fail';

  // --- 9b. the moving effect, exported ------------------------------------
  await d.setInput('footer-name', 'Walkthrough Moving');
  const exportAgain = await d.box('#footer-export');
  await d.click(exportAgain.cx, exportAgain.cy);
  await d.until(
    `document.querySelector('.drop-message').textContent.includes('Walkthrough Moving.html')`,
    'the moving effect is exported'
  );
  p['9'].movingMessage = await d.message();
  p['9'].filesInTarget = readdirSync(state.effectsFolder);
  p['9'].stillPreviewStats = {
    r: stillPreview.r, g: stillPreview.g, b: stillPreview.b, mean: stillPreview.mean
  };
  // Handed to phase 2 through state.json: the comparison against the exported
  // file happens over there, in the process that opens it.
  state.stillPreviewStats = p['9'].stillPreviewStats;
  state.stillPreviewColumns = stillPreview.columns;

  // --- 10. an .mp4 --------------------------------------------------------
  p['10'] = { name: 'drag an .mp4 in - is the refusal comprehensible?', shots: [] };
  p['10'].howDriven =
    'a drop event built in the page carrying a File named clip.mp4 - the refusal is decided ' +
    'by the name before anything reaches the disk, so a real OS drag would take the same path';
  // What "nothing was disturbed" means here is the controls and the name, not
  // the pixels: two motions are running, so the canvas is a different picture
  // every frame no matter what happens.
  const beforeReject = await readControls(d);
  const beforeRejectMean = (await d.stats()).mean;
  await d.js(`(() => {
    const t = new DataTransfer();
    t.items.add(new File([new Uint8Array([0, 0, 0, 24])], 'clip.mp4', { type: 'video/mp4' }));
    document.getElementById('preview-body')
      .dispatchEvent(new DragEvent('drop', { dataTransfer: t, bubbles: true, cancelable: true }));
  })()`);
  await wait(300);
  p['10'].message = await d.message();
  p['10'].markedAsWarning = await d.js(
    `document.querySelector('.drop-message').classList.contains('drop-warn')`
  );
  p['10'].namesTheFile = p['10'].message.includes('clip.mp4');
  p['10'].workUntouched = JSON.stringify(await readControls(d)) === JSON.stringify(beforeReject);
  p['10'].pictureStillThere = (await d.stats()).mean > beforeRejectMean * 0.2;
  p['10'].shots.push(await d.shot('p10-mp4-refused'));
  p['10'].result = p['10'].namesTheFile && p['10'].markedAsWarning
    && p['10'].workUntouched && p['10'].pictureStillThere ? 'pass' : 'fail';

  // --- 11. the keyboard alone ---------------------------------------------
  p['11'] = {
    name: 'operate it with the keyboard alone - focus visible everywhere, and the crop movable?',
    shots: []
  };
  await d.js(`document.getElementById('footer-name').focus()`);
  const stops = [];
  for (let i = 0; i < 18; i += 1) {
    await d.key('Tab', 'Tab', 9);
    stops.push(await d.js(`(() => {
      const a = document.activeElement;
      const visible = document.querySelector(':focus-visible');
      return {
        id: a ? a.id : null,
        tag: a ? a.tagName.toLowerCase() : null,
        focusRingShown: visible === a,
        outline: a ? getComputedStyle(a).outlineWidth : null
      };
    })()`));
    if (i === 2) p['11'].shots.push(await d.shot('p11-a-focus-ring'));
  }
  p['11'].stops = stops;
  p['11'].everyStopShowsTheRing = stops.every((s) => s.focusRingShown);
  p['11'].reachedEveryKind = ['input', 'select', 'button'].every(
    (tag) => stops.some((s) => s.tag === tag)
  );

  // And a control actually operated from the keyboard, not merely focused.
  await d.js(`document.getElementById('sf-brightness').focus()`);
  const beforeKeys = await d.js(`document.getElementById('sf-brightness').value`);
  for (let i = 0; i < 5; i += 1) await d.key('ArrowLeft', 'ArrowLeft', 37);
  const afterKeys = await d.js(`document.getElementById('sf-brightness').value`);
  p['11'].brightnessBeforeArrows = beforeKeys;
  p['11'].brightnessAfterArrows = afterKeys;
  p['11'].shots.push(await d.shot('p11-b-keyboard-changed-a-slider'));
  await slider('sf-brightness', 100);

  // And the caret in the name field, so "the canvas takes the arrow keys" is
  // not quietly true of the whole window: a text field must still get its own.
  await d.js(`(() => {
    const f = document.getElementById('footer-name');
    f.focus();
    f.setSelectionRange(f.value.length, f.value.length);
  })()`);
  p['11'].caretAtEnd = await d.js(`document.getElementById('footer-name').selectionStart`);
  for (let i = 0; i < 3; i += 1) await d.key('ArrowLeft', 'ArrowLeft', 37);
  p['11'].caretAfterArrows = await d.js(`document.getElementById('footer-name').selectionStart`);
  p['11'].nameFieldStillTakesArrows =
    p['11'].caretAfterArrows === p['11'].caretAtEnd - 3;

  // --- 11b. moving the crop with the keyboard alone -----------------------
  //
  // The one thing point 11 used to have to leave open. Everything here is
  // driven by real key events through the protocol; what is measured is where
  // the white marker bar ends up in the rendered canvas, which is the same
  // measurement point 3 judges the mouse drag by — so "the arrow keys agree
  // with the mouse" is a comparison of like with like.
  //
  // Both motions are stilled first and put back afterwards. They are still
  // running from point 5, and warp moves the marker bar by itself; leaving
  // them on would mean measuring them instead of the keyboard.
  await slider('sf-layers-0-motions-0-amount', 0);
  await slider('sf-layers-0-motions-1-amount', 0);
  await wait(250);

  // Tabbed to, deliberately, not focused from script: that the canvas is a
  // stop in the tab order at all is the whole point.
  await d.js(`document.getElementById('footer-name').focus()`);
  let presses = 0;
  let reached = false;
  while (presses < 40 && !reached) {
    await d.key('Tab', 'Tab', 9);
    presses += 1;
    reached = await d.js(`document.activeElement.id === 'preview-canvas'`);
  }
  p['11'].canvasReachedByTab = reached;
  p['11'].canvasTabPresses = presses;
  p['11'].canvas = await d.js(`(() => {
    const c = document.getElementById('preview-canvas');
    return {
      tabindex: c.getAttribute('tabindex'),
      role: c.getAttribute('role'),
      label: c.getAttribute('aria-label'),
      focusRingShown: document.querySelector(':focus-visible') === c,
      outline: getComputedStyle(c).outlineWidth
    };
  })()`);
  p['11'].shots.push(await d.shot('p11-c-canvas-focused'));

  // How far the panel is scrolled, before and after a run of arrow presses:
  // focusing the canvas and then moving the crop must not shift the column
  // under the user.
  const scrollNow = () => d.js(`(() => {
    const p = document.getElementById('preview');
    return { top: p.scrollTop, left: p.scrollLeft };
  })()`);
  p['11'].scrollBeforeArrows = await scrollNow();

  // A known starting point, arrived at with the keys themselves: the picture
  // is 800 x 200 with 240 canvas pixels of slack, so Shift-left far enough
  // pins it against one end, and six coarse presses back (6 x 40 = 240) land
  // exactly in the middle.
  for (let i = 0; i < 30; i += 1) await d.key('ArrowLeft', 'ArrowLeft', 37, 8);
  const cropAtEdge = await d.stats();
  for (let i = 0; i < 5; i += 1) await d.key('ArrowLeft', 'ArrowLeft', 37, 8);
  const cropPastEdge = await d.stats();
  p['11'].cropStopsAtTheEdge = cropAtEdge.hash === cropPastEdge.hash;
  p['11'].shots.push(await d.shot('p11-d-crop-at-the-edge'));

  for (let i = 0; i < 6; i += 1) await d.key('ArrowRight', 'ArrowRight', 39, 8);
  const centred = await d.stats();
  p['11'].barCentred = centred.brightestColumn;

  // Five presses right: four canvas pixels each, so the marker must travel
  // twenty columns, and to the RIGHT — the same way the mouse moves it.
  for (let i = 0; i < 5; i += 1) await d.key('ArrowRight', 'ArrowRight', 39);
  const afterRight = await d.stats();
  p['11'].barAfterFiveRight = afterRight.brightestColumn;
  p['11'].shots.push(await d.shot('p11-e-crop-moved-right-by-arrows'));

  for (let i = 0; i < 10; i += 1) await d.key('ArrowLeft', 'ArrowLeft', 37);
  const afterLeft = await d.stats();
  p['11'].barAfterTenLeft = afterLeft.brightestColumn;
  p['11'].shots.push(await d.shot('p11-f-crop-moved-left-by-arrows'));

  p['11'].scrollAfterArrows = await scrollNow();
  p['11'].panelDidNotScroll =
    p['11'].scrollAfterArrows.top === p['11'].scrollBeforeArrows.top &&
    p['11'].scrollAfterArrows.left === p['11'].scrollBeforeArrows.left;

  p['11'].cropStepRight = p['11'].barAfterFiveRight - p['11'].barCentred;
  p['11'].cropStepLeft = p['11'].barAfterTenLeft - p['11'].barAfterFiveRight;
  // The direction first, because that is the claim that matters, and then the
  // distance: 5 x 4 = 20 canvas pixels one way, 10 x 4 = 40 back. One column
  // of tolerance for the resampling of a bar that is eight pixels wide.
  p['11'].arrowsAgreeWithTheMouse =
    p['11'].cropStepRight > 0 && p['11'].cropStepLeft < 0 &&
    Math.abs(p['11'].cropStepRight - 20) <= 1 && Math.abs(p['11'].cropStepLeft + 40) <= 1;

  // With no picture to crop there must be no tab stop either. Checked by
  // switching the fit to one that crops nothing, which is the case a user
  // actually reaches.
  await setSelect('sf-layers-0-fit', 'contain');
  p['11'].canvasWhenNothingToCrop = await d.js(`(() => {
    const c = document.getElementById('preview-canvas');
    return { tabindex: c.getAttribute('tabindex'), role: c.getAttribute('role') };
  })()`);
  await setSelect('sf-layers-0-fit', 'cover');
  p['11'].canvasWhenCroppableAgain = await d.js(
    `document.getElementById('preview-canvas').getAttribute('tabindex')`
  );
  p['11'].tabStopFollowsTheFitMode =
    p['11'].canvasWhenNothingToCrop.tabindex === null &&
    p['11'].canvasWhenCroppableAgain === '0';

  // Put point 5's motions back the way they were.
  await slider('sf-layers-0-motions-0-amount', 100);
  await slider('sf-layers-0-motions-1-amount', 100);

  p['11'].result = p['11'].everyStopShowsTheRing && p['11'].reachedEveryKind
    && Number(afterKeys) === Number(beforeKeys) - 5
    && p['11'].nameFieldStillTakesArrows
    && p['11'].canvasReachedByTab && p['11'].canvas.focusRingShown
    && p['11'].canvas.role === 'application' && Boolean(p['11'].canvas.label)
    && p['11'].arrowsAgreeWithTheMouse && p['11'].cropStopsAtTheEdge
    && p['11'].panelDidNotScroll && p['11'].tabStopFollowsTheFitMode ? 'pass' : 'fail';

  // --- 8a. save the project, then let the app really stop -----------------
  p['8'] = { name: 'save a project, restart the app, open it - is everything still there?', shots: [] };
  await d.setInput('footer-name', 'Walkthrough');
  projectDialogs.save = async () => ({ canceled: false, filePath: state.projectFile });
  const saveBox = await d.box('#footer-save');
  await d.click(saveBox.cx, saveBox.cy);
  await d.until(
    `document.querySelector('.drop-message').textContent.includes('Walkthrough.sfx')`,
    'the project is saved'
  );
  p['8'].savedMessage = await d.message();
  p['8'].controlsBeforeRestart = await readControls(d);
  p['8'].statsBeforeRestart = await d.stats().then((s) => ({ hash: s.hash, mean: s.mean }));
  state.controlsBeforeRestart = p['8'].controlsBeforeRestart;
  state.hashBeforeRestart = p['8'].statsBeforeRestart.hash;
  p['8'].shots.push(await d.shot('p8-a-saved-before-restart'));
}

/** Every control in the settings column and the footer, by id. */
function readControls(d) {
  return d.js(`({
    fit: document.getElementById('sf-layers-0-fit')?.value ?? null,
    kind0: document.getElementById('sf-layers-0-kind-0')?.value ?? null,
    kind1: document.getElementById('sf-layers-0-kind-1')?.value ?? null,
    speed0: document.getElementById('sf-layers-0-motions-0-speed')?.value ?? null,
    amount0: document.getElementById('sf-layers-0-motions-0-amount')?.value ?? null,
    speed1: document.getElementById('sf-layers-0-motions-1-speed')?.value ?? null,
    amount1: document.getElementById('sf-layers-0-motions-1-amount')?.value ?? null,
    saturation: document.getElementById('sf-saturation')?.value ?? null,
    greenMagenta: document.getElementById('sf-greenMagenta')?.value ?? null,
    blueYellow: document.getElementById('sf-blueYellow')?.value ?? null,
    brightness: document.getElementById('sf-brightness')?.value ?? null,
    name: document.getElementById('footer-name').value
  })`);
}

/**
 * Point 8, second half: a window that has just started, opening the project the
 * one before it wrote.
 */
async function phaseTwo(win, state) {
  const d = driver(win, DRIVING);
  const p = report.points;
  await d.until(`document.getElementById('footer-open') !== null`, 'the window is built');

  p['8'] = { name: 'save a project, restart the app, open it - is everything still there?', shots: [] };
  p['8'].shots.push(await d.shot('p8-b-fresh-window'));
  p['8'].emptyBeforeOpening = await d.stats().then((s) => ({ hash: s.hash, mean: s.mean }));

  projectDialogs.open = async () => ({ canceled: false, filePaths: [state.projectFile] });
  const openBox = await d.box('#footer-open');
  await d.click(openBox.cx, openBox.cy);
  await d.until(
    `document.querySelector('.drop-message').textContent.includes('Walkthrough.sfx')`,
    'the project is opened'
  );
  await wait(600);
  p['8'].openedMessage = await d.message();
  p['8'].controlsAfterRestart = await readControls(d);
  p['8'].controlsBeforeRestart = state.controlsBeforeRestart;
  p['8'].everyControlCameBack =
    JSON.stringify(p['8'].controlsAfterRestart) === JSON.stringify(state.controlsBeforeRestart);
  p['8'].cursorOverPicture = await d.js(`(() => {
    const c = document.getElementById('preview-canvas');
    c.dispatchEvent(new PointerEvent('pointermove', { clientX: 10, clientY: 10, bubbles: true }));
    return c.style.cursor;
  })()`);
  p['8'].shots.push(await d.shot('p8-c-opened-after-restart'));
  p['8'].result = p['8'].everyControlCameBack && p['8'].cursorOverPicture === 'grab' ? 'pass' : 'fail';

  // --- 9c. the exported file, in a window of its own ----------------------
  p['9'] = { name: 'export, and confirm the result', shots: [] };
  /**
   * Open one exported effect in a Chromium window of its own and wait until it
   * has actually painted something.
   *
   * A window each, and a poll rather than a fixed wait, both learned the hard
   * way: loading the second effect into the window the first had been in left
   * a canvas that never drew anything at all, and a fixed 900 ms had no way of
   * telling that apart from "still starting up".
   */
  async function openEffect(fileName) {
    const window_ = new BrowserWindow({
      width: 420, height: 320, show: true,
      webPreferences: { backgroundThrottling: false }
    });
    await window_.loadFile(join(state.effectsFolder, fileName));
    for (let i = 0; i < 100; i += 1) {
      await wait(100);
      const painted = await window_.webContents.executeJavaScript(`(() => {
        const c = document.getElementById('exCanvas');
        if (!c) return false;
        const d = c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, c.width, c.height).data;
        for (let i = 3; i < d.length; i += 4) if (d[i] !== 0) return true;
        return false;
      })()`);
      if (painted) return window_;
    }
    throw new Error(`${fileName} never drew anything in a real Chromium window`);
  }

  let effect = await openEffect('Walkthrough Still.html');

  const readEffect = () => effect.webContents.executeJavaScript(`(() => {
    const c = document.getElementById('exCanvas');
    const g = c.getContext('2d', { willReadFrequently: true });
    const d = g.getImageData(0, 0, c.width, c.height).data;
    const n = c.width * c.height;
    let sr = 0, sg = 0, sb = 0, hash = 0;
    const cols = new Float64Array(c.width);
    for (let i = 0, p = 0; i < d.length; i += 4, p += 1) {
      sr += d[i]; sg += d[i + 1]; sb += d[i + 2];
      cols[p % c.width] += (d[i] + d[i + 1] + d[i + 2]) / 3;
      hash = (hash * 31 + d[i] + d[i + 1] * 3 + d[i + 2] * 7) | 0;
    }
    return { width: c.width, height: c.height, hash,
             r: sr / n, g: sg / n, b: sb / n, mean: (sr + sg + sb) / (3 * n),
             columns: Array.from(cols, (v) => v / c.height) };
  })()`);

  /**
   * A picture of what the exported effect is drawing.
   *
   * Taken from the effect's own canvas rather than from the window, and that
   * is not laziness: capturePage() on a second window that has just finished
   * loading fails outright here with "UnknownVizError" often enough to have
   * stopped this walkthrough once already. The canvas is also the honest
   * subject — it is the 320 x 200 the effect actually produces, at its own
   * size, not a photograph of a window frame around it. The window shot is
   * still attempted, because seeing the thing in a window is worth having,
   * but it is allowed to fail.
   */
  async function shootEffect(name) {
    const dataUrl = await effect.webContents.executeJavaScript(
      `document.getElementById('exCanvas').toDataURL('image/png')`
    );
    writeFileSync(join(shotsDir, `${name}.png`), Buffer.from(dataUrl.split(',')[1], 'base64'));
    p['9'].shots.push(`shots/${name}.png`);
    try {
      writeFileSync(join(shotsDir, `${name}-window.png`), (await effect.capturePage()).toPNG());
      p['9'].shots.push(`shots/${name}-window.png`);
    } catch (error) {
      note(`could not photograph the window around ${name}: ${error.message || error}`);
    }
  }

  const still = await readEffect();
  p['9'].exportedCanvas = { width: still.width, height: still.height };
  await shootEffect('p9-b-still-effect-in-chromium');

  // How close the exported still is to the preview it came from. Both are the
  // same document through the same bundle, so the only differences should be
  // the ones a second decode of the same picture makes.
  const preview = state.stillPreviewStats;
  p['9'].previewVersusExported = {
    preview,
    exported: { r: still.r, g: still.g, b: still.b, mean: still.mean },
    meanDifference: Math.abs(preview.mean - still.mean),
    largestChannelDifference: Math.max(
      Math.abs(preview.r - still.r), Math.abs(preview.g - still.g), Math.abs(preview.b - still.b)
    ),
    profileDistance: shapeDistance(state.stillPreviewColumns, still.columns)
  };

  effect.destroy();
  effect = await openEffect('Walkthrough Moving.html');
  const moving = [];
  for (let i = 0; i < 6; i += 1) {
    moving.push(await readEffect());
    if (i === 1) await shootEffect('p9-c-moving-effect-in-chromium');
    if (i === 4) await shootEffect('p9-d-moving-effect-later');
    await wait(220);
  }
  p['9'].movingFrames = moving.map((f) => ({ mean: Number(f.mean.toFixed(2)), hash: f.hash }));
  p['9'].movingCanvas = { width: moving[0].width, height: moving[0].height };
  p['9'].movingFramesDiffer = new Set(moving.map((f) => f.hash)).size === moving.length;
  const movingMeans = moving.map((f) => f.mean);
  p['9'].movingBrightnessSwing =
    (Math.max(...movingMeans) - Math.min(...movingMeans)) / (Math.max(...movingMeans) || 1);
  effect.destroy();

  p['9'].result =
    still.width === 320 && still.height === 200 &&
    p['9'].previewVersusExported.largestChannelDifference < 3 &&
    p['9'].previewVersusExported.profileDistance < 0.05 &&
    p['9'].movingFramesDiffer ? 'pass' : 'fail';
}

// ---------------------------------------------------------------------------

app.whenReady().then(async () => {
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error('app/main.js did not open a window');

  const state = PHASE === 2
    ? JSON.parse(readFileSync(STATE_FILE, 'utf8'))
    : {
      imageFile: join(OUT, 'walkthrough-source.png'),
      projectFile: join(OUT, 'Walkthrough.sfx'),
      effectsFolder
    };

  // Belt and braces on top of --user-data-dir and the seeded settings: refuse
  // outright to run if the folder about to be exported into looks like the
  // machine owner's real one.
  if (/WhirlwindFX/i.test(state.effectsFolder)) {
    throw new Error(`refusing to run against a real SignalRGB folder: ${state.effectsFolder}`);
  }

  try {
    await win.webContents.debugger.attach('1.3');
    await new Promise((resolve) => {
      if (!win.webContents.isLoading()) { resolve(); return; }
      win.webContents.once('did-finish-load', resolve);
    });

    if (PHASE === 1) {
      mkdirSync(state.effectsFolder, { recursive: true });
      if (!existsSync(state.imageFile)) writeTestImage(state.imageFile);
      folderDialog.open = async () => ({ canceled: false, filePaths: [state.effectsFolder] });
      await phaseOne(win, state);
      writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
      note(`phase 1 done; now run the same command again with SF_WALK_PHASE=2`);
    } else {
      await phaseTwo(win, state);
      writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
    }

    report.ok = true;
  } catch (error) {
    report.ok = false;
    report.error = String(error.stack || error);
    process.stderr.write(`${report.error}\n`);
  }

  writeFileSync(join(OUT, `report-${PHASE}.json`), JSON.stringify(report, null, 2), 'utf8');
  process.stdout.write(`walkthrough phase ${PHASE}: ${report.ok ? 'finished' : 'FAILED'}\n`);
  app.exit(report.ok ? 0 : 1);
});
