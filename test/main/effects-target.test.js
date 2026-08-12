// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max Leopold Blumenschein
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveEffectsTarget } from '../../src/main/effects-target.js';

const HOME = 'C:\\Users\\Someone';
const DOCS = `${HOME}\\Documents`;
const DETECTED = `${DOCS}\\WhirlwindFX\\Effects`;
const settingsWith = (folder) => ({ get: (k) => (k === 'effectsFolder' ? folder : undefined) });

test('a configured folder that exists wins', () => {
  const r = resolveEffectsTarget({
    settings: settingsWith('D:\\Eigene'),
    documentsPath: DOCS, homePath: HOME,
    exists: (p) => p === 'D:\\Eigene' || p === DETECTED
  });
  assert.deepEqual(r, { folder: 'D:\\Eigene', source: 'configured' });
});

test('a configured folder that no longer exists is not used', () => {
  const r = resolveEffectsTarget({
    settings: settingsWith('D:\\Weg'),
    documentsPath: DOCS, homePath: HOME,
    exists: (p) => p === DETECTED
  });
  assert.deepEqual(r, { folder: DETECTED, source: 'detected' });
});

test('nothing configured and nothing found means asking the user', () => {
  const r = resolveEffectsTarget({
    settings: settingsWith(undefined),
    documentsPath: DOCS, homePath: HOME,
    exists: () => false
  });
  assert.deepEqual(r, { folder: null, source: 'none' });
});
