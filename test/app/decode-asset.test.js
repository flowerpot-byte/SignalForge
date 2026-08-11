// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  decodeAsset, ASSET_DECODE_TIMEOUT_MS, DECODE_FAILED, DECODE_TIMED_OUT
} from '../../app/renderer/components/decode.js';
import '../../src/engine/index.js';

/**
 * The one step on the way to the stage that waits on something this app does
 * not control.
 *
 * Every document that reaches the preview is measured first, and measuring
 * means handing bytes to a decoder — bytes that, for an effect reopened out of
 * the library, came out of a file somebody else may have written. An <img> that
 * fires neither onload nor onerror is a thing that happens, and everything
 * upstream of this awaits it: without a watchdog, one such picture leaves the
 * previous document on the stage, the tile press unfinished, and nothing said.
 *
 * There is no Image in Node, which is exactly why decodeAsset takes one. Each
 * stand-in below behaves like one specific decoder: prompt, broken, silent, or
 * badly behaved enough to answer twice.
 */

/** A decoder that never says anything at all. The case the watchdog exists for. */
class SilentImage {
  set src(_value) { /* and then, forever, nothing */ }
}

/** A decoder that loads, on the next turn of the loop. */
class LoadingImage {
  constructor() { this.naturalWidth = 640; this.naturalHeight = 400; }
  set src(value) {
    this.gotSrc = value;
    queueMicrotask(() => this.onload?.());
  }
}

/** A decoder handed bytes it cannot make sense of. */
class BrokenImage {
  set src(_value) { queueMicrotask(() => this.onerror?.()); }
}

const ASSET = { mime: 'image/png', data: 'AAAA' };

test('a picture that decodes comes back, and the bytes it was handed are the asset\'s own', async () => {
  const image = await decodeAsset(ASSET, { ImageElement: LoadingImage });
  assert.equal(image.naturalWidth, 640);
  assert.equal(
    image.gotSrc,
    'data:image/png;base64,AAAA',
    'the mime and the bytes both come from the asset — a decoder handed anything else is measuring something else'
  );
});

test('a picture that will not decode is refused with a sentence', async () => {
  await assert.rejects(
    () => decodeAsset(ASSET, { ImageElement: BrokenImage }),
    (error) => {
      assert.equal(error.message, DECODE_FAILED);
      return true;
    }
  );
});

/**
 * The falsifiable one: delete the watchdog in components/decode.js and this
 * test does not fail, it HANGS — which is the very failure being guarded
 * against, reproduced. The runner's own timeout is what would end it, and that
 * is the difference between a bug and a test.
 */
test('a picture that never settles is given up on rather than awaited forever', async () => {
  const started = Date.now();
  await assert.rejects(
    () => decodeAsset(ASSET, { ImageElement: SilentImage, timeoutMs: 30 }),
    (error) => {
      assert.equal(error.message, DECODE_TIMED_OUT);
      return true;
    }
  );
  assert.ok(Date.now() - started >= 25, 'and it waited first — an instant refusal would be a different bug');
});

test('a decoder that answers twice is heard once', async () => {
  // A real one has done this: onerror after onload. The second answer must not
  // turn a document already on the stage into a message about it having failed.
  class TwiceImage {
    set src(_value) {
      queueMicrotask(() => { this.onload?.(); this.onerror?.(); });
    }
  }
  const image = await decodeAsset(ASSET, { ImageElement: TwiceImage });
  assert.ok(image, 'the first answer is the answer');
});

test('a late answer after the watchdog has given up changes nothing', async () => {
  class LateImage {
    set src(_value) { setTimeout(() => this.onload?.(), 60); }
  }
  await assert.rejects(
    () => decodeAsset(ASSET, { ImageElement: LateImage, timeoutMs: 15 }),
    /took too long/
  );
  // Give the late answer time to arrive and prove it lands nowhere: an
  // unhandled rejection or a second settle would surface here.
  await new Promise((resolve) => setTimeout(resolve, 80));
});

test('the budget is the engine\'s own, so the two cannot drift apart', () => {
  // src/engine/engine.js gives each asset it loads 5 s. This is the same job on
  // the same data one layer up; two different numbers for it would be two
  // numbers to keep in step, and nobody would.
  assert.equal(ASSET_DECODE_TIMEOUT_MS, 5000);
});
