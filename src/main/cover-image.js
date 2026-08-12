// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max Leopold Blumenschein
// SPDX-License-Identifier: GPL-3.0-or-later
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { runElectronHelper } from './electron-helper.js';
import { ENGINE_HOST } from './prepare-image.js';

const require_ = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));

/** The extension SignalRGB's own bundled effects use for their tile picture. */
export const COVER_EXTENSION = 'png';

/**
 * How large the tile picture is written.
 *
 * 512 x 288, because that is what the evidence says and nothing else is
 * measured. Every Static effect SignalRGB itself ships is exactly this size
 * (docs/messung-titelbilder.md, section 2: Neon Shift, Rainbow, Side to Side,
 * Solid Color — the one exception, Screen Ambience, is the same 16:9 at
 * 1280x720), and 512 x 288 is also the size of the probe image that was
 * actually seen rendering as a tile in Max' own effect list on 11.08.2026. A
 * size nobody has ever seen SignalRGB accept would be a guess dressed up as a
 * decision; this one has been looked at.
 *
 * PNG, for the same reason: every example found is a PNG, and whether SignalRGB
 * reads .jpg or .webp neighbours is explicitly unmeasured.
 */
export const COVER_WIDTH = 512;
export const COVER_HEIGHT = 288;

/**
 * The frame that becomes the tile, and the one place that decides it.
 *
 * WHICH FRAME: t = 0 of this very document, through the real engine
 * (dist/engine.bundle.js, loaded by engine-host.html) — the same bundle that
 * draws the preview, the gallery tiles and the exported effect itself. So the
 * tile cannot drift away from what the effect does; there is no second
 * renderer and no hand-made artwork anywhere in this path.
 *
 * t = 0 rather than some prettier moment is the honest choice for a motion: it
 * is the frame the effect actually starts on (the exported bootstrap in
 * src/export/build-effect.js pins its first frame to t = 0 whatever the host's
 * clock says), so the tile is a still of the effect's own first instant rather
 * than of a moment picked to flatter it. For a warp or a drift, later frames
 * differ — a tile can only ever be one of them, and the first one is the only
 * one that is not a choice about which part of the animation to advertise.
 *
 * WHY IT IS SCALED RATHER THAN RENDERED LARGE: the engine draws at exactly
 * CANVAS_WIDTH x CANVAS_HEIGHT (320 x 200) and its finishing pass reads those
 * pixels back by those very numbers (applyFinish in src/engine/engine.js). Ask
 * it for a bigger frame and brightness/saturation would be applied to the top
 * left corner only — a picture that is no longer what the effect looks like.
 * So the effect is rendered at its own true size and the result is scaled up.
 * Slightly soft at 1.6x, and true.
 *
 * WHY IT IS CROPPED RATHER THAN LETTERBOXED: the canvas is 8:5 and the tile is
 * 16:9. Fitting the whole frame inside would leave black pillars down both
 * sides, which reads as an icon sitting in a tile rather than as a tile — and
 * SignalRGB's own tiles are full-bleed. So it is a centre crop: the full width,
 * the middle 90% of the height. Nothing that decides the look of an effect
 * lives in those top and bottom slivers — every fit mode centres its picture
 * (computeSourceRect in src/engine/util/fit.js), and a gradient's ramp runs
 * through the middle.
 *
 * The corners are therefore opaque, always: the renderer fills the whole frame
 * before drawing anything (createRenderer's fillRect), and the crop covers the
 * whole tile, so there is no transparent pixel anywhere in the file. A tile,
 * not an icon.
 */
export function coverRenderScript(doc) {
  return `(async () => {
    const SF = window.SignalForgeEngine;
    const { doc } = SF.normalizeDocument(${JSON.stringify(doc)});

    // The exported effect's own resolver, character for character (see the
    // bootstrap in src/export/build-effect.js): embedded data first, a
    // sibling file only if there is no data.
    const resolveUrl = (asset) => (asset.data ? 'data:' + asset.mime + ';base64,' + asset.data : asset.file);

    // The one fork in this file: a document that NAMES its tile picture
    // (doc.cover, an asset id — normalizeDocument has already thrown away a
    // cover that names nothing) draws that picture; every other document
    // draws its own first frame exactly as always. Both sides land in the
    // same cover-fit crop below, so a chosen picture of any proportions
    // fills the tile edge to edge the same way the rendered frame does.
    let frame = null;
    if (doc.cover) {
      const chosen = await new Promise((resolve) => {
        const image = new Image();
        // Validated INSIDE onload: an SVG with width 0 decodes "successfully"
        // with naturalWidth 0, and letting it through would make the crop's
        // scale infinite and drawImage throw — past this fork, where nothing
        // would turn it into the automatic tile any more.
        image.onload = () => resolve(image.naturalWidth > 0 && image.naturalHeight > 0 ? image : null);
        image.onerror = () => resolve(null);
        image.src = resolveUrl(doc.assets[doc.cover]);
      });
      // A cover that cannot be decoded falls through to the automatic tile:
      // the effect list is no place for a broken-image placeholder, and the
      // frame-0 render is always available.
      if (chosen) frame = chosen;
    }

    if (!frame) {
      const canvas = document.createElement('canvas');
      canvas.width = SF.CANVAS_WIDTH;
      canvas.height = SF.CANVAS_HEIGHT;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });

      const assets = await SF.loadAssets(doc, { resolveUrl });

      const renderer = SF.createRenderer();
      // Twice when there is no trail, so any scratch buffer a layer builds
      // lazily exists for the frame that is actually kept -- safe there because
      // render() is a pure function of (doc, assets, t) with no trail, so a
      // throwaway first call and the kept call land on the same pixels.
      //
      // ONCE when doc.trail > 0, and that is not the same optimisation skipped:
      // with a trail, render() is no longer pure -- frame N is composited over
      // frame N-1 (see createRenderer in src/engine/engine.js) -- so a second
      // call at t = 0 would veil the first call's frame with itself and hand
      // back a picture the effect never actually shows. A cold single render is
      // also the more faithful choice, not just the safe one: the exported
      // effect's own first frame is cold too (see the WHICH FRAME note above).
      // test/harness/page.html's sequence path (__run's frames branch) made
      // exactly this call already, for exactly this reason.
      renderer.render(ctx, doc, assets, 0);
      if (!(doc.trail > 0)) renderer.render(ctx, doc, assets, 0);
      renderer.dispose();
      frame = canvas;
    }

    const frameWidth = frame.naturalWidth ?? frame.width;
    const frameHeight = frame.naturalHeight ?? frame.height;

    const out = document.createElement('canvas');
    out.width = ${COVER_WIDTH};
    out.height = ${COVER_HEIGHT};
    const octx = out.getContext('2d');
    octx.imageSmoothingEnabled = true;
    octx.imageSmoothingQuality = 'high';

    // Cover fit, centred: fill the tile, crop what does not fit. Derived from
    // the picture's own size, never from hardcoded numbers here.
    const scale = Math.max(${COVER_WIDTH} / frameWidth, ${COVER_HEIGHT} / frameHeight);
    const sourceWidth = ${COVER_WIDTH} / scale;
    const sourceHeight = ${COVER_HEIGHT} / scale;
    octx.drawImage(
      frame,
      (frameWidth - sourceWidth) / 2, (frameHeight - sourceHeight) / 2, sourceWidth, sourceHeight,
      0, 0, ${COVER_WIDTH}, ${COVER_HEIGHT}
    );

    const url = out.toDataURL('image/png');
    return url.slice(url.indexOf(',') + 1);
  })()`;
}

// Same budget and same reasoning as prepare-image.js: generous enough to
// survive a cold Electron launch, far short of looking like a hang.
const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * The two lines the app's own window has carried from the start, on the window
 * that draws tile pictures.
 *
 * This one loads a local host page and runs the engine in it, and the engine
 * resolves an asset with no `data` to `asset.file` — a string out of a document.
 * exportEffect now takes such assets out before the document ever gets here, so
 * this is the second lock rather than the first, and it is worth having for the
 * same reason the main window has it: a window that CANNOT navigate cannot be
 * talked into fetching something, whatever gets past the door upstream.
 *
 * Tolerant of a window that has neither hook, because a test's stand-in window
 * is a plain object — the point of injecting createWindow at all.
 */
function sealWindow(win) {
  win?.webContents?.on?.('will-navigate', (event) => { event.preventDefault(); });
  win?.webContents?.setWindowOpenHandler?.(() => ({ action: 'deny' }));
}

/**
 * Render the cover in THIS process, in a window nobody ever sees.
 *
 * Same shape and same reasoning as prepareImageInProcess: a caller already
 * running inside Electron has a canvas, so spawning a second Electron would
 * be both slower and, in a packaged app, wrong (a packaged executable ignores
 * a script argument and would start a second copy of SignalForge instead).
 *
 * `createWindow` is injectable so the choice above can be proven from a plain
 * Node test, which cannot construct a BrowserWindow at all.
 *
 * AND IT GIVES UP, which it did not used to. Both awaits below are unbounded on
 * their own: loadFile on a host that never finishes loading, and
 * executeJavaScript on a document whose render never returns. The spawned route
 * has always had a timeout (runElectronHelper's) and this one had none, which
 * made the in-process path — the one the app itself uses — the only one that
 * could hang. It hangs in the worst possible place: the library draws missing
 * tile pictures ONE AT A TIME through a serial queue (app/main.js), so a single
 * wedged render is not one tile without a picture, it is every tile behind it
 * as well, forever.
 *
 * The window is destroyed in a `finally`, so it goes whichever way this ends —
 * a timed-out render that left its window open would leak a hidden BrowserWindow
 * per tile, which is worse than the hang it was reported as.
 */
export async function renderCoverInProcess(doc, {
  createWindow = () => new (require_('electron').BrowserWindow)({
    show: false, webPreferences: { backgroundThrottling: false }
  }),
  hostFile = ENGINE_HOST,
  timeoutMs = DEFAULT_TIMEOUT_MS
} = {}) {
  const win = createWindow();
  sealWindow(win);
  let watchdog = null;
  try {
    const rendered = (async () => {
      await win.loadFile(hostFile);
      return await win.webContents.executeJavaScript(coverRenderScript(doc));
    })();
    const timedOut = new Promise((_resolve, reject) => {
      watchdog = setTimeout(() => reject(new Error(`cover render timed out after ${timeoutMs}ms`)), timeoutMs);
    });
    return await Promise.race([rendered, timedOut]);
  } finally {
    clearTimeout(watchdog);
    // destroy(), not close(): close() is a request the page could in principle
    // delay, and nothing here has anything to save.
    win.destroy();
  }
}

/**
 * The tile picture for a document, as PNG bytes.
 *
 * Rendered here when this process is Electron (the app's export button), in a
 * spawned one when it is not (bin/sfexport.js under plain Node). Both routes
 * end in coverRenderScript above, so the command line and the window cannot
 * produce different tiles for the same effect.
 *
 * Throws rather than returning a placeholder: a cover that could not be drawn
 * is something the caller has to be able to say out loud. Nobody is served by
 * a grey rectangle that claims to be a preview.
 *
 * `timeoutMs` governs BOTH routes. It used to be documented here and then
 * handed only to the spawned one, which left the route the app itself takes
 * with no bound at all.
 */
export async function renderCoverPng(doc, {
  timeoutMs = DEFAULT_TIMEOUT_MS,
  inElectron = Boolean(process.versions.electron),
  inProcess = renderCoverInProcess
} = {}) {
  if (inElectron) return Buffer.from(await inProcess(doc, { timeoutMs }), 'base64');

  const result = await runElectronHelper({
    runner: join(here, 'cover-image-runner.cjs'),
    request: { doc },
    label: 'cover render',
    prefix: 'signalforge-cover-',
    timeoutMs
  });
  return Buffer.from(result.png, 'base64');
}
