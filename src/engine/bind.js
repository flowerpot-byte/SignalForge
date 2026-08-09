// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later

// Path segments that would reach off the object and onto its prototype
// (or, via __proto__, mutate the shared Object.prototype itself). Never
// walk through these, whether reading or writing.
const UNSAFE_PATH_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export function getByPath(object, path) {
  let current = object;
  for (const key of path.split('.')) {
    if (UNSAFE_PATH_KEYS.has(key)) return undefined;
    if (current === null || typeof current !== 'object') return undefined;
    current = current[key];
  }
  return current;
}

/**
 * Write a value at a dotted path. Refuses to invent missing branches so a
 * typo in a binding cannot quietly grow junk into the document, and refuses
 * to step onto the prototype chain (own-property check, not `in`) so a
 * binding cannot pollute Object.prototype or shadow it on the target.
 */
export function setByPath(object, path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  if (UNSAFE_PATH_KEYS.has(last)) return false;
  let current = object;
  for (const key of keys) {
    if (UNSAFE_PATH_KEYS.has(key)) return false;
    if (current === null || typeof current !== 'object' || !Object.hasOwn(current, key)) return false;
    current = current[key];
  }
  if (current === null || typeof current !== 'object' || !Object.hasOwn(current, last)) return false;
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
 *
 * This runs every frame for as long as the effect is active, so it only
 * deep-clones what bindings can actually write: `layers`. Every other field
 * (notably `assets`, which can hold megabytes of base64 image data) is
 * carried across by reference — bindings never resolve a path outside
 * `layers` (see resolveLayerPath) and controls are only read here, never
 * written, so nothing else needs copying to keep the caller's document safe.
 */
export function applyControls(doc, values) {
  const copy = { ...doc, layers: structuredClone(doc.layers) };
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
