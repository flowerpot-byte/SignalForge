// SignalForge — build SignalRGB effects from images, gradients, shapes and particles.
// Copyright (C) 2026 Max Leopold Blumenschein
// SPDX-License-Identifier: GPL-3.0-or-later
import { isAbsolute, relative, resolve } from 'node:path';
import { findEffectsFolders } from './effects-folder.js';

/**
 * The two test-only environment variables that drive the sandbox gate below.
 *
 * SANDBOX_REQUIRED_ENV is set by `npm test` itself (package.json points
 * `node --test` at test/support/effects-sandbox.js via --import), so it is set
 * in every test file's own process and inherited by every process a test
 * spawns. A test author cannot forget it: they never type it.
 *
 * SANDBOX_ENV is the one a harness does have to name, and forgetting it is the
 * whole point — with the flag above set and this one empty, the app refuses to
 * resolve any effects folder at all instead of quietly finding the real one.
 */
export const SANDBOX_ENV = 'SF_EFFECTS_SANDBOX';
export const SANDBOX_REQUIRED_ENV = 'SF_EFFECTS_SANDBOX_REQUIRED';

/**
 * The three refusals, exported so tests can assert on them without copying the
 * wording and so app/main.js can print the first one before it opens a window.
 */
export const SANDBOX_MISSING_MESSAGE =
  `Refusing to look for a SignalRGB effects folder: ${SANDBOX_REQUIRED_ENV} is set, so this `
  + `process belongs to the test suite, but ${SANDBOX_ENV} names no sandbox folder. A test that `
  + 'redirects only Electron\'s userData still searches the real Documents and home folders, and '
  + 'that is how a test run once wrote into the machine owner\'s own SignalRGB folder. Point '
  + `${SANDBOX_ENV} at a throwaway folder before letting app/main.js resolve anything.`;

export function sandboxEscapeMessage(folder, source, sandboxRoot) {
  return `Refusing the effects folder "${folder}" (${source}): it lies outside the test sandbox `
    + `"${sandboxRoot}". Under ${SANDBOX_REQUIRED_ENV} nothing may resolve to a folder on the real `
    + 'machine, however it was arrived at.';
}

export function realFolderMessage(folder) {
  return `Refusing the effects folder "${folder}": its path names WhirlwindFX, so it is a real `
    + 'SignalRGB installation, and a test sandbox never is. This is the belt on top of the '
    + 'containment check above, not a replacement for it.';
}

/** Is `folder` the sandbox itself or something under it? */
function isInside(folder, sandboxRoot) {
  const rel = relative(resolve(sandboxRoot), resolve(folder));
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

/**
 * The circuit breaker. With no sandbox in force this hands the target straight
 * back, so ordinary use is byte for byte what it always was.
 */
function confine(target, sandboxRoot) {
  if (!sandboxRoot) return target;
  if (!isInside(target.folder, sandboxRoot)) {
    throw new Error(sandboxEscapeMessage(target.folder, target.source, sandboxRoot));
  }
  if (/WhirlwindFX/i.test(target.folder)) {
    throw new Error(realFolderMessage(target.folder));
  }
  return target;
}

/**
 * Where finished effects go.
 *
 * A folder the user picked wins, but only while it still exists — a moved or
 * deleted folder must not silently swallow exports. Otherwise the detected
 * one. Never a guess: `source: 'none'` means the app has to ask.
 *
 * sandboxRoot/sandboxRequired are the test-only gate. They are parameters
 * rather than environment reads so this stays the same plain, injectable
 * function it was; app/main.js reads the environment and passes them in, and
 * it is the only caller that resolves a real folder.
 */
export function resolveEffectsTarget({
  settings, documentsPath, homePath, exists, sandboxRoot = null, sandboxRequired = false
}) {
  if (sandboxRequired && !sandboxRoot) throw new Error(SANDBOX_MISSING_MESSAGE);

  const configured = settings.get('effectsFolder');
  if (configured && exists(configured)) {
    return confine({ folder: configured, source: 'configured' }, sandboxRoot);
  }
  const found = findEffectsFolders({ documentsPath, homePath, exists });
  if (found.length > 0) return confine({ folder: found[0], source: 'detected' }, sandboxRoot);
  return { folder: null, source: 'none' };
}
