// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * A real, single-instance-guarded app/main.js, with the escape hatch turned
 * back off.
 *
 * test/app/single-instance.test.js needs two things a plain SF_SELFTEST spawn
 * cannot give it: a genuine app.requestSingleInstanceLock() call (the whole
 * test suite is armed to skip it, see src/main/single-instance.js) and a
 * userData directory the test controls, so two spawns of this file actually
 * contend for the SAME lock without ever going near a real installation's
 * default one.
 *
 * Same trick as test/harness/walkthrough.js and
 * test/support/forgetful-harness.js: importing app/main.js only registers its
 * whenReady handler (module bodies finish before 'ready' fires), so setting
 * things up here — after the import, before 'ready' — reaches app/main.js in
 * time to see the redirected userData path and the armed effects sandbox.
 */
import { app, BrowserWindow } from 'electron';
import { existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { SINGLE_INSTANCE_TEST_ENV } from '../../src/main/single-instance.js';
import '../../app/main.js';

const out = process.env.SF_SINGLE_INSTANCE_OUT;
if (!out) throw new Error('SF_SINGLE_INSTANCE_OUT must name a folder to work in');
const effects = process.env.SF_SINGLE_INSTANCE_EFFECTS;
if (!effects) throw new Error('SF_SINGLE_INSTANCE_EFFECTS must name a throwaway effects folder');

app.setPath('userData', out);
// Armed by `npm test` for the whole suite (test/support/single-instance-test.js);
// turned back off here, because this is the one process that is meant to
// exercise the real lock rather than skip it.
delete process.env[SINGLE_INSTANCE_TEST_ENV];
// SF_EFFECTS_SANDBOX_REQUIRED is armed the same way and is NOT turned off
// here — this harness still must not be able to reach a real SignalRGB
// folder, so it names its own throwaway one, same as every other harness.
process.env.SF_EFFECTS_SANDBOX = effects;
mkdirSync(effects, { recursive: true });

// Registered before 'ready', deliberately: app/main.js only registers its own
// 'second-instance' listener once it holds the lock (inside its whenReady
// handler), which happens strictly after this file's top level has already
// run — so registering here is never too late for the second launch this
// test controls itself.
app.on('second-instance', () => {
  process.stdout.write('harness saw second-instance\n');
  // Deferred so app/main.js's own listener — registered later than this one
  // (it only runs inside its whenReady handler, well after this file's top
  // level), but still called synchronously within the same emit() — has
  // already had its turn to restore/focus the window before this reads state.
  setTimeout(() => {
    const [win] = BrowserWindow.getAllWindows();
    process.stdout.write(
      `harness after-second-instance minimized=${win ? win.isMinimized() : 'no-window'} `
        + `focused=${win ? win.isFocused() : 'no-window'}\n`
    );
  }, 200);
});

app.on('before-quit', () => {
  // The most direct signal there is that a losing second instance never
  // created a window: read at the exact moment app.quit() (called by
  // app/main.js's own lock check) actually starts tearing the app down,
  // rather than inferring it from timing.
  process.stdout.write(`harness before-quit windowCount=${BrowserWindow.getAllWindows().length}\n`);
});

app.whenReady().then(() => {
  process.stdout.write(`harness ready windowCount=${BrowserWindow.getAllWindows().length}\n`);
});

// A file, polled for, rather than a line on stdin: measured by hand, an
// Electron main process spawned as the real electron.exe on Windows never
// delivers 'data' events on process.stdin at all, even though its own stdout
// reaches the parent just fine (stdio: 'pipe' wires up the pipe handle, but
// Chromium's own message loop does not appear to service it as a readable
// stream) — so a command sent that way would simply be lost, and a test
// built on it would hang until its own timeout. A file the test writes and
// this process polls for has no such dependency.
//
// This proves the second-instance handler's win.restore() actually restores
// rather than being a no-op on an already-normal window.
const minimizeSignal = join(out, 'minimize-signal');
const minimizePoll = setInterval(() => {
  if (!existsSync(minimizeSignal)) return;
  clearInterval(minimizePoll);
  unlinkSync(minimizeSignal);
  const [win] = BrowserWindow.getAllWindows();
  if (!win) return;
  win.minimize();
  process.stdout.write(`harness minimized=${win.isMinimized()}\n`);
}, 50);
