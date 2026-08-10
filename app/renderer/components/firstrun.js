// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * The one question a first start has to ask: where SignalRGB keeps its
 * effects, when the app could not find that folder by itself.
 *
 * Deliberately not a modal assistant. It is a quiet panel in the middle
 * column that says what is missing and offers the single button that fixes
 * it; everything else in the window stays reachable, so somebody who wants to
 * drop a picture in and play first can do exactly that and answer this later.
 * There is nothing to dismiss and nothing to step through — answering it is
 * what makes it go away, and it comes back on its own if the folder it was
 * given ever disappears (resolveEffectsTarget reports `source: 'none'` again).
 *
 * `onChoose()` is expected to open the folder dialog, and to hand the new
 * target back through setTarget(); this panel decides nothing and stores no
 * path. Like every other click callback in this window it is expected to carry
 * its own error handling — nobody awaits it here.
 */
export function mountFirstRun(container, { t, onChoose }) {
  const panel = document.createElement('section');
  panel.id = 'first-run';
  panel.className = 'first-run';
  panel.hidden = true;

  const title = document.createElement('h2');
  const body = document.createElement('p');

  const choose = document.createElement('button');
  choose.type = 'button';
  choose.id = 'first-run-choose';
  // Marked out by its edge, not filled. The window has exactly one filled
  // button — "save to SignalRGB" in the footer, which is what the whole app
  // is for — and a second one here would have made that claim twice.
  choose.className = 'accent-outline';
  choose.addEventListener('click', onChoose);

  panel.append(title, body, choose);
  container.prepend(panel);

  function relabel() {
    title.textContent = t('firstRun.title');
    body.textContent = t('firstRun.body');
    choose.textContent = t('settings.chooseFolder');
  }
  relabel();

  return {
    relabel,
    /**
     * Show the question exactly while there is no folder to export into.
     * `source: 'none'` is resolveEffectsTarget's way of saying "ask" — a
     * missing folder is never guessed at (see src/main/effects-target.js), so
     * this is the one honest trigger, and it is also why a chosen folder that
     * later disappears brings the question back rather than swallowing exports.
     */
    setTarget({ folder } = {}) { panel.hidden = Boolean(folder); }
  };
}
