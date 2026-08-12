// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max Leopold Blumenschein
// SPDX-License-Identifier: GPL-3.0-or-later
//
// The canvas bin/sfexport.js does not have. Plain Node cannot draw, so the
// command line hands the document to a hidden window in a second Electron and
// gets PNG bytes back — the same arrangement prepare-image-runner.cjs uses for
// importing a picture.
//
// Deliberately thin: everything about WHAT is drawn (the frame, the size, the
// crop) lives in cover-image.js and is reached from here through a dynamic
// import, because this file is CommonJS and that one is not. A second copy of
// the render here is exactly the duplication this project keeps being bitten by.
const { app } = require('electron');
const fs = require('node:fs');

app.disableHardwareAcceleration();

const requestFile = process.argv[2];
const outFile = process.argv[3];

app.whenReady().then(async () => {
  try {
    const { renderCoverInProcess } = await import('./cover-image.js');
    const request = JSON.parse(fs.readFileSync(requestFile, 'utf8'));
    const png = await renderCoverInProcess(request.doc);
    fs.writeFileSync(outFile, JSON.stringify({ png }), 'utf8');
    app.quit();
  } catch (error) {
    fs.writeFileSync(outFile, JSON.stringify({ error: String((error && error.stack) || error) }), 'utf8');
    app.exit(1);
  }
});
