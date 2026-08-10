// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Every setting the app has, with its default and its type. Anything not
 * listed here cannot be read or written — a stored file from a newer version
 * therefore cannot smuggle keys into an older one.
 */
export const SETTING_TYPES = Object.freeze({
  language: 'string',
  effectsFolder: 'string',
  lastProjectFolder: 'string'
});

/**
 * The language for callers that cannot ask the window which one it is using.
 *
 * The exported effect's own controls have to be labelled at the moment the
 * export runs, and that happens in the main process. It will normally read the
 * stored language, but on a first start nothing is stored yet (see below), and
 * defaulting to English there would quietly hand a German user an English
 * effect.
 */
export const FALLBACK_LANGUAGE = 'de';

/**
 * `language: ''` means "nobody has chosen yet", which is deliberately not the
 * same thing as "German". Only that distinction lets a first start follow the
 * language the machine is actually set to (see pickLanguage in
 * app/renderer/i18n/i18n.js); the window writes its choice back the first time
 * it boots, so this stays empty for exactly one start.
 */
export const DEFAULT_SETTINGS = Object.freeze({
  language: '',
  effectsFolder: '',
  lastProjectFolder: ''
});

export function createSettings({ file, readFile, writeFile }) {
  let values = { ...DEFAULT_SETTINGS };

  try {
    const parsed = JSON.parse(readFile(file));
    for (const [key, type] of Object.entries(SETTING_TYPES)) {
      if (Object.prototype.hasOwnProperty.call(parsed, key) && typeof parsed[key] === type) {
        values[key] = parsed[key];
      }
    }
  } catch {
    // No file yet, or an unreadable one. Defaults are the right answer for
    // both, and losing a broken settings file is better than refusing to start.
    values = { ...DEFAULT_SETTINGS };
  }

  return {
    all: () => ({ ...values }),
    get: (key) => values[key],
    async set(key, value) {
      if (!Object.prototype.hasOwnProperty.call(SETTING_TYPES, key)) {
        throw new Error(`unknown setting: ${key}`);
      }
      if (typeof value !== SETTING_TYPES[key]) {
        throw new Error(`setting ${key} must be a ${SETTING_TYPES[key]}`);
      }
      // Write first, mutate `values` only once the write has actually
      // succeeded. Applying the mutation before the write (as an earlier
      // draft of this code did) lets `get()`/`all()` report a value that was
      // never persisted if `writeFile` throws — a caller could tell the user
      // "saved" for a change that silently evaporates on the next restart.
      const next = { ...values, [key]: value };
      await writeFile(file, JSON.stringify(next, null, 2));
      values = next;
    }
  };
}
