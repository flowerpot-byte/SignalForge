// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * A harness that goes wrong on purpose, one way per run.
 *
 * The point of this file is that it is a REAL Electron main process with a
 * REAL BrowserWindow open. That is what makes the checks in
 * test/app/harness-lifecycle.test.js worth anything: without the guarantees in
 * test/harness/driver.js, every mode below except 'ok' leaves this process
 * resident forever — measured, not assumed. An Electron main process does not
 * die of an unhandled promise rejection the way `node script.js` does; it
 * prints a warning and carries on, with the window still open and nobody
 * waiting for it.
 *
 * It deliberately does NOT import app/main.js. Nothing here is about the app;
 * it is about the lifecycle wrapper, and a window of its own keeps the check
 * fast and keeps it from depending on anything the app might change.
 *
 * SF_LIFECYCLE_MODE picks the failure:
 *   ok         does its work and returns             -> exit 0
 *   throw      an assertion throws mid-run           -> exit 1
 *   reject     a promise rejects with nobody waiting -> exit 1
 *   uncaught   a throw from a timer callback         -> exit 1
 *   hang       waits for something that never comes  -> exit 1, by watchdog
 *   code       returns a non-zero code of its own    -> exit 3
 */
import { BrowserWindow } from 'electron';
import { runHarness } from '../harness/driver.js';

const MODE = process.env.SF_LIFECYCLE_MODE || 'ok';

runHarness('lifecycle-harness', async () => {
  // Never shown. Every window this project's tooling opens is created hidden
  // and photographed with capturePage(); none of them is ever put on screen.
  const win = new BrowserWindow({
    show: false,
    width: 200,
    height: 200,
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false }
  });
  // Proof, for the test, that there really is a window holding this process
  // open — so that a run which ends anyway ended because of the guard.
  process.stdout.write(`lifecycle-harness up windows=${BrowserWindow.getAllWindows().length}\n`);

  if (MODE === 'throw') throw new Error('an assertion threw mid-run');
  if (MODE === 'reject') {
    Promise.reject(new Error('a promise rejected with nobody waiting'));
    // Long enough that the process would plainly still be here if the
    // unhandledRejection handler were not what ended it.
    await new Promise((resolve) => setTimeout(resolve, 30_000));
  }
  if (MODE === 'uncaught') {
    setTimeout(() => { throw new Error('a throw from a timer callback'); }, 10);
    await new Promise((resolve) => setTimeout(resolve, 30_000));
  }
  if (MODE === 'hang') await new Promise(() => {});
  if (MODE === 'code') return 3;

  win.destroy();
  return 0;
});
