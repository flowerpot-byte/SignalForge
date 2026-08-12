// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max Leopold Blumenschein
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
    // Bytes go into the same Map as text, so a test can tell exactly which of
    // the two a path was written through — a cover image stored as a string
    // would hide a writeFile/writeBinary mix-up instead of failing on it.
    writeBinary: (path, bytes) => { files.set(path, bytes); },
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

async function runExport(name, {
  io = fakeIo(), force = false, doc = documentNamed(name), renderCover = null
} = {}) {
  return {
    io,
    result: await exportEffect({
      doc, folder: FOLDER, engineSource: ENGINE, lang: 'en', force, io, renderCover
    })
  };
}

test('the effect lands in the folder it was given, under the document\'s name', async () => {
  const { io, result } = await runExport('Sunset');

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

test('the exported effect carries the shared control set', async () => {
  const { io, result } = await runExport('Controls');
  const html = io.files.get(result.path);
  for (const property of ['motion', 'tempo', 'strength', 'fit', 'trail', 'hueShift', 'hueCycle',
    'brightness', 'saturation', 'greenMagenta', 'blueYellow']) {
    assert.match(html, new RegExp(`<meta property="${property}"`), `the "${property}" control is missing`);
  }
});

test('an existing file is never overwritten silently', async () => {
  const target = join(FOLDER, 'Twice.html');
  const io = fakeIo({ [target]: 'the effect that is already there' });

  const { result } = await runExport('Twice', { io });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'exists');
  assert.equal(result.path, target, 'the refusal must name the full path, so the question can be asked about it');
  assert.equal(io.files.get(target), 'the effect that is already there', 'the old file must be untouched');
  assert.deepEqual(io.madeFolders, [], 'nothing may be created before the question has been answered');
});

test('force overwrites the file that was there', async () => {
  const target = join(FOLDER, 'Twice.html');
  const io = fakeIo({ [target]: 'the effect that is already there' });

  const { result } = await runExport('Twice', { io, force: true });

  assert.equal(result.ok, true, result.message);
  assert.equal(result.path, target);
  assert.match(io.files.get(target), /<title>Twice<\/title>/, 'the new effect must have replaced the old one');
});

test('a name containing path separators cannot reach out of the chosen folder', async () => {
  for (const hostile of [
    '../../Windows/System32/evil',
    '..\\..\\Windows\\System32\\evil',
    'C:/Windows/win',
    'sub/folder/effect',
    'sub\\folder\\effect',
    'what?',
    'a:b'
  ]) {
    const { io, result } = await runExport(hostile);
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

test('a sanitised name is reported back, not the raw one the document still carries', async () => {
  const { result } = await runExport('a/b:c?d');

  assert.equal(result.ok, true, result.message);
  assert.equal(result.name, 'a-b-c-d', 'the caller needs the cleaned-up name to echo back into the name field');
  assert.equal(result.path, join(FOLDER, 'a-b-c-d.html'));
});

test('a name with nothing usable left in it is refused instead of guessed at', async () => {
  for (const useless of ['', '   ', '///', '\\\\', '???', '...', ':', '\u0000']) {
    const { io, result } = await runExport(useless, { doc: { ...documentNamed('x'), name: useless } });
    assert.equal(result.ok, false, `"${useless}" should not have produced a file`);
    assert.equal(result.reason, 'name');
    assert.equal(io.files.size, 0, `"${useless}" wrote a file anyway`);
  }
});

test('a name too long for a filesystem is cut down rather than failing at the write', async () => {
  const long = 'x'.repeat(400);
  const { io, result } = await runExport(long);

  assert.equal(result.ok, true, result.message);
  const written = [...io.files.keys()][0];
  const leaf = written.slice(written.lastIndexOf(FOLDER) + FOLDER.length + 1);
  assert.ok(leaf.length <= MAX_EFFECT_NAME_LENGTH + '.html'.length, `leaf name is ${leaf.length} characters`);
  assert.ok(MAX_EFFECT_NAME_LENGTH < 255, 'the cap must leave room inside a filesystem name component');
});

test('a name Windows reserves for a device is refused, not written into nowhere', async () => {
  // Writing "NUL.html" on Windows succeeds and stores nothing at all: the
  // export would report success and leave no effect behind.
  for (const reserved of ['NUL', 'nul', 'CON', 'com1', 'LPT9', 'AUX']) {
    const { result } = await runExport(reserved);
    assert.equal(result.ok, false, `"${reserved}" must be refused`);
    assert.equal(result.reason, 'name');
  }
});

test('a document with nothing in it is refused rather than exported as a black effect', async () => {
  const io = fakeIo();
  const result = await exportEffect({
    doc: { name: 'Nothing', layers: [] }, folder: FOLDER, engineSource: ENGINE, force: false, io
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'empty');
  assert.equal(io.files.size, 0);
});

test('a layer whose motions were all removed still exports live motion controls', async () => {
  // The document the app hands over can legitimately have no motion at all;
  // the exported effect must still let SignalRGB turn one on, which needs a
  // real entry for the bindings to write into (see src/engine/bind.js).
  const doc = documentNamed('Still');
  doc.layers[0].motions = [];
  const { io, result } = await runExport('Still', { doc });

  assert.equal(result.ok, true, result.message);
  const html = io.files.get(result.path);
  assert.match(html, /<meta property="motion"[^>]*default="none"/);
  assert.match(html, /"motions":\s*\[\s*\{/, 'the layer must carry a real motion entry for the controls to bind to');
});

// ---------------------------------------------------------------------------
// The cover image: the second file of the pair SignalRGB reads (see
// docs/messung-titelbilder.md — same folder, same base name, .png).
// ---------------------------------------------------------------------------

/** Stand-in tile bytes, and a record of what it was asked to draw. */
function fakeCover(bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47])) {
  const asked = [];
  const render = async (document_) => { asked.push(document_); return bytes; };
  return { render, asked, bytes };
}

test('an export writes the tile picture beside the effect, under the same base name', async () => {
  const cover = fakeCover();
  const { io, result } = await runExport('Sunset', { renderCover: cover.render });

  assert.equal(result.ok, true, result.message);
  assert.equal(result.coverPath, join(FOLDER, 'Sunset.png'));
  assert.equal(result.coverMessage, null, 'nothing failed, so nothing may be reported as failed');
  assert.deepEqual(
    [...io.files.keys()].sort(),
    [join(FOLDER, 'Sunset.html'), join(FOLDER, 'Sunset.png')].sort(),
    'exactly the pair, and nothing else'
  );
  assert.deepEqual(io.files.get(result.coverPath), cover.bytes, 'the bytes must arrive unaltered');
});

test('the tile is drawn from the very document that is written, not from the raw one', async () => {
  // The document handed to the renderer must be the finished one — normalized,
  // with the live-motion entry and the control list — because that is what the
  // .html beside it will run. Handing over the raw document would let the tile
  // show a frame the effect never draws.
  const doc = documentNamed('Still');
  doc.layers[0].motions = [];
  const cover = fakeCover();
  await runExport('Still', { doc, renderCover: cover.render });

  assert.equal(cover.asked.length, 1, 'the tile is drawn exactly once per export');
  const drawn = cover.asked[0];
  assert.ok(Array.isArray(drawn.controls) && drawn.controls.length > 0, 'the finished control list must be there');
  assert.equal(drawn.layers[0].motions.length, 1, 'the live-motion entry the effect will carry must be there too');
  assert.notEqual(drawn, doc, 'the raw document must not be what gets drawn');
});

test('a sanitised name pairs the two files instead of splitting them', async () => {
  const cover = fakeCover();
  const { io, result } = await runExport('a/b:c?d', { renderCover: cover.render });

  assert.equal(result.ok, true, result.message);
  assert.deepEqual(
    [...io.files.keys()].sort(),
    [join(FOLDER, 'a-b-c-d.html'), join(FOLDER, 'a-b-c-d.png')].sort(),
    'both files must carry the SAME sanitised base name'
  );
});

test('without a renderer there is simply no tile, and no claim that there is one', async () => {
  const { io, result } = await runExport('Bare');

  assert.equal(result.ok, true, result.message);
  assert.equal(result.coverPath, null);
  assert.deepEqual([...io.files.keys()], [join(FOLDER, 'Bare.html')]);
});

test('a refused overwrite draws no tile and writes no tile', async () => {
  const target = join(FOLDER, 'Twice.html');
  const io = fakeIo({ [target]: 'the effect that is already there' });
  const cover = fakeCover();

  const { result } = await runExport('Twice', { io, renderCover: cover.render });

  assert.equal(result.reason, 'exists');
  assert.deepEqual(cover.asked, [], 'a refusal must not cost a render');
  assert.equal(io.files.has(join(FOLDER, 'Twice.png')), false, 'and must not leave a picture behind');
});

/**
 * The question has to name everything the answer spends.
 *
 * `force` writes BOTH files, and the question the window asks was built from
 * `path` alone — so pressing "Überschreiben" replaced a tile picture the user
 * may have made or chosen themselves, having been asked only about the .html.
 * The refusal now says which of the two that answer would actually cost.
 */
test('the overwrite question names the tile picture when the answer would replace one', async () => {
  const html = join(FOLDER, 'Twice.html');
  const png = join(FOLDER, 'Twice.png');
  const io = fakeIo({ [html]: 'the effect that is already there', [png]: Buffer.from([1, 2, 3]) });

  const { result } = await runExport('Twice', { io, renderCover: fakeCover().render });

  assert.equal(result.reason, 'exists');
  assert.equal(result.coverPath, png, 'the picture the same answer would replace has to be in the question');
});

test('and says nothing about a picture when there is none to replace', async () => {
  const html = join(FOLDER, 'Twice.html');
  const io = fakeIo({ [html]: 'the effect that is already there' });

  const { result } = await runExport('Twice', { io, renderCover: fakeCover().render });

  assert.equal(result.reason, 'exists');
  assert.equal(result.coverPath, null, 'a question about a file that is not there is a question that confuses');
});

test('a caller that draws no tile cannot be said to be replacing one', async () => {
  // bin/sfexport.js under plain Node with no cover to draw: the .png beside the
  // effect is somebody else's business and this export will not touch it.
  const html = join(FOLDER, 'Twice.html');
  const png = join(FOLDER, 'Twice.png');
  const io = fakeIo({ [html]: 'the effect that is already there', [png]: Buffer.from([1, 2, 3]) });

  const { result } = await runExport('Twice', { io });

  assert.equal(result.reason, 'exists');
  assert.equal(result.coverPath, null);
});

test('a stray tile picture on its own still never blocks an export', async () => {
  // The deliberate trade, kept: the .html is the effect and the .png is
  // decoration, so a leftover picture must not be able to stop somebody saving.
  const io = fakeIo({ [join(FOLDER, 'Fresh.png')]: Buffer.from([9, 9]) });

  const { result } = await runExport('Fresh', { io, renderCover: fakeCover().render });

  assert.equal(result.ok, true, result.message);
});

/**
 * Nothing that names a file reaches the window that draws the tile.
 *
 * The cover is drawn by loading a page in a hidden window and running the
 * engine in it, and the engine resolves an asset with no bytes to `asset.file`
 * — a string out of a document. Nothing in this repository produces such an
 * asset any more, which is exactly why the door is worth locking now: the
 * comment that said no document could get here was a claim about the rest of
 * the codebase, and this makes it something enforced where it matters.
 */
test('an asset that names a file is taken out before the cover window sees the document', async () => {
  const cover = fakeCover();
  const doc = {
    name: 'Smuggled',
    assets: {
      embedded: { kind: 'image', mime: 'image/png', data: 'AAAA' },
      named: { kind: 'image', mime: 'image/png', file: 'C:/Windows/win.ini' }
    },
    layers: [
      { id: 'a', type: 'image', asset: 'embedded', motions: [] },
      { id: 'b', type: 'image', asset: 'named', motions: [] }
    ]
  };

  const { io, result } = await runExport('Smuggled', { doc, renderCover: cover.render });
  assert.equal(result.ok, true, result.message);

  const [handed] = cover.asked;
  assert.deepEqual(
    Object.keys(handed.assets),
    ['embedded'],
    'the renderer must never be handed a path a document chose'
  );
  assert.equal(
    JSON.stringify(handed).includes('win.ini'),
    false,
    'and not anywhere else in it either'
  );

  // And the file that was WRITTEN is untouched: the engine keeps file-shaped
  // assets on purpose for embedders other than this one, and an export writes
  // the document it was given.
  assert.match(io.files.get(result.path), /win\.ini/, 'only the cover copy is stripped, not the effect');
});

test('force replaces the tile picture as well as the effect', async () => {
  const html = join(FOLDER, 'Twice.html');
  const png = join(FOLDER, 'Twice.png');
  const io = fakeIo({ [html]: 'the effect that is already there', [png]: Buffer.from([1, 2, 3]) });
  const cover = fakeCover();

  const { result } = await runExport('Twice', { io, force: true, renderCover: cover.render });

  assert.equal(result.ok, true, result.message);
  assert.deepEqual(io.files.get(png), cover.bytes, 'a stale tile beside a replaced effect would be a lie');
});

test('a tile that cannot be drawn is said out loud, and the effect is still exported', async () => {
  const { io, result } = await runExport('Sunset', {
    renderCover: async () => { throw new Error('no canvas here'); }
  });

  assert.equal(result.ok, true, 'the effect must not be lost because its decoration failed');
  assert.match(io.files.get(result.path), /<title>Sunset<\/title>/);
  assert.equal(result.coverPath, null, 'nothing was written, so nothing may be reported as written');
  assert.match(result.coverMessage, /no canvas here/, 'the reason has to reach the user');
});

test('a tile that cannot be WRITTEN is said out loud too', async () => {
  const io = fakeIo();
  io.writeBinary = () => { throw new Error('disk is full'); };
  const cover = fakeCover();

  const { result } = await runExport('Sunset', { io, renderCover: cover.render });

  assert.equal(result.ok, true);
  assert.equal(result.coverPath, null);
  assert.match(result.coverMessage, /disk is full/);
  assert.ok(io.files.has(result.path), 'the effect itself must still be on disk');
});

test('effectFileName leaves an ordinary name alone', () => {
  assert.equal(effectFileName('Sunset over the lake'), 'Sunset over the lake');
  assert.equal(effectFileName('  Sunset  '), 'Sunset');
});
