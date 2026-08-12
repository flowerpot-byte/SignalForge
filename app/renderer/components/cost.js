// SignalForge — build SignalRGB effects from images, gradients, shapes and particles.
// Copyright (C) 2026 Max Leopold Blumenschein
// SPDX-License-Identifier: GPL-3.0-or-later

/** The exported effect caps itself here, so this is what a frame really costs. */
export const FRAMES_PER_SECOND = 30;
/** Warn above 15 % of one core: this thing runs around the clock. */
export const WARN_SHARE = 0.15;

export function coreShare(msPerFrame) {
  return (msPerFrame * FRAMES_PER_SECOND) / 1000;
}

export function costLevel(msPerFrame) {
  return coreShare(msPerFrame) >= WARN_SHARE ? 'warn' : 'ok';
}
