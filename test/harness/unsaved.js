// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * The unsaved-changes harness: every gesture that can change the document,
 * made one at a time in the real window, with the flag read back after each
 * one — and then the question that stands in front of "open project", answered
 * all three ways.
 *
 * An Electron main entry of its own, the same shape as selftest.js and
 * walkthrough.js and for the same reason: it imports app/main.js, the real
 * one, unchanged. That registers every IPC handler and opens the real window;
 * everything below reaches into that window from out here, with real mouse and
 * keyboard events through the Chrome DevTools Protocol.
 *
 *   npx electron test/harness/unsaved.js
 *
 * `npm test` spawns exactly that (see test/app/unsaved-changes.test.js) and
 * judges the one line of JSON this prints. Two optional environment variables
 * are for a human running it by hand:
 *
 *   SF_UNSAVED_SHOTS   a folder to photograph the window into
 *   SF_UNSAVED_REAL    with '1', the last question is NOT stubbed: the genuine
 *                      OS dialog is opened, left standing for ninety seconds
 *                      so somebody outside can photograph it, and the run then
 *                      kills itself — nothing in here can answer a real modal.
 *                      Never set by the test suite; a test that waits for a
 *                      human is not a test.
 *
 * Nothing here may touch the machine's real SignalRGB folder: userData goes to
 * a throwaway directory, SF_EFFECTS_SANDBOX names that same directory as the
 * one app/main.js may not resolve outside of, and the search for an existing
 * installation is pointed at it too.
 */
import { app, BrowserWindow, dialog } from 'electron';
import { writeFileSync, readFileSync, mkdtempSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SANDBOX_ENV } from '../../src/main/effects-target.js';
import { serializeProject } from '../../src/main/project.js';
import { normalizeDocument } from '../../src/engine/document.js';
import { projectDialogs, discardDialog, searchRoots, DISCARD_ANSWERS } from '../../app/main.js';
import { driver, wait } from './driver.js';

// This block has to run before app/main.js's own app.whenReady handler does,
// and it does: importing that module only REGISTERS the handler, and every
// module body finishes before the ready event fires.
const runDir = mkdtempSync(join(tmpdir(), 'signalforge-unsaved-'));
const effectsFolder = join(runDir, 'Effects');
mkdirSync(effectsFolder, { recursive: true });
app.setPath('userData', runDir);
process.env[SANDBOX_ENV] = runDir;
searchRoots.documents = () => runDir;
searchRoots.home = () => runDir;

// The effects folder is named up front, unlike in the self-test: the
// first-start question is not what this harness is about, and a panel sitting
// over the preview would be in the way of the drag that imports a picture.
// English up front for the same reason the labels are read back below — the
// question's words have to be provably the window's, and the run then switches
// to German and asks again.
writeFileSync(
  join(runDir, 'settings.json'),
  JSON.stringify({ effectsFolder, lastProjectFolder: runDir, language: 'en' }, null, 2),
  'utf8'
);

// A window Chromium thinks nobody is looking at stops being given animation
// frames, and everything here that photographs or measures the canvas waits
// for two of them. These three switches belong to the harness and change
// nothing about the app.
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');

const SHOTS = process.env.SF_UNSAVED_SHOTS || null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const REAL_DIALOG = process.env.SF_UNSAVED_REAL === '1';

/**
 * A 4x4 PNG, one colour per quarter — the same one the self-test uses. Written
 * out as a real file because the import is driven as a real drag carrying a
 * real path, which is the only kind the preload's webUtils.getPathForFile can
 * resolve. Four by four into a 320 x 200 canvas at `cover` crops top and
 * bottom, so there is vertical slack for the crop drag and the arrow keys to
 * move — and none horizontally, which is why everything below moves the crop
 * up and down.
 */
const PROBE_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAJ0lEQVR42mP4YGPzwcbG5kOFzYcKBhSOW94vt7xfv+7Y/Lpjg8IBAJkqGzE5EWVwAAAAAElFTkSuQmCC';

const imageFile = join(runDir, 'probe.png');
writeFileSync(imageFile, Buffer.from(PROBE_PNG, 'base64'));

/**
 * The project the "open" button opens: deliberately unlike anything the run
 * builds by hand, so "was it opened?" and "was it left alone?" are both
 * answerable by looking at the controls.
 */
const seedFile = join(runDir, 'seed.sfx');
writeFileSync(seedFile, serializeProject(normalizeDocument({
  name: 'The Other Project',
  brightness: 44, saturation: 133, greenMagenta: -20, blueYellow: 15,
  layers: [{
    id: 'image', type: 'image', asset: 'image', fit: 'contain',
    // A motion that is listed but moves nothing (amount 0). It has to be
    // there — the settings column is read back to tell one project from the
    // other — and it has to be still, because the checks below compare the
    // rendered canvas pixel for pixel, and a breathing picture is a different
    // picture every frame whatever anybody clicked.
    offset: { x: 0, y: 0 }, motions: [{ kind: 'breathe', speed: 9, amount: 0 }]
  }],
  assets: { image: { kind: 'image', mime: 'image/png', data: PROBE_PNG } }
}).doc), 'utf8');

// The two file dialogs, stubbed the way every other harness in this folder
// stubs them: a modal OS dialog would sit waiting for a human. Each save goes
// to a file of its own so the one line of feedback says something new every
// time (which is what clickAndWait waits for).
let saveCount = 0;
let saveCanceled = false;
let saveDialogCalls = 0;
let savedFiles = [];
projectDialogs.save = async () => {
  saveDialogCalls += 1;
  if (saveCanceled) return { canceled: true, filePath: undefined };
  saveCount += 1;
  const filePath = join(runDir, `saved-${saveCount}.sfx`);
  savedFiles.push(filePath);
  return { canceled: false, filePath };
};
projectDialogs.open = async () => ({ canceled: false, filePaths: [seedFile] });

// And the question itself. Answered by ROLE — DISCARD_ANSWERS.indexOf(...) —
// rather than by a number written out here a second time.
let discardAnswer = 'cancel';
const discardAsked = [];
discardDialog.ask = async (_win, options) => {
  discardAsked.push({
    title: options.title,
    message: options.message,
    detail: options.detail,
    buttons: options.buttons,
    defaultId: options.defaultId,
    cancelId: options.cancelId
  });
  return { response: DISCARD_ANSWERS.indexOf(discardAnswer), checkboxChecked: false };
};

app.whenReady().then(async () => {
  const report = {};
  try {
    const win = BrowserWindow.getAllWindows()[0];
    if (!win) throw new Error('app/main.js did not open a window');
    await win.webContents.debugger.attach('1.3');
    if (win.webContents.isLoading()) {
      await new Promise((resolve) => win.webContents.once('did-finish-load', resolve));
    }

    const d = driver(win, { shotsDir: SHOTS });
    await d.until(`document.getElementById('footer-open') !== null`, 'the window is built', 200);

    /** The flag, read where the window says it out loud. */
    const unsaved = () => d.js(`document.documentElement.classList.contains('has-unsaved-changes')`);

    /** Every control a change could show up in, plus the name. */
    const controls = () => d.js(`({
      fit: document.getElementById('sf-layers-0-fit')?.value ?? null,
      kind0: document.getElementById('sf-layers-0-kind-0')?.value ?? null,
      speed0: document.getElementById('sf-layers-0-motions-0-speed')?.value ?? null,
      amount0: document.getElementById('sf-layers-0-motions-0-amount')?.value ?? null,
      brightness: document.getElementById('sf-brightness')?.value ?? null,
      saturation: document.getElementById('sf-saturation')?.value ?? null,
      greenMagenta: document.getElementById('sf-greenMagenta')?.value ?? null,
      name: document.getElementById('footer-name').value
    })`);

    /**
     * Wait for something this process can see for itself — the question having
     * been asked, the save dialog having been opened — rather than for a
     * duration. `npm test` runs its files side by side, so every fixed pause
     * in here is a pause that is long enough right up until the machine is
     * busy, and then quietly is not.
     */
    const waitFor = async (fact, what, tries = 200) => {
      for (let i = 0; i < tries; i += 1) {
        if (fact()) return;
        await wait(50);
      }
      throw new Error(`it never happened: ${what}`);
    };

    /**
     * Long enough that an open which should NOT have happened would have
     * happened by now: the file is read, its picture decoded and the whole
     * settings column rebuilt, all of which the checks after this would see.
     */
    const LONG_ENOUGH_TO_HAVE_OPENED = 1500;

    /** Save, through the app's own button and the real handler. */
    const save = async () => {
      await d.clickAndWait('footer-save');
      return unsaved();
    };

    report.freshStart = await unsaved();

    // --- the picture, dragged in the way a person drags it ------------------
    //
    // A real drag through the protocol, carrying a real file path: the only
    // kind webUtils.getPathForFile in the preload can resolve, so this is also
    // the proof that the import is reachable by dragging rather than only by
    // calling the handler.
    //
    // The window is brought to the front first, because this is the one
    // gesture here that goes through Chromium's own drag pipeline rather than
    // straight into the page, and that pipeline takes its time about a window
    // nobody is looking at — `npm test` runs its files side by side, so another
    // harness's window can perfectly well be in front of this one.
    const hasPicture =
      `document.getElementById('preview-body').classList.contains('has-picture')`;
    const preview = await d.box('#preview-body');
    win.show();
    // Raised rather than merely asked for: Windows may refuse a background
    // process's focus request outright, and Z-order does not need its
    // permission. Put back the moment the picture is in.
    win.setAlwaysOnTop(true);
    win.focus();
    win.moveTop();
    await wait(400);
    try {
      await d.send('Input.setInterceptDrags', { enabled: false });
    } catch {
      // Older protocol revisions do not have it; the drop below is what
      // matters and reports its own failure.
    }
    for (const type of ['dragEnter', 'dragOver', 'drop']) {
      await d.send('Input.dispatchDragEvent', {
        type, x: preview.cx, y: preview.cy,
        data: { items: [], files: [imageFile], dragOperationsMask: 1 }
      });
      await wait(150);
    }
    // Dropped exactly once, and then waited for as long as it takes.
    //
    // Retrying was tried and is a trap: Chromium does not refuse a drag it is
    // too busy for, it QUEUES it — so a second drop dispatched because the
    // first "had not worked yet" arrives anyway, minutes later, and imports the
    // picture again in the middle of a completely different check. That is not
    // a theory; it is what turned three of the checks below red at random under
    // the load of a full test run, each time with the freshly imported picture
    // sitting where the project under test should have been.
    let dropped = false;
    for (let waited = 0; waited < 300 && !dropped; waited += 1) {
      await wait(100);
      dropped = await d.js(hasPicture);
    }
    win.setAlwaysOnTop(false);
    if (!dropped) {
      throw new Error(
        `the drag-and-drop import never took; the window says: ${await d.message()}`
      );
    }
    report.afterImport = await unsaved();
    report.afterImportSaved = await save();
    await d.shot('01-picture-imported-and-saved');

    // --- the crop, dragged with a real mouse --------------------------------
    const canvas = await d.box('#preview-canvas');
    await d.drag(canvas.cx, canvas.cy, canvas.cx, canvas.cy + 60);
    report.afterCropDrag = await unsaved();
    report.afterCropDragSaved = await save();

    // --- the crop, moved with real arrow keys -------------------------------
    await d.js(`document.getElementById('preview-canvas').focus()`);
    report.canvasFocused = await d.js(`document.activeElement.id === 'preview-canvas'`);
    await d.key('ArrowUp', 'ArrowUp', 38);
    report.afterArrowKeys = await unsaved();
    report.afterArrowKeysSaved = await save();

    // --- a slider -----------------------------------------------------------
    await d.setInput('sf-brightness', '77');
    await wait(60);
    report.afterSlider = await unsaved();
    report.afterSliderSaved = await save();

    // --- a motion added, then removed --------------------------------------
    //
    // Waited for by what the column shows rather than by a fixed pause: adding
    // a motion reloads the picture before the column is redrawn, and under the
    // load of a full test run that takes as long as it takes.
    await d.clickById('sf-layers-0-add');
    await d.until(
      `document.getElementById('sf-layers-0-remove-0') !== null`,
      'the added motion is in the column',
      100
    );
    report.afterAddMotion = await unsaved();
    report.afterAddMotionSaved = await save();

    await d.clickById('sf-layers-0-remove-0');
    await d.until(
      `document.getElementById('sf-layers-0-remove-0') === null`,
      'the removed motion is gone from the column',
      100
    );
    report.afterRemoveMotion = await unsaved();
    report.afterRemoveMotionSaved = await save();

    // --- the fit mode -------------------------------------------------------
    await d.setSelect('sf-layers-0-fit', 'stretch');
    await wait(150);
    report.afterFitMode = await unsaved();
    report.afterFitModeSaved = await save();
    // Back to the one fit mode that leaves something to crop, so the picture
    // is draggable again for anything that follows.
    await d.setSelect('sf-layers-0-fit', 'cover');
    await wait(150);
    await save();

    // --- the name -----------------------------------------------------------
    await d.setInput('footer-name', 'Renamed By Hand');
    await wait(60);
    report.afterName = await unsaved();
    report.afterNameSaved = await save();

    // --- opening with nothing unsaved must not ask at all -------------------
    const askedBeforeCleanOpen = discardAsked.length;
    await d.clickAndWait('footer-open');
    report.cleanOpenAskedNothing = discardAsked.length === askedBeforeCleanOpen;
    report.afterOpen = await unsaved();
    report.controlsAfterOpen = await controls();
    await d.shot('02-other-project-opened');

    // --- the question: cancel ----------------------------------------------
    //
    // A change of a kind that shows up in four different places at once: the
    // fit mode, a slider, the name, and the crop — which nothing but the
    // rendered canvas can show, since the document does not carry it in any
    // control. If a cancelled open let any of it through, one of the four
    // says so.
    //
    // The fit goes first because the project just opened is `contain`, which
    // crops nothing: without this the drag below would have no slack to move
    // in and would prove nothing.
    await d.setSelect('sf-layers-0-fit', 'cover');
    await wait(200);
    const cropCanvas = await d.box('#preview-canvas');
    await d.drag(cropCanvas.cx, cropCanvas.cy, cropCanvas.cx, cropCanvas.cy + 50);
    await d.setInput('sf-brightness', '12');
    await d.setInput('footer-name', 'Work In Progress');
    await wait(200);
    const before = await controls();
    // Two painted frames before the picture is read, and again before it is
    // read a second time: a crop drag writes into the live document and the
    // render loop shows it on its NEXT frame, so a reading taken too early
    // would be of the frame before the drag — and the comparison would then
    // fail on the paint that was still to come rather than on anything the
    // cancelled open did.
    await d.settle();
    const beforePixels = await d.stats();
    const beforeMessage = await d.message();
    report.unsavedBeforeCancel = await unsaved();
    await d.shot('03-unsaved-work');

    discardAnswer = 'cancel';
    const askedBeforeCancel = discardAsked.length;
    await d.clickById('footer-open');
    await waitFor(() => discardAsked.length > askedBeforeCancel, 'the question was asked');
    await wait(LONG_ENOUGH_TO_HAVE_OPENED);
    report.cancelAsked = discardAsked.length === askedBeforeCleanOpen + 1;
    report.questionInEnglish = discardAsked[discardAsked.length - 1];
    const afterCancel = await controls();
    await d.settle();
    const afterCancelPixels = await d.stats();
    report.cancelLeftControls = JSON.stringify(afterCancel) === JSON.stringify(before);
    report.cancelLeftThePicture = afterCancelPixels.hash === beforePixels.hash;
    report.pixelsAroundCancel = {
      before: { hash: beforePixels.hash, mean: beforePixels.mean, column: beforePixels.brightestColumn },
      after: { hash: afterCancelPixels.hash, mean: afterCancelPixels.mean, column: afterCancelPixels.brightestColumn }
    };
    report.cancelSaidNothing = (await d.message()) === beforeMessage;
    report.stillUnsavedAfterCancel = await unsaved();
    report.controlsBeforeCancel = before;
    report.controlsAfterCancel = afterCancel;
    await d.shot('04-after-cancel-nothing-changed');

    // --- the question: cancel again, in German ------------------------------
    //
    // The labels are the window's own words, in the language the window is
    // being used in, and nothing about them is written down in the main
    // process. Asked twice in two languages, which is the only way to tell a
    // translated label from a hard-coded one that happens to look right.
    await d.setSelect('footer-language', 'de');
    await wait(150);
    const askedBeforeGerman = discardAsked.length;
    await d.clickById('footer-open');
    await waitFor(() => discardAsked.length > askedBeforeGerman, 'the question was asked in German');
    report.questionInGerman = discardAsked[discardAsked.length - 1];
    await d.setSelect('footer-language', 'en');
    await wait(150);

    // --- the question: save first, but the save is cancelled ---------------
    saveCanceled = true;
    discardAnswer = 'save';
    const savesBefore = saveDialogCalls;
    await d.clickById('footer-open');
    // The save dialog really having been opened and cancelled, before the
    // stub is put back: flipping it back too early would let the save that is
    // meant to be cancelled succeed, and the project would then open after
    // all — which is exactly what an under-load fixed pause used to cause.
    await waitFor(() => saveDialogCalls > savesBefore, 'the save dialog was opened and cancelled');
    await wait(LONG_ENOUGH_TO_HAVE_OPENED);
    saveCanceled = false;
    report.controlsAfterCanceledSave = await controls();
    report.stillUnsavedAfterCanceledSave = await unsaved();
    report.messageAfterCanceledSave = await d.message();

    // --- the question: save first, and the save goes through ---------------
    //
    // Waited for by what the window is SHOWING rather than by the line of
    // feedback: that line already names seed.sfx from the open further up, so
    // waiting for it to mention the file again would be satisfied before
    // anything had happened at all.
    const otherProjectIsOnScreen =
      `document.getElementById('footer-name').value === 'The Other Project'`;
    savedFiles = [];
    discardAnswer = 'save';
    await d.clickById('footer-open');
    await d.until(otherProjectIsOnScreen, 'the other project is opened after saving', 100);
    await wait(300);
    report.saveFirstWroteAFile = savedFiles.length === 1;
    report.saveFirstFile = savedFiles[0] ?? null;
    // And what landed in it has to be the work that was about to be lost, not
    // the project that replaced it a moment later.
    if (savedFiles.length === 1) {
      const written = JSON.parse(readFileSync(savedFiles[0], 'utf8')).document;
      report.saveFirstWrote = { name: written.name, brightness: written.brightness };
    }
    report.controlsAfterSaveFirst = await controls();
    report.unsavedAfterSaveFirst = await unsaved();
    await d.shot('05-saved-then-opened');

    // --- the question: discard ---------------------------------------------
    await d.setInput('sf-brightness', '9');
    await wait(150);
    savedFiles = [];
    discardAnswer = 'discard';
    await d.clickById('footer-open');
    // The brightness the file carries, back over the 9 that was typed here.
    await d.until(
      `document.getElementById('sf-brightness').value === '44'`,
      'the other project is opened after discarding',
      100
    );
    await wait(300);
    report.discardWroteNothing = savedFiles.length === 0;
    report.controlsAfterDiscard = await controls();
    report.unsavedAfterDiscard = await unsaved();
    await d.shot('06-discarded-and-opened');

    // --- the genuine dialog, photographed -----------------------------------
    //
    // Only when a human asked for it, and never by the suite. The question is
    // a window belonging to the operating system, so win.capturePage() cannot
    // see it and nothing in here can answer it either: it is opened, left
    // standing for as long as it takes somebody to photograph it, and the run
    // then kills itself.
    if (REAL_DIALOG) {
      discardDialog.ask = (w, options) => dialog.showMessageBox(w, options);
      // Above everything, including a full-screen game: the question has to
      // be the thing on screen for anybody to photograph it.
      win.setAlwaysOnTop(true, 'screen-saver');
      win.focus();
      await d.setInput('sf-brightness', '33');
      await wait(300);
      await d.js(`document.getElementById('footer-open').click()`);
      await wait(1500);
      // Left standing, and nothing here photographs the desktop: a screen
      // capture would take in whatever else the machine's owner happens to
      // have open. Whoever asked for this run photographs the dialog itself
      // (Win32 PrintWindow renders a window even when something is in front of
      // it) while this waits, and the run then kills itself — there is no way
      // to answer a real modal from in here.
      process.stdout.write('the real question is open, photograph it now (90s)\n');
      await wait(90_000);
      process.stdout.write(`${JSON.stringify(report)}\n`);
      app.exit(0);
      return;
    }

    if (SHOTS) process.stdout.write(`unsaved-changes screenshots: ${SHOTS}\n`);
    process.stdout.write(`${JSON.stringify(report)}\n`);
    app.quit();
  } catch (err) {
    console.error('unsaved-changes harness failed:', err);
    console.error('report so far:', JSON.stringify(report));
    app.exit(1);
  }
});
