// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

// Software rendering keeps results reproducible across machines.
app.disableHardwareAcceleration();

const jobFile = process.argv[2];
const outFile = process.argv[3];

async function main() {
  const { jobs } = JSON.parse(fs.readFileSync(jobFile, 'utf8'));
  const win = new BrowserWindow({
    show: false,
    width: 400,
    height: 300,
    webPreferences: { offscreen: false, backgroundThrottling: false }
  });

  const results = [];
  for (const job of jobs) {
    if (job.kind === 'html') {
      // Load an exported effect file and read its canvas back.
      await win.loadFile(job.file);
      await new Promise((resolve) => setTimeout(resolve, job.settleMs ?? 120));
      const value = await win.webContents.executeJavaScript(`(() => {
        const c = document.getElementById('exCanvas');
        const g = c.getContext('2d', { willReadFrequently: true });
        const d = g.getImageData(0, 0, c.width, c.height).data;
        let s = '';
        for (let i = 0; i < d.length; i += 1) s += String.fromCharCode(d[i]);
        return { width: c.width, height: c.height, pixels: btoa(s) };
      })()`);
      results.push({ name: job.name, ...value });
    } else {
      await win.loadFile(path.join(__dirname, 'page.html'));
      const value = await win.webContents.executeJavaScript(
        `window.__run(${JSON.stringify(job)})`
      );
      results.push({ name: job.name, ...value });
    }
  }

  fs.writeFileSync(outFile, JSON.stringify(results), 'utf8');
  app.quit();
}

app.whenReady().then(main).catch((error) => {
  fs.writeFileSync(outFile, JSON.stringify({ error: String(error && error.stack || error) }), 'utf8');
  app.exit(1);
});
