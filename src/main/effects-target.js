// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import { findEffectsFolders } from './effects-folder.js';

/**
 * Where finished effects go.
 *
 * A folder the user picked wins, but only while it still exists — a moved or
 * deleted folder must not silently swallow exports. Otherwise the detected
 * one. Never a guess: `source: 'none'` means the app has to ask.
 */
export function resolveEffectsTarget({ settings, documentsPath, homePath, exists }) {
  const configured = settings.get('effectsFolder');
  if (configured && exists(configured)) {
    return { folder: configured, source: 'configured' };
  }
  const found = findEffectsFolders({ documentsPath, homePath, exists });
  if (found.length > 0) return { folder: found[0], source: 'detected' };
  return { folder: null, source: 'none' };
}
