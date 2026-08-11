// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runJobs } from '../harness/render.js';
import { pixelAt, isColour, meanBrightness, maxDifference } from '../harness/pixels.js';
import { effectControls, withLiveMotion, CONTROL_RANGES } from '../../src/export/effect-controls.js';
import {
  normalizeDocument, GRADIENT_SHAPES, SOLID_MOTION_KINDS, GRADIENT_MOTION_KINDS, CANVAS_WIDTH,
  MAX_BANDS, DEFAULT_BANDS
} from '../../src/engine/document.js';
import { resolveBindingPath } from '../../src/engine/bind.js';
import { exportEffect } from '../../src/main/export-effect.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const cli = join(root, 'bin', 'sfexport.js');

const docWith = (layer) => normalizeDocument({ name: 'Controls', layers: [{ id: 'a1', ...layer }] }).doc;

// ------------------------------------------------------------- the controls

test('a solid effect offers its colour, the motions it can perform, and the document colours', () => {
  const doc = withLiveMotion(docWith({ type: 'solid' }), 'a1');
  assert.deepEqual(
    effectControls(doc, 'a1').map((control) => control.property),
    ['color', 'motion', 'tempo', 'strength', 'brightness', 'saturation', 'greenMagenta', 'blueYellow']
  );
});

test('a solid effect never offers a motion a flat colour cannot perform', () => {
  const doc = withLiveMotion(docWith({ type: 'solid' }), 'a1');
  const motion = effectControls(doc, 'a1').find((control) => control.property === 'motion');
  assert.deepEqual(motion.values, [...SOLID_MOTION_KINDS]);
});

test('a solid layer that carries a warp anyway keeps it: the offer widens, the value stands', () => {
  const doc = docWith({ type: 'solid', motions: [{ kind: 'warp' }] });
  const motion = effectControls(doc, 'a1').find((control) => control.property === 'motion');
  assert.equal(motion.default, 'warp');
  assert.ok(motion.values.includes('warp'), 'a default outside its own options is not a choice');
});

test('a gradient effect offers one colour per stop, the shape, the angle and the motions', () => {
  const doc = withLiveMotion(docWith({
    type: 'gradient',
    stops: [{ at: 0, color: '#111111' }, { at: 50, color: '#222222' }, { at: 100, color: '#333333' }]
  }), 'a1');
  assert.deepEqual(
    effectControls(doc, 'a1').map((control) => control.property),
    ['color1', 'color2', 'color3', 'shape', 'angle', 'bands', 'motion', 'tempo', 'strength',
      'brightness', 'saturation', 'greenMagenta', 'blueYellow']
  );
});

test('the shape dropdown offers exactly the engine\'s own list', () => {
  const doc = docWith({ type: 'gradient' });
  const shape = effectControls(doc, 'a1').find((control) => control.property === 'shape');
  assert.deepEqual(shape.values, [...GRADIENT_SHAPES]);
});

test('the colour controls carry the document\'s own colours as their defaults', () => {
  const doc = docWith({ type: 'gradient', stops: [{ at: 0, color: '#abcdef' }, { at: 100, color: '#012345' }] });
  const controls = effectControls(doc, 'a1');
  assert.equal(controls.find((c) => c.property === 'color1').default, '#abcdef');
  assert.equal(controls.find((c) => c.property === 'color2').default, '#012345');
  assert.equal(controls.find((c) => c.property === 'color1').type, 'color');
});

test('the angle slider spans exactly what normalizeDocument keeps', () => {
  const control = effectControls(docWith({ type: 'gradient' }), 'a1')
    .find((entry) => entry.property === 'angle');
  assert.equal(control.min, CONTROL_RANGES.angle.min);
  assert.equal(control.max, CONTROL_RANGES.angle.max);
  for (const value of [control.min, control.max]) {
    const probe = normalizeDocument({ layers: [{ id: 'a1', type: 'gradient', angle: value }] }).doc;
    assert.equal(probe.layers[0].angle, value, `angle ${value} does not survive normalizeDocument`);
  }
});

test('every label of a colour effect is ASCII only, in both languages', () => {
  const ascii = /^[\x20-\x7E]*$/;
  for (const doc of [withLiveMotion(docWith({ type: 'solid' }), 'a1'),
    withLiveMotion(docWith({ type: 'gradient' }), 'a1')]) {
    for (const control of effectControls(doc, 'a1')) {
      for (const lang of ['de', 'en']) {
        assert.ok(ascii.test(control.label[lang]), `${control.property} (${lang}): ${control.label[lang]}`);
      }
    }
  }
});

test('every binding of a colour effect resolves, so no control is dead on arrival', () => {
  for (const doc of [withLiveMotion(docWith({ type: 'solid' }), 'a1'),
    withLiveMotion(docWith({ type: 'gradient' }), 'a1')]) {
    for (const control of effectControls(doc, 'a1')) {
      for (const binding of control.bind) {
        assert.ok(resolveBindingPath(doc, binding), `${control.property} binds to nothing: ${binding}`);
      }
    }
  }
});

test('a layer with no motions still gets live motion controls, whatever its type', () => {
  for (const type of ['solid', 'gradient']) {
    const doc = withLiveMotion(docWith({ type }), 'a1');
    assert.equal(doc.layers[0].motions.length, 1, `${type}: nothing to bind to`);
    assert.equal(doc.layers[0].motions[0].kind, 'none');
  }
});

// ---------------------------------------------------- the app's own export

test('the app\'s export button writes a colour effect through the same shared list', async () => {
  const written = new Map();
  const result = await exportEffect({
    doc: { name: 'Just Blue', layers: [{ id: 'a1', type: 'solid', color: '#0000ff' }] },
    folder: 'F',
    engineSource: 'window.SignalForgeEngine = {};',
    io: {
      exists: () => false,
      mkdir: () => {},
      writeFile: (path, text) => written.set(path, text),
      writeBinary: (path, bytes) => written.set(path, bytes),
      size: () => 1
    }
  });
  assert.equal(result.ok, true, `a document with no picture must still export: ${result.reason}`);
  const html = [...written.values()][0];
  assert.match(html, /<meta property="color" label="Colour" type="color" default="#0000ff" \/>/);
  assert.ok(html.includes('typeof color'), 'the bootstrap must read the colour global every frame');
});

// ------------------------------------------------- the whole way, for real

test('the command line builds, and Chromium runs, an effect with no picture in it', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'signalforge-nopicture-'));
  try {
    execFileSync(process.execPath, [cli, '--solid', '#3366cc', '--name', 'Flat', '--out', dir],
      { encoding: 'utf8', cwd: root });
    execFileSync(process.execPath, [cli, '--gradient', '#ff0000,#0000ff', '--name', 'Ramp', '--out', dir],
      { encoding: 'utf8', cwd: root });
    execFileSync(process.execPath, [cli, '--gradient', '#ff0000,#0000ff', '--shape', 'radial',
      '--name', 'Still Rings', '--motion', 'none', '--out', dir], { encoding: 'utf8', cwd: root });
    execFileSync(process.execPath, [cli, '--gradient', '#ff0000,#0000ff', '--shape', 'radial',
      '--name', 'Rings', '--motion', 'drift', '--out', dir], { encoding: 'utf8', cwd: root });

    // Not one byte of image data anywhere in a picture-less effect.
    const flat = readFileSync(join(dir, 'Flat.html'), 'utf8');
    assert.ok(!flat.includes('data:image'), 'a colour effect must embed no picture');
    assert.match(flat, /"assets":\s*\{\}/);

    const [still, ramp, stillRings, rings, ringsLater] = await runJobs([
      { name: 'flat', kind: 'html', file: join(dir, 'Flat.html'), settleMs: 120 },
      { name: 'ramp', kind: 'html', file: join(dir, 'Ramp.html'), settleMs: 120 },
      { name: 'still-rings', kind: 'html', file: join(dir, 'Still Rings.html'), settleMs: 120 },
      // The same file twice, with the SAME control values set both times and
      // only the elapsed time different. A hidden window stops ticking
      // requestAnimationFrame after the first frame or two (see
      // test/harness/electron-main.cjs), so the second reading is taken by
      // calling the effect's own `update` again after a wait — which is the
      // one thing that makes "it is animating" a measurement rather than a
      // hope. Setting the two motion sliders to full in both frames is not
      // what is being tested; it is what makes a second and a half of drift
      // large enough to see instead of a pixel and a half.
      { name: 'rings', kind: 'html', file: join(dir, 'Rings.html'), settleMs: 60,
        setGlobals: { tempo: 100, strength: 100 }, afterSetGlobalsMs: 30 },
      { name: 'rings-later', kind: 'html', file: join(dir, 'Rings.html'), settleMs: 1500,
        setGlobals: { tempo: 100, strength: 100 }, afterSetGlobalsMs: 30 }
    ]);

    // The solid one, exactly the colour that was asked for.
    assert.ok(isColour(pixelAt(still.pixels, CANVAS_WIDTH, 12, 12), [0x33, 0x66, 0xcc], 3));
    assert.ok(isColour(pixelAt(still.pixels, CANVAS_WIDTH, 300, 180), [0x33, 0x66, 0xcc], 3));

    // The linear one, red on the left and blue on the right.
    assert.ok(isColour(pixelAt(ramp.pixels, CANVAS_WIDTH, 2, 100), [255, 0, 0], 14));
    assert.ok(isColour(pixelAt(ramp.pixels, CANVAS_WIDTH, 317, 100), [0, 0, 255], 14));

    // The radial one, red in the middle and blue at the corners. Read off the
    // motionless copy, deliberately: the drifting one below has been told to
    // move its centre as far as it can, so "red in the middle" is exactly what
    // it must NOT be by then.
    assert.ok(isColour(pixelAt(stillRings.pixels, CANVAS_WIDTH, 160, 100), [255, 0, 0], 20));
    const corner = pixelAt(stillRings.pixels, CANVAS_WIDTH, 2, 2);
    assert.ok(corner.b > corner.r, `the corner must have reached the far colour: ${JSON.stringify(corner)}`);

    // And the drifting one is genuinely animating: the same file, the same
    // control values, two points of its own clock.
    assert.ok(meanBrightness(rings.pixels) > 5, 'the effect never drew anything');
    assert.ok(maxDifference(rings.pixels, ringsLater.pixels) > 10,
      'the exported effect is not animating in the window');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the command line refuses a colour it does not understand instead of inventing one', () => {
  const dir = mkdtempSync(join(tmpdir(), 'signalforge-nopicture-'));
  try {
    assert.throws(
      () => execFileSync(process.execPath, [cli, '--solid', 'blueish', '--name', 'X', '--out', dir],
        { encoding: 'utf8', cwd: root, stdio: 'pipe' }),
      (error) => /is not a colour/.test(String(error.stderr))
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the command line insists on a name when there is no file to take one from', () => {
  const dir = mkdtempSync(join(tmpdir(), 'signalforge-nopicture-'));
  try {
    assert.throws(
      () => execFileSync(process.execPath, [cli, '--solid', '#ffffff', '--out', dir],
        { encoding: 'utf8', cwd: root, stdio: 'pipe' }),
      (error) => /--name is required/.test(String(error.stderr))
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the command line refuses two sources at once rather than quietly picking one', () => {
  const dir = mkdtempSync(join(tmpdir(), 'signalforge-nopicture-'));
  try {
    assert.throws(
      () => execFileSync(process.execPath,
        [cli, '--solid', '#ffffff', '--gradient', '#000000,#ffffff', '--name', 'X', '--out', dir],
        { encoding: 'utf8', cwd: root, stdio: 'pipe' }),
      (error) => /exactly one of/.test(String(error.stderr))
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the command line refuses a motion a flat colour cannot perform', () => {
  const dir = mkdtempSync(join(tmpdir(), 'signalforge-nopicture-'));
  try {
    // The one entrance that could still bake a control the window forbids: a
    // Motion dropdown in somebody's SignalRGB panel offering an option that
    // provably cannot change a pixel.
    for (const kind of ['drift', 'warp']) {
      assert.throws(
        () => execFileSync(process.execPath,
          [cli, '--solid', '#ff0066', '--motion', kind, '--name', 'X', '--out', dir],
          { encoding: 'utf8', cwd: root, stdio: 'pipe' }),
        (error) => new RegExp(`--motion ${kind} is not offered on a flat colour`).test(String(error.stderr))
          && new RegExp(`expected ${SOLID_MOTION_KINDS.join('\\|')}`).test(String(error.stderr)),
        `--solid --motion ${kind} must be refused, naming what a flat colour IS offered`
      );
    }
    // And the two it CAN perform still go through, so this is a narrowing and
    // not a wall.
    for (const kind of SOLID_MOTION_KINDS) {
      execFileSync(process.execPath,
        [cli, '--solid', '#ff0066', '--motion', kind, '--name', `Ok ${kind}`, '--out', dir],
        { encoding: 'utf8', cwd: root });
    }
    // A gradient is not narrowed at all: it is the one layer type offered every
    // motion there is, spin included — which the refusal above used to withhold
    // from it, because it judged everything that was not a flat colour by the
    // picture's list.
    // Two of the six rather than all six: every one of these launches an
    // Electron to draw its tile picture, and what is in question is the LIST
    // being consulted, not each entry of it. `spin` is the entry that proves
    // it, being in the gradient's list and in neither of the other two.
    for (const kind of ['drift', 'spin']) {
      assert.ok(GRADIENT_MOTION_KINDS.includes(kind), `${kind} must be a motion a gradient is offered`);
      execFileSync(process.execPath, [cli, '--gradient', '#ff0000,#0000ff', '--motion', kind,
        '--name', `Ramp ${kind}`, '--out', dir], { encoding: 'utf8', cwd: root });
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the command line can say how many bands, and the engine still decides the limits', () => {
  const dir = mkdtempSync(join(tmpdir(), 'signalforge-nopicture-'));
  try {
    // A count the engine has to bring back into range, so this proves both that
    // --bands arrives AND that it goes through the one clamp there is
    // (normalizeDocument) rather than through a second copy of the limits here.
    execFileSync(process.execPath, [cli, '--gradient', '#ff0000,#0000ff', '--shape', 'stripes',
      '--bands', '99', '--name', 'Many Bands', '--out', dir], { encoding: 'utf8', cwd: root });
    const html = readFileSync(join(dir, 'Many Bands.html'), 'utf8');
    assert.match(html, new RegExp(`"bands":\\s*${MAX_BANDS}\\b`),
      `--bands 99 must arrive as the engine's ceiling of ${MAX_BANDS}`);

    // And a gradient that was never told costs nobody a decision: the default
    // is the engine's, not a number the command line keeps of its own.
    execFileSync(process.execPath, [cli, '--gradient', '#ff0000,#0000ff', '--shape', 'waves',
      '--name', 'Default Bands', '--out', dir], { encoding: 'utf8', cwd: root });
    assert.match(readFileSync(join(dir, 'Default Bands.html'), 'utf8'),
      new RegExp(`"bands":\\s*${DEFAULT_BANDS}\\b`));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a band count that is not a number is refused by name instead of becoming one', () => {
  const dir = mkdtempSync(join(tmpdir(), 'signalforge-nopicture-'));
  try {
    assert.throws(
      () => execFileSync(process.execPath, [cli, '--gradient', '#ff0000,#0000ff',
        '--bands', 'lots', '--name', 'X', '--out', dir],
      { encoding: 'utf8', cwd: root, stdio: 'pipe' }),
      (error) => /--bands needs a number of repeats/.test(String(error.stderr))
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a gradient of one colour is refused, because a ramp needs somewhere to go', () => {
  const dir = mkdtempSync(join(tmpdir(), 'signalforge-nopicture-'));
  try {
    assert.throws(
      () => execFileSync(process.execPath, [cli, '--gradient', '#ffffff', '--name', 'X', '--out', dir],
        { encoding: 'utf8', cwd: root, stdio: 'pipe' }),
      (error) => /between 2 and 4 colours/.test(String(error.stderr))
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
