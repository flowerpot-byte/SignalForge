// SignalForge — build SignalRGB effects from images, gradients, shapes and particles.
// Copyright (C) 2026 Max Leopold Blumenschein
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * No harness may outlive its run.
 *
 * THE INCIDENT. Three electron.exe processes out of this project's own
 * node_modules were found resident on the machine's owner's computer six hours
 * after the runs that started them — 156 MB, no window, no parent still
 * waiting on them. They had to be killed by hand. The owner had already
 * complained, separately, about this project's windows appearing while he
 * worked; a process that outlives its run is the same promise broken in a
 * quieter way.
 *
 * WHAT THE CAUSE ACTUALLY IS, established by measurement rather than reading:
 * an Electron main process does NOT die of an unhandled promise rejection.
 * `node script.js` exits non-zero on one; Electron prints
 * UnhandledPromiseRejectionWarning and runs on forever, because Chromium's
 * message loop keeps it alive and Electron does not arm Node's
 * --unhandled-rejections=throw. A harness that threw outside its own try — as
 * test/harness/walkthrough.js did, twice — was therefore immortal, and so was
 * one that waited on an event that never arrived.
 *
 * HOW TO FALSIFY EACH CHECK BELOW. They are worth exactly as much as the way
 * they fail, so each one names it:
 *
 *  - 'a harness that throws': delete the `finally` in runHarness
 *    (test/harness/driver.js) and this hangs until the timeout, then goes red.
 *  - 'a harness that hangs': delete the watchdog in guardHarness and the same
 *    happens.
 *  - 'a harness that fails is still red': make runHarness exit 0 always — the
 *    change that would "fix" a leak by turning every failing run green — and
 *    this is the check that catches it.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { runElectron } from '../harness/spawn-electron.js';

const require_ = createRequire(import.meta.url);
const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const harness = join(root, 'test', 'support', 'lifecycle-harness.js');

/**
 * Two seconds, not sixty.
 *
 * The real bound is 60 s (WATCHDOG_MS in test/harness/driver.js), chosen from
 * what these runs actually take. Proving it at that length would add a minute
 * to every `npm test`, so the harness takes the bound from the environment and
 * these checks hand it a short one. What is proven is the mechanism; the
 * number is proven by the fact that the same line reads it.
 */
const SHORT_WATCHDOG_MS = 2_000;

/**
 * Run the fixture in one of its modes and hand back what happened — including
 * whether the process is genuinely gone, which is the whole question.
 *
 * `timeoutMs` is deliberately far shorter than the suite's real ones: a check
 * about a process not hanging around must not itself wait a minute to find out
 * that it did.
 */
async function runMode(mode, { watchdogMs = SHORT_WATCHDOG_MS, timeoutMs = 30_000 } = {}) {
  const startedAt = Date.now();
  const result = await runElectron(require_('electron'), [harness], {
    env: {
      ...process.env,
      SF_LIFECYCLE_MODE: mode,
      SF_HARNESS_WATCHDOG_MS: String(watchdogMs)
    },
    timeoutMs,
    label: `the lifecycle harness in mode ${mode}`
  });
  return { ...result, elapsedMs: Date.now() - startedAt };
}

test('a harness that throws mid-run leaves no Electron process behind', async () => {
  // 'close' fired at all is the proof: runElectron resolves only when the
  // child process has genuinely ended and its pipes have drained.
  //
  // The watchdog is deliberately put far out of reach here. Take the `finally`
  // out of runHarness and the watchdog would quietly cover for it — the
  // process would still end, twenty seconds later, and a check that only asked
  // "did it end" would stay green through the very regression it exists to
  // catch. So what this asserts is the elapsed time.
  const { code, stdout, stderr, elapsedMs } = await runMode('throw', { watchdogMs: 20_000 });

  assert.match(
    stdout,
    /lifecycle-harness up windows=1/,
    'the fixture must really have opened a window, or this proves nothing'
  );
  assert.notEqual(
    code,
    0,
    'a harness whose work threw must report failure — a wrapper that always exited 0 would '
      + `turn every red run green, which is far worse than a leak\n${stderr}`
  );
  assert.match(
    stderr,
    /an assertion threw mid-run/,
    `the reason has to reach whoever ran it\n${stderr}`
  );
  // Well inside the watchdog: this must be the `finally` ending the run, not
  // the watchdog quietly covering for a missing one.
  assert.ok(
    elapsedMs < 10_000,
    'a thrown assertion must end the process at once, not leave it to a watchdog twenty '
      + `seconds later — took ${elapsedMs}ms`
  );
});

test('a harness whose promise rejects with nobody waiting leaves no Electron process behind', async () => {
  // The exact shape of the walkthrough's own bug: a rejection nothing awaits.
  // Electron would print a warning and run on for the full 30 s the fixture
  // then waits, and after that forever.
  // A long watchdog again, for the same reason as above: what is proven here
  // is the unhandledRejection handler, not the watchdog standing in for it.
  const { code, stderr, elapsedMs } = await runMode('reject', { watchdogMs: 20_000 });
  assert.notEqual(code, 0, `an unhandled rejection must end the run non-zero\n${stderr}`);
  assert.match(stderr, /unhandled rejection: .*a promise rejected with nobody waiting/s, stderr);
  assert.ok(elapsedMs < 10_000, `and must end it at once, took ${elapsedMs}ms`);
});

test('a harness that throws out of a callback leaves no Electron process behind', async () => {
  const { code, stderr, elapsedMs } = await runMode('uncaught', { watchdogMs: 20_000 });
  assert.notEqual(code, 0, `an uncaught exception must end the run non-zero\n${stderr}`);
  assert.match(stderr, /uncaught exception: .*a throw from a timer callback/s, stderr);
  assert.ok(elapsedMs < 10_000, `and must end it at once, took ${elapsedMs}ms`);
});

test('a harness that hangs is ended by its own watchdog, with a reason', async () => {
  // Falsifiable in one line: remove the setTimeout in guardHarness
  // (test/harness/driver.js) and this waits out its 30 s and fails.
  const { code, stderr, elapsedMs } = await runMode('hang');

  assert.notEqual(code, 0, `a harness that never finished must not report success\n${stderr}`);
  assert.match(
    stderr,
    new RegExp(`did not finish within ${SHORT_WATCHDOG_MS}ms`),
    `the watchdog must say what it did and to which harness\n${stderr}`
  );
  assert.match(stderr, /^lifecycle-harness: /m, 'and name the harness that got stuck');
  // The bound is real, not decorative: the process ended near it rather than
  // at whatever the caller happened to allow.
  assert.ok(
    elapsedMs < SHORT_WATCHDOG_MS + 15_000,
    `the watchdog must fire at its own bound, took ${elapsedMs}ms`
  );
});

test('a harness that finished its work exits 0 and does not linger', async () => {
  // The other half of the guarantee, and the one that stops all of the above
  // from being satisfied by a wrapper that simply kills everything: a run that
  // went fine still has to say so.
  const { code, stdout, stderr } = await runMode('ok');
  assert.equal(code, 0, `a harness that did its work must exit 0\n${stderr}`);
  assert.match(stdout, /lifecycle-harness up windows=1/);
  assert.doesNotMatch(stderr, /did not finish within/, 'and must not have been cut down by the watchdog');
});

test('a harness keeps its own exit code, so a failing run stays red', async () => {
  // test/harness/walkthrough.js reports its own pass/fail this way. If the
  // wrapper flattened it, an acceptance run that failed every point would
  // still look like a pass.
  const { code } = await runMode('code', { watchdogMs: 20_000 });
  assert.equal(code, 3, 'the code a harness returns is the code it exits with');
});

test('the walkthrough without SF_WALK_OUT says so on stderr and exits — no dialog, ever', async () => {
  // The incident this pins: walkthrough.js used to THROW on its module level
  // when SF_WALK_OUT was missing, and a module-level throw in an Electron
  // main process opens Electron's own error DIALOG — a box that sat on the
  // machine owner's screen in the middle of the night (12.08.2026, seen and
  // complained about) over a process nothing could end but a human hand.
  //
  // What proves the dialog is gone is the EXIT: a process showing that box
  // does not end until someone clicks it away, so "ended by itself, quickly,
  // non-zero, with the reason on stderr" is exactly the sentence a dialog
  // cannot say. The real walkthrough is spawned, not a fixture — the fault
  // was in its own module body, so only its own module body can prove the
  // fix.
  const startedAt = Date.now();
  const { code, stderr } = await runElectron(
    require_('electron'),
    [join(root, 'test', 'harness', 'walkthrough.js')],
    {
      // '' is falsy, so this is "not set" as walkthrough.js reads it — and it
      // shields the check from any SF_WALK_OUT a caller's shell exported.
      env: { ...process.env, SF_WALK_OUT: '' },
      timeoutMs: 30_000,
      label: 'the walkthrough with no SF_WALK_OUT'
    }
  );
  const elapsedMs = Date.now() - startedAt;

  assert.notEqual(code, 0, `a walkthrough that could not even start must not report success\n${stderr}`);
  assert.match(stderr, /SF_WALK_OUT must name a folder/,
    `the reason has to reach whoever ran it\n${stderr}`);
  assert.ok(elapsedMs < 15_000,
    `a missing variable must end the process at once, not leave a box waiting on a human — took ${elapsedMs}ms`);
});
