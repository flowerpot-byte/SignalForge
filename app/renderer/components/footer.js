// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import { icon } from './icons.js';

/**
 * The transport bar: what is loaded, where it is going, and the button that
 * sends it.
 *
 * It has the shape SignalRGB's own bottom bar has, because it is doing the
 * same job: a thumbnail of the thing that is loaded and its two lines of
 * identity on the left, the actions on the right, the one that matters
 * furthest out. What it is NOT any more is a settings panel with buttons on
 * the end — the language switch and the effects folder have gone to the
 * settings column where they belong (see components/appsettings.js), which is
 * the only reason this row can be a transport bar at all.
 *
 * The thumbnail is the picture's three strongest colours rather than the
 * picture itself, and that is a decision rather than a shortcut: this app
 * makes light, the chip is 40px across, and a 320 x 200 crop shrunk to 40px is
 * mush — whereas three bands of the colour the desk is actually going to be
 * are legible at that size and are the thing being previewed. With no picture
 * loaded it is a quiet outline holding the app's own mark, so the bar is never
 * a row with a hole at the start of it.
 *
 * Deliberately free of decisions, as before. It reports what the user did and
 * shows what it is told. Every handler passed in is expected to carry its own
 * error handling already — these are click callbacks with nobody awaiting
 * them.
 *
 * Ids are stable and spelled out (`footer-export`, `footer-save`, ...): the
 * self-test and the acceptance walkthrough drive these very buttons, and
 * finding them by their place in the row is a test that breaks every time a
 * button is added.
 */
export function mountFooter(container, {
  t, onNameChange, onExport, onOverwrite, onSave, onOpen
}) {
  container.replaceChildren();

  // ------------------------------------------------------------- what is loaded
  const now = document.createElement('div');
  now.className = 'transport-now';

  const thumb = document.createElement('div');
  thumb.className = 'transport-thumb';
  thumb.id = 'footer-thumb';
  thumb.append(icon('mark'));

  const identity = document.createElement('div');
  identity.className = 'transport-identity';

  const nameRow = document.createElement('div');
  nameRow.className = 'transport-name-row';

  const nameLabel = document.createElement('label');
  nameLabel.htmlFor = 'footer-name';
  nameLabel.className = 'transport-name-label';

  const name = document.createElement('input');
  name.type = 'text';
  name.id = 'footer-name';
  name.className = 'transport-name';
  name.addEventListener('input', () => onNameChange(name.value));
  nameRow.append(nameLabel, name);

  // Where it is going. The second line of the identity block, exactly where
  // the reference puts the author of the effect it is showing.
  const target = document.createElement('span');
  target.id = 'footer-target';
  target.className = 'transport-target';
  let lastTarget = {};

  identity.append(nameRow, target);
  now.append(thumb, identity);

  // ------------------------------------------------------------------ actions
  function button(id, glyph, className) {
    const element = document.createElement('button');
    element.type = 'button';
    element.id = id;
    if (className) element.className = className;
    const word = document.createElement('span');
    // The icon is decoration: the word is right beside it, so announcing the
    // glyph as well would say everything twice.
    element.append(icon(glyph), word);
    return { element, word };
  }

  const open = button('footer-open', 'folder', 'quiet');
  open.element.addEventListener('click', onOpen);
  const save = button('footer-save', 'save', 'quiet');
  save.element.addEventListener('click', onSave);
  const overwrite = button('footer-overwrite', 'save', 'warn-outline');
  overwrite.element.addEventListener('click', onOverwrite);
  // Only ever on screen while there is a question waiting to be answered, so
  // it can never be pressed for an export nobody asked about.
  overwrite.element.hidden = true;
  const exportButton = button('footer-export', 'spark', 'primary');
  exportButton.element.addEventListener('click', onExport);

  const actions = document.createElement('div');
  actions.className = 'transport-actions';
  // The order is the reading order and the tab order at once, running from the
  // quiet actions to the one the whole app exists for. The overwrite answer
  // sits directly beside the export it belongs to.
  actions.append(open.element, save.element, overwrite.element, exportButton.element);

  container.append(now, actions);

  /**
   * Say everything again in whatever language `t` now speaks.
   *
   * In place rather than by rebuilding: rebuilding would throw away the typed
   * name, any pending overwrite question and the keyboard focus, none of which
   * has anything to do with the language.
   */
  function relabel() {
    nameLabel.textContent = t('footer.name');
    exportButton.word.textContent = t('footer.export');
    overwrite.word.textContent = t('export.overwrite');
    save.word.textContent = t('footer.save');
    open.word.textContent = t('footer.open');
    setTarget(lastTarget);
  }

  /**
   * Where the export will land, and how that was decided — a folder the user
   * picked reads differently from one the app went looking for, and "none
   * found" has to be visible before the button is pressed rather than only
   * after.
   */
  function setTarget(next = {}) {
    lastTarget = next ?? {};
    const { folder, source } = lastTarget;
    if (!folder) {
      target.textContent = t('export.noFolder');
      target.title = target.textContent;
      return;
    }
    const how = source === 'configured' ? t('export.sourceConfigured') : t('export.sourceDetected');
    target.textContent = `${t('settings.effectsFolder')}: ${folder} (${how})`;
    // The bar truncates this line before anything else in it, and at the
    // smallest window there is little left of it — so the whole path stays
    // reachable by resting on it, and is in the message after every export.
    target.title = target.textContent;
  }

  relabel();

  return {
    relabel,
    setTarget,
    /** Show the document's name; called after a drop or an opened project. */
    setName(text) { name.value = text ?? ''; },
    /** Offer, or withdraw, the answer to "that file already exists". */
    askOverwrite(asking) { overwrite.element.hidden = !asking; },
    /**
     * The thumbnail's three bands, from the picture that is loaded. An empty
     * list puts the resting mark back — which is what an opened project with
     * no picture in it must produce, rather than the previous project's
     * colours left standing.
     *
     * The colours are computed from the picture (see components/palette.js) and
     * so cannot live in tokens.css; the resting state's colours are a class,
     * and do.
     */
    setColours(colours) {
      const has = Array.isArray(colours) && colours.length > 0;
      thumb.classList.toggle('has-colours', has);
      thumb.style.removeProperty('background');
      if (!has) return;
      const stops = colours
        .map((colour, index) => `${colour} ${(index * 100) / colours.length}% ${((index + 1) * 100) / colours.length}%`)
        .join(', ');
      thumb.style.background = `linear-gradient(160deg, ${stops})`;
    }
  };
}
