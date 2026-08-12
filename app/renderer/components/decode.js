// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max Leopold Blumenschein
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Turn an embedded picture into something that can be measured and drawn.
 *
 * WHY THIS IS ITS OWN FILE. Every document that reaches the stage passes
 * through here first — a dropped picture, an opened project, an effect reopened
 * out of the library — and it is the one step in that path that waits on
 * something the app does not control: a decoder, handed bytes that came out of
 * a file somebody else may have written.
 *
 * A promise that never settles is the failure mode nobody sees. An <img> is not
 * obliged to fire onload or onerror — a stalled data: URI and a browser quirk
 * have both been known to produce exactly that — and everything upstream of
 * this awaits it. Without a watchdog, one such picture leaves the window with
 * the previous document still on the stage, a tile press that never finishes,
 * and not a word said about why.
 *
 * `Image` and `timeoutMs` are parameters so that this can be proved rather than
 * asserted: a test hands over an image that settles late, never, or twice, and
 * checks what comes back. That cannot be done against the global.
 */

/**
 * How long one picture is given.
 *
 * The same five seconds the engine gives each of its own assets
 * (DEFAULT_ASSET_TIMEOUT_MS in src/engine/engine.js), deliberately: the same
 * job on the same kind of data, and two budgets to keep in step would be one
 * too many. Long enough that a large picture on a busy machine is never cut
 * off, short enough that one which is never going to arrive does not hold the
 * window open forever.
 */
export const ASSET_DECODE_TIMEOUT_MS = 5000;

export const DECODE_FAILED = 'a picture in this project could not be decoded';
export const DECODE_TIMED_OUT = 'a picture in this project took too long to decode';

/**
 * @param {{ mime: string, data: string }} asset  an embedded picture
 * @returns {Promise<HTMLImageElement>}  rejects, with a sentence, if the
 *          picture cannot be decoded or does not arrive in time.
 *
 * A rejection rather than a resolve on timeout, unlike the engine's own
 * watchdog: the engine is drawing a frame, and a missing picture there is a
 * frame without it. This decides whether a whole document may go on the stage,
 * and the answer for a picture that is not coming is no — the caller keeps
 * what the user already had open and says so.
 */
export function decodeAsset(asset, {
  ImageElement = globalThis.Image,
  timeoutMs = ASSET_DECODE_TIMEOUT_MS
} = {}) {
  return new Promise((resolve, reject) => {
    const image = new ImageElement();
    let settled = false;

    const watchdog = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error(DECODE_TIMED_OUT));
    }, timeoutMs);

    // Whichever of the three arrives first wins, and the other two are then
    // silent: a decoder that fires onerror after onload (or after the watchdog
    // has already given up) must not turn a document that is on the stage into
    // a failure message about it.
    const once = (finish) => () => {
      if (settled) return;
      settled = true;
      clearTimeout(watchdog);
      finish();
    };

    image.onload = once(() => resolve(image));
    image.onerror = once(() => reject(new Error(DECODE_FAILED)));
    image.src = `data:${asset.mime};base64,${asset.data}`;
  });
}
