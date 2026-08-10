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
 * The two ways a gradient can be laid out.
 *
 * Deliberately a FIELD of one `gradient` layer type rather than two layer
 * types ("gradient" and "radial"). Three reasons, in the order they decided
 * it:
 *
 *  1. The plan this project is built from already says so: docs/entwurf-
 *     2026-08-09.md, section 5, lists one type "gradient" whose settings are
 *     "linear oder radial, Farbstopps, Winkel". Splitting it would be
 *     inventing a second design without a reason to.
 *  2. Everything else about the two is identical — the same stops, the same
 *     angle field, the same motions, the same controls. Two types would mean
 *     two copies of the stop handling in normalizeLayer, two entries in the
 *     settings column and two branches in effectControls, all to express one
 *     word.
 *  3. It is the only shape that lets SignalRGB's own UI switch between them.
 *     A layer type is baked into the exported file and cannot be changed from
 *     a control; a field can, so the finished effect gets a "Shape" dropdown
 *     for free (see src/export/effect-controls.js). Somebody who exported a
 *     linear gradient can try the radial one without going back to the app.
 */
export const GRADIENT_SHAPES = Object.freeze(['linear', 'radial']);

/**
 * Which motions a layer type can actually be seen to perform.
 *
 * A uniform field of one colour is invariant under both displacement motions:
 * drift slides it and warp bends it, and in both cases every pixel it moves
 * has exactly the colour of the pixel it replaced. So a solid layer offers
 * "breathe" and nothing else — that is not a limitation of the renderer, it
 * is what "one colour everywhere" means. A drift entry stored on a solid
 * layer by hand is kept rather than dropped (the data is the user's), it
 * simply renders as nothing, exactly like a "none" entry.
 *
 * A gradient is not uniform, so all three are real on it — see
 * src/engine/layers/gradient.js.
 */
export const SOLID_MOTION_KINDS = Object.freeze(['none', 'breathe']);

/** The motion kinds worth offering for a layer of this type. */
export function motionKindsFor(type) {
  return type === 'solid' ? SOLID_MOTION_KINDS : MOTION_KINDS;
}

/** Fewest and most colour stops a gradient may carry. */
export const MIN_GRADIENT_STOPS = 2;
export const MAX_GRADIENT_STOPS = 4;

/**
 * What a colour layer starts out as.
 *
 * These live here, in the engine's document module, and NOT in the app's
 * tokens.css — which is where every colour the WINDOW paints itself with has
 * to live (test/app/color-literals.test.js). The two rules do not collide,
 * because these are not the window's palette: they are the opening value of a
 * field in the user's own document, the same kind of thing as `brightness:
 * 100`. The window never writes a colour of its own; it starts a solid or a
 * gradient layer by naming the type alone and lets normalizeDocument fill
 * these in, then shows and edits whatever the document says. That is why the
 * colour guard still passes honestly rather than by an exemption.
 *
 * ONE COINCIDENCE, WRITTEN DOWN
 *
 * DEFAULT_SOLID_COLOR is the same value as `--accent` in
 * app/renderer/styles/tokens.css. That is not an accident and it is load
 * bearing: the "Farbfläche" tile in the starting gallery draws its preview
 * swatch from the accent, so the tile is an honest picture of what pressing it
 * produces only for as long as the two agree. Nothing enforces it — they are
 * deliberately different kinds of thing and must not import each other — so if
 * the accent is ever retuned, retune this with it or the tile starts lying.
 * The same note stands beside --accent over there.
 */
export const DEFAULT_SOLID_COLOR = '#ff0066';
export const DEFAULT_GRADIENT_STOPS = Object.freeze([
  Object.freeze({ at: 0, color: '#ff0066' }),
  Object.freeze({ at: 100, color: '#00b3ff' })
]);

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

const HEX_LONG = /^#?([0-9a-f]{6})$/i;
const HEX_SHORT = /^#?([0-9a-f]{3})$/i;
const RGB_CALL = /^rgba?\(\s*(-?[0-9.]+)\s*,\s*(-?[0-9.]+)\s*,\s*(-?[0-9.]+)\s*(?:,\s*-?[0-9.]+\s*)?\)$/i;

const hex2 = (value) => clamp(Math.round(value), 0, 255).toString(16).padStart(2, '0');

/**
 * Turn whatever a colour arrived as into "#rrggbb", or hand back the fallback.
 *
 * Deliberately generous about the input and strict about the output, and both
 * halves matter:
 *
 *  - Generous, because this string does not only come from a project file this
 *    app wrote. It also comes from a SignalRGB colour control at runtime (see
 *    applyControls in bind.js, which writes a control's raw value straight
 *    into the layer), and what exactly SignalRGB hands a `type="color"`
 *    control is UNVERIFIED — docs/erkenntnisse-signalrgb-motor.md records
 *    nothing about it, because this project has never shipped one before.
 *    "#RRGGBB", "RRGGBB", "#RGB" and "rgb(r, g, b)" are all accepted, so the
 *    likely shapes all work rather than one of them going silently black.
 *  - Strict, because the alternative is worse than a wrong colour. Assigning
 *    an unparseable string to ctx.fillStyle is a no-op: the canvas keeps
 *    whatever fill it had, so a junk value would paint the PREVIOUS layer's
 *    colour and look like a rendering bug rather than a bad value.
 */
export function normalizeColor(value, fallback = DEFAULT_SOLID_COLOR) {
  const text = typeof value === 'string' ? value.trim() : '';
  const long = HEX_LONG.exec(text);
  if (long) return `#${long[1].toLowerCase()}`;
  const short = HEX_SHORT.exec(text);
  if (short) {
    const [r, g, b] = short[1].toLowerCase();
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  const call = RGB_CALL.exec(text);
  if (call) {
    const parts = [call[1], call[2], call[3]].map(Number);
    if (parts.every(Number.isFinite)) return `#${parts.map(hex2).join('')}`;
  }
  return fallback;
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

/**
 * The colour stops of a gradient, as a list of `{ at, color }`.
 *
 * `at` is a WHOLE PERCENT, 0..100, not the 0..1 the canvas API wants. Every
 * other number a person can set in this app is a percent with a step of 1
 * (speed, strength, brightness, saturation), and a stop position is the same
 * kind of thing; the division by 100 belongs in the one place that paints
 * (src/engine/layers/gradient.js), not in every slider and every control range.
 *
 * Recovery rather than refusal, in the same spirit as the rest of this file:
 * a list that is too long is cut and reported, one that is too short is filled
 * up from DEFAULT_GRADIENT_STOPS, a stop with no usable position is spaced
 * evenly, and a stop with no usable colour takes the default rather than
 * making the whole layer disappear. The list is NOT sorted here — the indices
 * are what the settings column's cards and the exported effect's `color1` /
 * `color2` controls address, so re-ordering them behind the user's back would
 * move a control onto a different stop. Sorting is a painting concern and
 * happens there.
 */
function normalizeStops(raw, layerId, problems) {
  const input = Array.isArray(raw) ? raw : [];
  if (input.length > MAX_GRADIENT_STOPS) {
    problems.push(`Layer "${layerId}": ${input.length} colour stops given, `
      + `only the first ${MAX_GRADIENT_STOPS} are kept.`);
  }
  const kept = input.slice(0, MAX_GRADIENT_STOPS);
  const count = Math.max(kept.length, MIN_GRADIENT_STOPS);

  const stops = [];
  for (let index = 0; index < count; index += 1) {
    const entry = kept[index] && typeof kept[index] === 'object' ? kept[index] : {};
    const fallback = DEFAULT_GRADIENT_STOPS[Math.min(index, DEFAULT_GRADIENT_STOPS.length - 1)];
    const evenly = (index / (count - 1)) * 100;
    stops.push({
      at: clamp(num(entry.at, index < kept.length ? evenly : fallback.at), 0, 100),
      color: normalizeColor(entry.color, fallback.color)
    });
  }
  if (input.length > 0 && input.length < MIN_GRADIENT_STOPS) {
    problems.push(`Layer "${layerId}": a gradient needs at least ${MIN_GRADIENT_STOPS} colour stops, `
      + 'the missing one was filled in.');
  }
  return stops;
}

/**
 * The colour a gradient already shows at a given position along it.
 *
 * Built for exactly one gesture: adding a new stop should not change how the
 * gradient looks, so the new stop needs to start out as the colour that was
 * already there rather than a fresh default (see createStops in
 * app/renderer/components/field.js, the only caller). It lives here and not
 * in the renderer for the same reason normalizeColor and normalizeStops do:
 * blending two stop colours is arithmetic on the document's own gradient
 * maths, and the renderer is not allowed to know a colour of its own — every
 * colour a stop can start out as has to come from the document
 * (test/app/color-literals.test.js), which this function reads instead of
 * restating.
 *
 * It is deliberately NOT folded into normalizeStops. normalizeStops answers a
 * different question -- "what should a stop with no usable colour become",
 * for a document that arrived that way (an old file, a hand-edited one) --
 * and its answer, the neighbouring DEFAULT_GRADIENT_STOPS colour, must stay
 * exactly what it always was; see the "document from before" compatibility
 * test in colour-layers-document.test.js. This function answers a narrower
 * question for a caller that already knows exactly which two real,
 * already-normalized stops the new position falls between.
 *
 * MATCHES CANVASGRADIENT, ON PURPOSE. `addColorStop` blends between two
 * fully-opaque stops with a plain per-channel interpolation of the sRGB
 * bytes -- no gamma correction, no other colour space -- because that is
 * what every stop here already is: an opaque "#rrggbb". Reaching for a
 * "nicer" perceptual blend (e.g. interpolating in linear light or in
 * Lab/OkLab) would produce a midpoint the canvas itself would never paint,
 * which is the opposite of "unchanged": the new stop would sit on the ramp
 * showing a colour neither neighbour drew before it was added. Matching is
 * confirmed by rendering, not assumed -- see 'adding a stop changes no
 * pixel' in test/engine/colour-layers-render.test.js, which renders the
 * default two-stop gradient, adds a third stop with this function's colour,
 * renders again, and requires the two frames to be identical.
 *
 * `at` at or beyond either end returns that end's own colour, the same
 * clamping `addColorStop` applies to an offset outside 0..1 -- relevant only
 * if a future caller ever asks for a position outside the existing stops;
 * nextStopPosition (field.js) never does, since it only ever returns the
 * midpoint of two real neighbouring stops. Two stops at the same position
 * make a hard step with nothing to interpolate; asking for the colour
 * exactly there returns the earlier one in sorted order -- an arbitrary but
 * deterministic choice, not a wrong one, since the true answer depends on
 * which side of the step you approach from.
 */
export function colorAtPosition(stops, at) {
  const usable = (Array.isArray(stops) ? stops : [])
    .filter((stop) => stop && Number.isFinite(Number(stop.at)))
    .map((stop) => ({ at: Number(stop.at), color: normalizeColor(stop.color) }))
    .sort((a, b) => a.at - b.at);

  if (usable.length === 0) return DEFAULT_SOLID_COLOR;
  if (usable.length === 1 || at <= usable[0].at) return usable[0].color;
  const last = usable[usable.length - 1];
  if (at >= last.at) return last.color;

  let lower = usable[0];
  let upper = last;
  for (let index = 1; index < usable.length; index += 1) {
    if (usable[index].at >= at) {
      lower = usable[index - 1];
      upper = usable[index];
      break;
    }
  }

  if (upper.at === lower.at) return lower.color;
  const fraction = (at - lower.at) / (upper.at - lower.at);
  const from = hexToRgb(lower.color);
  const to = hexToRgb(upper.color);
  return `#${hex2(from.r + (to.r - from.r) * fraction)}`
    + `${hex2(from.g + (to.g - from.g) * fraction)}`
    + `${hex2(from.b + (to.b - from.b) * fraction)}`;
}

/** Split an already-normalized "#rrggbb" back into its three byte values. */
function hexToRgb(color) {
  return {
    r: parseInt(color.slice(1, 3), 16),
    g: parseInt(color.slice(3, 5), 16),
    b: parseInt(color.slice(5, 7), 16)
  };
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

  // Two layer types that own no asset at all. They are answered before the
  // image branch, and they answer it fully: a solid or a gradient has no
  // `asset`, no `fit` and no `offset`, because it has no picture to place —
  // handing it those fields would be handing the settings column and the crop
  // drag something to steer that does not exist. What they DO share with an
  // image layer is `motions`, so the whole motion machinery (the list, the
  // add/remove buttons, the exported motion/tempo/strength controls, the
  // "first entry of a kind wins" rule) applies to them unchanged.
  if (type === 'solid') {
    return {
      ...base,
      color: normalizeColor(input.color, DEFAULT_SOLID_COLOR),
      motions: normalizeMotions(input, id, problems)
    };
  }

  if (type === 'gradient') {
    let shape = str(input.shape, 'linear');
    if (!GRADIENT_SHAPES.includes(shape)) {
      problems.push(`Layer "${id}": unknown gradient shape "${shape}", using "linear".`);
      shape = 'linear';
    }
    return {
      ...base,
      shape,
      // Degrees, 0 = left to right, growing clockwise. Clamped rather than
      // wrapped: the control is a slider with two ends, and a document that
      // says 400 is more likely to be a mistake than an intent to mean 40.
      angle: clamp(num(input.angle, 0), 0, 360),
      stops: normalizeStops(input.stops, id, problems),
      motions: normalizeMotions(input, id, problems)
    };
  }

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
