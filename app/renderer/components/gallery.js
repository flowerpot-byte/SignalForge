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
  Object.freeze({ key: 'picture', labelKey: 'gallery.picture', glyph: 'imagePlus', starts: null }),
  Object.freeze({ key: 'solid', labelKey: 'gallery.solid', glyph: 'solid', starts: 'solid' }),
  Object.freeze({ key: 'linear', labelKey: 'gallery.linear', glyph: 'gradient', starts: 'linear' }),
  Object.freeze({ key: 'radial', labelKey: 'gallery.radial', glyph: 'radial', starts: 'radial' })
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
 *
 * `onStart(kind)` receives 'solid', 'linear' or 'radial'.
 */
export function mountGallery(container, { t, onPicture, onStart }) {
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
    button.className = 'tile';
    button.dataset.tile = tile.key;

    const art = document.createElement('span');
    art.className = `tile-art tile-art-${tile.key}`;
    art.append(icon(tile.glyph));

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
