// SignalForge — build SignalRGB effects from images, gradients, shapes and particles.
// Copyright (C) 2026 Max Leopold Blumenschein
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DEFAULT_SOLID_COLOR } from '../../src/engine/document.js';

/**
 * The one coincidence in this project that is load bearing, turned from a note
 * into a guard.
 *
 * `--accent` in app/renderer/styles/tokens.css and DEFAULT_SOLID_COLOR in
 * src/engine/document.js are the same colour, and both files carry a comment
 * saying so at length: the "Farbflaeche" tile in the starting gallery draws its
 * preview swatch from the accent, and pressing that tile makes a layer of
 * DEFAULT_SOLID_COLOR. The tile is therefore an honest picture of what it
 * produces only for as long as the two agree.
 *
 * They cannot be made into one value. One is the window's palette and one is a
 * field in the user's saved document; the engine imports nothing from the app
 * and must not start now, and a stylesheet cannot import from the engine. So
 * the two stay apart and this test stands between them — which is what the two
 * comments asked for and nothing enforced.
 *
 * Read out of the stylesheet as text, on purpose: that is the file the value
 * actually lives in, so a retuned accent is caught wherever it is retuned.
 */
const tokens = () => readFileSync(
  fileURLToPath(new URL('../../app/renderer/styles/tokens.css', import.meta.url)), 'utf8'
);

/** The value of a custom property in the `:root` block, as written. */
function tokenValue(name) {
  const match = new RegExp(`\\n\\s*${name}\\s*:\\s*([^;]+);`).exec(tokens());
  return match ? match[1].trim() : null;
}

test('the accent and the colour a solid layer starts out as are the same colour', () => {
  const accent = tokenValue('--accent');
  // If this ever comes back null the test has stopped guarding anything, so it
  // says so rather than comparing null to null.
  assert.ok(accent, '--accent could not be found in tokens.css — has it been renamed?');
  assert.equal(
    accent.toLowerCase(),
    DEFAULT_SOLID_COLOR.toLowerCase(),
    'the "Farbflaeche" tile draws its preview swatch from --accent and produces a layer of '
      + 'DEFAULT_SOLID_COLOR: while the two differ, the tile shows one colour and makes another'
  );
});
