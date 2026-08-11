// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import { coreShare, costLevel, FRAMES_PER_SECOND } from './cost.js';
import { SUPPORTED_IMAGE_EXTENSIONS } from './drop.js';
import { icon } from './icons.js';

const FRAME_GAP = 1000 / FRAMES_PER_SECOND;
/** Rolling average over this many frames, so the reading does not flicker. */
const COST_WINDOW = 30;

/**
 * What the empty frame promises it will take, derived from the one list that
 * decides it (isSupportedImage in components/drop.js) rather than written out
 * again here. A second list would be a promise nothing keeps: add ".avif" to
 * the importer and an invitation typed out by hand goes on naming five
 * formats while the app accepts six.
 */
const SUPPORTED_FORMATS = SUPPORTED_IMAGE_EXTENSIONS
  .map((extension) => extension.slice(1).toUpperCase())
  .join(', ');

/**
 * The live preview.
 *
 * It loads the same bundle the exported effect embeds, so what is on screen
 * here is produced by the same code that will run inside SignalRGB. That is
 * the whole reason to bundle at all — see test/export/parity.test.js.
 *
 * @param {*} container
 * @param {(key: string) => string} t
 * @param {(callback: (stamp: number) => void) => void} [requestFrame] The
 *   frame scheduler, defaulting to the real `window.requestAnimationFrame`.
 *   Tests inject a fake so they can control exactly when frames run and
 *   interleave a stale pending frame with a fresh `start()` — see
 *   test/app/preview-loop.test.js.
 */
export function createPreview(container, t, requestFrame = (cb) => window.requestAnimationFrame(cb)) {
  const SF = window.SignalForgeEngine;

  const canvas = document.createElement('canvas');
  // The backing store is the engine's, always: this is what SignalRGB samples
  // per LED, and only the size the canvas is DISPLAYED at is the window's
  // business (see .viewport in styles/app.css, and toCanvasPixels() in
  // components/crop.js, which converts screen pixels back through it).
  canvas.width = SF.CANVAS_WIDTH;
  canvas.height = SF.CANVAS_HEIGHT;
  canvas.id = 'preview-canvas';
  canvas.style.imageRendering = 'auto';

  // The frame around the picture, and the caption that belongs to it. The
  // readout used to be a loose line of text drifting below the canvas with
  // several hundred pixels of panel under it; it is now a chip attached to
  // the frame, opposite a second chip stating what the effect actually is.
  const stage = document.createElement('div');
  stage.className = 'stage';
  const inner = document.createElement('div');
  inner.className = 'stage-inner';
  const viewport = document.createElement('div');
  viewport.className = 'viewport';
  const meta = document.createElement('div');
  meta.className = 'stage-meta';

  // Not a translated string and deliberately not one: it is the engine's own
  // two numbers, which mean the same in every language.
  const size = document.createElement('p');
  size.className = 'chip';
  size.id = 'preview-size';
  size.textContent = `${SF.CANVAS_WIDTH} × ${SF.CANVAS_HEIGHT}`;

  const readout = document.createElement('p');
  readout.className = 'chip';
  readout.id = 'preview-cost';

  // The invitation lives INSIDE the frame, because the frame is what you are
  // being invited to use. It used to sit under the frame, below a rule, which
  // made the two read as separate objects — a large empty dashed rectangle
  // with an unrelated caption beneath it — and that is the first thing anybody
  // sees when they open the app. It says what to do and what is accepted; the
  // stylesheet takes it away again the moment there is a picture.
  const empty = document.createElement('div');
  empty.className = 'stage-empty';
  empty.id = 'preview-empty';
  // The one glyph in the empty state, and the only place in this window where
  // an icon is bigger than 16px: it is the sign for the gesture the two lines
  // under it are describing, so it is decoration beside its own words and is
  // hidden from the accessibility tree.
  const sign = icon('drop');
  sign.classList.add('stage-empty-sign');
  const invitation = document.createElement('p');
  invitation.className = 'stage-empty-title';
  invitation.id = 'preview-empty-title';
  const formats = document.createElement('p');
  formats.className = 'stage-empty-formats';
  formats.id = 'preview-empty-formats';
  empty.append(sign, invitation, formats);

  // What is on the stage, said under it — the effect's own name, with the two
  // readings that belong to the frame opposite it. This is the caption the
  // reference puts under its stage, and it is the reason the name is worth
  // showing large: it is the name of the file SignalRGB will list.
  const title = document.createElement('h2');
  title.className = 'stage-title';
  title.id = 'preview-title';

  const readings = document.createElement('div');
  readings.className = 'stage-readings';
  readings.append(size, readout);

  viewport.append(canvas, empty);
  meta.append(title, readings);
  inner.append(viewport, meta);
  stage.append(inner);
  container.append(stage);

  // Whether an import is in flight — see setLoading below. Read by relabel()
  // too, so a language switch mid-import (the settings column is reachable
  // the whole time an import runs) leaves the loading line saying "wird
  // geladen" and not the resting drop hint in the wrong language.
  let loading = false;

  /** The two lines of the empty state, in the language now in force. */
  function relabel() {
    invitation.textContent = t(loading ? 'preview.loading' : 'preview.dropHint');
    formats.textContent = t('preview.dropFormats').replace('{formats}', SUPPORTED_FORMATS);
  }
  relabel();

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const renderer = SF.createRenderer();

  let doc = SF.normalizeDocument({}).doc;
  let assets = new Map();
  let running = false;
  let start = null;
  let lastFrame = -1e9;
  const samples = [];

  // A plain `running` flag is not enough to kill a stale requestAnimationFrame
  // chain: between a stop() and a fast start(), a frame already pending from
  // the OLD chain would see `running === true` again (set by the new start())
  // and reschedule itself, so two chains render in parallel and double the
  // cost samples. Each start() mints a new generation and captures it in the
  // scheduled closure; a frame whose captured generation is stale returns
  // without rendering and without rescheduling, so it dies on its own instead
  // of relying on the shared flag. stop() also bumps the generation so any
  // frame already in flight is invalidated even before the next start().
  let generation = 0;

  /**
   * Show a different document — both halves of it, or neither.
   *
   * Building the new document and its assets first and committing them only
   * once both exist is the whole point. Assigning `doc` before awaiting the
   * assets would leave the window rendering the NEW document's layers against
   * the PREVIOUS picture for as long as the load takes, and permanently if it
   * rejects or hits loadAssets' watchdog — with the crop drag computing its
   * slack from the wrong source size all the while. openProject (see
   * app/renderer/main.js) is built on exactly this promise: it measures the
   * pictures first so a file that cannot be used leaves the project already
   * open alone, and that guarantee has to survive its last step too.
   *
   * The rejection is deliberately not swallowed: every caller — the drop path,
   * openProject, the settings column's motion list — turns it into the one
   * visible line of feedback.
   */
  async function setDocument(next) {
    const nextDoc = SF.normalizeDocument(next).doc;
    const nextAssets = await SF.loadAssets(nextDoc, {
      resolveUrl: (asset) => (asset.data ? `data:${asset.mime};base64,${asset.data}` : asset.file)
    });
    doc = nextDoc;
    assets = nextAssets;
  }

  function frame(gen, stamp) {
    if (gen !== generation) return;
    requestFrame((nextStamp) => frame(gen, nextStamp));
    if (start === null) start = stamp;
    if (stamp - lastFrame < FRAME_GAP) return;
    lastFrame = stamp;

    const began = performance.now();
    renderer.render(ctx, doc, assets, (stamp - start) / 1000);
    samples.push(performance.now() - began);
    if (samples.length > COST_WINDOW) samples.shift();

    const ms = samples.reduce((a, b) => a + b, 0) / samples.length;
    readout.textContent = `${t('preview.cost')}: ${ms.toFixed(2)} ms — ${Math.round(coreShare(ms) * 100)} %`;
    // A class rather than an inline colour, so the one place that decides what
    // "too expensive" looks like is the stylesheet.
    readout.classList.toggle('cost-warn', costLevel(ms) === 'warn');
  }

  return {
    relabel,
    /**
     * The name under the stage. Set from the document every time one arrives
     * — a drop, an opened project — and as the name field is typed in, so the
     * caption and the field can never disagree about what is being built.
     */
    setTitle(text) { title.textContent = text ?? ''; },
    setDocument,
    /**
     * The gap between a drop (or a chosen file) and the picture actually
     * landing — sf:importImage runs in the main process and takes on the
     * order of half a second, and until now the stage said nothing for the
     * whole of it. This is the frame's own quiet "wird geladen" condition,
     * not a spinner: the border and the empty state's sign and formats line
     * dim (see .is-loading in styles/app.css), and while there is nothing on
     * the stage yet the invitation swaps from "drop an image" to "loading".
     *
     * Deliberately not a new element and not a new vocabulary — it reuses the
     * frame the empty state and drop-active already draw, one step further
     * along the same gesture: drag-over lights the edge, the drop resolves
     * that into this, and the picture (or the one visible error line)
     * replaces it in turn.
     *
     * The caller — importFile in app/renderer/main.js — is the one place that
     * can promise this is always cleared: it sets loading true only after
     * asking about unsaved work, and clears it in a `finally` that runs on
     * every exit (the picture lands, the import is refused, or it throws), so
     * there is no path that leaves the frame saying "loading" forever.
     *
     * A picture already on the stage is dimmed rather than hidden (see
     * `#preview-canvas` in styles/app.css) — replacing a picture reads the
     * same as arriving at an empty stage the first time, not as a different
     * gesture.
     *
     * No flash on a fast import: the class is set the instant the gesture is
     * acknowledged, exactly as loading starts, but the visible change is a
     * CSS transition (--motion-state, ease-out) rather than an instant swap.
     * An import under --motion-state's own duration therefore never reaches
     * full opacity before it is cleared again and eases back out — a soft
     * blip rather than an on/off flicker — so nothing here is skipped for a
     * small file; the transition itself absorbs the case.
     */
    setLoading(isLoading) {
      loading = Boolean(isLoading);
      container.classList.toggle('is-loading', loading);
      invitation.textContent = t(loading ? 'preview.loading' : 'preview.dropHint');
    },
    /**
     * The live document the loop renders, handed out so there is exactly one
     * of it. The crop drag reads the layer's fit and offset from here and the
     * settings column reads and writes its values here; a second copy kept
     * alongside would only be a copy waiting to go stale (it was, until the
     * settings column became a second writer). Whoever writes into it must
     * keep to what normalizeDocument accepts — every path the settings column
     * writes goes through the engine's own setByPath for exactly that reason.
     */
    document() { return doc; },
    /**
     * Move one image layer's crop window, in place.
     *
     * Deliberately NOT setDocument(): that replaces the document and reloads
     * every asset, i.e. decodes the picture again — and this runs on every
     * single pointermove of a crop drag (see components/crop.js). Writing
     * into the live document instead means the frame the render loop has
     * already scheduled picks the new offset up on its own: no extra render
     * call, no second loop, nothing for the drag and the loop to fight over.
     */
    setLayerOffset(id, offset) {
      const layer = doc.layers.find((entry) => entry.id === id);
      if (!layer || !layer.offset) return;
      layer.offset.x = SF.clamp(offset.x, -1, 1);
      layer.offset.y = SF.clamp(offset.y, -1, 1);
    },
    start() {
      if (running) return;
      running = true;
      generation += 1;
      const gen = generation;
      requestFrame((stamp) => frame(gen, stamp));
    },
    stop() {
      running = false;
      generation += 1;
    },
    cost() {
      const ms = samples.length ? samples.reduce((a, b) => a + b, 0) / samples.length : 0;
      return { msPerFrame: ms, coreShare: coreShare(ms) };
    },
    canvas
  };
}
