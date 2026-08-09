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

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const ASCII_PRINTABLE = /^[\x20-\x7E]*$/;

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

  const motionInput = input.motion && typeof input.motion === 'object' ? input.motion : {};
  let kind = str(motionInput.kind, 'none');
  if (!MOTION_KINDS.includes(kind)) {
    problems.push(`Layer "${id}": unknown motion "${kind}", using "none".`);
    kind = 'none';
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
    motion: {
      kind,
      speed: clamp(num(motionInput.speed, 15), 0, 100),
      amount: clamp(num(motionInput.amount, 30), 0, 100)
    }
  };
}

function normalizeControl(raw, index, problems) {
  const input = raw && typeof raw === 'object' ? raw : {};
  const property = str(input.property, '');
  if (!IDENTIFIER.test(property)) {
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
    layers,
    controls,
    assets
  };

  return { doc, problems };
}
