// SignalForge — build SignalRGB effects from images, gradients, shapes and particles.
// Copyright (C) 2026 Max Leopold Blumenschein
// SPDX-License-Identifier: GPL-3.0-or-later
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);

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
 * Every caller that can work inside Electron does (prepareImageInProcess,
 * renderCoverInProcess), so the first branch below is a safety net rather
 * than a live path — it stays because the alternative is a function that is
 * right only as long as nobody calls it from the wrong place again.
 */
export function resolveElectronBin(
  { versions = process.versions, execPath = process.execPath, requireElectron = () => require_('electron') } = {}
) {
  return versions.electron ? execPath : requireElectron();
}

/**
 * Run one of this project's Electron runner scripts and hand back what it
 * wrote — the plumbing, once, for every job that needs a canvas from a
 * process that has none.
 *
 * It exists as its own file because it was written twice before it was
 * written once: preparing an image and rendering a cover image are different
 * jobs with identical needs, and the parts that are easy to get subtly wrong
 * are the same in both — the settled guard (a child can both time out and
 * exit), 'close' rather than 'exit' (so stderr is complete when it is read),
 * digging the runner's own error out of the result file rather than reporting
 * a bare exit code, and a cleanup that cannot mask the real outcome. This
 * project has been bitten repeatedly by second copies; this is the one copy.
 *
 * `label` names the job in every error message, so a timeout says which job
 * timed out. `spawnProcess` and `electronBin` are injectable for tests that
 * must not actually launch anything.
 *
 * The binary is resolved lazily, at call time. Resolving it at import time
 * would mean a machine without the electron package installed could not even
 * LOAD the module — which would take bin/sfexport.js's whole export down with
 * it, rather than costing only the cover image it can degrade without.
 */
export async function runElectronHelper({
  runner,
  request,
  label,
  prefix,
  timeoutMs,
  spawnProcess = spawn,
  electronBin = null
}) {
  const binary = electronBin ?? resolveElectronBin();
  const dir = mkdtempSync(join(tmpdir(), prefix));
  const requestFile = join(dir, 'request.json');
  const outFile = join(dir, 'out.json');
  writeFileSync(requestFile, JSON.stringify(request), 'utf8');

  try {
    await new Promise((resolve, reject) => {
      const child = spawnProcess(binary, [runner, requestFile, outFile], {
        stdio: ['ignore', 'ignore', 'pipe']
      });
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
        reject(new Error(`${label} timed out after ${timeoutMs}ms\n${stderr}`));
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

        // Every runner writes the real error into outFile before exiting
        // non-zero. Surface that instead of the bare exit code, without
        // letting a bad outFile mask the original failure.
        if (existsSync(outFile)) {
          try {
            const raw = JSON.parse(readFileSync(outFile, 'utf8'));
            if (raw && raw.error) {
              reject(new Error(`${label} failed (${code}): ${raw.error}`));
              return;
            }
          } catch {
            // outFile wasn't valid JSON (partial write); fall through.
          }
        }
        reject(new Error(`${label} failed (${code})\n${stderr}`));
      });
    });

    const result = JSON.parse(readFileSync(outFile, 'utf8'));
    if (result.error) throw new Error(result.error);
    return result;
  } finally {
    // On the timeout path the child is killed rather than allowed to exit
    // on its own, so on Windows its handles on files in `dir` can take a
    // moment to actually release; retry past that instead of leaking the
    // directory. `force: true` only swallows ENOENT, not EBUSY/EPERM once
    // retries are exhausted, so rmSync can still throw here. A throw from a
    // finally block replaces whatever the try block was about to
    // resolve/reject with, which would hide the real outcome (e.g. the
    // "timed out" rejection this cleanup exists for) behind a filesystem
    // error. Guard it the same way the 'close' handler above guards its own
    // outFile parsing, so a cleanup failure can never mask the original
    // result.
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    } catch {
      // Best-effort cleanup only; the caller needs the real outcome above,
      // not a leftover-temp-directory error.
    }
  }
}
