// SignalForge — build SignalRGB effects from images, gradients, shapes and particles.
// Copyright (C) 2026 Max Leopold Blumenschein
// SPDX-License-Identifier: GPL-3.0-or-later
import { SINGLE_INSTANCE_TEST_ENV } from '../../src/main/single-instance.js';

/**
 * Arm the single-instance-lock escape hatch for the whole test suite.
 *
 * The exact same mechanism as test/support/effects-sandbox.js, armed
 * alongside it (see the "test" script in package.json): node's test runner
 * gives every test file its own process, this module runs once at the start
 * of each of them, and every process a test spawns inherits the variable
 * through its environment — the same inheritance that carries
 * SF_EFFECTS_SANDBOX_REQUIRED to a spawned Electron in effects-sandbox.js.
 *
 * See src/main/single-instance.js for why app/main.js needs to be told this
 * at all. The one test that needs the real lock — test/app/single-instance.test.js —
 * turns this back off for the two processes it spawns itself; see
 * test/support/single-instance-harness.js.
 */
process.env[SINGLE_INSTANCE_TEST_ENV] = '1';
