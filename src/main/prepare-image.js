// SignalForge — build SignalRGB effects from images, gradients, shapes and particles.
// Copyright (C) 2026 Max Leopold Blumenschein
// SPDX-License-Identifier: GPL-3.0-or-later
import { readFileSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { runElectronHelper, resolveElectronBin } from './electron-helper.js';

const require_ = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));

/**
 * The page a canvas lives in — the same one src/main/prepare-image-runner.cjs
 * loads, because it is the same work.
 */
export const ENGINE_HOST = join(here, 'engine-host.html');

/**
 * Re-exported rather than defined here: it moved to electron-helper.js, next
 * to the spawn that is its only reason for existing, once a second job
 * (rendering a cover image) needed the same binary. This keeps the name where
 * everything that already knows it looks for it.
 */
export { resolveElectronBin };

const MIME_BY_EXTENSION = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp'
};

// Electron's cold-launch cost on a slow machine is the same burden
// test/harness/render.js budgets for, but afterwards there is only one
// image to prepare instead of a batch of render jobs. 30s is generous
// enough to survive a cold launch without waiting as long as render.js's
// 60s, which budgets for actual batch work on top of that same startup.
const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Prepare the asset in THIS process, in a window nobody ever sees.
 *
 * Why this exists at all: the spawn below runs a second Electron and hands it
 * a script to run, which is exactly what `electron <script>` does — in a
 * development checkout. A PACKAGED app ignores that argument entirely. Its
 * executable always loads its own bundled main entry, so spawning it would
 * start a second copy of SignalForge (measured: it boots app/main.js and never
 * looks at argv[1]), which then quits against the single-instance lock without
 * ever writing the asset file. Every dropped or picked picture in the
 * installed app would have failed.
 *
 * There is nothing to spawn for, though, whenever the caller is already
 * running inside Electron — app/main.js's import handler always is. A canvas
 * exists here; use it. `bin/sfexport.js`, which runs under plain Node, still
 * goes the long way round.
 *
 * `createWindow` is injectable so the choice above can be proven from a plain
 * Node test, which cannot construct a BrowserWindow at all.
 */
export async function prepareImageInProcess({ dataUrl, options }, {
  createWindow = () => new (require_('electron').BrowserWindow)({
    show: false, webPreferences: { backgroundThrottling: false }
  }),
  hostFile = ENGINE_HOST
} = {}) {
  const win = createWindow();
  try {
    await win.loadFile(hostFile);
    return await win.webContents.executeJavaScript(
      `window.SignalForgeEngine.prepareImageAsset(${JSON.stringify(dataUrl)}, `
      + `${JSON.stringify(options)})`
    );
  } finally {
    // destroy(), not close(): close() is a request the page could in principle
    // delay, and nothing here has anything to save.
    win.destroy();
  }
}

/**
 * Prepare an image file for embedding, using the very same engine code the
 * app uses. Runs it inside Electron because that is where a canvas exists —
 * this one when this process is already Electron, a spawned one when it is not.
 */
export async function prepareImageFile(imagePath, options = {}, {
  timeoutMs = DEFAULT_TIMEOUT_MS,
  inElectron = Boolean(process.versions.electron),
  inProcess = prepareImageInProcess
} = {}) {
  const extension = extname(imagePath).toLowerCase();
  const mime = MIME_BY_EXTENSION[extension];
  if (!mime) throw new Error(`unsupported image type: ${extension || '(none)'}`);

  const dataUrl = `data:${mime};base64,${readFileSync(imagePath).toString('base64')}`;

  if (inElectron) return inProcess({ dataUrl, options });

  // The spawn, its timeout, its cleanup and the way it digs the runner's own
  // error out of the result file all live in electron-helper.js — the same
  // plumbing src/main/cover-image.js needs, kept in one place rather than in
  // two that drift.
  return runElectronHelper({
    runner: join(here, 'prepare-image-runner.cjs'),
    request: { dataUrl, options },
    label: 'prepare',
    prefix: 'signalforge-prepare-',
    timeoutMs
  });
}
