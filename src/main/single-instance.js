// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * The test-only escape hatch from the single-instance lock.
 *
 * Same shape as SANDBOX_REQUIRED_ENV in src/main/effects-target.js, and armed
 * the same way: `npm test` itself sets it (see
 * test/support/single-instance-test.js, wired in through a second --import in
 * package.json's "test" script), so it is set in every test file's own
 * process and inherited by every process that process spawns. A test author
 * never types it, and cannot forget it.
 *
 * Why it has to exist at all: app.requestSingleInstanceLock() is scoped to
 * Electron's own userData directory, and most of this project's harnesses
 * never redirect that directory — only test/harness/walkthrough.js and
 * test/support/forgetful-harness.js do, and only because they need to for
 * other reasons (never writing into a real SignalRGB installation). Left
 * armed during a test run, every ordinary self-test spawn (test/app/boot.test.js)
 * would fight over the SAME default lock: against a real running copy of the
 * app on the developer's own machine, and — since node's test runner starts
 * files in their own processes and can run several at once — potentially
 * against another test process doing the very same thing. The losing side of
 * that fight exits before printing anything at all, which is indistinguishable
 * from a hang, not a failure a test run reports.
 *
 * This module deliberately imports nothing from 'electron': it has to be
 * importable from a plain Node process, because test/support scripts run
 * under `node --test`, not under Electron — importing 'electron' there
 * resolves to a path string, not the API, and destructuring it throws.
 */
export const SINGLE_INSTANCE_TEST_ENV = 'SF_SINGLE_INSTANCE_TEST';
