// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max Leopold Blumenschein
// SPDX-License-Identifier: GPL-3.0-or-later
import { writeFileSync, renameSync, unlinkSync } from 'node:fs';

/**
 * Write via a temp file + rename, so nothing ever reads a half-written file.
 *
 * The rename is atomic, and the old file stays intact until the new one is
 * fully on disk. Three different files depend on that, for two different
 * reasons: a crash mid-write must not leave a truncated settings.json or
 * project behind, and SignalRGB watches its effects folder live
 * (docs/erkenntnisse-signalrgb-motor.md — a new file appears in its list at
 * once, with no restart), so a partially written effect or cover image there
 * would be picked up partially written.
 *
 * `data` may be text or bytes: the cover image (src/main/cover-image.js) is a
 * Buffer. The encoding is named only for a string — handing one alongside a
 * Buffer would be a claim about those bytes that nothing checks.
 *
 * It lives in src/main rather than in app/main.js because bin/sfexport.js
 * writes into the same watched folder from a process that has no Electron in
 * it at all, and a second implementation there is how the two would come to
 * disagree about what "written" means.
 */
export function writeFileAtomic(file, data) {
  const tempFile = `${file}.${process.pid}.tmp`;
  writeFileSync(tempFile, data, typeof data === 'string' ? 'utf8' : undefined);
  try {
    renameSync(tempFile, file);
  } catch (err) {
    // The temp file is now orphaned garbage next to the target — clean it up
    // on a best-effort basis (it may already be gone, or removal may itself
    // fail) before re-throwing the original error to the caller.
    try {
      unlinkSync(tempFile);
    } catch {
      // Nothing more we can do about the leftover temp file; the original
      // error below is the one that matters to the caller.
    }
    throw err;
  }
}
