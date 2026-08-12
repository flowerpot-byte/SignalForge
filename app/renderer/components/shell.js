// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max Leopold Blumenschein
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * The frame the whole window is built in, and the empty regions it hands back.
 *
 * Three of them:
 *
 *   preview    the stage: the picture being built, its caption, the strip of
 *              tiles an effect can be started from
 *   inspector  the settings column, 300px, built of discrete cards
 *   footer     the transport bar across the bottom, full width
 *
 * WHY THE LEFT COLUMN IS GONE
 *
 * There was a fourth: a 200px navigation column of five entries. Four of them
 * scrolled the settings column to a heading that was already on screen beside
 * them, and the fifth swapped that column for the app's own settings. Max put
 * it in one sentence — "die linke Spalte ist unnötig da sie nur auf Dinge in
 * der rechten Spalte verweist" — and he is right: a table of contents for a
 * page that is entirely visible is not navigation, it is a second picture of
 * the thing standing next to the thing. The screenshot it was judged on
 * (work/design-pass-2/before/03-picture-loaded.png) shows what it cost: five
 * entries at the top, one pinned at the bottom, and some six hundred pixels of
 * empty column between them, on the same screen as a stage that was being
 * squeezed for width.
 *
 * So the column is gone and its 200px are the stage's. Its two real jobs were
 * kept and rehomed rather than dropped, both into the transport bar, which is
 * where this window's app-level furniture now lives: the wordmark (the
 * window's one <h1>) at the head of that bar, and the way into the app's own
 * settings as a marked toggle among its actions. See components/footer.js.
 *
 * That is the second column this window has lost, and both for the same
 * reason. The first was 260px of bordered nothing promising a layer list; this
 * one was full, and still said nothing the window was not already saying. The
 * rule stands and is now stated twice over: a region has to be the only place
 * something is said, or it is not a region.
 *
 * There is no `.panel` here either, and that too was measured: in the
 * reference not one region is a box. The stage sits directly on the page and
 * the settings column is page colour with cards ON it. Boxes exist only where
 * something is genuinely raised out of the surface it sits on — a card, a
 * tile, a control.
 *
 * The frame owns no text at all. The two region names a screen reader needs
 * are set from app/renderer/main.js on every language switch, so this element
 * is never rebuilt — which matters beyond tidiness: rebuilding it would throw
 * away the preview canvas and the render loop drawing into it.
 */
export function mountShell(root) {
  root.innerHTML = `
    <section class="stage-column" id="preview"><div id="preview-body"></div></section>
    <section class="settings-column" id="inspector">
      <div id="inspector-body"></div>
      <div id="settings-body" hidden></div>
    </section>
    <footer class="transport" id="footer"><div id="footer-body"></div></footer>
  `;

  return {
    // The stage column itself, which is a landmark once it has been named, and
    // the body inside it everything on the stage is built into.
    stage: root.querySelector('#preview'),
    preview: root.querySelector('#preview-body'),
    // The settings column itself — the element that scrolls, and the second
    // named landmark — as well as the body inside it that the cards are built
    // into. A new document scrolls that scroller back to the top, which is the
    // whole of what is left of the old left column's machinery.
    column: root.querySelector('#inspector'),
    inspector: root.querySelector('#inspector-body'),
    settings: root.querySelector('#settings-body'),
    footer: root.querySelector('#footer-body')
  };
}
