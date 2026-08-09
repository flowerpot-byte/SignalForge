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

test('set writes through and survives a reload', () => {
  const io = fake(null);
  createSettings(io).set('language', 'en');
  assert.equal(createSettings(io).get('language'), 'en');
});

test('an unknown key cannot be set', () => {
  const s = createSettings(fake(null));
  assert.throws(() => s.set('nope', 1), /unknown setting/i);
});

test('a wrongly typed stored value falls back to the default', () => {
  const s = createSettings(fake('{"language":42}'));
  assert.equal(s.get('language'), DEFAULT_SETTINGS.language);
});
