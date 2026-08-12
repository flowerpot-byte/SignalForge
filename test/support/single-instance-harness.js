// SignalForge — build SignalRGB effects from images, gradients, shapes and particles.
// Copyright (C) 2026 Max Leopold Blumenschein
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
import { windowDisplay } from '../../app/main.js';
import { guardHarness } from '../harness/driver.js';

/**
 * The one harness with no ending of its own.
 *
 * Every other Electron entry in this project does its work and leaves. The
 * winning instance here deliberately does not: it holds the lock and waits to
 * be killed by test/app/single-instance.test.js, which is the only way to
 * prove a SECOND launch is refused. That makes it the likeliest thing in the
 * suite to be orphaned — if the test process dies (a cancelled run, a killed
 * shell), nothing is left that would ever end this one, and it sits there with
 * a window nobody can see until somebody notices it in the task manager.
 *
 * So it gets an outer bound of its own. The test's own waits add up to about
 * 80 s in the worst case (four 20 s stages); 120 s is comfortably past that
 * and comfortably short of "for ever". The exit code does not matter here —
 * the test kills this process and never reads it — but the message does, so
 * that a run cut short this way says why.
 */
guardHarness('single-instance-harness', { watchdogMs: 120_000 });

// Never on screen. This harness is spawned twice by `npm test` and the winning
// instance used to put a real window in front of whoever was using the
// machine. Nothing this test reads needs one: it counts windows, minimises one
// and reads back whether it was restored, all of which a window that was never
// shown answers exactly the same way.
windowDisplay.show = false;

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

  /**
   * Keep the window off the screen even while it is being minimised and
   * restored.
   *
   * `windowDisplay.show = false` above is not enough by itself, and that is
   * measured rather than assumed: minimize() and restore() are Win32
   * show-state changes, so calling them on a window that was never shown puts
   * it back ON the screen — which is how a window still appeared during a full
   * `npm test`, a second or so of it, once per run. Three answers, because one
   * of them alone leaves a gap:
   *
   *  - no taskbar button, so the minimised state shows nothing either;
   *  - fully transparent, so a frame that does slip through is a frame of
   *    nothing;
   *  - hidden again the instant it is restored, which is app/main.js's own
   *    second-instance handler doing exactly what it should.
   *
   * None of it touches what the test reads: isMinimized() is false for a
   * hidden window just as it is for a restored one, and the count of windows
   * is unchanged.
   */
  const [win] = BrowserWindow.getAllWindows();
  if (!win) return;
  win.setSkipTaskbar(true);
  win.setOpacity(0);
  win.on('restore', () => win.hide());
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
