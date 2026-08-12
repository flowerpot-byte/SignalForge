// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max Leopold Blumenschein
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mountGallery } from '../../app/renderer/components/gallery.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const dictionary = (name) => JSON.parse(
  readFileSync(join(root, 'app', 'renderer', 'i18n', `${name}.json`), 'utf8')
);

/**
 * The library shelf's own three quiet failures, against a stand-in DOM.
 *
 * All three are things that only show up while something is moving — a file
 * left out of the listing, a picture that will not decode, a folder that
 * changes while its pictures are still being fetched — and none of them is
 * reachable from the pixel harness, which sees one settled shelf. A recording
 * DOM is the honest instrument here: "the note says this, the image went back
 * to hidden, the second loop stopped" are exactly the claims being made.
 */

/** A DOM node that remembers what was done to it. */
function makeElement(tag) {
  const node = {
    tagName: tag,
    children: [],
    attributes: {},
    listeners: {},
    dataset: {},
    classList: {
      names: new Set(),
      add(name) { this.names.add(name); },
      remove(name) { this.names.delete(name); },
      toggle(name, on) { if (on) this.names.add(name); else this.names.delete(name); },
      contains(name) { return this.names.has(name); }
    },
    style: { properties: {}, setProperty(name, value) { this.properties[name] = value; } },
    id: '',
    className: '',
    textContent: '',
    hidden: false,
    src: '',
    alt: '',
    width: 0,
    height: 0,
    append(...kids) { node.children.push(...kids); },
    replaceChildren(...kids) { node.children = kids; },
    addEventListener(type, fn) { (node.listeners[type] ||= []).push(fn); },
    setAttribute(name, value) { node.attributes[name] = value; },
    getAttribute(name) { return node.attributes[name] ?? null; },
    removeAttribute(name) {
      delete node.attributes[name];
      // `src` is a reflected attribute: removing it in a real DOM empties the
      // property too, and that is the whole behaviour the broken-cover fix
      // relies on. A stand-in that kept the old value would let a test pass
      // over a line that does nothing in the window.
      if (name === 'src') node.src = '';
    },
    focus() { node.focused = true; },
    click() { node.listeners.click?.forEach((fn) => fn()); }
  };
  return node;
}

function installFakeDom() {
  globalThis.document = {
    createElement: makeElement,
    createElementNS: (_namespace, tag) => makeElement(tag)
  };
  globalThis.window = { SignalForgeEngine: {} };
}

const all = (node, out = []) => {
  out.push(node);
  for (const kid of node.children || []) all(kid, out);
  return out;
};

const byClass = (root_, className) =>
  all(root_).filter((node) => String(node.className).split(' ').includes(className));

const byId = (root_, id) => all(root_).find((node) => node.id === id) ?? null;

/** An entry as sf:library:list hands one over. */
const entry = (name, extra = {}) => ({
  file: `${name}.html`, name, cover: null, bytes: 44_000, modified: 100, ...extra
});

/** Mount a shelf and hand back everything a test here needs to poke at it. */
function shelf({ translate = (key) => key, requestCover = null } = {}) {
  installFakeDom();
  const container = makeElement('div');
  const opened = [];
  const api = mountGallery(container, {
    t: translate,
    onPicture: () => {},
    onStart: () => {},
    onOpenEffect: (chosen) => opened.push(chosen),
    requestCover
  });
  const tabs = all(container).filter((node) => node.attributes.role === 'tab');
  return {
    api,
    container,
    opened,
    note: byId(container, 'gallery-skipped'),
    libraryPanel: byId(container, 'gallery-library'),
    showLibrary: () => tabs.find((tab) => tab.id === 'gallery-tab-library').click(),
    tiles: () => byClass(container, 'tile-effect'),
    photos: () => byClass(container, 'tile-photo')
  };
}

// -------------------------------------------- the files that are left out (6)

/**
 * MaxAmbient.html, and every file like it.
 *
 * listEffects counted what it skipped and nothing read the count, so a file the
 * machine owner knows is in that folder simply was not there any more. His own
 * effect from this project's predecessor is exactly that file — it carries no
 * SignalForge document, so it cannot be a tile, and until now nothing said so.
 */
test('a file the shelf left out is mentioned, once, quietly', () => {
  const view = shelf({ translate: (key) => dictionary('de')[key] ?? key });
  view.api.setLibrary({ entries: [entry('Verlauf')], hasFolder: true, skipped: 1 });
  view.showLibrary();

  assert.equal(view.note.hidden, false, 'a file that vanished without a word is the bug this fixes');
  assert.equal(view.note.textContent, dictionary('de')['library.skippedOne']);
  assert.match(view.note.textContent, /^1 Datei/, 'one file is one file, not "1 Dateien"');
  assert.equal(
    view.note.className,
    'gallery-skipped',
    'and it is a note, not a warning: no error class, no alert role'
  );
  assert.equal(view.note.attributes.role, undefined, 'nothing announces it as a problem');
});

test('several files are counted in the sentence, not glued in front of it', () => {
  const view = shelf({ translate: (key) => dictionary('de')[key] ?? key });
  view.api.setLibrary({ entries: [], hasFolder: true, skipped: 4 });
  view.showLibrary();

  assert.equal(view.note.textContent, '4 Dateien im Ordner sind keine Effekte, die SignalForge öffnen kann.');
  assert.ok(!view.note.textContent.includes('{count}'), 'the placeholder must be filled in, not shown');
});

test('nothing left out means nothing said', () => {
  const view = shelf();
  view.api.setLibrary({ entries: [entry('Verlauf')], hasFolder: true, skipped: 0 });
  view.showLibrary();
  assert.equal(view.note.hidden, true);
});

test('the note belongs to the library shelf and never appears over the starting tiles', () => {
  const view = shelf();
  view.api.setLibrary({ entries: [], hasFolder: true, skipped: 2 });
  // Still on the starting shelf, which the note has nothing to do with.
  assert.equal(view.note.hidden, true);
  view.showLibrary();
  assert.equal(view.note.hidden, false);
  assert.equal(
    view.libraryPanel.getAttribute('aria-describedby'),
    'gallery-skipped',
    'the panel points at it, so a screen reader meets the shelf and the note together'
  );
});

test('a folder that gains nothing but a foreign file still says so', () => {
  // The stale-note case: setLibrary skips the rebuild when nothing looks
  // different, and the count is part of what looks different.
  const view = shelf();
  view.showLibrary();
  view.api.setLibrary({ entries: [entry('Verlauf')], hasFolder: true, skipped: 0 });
  assert.equal(view.note.hidden, true);

  view.api.setLibrary({ entries: [entry('Verlauf')], hasFolder: true, skipped: 1 });
  assert.equal(view.note.hidden, false, 'the entries are identical — only the count changed, and it counts');
});

test('both languages say it, and neither says the key', () => {
  for (const language of ['de', 'en']) {
    const words = dictionary(language);
    for (const key of ['library.skippedOne', 'library.skippedMany']) {
      assert.ok(words[key], `${language} is missing ${key}`);
    }
    assert.match(words['library.skippedMany'], /\{count\}/, `${language} must have somewhere to put the number`);
  }
});

// ------------------------------------ a picture that will not decode (11)

test('a cover that cannot be decoded goes back to the resting frame', () => {
  const view = shelf({ requestCover: async () => 'bm90IGEgcG5n' });
  view.api.setLibrary({ entries: [entry('Verlauf')], hasFolder: true, skipped: 0 });

  const [photo] = view.photos();
  // As the loop does when the bytes arrive.
  photo.src = 'data:image/png;base64,bm90IGEgcG5n';
  photo.hidden = false;

  // And as the browser does when it turns out they are not a picture: a .png in
  // that folder that is truncated, half written, or never was one.
  photo.onerror();

  assert.equal(photo.hidden, true, 'a broken-image box says the app is broken; the resting frame says "not yet"');
  assert.equal(photo.src, '', 'and the bytes that failed are let go of');
});

// ------------------------------------------ two loops at once (12)

/**
 * The interleaving this closes.
 *
 * Fetching the pictures is a loop with an await in it, and a rebuild can land
 * in the middle: a window regaining focus, an export landing, a folder changed
 * in Explorer. The old loop then went on filling tiles that had already been
 * thrown away, while a new loop ran beside it on the new ones — two loops both
 * asking the main process to draw covers, in whatever order they interleaved.
 */
test('a rebuilt library cancels the loop that was still fetching for the old one', async () => {
  const asked = [];
  let release = null;
  const requestCover = (file) => {
    asked.push(file);
    // The first ask hangs until this test lets it go; everything after it
    // answers at once, so the ORDER of what was asked is the whole record.
    if (asked.length === 1) return new Promise((resolve) => { release = resolve; });
    return Promise.resolve(null);
  };

  const view = shelf({ requestCover });
  view.api.setLibrary({ entries: [entry('Alt A'), entry('Alt B')], hasFolder: true, skipped: 0 });
  view.showLibrary();
  await Promise.resolve();
  assert.deepEqual(asked, ['Alt A.html'], 'one at a time: the second waits for the first');

  // The folder changed while the first picture was still being drawn.
  view.api.setLibrary({ entries: [entry('Neu')], hasFolder: true, skipped: 0 });
  await Promise.resolve();

  // And now the old fetch finally answers.
  release('AAAA');
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.ok(!asked.includes('Alt B.html'), 'the old loop must not go on asking for tiles that no longer exist');
  assert.deepEqual(
    asked.filter((file) => file === 'Neu.html'),
    ['Neu.html'],
    'and the new shelf is fetched exactly once, by exactly one loop'
  );
});

test('a picture that arrives after its tile is gone is not put anywhere', async () => {
  let release = null;
  const view = shelf({ requestCover: () => new Promise((resolve) => { release = resolve; }) });
  view.api.setLibrary({ entries: [entry('Alt')], hasFolder: true, skipped: 0 });
  view.showLibrary();
  await Promise.resolve();

  const [stale] = view.photos();
  view.api.setLibrary({ entries: [entry('Neu')], hasFolder: true, skipped: 0 });
  release('AAAA');
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(stale.hidden, true, 'a detached tile must not be filled in');
  assert.equal(stale.src, '', 'the picture belonged to a shelf that is gone');
});
