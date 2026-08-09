// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import { coreShare, costLevel, FRAMES_PER_SECOND } from './cost.js';

const FRAME_GAP = 1000 / FRAMES_PER_SECOND;
/** Rolling average over this many frames, so the reading does not flicker. */
const COST_WINDOW = 30;

/**
 * The live preview.
 *
 * It loads the same bundle the exported effect embeds, so what is on screen
 * here is produced by the same code that will run inside SignalRGB. That is
 * the whole reason to bundle at all — see test/export/parity.test.js.
 */
export function createPreview(container, t) {
  const SF = window.SignalForgeEngine;

  const canvas = document.createElement('canvas');
  canvas.width = SF.CANVAS_WIDTH;
  canvas.height = SF.CANVAS_HEIGHT;
  canvas.id = 'preview-canvas';
  canvas.style.width = '100%';
  canvas.style.imageRendering = 'auto';

  const readout = document.createElement('p');
  readout.className = 'muted';

  container.append(canvas, readout);

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const renderer = SF.createRenderer();

  let doc = SF.normalizeDocument({}).doc;
  let assets = new Map();
  let running = false;
  let start = null;
  let lastFrame = -1e9;
  const samples = [];

  async function setDocument(next) {
    doc = SF.normalizeDocument(next).doc;
    assets = await SF.loadAssets(doc, {
      resolveUrl: (asset) => (asset.data ? `data:${asset.mime};base64,${asset.data}` : asset.file)
    });
  }

  function frame(stamp) {
    if (!running) return;
    window.requestAnimationFrame(frame);
    if (start === null) start = stamp;
    if (stamp - lastFrame < FRAME_GAP) return;
    lastFrame = stamp;

    const began = performance.now();
    renderer.render(ctx, doc, assets, (stamp - start) / 1000);
    samples.push(performance.now() - began);
    if (samples.length > COST_WINDOW) samples.shift();

    const ms = samples.reduce((a, b) => a + b, 0) / samples.length;
    readout.textContent = `${t('preview.cost')}: ${ms.toFixed(2)} ms — ${Math.round(coreShare(ms) * 100)} %`;
    readout.style.color = costLevel(ms) === 'warn' ? 'var(--warn)' : 'var(--text-muted)';
  }

  return {
    setDocument,
    start() { if (!running) { running = true; window.requestAnimationFrame(frame); } },
    stop() { running = false; },
    cost() {
      const ms = samples.length ? samples.reduce((a, b) => a + b, 0) / samples.length : 0;
      return { msPerFrame: ms, coreShare: coreShare(ms) };
    },
    canvas
  };
}
