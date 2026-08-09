// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);
const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

const MIME_BY_EXTENSION = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp'
};

/**
 * Prepare an image file for embedding, using the very same engine code the
 * app uses. Runs it inside Electron because that is where a canvas exists.
 */
export async function prepareImageFile(imagePath, options = {}) {
  const extension = extname(imagePath).toLowerCase();
  const mime = MIME_BY_EXTENSION[extension];
  if (!mime) throw new Error(`unsupported image type: ${extension || '(none)'}`);

  const dataUrl = `data:${mime};base64,${readFileSync(imagePath).toString('base64')}`;
  const dir = mkdtempSync(join(tmpdir(), 'signalforge-prepare-'));
  const requestFile = join(dir, 'request.json');
  const outFile = join(dir, 'asset.json');
  writeFileSync(requestFile, JSON.stringify({ dataUrl, options }), 'utf8');

  try {
    await new Promise((resolve, reject) => {
      const child = spawn(require_('electron'), [
        join(root, 'src', 'main', 'prepare-image-runner.cjs'), requestFile, outFile
      ], { stdio: ['ignore', 'ignore', 'pipe'] });
      let stderr = '';
      child.stderr.on('data', (chunk) => { stderr += chunk; });
      child.on('error', reject);

      // 'close' (not 'exit') waits for stdio to finish draining, so stderr
      // above is guaranteed complete by the time we read it here. Same
      // reasoning as test/harness/render.js.
      child.on('close', (code) => {
        if (code === 0) { resolve(); return; }

        // prepare-image-runner.cjs writes the real error into outFile
        // before exiting non-zero. Surface that instead of the bare exit
        // code, without letting a bad outFile mask the original failure.
        if (existsSync(outFile)) {
          try {
            const raw = JSON.parse(readFileSync(outFile, 'utf8'));
            if (raw && raw.error) {
              reject(new Error(`prepare failed (${code}): ${raw.error}`));
              return;
            }
          } catch {
            // outFile wasn't valid JSON (partial write); fall through.
          }
        }
        reject(new Error(`prepare failed (${code})\n${stderr}`));
      });
    });

    const asset = JSON.parse(readFileSync(outFile, 'utf8'));
    if (asset.error) throw new Error(asset.error);
    return asset;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
