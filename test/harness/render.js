// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { decodePixels } from './pixels.js';

const here = dirname(fileURLToPath(import.meta.url));
const electronBinary = createRequire(import.meta.url)('electron');

/**
 * Render a batch of jobs in one Electron launch and return their pixels.
 *
 * Batching matters: starting Electron costs a second or two, running a job
 * costs milliseconds. Always pass every job a test needs in one call.
 */
export async function runJobs(jobs) {
  const dir = mkdtempSync(join(tmpdir(), 'signalforge-harness-'));
  const jobFile = join(dir, 'jobs.json');
  const outFile = join(dir, 'out.json');
  writeFileSync(jobFile, JSON.stringify({ jobs }), 'utf8');

  try {
    await new Promise((resolve, reject) => {
      const child = spawn(electronBinary, [join(here, 'electron-main.cjs'), jobFile, outFile], {
        stdio: ['ignore', 'pipe', 'pipe']
      });
      let stderr = '';
      child.stderr.on('data', (chunk) => { stderr += chunk; });
      child.on('error', reject);
      child.on('exit', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`harness exited with ${code}\n${stderr}`));
      });
    });

    const raw = JSON.parse(readFileSync(outFile, 'utf8'));
    if (raw.error) throw new Error(`harness page failed: ${raw.error}`);
    return raw.map((entry) => ({
      name: entry.name,
      width: entry.width,
      height: entry.height,
      pixels: decodePixels(entry.pixels)
    }));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
