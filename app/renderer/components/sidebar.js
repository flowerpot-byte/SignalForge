// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import { icon } from './icons.js';

/**
 * The left column: where you are, and where else you could be.
 *
 * WHY IT IS BACK, AND WHY IT IS NOT AN EMPTY PANEL THIS TIME
 *
 * A left column was taken out of this window once before, and rightly: it was
 * 260px of bordered nothing, promising a layer list a later task would build.
 * The rule that removal established still holds — a region with nothing to say
 * must not be a region — so this one has to earn its 200px on the day it
 * lands.
 *
 * It does, by taking a job the settings column was doing badly. That column
 * held fifteen controls in one scroll: fit, a motion list, two sliders per
 * motion, and four colour sliders, with nothing but headings to break them up.
 * The sidebar splits that scroll into the three questions somebody actually
 * asks in order — which part of the picture, how it moves, what colour it is —
 * and shows one of them at a time. So the sidebar is not decoration standing
 * next to the settings; it IS the settings' table of contents, and every entry
 * changes what the right-hand column shows.
 *
 * Pinned at the bottom, away from the three, sits the fourth destination: the
 * app's own settings — where exports land, and which language the window
 * speaks. Both used to be crammed into the footer beside the buttons, which is
 * what stopped that footer from ever being the transport bar it is now.
 *
 * A destination whose section has no controls (there is no picture, so there
 * is no fit and no motion list) is offered as disabled rather than hidden:
 * hiding it would make the window change shape on import, and disabling it
 * says "this exists, and here is what it is waiting for" — which the note in
 * the settings column then spells out.
 */

/**
 * The destinations, in the order they are read. `key` is what the settings
 * column filters on; `labelKey` is the translation key; `glyph` is the icon.
 *
 * The three document sections carry the very same labelKeys the settings
 * column's own headings do, deliberately: the entry and the heading it leads
 * to must be the same word, and one key is how that stays true.
 */
export const DESTINATIONS = Object.freeze([
  Object.freeze({ key: 'image', labelKey: 'inspector.section.image', glyph: 'image', needsPicture: true }),
  Object.freeze({ key: 'motions', labelKey: 'inspector.motions', glyph: 'motion', needsPicture: true }),
  Object.freeze({ key: 'colour', labelKey: 'inspector.section.colour', glyph: 'colour', needsPicture: false })
]);

/** The one that is pinned to the bottom, below the rule. */
export const APP_SETTINGS = Object.freeze({
  key: 'settings', labelKey: 'inspector.title', glyph: 'settings', needsPicture: false
});

/**
 * Put the left column on screen.
 *
 * `onSelect(key)` fires when an entry is chosen; the sidebar does not decide
 * what that means and keeps no state of its own beyond which entry is marked.
 * Marking is done by `setActive`, which the caller calls after it has actually
 * switched — so the column can never claim to be showing something it is not.
 */
export function mountSidebar(container, { t, active, onSelect }) {
  container.replaceChildren();

  const brand = document.createElement('div');
  brand.className = 'nav-brand';
  brand.append(icon('mark'));
  const wordmark = document.createElement('span');
  wordmark.className = 'nav-wordmark';
  wordmark.id = 'nav-wordmark';
  brand.append(wordmark);

  const caption = document.createElement('p');
  caption.className = 'nav-caption';
  caption.id = 'nav-caption';

  const list = document.createElement('div');
  list.className = 'nav-list';
  // A list of destinations is a tab strip in everything but name: one of them
  // is showing, the arrow keys should move between them, and a screen reader
  // should say "3 of 4" rather than reading four unrelated buttons.
  list.setAttribute('role', 'tablist');
  list.setAttribute('aria-orientation', 'vertical');

  const foot = document.createElement('div');
  foot.className = 'nav-foot';
  foot.setAttribute('role', 'tablist');
  foot.setAttribute('aria-orientation', 'vertical');

  /** One entry: line icon, text label, and the pill that marks the active one. */
  function entry(destination) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'nav-entry';
    button.id = `nav-${destination.key}`;
    button.setAttribute('role', 'tab');
    button.dataset.destination = destination.key;

    // Decoration: the word is right there beside it, so the icon is hidden
    // from the accessibility tree rather than announced a second time.
    button.append(icon(destination.glyph));

    const label = document.createElement('span');
    label.className = 'nav-label';
    label.id = `nav-${destination.key}-label`;
    button.append(label);

    button.addEventListener('click', () => onSelect(destination.key));
    return { destination, button, label };
  }

  const entries = DESTINATIONS.map(entry);
  for (const item of entries) list.append(item.button);
  const settingsEntry = entry(APP_SETTINGS);
  foot.append(settingsEntry.button);

  const all = [...entries, settingsEntry];
  container.append(brand, caption, list, foot);

  function relabel() {
    wordmark.textContent = t('app.title');
    caption.textContent = t('nav.caption');
    for (const item of all) item.label.textContent = t(item.destination.labelKey);
  }

  /** Mark exactly one entry, and tell the accessibility tree the same thing. */
  function setActive(key) {
    for (const item of all) {
      const on = item.destination.key === key;
      item.button.classList.toggle('is-active', on);
      item.button.setAttribute('aria-selected', String(on));
      // Only the active tab is a tab stop; the arrow keys move within the
      // strip, which is what a tablist owes the keyboard.
      item.button.tabIndex = on ? 0 : -1;
    }
  }

  /**
   * Whether the two picture-dependent destinations may be visited.
   *
   * Disabled, not hidden: the window must not change shape the moment a file
   * lands on it, and an entry that is visibly waiting teaches more than one
   * that is absent.
   */
  function setHasPicture(has) {
    for (const item of all) {
      if (!item.destination.needsPicture) continue;
      item.button.disabled = !has;
    }
  }

  /**
   * The arrow keys, because this is a tablist and a tablist that cannot be
   * arrowed through is a row of buttons wearing a role it does not honour.
   * Wraps at both ends and skips whatever is disabled.
   */
  function move(from, step) {
    const usable = all.filter((item) => !item.button.disabled);
    if (usable.length === 0) return;
    const at = usable.findIndex((item) => item.button === from);
    const next = usable[(at + step + usable.length) % usable.length];
    next.button.focus();
    onSelect(next.destination.key);
  }

  container.addEventListener('keydown', (event) => {
    const on = event.target.closest ? event.target.closest('.nav-entry') : null;
    if (!on) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') { event.preventDefault(); move(on, 1); }
    if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') { event.preventDefault(); move(on, -1); }
  });

  relabel();
  setActive(active);
  setHasPicture(false);

  return { relabel, setActive, setHasPicture };
}
