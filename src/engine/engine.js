// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import { BLEND_MODES, CANVAS_WIDTH, CANVAS_HEIGHT, MAX_TRAIL, clamp } from './document.js';
import { LAYER_RENDERERS } from './layers/index.js';
import { adjustColor, isNeutral } from './color.js';
import { hueDegrees } from './motion/hue.js';

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
 *
 * BRIGHTNESS IS A PLAIN LINEAR GAIN, 0..200
 *
 * `pixel * brightness / 100`, per channel, alpha untouched. Under 100 it
 * dims exactly as it always did; over 100 it brightens; at exactly 100 the
 * factor is exactly 1.0 in binary floating point (100/100), which is why the
 * skip above is an equality test and not an epsilon — the neutral document
 * still costs nothing.
 *
 * Linear gain rather than a curve (gamma, a soft knee, a tone map) on
 * purpose. Three reasons, in order of weight:
 *
 *  1. It is predictable. 200 means "twice the number", 150 means "half again
 *     as much", and someone who dimmed to 50 and set 200 lands back where
 *     they were. Every curve breaks at least one of those.
 *  2. It is the exact inverse of the dimming half, so the control is one
 *     continuous thing with 100 in the middle rather than two behaviours
 *     glued together at the default.
 *  3. It is free. The multiply is the loop that was already here; nothing
 *     new runs per pixel, which matters at 30 frames a second on a host
 *     whose whole canvas is 320 x 200.
 *
 * The cost is clipping: a channel already near 255 cannot get brighter, so
 * pushing hard drags bright colours towards white and can shift their hue.
 * Uint8ClampedArray clamps that on write by itself — the ceiling is the
 * format's, not a branch in this loop. That behaviour is the honest one for
 * a light strip anyway: the LED is at full power and there is nothing above
 * it.
 */
function applyFinish(ctx, doc, timeSec) {
  const brightness = Number.isFinite(doc.brightness) ? clamp(doc.brightness, 0, 200) / 100 : 1;
  const color = {
    saturation: Number.isFinite(doc.saturation) ? clamp(doc.saturation, 0, 200) : 100,
    greenMagenta: Number.isFinite(doc.greenMagenta) ? clamp(doc.greenMagenta, -100, 100) : 0,
    blueYellow: Number.isFinite(doc.blueYellow) ? clamp(doc.blueYellow, -100, 100) : 0,
    // The one axis of this pass that is not a standing setting: where the
    // colour wheel has turned to by now. It joins the other three here rather
    // than getting a pass of its own precisely because this loop already
    // exists — a hue rotation is nine multiplies inside a loop that is already
    // reading and writing the pixel, against a second full read-modify-write of
    // the frame if it stood alone. Zero degrees is neutral like the other
    // three, so the skip below still costs a document nobody has touched
    // nothing whatsoever.
    hue: hueDegrees(doc.hueShift, doc.hueCycle, timeSec)
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
 * The strongest and the weakest veil a trail can lay over the frame, as canvas
 * alpha values. Both ends were MEASURED rather than chosen by feel, in a
 * Chromium of the same build the preview and the harness run on:
 *
 * The frame counts are the measurement, and they are host-independent: a veil
 * is laid down once per drawn frame, whatever that frame costs in wall-clock
 * time. The seconds beside them are NOT a second measurement, only the frame
 * count read out at a clean 30 fps -- a host that draws faster or slower
 * runs the same number of frames in a different amount of real time.
 *
 *   alpha  frames until a full-brightness pixel reaches exactly 0   at 30 fps
 *   0.50     8                                                       0.27 s
 *   0.12    31                                                       1.03 s
 *   0.06    55                                                       1.83 s
 *   0.02   116   <- trail 100, a long ghost                          3.87 s
 *
 * (trail 1, the shortest wake worth having, is alpha 0.50.)
 *
 * THE ONE THING THAT HAD TO BE MEASURED. A veil is a multiply, and a multiply
 * in 8 bits can stall: if `value * (1 - alpha)` rounds back to `value`, the
 * pixel never fades again and the effect keeps a permanent smear of everything
 * it has ever drawn. The arithmetic says that happens below 0.5/alpha, i.e. at
 * alpha 0.02 everything under 25 would be stuck. It does NOT happen: Chromium's
 * compositor took every one of the alphas above to exactly 0, in the frame
 * counts listed, with no floor at all (work/veil-probe.cjs, and the same claim
 * is made falsifiable in test/engine/trail.test.js, which renders it). So the
 * bottom of this range is set by how long a ghost is worth having and not by
 * where the arithmetic gives out.
 */
export const TRAIL_STRONGEST_VEIL = 0.5;
export const TRAIL_WEAKEST_VEIL = 0.02;

/**
 * How opaque the black laid over the previous frame is, for a trail of 0..100.
 *
 * 1 exactly at trail 0, which is the hard clear this engine has always done —
 * and the renderer does not even use this value there, it takes the old path
 * unchanged (see render below). Above 0 the two ends are the veils named above,
 * joined GEOMETRICALLY rather than linearly, because how long a wake lasts goes
 * as 1/alpha: a straight line from 0.5 to 0.02 would spend the first eighty
 * steps of the slider between "no wake" and "barely a wake" and cram every
 * long ghost into the last twenty. On this curve each step of the slider
 * multiplies the length of the wake by the same factor, which is the same
 * reason speedToRate (motion/speed.js) is a curve and not a line.
 */
export function trailAlpha(trail) {
  const value = clamp(Number(trail) || 0, 0, MAX_TRAIL);
  if (value <= 0) return 1;
  const span = (value - 1) / (MAX_TRAIL - 1);
  return TRAIL_STRONGEST_VEIL * ((TRAIL_WEAKEST_VEIL / TRAIL_STRONGEST_VEIL) ** span);
}

/**
 * A renderer instance. It owns the per-layer scratch buffers, which is why
 * this is a factory and not a bare function.
 *
 * WITH NO TRAIL, render() IS A PURE FUNCTION OF (doc, assets, timeSec): the
 * same inputs always produce the same frame, and it never reads the clock.
 * That is still true of every document this app has been able to make until
 * now, and it is what test/export/parity.test.js compares a single frame with.
 *
 * A TRAIL DELIBERATELY GIVES THAT UP, AND ONLY THAT. Frame N is then a function
 * of (doc, assets, timeSec) AND of frame N-1, because that is what "the
 * previous picture is still faintly there" means — docs/effekt-inventur.md,
 * section C2, says so in advance and calls the price bearable. What replaces
 * the old guarantee is the honest one: two renderers that start from frame 0
 * and are given the same sequence of frames land on the same pixels, on both
 * sides. Still no clock, still no Math.random, still nothing outside the
 * document; what is gone is only the right to jump to a moment in the middle
 * and expect the same picture. test/export/parity.test.js proves both halves —
 * the single frame for a trail-free document, the whole sequence for a trailing
 * one.
 */
export function createRenderer() {
  const states = new Map();

  // Where the layers are composited while a trail is running, so the veil has
  // something of its own to accumulate on. It cannot be the visible canvas:
  // applyFinish writes the graded frame BACK to it, and the next frame's veil
  // would then be laid over a picture that had already been brightened and
  // turned once — so a brightness of 150 would compound into white within a
  // second, and a hue cycle would smear a rainbow behind itself. Keeping the
  // raw composite here and grading the copy means the finish is applied exactly
  // once to every frame, however long the wake is.
  //
  // Built on first use and kept afterwards (a 320 x 200 canvas is a quarter of
  // a megabyte, and the slider that switches this on is dragged): `primed` is
  // what actually says whether it holds a picture, so dragging the trail back
  // to 0 and up again starts from black rather than from a frame that is now
  // seconds old.
  let veil = null;
  let veilCtx = null;
  let primed = false;

  /** The canvas the layers go onto this frame, plus how to clear it. */
  function veilContext() {
    if (veilCtx === null) {
      veil = document.createElement('canvas');
      veil.width = CANVAS_WIDTH;
      veil.height = CANVAS_HEIGHT;
      // willReadFrequently, although nothing here ever calls getImageData on
      // it. The flag is what makes a browser keep a canvas on the CPU instead
      // of on the graphics card, and a wake is the one thing in this engine
      // whose result depends on the last few dozen frames of its own
      // arithmetic — so the two sides of test/export/parity.test.js have to be
      // doing that arithmetic the same way. The preview's own canvas already
      // carries the flag (app/renderer/components/preview.js) while the
      // exported effect's does not, and asking for the CPU on both sides is
      // what stops that difference from reaching the pixels.
      veilCtx = veil.getContext('2d', { willReadFrequently: true });
    }
    return veilCtx;
  }

  function stateFor(layer, renderer) {
    const existing = states.get(layer.id);
    if (existing && existing.type === layer.type) return existing.value;
    const value = renderer.createState();
    states.set(layer.id, { type: layer.type, value });
    return value;
  }

  return {
    render(ctx, doc, assets, timeSec) {
      // The one seam the whole trail hangs on: clear, or veil. Everything
      // below draws into `target`, which is the visible canvas exactly as
      // before whenever there is no trail — same object, same calls, same
      // pixels, and not one line of the old path is conditional on anything.
      const trail = Number.isFinite(doc.trail) ? clamp(doc.trail, 0, MAX_TRAIL) : 0;
      const target = trail > 0 ? veilContext() : ctx;
      if (trail <= 0) primed = false;

      target.globalAlpha = 1;
      target.globalCompositeOperation = 'source-over';
      if (trail > 0 && primed) {
        // Translucent black over what is already there: what was drawn last
        // frame stays, dimmer. The rest of this frame then draws on top of it.
        target.fillStyle = `rgba(0, 0, 0, ${trailAlpha(trail)})`;
      } else {
        // The hard clear — the only thing that has ever happened here without
        // a trail, and also the FIRST frame of one. A fresh veil canvas is
        // transparent, and veiling transparent black with translucent black
        // leaves it translucent: the copy back at the end would then let
        // whatever the visible canvas held show through it for ever. One
        // opaque fill settles that once.
        target.fillStyle = '#000';
        primed = trail > 0;
      }
      target.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      for (const layer of doc.layers) {
        if (!layer.visible || layer.opacity === 0) continue;
        const renderer = LAYER_RENDERERS.get(layer.type);
        if (!renderer) continue;

        target.globalAlpha = layer.opacity;
        target.globalCompositeOperation = BLEND_MODES[layer.blend] ?? 'source-over';
        const asset = (layer.asset ? assets.get(layer.asset) : null) ?? null;

        // A layer renderer may translate/scale/clip/set filters or shadows
        // without restoring them; save/restore keeps that contained to this
        // layer instead of corrupting every layer (and frame) after it.
        target.save();
        renderer.render(target, layer, asset, timeSec, stateFor(layer, renderer));
        target.restore();
      }

      target.globalAlpha = 1;
      target.globalCompositeOperation = 'source-over';

      // The wake stays where it accumulated and the visible canvas gets a copy
      // of it, which is then graded. drawImage rather than a pixel copy: the
      // veil canvas is opaque from its first frame (see the hard clear above),
      // so this replaces the visible frame outright, and it is the one
      // operation of the two that the host's browser accelerates.
      if (target !== ctx) {
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
        ctx.drawImage(veil, 0, 0);
      }

      applyFinish(ctx, doc, timeSec);

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
      // The wake goes with the renderer. Leaving the canvas behind would only
      // hold a quarter of a megabyte, but leaving `primed` behind would be a
      // renderer that says it holds a picture it has thrown away.
      veil = null;
      veilCtx = null;
      primed = false;
    }
  };
}
