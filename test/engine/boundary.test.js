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

test('the engine never reaches into Node', () => {
  const files = GUARDED.flatMap(collect);
  assert.ok(files.length >= 9, `expected to scan the whole engine, only found ${files.length} files`);

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
  const files = GUARDED.flatMap(collect);
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
