// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later

export function getByPath(object, path) {
  let current = object;
  for (const key of path.split('.')) {
    if (current === null || typeof current !== 'object') return undefined;
    current = current[key];
  }
  return current;
}

/**
 * Write a value at a dotted path. Refuses to invent missing branches so a
 * typo in a binding cannot quietly grow junk into the document.
 */
export function setByPath(object, path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  let current = object;
  for (const key of keys) {
    if (current === null || typeof current !== 'object' || !(key in current)) return false;
    current = current[key];
  }
  if (current === null || typeof current !== 'object' || !(last in current)) return false;
  current[last] = value;
  return true;
}

/** "a1.motion.speed" -> "layers.0.motion.speed", or null if there is no such layer. */
export function resolveLayerPath(doc, path) {
  const dot = path.indexOf('.');
  if (dot < 0) return null;
  const layerId = path.slice(0, dot);
  const index = doc.layers.findIndex((layer) => layer.id === layerId);
  if (index < 0) return null;
  return `layers.${index}.${path.slice(dot + 1)}`;
}

/**
 * Apply SignalRGB control values to a copy of the document.
 *
 * values comes from the exported effect's global variables. Anything missing
 * falls back to the control's own default, so a half-configured effect still
 * renders instead of breaking.
 */
export function applyControls(doc, values) {
  const copy = structuredClone(doc);
  for (const control of copy.controls) {
    const raw = Object.prototype.hasOwnProperty.call(values, control.property)
      ? values[control.property]
      : control.default;
    const value = control.type === 'number' ? Number(raw) : raw;
    if (control.type === 'number' && !Number.isFinite(value)) continue;
    for (const binding of control.bind) {
      const path = resolveLayerPath(copy, binding);
      if (path) setByPath(copy, path, value);
    }
  }
  return copy;
}
