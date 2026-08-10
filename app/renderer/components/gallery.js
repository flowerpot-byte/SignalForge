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
 * WHAT IS REAL HERE AND WHAT IS NOT
 *
 * The picture tile is wired up and works: it hands a real `File` to the same
 * import path a drop uses, so the file dialog and drag-and-drop end up in
 * exactly the same place. The solid-colour and gradient tiles are NOT built —
 * they need layer types the engine does not have yet, which is a separate and
 * much larger piece of work than this one.
 *
 * They are still on screen, because a starting gallery with one tile in it
 * teaches nothing about where this is going. They are marked as unbuilt in
 * four ways at once, so that no one of them has to carry the honesty on its
 * own:
 *
 *   1. the tile is a real `<button disabled>` — it cannot be pressed, cannot
 *      be tabbed to, and reports itself as disabled to a screen reader;
 *   2. it carries a visible badge, in words, in the window's language
 *      ("Bald" / "Soon") with a small clock icon beside it;
 *   3. that badge is INSIDE the button, so it is part of the accessible name:
 *      the tile announces itself as "Farbfläche, bald, dimmed";
 *   4. it is drawn at reduced opacity with a dashed edge, against the solid
 *      edge every working tile has.
 *
 * What it deliberately is NOT: a tile that looks exactly like the working one
 * and does nothing when pressed, or a tile that opens a "coming soon" message.
 * Both are a picture of an interface rather than an interface.
 */

/** What the file dialog offers, derived from the one list that decides it. */
const ACCEPT = SUPPORTED_IMAGE_EXTENSIONS.join(',');

/**
 * The tiles, in the order they are read.
 *
 * `ready: true` means the tile does something today. Everything else is
 * described here exactly as it will be built, so the strip is a plan rather
 * than a set of placeholders — and so that turning one on later is a change to
 * `ready` plus a handler, not a redesign.
 */
export const TILES = Object.freeze([
  Object.freeze({ key: 'picture', labelKey: 'gallery.picture', glyph: 'imagePlus', ready: true }),
  Object.freeze({ key: 'solid', labelKey: 'gallery.solid', glyph: 'solid', ready: false }),
  Object.freeze({ key: 'linear', labelKey: 'gallery.linear', glyph: 'gradient', ready: false }),
  Object.freeze({ key: 'radial', labelKey: 'gallery.radial', glyph: 'gradient', ready: false })
]);

/**
 * Put the starting gallery on screen.
 *
 * `onPicture(file)` receives the `File` the user chose, exactly as the drop
 * handler receives the one they dragged — the renderer never learns a path,
 * and only app/preload.cjs turns that File into one (see webUtils.getPathForFile
 * there). A hidden `<input type="file">` is what opens the dialog: it is the
 * one way to reach a file picker without inventing a bridge channel for it,
 * and it keeps the security shape of this app exactly as it was.
 */
export function mountGallery(container, { t, onPicture }) {
  const strip = document.createElement('section');
  strip.className = 'gallery';
  strip.id = 'gallery';

  const heading = document.createElement('h2');
  heading.className = 'gallery-title';
  heading.id = 'gallery-title';

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
    button.className = tile.ready ? 'tile' : 'tile tile-soon';
    button.dataset.tile = tile.key;

    const art = document.createElement('span');
    art.className = `tile-art tile-art-${tile.key}`;
    art.append(icon(tile.glyph));

    const label = document.createElement('span');
    label.className = 'tile-label';

    const badge = document.createElement('span');
    badge.className = 'tile-badge';

    button.append(art, label);
    if (!tile.ready) {
      badge.append(icon('soon'));
      const word = document.createElement('span');
      word.className = 'tile-badge-word';
      badge.append(word);
      button.append(badge);
      // Not merely styled as unavailable: genuinely unpressable, out of the
      // tab order, and announced as disabled.
      button.disabled = true;
      return { tile, button, label, word };
    }

    button.addEventListener('click', () => picker.click());
    return { tile, button, label, word: null };
  });

  for (const item of built) rail.append(item.button);
  strip.append(heading, rail, picker);
  container.append(strip);

  function relabel() {
    heading.textContent = t('gallery.title');
    for (const item of built) {
      item.label.textContent = t(item.tile.labelKey);
      if (item.word) item.word.textContent = t('gallery.soon');
    }
  }
  relabel();

  return { relabel, element: strip };
}
