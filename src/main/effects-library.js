// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max Leopold Blumenschein
// SPDX-License-Identifier: GPL-3.0-or-later
import { join } from 'node:path';
import { EFFECT_EXTENSION } from './export-effect.js';
import { COVER_EXTENSION } from './cover-image.js';
import { looksLikeEffect } from './effect-document.js';

/**
 * What is already in the effects folder.
 *
 * The library is not a second store of anything: the effects folder IS the
 * library, because that is where every export lands and it is the folder
 * SignalRGB itself lists. Nothing is indexed, nothing is copied, and there is
 * no state that can disagree with the disk — the answer is always read from the
 * folder at the moment it is asked for.
 *
 * `io` is injected for the same reason exportEffect's is: every case that
 * matters here (a folder that is not there, a file that is not one of ours, a
 * cover that is missing, a name that tries to leave the folder) can then be
 * checked against a filesystem living in a Map, without a disk and without an
 * effects folder anywhere near a real one. It needs:
 *
 *   list(folder)   -> string[]   the names directly in it, no recursion
 *   read(path)     -> string     the whole file, as text
 *   stat(path)     -> { size, modified }
 *   exists(path)   -> boolean
 */

/** A file name that could only have come from somewhere other than a listing. */
const SUSPICIOUS = /[\\/:*?"<>|]|^\.+$/;

/**
 * The largest file anything in this app reads out of the effects folder.
 *
 * WHY THERE HAS TO BE ONE AT ALL. Every read on this path is synchronous and
 * on the main thread (readFileSync in app/main.js), and the effects folder is
 * a folder OTHER programs write into. Without a bound, one 2 GB file dropped
 * in it — by another tool, by a bad download, by accident — freezes the whole
 * window for as long as it takes to read, and the window is the thing drawing
 * the preview. The size is known before a single byte is read (the listing
 * already stats every file for its cache key), so the bound costs nothing.
 *
 * WHY 4 MB, MEASURED RATHER THAN PICKED. An effect this app writes carries the
 * engine bundle plus its own document, and its pictures are scaled down to the
 * canvas height before being embedded (prepareImageAsset in
 * src/engine/asset-import.js), so the size is bounded in practice rather than
 * by hope. On Max' own machine, 11.08.2026: Verlauf.html 43,884 bytes,
 * Verlaufizughuiz.html 43,900, Verlaufizughuizhjikhgu.html 44,262,
 * SF Bergabend.html 66,375, MaxAmbient.html 78,652 — 44 to 79 KB. The largest
 * effect this project has ever produced came from the PNG era, before pictures
 * were embedded as JPEG: 169 KB.
 *
 * 4 MB is therefore about 50x the largest effect anybody has actually made and
 * about 24x the largest one that ever existed — room for an embedded picture
 * far bigger than the importer would ever produce, and for whatever a later
 * version of this app decides to carry, while still being a size a synchronous
 * read finishes in a few milliseconds. It is a bound against absurdity, not a
 * quota: no real effect can come near it, and nothing that does is one.
 */
export const MAX_EFFECT_BYTES = 4 * 1024 * 1024;

/** The sentence a file too large to be one of ours is refused with. */
export const oversizedMessage = (bytes) =>
  `this file is ${bytes} bytes, and SignalForge does not read anything larger than `
  + `${MAX_EFFECT_BYTES} bytes out of the effects folder — no effect is anywhere near that big.`;

const withoutExtension = (file) => file.slice(0, -(EFFECT_EXTENSION.length + 1));

/**
 * Every effect in the folder that this app can open again, newest first.
 *
 * WHAT IS LEFT OUT, AND WHY IT IS NOT MENTIONED
 *
 * An .html in that folder that carries no SignalForge document is somebody
 * else's effect — SignalRGB's own, one built by another tool, one from this
 * project's predecessor. It is not listed, because every tile in this library
 * is a tile that can be pressed: a shelf of items that answer a click with "this
 * cannot be opened" is a worse answer than a shelf that only holds what it
 * promises. `skipped` counts them so a caller CAN say so if it ever needs to.
 *
 * WHAT IT COSTS. Telling the two apart means reading each file, because the
 * document block sits at the end of it (after the engine), so there is nothing
 * cheaper to look at. Each answer is remembered against the file's own size and
 * modification time (`cache`), so a folder that has not changed is answered from
 * memory however often the window asks — which is what makes refreshing on every
 * window focus affordable.
 *
 * NEWEST FIRST, deliberately: the effect somebody just exported is the one they
 * are most likely to want back, and it is then the first tile in the strip
 * rather than somewhere alphabetical.
 *
 * AND NOTHING ENORMOUS IS EVER READ. The size is already known here — the
 * cache key is built from it — so a file above MAX_EFFECT_BYTES is counted as
 * skipped and stepped over WITHOUT io.read ever being called on it. That is
 * the whole of the protection: this is the only place that reads every file in
 * a folder somebody else can write into, and it reads them synchronously.
 */
export function listEffects({ folder, io, cache = null, maxBytes = MAX_EFFECT_BYTES }) {
  if (!folder || !io.exists(folder)) return { folder: folder ?? null, entries: [], skipped: 0 };

  const suffix = `.${EFFECT_EXTENSION}`;
  const entries = [];
  let skipped = 0;

  for (const file of io.list(folder)) {
    if (!file.toLowerCase().endsWith(suffix) || file.length === suffix.length) continue;
    const path = join(folder, file);

    let stat;
    try {
      stat = io.stat(path);
    } catch {
      // A file that vanished between the listing and this line, or one that
      // cannot be read at all. Not an error worth stopping a whole library for.
      continue;
    }

    // Before the read, and deliberately before the cache: the answer for a file
    // this size never depends on its contents, so there is nothing to remember
    // and nothing to look up. It is skipped exactly as an effect carrying no
    // document is skipped, and counted the same way — the strip says a file was
    // left out, and this is one of the two ways that can happen.
    if (stat.size > maxBytes) { skipped += 1; continue; }

    const key = `${path}|${stat.size}|${stat.modified}`;
    let openable = cache?.get(path)?.key === key ? cache.get(path).openable : null;
    if (openable === null) {
      try {
        openable = looksLikeEffect(io.read(path));
      } catch {
        openable = false;
      }
      cache?.set(path, { key, openable });
    }
    if (!openable) { skipped += 1; continue; }

    const base = withoutExtension(file);
    const cover = `${base}.${COVER_EXTENSION}`;
    entries.push({
      file,
      // The name SignalRGB lists it under, which is the file's own name: that
      // is what somebody is looking for when they go hunting for the effect
      // they made, and it is what the export writes the document's name into.
      name: base,
      // Whether the tile picture is already on disk. Null is not "no picture":
      // it is "not drawn yet" (see the cover handler in app/main.js), and every
      // effect exported before tile pictures existed is in exactly that state.
      cover: io.exists(join(folder, cover)) ? cover : null,
      bytes: stat.size,
      modified: stat.modified
    });
  }

  entries.sort((a, b) => (b.modified - a.modified) || a.name.localeCompare(b.name));
  return { folder, entries, skipped };
}

/**
 * The entry a name refers to, or null.
 *
 * THE ONLY WAY A NAME FROM OUTSIDE THIS PROCESS BECOMES A PATH.
 *
 * The window asks for an effect by the leaf name it was given in a listing, and
 * that name is the one thing on these two channels that a renderer could put
 * something of its own into. So it is never joined onto the folder and used: it
 * is looked UP in a freshly read listing, and only the string the filesystem
 * itself handed back is ever turned into a path. A name with a separator, a
 * drive letter or a `..` in it therefore cannot match anything — there is
 * nothing to escape, because no attacker-supplied string is ever used to build a
 * path in the first place. The explicit refusal below is belt and braces on top
 * of that, so the intent is readable rather than merely implied.
 */
export function findEffect({ folder, file, io, cache = null, maxBytes = MAX_EFFECT_BYTES }) {
  const name = String(file ?? '');
  if (name === '' || SUSPICIOUS.test(name)) return null;
  // The same listing, and therefore the same size bound: a file too large to be
  // listed is a file that cannot be found by name either, so no handler can
  // reach one through this door.
  const { entries } = listEffects({ folder, io, cache, maxBytes });
  return entries.find((entry) => entry.file === name) ?? null;
}

/** Where an entry's two files live. Never built from anything but an entry. */
export const effectPath = (folder, entry) => join(folder, entry.file);
export const coverPath = (folder, entry) => (entry.cover ? join(folder, entry.cover) : null);
