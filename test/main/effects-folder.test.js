// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max Leopold Blumenschein
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { findEffectsFolders } from '../../src/main/effects-folder.js';

const HOME = 'C:\\Users\\Someone';
const withFolders = (present) => (candidate) => present.includes(candidate);

test('finds the plain Documents location', () => {
  const found = findEffectsFolders({
    documentsPath: `${HOME}\\Documents`,
    homePath: HOME,
    exists: withFolders([`${HOME}\\Documents\\WhirlwindFX\\Effects`])
  });
  assert.deepEqual(found, [`${HOME}\\Documents\\WhirlwindFX\\Effects`]);
});

test('finds the OneDrive-redirected location', () => {
  const found = findEffectsFolders({
    documentsPath: `${HOME}\\OneDrive\\Documents`,
    homePath: HOME,
    exists: withFolders([`${HOME}\\OneDrive\\Documents\\WhirlwindFX\\Effects`])
  });
  assert.equal(found.length, 1);
  assert.match(found[0], /OneDrive/);
});

test('the known Documents folder wins over the guessed ones', () => {
  const documents = `${HOME}\\OneDrive\\Documents`;
  const found = findEffectsFolders({
    documentsPath: documents,
    homePath: HOME,
    exists: withFolders([
      `${documents}\\WhirlwindFX\\Effects`,
      `${HOME}\\Documents\\WhirlwindFX\\Effects`
    ])
  });
  assert.equal(found[0], `${documents}\\WhirlwindFX\\Effects`);
  assert.equal(found.length, 2);
});

test('nothing found gives an empty list, never a guess', () => {
  const found = findEffectsFolders({
    documentsPath: `${HOME}\\Documents`,
    homePath: HOME,
    exists: () => false
  });
  assert.deepEqual(found, []);
});

test('the same folder reachable two ways is only listed once', () => {
  const found = findEffectsFolders({
    documentsPath: `${HOME}\\Documents`,
    homePath: HOME,
    exists: withFolders([`${HOME}\\Documents\\WhirlwindFX\\Effects`])
  });
  assert.equal(found.length, 1);
});
