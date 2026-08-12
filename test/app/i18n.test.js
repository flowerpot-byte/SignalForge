// SignalForge — build SignalRGB effects from images, gradients, shapes and particles.
// Copyright (C) 2026 Max Leopold Blumenschein
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { pickLanguage } from '../../app/renderer/i18n/i18n.js';

const load = (name) => JSON.parse(readFileSync(
  fileURLToPath(new URL(`../../app/renderer/i18n/${name}.json`, import.meta.url)), 'utf8'));

// The order matters: the first entry is the fallback, i.e. what somebody gets
// whose system language the app does not speak.
const AVAILABLE = ['de', 'en'];

test('both languages carry exactly the same keys', () => {
  const de = Object.keys(load('de')).sort();
  const en = Object.keys(load('en')).sort();
  const missingInEn = de.filter((k) => !en.includes(k));
  const missingInDe = en.filter((k) => !de.includes(k));
  assert.deepEqual(missingInEn, [], 'keys present in de but not en');
  assert.deepEqual(missingInDe, [], 'keys present in en but not de');
});

/**
 * Every key the window asks for by name must actually be in both files.
 *
 * Nothing guarded this, and the removal of the left column is exactly the
 * change that shows why it was needed: two keys went with it (`nav.caption`,
 * `nav.label`) and two arrived (`region.stage`, `region.settings`). A key left
 * behind in the files is dead weight nobody notices; a key asked for and not
 * present is worse — createI18n hands back the key itself, so the window
 * quietly displays "region.stage" to somebody, in both languages, with every
 * other test still green.
 *
 * Only LITERAL asks are checked, i.e. t('...'). Several are assembled at
 * runtime instead (t(`gallery.${kind}`), t(SECTION_TITLES[name])) and cannot
 * be read out of the source this way — those are covered where they are built,
 * by the harnesses that read the finished words off the real window. This
 * catches the plain half, which is most of them and is the half that goes
 * stale silently.
 */
test('every key the window asks for by name exists in both languages', () => {
  const de = load('de');
  const en = load('en');
  const asked = new Set();
  const walk = (relative) => {
    const absolute = fileURLToPath(new URL(`../../${relative}`, import.meta.url));
    for (const entry of readdirSync(absolute, { withFileTypes: true })) {
      if (entry.isDirectory()) { walk(`${relative}/${entry.name}`); continue; }
      if (!entry.name.endsWith('.js')) continue;
      const source = readFileSync(`${absolute}/${entry.name}`, 'utf8');
      for (const [, key] of source.matchAll(/\bt\(\s*'([a-zA-Z0-9_.]+)'\s*\)/g)) asked.add(key);
    }
  };
  walk('app/renderer');

  // A vacuous pass would be worthless: the window asks for dozens of these.
  assert.ok(asked.size > 20, `only ${asked.size} literal keys were found — has the walk stopped walking?`);
  const missing = [...asked].filter((key) => !(key in de) || !(key in en)).sort();
  assert.deepEqual(missing, [], 'keys the window asks for that no language file answers');
});

test('no value is left empty', () => {
  for (const name of ['de', 'en']) {
    for (const [key, value] of Object.entries(load(name))) {
      assert.ok(typeof value === 'string' && value.trim().length > 0, `${name}.${key} is empty`);
    }
  }
});

/**
 * The unsaved-changes question guards FOUR gestures, not one.
 *
 * It was written for "open project" and its words said so — "Opening another
 * project throws them away", over a button reading "Discard and open". It was
 * then extended to the three starting tiles and to importing a picture, and
 * ever since, pressing the gradient tile with unsaved work described a gesture
 * nobody had made. A dialog that stands in front of losing work is the one
 * dialog whose words are actually read, so its words have to be true for every
 * door that opens it.
 *
 * Hence: no word naming one particular gesture. This is deliberately a short,
 * explicit list rather than a clever rule — it catches the exact drift that
 * happened, and it goes red the moment "and open" comes back.
 */
test('the unsaved-changes question names no single gesture', () => {
  const GESTURE_WORDS = {
    de: ['öffn', 'importier', 'lade'],
    en: ['open', 'import', 'load']
  };
  for (const name of ['de', 'en']) {
    const words = load(name);
    for (const key of ['body', 'save', 'discard', 'cancel']) {
      const value = words[`project.unsaved.${key}`].toLowerCase();
      for (const gesture of GESTURE_WORDS[name]) {
        assert.ok(
          !value.includes(gesture),
          `${name}.project.unsaved.${key} names one gesture ("${gesture}") although the same `
            + `question guards opening a project, all three starting tiles and importing a `
            + `picture: "${words[`project.unsaved.${key}`]}"`
        );
      }
    }
  }
});

// Which language the window opens in. A stored choice is the user's own and
// always wins; only when there is none does the system's language get a say,
// which is what "first start" means here — the settings file has no language
// in it yet (DEFAULT_SETTINGS.language is '', see src/main/settings.js).
test('a stored language is what the window opens in', () => {
  assert.equal(pickLanguage('en', 'de-DE', AVAILABLE), 'en');
  assert.equal(pickLanguage('de', 'en-US', AVAILABLE), 'de');
});

test('with nothing stored, the system language decides — region tag and case ignored', () => {
  assert.equal(pickLanguage('', 'en-GB', AVAILABLE), 'en');
  assert.equal(pickLanguage('', 'de-AT', AVAILABLE), 'de');
  assert.equal(pickLanguage('', 'EN-us', AVAILABLE), 'en');
  assert.equal(pickLanguage('', 'en', AVAILABLE), 'en');
});

test('a language nobody here speaks falls back to the first one', () => {
  assert.equal(pickLanguage('', 'fr-FR', AVAILABLE), 'de');
  assert.equal(pickLanguage('', '', AVAILABLE), 'de');
  assert.equal(pickLanguage('', undefined, AVAILABLE), 'de');
  assert.equal(pickLanguage(undefined, null, AVAILABLE), 'de');
});

// A stored value can be junk — a hand-edited settings.json, or a language a
// later version had and this one does not. It must not win over a system
// language the app actually speaks.
test('a stored language the app does not speak gives way to the system one', () => {
  assert.equal(pickLanguage('fr', 'en-US', AVAILABLE), 'en');
  assert.equal(pickLanguage('fr', 'fr-FR', AVAILABLE), 'de');
});

test('every language file the app ships is one pickLanguage can return', () => {
  // Guards the wiring in app/renderer/main.js: the list handed to pickLanguage
  // there is Object.keys(dictionaries), so a third language file added later
  // is offered without anything else needing to be touched.
  for (const name of AVAILABLE) {
    assert.ok(load(name), `${name}.json must exist`);
    assert.equal(pickLanguage(name, 'fr-FR', AVAILABLE), name);
  }
});
