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
  t, onNameChange, onExport, onOverwrite, onSave, onOpen
}) {
  container.replaceChildren();

  const nameLabel = document.createElement('label');
  nameLabel.htmlFor = 'footer-name';
  nameLabel.textContent = t('footer.name');

  const name = document.createElement('input');
  name.type = 'text';
  name.id = 'footer-name';
  name.addEventListener('input', () => onNameChange(name.value));

  const target = document.createElement('span');
  target.id = 'footer-target';
  target.className = 'muted';

  function button(id, labelKey, handler, className) {
    const element = document.createElement('button');
    element.type = 'button';
    element.id = id;
    element.textContent = t(labelKey);
    if (className) element.className = className;
    element.addEventListener('click', handler);
    return element;
  }

  const exportButton = button('footer-export', 'footer.export', onExport, 'primary');
  const overwrite = button('footer-overwrite', 'export.overwrite', onOverwrite);
  // Only ever on screen while there is a question waiting to be answered, so
  // it can never be pressed for an export nobody asked about.
  overwrite.hidden = true;

  container.append(
    nameLabel, name, target, exportButton, overwrite,
    button('footer-save', 'footer.save', onSave),
    button('footer-open', 'footer.open', onOpen)
  );

  return {
    /** Show the document's name; called after a drop or an opened project. */
    setName(text) { name.value = text ?? ''; },

    /**
     * Where the export will land, and how that was decided — a folder the
     * user picked reads differently from one the app went looking for, and
     * "none found" has to be visible before the button is pressed rather
     * than only after.
     */
    setTarget({ folder, source } = {}) {
      if (!folder) {
        target.textContent = t('export.noFolder');
        return;
      }
      const how = source === 'configured' ? t('export.sourceConfigured') : t('export.sourceDetected');
      target.textContent = `${t('settings.effectsFolder')}: ${folder} (${how})`;
    },

    /** Offer, or withdraw, the answer to "that file already exists". */
    askOverwrite(asking) { overwrite.hidden = !asking; }
  };
}
