#!/usr/bin/env node
// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildEffectHtml } from '../src/export/build-effect.js';
import { findEffectsFolders } from '../src/main/effects-folder.js';
import { prepareImageFile } from '../src/main/prepare-image.js';

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

function parseArguments(argv) {
  const options = { motion: 'warp', fit: 'cover', force: false };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--force') { options.force = true; continue; }
    const key = flag.startsWith('--') ? flag.slice(2) : null;
    if (!key) throw new Error(`unexpected argument: ${flag}`);
    i += 1;
    if (i >= argv.length) throw new Error(`${flag} needs a value`);
    options[key] = argv[i];
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

async function buildDocument(options) {
  if (options.project) {
    return JSON.parse(readFileSync(options.project, 'utf8'));
  }
  if (!options.image) throw new Error(USAGE);

  const asset = await prepareImageFile(options.image);
  const name = options.name || basename(options.image).replace(/\.[^.]+$/, '');
  return {
    name,
    description: `Built from ${basename(options.image)} with SignalForge.`,
    publisher: 'SignalForge',
    assets: { picture: asset },
    layers: [{
      id: 'a1',
      type: 'image',
      name: 'Picture',
      asset: 'picture',
      fit: options.fit,
      motion: { kind: options.motion, speed: 15, amount: 30 }
    }],
    controls: [
      { property: 'tempo', label: { de: 'Tempo', en: 'Speed' }, type: 'number', min: 1, max: 100, default: 15, bind: ['a1.motion.speed'] },
      { property: 'strength', label: { de: 'Staerke', en: 'Strength' }, type: 'number', min: 0, max: 100, default: 30, bind: ['a1.motion.amount'] },
      { property: 'brightness', label: { de: 'Helligkeit', en: 'Brightness' }, type: 'number', min: 5, max: 100, default: 100, bind: [] }
    ]
  };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const doc = await buildDocument(options);

  const bundle = join(root, 'dist', 'engine.bundle.js');
  if (!existsSync(bundle)) throw new Error('dist/engine.bundle.js missing. Run: npm run build:engine');
  const engineSource = readFileSync(bundle, 'utf8');

  const folder = resolveOutputFolder(options.out);
  mkdirSync(folder, { recursive: true });
  const target = join(folder, `${doc.name}.html`);

  if (existsSync(target) && !options.force) {
    throw new Error(`"${target}" already exists. Pass --force to overwrite.`);
  }

  const html = buildEffectHtml({ doc, engineSource, lang: 'en' });
  writeFileSync(target, html, 'utf8');
  const kb = (statSync(target).size / 1024).toFixed(1);
  console.log(`Wrote ${target} (${kb} KB)`);
  console.log('If SignalRGB does not list it, restart SignalRGB (see docs/erkenntnisse-video.md).');
}

main().catch((error) => {
  console.error(String(error.message || error));
  process.exit(1);
});
