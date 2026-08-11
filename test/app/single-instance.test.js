// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require_ = createRequire(import.meta.url);
const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const harness = join(root, 'test', 'support', 'single-instance-harness.js');

/**
 * Spawn test/support/single-instance-harness.js — the real app/main.js, real
 * lock and all, pointed at a throwaway userData/effects pair the test owns.
 */
function spawnHarness(out, effects) {
  const child = spawn(require_('electron'), [harness], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, SF_SINGLE_INSTANCE_OUT: out, SF_SINGLE_INSTANCE_EFFECTS: effects }
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (c) => { stdout += c; });
  child.stderr.on('data', (c) => { stderr += c; });
  return { child, get stdout() { return stdout; }, get stderr() { return stderr; } };
}

function waitFor(proc, pattern, ms = 20_000) {
  return new Promise((resolve, reject) => {
    const timer = setInterval(() => {
      if (pattern.test(proc.stdout)) { clearInterval(timer); clearTimeout(timeout); resolve(); }
    }, 50);
    const timeout = setTimeout(() => {
      clearInterval(timer);
      reject(new Error(`timed out waiting for ${pattern}\nstdout: ${proc.stdout}\nstderr: ${proc.stderr}`));
    }, ms);
  });
}

function waitForExit(proc, ms = 20_000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { proc.child.kill(); reject(new Error(`process never exited\nstdout: ${proc.stdout}`)); }, ms);
    proc.child.on('close', (code) => { clearTimeout(timer); resolve(code); });
  });
}

/** Kill and wait for the process to actually be gone, not merely asked to go. */
function killAndWaitForExit(proc, ms = 10_000) {
  // Already gone: 'close' has fired and will not fire again, so waiting for it
  // would mean sitting out the full timeout for nothing.
  if (proc.child.exitCode !== null || proc.child.signalCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    proc.child.on('close', () => { clearTimeout(timer); resolve(); });
    proc.child.kill();
  });
}

test('a second instance exits without opening a window, and the first is told about it', async () => {
  const out = mkdtempSync(join(tmpdir(), 'signalforge-singleinstance-'));
  const effects = join(out, 'Effects');
  const first = spawnHarness(out, effects);
  // Held out here so the `finally` can reach it however this test ends. Both
  // processes are real Electron main processes with a real window each, and a
  // test that threw between spawning one and waiting for it would otherwise
  // leave it resident — which is the whole class of defect this round is
  // about. The harness itself also carries a watchdog (see
  // test/support/single-instance-harness.js), because this test process dying
  // outright is the one thing no `finally` here can cover.
  let second = null;

  try {
    // The first instance: a genuine app.requestSingleInstanceLock() success,
    // a real window created.
    await waitFor(first, /harness ready windowCount=1/);

    // Minimised on purpose, so the second-instance handler's win.restore()
    // has something to actually do — proving it works, not merely that it
    // was called on a window that was already normal. Signalled through a
    // file rather than stdin: measured by hand, a real electron.exe process
    // never delivers 'data' events on its own stdin (see
    // test/support/single-instance-harness.js), so a command sent that way
    // would silently vanish.
    writeFileSync(join(out, 'minimize-signal'), '', 'utf8');
    await waitFor(first, /harness minimized=true/);

    // The second instance: same userData, same effects sandbox, so it is
    // contending for the exact same lock the first one holds.
    second = spawnHarness(out, effects);
    await waitForExit(second);

    assert.match(
      second.stdout,
      /harness before-quit windowCount=0/,
      'a second instance must reach its own quit having created no window at all — this is the ' +
        'line that must fail if the lock in app/main.js is removed'
    );
    assert.doesNotMatch(
      second.stdout,
      /harness ready windowCount=1/,
      'a second instance must never reach the ready state that a real, un-locked run would print'
    );

    // The first instance must have been handed the second launch, not left
    // never knowing about it, and its window must have come back from being
    // minimised — the 'second-instance' handler's whole job.
    await waitFor(first, /harness after-second-instance/);
    assert.match(
      first.stdout,
      /harness saw second-instance/,
      'the first instance must receive the second-instance event'
    );
    assert.match(
      first.stdout,
      /harness after-second-instance minimized=false/,
      'the first instance\'s window must be restored from minimised once a second launch is refused'
    );
  } finally {
    // Waited for, not just asked for: Windows keeps a running process's
    // files open until it has actually exited, and rmSync below fails on
    // exactly the files this process's own userData holds open.
    await killAndWaitForExit(first);
    // The loser normally quits itself the moment it is refused the lock, so
    // this is almost always a no-op — but "almost always" is what left three
    // Electron processes on this machine for six hours.
    if (second) await killAndWaitForExit(second);
    // A failed cleanup here must never mask a real assertion failure above —
    // node:test would otherwise report the wrong thing as the reason this
    // test failed.
    try {
      rmSync(out, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch (error) {
      console.error(`could not clean up ${out}: ${error.message}`);
    }
  }
});
