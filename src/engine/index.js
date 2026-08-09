// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import { registerLayer } from './layers/index.js';
import * as imageLayer from './layers/image.js';

registerLayer('image', imageLayer);

export {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  BLEND_MODES,
  FIT_MODES,
  MOTION_KINDS,
  CONTROL_TYPES,
  BINDABLE_DOCUMENT_FIELDS,
  clamp,
  normalizeDocument
} from './document.js';

export { createRenderer, loadAssets } from './engine.js';
export { LAYER_RENDERERS, registerLayer } from './layers/index.js';
export { computeSourceRect } from './util/fit.js';
export { createWarpField, WARP_PEAK_FACTOR } from './motion/warp.js';
export { speedToRate } from './motion/speed.js';
export { getByPath, setByPath, resolveLayerPath, resolveBindingPath, applyControls } from './bind.js';
export { prepareImageAsset } from './asset-import.js';
