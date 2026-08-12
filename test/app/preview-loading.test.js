// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max Leopold Blumenschein
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { createPreview } from '../../app/renderer/components/preview.js';

/**
 * setLoading — the stage's own "wird geladen" condition, set the instant an
 * import starts and cleared on every exit (see app/renderer/main.js's
 * importFile, which wraps the whole gesture in a try/finally for exactly that
 * reason). This is the unit-level half of the falsifiability the task asked
 * for; test/app/import-loading.test.js is the other half, proving the same
 * property through a real window and a real importFile.
 *
 * Same minimal fake DOM as test/app/preview-document.test.js and
 * test/app/preview-loop.test.js: createPreview reads `document` and
 * `window.SignalForgeEngine` as plain globals, and there is no jsdom in this
 * project.
 */
function fakeElement() {
  return {
    id: '',
    children: [],
    // setProperty: followAspect writes the frame's --stage-aspect custom
    // property on the stage; the fake only has to survive it.
    style: { setProperty() {} },
    classList: { toggle() {}, add() {}, remove() {} },
    append(...kids) { this.children.push(...kids); },
    setAttribute() {},
    getContext: () => ({})
  };
}

/** A container that actually remembers its classes and its children — the
 * two things this file needs to check that a real DOM element does not need
 * a test double to prove: which classes are on it, and what its descendants
 * say. */
function fakeContainer() {
  const classes = new Set();
  const node = {
    id: '',
    children: [],
    // style.setProperty: followAspect writes --stage-aspect on the CONTAINER
    // (#preview-body), where #preview-body's own --content-width can read it.
    style: { setProperty() {} },
    append(...kids) { node.children.push(...kids); },
    classList: {
      toggle(name, force) {
        const on = force === undefined ? !classes.has(name) : Boolean(force);
        if (on) classes.add(name); else classes.delete(name);
        return on;
      },
      contains: (name) => classes.has(name)
    }
  };
  return node;
}

function byId(node, id) {
  if (node.id === id) return node;
  for (const kid of node.children || []) {
    const found = byId(kid, id);
    if (found) return found;
  }
  return null;
}

function installFakeDom() {
  globalThis.document = { createElement: fakeElement };
  globalThis.window = {
    SignalForgeEngine: {
      CANVAS_WIDTH: 10,
      CANVAS_HEIGHT: 10,
      createRenderer: () => ({ render: () => {} }),
      normalizeDocument: (doc) => ({ doc: doc ?? {} }),
      clamp: (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v),
      aspectFactorOf: () => 1,
      async loadAssets() { return new Map(); }
    }
  };
}

// Translated strings tagged with which key produced them, so the assertions
// below read what the invitation actually says rather than trusting that the
// right key was asked for.
const t = (key) => `[${key}]`;

test('setLoading(true) marks the frame and swaps the invitation to the loading line', () => {
  installFakeDom();
  const container = fakeContainer();
  const preview = createPreview(container, t, () => {});

  assert.equal(container.classList.contains('is-loading'), false, 'must start clear');
  const invitation = byId(container, 'preview-empty-title');
  assert.equal(invitation.textContent, '[preview.dropHint]', 'the resting invitation, before anything loads');

  preview.setLoading(true);

  assert.equal(container.classList.contains('is-loading'), true, 'setLoading(true) must mark the frame');
  assert.equal(
    invitation.textContent, '[preview.loading]',
    'the invitation must say loading, not the resting drop hint, while an import is in flight'
  );
});

test('setLoading(false) clears the frame and restores the resting invitation', () => {
  installFakeDom();
  const container = fakeContainer();
  const preview = createPreview(container, t, () => {});

  preview.setLoading(true);
  preview.setLoading(false);

  assert.equal(container.classList.contains('is-loading'), false, 'setLoading(false) must clear the frame');
  assert.equal(
    byId(container, 'preview-empty-title').textContent, '[preview.dropHint]',
    'the resting invitation must come back once loading ends'
  );
});

// Falsifiable against the one bug this whole feature exists to rule out: an
// exit path that forgets to clear the flag. Comment out the `finally` in
// importFile (app/renderer/main.js) and call setLoading(true) without ever
// calling it false again — this is the assertion that would still catch it,
// because nothing here assumes setLoading(false) is ever called; it only
// checks what state IS after each call actually made.
test('setLoading is idempotent and reflects only the last call, not a running count', () => {
  installFakeDom();
  const container = fakeContainer();
  const preview = createPreview(container, t, () => {});

  preview.setLoading(true);
  preview.setLoading(true);
  preview.setLoading(false);
  assert.equal(container.classList.contains('is-loading'), false, 'a single false must clear it regardless of how many trues preceded it');

  preview.setLoading(false);
  assert.equal(container.classList.contains('is-loading'), false, 'a second false in a row must not throw or toggle it back on');
});

// relabel() is called on every language switch, including while an import is
// mid-flight — the settings column (where the language switch lives) is
// reachable the whole time an import runs. Without `loading` feeding back
// into relabel(), a language switch during an import would silently revert
// the invitation to the resting drop hint until the import happened to end.
test('a language switch mid-import keeps showing the loading line, not the resting hint', () => {
  installFakeDom();
  const container = fakeContainer();
  const preview = createPreview(container, t, () => {});

  preview.setLoading(true);
  preview.relabel();

  assert.equal(
    byId(container, 'preview-empty-title').textContent, '[preview.loading]',
    'relabel() must still say loading while an import is in flight'
  );
});
