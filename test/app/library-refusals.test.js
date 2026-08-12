// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max Leopold Blumenschein
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { runElectron } from '../harness/spawn-electron.js';

const require_ = createRequire(import.meta.url);
const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

const dictionary = (name) => JSON.parse(
  readFileSync(join(root, 'app', 'renderer', 'i18n', `${name}.json`), 'utf8')
);

/**
 * What the shelf does with files it must not open — in the real window, against
 * a throwaway effects folder holding one of each kind of thing that can be in a
 * real one.
 *
 * Every refusal below is proved sharply somewhere in test/main/: the decoy
 * blocks in effect-document.test.js, the size bound in effects-library.test.js,
 * the cover timeout in cover-image.test.js. This is the other question, and the
 * only one a module cannot answer: are the pieces WIRED to each other? A reader
 * that refuses correctly is worth nothing if the listing does not ask it, and a
 * count that is kept is worth nothing if no part of the window reads it. That is
 * exactly the bug this whole round of fixes started from.
 *
 * See test/harness/library-refusals.js for what is put in the folder.
 */
async function runRefusalsHarness() {
  const { code, stdout, stderr } = await runElectron(
    require_('electron'),
    [join(root, 'test', 'harness', 'library-refusals.js')],
    { timeoutMs: 90_000, label: 'the library-refusals harness', yieldPriority: true }
  );
  assert.equal(code, 0, `the harness exited with ${code}\n${stderr}`);
  return JSON.parse(stdout.trim().split('\n').pop());
}

test('a folder full of files that must not be opened is handled in one piece', async (t) => {
  const report = await runRefusalsHarness();

  await t.test('only the effects this app can actually open become tiles', () => {
    assert.equal(
      report.tiles.length,
      report.offeredOnDisk,
      `expected ${report.offeredOnDisk} tiles, got [${report.tiles.join(', ')}]`
    );
    // The two decoys are the point: a file carrying a second document block in
    // a comment or a <textarea> would have SignalForge showing one effect while
    // SignalRGB ran another. Neither is offered at all.
    assert.ok(!report.tiles.includes('Koeder Kommentar.html'), 'the comment decoy must not be a tile');
    assert.ok(!report.tiles.includes('Koeder Textarea.html'), 'the textarea decoy must not be a tile');
    // Nor the one that is simply too large to read on the main thread.
    assert.ok(!report.tiles.includes('Riesig.html'), 'a file past the size bound must not be a tile');
    assert.ok(!report.tiles.includes('Fremd.html'), 'and somebody else\'s effect is still somebody else\'s');
  });

  await t.test('and the files it left out are said out loud, once, quietly', () => {
    // The MaxAmbient.html complaint, answered: a file the owner knows is in
    // that folder no longer just disappears.
    assert.equal(report.note.exists, true, 'the note has to be in the window at all');
    assert.equal(report.note.hidden, false, 'and showing, with four files left out');
    assert.equal(
      report.note.text,
      dictionary('de')['library.skippedMany'].replace('{count}', String(report.refusedOnDisk)),
      'it must name how many, in the language the window is in'
    );
    assert.equal(report.note.role, null, 'a fact about somebody else\'s files is not an alert');
    assert.equal(
      report.note.describes,
      'gallery-skipped',
      'and the shelf points at it, so it is not a line floating beside nothing'
    );
  });

  await t.test('a tile whose picture never came shows the resting frame, not a broken image', () => {
    // The first ask is answered the way the main process answers after a render
    // has timed out or failed. The tile must fall back to the state it already
    // has — a broken-image box says the app is broken; the resting frame says
    // "no picture yet".
    const [refused] = report.covers;
    assert.equal(refused.photoHidden, true, 'the <img> must stay hidden');
    assert.equal(refused.hasRestingFrame, true, 'and the frame it rests in must be there');
  });

  await t.test('and the tile behind it still gets its picture', () => {
    // The queue's guarantee, seen from the window: a failed cover costs its own
    // tile and nothing else. Falsifiable against the bug it guards — a loop
    // that gave up on the first refusal leaves this one hidden too.
    assert.equal(report.coverAsks.length, report.offeredOnDisk, 'every tile must be asked about');
    const [, behind] = report.covers;
    assert.equal(behind.photoHidden, false, 'the one after the refused tile draws normally');
  });

  await t.test('his own effect still opens through all of it', (subtest) => {
    if (!report.realVerlaufAvailable) {
      subtest.skip('this machine has no Documents/WhirlwindFX/Effects/Verlauf.html');
      return;
    }
    assert.equal(report.beforeOpening, 'Untitled', 'nothing of his was on the stage before');
    assert.equal(report.opened.name, report.fileSays.name, 'the name must be the file\'s own');
    assert.equal(
      report.opened.shape,
      report.fileSays.shape,
      'and the settings column must be built around what the file actually holds'
    );
    assert.equal(report.opened.marked, 'Verlauf.html', 'the strip says which effect is on the stage');
    assert.match(report.opened.message, /Effekt geöffnet/, 'and it says so out loud');
  });

  await t.test('the original file on his machine was only ever read', (subtest) => {
    if (!report.realVerlaufAvailable) {
      subtest.skip('nothing was copied, so there is nothing to compare');
      return;
    }
    assert.deepEqual(
      report.realAfter,
      report.realBefore,
      'the size and modification time of his own file must be exactly what they were'
    );
  });
});
