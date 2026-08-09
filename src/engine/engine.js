// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import { BLEND_MODES, CANVAS_WIDTH, CANVAS_HEIGHT } from './document.js';
import { LAYER_RENDERERS } from './layers/index.js';

/**
 * Turn the document's assets into things a canvas can draw.
 * resolveUrl decides where the bytes come from: an embedded data URI in the
 * exported effect, or a sibling file next to it.
 */
export async function loadAssets(doc, { resolveUrl }) {
  const assets = new Map();
  const pending = [];

  for (const [id, asset] of Object.entries(doc.assets)) {
    const url = resolveUrl(asset);
    if (asset.kind === 'image') {
      pending.push(new Promise((resolve) => {
        const element = new Image();
        element.onload = () => {
          assets.set(id, {
            kind: 'image',
            element,
            width: element.naturalWidth,
            height: element.naturalHeight
          });
          resolve();
        };
        // A broken asset must not stop the whole effect from starting.
        element.onerror = () => resolve();
        element.src = url;
      }));
    }
  }

  await Promise.all(pending);
  return assets;
}

/**
 * A renderer instance. It owns the per-layer scratch buffers, which is why
 * this is a factory and not a bare function.
 *
 * render() is a pure function of (doc, assets, timeSec) as far as output goes:
 * the same inputs always produce the same frame. It never reads the clock.
 */
export function createRenderer() {
  const states = new Map();

  function stateFor(layer, renderer) {
    const existing = states.get(layer.id);
    if (existing && existing.type === layer.type) return existing.value;
    const value = renderer.createState();
    states.set(layer.id, { type: layer.type, value });
    return value;
  }

  return {
    render(ctx, doc, assets, timeSec) {
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      for (const layer of doc.layers) {
        if (!layer.visible || layer.opacity === 0) continue;
        const renderer = LAYER_RENDERERS.get(layer.type);
        if (!renderer) continue;

        ctx.globalAlpha = layer.opacity;
        ctx.globalCompositeOperation = BLEND_MODES[layer.blend];
        const asset = layer.asset ? assets.get(layer.asset) : null;
        renderer.render(ctx, layer, asset, timeSec, stateFor(layer, renderer));
      }

      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    },

    dispose() {
      states.clear();
    }
  };
}
