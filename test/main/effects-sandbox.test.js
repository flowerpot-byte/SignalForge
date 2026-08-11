// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  resolveEffectsTarget, SANDBOX_ENV, SANDBOX_REQUIRED_ENV, SANDBOX_MISSING_MESSAGE
} from '../../src/main/effects-target.js';
import { runElectron } from '../harness/spawn-electron.js';

const require_ = createRequire(import.meta.url);
const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

// A pretend machine, never a real one. HOME/DOCS are strings that are never
// touched on disk; `exists` below decides what is there.
const HOME = 'C:\\Users\\Someone';
const DOCS = `${HOME}\\Documents`;
const REAL_INSTALLATION = `${DOCS}\\WhirlwindFX\\Effects`;
const SANDBOX = 'C:\\Temp\\sf-sandbox';

const settingsWith = (folder) => ({ get: (k) => (k === 'effectsFolder' ? folder : undefined) });

test('the suite arms the gate for every test process, without any test asking for it', () => {
  // If this fails, `npm test` is no longer passing
  // --import ./test/support/effects-sandbox.js, and every guard below has
  // quietly stopped applying to the harnesses that inherit their environment.
  assert.equal(
    process.env[SANDBOX_REQUIRED_ENV],
    '1',
    `${SANDBOX_REQUIRED_ENV} must be set for every test process — see the "test" script in `
      + 'package.json and test/support/effects-sandbox.js'
  );
});

test('armed but told no sandbox, nothing resolves at all', () => {
  assert.throws(
    () => resolveEffectsTarget({
      settings: settingsWith(undefined),
      documentsPath: DOCS,
      homePath: HOME,
      exists: () => true,
      sandboxRequired: true
    }),
    (error) => error.message === SANDBOX_MISSING_MESSAGE,
    'a harness that names no sandbox must be refused before any search happens'
  );
});

test('the forgotten seed: a real installation found outside the sandbox is refused, not returned', () => {
  // This is the incident, reduced to its parts: no effectsFolder in the
  // settings, a Documents folder that does hold an installation, and a
  // sandbox somewhere else entirely. Before the gate, this returned
  // { folder: REAL_INSTALLATION, source: 'detected' } and exports went there.
  assert.throws(
    () => resolveEffectsTarget({
      settings: settingsWith(undefined),
      documentsPath: DOCS,
      homePath: HOME,
      exists: (p) => p === REAL_INSTALLATION,
      sandboxRoot: SANDBOX,
      sandboxRequired: true
    }),
    /outside the test sandbox/,
    'a detected folder outside the sandbox must stop the run'
  );
});

test('a configured folder outside the sandbox is refused even when its name says nothing about SignalRGB', () => {
  // The point of this one: the refusal is containment, not the WhirlwindFX
  // literal. A real folder that happens to be called something else is just as
  // much somebody's own data.
  const elsewhere = 'D:\\Photos\\Effects';
  assert.throws(
    () => resolveEffectsTarget({
      settings: settingsWith(elsewhere),
      documentsPath: DOCS,
      homePath: HOME,
      exists: (p) => p === elsewhere,
      sandboxRoot: SANDBOX,
      sandboxRequired: true
    }),
    /outside the test sandbox/,
    'containment must not depend on recognising the folder as SignalRGB\'s'
  );
});

test('a folder inside the sandbox resolves exactly as it always did', () => {
  const inside = join(SANDBOX, 'Effects');
  const r = resolveEffectsTarget({
    settings: settingsWith(inside),
    documentsPath: DOCS,
    homePath: HOME,
    exists: (p) => p === inside || p === REAL_INSTALLATION,
    sandboxRoot: SANDBOX,
    sandboxRequired: true
  });
  assert.deepEqual(r, { folder: inside, source: 'configured' });
});

test('inside a sandbox with nothing in it, the app still asks the user', () => {
  const r = resolveEffectsTarget({
    settings: settingsWith(undefined),
    documentsPath: join(SANDBOX, 'docs'),
    homePath: SANDBOX,
    exists: () => false,
    sandboxRoot: SANDBOX,
    sandboxRequired: true
  });
  assert.deepEqual(r, { folder: null, source: 'none' });
});

test('with neither test-only signal given, the gate does nothing at all', () => {
  // The machine owner's own app must keep finding his own folder. Same inputs
  // as the refusal above, minus the sandbox arguments.
  const r = resolveEffectsTarget({
    settings: settingsWith(undefined),
    documentsPath: DOCS,
    homePath: HOME,
    exists: (p) => p === REAL_INSTALLATION
  });
  assert.deepEqual(r, { folder: REAL_INSTALLATION, source: 'detected' });
});

test('a harness that redirects userData and forgets the sandbox dies loudly instead of '
  + 'finding an installation', async () => {
  // The end-to-end half: a real Electron, a real app/main.js, and a harness
  // written the way the one in the incident was written. See
  // test/support/forgetful-harness.js — it redirects userData, seeds no
  // effectsFolder and names no sandbox, and its Documents folder is a
  // stand-in holding a WhirlwindFX/Effects folder for app/main.js to find.
  const out = mkdtempSync(join(tmpdir(), 'signalforge-forgetful-'));
  const standIn = join(out, 'documents', 'WhirlwindFX', 'Effects');
  mkdirSync(standIn, { recursive: true });
  mkdirSync(join(out, 'userdata'), { recursive: true });

  try {
    // Deliberately no SF_EFFECTS_SANDBOX and no SF_SELFTEST: the environment is
    // inherited as-is, which is what proves the arming in package.json reaches
    // a spawned Electron on its own.
    assert.equal(process.env[SANDBOX_ENV], undefined, 'this test must not be handed a sandbox');
    // Through runElectron (test/harness/spawn-electron.js), like every other
    // Electron spawn in the suite, so this one cannot be the copy that forgets
    // to kill what it started. This harness is meant to be refused within a
    // second or two of starting; 60 s is only there so a machine under load
    // still gets a real answer.
    const { code, stdout, stderr } = await runElectron(
      require_('electron'),
      [join(root, 'test', 'support', 'forgetful-harness.js')],
      {
        env: { ...process.env, SF_FORGETFUL_OUT: out },
        timeoutMs: 60_000,
        label: 'the forgetful harness'
      }
    );

    assert.notEqual(
      code, 0,
      'a harness that forgot the sandbox must fail, not start\n'
        + `stdout: ${stdout}\nstderr: ${stderr}`
    );
    assert.match(
      stderr,
      new RegExp(SANDBOX_REQUIRED_ENV),
      `the refusal must name ${SANDBOX_REQUIRED_ENV} so the author knows what to fix\n`
        + `stdout: ${stdout}\nstderr: ${stderr}`
    );
    assert.equal(
      readdirSync(standIn).length, 0,
      'nothing may have been written into the stand-in installation'
    );
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});
