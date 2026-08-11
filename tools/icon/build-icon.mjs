// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Draw the application icon.
 *
 *   npx electron tools/icon/build-icon.mjs [--preview <file.png>]
 *
 * Writes `build/icon.png`, a 512 x 512 square that electron-builder turns into
 * the Windows .ico by itself (see the "build" block in package.json).
 *
 * WHY IT IS DRAWN HERE AND NOT DOWNLOADED
 *
 * The mark is the app's own: `GLYPHS.mark` in
 * app/renderer/components/icons.js — "a bolt inside a rounded square" — which
 * is what the window already shows in its left column and in the bottom bar.
 * There is no icon library in this project and `dependencies` stays empty, so
 * the icon is drawn from that same description with the same tools the app
 * itself uses for image work: an Electron window, a canvas, and nothing else.
 * src/main/prepare-image-runner.cjs is the precedent.
 *
 * WHAT CHANGES BETWEEN THE 16 PIXEL GLYPH AND THIS
 *
 * The glyph in the window is a STROKE, because at 16 px inside a button it
 * sits beside a dozen other stroked glyphs of the same weight. An application
 * icon has no such neighbours and one job: to be recognisable at 16 x 16 in the
 * task bar and in Windows search. So the rounded square becomes the icon's own
 * tile — filled, in the app's own dark — and the bolt inside it becomes a solid
 * accent shape at about 70% of the tile's height. A 1.5/16 hairline rectangle
 * plus a 4 px bolt, scaled down to 16 px, is the grey smudge this deliberately
 * is not.
 *
 * Every colour comes out of app/renderer/styles/tokens.css, read at run time.
 * That is the project's rule — one place, no second copy — and it is why this
 * file contains no colour of its own.
 *
 * THE PREVIEW
 *
 * `--preview <file.png>` writes a second picture: the icon downscaled to the
 * sizes Windows actually uses (16, 20, 24, 32, 48, 64, 128) and then
 * magnified with smoothing off, so each one can be judged for what it is. It is
 * a check, not an artefact — nothing in the build reads it.
 */
import { app, BrowserWindow, nativeImage } from 'electron';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const TOKENS = join(root, 'app', 'renderer', 'styles', 'tokens.css');
const OUT = join(root, 'build', 'icon.png');

/** The size the icon is drawn at. Everything Windows needs is below this. */
const SIZE = 512;

/** The sizes the preview sheet judges, and how far each is magnified. */
const PREVIEW_SIZES = [16, 20, 24, 32, 48, 64, 128];
const PREVIEW_MAGNIFICATION = 4;

const previewFlag = process.argv.indexOf('--preview');
const PREVIEW = previewFlag === -1 ? null : resolve(process.argv[previewFlag + 1]);

/**
 * One custom property out of tokens.css.
 *
 * Reading rather than repeating: tokens.css says of itself that it is "the one
 * place every colour in this project lives", and app/main.js already reads
 * --bg-base out of it for the window's first paint rather than writing the
 * value down a second time. Same rule, same file, same reason.
 */
function token(name) {
  const css = readFileSync(TOKENS, 'utf8');
  const value = new RegExp(`--${name}:\\s*([^;]+);`).exec(css)?.[1].trim();
  if (!value) throw new Error(`tokens.css has no --${name}`);
  return value;
}

/**
 * The mark, as an icon.
 *
 * On the glyph set's own 16 x 16 grid, so the bolt below is literally the path
 * from GLYPHS.mark — copied, not redrawn, which is what keeps the icon and the
 * window showing the same mark.
 */
function markSvg({ bgBase, bgNav, accent, accentHover }) {
  // GLYPHS.mark's bolt, verbatim from app/renderer/components/icons.js. Its
  // box is x 6..10.4, y 4.4..11.6, so its middle is (8.2, 8) — which is what
  // the transform below turns about.
  const bolt = 'M8.8 4.4 6 8.4h2.6L7.2 11.6l3.2-4.2H7.8z';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="${SIZE}" height="${SIZE}">
  <defs>
    <linearGradient id="tile" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${bgNav}" />
      <stop offset="1" stop-color="${bgBase}" />
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="${accent}" stop-opacity="0.45" />
      <stop offset="1" stop-color="${accent}" stop-opacity="0" />
    </radialGradient>
    <linearGradient id="bolt" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${accentHover}" />
      <stop offset="1" stop-color="${accent}" />
    </linearGradient>
  </defs>
  <!-- The rounded square of the mark, filled: at icon size it IS the tile. -->
  <rect x="0" y="0" width="16" height="16" rx="3.6" fill="url(#tile)" />
  <!-- The accent, felt rather than seen: it is what stops the tile reading as
       a black hole at 16 px, and it disappears into the fill at 256. -->
  <circle cx="8" cy="8.4" r="7" fill="url(#glow)" />
  <!-- The rounded square's own edge, which survives only at the larger sizes
       and is why the icon still reads as the mark when it is big. -->
  <rect x="0.5" y="0.5" width="15" height="15" rx="3.2"
        fill="none" stroke="${accent}" stroke-opacity="0.5" stroke-width="0.4" />
  <!-- The bolt, solid and large: the one thing that has to survive to 16 px. -->
  <g transform="translate(8 8) scale(1.55) translate(-8.2 -8)">
    <path d="${bolt}" fill="url(#bolt)" />
  </g>
</svg>`;
}

/**
 * The page the icon is rendered in: the mark, filling the window exactly.
 *
 * `background:transparent` on both the page and the body, spelled out rather
 * than left to the default. A transparent window (see capture()) is only half
 * the story — the document still paints its own canvas underneath the SVG, and
 * on a page that says nothing that canvas is opaque white, which would put the
 * white corners straight back.
 */
function iconPage(svg) {
  return `<!doctype html><meta charset="utf-8" />
<style>html,body{background:transparent}</style>
<body style="margin:0;padding:0;width:${SIZE}px;height:${SIZE}px;overflow:hidden">${svg}</body>`;
}

/**
 * The preview sheet: the finished icon, shrunk to each of the sizes Windows
 * asks for and blown back up with smoothing off, so what is on screen is the
 * pixels the task bar would get rather than a smooth re-render of the vector.
 */
function previewPage(pngBase64, background) {
  const width = PREVIEW_SIZES.reduce((sum, size) => sum + size * PREVIEW_MAGNIFICATION + 24, 24);
  const height = 128 * PREVIEW_MAGNIFICATION + 48;
  return `<!doctype html><meta charset="utf-8" />
<body style="margin:0;padding:0;background:${background};overflow:hidden">
<canvas id="sheet" width="${width}" height="${height}"></canvas>
<script>
  window.__done = new Promise((done) => {
    const image = new Image();
    image.onload = () => {
      const sheet = document.getElementById('sheet');
      const g = sheet.getContext('2d');
      let x = 24;
      for (const size of ${JSON.stringify(PREVIEW_SIZES)}) {
        const small = document.createElement('canvas');
        small.width = size; small.height = size;
        const sg = small.getContext('2d');
        sg.imageSmoothingEnabled = true;
        sg.imageSmoothingQuality = 'high';
        sg.drawImage(image, 0, 0, size, size);
        g.imageSmoothingEnabled = false;
        const drawn = size * ${PREVIEW_MAGNIFICATION};
        g.drawImage(small, x, 24, drawn, drawn);
        x += drawn + 24;
      }
      done(true);
    };
    image.src = 'data:image/png;base64,${pngBase64}';
  });
</script></body>`;
}

const wait = (ms) => new Promise((done) => { setTimeout(done, ms); });

/**
 * Refuse to write an icon whose corners are not see-through.
 *
 * This is the check the icon shipped without, and the reason nobody noticed:
 * the mark is dark, every preview of it in this project sits on a dark
 * background, and an opaque white corner against dark is invisible in a
 * thumbnail while being glaring in SignalRGB's own light effect list. Looking
 * at a picture cannot answer this question; the alpha byte can.
 *
 * The bitmap is read straight out of the PNG that is about to be written, so
 * what is checked is the file, not the intention behind it.
 */
function assertCornersTransparent(png) {
  const image = nativeImage.createFromBuffer(png);
  const { width, height } = image.getSize();
  // BGRA, one row after another, no padding.
  const bitmap = image.toBitmap();
  const alphaAt = (x, y) => bitmap[(y * width + x) * 4 + 3];

  // The corner pixel itself, and one a few pixels in along each edge: a radius
  // that had collapsed to nearly nothing would still leave the very corner
  // clear while the rest of the curve was filled.
  const probes = [];
  for (const [x, y] of [[0, 0], [width - 1, 0], [0, height - 1], [width - 1, height - 1]]) {
    const inX = x === 0 ? 4 : width - 5;
    const inY = y === 0 ? 4 : height - 5;
    probes.push([x, y], [inX, y], [x, inY]);
  }

  const opaque = probes.filter(([x, y]) => alphaAt(x, y) !== 0);
  if (opaque.length > 0) {
    throw new Error(
      `the icon's corners are not transparent: ${opaque
        .map(([x, y]) => `${x},${y} alpha ${alphaAt(x, y)}`).join('; ')}`
    );
  }

  // And the mark itself must still be there — a fully transparent square would
  // pass every check above and be no icon at all.
  const middle = alphaAt(width >> 1, height >> 1);
  if (middle !== 255) throw new Error(`the middle of the icon is not opaque (alpha ${middle})`);

  process.stdout.write(`corners transparent (alpha 0 at ${probes.length} probe points), middle opaque\n`);
}

/**
 * A window nobody ever sees, photographed twice.
 *
 * The page arrives as a FILE rather than as a `data:` URL: Electron refuses a
 * top-level navigation to `data:` and hands back a bare ERR_FAILED, which is
 * measured here and not assumed. The file goes to a throwaway directory and is
 * removed again with it.
 *
 * WHY THE WINDOW IS TRANSPARENT
 *
 * capturePage() photographs the window, not the page — it hands back whatever
 * the compositor put on screen, which is the page drawn ON TOP OF the window's
 * own background. A BrowserWindow's default background is opaque white. The
 * mark is a rounded square, so the four corners outside its radius are the one
 * part of the icon the SVG deliberately does not paint, and every one of them
 * came back as 255,255,255,255 — a white notch in each corner of the app icon,
 * which is exactly what SignalRGB's effect list showed.
 *
 * `transparent` plus a fully transparent `backgroundColor` is what makes the
 * unpainted area stay unpainted all the way through the capture. It is opt-in
 * rather than always on because the preview sheet paints its own opaque
 * background and gains nothing from it.
 */
async function capture(html, width, height, { transparent = false } = {}) {
  const page = join(mkdtempSync(join(tmpdir(), 'signalforge-icon-')), 'page.html');
  writeFileSync(page, html, 'utf8');
  const win = new BrowserWindow({
    width, height, useContentSize: true, show: false,
    transparent,
    // A transparent window on Windows keeps its frame unless told otherwise,
    // and `useContentSize` stops being honoured for it: the first attempt at
    // this came back as a 512 x 538 capture, the extra 26 rows being the title
    // bar. Frameless makes the window exactly its content, which is what the
    // size check below then confirms rather than assumes.
    frame: !transparent,
    // Both, not just one: `transparent` allows the window to be see-through,
    // and the background colour is what it is see-through TO. Left at its
    // default the window still composites opaque white underneath.
    backgroundColor: transparent ? '#00000000' : undefined,
    webPreferences: { backgroundThrottling: false }
  });
  try {
    await win.loadFile(page);
    await win.webContents.executeJavaScript('window.__done ?? true');
    // A window nobody is showing paints on demand, and it needs a moment to
    // have a frame sink at all — without this pause capturePage() fails
    // outright with "UnknownVizError".
    await wait(500);
    // Twice, and only the second one kept: the first render is what commits
    // the layer — the same measured behaviour test/harness/shots.js documents.
    await win.capturePage();
    await wait(200);
    const shot = await win.capturePage();
    const size = shot.getSize();
    if (size.width !== width || size.height !== height) {
      throw new Error(
        `expected a ${width} x ${height} capture, got ${size.width} x ${size.height} — `
        + 'the display scale factor was not forced to 1'
      );
    }
    return shot.toPNG();
  } finally {
    win.destroy();
    rmSync(dirname(page), { recursive: true, force: true });
  }
}

// One device pixel per CSS pixel, whatever the machine's display is set to, so
// the file is 512 x 512 on a laptop and on a 4K monitor alike.
app.commandLine.appendSwitch('force-device-scale-factor', '1');
// Electron quits by itself once the last window is closed, and this tool
// closes its window between the icon and the preview sheet. Without this the
// second window is created into an application that is already shutting down
// and its load fails with a bare ERR_FAILED.
app.on('window-all-closed', () => {});
// Hardware acceleration is deliberately NOT disabled here, unlike in
// src/main/prepare-image-runner.cjs: that runner reads its result out of the
// page with executeJavaScript, whereas this one photographs the window, and
// capturePage() on a machine with the compositor switched off fails outright
// with "UnknownVizError". Measured, not assumed — it is what this file did on
// its first run.

app.whenReady().then(async () => {
  try {
    const colours = {
      bgBase: token('bg-base'),
      bgNav: token('bg-nav'),
      accent: token('accent'),
      accentHover: token('accent-hover')
    };
    const png = await capture(iconPage(markSvg(colours)), SIZE, SIZE, { transparent: true });
    assertCornersTransparent(png);
    mkdirSync(dirname(OUT), { recursive: true });
    writeFileSync(OUT, png);
    process.stdout.write(`icon ${OUT} (${png.length} bytes)\n`);

    if (PREVIEW) {
      const sheetWidth = PREVIEW_SIZES.reduce((sum, s) => sum + s * PREVIEW_MAGNIFICATION + 24, 24);
      const sheetHeight = 128 * PREVIEW_MAGNIFICATION + 48;
      const sheet = await capture(
        previewPage(png.toString('base64'), colours.bgBase), sheetWidth, sheetHeight
      );
      mkdirSync(dirname(PREVIEW), { recursive: true });
      writeFileSync(PREVIEW, sheet);
      process.stdout.write(`preview ${PREVIEW}\n`);
    }
    app.quit();
  } catch (error) {
    console.error('the icon could not be drawn:', error);
    app.exit(1);
  }
});
