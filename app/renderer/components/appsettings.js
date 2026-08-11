// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import { icon } from './icons.js';

/**
 * The app's own two settings, as cards in the settings column.
 *
 * They used to live in the footer, wedged between the name field and four
 * buttons: a dropdown for the language and a truncated folder path that took
 * whatever width was left over. That row could never be the transport bar this
 * window now has, because half of it was a settings panel in disguise.
 *
 * So they moved to where settings belong — the settings column — reached now
 * through the marked toggle at the head of the transport bar's actions (see
 * components/footer.js; the left column that used to hold the way in has gone,
 * because pointing at things already on screen was all it did). They are built
 * in exactly the shape every other card in that column has: the name of the
 * thing on the left, its current value on the right, and the control across
 * the width beneath.
 *
 * This panel decides nothing. It shows what it is told and reports what was
 * pressed; where the effects folder actually is, and whether a language can be
 * stored, are app/renderer/main.js's business.
 */
export function mountAppSettings(container, { t, language, languages, onLanguageChange, onChooseFolder }) {
  container.replaceChildren();

  // The same header row the effect's own sections have — glyph, name, a rule
  // under it — so that switching to this panel changes what the column holds
  // without changing what the column IS.
  const group = document.createElement('section');
  group.className = 'field-group';
  group.dataset.section = 'settings';
  const heading = document.createElement('h2');
  heading.append(icon('settings'));
  const headingWord = document.createElement('span');
  heading.append(headingWord);
  group.append(heading);

  /** One card: heading row, then the control underneath. */
  function card(id) {
    const section = document.createElement('section');
    section.className = 'card';
    section.id = id;
    const head = document.createElement('div');
    head.className = 'card-head';
    const name = document.createElement('span');
    name.className = 'card-name';
    head.append(name);
    section.append(head);
    return { section, head, name };
  }

  // ------------------------------------------------------------------ folder
  //
  // The path gets a line of its own rather than the right half of the heading
  // row: it is the longest string in the window, the column is 300px wide, and
  // squeezed beside its own label it read as a truncation rather than as a
  // value. Ellipsised from the FRONT (see .card-value-text), because the end
  // of a path is the part that identifies it.
  const folder = card('settings-folder');
  const folderValue = document.createElement('p');
  folderValue.className = 'card-value-text';
  folderValue.id = 'settings-folder-value';
  folder.section.append(folderValue);

  const chooseFolder = document.createElement('button');
  chooseFolder.type = 'button';
  chooseFolder.id = 'settings-choose-folder';
  chooseFolder.className = 'card-action';
  const chooseIcon = icon('folder');
  const chooseWord = document.createElement('span');
  chooseFolder.append(chooseIcon, chooseWord);
  chooseFolder.addEventListener('click', onChooseFolder);
  folder.section.append(chooseFolder);

  // ---------------------------------------------------------------- language
  const speech = card('settings-language-card');
  const languageSelect = document.createElement('select');
  languageSelect.id = 'settings-language';
  // Each language is named in itself ("Deutsch", "English"): somebody who has
  // landed in a language they cannot read has to be able to find the way out,
  // and "German"/"Deutsch" is only readable from one of the two sides.
  for (const code of languages) {
    const option = document.createElement('option');
    option.value = code;
    option.textContent = t(`language.${code}`);
    languageSelect.append(option);
  }
  languageSelect.value = language;
  languageSelect.addEventListener('change', () => onLanguageChange(languageSelect.value));

  // The card's own name IS this control's label, so it is a real <label for>
  // rather than a span that merely looks like one.
  const speechLabel = document.createElement('label');
  speechLabel.htmlFor = 'settings-language';
  speechLabel.className = 'card-name';
  speech.name.replaceWith(speechLabel);
  speech.section.append(languageSelect);

  group.append(folder.section, speech.section);
  container.append(group);

  /** What setTarget was last told, so relabel() can say it again. */
  let lastTarget = {};

  function setTarget(next = {}) {
    lastTarget = next ?? {};
    const { folder: path, source } = lastTarget;
    if (!path) {
      folderValue.textContent = t('export.noFolder');
      folderValue.title = folderValue.textContent;
      return;
    }
    const how = source === 'configured' ? t('export.sourceConfigured') : t('export.sourceDetected');
    folderValue.textContent = `${path} (${how})`;
    // The column is 300px wide and a real path is longer than that, so the
    // whole of it stays reachable by resting on the line.
    folderValue.title = folderValue.textContent;
  }

  function relabel() {
    headingWord.textContent = t('inspector.title');
    folder.name.textContent = t('settings.effectsFolder');
    chooseWord.textContent = t('settings.chooseFolder');
    speechLabel.textContent = t('settings.language');
    for (const option of languageSelect.options) option.textContent = t(`language.${option.value}`);
    setTarget(lastTarget);
  }
  relabel();

  return { relabel, setTarget };
}
