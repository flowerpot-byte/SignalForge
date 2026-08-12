// SignalForge — build SignalRGB effects from images, gradients, shapes and particles.
// Copyright (C) 2026 Max Leopold Blumenschein
// SPDX-License-Identifier: GPL-3.0-or-later
import { normalizeDocument } from '../engine/document.js';

/**
 * The project file format. A project file is the document JSON with this
 * number beside it, nothing more — which is what makes a saved project a
 * single self-contained file: image assets already live inside the document
 * as base64 `data` (see src/engine/asset-import.js), so there is nothing
 * beside the file to lose track of. parseProject enforces this on the way
 * in, not only on the way out: an asset naming a `file` instead of carrying
 * `data` is refused rather than silently accepted (see below).
 *
 * Bump this only when an older SignalForge could no longer make sense of a
 * newer file. Everything normalizeDocument can already recover from — a
 * field it does not know, a missing one, a value out of range — is not a
 * format change, because opening such a file works and reports what it
 * corrected.
 */
export const PROJECT_FORMAT = 1;

/** Without the dot, the way Electron's dialog filters want it. */
export const PROJECT_EXTENSION = 'sfx';

/**
 * The document JSON plus its format number, indented so the file stays
 * readable in an editor and diffable in git.
 */
export function serializeProject(doc) {
  return JSON.stringify({ format: PROJECT_FORMAT, document: doc }, null, 2);
}

/**
 * Read a project file's text back into a document.
 *
 * Throws, with a sentence meant for the user rather than for a log, whenever
 * the text is not a project file this version can open: unreadable JSON,
 * something that is not a project at all, or a file from a later format. The
 * caller shows that sentence and keeps the project the user already had —
 * half-loading is not one of the outcomes.
 *
 * Anything past that goes through normalizeDocument, whose `problems` come
 * back with the document instead of stopping it: a slightly damaged project
 * opens and says what it had to correct. Nothing in the file is trusted as
 * already valid — normalizeDocument is the only authority on document shape.
 *
 * @returns {{ doc: object, problems: string[] }}
 */
export function parseProject(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('this file could not be read as a SignalForge project.');
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('this file could not be read as a SignalForge project.');
  }

  const { format } = parsed;
  if (!Number.isInteger(format) || format < 1) {
    throw new Error('this file has no SignalForge project format number.');
  }
  if (format > PROJECT_FORMAT) {
    throw new Error(
      `this project was saved by a newer version of SignalForge (format ${format}, `
      + `this one reads up to ${PROJECT_FORMAT}).`
    );
  }

  return documentFromFile(parsed.document, {
    notADocument: 'this project file carries no document.',
    embeddedOnly:
      'this project carries an image that is not embedded in the file (it names a '
      + 'file instead), which a SignalForge project may not do — only embedded images are allowed.'
  });
}

/**
 * Turn something read out of a FILE into a document, or refuse it.
 *
 * The one gate every foreign document passes through, whatever file it came
 * out of: a saved project above, and an exported effect the library reopens
 * (src/main/effect-document.js). It is one function and not two on purpose —
 * the rule it enforces is a security rule, this project has been bitten five
 * times by second copies of a rule, and a second copy of THIS one would be a
 * second copy of the check that keeps a foreign file from naming a path.
 *
 * Only the two sentences differ between the callers, because only the noun
 * differs: what is refused, and why, is identical.
 *
 * A file-shaped asset is refused rather than sanitised, and the reason is not
 * that something in this repository still writes one. Nothing does: every
 * export embeds its pictures, the command line included (bin/sfexport.js goes
 * through prepareImageFile, which hands back bytes), and the cover renderer is
 * handed a copy with any such asset removed (withoutFileAssets in
 * export-effect.js). The claim this comment used to make — that
 * test/engine/boundary.test.js and test/export/parity.test.js depended on
 * file-shaped assets — was simply not true of either file, and a security note
 * citing evidence that is not there is worse than no note.
 *
 * The real reason is one layer down: normalizeDocument (src/engine/document.js)
 * KEEPS a `file`-shaped asset, deliberately, because the engine is not only
 * this app's — it is embedded in every effect this app writes and is meant to
 * be usable by other embedders, whose assets may legitimately sit beside the
 * .html as sibling files. So the engine cannot be the place that refuses one.
 *
 * A file somebody OPENS is a different guarantee: it is self-contained because
 * every asset's bytes are embedded as `data`. An asset carrying `file` instead
 * — or *alongside* `data`, which normalizeAsset would silently prefer `data` over
 * and drop, hiding the smuggled string from everything downstream — would have
 * the renderer's image loader try to resolve an attacker-chosen path or URL the
 * moment the file is opened. Rejected before normalizeDocument ever sees it, so
 * nothing past this point has to reason about an asset naming anything outside
 * the file it arrived in.
 *
 * @returns {{ doc: object, problems: string[] }}
 */
export function documentFromFile(document, { notADocument, embeddedOnly }) {
  if (document === null || typeof document !== 'object' || Array.isArray(document)) {
    throw new Error(notADocument);
  }

  const rawAssets = document.assets;
  if (rawAssets !== null && typeof rawAssets === 'object' && !Array.isArray(rawAssets)) {
    for (const asset of Object.values(rawAssets)) {
      if (asset !== null && typeof asset === 'object' && !Array.isArray(asset) && 'file' in asset) {
        throw new Error(embeddedOnly);
      }
    }
  }

  return normalizeDocument(document);
}
