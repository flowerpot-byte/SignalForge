// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max Leopold Blumenschein
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * The import-loading harness: proves the stage's "wird geladen" condition
 * (preview.js's setLoading, wired up in app/renderer/main.js's importFile)
 * appears the instant a picture import starts and is cleared on every way
 * that import can end — a success, a refusal (`{ ok: false }`) and an
 * unexpected throw (the bridge itself rejecting).
 *
 * An Electron main entry of its own, the same shape as selftest.js and
 * unsaved.js: it imports app/main.js, the real one, unchanged, and drives the
 * window it opens from out here. The window is never shown (see
 * harnessSandbox below) — the gesture that lands the picture is the gallery's
 * own hidden file input, driven through DevTools Protocol exactly as
 * unsaved.js's pickPicture does, and that needs no window on screen.
 *
 *   npx electron test/harness/import-loading.js
 *
 * `npm test` spawns exactly that (see test/app/import-loading.test.js).
 * SF_IMPORT_LOADING_SHOTS, set by that test to work/polish-shots, is where
 * the one screenshot this harness takes — the frame mid-import — lands.
 *
 * THE ONE THING REPLACED: sf:importImage's own IPC handler
 *
 * Every other harness in this folder puts a real picture through the real
 * decoder (prepareImageFile) and waits out however long that genuinely takes.
 * That is right for proving the decode itself works, and wrong for this file:
 * what is under test here is a piece of the renderer that runs on BOTH sides
 * of that decode — before it starts and after it ends, however it ends — and
 * a real decode of a 4x4 PNG finishes in a handful of milliseconds, too fast
 * to reliably observe "is-loading" mid-flight without a race against however
 * busy the machine happens to be.
 *
 * So the handler is replaced with one that hangs until this file releases it,
 * with the outcome (resolve with a real asset, resolve with `{ ok: false }`,
 * or reject) chosen per gesture. Nothing about the path the picture actually
 * travels changes: the renderer still calls window.sf.importImage(file)
 * through the very same preload bridge, and app/renderer/main.js's importFile
 * still runs unmodified — only what the main process hands back, and when, is
 * now under this file's control instead of a real file's.
 */
import { BrowserWindow, ipcMain } from 'electron';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { driver, runHarness, wait } from './driver.js';
import { harnessSandbox } from './sandbox.js';
// discardDialog is the seam test/harness/unsaved.js also replaces, and for
// the same reason it has to be replaced here: the FIRST picture lands on a
// clean document and asks nothing, but importFile calls markChanged() once it
// does (see app/renderer/main.js) — so the second and third gestures below
// would each open the real, native "discard unsaved work?" dialog and hang
// forever waiting for a human. Nothing here is actually about that question;
// it is answered "discard" as fast as possible so the loading condition
// under test is reached the same way every time.
import { discardDialog, DISCARD_ANSWERS } from '../../app/main.js';

const { runDir } = harnessSandbox('import-loading', { show: false });

// A real file has to back the gallery's hidden <input type="file"> for
// DOM.setFileInputFiles to accept it, but its BYTES are never read — the
// decode itself is stubbed below, so a real image is not needed, only a name
// isSupportedImage (components/drop.js) accepts.
const pickedFile = join(runDir, 'photo.png');
writeFileSync(pickedFile, Buffer.from([0]));

// A real, small, decodable PNG — the same 4x4 four-colour probe
// test/harness/selftest.js and unsaved.js both use — so the SUCCESS outcome
// below hands the renderer's real engine bundle something it can actually
// decode and draw, rather than a fabricated asset the render loop would trip
// over the moment it tried to paint it.
const PROBE_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAJ0lEQVR42mP4YGPzwcbG5kOFzYcKBhSOW94vt7xfv+7Y/Lpjg8IBAJkqGzE5EWVwAAAAAElFTkSuQmCC';
const SUCCESS_ASSET = { kind: 'image', mime: 'image/png', data: PROBE_PNG, width: 4, height: 4 };

/**
 * The seam. Every call to sf:importImage now hangs on a promise this file
 * holds the settle functions for, so a gesture made from out here can be
 * caught with the import genuinely in flight — no race against a real
 * decode's own timing — and then ended exactly one of three ways.
 */
let pending = null;
ipcMain.removeHandler('sf:importImage');
ipcMain.handle('sf:importImage', () => new Promise((resolve, reject) => {
  pending = { resolve, reject };
}));

// See the import above: answered "discard" immediately, every time, so a
// picture landing on top of the one already there never waits on a real
// modal this harness has no way to answer.
discardDialog.ask = async () => ({ response: DISCARD_ANSWERS.indexOf('discard'), checkboxChecked: false });

const SHOTS = process.env.SF_IMPORT_LOADING_SHOTS || null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

runHarness('import-loading harness', async () => {
  const report = {};
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw new Error('app/main.js did not open a window');
  await win.webContents.debugger.attach('1.3');
  if (win.webContents.isLoading()) {
    await new Promise((resolve) => win.webContents.once('did-finish-load', resolve));
  }

  const d = driver(win);
  await d.until(`document.getElementById('gallery-file') !== null`, 'the gallery is built', 200);
  await d.installPump();
  try { await d.send('DOM.enable'); } catch { /* already enabled on this revision */ }

  const isLoading = `document.getElementById('preview-body').classList.contains('is-loading')`;
  const hasPicture = `document.getElementById('preview-body').classList.contains('has-picture')`;

  /**
   * One photograph, taken the same two-capture way test/harness/unsaved.js's
   * own shot() does: capturePage() on a window nobody is showing renders on
   * demand, and the FIRST such render only commits the layer a moment earlier
   * commands drew — so it is thrown away and only the second is kept.
   */
  const shot = async (name) => {
    if (!SHOTS) return null;
    await d.pump(4);
    await wait(80);
    await win.capturePage();
    await wait(140);
    const file = join(SHOTS, `${name}.png`);
    writeFileSync(file, (await win.capturePage()).toPNG());
    return file;
  };

  /**
   * The same gesture unsaved.js's pickPicture makes: give the gallery's own
   * hidden file input a real path and fire the `change` its own handler
   * listens for, which reaches app/renderer/main.js's importFile through
   * exactly the door a person choosing a file from the OS dialog would.
   */
  const pickPicture = async () => {
    const { result } = await d.send('Runtime.evaluate', {
      expression: `document.getElementById('gallery-file')`
    });
    await d.send('DOM.setFileInputFiles', { files: [pickedFile], objectId: result.objectId });
    const alreadyFired = await d.js(`document.getElementById('gallery-file').value === ''`);
    if (!alreadyFired) {
      await d.js(`document.getElementById('gallery-file')
        .dispatchEvent(new Event('change', { bubbles: true })), true`);
    }
  };

  // --- exit 1: a picture that loads -----------------------------------------
  await pickPicture();
  await d.until(isLoading, 'the stage enters its loading condition the instant the gesture is made');
  report.loadingAppearsOnStart = await d.js(isLoading);
  await shot('mid-import-loading');
  pending.resolve({ ok: true, asset: SUCCESS_ASSET });
  await d.until(`!(${isLoading})`, 'the loading condition clears once the picture lands');
  report.loadingClearsOnSuccess = !(await d.js(isLoading));
  report.hasPictureAfterSuccess = await d.js(hasPicture);
  await shot('after-success');

  // --- exit 2: a refusal (`{ ok: false }`, the ordinary visible-error shape) -
  await pickPicture();
  await d.until(isLoading, 'a second import also enters the loading condition');
  pending.resolve({ ok: false, message: 'die Testdatei wurde absichtlich abgelehnt' });
  await d.until(`!(${isLoading})`, 'the loading condition clears after a refusal');
  report.loadingClearsOnFailure = !(await d.js(isLoading));
  report.messageAfterFailure = await d.message();

  // --- exit 3: an unexpected throw (the bridge call itself rejecting) --------
  await pickPicture();
  await d.until(isLoading, 'a third import also enters the loading condition');
  pending.reject(new Error('die Bruecke ist absichtlich zerbrochen'));
  await d.until(`!(${isLoading})`, 'the loading condition clears after a thrown rejection', 400);
  report.loadingClearsOnException = !(await d.js(isLoading));
  report.messageAfterException = await d.message();

  if (SHOTS) process.stdout.write(`import-loading screenshots: ${SHOTS}\n`);
  process.stdout.write(`${JSON.stringify(report)}\n`);
  return 0;
});
