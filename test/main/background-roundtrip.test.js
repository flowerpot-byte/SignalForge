// SignalForge — build SignalRGB effects from images, gradients, shapes and particles.
// Copyright (C) 2026 Max Leopold Blumenschein
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { serializeProject, parseProject } from '../../src/main/project.js';
import { readEffectDocument } from '../../src/main/effect-document.js';
import { exportEffect } from '../../src/main/export-effect.js';
import { normalizeDocument } from '../../src/engine/document.js';
import { foregroundOf, backgroundOf, withBackgroundKind } from '../../src/engine/slots.js';

/**
 * A document with two layers, all the way out to a file and back.
 *
 * The readers on both ends have always taken however many layers they were
 * given — normalizeDocument walks a list and neither the project file nor the
 * effect's own document block ever knew how long it was. That is a claim about
 * code nobody had exercised with more than one layer written by the app, so it
 * is exercised here: saved and opened, exported and opened, and — the one that
 * would have been the expensive mistake — the SLOTS still meaning what they
 * meant when the file was written.
 */

const RAIN_OVER_A_GRADIENT = normalizeDocument({
  name: 'Regen vor einem Verlauf',
  trail: 40,
  hueCycle: 12,
  layers: [
    {
      id: 'background',
      type: 'gradient',
      shape: 'conic',
      angle: 130,
      bands: 4,
      stops: [{ at: 0, color: '#20106a' }, { at: 100, color: '#0aa3c2' }],
      motions: [{ kind: 'spin', speed: 22, amount: 60 }]
    },
    {
      id: 'fill',
      type: 'particles',
      pattern: 'rain',
      count: 140,
      size: 4,
      speed: 38,
      tilt: -12,
      seed: 7,
      stops: [{ at: 0, color: '#ffffff' }, { at: 100, color: '#9fe8ff' }],
      motions: [{ kind: 'breathe', speed: 10, amount: 25 }]
    }
  ]
}).doc;

/** A filesystem in a Map, the same shape exportEffect's io wants. */
function fakeIo() {
  const files = new Map();
  return {
    files,
    exists: (path) => files.has(path),
    mkdir: () => {},
    writeFile: (path, text) => files.set(path, text),
    writeBinary: (path, bytes) => files.set(path, bytes),
    size: (path) => files.get(path).length
  };
}

async function exported(doc) {
  const io = fakeIo();
  const result = await exportEffect({
    doc, folder: 'F', engineSource: 'window.SignalForgeEngine = {};', io
  });
  assert.equal(result.ok, true, `the export refused: ${result.reason}`);
  return io.files.get(result.path);
}

// ------------------------------------------------------------ a project file

test('a two-layer project reads back exactly what was saved', () => {
  const back = parseProject(serializeProject(RAIN_OVER_A_GRADIENT));
  assert.deepEqual(back.problems, []);
  assert.deepEqual(back.doc, RAIN_OVER_A_GRADIENT);
});

test('and the two slots still mean what they meant when it was written', () => {
  const { doc } = parseProject(serializeProject(RAIN_OVER_A_GRADIENT));
  assert.equal(backgroundOf(doc.layers).id, 'background');
  assert.equal(backgroundOf(doc.layers).shape, 'conic');
  assert.equal(foregroundOf(doc.layers).id, 'fill');
  assert.equal(foregroundOf(doc.layers).pattern, 'rain');
});

test('a project saved with no background opens with none, and gains one cleanly', () => {
  const alone = normalizeDocument({
    name: 'Nur Regen', layers: [{ id: 'fill', type: 'particles' }]
  }).doc;
  const { doc } = parseProject(serializeProject(alone));
  assert.equal(backgroundOf(doc.layers), null, 'every document written before this feature');
  const grown = normalizeDocument({ ...doc, layers: withBackgroundKind(doc.layers, 'solid') }).doc;
  assert.equal(grown.layers.length, 2);
  assert.equal(JSON.stringify(parseProject(serializeProject(grown)).doc), JSON.stringify(grown));
});

// ------------------------------------------------------------- an effect file

test('an exported two-layer effect opens again as the same two layers', async () => {
  const { doc, problems } = readEffectDocument(await exported(RAIN_OVER_A_GRADIENT));
  assert.deepEqual(problems, []);
  assert.equal(doc.layers.length, 2);

  const behind = backgroundOf(doc.layers);
  assert.equal(behind.id, 'background');
  assert.equal(behind.shape, 'conic');
  assert.equal(behind.angle, 130);
  assert.equal(behind.bands, 4);
  assert.deepEqual(behind.motions, [{ kind: 'spin', speed: 22, amount: 60 }]);

  const front = foregroundOf(doc.layers);
  assert.equal(front.id, 'fill');
  assert.equal(front.count, 140);
  assert.equal(front.seed, 7);
  assert.equal(front.tilt, -12);

  assert.equal(doc.trail, 40);
  assert.equal(doc.hueCycle, 12);
});

test('what comes back is what went in, layer for layer', async () => {
  const { doc } = readEffectDocument(await exported(RAIN_OVER_A_GRADIENT));
  // The export's own controls are not part of the document and deliberately do
  // not travel back (they are rebuilt from the document at every export), which
  // is the one difference the reader is allowed to have.
  assert.deepEqual(doc, { ...RAIN_OVER_A_GRADIENT, controls: [] });
});

test('the effect file really carries the background\'s knobs, under their own names', async () => {
  const html = await exported(RAIN_OVER_A_GRADIENT);
  for (const property of ['bgColor1', 'bgColor2', 'bgShape', 'bgAngle', 'bgBands', 'bgMotion',
    'bgTempo', 'bgStrength']) {
    assert.match(html, new RegExp(`<meta property="${property}"`),
      `${property} is missing from the exported panel`);
    // And the bootstrap reads that global back, or the control would be a
    // slider SignalRGB shows and the effect never looks at.
    assert.match(html, new RegExp(`typeof ${property} !== 'undefined'`),
      `${property} is declared but never read`);
  }
});

test('the foreground\'s knobs still address the foreground, not the layer beneath', async () => {
  const html = await exported(RAIN_OVER_A_GRADIENT);
  const document_ = JSON.parse(/type="application\/json">(.*?)<\/script>/s.exec(html)[1]);
  const bindOf = (property) =>
    document_.controls.find((control) => control.property === property).bind[0];

  assert.match(bindOf('particleCount'), /^fill\./);
  assert.match(bindOf('color1'), /^fill\./);
  assert.match(bindOf('bgAngle'), /^background\./);
  assert.match(bindOf('bgColor1'), /^background\./);
  // The whole reason export-effect.js stopped reading layers[0]: it IS the
  // background now, and a control list built from it would have steered the
  // wrong layer with every name the panel shows.
  assert.equal(document_.layers[0].id, 'background');
});
