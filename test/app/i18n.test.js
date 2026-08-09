// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const load = (name) => JSON.parse(readFileSync(
  fileURLToPath(new URL(`../../app/renderer/i18n/${name}.json`, import.meta.url)), 'utf8'));

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
