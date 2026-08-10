// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import { createI18n } from './i18n/i18n.js';
import { mountShell, mountBackdrop } from './components/shell.js';
import { createPreview } from './components/preview.js';
import { mountDrop } from './components/drop.js';
import { mountCrop } from './components/crop.js';
import { mountInspector } from './components/inspector.js';

// The preview loads dist/engine.bundle.js as a plain script tag (see
// index.html) rather than importing engine sources directly — that is what
// keeps test/export/parity.test.js meaningful: the preview and the export
// must run the exact same bundle. If the build step was skipped, fail loud
// and visible instead of leaving the window blank.
if (!window.SignalForgeEngine) {
  document.body.textContent = 'dist/engine.bundle.js is missing. Run: npm run build:engine';
  throw new Error('engine bundle missing');
}

// Dropping a file anywhere Chromium considers a valid drop target normally
// navigates the window to that file — the exact "blank/replace the window"
// failure the drop zone below must never trigger. This guard sits at the
// window level, outside boot(), so it is active even if boot() itself fails,
// and it covers every drop that lands outside the dedicated zone (over the
// layers or inspector panels, for instance): mountDrop()'s own handler
// stops propagation for drops it handles, so this one only ever sees drops
// nobody else claimed, and simply swallows them.
window.addEventListener('dragover', (event) => event.preventDefault());
window.addEventListener('drop', (event) => event.preventDefault());

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

  // Shown until the first successful drop, then reused for a rejection
  // message — one line so there is only ever one thing to read, and it is
  // always in the window, never only in the console (see components/drop.js).
  const message = document.createElement('p');
  message.className = 'muted drop-message';
  message.textContent = i18n.t('preview.dropHint');
  regions.preview.append(message);

  // The id the dropped picture always gets. One layer for now; the layer
  // list is a later task.
  const IMAGE_LAYER = 'image';

  // The only thing about the picture the document does not carry:
  // normalizeDocument keeps an asset's kind, mime and bytes, not the size the
  // importer scaled it down to. Everything else about the layer — its fit,
  // its offset — is read straight out of the live document below, never
  // copied, so the crop drag and the settings column cannot disagree about
  // it. null while no picture has been dropped yet.
  let sourceSize = null;

  /**
   * The picture the user can drag around, assembled fresh on every call from
   * the live document plus the importer's source size. Deliberately not
   * stored: a stored copy is what used to hold its own `fit`, which the
   * settings column now also writes — the crop would have gone on computing
   * its slack for whichever fit was in force when the picture was dropped.
   */
  function draggableLayer() {
    if (!sourceSize) return null;
    const layer = preview.document().layers.find((entry) => entry.id === IMAGE_LAYER);
    if (!layer) return null;
    return { ...layer, sourceWidth: sourceSize.width, sourceHeight: sourceSize.height };
  }

  mountCrop(preview.canvas, {
    getLayer: draggableLayer,
    // Writes straight into the live document; the preview's frame loop shows
    // it on its next frame (see components/preview.js).
    onChange: (offset) => preview.setLayerOffset(IMAGE_LAYER, offset)
  });

  const inspector = mountInspector(regions.inspector, {
    t: (k) => i18n.t(k),
    getDocument: () => preview.document(),
    /**
     * Which way a change reaches the picture depends on what kind of change
     * it is:
     *
     *  - A whole new motions list (adding or removing one) is the only
     *    change that alters the document's shape, so it is the only one that
     *    goes back through setDocument: normalizeDocument then fills a new
     *    entry's speed and amount, clamps them and drops any duplicate kind,
     *    which is work no code here should be repeating. It costs a reload
     *    of the picture, which is fine for something that happens on a
     *    button press.
     *  - Everything else — every slider, the fit dropdown, a motion's kind —
     *    is a single value at a path that already exists, so it is written
     *    straight into the live document and the running loop shows it on
     *    its next frame. Reloading the picture on every pixel of a slider
     *    drag would be unusable.
     */
    onChange: async (path, value) => {
      const doc = preview.document();
      if (!window.SignalForgeEngine.setByPath(doc, path, value)) {
        console.error('inspector: refused to write', path);
        return;
      }
      if (Array.isArray(value)) await preview.setDocument(doc);
    }
  });

  mountDrop(regions.preview, {
    onFile: async (file) => {
      // sf:importImage already turns its own failures into { ok: false }
      // (see app/main.js) rather than a rejection, but this handler is an
      // event callback with nobody awaiting it — an unexpected throw
      // anywhere in here (a bridge error, setDocument rejecting) must still
      // end up on screen instead of an unhandled rejection in the console.
      try {
        // The File itself goes to the bridge; only preload.cjs resolves it
        // to a real path (see components/drop.js). file.name is already
        // just the leaf name, so it doubles as the document name with no
        // path-splitting needed here.
        const result = await window.sf.importImage(file);
        if (!result.ok) {
          message.classList.add('drop-warn');
          message.textContent = `${i18n.t('preview.dropFailed')}: ${result.message}`;
          return;
        }
        message.classList.remove('drop-warn');
        message.textContent = '';
        await preview.setDocument({
          name: file.name,
          layers: [{ id: IMAGE_LAYER, type: 'image', asset: 'image', fit: 'cover', motions: [] }],
          assets: { image: result.asset }
        });
        sourceSize = { width: result.asset.width, height: result.asset.height };
        // The column had nothing but the document-wide sliders until now.
        inspector.refresh();
        preview.start();
      } catch (err) {
        console.error('drop import failed:', err);
        message.classList.add('drop-warn');
        message.textContent = `${i18n.t('preview.dropFailed')}: ${err.message || err}`;
      }
    },
    onReject: (name) => {
      message.classList.add('drop-warn');
      message.textContent = `${i18n.t('preview.dropUnsupported')}: ${name}`;
    }
  });
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
