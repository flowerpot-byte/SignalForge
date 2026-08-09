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

export const DEFAULT_SETTINGS = Object.freeze({
  language: 'de',
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
    set(key, value) {
      if (!Object.prototype.hasOwnProperty.call(SETTING_TYPES, key)) {
        throw new Error(`unknown setting: ${key}`);
      }
      if (typeof value !== SETTING_TYPES[key]) {
        throw new Error(`setting ${key} must be a ${SETTING_TYPES[key]}`);
      }
      values[key] = value;
      writeFile(file, JSON.stringify(values, null, 2));
    }
  };
}
