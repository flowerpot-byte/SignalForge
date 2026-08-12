// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max Leopold Blumenschein
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Arm the one check in this suite that has to put a window on screen.
 *
 * The exact same mechanism as test/support/effects-sandbox.js and
 * test/support/single-instance-test.js, and armed the same way — except that
 * this one is NOT part of the `test` script. It is added by a third --import
 * in the `test:import` script (see package.json), so:
 *
 *   npm test          the whole suite, and nothing ever appears on screen
 *   npm run test:import   the whole suite plus the drag-and-drop import, which
 *                         shows the app's window for a few seconds
 *
 * Why it cannot simply always run: Chromium's drag-and-drop pipeline refuses to
 * serve a window nobody is looking at, so test/harness/unsaved.js has to show,
 * raise and focus its window before it can drop a file on it — in front of
 * whoever is using the machine, once per run. Every other route into the same
 * app/renderer/main.js importFile works on a hidden window, and that is what an
 * ordinary run uses.
 *
 * A run without this does not quietly pretend to have covered the drop: the
 * subtest in test/app/unsaved-changes.test.js is skipped with node:test's own
 * `{ skip: reason }`, so the reason is printed with the results.
 */
export const DROP_IMPORT_TEST_ENV = 'SF_UNSAVED_DROP_IMPORT';

process.env[DROP_IMPORT_TEST_ENV] = '1';
