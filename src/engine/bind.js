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
 * Resolve a control's bind entry against the document.
 *
 * Two shapes:
 *  - "<layerId>.<rest>" addresses a field inside a layer, via resolveLayerPath
 *    above (e.g. "a1.motion.speed" -> "layers.0.motion.speed").
 *  - a bare name with no dot at all addresses a field on the document
 *    itself (e.g. "brightness", for a control with no per-layer meaning).
 *    The path returned is just that name, since document-level fields sit
 *    directly on the object applyControls already copies.
 *
 * These two shapes cannot collide: resolveLayerPath already requires a dot
 * (no dot -> null), so a bare name can never be mistaken for a layer id
 * followed by a path, and a layer id can never be mistaken for a document
 * field. setByPath still refuses __proto__/constructor/prototype and any
 * segment that isn't already an own property, so a document-level binding
 * gets exactly the same guards as a layer-level one — including that
 * "brightness" must already exist on the document (it does, unconditionally,
 * once normalizeDocument has run — see document.js).
 */
export function resolveBindingPath(doc, binding) {
  return binding.includes('.') ? resolveLayerPath(doc, binding) : binding;
}

/**
 * Apply SignalRGB control values to a copy of the document.
 *
 * values comes from the exported effect's global variables. Anything missing
 * falls back to the control's own default, so a half-configured effect still
 * renders instead of breaking.
 *
 * This runs every frame for as long as the effect is active, so the copy is
 * kept as cheap as possible: `layers` is deep-cloned because bindings write
 * into it, and the document itself is shallow-copied so a document-level
 * binding (see resolveBindingPath) can overwrite a top-level primitive field
 * like `brightness` without touching the original — a plain reassignment is
 * enough for a primitive, no deep clone needed. Every other field (notably
 * `assets`, which can hold megabytes of base64 image data) is carried across
 * by reference — no binding, layer- or document-level, ever resolves a path
 * outside `layers` or the document's own top-level fields, and controls are
 * only read here, never written, so nothing else needs copying to keep the
 * caller's document safe.
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
      const path = resolveBindingPath(copy, binding);
      if (path) setByPath(copy, path, value);
    }
  }
  return copy;
}
