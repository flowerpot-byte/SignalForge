// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import { BLEND_MODES, CANVAS_WIDTH, CANVAS_HEIGHT, clamp } from './document.js';
import { LAYER_RENDERERS } from './layers/index.js';
import { adjustColor, isNeutral } from './color.js';

// Per-asset watchdog: if an <img> never fires onload or onerror (a stalled
// data: URI, a browser quirk), don't let it hang the whole document forever.
const DEFAULT_ASSET_TIMEOUT_MS = 5000;

/**
 * Turn the document's assets into things a canvas can draw.
 * resolveUrl decides where the bytes come from: an embedded data URI in the
 * exported effect, or a sibling file next to it.
 */
export async function loadAssets(doc, { resolveUrl, assetTimeoutMs = DEFAULT_ASSET_TIMEOUT_MS } = {}) {
  const assets = new Map();
  const pending = [];

  for (const [id, asset] of Object.entries(doc.assets)) {
    const url = resolveUrl(asset);
    if (asset.kind === 'image') {
      pending.push(new Promise((resolve) => {
        const element = new Image();
        let settled = false;

        // setTimeout is a DOM API here, not a Node/clock read: it does not
        // make the frame this asset ends up in vary run to run, it only
        // guarantees loadAssets() itself always finishes.
        const watchdog = setTimeout(() => {
          if (settled) return;
          settled = true;
          resolve();
        }, assetTimeoutMs);

        element.onload = () => {
          if (settled) return;
          settled = true;
          clearTimeout(watchdog);
          assets.set(id, {
            kind: 'image',
            element,
            width: element.naturalWidth,
            height: element.naturalHeight
          });
          resolve();
        };
        // A broken asset must not stop the whole effect from starting.
        element.onerror = () => {
          if (settled) return;
          settled = true;
          clearTimeout(watchdog);
          resolve();
        };
        element.src = url;
      }));
    }
  }

  await Promise.all(pending);
  return assets;
}

/**
 * Brightness and colour (saturation, green-magenta, blue-yellow), applied to
 * the whole finished frame in a single pass instead of touching every layer
 * individually: it is cheaper, and it means every layer, blend mode and
 * future layer type gets the same treatment for free instead of needing its
 * own handling.
 *
 * There is no ctx.filter on the real SignalRGB host, so this is done by
 * hand: read the frame back with getImageData, adjust each colour channel,
 * write it back with putImageData. Both effects are skipped entirely when
 * neutral (brightness 100, saturation 100, greenMagenta/blueYellow 0) so the
 * default path never reads or writes a single pixel here — this runs about
 * 30 times a second, forever, and a document nobody has touched must pay
 * nothing for it.
 */
function applyFinish(ctx, doc) {
  const brightness = Number.isFinite(doc.brightness) ? clamp(doc.brightness, 0, 100) / 100 : 1;
  const color = {
    saturation: doc.saturation,
    greenMagenta: doc.greenMagenta,
    blueYellow: doc.blueYellow
  };
  if (brightness === 1 && isNeutral(color)) return;

  const frame = ctx.getImageData(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  const data = frame.data;
  if (brightness !== 1) {
    for (let i = 0; i < data.length; i += 4) {
      data[i] *= brightness;
      data[i + 1] *= brightness;
      data[i + 2] *= brightness;
    }
  }
  adjustColor(data, color);
  ctx.putImageData(frame, 0, 0);
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
        ctx.globalCompositeOperation = BLEND_MODES[layer.blend] ?? 'source-over';
        const asset = (layer.asset ? assets.get(layer.asset) : null) ?? null;

        // A layer renderer may translate/scale/clip/set filters or shadows
        // without restoring them; save/restore keeps that contained to this
        // layer instead of corrupting every layer (and frame) after it.
        ctx.save();
        renderer.render(ctx, layer, asset, timeSec, stateFor(layer, renderer));
        ctx.restore();
      }

      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';

      applyFinish(ctx, doc);

      // Drop scratch state for layers that no longer exist, so (a) the map
      // doesn't grow unbounded across an editing session, and (b) a reused
      // layer id never inherits a deleted layer's warmed-up buffers.
      const liveIds = new Set(doc.layers.map((layer) => layer.id));
      for (const id of states.keys()) {
        if (!liveIds.has(id)) states.delete(id);
      }
    },

    dispose() {
      states.clear();
    }
  };
}
