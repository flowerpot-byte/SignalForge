// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * The remembered swatches under every colour input.
 *
 * "Zuletzt benutzte Farben an der Farbauswahl" — the person who just spent a
 * minute mixing a teal for one layer should not have to mix it again for the
 * next one, or after a restart. The list is small, newest first, and lives in
 * the app's settings file (settings.json, via the sf:settings bridge), so it
 * survives restarts and belongs to the person rather than to any document.
 *
 * This module is the ARITHMETIC only — what the list becomes when a colour is
 * used — so it is testable in plain node. Where the list is shown and when a
 * colour counts as "used" is field.js's business (a swatch row under each
 * colour input; a colour counts when its picker CLOSES, not on every shade
 * the pointer crosses while it is open); how it is persisted is main.js's
 * (the settings bridge, allow-listed and validated in app/main.js).
 */

/** How many swatches are kept — one short row, not an archive. */
export const RECENT_COLORS_LIMIT = 8;

/** The exact shape a remembered colour must have: a colour input's value. */
const RECENT_COLOR = /^#[0-9a-f]{6}$/;

/** Whether a value is a colour this list stores. */
export function isRecentColor(value) {
  return typeof value === 'string' && RECENT_COLOR.test(value);
}

/**
 * The list after `color` was used: the colour in front, duplicates gone, the
 * tail cut at the limit. Junk — a malformed colour, a broken list — leaves
 * the list as it was rather than poisoning what is persisted.
 */
export function rememberColor(list, color) {
  const kept = (Array.isArray(list) ? list : []).filter(isRecentColor);
  if (!isRecentColor(color)) return kept.slice(0, RECENT_COLORS_LIMIT);
  return [color, ...kept.filter((entry) => entry !== color)].slice(0, RECENT_COLORS_LIMIT);
}
