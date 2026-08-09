// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { createSettings } from '../src/main/settings.js';
import { resolveEffectsTarget } from '../src/main/effects-target.js';

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
  renameSync(tempFile, file);
}

ipcMain.handle('sf:version', () => app.getVersion());
ipcMain.handle('sf:settings:all', () => settings.all());
ipcMain.handle('sf:settings:set', (_e, key, value) => { settings.set(key, value); return settings.all(); });
ipcMain.handle('sf:effectsTarget', () => currentTarget());
ipcMain.handle('sf:chooseFolder', async () => {
  const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
  if (result.canceled || result.filePaths.length === 0) return currentTarget();
  settings.set('effectsFolder', result.filePaths[0]);
  return currentTarget();
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
