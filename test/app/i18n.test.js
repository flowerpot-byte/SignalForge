// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

test('no value is left empty', () => {
  for (const name of ['de', 'en']) {
    for (const [key, value] of Object.entries(load(name))) {
      assert.ok(typeof value === 'string' && value.trim().length > 0, `${name}.${key} is empty`);
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
