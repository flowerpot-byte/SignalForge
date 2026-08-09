// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
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

test('a property that merely looks unusual but is a valid identifier still builds', () => {
  const ok = structuredClone(doc);
  ok.controls[0].property = '_weird$Name123';
  const html = buildEffectHtml({ doc: ok, engineSource: ENGINE, lang: 'de' });
  assert.ok(html.includes('typeof _weird$Name123'));
});

test('the bootstrap catches a rejected asset load instead of failing silently', () => {
  const html = buildEffectHtml({ doc, engineSource: ENGINE, lang: 'de' });
  assert.match(html, /SF\.loadAssets\(base, \{[\s\S]*?\}\)\.then\(function \(loaded\) \{ assets = loaded; \}\)\.catch\(/);
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
