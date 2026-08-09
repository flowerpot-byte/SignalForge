// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import { CANVAS_WIDTH, CANVAS_HEIGHT, normalizeDocument } from '../engine/document.js';

const ASCII_PRINTABLE = /^[\x20-\x7E]*$/;

function attribute(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Keep the JSON payload from terminating its own script block. */
function jsonBlock(value) {
  return JSON.stringify(value).replace(/<\//g, '<\\/');
}

function controlMeta(control, lang) {
  const label = control.label[lang] ?? control.label.en;
  if (!ASCII_PRINTABLE.test(label)) {
    throw new Error(`Control "${control.property}": label "${label}" must be ASCII only. `
      + 'SignalRGB\'s handling of non-ASCII labels is unverified.');
  }
  const parts = [
    `property="${attribute(control.property)}"`,
    `label="${attribute(label)}"`,
    `type="${attribute(control.type)}"`
  ];
  if (control.type === 'number') {
    parts.push(`min="${attribute(control.min)}"`, `max="${attribute(control.max)}"`);
  }
  if (control.type === 'combobox') {
    for (const value of control.values) {
      if (value.includes(',')) {
        throw new Error(`Control "${control.property}": combobox value "${value}" contains a comma. `
          + 'SignalRGB\'s "values" attribute is comma-separated, so this value cannot be represented '
          + 'and would silently split into two options.');
      }
    }
    parts.push(`values="${attribute(control.values.join(','))}"`);
  }
  parts.push(`default="${attribute(control.default)}"`);
  return `  <meta ${parts.join(' ')} />`;
}

function bootstrap(controls) {
  const reads = controls
    .map((c) => `    values[${JSON.stringify(c.property)}] = `
      + `(typeof ${c.property} !== 'undefined') ? ${c.property} : undefined;`)
    .join('\n');

  return `
  var SF = window.SignalForgeEngine;
  var canvas = document.getElementById('exCanvas');
  var ctx = canvas.getContext('2d');
  var raw = JSON.parse(document.getElementById('sf-document').textContent);
  var base = SF.normalizeDocument(raw).doc;
  var renderer = SF.createRenderer();
  var assets = null;
  var start = null;
  var lastFrame = -1e9;
  var FRAME_GAP = 1000 / 30;

  SF.loadAssets(base, {
    resolveUrl: function (asset) {
      return asset.data ? 'data:' + asset.mime + ';base64,' + asset.data : asset.file;
    }
  }).then(function (loaded) { assets = loaded; }).catch(function (err) {
    // Without this, a rejected load leaves assets === null forever: update()
    // keeps returning early every frame and the effect is silently black,
    // with nothing but an unhandled-rejection nobody is watching for.
    console.log('SignalForge: failed to load assets, effect will stay blank.', err);
  });

  function readControls() {
    var values = {};
${reads}
    for (var key in values) {
      if (values[key] === undefined) delete values[key];
    }
    return values;
  }

  function update(stamp) {
    window.requestAnimationFrame(update);
    if (!assets) return;
    if (start === null) start = stamp;
    if (stamp - lastFrame < FRAME_GAP) return;
    lastFrame = stamp;
    var doc = SF.applyControls(base, readControls());
    renderer.render(ctx, doc, assets, (stamp - start) / 1000);
  }

  window.requestAnimationFrame(update);`;
}

/**
 * Build a standalone SignalRGB effect file.
 *
 * engineSource is the bundled engine (dist/engine.bundle.js). The very same
 * bundle drives the preview, which is what makes the preview trustworthy.
 */
export function buildEffectHtml({ doc: rawDoc, engineSource, lang = 'en' }) {
  const { doc, problems } = normalizeDocument(rawDoc);

  // normalizeDocument only *records* an invalid control.property as an advisory
  // problem — it doesn't reject it, because it's a general-purpose sanitizer also
  // used for previews, where a stray property name is merely unfortunate. Here it
  // is fatal: control.property is spliced unescaped into the bootstrap script below
  // (`(typeof ${c.property} !== 'undefined') ? ...`), and an invalid identifier
  // turns that into a SyntaxError that kills the whole bootstrap — asset loading,
  // the render loop, everything, with no debugger attached to the host to see it.
  // So we surface exactly this one category of problem as a hard build error,
  // reusing the identifier check document.js already performed instead of
  // duplicating its pattern here. Every other problem it records (duplicate layer
  // ids renamed, unknown blend/fit/motion/type substituted with a safe default) is
  // something it already recovered from, so we deliberately leave those as
  // non-fatal and don't surface them.
  const badProperty = problems.find((p) => /is not a valid javascript identifier/.test(p));
  if (badProperty) {
    throw new Error(`Cannot build effect: ${badProperty}`);
  }

  if (/<\/script/i.test(engineSource)) {
    throw new Error('engineSource contains a literal "</script", which would truncate the '
      + 'embedded <script> block. HTML-escaping is not an option here since this is live '
      + 'JavaScript, not JSON, so the build must fail loudly instead of shipping a truncated effect.');
  }

  const metas = doc.controls.map((control) => controlMeta(control, lang)).join('\n');

  return `<head>
  <title>${attribute(doc.name)}</title>
  <meta description="${attribute(doc.description)}" />
  <meta publisher="${attribute(doc.publisher)}" />
${metas}
</head>

<body style="margin: 0; padding: 0; background: #000">
  <canvas id="exCanvas" width="${CANVAS_WIDTH}" height="${CANVAS_HEIGHT}"></canvas>
</body>

<script id="sf-document" type="application/json">${jsonBlock(doc)}</script>
<script>${engineSource}</script>
<script>${bootstrap(doc.controls)}
</script>
`;
}
