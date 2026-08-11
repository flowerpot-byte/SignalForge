// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// build/icon.png is a committed artefact: `npm run dist` reads it, nothing in
// the test run rebuilds it, and a fortnight can pass between somebody touching
// tools/icon/build-icon.mjs and anybody seeing the result. So the file itself
// is checked here rather than the script that writes it.
//
// The bug this exists for: the icon draws a rounded square, and the four
// corners outside its radius came out opaque white. capturePage() photographs
// the WINDOW, and an Electron window's background is white by default, so the
// one part of the picture the SVG deliberately leaves unpainted was filled in
// by the compositor. Against this project's own dark backgrounds -- which is
// where every preview of the icon was ever looked at -- a white corner is
// invisible; in SignalRGB's light effect list it is the first thing you see.
//
// Which is why this reads the alpha byte instead of looking at a picture.
const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const ICON = join(ROOT, 'build', 'icon.png');

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

/**
 * The smallest PNG reader that can answer "what is the alpha here".
 *
 * `dependencies` stays empty in this project, so there is no image library to
 * reach for, and decoding a 512 x 512 truecolour-with-alpha PNG is four
 * filter types and an inflate. Anything else in the format (a bit depth other
 * than 8, a palette, greyscale, Adam7 interlacing) throws rather than being
 * guessed at: the file is written by one known tool, and a file that stopped
 * being that shape is itself worth failing on.
 */
function decodePng(buffer) {
  assert.ok(buffer.subarray(0, 8).equals(PNG_SIGNATURE), 'not a PNG');

  let header = null;
  const idat = [];
  let at = 8;
  while (at < buffer.length) {
    const length = buffer.readUInt32BE(at);
    const type = buffer.toString('ascii', at + 4, at + 8);
    const data = buffer.subarray(at + 8, at + 8 + length);
    if (type === 'IHDR') {
      header = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        depth: data[8],
        colorType: data[9],
        interlace: data[12]
      };
    } else if (type === 'IDAT') {
      idat.push(data);
    }
    at += 12 + length;
  }

  assert.ok(header, 'the PNG has no header chunk');
  assert.equal(header.depth, 8, 'only 8-bit samples are decoded here');
  assert.equal(header.colorType, 6, 'only truecolour with alpha is decoded here');
  assert.equal(header.interlace, 0, 'only non-interlaced images are decoded here');

  const { width, height } = header;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * 4;
  const pixels = Buffer.alloc(height * stride);

  // Un-filter, row by row. Every byte is 4 back for its left neighbour (one
  // whole RGBA pixel), and one row up for its upper one.
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x += 1) {
      const left = x >= 4 ? pixels[y * stride + x - 4] : 0;
      const up = y > 0 ? pixels[(y - 1) * stride + x] : 0;
      const upLeft = y > 0 && x >= 4 ? pixels[(y - 1) * stride + x - 4] : 0;
      let value = line[x];
      if (filter === 1) value += left;
      else if (filter === 2) value += up;
      else if (filter === 3) value += (left + up) >> 1;
      else if (filter === 4) {
        // Paeth: pick whichever neighbour the gradient predictor lands nearest.
        const p = left + up - upLeft;
        const dLeft = Math.abs(p - left);
        const dUp = Math.abs(p - up);
        const dUpLeft = Math.abs(p - upLeft);
        value += (dLeft <= dUp && dLeft <= dUpLeft) ? left : (dUp <= dUpLeft ? up : upLeft);
      } else if (filter !== 0) {
        throw new Error(`unknown PNG filter type ${filter} on row ${y}`);
      }
      pixels[y * stride + x] = value & 0xff;
    }
  }

  return {
    width,
    height,
    at(x, y) {
      const i = y * stride + x * 4;
      return { r: pixels[i], g: pixels[i + 1], b: pixels[i + 2], a: pixels[i + 3] };
    }
  };
}

test('the application icon has fully transparent corners, and is not simply an empty square', () => {
  const icon = decodePng(readFileSync(ICON));
  assert.equal(icon.width, 512);
  assert.equal(icon.height, 512);

  const { width: w, height: h } = icon;
  // The corner pixel itself, plus one a few pixels along each edge from it: a
  // corner radius that had collapsed to almost nothing would still leave the
  // very corner clear while the rest of the curve was filled in.
  const probes = [];
  for (const [x, y] of [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]]) {
    probes.push([x, y], [x === 0 ? 4 : w - 5, y], [x, y === 0 ? 4 : h - 5]);
  }

  for (const [x, y] of probes) {
    const pixel = icon.at(x, y);
    assert.equal(pixel.a, 0, `${x},${y} must be fully transparent, got ${JSON.stringify(pixel)}`);
  }

  // A file of nothing but transparency would satisfy every line above, so the
  // mark has to be shown to still be there.
  const middle = icon.at(w >> 1, h >> 1);
  assert.equal(middle.a, 255, `the middle of the icon must be opaque, got ${JSON.stringify(middle)}`);
  assert.ok(middle.r + middle.g + middle.b > 60, 'the middle of the icon must not be black');
});
