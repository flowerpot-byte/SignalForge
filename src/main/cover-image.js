// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
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

    const frame = document.createElement('canvas');
    frame.width = SF.CANVAS_WIDTH;
    frame.height = SF.CANVAS_HEIGHT;
    const ctx = frame.getContext('2d', { willReadFrequently: true });

    // The exported effect's own resolver, character for character (see the
    // bootstrap in src/export/build-effect.js): embedded data first, a
    // sibling file only if there is no data.
    const assets = await SF.loadAssets(doc, {
      resolveUrl: (asset) => (asset.data ? 'data:' + asset.mime + ';base64,' + asset.data : asset.file)
    });

    const renderer = SF.createRenderer();
    // Twice, as test/harness/page.html does: any scratch buffer a layer
    // builds lazily then exists for the frame that is actually kept.
    renderer.render(ctx, doc, assets, 0);
    renderer.render(ctx, doc, assets, 0);
    renderer.dispose();

    const out = document.createElement('canvas');
    out.width = ${COVER_WIDTH};
    out.height = ${COVER_HEIGHT};
    const octx = out.getContext('2d');
    octx.imageSmoothingEnabled = true;
    octx.imageSmoothingQuality = 'high';

    // Cover fit, centred: fill the tile, crop what does not fit. Derived from
    // the engine's own canvas constants, never from hardcoded numbers here.
    const scale = Math.max(${COVER_WIDTH} / frame.width, ${COVER_HEIGHT} / frame.height);
    const sourceWidth = ${COVER_WIDTH} / scale;
    const sourceHeight = ${COVER_HEIGHT} / scale;
    octx.drawImage(
      frame,
      (frame.width - sourceWidth) / 2, (frame.height - sourceHeight) / 2, sourceWidth, sourceHeight,
      0, 0, ${COVER_WIDTH}, ${COVER_HEIGHT}
    );

    const url = out.toDataURL('image/png');
    return url.slice(url.indexOf(',') + 1);
  })()`;
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
 */
export async function renderCoverInProcess(doc, {
  createWindow = () => new (require_('electron').BrowserWindow)({
    show: false, webPreferences: { backgroundThrottling: false }
  }),
  hostFile = ENGINE_HOST
} = {}) {
  const win = createWindow();
  try {
    await win.loadFile(hostFile);
    return await win.webContents.executeJavaScript(coverRenderScript(doc));
  } finally {
    // destroy(), not close(): close() is a request the page could in principle
    // delay, and nothing here has anything to save.
    win.destroy();
  }
}

// Same budget and same reasoning as prepare-image.js: generous enough to
// survive a cold Electron launch, far short of looking like a hang.
const DEFAULT_TIMEOUT_MS = 30_000;

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
 */
export async function renderCoverPng(doc, {
  timeoutMs = DEFAULT_TIMEOUT_MS,
  inElectron = Boolean(process.versions.electron),
  inProcess = renderCoverInProcess
} = {}) {
  if (inElectron) return Buffer.from(await inProcess(doc), 'base64');

  const result = await runElectronHelper({
    runner: join(here, 'cover-image-runner.cjs'),
    request: { doc },
    label: 'cover render',
    prefix: 'signalforge-cover-',
    timeoutMs
  });
  return Buffer.from(result.png, 'base64');
}
