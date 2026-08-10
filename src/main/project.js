// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import { normalizeDocument } from '../engine/document.js';

/**
 * The project file format. A project file is the document JSON with this
 * number beside it, nothing more — which is what makes a saved project a
 * single self-contained file: image assets already live inside the document
 * as base64 `data` (see src/engine/asset-import.js), so there is nothing
 * beside the file to lose track of.
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

  const { document } = parsed;
  if (document === null || typeof document !== 'object' || Array.isArray(document)) {
    throw new Error('this project file carries no document.');
  }

  return normalizeDocument(document);
}
