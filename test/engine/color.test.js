// SignalForge — build SignalRGB effects from images, gradients, shapes and particles.
// Copyright (C) 2026 Max Leopold Blumenschein
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { adjustColor, isNeutral } from '../../src/engine/color.js';

const NEUTRAL = { saturation: 100, greenMagenta: 0, blueYellow: 0 };
const px = (r, g, b) => Uint8ClampedArray.from([r, g, b, 255]);

test('neutral settings are recognised as neutral', () => {
  assert.equal(isNeutral(NEUTRAL), true);
  assert.equal(isNeutral({ ...NEUTRAL, saturation: 101 }), false);
  assert.equal(isNeutral({ ...NEUTRAL, greenMagenta: -1 }), false);
});

test('neutral settings leave every pixel untouched', () => {
  const data = px(200, 40, 90);
  adjustColor(data, NEUTRAL);
  assert.deepEqual(Array.from(data), [200, 40, 90, 255]);
});

test('saturation 0 turns a colour into its own grey, preserving brightness', () => {
  const data = px(200, 40, 90);
  adjustColor(data, { ...NEUTRAL, saturation: 0 });
  assert.equal(data[0], data[1]);
  assert.equal(data[1], data[2]);
  // Rec. 601 luma of the original, which is what the grey must match
  const luma = Math.round(0.299 * 200 + 0.587 * 40 + 0.114 * 90);
  assert.ok(Math.abs(data[0] - luma) <= 1, `expected about ${luma}, got ${data[0]}`);
});

test('saturation 200 pushes a colour further from grey without leaving the byte range', () => {
  const data = px(200, 40, 90);
  adjustColor(data, { ...NEUTRAL, saturation: 200 });
  assert.ok(data[0] > 200, 'the dominant channel should grow');
  assert.ok(data[1] < 40, 'the weakest channel should shrink');
  for (const v of [data[0], data[1], data[2]]) assert.ok(v >= 0 && v <= 255);
});

test('a grey pixel stays grey at any saturation', () => {
  for (const s of [0, 50, 200]) {
    const data = px(128, 128, 128);
    adjustColor(data, { ...NEUTRAL, saturation: s });
    assert.deepEqual(Array.from(data).slice(0, 3), [128, 128, 128]);
  }
});

test('the green-magenta axis moves green against red and blue', () => {
  const toMagenta = px(128, 128, 128);
  adjustColor(toMagenta, { ...NEUTRAL, greenMagenta: 100 });
  assert.ok(toMagenta[1] < 128, 'green must fall towards magenta');
  assert.ok(toMagenta[0] > 128 && toMagenta[2] > 128);

  const toGreen = px(128, 128, 128);
  adjustColor(toGreen, { ...NEUTRAL, greenMagenta: -100 });
  assert.ok(toGreen[1] > 128, 'green must rise towards green');
});

test('the blue-yellow axis moves blue against red and green', () => {
  const toYellow = px(128, 128, 128);
  adjustColor(toYellow, { ...NEUTRAL, blueYellow: 100 });
  assert.ok(toYellow[2] < 128, 'blue must fall towards yellow');
  assert.ok(toYellow[0] > 128 && toYellow[1] > 128);
});

test('the alpha channel is never touched', () => {
  const data = Uint8ClampedArray.from([10, 20, 30, 77]);
  adjustColor(data, { saturation: 0, greenMagenta: 100, blueYellow: -100 });
  assert.equal(data[3], 77);
});

test('extreme settings never produce values outside 0..255', () => {
  for (const [r, g, b] of [[0, 0, 0], [255, 255, 255], [255, 0, 0], [0, 255, 0], [0, 0, 255]]) {
    const data = px(r, g, b);
    adjustColor(data, { saturation: 200, greenMagenta: 100, blueYellow: -100 });
    for (let i = 0; i < 3; i += 1) assert.ok(data[i] >= 0 && data[i] <= 255, `channel ${i} = ${data[i]}`);
  }
});

import { runJobs } from '../harness/render.js';
import { meanDifference, meanBrightness } from '../harness/pixels.js';
import { createRenderer, normalizeDocument } from '../../src/engine/index.js';

const QUADRANTS = 'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAHklEQVR42mXJsQ0AAAgDIOr/P9fVRFZSkMI4QtE/C5t8BQM0UanVAAAAAElFTkSuQmCC';
const base = (extra) => ({
  assets: { q: { kind: 'image', mime: 'image/png', data: QUADRANTS } },
  layers: [{ id: 'a1', type: 'image', asset: 'q', fit: 'stretch', motions: [] }],
  ...extra
});

test('colour settings reach the rendered frame, and neutral changes nothing', async () => {
  const r = Object.fromEntries((await runJobs([
    { name: 'plain', kind: 'engine', timeSec: 0, doc: base({}) },
    { name: 'neutral', kind: 'engine', timeSec: 0, doc: base({ saturation: 100, greenMagenta: 0, blueYellow: 0 }) },
    { name: 'grey', kind: 'engine', timeSec: 0, doc: base({ saturation: 0 }) },
    { name: 'magenta', kind: 'engine', timeSec: 0, doc: base({ greenMagenta: 100 }) }
  ])).map((x) => [x.name, x]));

  assert.equal(meanDifference(r.plain.pixels, r.neutral.pixels), 0, 'neutral must be byte-identical');
  assert.ok(meanDifference(r.plain.pixels, r.grey.pixels) > 5, 'saturation 0 must visibly change the frame');
  assert.ok(meanDifference(r.plain.pixels, r.magenta.pixels) > 2, 'the colour axis must visibly change the frame');
  // greying keeps overall brightness roughly where it was
  assert.ok(Math.abs(meanBrightness(r.grey.pixels) - meanBrightness(r.plain.pixels)) < 8);
});

// This is the actual proof that a neutral document is genuinely skipped,
// not merely a coincidence of the maths cancelling out: a fake ctx that
// would throw if the post-processing pass ever reads or writes pixels.
// createRenderer().render() runs synchronously in plain Node here (no
// Electron needed) because the "none" layer path never touches an <img>.
test('a neutral document never calls getImageData or putImageData', () => {
  let pixelCalls = 0;
  const ctx = {
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    fillStyle: '',
    fillRect() {},
    save() {},
    restore() {},
    getImageData() {
      pixelCalls += 1;
      throw new Error('must not read pixels back when the document is neutral');
    },
    putImageData() {
      pixelCalls += 1;
      throw new Error('must not write pixels when the document is neutral');
    }
  };

  const { doc } = normalizeDocument({ layers: [] });
  assert.equal(doc.brightness, 100);
  assert.equal(doc.saturation, 100);
  assert.equal(doc.greenMagenta, 0);
  assert.equal(doc.blueYellow, 0);

  const renderer = createRenderer();
  renderer.render(ctx, doc, new Map(), 0);

  assert.equal(pixelCalls, 0, 'the post-processing pass must be skipped entirely, not just no-op');
});

test('a non-neutral document does call getImageData and putImageData exactly once', () => {
  let getCalls = 0;
  let putCalls = 0;
  const ctx = {
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    fillStyle: '',
    fillRect() {},
    save() {},
    restore() {},
    getImageData() {
      getCalls += 1;
      return { data: new Uint8ClampedArray(4) };
    },
    putImageData() {
      putCalls += 1;
    }
  };

  const { doc } = normalizeDocument({ layers: [], saturation: 0 });
  const renderer = createRenderer();
  renderer.render(ctx, doc, new Map(), 0);

  assert.equal(getCalls, 1);
  assert.equal(putCalls, 1);
});

test('out-of-range saturation is clamped to 0..200', () => {
  let pixelCalls = 0;
  const ctx = {
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    fillStyle: '',
    fillRect() {},
    save() {},
    restore() {},
    getImageData() {
      pixelCalls += 1;
      return { data: new Uint8ClampedArray(4) };
    },
    putImageData() {
      pixelCalls += 1;
    }
  };

  // Create a document with invalid saturation by bypassing normalizeDocument
  // (simulating what applyControls does when a misconfigured control writes -500)
  const doc = {
    layers: [],
    assets: {},
    controls: [],
    version: 1,
    brightness: 100,
    saturation: -500,
    greenMagenta: 0,
    blueYellow: 0
  };

  const renderer = createRenderer();
  renderer.render(ctx, doc, new Map(), 0);

  // -500 should clamp to 0, which is different from neutral (100),
  // so the pixel pass must run
  assert.equal(pixelCalls, 2, 'clamped out-of-range saturation should not be neutral');
});

test('saturation beyond max range is clamped to 200', () => {
  let pixelCalls = 0;
  const ctx = {
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    fillStyle: '',
    fillRect() {},
    save() {},
    restore() {},
    getImageData() {
      pixelCalls += 1;
      return { data: new Uint8ClampedArray(4) };
    },
    putImageData() {
      pixelCalls += 1;
    }
  };

  const doc = {
    layers: [],
    assets: {},
    controls: [],
    version: 1,
    brightness: 100,
    saturation: 5000,
    greenMagenta: 0,
    blueYellow: 0
  };

  const renderer = createRenderer();
  renderer.render(ctx, doc, new Map(), 0);

  // 5000 should clamp to 200, which is different from neutral (100),
  // so the pixel pass must run
  assert.equal(pixelCalls, 2, 'clamped saturation > 200 should not be neutral');
});

test('non-finite greenMagenta falls back to 0 (neutral)', () => {
  let pixelCalls = 0;
  const ctx = {
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    fillStyle: '',
    fillRect() {},
    save() {},
    restore() {},
    getImageData() {
      pixelCalls += 1;
      throw new Error('must not read pixels when document falls back to neutral');
    },
    putImageData() {
      pixelCalls += 1;
      throw new Error('must not write pixels when document falls back to neutral');
    }
  };

  const doc = {
    layers: [],
    assets: {},
    controls: [],
    version: 1,
    brightness: 100,
    saturation: 100,
    greenMagenta: NaN,
    blueYellow: 0
  };

  const renderer = createRenderer();
  renderer.render(ctx, doc, new Map(), 0);

  // NaN should fall back to 0, making the document neutral, so no pixel pass
  assert.equal(pixelCalls, 0, 'non-finite greenMagenta should fall back to neutral and skip pixel pass');
});

test('out-of-range greenMagenta is clamped to -100..100', () => {
  let pixelCalls = 0;
  const ctx = {
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    fillStyle: '',
    fillRect() {},
    save() {},
    restore() {},
    getImageData() {
      pixelCalls += 1;
      return { data: new Uint8ClampedArray(4) };
    },
    putImageData() {
      pixelCalls += 1;
    }
  };

  const doc = {
    layers: [],
    assets: {},
    controls: [],
    version: 1,
    brightness: 100,
    saturation: 100,
    greenMagenta: 5000,
    blueYellow: 0
  };

  const renderer = createRenderer();
  renderer.render(ctx, doc, new Map(), 0);

  // 5000 should clamp to 100, which is different from neutral (0),
  // so the pixel pass must run
  assert.equal(pixelCalls, 2, 'clamped greenMagenta should not be neutral');
});

test('out-of-range blueYellow is clamped to -100..100', () => {
  let pixelCalls = 0;
  const ctx = {
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    fillStyle: '',
    fillRect() {},
    save() {},
    restore() {},
    getImageData() {
      pixelCalls += 1;
      return { data: new Uint8ClampedArray(4) };
    },
    putImageData() {
      pixelCalls += 1;
    }
  };

  const doc = {
    layers: [],
    assets: {},
    controls: [],
    version: 1,
    brightness: 100,
    saturation: 100,
    greenMagenta: 0,
    blueYellow: -99999
  };

  const renderer = createRenderer();
  renderer.render(ctx, doc, new Map(), 0);

  // -99999 should clamp to -100, which is different from neutral (0),
  // so the pixel pass must run
  assert.equal(pixelCalls, 2, 'clamped blueYellow should not be neutral');
});

test('non-finite blueYellow falls back to 0, and all non-finite fallbacks skip pixel pass', () => {
  let pixelCalls = 0;
  const ctx = {
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    fillStyle: '',
    fillRect() {},
    save() {},
    restore() {},
    getImageData() {
      pixelCalls += 1;
      throw new Error('must not read pixels when all color fields fall back to neutral');
    },
    putImageData() {
      pixelCalls += 1;
      throw new Error('must not write pixels when all color fields fall back to neutral');
    }
  };

  const doc = {
    layers: [],
    assets: {},
    controls: [],
    version: 1,
    brightness: 100,
    saturation: 100,
    greenMagenta: 0,
    blueYellow: Infinity
  };

  const renderer = createRenderer();
  renderer.render(ctx, doc, new Map(), 0);

  // Infinity should fall back to 0, making the document neutral, so no pixel pass
  assert.equal(pixelCalls, 0, 'non-finite blueYellow should fall back to neutral and skip pixel pass');
});
