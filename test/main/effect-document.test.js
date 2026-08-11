// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readEffectDocument, effectDocumentJson, looksLikeEffect } from '../../src/main/effect-document.js';
import { exportEffect } from '../../src/main/export-effect.js';
import { buildEffectHtml, DOCUMENT_SCRIPT_ID } from '../../src/export/build-effect.js';
import { normalizeDocument, DOCUMENT_VERSION } from '../../src/engine/document.js';

/**
 * Can an effect that has already been exported be opened again?
 *
 * The whole effect library rests on the answer being yes, and the answer is yes
 * for one reason: an exported effect carries its own normalized document inside
 * itself, because that is what the effect itself renders from. So this file
 * checks the round trip the library actually makes — a REAL export, written by
 * the real exportEffect, read back by the real reader — rather than a document
 * hand-fed to the reader, which would prove nothing about the two ends agreeing.
 *
 * And it checks the refusals just as hard, because the file being read is a
 * foreign one: it came out of a folder other programs write into.
 */

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

/**
 * An effect file nobody's builder wrote: the block, with whatever is put in it.
 * For the cases that cannot arise from an export and therefore say something
 * about a file somebody made by hand.
 */
const handMade = (document_) =>
  `<head></head><script id="${DOCUMENT_SCRIPT_ID}" type="application/json">`
  + `${JSON.stringify(document_)}</script>`;

/** A 1x1 PNG, so an effect with a real embedded picture can be round-tripped. */
const PIXEL = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

/** Export a document for real and hand back the text that was written. */
async function exported(doc) {
  const io = fakeIo();
  const result = await exportEffect({
    doc,
    folder: 'F',
    // Not the real bundle: this file is about the document block, not about the
    // engine, and a stand-in keeps the test fast and the failure readable.
    engineSource: 'window.SignalForgeEngine = {};',
    io
  });
  assert.equal(result.ok, true, `the export refused: ${result.reason}`);
  return { html: io.files.get(result.path), result };
}

const GRADIENT = {
  name: 'Verlauf',
  brightness: 120,
  saturation: 90,
  greenMagenta: -12,
  blueYellow: 7,
  layers: [{
    id: 'fill',
    type: 'gradient',
    shape: 'radial',
    angle: 210,
    stops: [{ at: 0, color: '#112233' }, { at: 60, color: '#445566' }],
    motions: [{ kind: 'breathe', speed: 33, amount: 44 }]
  }]
};

const PICTURE = {
  name: 'Bergabend',
  layers: [{
    id: 'a1', type: 'image', asset: 'picture', fit: 'contain',
    offset: { x: 0.4, y: -0.25 }, motions: [{ kind: 'drift', speed: 20, amount: 30 }]
  }],
  assets: { picture: { kind: 'image', mime: 'image/png', data: PIXEL } }
};

// ------------------------------------------------------------- it comes back

test('an effect that was exported can be read back into a document', async () => {
  const { html } = await exported(GRADIENT);
  const { doc, problems } = readEffectDocument(html);

  assert.deepEqual(problems, [], 'a document this app wrote needs no repairing on the way back');
  assert.equal(doc.name, 'Verlauf');
  assert.equal(doc.brightness, 120);
  assert.equal(doc.saturation, 90);
  assert.equal(doc.greenMagenta, -12);
  assert.equal(doc.blueYellow, 7);
  assert.equal(doc.layers.length, 1);
  assert.equal(doc.layers[0].type, 'gradient');
  assert.equal(doc.layers[0].shape, 'radial');
  assert.equal(doc.layers[0].angle, 210);
  assert.deepEqual(doc.layers[0].stops, [{ at: 0, color: '#112233' }, { at: 60, color: '#445566' }]);
  assert.deepEqual(doc.layers[0].motions, [{ kind: 'breathe', speed: 33, amount: 44 }]);
});

test('the picture comes back with it, bytes and all', async () => {
  const { html } = await exported(PICTURE);
  const { doc } = readEffectDocument(html);
  assert.equal(doc.assets.picture.data, PIXEL, 'the embedded picture is the whole reason it is reopenable');
  assert.equal(doc.assets.picture.mime, 'image/png');
  assert.deepEqual(doc.layers[0].offset, { x: 0.4, y: -0.25 }, 'and the crop it was left at');
  assert.equal(doc.layers[0].fit, 'contain');
});

/**
 * The one claim everything else rests on: what comes back is the document that
 * went in, not an approximation of it — every field, compared in one go against
 * the engine's own normalisation of the original.
 *
 * The two deliberate differences are named rather than glossed over. `controls`
 * is a build artefact the export makes and the reader drops (see
 * src/main/effect-document.js); `motions` gains an inert entry when the layer
 * had none, because the export bakes one in so its controls have somewhere to
 * write (withLiveMotion). Both are stated here, so that a THIRD difference
 * appearing one day fails this test instead of being absorbed by it.
 */
test('what comes back is the document that went in, field for field', async () => {
  const { html } = await exported(GRADIENT);
  const { doc } = readEffectDocument(html);
  const original = normalizeDocument(GRADIENT).doc;

  assert.deepEqual(doc, { ...original, controls: [] });
  assert.equal(doc.version, DOCUMENT_VERSION);
});

test('the export\'s own controls do not travel back into the document', async () => {
  const { html } = await exported(GRADIENT);
  // The file really does carry them — otherwise this would pass for the wrong
  // reason, on an export that never wrote any.
  const inFile = JSON.parse(effectDocumentJson(html));
  assert.ok(inFile.controls.length > 0, 'the exported file must carry the controls it offers SignalRGB');

  const { doc } = readEffectDocument(html);
  assert.deepEqual(doc.controls, [], 'they are rebuilt by the next export and are not the user\'s work');
});

test('a layer that had no motion comes back with the inert entry the export bakes in', async () => {
  const { html } = await exported({ ...GRADIENT, layers: [{ ...GRADIENT.layers[0], motions: [] }] });
  const { doc } = readEffectDocument(html);
  assert.equal(doc.layers[0].motions.length, 1);
  assert.equal(doc.layers[0].motions[0].kind, 'none',
    'an entry that changes no pixel, and that the settings column can then set to something');
});

/**
 * The escaping claim, which is what makes finding the block again exact rather
 * than hopeful: build-effect.js turns every `</` inside the JSON into `<\/`, so
 * a document carrying a literal `</script>` in its own name cannot end the
 * block early. Take that replacement out and this is the test that goes red.
 */
test('a document that contains "</script>" in its own text still comes back whole', async () => {
  const nasty = '</script><script>alert(1)</script>';
  const { html } = await exported({ ...GRADIENT, name: nasty, description: `x ${nasty} y` });

  assert.ok(!html.includes(`${nasty}</script>`), 'the raw text must not appear unescaped in the block');
  const { doc } = readEffectDocument(html);
  assert.equal(doc.name, nasty);
  assert.equal(doc.description, `x ${nasty} y`);
});

// ------------------------------------------------------------- and it refuses

test('a file that is not one of ours is refused, and says so in a sentence', () => {
  const foreign = '<html><head><title>Somebody else\'s effect</title></head>'
    + '<body><canvas id="exCanvas"></canvas><script>rainbow()</script></body></html>';
  assert.equal(looksLikeEffect(foreign), false);
  assert.throws(() => readEffectDocument(foreign), (error) => {
    assert.match(error.message, /not a SignalForge effect/i);
    return true;
  });
});

test('an empty file, and no file at all, are refused the same way', () => {
  for (const input of ['', '   ', null, undefined]) {
    assert.equal(looksLikeEffect(input), false);
    assert.throws(() => readEffectDocument(input), /not a SignalForge effect/i);
  }
});

test('a block that was never closed is not a document', async () => {
  const { html } = await exported(GRADIENT);
  const truncated = html.slice(0, html.indexOf('</script>', html.indexOf(DOCUMENT_SCRIPT_ID)));
  assert.equal(looksLikeEffect(truncated), false);
  assert.throws(() => readEffectDocument(truncated), /not a SignalForge effect/i);
});

test('a document block that is not JSON is refused with its own sentence', async () => {
  const { html } = await exported(GRADIENT);
  const json = effectDocumentJson(html);
  const damaged = html.replace(json, json.slice(0, Math.floor(json.length / 2)));
  assert.equal(looksLikeEffect(damaged), true, 'it still LOOKS like one — that is the point of this case');
  assert.throws(() => readEffectDocument(damaged), /could not be read/i);
});

/**
 * The security case, and the reason this reader has no validator of its own:
 * the rule that an opened file's pictures must be embedded lives in
 * project.js's documentFromFile, and an effect goes through it exactly as a
 * project does. An asset naming a `file` would have the renderer's image loader
 * resolve an attacker-chosen path the moment the tile was pressed.
 */
test('an effect whose picture names a file instead of carrying it is refused', () => {
  const smuggled = buildEffectHtml({
    doc: {
      name: 'Trap',
      layers: [{ id: 'a1', type: 'image', asset: 'picture', motions: [] }],
      assets: { picture: { kind: 'image', mime: 'image/png', file: '//attacker/share/x.png' } }
    },
    engineSource: 'window.SignalForgeEngine = {};'
  });
  assert.throws(() => readEffectDocument(smuggled), (error) => {
    assert.match(error.message, /not embedded/i);
    return true;
  });
});

test('a picture smuggled in BESIDE the bytes is refused too', () => {
  // Written by hand rather than built, and that is the whole point of the case:
  // this app's own builder can never produce it (normalizeDocument prefers
  // `data` and drops `file` on the way OUT), so the only way such a file exists
  // is that somebody wrote it — which is exactly the file this reader is
  // looking at. normalizeAsset would drop the `file` again on the way IN and
  // hide the smuggled string from everything downstream, so it has to be
  // refused BEFORE normalising, and it is.
  const smuggled = handMade({
    version: 1,
    name: 'Trap',
    layers: [{ id: 'a1', type: 'image', asset: 'picture', motions: [] }],
    assets: { picture: { kind: 'image', mime: 'image/png', data: PIXEL, file: '//attacker/share/x.png' } }
  });
  assert.throws(() => readEffectDocument(smuggled), /not embedded/i);
});

test('gibberish that happens to be JSON is refused rather than opened as an empty stage', () => {
  for (const junk of ['{}', '[]', 'null', '42', '"hello"', '{"layers":[]}', '{"version":1,"layers":[]}']) {
    const html = `<head></head><script id="${DOCUMENT_SCRIPT_ID}" type="application/json">${junk}</script>`;
    assert.throws(
      () => readEffectDocument(html),
      /not a SignalForge effect|nothing in it to edit/i,
      `${junk} must not become a document`
    );
  }
});

test('an effect from a newer SignalForge is turned down, not half-read', () => {
  const html = `<head></head><script id="${DOCUMENT_SCRIPT_ID}" type="application/json">`
    + `{"version":${DOCUMENT_VERSION + 1},"layers":[{"id":"fill","type":"solid"}]}</script>`;
  assert.throws(() => readEffectDocument(html), (error) => {
    assert.match(error.message, /newer version of SignalForge/i);
    return true;
  });
});

test('an effect the reader refuses hands back nothing at all', () => {
  // The caller's guarantee, made explicit: every refusal is a throw, so there
  // is no half-read document for a caller to accidentally put on screen.
  const foreign = '<html><body>not ours</body></html>';
  let out = 'untouched';
  try {
    out = readEffectDocument(foreign);
  } catch {
    // as it should
  }
  assert.equal(out, 'untouched');
});
