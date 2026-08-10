// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { exportEffect, effectFileName, MAX_EFFECT_NAME_LENGTH } from '../../src/main/export-effect.js';

// A stand-in for the engine bundle. buildEffectHtml only refuses a source
// containing a literal "</script"; nothing here needs the real 300 KB.
const ENGINE = 'window.SignalForgeEngine = {};';

const FOLDER = join('C:', 'Effects');

/**
 * A filesystem that lives entirely in a Map, so every case below — including
 * the ones about overwriting — can be checked without a single byte reaching
 * a real disk, and without a temp folder to clean up.
 */
function fakeIo(initial = {}) {
  const files = new Map(Object.entries(initial));
  const madeFolders = [];
  return {
    files,
    madeFolders,
    exists: (path) => files.has(path),
    mkdir: (folder) => { madeFolders.push(folder); },
    writeFile: (path, text) => { files.set(path, text); },
    size: (path) => Buffer.byteLength(files.get(path) ?? '', 'utf8')
  };
}

function documentNamed(name) {
  return {
    name,
    layers: [{
      id: 'a1', type: 'image', asset: 'picture', fit: 'cover',
      motions: [{ kind: 'warp', speed: 15, amount: 30 }]
    }],
    assets: { picture: { kind: 'image', mime: 'image/png', data: 'AAAA' } }
  };
}

function runExport(name, { io = fakeIo(), force = false, doc = documentNamed(name) } = {}) {
  return { io, result: exportEffect({ doc, folder: FOLDER, engineSource: ENGINE, lang: 'en', force, io }) };
}

test('the effect lands in the folder it was given, under the document\'s name', () => {
  const { io, result } = runExport('Sunset');

  assert.equal(result.ok, true, result.message);
  assert.equal(result.path, join(FOLDER, 'Sunset.html'));
  assert.equal(result.name, 'Sunset', 'a successful export must report the name actually used');
  assert.deepEqual(io.madeFolders, [FOLDER], 'the target folder must be created if it is missing');

  const html = io.files.get(result.path);
  assert.match(html, /<title>Sunset<\/title>/);
  assert.ok(html.includes('SignalForgeEngine'), 'the engine must be embedded');
  assert.equal(result.bytes, Buffer.byteLength(html, 'utf8'), 'the reported size must be the file\'s own');
  assert.ok(result.bytes > 0);
});

test('the exported effect carries the shared control set', () => {
  const { io, result } = runExport('Controls');
  const html = io.files.get(result.path);
  for (const property of ['motion', 'tempo', 'strength', 'fit', 'brightness',
    'saturation', 'greenMagenta', 'blueYellow']) {
    assert.match(html, new RegExp(`<meta property="${property}"`), `the "${property}" control is missing`);
  }
});

test('an existing file is never overwritten silently', () => {
  const target = join(FOLDER, 'Twice.html');
  const io = fakeIo({ [target]: 'the effect that is already there' });

  const { result } = runExport('Twice', { io });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'exists');
  assert.equal(result.path, target, 'the refusal must name the full path, so the question can be asked about it');
  assert.equal(io.files.get(target), 'the effect that is already there', 'the old file must be untouched');
  assert.deepEqual(io.madeFolders, [], 'nothing may be created before the question has been answered');
});

test('force overwrites the file that was there', () => {
  const target = join(FOLDER, 'Twice.html');
  const io = fakeIo({ [target]: 'the effect that is already there' });

  const { result } = runExport('Twice', { io, force: true });

  assert.equal(result.ok, true, result.message);
  assert.equal(result.path, target);
  assert.match(io.files.get(target), /<title>Twice<\/title>/, 'the new effect must have replaced the old one');
});

test('a name containing path separators cannot reach out of the chosen folder', () => {
  for (const hostile of [
    '../../Windows/System32/evil',
    '..\\..\\Windows\\System32\\evil',
    'C:/Windows/win',
    'sub/folder/effect',
    'sub\\folder\\effect',
    'what?',
    'a:b'
  ]) {
    const { io, result } = runExport(hostile);
    if (result.ok === false) continue;
    const written = [...io.files.keys()];
    assert.equal(written.length, 1, `"${hostile}" wrote ${written.length} files`);
    assert.equal(
      written[0],
      join(FOLDER, `${effectFileName(hostile)}.html`),
      `"${hostile}" must be sanitised into a plain file name inside the chosen folder`
    );
    for (const character of ['/', '\\', ':', '?', '*', '"', '<', '>', '|']) {
      assert.ok(
        !effectFileName(hostile).includes(character),
        `"${hostile}" kept a "${character}" in its file name`
      );
    }
  }
});

test('a sanitised name is reported back, not the raw one the document still carries', () => {
  const { result } = runExport('a/b:c?d');

  assert.equal(result.ok, true, result.message);
  assert.equal(result.name, 'a-b-c-d', 'the caller needs the cleaned-up name to echo back into the name field');
  assert.equal(result.path, join(FOLDER, 'a-b-c-d.html'));
});

test('a name with nothing usable left in it is refused instead of guessed at', () => {
  for (const useless of ['', '   ', '///', '\\\\', '???', '...', ':', '\u0000']) {
    const { io, result } = runExport(useless, { doc: { ...documentNamed('x'), name: useless } });
    assert.equal(result.ok, false, `"${useless}" should not have produced a file`);
    assert.equal(result.reason, 'name');
    assert.equal(io.files.size, 0, `"${useless}" wrote a file anyway`);
  }
});

test('a name too long for a filesystem is cut down rather than failing at the write', () => {
  const long = 'x'.repeat(400);
  const { io, result } = runExport(long);

  assert.equal(result.ok, true, result.message);
  const written = [...io.files.keys()][0];
  const leaf = written.slice(written.lastIndexOf(FOLDER) + FOLDER.length + 1);
  assert.ok(leaf.length <= MAX_EFFECT_NAME_LENGTH + '.html'.length, `leaf name is ${leaf.length} characters`);
  assert.ok(MAX_EFFECT_NAME_LENGTH < 255, 'the cap must leave room inside a filesystem name component');
});

test('a name Windows reserves for a device is refused, not written into nowhere', () => {
  // Writing "NUL.html" on Windows succeeds and stores nothing at all: the
  // export would report success and leave no effect behind.
  for (const reserved of ['NUL', 'nul', 'CON', 'com1', 'LPT9', 'AUX']) {
    const { result } = runExport(reserved);
    assert.equal(result.ok, false, `"${reserved}" must be refused`);
    assert.equal(result.reason, 'name');
  }
});

test('a document with nothing in it is refused rather than exported as a black effect', () => {
  const io = fakeIo();
  const result = exportEffect({
    doc: { name: 'Nothing', layers: [] }, folder: FOLDER, engineSource: ENGINE, force: false, io
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'empty');
  assert.equal(io.files.size, 0);
});

test('a layer whose motions were all removed still exports live motion controls', () => {
  // The document the app hands over can legitimately have no motion at all;
  // the exported effect must still let SignalRGB turn one on, which needs a
  // real entry for the bindings to write into (see src/engine/bind.js).
  const doc = documentNamed('Still');
  doc.layers[0].motions = [];
  const { io, result } = runExport('Still', { doc });

  assert.equal(result.ok, true, result.message);
  const html = io.files.get(result.path);
  assert.match(html, /<meta property="motion"[^>]*default="none"/);
  assert.match(html, /"motions":\s*\[\s*\{/, 'the layer must carry a real motion entry for the controls to bind to');
});

test('effectFileName leaves an ordinary name alone', () => {
  assert.equal(effectFileName('Sunset over the lake'), 'Sunset over the lake');
  assert.equal(effectFileName('  Sunset  '), 'Sunset');
});
