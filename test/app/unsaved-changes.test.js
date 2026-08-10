// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { constants, setPriority } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const require_ = createRequire(import.meta.url);
const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

const dictionary = (name) => JSON.parse(
  readFileSync(join(root, 'app', 'renderer', 'i18n', `${name}.json`), 'utf8')
);

/**
 * The one check in this file that cannot be made to a window nobody is
 * showing, and what it costs to make it.
 *
 * Chromium's drag-and-drop pipeline will not serve a hidden window, so proving
 * that a picture can be DRAGGED in means putting a window on screen in front of
 * whoever is using the machine. Every other route into the same importFile —
 * the gallery's file input, which is what the picture tile leads to — needs no
 * such thing, and that is what an ordinary run uses.
 *
 * So the drag is opt-in, in the shape this project already uses for
 * SF_EFFECTS_SANDBOX_REQUIRED and SF_SINGLE_INSTANCE_TEST: an environment
 * variable armed for a whole run by an --import script in package.json. It is
 * skipped by node:test's own `{ skip }` rather than by an `if` that returns
 * quietly, so a run that does not make this check SAYS it did not make it.
 */
const DROP_IMPORT_ENV = 'SF_UNSAVED_DROP_IMPORT';
const dropImportSkip = process.env[DROP_IMPORT_ENV] === '1'
  ? false
  : `needs a visible window (Chromium will not drag onto a hidden one); run \`npm run test:import\``;

/**
 * Run test/harness/unsaved.js — the real app/main.js, the real window, real
 * mouse and keyboard events — and hand back the one line of JSON it prints.
 *
 * The environment is passed on whole: SF_EFFECTS_SANDBOX_REQUIRED,
 * SF_SINGLE_INSTANCE_TEST and — for `npm run test:import` only —
 * SF_UNSAVED_DROP_IMPORT are armed for the whole suite by the --import scripts
 * in package.json, and the child has to inherit them. SF_UNSAVED_REAL — the
 * one switch that would open a genuine OS dialog — is deliberately not set
 * here and is never set by the suite.
 */
async function runHarness() {
  const child = spawn(require_('electron'), [join(root, 'test', 'harness', 'unsaved.js')], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env }
  });

  // `npm test` runs its files side by side, and this one holds a real window
  // rendering a real preview for the better part of half a minute. The render
  // harness (test/harness/render.js) yields the same way and for the same
  // reason: the pixel tests running beside this one measure a moving picture
  // against the clock, and nothing here is in a hurry.
  try {
    setPriority(child.pid, constants.priority.PRIORITY_BELOW_NORMAL);
  } catch {
    // Best effort only; correctness never depends on it.
  }

  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (c) => { stdout += c; });
  child.stderr.on('data', (c) => { stderr += c; });

  const code = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`the unsaved-changes harness did not finish\n${stderr}`));
    }, 90_000);
    child.on('error', reject);
    child.on('close', (c) => { clearTimeout(timer); resolve(c); });
  });

  assert.equal(code, 0, `the harness exited with ${code}\n${stderr}`);
  return JSON.parse(stdout.trim().split('\n').pop());
}

/**
 * The whole point of the flag: work that is not in a file yet must be known
 * about, or the question that guards it is worthless.
 *
 * Every writer is checked on its own, in its own subtest, driven by the
 * gesture that a person makes — a real mouse drag, real arrow keys, a real
 * drag-and-drop carrying a real file path. That is what makes this falsifiable
 * one writer at a time: take the markChanged() out of, say, the crop's
 * onChange in app/renderer/main.js and exactly one of these goes red, while a
 * flag that was never set at all would take all of them down together.
 */
test('unsaved work is known about, and asked about before it is thrown away', async (t) => {
  const report = await runHarness();

  await t.test('nothing is unsaved at a fresh start', () => {
    assert.equal(report.freshStart, false, 'an empty window has nothing to lose and must say so');
  });

  // One subtest per writer. The pair is deliberate: the gesture makes it
  // unsaved, and a save makes it clean again — a flag that is stuck on is as
  // useless as one that never turns on, because a user who is asked every time
  // stops reading the question.
  const writers = [
    ['importing a picture', 'afterImport'],
    ['dragging the crop with the mouse', 'afterCropDrag'],
    ['moving the crop with the arrow keys', 'afterArrowKeys'],
    ['moving a slider', 'afterSlider'],
    ['changing the fit mode', 'afterFitMode'],
    ['adding a motion', 'afterAddMotion'],
    ['removing a motion', 'afterRemoveMotion'],
    ['typing a new name', 'afterName']
  ];
  for (const [what, field] of writers) {
    await t.test(`${what} leaves unsaved changes behind`, () => {
      assert.equal(report[field], true, `${what} must mark the document unsaved`);
      assert.equal(
        report[`${field}Saved`],
        false,
        `and saving it must clear that again — otherwise the question would be asked for ever`
      );
    });
  }

  /**
   * The flag has to be VISIBLE, not merely correct.
   *
   * It was neither styled nor shown for as long as it has existed — the class
   * was set on <html> and no stylesheet mentioned it — so a user's only sign
   * that work was in no file yet was the question itself, and only if they
   * happened to press something that asks. There is still no window-close
   * guard (that is its own task), which makes this the one warning there is.
   *
   * Read off the real window, in both states, around a real save. Every
   * assertion here is one a wrong implementation fails: no rule at all leaves
   * both readings hidden, a rule keyed on the wrong class leaves both visible,
   * `display: none` instead of `visibility` moves the name field, and a marker
   * made of colour alone has no glyph to report.
   */
  await t.test('the window shows that work is unsaved, and shows it without moving', () => {
    const on = report.markerWhileUnsaved;
    const off = report.markerWhileSaved;
    assert.ok(on && off, 'the marker beside the name field must exist in both states');

    assert.equal(on.visibility, 'visible', 'unsaved work must be marked in the window');
    // Hidden, and still in the layout. The two belong in one assertion because
    // `display: none` satisfies "not marked" while quietly resizing the row —
    // it is the obvious way to write this rule and the wrong one.
    assert.deepEqual(
      { visibility: off.visibility, display: off.display },
      { visibility: 'hidden', display: on.display },
      'a saved document must not be marked, and the marker must hold its place while invisible'
    );

    // Not a hue and nothing else: somebody who cannot separate the accent from
    // the page still has to see something appear.
    assert.ok(on.glyph.length > 0, 'the marker must be a character, not only a colour');
    assert.equal(
      on.label,
      dictionary('en')['project.unsaved.marker'],
      'and it must carry its meaning in words, from the language files'
    );

    // The half a class check cannot make: appearing must cost the row nothing.
    assert.deepEqual(
      { left: off.fieldLeft, width: off.fieldWidth, dot: off.width },
      { left: on.fieldLeft, width: on.fieldWidth, dot: on.width },
      'the name field must be in exactly the same place and be exactly as wide either way — ' +
        'a marker that reflows the transport bar is a second change nobody asked for'
    );
  });

  // The drag itself, as a check of its own. The subtest above says "importing
  // a picture marks the document unsaved" whichever door the picture came
  // through; this one says the door was Chromium's own drag pipeline, carrying
  // a real file path — the only kind webUtils.getPathForFile in the preload can
  // resolve, and therefore the only proof that a dropped file works at all.
  await t.test('a picture DROPPED on the preview is imported', { skip: dropImportSkip }, () => {
    assert.equal(
      report.dropImportRequested,
      true,
      'the harness must have been told to drag rather than to pick'
    );
    assert.equal(report.pictureWasDropped, true, 'and the drop must have been what got the picture in');
    assert.equal(report.afterImport, true, 'a dropped picture is work that is in no file yet');
  });

  await t.test('the arrow keys reached the canvas at all', () => {
    // Without this the arrow-key subtest above could pass on a stray keypress
    // that landed somewhere else entirely.
    assert.equal(report.canvasFocused, true, 'the canvas must be the focused element for that test');
  });

  await t.test('opening with nothing unsaved asks nothing at all', () => {
    assert.equal(
      report.cleanOpenAskedNothing,
      true,
      'with nothing to lose there must be no question — a prompt that appears when there is no ' +
        'risk is how a user learns to click it away without reading'
    );
    assert.equal(report.afterOpen, false, 'and what came straight out of a file is not unsaved work');
  });

  // The other half of the same rule, and the only one that can fail on its
  // own: these two opens each happened with unsaved work on screen, so the
  // flag was true going in and has to be false coming out. Without them, "an
  // open leaves it clean" would be satisfied by a flag that was already clean
  // before the open and was never touched by it.
  await t.test('an open clears unsaved changes, having started from work that had them', () => {
    assert.equal(report.unsavedAfterDiscard, false, 'after discarding and opening');
    assert.equal(report.unsavedAfterSaveFirst, false, 'and after saving and opening');
  });

  // The question. Cancel is the answer that must leave the world exactly as it
  // was, and it is the one that happens by accident (Escape, closing the
  // dialog, a reflex press of Enter).
  await t.test('opening with unsaved changes asks first', () => {
    assert.equal(report.unsavedBeforeCancel, true, 'the fixture must genuinely have unsaved work');
    assert.equal(report.cancelAsked, true, 'pressing "open project" with unsaved work must ask');
  });

  await t.test('cancelling leaves the document exactly as it was', () => {
    assert.deepEqual(
      report.controlsAfterCancel,
      report.controlsBeforeCancel,
      'every control — the fit, the motions, the sliders and the name — must be untouched'
    );
    assert.equal(
      report.cancelLeftThePicture,
      true,
      'and the rendered picture must be identical to the pixel: the crop offset lives in no ' +
        `control, so only the canvas can prove it was left alone (${JSON.stringify(report.pixelsAroundCancel)})`
    );
    assert.equal(report.cancelSaidNothing, true, 'a cancelled open must not even change the message line');
    assert.equal(
      report.stillUnsavedAfterCancel,
      true,
      'and the work must still be known to be unsaved, so the next attempt asks again'
    );
  });

  await t.test('the safe answer is the one that happens by accident', () => {
    const { buttons, defaultId, cancelId } = report.questionInEnglish;
    assert.equal(buttons.length, 3, 'three ways out: save first, discard, cancel');
    assert.equal(cancelId, 2, 'Escape and closing the dialog must both mean cancel');
    assert.equal(defaultId, cancelId, 'and so must a reflex press of Enter');
  });

  // The labels are UI strings like any other and live in the language files,
  // even though the dialog itself belongs to the main process. Asked twice, in
  // two languages, because one language alone cannot tell a translated label
  // from a hard-coded one that happens to look right.
  await t.test('the question speaks the language the window is being used in', () => {
    for (const [language, asked] of [['en', report.questionInEnglish], ['de', report.questionInGerman]]) {
      const words = dictionary(language);
      assert.equal(asked.title, words['project.unsaved.title'], `${language}: the title`);
      assert.equal(asked.detail, words['project.unsaved.body'], `${language}: the body`);
      assert.deepEqual(
        asked.buttons,
        [words['project.unsaved.save'], words['project.unsaved.discard'], words['project.unsaved.cancel']],
        `${language}: the three answers, in the order they are offered`
      );
    }
    assert.notDeepEqual(
      report.questionInGerman.buttons,
      report.questionInEnglish.buttons,
      'a question that says the same thing in both languages is not translated at all'
    );
  });

  await t.test('answering "save first" saves the work and then opens', () => {
    assert.equal(report.saveFirstWroteAFile, true, 'exactly one project file must have been written');
    assert.deepEqual(
      report.saveFirstWrote,
      { name: 'Work In Progress', brightness: 12 },
      'and it must hold the work that was about to be lost, not the project that replaced it'
    );
    assert.deepEqual(
      report.controlsAfterSaveFirst,
      report.controlsAfterOpen,
      'and the other project must then actually be on screen'
    );
  });

  await t.test('a save that is cancelled does not open anything either', () => {
    assert.deepEqual(
      report.controlsAfterCanceledSave,
      report.controlsBeforeCancel,
      'answering "save first" and then cancelling the save dialog must leave the work on screen — ' +
        `the work is still not in a file, so nothing may be discarded (the window said: ` +
        `${report.messageAfterCanceledSave})`
    );
    assert.equal(report.stillUnsavedAfterCanceledSave, true);
  });

  await t.test('answering "discard" opens without writing anything', () => {
    assert.equal(report.discardWroteNothing, true, 'discarding must not save anything behind the user\'s back');
    assert.deepEqual(
      report.controlsAfterDiscard,
      report.controlsAfterOpen,
      'the other project must be on screen'
    );
  });

  // The starting tiles. Three of them replace the whole document on a single
  // click with no file dialog in front of them and nothing to undo them, and
  // they sit directly under the stage the work is on — so they are the one
  // place in this window where a slip of the mouse could cost everything. The
  // fourth (the picture) reaches the same code by a different door.
  await t.test('a tile with nothing unsaved asks nothing at all', () => {
    assert.equal(
      report.cleanTileAskedNothing,
      true,
      'a document that came straight out of a file has nothing to lose, so there is nothing to ask'
    );
    assert.equal(report.unsavedAfterTile, true, 'and an effect just begun is work that is in no file yet');
  });

  await t.test('starting an effect from a tile with unsaved work asks first', () => {
    assert.equal(report.unsavedBeforeTileCancel, true, 'the fixture must genuinely have unsaved work');
    assert.equal(report.tileCancelAsked, true, 'pressing a starting tile with unsaved work must ask');
  });

  await t.test('cancelling a tile leaves the document exactly as it was', () => {
    assert.deepEqual(
      report.snapshotAfterTileCancel,
      report.snapshotBeforeTileCancel,
      'the name, every control the column built, the headings AND the pixels must be untouched'
    );
    assert.equal(report.tileCancelSaidNothing, true, 'a cancelled tile must not even change the message line');
    assert.equal(
      report.stillUnsavedAfterTileCancel,
      true,
      'and the work must still be known to be unsaved, so the next press asks again'
    );
  });

  await t.test('a tile whose "save first" is cancelled starts nothing either', () => {
    assert.deepEqual(
      report.snapshotAfterTileCanceledSave,
      report.snapshotBeforeTileCancel,
      'the work is still in no file, so nothing may be discarded'
    );
    assert.equal(report.stillUnsavedAfterTileCanceledSave, true);
  });

  await t.test('answering "discard" lets the tile start its effect', () => {
    assert.equal(report.tileDiscardWroteNothing, true, 'discarding must not save anything behind the user\'s back');
    assert.notDeepEqual(
      report.snapshotAfterTileDiscard,
      report.snapshotBeforeTileCancel,
      'the new effect must actually be on the stage — a guard that never lets go is a wall'
    );
  });

  await t.test('the picture tile asks the same question, and cancelling changes nothing', () => {
    assert.equal(report.unsavedBeforePictureTile, true, 'the fixture must genuinely have unsaved work');
    assert.deepEqual(
      report.snapshotAfterPictureCancel,
      report.snapshotBeforePictureCancel,
      'a cancelled import must leave the document exactly as it was'
    );
    assert.equal(report.stillUnsavedAfterPictureCancel, true);
    assert.equal(report.pictureTileImported, true, 'and discarding must let the picture in');
  });
});
