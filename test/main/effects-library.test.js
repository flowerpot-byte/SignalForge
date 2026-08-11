// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import {
  listEffects, findEffect, effectPath, coverPath, MAX_EFFECT_BYTES
} from '../../src/main/effects-library.js';
import { buildEffectHtml, DOCUMENT_SCRIPT_ID } from '../../src/export/build-effect.js';

/**
 * The effects folder, read back as a library.
 *
 * Everything here runs against a filesystem living in a Map, which is what lets
 * the cases that matter be checked at all: a folder that is not there, a file
 * that belongs to another program, an effect whose tile picture is missing, and
 * a name that tries to leave the folder. None of them wants rehearsing on a real
 * SignalRGB folder.
 */

const FOLDER = join('C:', 'Effects');

/** A real effect, built by the real builder. */
const effect = (name) => buildEffectHtml({
  doc: { name, layers: [{ id: 'fill', type: 'solid', motions: [] }] },
  engineSource: 'window.SignalForgeEngine = {};'
});

function fakeIo(files) {
  const reads = [];
  return {
    reads,
    list: (folder) => [...files.keys()]
      .filter((path) => path.startsWith(`${folder}\\`) || path.startsWith(`${folder}/`))
      .map((path) => path.slice(folder.length + 1)),
    read: (path) => {
      reads.push(path);
      const value = files.get(path);
      if (value === undefined) throw new Error(`no such file: ${path}`);
      return value.text;
    },
    stat: (path) => {
      const value = files.get(path);
      if (value === undefined) throw new Error(`no such file: ${path}`);
      // `size` is stated separately where a test needs a file far larger than
      // anything worth building in memory — a two-gigabyte file is the case
      // the size bound exists for, and allocating one to prove it would be
      // absurd. Everywhere else it is simply what the text weighs.
      return { size: value.size ?? value.text.length, modified: value.modified };
    },
    exists: (path) => files.has(path) || path === FOLDER
  };
}

/** A folder with three of ours, one of somebody else's, and one tile picture. */
function folder() {
  return new Map([
    [join(FOLDER, 'Verlauf.html'), { text: effect('Verlauf'), modified: 300 }],
    [join(FOLDER, 'Bergabend.html'), { text: effect('Bergabend'), modified: 100 }],
    [join(FOLDER, 'Bergabend.png'), { text: 'PNG', modified: 100 }],
    [join(FOLDER, 'Alt.html'), { text: effect('Alt'), modified: 200 }],
    // Somebody else's: SignalRGB's own, or one from another tool. It is a
    // perfectly good effect; it is simply not one this app can open.
    [join(FOLDER, 'Rainbow.html'), { text: '<html><body>rainbow</body></html>', modified: 400 }],
    // And a file that is not an effect at all.
    [join(FOLDER, 'notes.txt'), { text: 'shopping list', modified: 500 }]
  ]);
}

test('the library is the effects folder, and holds only what this app can open', () => {
  const { entries, skipped } = listEffects({ folder: FOLDER, io: fakeIo(folder()) });
  assert.deepEqual(entries.map((entry) => entry.name), ['Verlauf', 'Alt', 'Bergabend']);
  assert.equal(skipped, 1, 'the foreign effect is counted, not listed — a tile that cannot be pressed is worse');
});

test('newest first, so the effect somebody just wrote is the first tile', () => {
  const files = folder();
  files.set(join(FOLDER, 'Bergabend.html'), { text: effect('Bergabend'), modified: 999 });
  const { entries } = listEffects({ folder: FOLDER, io: fakeIo(files) });
  assert.equal(entries[0].name, 'Bergabend');
});

test('an effect knows whether its tile picture is already on disk', () => {
  const { entries } = listEffects({ folder: FOLDER, io: fakeIo(folder()) });
  const byName = Object.fromEntries(entries.map((entry) => [entry.name, entry]));
  assert.equal(byName.Bergabend.cover, 'Bergabend.png', 'the export writes it beside the effect');
  assert.equal(byName.Verlauf.cover, null, 'and an effect exported before tile pictures existed has none');
});

test('a folder that is not there is an empty library, not a failure', () => {
  const empty = listEffects({ folder: join('C:', 'Nowhere'), io: fakeIo(new Map()) });
  assert.deepEqual(empty.entries, []);
  // And no folder chosen at all.
  assert.deepEqual(listEffects({ folder: null, io: fakeIo(new Map()) }).entries, []);
});

test('a file that disappears between the listing and the read is skipped, not thrown', () => {
  const files = folder();
  const io = fakeIo(files);
  const list = io.list;
  io.list = (f) => [...list(f), 'Ghost.html'];
  const { entries } = listEffects({ folder: FOLDER, io });
  assert.deepEqual(entries.map((entry) => entry.name), ['Verlauf', 'Alt', 'Bergabend']);
});

/**
 * The cache is what makes refreshing on every window focus affordable: telling
 * one of ours from somebody else's means reading the file, because the document
 * sits at the END of it (after the engine), and there is nothing cheaper to
 * look at.
 */
test('an unchanged folder is answered without reading a single file twice', () => {
  const io = fakeIo(folder());
  const cache = new Map();
  listEffects({ folder: FOLDER, io, cache });
  const afterFirst = io.reads.length;
  assert.ok(afterFirst >= 4, 'the first pass has to read every candidate');

  listEffects({ folder: FOLDER, io, cache });
  assert.equal(io.reads.length, afterFirst, 'the second pass reads nothing at all');
});

test('a file that CHANGES is read again, so an edited effect cannot be answered from memory', () => {
  const files = folder();
  const io = fakeIo(files);
  const cache = new Map();
  listEffects({ folder: FOLDER, io, cache });
  const afterFirst = io.reads.length;

  // The very case that matters: a file that stopped being one of ours.
  files.set(join(FOLDER, 'Verlauf.html'), { text: '<html>not ours any more</html>', modified: 700 });
  const { entries } = listEffects({ folder: FOLDER, io, cache });
  assert.ok(io.reads.length > afterFirst, 'a changed file must be looked at again');
  assert.deepEqual(entries.map((entry) => entry.name), ['Alt', 'Bergabend']);
});

// ------------------------------------------------------------- the size bound

/**
 * The one read in this app that walks a whole folder somebody else writes into,
 * held to never reading something enormous.
 *
 * Every read here is synchronous and on the main thread, so a single huge file
 * dropped into the effects folder would freeze the window for as long as it
 * takes to read it. The size is known before any byte is read (the cache key is
 * built from it), so the check costs nothing — and the proof that it works is
 * that io.read is never called on the file at all, not merely that it does not
 * appear in the listing.
 */
test('a file too large to be an effect is skipped WITHOUT being read', () => {
  const files = folder();
  const huge = join(FOLDER, 'Riesig.html');
  // A perfectly valid effect — the contents are not what disqualifies it — that
  // claims to be two gigabytes.
  files.set(huge, { text: effect('Riesig'), size: 2 * 1024 * 1024 * 1024, modified: 900 });

  const io = fakeIo(files);
  const { entries, skipped } = listEffects({ folder: FOLDER, io });

  assert.ok(entries.every((entry) => entry.name !== 'Riesig'), 'it must not become a tile');
  assert.equal(skipped, 2, 'and it is counted, so the strip can say a file was left out');
  assert.ok(
    !io.reads.includes(huge),
    'the whole point: it is stepped over on its size, before anything reads two gigabytes on the main thread'
  );
});

test('the bound is the only thing keeping it out, and it is a real number', () => {
  const files = folder();
  const io = fakeIo(files);
  files.set(join(FOLDER, 'Gross.html'), { text: effect('Gross'), size: MAX_EFFECT_BYTES + 1, modified: 900 });
  assert.ok(
    listEffects({ folder: FOLDER, io }).entries.every((entry) => entry.name !== 'Gross'),
    'one byte over is over'
  );

  files.set(join(FOLDER, 'Gross.html'), { text: effect('Gross'), size: MAX_EFFECT_BYTES, modified: 900 });
  assert.ok(
    listEffects({ folder: FOLDER, io: fakeIo(files) }).entries.some((entry) => entry.name === 'Gross'),
    'and exactly at the bound is still in — a limit nobody can reach is not a limit'
  );

  // Every effect Max has actually made is two orders of magnitude below it. If
  // this ever fails, the bound has been lowered into the range of real files.
  assert.ok(MAX_EFFECT_BYTES > 20 * 169 * 1024, 'the bound must stay far above the largest effect that ever existed');
});

test('a file too large to be listed cannot be reached by naming it either', () => {
  const files = folder();
  files.set(join(FOLDER, 'Riesig.html'), { text: effect('Riesig'), size: MAX_EFFECT_BYTES + 1, modified: 900 });
  const io = fakeIo(files);
  assert.equal(
    findEffect({ folder: FOLDER, file: 'Riesig.html', io }),
    null,
    'the cover and open handlers reach files through this door and no other'
  );
  assert.ok(!io.reads.includes(join(FOLDER, 'Riesig.html')));
});

// ---------------------------------------------------- names from outside

/**
 * The one place a name from outside this process could become a path, held to
 * never doing so: a name is looked UP in a fresh listing, and only the string
 * the filesystem itself handed back is ever joined onto the folder.
 */
test('a name that tries to leave the folder matches nothing', () => {
  const io = fakeIo(folder());
  for (const attempt of [
    '..\\..\\Windows\\System32\\config\\SAM',
    '../../secrets.html',
    'C:\\Windows\\win.ini',
    '\\\\attacker\\share\\evil.html',
    '.',
    '..',
    '',
    null,
    undefined
  ]) {
    assert.equal(findEffect({ folder: FOLDER, file: attempt, io }), null, `${attempt} must match nothing`);
  }
});

test('a name that is simply not in the folder matches nothing either', () => {
  const io = fakeIo(folder());
  assert.equal(findEffect({ folder: FOLDER, file: 'Nothing.html', io }), null);
  // Including one that IS in the folder but is not one of ours: it was never
  // listed, so it cannot be opened by naming it directly.
  assert.equal(findEffect({ folder: FOLDER, file: 'Rainbow.html', io }), null);
  assert.equal(findEffect({ folder: FOLDER, file: 'notes.txt', io }), null);
});

test('a name that IS in the listing comes back with its two paths', () => {
  const io = fakeIo(folder());
  const entry = findEffect({ folder: FOLDER, file: 'Bergabend.html', io });
  assert.ok(entry);
  assert.equal(effectPath(FOLDER, entry), join(FOLDER, 'Bergabend.html'));
  assert.equal(coverPath(FOLDER, entry), join(FOLDER, 'Bergabend.png'));
  assert.equal(coverPath(FOLDER, findEffect({ folder: FOLDER, file: 'Verlauf.html', io })), null);
});

test('a file called ".html" and nothing else is not an effect called ""', () => {
  const files = folder();
  files.set(join(FOLDER, '.html'), { text: effect('x'), modified: 600 });
  const { entries } = listEffects({ folder: FOLDER, io: fakeIo(files) });
  assert.ok(entries.every((entry) => entry.name !== ''), 'a nameless tile is not a tile');
});

test('the extension is matched however it is spelled', () => {
  const files = folder();
  files.set(join(FOLDER, 'Shouty.HTML'), { text: effect('Shouty'), modified: 650 });
  const { entries } = listEffects({ folder: FOLDER, io: fakeIo(files) });
  assert.ok(entries.some((entry) => entry.file === 'Shouty.HTML'), 'Windows does not care, so neither may this');
});

test('an effect whose document block is damaged is not listed', () => {
  const files = folder();
  // The marker is there, the block is not closed: a file cut short while being
  // written, which is exactly what a folder SignalRGB watches can contain.
  files.set(join(FOLDER, 'Halb.html'), {
    text: `<head></head><script id="${DOCUMENT_SCRIPT_ID}" type="application/json">{"version":1`,
    modified: 800
  });
  const { entries, skipped } = listEffects({ folder: FOLDER, io: fakeIo(files) });
  assert.ok(entries.every((entry) => entry.name !== 'Halb'));
  assert.equal(skipped, 2);
});
