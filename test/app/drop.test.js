// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { isSupportedImage, SUPPORTED_IMAGE_EXTENSIONS } from '../../app/renderer/components/drop.js';

test('the usual image types are accepted, case-insensitively', () => {
  for (const name of ['a.png', 'B.JPG', 'c.jpeg', 'd.webp', 'e.GIF', 'f.bmp']) {
    assert.equal(isSupportedImage(name), true, name);
  }
});

test('everything else is refused', () => {
  for (const name of ['clip.mp4', 'notes.txt', 'archive.zip', 'noextension', 'trap.png.exe']) {
    assert.equal(isSupportedImage(name), false, name);
  }
});

test('the list is the single source of truth and is not empty', () => {
  assert.ok(SUPPORTED_IMAGE_EXTENSIONS.length >= 5);
  for (const ext of SUPPORTED_IMAGE_EXTENSIONS) assert.match(ext, /^\.[a-z]+$/);
});
