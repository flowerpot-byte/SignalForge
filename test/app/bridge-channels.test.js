// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max Leopold Blumenschein
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const appDir = join(here, '..', '..', 'app');

/**
 * Extracts every string literal passed as the first argument to a given
 * call, e.g. extractChannels(text, "ipcMain.handle") pulls every channel
 * name registered on the main-process side.
 *
 * Fails loudly (throws) rather than returning an empty set if nothing
 * matches — an empty-set-equals-empty-set pass would hide a broken regex
 * just as easily as it would hide a real bridge mismatch, and either way
 * this test would stop doing its job silently.
 */
function extractChannels(source, callPrefix) {
  const pattern = new RegExp(`${callPrefix}\\(\\s*['"]([^'"]+)['"]`, 'g');
  const found = new Set();
  let match;
  while ((match = pattern.exec(source)) !== null) {
    found.add(match[1]);
  }
  if (found.size === 0) {
    throw new Error(`no channels found for ${callPrefix} — the extraction regex is broken`);
  }
  return found;
}

test('every ipcMain.handle channel in app/main.js has a matching ipcRenderer.invoke in app/preload.cjs', () => {
  const mainSource = readFileSync(join(appDir, 'main.js'), 'utf8');
  const preloadSource = readFileSync(join(appDir, 'preload.cjs'), 'utf8');

  const handled = extractChannels(mainSource, String.raw`ipcMain\.handle`);
  const invoked = extractChannels(preloadSource, String.raw`ipcRenderer\.invoke`);

  assert.deepEqual(
    [...invoked].sort(),
    [...handled].sort(),
    'the channel names hand-typed in app/main.js and app/preload.cjs must match exactly'
  );
});
