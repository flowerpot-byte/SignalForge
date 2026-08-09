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

  const before = new Set(readdirSync(tmpdir()).filter((name) => name.startsWith('signalforge-prepare-')));

  try {
    // 1ms is far shorter than any real Electron launch, so this reliably
    // exercises the timeout path (the 'close' event has no chance to fire
    // first) rather than racing a genuine completion.
    await assert.rejects(
      () => prepareImageFile(image, {}, { timeoutMs: 1 }),
      /timed out after 1ms/
    );

    // The timeout path must clean up its temp directory just like the
    // success and failure paths do.
    const after = readdirSync(tmpdir()).filter((name) => name.startsWith('signalforge-prepare-'));
    const leftover = after.filter((name) => !before.has(name));
    assert.deepEqual(leftover, [], 'no prepare temp directory should survive a timeout');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
