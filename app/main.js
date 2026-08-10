// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  readFileSync, writeFileSync, readdirSync, mkdtempSync, mkdirSync, renameSync, unlinkSync,
  existsSync, statSync
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { createSettings, FALLBACK_LANGUAGE } from '../src/main/settings.js';
import {
  resolveEffectsTarget, SANDBOX_ENV, SANDBOX_REQUIRED_ENV, SANDBOX_MISSING_MESSAGE
} from '../src/main/effects-target.js';
import { prepareImageFile } from '../src/main/prepare-image.js';
import { serializeProject, parseProject, PROJECT_EXTENSION } from '../src/main/project.js';
import { exportEffect } from '../src/main/export-effect.js';
import { normalizeDocument } from '../src/engine/document.js';

const here = dirname(fileURLToPath(import.meta.url));

/**
 * The engine source an exported effect embeds — the very same bundle the
 * preview loads (see app/renderer/index.html), which is what makes the
 * preview a promise rather than an approximation.
 */
const ENGINE_BUNDLE = join(here, '..', 'dist', 'engine.bundle.js');

let settings;

/**
 * Where the app goes looking for SignalRGB's effects folder when the settings
 * do not name one. Normally the real Documents and home folders; under the
 * self-test, a throwaway directory instead — so a check of the "we found
 * nothing, ask the user" path cannot accidentally succeed by finding the
 * machine owner's actual SignalRGB installation, and so nothing the self-test
 * does can end up anywhere near it.
 */
let searchRoots = null;

/**
 * The self-test's own sandbox, set below once it has made its throwaway folder.
 * Any other harness names one in SF_EFFECTS_SANDBOX instead.
 */
let selfTestSandbox = null;

/**
 * The test-only circuit breaker around every effects-folder decision.
 *
 * The environment is read here, at call time, and never at module load: a
 * harness that imports app/main.js (test/harness/walkthrough.js does) can only
 * set variables after that import has already run, because ES imports are
 * hoisted above everything else in the importing file. Reading late is what
 * makes the gate reachable for those harnesses at all.
 *
 * Nothing here does anything unless SF_EFFECTS_SANDBOX_REQUIRED is set, which
 * only `npm test` sets. Ordinary use of the app is untouched.
 */
function sandbox() {
  return {
    sandboxRoot: selfTestSandbox || process.env[SANDBOX_ENV] || null,
    sandboxRequired: process.env[SANDBOX_REQUIRED_ENV] === '1'
  };
}

function currentTarget() {
  return resolveEffectsTarget({
    settings,
    documentsPath: searchRoots ? searchRoots.documents : app.getPath('documents'),
    homePath: searchRoots ? searchRoots.home : homedir(),
    exists: (p) => existsSync(p),
    ...sandbox()
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

/**
 * The folder dialog, behind the same seam as the two project dialogs below
 * and for the same reason: an automated check that opened a real one would sit
 * there until a human clicked something. Only the self-test replaces it.
 */
export const folderDialog = {
  open: (options) => dialog.showOpenDialog(options)
};

ipcMain.handle('sf:chooseFolder', async () => {
  const result = await folderDialog.open({ properties: ['openDirectory'] });
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
export const projectDialogs = {
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
 * The filesystem exportEffect writes through.
 *
 * writeFileAtomic is reused deliberately: an effects folder is watched live
 * by SignalRGB (docs/erkenntnisse-signalrgb-motor.md — a new file appears in
 * its list at once, no restart), so a half-written file would be picked up
 * half-written. Temp file plus rename means SignalRGB only ever sees a
 * finished effect.
 */
const exportIo = {
  exists: (path) => existsSync(path),
  mkdir: (folder) => mkdirSync(folder, { recursive: true }),
  writeFile: (path, text) => writeFileAtomic(path, text),
  size: (path) => statSync(path).size
};

/**
 * Write the effect the window is showing into SignalRGB's own folder.
 *
 * The renderer hands over a document and a single boolean, and nothing else.
 * Which folder is written to is decided here, from resolveEffectsTarget or
 * from the folder dialog behind sf:chooseFolder — there is no parameter on
 * this channel a renderer could put a path into, so this cannot be turned
 * into "write anything anywhere". The full path travels back for the window
 * to show, because the overwrite question and the "it is here" message are
 * both worthless without it; being able to READ a path is not being able to
 * CHOOSE one.
 *
 * Same as the other handlers: failure comes back as a value, because an
 * ipcMain.handle rejection reaches the renderer with its message stripped.
 */
ipcMain.handle('sf:exportEffect', async (_e, doc, options) => {
  try {
    const target = currentTarget();
    if (!target.folder) return { ok: false, reason: 'folder' };
    if (!existsSync(ENGINE_BUNDLE)) {
      return { ok: false, reason: 'failed', message: 'dist/engine.bundle.js is missing. Run: npm run build:engine' };
    }
    return exportEffect({
      doc,
      folder: target.folder,
      engineSource: readFileSync(ENGINE_BUNDLE, 'utf8'),
      // The finished effect's controls are labelled in the language the app
      // is being used in, so what SignalRGB shows matches what the window did.
      // The window writes its chosen language into the settings on its very
      // first boot, so this is only ever empty if that write failed — in which
      // case falling back to English (buildEffectHtml's own default) would
      // silently hand a German user an English effect.
      lang: settings.get('language') || FALLBACK_LANGUAGE,
      force: options?.force === true,
      io: exportIo
    });
  } catch (error) {
    return { ok: false, reason: 'failed', message: String(error.message || error) };
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
 * Working the real window from the outside: read something out of it, click
 * one of its buttons, wait for it to say something back, take its picture.
 *
 * Shared by both self-tests below so they drive the app the same way, and so
 * "wait for the one line of feedback to change" is written once. A click
 * hands back long before the bridge round trip, the picture decode or the
 * file write are done, which is why nothing here is allowed to assume the
 * work is finished when click() returns.
 */
function windowDriver(win) {
  const shotDir = process.env.SF_SELFTEST_SHOTS;
  const read = (expression) => win.webContents.executeJavaScript(expression);
  const message = () => read(`document.querySelector('.drop-message').textContent`);
  // By id, not by position in the row: a check that finds the save button by
  // being "the first one" breaks every time a button is added beside it.
  const click = (id) => read(`document.getElementById('${id}').click(), true`);

  return {
    read,
    message,
    click,
    async shoot(name) {
      if (!shotDir) return;
      // capturePage() hands back the last frame the compositor actually
      // painted, and a change made by the line above this one has only reached
      // the DOM, not the screen — without waiting for a paint the picture
      // shows the state BEFORE the thing it is meant to be evidence of. Two
      // frames, because the first only gets as far as scheduling the paint.
      await read(`new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))`);
      writeFileSync(join(shotDir, `${name}.png`), (await win.capturePage()).toPNG());
    },
    async clickAndWait(id) {
      const before = await message();
      await click(id);
      for (let tries = 0; tries < 100; tries += 1) {
        await new Promise((resolve) => setTimeout(resolve, 50));
        const now = await message();
        if (now !== before) return now;
      }
      throw new Error(`the window never reported anything after clicking #${id}`);
    }
  };
}

/** Poll until `expression` is true in the window, or give up after ~5 s. */
async function waitFor(read, expression, what) {
  for (let tries = 0; tries < 100; tries += 1) {
    if (await read(expression)) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`the window never reached: ${what}`);
}

/**
 * The first start, driven in the real window.
 *
 * Two things happen exactly once in the life of an installation and are
 * therefore the easiest to get wrong and never notice again: the app has no
 * effects folder and has to ask for it, and nobody has chosen a language so
 * the machine's own has to decide. Both are checked here, on a settings file
 * that genuinely does not exist yet (see app.whenReady below) and with the
 * search for an existing SignalRGB installation pointed at a throwaway folder,
 * so "found nothing" is a fact rather than an accident of this machine.
 *
 * Only the folder dialog is replaced, for the same reason the two project
 * dialogs are: a modal OS dialog would sit waiting for a human.
 */
async function selfTestFirstRun(win, effectsFolder) {
  const { read, click, shoot } = windowDriver(win);
  const out = {};

  await waitFor(read, `document.getElementById('first-run') !== null`, 'the window is built');

  out.firstRunShown = await read(`document.getElementById('first-run').hidden === false`);
  out.firstRunAsks = await read(`document.querySelector('#first-run button').textContent`);
  // The rest of the window must stay usable while the question is on screen —
  // that is the whole difference between a panel and a modal assistant.
  out.firstRunLeavesTheAppUsable = await read(
    `document.getElementById('footer-export').disabled === false`
  );
  await shoot('00-first-run');

  // The language nobody chose. It has to be one the app actually speaks, it
  // has to be reflected on the document element, and it has to be written back
  // so the next start no longer depends on the machine's setting.
  out.navigatorLanguage = await read(`navigator.language`);
  out.documentLanguage = await read(`document.documentElement.lang`);
  // executeJavaScript evaluates a plain script, where top-level await is not
  // allowed — but it does resolve a promise the script hands back, so every
  // bridge call here is written as .then().
  await waitFor(read, `window.sf.settings.all().then((s) => s.language !== '')`, 'the language is stored');
  out.storedLanguage = await read(`window.sf.settings.all().then((s) => s.language)`);

  /** The language switch in the footer, operated the way a person operates it. */
  const chooseLanguage = async (code) => {
    await read(`(() => {
      const select = document.getElementById('footer-language');
      select.value = ${JSON.stringify(code)};
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return select.value;
    })()`);
    return read(`({
      layers: document.getElementById('layers-title').textContent,
      settings: document.getElementById('inspector-title').textContent,
      exportButton: document.getElementById('footer-export').textContent,
      brightness: document.querySelector('label[for="sf-brightness"]').textContent,
      hint: document.querySelector('.drop-message').textContent,
      firstRun: document.querySelector('#first-run h2').textContent,
      documentLanguage: document.documentElement.lang
    })`);
  };

  out.inGerman = await chooseLanguage('de');
  await shoot('00b-language-de');
  out.inEnglish = await chooseLanguage('en');
  await shoot('00c-language-en');
  out.backInGerman = await chooseLanguage('de');
  // A chosen language is only chosen if it is still there after a restart.
  await waitFor(
    read,
    `window.sf.settings.all().then((s) => s.language === 'de')`,
    'the chosen language is stored'
  );

  // And the answer to the question. The folder dialog is the stub; everything
  // else is the real handler writing a real settings file.
  folderDialog.open = async () => ({ canceled: false, filePaths: [effectsFolder] });
  await click('first-run-choose');
  await waitFor(read, `document.getElementById('first-run').hidden === true`, 'the question is answered');
  out.targetAfterChoosing = await read(`document.getElementById('footer-target').textContent`);
  await shoot('00d-folder-chosen');

  return out;
}

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
  const smuggledFile = join(dir, 'smuggled.sfx');

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
  // Review finding: a shared .sfx whose asset names a `file` instead of
  // embedding it would have had the renderer's image loader try to resolve
  // an attacker-chosen path the moment the project opened. Written as raw
  // JSON, not through serializeProject/normalizeDocument — those would
  // normalize the asset shape away, which is exactly not what a foreign file
  // arriving over the open dialog looks like.
  writeFileSync(smuggledFile, JSON.stringify({
    format: 1,
    document: { ...seed, assets: { image: { kind: 'image', mime: 'image/png', file: 'C:/Windows/win.ini' } } }
  }), 'utf8');

  let saveTo = savedFile;
  let openFrom = seedFile;
  projectDialogs.save = async () => ({ canceled: false, filePath: saveTo });
  projectDialogs.open = async () => ({ canceled: false, filePaths: [openFrom] });

  const { read, message, click, clickAndWait, shoot } = windowDriver(win);
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

  const SAVE = 'footer-save';
  const OPEN = 'footer-open';
  const out = {};

  // boot() is asynchronous (language files, settings), so the footer may not
  // exist yet when the checks above have finished.
  for (let tries = 0; tries < 100; tries += 1) {
    if (await read(`document.getElementById('${OPEN}') !== null`)) break;
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

  openFrom = smuggledFile;
  out.smuggledFileMessage = await clickAndWait(OPEN);
  out.smuggledFileWarned = await read(
    `document.querySelector('.drop-message').classList.contains('drop-warn')`
  );
  // Same untouched guarantee as the corrupt-file case above: a project
  // trying to smuggle an outside file reference must leave the window
  // showing exactly the project that was already open.
  out.controlsAfterSmuggled = await controls();
  await shoot('05-smuggled');

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

  return out;
}

/**
 * Export, driven through the app's own footer.
 *
 * Nothing here is stubbed. There is no dialog to replace: the target folder
 * comes from resolveEffectsTarget reading the settings, and the self-test's
 * settings live in a throwaway folder of their own (see app.whenReady below),
 * pointed at a throwaway Effects folder. That is the whole trick — the real
 * IPC handler, the real control list, the real buildEffectHtml, the real
 * atomic write, into a directory nobody cares about. A test must never
 * install anything into the SignalRGB folder the machine's owner actually
 * uses, and this one provably cannot: the path it wrote comes back in the
 * report for the check in test/app/boot.test.js to look at.
 */
async function selfTestExport(win, folder) {
  const { read, message, clickAndWait, shoot } = windowDriver(win);
  const out = { exportFolder: folder };

  const EXPORT = 'footer-export';
  const OVERWRITE = 'footer-overwrite';

  /** Type into the name field the way a person does, event and all. */
  const setName = (text) => read(`(() => {
    const field = document.getElementById('footer-name');
    field.value = ${JSON.stringify(text)};
    field.dispatchEvent(new Event('input', { bubbles: true }));
    return field.value;
  })()`);

  const overwriteOffered = () => read(`document.getElementById('${OVERWRITE}').hidden === false`);

  out.targetShown = await read(`document.getElementById('footer-target').textContent`);

  // The project left open by selfTestProjects carries brightness 3, which
  // would export as an effect nobody can see. Turning it back up with the
  // app's own slider is also the proof that an export carries what the
  // settings column currently says: the number that ends up in the written
  // file is checked against this one below.
  out.brightnessBeforeExport = await read(`(() => {
    const slider = document.getElementById('sf-brightness');
    slider.value = '100';
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    return slider.value;
  })()`);

  await setName('Selftest Export');
  out.exportedMessage = await clickAndWait(EXPORT);
  out.exportedFiles = readdirSync(folder);
  // Read straight out of the file that was written: the brightness control's
  // advertised default has to be the value the slider was standing at.
  out.exportedBrightnessDefault = /<meta property="brightness"[^>]*default="([^"]*)"/
    .exec(readFileSync(join(folder, 'Selftest Export.html'), 'utf8'))?.[1] ?? null;
  await shoot('06-exported');

  // Exporting the same name again must ask, not overwrite. The question has
  // to name the full path and the answer has to be a button somebody presses
  // on purpose.
  out.existsMessage = await clickAndWait(EXPORT);
  out.existsWarned = await read(`document.querySelector('.drop-message').classList.contains('drop-warn')`);
  out.overwriteOffered = await overwriteOffered();
  await shoot('07-overwrite-question');

  // Written before the answer, so "the file changed" below is a fact about
  // the overwrite and not about the first export.
  const target = join(folder, 'Selftest Export.html');
  writeFileSync(target, 'the effect that was already there', 'utf8');
  out.overwrittenMessage = await clickAndWait(OVERWRITE);
  out.overwriteReplacedTheFile = readFileSync(target, 'utf8').includes('SignalForgeEngine');
  out.overwriteWithdrawn = !(await overwriteOffered());
  await shoot('08-overwritten');

  // A name made only of path separators must be refused out loud, and must
  // not have quietly become a folder, a drive or a file somewhere else.
  await setName('///');
  out.badNameMessage = await clickAndWait(EXPORT);
  out.filesAfterBadName = readdirSync(folder);
  await shoot('09-bad-name');

  // And a name that IS usable but full of characters a path is made of has
  // to land in this folder under a plain file name.
  await setName('a/b:c?d');
  out.sanitisedMessage = await clickAndWait(EXPORT);
  out.filesAfterSanitised = readdirSync(folder);
  // The name field must be left showing what actually landed on disk, not
  // the raw text that was typed — see the "sanitised name echoed back" check
  // in test/app/boot.test.js.
  out.nameFieldAfterSanitised = await read(`document.getElementById('footer-name').value`);
  await shoot('10-sanitised-name');

  return out;
}

app.whenReady().then(async () => {
  const selfTest = process.env.SF_SELFTEST === '1';
  // The self-test keeps its settings, and its effects folder, in a throwaway
  // directory. Two reasons, both of them about not touching the machine this
  // runs on: a test must not rewrite the settings of the app its owner
  // actually uses, and the effects folder it exports into must provably not
  // be the real SignalRGB one.
  const selfTestDir = selfTest ? mkdtempSync(join(tmpdir(), 'signalforge-selftest-run-')) : null;
  const selfTestEffects = selfTest ? join(selfTestDir, 'Effects') : null;
  if (selfTest) mkdirSync(selfTestEffects, { recursive: true });
  if (selfTest) selfTestSandbox = selfTestDir;

  // The circuit breaker, checked before a window exists and therefore before
  // anything at all can be exported. A harness that redirects userData and
  // stops there — the exact mistake that once put two files in the machine
  // owner's real SignalRGB folder — dies here with a message naming the fix,
  // instead of quietly searching the real Documents folder and finding it.
  const { sandboxRoot, sandboxRequired } = sandbox();
  if (sandboxRequired && !sandboxRoot) {
    process.stderr.write(`${SANDBOX_MISSING_MESSAGE}\n`);
    app.exit(1);
    return;
  }

  settings = createSettings({
    file: join(selfTest ? selfTestDir : app.getPath('userData'), 'settings.json'),
    readFile: (f) => readFileSync(f, 'utf8'),
    writeFile: writeFileAtomic
  });
  // The effects folder is deliberately NOT seeded: the self-test starts from a
  // settings file that does not exist, so it goes through the genuine first
  // start — no folder found, the window asks, the answer is given through the
  // real sf:chooseFolder handler (see selfTestFirstRun). Pointing the search
  // for an existing installation at the throwaway directory is what makes
  // "found nothing" a fact rather than an accident of the machine this runs on,
  // and is a second guarantee that nothing here can reach the real SignalRGB
  // folder even if a later change stopped setting one.
  if (selfTest) searchRoots = { documents: selfTestDir, home: selfTestDir };

  const win = createWindow();

  if (selfTest) {
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

      Object.assign(report, await selfTestFirstRun(win, selfTestEffects));
      Object.assign(report, await selfTestProjects(win));
      Object.assign(report, await selfTestExport(win, selfTestEffects));

      const shotDir = process.env.SF_SELFTEST_SHOTS;
      if (shotDir) process.stdout.write(`self-test screenshots: ${shotDir}\n`);
      process.stdout.write(`self-test effects folder: ${selfTestEffects}\n`);
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
