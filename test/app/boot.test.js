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
  // SF_SELFTEST in the environment is what switches the self-test on, and the
  // only thing that does — app/main.js never looks at argv.
  const child = spawn(require_('electron'), [join(root, 'app', 'main.js')], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, SF_SELFTEST: '1' }
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
  assert.equal(
    report.firstRunLeavesTheAppUsable,
    true,
    'the question must be a panel, not a curtain: the rest of the window stays reachable'
  );
  assert.ok(
    /waehlen|choose/i.test(report.firstRunAsks),
    `the question must offer the one button that answers it, got ${report.firstRunAsks}`
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
  assert.equal(report.inGerman.layers, 'Ebenen');
  assert.equal(report.inEnglish.layers, 'Layers', 'the frame must follow the switch');
  assert.equal(report.inEnglish.settings, 'Settings');
  assert.equal(report.inEnglish.exportButton, 'Save to SignalRGB', 'the footer must follow it too');
  assert.equal(report.inEnglish.brightness, 'Brightness', 'and the settings column');
  assert.equal(report.inEnglish.hint, 'Drop an image here', 'and the line of feedback');
  assert.equal(report.inEnglish.firstRun, 'Where should the effects go?', 'and the first-start question');
  assert.equal(report.inEnglish.documentLanguage, 'en');
  assert.deepEqual(
    report.backInGerman,
    report.inGerman,
    'switching back must restore every last word, not merely most of them'
  );

  // And the answer to the question, through the real sf:chooseFolder handler.
  assert.match(
    report.targetAfterChoosing,
    /gewaehlt|chosen/,
    'once the folder has been chosen the footer must show it as the chosen one'
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
  // selfTestProjects in app/main.js) — a modal dialog would wait for a human.
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
    /chosen|gewaehlt/,
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
