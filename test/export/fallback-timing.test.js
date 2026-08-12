// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max Leopold Blumenschein
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { buildEffectHtml } from '../../src/export/build-effect.js';

/**
 * WHAT THIS FILE IS FOR
 *
 * The bootstrap's clock (advance() in src/export/build-effect.js) accumulates
 * `seconds` from two sources: a real animation-frame timestamp delta when the
 * host is healthy, and a nominal 1/30s step when the interval fallback fires
 * with no timestamp at all. The two must never both charge for the same
 * stretch of wall-clock time -- that is exactly what a "fallback tick, then
 * the next real frame" sequence is at risk of doing, because the next real
 * frame's timestamp reflects wall-clock time that the fallback tick has
 * already, separately, been paid for.
 *
 * This is checked here as arithmetic, not as rendered pixels, because the bug
 * is a few extra milliseconds per dropped frame -- real, and compounding, but
 * far too small a pixel difference to assert on reliably through a warp
 * field. So instead of driving a real Electron window (the other bootstrap
 * tests in this directory, e.g. host-conditions.test.js, exist to prove the
 * effect keeps *moving*; this one exists to prove it does not move *too
 * fast*), the exact same bootstrap script produced by buildEffectHtml is
 * executed here in a Node vm sandbox with a mock engine that only ever
 * records the `seconds` value it is called with. That gives byte-exact
 * access to the accumulator the real page can never expose.
 *
 * The fallback tick itself is simulated by calling the bootstrap's own
 * `step(undefined)` directly -- the exact call the real setInterval handler
 * makes (see the pump at the bottom of the bootstrap: `if (ticks ===
 * seenTicks) step(undefined);`) -- rather than by faking timer delivery.
 */

const DOC = {
  name: 'FallbackTiming',
  description: 'the fallback tick must not double-count wall-clock time',
  publisher: 'SignalForge',
  assets: {},
  layers: [],
  controls: []
};

/**
 * A no-op engine whose only job is to remember every `seconds` it was
 * rendered at, via window.__record -- a real function bridged in from
 * outside the sandbox (see loadBootstrap), not a value serialized into the
 * script text, so the log the test reads back is the very same array the
 * mock pushed onto.
 */
const ENGINE_SOURCE = `
    window.SignalForgeEngine = {
      normalizeDocument: function (raw) { return { doc: raw, problems: [] }; },
      createRenderer: function () {
        return {
          render: function (ctx, doc, assets, seconds) { window.__record(seconds); },
          dispose: function () {}
        };
      },
      loadAssets: function (base, opts) { return Promise.resolve({}); },
      applyControls: function (base, values) { return base; }
    };
  `;

/**
 * Build the real bootstrap (via buildEffectHtml, the exact function that
 * produces the shipped exported file), extract just its <script> bodies, and
 * run them in a fresh vm context whose `window` is the context's own global
 * object -- so top-level `var`/`function` declarations in the bootstrap
 * (step, advance, seconds, previousStamp, ...) land as properties on
 * `context`, directly readable and callable from the test after the script
 * runs.
 *
 * No requestAnimationFrame and no setInterval are defined on the context, so
 * the bootstrap's own scheduling (`if (typeof window.requestAnimationFrame
 * === 'function') ...` / `if (typeof setInterval === 'function') ...`) is
 * skipped entirely -- both guards exist in the real code for exactly this
 * reason, to keep the effect working in a host that lacks one or the other.
 * Frames are driven one at a time by calling the bootstrap's own `step`
 * directly, never a reimplementation of it.
 */
async function loadBootstrap() {
  const secondsLog = [];
  const html = buildEffectHtml({ doc: DOC, engineSource: ENGINE_SOURCE, lang: 'en' });

  const scriptBodies = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  // sf-document (JSON), engine mock, bootstrap -- in that order (see the
  // template in buildEffectHtml).
  assert.equal(scriptBodies.length, 3, 'expected exactly the document/engine/bootstrap script blocks');
  const [, engineScript, bootstrapScript] = scriptBodies;

  const context = {};
  context.window = context;
  context.console = console;
  context.__record = (s) => secondsLog.push(s);
  context.document = {
    getElementById(id) {
      if (id === 'exCanvas') return { getContext: () => ({}) };
      if (id === 'sf-document') return { textContent: JSON.stringify(DOC) };
      throw new Error(`unexpected getElementById(${id})`);
    }
  };
  vm.createContext(context);

  vm.runInContext(engineScript + '\n' + bootstrapScript, context);

  // Flush the microtask queue so SF.loadAssets()'s already-resolved promise
  // has landed (`assets = loaded`) before the first frame is driven -- step()
  // returns early with `assets` still null otherwise, and no test below would
  // ever reach advance() at all.
  await new Promise((resolve) => { setImmediate(resolve); });

  return { context, secondsLog };
}

/** Drive one frame through the bootstrap's own step(), exactly as update() would. */
function driveFrame(context, stamp) {
  const arg = stamp === undefined ? 'undefined' : String(stamp);
  vm.runInContext(`step(${arg})`, context);
}

const NOMINAL_STEP = 1 / 30;
const FRAME_GAP_MS = 1000 / 30;
const EPS = 1e-9;

test('a fallback tick between two healthy frames costs exactly one nominal step, not double', async () => {
  const { context, secondsLog } = await loadBootstrap();

  // Frame 1: healthy, first frame ever -- anchors the clock at t=0. Costs
  // nothing (the first frame is always t=0, see advance()'s !drawnAny branch).
  driveFrame(context, 1000);
  assert.equal(context.seconds, 0, 'the first frame must not advance the clock');

  // Frame 2: the interval fallback fires -- no timestamp at all, exactly the
  // call site in the real pump (`step(undefined)`). One nominal step of
  // animation time is the only thing this frame is allowed to cost.
  driveFrame(context, undefined);
  assert.ok(
    Math.abs(context.seconds - NOMINAL_STEP) < EPS,
    `fallback tick should cost exactly one nominal step (${NOMINAL_STEP}), got ${context.seconds}`
  );

  // Frame 3: a real animation frame arrives again. Its timestamp reflects
  // genuine wall-clock progress of TWO host frame periods since frame 1 (one
  // period the dropped/fallback frame covered, one period this frame covers)
  // -- exactly what a host recovering from one skipped rAF hands back.
  driveFrame(context, 1000 + 2 * FRAME_GAP_MS);

  // Total elapsed wall-clock time represented by frames 1-3 is two frame
  // periods, so the total accumulated `seconds` must be two nominal steps --
  // not three. Three is what the bug produces: computing frame 3's delta
  // against frame 1's stale timestamp re-bills the period the fallback tick
  // already paid for, adding a THIRD nominal step's worth of animation time
  // for only two periods of real time.
  assert.ok(
    Math.abs(context.seconds - 2 * NOMINAL_STEP) < EPS,
    `expected exactly 2 nominal steps (${2 * NOMINAL_STEP}) of accumulated time after one fallback tick `
      + `sandwiched between two healthy frames, got ${context.seconds} `
      + `(${context.seconds / NOMINAL_STEP} nominal steps) -- the fallback tick's wall-clock gap was `
      + 'double-counted'
  );

  // And the render calls actually saw that exact sequence.
  assert.deepEqual(
    secondsLog.map((s) => Math.round(s / NOMINAL_STEP)),
    [0, 1, 2],
    'render() should have been called with seconds landing on 0, 1 and 2 nominal steps'
  );
});

test('two fallback ticks each cost exactly one nominal step, compounding correctly across a longer run', async () => {
  const { context } = await loadBootstrap();

  driveFrame(context, 1000); // frame 1: anchor at t=0
  driveFrame(context, undefined); // fallback: +1 step
  driveFrame(context, 1000 + 2 * FRAME_GAP_MS); // real frame after the fallback: +1 step, re-anchors
  driveFrame(context, undefined); // a second, independent fallback: +1 step
  driveFrame(context, 1000 + 4 * FRAME_GAP_MS); // real frame after it: +1 step, re-anchors

  // Four host frame periods of real wall-clock time have elapsed across the
  // five frames driven above (1 -> 2 -> [dropped] -> 3, no -- counted directly:
  // frame1 at period 0, then fallback covers period 1, then the real frame at
  // period 2 covers period 2, the second fallback covers period 3, and the
  // final real frame covers period 4 -- five frames spanning four periods).
  assert.ok(
    Math.abs(context.seconds - 4 * NOMINAL_STEP) < EPS,
    `expected exactly 4 nominal steps (${4 * NOMINAL_STEP}) after two fallback ticks each followed by a `
      + `healthy frame, got ${context.seconds} (${context.seconds / NOMINAL_STEP} nominal steps)`
  );
});
