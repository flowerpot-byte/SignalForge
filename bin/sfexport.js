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
import { MOTION_KINDS, FIT_MODES, normalizeDocument } from '../src/engine/document.js';

/** The id the one image layer gets, and what the controls bind through. */
const LAYER_ID = 'a1';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

const USAGE = `Usage:
  node bin/sfexport.js --image <file> [options]
  node bin/sfexport.js --project <file.json> [options]

Options:
  --name <text>      Effect name (default: the image file name)
  --motion <kind>    none | warp | drift | breathe   (default: warp)
  --fit <kind>       cover | stretch | contain       (default: cover)
  --out <folder>     Where to write. Default: the detected SignalRGB folder.
  --force            Overwrite an existing effect of the same name.
`;

// Flags that take a value. --force is handled separately as the one
// value-less flag.
const VALUE_FLAGS = new Set(['image', 'project', 'name', 'motion', 'fit', 'out']);

function parseArguments(argv) {
  const options = { motion: 'warp', fit: 'cover', force: false };
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

  if (!MOTION_KINDS.includes(options.motion)) {
    throw new Error(`unknown --motion value: "${options.motion}" (expected ${MOTION_KINDS.join('|')})`);
  }
  if (!FIT_MODES.includes(options.fit)) {
    throw new Error(`unknown --fit value: "${options.fit}" (expected ${FIT_MODES.join('|')})`);
  }

  return options;
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
  if (!options.image) throw new Error(USAGE);
  const name = options.name || basename(options.image).replace(/\.[^.]+$/, '');
  return { name, project: null };
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
  // expensive step (an Electron launch) for `--image` mode.
  const doc = project || await buildImageDocument(options, name);

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
