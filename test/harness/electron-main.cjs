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

// Generous on purpose: what is waited for below is a real signal, so a
// slow-but-working page must never be cut off, and a page whose assets truly
// never arrive has to fail saying so rather than quietly hand back a blank frame.
const ASSETS_TIMEOUT_MS = 20_000;

/**
 * Wait until an exported effect has genuinely drawn its first frame.
 *
 * An exported effect draws from its own requestAnimationFrame loop, and it
 * draws nothing at all until SF.loadAssets() has resolved (see the bootstrap
 * in src/export/build-effect.js: `if (!assets) return;`). In a hidden
 * BrowserWindow that loop is short-lived -- Chromium schedules frames for a
 * while after load and then stops, since nothing ever makes the window
 * visible. Measured here: 300 launches, and in every single one the page's own
 * loop had stopped ticking by the time the frame was read back.
 *
 * So the page renders essentially once, at a moment nobody controls: across
 * 147 measured launches that one render landed anywhere between 111 ms and
 * 652 ms after the page started, while the frame was read between 481 ms and
 * 1038 ms. Those two ranges overlap, and that overlap was the flake -- when
 * the asset decode fell behind the dying loop, or behind the read, the canvas
 * had never been drawn on and came back black. Waiting longer would only have
 * made a narrower race, not no race.
 *
 * The cure is to stop synchronising on a duration. Wait for the fact that
 * actually matters -- the assets being in -- and then call the bootstrap's own
 * top-level `update` once, the exact function requestAnimationFrame would have
 * called, which renders synchronously. After this returns there is a frame on
 * the canvas, whatever the machine was busy with.
 */
async function renderFirstFrame(win) {
  await win.webContents.executeJavaScript(`new Promise(function (resolve, reject) {
    var deadline = Date.now() + ${ASSETS_TIMEOUT_MS};
    (function check() {
      // setTimeout keeps running in a hidden window (backgroundThrottling is
      // off); it is requestAnimationFrame that stops. That is why this poll
      // works where waiting on the render loop does not.
      if (typeof assets !== 'undefined' && assets !== null) { resolve(); return; }
      if (Date.now() > deadline) {
        reject(new Error('the exported effect never finished loading its assets'));
        return;
      }
      setTimeout(check, 5);
    })();
  })`);
  await win.webContents.executeJavaScript('update(performance.now()); undefined;');
}

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

      // There is a frame on the canvas from here on -- see renderFirstFrame.
      await renderFirstFrame(win);

      // settleMs is no longer what makes the frame appear; it is elapsed
      // animation time, which the motion tests need in order to compare two
      // different points of a moving picture. It is a duration because that is
      // what it is measuring, not because anything is being waited for.
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
