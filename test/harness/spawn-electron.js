// SignalForge — build SignalRGB effects from images, gradients, shapes and particles.
// Copyright (C) 2026 Max Leopold Blumenschein
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * The other half of not leaving Electron processes behind: the spawning side.
 *
 * test/harness/driver.js makes a harness end itself. This makes the test that
 * started it clean up regardless — because the harness's own guarantees are
 * worth nothing if the harness is a build of the code that just broke them,
 * and because a child holds no opinion at all about a parent that is killed
 * from outside.
 *
 * Four tests carried this block word for word — test/app/boot.test.js,
 * test/app/unsaved-changes.test.js, test/main/effects-sandbox.test.js and
 * test/main/prepare-image-asar.test.js: spawn, collect stdout and stderr,
 * race a timeout against 'close', kill on the timeout. Four copies is how the
 * fifth one comes to forget the kill. This is the one they share.
 *
 * WHAT `child.kill()` ACTUALLY DOES HERE, measured rather than assumed: an
 * Electron main process on Windows brings its GPU, renderer and utility
 * processes down with it, so killing the one process the test knows about
 * really does leave nothing behind. Counted with Win32_Process filtered on
 * this project's own electron.exe path, before and after; see
 * .superpowers/sdd/harness-cleanup-report.md.
 */
import { spawn } from 'node:child_process';
import { constants, setPriority } from 'node:os';

/**
 * Run an Electron entry to completion and hand back what it said.
 *
 * Never throws for a non-zero exit — that is the caller's judgement to make,
 * and every caller wants the output in its message. It throws only when the
 * process could not be started or did not finish in time, and in both of
 * those cases the child is already dead by the time the error is raised.
 *
 * @param {string} binary        electron.exe, from require('electron')
 * @param {string[]} args
 * @param {object} options
 * @param {NodeJS.ProcessEnv} options.env   passed on WHOLE by every caller:
 *        SF_EFFECTS_SANDBOX_REQUIRED and SF_SINGLE_INSTANCE_TEST are armed for
 *        the suite by the --import scripts in package.json and the child has
 *        to inherit them
 * @param {number} options.timeoutMs        the outer bound. Keep it ABOVE the
 *        harness's own watchdog (driver.js, WATCHDOG_MS) so a stuck run
 *        reports which harness got stuck instead of just being cut down.
 * @param {string} options.label            what to call it in an error
 * @param {boolean} options.yield           run below normal priority, for the
 *        long window-holding harnesses, so the machine stays usable
 * @returns {Promise<{ code: number, stdout: string, stderr: string }>}
 */
export function runElectron(binary, args, {
  env = process.env,
  timeoutMs = 90_000,
  label = 'the Electron harness',
  yieldPriority = false
} = {}) {
  const child = spawn(binary, args, { stdio: ['ignore', 'pipe', 'pipe'], env });

  if (yieldPriority) {
    try {
      setPriority(child.pid, constants.priority.PRIORITY_BELOW_NORMAL);
    } catch {
      // Best effort only; correctness never depends on it.
    }
  }

  let stdout = '';
  let stderr = '';
  // Both pipes must be drained: an unread pipe fills its OS buffer and blocks
  // the child's next write, which looks exactly like a hang.
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });

  return new Promise((resolve, reject) => {
    let settled = false;
    // 'close' rather than 'exit': it waits for the pipes above to finish
    // draining, so the last line of stdout — which is the report every one of
    // these harnesses prints — is guaranteed complete when it fires.
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(value);
    };

    const timer = setTimeout(() => {
      if (settled) return;
      // Killed BEFORE the rejection is raised, not after and not instead:
      // whatever the caller does with the error, this process is gone.
      child.kill();
      finish(reject, new Error(`${label} did not finish within ${timeoutMs}ms\n${stderr}`));
    }, timeoutMs);

    child.on('error', (error) => {
      child.kill();
      finish(reject, error);
    });
    child.on('close', (code) => finish(resolve, { code, stdout, stderr }));
  });
}
