// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync, mkdtempSync, renameSync, unlinkSync, existsSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { createSettings } from '../src/main/settings.js';
import { resolveEffectsTarget } from '../src/main/effects-target.js';
import { prepareImageFile } from '../src/main/prepare-image.js';
import { serializeProject, parseProject, PROJECT_EXTENSION } from '../src/main/project.js';
import { normalizeDocument } from '../src/engine/document.js';

const here = dirname(fileURLToPath(import.meta.url));

let settings;

function currentTarget() {
  return resolveEffectsTarget({
    settings,
    documentsPath: app.getPath('documents'),
    homePath: homedir(),
    exists: (p) => existsSync(p)
  });
}

// Write via a temp file + rename so a crash mid-write can never leave a
// truncated, unreadable settings.json behind — the rename is atomic, the
// old file stays intact until the new one is fully on disk.
function writeFileAtomic(file, text) {
  const tempFile = `${file}.${process.pid}.tmp`;
  writeFileSync(tempFile, text, 'utf8');
  try {
    renameSync(tempFile, file);
  } catch (err) {
    // The temp file is now orphaned garbage in userData — clean it up on a
    // best-effort basis (it may already be gone, or removal may itself fail)
    // before re-throwing the original error to the caller.
    try {
      unlinkSync(tempFile);
    } catch {
      // Nothing more we can do about the leftover temp file; the original
      // error below is the one that matters to the caller.
    }
    throw err;
  }
}

ipcMain.handle('sf:version', () => app.getVersion());
ipcMain.handle('sf:settings:all', () => settings.all());
ipcMain.handle('sf:settings:set', async (_e, key, value) => { await settings.set(key, value); return settings.all(); });
ipcMain.handle('sf:effectsTarget', () => currentTarget());
ipcMain.handle('sf:chooseFolder', async () => {
  const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
  if (result.canceled || result.filePaths.length === 0) return currentTarget();
  await settings.set('effectsFolder', result.filePaths[0]);
  return currentTarget();
});
// The error comes back as a value, not a throw: an ipcMain.handle rejection
// reaches the renderer as an opaque "Error invoking remote method" with the
// real message stripped, which is exactly the silent failure the dropped-file
// path must not have (see app/renderer/main.js).
ipcMain.handle('sf:importImage', async (_e, path) => {
  try {
    // preload.cjs resolves this path itself via webUtils.getPathForFile on
    // the dropped File object — the renderer never supplies a path. A File
    // with no real disk backing (anything a renderer script could forge)
    // resolves to '', which must fail the same visible way as any other bad
    // drop rather than being handed to prepareImageFile's readFileSync.
    if (!path) throw new Error('no file path available for the dropped file');
    return { ok: true, asset: await prepareImageFile(path) };
  } catch (error) {
    return { ok: false, message: String(error.message || error) };
  }
});

/**
 * The two file dialogs the project handlers open, behind a seam.
 *
 * A file dialog is a modal window belonging to the operating system: an
 * automated check that opened a real one would sit there until a human
 * clicked something. The self-test below replaces these two entries so it can
 * drive the genuine save/open path — same IPC handlers, same atomic write,
 * same parseProject — with the only human step taken out. Nothing the
 * renderer can reach writes here; the renderer never sees a path at all, in
 * either direction, and cannot influence which one the dialog returns.
 */
const projectDialogs = {
  save: (options) => dialog.showSaveDialog(options),
  open: (options) => dialog.showOpenDialog(options)
};

/**
 * A document name is free text a user typed; a file name is not. Strip the
 * characters Windows refuses outright rather than letting the save dialog
 * reject the suggestion.
 */
function suggestedProjectFileName(name) {
  const clean = String(name ?? '').replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim();
  // normalizeDocument never leaves a document nameless, so the fallback is
  // only there for a name made entirely of stripped characters.
  return `${clean || 'project'}.${PROJECT_EXTENSION}`;
}

/**
 * Start the next dialog where the last one finished. Deliberately never
 * fatal: the project itself is already saved or opened by the time this
 * runs, and losing the convenience of a remembered folder is not worth
 * turning a successful save into a visible failure.
 */
async function rememberProjectFolder(filePath) {
  try {
    await settings.set('lastProjectFolder', dirname(filePath));
  } catch (error) {
    console.error('could not remember the project folder:', error);
  }
}

/**
 * Both dialogs offer the same file type and both start in the folder the
 * last one finished in, with the save dialog also suggesting a file name.
 */
function projectDialogOptions(fileName) {
  const last = settings.get('lastProjectFolder');
  const defaultPath = fileName ? join(last || '', fileName) : last;
  return {
    filters: [{ name: 'SignalForge', extensions: [PROJECT_EXTENSION] }],
    ...(defaultPath ? { defaultPath } : {})
  };
}

// Like sf:importImage, both project handlers report failure as a value
// rather than a rejection: an ipcMain.handle rejection reaches the renderer
// with its message stripped, and "this file could not be read as a
// SignalForge project" is precisely the sentence that has to arrive.
//
// The path is chosen here and only here. The renderer hands over a document
// and gets a document back; it never constructs, passes or receives a
// filesystem path — only the leaf name, for the message on screen.
ipcMain.handle('sf:saveProject', async (_e, doc) => {
  try {
    const result = await projectDialogs.save(projectDialogOptions(suggestedProjectFileName(doc?.name)));
    if (result.canceled || !result.filePath) return { ok: false, canceled: true };
    // What arrived over IPC is whatever the renderer had in memory. Put it
    // through the one authority on document shape before it becomes a file,
    // so a saved project is always a project that can be opened again.
    writeFileAtomic(result.filePath, serializeProject(normalizeDocument(doc).doc));
    await rememberProjectFolder(result.filePath);
    return { ok: true, canceled: false, name: basename(result.filePath) };
  } catch (error) {
    return { ok: false, canceled: false, message: String(error.message || error) };
  }
});

ipcMain.handle('sf:openProject', async () => {
  try {
    const result = await projectDialogs.open({ ...projectDialogOptions(), properties: ['openFile'] });
    if (result.canceled || result.filePaths.length === 0) return { ok: false, canceled: true };
    const file = result.filePaths[0];
    // Reading and parsing come before anything is remembered or reported as
    // a success: an unreadable or foreign file must leave every last trace of
    // the session exactly as it was.
    const { doc, problems } = parseProject(readFileSync(file, 'utf8'));
    await rememberProjectFolder(file);
    return { ok: true, canceled: false, name: basename(file), document: doc, problems };
  } catch (error) {
    return { ok: false, canceled: false, message: String(error.message || error) };
  }
});

/**
 * The renderer gets no Node at all. Everything it needs arrives through the
 * enumerated bridge in preload.cjs — see app/preload.cjs.
 */
function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1040,
    minHeight: 700,
    show: false,
    backgroundColor: '#0b0d14',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(here, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  });
  win.once('ready-to-show', () => win.show());

  // Establish the process isolation boundary this whole app relies on: the
  // window may only ever show what we load into it. Block any attempt to
  // navigate it elsewhere (dropped files, pasted links, compromised content
  // later tasks render) and deny any attempt to spawn a new window/tab.
  win.webContents.on('will-navigate', (event) => { event.preventDefault(); });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  win.loadFile(join(here, 'renderer', 'index.html'));
  return win;
}

/**
 * A 4x4 PNG, one colour per quarter — the smallest thing that is a real,
 * decodable picture rather than a placeholder string, so the self-test below
 * exercises the genuine decode. Set SF_SELFTEST_IMAGE to a real image file to
 * put that through the actual importer instead, which is what the screenshots
 * for a human to look at are taken with.
 */
const SELFTEST_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAJ0lEQVR42mP4YGPzwcbG5kOFzYcKBhSOW94vt7xfv+7Y/Lpjg8IBAJkqGzE5EWVwAAAAAElFTkSuQmCC';

/**
 * Save and open, driven through the app's own footer buttons.
 *
 * Only the two file dialogs are replaced (see projectDialogs above): a modal
 * OS dialog would sit waiting for a human, and a test that waits for a human
 * is not a test. Everything else is the real thing — the real IPC handlers,
 * the real atomic write, the real parseProject, the real buttons being
 * clicked in the real window, the real picture being decoded.
 *
 * Deliberately asserts on the settings column's controls rather than on
 * rendered pixels: requestAnimationFrame does not tick in a window the
 * desktop is not actually showing, so a pixel check here would be a coin
 * toss. The screenshots (SF_SELFTEST_SHOTS) are where pixels get looked at.
 */
async function selfTestProjects(win) {
  const dir = mkdtempSync(join(tmpdir(), 'signalforge-selftest-'));
  const seedFile = join(dir, 'seed.sfx');
  const savedFile = join(dir, 'saved.sfx');
  const corruptFile = join(dir, 'corrupt.sfx');

  const imageFile = process.env.SF_SELFTEST_IMAGE;
  const asset = imageFile
    ? await prepareImageFile(imageFile)
    : { kind: 'image', mime: 'image/png', data: SELFTEST_PNG };

  // Every field a round trip has to carry, all of them away from their
  // defaults so a value that silently reverted would show up as a difference.
  const seed = normalizeDocument({
    name: 'Selftest', description: 'round trip', publisher: 'nobody',
    brightness: 42, saturation: 133, greenMagenta: -20, blueYellow: 15,
    layers: [{
      id: 'image', type: 'image', asset: 'image', name: 'the picture',
      fit: 'contain', opacity: 0.6, blend: 'screen', offset: { x: 0.25, y: -0.5 },
      motions: [{ kind: 'drift', speed: 7, amount: 66 }, { kind: 'breathe', speed: 88, amount: 12 }]
    }],
    assets: { image: asset }
  }).doc;
  writeFileSync(seedFile, serializeProject(seed), 'utf8');
  // Truncated mid-object: unreadable JSON, the commonest way a file goes bad.
  writeFileSync(corruptFile, '{"format": 1, "document": {"layers": [{"id": "ima', 'utf8');

  let saveTo = savedFile;
  let openFrom = seedFile;
  projectDialogs.save = async () => ({ canceled: false, filePath: saveTo });
  projectDialogs.open = async () => ({ canceled: false, filePaths: [openFrom] });

  const shotDir = process.env.SF_SELFTEST_SHOTS;
  const shoot = async (name) => {
    if (!shotDir) return;
    writeFileSync(join(shotDir, `${name}.png`), (await win.capturePage()).toPNG());
  };

  const read = (expression) => win.webContents.executeJavaScript(expression);
  const message = () => read(`document.querySelector('.drop-message').textContent`);
  const click = (index) => read(`document.querySelectorAll('#footer-body button')[${index}].click(), true`);
  /** The settings column's controls, by the ids field.js derives from the paths. */
  const controls = () => read(`({
    fit: document.getElementById('sf-layers-0-fit')?.value ?? null,
    motion0: document.getElementById('sf-layers-0-kind-0')?.value ?? null,
    motion1: document.getElementById('sf-layers-0-kind-1')?.value ?? null,
    speed0: document.getElementById('sf-layers-0-motions-0-speed')?.value ?? null,
    amount0: document.getElementById('sf-layers-0-motions-0-amount')?.value ?? null,
    brightness: document.getElementById('sf-brightness')?.value ?? null,
    saturation: document.getElementById('sf-saturation')?.value ?? null,
    greenMagenta: document.getElementById('sf-greenMagenta')?.value ?? null
  })`);

  // The click hands back before the bridge round trip and the picture decode
  // are done, so wait for the one line of feedback in the window to change.
  async function clickAndWait(index) {
    const before = await message();
    await click(index);
    for (let tries = 0; tries < 100; tries += 1) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      const now = await message();
      if (now !== before) return now;
    }
    throw new Error(`the window never reported anything after clicking footer button ${index}`);
  }

  const SAVE = 0;
  const OPEN = 1;
  const out = {};

  // boot() is asynchronous (language files, settings), so the footer may not
  // exist yet when the checks above have finished.
  for (let tries = 0; tries < 100; tries += 1) {
    if (await read(`document.querySelectorAll('#footer-body button').length === 2`)) break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  await shoot('01-empty');
  out.projectOpenedMessage = await clickAndWait(OPEN);
  out.projectOpenedControls = await controls();
  await shoot('02-opened');

  out.projectSavedMessage = await clickAndWait(SAVE);
  await shoot('03-saved');
  // The strongest statement available: a project written out of what the live
  // window is showing is byte for byte the project that was read into it.
  out.projectRoundTripIdentical =
    readFileSync(savedFile, 'utf8') === readFileSync(seedFile, 'utf8');

  openFrom = corruptFile;
  out.corruptProjectMessage = await clickAndWait(OPEN);
  out.corruptProjectWarned = await read(
    `document.querySelector('.drop-message').classList.contains('drop-warn')`
  );
  // Untouched means untouched: the settings column must still be showing the
  // project that was already open, not defaults and not a blank document.
  out.controlsAfterCorrupt = await controls();
  await shoot('04-corrupt');

  // The brightness slider stops at 5 on purpose (see RANGES in
  // components/inspector.js), but a document may carry less. An
  // <input type=range> shows the nearest end of its range for a value outside
  // it, so without widenToInclude this slider would sit at 5 and write 5 back
  // over the 3 in the file the moment anybody touched it. Only a real browser
  // can prove that clamping is gone; a plain node test cannot.
  const dimFile = join(dir, 'dim.sfx');
  writeFileSync(dimFile, serializeProject(normalizeDocument({
    ...seed, brightness: 3, layers: [{ ...seed.layers[0], fit: 'cover' }]
  }).doc), 'utf8');
  openFrom = dimFile;
  await clickAndWait(OPEN);
  out.dimBrightness = await read(`({
    value: document.getElementById('sf-brightness').value,
    min: document.getElementById('sf-brightness').min
  })`);

  // A document does not carry the size of its picture, so an opened project
  // has to have it measured again before the crop drag knows how much slack
  // there is. The cursor is the visible proof: 'grab' only appears where a
  // drag would actually do something (see restCursor in components/crop.js),
  // so a bare cursor here would mean the picture came back but could no
  // longer be moved.
  out.cursorOverPicture = await read(`(() => {
    const canvas = document.getElementById('preview-canvas');
    canvas.dispatchEvent(new PointerEvent('pointermove', { clientX: 10, clientY: 10, bubbles: true }));
    return canvas.style.cursor;
  })()`);

  if (shotDir) process.stdout.write(`self-test screenshots: ${shotDir}\n`);
  return out;
}

app.whenReady().then(async () => {
  settings = createSettings({
    file: join(app.getPath('userData'), 'settings.json'),
    readFile: (f) => readFileSync(f, 'utf8'),
    writeFile: writeFileAtomic
  });

  const win = createWindow();

  if (process.env.SF_SELFTEST === '1') {
    try {
      // Boot check for the test suite: prove the window came up, that the
      // renderer has the bridge but no Node, and that the navigation/popup
      // guards actually hold, then quit.
      await new Promise((resolve) => win.webContents.once('did-finish-load', resolve));
      const report = await win.webContents.executeJavaScript(
        `({ windowOpened: true, bridge: typeof window.sf === 'object',
            nodeInRenderer: typeof require === 'function' || typeof process === 'object' })`
      );

      const urlBeforeNav = win.webContents.getURL();
      win.webContents
        .executeJavaScript(`location.href = 'https://example.invalid/blocked'`)
        .catch(() => {});
      await new Promise((resolve) => setTimeout(resolve, 300));
      report.navigationBlocked = win.webContents.getURL() === urlBeforeNav;

      const windowCountBefore = BrowserWindow.getAllWindows().length;
      const openReturnedNull = await win.webContents.executeJavaScript(
        `window.open('https://example.invalid/popup') === null`
      );
      report.popupBlocked =
        openReturnedNull === true && BrowserWindow.getAllWindows().length === windowCountBefore;

      // Finding-2 regression guard: a File object a renderer script forges
      // itself (as opposed to one that came from a real OS drop) has no disk
      // backing, so webUtils.getPathForFile resolves it to '' in the
      // preload. Prove that reaches the user as the ordinary visible-error
      // shape, not a silent no-op, an unhandled rejection, or — if the ''
      // guard above ever regressed — an actual filesystem read.
      const forgedImportResult = await win.webContents.executeJavaScript(
        `window.sf.importImage(new File([], 'forged.png'))`
      );
      report.forgedFileImportRejected =
        forgedImportResult != null &&
        forgedImportResult.ok === false &&
        typeof forgedImportResult.message === 'string' &&
        forgedImportResult.message.length > 0;

      Object.assign(report, await selfTestProjects(win));

      process.stdout.write(JSON.stringify(report) + '\n');
      app.quit();
    } catch (err) {
      console.error('self-test failed:', err);
      app.exit(1);
    }
    return;
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => app.quit());
