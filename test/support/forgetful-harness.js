// SignalForge — build SignalRGB effects from images, gradients, shapes and particles.
// Copyright (C) 2026 Max Leopold Blumenschein
// SPDX-License-Identifier: GPL-3.0-or-later
import { app } from 'electron';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import '../../app/main.js';

/**
 * A test harness written the wrong way, on purpose.
 *
 * This is the future harness finding 1 is about: it redirects Electron's
 * userData into a throwaway folder — the half of the pattern everybody
 * remembers — and stops there. It seeds no effectsFolder setting and names no
 * sandbox, so app/main.js is left free to go looking for an installation under
 * whatever Documents folder it is given.
 *
 * The Documents folder it is given here is a stand-in built by the test, with
 * a WhirlwindFX/Effects folder inside it. On the machine this actually runs
 * on, that same search once found the real one and two files were written into
 * it. Nothing in this file may ever point at the real one, which is why the
 * test hands over a folder it made itself.
 *
 * Expected outcome: app/main.js refuses at startup and this process dies with
 * a non-zero code. If it ever gets as far as the handler below, the gate is
 * gone — the message it prints is what the test reports.
 */
const out = process.env.SF_FORGETFUL_OUT;
if (!out) throw new Error('SF_FORGETFUL_OUT must name the throwaway folder to work in');

app.setPath('userData', join(out, 'userdata'));
app.setPath('documents', join(out, 'documents'));

app.whenReady().then(() => {
  const wouldHaveFound = join(out, 'documents', 'WhirlwindFX', 'Effects');
  process.stdout.write(`SANDBOX GATE DID NOT FIRE; documents=${app.getPath('documents')} `
    + `standInInstallationPresent=${existsSync(wouldHaveFound)}\n`);
  app.exit(0);
});
