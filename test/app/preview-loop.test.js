// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { createPreview } from '../../app/renderer/components/preview.js';

// createPreview() reads `document` and `window.SignalForgeEngine` as plain
// globals (it runs in the renderer, not a module-scoped environment), and
// there is no jsdom dependency in this project. A minimal fake DOM is enough:
// nothing in the loop-restart bug below touches real rendering, only the
// scheduling around it.
function fakeElement() {
  return { style: {}, getContext: () => ({}) };
}

function installFakeDom(renderCalls) {
  globalThis.document = { createElement: fakeElement };
  globalThis.window = {
    SignalForgeEngine: {
      CANVAS_WIDTH: 10,
      CANVAS_HEIGHT: 10,
      createRenderer: () => ({ render: () => { renderCalls.push(true); } }),
      normalizeDocument: (doc) => ({ doc: doc ?? {} }),
      loadAssets: async () => new Map()
    }
  };
}

// A fake requestAnimationFrame that never ticks on its own — the caller
// decides exactly when a scheduled frame runs, and in what order, by
// shifting callbacks off `queue`. This is the seam the finding asked for:
// real Electron preview windows do not tick requestAnimationFrame while
// offscreen, so the loop must be provably correct without relying on real
// frames at all.
function makeFakeScheduler() {
  const queue = [];
  return {
    requestFrame: (cb) => queue.push(cb),
    runNext(stamp) {
      const cb = queue.shift();
      assert.ok(cb, 'expected a pending frame to run');
      cb(stamp);
    },
    pendingCount: () => queue.length
  };
}

const fakeContainer = { append() {} };
const t = (key) => key;

test('stop() then a fast start() leaves exactly one live requestAnimationFrame chain', async () => {
  const renderCalls = [];
  installFakeDom(renderCalls);
  const scheduler = makeFakeScheduler();

  const preview = createPreview(fakeContainer, t, scheduler.requestFrame);
  await preview.setDocument({});

  // First chain: start() schedules one frame; running it renders once (the
  // first frame after start always passes the FRAME_GAP check because
  // lastFrame starts at -1e9) and reschedules itself.
  preview.start();
  assert.equal(scheduler.pendingCount(), 1);
  scheduler.runNext(0);
  assert.equal(renderCalls.length, 1, 'the first frame of the first chain must render');
  assert.equal(scheduler.pendingCount(), 1, 'the first chain rescheduled itself once');

  // stop() while a frame from the first chain is still pending — this is
  // the "stale pending frame" the finding describes.
  preview.stop();
  assert.equal(scheduler.pendingCount(), 1, 'stop() does not cancel an already-scheduled frame');

  // A fast start() right after: a second chain now begins alongside the
  // still-pending stale frame from the first chain.
  preview.start();
  assert.equal(scheduler.pendingCount(), 2, 'one stale frame plus one fresh frame are now queued');

  // Deliver the stale frame first (FIFO — it was queued before the fresh
  // one). With the old `running`-flag-only logic this would see
  // `running === true` again (set by the second start()) and both render
  // AND reschedule itself, so two chains would run in parallel forever.
  scheduler.runNext(1000);
  assert.equal(renderCalls.length, 1, 'a stale frame from a stopped chain must not render');
  assert.equal(scheduler.pendingCount(), 1, 'a stale frame from a stopped chain must not reschedule itself');

  // Deliver the fresh frame from the second (current) chain — this one is
  // real and must render and reschedule exactly once.
  scheduler.runNext(1000);
  assert.equal(renderCalls.length, 2, 'the fresh chain\'s frame must render exactly once');
  assert.equal(scheduler.pendingCount(), 1, 'exactly one live chain remains — no doubled loop');
});

test('start() while already running does not stack a second chain', async () => {
  const renderCalls = [];
  installFakeDom(renderCalls);
  const scheduler = makeFakeScheduler();

  const preview = createPreview(fakeContainer, t, scheduler.requestFrame);
  await preview.setDocument({});

  preview.start();
  preview.start();
  preview.start();
  assert.equal(scheduler.pendingCount(), 1, 'repeated start() calls must not queue extra chains');
});
