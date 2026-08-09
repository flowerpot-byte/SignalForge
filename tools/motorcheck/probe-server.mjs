// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
//
// A throwaway loopback server for the motorcheck.
//
// Effects cannot read a sibling file — Chromium blocks local file reads from a
// file:// page, measured on the real host. This checks the one remaining route
// for feeding an effect live data: a tiny HTTP server on localhost that
// explicitly allows the request. If an effect can reach this, real
// synchronisation (wallpaper, audio, sensors) becomes possible. If not, a
// recorded loop is the ceiling.
//
//   node tools/motorcheck/probe-server.mjs
//
// Serves only 127.0.0.1, only a fixed constant string, and nothing else.

import { createServer } from 'node:http';

export const PROBE_PORT = 47821;

const server = createServer((request, response) => {
  response.writeHead(200, {
    'Content-Type': 'text/plain',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store'
  });
  response.end('LIVE-HTTP-OK ' + new Date().toISOString() + '\n');
});

server.listen(PROBE_PORT, '127.0.0.1', () => {
  console.log(`probe server listening on http://127.0.0.1:${PROBE_PORT}/`);
  console.log('Select "ZZ 4 Motorcheck" in SignalRGB, then stop this with Ctrl+C.');
});
