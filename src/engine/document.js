// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later

/** The canvas SignalRGB samples. Never hardcode these numbers elsewhere. */
export const CANVAS_WIDTH = 320;
export const CANVAS_HEIGHT = 200;

/** Document blend name -> canvas globalCompositeOperation. */
export const BLEND_MODES = Object.freeze({
  normal: 'source-over',
  add: 'lighter',
  multiply: 'multiply',
  screen: 'screen',
  lighten: 'lighten'
});

export const FIT_MODES = Object.freeze(['cover', 'stretch', 'contain']);
export const MOTION_KINDS = Object.freeze(['none', 'warp', 'drift', 'breathe']);
export const CONTROL_TYPES = Object.freeze(['number', 'boolean', 'color', 'combobox']);

/**
 * Top-level document fields a control's `bind` array may address directly,
 * i.e. a bind entry with no dot (see `resolveBindingPath` in bind.js, which
 * is the only place that reads this list). This is an allowlist, not a
 * shape check: `brightness` is listed because it is meant to be
 * controllable from an exported effect's UI. `layers`, `controls`,
 * `assets` and `version` are deliberately NOT listed even though they are
 * also own properties of a normalized document — a control silently
 * overwriting one of those wholesale with a raw number would corrupt the
 * render loop. Anything not in this list resolves to nothing, exactly like
 * an unknown layer id, instead of falling through to a generic "is this an
 * own property" check.
 */
export const BINDABLE_DOCUMENT_FIELDS = Object.freeze([
  'brightness',
  'saturation',
  'greenMagenta',
  'blueYellow'
]);

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const ASCII_PRINTABLE = /^[\x20-\x7E]*$/;

/**
 * Whether a string is a usable JavaScript identifier — the rule that decides
 * whether a control's `property` can be spliced into generated code. This is
 * the single definition of that rule; callers must use it directly instead
 * of re-deriving or string-matching it.
 */
export function isValidIdentifier(value) {
  return IDENTIFIER.test(value);
}

export function clamp(value, lo, hi) {
  return value < lo ? lo : value > hi ? hi : value;
}

function num(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function str(value, fallback) {
  return typeof value === 'string' ? value : fallback;
}

/**
 * One motion entry, with its own speed and amount. "none" is kept as an
 * ordinary, inert entry rather than special-cased away: it is a real member
 * of MOTION_KINDS (it is the motion combobox's own default value), and
 * render()'s per-kind lookups (layers/image.js) already ignore any entry
 * whose kind isn't "drift", "warp" or "breathe" -- a stored "none" entry
 * renders exactly like an empty list, no special-casing required. Dropping
 * it used to be tempting because an empty list already means "no motion",
 * but that shortcut is also what forced sfexport.js to bake a fake "warp"
 * placeholder for `--motion none` (see buildImageDocument there): a dropped
 * entry leaves nothing for the motion/tempo/strength controls' bind paths to
 * write into. Keeping "none" gives those bindings a real, honest target.
 */
function normalizeMotion(raw, layerId, index, problems) {
  const input = raw && typeof raw === 'object' ? raw : {};
  const kind = str(input.kind, 'none');
  if (!MOTION_KINDS.includes(kind)) {
    problems.push(`Layer "${layerId}": unknown motion "${kind}" at position ${index}, dropped.`);
    return null;
  }
  return {
    kind,
    speed: clamp(num(input.speed, 15), 0, 100),
    amount: clamp(num(input.amount, 30), 0, 100)
  };
}

/**
 * Read the motion list. Accepts the old singular `motion` field so documents
 * and effects exported before this change still load.
 *
 * render() (layers/image.js) picks the first entry matching a given kind via
 * `motions.find(...)`, so two entries of the same kind would otherwise render
 * according to array order -- a "depends on how the user sorted the list"
 * surprise. Resolved here, once, explicitly: the first occurrence of a kind
 * wins and every later one is dropped and reported, the same recovery style
 * as an unknown kind above.
 */
function normalizeMotions(input, layerId, problems) {
  const hasList = Array.isArray(input.motions);
  const hasSingle = input.motion && typeof input.motion === 'object';
  if (hasList && hasSingle) {
    problems.push(`Layer "${layerId}": both motion and motions given, using motions.`);
  }
  const source = hasList ? input.motions : (hasSingle ? [input.motion] : []);

  const seenKinds = new Set();
  const result = [];
  source.forEach((entry, index) => {
    const motion = normalizeMotion(entry, layerId, index, problems);
    if (motion === null) return;
    if (seenKinds.has(motion.kind)) {
      problems.push(`Layer "${layerId}": duplicate motion "${motion.kind}" at position ${index}, `
        + 'dropped -- the first one wins.');
      return;
    }
    seenKinds.add(motion.kind);
    result.push(motion);
  });
  return result;
}

function normalizeLayer(raw, index, usedIds, problems) {
  const input = raw && typeof raw === 'object' ? raw : {};
  let id = str(input.id, '').trim() || `layer-${index}`;
  if (usedIds.has(id)) {
    problems.push(`Layer ${index}: duplicate id "${id}", renamed.`);
    let n = 2;
    while (usedIds.has(`${id}-${n}`)) n += 1;
    id = `${id}-${n}`;
  }
  usedIds.add(id);

  const type = str(input.type, 'unknown');

  let blend = str(input.blend, 'normal');
  if (!Object.prototype.hasOwnProperty.call(BLEND_MODES, blend)) {
    problems.push(`Layer "${id}": unknown blend "${blend}", using "normal".`);
    blend = 'normal';
  }

  const base = {
    id,
    type,
    name: str(input.name, id),
    visible: input.visible !== false,
    opacity: clamp(num(input.opacity, 1), 0, 1),
    blend
  };

  if (type !== 'image') return base;

  let fit = str(input.fit, 'cover');
  if (!FIT_MODES.includes(fit)) {
    problems.push(`Layer "${id}": unknown fit "${fit}", using "cover".`);
    fit = 'cover';
  }

  const offsetInput = input.offset && typeof input.offset === 'object' ? input.offset : {};

  return {
    ...base,
    asset: str(input.asset, null),
    fit,
    offset: {
      x: clamp(num(offsetInput.x, 0), -1, 1),
      y: clamp(num(offsetInput.y, 0), -1, 1)
    },
    motions: normalizeMotions(input, id, problems)
  };
}

function normalizeControl(raw, index, problems) {
  const input = raw && typeof raw === 'object' ? raw : {};
  const property = str(input.property, '');
  if (!isValidIdentifier(property)) {
    problems.push(`Control ${index}: "${property}" is not a valid javascript identifier.`);
  }

  const labelInput = input.label && typeof input.label === 'object' ? input.label : {};
  const label = { de: str(labelInput.de, property), en: str(labelInput.en, property) };
  for (const lang of ['de', 'en']) {
    if (!ASCII_PRINTABLE.test(label[lang])) {
      problems.push(`Control "${property}": label (${lang}) must be ASCII only.`);
    }
  }

  let type = str(input.type, 'number');
  if (!CONTROL_TYPES.includes(type)) {
    problems.push(`Control "${property}": unknown type "${type}", using "number".`);
    type = 'number';
  }

  return {
    property,
    label,
    type,
    min: num(input.min, 0),
    max: num(input.max, 100),
    values: Array.isArray(input.values) ? input.values.map(String) : [],
    default: input.default ?? 0,
    bind: Array.isArray(input.bind) ? input.bind.filter((p) => typeof p === 'string') : []
  };
}

function normalizeAsset(raw) {
  const input = raw && typeof raw === 'object' ? raw : {};
  const asset = {
    kind: str(input.kind, 'image'),
    mime: str(input.mime, 'image/png')
  };
  // Exactly one of data (embedded) or file (sibling in the effects folder).
  if (typeof input.data === 'string') asset.data = input.data;
  else asset.file = str(input.file, '');
  return asset;
}

export function normalizeDocument(raw) {
  const problems = [];
  const input = raw && typeof raw === 'object' ? raw : {};
  const usedIds = new Set();

  const layers = (Array.isArray(input.layers) ? input.layers : [])
    .map((layer, index) => normalizeLayer(layer, index, usedIds, problems));

  const controls = (Array.isArray(input.controls) ? input.controls : [])
    .map((control, index) => normalizeControl(control, index, problems));

  const assets = {};
  const assetsInput = input.assets && typeof input.assets === 'object' ? input.assets : {};
  for (const [id, value] of Object.entries(assetsInput)) assets[id] = normalizeAsset(value);

  const doc = {
    version: 1,
    name: str(input.name, '').trim() || 'Untitled',
    description: str(input.description, ''),
    publisher: str(input.publisher, ''),
    // Overall output dimmer, 0..100, applied once to the finished frame by
    // the renderer (see engine.js). 100 = unchanged, matching every
    // document that predates this field so old previews/exports don't shift.
    brightness: clamp(num(input.brightness, 100), 0, 100),
    // Colour post-processing, applied together with brightness in one pass
    // over the finished frame (see engine.js applyFinish). Defaults match
    // color.js's NEUTRAL_COLOR so a document that predates this field, or
    // one where nobody touched these controls, renders byte-identical to
    // before.
    saturation: clamp(num(input.saturation, 100), 0, 200),
    greenMagenta: clamp(num(input.greenMagenta, 0), -100, 100),
    blueYellow: clamp(num(input.blueYellow, 0), -100, 100),
    layers,
    controls,
    assets
  };

  return { doc, problems };
}
