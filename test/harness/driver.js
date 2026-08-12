// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max Leopold Blumenschein
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * One way of working a real SignalForge window from the outside.
 *
 * Both Electron entries in this folder — the self-test (selftest.js) and the
 * acceptance walkthrough (walkthrough.js) — import app/main.js, let it open
 * its own real window, and then reach into that window from the main process.
 * They used to carry a driver each, written weeks apart: the same idea, the
 * same waits, the same "set the control and fire the event a person's gesture
 * fires", written twice and drifting. This is the one they now share.
 *
 * Where the two genuinely need something different, that is a parameter here
 * and not a second copy: the screenshot folder (the walkthrough always has one,
 * the self-test only when a human asks for pictures) and how a screenshot wants
 * to be named in a report.
 *
 * Nothing in this file knows anything about either caller's checks. It reads,
 * clicks, types, waits and photographs; the judgements stay where they belong.
 */
import { app } from 'electron';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------
// Staying alive is a bug
// ---------------------------------------------------------------------------

/**
 * How long a harness may take before it gives up on itself.
 *
 * Measured on this machine, one harness at a time, with nothing else running:
 * selftest.js 1.4 s, tiles-shots.js 4.6 s, shots.js 20.1 s,
 * gradient-shots.js 20.4 s, unsaved.js 36.4 s. The whole `npm test` run is
 * about 40 s, so nothing here is allowed to take a minute.
 *
 * 60 s is therefore ~1.6x the slowest harness there is, which leaves room for
 * a machine busy with other work without leaving room for a hang to hide in.
 * unsaved.js asks for more (see its own call) because it is the slow one and
 * because its parent gives it 90 s; the rule everywhere is that a harness's
 * own watchdog fires BEFORE the parent's timeout, so what gets reported is
 * this file's message about which harness got stuck rather than the parent's
 * blunt "did not finish".
 *
 * Overridable through the environment purely so the checks in
 * test/app/harness-lifecycle.test.js can prove the watchdog in two seconds
 * instead of sixty.
 */
export const WATCHDOG_MS = Number(process.env.SF_HARNESS_WATCHDOG_MS) || 60_000;

/**
 * Everything that has to be true for an Electron harness not to outlive its
 * run, installed in one call.
 *
 * WHY THIS EXISTS. Three orphaned electron.exe processes from this project's
 * own harnesses were found resident on the machine's owner's computer six
 * hours after the runs that started them, holding 156 MB between them. The
 * mechanism was measured rather than guessed (see
 * .superpowers/sdd/harness-cleanup-report.md): an Electron main process does
 * NOT die of an unhandled promise rejection the way `node script.js` does. It
 * prints UnhandledPromiseRejectionWarning and carries on running, forever,
 * with its window still open — because Chromium's message loop keeps it alive
 * and Electron does not arm Node's --unhandled-rejections=throw. A harness
 * that throws outside its own try, or that waits on an event that never
 * arrives, is therefore immortal.
 *
 * The three answers, all of which are needed:
 *
 *  - a watchdog, so "waiting forever" becomes "quit with a reason";
 *  - handlers for uncaughtException and unhandledRejection, so a throw that
 *    nothing caught ends the process instead of being printed at it;
 *  - and, in the callers, a `finally` that always leaves (runHarness below).
 *
 * `app.exit(code)`, never `app.quit()`. quit is a REQUEST: it fires
 * 'before-quit' and closes windows, and any listener that calls
 * preventDefault() — an unsaved-changes question on window close, say —
 * cancels it and leaves the process exactly as immortal as before. exit() is
 * not refusable, and it is the only one of the two that carries an exit code,
 * which is what keeps a failing harness red.
 *
 * @param {string} name  which harness this is, for the message it prints
 * @returns {(code: number, why?: string) => void}  leave, once, with a code
 */
export function guardHarness(name, { watchdogMs = WATCHDOG_MS } = {}) {
  let leaving = false;

  const leave = (code, why) => {
    if (leaving) return;
    leaving = true;
    if (why) process.stderr.write(`${name}: ${why}\n`);

    // Drain stdout before pulling the floor out. app.exit() is immediate and
    // does not flush, and on Windows a write to a pipe is asynchronous — the
    // parent of most of these harnesses parses the LAST line of stdout, so an
    // unflushed report reads as a crash. The timer is the answer to the pipe
    // never draining (a full buffer nobody is reading), which must not turn
    // into a second way of hanging.
    let gone = false;
    const go = () => { if (!gone) { gone = true; app.exit(code); } };
    const forced = setTimeout(go, 1000);
    process.stdout.write('', () => { clearTimeout(forced); go(); });
  };

  const watchdog = setTimeout(() => {
    leave(1, `did not finish within ${watchdogMs}ms — quitting rather than waiting forever`);
  }, watchdogMs);

  process.on('uncaughtException', (error) => {
    leave(1, `uncaught exception: ${String((error && error.stack) || error)}`);
  });
  process.on('unhandledRejection', (reason) => {
    leave(1, `unhandled rejection: ${String((reason && reason.stack) || reason)}`);
  });

  return Object.assign(leave, { cancelWatchdog: () => clearTimeout(watchdog) });
}

/**
 * A whole harness: wait for Electron, do the work, and leave — whatever
 * happens.
 *
 * The exit code still tells the truth, which matters more than the leak this
 * fixes: a harness that always exited 0 would turn a red test green. `body`
 * may return a number to choose the code (the walkthrough reports its own
 * pass/fail that way); anything else means success.
 *
 * @param {string} name
 * @param {() => Promise<number|void>} body  run once, after app.whenReady()
 */
export function runHarness(name, body, { watchdogMs = WATCHDOG_MS } = {}) {
  const leave = guardHarness(name, { watchdogMs });

  (async () => {
    let code = 0;
    try {
      await app.whenReady();
      const result = await body();
      code = typeof result === 'number' ? result : 0;
    } catch (error) {
      code = 1;
      process.stderr.write(`${name} failed: ${String((error && error.stack) || error)}\n`);
    } finally {
      // The finally is the point of the whole file. An assertion that threw, a
      // promise that rejected, a wait that timed out — all of them arrive here.
      leave.cancelWatchdog();
      leave(code);
    }
  })();
}

/**
 * The frame pump, installed in the page.
 *
 * A window Chromium is not showing does not tick requestAnimationFrame, and
 * the preview's render loop is a requestAnimationFrame chain — so with no help
 * the canvas in every picture would be empty and every measurement would be of
 * a frame that was never drawn. `createPreview` reaches
 * `window.requestAnimationFrame` through a closure at the moment it schedules
 * a frame, so replacing that function puts every subsequent frame into a queue
 * that is drained from out here, one pump at a time. It is the same trick
 * test/harness/electron-main.cjs plays on the exported effect, for the same
 * reason.
 *
 * It is also why `settle()` below is not used by the harnesses that pump:
 * settle() waits for two REAL animation frames, which in a hidden window never
 * arrive.
 *
 * This lived, verbatim and forty lines at a time, in four separate harnesses —
 * the fifth duplication in a project that has been bitten by exactly this four
 * times. It lives here now, and the callers reach it through `installPump()`
 * and `pump()` on the driver.
 */
export const PUMP = `(() => {
  window.__sfQueue = [];
  window.requestAnimationFrame = (cb) => { window.__sfQueue.push(cb); return window.__sfQueue.length; };
  window.__sfPump = (n) => {
    for (let i = 0; i < n; i += 1) {
      const due = window.__sfQueue;
      window.__sfQueue = [];
      // performance.now() is real time, so the effect's own clock advances
      // between pumped frames exactly as it would between real ones.
      due.forEach((cb) => cb(performance.now()));
    }
    return true;
  };
  return true;
})()`;

/**
 * What the preview canvas currently shows, as numbers.
 *
 * `hash` answers "is this the very same picture"; the channel means answer
 * "did it get darker / did the colour tip"; `saturation` answers "is it grey";
 * `brightestColumn` finds the white marker bar and is what the crop drag is
 * judged by.
 *
 * `bars` is where that same marker sits in three individual rows, and it is
 * what tells warp and breathe apart while both are running: breathe scales the
 * whole frame's opacity, so the level moves and the marker does not budge;
 * warp displaces each row separately, so the marker wanders and the level
 * stays put. A column profile averaged over all rows will not do it — warp's
 * per-row displacement largely cancels out in that average, which is how the
 * first run of the walkthrough came to report warp as invisible when it was
 * plainly moving on screen.
 */
const STATS_SOURCE = `(() => {
  const c = document.getElementById('preview-canvas');
  const g = c.getContext('2d', { willReadFrequently: true });
  const d = g.getImageData(0, 0, c.width, c.height).data;
  const n = c.width * c.height;
  let sr = 0, sg = 0, sb = 0, sat = 0, hash = 0;
  const cols = new Float64Array(c.width);
  for (let i = 0, p = 0; i < d.length; i += 4, p += 1) {
    const r = d[i], gg = d[i + 1], b = d[i + 2];
    sr += r; sg += gg; sb += b;
    const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b);
    sat += mx === 0 ? 0 : (mx - mn) / mx;
    cols[p % c.width] += (r + gg + b) / 3;
    hash = (hash * 31 + r + gg * 3 + b * 7) | 0;
  }
  let best = -1, bestValue = -1;
  for (let x = 0; x < c.width; x += 1) { if (cols[x] > bestValue) { bestValue = cols[x]; best = x; } }
  const bars = [20, 100, 180].map((y) => {
    let bx = -1, bv = -1;
    for (let x = 0; x < c.width; x += 1) {
      const i = (y * c.width + x) * 4;
      const v = d[i] + d[i + 1] + d[i + 2];
      if (v > bv) { bv = v; bx = x; }
    }
    return bx;
  });
  return {
    width: c.width, height: c.height, hash, bars,
    r: sr / n, g: sg / n, b: sb / n, mean: (sr + sg + sb) / (3 * n),
    saturation: sat / n, brightestColumn: best,
    columns: Array.from(cols, (v) => v / c.height)
  };
})()`;

/**
 * @param win           the real BrowserWindow app/main.js opened
 * @param shotsDir      where screenshots go; without one, shot() does nothing
 *                      and says so by handing back null
 * @param shotLabel     how a taken screenshot wants to be named in a report;
 *                      by default the absolute file that was written
 */
export function driver(win, { shotsDir = null, shotLabel = null } = {}) {
  const dbg = win.webContents.debugger;
  const js = (expression) => win.webContents.executeJavaScript(expression);
  const send = (method, params) => dbg.sendCommand(method, params);

  /**
   * Two frames, so the compositor has actually painted what we are shooting.
   *
   * A change made by the line above has only reached the DOM, not the screen,
   * and capturePage() hands back the last frame the compositor really painted
   * — without this the picture shows the state BEFORE the thing it is meant to
   * be evidence of. Two frames, because the first only gets as far as
   * scheduling the paint.
   *
   * With a deadline on it, because there is one way this can never finish: a
   * window Chromium has decided is not worth animating hands out no frames at
   * all, and a run that waits forever for one looks exactly like a run that is
   * still working.
   */
  const settle = () => {
    let timer;
    // The timeout is a watchdog, not part of the result: once the race is
    // decided (either way) it must not go on holding the Electron main
    // process alive for up to 15s past the end of a run — which would read
    // as a hang of its own, indistinguishable from the thing this is meant
    // to detect.
    return Promise.race([
      js(`new Promise((d) => requestAnimationFrame(() => requestAnimationFrame(d)))`),
      new Promise((_, reject) => { timer = setTimeout(
        () => reject(new Error('the window stopped producing animation frames')), 15_000
      ); })
    ]).finally(() => clearTimeout(timer));
  };

  const message = () => js(`document.querySelector('.drop-message').textContent`);

  return {
    js,
    send,
    settle,
    message,
    /**
     * Take the render loop's frames over, for a window nobody is showing. Has
     * to be done once the page exists and before anything is measured or
     * photographed; every frame scheduled after it waits for `pump()`.
     */
    installPump: () => js(PUMP),
    /** Run `frames` of what the page has queued up since the last call. */
    pump: (frames = 1) => js(`window.__sfPump(${Number(frames)})`),
    async shot(name) {
      if (!shotsDir) return null;
      await settle();
      const file = join(shotsDir, `${name}.png`);
      writeFileSync(file, (await win.capturePage()).toPNG());
      return shotLabel ? shotLabel(name) : file;
    },
    stats: () => js(STATS_SOURCE),
    // The cost readout is a chip attached to the preview frame and has an id
    // of its own now; it used to be a loose paragraph found by elimination.
    cost: () => js(`document.getElementById('preview-cost').textContent`),
    /** The middle of an element, in the coordinates CDP input events use. */
    box: (selector) => js(`(() => {
      const b = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();
      return { x: b.x, y: b.y, width: b.width, height: b.height,
               cx: b.x + b.width / 2, cy: b.y + b.height / 2 };
    })()`),
    /**
     * A dropdown, set the way a person's click sets it.
     *
     * A <select>'s popup is drawn by the operating system and is out of reach
     * of page-level input events, so the value is set on the element and the
     * change event fired — the same event the click produces, arriving at the
     * same listener.
     */
    setSelect: (id, value) => js(`(() => {
      const control = document.getElementById(${JSON.stringify(id)});
      control.value = ${JSON.stringify(String(value))};
      control.dispatchEvent(new Event('change', { bubbles: true }));
      return control.value;
    })()`),
    /**
     * A slider or a text field, set the same way: the value, then the `input`
     * event that typing and dragging both fire.
     */
    setInput: (id, value) => js(`(() => {
      const control = document.getElementById(${JSON.stringify(id)});
      control.value = ${JSON.stringify(String(value))};
      control.dispatchEvent(new Event('input', { bubbles: true }));
      return control.value;
    })()`),
    /**
     * A real mouse drag: press, a run of moves, release. The moves are sent one
     * at a time on purpose — the crop follows pointermove, and a single jump
     * would not prove that it tracks rather than snaps.
     */
    async drag(fromX, fromY, toX, toY, steps = 12) {
      const common = { button: 'left', buttons: 1, clickCount: 1 };
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: fromX, y: fromY, ...common });
      for (let i = 1; i <= steps; i += 1) {
        await send('Input.dispatchMouseEvent', {
          type: 'mouseMoved',
          x: fromX + ((toX - fromX) * i) / steps,
          y: fromY + ((toY - fromY) * i) / steps,
          ...common
        });
        await wait(8);
      }
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: toX, y: toY, ...common });
      await wait(60);
    },
    /** A real mouse click, at coordinates, through the protocol. */
    async click(x, y) {
      const common = { button: 'left', clickCount: 1 };
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, buttons: 0 });
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, buttons: 1, ...common });
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, buttons: 0, ...common });
      await wait(60);
    },
    /**
     * A button pressed by id rather than at coordinates — for the checks that
     * are about what the handler does, not about whether a pointer can reach
     * it. By id, not by position in the row: a check that finds the save button
     * by being "the first one" breaks every time a button is added beside it.
     */
    clickById: (id) => js(`document.getElementById(${JSON.stringify(id)}).click(), true`),
    /**
     * A real key press. `modifiers` is the protocol's own bitmask —
     * Alt 1, Ctrl 2, Meta 4, Shift 8 — which is what turns an arrow into the
     * crop's coarse step.
     */
    async key(key, code, virtualKey, modifiers = 0) {
      const base = {
        key, code, modifiers,
        windowsVirtualKeyCode: virtualKey,
        nativeVirtualKeyCode: virtualKey
      };
      await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...base });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
      await wait(40);
    },
    /** Poll the window until `expression` is true. */
    async until(expression, what, tries = 200) {
      for (let i = 0; i < tries; i += 1) {
        if (await js(expression)) return;
        await wait(50);
      }
      throw new Error(`the window never reached: ${what}`);
    },
    /**
     * Press a button and wait for the one line of feedback to say something
     * new. A click hands back long before the bridge round trip, the picture
     * decode or the file write are done, so nothing may assume the work is
     * finished when the click returns.
     */
    async clickAndWait(id) {
      const before = await message();
      await js(`document.getElementById(${JSON.stringify(id)}).click(), true`);
      for (let tries = 0; tries < 100; tries += 1) {
        await wait(50);
        const now = await message();
        if (now !== before) return now;
      }
      throw new Error(`the window never reported anything after clicking #${id}`);
    }
  };
}
