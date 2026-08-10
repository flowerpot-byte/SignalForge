// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const root = dirname(dirname(here));

/**
 * The page a canvas lives in — the same one src/main/prepare-image-runner.cjs
 * loads, because it is the same work.
 */
export const ENGINE_HOST = join(here, 'engine-host.html');

/**
 * The path to the Electron binary to spawn as the helper process.
 *
 * `require('electron')` is not stable across callers: run under plain
 * Node.js (the test suite, bin/sfexport.js) the "electron" npm package
 * resolves to a string — the path to the electron executable. But when this
 * very module is loaded *inside* a running Electron main process (as
 * app/main.js does for the drag-and-drop import), Electron's own require
 * hook shadows that package with its built-in API namespace object instead,
 * so `require('electron')` there returns `{ app, BrowserWindow, ... }`, not
 * a path. Handing that object to `spawn()` as the command fails with
 * "The \"file\" argument must be of type string" — a failure no test caught
 * because none of them called prepareImageFile from inside a live Electron
 * process; a real drag-and-drop through the built app did.
 * `versions.electron` is only set when the current process actually is
 * Electron, in which case `execPath` is the very binary already running and
 * is exactly what a helper process should also run. `versions`/`execPath`/
 * `requireElectron` are injectable so this can be proven for both contexts
 * without actually needing to run inside one.
 *
 * Since prepareImageInProcess exists, a caller that is already inside Electron
 * never reaches the spawn at all, so the first branch below is a safety net
 * rather than a live path — it stays because the alternative is a function that
 * is right only as long as nobody calls it from the wrong place again.
 */
export function resolveElectronBin(
  { versions = process.versions, execPath = process.execPath, requireElectron = () => require_('electron') } = {}
) {
  return versions.electron ? execPath : requireElectron();
}

const electronBin = resolveElectronBin();

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

  const dir = mkdtempSync(join(tmpdir(), 'signalforge-prepare-'));
  const requestFile = join(dir, 'request.json');
  const outFile = join(dir, 'asset.json');
  writeFileSync(requestFile, JSON.stringify({ dataUrl, options }), 'utf8');

  try {
    await new Promise((resolve, reject) => {
      const child = spawn(electronBin, [
        join(root, 'src', 'main', 'prepare-image-runner.cjs'), requestFile, outFile
      ], { stdio: ['ignore', 'ignore', 'pipe'] });
      let stderr = '';
      let settled = false;

      child.stderr.on('data', (chunk) => { stderr += chunk; });

      // 'close' alone is not enough: if some descendant process keeps a
      // pipe open after the child itself has exited (a known Chromium
      // multi-process quirk), 'close' never fires and this promise would
      // hang forever. This timeout, paired with the settled guard below,
      // is what test/harness/render.js uses for the identical risk.
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        child.kill();
        reject(new Error(`prepare timed out after ${timeoutMs}ms\n${stderr}`));
      }, timeoutMs);

      child.on('error', (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
      });

      // 'close' (not 'exit') waits for stdio to finish draining, so stderr
      // above is guaranteed complete by the time we read it here. Same
      // reasoning as test/harness/render.js.
      child.on('close', (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (code === 0) { resolve(); return; }

        // prepare-image-runner.cjs writes the real error into outFile
        // before exiting non-zero. Surface that instead of the bare exit
        // code, without letting a bad outFile mask the original failure.
        if (existsSync(outFile)) {
          try {
            const raw = JSON.parse(readFileSync(outFile, 'utf8'));
            if (raw && raw.error) {
              reject(new Error(`prepare failed (${code}): ${raw.error}`));
              return;
            }
          } catch {
            // outFile wasn't valid JSON (partial write); fall through.
          }
        }
        reject(new Error(`prepare failed (${code})\n${stderr}`));
      });
    });

    const asset = JSON.parse(readFileSync(outFile, 'utf8'));
    if (asset.error) throw new Error(asset.error);
    return asset;
  } finally {
    // On the timeout path the child is killed rather than allowed to exit
    // on its own, so on Windows its handles on files in `dir` can take a
    // moment to actually release; retry past that instead of leaking the
    // directory. `force: true` only swallows ENOENT, not EBUSY/EPERM once
    // retries are exhausted, so rmSync can still throw here. A throw from a
    // finally block replaces whatever the try block was about to
    // resolve/reject with, which would hide the real outcome (e.g. the
    // "prepare timed out" rejection this cleanup exists for) behind a
    // filesystem error. Guard it the same way the 'close' handler above
    // guards its own outFile parsing, so a cleanup failure can never mask
    // the original result.
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    } catch {
      // Best-effort cleanup only; the caller needs the real outcome above,
      // not a leftover-temp-directory error.
    }
  }
}
