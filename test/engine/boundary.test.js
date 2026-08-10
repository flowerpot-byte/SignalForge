// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));

/**
 * Everything here has to survive being bundled into a plain web page.
 *
 * The whole `src/export` directory is guarded, not just build-effect.js:
 * every file in it (today build-effect.js and effect-controls.js) ends up
 * inside the exported effect, so every file in it must stay Node-free, not
 * just the one that happened to be guarded first.
 */
const GUARDED = ['src/engine', 'src/export'];

/**
 * The one part of `src` that is allowed to reach into Node: the main process.
 * Everything else under `src` is engine code by definition and has to be in
 * GUARDED above — which is what `guardedFiles()` checks, so this list cannot
 * grow by accident.
 */
const NODE_SIDE = 'src/main';

const FORBIDDEN = [
  { pattern: /\brequire\s*\(/, why: 'CommonJS require' },
  { pattern: /from\s+['"]node:/, why: 'node: builtin import' },
  { pattern: /from\s+['"](fs|path|os|child_process|url|crypto)['"]/, why: 'node builtin import' },
  { pattern: /from\s+['"]electron['"]/, why: 'electron import' },
  { pattern: /\bprocess\.(env|argv|cwd)\b/, why: 'process access' },
  { pattern: /\b__dirname\b|\b__filename\b/, why: 'CommonJS path global' }
];

function collect(relative) {
  const absolute = join(root, relative);
  if (statSync(absolute).isFile()) return [relative];
  const out = [];
  for (const entry of readdirSync(absolute, { withFileTypes: true })) {
    const next = `${relative}/${entry.name}`;
    if (entry.isDirectory()) out.push(...collect(next));
    else if (entry.name.endsWith('.js')) out.push(next);
  }
  return out;
}

/**
 * Everything this file guards — and the proof that it is everything.
 *
 * There used to be a floor here instead: `files.length >= 9`, written when the
 * tree held nine files. It held seventeen by the time anybody looked again, so
 * eight of them could have been moved out of the guarded tree and this test
 * would still have reported green. That is the third guard in this project to
 * rot the same way, so the number is gone rather than raised: what is asserted
 * now is the RULE the number was standing in for.
 *
 * The rule: `src/main` is the Node side of this app, and every other `.js`
 * file under `src`, at any depth, is engine or export code that has to survive
 * being bundled into a plain web page. So the walk of GUARDED must come out
 * equal to a walk of `src` with the Node side taken off — which maintains
 * itself when a file is added, and goes red the moment one is moved somewhere
 * GUARDED does not reach.
 */
function guardedFiles() {
  const files = GUARDED.flatMap(collect);
  const shouldBeGuarded = collect('src').filter((file) => !file.startsWith(`${NODE_SIDE}/`));
  assert.deepEqual(
    [...files].sort(),
    [...shouldBeGuarded].sort(),
    `everything under src/ apart from ${NODE_SIDE}/ has to be inside the guarded tree — `
      + `either add the new directory to GUARDED, or it is main-process code and belongs `
      + `under ${NODE_SIDE}/`
  );
  return files;
}

test('the engine never reaches into Node', () => {
  const files = guardedFiles();

  const offences = [];
  for (const file of files) {
    const source = readFileSync(join(root, file), 'utf8');
    for (const { pattern, why } of FORBIDDEN) {
      if (pattern.test(source)) offences.push(`${file}: ${why}`);
    }
  }
  assert.deepEqual(offences, [], `engine boundary broken:\n${offences.join('\n')}`);
});

test('the engine never reads the clock or rolls dice', () => {
  const files = guardedFiles();
  const offences = [];
  for (const file of files) {
    const source = readFileSync(join(root, file), 'utf8');
    if (/\bMath\.random\s*\(/.test(source)) offences.push(`${file}: Math.random`);
    if (/\bDate\.now\s*\(/.test(source)) offences.push(`${file}: Date.now`);
    if (/\bnew Date\s*\(\s*\)/.test(source)) offences.push(`${file}: new Date()`);
    if (/\bperformance\.now\s*\(/.test(source)) offences.push(`${file}: performance.now`);
  }
  assert.deepEqual(offences, [], `engine must be deterministic:\n${offences.join('\n')}`);
});
