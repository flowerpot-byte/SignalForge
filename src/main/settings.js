// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Every setting the app has, with its default and its type. Anything not
 * listed here cannot be read or written — a stored file from a newer version
 * therefore cannot smuggle keys into an older one.
 *
 * A "type" here is a name in CHECKS below, not a typeof string — `typeof`
 * alone could never say "an array of colour strings" (typeof [] is 'object',
 * which would wave any object through). One predicate, used by the loader
 * and by set() alike, so what survives a reload and what set() accepts can
 * never be two different rules.
 */
export const SETTING_TYPES = Object.freeze({
  language: 'string',
  effectsFolder: 'string',
  lastProjectFolder: 'string',
  recentColors: 'colours',
  // Who to name as the author of an effect. A SETTING and not merely a
  // document field, because it is the same person every time: typing one's
  // own name into every new effect is the kind of small tax that ends with
  // the field left empty, which is exactly the state this was added to fix.
  // The document still carries its own `publisher` — this is only what a new
  // document starts with.
  author: 'string'
});

/** Exactly the string a colour input produces — lowercase #rrggbb. */
const RECENT_COLOR = /^#[0-9a-f]{6}$/;

const CHECKS = Object.freeze({
  string: (value) => typeof value === 'string',
  /**
   * A short, DENSE array of colour strings. The Object.keys length comparison
   * is the sparse-array gate: `every` skips holes, so a seven-hole array with
   * one valid entry would otherwise pass and JSON.stringify would then write
   * seven nulls into the file. It also refuses arrays carrying named extra
   * properties, which is stricter than needed and exactly as intended.
   */
  colours: (value) => Array.isArray(value)
    && value.length <= 8
    && Object.keys(value).length === value.length
    && value.every((entry) => typeof entry === 'string' && RECENT_COLOR.test(entry))
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
  lastProjectFolder: '',
  // Frozen so the shared default cannot be mutated through a leaked
  // reference; every write replaces the array wholesale (rememberColor in
  // app/renderer/components/recent-colors.js returns fresh lists).
  recentColors: Object.freeze([]),
  // Empty until somebody types their name once. Empty and not a placeholder
  // like "Unknown": the exported file's publisher line is better blank than
  // filled with a word nobody chose.
  author: ''
});

export function createSettings({ file, readFile, writeFile }) {
  let values = { ...DEFAULT_SETTINGS };

  try {
    const parsed = JSON.parse(readFile(file));
    for (const [key, type] of Object.entries(SETTING_TYPES)) {
      if (Object.prototype.hasOwnProperty.call(parsed, key) && CHECKS[type](parsed[key])) {
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
      if (!CHECKS[SETTING_TYPES[key]](value)) {
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
