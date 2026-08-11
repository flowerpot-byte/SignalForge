// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import { join } from 'node:path';
import { buildEffectHtml } from '../export/build-effect.js';
import { effectControls, withLiveMotion } from '../export/effect-controls.js';
import { normalizeDocument } from '../engine/document.js';
import { COVER_EXTENSION } from './cover-image.js';

/**
 * The extension SignalRGB looks for.
 *
 * Exported since the effects folder became the app's own library: listing it
 * (src/main/effects-library.js) has to look for exactly what this writes, and
 * the two agreeing by construction is cheaper than the two agreeing by comment.
 */
export const EFFECT_EXTENSION = 'html';

/**
 * How much of a name survives into the file name.
 *
 * A single name component on NTFS may be 255 characters, but the whole path
 * has to fit too, and the effects folder is not the only place an export can
 * land. 100 leaves generous room for a deep folder plus ".html" while still
 * being far more than anybody types on purpose.
 */
export const MAX_EFFECT_NAME_LENGTH = 100;

/** Characters Windows refuses in a file name, plus every control character. */
const FORBIDDEN = /[\\/:*?"<>|\x00-\x1f]/g;

/**
 * Names Windows hands to a device rather than to a file, extension or not.
 * "NUL.html" is the dangerous one: writing it succeeds, stores nothing, and
 * an export would report a size and a path for a file that does not exist.
 */
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/**
 * Turn a document name into a file name, or null if nothing usable is left.
 *
 * A document name is free text somebody typed; a file name is not. Every
 * character that could turn the name into a path — a separator, a drive
 * colon, a wildcard — is replaced rather than passed on, so an export can
 * only ever land directly in the folder it was given. Leading and trailing
 * dots and spaces go too: Windows strips those silently, which would mean
 * writing to a different file than the one named in the question the user
 * just answered.
 *
 * Deliberately stricter than suggestedProjectFileName in app/main.js, which
 * does a similar job for a different purpose: that one only fills in a save
 * dialog a human then confirms, so falling back to "project" is helpful
 * there. Here the name IS the decision, so an unusable one is refused and
 * said out loud instead of quietly becoming something else.
 */
export function effectFileName(name) {
  const cleaned = String(name ?? '')
    .replace(FORBIDDEN, '-')
    .replace(/\s+/g, ' ')
    .replace(/-+/g, '-')
    .slice(0, MAX_EFFECT_NAME_LENGTH)
    // Trim spaces, dots and the dashes the replacement above may have left
    // at either end, so "///" cannot become "-".
    .replace(/^[\s.-]+|[\s.-]+$/g, '');

  if (cleaned.length === 0) return null;
  if (RESERVED.test(cleaned)) return null;
  return cleaned;
}

/**
 * Write the finished effect.
 *
 * `io` is injected so the whole thing can be checked against a filesystem
 * that lives in a Map — including the overwrite cases, which are exactly the
 * ones nobody wants to rehearse on a real effects folder. It needs
 * `exists(path)`, `mkdir(folder)`, `writeFile(path, text)`,
 * `writeBinary(path, bytes)` and `size(path)`. The cover image goes through
 * that same seam, so no test needs a disk to prove anything about it.
 *
 * `renderCover(doc)` hands back the tile picture as bytes, or throws. It is a
 * parameter rather than an import because drawing it needs a window: the app
 * passes renderCoverPng (src/main/cover-image.js), which renders here inside
 * Electron, and a unit test passes something that returns four bytes. Left
 * out, no cover is written at all — which is what every caller that has no
 * canvas to offer should do.
 *
 * `folder` is decided by the caller and only by the caller — the detected
 * SignalRGB folder or one the user picked in a main-process dialog. Nothing
 * a renderer supplies reaches this parameter.
 *
 * Every outcome comes back as a value rather than a throw: "that file is
 * already there" is a question to ask the user, not a failure, and the caller
 * has to be able to tell it apart from a genuine write error.
 *
 *   { ok: true,  path, bytes, name,          `name` is the sanitised name actually
 *                coverPath, coverMessage }   used for the file, without its extension —
 *                                            the caller needs it to echo back into the
 *                                            name field when the document's own name
 *                                            had to be cleaned up before it could be
 *                                            written. `coverPath` is the tile picture
 *                                            that was written, or null; `coverMessage`
 *                                            says why there is none, or null. Both are
 *                                            set: an effect whose tile is missing is
 *                                            still an exported effect, and the caller
 *                                            has to be able to say both things at once
 *   { ok: false, reason: 'exists', path }   the file is there and force was not set
 *   { ok: false, reason: 'name' }           nothing usable left in the document's name
 *   { ok: false, reason: 'empty' }          nothing to export yet
 */
export async function exportEffect({
  doc, folder, engineSource, lang = 'en', force = false, io, renderCover = null
}) {
  if (!folder) throw new Error('exportEffect needs a target folder');
  if (!engineSource) throw new Error('exportEffect needs the engine bundle');

  // Read from the raw document, not the normalized one: normalizeDocument
  // fills an empty name in with "Untitled", which is the right answer for a
  // preview and the wrong one here. A file appearing in somebody's SignalRGB
  // list under a name they never typed is a guess, and this is the one place
  // that must not guess — the name field in the window is empty, and saying
  // so is more use than exporting "Untitled.html".
  const fileName = effectFileName(doc?.name);
  if (fileName === null) return { ok: false, reason: 'name' };

  const normalized = normalizeDocument(doc).doc;

  // A document with no layers would build a valid, completely black effect.
  // Putting that in somebody's SignalRGB list is worse than saying no.
  if (normalized.layers.length === 0) return { ok: false, reason: 'empty' };

  const path = join(folder, `${fileName}.${EFFECT_EXTENSION}`);
  // The tile picture SignalRGB shows for this effect: same folder, same base
  // name, different extension — that IS the whole mechanism (proven on Max'
  // own machine on 11.08.2026, see docs/messung-titelbilder.md). Built from
  // the same `fileName` as the .html on the line above and never from
  // anything else, so a document renamed between two exports produces a new
  // PAIR rather than a new .html beside the old name's picture.
  const coverPath = join(folder, `${fileName}.${COVER_EXTENSION}`);

  // Asked before anything at all is created, so a refusal leaves the
  // filesystem exactly as it was — no folder, no temp file, nothing. The
  // question is asked of the .html alone: it is the effect, the picture is
  // decoration, and making a leftover .png able to block an export would mean
  // an effect somebody can no longer save because of a file SignalRGB does not
  // even list on its own.
  if (io.exists(path) && !force) return { ok: false, reason: 'exists', path };

  const layerId = normalized.layers[0].id;
  const prepared = withLiveMotion(normalized, layerId);
  const finished = { ...prepared, controls: effectControls(prepared, layerId) };
  const html = buildEffectHtml({ doc: finished, engineSource, lang });

  // Drawn from the very document that is about to be written, before either
  // file exists, so a cover that cannot be drawn costs nothing but its own
  // absence.
  let cover = null;
  let coverMessage = null;
  if (renderCover) {
    try {
      cover = await renderCover(finished);
    } catch (error) {
      coverMessage = String(error.message || error);
    }
  }

  io.mkdir(folder);

  // The picture first, the effect second. SignalRGB watches this folder live
  // (docs/erkenntnisse-signalrgb-motor.md: a new file appears in its list at
  // once), so writing the .html last means the effect never exists in that
  // list for even an instant without its tile. And a picture that cannot be
  // written must not cost the effect: it is reported, and the export goes on.
  let coverWritten = null;
  if (cover) {
    try {
      io.writeBinary(coverPath, cover);
      coverWritten = coverPath;
    } catch (error) {
      coverMessage = String(error.message || error);
    }
  }

  io.writeFile(path, html);
  return {
    ok: true,
    path,
    bytes: io.size(path),
    name: fileName,
    // The leaf name of what was written, which is how the library names the
    // same file (src/main/effects-library.js). It travels back so that the
    // window can mark the tile of the effect it has just written without
    // building a file name of its own out of `name` and an extension it would
    // have to know — the renderer names no files, and that includes leaf names
    // it could have got right.
    file: `${fileName}.${EFFECT_EXTENSION}`,
    coverPath: coverWritten,
    coverMessage
  };
}
