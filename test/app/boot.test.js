// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const require_ = createRequire(import.meta.url);
const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

test('the app boots, opens a window and exposes its bridge', async () => {
  const child = spawn(require_('electron'), [join(root, 'app', 'main.js'), '--sf-selftest'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, SF_SELFTEST: '1' }
  });

  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (c) => { stdout += c; });
  child.stderr.on('data', (c) => { stderr += c; });

  const code = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.kill(); reject(new Error(`app did not finish\n${stderr}`)); }, 60_000);
    child.on('error', reject);
    child.on('close', (c) => { clearTimeout(timer); resolve(c); });
  });

  assert.equal(code, 0, `app exited with ${code}\n${stderr}`);
  const report = JSON.parse(stdout.trim().split('\n').pop());
  assert.equal(report.windowOpened, true);
  assert.equal(report.bridge, true, 'window.sf must exist in the renderer');
  assert.equal(report.nodeInRenderer, false, 'the renderer must not reach Node');
  assert.equal(
    report.navigationBlocked,
    true,
    'a top-level navigation to an external URL must be blocked (will-navigate guard)'
  );
  assert.equal(
    report.popupBlocked,
    true,
    'window.open must be denied and must not create a new window (setWindowOpenHandler guard)'
  );
  assert.equal(
    report.forgedFileImportRejected,
    true,
    'sf:importImage must reject a File with no real disk path (webUtils.getPathForFile === "") ' +
      'with the ordinary visible-error shape, never read an arbitrary renderer-forged path'
  );
});
