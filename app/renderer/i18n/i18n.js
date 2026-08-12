// SignalForge — build SignalRGB effects from images, gradients, shapes and particles.
// Copyright (C) 2026 Max Leopold Blumenschein
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Which language the window opens in.
 *
 * `stored` is what the settings file holds, which on a first start is '' —
 * DEFAULT_SETTINGS.language (src/main/settings.js) is deliberately empty so
 * that "nobody has chosen yet" is a state the app can tell apart from
 * "somebody chose German". `preferred` is the system's language as the browser
 * reports it (navigator.language), which comes with a region attached
 * ("en-GB", "de-AT") and in no guaranteed case.
 *
 * The user's own choice always wins, and only a stored language this build
 * does not actually speak (a hand-edited settings file, or one written by a
 * later version) gives way to the system's. `available[0]` is the last resort,
 * so the order of the language files decides what somebody sees whose language
 * the app does not have at all.
 */
export function pickLanguage(stored, preferred, available) {
  const base = (tag) => String(tag ?? '').toLowerCase().split('-')[0];
  const known = (tag) => available.includes(base(tag));
  if (known(stored)) return base(stored);
  if (known(preferred)) return base(preferred);
  return available[0];
}

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
