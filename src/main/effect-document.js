// SignalForge — build SignalRGB effects from images, gradients, shapes and particles.
// Copyright (C) 2026 Max Leopold Blumenschein
// SPDX-License-Identifier: GPL-3.0-or-later
import { DOCUMENT_SCRIPT_ID } from '../export/build-effect.js';
import { documentFromFile } from './project.js';
import { DOCUMENT_VERSION } from '../engine/document.js';

/**
 * Read an exported effect back into a document.
 *
 * WHY THIS IS POSSIBLE AT ALL, AND WHY IT IS NOT A PARSER
 *
 * An effect this app writes carries its own normalized document inside itself,
 * as one JSON literal in a script block the browser never executes:
 *
 *   <script id="sf-document" type="application/json">{ ... }</script>
 *
 * That block is not decoration and not a copy — it IS what the finished effect
 * renders from (see the bootstrap in src/export/build-effect.js, which parses
 * this very text on the host's first frame). So an effect that runs is an
 * effect whose document is intact, and reading it back is reading the same
 * bytes the effect itself reads.
 *
 * Two properties of the way it is written make finding it again exact rather
 * than a guess, which is the whole difference between this and scraping HTML:
 *
 *  - jsonBlock() in build-effect.js replaces every `</` inside the JSON with
 *    `<\/`. A JSON document can only contain `<` inside a string (no structural
 *    character produces one), and `\/` is a valid JSON escape for `/` — so the
 *    escaping costs nothing on the way back, and the FIRST `</script>` after
 *    the opening tag is provably the closing one. There is no ambiguity to
 *    resolve and therefore no HTML parsing to do.
 *  - the id is a constant both ends import (DOCUMENT_SCRIPT_ID), so the writer
 *    and this reader cannot drift apart in silence.
 *
 * SECURITY: THIS IS A FOREIGN FILE
 *
 * Anything found in an effects folder was put there by somebody, and SignalRGB's
 * effects folder is a place other programs write into. So what comes out of the
 * block above is treated exactly as a .sfx file's contents are treated, by the
 * very same code: documentFromFile (src/main/project.js) refuses an asset that
 * names a `file` instead of carrying its bytes, and normalizeDocument is the
 * only authority on shape. There is no second validator here — this file finds
 * the text and checks that it is a SignalForge document at all; every judgement
 * about what a document may contain is made in the one place that already
 * makes it.
 *
 * Every refusal is a throw carrying a sentence meant for a person, never a
 * half-read document: the caller shows the sentence and keeps whatever the user
 * already had open.
 */

/**
 * The opening tag, as it is written. Tolerant about whitespace between the
 * attributes and about their order being what build-effect.js writes, and
 * deliberately not tolerant about anything else: this is looking for a block
 * THIS app wrote, not for any JSON in any HTML.
 *
 * NOT CASE-INSENSITIVE, and that is a fix rather than an oversight. This reader
 * is a stand-in for what the running effect's own bootstrap does, and that is
 * `document.getElementById(DOCUMENT_SCRIPT_ID)` — a DOM lookup on an id, which
 * is case-SENSITIVE. An `i` flag made the reader looser than the thing it
 * stands in for, and every place the two differ is a place where SignalForge
 * could show one document while SignalRGB runs another. Being stricter than the
 * DOM can only ever cost a refusal, which is a sentence somebody reads; being
 * looser costs a lie. Every effect this app writes is lower case (see
 * build-effect.js), so nothing genuine is refused by this.
 */
const OPENING_TAG = new RegExp(
  `<script\\s+id="${DOCUMENT_SCRIPT_ID}"\\s+type="application/json"\\s*>`
);

/** The same pattern, for counting rather than locating. See TWO_BLOCKS below. */
const OPENING_TAG_EVERYWHERE = new RegExp(OPENING_TAG.source, 'g');

const CLOSING_TAG = '</script>';

/** What a file that is not one of ours gets told, in one place. */
const NOT_AN_EFFECT = 'this file is not a SignalForge effect — it carries no SignalForge document, '
  + 'so there is nothing in it to open.';

/**
 * What a file carrying more than one opening tag gets told.
 *
 * THE ATTACK THIS CLOSES, because it is not obvious. Finding the block by
 * searching the text is exact for a file this app wrote, but a file somebody
 * else wrote can contain the marker in a place the DOM does not see it: inside
 * an HTML comment, or inside a <textarea>, where it is text rather than an
 * element. `getElementById` — which is how the running effect finds its own
 * document — would step straight past such a block and return the real one
 * further down. A search through the raw text stops at the first one.
 *
 * That gap is worth exactly one thing to an attacker, and it is a bad one:
 * SignalForge would show, tile and let somebody edit the decoy while SignalRGB
 * runs the genuine block underneath. The window would be honestly reporting the
 * wrong document.
 *
 * The fix is not to start parsing HTML — that would be a second, weaker copy of
 * the browser, which is how this class of bug is usually MADE. It is to refuse
 * the ambiguity outright: a SignalForge export contains the opening tag exactly
 * once (jsonBlock in build-effect.js writes one, and escapes every `</` in the
 * JSON so the document's own contents cannot produce another). Two is therefore
 * never one of ours, whatever the second one is for, and a file that is not one
 * of ours is refused with a sentence rather than guessed at.
 */
const TWO_BLOCKS = 'this file carries more than one SignalForge document block, so there is no '
  + 'saying which one it actually runs. SignalForge will not open it.';

/**
 * The JSON text an effect carries, or null if it carries none.
 *
 * Split out from readEffectDocument so that "is this one of ours?" can be
 * answered while listing a folder without parsing anything.
 *
 * Two different negatives, deliberately told apart: "there is no block here"
 * is null, because a folder SignalRGB watches is FULL of perfectly good effects
 * that are not ours and saying so about each of them would be noise. "There are
 * two blocks here" is a throw, because that is a file pretending to be one of
 * ours, and the person looking at the shelf is owed the sentence.
 *
 * @throws {Error} for a file carrying more than one opening tag.
 */
export function effectDocumentJson(html) {
  const text = String(html ?? '');
  const opening = OPENING_TAG.exec(text);
  if (!opening) return null;
  // Counted over the whole file, not just from here on: a decoy can sit either
  // side of the genuine block, and the point is that there is more than one at
  // all, not which one came first.
  if ((text.match(OPENING_TAG_EVERYWHERE) ?? []).length > 1) throw new Error(TWO_BLOCKS);

  const start = opening.index + opening[0].length;
  const end = text.indexOf(CLOSING_TAG, start);
  // An effect whose block was never closed is a truncated file, not a document.
  if (end === -1) return null;
  return text.slice(start, end);
}

/**
 * Whether this text is an effect this app can open. Cheap: no JSON parsing, no
 * normalising — just whether the block is there, alone, and closed.
 *
 * A file with two blocks answers false here rather than throwing: this is the
 * question the folder listing asks about every file it finds (see listEffects),
 * and its answer is whether to offer a tile. The sentence belongs to whoever
 * tries to OPEN one, and readEffectDocument is where that happens.
 */
export const looksLikeEffect = (html) => {
  try {
    return effectDocumentJson(html) !== null;
  } catch {
    return false;
  }
};

/**
 * The document inside an exported effect.
 *
 * @param {string} html  the whole file, as text
 * @returns {{ doc: object, problems: string[] }}  problems are normalizeDocument's
 *          own: things it corrected on the way in, which the caller says out loud
 *          rather than presenting something other than what the file held.
 * @throws {Error} with a sentence for the user, and nothing else, for a file
 *          that is not a SignalForge effect or whose document cannot be read.
 */
export function readEffectDocument(html) {
  const json = effectDocumentJson(html);
  if (json === null) throw new Error(NOT_AN_EFFECT);

  let raw;
  try {
    raw = JSON.parse(json);
  } catch {
    // The block is there but its contents are not JSON: a file somebody edited
    // by hand, or one that was cut short while being written.
    throw new Error('this effect carries a SignalForge document that could not be read.');
  }

  // The shape check, and the reason there is one at all: normalizeDocument
  // recovers from ANYTHING — handed `{}` it hands back a valid, nameless
  // document with no layers, which would open as an empty stage and look like
  // the app losing the user's effect rather than like a file being refused. So
  // gibberish that happens to be JSON is refused HERE, before it can become a
  // document, and refused on the two facts every effect this app writes is
  // true of:
  //
  //  - it carries a version this app understands. An effect written by a later
  //    SignalForge may carry fields whose absence changes what the picture
  //    means, and quietly dropping them is worse than saying no.
  //  - it has at least one layer. exportEffect refuses to write an effect with
  //    no layers at all (src/main/export-effect.js), so a document with none
  //    did not come out of an export.
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(NOT_AN_EFFECT);

  const { version } = raw;
  if (!Number.isInteger(version) || version < 1) throw new Error(NOT_AN_EFFECT);
  if (version > DOCUMENT_VERSION) {
    throw new Error(
      `this effect was made by a newer version of SignalForge (document version ${version}, `
      + `this one reads up to ${DOCUMENT_VERSION}).`
    );
  }
  if (!Array.isArray(raw.layers) || raw.layers.length === 0) {
    throw new Error('this effect carries a SignalForge document with nothing in it to edit.');
  }

  const { doc, problems } = documentFromFile(raw, {
    notADocument: NOT_AN_EFFECT,
    embeddedOnly:
      'this effect carries an image that is not embedded in the file (it names a file '
      + 'instead), which SignalForge will not open — only embedded images are allowed.'
  });

  // The controls are left behind on purpose, and this is the one place the
  // document that comes back deliberately differs from the one in the file.
  //
  // An exported effect's `controls` are not part of the effect being EDITED:
  // they are built at export time from the document itself (effectControls in
  // src/export/effect-controls.js), they carry `bind` paths into that
  // document's own layer ids, and the next export builds them again from
  // scratch. Carrying them back into the window would put a list into the
  // user's project that nothing in the window edits, that the next export
  // overwrites anyway, and that would be written into any .sfx they save — a
  // build artefact travelling as if it were their work. What IS kept is
  // everything the controls were built FROM, including the inert
  // `motions: [{ kind: 'none' }]` entry withLiveMotion adds, because that one
  // is a real part of the document and is what the settings column offers a
  // motion to be chosen in.
  return { doc: { ...doc, controls: [] }, problems };
}
