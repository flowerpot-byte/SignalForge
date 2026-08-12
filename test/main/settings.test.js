// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSettings, DEFAULT_SETTINGS, FALLBACK_LANGUAGE } from '../../src/main/settings.js';

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

// "Nobody has chosen a language yet" has to be a state of its own, otherwise
// a first start cannot tell an untouched installation apart from somebody who
// deliberately picked German — and the window would force German on a machine
// that is set to English. The empty default is what app/renderer/main.js hands
// to pickLanguage() as the signal to ask navigator.language instead.
test('language starts out unchosen rather than defaulting to a language', () => {
  assert.equal(DEFAULT_SETTINGS.language, '');
  assert.equal(createSettings(fake(null)).get('language'), '');
});

// Everything outside the window that needs a language anyway — the labels of
// the exported effect's own controls — has to have one even before the user
// has been asked, and it must not silently become English for a German user.
test('there is a stated fallback language for callers that cannot ask the window', () => {
  assert.equal(FALLBACK_LANGUAGE, 'de');
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

// Finding 1 (recent-colours review, 12.08.): the swatch feature shipped with
// recentColors missing from SETTING_TYPES entirely — every set() threw
// "unknown setting" and the loader silently dropped the key, so the whole
// point of the feature (surviving a restart) was dead, and no test noticed
// because none drove this store with the real key. These four do.
test('recentColors round-trips through a reload', async () => {
  const io = fake(null);
  await createSettings(io).set('recentColors', ['#112233', '#aabbcc']);
  assert.deepEqual(createSettings(io).get('recentColors'), ['#112233', '#aabbcc']);
});

test('recentColors starts out empty', () => {
  assert.deepEqual(createSettings(fake(null)).get('recentColors'), []);
});

test('a hand-edited recentColors that is not a dense list of colours is dropped on load', () => {
  for (const junk of [
    '{"recentColors": {"0": "#112233"}}',
    '{"recentColors": ["#112233", "red"]}',
    '{"recentColors": ["#112233", "#AABBCC"]}',
    '{"recentColors": [null, "#112233"]}',
    '{"recentColors": ["#112233","#112233","#112233","#112233","#112233","#112233","#112233","#112233","#112233"]}'
  ]) {
    const s = createSettings(fake(junk));
    assert.deepEqual(s.get('recentColors'), [], `should have dropped: ${junk}`);
  }
});

test('set refuses a recentColors that is junk — sparse arrays included', async () => {
  const s = createSettings(fake(null));
  await assert.rejects(() => s.set('recentColors', 'not a list'), /must be a colours/);
  await assert.rejects(() => s.set('recentColors', ['#112233', 'junk']), /must be a colours/);
  // The sparse-array gate: `every` skips holes, so without the density check
  // seven holes and one valid entry would pass and be written as seven nulls.
  const sparse = [];
  sparse[7] = '#112233';
  await assert.rejects(() => s.set('recentColors', sparse), /must be a colours/);
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
