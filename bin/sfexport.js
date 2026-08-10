#!/usr/bin/env node
// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildEffectHtml } from '../src/export/build-effect.js';
import { effectControls } from '../src/export/effect-controls.js';
import { findEffectsFolders } from '../src/main/effects-folder.js';
import { prepareImageFile } from '../src/main/prepare-image.js';
import {
  MOTION_KINDS, FIT_MODES, GRADIENT_SHAPES, MIN_GRADIENT_STOPS, MAX_GRADIENT_STOPS,
  motionKindsFor, normalizeColor, normalizeDocument
} from '../src/engine/document.js';

/** The id the one layer gets, and what the controls bind through. */
const LAYER_ID = 'a1';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

const USAGE = `Usage:
  node bin/sfexport.js --image <file> [options]
  node bin/sfexport.js --solid <colour> [options]
  node bin/sfexport.js --gradient <colour,colour[,colour,colour]> [options]
  node bin/sfexport.js --project <file.json> [options]

Options:
  --name <text>      Effect name (default: the image file name; required without --image)
  --motion <kind>    none | warp | drift | breathe   (default: warp)
                     --solid takes none | breathe only, and defaults to none
  --fit <kind>       cover | stretch | contain       (default: cover, --image only)
  --shape <kind>     linear | radial                 (default: linear, --gradient only)
  --angle <degrees>  0..360                          (default: 0, --gradient only)
  --out <folder>     Where to write. Default: the detected SignalRGB folder.
  --force            Overwrite an existing effect of the same name.

A colour is written the way a colour usually is: #rrggbb, #rgb or rrggbb.
`;

// Flags that take a value. --force is handled separately as the one
// value-less flag.
const VALUE_FLAGS = new Set([
  'image', 'solid', 'gradient', 'project', 'name', 'motion', 'fit', 'shape', 'angle', 'out'
]);

/** The three ways to say what the effect is made of; exactly one is allowed. */
const SOURCE_FLAGS = ['image', 'solid', 'gradient', 'project'];

function parseArguments(argv) {
  const options = { fit: 'cover', shape: 'linear', angle: '0', force: false };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--force') { options.force = true; continue; }
    if (!flag.startsWith('--')) throw new Error(`unexpected argument: ${flag}`);
    const key = flag.slice(2);
    if (!VALUE_FLAGS.has(key)) throw new Error(`unknown option: ${flag}`);
    i += 1;
    if (i >= argv.length) throw new Error(`${flag} needs a value`);
    const value = argv[i];
    if (value.startsWith('--')) throw new Error(`${flag} needs a value, got "${value}"`);
    options[key] = value;
  }

  const given = SOURCE_FLAGS.filter((flag) => options[flag] !== undefined);
  if (given.length > 1) {
    throw new Error(`give exactly one of ${SOURCE_FLAGS.map((f) => `--${f}`).join(', ')}, not ${given.length}`);
  }

  // Whether --motion was actually asked for. A picture defaults to warp, as it
  // always has; a solid colour defaults to "none", because warp and drift on a
  // flat colour provably change nothing (see src/engine/layers/solid.js) and
  // starting somebody off with an inert motion would be a lie about what the
  // effect does.
  options.motionGiven = options.motion !== undefined;
  if (!options.motionGiven) options.motion = options.solid !== undefined ? 'none' : 'warp';

  // Judged against what THIS layer type can perform, not against the four
  // kinds flat. `--solid --motion drift` used to build an effect whose
  // SignalRGB panel offered a Motion option that provably does nothing (see
  // SOLID_MOTION_KINDS in src/engine/document.js) — the one entrance where
  // that could still be asked for. `--project` brings its own layers and its
  // own motions and takes no --motion at all, so the wide list stands there.
  const layerType = options.solid !== undefined ? 'solid' : 'image';
  const kinds = motionKindsFor(layerType);
  if (!kinds.includes(options.motion)) {
    throw new Error(MOTION_KINDS.includes(options.motion)
      ? `--motion ${options.motion} does nothing on a flat colour (expected ${kinds.join('|')})`
      : `unknown --motion value: "${options.motion}" (expected ${kinds.join('|')})`);
  }
  if (!FIT_MODES.includes(options.fit)) {
    throw new Error(`unknown --fit value: "${options.fit}" (expected ${FIT_MODES.join('|')})`);
  }
  if (!GRADIENT_SHAPES.includes(options.shape)) {
    throw new Error(`unknown --shape value: "${options.shape}" (expected ${GRADIENT_SHAPES.join('|')})`);
  }
  if (!Number.isFinite(Number(options.angle))) {
    throw new Error(`--angle needs a number of degrees, got "${options.angle}"`);
  }

  return options;
}

/**
 * "#ff0066" -> "#ff0066", and anything unusable is refused by name.
 *
 * normalizeColor (src/engine/document.js) is the one judge of what a colour
 * is, here as everywhere else — but it recovers by handing back a fallback,
 * which is right inside a document being repaired and wrong on a command line.
 * A typed colour that was not understood has to be said out loud, or the
 * effect quietly comes out in a colour nobody asked for.
 */
function colourArgument(text, flag) {
  const IMPOSSIBLE = '#000000';
  const OTHER = '#ffffff';
  if (normalizeColor(text, IMPOSSIBLE) === IMPOSSIBLE && normalizeColor(text, OTHER) === OTHER) {
    throw new Error(`${flag}: "${text}" is not a colour (expected #rrggbb, #rgb or rrggbb)`);
  }
  return normalizeColor(text, IMPOSSIBLE);
}

function resolveOutputFolder(explicit) {
  if (explicit) return explicit;
  const found = findEffectsFolders({
    documentsPath: join(homedir(), 'Documents'),
    homePath: homedir(),
    exists: (candidate) => existsSync(candidate)
  });
  if (found.length === 0) {
    throw new Error('No SignalRGB effects folder found. Pass --out <folder> explicitly.');
  }
  return found[0];
}

/**
 * Resolve the document's name (and, for `--project`, the already-parsed
 * document) without touching Electron. Used to compute the target file
 * path before paying for the expensive part of `--image` mode, so a run
 * destined to fail the overwrite check fails fast instead of after the
 * image has already been prepared.
 */
function resolveNameAndProject(options) {
  if (options.project) {
    const project = JSON.parse(readFileSync(options.project, 'utf8'));
    return { name: project.name, project };
  }
  if (options.image) {
    const name = options.name || basename(options.image).replace(/\.[^.]+$/, '');
    return { name, project: null };
  }
  // A colour effect has no file to be named after, so the name has to be
  // given. Guessing one ("Solid", "Gradient") would put a file in somebody's
  // SignalRGB list under a name they never chose, and the second export would
  // silently want to overwrite the first.
  if (options.solid !== undefined || options.gradient !== undefined) {
    if (!options.name) throw new Error('--name is required when there is no image to take a name from');
    return { name: options.name, project: null };
  }
  throw new Error(USAGE);
}

async function buildImageDocument(options, name) {
  const asset = await prepareImageFile(options.image);
  const raw = {
    name,
    description: `Built from ${basename(options.image)} with SignalForge.`,
    publisher: 'SignalForge',
    assets: { picture: asset },
    layers: [{
      id: LAYER_ID,
      type: 'image',
      name: 'Picture',
      asset: 'picture',
      fit: options.fit,
      // Always exactly one motion entry, whatever --motion was, so the
      // motion/tempo/strength controls always have something to write into --
      // setByPath (src/engine/bind.js) deliberately refuses to create a
      // missing branch, so a `motions` array without an entry would leave
      // those three controls silently dead.
      //
      // For --motion none this bakes a real `kind: 'none'` entry, not a
      // placeholder standing in for it. normalizeDocument's normalizeMotion
      // (document.js) keeps "none" as an ordinary, inert entry instead of
      // dropping it, so the document is honest about having no motion from
      // the moment it is built -- true even if some future code renders
      // `layer.motions` directly without going through applyControls first.
      //
      // The entry's speed and amount are left out on purpose: what a fresh
      // motion starts at is normalizeDocument's business, not a second copy
      // of those numbers kept here.
      motions: [{ kind: options.motion }]
    }]
  };

  // The control list is NOT written out here. It lives in exactly one place
  // in the project -- src/export/effect-controls.js -- and the app's export
  // button reads the very same list, so the command line and the window can
  // never drift apart on which controls a finished effect offers or what
  // ranges they span. effectControls reads its defaults straight out of the
  // document, which therefore has to be normalized first.
  const doc = normalizeDocument(raw).doc;
  return { ...doc, controls: effectControls(doc, LAYER_ID) };
}

/**
 * An effect with no picture in it at all: one colour, or a ramp between a few.
 *
 * Everything the picture path does, minus the picture — no asset, no
 * Electron launch to prepare one, and therefore no `assets` key: the whole
 * effect is the layer and the engine bundle. The control list comes from the
 * one shared place, exactly as above.
 */
function buildColourDocument(options, name) {
  const gradient = options.gradient !== undefined;
  const colours = gradient
    ? options.gradient.split(',').map((part) => colourArgument(part.trim(), '--gradient'))
    : [colourArgument(options.solid, '--solid')];

  if (gradient && (colours.length < MIN_GRADIENT_STOPS || colours.length > MAX_GRADIENT_STOPS)) {
    throw new Error(`--gradient needs between ${MIN_GRADIENT_STOPS} and ${MAX_GRADIENT_STOPS} `
      + `colours separated by commas, got ${colours.length}`);
  }

  const layer = gradient
    ? {
      id: LAYER_ID,
      type: 'gradient',
      name: 'Gradient',
      shape: options.shape,
      angle: Number(options.angle),
      // Spread evenly across the ramp. Where exactly each colour sits is
      // deliberately not a command-line option: it is the one gradient
      // setting that needs to be seen while it is being chosen, which is
      // what the window is for.
      //
      // No guard against a single colour here: MIN_GRADIENT_STOPS is checked a
      // few lines above and throws first, so there is exactly one place that
      // decides what too few colours means. There used to be a second — an
      // `at: colours.length === 1 ? 0 : ...` — which could not run, and a
      // branch that cannot run is a claim about behaviour that nobody can
      // check.
      stops: colours.map((color, index) => ({
        at: (index / (colours.length - 1)) * 100,
        color
      })),
      motions: [{ kind: options.motion }]
    }
    : {
      id: LAYER_ID,
      type: 'solid',
      name: 'Colour',
      color: colours[0],
      motions: [{ kind: options.motion }]
    };

  const doc = normalizeDocument({
    name,
    description: gradient
      ? `A ${options.shape} gradient built with SignalForge.`
      : `A single colour built with SignalForge.`,
    publisher: 'SignalForge',
    layers: [layer]
  }).doc;
  return { ...doc, controls: effectControls(doc, LAYER_ID) };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));

  const bundle = join(root, 'dist', 'engine.bundle.js');
  if (!existsSync(bundle)) throw new Error('dist/engine.bundle.js missing. Run: npm run build:engine');
  const engineSource = readFileSync(bundle, 'utf8');

  const { name, project } = resolveNameAndProject(options);

  const folder = resolveOutputFolder(options.out);
  mkdirSync(folder, { recursive: true });
  const target = join(folder, `${name}.html`);

  if (existsSync(target) && !options.force) {
    throw new Error(`"${target}" already exists. Pass --force to overwrite.`);
  }

  // Only reached once the overwrite check has passed: this is the
  // expensive step (an Electron launch) for `--image` mode. A colour effect
  // has nothing expensive to do at all.
  let doc = project;
  if (!doc) {
    doc = options.image
      ? await buildImageDocument(options, name)
      : buildColourDocument(options, name);
  }

  const html = buildEffectHtml({ doc, engineSource, lang: 'en' });
  writeFileSync(target, html, 'utf8');
  const kb = (statSync(target).size / 1024).toFixed(1);
  console.log(`Wrote ${target} (${kb} KB)`);
  console.log('If SignalRGB does not list it, restart SignalRGB (see docs/erkenntnisse-signalrgb-motor.md).');
}

main().catch((error) => {
  console.error(String(error.message || error));
  process.exit(1);
});
