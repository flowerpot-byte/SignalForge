// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import { registerLayer } from './layers/index.js';
import * as imageLayer from './layers/image.js';
import * as solidLayer from './layers/solid.js';
import * as gradientLayer from './layers/gradient.js';

registerLayer('image', imageLayer);
registerLayer('solid', solidLayer);
registerLayer('gradient', gradientLayer);

export {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  BLEND_MODES,
  FIT_MODES,
  MOTION_KINDS,
  SOLID_MOTION_KINDS,
  motionKindsFor,
  GRADIENT_SHAPES,
  MIN_GRADIENT_STOPS,
  MAX_GRADIENT_STOPS,
  DEFAULT_SOLID_COLOR,
  DEFAULT_GRADIENT_STOPS,
  CONTROL_TYPES,
  BINDABLE_DOCUMENT_FIELDS,
  clamp,
  normalizeColor,
  normalizeDocument
} from './document.js';

export { createRenderer, loadAssets } from './engine.js';
export { adjustColor, isNeutral, NEUTRAL_COLOR } from './color.js';
export { LAYER_RENDERERS, registerLayer } from './layers/index.js';
export { computeSourceRect } from './util/fit.js';
export { createWarpField, WARP_PEAK_FACTOR } from './motion/warp.js';
export { speedToRate } from './motion/speed.js';
export { getByPath, setByPath, resolveLayerPath, resolveBindingPath, applyControls } from './bind.js';
export { prepareImageAsset } from './asset-import.js';
