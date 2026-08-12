#!/usr/bin/env node
// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max Leopold Blumenschein
// SPDX-License-Identifier: GPL-3.0-or-later
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildEffectHtml } from '../src/export/build-effect.js';
import { effectControls } from '../src/export/effect-controls.js';
import { findEffectsFolders } from '../src/main/effects-folder.js';
import { prepareImageFile } from '../src/main/prepare-image.js';
import { renderCoverPng } from '../src/main/cover-image.js';
import { withoutFileAssets } from '../src/main/export-effect.js';
import { writeFileAtomic } from '../src/main/write-file-atomic.js';
import {
  MOTION_KINDS, FIT_MODES, GRADIENT_SHAPES, MIN_GRADIENT_STOPS, MAX_GRADIENT_STOPS,
  MIN_BANDS, MAX_BANDS, DEFAULT_BANDS,
  motionKindsFor, normalizeColor, normalizeDocument
} from '../src/engine/document.js';

/** The id the one layer gets, and what the controls bind through. */
const LAYER_ID = 'a1';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

/**
 * What the installed app calls itself, read from the one place that decides
 * it rather than typed a second time here — electron-builder's productName is
 * what names the settings folder on disk, so a copy of the string here would
 * be a copy that can go stale without anything noticing.
 */
const PRODUCT_NAME = (() => {
  try {
    return JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).build.productName;
  } catch {
    return 'SignalForge';
  }
})();

const USAGE = `Usage:
  node bin/sfexport.js --image <file> [options]
  node bin/sfexport.js --solid <colour> [options]
  node bin/sfexport.js --gradient <colour,colour[,colour,colour]> [options]
  node bin/sfexport.js --project <file.json> [options]

Options:
  --name <text>      Effect name (default: the image file name; required without --image)
  --motion <kind>    a gradient takes ${motionKindsFor('gradient').join(' | ')}
                     a picture takes ${motionKindsFor('image').join(' | ')}
                     a flat colour takes ${motionKindsFor('solid').join(' | ')}
                     (default: warp, and none for --solid)
  --fit <kind>       ${FIT_MODES.join(' | ')}
                     (default: cover, --image only)
  --shape <kind>     ${GRADIENT_SHAPES.join(' | ')}
                     (default: linear, --gradient only)
  --angle <degrees>  0..360
                     (default: 0, --gradient only)
  --bands <count>    ${MIN_BANDS}..${MAX_BANDS} repeats of the ramp, read by conic, stripes and waves;
                     linear and radial are one traversal of it and ignore it
                     (default: ${DEFAULT_BANDS}, --gradient only)
  --by <name>        Who made it. SignalRGB prints this under the effect's
                     title. Default: the name saved in the app's settings, and
                     nothing at all if none has been saved yet.
  --out <folder>     Where to write. Default: the detected SignalRGB folder.
  --force            Overwrite an existing effect of the same name.

A colour is written the way a colour usually is: #rrggbb, #rgb or rrggbb.
`;

// Flags that take a value. --force is handled separately as the one
// value-less flag.
const VALUE_FLAGS = new Set([
  'image', 'solid', 'gradient', 'project', 'name', 'motion', 'fit', 'shape', 'angle', 'bands', 'out',
  'by'
]);

/**
 * What a layer type is called when a refusal has to name it.
 *
 * The refusal below used to say "does nothing on a flat colour" whatever the
 * layer was, because when it was written the only narrowed type WAS the flat
 * colour. `--image --motion spin` then produced a message about a flat colour
 * for an effect made of a photograph — and a wrong reason is worse than none,
 * because the person believes it. The list a type is offered comes from
 * motionKindsFor and the words for the type come from here, so neither can be
 * right about one type and wrong about another.
 */
const LAYER_WORDS = Object.freeze({
  solid: 'a flat colour', image: 'a picture', gradient: 'a gradient'
});

/** The three ways to say what the effect is made of; exactly one is allowed. */
const SOURCE_FLAGS = ['image', 'solid', 'gradient', 'project'];

function parseArguments(argv) {
  // The defaults are the strings a command line would have carried, so a value
  // that was typed and a value that was not go through exactly the same checks
  // below. `bands` starts at the engine's own default rather than at a second
  // copy of the number.
  const options = {
    fit: 'cover', shape: 'linear', angle: '0', bands: String(DEFAULT_BANDS), force: false
  };
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

  // Judged against what THIS layer type can perform, not against the six kinds
  // flat. `--solid --motion drift` used to build an effect whose SignalRGB
  // panel offered a Motion option that provably does nothing (see
  // SOLID_MOTION_KINDS in src/engine/document.js) — the one entrance where
  // that could still be asked for. `--project` brings its own layers and its
  // own motions and takes no --motion at all, so the wide list stands there.
  //
  // Which type it is, is decided from the flag that was given rather than from
  // "solid, and everything else": a gradient is narrowed by nothing (it is
  // offered every motion there is) and a picture is narrowed too (no spin — see
  // IMAGE_MOTION_KINDS), and the second of those was being judged by the
  // picture's list while being told about a flat colour.
  const layerType = options.solid !== undefined ? 'solid'
    : options.gradient !== undefined ? 'gradient'
      : 'image';
  const kinds = motionKindsFor(layerType);
  if (!kinds.includes(options.motion)) {
    throw new Error(MOTION_KINDS.includes(options.motion)
      ? `--motion ${options.motion} is not offered on ${LAYER_WORDS[layerType]} `
        + `(expected ${kinds.join('|')})`
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
  // Same treatment as --angle, and for the same reason: what a number MEANS is
  // the engine's business, so a value that is a number goes through and
  // normalizeDocument rounds it and clamps it into MIN_BANDS..MAX_BANDS (see
  // the note beside those in src/engine/document.js). Only a value that is not
  // a number at all is refused here, because that is not a band count somebody
  // meant differently — it is a typo.
  if (!Number.isFinite(Number(options.bands))) {
    throw new Error(`--bands needs a number of repeats (${MIN_BANDS}..${MAX_BANDS}), `
      + `got "${options.bands}"`);
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

/**
 * Who to name as the author, for a build started from the command line.
 *
 * `--by` if it was given; otherwise the name the app has saved, so that the
 * same person's effects are signed the same way whichever of the two built
 * them; otherwise nothing.
 *
 * WHY IT READS THE APP'S SETTINGS FILE DIRECTLY. There is no Electron here to
 * ask for the userData folder, so the path is rebuilt from the same rule
 * Electron uses on this platform (APPDATA/<productName> on Windows, and the
 * usual two elsewhere) with the app name out of package.json's build block —
 * not a second copy of the string. Every step is best-effort: a missing file,
 * an unreadable one, junk inside it or a settings shape from a newer version
 * all end at the same place, which is an unsigned effect. Nothing here is
 * allowed to stop an export.
 *
 * This used to be the literal 'SignalForge', which is a program and not a
 * person; SignalRGB printed it under the title as though the tool had made
 * the effect by itself.
 */
function publisherFor(options) {
  if (typeof options.by === 'string') return options.by;
  try {
    const home = homedir();
    const folder = process.platform === 'win32'
      ? join(process.env.APPDATA || join(home, 'AppData', 'Roaming'), PRODUCT_NAME)
      : process.platform === 'darwin'
        ? join(home, 'Library', 'Application Support', PRODUCT_NAME)
        : join(process.env.XDG_CONFIG_HOME || join(home, '.config'), PRODUCT_NAME);
    const saved = JSON.parse(readFileSync(join(folder, 'settings.json'), 'utf8'));
    return typeof saved.author === 'string' ? saved.author : '';
  } catch {
    return '';
  }
}

async function buildImageDocument(options, name) {
  const asset = await prepareImageFile(options.image);
  const raw = {
    name,
    description: `Built from ${basename(options.image)} with SignalForge.`,
    publisher: publisherFor(options),
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
      // Written on every gradient, whatever the shape, exactly as the window
      // writes it: the shape can be switched from SignalRGB's own panel, so a
      // band count that only existed for the shape chosen here would be a dead
      // end the moment somebody switched to one that reads it.
      bands: Number(options.bands),
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
    publisher: publisherFor(options),
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

  // The tile picture SignalRGB shows for this effect, beside the effect and
  // under the same base name (docs/messung-titelbilder.md). Drawn by the same
  // renderCoverPng the app's export button uses, so both entrances produce the
  // same tile — but this process is plain Node, so it has to spawn an Electron
  // to find a canvas at all.
  //
  // If that fails — no Electron on this machine, a headless box with no
  // display, a broken engine bundle — it costs the picture and nothing else.
  // Saying so out loud beats either silence (a missing tile nobody can
  // explain) or refusing to export (an effect nobody gets because its
  // decoration could not be drawn).
  const coverTarget = join(folder, `${name}.png`);
  let cover = null;
  try {
    // The same stripping the app's export applies before ITS cover render:
    // a hand-written --project can name file-shaped assets, and the hidden
    // render window must never be handed a URL to fetch — for a layer or
    // for the cover. What the strip orphans, the script's own re-normalize
    // recovers from (a cover pointing at a removed asset falls back to the
    // automatic tile).
    cover = await renderCoverPng(withoutFileAssets(doc));
  } catch (error) {
    console.error(`No cover image: ${String(error.message || error)}`);
    console.error('The effect itself is unaffected; SignalRGB will show its usual placeholder tile.');
  }

  // The picture first, so the effect never appears in SignalRGB's live-watched
  // folder without its tile — same order as src/main/export-effect.js. Both
  // through the same atomic write the app uses, for the same reason: this
  // folder is being watched while it is being written to.
  if (cover) writeFileAtomic(coverTarget, cover);
  writeFileAtomic(target, html);
  const kb = (statSync(target).size / 1024).toFixed(1);
  console.log(`Wrote ${target} (${kb} KB)`);
  if (cover) console.log(`Wrote ${coverTarget} (${(statSync(coverTarget).size / 1024).toFixed(1)} KB)`);
  console.log('If SignalRGB does not list it, restart SignalRGB (see docs/erkenntnisse-signalrgb-motor.md).');
}

main().catch((error) => {
  console.error(String(error.message || error));
  process.exit(1);
});
