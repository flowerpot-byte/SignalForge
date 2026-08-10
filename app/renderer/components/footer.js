// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * The footer: what the effect is called, where it is going, and the buttons
 * that put it there.
 *
 * Deliberately free of any decisions. It reports what the user did and shows
 * what it is told; whether an export is allowed, what the target folder is
 * and what happened afterwards are all app/renderer/main.js's business. Every
 * handler passed in is expected to have its own error handling already —
 * these are click callbacks with nobody awaiting them, so a rejection that
 * escaped here would only ever reach the console.
 *
 * Ids are stable and spelled out (`footer-export`, `footer-save`, ...) rather
 * than being positional: the self-test in app/main.js drives these very
 * buttons, and finding them by their place in the row is a test that breaks
 * every time a button is added.
 */
export function mountFooter(container, {
  t, language, languages, onLanguageChange, onNameChange, onExport, onOverwrite, onSave, onOpen
}) {
  container.replaceChildren();

  const nameLabel = document.createElement('label');
  nameLabel.htmlFor = 'footer-name';

  const name = document.createElement('input');
  name.type = 'text';
  name.id = 'footer-name';
  name.addEventListener('input', () => onNameChange(name.value));

  const target = document.createElement('span');
  target.id = 'footer-target';
  target.className = 'muted';
  // What setTarget was last told, kept so relabel() below can say the same
  // thing again in the other language. Without it a language switch would
  // either wipe the target line or leave one German word ("erkannt") sitting
  // in an otherwise English row.
  let lastTarget = {};

  function button(id, handler, className) {
    const element = document.createElement('button');
    element.type = 'button';
    element.id = id;
    if (className) element.className = className;
    element.addEventListener('click', handler);
    return element;
  }

  const exportButton = button('footer-export', onExport, 'primary');
  const overwrite = button('footer-overwrite', onOverwrite);
  // Only ever on screen while there is a question waiting to be answered, so
  // it can never be pressed for an export nobody asked about.
  overwrite.hidden = true;
  const save = button('footer-save', onSave);
  const open = button('footer-open', onOpen);

  // The language switch. It lives in the footer rather than in a settings
  // window of its own because there is exactly one setting a user of this app
  // ever needs to reach twice, and burying it behind a window would be more
  // machinery than the choice is worth.
  //
  // Each language is named in itself ("Deutsch", "English") — somebody who has
  // landed in a language they cannot read has to be able to find their way
  // out, and "German"/"Deutsch" is only readable from one of the two sides.
  const languageLabel = document.createElement('label');
  languageLabel.htmlFor = 'footer-language';

  const languageSelect = document.createElement('select');
  languageSelect.id = 'footer-language';
  for (const code of languages) {
    const option = document.createElement('option');
    option.value = code;
    option.textContent = t(`language.${code}`);
    languageSelect.append(option);
  }
  languageSelect.value = language;
  languageSelect.addEventListener('change', () => onLanguageChange(languageSelect.value));

  // The order is the reading order and the tab order at once, and it runs
  // from what the effect is called, through where it is going, to the thing
  // that puts it there: the one filled button, last and furthest right, with
  // the quiet ones and the language switch in front of it. The overwrite
  // answer sits directly beside the export it belongs to.
  container.append(
    nameLabel, name, target,
    languageLabel, languageSelect, open, save, overwrite, exportButton
  );

  /**
   * Say everything again in whatever language `t` now speaks.
   *
   * Deliberately re-labelling in place rather than rebuilding the row: the
   * language is changed with the control that sits in this very row, and
   * replacing that control would throw the keyboard focus away mid-choice.
   * It also keeps the typed name and any pending overwrite question, neither
   * of which has anything to do with the language.
   */
  function relabel() {
    nameLabel.textContent = t('footer.name');
    exportButton.textContent = t('footer.export');
    overwrite.textContent = t('export.overwrite');
    save.textContent = t('footer.save');
    open.textContent = t('footer.open');
    languageLabel.textContent = t('settings.language');
    for (const option of languageSelect.options) option.textContent = t(`language.${option.value}`);
    setTarget(lastTarget);
  }

  /**
   * Where the export will land, and how that was decided — a folder the
   * user picked reads differently from one the app went looking for, and
   * "none found" has to be visible before the button is pressed rather
   * than only after.
   */
  function setTarget(next = {}) {
    lastTarget = next ?? {};
    const { folder, source } = lastTarget;
    if (!folder) {
      target.textContent = t('export.noFolder');
      return;
    }
    const how = source === 'configured' ? t('export.sourceConfigured') : t('export.sourceDetected');
    target.textContent = `${t('settings.effectsFolder')}: ${folder} (${how})`;
    // The row truncates this line before it truncates anything else (see
    // #footer-target in styles/app.css), and at the smallest window there is
    // little left of it — so the whole path stays reachable by resting on it.
    target.title = target.textContent;
  }

  relabel();

  return {
    relabel,
    setTarget,
    /** Show the document's name; called after a drop or an opened project. */
    setName(text) { name.value = text ?? ''; },
    /** Offer, or withdraw, the answer to "that file already exists". */
    askOverwrite(asking) { overwrite.hidden = !asking; }
  };
}
