// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import { createI18n } from './i18n/i18n.js';
import { mountShell, mountBackdrop } from './components/shell.js';
import { createPreview } from './components/preview.js';

// The preview loads dist/engine.bundle.js as a plain script tag (see
// index.html) rather than importing engine sources directly — that is what
// keeps test/export/parity.test.js meaningful: the preview and the export
// must run the exact same bundle. If the build step was skipped, fail loud
// and visible instead of leaving the window blank.
if (!window.SignalForgeEngine) {
  document.body.textContent = 'dist/engine.bundle.js is missing. Run: npm run build:engine';
  throw new Error('engine bundle missing');
}

/**
 * Placeholder document for the preview until Task 7 wires up real image
 * import. It only exists to prove the preview draws frames through the
 * engine bundle, so it embeds a tiny image and a visible motion.
 */
const DEMO_DOCUMENT = {
  name: 'Preview',
  layers: [
    {
      id: 'demo',
      type: 'image',
      asset: 'demo',
      fit: 'cover',
      motions: [{ kind: 'warp', speed: 30, amount: 60 }]
    }
  ],
  assets: {
    demo: {
      kind: 'image',
      mime: 'image/png',
      data: 'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAHklEQVR42mXJsQ0AAAgDIOr/'
        + 'P9fVRFZSkMI4QtE/C5t8BQM0UanVAAAAAElFTkSuQmCC'
    }
  }
};

/**
 * Everything that can fail (missing/blocked language file, bridge call)
 * lives in here so a rejection can be turned into a visible message instead
 * of leaving the user staring at a blank window.
 */
async function boot() {
  const dictionaries = {
    de: await (await fetch('./i18n/de.json')).json(),
    en: await (await fetch('./i18n/en.json')).json()
  };

  const settings = await window.sf.settings.all();
  const i18n = createI18n(dictionaries, settings.language);

  // These three seed colours are only the starting tint shown before any
  // effect has been loaded — a later task will pass the effect's own
  // colours into mountBackdrop instead. Read from tokens.css rather than
  // hard-coded here so every colour in the project still lives in one place.
  const style = getComputedStyle(document.documentElement);
  const seedColours = [
    style.getPropertyValue('--backdrop-seed-1').trim(),
    style.getPropertyValue('--backdrop-seed-2').trim(),
    style.getPropertyValue('--backdrop-seed-3').trim()
  ];

  mountBackdrop(seedColours);
  const regions = mountShell(document.getElementById('app'), (k) => i18n.t(k));

  const preview = createPreview(regions.preview, (k) => i18n.t(k));
  await preview.setDocument(DEMO_DOCUMENT);
  preview.start();
}

boot().catch((err) => {
  console.error('SignalForge failed to start:', err);
  // The language files themselves failed to load, so this last-resort
  // message cannot come from them — it is deliberately a plain, hard-coded
  // English sentence rather than a translation-key lookup, and that is not
  // a violation of the "no hard-coded UI strings" rule.
  document.getElementById('app').textContent =
    'SignalForge failed to start. See the console for details.';
});
