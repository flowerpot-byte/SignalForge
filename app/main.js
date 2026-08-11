// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, readdirSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { writeFileAtomic } from '../src/main/write-file-atomic.js';
import { homedir } from 'node:os';
import { createSettings, FALLBACK_LANGUAGE } from '../src/main/settings.js';
import {
  resolveEffectsTarget, SANDBOX_ENV, SANDBOX_REQUIRED_ENV, SANDBOX_MISSING_MESSAGE
} from '../src/main/effects-target.js';
import { SINGLE_INSTANCE_TEST_ENV } from '../src/main/single-instance.js';
import { prepareImageFile } from '../src/main/prepare-image.js';
import { serializeProject, parseProject, PROJECT_EXTENSION } from '../src/main/project.js';
import { exportEffect } from '../src/main/export-effect.js';
import {
  listEffects, findEffect, effectPath, coverPath, MAX_EFFECT_BYTES, oversizedMessage
} from '../src/main/effects-library.js';
import { readEffectDocument } from '../src/main/effect-document.js';
import { renderCoverPng } from '../src/main/cover-image.js';
import { normalizeDocument } from '../src/engine/document.js';

const here = dirname(fileURLToPath(import.meta.url));

/**
 * The engine source an exported effect embeds — the very same bundle the
 * preview loads (see app/renderer/index.html), which is what makes the
 * preview a promise rather than an approximation.
 */
const ENGINE_BUNDLE = join(here, '..', 'dist', 'engine.bundle.js');

/**
 * The one place every colour in this project lives.
 *
 * The window is created with a background colour so the first paint is the
 * app's own dark rather than a white flash, and that colour is --bg-base —
 * the very same one the stylesheet gives the page. Writing the value here as
 * well would be a second copy of it in a project whose rule is that colours
 * exist once (test/app/color-literals.test.js enforces that rule over this
 * file too), and the renderer already reads its backdrop seeds out of this
 * same file rather than repeating them. So: read it.
 *
 * A missing or unreadable token yields null and the window is simply created
 * without the hint — a white flash on startup is not worth refusing to start
 * over.
 */
const TOKENS_CSS = join(here, 'renderer', 'styles', 'tokens.css');

function backgroundFromTokens() {
  try {
    return /--bg-base:\s*([^;]+);/.exec(readFileSync(TOKENS_CSS, 'utf8'))?.[1].trim() || null;
  } catch {
    return null;
  }
}

let settings;

/**
 * Where the app goes looking for SignalRGB's effects folder when the settings
 * do not name one: the real Documents and home folders — behind a seam, for
 * the same reason the dialogs below are.
 *
 * A harness that lets the search run over the real machine cannot honestly
 * check the "we found nothing, ask the user" path: it succeeds or fails
 * depending on whether whoever is running it happens to have SignalRGB
 * installed. test/harness/selftest.js points both entries at a throwaway
 * directory, which makes "found nothing" a fact, and is a second guarantee —
 * on top of the sandbox below — that a test can never end up anywhere near a
 * real installation.
 */
export const searchRoots = {
  documents: () => app.getPath('documents'),
  home: () => homedir()
};

/**
 * The test-only circuit breaker around every effects-folder decision.
 *
 * The environment is read here, at call time, and never at module load: a
 * harness that imports app/main.js (test/harness/selftest.js and
 * test/harness/walkthrough.js both do) can only set variables after that
 * import has already run, because ES imports are hoisted above everything else
 * in the importing file. Reading late is what makes the gate reachable for
 * those harnesses at all.
 *
 * Nothing here does anything unless a sandbox is named, and
 * SF_EFFECTS_SANDBOX_REQUIRED is only ever set by `npm test`. Ordinary use of
 * the app is untouched.
 */
function sandbox() {
  return {
    sandboxRoot: process.env[SANDBOX_ENV] || null,
    sandboxRequired: process.env[SANDBOX_REQUIRED_ENV] === '1'
  };
}

function currentTarget() {
  return resolveEffectsTarget({
    settings,
    documentsPath: searchRoots.documents(),
    homePath: searchRoots.home(),
    exists: (p) => existsSync(p),
    ...sandbox()
  });
}

/**
 * The settings the window is allowed to change by itself.
 *
 * The language, and nothing else. It is the window's own choice, made in the
 * footer, and it names no file.
 *
 * The other two settings are filesystem paths, and this project has exactly
 * one rule about those: the renderer never constructs or supplies one. It is
 * what makes the bridge reviewable — every handler can be read as "the path is
 * decided here". sf:exportEffect resolves the folder it writes into from
 * `effectsFolder`, so leaving that key writable from the window would have
 * handed the renderer a folder of its choosing and, with `force`, an existing
 * file of its choosing to overwrite. Nothing legitimate is lost: `effectsFolder`
 * is written only by sf:chooseFolder (from the folder dialog) and
 * `lastProjectFolder` only by rememberProjectFolder (from the path a file
 * dialog returned), both of them here in the main process.
 */
const RENDERER_SETTINGS = new Set(['language']);

ipcMain.handle('sf:version', () => app.getVersion());
ipcMain.handle('sf:settings:all', () => settings.all());
ipcMain.handle('sf:settings:set', async (_e, key, value) => {
  // A rejection, not a returned value: unlike the import/project/export
  // handlers, no message from here is ever meant to reach a user. The window
  // asks for exactly one setting, so anything else is a bug in the window (or
  // something that is not the window at all), and the renderer's own
  // `remember()` already turns a rejection into its visible line.
  if (!RENDERER_SETTINGS.has(key)) {
    throw new Error(`the window may not change the setting: ${key}`);
  }
  await settings.set(key, value);
  return settings.all();
});
ipcMain.handle('sf:effectsTarget', () => currentTarget());

/**
 * The folder dialog, behind the same seam as the two project dialogs below
 * and for the same reason: an automated check that opened a real one would sit
 * there until a human clicked something. Only the harnesses in test/harness
 * replace it.
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
 * clicked something. test/harness/selftest.js replaces these two entries so it
 * can drive the genuine save/open path — same IPC handlers, same atomic write,
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

/**
 * The three ways out of the unsaved-changes question, in the order their
 * buttons appear.
 *
 * Exported because a harness that stubs the question below has to be able to
 * answer it by ROLE rather than by a number typed out a second time: an
 * answer given as `DISCARD_ANSWERS.indexOf('cancel')` still means "cancel"
 * after somebody reorders the buttons, and a hard-coded 2 quietly starts
 * meaning something else.
 */
export const DISCARD_ANSWERS = Object.freeze(['save', 'discard', 'cancel']);

/**
 * The question that stands between a user's unsaved work and the thing that
 * would throw it away, behind the same kind of seam as the three dialogs
 * above and for the same reason: an automated check that opened a real one
 * would sit there until a human clicked something.
 */
export const discardDialog = {
  ask: (win, options) => (win ? dialog.showMessageBox(win, options) : dialog.showMessageBox(options))
};

/**
 * Ask before unsaved work is thrown away.
 *
 * Deliberately a native, window-modal message box rather than a panel in the
 * window, which is otherwise this project's register (the first-start question
 * is a panel on purpose, and the export's overwrite question is a button on
 * the one line of feedback). Three reasons, in order of weight:
 *
 *  - It has to block. A panel the user can ignore while carrying on editing
 *    is a question whose answer is out of date by the time it is given; this
 *    one stands in front of an action that destroys work.
 *  - It is the second half of a pair. Pressing "open project" already leads
 *    to a modal OS file dialog, so asking here keeps one gesture in one
 *    register instead of switching between a panel and an OS window.
 *  - The renderer must not become the place where destructive choices are
 *    styled — and, practically, this window's visuals are about to be rebuilt,
 *    so a question that lives entirely out here survives that untouched.
 *
 * Every word of it comes from the window, which is where the language lives
 * (app/renderer/i18n/{de,en}.json). Nothing is spelled out here in either
 * language; a missing label is a bug in the window and is refused as one,
 * which fails safe — the renderer's guard turns the rejection into its
 * visible line and the project stays open.
 */
ipcMain.handle('sf:confirmDiscard', async (event, texts) => {
  const buttons = DISCARD_ANSWERS.map((answer) => String(texts?.[answer] ?? '').trim());
  if (buttons.some((label) => label === '')) {
    throw new Error('the unsaved-changes question needs a label for each of its three answers');
  }
  // Cancel is what Escape does, what closing the dialog does, and what a
  // reflex press of Enter does: the only answer that changes nothing is the
  // only one that can happen by accident.
  const cancel = DISCARD_ANSWERS.indexOf('cancel');
  const { response } = await discardDialog.ask(BrowserWindow.fromWebContents(event.sender), {
    type: 'warning',
    buttons,
    defaultId: cancel,
    cancelId: cancel,
    // Windows would otherwise turn three buttons into command links, which
    // reads as a wizard rather than as a question with three answers.
    noLink: true,
    title: String(texts?.title ?? ''),
    message: String(texts?.title ?? ''),
    detail: String(texts?.body ?? '')
  });
  // An out-of-range answer can only come from a stub; treat anything
  // unrecognised as the safe one rather than as permission to discard.
  return DISCARD_ANSWERS[response] ?? 'cancel';
});

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
  // The tile picture, through the very same atomic write and for the very
  // same reason — SignalRGB must never read a half-written PNG out of a
  // folder it is watching.
  writeBinary: (path, bytes) => writeFileAtomic(path, bytes),
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
      io: exportIo,
      // Drawn here in the main process, in a window nobody sees, from the
      // document that is being written. Deliberately NOT sent over from the
      // renderer as bytes: the window's own canvas is scaled for the screen
      // and its frame is wherever the live preview happens to have got to,
      // while this is the effect's first frame at the tile's own size. The
      // renderer stays out of file business entirely, as it must.
      renderCover: (document_) => renderCoverPng(document_)
    });
  } catch (error) {
    return { ok: false, reason: 'failed', message: String(error.message || error) };
  }
});

// ---------------------------------------------------------------------------
// The effect library: the effects folder, read back.
// ---------------------------------------------------------------------------

/**
 * The filesystem the library reads through — the counterpart of exportIo above,
 * and read-only on purpose. Nothing on the three library channels writes
 * anything: reopening an effect must not be able to change one.
 */
const libraryIo = {
  list: (folder) => readdirSync(folder),
  read: (path) => { refuseOversized(path); return readFileSync(path, 'utf8'); },
  stat: (path) => {
    const info = statSync(path);
    return { size: info.size, modified: info.mtimeMs };
  },
  exists: (path) => existsSync(path)
};

/**
 * Throw rather than read a file too large to be one of ours.
 *
 * EVERY read on the library path is synchronous and on the main thread, and
 * the effects folder is a folder other programs write into (see
 * MAX_EFFECT_BYTES in src/main/effects-library.js for the size and how it was
 * arrived at). listEffects already steps over an oversized file without
 * reading it; this is the same bound at the two handlers that read a named
 * file directly — the cover and the open — so no route into readFileSync on
 * this path is unbounded.
 *
 * It stats and then reads, which is a window in which the file could grow. It
 * is not a hole worth chasing: the file would have to be replaced by a larger
 * one in that instant, and the outcome would be one slow read rather than a
 * wrong document. Nothing here decides anything but how many bytes to accept.
 */
function refuseOversized(path) {
  const { size } = statSync(path);
  if (size > MAX_EFFECT_BYTES) throw new Error(oversizedMessage(size));
  return null;
}

/**
 * What has already been decided about a file, against that file's own size and
 * modification time: whether it is one of ours (see listEffects), and the tile
 * picture that was drawn for it if it had none of its own.
 *
 * A cache and not a store: every entry names the exact bytes it was derived
 * from, so a file that changes on disk invalidates its own entry without
 * anybody having to watch for it. It is what makes refreshing the library on
 * every window focus cost nothing on a folder nobody has touched.
 */
const libraryCache = new Map();
const renderedCovers = new Map();

/**
 * Drawing a tile picture needs a window of its own (see src/main/cover-image.js),
 * so the covers a library refresh asks for are drawn ONE AT A TIME. A strip of
 * twelve tiles asking at once would otherwise open twelve hidden windows at
 * once, on the same machine that is trying to render the preview.
 */
let coverQueue = Promise.resolve();
const queueCover = (work) => {
  const next = coverQueue.then(work, work);
  // Never let a rejection poison the chain for everything queued behind it.
  coverQueue = next.then(() => {}, () => {});
  return next;
};

ipcMain.handle('sf:library:list', () => {
  try {
    const target = currentTarget();
    const { entries, skipped } = listEffects({
      folder: target.folder, io: libraryIo, cache: libraryCache
    });
    // Deliberately no path: the window shows names and asks for names. It is
    // told WHETHER there is a folder at all, because an empty strip means two
    // different things ("no folder chosen yet" and "nothing exported yet") and
    // the strip has to be able to say which.
    return { ok: true, hasFolder: Boolean(target.folder), entries, skipped };
  } catch (error) {
    return { ok: false, message: String(error.message || error), entries: [], skipped: 0 };
  }
});

/**
 * The picture on a library tile, as PNG bytes.
 *
 * Two sources, in this order:
 *
 *  - the .png beside the effect, which is what every export since tile pictures
 *    existed has written (src/main/export-effect.js). Read, not redrawn: it is
 *    the very picture SignalRGB is showing for that effect, so the strip and
 *    SignalRGB's own list agree by construction.
 *  - failing that, the effect's own first frame, drawn here through the SAME
 *    cover pipeline the export uses (renderCoverPng), in a window nobody sees.
 *    That is what gives the effects made before tile pictures existed a real
 *    picture instead of an empty rectangle — and it is a real picture of what
 *    the effect does, because it comes from the effect's own document.
 *
 * The drawn one is kept in memory for the session and deliberately NOT written
 * to disk: the library only reads. Somebody's effects folder gaining files
 * because they looked at a strip of tiles would be this app doing something
 * nobody asked it to do, and one more export of that effect writes the very
 * same picture anyway, on purpose, at a moment the user chose.
 */
ipcMain.handle('sf:library:cover', async (_e, file) => {
  try {
    const target = currentTarget();
    const entry = findEffect({ folder: target.folder, file, io: libraryIo, cache: libraryCache });
    if (!entry) return { ok: false };

    const path = effectPath(target.folder, entry);
    const onDisk = coverPath(target.folder, entry);
    if (onDisk) {
      // The .png is a foreign file too — it sits in the same folder and this
      // app never wrote most of them. A tile picture is a few hundred KB; the
      // same bound the effect itself is held to is far more than generous.
      refuseOversized(onDisk);
      return { ok: true, png: readFileSync(onDisk).toString('base64'), drawn: false };
    }

    const key = `${path}|${entry.bytes}|${entry.modified}`;
    const remembered = renderedCovers.get(path);
    if (remembered?.key === key) return { ok: true, png: remembered.png, drawn: true };

    refuseOversized(path);
    const { doc } = readEffectDocument(readFileSync(path, 'utf8'));
    const png = (await queueCover(() => renderCoverPng(doc))).toString('base64');
    renderedCovers.set(path, { key, png });
    return { ok: true, png, drawn: true };
  } catch (error) {
    // A tile with no picture is a tile; it is not worth a message in the
    // window, and the strip has a resting state for exactly this.
    console.error('could not produce a tile picture:', error);
    return { ok: false };
  }
});

/**
 * Open an effect out of the library.
 *
 * The renderer hands over a leaf name it was given by sf:library:list and gets
 * a document back — the same shape as sf:openProject, and for the same reason:
 * it never learns a path and cannot name one. findEffect only ever matches a
 * name against a fresh listing of the folder, so nothing the window says can
 * become a path of its own (see src/main/effects-library.js).
 *
 * Failure comes back as a value, because an ipcMain.handle rejection reaches
 * the renderer with its message stripped, and the message is the whole point:
 * "this file is not a SignalForge effect" is a sentence somebody has to read.
 */
ipcMain.handle('sf:library:open', (_e, file) => {
  try {
    const target = currentTarget();
    const entry = findEffect({ folder: target.folder, file, io: libraryIo, cache: libraryCache });
    if (!entry) return { ok: false, message: 'that effect is no longer in the effects folder.' };
    const path = effectPath(target.folder, entry);
    refuseOversized(path);
    const { doc, problems } = readEffectDocument(readFileSync(path, 'utf8'));
    return { ok: true, file: entry.file, name: entry.name, document: doc, problems };
  } catch (error) {
    return { ok: false, message: String(error.message || error) };
  }
});

/**
 * The renderer gets no Node at all. Everything it needs arrives through the
 * enumerated bridge in preload.cjs — see app/preload.cjs.
 */
/**
 * Whether a window this process opens is shown as soon as it can paint.
 *
 * A seam, and the same kind as `folderDialog`, `projectDialogs` and
 * `searchRoots` above: a harness sets it in its own top-level code, which runs
 * after this module's top level and before `app.whenReady` fires.
 *
 * It exists for one reason. Photographing the window is how this app's look is
 * checked, and until now every photograph meant a real window appearing in
 * front of whoever is using the machine — several of them, one per harness
 * run. A window that is never shown can still be loaded, driven and captured
 * (`webContents.capturePage`), so nothing about the checking is weakened by
 * this; only the interruption goes away. Nothing in the app itself ever sets
 * it: the default is, and must stay, `true`.
 */
export const windowDisplay = { show: true };

function createWindow() {
  const background = backgroundFromTokens();
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1040,
    minHeight: 700,
    show: false,
    ...(background ? { backgroundColor: background } : {}),
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(here, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  });
  win.once('ready-to-show', () => { if (windowDisplay.show) win.show(); });

  // Establish the process isolation boundary this whole app relies on: the
  // window may only ever show what we load into it. Block any attempt to
  // navigate it elsewhere (dropped files, pasted links, compromised content
  // later tasks render) and deny any attempt to spawn a new window/tab.
  win.webContents.on('will-navigate', (event) => { event.preventDefault(); });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  win.loadFile(join(here, 'renderer', 'index.html'));
  return win;
}

app.whenReady().then(() => {
  // Refuse to become a second running copy of the app. Two windows sharing
  // one settings.json (src/main/settings.js reads it once and keeps it in
  // memory) means the last one to write wins — a language choice or a chosen
  // effects folder from the other window vanishes without a word.
  //
  // Skipped only under SINGLE_INSTANCE_TEST_ENV (see src/main/single-instance.js):
  // app.requestSingleInstanceLock() is scoped to Electron's own userData
  // directory, which almost none of this project's harnesses redirect, so
  // left armed during a test run every self-test spawn would be fighting a
  // real running copy of the app, or each other, over the very same lock.
  //
  // This check runs from inside whenReady, not before it, on purpose. It
  // means a losing second instance pays for Electron's own startup before it
  // finds out it should quit, but createWindow() below is still the first
  // thing that could ever show a window, so nothing is shown either way.
  // What that ordering buys: the harnesses in test/harness redirect userData
  // (app.setPath) in their OWN top-level code, which runs AFTER importing
  // app/main.js has already run this module's top level — so a lock taken
  // any earlier than this would be taken out on the wrong (default) userData
  // directory, the one a real installed copy of the app uses.
  //
  // Nothing in this handler awaits, deliberately: a harness that imports this
  // module registers its own whenReady callback after this one, and a callback
  // on an already-resolved promise runs in registration order — so this one
  // finishes, window and all, before the harness's begins. An await here would
  // hand the harness a window that does not exist yet.
  if (process.env[SINGLE_INSTANCE_TEST_ENV] !== '1') {
    const gotLock = app.requestSingleInstanceLock();
    if (!gotLock) {
      // Another copy already holds the lock; it is the one that gets this
      // launch's attempt via 'second-instance' below. Quit before doing
      // anything this process would otherwise do next — no settings file is
      // read or written, and createWindow() is never reached.
      app.quit();
      return;
    }
    app.on('second-instance', () => {
      const [win] = BrowserWindow.getAllWindows();
      if (!win) return;
      if (win.isMinimized()) win.restore();
      win.focus();
    });
  }

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
    file: join(app.getPath('userData'), 'settings.json'),
    readFile: (f) => readFileSync(f, 'utf8'),
    writeFile: writeFileAtomic
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => app.quit());
