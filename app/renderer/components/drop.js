// SignalForge — build SignalRGB effects from images, gradients, shapes and particles.
// Copyright (C) 2026 Max Leopold Blumenschein
// SPDX-License-Identifier: GPL-3.0-or-later

export const SUPPORTED_IMAGE_EXTENSIONS = Object.freeze(
  ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp']
);

/** Judge the last extension only — "trap.png.exe" is not an image. */
export function isSupportedImage(name) {
  const dot = name.lastIndexOf('.');
  if (dot < 0) return false;
  return SUPPORTED_IMAGE_EXTENSIONS.includes(name.slice(dot).toLowerCase());
}

/**
 * Wire drag-and-drop onto `element`. `onFile(file)` fires with the dropped
 * `File` object for a supported image; `onReject(name)` fires for anything
 * else, including a drop with no file at all handled silently (nothing to
 * reject or import).
 *
 * This hands over the `File` object itself rather than resolving it to a
 * path here — only `app/preload.cjs` is trusted to turn a File into a real
 * filesystem path (via `webUtils.getPathForFile`), so the renderer never
 * gets to compute or forge a path of its own for `sf:importImage` to read.
 *
 * `stopPropagation` here matters beyond tidiness: `app/renderer/main.js`
 * installs a window-wide dragover/drop guard so a drop outside this element
 * can never fall through to Chromium's default "navigate to the file"
 * behaviour. Letting our own handled drop bubble up to that guard would be
 * harmless (it also just calls preventDefault), but stopping it here keeps
 * the two guards from ever needing to agree on anything.
 */
export function mountDrop(element, { onFile, onReject }) {
  const stop = (event) => { event.preventDefault(); event.stopPropagation(); };

  element.addEventListener('dragover', (event) => {
    stop(event);
    element.classList.add('drop-active');
  });
  element.addEventListener('dragleave', (event) => {
    stop(event);
    element.classList.remove('drop-active');
  });
  element.addEventListener('drop', (event) => {
    stop(event);
    element.classList.remove('drop-active');
    const file = event.dataTransfer?.files?.[0];
    if (!file) return;
    if (!isSupportedImage(file.name)) { onReject(file.name); return; }
    onFile(file);
  });
}
