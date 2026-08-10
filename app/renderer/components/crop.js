// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later

const clamp = (value, lo, hi) => (value < lo ? lo : value > hi ? hi : value);

/**
 * Turn a drag in canvas pixels into a new crop offset.
 *
 * The picture follows the pointer, so dragging right must move the crop
 * window LEFT — that is why dx is subtracted rather than added. Getting this
 * backwards feels wrong instantly, which is why there is a test for it.
 *
 * slackX / slackY say how far the crop window can travel from the centre in
 * one direction, measured in canvas pixels. That distance is by definition
 * what one whole unit of offset is worth (offset runs -1..+1 across the whole
 * croppable span, so 0 -> +1 covers half of it), which is why the whole
 * mapping is just `dx / slackX`. With no slack on an axis the offset there
 * cannot move at all.
 *
 * canvasWidth / canvasHeight are part of the agreed signature but are
 * deliberately not read here: the canvas size is already folded into
 * slackX / slackY by cropSlack(), which converts the engine's source-pixel
 * slack into canvas pixels. Dividing by the canvas size again here would
 * count it twice. They stay in the signature because callers pass them and
 * because the numbers only mean anything relative to a stated canvas — please
 * do not "fix" this by using them.
 */
export function offsetFromDrag({ startOffset, dx, dy, canvasWidth, canvasHeight, slackX, slackY }) {
  return {
    x: slackX > 0 ? clamp(startOffset.x - dx / slackX, -1, 1) : startOffset.x,
    y: slackY > 0 ? clamp(startOffset.y - dy / slackY, -1, 1) : startOffset.y
  };
}

/**
 * How far the crop window can travel from the centre, per axis, in canvas
 * pixels — i.e. what an offset change of exactly 1 is worth on screen.
 *
 * The engine's computeSourceRect() is the authority on what an offset means,
 * so this asks it rather than re-deriving the fit rules. It is read off
 * `window.SignalForgeEngine` (the bundle index.html loads) and never imported
 * from src/engine/**: the preview and the exported effect must provably run
 * the same bundle — see test/export/parity.test.js.
 *
 * In source-image pixels the engine crops away `srcW - sw` horizontally and
 * slides the window across all of it as offsetX runs -1..+1. One canvas pixel
 * is `sw / dw` source pixels, so that span is `(srcW - sw) * dw / sw` canvas
 * pixels wide; halving it gives the reach in ONE direction from the centre.
 * `contain` and `stretch` show the whole picture, so both come out at 0.
 */
export function cropSlack({ sourceWidth, sourceHeight, canvasWidth, canvasHeight, fit }) {
  const none = { slackX: 0, slackY: 0 };
  // computeSourceRect() throws on a non-positive size. A layer whose picture
  // has not loaded (or failed to) simply is not draggable.
  if (!(sourceWidth > 0 && sourceHeight > 0 && canvasWidth > 0 && canvasHeight > 0)) return none;

  const rect = window.SignalForgeEngine.computeSourceRect({
    srcW: sourceWidth,
    srcH: sourceHeight,
    dstW: canvasWidth,
    dstH: canvasHeight,
    fit,
    offsetX: 0,
    offsetY: 0
  });

  return {
    slackX: ((sourceWidth - rect.sw) * (rect.dw / rect.sw)) / 2,
    slackY: ((sourceHeight - rect.sh) * (rect.dh / rect.sh)) / 2
  };
}

/**
 * Let the user drag inside the preview to choose which part of the picture
 * is shown.
 *
 * `getLayer()` returns the draggable image layer as
 * `{ fit, offset: { x, y }, sourceWidth, sourceHeight }`, or null when there
 * is nothing to drag. The source size has to come from the caller because a
 * normalized document does not carry it (normalizeDocument keeps only the
 * asset's kind, mime and bytes) — the importer hands it back and the caller
 * remembers it.
 *
 * `onChange(offset)` gets the new offset on every pointermove. It is
 * deliberately just a value handed over, with no re-render triggered here:
 * the preview's own frame loop is already running and picks the new offset up
 * on its next frame, so a drag never renders a second time in parallel with
 * it.
 */
export function mountCrop(canvas, { getLayer, onChange }) {
  let drag = null;

  function slackNow() {
    const layer = getLayer();
    if (!layer) return { layer: null, slackX: 0, slackY: 0 };
    const slack = cropSlack({
      sourceWidth: layer.sourceWidth,
      sourceHeight: layer.sourceHeight,
      // Never hard-code 320x200: the canvas was sized from the engine's
      // CANVAS_WIDTH / CANVAS_HEIGHT and stays the single source of truth.
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
      fit: layer.fit
    });
    return { layer, ...slack };
  }

  /**
   * Screen pixels per canvas pixel. The canvas is displayed larger than its
   * pixel grid (`style.width: 100%`), so a raw clientX difference would move
   * the crop much too far.
   */
  function toCanvasPixels() {
    const box = canvas.getBoundingClientRect();
    return {
      x: box.width > 0 ? canvas.width / box.width : 1,
      y: box.height > 0 ? canvas.height / box.height : 1
    };
  }

  /** Show a hand only where dragging actually does something. */
  function restCursor() {
    const { slackX, slackY } = slackNow();
    canvas.style.cursor = slackX > 0 || slackY > 0 ? 'grab' : '';
  }

  canvas.addEventListener('pointerdown', (event) => {
    const { layer, slackX, slackY } = slackNow();
    if (!layer || (slackX <= 0 && slackY <= 0)) return;

    drag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startOffset: { x: layer.offset.x, y: layer.offset.y },
      slackX,
      slackY
    };
    // Capture so the drag survives the pointer leaving the canvas — letting
    // go outside the preview must still end the drag, not strand it.
    canvas.setPointerCapture(event.pointerId);
    canvas.style.cursor = 'grabbing';
    event.preventDefault();
  });

  canvas.addEventListener('pointermove', (event) => {
    if (!drag) { restCursor(); return; }
    if (event.pointerId !== drag.pointerId) return;

    const factor = toCanvasPixels();
    onChange(offsetFromDrag({
      startOffset: drag.startOffset,
      dx: (event.clientX - drag.startX) * factor.x,
      dy: (event.clientY - drag.startY) * factor.y,
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
      slackX: drag.slackX,
      slackY: drag.slackY
    }));
  });

  const endDrag = (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    // The browser releases an implicit capture on pointerup by itself, and
    // releasing a pointer that is no longer captured throws — so ask first.
    if (canvas.hasPointerCapture(drag.pointerId)) canvas.releasePointerCapture(drag.pointerId);
    drag = null;
    restCursor();
  };

  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
}
