// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max Leopold Blumenschein
// SPDX-License-Identifier: GPL-3.0-or-later

const clamp = (value, lo, hi) => (value < lo ? lo : value > hi ? hi : value);

/**
 * Turn one offset component into "how far along the axis", as a percentage,
 * 0 at one edge and 100 at the other. offset runs -1..+1 across the whole
 * croppable span, so this is just a rescale — it is what the keyboard
 * announcement below reads out to describe where the crop window sits.
 */
const percentAlong = (value) => Math.round(((value + 1) / 2) * 100);

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
 * How far one arrow-key press moves the picture, in CANVAS pixels.
 *
 * Deliberately a distance on screen and not a slice of the offset range: the
 * user is pushing a picture about, and the same offset step is worth wildly
 * different distances depending on how much of the picture is cropped away. A
 * fixed number of canvas pixels means one press always looks like the same
 * nudge, whatever picture is loaded.
 *
 * Why 4 and 40, measured rather than guessed. The canvas is 320 x 200 and, at
 * the default window size, is shown at roughly twice that — so 4 canvas
 * pixels is about 8 pixels under the eye there specifically; the canvas
 * scales with the window, so that "8 pixels" is not a constant and was never
 * the point. What is constant is the fraction of the picture: 4 canvas
 * pixels is 1.25 % of the 320-pixel width and 2 % of the 200-pixel height —
 * small enough to place a subject exactly, large enough to see that something
 * happened. One canvas pixel would be invisible at a glance.
 *
 * The press count is what settles the second number. The acceptance
 * walkthrough's picture is 800 x 200; at `cover` the engine crops 480 of its
 * columns away, which is 480 canvas pixels of travel from one end to the
 * other. At 4 pixels a press that is 120 presses end to end — unreasonable.
 * Shift multiplies by ten, so 40 pixels a press brings the same journey down
 * to 12, which is not. Shift-as-the-bigger-step is the nudge convention every
 * drawing program uses (arrow one unit, Shift+arrow ten).
 */
export const CROP_KEY_STEP = 4;
export const CROP_KEY_STEP_COARSE = CROP_KEY_STEP * 10;

/**
 * The drag one key press stands for, in canvas pixels, or null when the key is
 * none of this control's business.
 *
 * The result goes straight into offsetFromDrag() above — there is deliberately
 * no second piece of arithmetic for the keyboard, because two mappings are two
 * chances for the keyboard and the mouse to disagree about which way is right.
 * ArrowRight therefore hands over exactly what a rightward mouse drag hands
 * over (dx > 0), which is what makes the picture move the same way for both.
 *
 * A held Ctrl, Alt or Meta means the press belongs to a shortcut somewhere
 * else, so it is passed through untouched. `event` is read, not stored: this
 * takes a plain object just as happily as a real KeyboardEvent, which is what
 * lets it be tested without a DOM.
 */
export function dragFromKey(event) {
  if (event.ctrlKey || event.altKey || event.metaKey) return null;
  const step = event.shiftKey ? CROP_KEY_STEP_COARSE : CROP_KEY_STEP;
  switch (event.key) {
    case 'ArrowRight': return { dx: step, dy: 0 };
    case 'ArrowLeft': return { dx: -step, dy: 0 };
    case 'ArrowDown': return { dx: 0, dy: step };
    case 'ArrowUp': return { dx: 0, dy: -step };
    default: return null;
  }
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
 * `onChange(offset)` gets the new offset on every pointermove and on every
 * arrow-key press. It is deliberately just a value handed over, with no
 * re-render triggered here: the preview's own frame loop is already running
 * and picks the new offset up on its next frame, so a drag never renders a
 * second time in parallel with it.
 *
 * `t(key)` supplies the canvas's accessible name. It defaults to handing the
 * key straight back so this module stays usable — and testable — without the
 * language files.
 *
 * `announce(message)` is where an arrow-key press's result goes for a screen
 * reader to read out — see announceMove() below for why this exists and what
 * it says. It defaults to a no-op, again so this module needs no DOM (and no
 * caller-supplied element) to be testable. The caller owns the actual
 * live-region element because crop.js otherwise has no reason to touch
 * `document` at all; every other DOM object it deals with is `canvas` itself,
 * handed in by the caller the same way.
 *
 * Returns `{ refresh }`. Whether there is anything to move at all depends on
 * the picture and on the fit mode, and both can change long after this ran;
 * the caller says so by calling refresh(). A language switch is the third
 * reason to call it, because the accessible name is a translated string.
 */
export function mountCrop(canvas, { getLayer, onChange, t = (key) => key, announce = () => {} }) {
  let drag = null;
  /** What the canvas is currently telling assistive technology, so that the
   *  attributes are only rewritten when the answer actually changes rather
   *  than on every single pointermove. */
  let announced = { movable: null, label: null };

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

  /**
   * Say — to the eye, to the tab order and to a screen reader — whether there
   * is anything to move right now.
   *
   * The tab stop is the point of this. With `contain` or `stretch`, or with no
   * picture at all, nothing is croppable, and a tab stop that does nothing is
   * worse than no tab stop: somebody working through the window with the
   * keyboard would land on a canvas, find that no key does anything, and have
   * no way of telling that apart from a control they have not understood yet.
   * So the canvas joins the tab order exactly when a press would move
   * something, expressed by adding and removing the tabindex attribute rather
   * than parking it at -1 — -1 would leave the canvas focusable by a click,
   * which is a focus trap of a smaller kind.
   *
   * `application` is the role while it is movable, because that is precisely
   * what it then is: an element that handles its own keys and needs a screen
   * reader to pass arrow presses through to it instead of using them to walk
   * the document. It is a heavy role to reach for over a whole region; over a
   * single canvas with no content inside it, it is the honest one. When there
   * is nothing to move it goes back to being a picture, and says so.
   */
  function syncAffordance() {
    const { slackX, slackY } = slackNow();
    const movable = slackX > 0 || slackY > 0;
    // Set every time, not only on a change: a drag leaves 'grabbing' behind
    // and this is what puts the open hand back.
    canvas.style.cursor = movable ? 'grab' : '';

    const label = t(movable ? 'preview.cropLabel' : 'preview.canvasLabel');
    if (movable === announced.movable && label === announced.label) return;
    announced = { movable, label };
    canvas.setAttribute('role', movable ? 'application' : 'img');
    canvas.setAttribute('aria-label', label);
    if (movable) canvas.setAttribute('tabindex', '0');
    else canvas.removeAttribute('tabindex');
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
    if (!drag) { syncAffordance(); return; }
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
    syncAffordance();
  };

  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  /**
   * Tell a screen reader what an arrow-key press just did.
   *
   * `role="application"` (see syncAffordance() above) takes the canvas out of
   * the reader's own navigation, so without this an arrow press is not just
   * unannounced — it is completely silent to anyone not looking at the
   * screen, which is the one thing a control that swallows the keyboard must
   * never be.
   *
   * `before` and `after` are the offset the press started and ended at. When
   * they come out equal the press was swallowed (its axis has slack) but
   * changed nothing, because the crop window was already sitting at that
   * edge — that gets its own message rather than repeating a position that
   * did not move, so the edge is not mistaken for a press that did nothing.
   *
   * Only ever called from the keydown handler below, i.e. at most once per
   * press: this is deliberately not wired into pointermove or into the
   * preview's render loop, so it cannot fire on every pixel of a mouse drag
   * or on every animation frame.
   */
  function announceMove(before, after) {
    if (after.x === before.x && after.y === before.y) {
      announce(t('preview.cropEdge'));
      return;
    }
    announce(
      t('preview.cropPosition')
        .replace('{x}', String(percentAlong(after.x)))
        .replace('{y}', String(percentAlong(after.y)))
    );
  }

  /**
   * The same movement, from the keyboard.
   *
   * The current offset is read fresh on every press rather than remembered
   * from the first one, so presses accumulate through the caller's document
   * exactly the way successive drags do — and a press after the settings
   * column has moved the picture starts from where the picture actually is.
   *
   * Only a press this control genuinely owns is swallowed. A key that is not
   * an arrow, an arrow with a modifier that belongs to a shortcut, and an
   * arrow along an axis with no slack are all left alone, so nothing else in
   * the window loses a key to a canvas that had no use for it. Along an axis
   * that does have slack the press is consumed even at the very end of the
   * travel — otherwise arriving at the edge would suddenly start scrolling
   * the panel instead, which is a strange thing for a picture to do.
   */
  canvas.addEventListener('keydown', (event) => {
    const step = dragFromKey(event);
    if (!step) return;

    const { layer, slackX, slackY } = slackNow();
    if (!layer) return;
    if (!(step.dx !== 0 ? slackX > 0 : slackY > 0)) return;

    event.preventDefault();
    const before = { x: layer.offset.x, y: layer.offset.y };
    const after = offsetFromDrag({
      startOffset: before,
      dx: step.dx,
      dy: step.dy,
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
      slackX,
      slackY
    });
    onChange(after);
    announceMove(before, after);
  });

  syncAffordance();

  return { refresh: syncAffordance };
}
