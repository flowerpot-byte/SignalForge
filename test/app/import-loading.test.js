// SignalForge — build SignalRGB effects from images, gradients, shapes and particles.
// Copyright (C) 2026 Max Leopold Blumenschein
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { runElectron } from '../harness/spawn-electron.js';

const require_ = createRequire(import.meta.url);
const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

/**
 * The stage's "wird geladen" condition (preview.js's setLoading, wired up in
 * app/renderer/main.js's importFile), proved in the real window rather than
 * only against a fake DOM — see test/harness/import-loading.js for how the
 * three ways an import can end are each reached deterministically, and why
 * sf:importImage's own IPC handler is the one thing replaced to do it.
 *
 * The screenshot this takes (the frame mid-import) lands in
 * work/polish-shots/, which is not itself a check — a human looks at it — but
 * having the harness always write it is what makes "go look" possible without
 * a second, photograph-only run.
 */
test('the stage enters its loading condition on import and clears it on every exit', async () => {
  const shotsDir = join(root, 'work', 'polish-shots');
  const { code, stdout, stderr } = await runElectron(
    require_('electron'),
    [join(root, 'test', 'harness', 'import-loading.js')],
    {
      env: { ...process.env, SF_IMPORT_LOADING_SHOTS: shotsDir },
      timeoutMs: 90_000,
      label: 'the import-loading harness'
    }
  );

  assert.equal(code, 0, `harness exited with ${code}\n${stderr}`);
  const report = JSON.parse(stdout.trim().split('\n').pop());

  assert.equal(
    report.loadingAppearsOnStart, true,
    'the frame must carry #preview-body.is-loading the instant an import starts, before sf:importImage resolves'
  );

  // Exit 1: the import succeeds.
  assert.equal(report.loadingClearsOnSuccess, true, 'a successful import must clear the loading condition');
  assert.equal(report.hasPictureAfterSuccess, true, 'the picture that just loaded must actually be on the stage');

  // Exit 2: sf:importImage resolves `{ ok: false }` — a refusal, not a throw.
  assert.equal(report.loadingClearsOnFailure, true, 'a refused import must clear the loading condition too');
  assert.ok(
    typeof report.messageAfterFailure === 'string' && report.messageAfterFailure.length > 0,
    'a refused import must still say so on the one line of feedback'
  );

  // Exit 3: the bridge call itself rejects — an unexpected throw, not the
  // ordinary `{ ok: false }` shape. Falsifiable against exactly the bug this
  // guards: move preview.setLoading(false) out of importFile's `finally` and
  // into the end of the try block, and this one goes red while the two above
  // stay green — the loading condition would be stuck on forever the moment
  // anything in the try throws.
  assert.equal(report.loadingClearsOnException, true, 'a thrown rejection must clear the loading condition');
  assert.ok(
    typeof report.messageAfterException === 'string' && report.messageAfterException.length > 0,
    'a thrown rejection must still reach the one line of feedback, not an unhandled rejection in the console'
  );
});
