// SignalForge — build SignalRGB effects from images, gradients, shapes and particles.
// Copyright (C) 2026 Max Leopold Blumenschein
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Photograph the starting strip, and measure it — without ever showing a
 * window.
 *
 *   npx electron test/harness/tiles-shots.js [folder]
 *
 * The same shape as shots.js and gradient-shots.js, for the same reasons:
 * `windowDisplay.show = false` before app/main.js opens its window,
 * `capturePage()` twice per picture, and a frame pump installed in the page
 * because a window Chromium is not showing never ticks requestAnimationFrame.
 * Nothing here calls show(), focus() or maximize().
 *
 * WHAT IT MEASURES, AND WHY IT MEASURES IT HERE
 *
 * Two things that cannot be argued from the source:
 *
 *  - the CONTRAST of each tile's name against the tile's own preview, read out
 *    of the captured picture pixel by pixel (nativeImage.toBitmap()), exactly
 *    the way SignalRGB's own screen was read in
 *    docs/erkenntnisse-signalrgb-oberflaeche.md. Not computed from tokens: the
 *    thing under the words is a rendered gradient with a scrim over it, and
 *    the only honest source for "what colour is actually behind that letter"
 *    is the letter.
 *  - the AIR around the stage: how many pixels of nothing lie above and below
 *    the 16:10 frame inside the space the stage column gives it.
 */
import { app, BrowserWindow, nativeImage } from 'electron';
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { folderDialog, discardDialog } from '../../app/main.js';
import { driver, runHarness, wait } from './driver.js';
import { harnessSandbox } from './sandbox.js';

// The throwaway directory, the sandbox around the effects folder, and the one
// setting this file exists for: `show: false`. See test/harness/sandbox.js.
const { effectsFolder } = harnessSandbox('tiles-shots', { show: false });

// Nobody is there to answer a native message box; everything this run throws
// away it made itself, seconds earlier.
discardDialog.ask = async () => ({ response: 1 });

const OUT = resolve(process.argv[2] || join(process.cwd(), 'work', 'tiles-shots'));
mkdirSync(OUT, { recursive: true });

/** The reference this whole redesign is measured against, if it is on disk. */
const REFERENCE = process.argv[3] || null;

/** WCAG relative luminance of an 8-bit sRGB triple. */
function luminance([r, g, b]) {
  const channel = (value) => {
    const v = value / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * Read a rectangle out of a captured frame.
 *
 * capturePage() hands back the window at the display's scale factor, so the
 * box the page reports in CSS pixels has to be multiplied by it before it
 * names the same rectangle in the bitmap. Derived from the picture rather than
 * asked of the screen, so it is right whatever the machine is set to.
 */
function readRect(image, scale, box) {
  const size = image.getSize();
  const data = image.toBitmap(); // BGRA
  const x0 = Math.max(0, Math.round(box.x * scale));
  const y0 = Math.max(0, Math.round(box.y * scale));
  const x1 = Math.min(size.width, Math.round((box.x + box.width) * scale));
  const y1 = Math.min(size.height, Math.round((box.y + box.height) * scale));
  const pixels = [];
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const i = (y * size.width + x) * 4;
      pixels.push([data[i + 2], data[i + 1], data[i]]);
    }
  }
  return pixels;
}

/**
 * The worst case a label really faces, measured pixel against pixel.
 *
 * Two captures of the same window: one with the names hidden and one with them
 * showing. Where the second is a fully inked letter stroke (within tolerance
 * of --text-strong, i.e. the middle of a stem rather than an antialiased
 * edge), the first says exactly what colour lies UNDER that stroke. Every such
 * pixel is a real foreground/background pair, and the figure reported is the
 * worst of them.
 *
 * This replaces a first attempt that read the text as "the brightest pixel in
 * the band" and the background as "the brightest pixel in the right-hand end
 * of the band, which no word reaches". The second half of that was simply
 * false — "Strahlenverlauf" is centred and reaches the right-hand end — and it
 * reported 1.00:1 for that one tile, i.e. it measured the letters against
 * themselves. A method that can be fooled by a longer word is not a
 * measurement.
 */
const INK = [248, 248, 255];

function bandFigures(withLabel, withoutLabel, scale, band) {
  const front = readRect(withLabel, scale, band);
  const behind = readRect(withoutLabel, scale, band);
  let worst = null;
  let inkedPixels = 0;
  for (let i = 0; i < front.length; i += 1) {
    const pixel = front[i];
    const solid = INK.every((value, c) => Math.abs(pixel[c] - value) <= 6);
    if (!solid) continue;
    inkedPixels += 1;
    const ratio = contrast(pixel, behind[i]);
    if (worst === null || ratio < worst.ratio) worst = { ratio, text: pixel, background: behind[i] };
  }
  if (worst === null) return { inkedPixels, ratio: null };
  return {
    inkedPixels,
    text: worst.text,
    background: worst.background,
    ratio: Number(worst.ratio.toFixed(2))
  };
}

async function main() {
  const [win] = BrowserWindow.getAllWindows();
  const d = driver(win);
  const notes = {};

  await d.until(`document.getElementById('footer-export') !== null`, 'the window is built', 300);
  await d.installPump();

  /** Capture, twice, and hand back the nativeImage as well as the file. */
  async function shot(name, { size = null, frames = 8 } = {}) {
    if (size) {
      win.setContentSize(size[0], size[1]);
      await wait(300);
    }
    await d.pump(frames);
    await wait(200);
    // Twice, and only the second kept: the first capture of a window nobody is
    // showing is what commits the canvas's own layer, so a single one comes
    // back with an empty stage (measured in shots.js).
    await win.capturePage();
    await wait(140);
    const image = await win.capturePage();
    const file = join(OUT, `${name}.png`);
    writeFileSync(file, image.toPNG());
    process.stdout.write(`shot ${file}\n`);
    return { file, image };
  }

  win.setContentSize(1280, 820);
  await wait(300);

  folderDialog.open = async () => ({ canceled: false, filePaths: [effectsFolder] });
  await d.js(`document.getElementById('first-run-choose').click(), true`);
  await d.until(`document.getElementById('first-run').hidden === true`, 'the question is answered', 100);

  // ------------------------------------------------------------- the strip
  const gallery = await shot('01-strip');

  const scale = gallery.image.getSize().width / 1280;
  notes.deviceScale = scale;

  /** Where everything is, in CSS pixels, straight from the live window. */
  const boxes = await d.js(`(() => {
    const box = (selector) => {
      const node = document.querySelector(selector);
      if (!node) return null;
      const b = node.getBoundingClientRect();
      return { x: b.x, y: b.y, width: b.width, height: b.height };
    };
    const tiles = {};
    for (const node of document.querySelectorAll('.tile')) {
      const b = node.getBoundingClientRect();
      const label = node.querySelector('.tile-label').getBoundingClientRect();
      tiles[node.dataset.tile] = {
        tile: { x: b.x, y: b.y, width: b.width, height: b.height },
        label: { x: label.x, y: label.y, width: label.width, height: label.height },
        hasCanvas: node.querySelector('canvas') !== null,
        text: node.textContent.trim()
      };
    }
    return { stage: box('.stage'), viewport: box('.viewport'), gallery: box('#gallery'),
             rail: box('.gallery-rail'), tiles };
  })()`);

  notes.tiles = Object.fromEntries(Object.entries(boxes.tiles).map(([key, value]) => [key, {
    width: value.tile.width, height: value.tile.height,
    hasCanvas: value.hasCanvas, text: value.text
  }]));

  notes.stageAir = {
    stageHeight: boxes.stage.height,
    frameHeight: boxes.viewport.height,
    above: Number((boxes.viewport.y - boxes.stage.y).toFixed(1)),
    below: Number(((boxes.stage.y + boxes.stage.height)
      - (boxes.viewport.y + boxes.viewport.height)).toFixed(1)),
    stripTop: boxes.gallery.y,
    windowHeight: 820
  };

  // ---------------------------------------------------------- the contrast
  // The same window twice, with the names hidden and showing, so every inked
  // pixel can be compared with what lies under it. `visibility` rather than
  // `display`, so nothing about the layout moves between the two captures.
  //
  // Through the CSSOM, one element at a time, and NOT by appending a <style>:
  // the window's Content-Security-Policy is `style-src 'self'`, so an injected
  // stylesheet is silently dropped — the first attempt at this measured every
  // tile at 1.00:1 because the names were still there in both captures. That
  // the injection failed is the CSP doing its job; nothing here weakens it.
  const hide = (value) => d.js(`(() => {
    for (const label of document.querySelectorAll('.tile-label')) {
      label.style.visibility = ${JSON.stringify(value)};
    }
    return getComputedStyle(document.querySelector('.tile-label')).visibility;
  })()`);
  const hidden = await hide('hidden');
  if (hidden !== 'hidden') throw new Error(`the names could not be hidden for the measurement: ${hidden}`);
  const bare = await shot('00-strip-without-names');
  await hide('');
  await d.pump(4);

  notes.contrast = {};
  for (const [key, value] of Object.entries(boxes.tiles)) {
    notes.contrast[key] = bandFigures(gallery.image, bare.image, scale,
      { ...value.label, height: Math.max(value.label.height, 1) });
  }

  // -------------------------------------------- the previews are the effect
  // What each tile's canvas actually contains, read from the canvas itself:
  // the same three probes the stage is judged by in gradient-shots.js.
  notes.previews = await d.js(`(() => {
    const out = {};
    for (const canvas of document.querySelectorAll('.tile-canvas')) {
      const g = canvas.getContext('2d', { willReadFrequently: true });
      const px = (x, y) => { const d = g.getImageData(x, y, 1, 1).data; return [d[0], d[1], d[2]]; };
      out[canvas.id] = {
        size: [canvas.width, canvas.height],
        left: px(1, 100), middle: px(160, 100), right: px(318, 100), corner: px(1, 1)
      };
    }
    return out;
  })()`);

  // ------------------------------------------------------------ the states
  // A REAL Tab, through the protocol, and not element.focus(): Chromium only
  // matches :focus-visible when the last interaction was a keyboard one, so a
  // programmatic focus photographs a tile with no ring on it and proves
  // nothing about whether the ring exists. The tile before it is focused
  // first only so the Tab has one step to make.
  await win.webContents.debugger.attach('1.3');
  await d.js(`document.getElementById('gallery-solid').focus(), true`);
  await d.key('Tab', 'Tab', 9);
  notes.keyboard = await d.js(`(() => {
    const active = document.activeElement;
    return { id: active.id, ring: getComputedStyle(active).outlineColor,
             visible: active.matches(':focus-visible') };
  })()`);
  await shot('02-strip-focused');

  await shot('03-strip-1040x700', { size: [1040, 700] });
  await shot('04-strip-1760x1000', { size: [1760, 1000] });

  const beside = await shot('05-beside-the-reference', { size: [1280, 820] });

  // ------------------------------------------------- reference and result
  if (REFERENCE) {
    const ours = `data:image/png;base64,${beside.image.toPNG().toString('base64')}`;
    const theirs = `data:image/png;base64,${readFileSync(REFERENCE).toString('base64')}`;
    // Composed on an off-DOM canvas inside the window that is already open:
    // both sources are data: URIs, which the page's own img-src already
    // allows, so nothing about the security shape of the app moves for this.
    const composite = await d.js(`(async () => {
      const load = (src) => new Promise((done, fail) => {
        const image = new Image();
        image.onload = () => done(image);
        image.onerror = fail;
        image.src = src;
      });
      const [a, b] = await Promise.all([load(${JSON.stringify(theirs)}), load(${JSON.stringify(ours)})]);
      const height = Math.max(a.naturalHeight, b.naturalHeight);
      const scaleA = height / a.naturalHeight;
      const scaleB = height / b.naturalHeight;
      const widthA = Math.round(a.naturalWidth * scaleA);
      const widthB = Math.round(b.naturalWidth * scaleB);
      const canvas = document.createElement('canvas');
      canvas.width = widthA + widthB + 24;
      canvas.height = height;
      const g = canvas.getContext('2d');
      g.drawImage(a, 0, 0, widthA, height);
      g.drawImage(b, widthA + 24, 0, widthB, height);
      return canvas.toDataURL('image/png');
    })()`);
    const file = join(OUT, '06-reference-und-signalforge.png');
    writeFileSync(file, Buffer.from(composite.split(',')[1], 'base64'));
    process.stdout.write(`shot ${file}\n`);

    // And the two strips alone, side by side and at the same scale, which is
    // the comparison this whole piece of work is about.
    const refImage = nativeImage.createFromPath(REFERENCE);
    const refStrip = refImage.crop({ x: 205, y: 780, width: 1060, height: 130 });
    writeFileSync(join(OUT, '07-reference-strip.png'), refStrip.toPNG());
    const ourStrip = beside.image.crop({
      x: Math.round(boxes.rail.x * scale),
      y: Math.round((boxes.rail.y - 22) * scale),
      width: Math.round(boxes.rail.width * scale),
      height: Math.round((boxes.rail.height + 22) * scale)
    });
    writeFileSync(join(OUT, '08-our-strip.png'), ourStrip.toPNG());
    process.stdout.write(`shot ${join(OUT, '07-reference-strip.png')}\n`);
    process.stdout.write(`shot ${join(OUT, '08-our-strip.png')}\n`);
  }

  process.stdout.write(`${JSON.stringify(notes, null, 2)}\n`);
  writeFileSync(join(OUT, 'notes.json'), JSON.stringify(notes, null, 2), 'utf8');
}

// runHarness ends this process however main() ends — see test/harness/driver.js.
runHarness('tiles-shots', main);
