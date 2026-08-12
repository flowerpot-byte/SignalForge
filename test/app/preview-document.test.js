// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { createPreview } from '../../app/renderer/components/preview.js';

// Same minimal fake DOM as test/app/preview-loop.test.js: createPreview reads
// `document` and `window.SignalForgeEngine` as plain globals, and there is no
// jsdom in this project. Nothing here touches real rendering — what is under
// test is which document and which assets the loop is left holding.
function fakeElement() {
  return {
    // setProperty: followAspect writes the frame's --stage-aspect custom
    // property on the stage; the fake only has to survive it.
    style: { setProperty() {} },
    children: [],
    classList: { toggle() {}, add() {}, remove() {} },
    append(...kids) { this.children.push(...kids); },
    // The empty stage now carries a hand-drawn line icon (components/icons.js),
    // which is built out of elements that carry attributes. Nothing here is
    // about how it looks — the fake simply has to survive being decorated.
    setAttribute() {},
    getContext: () => ({})
  };
}

/**
 * Installs the fake engine and hands back the levers this file needs:
 * `frames` records what every rendered frame was actually given, and
 * `failNextLoad` makes the next (and only the next) loadAssets reject.
 */
function installFakeDom() {
  const frames = [];
  const state = { failNextLoad: null, loads: 0 };

  globalThis.document = { createElement: fakeElement };
  globalThis.window = {
    SignalForgeEngine: {
      CANVAS_WIDTH: 10,
      CANVAS_HEIGHT: 10,
      createRenderer: () => ({
        render: (_ctx, doc, assets) => { frames.push({ doc, assets }); }
      }),
      normalizeDocument: (doc) => ({ doc: doc ?? {} }),
      clamp: (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v),
      aspectFactorOf: () => 1,
      async loadAssets(doc) {
        state.loads += 1;
        if (state.failNextLoad) {
          const error = state.failNextLoad;
          state.failNextLoad = null;
          throw error;
        }
        // A map that can be told apart from every other one, so "the previous
        // assets are still in place" is checkable by identity.
        return new Map([['for', doc]]);
      }
    }
  };

  return { frames, state };
}

// style.setProperty: followAspect writes --stage-aspect on the CONTAINER
// (#preview-body), where #preview-body's own --content-width can read it.
const fakeContainer = { append() {}, style: { setProperty() {} } };
const t = (key) => key;
const scheduler = () => {
  const queue = [];
  return { requestFrame: (cb) => queue.push(cb), runNext: (stamp) => queue.shift()(stamp) };
};

// setDocument replaces two things that belong together: the document and the
// pictures its layers are drawn from. Committing the document first and the
// assets afterwards means a load that rejects (or hits loadAssets' 60 s
// watchdog) leaves the window rendering the new document's layers against the
// previous picture — and the crop drag computing its slack from the wrong
// source size. openProject is built on the opposite promise: a file that
// cannot be used leaves the project already open exactly as it was.
test('a failed asset load leaves both the document and the assets exactly as they were', async () => {
  const { frames, state } = installFakeDom();
  const frame = scheduler();

  const preview = createPreview(fakeContainer, t, frame.requestFrame);
  const good = { name: 'the one already open', layers: [{ id: 'image' }] };
  await preview.setDocument(good);
  const goodAssets = (preview.start(), frame.runNext(0), frames[0].assets);

  assert.equal(frames[0].doc, good, 'the loaded document is the one being rendered');

  const broken = { name: 'the one that could not be loaded', layers: [{ id: 'other' }] };
  state.failNextLoad = new Error('the picture could not be decoded');

  // The rejection must still reach the caller — every caller turns it into
  // the one visible line of feedback.
  await assert.rejects(
    () => preview.setDocument(broken),
    /could not be decoded/,
    'setDocument must not swallow the failure'
  );

  assert.equal(
    preview.document(),
    good,
    'the document already open must survive a failed load, not be replaced by the one that failed'
  );

  frame.runNext(1000);
  const after = frames.at(-1);
  assert.equal(after.doc, good, 'the loop must go on rendering the document that is actually loaded');
  assert.equal(
    after.assets,
    goodAssets,
    'and against the pictures that belong to it — never the new layers against the old assets'
  );
});

test('a successful load commits the document and its assets together', async () => {
  const { frames } = installFakeDom();
  const frame = scheduler();

  const preview = createPreview(fakeContainer, t, frame.requestFrame);
  await preview.setDocument({ name: 'first' });
  const next = { name: 'second', layers: [{ id: 'image' }] };
  await preview.setDocument(next);

  preview.start();
  frame.runNext(0);
  assert.equal(frames.at(-1).doc, next);
  assert.equal(
    frames.at(-1).assets.get('for'),
    next,
    'the assets rendered must be the ones loaded for the document rendered'
  );
});
