// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * The second polish pass, photographed and measured without ever showing a
 * window.
 *
 *   npx electron test/harness/polish2-shots.js [folder]
 *
 * The same shape as shots.js, which it is built out of: the real app/main.js,
 * the real window, `show: false` from test/harness/sandbox.js, and the frame
 * pump that stands in for the requestAnimationFrame ticks a hidden window
 * never gets. What is different is the list of questions it answers, and every
 * one of them is one of the five complaints this pass exists for:
 *
 *   1  how much of the stage column the picture actually reaches, at three
 *      window sizes including the wide one the complaint came from — the
 *      "leerer Platz nach rechts";
 *   2  what the platform will and will not let a <select>'s popup be styled
 *      into, asked of this exact Chromium rather than assumed;
 *   3  that the tile shelf wraps and scrolls DOWNWARDS, measured as a
 *      scrollHeight against a clientHeight rather than photographed and
 *      eyeballed;
 *   4  that the per-slider reset is there, reachable, and lands on the value a
 *      fresh document carries;
 *   5  the sliders themselves, in their three states.
 *
 * And, last, the crop drag: the stage's DISPLAY size changes in this pass, and
 * mountCrop converts screen pixels to canvas pixels through a measurement of
 * that display size. So the 1:1 check from shots.js is repeated here, at the
 * new size, with a real protocol mouse drag — measured, never inferred.
 */
import { app, BrowserWindow } from 'electron';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { serializeProject } from '../../src/main/project.js';
import { normalizeDocument } from '../../src/engine/document.js';
import { projectDialogs, folderDialog } from '../../app/main.js';
import { driver, runHarness, wait } from './driver.js';
import { harnessSandbox } from './sandbox.js';

const { runDir, effectsFolder } = harnessSandbox('polish2', { show: false });

const OUT = resolve(process.argv[2] || join(process.cwd(), 'work', 'polish2-shots'));
mkdirSync(OUT, { recursive: true });

/**
 * The window sizes this pass is judged at.
 *
 * The first two are the ones the design was already approved at and must not
 * lose anything. The last two are the complaint: 1920 x 1080 because it is the
 * ordinary wide screen, and 2000 x 1150 because that is about the size of the
 * window in Max's own screenshot — the one with four hundred pixels of nothing
 * down the right hand side.
 */
const SIZES = Object.freeze([
  Object.freeze({ name: '1040x700', size: [1040, 700] }),
  Object.freeze({ name: '1280x820', size: [1280, 820] }),
  Object.freeze({ name: '1920x1080', size: [1920, 1080] }),
  Object.freeze({ name: '2000x1150', size: [2000, 1150] })
]);

/** A picture worth looking at — the same one shots.js draws, for comparability. */
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

/** A picture with horizontal slack in it, for the crop check. */
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

/**
 * Where the picture stops and where its column stops, in one reading.
 *
 * `dead` is the complaint itself, as a number: the width of the stage column
 * that nothing in it reaches. Anything left over has to be OWNED by something
 * — the shelf, in the wide layout — and this is what says whether it is.
 */
const MEASURE = `(() => {
  const box = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const b = el.getBoundingClientRect();
    return {
      w: Math.round(b.width), h: Math.round(b.height),
      left: Math.round(b.left), right: Math.round(b.right)
    };
  };
  const column = box('#preview');
  const picture = box('.stage-inner');
  const gallery = box('#gallery');
  const rail = document.getElementById('gallery-rail');
  const railBox = box('#gallery-rail');
  const style = getComputedStyle(document.getElementById('preview-body'));
  return {
    column, picture, gallery, message: box('.drop-message'),
    settings: box('#inspector'), canvas: box('#preview-canvas'),
    layout: style.getPropertyValue('--sf-layout').trim(),
    // Everything the picture and the shelf together leave unclaimed inside the
    // stage column, counting its own 12px of padding as claimed.
    dead: column && picture && gallery
      ? Math.round(column.right - 12 - Math.max(picture.right, gallery.right))
      : null,
    rail: rail ? {
      scrollHeight: rail.scrollHeight, clientHeight: rail.clientHeight,
      scrollWidth: rail.scrollWidth, clientWidth: rail.clientWidth,
      scrollsDown: rail.scrollHeight > rail.clientHeight + 1,
      scrollsSideways: rail.scrollWidth > rail.clientWidth + 1,
      box: railBox
    } : null,
    tiles: [...document.querySelectorAll('#gallery-rail .tile')].map((tile) => {
      const b = tile.getBoundingClientRect();
      return { key: tile.dataset.tile, w: Math.round(b.width), h: Math.round(b.height),
        top: Math.round(b.top), left: Math.round(b.left) };
    })
  };
})()`;

/**
 * What this Chromium will actually do with a dropdown's list.
 *
 * Asked of the running engine rather than taken from a compatibility table:
 * whether the modern `appearance: base-select` path exists at all, and what
 * the browser computes for an <option> once the stylesheet has had its say.
 * The answer is what the report is allowed to claim.
 */
const SELECT_FACTS = `(() => {
  const select = document.querySelector('#inspector select');
  const option = select ? select.querySelector('option') : null;
  const read = (el) => {
    if (!el) return null;
    const s = getComputedStyle(el);
    return {
      background: s.backgroundColor, color: s.color,
      font: s.fontFamily, appearance: s.appearance
    };
  };
  return {
    chrome: navigator.userAgent.match(/Chrome\\/([\\d.]+)/)?.[1] ?? null,
    supportsBaseSelect: CSS.supports('appearance', 'base-select'),
    supportsPickerSelector: (() => {
      try { document.querySelector('select::picker(select)'); return true; }
      catch { return false; }
    })(),
    colorScheme: getComputedStyle(document.documentElement).colorScheme,
    select: read(select), option: read(option),
    optionCount: select ? select.options.length : 0,
    selectId: select ? select.id : null
  };
})()`;

async function main() {
  const [win] = BrowserWindow.getAllWindows();
  const d = driver(win);
  const notes = { sizes: {} };

  const nothingVisible = () => BrowserWindow.getAllWindows().every((w) => !w.isVisible());
  notes.windowVisibleAtStart = !nothingVisible();

  await win.webContents.debugger.attach('1.3');
  await d.until(`document.getElementById('footer-export') !== null`, 'the window is built', 300);
  await d.installPump();

  let at = [1280, 820];
  async function shot(name, { size = null, frames = 10 } = {}) {
    if (size) {
      at = size;
      win.setContentSize(at[0], at[1]);
      await wait(320);
    }
    await d.pump(frames);
    await wait(200);
    const file = join(OUT, `${name}.png`);
    // Twice, and only the second kept — see shots.js: the first capture of a
    // hidden window is what commits the canvas's own layer.
    await win.capturePage();
    await wait(140);
    writeFileSync(file, (await win.capturePage()).toPNG());
    process.stdout.write(`shot ${file}\n`);
    return file;
  }

  // ------------------------------------------------------------ empty window
  await shot('01-empty-1280x820', { size: [1280, 820] });
  folderDialog.open = async () => ({ canceled: false, filePaths: [effectsFolder] });
  await d.js(`document.getElementById('first-run-choose').click(), true`);
  await d.until(`document.getElementById('first-run').hidden === true`, 'the question is answered', 100);
  await shot('02-empty-settled-1280x820');
  await shot('03-empty-1920x1080', { size: [1920, 1080] });
  await shot('04-empty-1040x700', { size: [1040, 700] });

  // ------------------------------------------------------------- a picture in
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
    'the picture is on the stage', 200
  );
  await d.pump(60);

  // ------------------------------- the loaded window and its numbers, per size
  for (const { name, size } of SIZES) {
    await shot(`05-picture-${name}`, { size });
    notes.sizes[name] = { start: await d.js(MEASURE) };
    // The other shelf, at the same size: the library tab, which wraps the same
    // way and scrolls the same way with nothing on it.
    await d.js(`document.getElementById('gallery-tab-library').click(), true`);
    await wait(200);
    await shot(`06-library-${name}`, { frames: 4 });
    notes.sizes[name].library = await d.js(MEASURE);
    await d.js(`document.getElementById('gallery-tab-start').click(), true`);
    await wait(200);
  }

  // --------------------------------------------------- the shelf, scrolled down
  await shot('07-gallery-start-1280x820', { size: [1280, 820] });
  notes.railScroll = await d.js(`(() => {
    const r = document.getElementById('gallery-rail');
    const before = r.scrollTop;
    r.scrollTop = r.scrollHeight;
    return { before, after: r.scrollTop, end: r.scrollHeight - r.clientHeight };
  })()`);
  await wait(160);
  await shot('08-gallery-scrolled-down-1280x820', { frames: 4 });
  await d.js(`document.getElementById('gallery-rail').scrollTop = 0, true`);

  // ------------------------------------------------------------ the dropdowns
  notes.select = await d.js(SELECT_FACTS);

  // OPENED BY A REAL CLICK, not by showPicker().
  //
  // showPicker() throws without a user gesture — measured, and the message is
  // in the baseline notes — so the list is opened the way a person opens it: a
  // protocol mouse click on the control. That also settles the question this
  // photograph exists to answer. An OLD select pops a list the operating
  // system draws in a window of its own, which capturePage cannot see and
  // which a hidden window may not paint at all; a select with
  // `appearance: base-select` opens ::picker(select), which is an element IN
  // the page and is therefore in the picture like anything else. So whether
  // the popup shows up in this shot is itself the answer to "did the styling
  // take", and `pickerIsInPage` below says which of the two happened rather
  // than leaving it to be guessed from the image.
  const selectBox = await d.box('#inspector select');
  await d.click(selectBox.cx, selectBox.cy);
  await wait(400);
  notes.picker = await d.js(`(() => {
    const select = document.querySelector('#inspector select');
    const open = select.matches(':open');
    // The list as an element: present, painted, and with the colours this
    // window asked for — read off the live element rather than off the picture.
    const options = [...select.options].map((option) => {
      const s = getComputedStyle(option);
      return { text: option.textContent, background: s.backgroundColor, color: s.color };
    });
    return {
      open,
      pickerIsInPage: CSS.supports('appearance', 'base-select'),
      appearance: getComputedStyle(select).appearance,
      options
    };
  })()`);
  await shot('09-dropdown-open-1280x820', { frames: 4 });
  // Closed again with the keyboard, so nothing is left standing over the
  // column in the shots that follow.
  await d.key('Escape', 'Escape', 27);
  await wait(200);
  await d.js(`document.activeElement && document.activeElement.blur(), true`);
  await wait(160);

  // ------------------------------------------------ the crop drag, still 1:1
  //
  // BEFORE the sliders, and that order is load bearing: every slider gesture
  // below leaves the document unsaved, and opening a project after one of them
  // makes the app ask the question it is supposed to ask — a real,
  // window-modal dialog that would sit here waiting for a human. So the last
  // project this run opens is opened while nothing has been touched.
  //
  // The stage's DISPLAY size changes in this pass and mountCrop converts screen
  // pixels to canvas pixels through a measurement of it, so the conversion is
  // only right if it is measured at the size the canvas is actually drawn at.
  // Hence a real protocol drag at each of the three sizes, with the white
  // marker bar in the rendered frame read before and after.
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

  notes.crop = {};
  for (const { name, size } of SIZES) {
    win.setContentSize(size[0], size[1]);
    await wait(320);
    await d.pump(4);
    const canvas = await d.box('#preview-canvas');
    const perCanvasPixel = canvas.width / 320;
    const before = (await d.stats()).brightestColumn;
    await d.drag(canvas.cx, canvas.cy, canvas.cx - 20 * perCanvasPixel, canvas.cy);
    await d.pump(4);
    const after = (await d.stats()).brightestColumn;
    notes.crop[name] = {
      canvasWidth: Math.round(canvas.width),
      cssPixelsPerCanvasPixel: Number(perCanvasPixel.toFixed(4)),
      draggedCanvasPixels: -20,
      markerBefore: before,
      markerAfter: after,
      movedCanvasPixels: after - before
    };
    // Back where it started, so the next size drags from the same place.
    await d.drag(canvas.cx - 20 * perCanvasPixel, canvas.cy, canvas.cx, canvas.cy);
    await d.pump(4);
  }
  await shot('15-crop-dragged-1to1-1920x1080', { size: [1920, 1080] });

  // The canvas's backing store, asked once the stage has been drawn at every
  // size this run knows: it is 320 x 200 and no change to how large the stage
  // is DRAWN may ever touch it.
  notes.backingStore = await d.js(`(() => {
    const c = document.getElementById('preview-canvas');
    return { width: c.width, height: c.height };
  })()`);

  // ------------------------------------------- the sliders and their reset
  //
  // The three states are produced rather than waited for: a real pointer is
  // moved onto a slider's thumb, held down on it, and the keyboard is put on
  // it. Nothing here fakes a class name — every state in the picture is one
  // the browser itself decided the element is in.
  win.setContentSize(1280, 820);
  await wait(320);
  await d.js(`document.getElementById('inspector').scrollTop = 0, true`);
  notes.slider = await d.js(`(() => {
    const input = document.querySelector('#inspector input[type=range]');
    if (!input) return null;
    const control = input.closest('.control');
    const reset = control ? control.querySelector('.control-reset') : null;
    const b = input.getBoundingClientRect();
    return {
      id: input.id, value: input.value, height: Math.round(b.height),
      fill: input.style.getPropertyValue('--sf-fill'),
      hasReset: Boolean(reset),
      resetLabel: reset ? reset.getAttribute('aria-label') : null,
      resetTitle: reset ? reset.title : null,
      resetTabbable: reset ? reset.tabIndex >= 0 : null
    };
  })()`);

  if (notes.slider) {
    const track = await d.box(`#${notes.slider.id}`);
    const onThumb = track.x + track.width * 0.5;
    // Hover: a real pointer put on the track, sent through the protocol so the
    // state in the photograph is one the browser decided on.
    await d.send('Input.dispatchMouseEvent',
      { type: 'mouseMoved', x: onThumb, y: track.cy, buttons: 0 });
    await wait(160);
    await shot('10-slider-hover-1280x820', { frames: 4 });
    // Pressed: the same point, button down, photographed before it is let go.
    await d.send('Input.dispatchMouseEvent',
      { type: 'mousePressed', x: onThumb, y: track.cy, button: 'left', buttons: 1, clickCount: 1 });
    await wait(160);
    await shot('11-slider-active-1280x820', { frames: 4 });
    await d.send('Input.dispatchMouseEvent',
      { type: 'mouseReleased', x: onThumb, y: track.cy, button: 'left', buttons: 0, clickCount: 1 });
    await wait(160);
    // Focused, from the keyboard, so the ring in the picture is a real
    // :focus-visible and not a class.
    await d.js(`document.getElementById(${JSON.stringify(notes.slider.id)}).focus(), true`);
    await d.key('ArrowRight', 'ArrowRight', 39);
    await wait(160);
    await shot('12-slider-focus-1280x820', { frames: 4 });

    // The reset, by pointer and by keyboard, against the value a fresh
    // document carries — read back through the engine rather than typed here.
    notes.reset = await d.js(`(() => {
      const input = document.getElementById(${JSON.stringify(notes.slider.id)});
      const reset = input.closest('.control')?.querySelector('.control-reset') ?? null;
      if (!reset) return { hasReset: false };
      reset.scrollIntoView({ block: 'center' });
      reset.focus();
      return {
        hasReset: true,
        before: input.value,
        visibleAtRest: getComputedStyle(reset).opacity,
        focused: document.activeElement === reset
      };
    })()`);
    if (notes.reset.hasReset) {
      await wait(160);
      await shot('13-reset-focused-1280x820', { frames: 4 });
      await d.js(`document.activeElement.click(), true`);
      await wait(200);
      notes.reset.after = await d.js(
        `document.getElementById(${JSON.stringify(notes.slider.id)}).value`);
      // And the fast path: a double click on the slider itself, after the
      // value has been moved away from its default again.
      await d.js(`(() => {
        const input = document.getElementById(${JSON.stringify(notes.slider.id)});
        input.value = String(Number(input.value) + 7);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        return input.value;
      })()`);
      notes.reset.movedAgain = await d.js(
        `document.getElementById(${JSON.stringify(notes.slider.id)}).value`);
      await d.js(`(() => {
        const input = document.getElementById(${JSON.stringify(notes.slider.id)});
        input.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
        return true;
      })()`);
      await wait(160);
      notes.reset.afterDoubleClick = await d.js(
        `document.getElementById(${JSON.stringify(notes.slider.id)}).value`);
      await shot('14-reset-done-1280x820', { frames: 4 });
    }
  }

  notes.windowVisibleAtEnd = !nothingVisible();
  writeFileSync(join(OUT, 'notes.json'), `${JSON.stringify(notes, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify(notes)}\n`);
}

runHarness('polish2', main);
