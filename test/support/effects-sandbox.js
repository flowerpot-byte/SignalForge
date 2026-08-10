// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import { SANDBOX_REQUIRED_ENV } from '../../src/main/effects-target.js';

/**
 * Arm the effects-folder circuit breaker for the whole test suite.
 *
 * package.json runs `node --test --import ./test/support/effects-sandbox.js`,
 * and node's test runner starts every test file in its own process with the
 * same execArgv — so this module runs once per test file, and every Electron
 * (or node) process a test spawns inherits the variable it sets.
 *
 * That inheritance is the entire point. The three guards this replaces all
 * lived inside the two harnesses that happened to exist, so a harness written
 * tomorrow could repeat the accident simply by not knowing about them. This
 * one nobody has to know about: it is armed by the command that runs the
 * tests. From here on, any app/main.js started by a test must be told a
 * throwaway folder in SF_EFFECTS_SANDBOX (the self-test names its own) or it
 * refuses to resolve an effects folder at all.
 *
 * It deliberately does NOT invent a sandbox folder itself. Guessing one would
 * turn "you forgot" into "something silently worked", and a harness pointed at
 * a folder it does not know about is no better off than one pointed at a real
 * installation.
 */
process.env[SANDBOX_REQUIRED_ENV] = '1';
