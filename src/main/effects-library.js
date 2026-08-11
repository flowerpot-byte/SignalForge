// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
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
 */
export function listEffects({ folder, io, cache = null }) {
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
export function findEffect({ folder, file, io, cache = null }) {
  const name = String(file ?? '');
  if (name === '' || SUSPICIOUS.test(name)) return null;
  const { entries } = listEffects({ folder, io, cache });
  return entries.find((entry) => entry.file === name) ?? null;
}

/** Where an entry's two files live. Never built from anything but an entry. */
export const effectPath = (folder, entry) => join(folder, entry.file);
export const coverPath = (folder, entry) => (entry.cover ? join(folder, entry.cover) : null);
