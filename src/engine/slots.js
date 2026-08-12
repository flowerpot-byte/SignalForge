// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * THE BACKGROUND SLOT — which layer in a document is which.
 *
 * The engine has always drawn `doc.layers` in order and has never cared how
 * many there are. What it did not have was a WORD for the two positions the app
 * actually edits, and without one every caller invented its own: the settings
 * column read `layers[0]`, the crop read `layers[0]`, the export bound its
 * controls to `layers[0].id`. That was correct for exactly as long as there
 * could only ever be one layer.
 *
 * There can be two now: an optional background underneath, and the foreground
 * somebody was already editing. So the two positions get names here, once, and
 * every consumer asks this file rather than counting.
 *
 * ===========================================================================
 * ID OR INDEX — THE DECISION, WRITTEN DOWN ONCE
 * ===========================================================================
 *
 * Both are used, for different lengths of time, and mixing them up is the whole
 * hazard this file exists to remove:
 *
 *   POSITION says which SLOT a layer is in. The background is layers[0] and the
 *   foreground is the last one — that is the whole convention, and it is a
 *   property of the array rather than of any layer. It has to be position and
 *   not a flag on the layer, because position is what the renderer already
 *   reads: "underneath" MEANS "drawn first", and a `role: 'background'` field
 *   that disagreed with the draw order would be a lie the renderer could not
 *   see.
 *
 *   ID says which LAYER it is, for as long as anybody needs to refer to one
 *   across a change. Every stored reference in this project is an id: an
 *   exported control's bind path is "<layerId>.stops.0.color" and is resolved
 *   against the live document on every frame (resolveLayerPath in bind.js), and
 *   preview.setLayerOffset takes an id.
 *
 *   INDEX is a DERIVATION with a lifetime of one render. The settings column's
 *   field paths ("layers.1.color") are built by looking an id up in the array
 *   at the moment the column is described, and the column is rebuilt from
 *   scratch whenever the document's shape changes — which is exactly what
 *   adding or removing a background is. No index is ever stored, saved,
 *   exported or held across a mutation, so inserting a layer at 0 cannot
 *   renumber anything that outlives the insertion.
 *
 * That is why adding a background does not disturb the foreground: the
 * foreground's identity is its id (unchanged), its paths are rebuilt (now
 * layers.1...), and its crop, its offset and its exported bindings never named
 * a number in the first place.
 *
 * ===========================================================================
 * TWO SLOTS, AND WHAT HAPPENS TO A THIRD LAYER — SAID OUT LOUD
 * ===========================================================================
 *
 * There are exactly two NAMES here, `backgroundOf` and `foregroundOf`, and
 * between them there is no name for anything else. A document with three or
 * more layers is therefore not refused, not repaired and not hidden — it
 * RENDERS in full, because the engine has always drawn `doc.layers` in order
 * and still does, background first, everything else on top of it — but the
 * settings column can only describe the two ends of it. A middle layer gets no
 * card, no slider and no colour well: it is drawn, it is saved, it survives an
 * export and a round trip untouched, and there is no way to change it from
 * inside the window.
 *
 * That is a limit and not an accident, and it is the honest shape of "two
 * slots, not a layer system". The alternative — describing every layer — is a
 * layer list, which is Bauplan 3, and building half of it here would leave the
 * app with a column that can edit three layers and a document model that still
 * only has two words for where a layer can be.
 *
 * The window cannot produce such a document on its own: a project file written
 * by hand can, and so can adding a background to a two-layer document whose
 * first layer is a picture (see withBackgroundKind below, which inserts rather
 * than rewrites). Both then have a middle layer, and both keep it.
 *
 * Pure arithmetic over a plain array, no DOM and no Node, so the window, the
 * exporter and node:test all read the same answers.
 */

/**
 * The id a background is proposed under when one is added.
 *
 * PROPOSED, not guaranteed — and nothing may look a background up by it. A
 * hand-written document is allowed to have called its only layer "background",
 * and then the new one is called "background-2" instead (see freeId below).
 * The slot is the position; this constant only decides what the layer is
 * CALLED, which matters because these documents are saved as JSON and read by
 * people.
 *
 * WHICH OF THE TWO GIVES WAY, AND WHY IT IS THIS ONE. Left to itself
 * normalizeDocument would settle the collision the other way round: it keeps
 * the FIRST layer's id and renames the later one, a background is inserted at
 * the front, so the NEW layer would keep "background" and the layer that was
 * already there would silently become "background-2". That is the wrong way
 * round. An id is what this app holds on to across a change — the crop calls
 * preview.setLayerOffset(id), an exported control's bind path is
 * "<layerId>.stops.0.color" — so renaming a layer somebody already has is a
 * change with consequences, while renaming one nothing has heard of yet has
 * none. The new layer therefore takes the suffix.
 */
export const BACKGROUND_LAYER_ID = 'background';

/**
 * What a background can be: nothing, one colour, or a gradient.
 *
 * The list a combobox is built from, in the app and — through the app — in the
 * order somebody meets them. "none" is first because it is where every document
 * starts and what removing one goes back to.
 *
 * WHY ONLY THESE TWO LAYER TYPES. A background is the thing every other layer
 * is seen against, so it has to cover the canvas: a solid and a gradient are
 * the two types in this engine that do, by construction, at every setting.
 * `shape` and `particles` draw on transparent ground — a background made of
 * those would be a second foreground with nothing behind it — and `image`
 * cannot be started from here at all, because a picture arrives by being
 * imported and the settings column has no way to ask for a file.
 */
export const BACKGROUND_KINDS = Object.freeze(['none', 'solid', 'gradient']);

/** The layer the app edits: the last one, or null in an empty document. */
export function foregroundOf(layers) {
  const list = Array.isArray(layers) ? layers : [];
  return list.length > 0 ? list[list.length - 1] : null;
}

/**
 * The background underneath it, or null.
 *
 * Two layers or more, AND a first layer of a kind the slot can actually hold
 * — one gate, not two readings. This function used to answer by position
 * alone (any first layer of any two-layer document), while withBackgroundKind
 * had already learned the hard way that position alone lies for a
 * hand-written document whose first layer is a picture (see its note below:
 * "Kein Hintergrund" DELETED that picture once). Every consumer that asked
 * the positional question then dressed a picture in background controls the
 * engine never honoured — review caught export-effect.js doing exactly that.
 * Now the two readings are one: a first layer that is not a background KIND
 * is not a background, it is the bottom of the stack (foregroundLayersOf).
 *
 * One layer is the foreground alone — which is what every document this app
 * ever wrote before the slot existed, so an old project opens with no
 * background without anything having to be stored to say so.
 */
export function backgroundOf(layers) {
  const list = Array.isArray(layers) ? layers : [];
  if (list.length < 2) return null;
  const first = list[0];
  return first && BACKGROUND_KINDS.includes(first.type) ? first : null;
}

/** Which entry of BACKGROUND_KINDS the document is currently showing. */
export function backgroundKindOf(layers) {
  return backgroundOf(layers)?.type ?? 'none';
}

/**
 * A name for the new background that is not already taken.
 *
 * Deliberately the same rule and the same spelling normalizeDocument uses for a
 * duplicate id ("<id>-2", climbing) so that a document written by this file and
 * a document repaired by that one cannot end up with two different conventions
 * for the same situation.
 */
function freeId(layers) {
  const taken = new Set(layers.map((layer) => (layer && typeof layer === 'object' ? layer.id : null)));
  if (!taken.has(BACKGROUND_LAYER_ID)) return BACKGROUND_LAYER_ID;
  let n = 2;
  while (taken.has(`${BACKGROUND_LAYER_ID}-${n}`)) n += 1;
  return `${BACKGROUND_LAYER_ID}-${n}`;
}

/**
 * The same layers with the background set to `kind`.
 *
 * Hands back a new array and never touches the one it was given: the caller
 * passes the result to setDocument, which runs it through normalizeDocument —
 * so every field a new background needs (its colour, its stops, its bands) is
 * filled in there and named nowhere here. That is the same discipline
 * starterDocument follows in app/renderer/main.js, and it is what keeps the
 * window free of colours of its own (test/app/color-literals.test.js).
 *
 * SWITCHING KIND KEEPS THE LAYER. Going from Farbfläche to Verlauf rewrites the
 * type of the layer that is already there rather than throwing it away and
 * making another, so its motions survive the switch — somebody who set a
 * background breathing and then wanted a gradient instead does not have to set
 * it up again. What does not survive is a field the new type has no branch for
 * (a solid's `color` on a gradient): normalizeLayer builds each type's object
 * from scratch, so it is dropped there, honestly and in one place.
 *
 * A document with no layers at all gets nothing: the first layer of an empty
 * document would be the FOREGROUND by the rule above, so "add a background"
 * with nothing to put it behind is not a thing to do.
 *
 * WHAT COUNTS AS "THERE IS ALREADY ONE" — and it is backgroundKindOf and NOT
 * backgroundOf, which is a distinction worth a paragraph because getting it
 * wrong was a real bug.
 *
 * backgroundOf answers a question about POSITION: the first layer of any
 * document with two or more, whatever it happens to be. backgroundKindOf asks
 * the narrower one this function needs — is the first layer something the
 * combobox can actually SHOW? The window can only build documents where those
 * two agree, but a project file is JSON and a person may write one by hand: a
 * picture fitted inside the canvas with a figure on it is two layers whose
 * first is an `image`, and the combobox reads that as "Keiner" because `image`
 * is not one of BACKGROUND_KINDS.
 *
 * Writing has to agree with reading, or the control lies. Asking backgroundOf
 * meant "Farbfläche" REWROTE that picture's layer into a colour and "Keiner" —
 * the entry already selected, so the easiest thing in the world to click by
 * accident — DELETED it. Now a first layer that is not a background kind is not
 * a background: a new one is inserted in front of it, and removing one that was
 * never there does nothing at all.
 */
export function withBackgroundKind(layers, kind) {
  const list = Array.isArray(layers) ? [...layers] : [];
  if (list.length === 0) return list;
  const hasBackground = backgroundKindOf(list) !== 'none';

  if (kind === 'none') {
    return hasBackground ? list.slice(1) : list;
  }
  if (!BACKGROUND_KINDS.includes(kind)) return list;

  if (hasBackground) {
    list[0] = { ...list[0], type: kind };
    return list;
  }
  return [{ id: freeId(list), type: kind, motions: [] }, ...list];
}

// ===========================================================================
// THE LAYER STACK — Bauplan 3's arithmetic, and only its arithmetic
// ===========================================================================
//
// Everything the layer list can DO to a document, as pure array operations:
// which layers it shows, and what the stack becomes when one is added, moved
// or removed. The list itself (cards, buttons, selection) is the window's;
// the selection especially is renderer STATE and never a document field —
// which layer somebody is looking at is not part of what the effect is.
//
// The background slot stays exactly what it has always been, and every
// operation here treats it by the same reading withBackgroundKind settled on:
// backgroundKindOf, not backgroundOf. A hand-written document whose first
// layer is a picture has NO background — that picture is simply the bottom of
// the stack, which also, at last, gives the "middle layer" the top of this
// file admits to having no words for a card of its own.

/**
 * The layers the stack shows, bottom first — everything above the background
 * slot, or everything there is when nothing holds that slot.
 */
export function foregroundLayersOf(layers) {
  const list = Array.isArray(layers) ? layers : [];
  return backgroundKindOf(list) !== 'none' ? list.slice(1) : [...list];
}

/** Where the stack begins in the document's own array. */
function stackStart(list) {
  return backgroundKindOf(list) !== 'none' ? 1 : 0;
}

/**
 * The same layers with `id` moved one step through the stack. `direction` is
 * +1 towards the foreground (drawn later, shown higher) and -1 towards the
 * background. A step that would leave the stack — past the top, into the
 * background slot — hands the list back untouched, exactly as
 * withBackgroundKind answers a request that means nothing.
 */
export function movedLayer(layers, id, direction) {
  const list = Array.isArray(layers) ? [...layers] : [];
  // Only the two documented steps ARE steps: a 0 or a NaN out of some future
  // caller's arithmetic must mean nothing, not quietly mean "down".
  if (direction !== 1 && direction !== -1) return list;
  const at = list.findIndex((layer) => layer && layer.id === id);
  const to = at + direction;
  if (at < stackStart(list) || to < stackStart(list) || to >= list.length) return list;
  [list[at], list[to]] = [list[to], list[at]];
  return list;
}

/**
 * The same layers without `id` — for a layer of the STACK. The background
 * slot is withBackgroundKind's to empty (one responsibility each), and the
 * last stack layer stays: a document whose only remaining layer was removed
 * would promote the background to foreground by pure position, silently
 * changing what every slot word means.
 */
export function withoutLayer(layers, id) {
  const list = Array.isArray(layers) ? [...layers] : [];
  const at = list.findIndex((layer) => layer && layer.id === id);
  if (at < stackStart(list)) return list;
  if (list.length - stackStart(list) <= 1) return list;
  list.splice(at, 1);
  return list;
}

/**
 * The same layers with a fresh layer of `type` on top of the stack. The id
 * follows freeId's own convention ("<type>", then "<type>-2", climbing), and
 * the layer names nothing but its type — normalizeDocument fills in every
 * field, exactly as withBackgroundKind's new background lets it.
 *
 * `layers` must come from a NORMALIZED document, like every input in this
 * file: hand it a list already carrying duplicate ids and normalizeDocument's
 * own left-to-right rename can afterwards collide with the id chosen here
 * and move it on ("shape-2" becoming "shape-2-2"). The app never holds an
 * un-normalized document, so this is a contract stated rather than a branch
 * defended.
 */
export function withAddedLayer(layers, type) {
  const list = Array.isArray(layers) ? [...layers] : [];
  const taken = new Set(list.map((layer) => (layer && typeof layer === 'object' ? layer.id : null)));
  let id = type;
  let n = 2;
  while (taken.has(id)) { id = `${type}-${n}`; n += 1; }
  return [...list, { id, type, motions: [] }];
}

/**
 * The foreground types that leave ground for a background to be seen on.
 *
 * `shape` draws one figure and `particles` draws a swarm; everything they do
 * not cover stays exactly as it was, which is the whole reason
 * docs/effekt-inventur.md puts those two types first for the trail as well.
 */
export const TRANSPARENT_GROUND_TYPES = Object.freeze(['shape', 'particles']);

/**
 * Whether a background under THIS foreground could be seen at all.
 *
 * The rule motionKindsFor already sets for motions, applied to a section: only
 * offer what does something. A solid and a gradient paint every pixel of the
 * canvas opaquely at every setting, and a picture at `cover` or `stretch` does
 * too — under any of those a background is provably invisible, and a whole
 * section of controls that cannot change a byte is worse than a section nobody
 * was offered.
 *
 * A PICTURE AT `contain` IS THE INTERESTING CASE and it is offered. `contain`
 * fits the whole picture inside the canvas, which leaves bars along two edges;
 * the image renderer draws only the fitted rectangle, so those bars are
 * whatever was drawn before it — black today, and a background tomorrow. That
 * is a real thing to want, so it is offered, and it follows the fit dropdown
 * two rows up exactly as the gradient's angle follows its shape.
 */
export function showsBackground(layer) {
  if (!layer || typeof layer !== 'object') return false;
  if (TRANSPARENT_GROUND_TYPES.includes(layer.type)) return true;
  return layer.type === 'image' && layer.fit === 'contain';
}

/**
 * Whether the settings column should offer the background section.
 *
 * The offer gives way, never the value — the same rule widenToInclude and
 * motionKindsWide follow. A document that ALREADY carries a background always
 * gets the section, whatever the foreground has since become: switching a
 * picture from `contain` to `cover` with a background under it must leave a way
 * to take that background off again, and a section that vanished with the
 * setting that justified it would be a stored thing nobody can reach.
 */
export function offersBackground(layers) {
  const list = Array.isArray(layers) ? layers : [];
  if (backgroundOf(list) !== null) return true;
  return showsBackground(foregroundOf(list));
}
