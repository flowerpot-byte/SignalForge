// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * type -> { createState(), render(ctx, layer, asset, timeSec, state) }
 *
 * Adding a layer type means adding a file and one registerLayer call.
 * Nothing existing has to change.
 */
export const LAYER_RENDERERS = new Map();

export function registerLayer(type, renderer) {
  if (!renderer || typeof renderer !== 'object') {
    throw new Error(`registerLayer("${type}"): renderer must be an object`);
  }
  if (typeof renderer.render !== 'function') {
    throw new Error(`registerLayer("${type}"): render must be a function`);
  }
  if (LAYER_RENDERERS.has(type)) {
    throw new Error(`registerLayer("${type}"): already registered`);
  }
  LAYER_RENDERERS.set(type, {
    createState: renderer.createState ?? (() => ({})),
    render: renderer.render
  });
}
