// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const appDir = join(here, '..', '..', 'app', 'renderer');

// Every colour in the project must live in tokens.css — "Keine anderen
// Farben irgendwo im Projekt; wer eine neue braucht, trägt sie hier ein."
// These are the files most likely to grow a stray literal because they are
// the ones that actually paint pixels.
const FILES = [
  join(appDir, 'styles', 'app.css'),
  join(appDir, 'components', 'shell.js'),
  join(appDir, 'components', 'preview.js'),
  join(appDir, 'components', 'drop.js'),
  join(appDir, 'main.js')
];

// Hex colours (#abc, #aabbcc, with or without an alpha channel) or any of
// the functional colour notations.
const COLOR_LITERAL = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/;

test('app.css, shell.js, preview.js, drop.js and main.js contain no colour literals outside tokens.css', () => {
  // A vacuous pass (nothing scanned) would be worthless, so fail loudly if
  // the file list is ever empty.
  assert.ok(FILES.length > 0, 'the scanned file list is empty — this test would pass vacuously');

  for (const file of FILES) {
    let source;
    try {
      source = readFileSync(file, 'utf8');
    } catch (err) {
      // A missing/unreadable file must fail the test, not be skipped.
      throw new Error(`could not read ${file} — cannot verify it is free of colour literals: ${err.message}`);
    }
    const match = source.match(COLOR_LITERAL);
    assert.equal(
      match,
      null,
      `${file} contains a colour literal (${match ? match[0] : ''}) — colours must live only in tokens.css`
    );
  }
});
