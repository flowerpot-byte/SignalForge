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

  // Save and open, driven by clicking the app's own footer buttons in the
  // real window. Only the two OS file dialogs are stubbed (see
  // selfTestProjects in app/main.js) — a modal dialog would wait for a human.
  assert.match(
    report.projectOpenedMessage,
    /seed\.sfx/,
    'opening a project must say so in the window, naming the file'
  );
  assert.deepEqual(
    report.projectOpenedControls,
    {
      fit: 'contain',
      motion0: 'drift',
      motion1: 'breathe',
      speed0: '7',
      amount0: '66',
      brightness: '42',
      saturation: '133',
      greenMagenta: '-20'
    },
    'the settings column must show the opened project, not the values it had before'
  );
  assert.match(report.projectSavedMessage, /saved\.sfx/, 'saving must say so in the window');
  assert.equal(
    report.projectRoundTripIdentical,
    true,
    'a project saved out of the live window must be byte for byte the project that was opened ' +
      '— picture, crop offset, motions, colour and brightness all included'
  );

  // A file that cannot be read must produce a message and change nothing.
  assert.match(
    report.corruptProjectMessage,
    /could not be read/i,
    'a truncated project file must produce a visible message, not a blank window'
  );
  assert.equal(report.corruptProjectWarned, true, 'that message must be marked as a warning');
  assert.deepEqual(
    report.controlsAfterCorrupt,
    report.projectOpenedControls,
    'a project that failed to open must leave the one already open exactly as it was'
  );

  // A stored value the slider's normal range cannot reach must be shown as it
  // is, not silently rounded up to the nearest end of the slider.
  assert.deepEqual(
    report.dimBrightness,
    { value: '3', min: '3' },
    'a project carrying brightness 3 must show 3, with the slider widened to reach it'
  );

  assert.equal(
    report.cursorOverPicture,
    'grab',
    'an opened project must still be draggable: the picture has to be measured again, ' +
      'because the document does not carry its size'
  );
});
