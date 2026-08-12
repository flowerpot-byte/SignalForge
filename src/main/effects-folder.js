// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max Leopold Blumenschein
// SPDX-License-Identifier: GPL-3.0-or-later
import { join } from 'node:path';

const EFFECTS_SUFFIX = ['WhirlwindFX', 'Effects'];

/**
 * Look for SignalRGB's effects folder.
 *
 * documentsPath comes from Electron's app.getPath('documents'), which follows
 * the Windows known-folder setting and therefore already points at OneDrive
 * when Documents has been redirected. The other two are fallbacks for the
 * cases where that lookup is wrong or unavailable.
 *
 * Returns every folder that actually exists, best first. Never guesses: an
 * empty list means "ask the user", not "use this path anyway".
 */
export function findEffectsFolders({ documentsPath, homePath, exists }) {
  const candidates = [];
  if (documentsPath) candidates.push(join(documentsPath, ...EFFECTS_SUFFIX));
  if (homePath) {
    candidates.push(join(homePath, 'Documents', ...EFFECTS_SUFFIX));
    candidates.push(join(homePath, 'OneDrive', 'Documents', ...EFFECTS_SUFFIX));
  }

  const found = [];
  for (const candidate of candidates) {
    if (!found.includes(candidate) && exists(candidate)) found.push(candidate);
  }
  return found;
}
