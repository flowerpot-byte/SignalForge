// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import * as os from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { decodePixels } from './pixels.js';

const here = dirname(fileURLToPath(import.meta.url));
const electronBinary = createRequire(import.meta.url)('electron');

// Electron's first launch on a cold machine can take several seconds; keep
// this generous so a slow-but-working run never looks like a hang.
const DEFAULT_TIMEOUT_MS = 60_000;

/**
 * Render a batch of jobs in one Electron launch and return their pixels.
 *
 * Batching matters: starting Electron costs a second or two, running a job
 * costs milliseconds. Always pass every job a test needs in one call.
 */
export async function runJobs(jobs, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const dir = mkdtempSync(join(os.tmpdir(), 'signalforge-harness-'));
  const jobFile = join(dir, 'jobs.json');
  const outFile = join(dir, 'out.json');
  writeFileSync(jobFile, JSON.stringify({ jobs }), 'utf8');

  try {
    await new Promise((resolve, reject) => {
      const child = spawn(electronBinary, [join(here, 'electron-main.cjs'), jobFile, outFile], {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      // The machine's owner may be using it for other work while these
      // (software-rendered, CPU-heavy) tests run. Yield to the foreground.
      // Correctness must never depend on this succeeding.
      try {
        os.setPriority(child.pid, os.constants.priority.PRIORITY_BELOW_NORMAL);
      } catch {
        // Best effort only.
      }

      let stderr = '';
      let settled = false;

      // Both stdout and stderr must be drained: an unread pipe fills its OS
      // buffer and blocks the child's next write, which looks like a hang.
      child.stdout.on('data', () => {});
      child.stderr.on('data', (chunk) => { stderr += chunk; });

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        child.kill();
        reject(new Error(`harness timed out after ${timeoutMs}ms\n${stderr}`));
      }, timeoutMs);

      child.on('error', (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
      });

      // 'close' (not 'exit') waits for stdio to finish draining, so stderr
      // above is guaranteed complete by the time we read it here.
      child.on('close', (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (code === 0) {
          resolve();
          return;
        }

        // electron-main.cjs writes the real error into outFile before
        // exiting non-zero. Surface that instead of the bare exit code.
        if (existsSync(outFile)) {
          try {
            const raw = JSON.parse(readFileSync(outFile, 'utf8'));
            if (raw && raw.error) {
              reject(new Error(`harness exited with ${code}: ${raw.error}`));
              return;
            }
          } catch {
            // outFile wasn't valid JSON (partial write); fall through.
          }
        }
        reject(new Error(`harness exited with ${code}\n${stderr}`));
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
