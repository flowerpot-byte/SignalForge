// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import { registerLayer } from './layers/index.js';
import * as imageLayer from './layers/image.js';
import * as solidLayer from './layers/solid.js';
import * as gradientLayer from './layers/gradient.js';
import * as shapeLayer from './layers/shape.js';
import * as particlesLayer from './layers/particles.js';

registerLayer('image', imageLayer);
registerLayer('solid', solidLayer);
registerLayer('gradient', gradientLayer);
registerLayer('shape', shapeLayer);
registerLayer('particles', particlesLayer);

export {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  BLEND_MODES,
  FIT_MODES,
  MOTION_KINDS,
  SOLID_MOTION_KINDS,
  IMAGE_MOTION_KINDS,
  GRADIENT_MOTION_KINDS,
  SHAPE_MOTION_KINDS,
  SPINNING_SHAPE_MOTION_KINDS,
  PARTICLE_MOTION_KINDS,
  SPINNABLE_FIGURES,
  motionKindsFor,
  GRADIENT_SHAPES,
  SHAPE_FIGURES,
  PARTICLE_PATTERNS,
  MAX_PARTICLE_TILT,
  DEFAULT_PARTICLE_TILT,
  MIN_PARTICLE_COUNT,
  MAX_PARTICLE_COUNT,
  DEFAULT_PARTICLE_COUNT,
  MIN_PARTICLE_SIZE,
  MAX_PARTICLE_SIZE,
  DEFAULT_PARTICLE_SIZE,
  DEFAULT_PARTICLE_SPEED,
  MIN_PARTICLE_SEED,
  MAX_PARTICLE_SEED,
  DEFAULT_PARTICLE_SEED,
  MIN_SHAPE_SIZE,
  MAX_SHAPE_SIZE,
  DEFAULT_SHAPE_SIZE,
  MIN_SHAPE_THICKNESS,
  MAX_SHAPE_THICKNESS,
  DEFAULT_SHAPE_THICKNESS,
  MIN_STAR_POINTS,
  MAX_STAR_POINTS,
  DEFAULT_STAR_POINTS,
  MIN_BANDS,
  MAX_BANDS,
  DEFAULT_BANDS,
  MIN_GRADIENT_STOPS,
  MAX_GRADIENT_STOPS,
  MAX_HUE_SHIFT,
  MAX_TRAIL,
  MIN_ASPECT,
  MAX_ASPECT,
  DEFAULT_ASPECT,
  aspectFactorOf,
  colorAtPosition,
  DEFAULT_SOLID_COLOR,
  DEFAULT_GRADIENT_STOPS,
  CONTROL_TYPES,
  BINDABLE_DOCUMENT_FIELDS,
  clamp,
  normalizeColor,
  normalizeDocument,
  defaultValueAt
} from './document.js';

export {
  createRenderer, loadAssets, trailAlpha, TRAIL_STRONGEST_VEIL, TRAIL_WEAKEST_VEIL
} from './engine.js';
export { adjustColor, isNeutral, NEUTRAL_COLOR, hueCoefficients } from './color.js';
export { hueDegrees, rebasedHueShift } from './motion/hue.js';
export { cyclePaint, rebasedCyclePhase } from './motion/color-cycle.js';
export { LAYER_RENDERERS, registerLayer } from './layers/index.js';
export { computeSourceRect } from './util/fit.js';
export { createWarpField, WARP_PEAK_FACTOR } from './motion/warp.js';
export { speedToRate } from './motion/speed.js';
export { breatheFactor, motionPhase } from './motion/breathe.js';
export { pulseFactor } from './motion/pulse.js';
export { spinDegrees, spinRadians } from './motion/spin.js';
export { zoomFactor, ZOOM_MAX_DEPTH } from './motion/zoom.js';
export { driftSwing, DRIFT_CENTRE_REACH } from './motion/drift.js';
export {
  STAR_INNER_RATIO, STAR_FIRST_POINT, HEART_LOBE_TOP, HEART_INK_HEIGHT, shapeCentre
} from './layers/shape.js';
export { mix32, seedHash, unitFrom, hashUnit, HASH_RANGE } from './hash.js';
export {
  particleField, particleCache, particleAt,
  PARTICLE_PATTERN_LOOKS, PARTICLE_SPEED_SCALE, PARTICLE_MIN_ALPHA
} from './layers/particles.js';
export { getByPath, setByPath, resolveLayerPath, resolveBindingPath, applyControls } from './bind.js';
export { prepareImageAsset } from './asset-import.js';
