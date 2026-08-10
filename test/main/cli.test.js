// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { effectControls } from '../../src/export/effect-controls.js';
import { normalizeDocument } from '../../src/engine/document.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const cli = join(root, 'bin', 'sfexport.js');

// A 60x20 solid blue PNG. Verified real, not a placeholder.
const BLUE_60x20 = 'iVBORw0KGgoAAAANSUhEUgAAADwAAAAUCAIAAABeYcl+AAAAKklEQVR42u3OAQ0AAAgDoGv/zlpDN0hAJZNvOg9JS0tLS0tLS0tLS0vftzy0ASdQ1Ru5AAAAAElFTkSuQmCC';

test('the cli turns an image into an installed effect file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'signalforge-cli-'));
  const image = join(dir, 'blue.png');
  const outDir = join(dir, 'Effects');
  writeFileSync(image, Buffer.from(BLUE_60x20, 'base64'));

  try {
    const stdout = execFileSync(process.execPath, [
      cli, '--image', image, '--name', 'CLI Test', '--out', outDir, '--motion', 'warp'
    ], { encoding: 'utf8', cwd: root });

    const target = join(outDir, 'CLI Test.html');
    assert.ok(existsSync(target), `expected ${target}\n${stdout}`);

    const html = readFileSync(target, 'utf8');
    assert.match(html, /<title>CLI Test<\/title>/);
    assert.match(html, /<canvas id="exCanvas" width="320" height="200">/);
    assert.match(html, /"kind":\s*"warp"/);
    assert.ok(html.includes('SignalForgeEngine'));
    // The picture must be embedded, not referenced.
    assert.match(html, /"data":\s*"[A-Za-z0-9+/=]{100,}"/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the generated effect exposes motion and fit combobox controls with the engine\'s value lists', () => {
  const dir = mkdtempSync(join(tmpdir(), 'signalforge-cli-'));
  const image = join(dir, 'blue.png');
  const outDir = join(dir, 'Effects');
  writeFileSync(image, Buffer.from(BLUE_60x20, 'base64'));

  try {
    execFileSync(process.execPath, [
      cli, '--image', image, '--name', 'Controls Test', '--out', outDir, '--motion', 'warp', '--fit', 'cover'
    ], { encoding: 'utf8', cwd: root });

    const html = readFileSync(join(outDir, 'Controls Test.html'), 'utf8');

    // The engine's own value lists (MOTION_KINDS / FIT_MODES), not a second,
    // hand-copied list that could drift out of sync with them.
    assert.match(html, /<meta property="motion" label="Motion" type="combobox" values="none,warp,drift,breathe" default="warp"/);
    assert.match(html, /<meta property="fit" label="Fit" type="combobox" values="cover,stretch,contain" default="cover"/);

    // Both bindings must reach the layer, so a control change actually moves something.
    assert.ok(html.includes('typeof motion'), 'bootstrap must read the "motion" global every frame');
    assert.ok(html.includes('typeof fit'), 'bootstrap must read the "fit" global every frame');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the cli emits the shared control list itself, not a copy of it', () => {
  // The guard the whole of Task 11 turns on: the control list exists exactly
  // once in the project (src/export/effect-controls.js) and the command line
  // consumes it. Proven by behaviour, not by reading the source — the metas
  // the CLI actually wrote are compared against what effectControls produces
  // for the same document. Reinstate an inline list in bin/sfexport.js and
  // this test goes red the moment the two disagree about a property, a
  // range, a default or an order.
  const dir = mkdtempSync(join(tmpdir(), 'signalforge-cli-'));
  const image = join(dir, 'blue.png');
  const outDir = join(dir, 'Effects');
  writeFileSync(image, Buffer.from(BLUE_60x20, 'base64'));

  try {
    execFileSync(process.execPath, [
      cli, '--image', image, '--name', 'Shared List', '--out', outDir, '--motion', 'breathe', '--fit', 'contain'
    ], { encoding: 'utf8', cwd: root });

    const html = readFileSync(join(outDir, 'Shared List.html'), 'utf8');

    // The document the CLI baked in is read back out of its own output, so
    // the expectation is built from what was really exported.
    const baked = JSON.parse(html.match(
      /<script id="sf-document" type="application\/json">([\s\S]*?)<\/script>/)[1]);
    const expected = effectControls(normalizeDocument({ ...baked, controls: [] }).doc, 'a1');

    assert.deepEqual(
      baked.controls.map((control) => ({
        property: control.property, type: control.type, min: control.min, max: control.max,
        default: control.default, values: control.values, bind: control.bind
      })),
      expected.map((control) => ({
        property: control.property, type: control.type,
        min: control.min ?? 0, max: control.max ?? 100,
        default: control.default, values: control.values ?? [], bind: control.bind
      })),
      'the CLI must emit the shared control list, not a second copy of it'
    );

    // The three colour controls came with the shared list; before it existed
    // the CLI had no way to offer them at all.
    for (const property of ['saturation', 'greenMagenta', 'blueYellow']) {
      assert.match(html, new RegExp(`<meta property="${property}"`), `the "${property}" control is missing`);
      assert.ok(html.includes(`typeof ${property}`), `bootstrap must read the "${property}" global every frame`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the motion and fit control defaults follow --motion and --fit when the user never touches the sliders', () => {
  const dir = mkdtempSync(join(tmpdir(), 'signalforge-cli-'));
  const image = join(dir, 'blue.png');
  const outDir = join(dir, 'Effects');
  writeFileSync(image, Buffer.from(BLUE_60x20, 'base64'));

  try {
    execFileSync(process.execPath, [
      cli, '--image', image, '--name', 'Defaults Test', '--out', outDir, '--motion', 'drift', '--fit', 'contain'
    ], { encoding: 'utf8', cwd: root });

    const html = readFileSync(join(outDir, 'Defaults Test.html'), 'utf8');
    assert.match(html, /<meta property="motion"[^>]*default="drift"/);
    assert.match(html, /<meta property="fit"[^>]*default="contain"/);
    // The layer itself must also be baked in with the same values, matching
    // the command line -- not just the control's advertised default.
    assert.match(html, /"kind":\s*"drift"/);
    assert.match(html, /"fit":\s*"contain"/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the cli refuses to overwrite silently', () => {
  const dir = mkdtempSync(join(tmpdir(), 'signalforge-cli-'));
  const image = join(dir, 'blue.png');
  const outDir = join(dir, 'Effects');
  writeFileSync(image, Buffer.from(BLUE_60x20, 'base64'));

  try {
    const args = [cli, '--image', image, '--name', 'Twice', '--out', outDir];
    execFileSync(process.execPath, args, { encoding: 'utf8', cwd: root });
    assert.throws(
      () => execFileSync(process.execPath, args, { encoding: 'utf8', cwd: root, stdio: 'pipe' }),
      /already exists/
    );
    // --force gets through.
    execFileSync(process.execPath, [...args, '--force'], { encoding: 'utf8', cwd: root });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('"--name --force" does not let --force be swallowed as the name', () => {
  const dir = mkdtempSync(join(tmpdir(), 'signalforge-cli-'));
  const image = join(dir, 'blue.png');
  const outDir = join(dir, 'Effects');
  writeFileSync(image, Buffer.from(BLUE_60x20, 'base64'));

  try {
    const args = [cli, '--image', image, '--name', '--force', '--out', outDir];
    assert.throws(
      () => execFileSync(process.execPath, args, { encoding: 'utf8', cwd: root, stdio: 'pipe' }),
      /--name needs a value/
    );
    // Neither the folder nor a "--force.html" effect should exist: the bad
    // arguments must be rejected before anything is written.
    assert.ok(!existsSync(outDir), 'no output should have been written');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('an unknown option is rejected by name, not silently ignored', () => {
  const dir = mkdtempSync(join(tmpdir(), 'signalforge-cli-'));
  const image = join(dir, 'blue.png');
  const outDir = join(dir, 'Effects');
  writeFileSync(image, Buffer.from(BLUE_60x20, 'base64'));

  try {
    const args = [cli, '--image', image, '--otu', outDir];
    assert.throws(
      () => execFileSync(process.execPath, args, { encoding: 'utf8', cwd: root, stdio: 'pipe' }),
      /unknown option: --otu/
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('an invalid --motion value is rejected', () => {
  const dir = mkdtempSync(join(tmpdir(), 'signalforge-cli-'));
  const image = join(dir, 'blue.png');
  const outDir = join(dir, 'Effects');
  writeFileSync(image, Buffer.from(BLUE_60x20, 'base64'));

  try {
    const args = [cli, '--image', image, '--out', outDir, '--motion', 'zzz'];
    assert.throws(
      () => execFileSync(process.execPath, args, { encoding: 'utf8', cwd: root, stdio: 'pipe' }),
      /unknown --motion value.*zzz/
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a prepare-time failure surfaces the real cause, not a bare exit code', () => {
  const dir = mkdtempSync(join(tmpdir(), 'signalforge-cli-'));
  const image = join(dir, 'broken.png');
  const outDir = join(dir, 'Effects');
  // Bytes that are not a PNG at all, just wearing the extension. The
  // browser's image decoder must reject this, and that specific reason
  // must reach the user instead of a bare "prepare failed (1)".
  writeFileSync(image, Buffer.from('this is not an image, just text with a .png name', 'utf8'));

  try {
    const args = [cli, '--image', image, '--out', outDir];
    assert.throws(
      () => execFileSync(process.execPath, args, { encoding: 'utf8', cwd: root, stdio: 'pipe' }),
      /could not decode image/
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
