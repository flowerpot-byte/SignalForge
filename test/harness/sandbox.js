// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max Leopold Blumenschein
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * The five lines every Electron harness in this folder has to get right before
 * app/main.js opens anything, in one place.
 *
 * Five files carried this preamble word for word: shots.js, tiles-shots.js,
 * gradient-shots.js, unsaved.js and selftest.js. It is not boilerplate — it is
 * the whole reason a test run cannot touch the machine it runs on, and this
 * project has already had two files written into the real SignalRGB folder by
 * a harness that remembered half of it (see test/support/forgetful-harness.js,
 * which is that mistake kept on purpose). Written five times, it was five
 * chances to remember four fifths of it.
 *
 * What it does, and why each part is load bearing:
 *
 *  - a throwaway directory per run, with an Effects folder inside it;
 *  - Electron's userData pointed there, so a run never rewrites the settings
 *    of the app the machine's owner actually uses;
 *  - SF_EFFECTS_SANDBOX_REQUIRED (SANDBOX_ENV) naming that same directory, so
 *    app/main.js REFUSES to resolve an effects folder outside it — even a
 *    settings file naming somewhere real is turned down rather than written
 *    into. Set through the environment because app/main.js reads it at call
 *    time, not at import time;
 *  - the search for an existing SignalRGB installation pointed at the same
 *    throwaway directory, so "found nothing" is a fact rather than an accident
 *    of this machine, and so nothing here can reach the real folder even if a
 *    later change stopped setting the sandbox;
 *  - and windowDisplay.show, which is how a whole test run stays out of the way
 *    of whoever is using the machine.
 *
 * This has to run before app/main.js's own app.whenReady handler does, and it
 * does: importing that module only REGISTERS the handler, and every module body
 * finishes before the ready event fires.
 *
 * `show` is a parameter and not a copy, because it is the one thing the five
 * genuinely disagree about: the picture harnesses never show a window, the
 * self-test shows one only when a human asked for photographs, and the unsaved
 * harness shows one only for the drag-and-drop run that Chromium will not serve
 * to a hidden window.
 */
import { app } from 'electron';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SANDBOX_ENV } from '../../src/main/effects-target.js';
import { searchRoots, windowDisplay } from '../../app/main.js';

/**
 * @param {string} name  what the throwaway directory is called after, so a
 *                       folder left behind by a crashed run says which harness
 *                       made it
 * @param {{ show?: boolean }} options  whether the window may be on screen at
 *                       all; false unless a harness has a reason it can state
 * @returns {{ runDir: string, effectsFolder: string }}
 */
export function harnessSandbox(name, { show = false } = {}) {
  const runDir = mkdtempSync(join(tmpdir(), `signalforge-${name}-`));
  const effectsFolder = join(runDir, 'Effects');
  mkdirSync(effectsFolder, { recursive: true });

  app.setPath('userData', runDir);
  process.env[SANDBOX_ENV] = runDir;
  searchRoots.documents = () => runDir;
  searchRoots.home = () => runDir;
  windowDisplay.show = show;

  return { runDir, effectsFolder };
}
