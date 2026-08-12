// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max Leopold Blumenschein
// SPDX-License-Identifier: GPL-3.0-or-later

import { BINDABLE_DOCUMENT_FIELDS } from './document.js';

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
 *    itself, but ONLY if it is listed in BINDABLE_DOCUMENT_FIELDS
 *    (document.js) — e.g. "brightness", for a control with no per-layer
 *    meaning. The path returned is just that name, since document-level
 *    fields sit directly on the object applyControls already copies. A bare
 *    name that isn't on the allowlist resolves to null, exactly like an
 *    unknown layer id: without this gate, any bare bind entry would fall
 *    through to setByPath's generic "is this an own property" check, which
 *    would happily let a control overwrite `layers`, `controls`, `assets`
 *    or `version` wholesale — the render loop's entire write surface, not
 *    just a chosen field.
 *
 * These two shapes cannot collide: resolveLayerPath already requires a dot
 * (no dot -> null), so a bare name can never be mistaken for a layer id
 * followed by a path, and a layer id can never be mistaken for a document
 * field. setByPath still refuses __proto__/constructor/prototype and any
 * segment that isn't already an own property, so an allowlisted
 * document-level binding gets exactly the same guards as a layer-level one
 * on top of the allowlist gate here.
 */
export function resolveBindingPath(doc, binding) {
  if (binding.includes('.')) return resolveLayerPath(doc, binding);
  return BINDABLE_DOCUMENT_FIELDS.includes(binding) ? binding : null;
}

/**
 * Land a combobox value on one of its own declared options.
 *
 * WHY THIS EXISTS, AND WHY IT IS NOT PARANOIA. A control's value arrives from
 * outside: in the exported effect it is a page global SignalRGB writes (its
 * own injection template, read out of SignalRgb.exe, is `var %1 = "%2";` /
 * `var %1 = %2;`), and in the app it is whatever the settings column put
 * there. The value used to be written into the document exactly as received.
 * That was safe for a colour (normalizeColor already falls back) and for a
 * number (Number() plus a finite check below), and quietly catastrophic for a
 * combobox: the two places that decide what MOVES look their motion up by
 * strict equality —
 *
 *     motions.find((motion) => motion.kind === 'warp')     (layers/gradient.js)
 *
 * — so a `kind` that is not letter-for-letter "warp"/"drift"/"breathe" matches
 * nothing at all. Every motion comes back null, the layer draws exactly as it
 * would with no motion on it, and the effect is a flawless STILL picture. No
 * exception, no console line, nothing to notice. The same hazard sits under
 * `fit` and `shape`, where a miss silently picks a different framing.
 *
 * So the shape of the incoming value is no longer allowed to matter. Accepted,
 * in this order: the option itself; an integer index into the list (0-based);
 * the same text with different case or padding; digits that name an index. Any
 * value that cannot be resolved falls back to the control's own default, and
 * — if even that is not on the list — to the first option, because handing
 * back something outside `values` is the very failure this function exists to
 * prevent.
 *
 * Deliberately shared by preview and export: both go through applyControls, so
 * they cannot disagree about what a control value means.
 */
export function resolveChoice(raw, values, fallback) {
  if (!Array.isArray(values) || values.length === 0) return raw;

  const onList = (candidate) => values.find((value) => value === candidate);

  const direct = onList(raw);
  if (direct !== undefined) return direct;

  if (typeof raw === 'number' && Number.isInteger(raw) && raw >= 0 && raw < values.length) {
    return values[raw];
  }

  // Anything else is compared as text — a host that writes "1" or "Warp" is
  // describing an option it can see, not asking for a value of its own.
  if (raw !== null && raw !== undefined && typeof raw !== 'object') {
    const text = String(raw).trim();
    const exact = values.find((value) => String(value) === text);
    if (exact !== undefined) return exact;
    const folded = values.find((value) => String(value).toLowerCase() === text.toLowerCase());
    if (folded !== undefined) return folded;
    if (/^\d+$/.test(text)) {
      const index = Number(text);
      if (index < values.length) return values[index];
    }
  }

  const byDefault = onList(fallback);
  return byDefault !== undefined ? byDefault : values[0];
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
    let value = raw;
    if (control.type === 'number') {
      value = Number(raw);
      if (!Number.isFinite(value)) continue;
    } else if (control.type === 'combobox') {
      // Never the host's raw value: see resolveChoice above for what a value
      // that misses every option does to a motion.
      value = resolveChoice(raw, control.values, control.default);
    }
    for (const binding of control.bind) {
      const path = resolveBindingPath(copy, binding);
      if (path) setByPath(copy, path, value);
    }
  }
  return copy;
}
