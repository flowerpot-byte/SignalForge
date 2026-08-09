// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSettings, DEFAULT_SETTINGS } from '../../src/main/settings.js';

function fake(initial) {
  let content = initial;
  return {
    file: 'X:\\settings.json',
    readFile: () => { if (content === null) throw new Error('ENOENT'); return content; },
    writeFile: (_f, text) => { content = text; },
    current: () => content
  };
}

test('missing file yields the defaults', () => {
  const s = createSettings(fake(null));
  assert.deepEqual(s.all(), DEFAULT_SETTINGS);
});

test('a corrupt file is discarded rather than throwing', () => {
  const s = createSettings(fake('{not json'));
  assert.deepEqual(s.all(), DEFAULT_SETTINGS);
});

test('unknown keys in the file are ignored', () => {
  const s = createSettings(fake('{"language":"en","somethingElse":1}'));
  assert.equal(s.get('language'), 'en');
  assert.equal(s.get('somethingElse'), undefined);
});

test('set writes through and survives a reload', async () => {
  const io = fake(null);
  await createSettings(io).set('language', 'en');
  assert.equal(createSettings(io).get('language'), 'en');
});

test('an unknown key cannot be set', async () => {
  const s = createSettings(fake(null));
  await assert.rejects(() => s.set('nope', 1), /unknown setting/i);
});

test('a wrongly typed stored value falls back to the default', () => {
  const s = createSettings(fake('{"language":42}'));
  assert.equal(s.get('language'), DEFAULT_SETTINGS.language);
});

// Finding 1 (task-4 review): `set()` used to mutate the in-memory `values`
// object before the write to disk had actually succeeded. If `writeFile`
// then failed, `get()`/`all()` would go on reporting the new value as saved
// even though nothing was persisted — a caller (e.g. the `sf:chooseFolder`
// IPC handler in app/main.js) could tell the user "saved" for a change that
// silently evaporates on the next restart. This test is deliberately
// falsifiable: temporarily restoring the old "mutate, then write" ordering
// makes it fail (see the fix report for the red/green transcript).
test('a failed write does not corrupt in-memory state, and the error propagates', async () => {
  const io = fake(JSON.stringify({ ...DEFAULT_SETTINGS, language: 'de' }));
  const failingWriteFile = () => Promise.reject(new Error('disk full'));
  const s = createSettings({ ...io, writeFile: failingWriteFile });

  await assert.rejects(() => s.set('language', 'en'), /disk full/);
  assert.equal(s.get('language'), 'de', 'old value must survive a failed write');
  assert.deepEqual(
    s.all(),
    { ...DEFAULT_SETTINGS, language: 'de' },
    'all() must not report the unpersisted value either'
  );
});
