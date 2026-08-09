// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prepareImageFile } from '../../src/main/prepare-image.js';

// A 60x20 solid blue PNG. Verified real, not a placeholder.
const BLUE_60x20 = 'iVBORw0KGgoAAAANSUhEUgAAADwAAAAUCAIAAABeYcl+AAAAKklEQVR42u3OAQ0AAAgDoGv/zlpDN0hAJZNvOg9JS0tLS0tLS0tLS0vftzy0ASdQ1Ru5AAAAAElFTkSuQmCC';

test('a timeout shorter than any real Electron launch rejects instead of hanging', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'signalforge-prepare-timeout-'));
  const image = join(dir, 'blue.png');
  writeFileSync(image, Buffer.from(BLUE_60x20, 'base64'));

  // Isolate this test's view of the OS temp directory before checking for
  // leaks. prepareImageFile always creates its scratch directory under
  // os.tmpdir() with the prefix 'signalforge-prepare-', and so does every
  // other prepareImageFile call in the suite — including the ones
  // cli.test.js triggers through a subprocess. `node --test` runs test
  // files as separate, concurrently-running processes, so diffing the real,
  // shared OS temp directory can catch another file's in-flight temp
  // directory between the two snapshots and fail this assertion for
  // reasons unrelated to what it's testing. os.tmpdir() re-reads
  // TMPDIR/TMP/TEMP from the environment on every call rather than caching
  // it, and the Electron child prepareImageFile spawns inherits this
  // process's environment, so pointing those variables at a directory
  // created fresh for (and used only by) this test routes every temp
  // directory this test's prepareImageFile calls create into a namespace
  // nothing else can write to.
  const isolatedTmp = mkdtempSync(join(tmpdir(), 'signalforge-prepare-isolated-'));
  const savedEnv = { TMPDIR: process.env.TMPDIR, TMP: process.env.TMP, TEMP: process.env.TEMP };
  process.env.TMPDIR = isolatedTmp;
  process.env.TMP = isolatedTmp;
  process.env.TEMP = isolatedTmp;

  try {
    // 1ms is far shorter than any real Electron launch, so this reliably
    // exercises the timeout path (the 'close' event has no chance to fire
    // first) rather than racing a genuine completion. Known limitation:
    // at 1ms the timer can fire before the child process has even finished
    // spawning, so this proves the timer and rejection message but not
    // that a live child was actually killed. Proving that cleanly would
    // mean either waiting for a real Electron launch (seconds, against
    // this suite's whole point) or inspecting OS process state across
    // platforms (fragile, and prepareImageFile doesn't expose the child's
    // pid to do it). Neither is cheap, so this is left as an honest gap
    // rather than a fragile "proof".
    await assert.rejects(
      () => prepareImageFile(image, {}, { timeoutMs: 1 }),
      /timed out after 1ms/
    );

    // The timeout path must clean up its temp directory just like the
    // success and failure paths do. isolatedTmp was created empty and
    // exclusively for this test, so any 'signalforge-prepare-*' entry left
    // in it now is a leak from the call above, not from anything else.
    const leftover = readdirSync(isolatedTmp).filter((name) => name.startsWith('signalforge-prepare-'));
    assert.deepEqual(leftover, [], 'no prepare temp directory should survive a timeout');
  } finally {
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(isolatedTmp, { recursive: true, force: true });
    rmSync(dir, { recursive: true, force: true });
  }
});
