// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * The window's icons, drawn here rather than downloaded.
 *
 * A dozen geometric glyphs is all this app needs, and hand-authoring them buys
 * three things an icon library cannot: no dependency (`dependencies` in
 * package.json stays empty, which is a promise this project makes), no licence
 * question to answer before anybody may ship it, and — the one that actually
 * shows on screen — one stroke weight and one corner style across every glyph,
 * because they are all drawn on the same 16 x 16 grid by the same hand.
 *
 * Every glyph is:
 *   - on a 16 x 16 viewBox, aligned to whole or half pixels so a 1.5px stroke
 *     lands crisply at 100% zoom;
 *   - stroked in `currentColor` and never filled, so an icon inherits the
 *     state of whatever it sits in — a disabled button, an active nav entry,
 *     the one filled action — with no second set of colours anywhere;
 *   - round-capped and round-joined, which is the only corner style in the
 *     set.
 *
 * Accessibility is a parameter, not an afterthought. `icon(name)` with no
 * label is decoration and gets `aria-hidden="true"`, which is right whenever a
 * text label sits beside it; `icon(name, label)` is a glyph standing alone and
 * gets `role="img"` and that accessible name. There is no third case.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * createElementNS where there is one, createElement where there is not.
 *
 * test/app/inspector-mount.test.js runs the settings column against a hand-made
 * stand-in DOM with no namespaces in it (there is no jsdom in this project),
 * and the settings column now puts an icon in its heading. Falling back keeps
 * that test testing what it is about — where a failed change is reported — and
 * not the shape of an SVG element.
 */
function create(tag) {
  return document.createElementNS ? document.createElementNS(SVG_NS, tag) : document.createElement(tag);
}

/**
 * The set. Each entry is a list of [tag, attributes] pairs — data, not markup
 * strings, so nothing here is ever handed to innerHTML.
 *
 * Read them as sentences: `image` is a frame with a hill and a sun in it,
 * `motion` is two waves, `colour` is a drop, `spark` is a bolt.
 */
const GLYPHS = Object.freeze({
  /** The app's own mark: a bolt inside a rounded square. */
  mark: [
    ['rect', { x: 1.5, y: 1.5, width: 13, height: 13, rx: 3.5 }],
    ['path', { d: 'M8.8 4.4 6 8.4h2.6L7.2 11.6l3.2-4.2H7.8z' }]
  ],
  /** A picture: a frame, a hill, a sun. */
  image: [
    ['rect', { x: 1.5, y: 2.5, width: 13, height: 11, rx: 2 }],
    ['path', { d: 'M1.5 10.5 5 7l4 4' }],
    ['path', { d: 'M9 11 11 9l3.5 3' }],
    ['circle', { cx: 10.5, cy: 5.5, r: 1.2 }]
  ],
  /** Motion: two waves, the lower one trailing the upper. */
  motion: [
    ['path', { d: 'M1.5 6c1.6-2.2 3.2-2.2 4.8 0s3.2 2.2 4.8 0 3.2-2.2 3.4-1' }],
    ['path', { d: 'M1.5 11c1.6-2.2 3.2-2.2 4.8 0s3.2 2.2 4.8 0 3.2-2.2 3.4-1' }]
  ],
  /** Colour: a drop. */
  colour: [
    ['path', { d: 'M8 1.6c2.6 3 4.2 5.1 4.2 7.1a4.2 4.2 0 0 1-8.4 0c0-2 1.6-4.1 4.2-7.1z' }],
    ['path', { d: 'M5.9 9.2a2.1 2.1 0 0 0 2.1 2.1' }]
  ],
  /**
   * Settings: a gear — a hub, the body around it, and eight teeth outside that.
   *
   * It was a hub and eight ticks with no body, described here as "a gear
   * without the teeth", and it was fine for as long as it had the word
   * "Einstellungen" beside it in the left column. It has no word beside it any
   * more (see components/footer.js: the way into the app's settings is now a
   * glyph button in the transport bar), and standing alone that drawing is a
   * SUN — which in an app whose settings column has a brightness slider in it
   * is not an ambiguity worth keeping. The ring is the whole difference
   * between a sun and a gear, so the ring is there now.
   */
  settings: [
    ['circle', { cx: 8, cy: 8, r: 4.7 }],
    ['circle', { cx: 8, cy: 8, r: 1.6 }],
    ['path', { d: 'M8 1.7v1.6M8 12.7v1.6M1.7 8h1.6M12.7 8h1.6M3.55 3.55l1.15 1.15M11.3 11.3l1.15 1.15M12.45 3.55L11.3 4.7M4.7 11.3l-1.15 1.15' }]
  ],
  /** Add. */
  plus: [['path', { d: 'M8 3.5v9M3.5 8h9' }]],
  /** Remove. */
  minus: [['path', { d: 'M3.5 8h9' }]],
  /**
   * Back where it started: an arrow that goes round rather than back.
   *
   * Deliberately NOT a cross and not a bin. Both of those say "get rid of
   * this", and what this button does is the opposite — it puts a value back to
   * the one a fresh document carries, which is a return and not a removal. The
   * open circle with the arrowhead at its start is the shape every undo and
   * every revert in every tool this app sits beside already uses, which is the
   * whole argument for it: nothing here has to be learned.
   *
   * Anticlockwise, because clockwise is "again" (a reload) and anticlockwise is
   * "back" (an undo), and this is the second of those.
   */
  revert: [
    ['path', { d: 'M3.4 8a4.6 4.6 0 1 0 1.5-3.4' }],
    ['path', { d: 'M2.6 3.2v3.1h3.1' }]
  ],
  /** Open: a folder. */
  folder: [
    ['path', { d: 'M1.5 12.5v-9h4.2l1.6 2h7.2v7z' }]
  ],
  /** Save: a tray with an arrow coming down into it. */
  save: [
    ['path', { d: 'M8 2v7.5' }],
    ['path', { d: 'M5 6.8 8 9.8l3-3' }],
    ['path', { d: 'M2.5 11v2.5h11V11' }]
  ],
  /** The one action the app is for: a bolt leaving for SignalRGB. */
  spark: [
    ['path', { d: 'M9.4 1.5 4 8.8h3.6L6.6 14.5 12 7.2H8.4z' }]
  ],
  /** A file coming in: a picture with a plus on it. */
  imagePlus: [
    ['path', { d: 'M14.5 8V4.5a2 2 0 0 0-2-2h-9a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2H8' }],
    ['path', { d: 'M1.8 10.8 5 7.6l3 3' }],
    ['circle', { cx: 10.3, cy: 5.6, r: 1.1 }],
    ['path', { d: 'M11.5 12.5h4M13.5 10.5v4' }]
  ],
  /** A flat field of one colour. */
  solid: [
    ['rect', { x: 2.5, y: 2.5, width: 11, height: 11, rx: 2 }],
    ['path', { d: 'M5 11 11 5' }]
  ],
  /** A gradient: a field with a ramp across it. */
  gradient: [
    ['rect', { x: 2.5, y: 2.5, width: 11, height: 11, rx: 2 }],
    ['path', { d: 'M2.5 9.5 13.5 4.5' }],
    ['path', { d: 'M2.5 12.5 13.5 7.5' }]
  ],
  /** A radial gradient: the same field, with the ramp running outwards. */
  radial: [
    ['rect', { x: 2.5, y: 2.5, width: 11, height: 11, rx: 2 }],
    ['circle', { cx: 8, cy: 8, r: 1.3 }],
    ['circle', { cx: 8, cy: 8, r: 4 }]
  ],
  /** The angle of a gradient: a ray turned away from a baseline. */
  angle: [
    ['path', { d: 'M2.5 13.5h11' }],
    ['path', { d: 'M2.5 13.5 12 4' }],
    ['path', { d: 'M8.5 13.5a6 6 0 0 0-1.2-3.5' }]
  ],
  /**
   * The background: one field standing BEHIND another.
   *
   * Two overlapping rounded squares, the back one offset up and left so a
   * corner of it stays visible past the front one — which is the whole sentence
   * this section is about, and the only way to say it in sixteen pixels. It is
   * deliberately not the `solid` or the `gradient` glyph: a background is
   * either of those, so borrowing one of them would name the wrong half of the
   * choice, and both are already spoken for by the "Fläche" heading and the
   * starting gallery's own tiles.
   */
  background: [
    ['rect', { x: 1.5, y: 1.5, width: 9, height: 9, rx: 2 }],
    ['rect', { x: 5.5, y: 5.5, width: 9, height: 9, rx: 2 }]
  ],
  /** The drop target, and the empty stage's own sign. */
  drop: [
    ['path', { d: 'M8 1.8v7.4' }],
    ['path', { d: 'M4.8 6 8 9.2 11.2 6' }],
    ['path', { d: 'M2.5 11.5v1a1.5 1.5 0 0 0 1.5 1.5h8a1.5 1.5 0 0 0 1.5-1.5v-1' }]
  ]
});

/** Every glyph there is, so a test can walk the set without repeating it. */
export const ICON_NAMES = Object.freeze(Object.keys(GLYPHS));

/**
 * One icon, ready to append.
 *
 * @param {string} name  a key of GLYPHS; an unknown one throws rather than
 *                       silently producing an empty box, because an icon that
 *                       is not there is a button nobody can read.
 * @param {string|null} label  the accessible name when the glyph stands alone.
 *                       Leave it out whenever a text label sits beside it —
 *                       the icon is then decoration and is hidden from the
 *                       accessibility tree so the button is not announced
 *                       twice.
 */
export function icon(name, label = null) {
  const parts = GLYPHS[name];
  if (!parts) throw new Error(`no such icon: ${name}`);

  const svg = create('svg');
  // The size, the weight, the corner style and `currentColor` are stated once
  // for the whole set on `.icon` in styles/app.css rather than as presentation
  // attributes here — a presentation attribute cannot read a custom property,
  // and "one stroke weight" has to be a token somebody can change in one place
  // rather than a promise repeated on 14 elements.
  svg.setAttribute('class', 'icon');
  svg.setAttribute('viewBox', '0 0 16 16');

  if (label) {
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', label);
  } else {
    svg.setAttribute('aria-hidden', 'true');
  }

  for (const [tag, attributes] of parts) {
    const node = create(tag);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
    svg.append(node);
  }
  return svg;
}
