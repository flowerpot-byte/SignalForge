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
    parts.push(`min="${control.min}"`, `max="${control.max}"`);
  }
  if (control.type === 'combobox') {
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
  }).then(function (loaded) { assets = loaded; });

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
  const { doc } = normalizeDocument(rawDoc);
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
