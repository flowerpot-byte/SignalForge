// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import { app, BrowserWindow, ipcMain } from 'electron';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

ipcMain.handle('sf:version', () => app.getVersion());

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
  win.loadFile(join(here, 'renderer', 'index.html'));
  return win;
}

app.whenReady().then(async () => {
  const win = createWindow();

  if (process.env.SF_SELFTEST === '1') {
    // Boot check for the test suite: prove the window came up and that the
    // renderer has the bridge but no Node, then quit.
    await new Promise((resolve) => win.webContents.once('did-finish-load', resolve));
    const report = await win.webContents.executeJavaScript(
      `({ windowOpened: true, bridge: typeof window.sf === 'object',
          nodeInRenderer: typeof require === 'function' || typeof process === 'object' })`
    );
    process.stdout.write(JSON.stringify(report) + '\n');
    app.quit();
    return;
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => app.quit());
