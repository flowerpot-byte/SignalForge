// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * What the shelf does with files it must NOT open, in the real window.
 *
 * An Electron main entry of its own, the same shape as library.js and for the
 * same reasons: it imports app/main.js — the real one, unchanged — which
 * registers every IPC handler and opens the real window, and everything below
 * reaches into that window from out here.
 *
 *   npx electron test/harness/library-refusals.js
 *
 * `npm test` spawns exactly that (see test/app/library-refusals.test.js) and
 * judges the one line of JSON this prints.
 *
 * WHY THESE CASES NEED A REAL WINDOW. Each of them is proved against the
 * modules in test/main/, which is where the sharp edges are checked. What only
 * a window can show is that the pieces are actually WIRED to each other: that
 * the reader's refusal reaches the listing, that the listing's count reaches
 * the strip, that a tile with no picture stays the shelf's resting frame rather
 * than a broken image, and that a genuine effect still opens through all of it.
 * A module can be right while nothing calls it.
 *
 * THE FOLDER IT IS GIVEN holds, deliberately, one of each thing that can be in
 * a real effects folder:
 *
 *  - a genuine SignalForge effect (Max' own Verlauf.html, COPIED — the original
 *    is read once and never written to, and its size and modification time are
 *    checked afterwards to prove it);
 *  - the same effect with a decoy document block hidden in an HTML comment;
 *  - the same again with the decoy in a <textarea>;
 *  - a genuine effect padded past the size bound;
 *  - a file that is not one of ours at all.
 *
 * Four of the five must be left out, counted, and said out loud in one quiet
 * line. The fifth must open.
 *
 * THE WINDOW IS NEVER SHOWN (windowDisplay.show stays false via harnessSandbox),
 * which is why the frame pump is installed before anything is measured.
 */
import { BrowserWindow, ipcMain } from 'electron';
import { writeFileSync, readFileSync, copyFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { discardDialog, DISCARD_ANSWERS } from '../../app/main.js';
import { readEffectDocument } from '../../src/main/effect-document.js';
import { MAX_EFFECT_BYTES } from '../../src/main/effects-library.js';
import { DOCUMENT_SCRIPT_ID } from '../../src/export/build-effect.js';
import { driver, runHarness, wait } from './driver.js';
import { harnessSandbox } from './sandbox.js';

const { runDir, effectsFolder } = harnessSandbox('library-refusals');

writeFileSync(
  join(runDir, 'settings.json'),
  JSON.stringify({ effectsFolder, lastProjectFolder: runDir, language: 'de' }, null, 2),
  'utf8'
);

/**
 * The machine owner's own effect, copied in. Read-only in every sense: nothing
 * anywhere in this run writes to the source folder, and what it looked like
 * before is recorded so that can be checked rather than asserted.
 */
const REAL_EFFECT = join(homedir(), 'Documents', 'WhirlwindFX', 'Effects', 'Verlauf.html');
const realAvailable = existsSync(REAL_EFFECT);
const realBefore = realAvailable
  ? (() => { const info = statSync(REAL_EFFECT); return { size: info.size, modified: info.mtimeMs }; })()
  : null;

/**
 * A genuine effect to build the refusals out of.
 *
 * His own file when the machine has one, so the decoys are decoys ON a real
 * effect; a minimal hand-built one otherwise, because this harness has to pass
 * on a machine that has never run SignalRGB. Either way what makes the file
 * genuine is the same thing: exactly one document block, written as the
 * exporter writes it.
 */
const GENUINE = realAvailable
  ? readFileSync(REAL_EFFECT, 'utf8')
  : `<!doctype html><head></head><body><canvas></canvas>`
    + `<script id="${DOCUMENT_SCRIPT_ID}" type="application/json">`
    + JSON.stringify({ version: 1, name: 'Ersatz', layers: [{ id: 'fill', type: 'solid', motions: [] }] })
    + `</script></body>`;

/**
 * A second document block, carrying a document that is NOT what the file runs.
 *
 * This is the whole attack: SignalRGB finds the genuine block with
 * getElementById and runs it, while a reader that searches the text finds this
 * one first and shows it. The window would be honestly reporting the wrong
 * effect.
 */
const DECOY = `<script id="${DOCUMENT_SCRIPT_ID}" type="application/json">`
  + JSON.stringify({ version: 1, name: 'KOEDER', layers: [{ id: 'x', type: 'solid', motions: [] }] })
  + `</script>`;

if (realAvailable) copyFileSync(REAL_EFFECT, join(effectsFolder, 'Verlauf.html'));

// A second effect the shelf CAN open, so there is a tile behind the one whose
// picture is refused — which is how "a failed cover costs its own tile and
// nothing else" becomes visible in the window rather than only in the module.
writeFileSync(join(effectsFolder, 'Gut.html'), GENUINE, 'utf8');

// Decoy one: inside an HTML comment, in front of the genuine block, where a
// text search reaches it first and the DOM never sees it at all.
writeFileSync(join(effectsFolder, 'Koeder Kommentar.html'), `<!-- ${DECOY} -->\n${GENUINE}`, 'utf8');
// Decoy two: inside a <textarea>, where it is text to the browser and an
// element to nobody.
writeFileSync(join(effectsFolder, 'Koeder Textarea.html'), `<textarea>${DECOY}</textarea>\n${GENUINE}`, 'utf8');
// Too large to read on the main thread. Padded inside an HTML comment so it is
// a genuine effect in every other respect — the size is the only thing wrong
// with it, which is what makes this a test of the bound.
writeFileSync(
  join(effectsFolder, 'Riesig.html'),
  `${GENUINE}\n<!--${'x'.repeat(MAX_EFFECT_BYTES)}-->`,
  'utf8'
);
// And somebody else's effect: no SignalForge document at all. This is the
// MaxAmbient.html case, which is the reason the note exists.
writeFileSync(
  join(effectsFolder, 'Fremd.html'),
  '<html><body><canvas id="exCanvas"></canvas><script>rainbow()</script></body></html>',
  'utf8'
);

/** How many of the files above the shelf must refuse to offer. */
const REFUSED = 4;
/** And how many it must offer: the copy of his, plus the second genuine one. */
const OFFERED = realAvailable ? 2 : 1;

/**
 * The tile picture channel, answering as it does after a render has timed out.
 *
 * The main process's own timeout is proved in test/main/cover-image.test.js —
 * a wedged render gives up, its hidden window is destroyed, and the tile behind
 * it still draws. What that cannot show is what the WINDOW then does with the
 * refusal, and that is the half this harness is for: `{ ok: false }` is exactly
 * what the sf:library:cover handler returns once a render has failed or timed
 * out, so answering that way here puts the strip in the state a wedged tile
 * leaves it in, without having to wedge a real render for thirty seconds.
 *
 * The tile behind it answers normally, so "the queue continues" is visible in
 * the window as well as in the module.
 */
const coverAsks = [];
const REAL_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
ipcMain.removeHandler('sf:library:cover');
ipcMain.handle('sf:library:cover', (_event, file) => {
  coverAsks.push(file);
  if (coverAsks.length === 1) return { ok: false };
  return { ok: true, png: REAL_PNG, drawn: true };
});

discardDialog.ask = async () => ({ response: DISCARD_ANSWERS.indexOf('discard') });

const out = { realVerlaufAvailable: realAvailable, refusedOnDisk: REFUSED, offeredOnDisk: OFFERED };

runHarness('library refusals harness', async () => {
  const [win] = BrowserWindow.getAllWindows();
  const { js, until, clickAndWait, installPump } = driver(win);

  await new Promise((resolve) => win.webContents.once('did-finish-load', resolve));
  await installPump();

  await until(
    `document.querySelectorAll('.tile-effect').length === ${OFFERED}`,
    'the library to have read the folder'
  );

  // --------------------------------------------- what the shelf offers, and does not

  out.tiles = await js(
    `[...document.querySelectorAll('.tile-effect')].map((tile) => tile.dataset.effect)`
  );

  // Switch to the library shelf: the note lives with it, and the pictures are
  // only asked for once somebody looks.
  await js(`document.getElementById('gallery-tab-library').click(), true`);
  await wait(400);

  out.note = await js(`(() => {
    const note = document.getElementById('gallery-skipped');
    return {
      exists: Boolean(note),
      hidden: note ? note.hidden : null,
      text: note ? note.textContent : null,
      // A note, not an alarm: no alert role, no warning colour of its own.
      role: note ? note.getAttribute('role') : null,
      describes: document.getElementById('gallery-library').getAttribute('aria-describedby')
    };
  })()`);

  // ------------------------------------------------- the tile that got no picture

  out.covers = await js(`[...document.querySelectorAll('.tile-effect')].map((tile) => {
    const photo = tile.querySelector('.tile-photo');
    const blank = tile.querySelector('.tile-blank');
    return {
      // A tile whose picture never came must be showing the resting frame, and
      // must not be showing a broken image.
      photoHidden: photo ? photo.hidden : null,
      hasRestingFrame: Boolean(blank)
    };
  })`);
  out.coverAsks = [...coverAsks];

  // ------------------------------------------------------ and the genuine one opens

  if (realAvailable) {
    out.beforeOpening = await js(`document.getElementById('footer-name').value`);
    await js(`document.querySelector('[data-effect="Verlauf.html"]').click(), true`);
    // The open goes through the unsaved-work question, the bridge, the reader
    // and a full document swap.
    await until(`document.getElementById('footer-name').value === 'Verlauf'`, 'his effect to open');
    out.opened = await js(`({
      name: document.getElementById('footer-name').value,
      message: document.querySelector('.drop-message').textContent,
      // It is on the stage, and the strip says which tile that is.
      marked: document.querySelector('.tile-effect.is-current')?.dataset.effect ?? null,
      // The settings column rebuilt itself around what arrived, so the document
      // did not merely parse — it reached the window.
      shape: document.getElementById('sf-layers-0-shape')?.value ?? null
    })`);

    // And what the file itself says, so "it opened correctly" is a comparison.
    out.fileSays = (() => {
      const { doc } = readEffectDocument(readFileSync(join(effectsFolder, 'Verlauf.html'), 'utf8'));
      return { name: doc.name, shape: doc.layers[0].shape ?? null };
    })();
  }

  // ------------------------------- the folder was only ever read, and his file untouched

  out.realAfter = realAvailable
    ? (() => { const info = statSync(REAL_EFFECT); return { size: info.size, modified: info.mtimeMs }; })()
    : null;
  out.realBefore = realBefore;

  process.stdout.write(`${JSON.stringify(out)}\n`);
});
