// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));

/**
 * Every colour in the project must live in tokens.css — "Keine anderen Farben
 * irgendwo im Projekt; wer eine neue braucht, traegt sie hier ein."
 *
 * Scanned by walking the tree, deliberately, and not from a list of file names
 * typed out here. The list this test used to carry had gone stale without
 * anybody noticing: components/cost.js was never in it, and neither was
 * app/main.js, which was carrying a second copy of --bg-base the whole time. A
 * guard that quietly stops guarding is worse than no guard at all, because it
 * reports green — so a new file is covered the moment it exists, without
 * anybody having to remember this file.
 *
 * `app/renderer` is taken whole (stylesheets, components, index.html, the
 * language files); above it, `app/*.js` and `app/*.cjs` — the main process and
 * the preload. The main process paints too: it hands BrowserWindow a
 * background colour so the first frame is not a white flash.
 */
const SCANNED_TREE = 'app/renderer';
const TOKENS = 'app/renderer/styles/tokens.css';

/** Everything below `relative`, at any depth, whatever the extension. */
function collect(relative) {
  const absolute = join(root, relative);
  if (statSync(absolute).isFile()) return [relative];
  const out = [];
  for (const entry of readdirSync(absolute, { withFileTypes: true })) {
    const next = `${relative}/${entry.name}`;
    if (entry.isDirectory()) out.push(...collect(next));
    else out.push(next);
  }
  return out;
}

/** The main process and the preload: app/*.js and app/*.cjs, not the subtree. */
function appEntryFiles() {
  return readdirSync(join(root, 'app'), { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.(js|cjs)$/.test(entry.name))
    .map((entry) => `app/${entry.name}`);
}

// Hex colours (#abc, #aabbcc, with or without an alpha channel) or any of the
// functional colour notations. Case-insensitive: without the flag, a literal
// written RGB(...) or #AABBCC in capitals walked straight past this test.
const COLOR_LITERAL = /#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(/i;

test('no colour literal lives anywhere in the app outside tokens.css', () => {
  const found = [...collect(SCANNED_TREE), ...appEntryFiles()];

  // A vacuous pass (nothing scanned, or a walk that quietly collapsed to one
  // file) would be worthless.
  assert.ok(
    found.length >= 12,
    `expected to scan the whole app, only found ${found.length} files: ${found.join(', ')}`
  );
  // And tokens.css must genuinely be among what was walked — if it were ever
  // moved or renamed, the exclusion below would silently become a no-op and
  // this test would go on passing while guarding one file less.
  assert.ok(found.includes(TOKENS), `${TOKENS} was not found by the walk — has it moved?`);

  const files = found.filter((file) => file !== TOKENS);
  const offences = [];
  for (const file of files) {
    let source;
    try {
      source = readFileSync(join(root, file), 'utf8');
    } catch (err) {
      // A missing/unreadable file must fail the test, not be skipped.
      throw new Error(`could not read ${file} — cannot verify it is free of colour literals: ${err.message}`);
    }
    const match = source.match(COLOR_LITERAL);
    if (match) offences.push(`${file}: ${match[0]}`);
  }

  assert.deepEqual(
    offences,
    [],
    `colours must live only in tokens.css:\n${offences.join('\n')}`
  );
});
