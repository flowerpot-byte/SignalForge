// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * A missing key returns the key itself rather than an empty string, so a gap
 * is visible in the window instead of silently rendering nothing.
 */
export function createI18n(dictionaries, language) {
  let current = dictionaries[language] ? language : 'en';
  return {
    get language() { return current; },
    setLanguage(next) { if (dictionaries[next]) current = next; },
    t(key) { return dictionaries[current][key] ?? key; }
  };
}
