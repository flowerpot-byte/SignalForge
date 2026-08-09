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

      // Simulate SignalRGB writing a control value: set a global variable of
      // the same name the bootstrap's readControls() reads every frame
      // (`typeof <property> !== 'undefined' ? <property> : undefined`).
      //
      // A hidden, offscreen BrowserWindow does not keep ticking its own
      // requestAnimationFrame loop on its own account -- Chromium paints the
      // first frame or two right after load and then stops scheduling more,
      // since nothing ever makes the page "visible". Confirmed by hand:
      // after 500ms of waiting post-load with no forced call, the bootstrap's
      // own render() was invoked zero further times. So instead of waiting on
      // a loop that will not run here, call the bootstrap's own top-level
      // `update` function once directly (`var`/function declarations in a
      // non-module <script> are global, so it is reachable as `update`) --
      // the exact same function requestAnimationFrame would have called, not
      // a reimplementation of it.
      if (job.setGlobals) {
        const assignments = Object.entries(job.setGlobals)
          .map(([key, value]) => `window[${JSON.stringify(key)}] = ${JSON.stringify(value)};`)
          .join(' ');
        await win.webContents.executeJavaScript(assignments);
        await win.webContents.executeJavaScript('update(performance.now()); undefined;');
        await new Promise((resolve) => setTimeout(resolve, job.afterSetGlobalsMs ?? job.settleMs ?? 120));
      }

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
