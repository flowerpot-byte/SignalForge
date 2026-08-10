// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * The frame the whole window is built in, and the empty regions it hands back.
 *
 * Four of them now, in the shape SignalRGB's own window has:
 *
 *   nav        the left column, 200px, the destinations
 *   preview    the stage: the picture being built, its caption, the strip of
 *              tiles an effect can be started from
 *   inspector  the settings column, 300px, built of discrete cards
 *   footer     the transport bar across the bottom, beside the nav
 *
 * There is no `.panel` any more, and that is the largest single change in this
 * file. Every region used to be a translucent, blurred, 14px-rounded box with
 * a hairline around it, floating on a tinted backdrop; in the reference not
 * one of these regions is a box at all. The stage sits directly on the page,
 * the settings column is page colour with cards ON it, and the left column is
 * simply a lighter field. Boxes only exist where something is genuinely raised
 * out of the surface it sits on — a card, a tile, a control.
 *
 * There is still no layer region and still no layer list: that is a later task
 * and inventing a column for it would repeat exactly the mistake this window
 * has already been through once.
 *
 * The frame owns no text at all any more. Everything the old `relabel()` said
 * has moved to the piece that owns it — the left column's caption to
 * components/sidebar.js — so a language switch never has to touch this file
 * and can therefore never rebuild it. That matters beyond tidiness: rebuilding
 * this element would throw away the preview canvas and the render loop drawing
 * into it.
 */
export function mountShell(root) {
  root.innerHTML = `
    <nav class="nav" id="nav"></nav>
    <section class="stage-column" id="preview"><div id="preview-body"></div></section>
    <section class="settings-column" id="inspector">
      <div id="inspector-body"></div>
      <div id="settings-body" hidden></div>
    </section>
    <footer class="transport" id="footer"><div id="footer-body"></div></footer>
  `;

  return {
    nav: root.querySelector('#nav'),
    preview: root.querySelector('#preview-body'),
    // The settings column itself — the element that scrolls — as well as the
    // body inside it that the cards are built into. The left column has to
    // reach the scroller to say where it is going and to hear where it ended
    // up (see showSection in app/renderer/main.js).
    column: root.querySelector('#inspector'),
    inspector: root.querySelector('#inspector-body'),
    settings: root.querySelector('#settings-body'),
    footer: root.querySelector('#footer-body')
  };
}
