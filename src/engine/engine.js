// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max Leopold Blumenschein
// SPDX-License-Identifier: GPL-3.0-or-later
import {
  BLEND_MODES, CANVAS_WIDTH, CANVAS_HEIGHT, MAX_TRAIL, clamp, aspectFactorOf
} from './document.js';
import { LAYER_RENDERERS } from './layers/index.js';
import { adjustColor, isNeutral } from './color.js';
import { hueDegrees } from './motion/hue.js';
import { backgroundKindOf } from './slots.js';

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
 * There are TWO wakes in this engine and the table has a column for each,
 * because a document with a background fades its wake by a different route
 * (see createRenderer below): over black the RGB channels are dimmed by
 * Chromium's compositor, over a background an ALPHA is eaten away by
 * attenuateWake's own arithmetic. The two columns being within a frame or two
 * of each other everywhere is not a coincidence and it is not a target that was
 * dialled in — see attenuateWake for why the honest rule lands there by itself
 * — but it is the reason the slider means the same thing on both paths.
 *
 *   alpha  frames until a full-brightness pixel is gone     over black   over a background
 *   0.50                                                        8            8
 *   0.12                                                       31           32
 *   0.06                                                       55           54
 *   0.02   <- trail 100, a long ghost                         116          114
 *
 * (trail 1, the shortest wake worth having, is alpha 0.50.)
 *
 * THE ONE THING THAT HAD TO BE MEASURED, AND IT ANSWERED DIFFERENTLY ON THE TWO
 * PATHS. A veil is a multiply, and a multiply in 8 bits can stall: if
 * `value * (1 - alpha)` rounds back to `value`, the pixel never fades again and
 * the effect keeps a permanent smear of everything it has ever drawn. The
 * arithmetic says that happens below 0.5/alpha, i.e. at alpha 0.02 everything
 * under 25 would be stuck.
 *
 *   OVER BLACK IT DOES NOT HAPPEN. Chromium's compositor took every one of the
 *   alphas above to exactly 0, in the frame counts listed, with no floor at all
 *   (work/veil-probe.cjs) — its source-over multiply truncates, so every step
 *   really does go down.
 *
 *   OVER A BACKGROUND IT HAPPENS, AND IT WAS MEASURED HAPPENING. Asking the
 *   same compositor to multiply an ALPHA instead stalls at exactly the
 *   predicted floor, by all four routes there are: `destination-out` and
 *   `destination-in` stop at 25/255 at alpha 0.02, and redrawing the canvas
 *   through globalAlpha (onto itself or through a scratch canvas) stops at
 *   42/255 (work/wake-probe.cjs). A wake that stops at a tenth of full
 *   coverage is a permanent milky film over everything that has ever moved, so
 *   the compositor is NOT allowed to be the thing that fades this wake.
 *   attenuateWake does the multiply itself instead, and that is the whole
 *   reason it exists.
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

  // ==========================================================================
  // THE TWO WAKES, AND WHY THERE ARE TWO OF THEM
  // ==========================================================================
  //
  // A wake is "the previous picture is still faintly there", and what "faintly"
  // has to mean depends on what is UNDERNEATH the picture.
  //
  // WITHOUT A BACKGROUND there is nothing underneath, so a fading picture fades
  // to black, and the cheapest true way to say that is to keep the composite on
  // a canvas and lay translucent black over it once a frame. That is `veil`
  // below, it is what this engine has always done, and NOT ONE BYTE OF IT
  // CHANGES — a document with no background renders exactly the pixels it
  // rendered before this was written, which is what the sequence half of
  // test/export/parity.test.js pins.
  //
  // WITH A BACKGROUND that is false, and it was false in a way that made the
  // trail slider do literally nothing (measured and pinned for a day in
  // test/engine/background-render.test.js). The veil held the whole composite,
  // and a background is part of the composite: a solid or a gradient repaints
  // all 64000 pixels every frame, so whatever the veil had preserved was gone
  // before the foreground was drawn on it.
  //
  // What a wake over a background has to be instead — and what the corpus is
  // doing, translated honestly rather than copied:
  //
  //   THE CORPUS veils in the BACKGROUND'S COLOUR (`ctx.fillStyle = bgColor +
  //   "22"`, docs/effekt-inventur.md section A2) rather than in black. That
  //   works there because their background is one flat colour that does not
  //   move. Ours moves — that is the entire point of it — and veiling a moving
  //   background with itself would low-pass its own motion: at trail 100 each
  //   frame would contribute 2 % of the picture, so a turning conic would
  //   arrive on screen as the average of the last hundred frames of itself.
  //   Mud. So the background is EXEMPT from the wake it carries.
  //
  //   THIS ENGINE therefore keeps a second canvas, `wake`, which is TRANSPARENT
  //   and holds the FOREGROUND ONLY. Each frame its alpha is eaten away a
  //   little, the background is drawn fresh on the visible canvas underneath,
  //   and the wake is composited over it. A ghost at coverage t is then exactly
  //   the figure over the background at t, so as t falls the pixel walks to the
  //   background's CURRENT colour — not to black, and not to a smeared average.
  //   Where nothing has moved the wake is empty and the background reaches the
  //   screen untouched, byte for byte.
  //
  // Two paths and not one, deliberately. Merging them would mean rendering a
  // document with no background through the transparent wake as well, over an
  // opaque black fill — mathematically the same picture, but not the same
  // BYTES, because the two roundings differ in the last step. The old path is
  // therefore kept exactly as it was for exactly the documents it already
  // served.

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

  // The other one: transparent, foreground only, composited over a background
  // that is redrawn underneath it every frame. `wakeLive` is to this what
  // `primed` is to the veil — whether it holds a picture at all — so dragging
  // the trail back to 0 and up again, or taking the background off and putting
  // it back, starts from nothing rather than from a frame that is now seconds
  // old.
  let wake = null;
  let wakeCtx = null;
  let wakeLive = false;

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

  /** The transparent one, built on first use and kept. */
  function wakeContext() {
    if (wakeCtx === null) {
      wake = document.createElement('canvas');
      wake.width = CANVAS_WIDTH;
      wake.height = CANVAS_HEIGHT;
      // willReadFrequently for the same parity reason the veil asks for it —
      // and here it is not a precaution but a statement of fact, because
      // attenuateWake reads every pixel of this canvas back on every frame.
      wakeCtx = wake.getContext('2d', { willReadFrequently: true });
    }
    return wakeCtx;
  }

  /**
   * Take `alpha` off the wake — the one piece of arithmetic in this engine that
   * is deliberately NOT left to the browser.
   *
   * Everything else in this file asks the compositor to do its multiplying,
   * because the compositor is faster and, over black, provably correct: the
   * veil reaches exactly 0 at every alpha (work/veil-probe.cjs). Asking it to
   * multiply an ALPHA instead does not: every route there is (`destination-out`,
   * `destination-in`, redrawing through globalAlpha onto itself or through a
   * scratch canvas) rounds to nearest and therefore STALLS, at 25/255 or
   * 42/255 at the weakest veil (work/wake-probe.cjs). A wake that stops at a
   * tenth of full coverage never goes away: every pixel anything has ever
   * crossed keeps a permanent haze, and after a minute of rain the whole canvas
   * has one.
   *
   * So the multiply is done here, on the alpha byte alone, with the rule that
   * makes stalling impossible:
   *
   *   next = trunc(a * (1 - alpha)), and if that did not go down, a - 1.
   *
   * TRUNCATE, NOT ROUND, is the whole fix — and it is also, as it turns out,
   * what Chromium's own source-over does over black, which is why the frame
   * counts in the table above come out within a frame or two of the ones that
   * were measured for the veil rather than needing a range of their own. The
   * `a - 1` is the belt to that braces: it is what actually runs for the last
   * forty-odd steps at a weak veil, where the multiply alone would move the
   * value by less than one whole eighth of a bit.
   *
   * RGB IS LEFT ALONE ON PURPOSE. getImageData hands back UNPREMULTIPLIED
   * pixels, so the colour of a ghost is the colour of the thing that made it,
   * whatever its coverage; only how much of it there is changes. That is what
   * makes a ghost a mixture of the figure and the background rather than a
   * darkened figure.
   *
   * Costs 0.115 ms per frame on the 320 x 200 canvas with hardware acceleration
   * off (work/wake-cost-probe.cjs) — a third of what the colour finish costs,
   * and it only runs at all for a document that has both a trail and a
   * background.
   */
  function attenuateWake(alpha) {
    const keep = 1 - alpha;
    const frame = wakeCtx.getImageData(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    const data = frame.data;
    for (let i = 3; i < data.length; i += 4) {
      const a = data[i];
      if (a === 0) continue;
      const next = (a * keep) | 0;
      data[i] = next < a ? next : a - 1;
    }
    wakeCtx.putImageData(frame, 0, 0);
  }

  function stateFor(layer, renderer) {
    const existing = states.get(layer.id);
    if (existing && existing.type === layer.type) return existing.value;
    const value = renderer.createState();
    states.set(layer.id, { type: layer.type, value });
    return value;
  }

  /**
   * Draw a run of layers onto a context, exactly as this engine always has.
   *
   * Lifted out of render() unchanged so that the two paths, and the two passes
   * of the second one, cannot drift apart into two slightly different ideas of
   * what drawing a layer means.
   */
  function drawLayers(target, layers, assets, timeSec, aspect) {
    for (const layer of layers) {
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
      // `aspect` is the document's host-stretch factor (aspectFactorOf, 1 =
      // untouched). Handed to every renderer alike; the two that draw round
      // things read it, the rest ignore an argument they never named.
      renderer.render(target, layer, asset, timeSec, stateFor(layer, renderer), aspect);
      target.restore();
    }
    target.globalAlpha = 1;
    target.globalCompositeOperation = 'source-over';
  }

  /**
   * Drop scratch state for layers that no longer exist, so (a) the map doesn't
   * grow unbounded across an editing session, and (b) a reused layer id never
   * inherits a deleted layer's warmed-up buffers.
   */
  function forgetDeadLayers(doc) {
    const liveIds = new Set(doc.layers.map((layer) => layer.id));
    for (const id of states.keys()) {
      if (!liveIds.has(id)) states.delete(id);
    }
  }

  /**
   * One frame of the wake-over-a-background path.
   *
   * THE ORDER, AND WHY IT IS THIS ORDER
   *
   *   1. the wake is attenuated — the FOREGROUND's past, one step fainter;
   *   2. the visible canvas is cleared and the background drawn on it, FRESH,
   *      with no memory of any earlier frame at all;
   *   3. the wake goes over it, so every surviving ghost is composited against
   *      the colour the background has RIGHT NOW;
   *   4. this frame's foreground is drawn;
   *   5. and it is put into the wake as well, ready to be step 1 next time.
   *
   * Nothing is copied back and forth: the visible canvas is the composite, the
   * wake is the only thing that persists, and neither is ever read by the other.
   * That also means the finish (brightness, saturation, hue) is applied to the
   * composite once, exactly as on the other path, and never compounds into the
   * wake — the trap the veil canvas exists to avoid, avoided here for free.
   *
   * THE FOREGROUND IS DRAWN TWICE, AND ONLY WHEN IT HAS TO BE. Steps 4 and 5
   * are the same layers onto two different canvases, which is a real cost — so
   * it is skipped whenever it is provably redundant, which is nearly always.
   * If every foreground layer composites source-over, then
   *
   *     (wake ⊕ foreground) over background  ==  foreground over (wake over background)
   *
   * because source-over is associative, and step 5 can simply happen BEFORE
   * step 3 and stand in for step 4 as well. The only documents that need both
   * passes are the ones with a foreground layer on a blend mode — screen,
   * multiply, lighten, add — where the foreground genuinely has to see the
   * background to blend with it. The window offers no blend control at all, so
   * that is a hand-written document, and it pays for what it asked for.
   */
  function renderOverBackground(ctx, doc, assets, timeSec, trail) {
    primed = false;                  // the other wake holds nothing now
    const aspect = aspectFactorOf(doc);
    const target = wakeContext();

    target.globalAlpha = 1;
    target.globalCompositeOperation = 'source-over';
    if (wakeLive) {
      attenuateWake(trailAlpha(trail));
    } else {
      // A canvas that has just been built is already transparent; this is for
      // the OTHER way in — a trail that was dragged to 0 and back up, or a
      // background that was taken off and put on again. Either way the picture
      // in there is stale and must not be the first frame of the new wake.
      target.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      wakeLive = true;
    }

    // layers[0] is the background and everything above it is the foreground —
    // the convention src/engine/slots.js owns, read here and nowhere else in
    // this file.
    const background = doc.layers.slice(0, 1);
    const foreground = doc.layers.slice(1);
    const needsSecondPass = foreground.some((layer) => layer.visible !== false
      && layer.opacity !== 0
      && (BLEND_MODES[layer.blend] ?? 'source-over') !== 'source-over');

    if (!needsSecondPass) drawLayers(target, foreground, assets, timeSec, aspect);

    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    drawLayers(ctx, background, assets, timeSec, aspect);

    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(wake, 0, 0);

    if (needsSecondPass) {
      drawLayers(ctx, foreground, assets, timeSec, aspect);
      drawLayers(target, foreground, assets, timeSec, aspect);
    }
  }

  return {
    render(ctx, doc, assets, timeSec) {
      // The one seam the whole trail hangs on: clear, or veil. Everything
      // below draws into `target`, which is the visible canvas exactly as
      // before whenever there is no trail — same object, same calls, same
      // pixels, and not one line of the old path is conditional on anything.
      // Coerced the same way hueDegrees coerces hueShift (motion/hue.js): a
      // control panel can hand back a numeric string ("50"), and Number.isFinite
      // on the raw field would refuse that silently rather than reading it.
      const trailNumber = Number(doc.trail);
      const trail = Number.isFinite(trailNumber) ? clamp(trailNumber, 0, MAX_TRAIL) : 0;

      // WHICH WAKE THIS DOCUMENT GETS. A background is a POSITION and not a
      // flag (see src/engine/slots.js), and the only two layer types that can
      // hold that position are the two that cover the canvas at every setting —
      // which are exactly the two that used to swallow the wake whole. So the
      // question "is there something under the foreground that repaints every
      // pixel" and the question "does this document have a background" are the
      // same question, and backgroundKindOf already answers it.
      //
      // Anything else — one layer, or a hand-written document whose first layer
      // is a picture or a figure — takes the old path untouched.
      if (trail > 0 && backgroundKindOf(doc.layers) !== 'none') {
        renderOverBackground(ctx, doc, assets, timeSec, trail);
        applyFinish(ctx, doc, timeSec);
        forgetDeadLayers(doc);
        return;
      }
      wakeLive = false;

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

      drawLayers(target, doc.layers, assets, timeSec, aspectFactorOf(doc));

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
      forgetDeadLayers(doc);
    },

    dispose() {
      states.clear();
      // The wakes go with the renderer. Leaving the canvases behind would only
      // hold half a megabyte, but leaving `primed` or `wakeLive` behind would be
      // a renderer that says it holds a picture it has thrown away.
      veil = null;
      veilCtx = null;
      primed = false;
      wake = null;
      wakeCtx = null;
      wakeLive = false;
    }
  };
}
