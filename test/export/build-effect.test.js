// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max Leopold Blumenschein
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildEffectHtml } from '../../src/export/build-effect.js';

const ENGINE = 'window.SignalForgeEngine = {};';

const doc = {
  name: 'Bergabend',
  description: 'Evening in the mountains',
  publisher: 'Max',
  layers: [{ id: 'a1', type: 'image', asset: 'q', motion: { kind: 'warp', speed: 15, amount: 30 } }],
  controls: [
    { property: 'tempo', label: { de: 'Tempo', en: 'Speed' }, type: 'number', min: 1, max: 100, default: 15, bind: ['a1.motion.speed'] },
    { property: 'style', label: { de: 'Modus', en: 'Mode' }, type: 'combobox', values: ['Warp', 'Still'], default: 'Warp', bind: [] }
  ],
  assets: { q: { kind: 'image', mime: 'image/png', data: 'AAAA' } }
};

test('head carries title, description, publisher and the canvas', () => {
  const html = buildEffectHtml({ doc, engineSource: ENGINE, lang: 'de' });
  assert.match(html, /<title>Bergabend<\/title>/);
  assert.match(html, /<meta description="Evening in the mountains"/);
  assert.match(html, /<meta publisher="Max"/);
  assert.match(html, /<canvas id="exCanvas" width="320" height="200">/);
});

test('controls become SignalRGB meta tags in the chosen language', () => {
  const de = buildEffectHtml({ doc, engineSource: ENGINE, lang: 'de' });
  assert.match(de, /<meta property="tempo" label="Tempo" type="number" min="1" max="100" default="15"/);
  const en = buildEffectHtml({ doc, engineSource: ENGINE, lang: 'en' });
  assert.match(en, /label="Speed"/);
});

test('combobox controls carry their values list', () => {
  const html = buildEffectHtml({ doc, engineSource: ENGINE, lang: 'en' });
  assert.match(html, /<meta property="style" label="Mode" type="combobox" values="Warp,Still" default="Warp"/);
});

test('non-ASCII labels are rejected loudly instead of shipping broken', () => {
  const bad = structuredClone(doc);
  bad.controls[0].label.de = 'Stärke';
  assert.throws(() => buildEffectHtml({ doc: bad, engineSource: ENGINE, lang: 'de' }), /ASCII/);
});

test('the engine bundle and the document are both embedded', () => {
  const html = buildEffectHtml({ doc, engineSource: ENGINE, lang: 'de' });
  assert.ok(html.includes(ENGINE));
  assert.match(html, /id="sf-document" type="application\/json"/);
  assert.ok(html.includes('"Bergabend"'));
});

test('a closing script tag inside the document cannot break out of the json block', () => {
  const nasty = structuredClone(doc);
  nasty.description = 'oops </script><script>alert(1)</script>';
  const html = buildEffectHtml({ doc: nasty, engineSource: ENGINE, lang: 'de' });
  assert.ok(!html.includes('</script><script>alert(1)'));
  assert.ok(html.includes('<\\/script>'));
});

test('quotes in text are escaped so attributes stay intact', () => {
  const quoted = structuredClone(doc);
  quoted.description = 'a "quoted" thing';
  const html = buildEffectHtml({ doc: quoted, engineSource: ENGINE, lang: 'de' });
  assert.match(html, /<meta description="a &quot;quoted&quot; thing"/);
});

test('the bootstrap reads every control global and caps the frame rate', () => {
  const html = buildEffectHtml({ doc, engineSource: ENGINE, lang: 'de' });
  assert.ok(html.includes("typeof tempo"));
  assert.ok(html.includes("typeof style"));
  assert.match(html, /1000 \/ 30/);
});

test('a control property that is not a valid identifier throws and never reaches the splice', () => {
  const bad = structuredClone(doc);
  bad.controls[0].property = 'x; alert(1); //';

  let html;
  try {
    html = buildEffectHtml({ doc: bad, engineSource: ENGINE, lang: 'de' });
  } catch (err) {
    assert.match(err.message, /x; alert\(1\); \/\//);
    return;
  }
  // If a future refactor ever swallows the error instead of throwing, the
  // malformed splice into the bootstrap script must still never appear.
  assert.ok(!html.includes("typeof x; alert(1); //"));
  assert.fail('expected buildEffectHtml to throw for an invalid control property');
});

test('a control property that is not a valid identifier throws naming it, and a valid one does not', () => {
  const bad = structuredClone(doc);
  bad.controls[0].property = 'x; alert(1); //';
  assert.throws(
    () => buildEffectHtml({ doc: bad, engineSource: ENGINE, lang: 'de' }),
    /x; alert\(1\); \/\//
  );

  const ok = structuredClone(doc);
  ok.controls[0].property = 'perfectlyFine';
  assert.doesNotThrow(() => buildEffectHtml({ doc: ok, engineSource: ENGINE, lang: 'de' }));
});

test('build-effect.js decides a control property is fatal by calling document.js\'s shared isValidIdentifier, not by reading normalizeDocument\'s advisory problems[] array', () => {
  // This is a structural test in the style of test/engine/boundary.test.js
  // (see .superpowers/plans/2026-08-09-signalforge-motor-und-export.md,
  // task 11): it reads the source file itself, because no behavioural test
  // against buildEffectHtml's output can tell these two implementations
  // apart. normalizeDocument's problems[] array records the exact same
  // "not a valid javascript identifier" wording that a problems-based
  // implementation would string-match on, so an old, string-matching
  // implementation classifies every example property in this file
  // identically to the current isValidIdentifier-based one — any purely
  // behavioural test stays green under both.
  const source = readFileSync(new URL('../../src/export/build-effect.js', import.meta.url), 'utf8');

  // Work on a copy with full-line "//" comments removed, because this file
  // legitimately explains this very design in a comment that contains the
  // word "problems" — a naive substring ban on the raw source would fail
  // for that reason alone, which is not the regression this test guards
  // against.
  const code = source
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');

  assert.match(
    source,
    /import\s*\{[^}]*\bisValidIdentifier\b[^}]*\}\s*from\s*['"]\.\.\/engine\/document\.js['"]/,
    'build-effect.js must import isValidIdentifier from the engine document module'
  );
  assert.match(
    code,
    /\bisValidIdentifier\s*\(/,
    'build-effect.js must call isValidIdentifier(...) to decide whether a control property is usable'
  );
  assert.doesNotMatch(
    code,
    /\bproblems\b/,
    'build-effect.js must not read normalizeDocument\'s advisory problems[] array for validation; '
      + 'that is exactly the string-matching regression this test exists to catch'
  );
});

test('a property that merely looks unusual but is a valid identifier still builds', () => {
  const ok = structuredClone(doc);
  ok.controls[0].property = '_weird$Name123';
  const html = buildEffectHtml({ doc: ok, engineSource: ENGINE, lang: 'de' });
  assert.ok(html.includes('typeof _weird$Name123'));
});

test('the bootstrap catches a rejected asset load instead of failing silently', () => {
  const html = buildEffectHtml({ doc, engineSource: ENGINE, lang: 'de' });
  // { assets: liveAssets }, not `base`: the bootstrap decodes only what a
  // layer draws, so a chosen tile picture riding in the document is not an
  // image the running effect pays for (see the note in build-effect.js).
  assert.match(html, /SF\.loadAssets\(\{ assets: liveAssets \}, \{[\s\S]*?\}\)\.then\(function \(loaded\) \{ assets = loaded; \}\)\.catch\(/);
});

test('an engine bundle containing a literal closing script tag is rejected at build time', () => {
  const sneaky = ENGINE + '\n// oops </script><script>alert(1)</script>';
  assert.throws(() => buildEffectHtml({ doc, engineSource: sneaky, lang: 'de' }), /<\/script/);
});

test('a combobox value containing a comma is rejected, naming the offending value', () => {
  const bad = structuredClone(doc);
  bad.controls[1].values = ['Warp, fast', 'Still'];
  assert.throws(
    () => buildEffectHtml({ doc: bad, engineSource: ENGINE, lang: 'de' }),
    /Warp, fast/
  );
});
