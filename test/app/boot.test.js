// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const require_ = createRequire(import.meta.url);
const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

/**
 * The app's own dark, read from the one file colours live in — deliberately
 * not written out here, because a copy in this test would be exactly the
 * duplication the window's background was just freed from.
 */
const BG_BASE = /--bg-base:\s*([^;]+);/
  .exec(readFileSync(join(root, 'app', 'renderer', 'styles', 'tokens.css'), 'utf8'))[1].trim();

test('the app boots, opens a window and exposes its bridge', async () => {
  // An Electron entry of its own (test/harness/selftest.js), which imports the
  // real app/main.js and drives the window it opens from the outside — the
  // same shape as test/harness/walkthrough.js. Running that file IS the
  // signal; there is no environment variable to remember, and app/main.js
  // carries no test code to switch on.
  //
  // The environment is passed on whole, and that matters: SF_EFFECTS_SANDBOX_REQUIRED
  // and SF_SINGLE_INSTANCE_TEST are armed for the whole suite by the two
  // --import scripts in package.json, and the child has to inherit both.
  const child = spawn(require_('electron'), [join(root, 'test', 'harness', 'selftest.js')], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env }
  });

  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (c) => { stdout += c; });
  child.stderr.on('data', (c) => { stderr += c; });

  const code = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.kill(); reject(new Error(`app did not finish\n${stderr}`)); }, 60_000);
    child.on('error', reject);
    child.on('close', (c) => { clearTimeout(timer); resolve(c); });
  });

  assert.equal(code, 0, `app exited with ${code}\n${stderr}`);
  const report = JSON.parse(stdout.trim().split('\n').pop());
  assert.equal(report.windowOpened, true);
  assert.equal(report.bridge, true, 'window.sf must exist in the renderer');
  assert.equal(report.nodeInRenderer, false, 'the renderer must not reach Node');
  assert.equal(
    String(report.windowBackground).toLowerCase(),
    BG_BASE.toLowerCase(),
    'the window must open on the app\'s own background, read from tokens.css — a mismatch means ' +
      'that read failed and the first frame is a white flash'
  );
  assert.equal(
    report.navigationBlocked,
    true,
    'a top-level navigation to an external URL must be blocked (will-navigate guard)'
  );
  assert.equal(
    report.popupBlocked,
    true,
    'window.open must be denied and must not create a new window (setWindowOpenHandler guard)'
  );
  assert.equal(
    report.forgedFileImportRejected,
    true,
    'sf:importImage must reject a File with no real disk path (webUtils.getPathForFile === "") ' +
      'with the ordinary visible-error shape, never read an arbitrary renderer-forged path'
  );

  // The first start. The self-test's settings file genuinely does not exist
  // yet and its search for an existing SignalRGB installation is pointed at a
  // throwaway folder, so this is the real "nothing found, ask the user" path.
  assert.equal(
    report.firstRunShown,
    true,
    'with no effects folder found, the window must ask for one'
  );
  // And the question has to be visible, not merely un-hidden: an author
  // `display` in the stylesheet outranks the browser's own
  // `[hidden] { display: none }`, which is how this panel once stayed on
  // screen permanently with the property check above still passing.
  assert.equal(
    report.firstRunReallyVisible,
    true,
    'the question must actually be rendered, not only lack the hidden property'
  );
  assert.equal(
    report.firstRunLeavesTheAppUsable,
    true,
    'the question must be a panel, not a curtain: the rest of the window stays reachable'
  );
  assert.ok(
    /wählen|choose/i.test(report.firstRunAsks),
    `the question must offer the one button that answers it, got ${report.firstRunAsks}`
  );

  // The notice sits above the stage on screen (grid-row: 1), and the document
  // has to say the same thing — otherwise Tab reaches the canvas before the
  // button sitting above it and the reading order disagrees with the visual
  // one. It is put there by prepend() rather than by the stylesheet; these two
  // read it back off the real window so that cannot come apart again.
  assert.equal(
    report.firstRunPrecedesTheStage,
    true,
    'the first-start notice is drawn above the stage, so it must come before it in the document'
  );
  assert.equal(
    report.firstRunButtonIsFirstInTheColumn,
    true,
    'and the keyboard must reach its button before anything else in the preview column'
  );

  /**
   * The heading tree and the landmarks, after the rebuild left them incomplete:
   * there was no <h1> at all, the settings column's <h3> headings sat under no
   * <h2>, the navigation had no accessible name, the starting gallery had a
   * heading but nothing tying the section to it, and the sidebar declared two
   * `role="tablist"` elements whose tabs controlled no `role="tabpanel"`.
   *
   * The tablists were dropped rather than completed, because the contract they
   * half-stated is not what this column does: all three effect sections stay on
   * screen in one scrolling column and an entry scrolls to its own (see
   * showSection in app/renderer/main.js), which is a table of contents and not
   * a tab strip. What is left is five ordinary buttons in a named landmark,
   * with `aria-current` on the one being pointed at and every one of them a tab
   * stop.
   */
  const { landmarks } = report;
  assert.deepEqual(landmarks.h1, ['SignalForge'], 'the window has exactly one <h1>: the app itself');
  assert.equal(landmarks.h3, 0, 'and no <h3> under nothing — every section heading is an <h2>');
  assert.ok(landmarks.navName, 'the navigation landmark must carry a name');
  assert.equal(
    landmarks.galleryNamedBy,
    'gallery-title',
    'the starting gallery must be named by the heading inside it'
  );
  assert.equal(
    landmarks.tablists,
    0,
    'no half-stated tablist: tabs that control no tabpanel are worse than plain buttons'
  );
  assert.equal(landmarks.navCurrent.length, 1, 'exactly one entry says it is the current one');
  assert.equal(
    landmarks.navTabStops,
    5,
    'and every destination is reachable by Tab, not only by the arrow keys'
  );

  // Nobody has chosen a language, so the machine's own decides — and the
  // choice is written back, so the next start no longer depends on it.
  assert.ok(
    ['de', 'en'].includes(report.storedLanguage),
    `a first start must settle on a language the app speaks, got ${report.storedLanguage}`
  );
  assert.equal(
    report.storedLanguage,
    report.navigatorLanguage.toLowerCase().split('-')[0] === 'en' ? 'en' : 'de',
    `a first start must follow navigator.language (${report.navigatorLanguage}) where it can`
  );
  assert.equal(
    report.documentLanguage,
    report.storedLanguage,
    'the document element must announce the language, for screen readers as much as for hyphenation'
  );

  // The language switch, operated in the window. Every column has to change,
  // not just the one the control sits in — the settings column is rebuilt, the
  // frame and the footer are re-labelled in place, and the drop hint is
  // re-stated from its key.
  //
  // What used to be checked here was the layer column's heading. That column
  // is gone (it was an empty panel promising a list a later task will build —
  // see mountShell), so the frame's own heading below covers the frame, and
  // the settings column's section heading is checked in its place: it is a
  // piece of text the column did not have before, so this proves one thing
  // more than it did, not one thing less.
  assert.equal(report.inGerman.section, 'Farbe');
  assert.equal(report.inEnglish.section, 'Colour', 'the settings column\'s sections must follow the switch');
  assert.equal(report.inEnglish.settings, 'Settings', 'and the frame');
  assert.equal(report.inEnglish.exportButton, 'Save to SignalRGB', 'the footer must follow it too');
  assert.equal(report.inEnglish.brightness, 'Brightness', 'and the settings column');
  // The invitation moved into the empty frame it is talking about, so this
  // reads it there. Same key, same words, a place where it means something.
  assert.equal(report.inEnglish.hint, 'Drop an image here', 'and the empty frame\'s invitation');
  assert.equal(report.inGerman.hint, 'Bild hierher ziehen');
  // The second line of the empty state: what the importer actually accepts.
  // The list of formats is derived from SUPPORTED_IMAGE_EXTENSIONS rather than
  // typed out, so it is checked as "the sentence is translated AND the list is
  // in it" rather than against a copy of the list, which is the duplication
  // this was built to avoid.
  assert.match(report.inEnglish.formats, /^Supported: /, 'the accepted formats must be said in English too');
  assert.match(report.inGerman.formats, /^Unterstützt: /);
  for (const format of ['PNG', 'JPG', 'JPEG', 'WEBP', 'GIF', 'BMP']) {
    assert.ok(
      report.inGerman.formats.includes(format),
      `the empty state must name ${format}, which the importer accepts`
    );
  }
  // The settings column says why it is short while nothing has been started
  // — and, since there are now three ways to start something and not one, it
  // names them rather than talking about a picture alone.
  assert.equal(
    report.inEnglish.awaitingImage,
    'Choose below how the effect should begin - a picture, a colour or a gradient. Its settings then appear here.',
    'the settings column must explain its own length, in the language in force'
  );
  assert.equal(report.inEnglish.firstRun, 'Where should the effects go?', 'and the first-start question');
  assert.equal(report.inEnglish.documentLanguage, 'en');
  assert.deepEqual(
    report.backInGerman,
    report.inGerman,
    'switching back must restore every last word, not merely most of them'
  );

  // The line of feedback is empty until something happens, so a message is
  // made to happen — export with nothing to export — and then the language is
  // switched under it. This is the one path that has to re-state a message
  // from its key (see applyLanguage in app/renderer/main.js); a message
  // assembled with a path or a file name in it is a report about something
  // that already happened and is deliberately left where it is.
  assert.match(
    report.emptyExportMessage,
    /Erst ein Bild/,
    'exporting with no picture must say so on the one line of feedback'
  );
  assert.equal(
    report.emptyExportInEnglish,
    'Drop an image in first',
    'and that line must be said again in the language the user switches to'
  );
  assert.equal(
    report.emptyExportBackInGerman,
    'Erst ein Bild hineinziehen',
    'and switching back must restore it'
  );

  // And the answer to the question, through the real sf:chooseFolder handler.
  assert.match(
    report.targetAfterChoosing,
    /gewählt|chosen/,
    'once the folder has been chosen the footer must show it as the chosen one'
  );
  assert.equal(
    report.firstRunReallyGone,
    true,
    'and the question must actually leave the screen, not just lose the hidden property'
  );

  // The renderer never constructs or supplies a filesystem path — the rule
  // that makes the whole bridge reviewable. sf:exportEffect resolves the
  // folder it writes into from the effectsFolder setting, so a window that
  // could write that setting could choose where an effect lands and what it
  // overwrites. Asked here through the real bridge, in the real window.
  assert.equal(
    report.rendererCannotSetEffectsFolder,
    true,
    'the window must be refused when it asks to set effectsFolder — that setting decides ' +
      'where sf:exportEffect writes, and only the main process may choose a path'
  );
  assert.equal(
    report.rendererCannotSetLastProjectFolder,
    true,
    'the window must be refused when it asks to set lastProjectFolder — it is a path too'
  );
  assert.equal(
    report.pathSettingsUnchangedAfterRefusal,
    true,
    'a refused settings write must leave the stored paths exactly as they were'
  );
  assert.equal(
    report.rendererCanStillSetTheLanguage,
    true,
    'the language is the one setting the window owns and must still be writable'
  );

  // Save and open, driven by clicking the app's own footer buttons in the
  // real window. Only the two OS file dialogs are stubbed (see
  // selfTestProjects in test/harness/selftest.js) — a modal dialog would wait
  // for a human.
  assert.match(
    report.projectOpenedMessage,
    /seed\.sfx/,
    'opening a project must say so in the window, naming the file'
  );
  assert.deepEqual(
    report.projectOpenedControls,
    {
      fit: 'contain',
      motion0: 'drift',
      motion1: 'breathe',
      speed0: '7',
      amount0: '66',
      brightness: '42',
      saturation: '133',
      greenMagenta: '-20'
    },
    'the settings column must show the opened project, not the values it had before'
  );
  assert.match(report.projectSavedMessage, /saved\.sfx/, 'saving must say so in the window');
  assert.equal(
    report.projectRoundTripIdentical,
    true,
    'a project saved out of the live window must be byte for byte the project that was opened ' +
      '— picture, crop offset, motions, colour and brightness all included'
  );

  // A file that cannot be read must produce a message and change nothing.
  assert.match(
    report.corruptProjectMessage,
    /could not be read/i,
    'a truncated project file must produce a visible message, not a blank window'
  );
  assert.equal(report.corruptProjectWarned, true, 'that message must be marked as a warning');
  assert.deepEqual(
    report.controlsAfterCorrupt,
    report.projectOpenedControls,
    'a project that failed to open must leave the one already open exactly as it was'
  );

  // Review finding: a project whose asset names a `file` instead of
  // embedding it must be refused, in the window and by the previous project
  // being left exactly as it was — the same shape of proof as the corrupt
  // file above, so the guard is proven where the renderer, not just the
  // pure parseProject tests, can see it.
  assert.match(
    report.smuggledFileMessage,
    /not embedded/i,
    'a project whose asset names a file instead of embedding it must produce a visible message'
  );
  assert.equal(report.smuggledFileWarned, true, 'that message must be marked as a warning');
  assert.deepEqual(
    report.controlsAfterSmuggled,
    report.projectOpenedControls,
    'a project trying to smuggle an outside file reference must leave the one already open exactly as it was'
  );

  // A stored value the slider's normal range cannot reach must be shown as it
  // is, not silently rounded up to the nearest end of the slider.
  assert.deepEqual(
    report.dimBrightness,
    { value: '3', min: '3' },
    'a project carrying brightness 3 must show 3, with the slider widened to reach it'
  );

  assert.equal(
    report.cursorOverPicture,
    'grab',
    'an opened project must still be draggable: the picture has to be measured again, ' +
      'because the document does not carry its size'
  );

  // Export, driven by clicking the app's own footer button in the real
  // window. Nothing is stubbed here at all: the target folder is a throwaway
  // one the self-test put in its own throwaway settings file, so the real
  // handler, the real control list and the real atomic write are all
  // exercised without a dialog and without touching anything that matters.
  assert.ok(
    !/WhirlwindFX/i.test(report.exportFolder),
    `the self-test must never export into a real SignalRGB folder, it used ${report.exportFolder}`
  );
  assert.match(
    report.targetShown,
    /chosen|gewählt/,
    'the footer must show where the effect is going and how that was decided'
  );
  assert.match(
    report.exportedMessage,
    /Selftest Export\.html/,
    'a finished export must name the file it wrote'
  );
  assert.match(report.exportedMessage, /KB/, 'and how big it is');
  assert.equal(
    report.exportedBrightnessDefault,
    report.brightnessBeforeExport,
    'the exported effect must carry what the settings column was showing at the moment of export'
  );
  assert.deepEqual(
    report.exportedFiles,
    ['Selftest Export.html'],
    'exactly one effect, named after the name field, must be in the target folder'
  );

  // A second export of the same name must ask, with the full path in the
  // question, and must not have touched the file while asking.
  assert.match(
    report.existsMessage,
    /Selftest Export\.html/,
    'the overwrite question must name the full path'
  );
  assert.equal(report.existsWarned, true, 'the overwrite question must be marked as a warning');
  assert.equal(
    report.overwriteOffered,
    true,
    'the only way past the question must be a button the user presses on purpose'
  );
  assert.equal(
    report.overwriteReplacedTheFile,
    true,
    'answering the question must actually replace the file that was there'
  );
  assert.equal(
    report.overwriteWithdrawn,
    true,
    'the overwrite button must disappear again once the question has been answered'
  );

  // A name made only of separators must be refused out loud and must not
  // have created anything anywhere.
  assert.match(report.badNameMessage, /\\ \/ : \?/, 'a useless name must say what a usable one looks like');
  assert.deepEqual(
    report.filesAfterBadName,
    ['Selftest Export.html'],
    'a refused name must not have written anything'
  );

  // A usable name full of path characters must land in the target folder
  // under a plain file name, never one folder up or on another drive.
  assert.deepEqual(
    report.filesAfterSanitised.sort(),
    ['Selftest Export.html', 'a-b-c-d.html'],
    'a name containing / \\ : ? must be sanitised into a plain file name in the chosen folder'
  );
  assert.match(report.sanitisedMessage, /a-b-c-d\.html/);
  assert.equal(
    report.nameFieldAfterSanitised,
    'a-b-c-d',
    'after a successful export the name field must show the name actually used, not the raw text still typed'
  );
});
