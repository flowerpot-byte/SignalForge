// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { isSupportedImage, SUPPORTED_IMAGE_EXTENSIONS, mountDrop } from '../../app/renderer/components/drop.js';

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

// Minimal DOM stand-ins — enough for mountDrop's addEventListener/classList
// use, nothing more.
class FakeElement extends EventTarget {
  constructor() {
    super();
    this.classList = { add() {}, remove() {} };
  }
}

test('a supported drop hands onFile the raw File object, never a resolved path', () => {
  const element = new FakeElement();
  // Stands in for a DOM File: mountDrop must treat this as opaque and pass
  // it straight through — it must never try to read a .path off it or turn
  // it into a string itself. Only app/preload.cjs is trusted to resolve a
  // File to a real filesystem path (via webUtils.getPathForFile), which is
  // exactly what closes the arbitrary-file-read hole: a script running in
  // the renderer cannot forge a path string and hand it to sf:importImage,
  // because the renderer-facing API no longer accepts a path at all.
  const fakeFile = { name: 'photo.png' };
  let received;
  mountDrop(element, {
    onFile: (file) => { received = file; },
    onReject: () => { throw new Error('a supported extension must not be rejected'); }
  });

  const dropEvent = new Event('drop', { cancelable: true });
  dropEvent.dataTransfer = { files: [fakeFile] };
  element.dispatchEvent(dropEvent);

  // Falsifiability: the old implementation resolved the path itself via
  // `window.sf.pathForFile(file)` before calling onFile — which would throw
  // here (there is no `window` in this plain node:test environment), and if
  // that call were ever swallowed instead, `received` would be a string, not
  // the same object reference handed to dispatchEvent. Either regression
  // fails this assertion.
  assert.equal(received, fakeFile, 'onFile must receive the exact File object unchanged');
  assert.notEqual(typeof received, 'string', 'onFile must not receive an already-resolved path string');
});

test('drop with no files does not call onFile or onReject', () => {
  const element = new FakeElement();
  let called = false;
  mountDrop(element, {
    onFile: () => { called = true; },
    onReject: () => { called = true; }
  });

  const dropEvent = new Event('drop', { cancelable: true });
  dropEvent.dataTransfer = { files: [] };
  element.dispatchEvent(dropEvent);

  assert.equal(called, false);
});
