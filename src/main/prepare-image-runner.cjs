// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max Leopold Blumenschein
// SPDX-License-Identifier: GPL-3.0-or-later
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

app.disableHardwareAcceleration();

const requestFile = process.argv[2];
const outFile = process.argv[3];

app.whenReady().then(async () => {
  try {
    const request = JSON.parse(fs.readFileSync(requestFile, 'utf8'));
    const win = new BrowserWindow({ show: false, webPreferences: { backgroundThrottling: false } });
    await win.loadFile(path.join(__dirname, 'engine-host.html'));
    const asset = await win.webContents.executeJavaScript(
      `window.SignalForgeEngine.prepareImageAsset(${JSON.stringify(request.dataUrl)}, `
      + `${JSON.stringify(request.options)})`
    );
    fs.writeFileSync(outFile, JSON.stringify(asset), 'utf8');
    app.quit();
  } catch (error) {
    fs.writeFileSync(outFile, JSON.stringify({ error: String((error && error.stack) || error) }), 'utf8');
    app.exit(1);
  }
});
