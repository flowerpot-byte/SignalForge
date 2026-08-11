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
async function waitForAssets(win) {
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
}

async function renderFirstFrame(win) {
  await waitForAssets(win);
  await win.webContents.executeJavaScript('update(performance.now()); undefined;');
}

/**
 * Take requestAnimationFrame away from the page, the way the real host can.
 *
 * SignalRGB runs effects in an offscreen Ultralight view and carries its own
 * recovery code for a view whose frames have gone stale
 * (UltralightView::TryRecoverIfBehind re-kicks window.__lastRAFCallback), so
 * "the animation-frame loop has stopped delivering" is a condition that host
 * really has, not a hypothetical. A stub that quietly hands back an id and
 * never calls anything reproduces it exactly: any effect that has no second
 * way to reach its own render step freezes on whatever frame it last drew.
 */
/** SignalRGB writing control values into page globals, as one script. */
function assignGlobals(values) {
  return Object.entries(values)
    .map(([key, value]) => `window[${JSON.stringify(key)}] = ${JSON.stringify(value)};`)
    .join(' ');
}

async function stopAnimationFrames(win) {
  await win.webContents.executeJavaScript(
    'window.requestAnimationFrame = function () { return 0; }; undefined;'
  );
}

/**
 * Put a loaded effect back to frame zero, hand it one exact sequence of
 * frames, and then make sure it can never draw another.
 *
 * All of it in ONE evaluation, on purpose: every await is a yield back to the
 * page's own event loop, and the whole point here is that the page must not
 * get a turn in the middle.
 *
 * Needed by exactly one kind of question, and only since documents can carry a
 * trail. Without one, a frame is a pure function of its time, so it does not
 * matter how many frames the page drew on its own between loading and being
 * measured — the last one asked for is the one on the canvas. With a trail
 * every frame is composited over the one before it, so a stray frame from the
 * page's own loop, or from the setInterval fallback that keeps a stalled effect
 * alive, lands in the picture and stays there. Measured: that is why a
 * frame-for-frame comparison of a trailing effect against the engine came back
 * with a mean difference of 78 before this existed.
 *
 * FOUR things have to go, and all four are things the effect really has:
 *
 *  - requestAnimationFrame, replaced with a stub, the same way
 *    stopAnimationFrames above does it, so `update` stops re-queueing itself;
 *  - the setInterval the bootstrap took out at load and did not keep the id of
 *    — cleared by id over a generous range, which is blunt but is the only
 *    handle there is on a timer somebody else started;
 *  - the effect's own clock and renderer, so the sequence that follows starts
 *    from t = 0 with an empty wake rather than from wherever it had got to;
 *  - and, once the sequence is done, `step` itself.
 *
 * THE LAST ONE IS THE ONE THAT WAS NOT OBVIOUS. Stubbing requestAnimationFrame
 * stops new callbacks being queued; it does nothing about the ones ALREADY
 * queued, which hold the real `update` function object and are called by
 * Chromium later with a real timestamp of its own — hundreds of milliseconds
 * past the last stamp handed over here, so `advance` counts the gap and the
 * effect quietly renders another frame after the sequence was supposed to have
 * ended. Measured before this line existed: a trail-free effect, whose frames
 * are a pure function of their time, came back matching the engine at 1, 2 and
 * 10 frames and NOT at 3, 5 and 30 — the signature of a stray frame arriving
 * or not arriving depending on scheduling.
 *
 * `update` cannot be taken away from those pending callbacks — they hold the
 * function itself. `step` can: `update` looks it up in the global scope every
 * time it runs, so replacing it makes every stray callback a no-op.
 *
 * waitForAssets must already have resolved before this is called: its poll is
 * a setTimeout, and the sweep below would cancel it.
 */
async function runSequenceFromFrameZero(win, stamps, globals) {
  await win.webContents.executeJavaScript(`(function (stamps, globals) {
    window.requestAnimationFrame = function () { return 0; };
    for (var id = 1; id < 10000; id += 1) clearInterval(id);
    renderer.dispose();
    seconds = 0;
    previousStamp = null;
    drawnStamp = null;
    drawnAny = false;
    if (globals) {
      for (var key in globals) window[key] = globals[key];
    }
    for (var i = 0; i < stamps.length; i += 1) {
      update(stamps[i] === null ? undefined : stamps[i]);
    }
    // Nothing may draw from here on: see the note above about callbacks that
    // were queued before requestAnimationFrame was taken away.
    step = function () {};
  })(${JSON.stringify(stamps)}, ${JSON.stringify(globals ?? null)}); undefined;`);
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

      // stopRaf: withhold the animation-frame loop from here on, so what the
      // canvas ends up showing can only have been drawn by whatever OTHER way
      // in the effect has (see stopAnimationFrames).
      if (job.stopRaf) await stopAnimationFrames(win);

      if (job.stamps) {
        // stamps: drive the effect's own update() with an explicit list of
        // timestamps, standing in for a host whose animation-frame clock
        // behaves differently from Chromium's -- one that repeats a value, or
        // goes backwards, or passes nothing at all. The automatic first frame
        // is skipped so the sequence handed over here IS the effect's whole
        // history, with nothing anchored to this machine's real clock; for the
        // same reason any setGlobals are written BEFORE the first of them
        // rather than after the last, so the control value is in place for
        // every frame of that history instead of only the final one.
        await waitForAssets(win);
        if (job.restart) {
          // restart: this list is the effect's WHOLE history, not just its
          // last part, and nothing else may draw before, during or after it —
          // see runSequenceFromFrameZero. Opt-in, because every question asked
          // before documents could carry a trail was about a single frame, and
          // a single frame is a pure function of its time whatever else drew.
          await runSequenceFromFrameZero(win, job.stamps, job.setGlobals);
        } else {
          if (job.setGlobals) await win.webContents.executeJavaScript(assignGlobals(job.setGlobals));
          for (const stamp of job.stamps) {
            await win.webContents.executeJavaScript(
              `update(${stamp === null ? 'undefined' : JSON.stringify(stamp)}); undefined;`
            );
          }
        }
      } else {
        // There is a frame on the canvas from here on -- see renderFirstFrame.
        await renderFirstFrame(win);
      }

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
      if (job.setGlobals && !job.stamps) {
        await win.webContents.executeJavaScript(assignGlobals(job.setGlobals));
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
    } else if (job.kind === 'png') {
      // Read a picture file back — a cover image an export wrote, decoded on
      // its own terms so its size and its pixels can both be checked.
      await win.loadFile(path.join(__dirname, 'page.html'));
      const dataUrl = `data:image/png;base64,${fs.readFileSync(job.file).toString('base64')}`;
      const value = await win.webContents.executeJavaScript(
        `window.__decode(${JSON.stringify(dataUrl)})`
      );
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
}

/**
 * Ending, whatever happens.
 *
 * The guard is the shared one in test/harness/driver.js: a watchdog, handlers
 * for uncaughtException and unhandledRejection, and app.exit() rather than
 * app.quit() (a request any close handler may refuse). It is reached through
 * a dynamic import because this file is CommonJS and that one is not — a
 * second copy of the guard here is exactly the duplication this project keeps
 * being bitten by.
 *
 * The bound comes from render.js through SF_HARNESS_WATCHDOG_MS, always a few
 * seconds under the timeout the parent is prepared to wait, so a wedged run
 * ends itself with a reason instead of being cut down without one.
 */
(async () => {
  const { guardHarness } = await import('./driver.js');
  const leave = guardHarness('render harness');
  try {
    await app.whenReady();
    await main();
  } catch (error) {
    fs.writeFileSync(outFile, JSON.stringify({ error: String((error && error.stack) || error) }), 'utf8');
    leave.cancelWatchdog();
    leave(1);
    return;
  }
  leave.cancelWatchdog();
  leave(0);
})();
