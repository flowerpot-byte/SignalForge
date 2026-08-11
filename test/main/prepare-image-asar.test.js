// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, cpSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { resolveElectronBin } from '../../src/main/prepare-image.js';
import { runElectron } from '../harness/spawn-electron.js';

const require_ = createRequire(import.meta.url);
const REPO = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

/**
 * The one thing about prepare-image.js that only a packaged build can answer.
 *
 * prepareImageInProcess's `createWindow` defaults to
 *
 *     new (createRequire(import.meta.url)('electron').BrowserWindow)({ show: false, ... })
 *
 * and `ENGINE_HOST` is `join(dirname(import.meta.url), 'engine-host.html')`.
 * In a source checkout both of those resolve against an ordinary folder. Once
 * installed, `import.meta.url` points INSIDE app.asar, so the same two lines
 * ask Electron's require hook to serve 'electron' to a module loaded out of an
 * archive, and ask `loadFile` to open a page out of that same archive.
 *
 * Every other test in this project injects its own `createWindow`, so the real
 * default factory was never once exercised — and this is the very same shape of
 * gap that hid the bug this file's neighbour documents: prepare-image.js used
 * to spawn `process.execPath` with a script path, which a packaged .exe ignores
 * entirely, so every single image import would have failed the moment the app
 * was installed. It was invisible to a green test suite and obvious the first
 * time somebody dropped a picture on the built app.
 *
 * So: build a real .asar out of the very files package.json's `build.files`
 * puts in the shipped one, run Electron against it, and call prepareImageFile
 * with NO third argument, so the genuine default factory runs.
 *
 * WHAT THIS PROVES: that `require('electron')` and `loadFile` both work for a
 * copy of src/main/prepare-image.js living inside an .asar, reached through the
 * module's own untouched defaults, and that the window it opens to do the work
 * is never shown.
 *
 * WHAT THIS DOES NOT PROVE: it runs the development electron.exe against a
 * hand-built archive, so `app.isPackaged` is false and nothing here exercises
 * electron-builder's own output — the NSIS installer, the produced
 * SignalForge.exe, its fixed entry point, or code signing. Those need the real
 * build; see .superpowers/sdd/packaged-verification-report.md for the run that
 * did exactly that against release/win-unpacked.
 */

// A 60x20 solid blue PNG. The same one prepare-image.test.js uses.
const BLUE_60x20 = 'iVBORw0KGgoAAAANSUhEUgAAADwAAAAUCAIAAABeYcl+AAAAKklEQVR42u3OAQ0AAAgDoGv/zlpDN0hAJZNvOg9JS0tLS0tLS0tLS0vftzy0ASdQ1Ru5AAAAAElFTkSuQmCC';

// Electron's cold launch plus packing a small archive. Generous for the same
// reason test/harness/render.js is: a slow machine must not be called a
// failure, but a genuine hang has to end as one rather than run forever.
const TIMEOUT_MS = 90_000;

/**
 * The entry point that goes into the archive.
 *
 * Deliberately tiny and NOT app/main.js: this is about one function's own
 * defaults, so nothing else gets a chance to open a window or resolve a
 * folder. It watches every window this process makes, because "it works" and
 * "it works without anything appearing on screen" are two separate claims.
 */
const RUNNER = `// SPDX-License-Identifier: GPL-3.0-or-later
import { app } from 'electron';
import { writeFileSync } from 'node:fs';

const windows = [];
app.on('browser-window-created', (_event, win) => {
  const record = { visibleAtCreate: win.isVisible(), everShown: false };
  windows.push(record);
  win.on('show', () => { record.everShown = true; });
});

app.whenReady().then(async () => {
  const out = { appPath: app.getAppPath() };
  try {
    out.moduleUrl = import.meta.resolve('./src/main/prepare-image.js');
    const { prepareImageFile, ENGINE_HOST } = await import('./src/main/prepare-image.js');
    out.engineHost = ENGINE_HOST;
    // No third argument: the real default inProcess, and with it the real
    // default createWindow. This is the whole point of the file.
    out.asset = await prepareImageFile(process.env.SF_ASAR_IMAGE);
    out.ok = true;
  } catch (error) {
    out.ok = false;
    out.error = String(error?.stack || error);
  }
  out.windows = windows;
  writeFileSync(process.env.SF_ASAR_OUT, JSON.stringify(out), 'utf8');
  app.exit(0);
});
`;

/**
 * Copy what the shipped archive contains, read from package.json's own
 * `build.files` rather than listed a second time here — so a change to what
 * gets packaged changes what this test packages too. Entries are either a
 * whole folder ("src/**\/*") or a single file ("dist/engine.bundle.js"); this
 * project has never used anything more elaborate, and an entry that is neither
 * is refused rather than silently skipped.
 */
function stagePackagedFiles(stage) {
  const pkg = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8'));
  const entries = pkg.build?.files;
  assert.ok(Array.isArray(entries) && entries.length > 0, 'package.json has no build.files list');
  assert.ok(
    entries.includes('src/**/*'),
    'build.files no longer ships src/, so the packaged app could not prepare an image at all'
  );

  for (const entry of entries) {
    const folder = entry.endsWith('/**/*') ? entry.slice(0, -5) : null;
    const source = join(REPO, folder ?? entry);
    assert.ok(
      existsSync(source),
      `build.files names "${entry}", which does not exist — run: npm run build:engine`
    );
    const target = join(stage, folder ?? entry);
    mkdirSync(dirname(target), { recursive: true });
    cpSync(source, target, { recursive: Boolean(folder) });
  }

  // The archive's own entry point. The packaged package.json is the real one,
  // copied above — only `main` is redirected at the runner, so `type: module`
  // and everything else stay exactly as they ship.
  const pkgFile = join(stage, 'package.json');
  const staged = JSON.parse(readFileSync(pkgFile, 'utf8'));
  staged.main = 'asar-runner.mjs';
  writeFileSync(pkgFile, JSON.stringify(staged, null, 2), 'utf8');
  writeFileSync(join(stage, 'asar-runner.mjs'), RUNNER, 'utf8');
}

test('the DEFAULT window factory prepares an image from inside an .asar', async () => {
  // Provided by electron-builder, which is a devDependency: this is the very
  // library that builds the shipped archive. If it ever disappears this fails
  // loudly here rather than quietly stopping covering the packaged case.
  const asar = require_('@electron/asar');

  const work = mkdtempSync(join(tmpdir(), 'signalforge-asar-'));
  try {
    const stage = join(work, 'stage');
    mkdirSync(stage, { recursive: true });
    stagePackagedFiles(stage);

    const archive = join(work, 'app.asar');
    await asar.createPackage(stage, archive);

    const image = join(work, 'blue.png');
    writeFileSync(image, Buffer.from(BLUE_60x20, 'base64'));
    const outFile = join(work, 'result.json');

    // `electron <path-to.asar>` loads that archive as the application, which
    // is what puts every module below inside one.
    // Through runElectron (test/harness/spawn-electron.js): the same
    // timeout-plus-settled-guard pair this used to carry itself, in the one
    // place every Electron spawn in the suite now shares — including the kill,
    // because a descendant holding a pipe open can stop 'close' from ever
    // firing and nothing else would come back for the process.
    const { code, stderr } = await runElectron(
      resolveElectronBin(),
      [archive],
      {
        env: { ...process.env, SF_ASAR_IMAGE: image, SF_ASAR_OUT: outFile },
        timeoutMs: TIMEOUT_MS,
        label: 'the packaged image factory'
      }
    );

    assert.ok(
      existsSync(outFile),
      `the packaged runner wrote no result (exit ${code})\n${stderr}`
    );
    const result = JSON.parse(readFileSync(outFile, 'utf8'));
    assert.equal(result.ok, true, `preparing the image failed inside the archive:\n${result.error}`);

    // It really was an archive, and prepare-image.js really was read out of it
    // — otherwise this whole file would be a slower copy of a check that
    // already exists.
    assert.match(result.appPath, /\.asar$/);
    assert.match(result.moduleUrl, /\.asar\/src\/main\/prepare-image\.js$/);
    assert.match(result.engineHost, /\.asar[\\/]src[\\/]main[\\/]engine-host\.html$/);

    // And the asset is the real thing, not an empty shell: the engine host
    // page loaded out of the archive and the canvas in it did the work.
    assert.equal(result.asset.kind, 'image');
    assert.equal(result.asset.width, 60);
    assert.equal(result.asset.height, 20);
    assert.ok(result.asset.data.length > 100, 'the prepared asset carries no image data');

    // Exactly one window, the factory's own, and nobody ever saw it.
    assert.equal(result.windows.length, 1);
    assert.deepEqual(result.windows[0], { visibleAtCreate: false, everShown: false });
  } finally {
    rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});
