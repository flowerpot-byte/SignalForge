// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max Leopold Blumenschein
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * The tile picker's two gestures, as a factory over injected seams — main.js
 * hands in the dialog bridge, the live document and the three "something
 * changed" calls, so the whole of it is testable in plain node (review of the
 * first version found a real leak in here that no test could have caught
 * while this logic lived inline in boot()).
 *
 * WHAT choose() KEEPS TIDY: picking a picture twice must not leave the first
 * tile behind as an orphan. Every choose() first removes the OLD cover's
 * asset by exactly the rule clear() uses — unless a layer draws it, because a
 * hand-written document may point `cover` at a layer's own picture and
 * choosing a new tile must not blank that layer.
 */
export function createCoverPicker({
  chooseCover, getDocument, setDocument, markChanged, refresh, onError
}) {
  /** The document's assets without the current cover's, under clear()'s rule. */
  function withoutOldCover(doc) {
    const assets = { ...doc.assets };
    if (doc.cover && !doc.layers.some((layer) => layer.asset === doc.cover)) {
      delete assets[doc.cover];
    }
    return assets;
  }

  return {
    async choose() {
      const result = await chooseCover();
      if (!result || !result.ok) {
        if (result && !result.canceled) onError(result.message);
        return;
      }
      const doc = getDocument();
      const assets = withoutOldCover(doc);
      let id = 'cover';
      let n = 2;
      while (Object.prototype.hasOwnProperty.call(assets, id)) { id = `cover-${n}`; n += 1; }
      await setDocument({ ...doc, cover: id, assets: { ...assets, [id]: result.asset } });
      markChanged();
      refresh();
    },
    async clear() {
      const doc = getDocument();
      if (!doc.cover) return;
      await setDocument({ ...doc, cover: null, assets: withoutOldCover(doc) });
      markChanged();
      refresh();
    }
  };
}
