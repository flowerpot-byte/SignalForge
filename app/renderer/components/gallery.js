// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import { icon } from './icons.js';
import { SUPPORTED_IMAGE_EXTENSIONS } from './drop.js';

/**
 * How an effect begins.
 *
 * This is the strip of tiles under the stage, in the place SignalRGB puts its
 * own effect gallery — and it is the answer to a complaint about this app that
 * had no answer before: there was no way to start an effect without a picture.
 * Dragging a file in was the ONLY entrance, which meant somebody who wanted a
 * plain colour or a gradient simply could not begin.
 *
 * All four tiles are real now. The three that were marked "Bald" / "Soon" when
 * this strip was first built were waiting on layer types the engine did not
 * have; it has them (src/engine/layers/solid.js and gradient.js), so the
 * badge, the dashed edge and the `disabled` are gone rather than left standing
 * as decoration. Nothing here decides what a tile MEANS: the picture tile
 * hands over a `File` and the other three hand over their own key, and
 * app/renderer/main.js turns that into a document.
 *
 * WHAT A TILE SHOWS, AND WHY IT CANNOT LIE
 *
 * Each of the three tiles that start something draws its own output on itself:
 * a real 320 x 200 canvas, the engine's own renderer, frame zero of the very
 * document pressing the tile produces. The document is not described here — it
 * is asked for (`starterDocument(kind)`, defined once in main.js and used by
 * startEffect there), so a tile and the effect it starts are the SAME data
 * passing through the SAME normalizeDocument and the SAME layer renderer.
 * There is no second description of a starting colour anywhere for the picture
 * to drift away from, which is the only reliable way to keep it honest: a hand-
 * drawn swatch, or a CSS gradient built from the same stops, would be a second
 * implementation, and this project has been bitten by exactly that before.
 * Change DEFAULT_SOLID_COLOR in src/engine/document.js and the tile changes
 * with it, without a line here being touched.
 *
 * Frame zero, once, at mount: these documents carry no motions, so they are
 * still pictures — there is nothing for a loop to animate, and three extra
 * render loops under the stage would cost frames the stage needs.
 */

/** What the file dialog offers, derived from the one list that decides it. */
const ACCEPT = SUPPORTED_IMAGE_EXTENSIONS.join(',');

/**
 * The tiles, in the order they are read.
 *
 * `starts` is the kind of effect the tile begins, and it is what `onStart`
 * receives — the picture tile has none, because it opens a file dialog
 * instead. The keys are the window's own words for the three ways of
 * beginning; what each becomes in the document (a `solid` layer, a `gradient`
 * layer with shape linear or radial) is main.js's business, and deliberately
 * not spelled out here, so this file never has to know the document's shape.
 */
export const TILES = Object.freeze([
  Object.freeze({ key: 'picture', labelKey: 'gallery.picture', glyph: 'drop', starts: null }),
  Object.freeze({ key: 'solid', labelKey: 'gallery.solid', glyph: null, starts: 'solid' }),
  Object.freeze({ key: 'linear', labelKey: 'gallery.linear', glyph: null, starts: 'linear' }),
  Object.freeze({ key: 'radial', labelKey: 'gallery.radial', glyph: null, starts: 'radial' })
]);

/**
 * Draw one tile's own output onto one tile's own canvas.
 *
 * The backing store is the engine's 320 x 200 — the same numbers the stage
 * uses and for the same reason: this IS the effect, at the only size the
 * effect exists at, and how large it happens to be shown is the stylesheet's
 * business. Scaling it down in CSS is what a preview is.
 *
 * A renderer of its own per tile, rather than one shared between them: the
 * renderer keeps scratch state per layer id, and all three starting documents
 * name their layer the same thing, so a shared one would hand a gradient the
 * buffers it built for the solid.
 */
function paintTile(canvas, SF, document_) {
  canvas.width = SF.CANVAS_WIDTH;
  canvas.height = SF.CANVAS_HEIGHT;
  const ctx = canvas.getContext('2d');
  const renderer = SF.createRenderer();
  // No assets: a solid and a gradient own no picture (see normalizeLayer in
  // src/engine/document.js), so there is nothing to load and nothing to await.
  renderer.render(ctx, SF.normalizeDocument(document_).doc, new Map(), 0);
  renderer.dispose();
}

/**
 * Put the starting gallery on screen.
 *
 * `onPicture(file)` receives the `File` the user chose, exactly as the drop
 * handler receives the one they dragged — the renderer never learns a path,
 * and only app/preload.cjs turns that File into one (see webUtils.getPathForFile
 * there). A hidden `<input type="file">` is what opens the dialog: it is the
 * one way to reach a file picker without inventing a bridge channel for it,
 * and it keeps the security shape of this app exactly as it was.
 *
 * `onStart(kind)` receives 'solid', 'linear' or 'radial'.
 *
 * `starterDocument(kind)` hands back the document that kind produces, or null
 * — see the note at the top of this file. Optional only so that a caller who
 * has no engine to hand (the stand-in DOM of a unit test) still gets a working
 * strip; the real window always passes it.
 */
export function mountGallery(container, { t, onPicture, onStart, starterDocument = () => null }) {
  const strip = document.createElement('section');
  strip.className = 'gallery';
  strip.id = 'gallery';

  const heading = document.createElement('h2');
  heading.className = 'gallery-title';
  heading.id = 'gallery-title';
  // The strip is a <section>, which is a landmark only once it has a name —
  // without this it is an anonymous region a screen reader cannot offer to jump
  // to, although the heading naming it is right there inside it.
  strip.setAttribute('aria-labelledby', heading.id);

  const rail = document.createElement('div');
  rail.className = 'gallery-rail';
  rail.id = 'gallery-rail';

  // The file dialog, kept out of the reading order: it is opened by the tile
  // above it, and a lone unlabelled file field in the tab order is a control
  // nobody can explain.
  const picker = document.createElement('input');
  picker.type = 'file';
  picker.id = 'gallery-file';
  picker.accept = ACCEPT;
  picker.className = 'visually-hidden';
  picker.tabIndex = -1;
  picker.setAttribute('aria-hidden', 'true');
  picker.addEventListener('change', () => {
    const file = picker.files && picker.files[0];
    // Cleared straight away so that choosing the SAME file twice in a row
    // still fires a change event the second time.
    picker.value = '';
    if (file) onPicture(file);
  });

  const built = TILES.map((tile) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.id = `gallery-${tile.key}`;
    button.className = 'tile';
    button.dataset.tile = tile.key;

    const art = document.createElement('span');
    art.className = `tile-art tile-art-${tile.key}`;

    const starter = tile.starts ? starterDocument(tile.starts) : null;
    if (starter) {
      const canvas = document.createElement('canvas');
      canvas.className = 'tile-canvas';
      canvas.id = `gallery-${tile.key}-preview`;
      // Decoration beside its own name: the label under it already says what
      // this is, and "a picture of a pink rectangle" is not something a screen
      // reader user needs read out.
      canvas.setAttribute('aria-hidden', 'true');
      paintTile(canvas, window.SignalForgeEngine, starter);
      art.append(canvas);
    } else {
      // The picture tile, which has nothing to preview until a file exists.
      // It shows the empty stage instead — the same sign, the same sunk
      // surface, the same dashed edge the frame above wears while it is
      // waiting. Deliberately NOT a stand-in photograph and not a pale
      // version of the other three: it is a picture of the place the file
      // goes, in the window's own vocabulary for exactly that.
      const blank = document.createElement('span');
      blank.className = 'tile-blank';
      // The three starting tiles carry no glyph at all (their picture is the
      // effect), so this only draws one where there genuinely is one. Without
      // the guard, a caller that hands over no documents to draw — a stand-in
      // DOM in a test — would fall in here for all four tiles and ask the icon
      // set for a glyph called null.
      if (tile.glyph) blank.append(icon(tile.glyph));
      art.append(blank);
    }

    const label = document.createElement('span');
    label.className = 'tile-label';

    button.append(art, label);
    button.addEventListener('click', () => (tile.starts ? onStart(tile.starts) : picker.click()));
    return { tile, button, label };
  });

  for (const item of built) rail.append(item.button);
  strip.append(heading, rail, picker);
  container.append(strip);

  function relabel() {
    heading.textContent = t('gallery.title');
    for (const item of built) item.label.textContent = t(item.tile.labelKey);
  }
  relabel();

  return { relabel, element: strip };
}
