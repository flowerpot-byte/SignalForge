// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import { icon } from './icons.js';
import { SUPPORTED_IMAGE_EXTENSIONS } from './drop.js';

/**
 * How an effect begins.
 *
 * This is the strip of tiles under the stage, in the place SignalRGB puts its
 * own effect gallery — and it is the answer to a complaint about this app that
 * had no answer before: there was no way to start an effect without a picture.
 * Dragging a file in was the ONLY entrance, which meant somebody who wanted a
 * plain colour or a gradient simply could not begin.
 *
 * Every tile is real. The ones that were marked "Bald" / "Soon" when this
 * strip was first built were waiting on layer types the engine did not have;
 * it has them (src/engine/layers/solid.js and gradient.js), so the badge, the
 * dashed edge and the `disabled` are gone rather than left standing as
 * decoration. Nothing here decides what a tile MEANS: the picture tile hands
 * over a `File` and every other tile hands over its own key, and
 * app/renderer/main.js turns that into a document.
 *
 * The counts are deliberately not written down in this file. There were three
 * starting tiles, then four, and there are six now beside the picture one —
 * and a comment saying "the four tiles" outlives every one of those changes
 * while quietly becoming false. TILES below is the count.
 *
 * WHAT A TILE SHOWS, AND WHY IT CANNOT LIE
 *
 * Every tile that starts something draws its own output on itself:
 * a real 320 x 200 canvas, the engine's own renderer, frame zero of the very
 * document pressing the tile produces. The document is not described here — it
 * is asked for (`starterDocument(kind)`, defined once in main.js and used by
 * startEffect there), so a tile and the effect it starts are the SAME data
 * passing through the SAME normalizeDocument and the SAME layer renderer.
 * There is no second description of a starting colour anywhere for the picture
 * to drift away from, which is the only reliable way to keep it honest: a hand-
 * drawn swatch, or a CSS gradient built from the same stops, would be a second
 * implementation, and this project has been bitten by exactly that before.
 * Change DEFAULT_SOLID_COLOR in src/engine/document.js and the tile changes
 * with it, without a line here being touched.
 *
 * Frame zero, once, at mount: these documents carry no motions, so they are
 * still pictures — there is nothing for a loop to animate, and three extra
 * render loops under the stage would cost frames the stage needs.
 *
 * ===========================================================================
 * AND THIS STRIP IS ALSO THE EFFECT LIBRARY
 * ===========================================================================
 *
 * The seam left here said the library goes in this strip, and it does. What it
 * asked for above everything else was that nobody build a second strip beside
 * this one, a fifth column, or a modal — the three shapes this window has
 * already been talked out of. None of the three is here: the library is the
 * same shelf, in the same place, made of the same tiles.
 *
 * WHY IT IS TWO TABS AND NOT ONE LONGER RAIL
 *
 * The obvious reading of the old note was "more entries in TILES". It was tried
 * and it is wrong, for a reason that only shows up once there is real content
 * in it: a starting tile is a VERB (press this and an effect begins)
 * and a library tile is a NOUN (this is an effect that exists). One rail
 * holding both means a shelf whose items answer a click in two different ways,
 * told apart only by position — which is precisely the junk drawer this strip
 * was warned against becoming. Worse, the heading over it would have to be true
 * of both, and "Effekt beginnen mit" over somebody's finished effects is a
 * label that lies.
 *
 * So the strip shows one kind at a time, and the heading is what switches:
 * where a single dead heading stood there are now two, and pressing one shows
 * the shelf it names. That costs no height (the heading row was already there),
 * adds no region, and keeps every tile in the window a tile that means one
 * thing. The library's own tab carries the number of effects in it, so the
 * shelf advertises itself without having to be opened to be counted — the one
 * thing a tab genuinely takes away is the library being visible at a glance,
 * and a number is what buys that back.
 *
 * Starting is still what the strip opens on. Somebody with no effects yet must
 * not have to find their way past an empty shelf to begin, and the count on the
 * other tab is how somebody with effects learns they are there.
 *
 * WHAT A LIBRARY TILE SHOWS. The same rule as the starting tiles, from the
 * other end: the picture is the effect. It is either the .png the export
 * wrote beside the .html — the very file SignalRGB shows in its own list — or,
 * for an effect that has none, the effect's own first frame drawn through the
 * export's own cover pipeline in the main process (see the sf:library:cover
 * handler in app/main.js). Never a glyph standing in for a picture, never a
 * colour picked here.
 *
 * ---------------------------------------------------------------------------
 * SEAM: WORKING ON SEVERAL EFFECTS AT ONCE
 * ---------------------------------------------------------------------------
 *
 * What this strip does NOT do yet: hold more than one effect open. Switching is
 * one click through the library, with the unsaved-work question in front of it,
 * and the tile of the effect currently on the stage is marked (`setCurrent`) so
 * the strip always says which one that is. That is one document at a time,
 * switched quickly — it is not two documents at once.
 *
 * Whoever does that next: it is a change to what the WINDOW holds (one live
 * document in app/renderer/main.js, one preview loop, one name field), not a
 * change to this file. This strip is already the right shape for it — a tile
 * that is "open" is a state it already draws — and the honest order of work is
 * to make the renderer able to hold several documents first, and only then let
 * this strip mark more than one of them. What must not be done is to make this
 * file own documents; it shows them and reports presses, and that is why it has
 * survived every rebuild of this window so far.
 */

/** What the file dialog offers, derived from the one list that decides it. */
const ACCEPT = SUPPORTED_IMAGE_EXTENSIONS.join(',');

/**
 * The tiles, in the order they are read.
 *
 * `starts` is the kind of effect the tile begins, and it is what `onStart`
 * receives — the picture tile has none, because it opens a file dialog
 * instead. The keys are the window's own words for the ways of beginning;
 * what each becomes in the document (a `solid` layer, or a `gradient` layer of
 * one shape or another) is main.js's business, and deliberately not spelled
 * out here, so this file never has to know the document's shape.
 */
export const TILES = Object.freeze([
  Object.freeze({ key: 'picture', labelKey: 'gallery.picture', glyph: 'drop', starts: null }),
  Object.freeze({ key: 'solid', labelKey: 'gallery.solid', glyph: null, starts: 'solid' }),
  Object.freeze({ key: 'linear', labelKey: 'gallery.linear', glyph: null, starts: 'linear' }),
  Object.freeze({ key: 'radial', labelKey: 'gallery.radial', glyph: null, starts: 'radial' }),
  Object.freeze({ key: 'conic', labelKey: 'gallery.conic', glyph: null, starts: 'conic' }),
  Object.freeze({ key: 'stripes', labelKey: 'gallery.stripes', glyph: null, starts: 'stripes' }),
  Object.freeze({ key: 'waves', labelKey: 'gallery.waves', glyph: null, starts: 'waves' }),
  // ------------------------------------------------------------------------
  // THE FOUR FIGURES: FOUR TILES, NOT ONE "FORM" TILE WITH A DROPDOWN
  // ------------------------------------------------------------------------
  //
  // One tile with the figure as the first settings card was the tidier-looking
  // option and it is the wrong one, for a reason that is structural rather than
  // aesthetic: THE RULE OF THIS SHELF IS THAT A TILE DRAWS WHAT PRESSING IT
  // PRODUCES. A single "Form" tile can only ever draw one figure, so three of
  // the four would be invisible until after the press — the shelf would be
  // advertising less than it holds, and the one thing this file has never done
  // is show a picture that is not the effect.
  //
  // The precedent settles the rest of it. `linear`, `radial`, `conic`,
  // `stripes` and `waves` are five values of ONE field of ONE layer type, and
  // they are five tiles. A figure is the same kind of thing — a field of the
  // shape layer — so it gets the same treatment, and somebody reading the shelf
  // learns one rule instead of two. Collapsing the figures into one tile while
  // the gradient shapes stayed spread out would be two grammars on one shelf,
  // which is the junk drawer this strip has been warned against becoming twice
  // over (see the note above about verbs and nouns).
  //
  // WHAT IT COSTS, MEASURED RATHER THAN GUESSED: eleven tiles instead of seven,
  // so the rail scrolls at the window's smallest supported size -- exactly as
  // it already did at seven. The recorded measurement (582px client width,
  // work/shape-layer-shots/notes.json) shows about three tiles in view, not
  // seven; seven never sat in one row either. The rail has scrolled since the
  // day it was built, one row and no wrap, scrolled by hand and photographed.
  // A shelf that scrolls is a smaller cost than a tile that lies.
  Object.freeze({ key: 'circle', labelKey: 'gallery.circle', glyph: null, starts: 'circle' }),
  Object.freeze({ key: 'ring', labelKey: 'gallery.ring', glyph: null, starts: 'ring' }),
  Object.freeze({ key: 'star', labelKey: 'gallery.star', glyph: null, starts: 'star' }),
  Object.freeze({ key: 'heart', labelKey: 'gallery.heart', glyph: null, starts: 'heart' }),
  // ------------------------------------------------------------------------
  // PARTICLES: ONE TILE, NOT FOUR — AND THAT IS THE FIGURES' RULE, NOT AN
  // EXCEPTION TO IT
  // ------------------------------------------------------------------------
  //
  // A particle layer has a `pattern` field with four values (rain, rise, drift,
  // snow), and the obvious reading of the block above is that four values means
  // four tiles. It is the wrong reading, and getting it right means saying what
  // the rule over this shelf actually is.
  //
  // The rule is not "one tile per value of a field". If it were, a gradient's
  // `angle` and its `bands` would each be a row of tiles, and they are not. The
  // rule is the honesty rule at the top of this file taken to its conclusion: A
  // VALUE EARNS A TILE WHEN IT IS A DIFFERENT FRAME ZERO. The five gradient
  // shapes are five different pictures standing still; the four figures are
  // four different silhouettes standing still; so each of those earns a rail of
  // its own.
  //
  // The four patterns are not. What separates rain from snow is entirely
  // MOTION — the direction, the speed, the sway, the growth — and at frame zero
  // all four are the same scatter of dots. A tile has no animation loop and
  // must not grow one (three extra render loops under the stage would cost the
  // frames the stage needs, which is why the tiles are still pictures at all).
  //
  // So four tiles here would be literally honest and functionally misleading:
  // each tile really would be frame zero of what pressing it produces, and a
  // person pressing two of them would get the same picture twice. That teaches
  // them that a tile does not predict what they get — which is the one thing
  // this shelf has never done, and once it is untrue of these four it is not to
  // be trusted for any of the eleven above them either.
  //
  // Three ways round it were considered and all three are worse. A direction
  // badge over the canvas would make this the only tile in the window that says
  // something its own picture does not (and "never a glyph standing in for a
  // picture" is already the rule for the library shelf). Rendering the starter
  // at some t > 0 breaks "frame zero, once, at mount" for exactly one layer
  // type. Compositing several moments into one still is a second implementation
  // of the effect for preview purposes, which is the very drift the note at the
  // top of this file says this project has already been bitten by.
  //
  // The pattern is therefore a card in the settings column, where it belongs
  // beside the other things about the swarm that a still picture cannot show.
  Object.freeze({ key: 'particles', labelKey: 'gallery.particles', glyph: null, starts: 'particles' })
]);

/**
 * Draw one tile's own output onto one tile's own canvas.
 *
 * The backing store is the engine's 320 x 200 — the same numbers the stage
 * uses and for the same reason: this IS the effect, at the only size the
 * effect exists at, and how large it happens to be shown is the stylesheet's
 * business. Scaling it down in CSS is what a preview is.
 *
 * A renderer of its own per tile, rather than one shared between them: the
 * renderer keeps scratch state per layer id, and every starting document names
 * its layer the same thing, so a shared one would hand a gradient the buffers
 * it built for the solid — or hand one gradient shape the wheel it cached for
 * another.
 */
function paintTile(canvas, SF, document_) {
  canvas.width = SF.CANVAS_WIDTH;
  canvas.height = SF.CANVAS_HEIGHT;
  const ctx = canvas.getContext('2d');
  const renderer = SF.createRenderer();
  // No assets: a solid and a gradient own no picture (see normalizeLayer in
  // src/engine/document.js), so there is nothing to load and nothing to await.
  renderer.render(ctx, SF.normalizeDocument(document_).doc, new Map(), 0);
  renderer.dispose();
}

/**
 * Put the starting gallery on screen.
 *
 * `onPicture(file)` receives the `File` the user chose, exactly as the drop
 * handler receives the one they dragged — the renderer never learns a path,
 * and only app/preload.cjs turns that File into one (see webUtils.getPathForFile
 * there). A hidden `<input type="file">` is what opens the dialog: it is the
 * one way to reach a file picker without inventing a bridge channel for it,
 * and it keeps the security shape of this app exactly as it was.
 *
 * `onStart(kind)` receives 'solid', 'linear' or 'radial'.
 *
 * `starterDocument(kind)` hands back the document that kind produces, or null
 * — see the note at the top of this file. Optional only so that a caller who
 * has no engine to hand (the stand-in DOM of a unit test) still gets a working
 * strip; the real window always passes it.
 */
export function mountGallery(container, {
  t, onPicture, onStart, starterDocument = () => null,
  onOpenEffect = null, requestCover = null
}) {
  const strip = document.createElement('section');
  strip.className = 'gallery';
  strip.id = 'gallery';

  // The strip is a <section>, which is a landmark only once it has a name —
  // without this it is an anonymous region a screen reader cannot offer to jump
  // to. The name used to be the visible heading; the heading is a pair of tabs
  // now, and neither of them names the whole shelf, so the name is a heading
  // nobody sees. It is not decoration: it is the only thing that keeps this a
  // landmark rather than an anonymous div in the reading order.
  const heading = document.createElement('h2');
  heading.className = 'visually-hidden';
  heading.id = 'gallery-title';
  strip.setAttribute('aria-labelledby', heading.id);

  const tabs = document.createElement('div');
  tabs.className = 'gallery-tabs';
  tabs.id = 'gallery-tabs';
  tabs.setAttribute('role', 'tablist');

  const rail = document.createElement('div');
  rail.className = 'gallery-rail';
  rail.id = 'gallery-rail';
  rail.setAttribute('role', 'tabpanel');
  rail.setAttribute('aria-labelledby', 'gallery-tab-start');

  // The second shelf: the effects that already exist. Built empty and filled by
  // setLibrary below, so a window whose folder has not been read yet — or has
  // none — shows the strip it has always shown rather than a gap.
  const libraryRail = document.createElement('div');
  libraryRail.className = 'gallery-rail gallery-library';
  libraryRail.id = 'gallery-library';
  libraryRail.setAttribute('role', 'tabpanel');
  libraryRail.setAttribute('aria-labelledby', 'gallery-tab-library');
  libraryRail.hidden = true;

  // The file dialog, kept out of the reading order: it is opened by the tile
  // above it, and a lone unlabelled file field in the tab order is a control
  // nobody can explain.
  const picker = document.createElement('input');
  picker.type = 'file';
  picker.id = 'gallery-file';
  picker.accept = ACCEPT;
  picker.className = 'visually-hidden';
  picker.tabIndex = -1;
  picker.setAttribute('aria-hidden', 'true');
  picker.addEventListener('change', () => {
    const file = picker.files && picker.files[0];
    // Cleared straight away so that choosing the SAME file twice in a row
    // still fires a change event the second time.
    picker.value = '';
    if (file) onPicture(file);
  });

  const built = TILES.map((tile) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.id = `gallery-${tile.key}`;
    button.className = 'tile';
    button.dataset.tile = tile.key;

    const art = document.createElement('span');
    art.className = `tile-art tile-art-${tile.key}`;

    const starter = tile.starts ? starterDocument(tile.starts) : null;
    if (starter) {
      const canvas = document.createElement('canvas');
      canvas.className = 'tile-canvas';
      canvas.id = `gallery-${tile.key}-preview`;
      // Decoration beside its own name: the label under it already says what
      // this is, and "a picture of a pink rectangle" is not something a screen
      // reader user needs read out.
      canvas.setAttribute('aria-hidden', 'true');
      paintTile(canvas, window.SignalForgeEngine, starter);
      art.append(canvas);
    } else {
      // The picture tile, which has nothing to preview until a file exists.
      // It shows the empty stage instead — the same sign, the same sunk
      // surface, the same dashed edge the frame above wears while it is
      // waiting. Deliberately NOT a stand-in photograph and not a pale
      // version of the tiles beside it: it is a picture of the place the file
      // goes, in the window's own vocabulary for exactly that.
      const blank = document.createElement('span');
      blank.className = 'tile-blank';
      // A starting tile carries no glyph at all (its picture is the effect),
      // so this only draws one where there genuinely is one. Without the
      // guard, a caller that hands over no documents to draw — a stand-in DOM
      // in a test — would fall in here for every tile and ask the icon set for
      // a glyph called null.
      if (tile.glyph) blank.append(icon(tile.glyph));
      art.append(blank);
    }

    const label = document.createElement('span');
    label.className = 'tile-label';

    button.append(art, label);
    button.addEventListener('click', () => (tile.starts ? onStart(tile.starts) : picker.click()));
    return { tile, button, label };
  });

  for (const item of built) rail.append(item.button);

  // ------------------------------------------------------------------ the tabs

  /**
   * One tab: the heading of one shelf, and the control that shows it.
   *
   * `role="tab"` with `aria-selected` and a roving tabindex, which is what a
   * screen reader and a keyboard both expect of two headings that take turns —
   * one stop in the tab order for the pair, and the arrow keys to move between
   * them. Without the roving tabindex this would be two ordinary buttons
   * announced as tabs, which is worse than either.
   */
  function makeTab(key) {
    const button = document.createElement('button');
    button.type = 'button';
    button.id = `gallery-tab-${key}`;
    button.className = 'gallery-tab';
    button.dataset.tab = key;
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-controls', key === 'start' ? 'gallery-rail' : 'gallery-library');
    const text = document.createElement('span');
    const count = document.createElement('span');
    count.className = 'gallery-tab-count';
    button.append(text, count);
    button.addEventListener('click', () => showTab(key));
    return { key, button, text, count };
  }

  const tabList = [makeTab('start'), makeTab('library')];
  for (const tab of tabList) tabs.append(tab.button);

  /** Which shelf is showing. Nothing else in the window needs to know. */
  let shown = 'start';
  /** Whether the library's tiles have been asked for their pictures yet. */
  let coversAsked = false;
  /**
   * Which set of tiles the pictures being fetched belong to. Bumped by every
   * rebuild, captured by the fetching loop — see loadCovers below.
   */
  let coverGeneration = 0;

  function showTab(next, { focus = false } = {}) {
    shown = next;
    for (const tab of tabList) {
      const on = tab.key === next;
      tab.button.setAttribute('aria-selected', on ? 'true' : 'false');
      // The roving tabindex: one stop for the pair, and it is always the one
      // that is showing.
      tab.button.tabIndex = on ? 0 : -1;
      tab.button.classList.toggle('is-selected', on);
      if (on && focus) tab.button.focus();
    }
    rail.hidden = next !== 'start';
    libraryRail.hidden = next !== 'library';
    // The note belongs to the library shelf, so it comes and goes with it.
    relabelLibrary();
    // The pictures are drawn on demand and never before: an effect nobody has
    // looked for costs nothing, and drawing a cover that has none on disk means
    // a hidden window in the main process (see app/main.js).
    if (next === 'library') loadCovers();
  }

  tabs.addEventListener('keydown', (event) => {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const at = tabList.findIndex((tab) => tab.key === shown);
    showTab(tabList[(at + step + tabList.length) % tabList.length].key, { focus: true });
  });

  // --------------------------------------------------------------- the library

  /** What the library is showing, so a relabel can say it again. */
  let library = { entries: [], hasFolder: true, skipped: 0 };
  /** The file name of the effect on the stage right now, or null. */
  let current = null;
  /** Every built library tile, so `current` and a language switch can find one. */
  let libraryTiles = [];

  const empty = document.createElement('p');
  empty.className = 'gallery-empty';
  empty.id = 'gallery-empty';

  /**
   * The files in the folder this shelf left out, said once and quietly.
   *
   * WHY IT EXISTS AT ALL. listEffects counts what it skips and nothing read the
   * count, so a file simply vanished. That is not hypothetical: MaxAmbient.html
   * — the machine owner's own effect, from this project's predecessor — carries
   * no SignalForge document, and it disappeared off the shelf without a word.
   * Somebody who knows the file is in that folder and cannot see it on the
   * shelf is owed the one sentence that explains it.
   *
   * WHY IT IS NOT A WARNING. Nothing is wrong. SignalRGB's effects folder is
   * full of perfectly good effects this app cannot open — its own bundled ones,
   * ones built by other tools — and none of them are the user's problem. So:
   * the dimmest text in the window, no icon, no colour, under the tiles rather
   * than over them, and gone entirely when there is nothing to say.
   *
   * It sits OUTSIDE the rail because the rail is a horizontally scrolling row
   * of tiles and this is a line beneath them; the panel points at it with
   * aria-describedby so a screen reader still meets the two together.
   */
  const skippedNote = document.createElement('p');
  skippedNote.className = 'gallery-skipped';
  skippedNote.id = 'gallery-skipped';
  skippedNote.hidden = true;

  /**
   * One library tile.
   *
   * The same element, the same class and the same shape as a starting tile —
   * they are the same kind of thing and must not read as two. What differs is
   * where the picture comes from (the main process, as PNG bytes, rather than a
   * canvas drawn here) and that it can be marked as the one that is open.
   */
  function makeEffectTile(entry) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tile tile-effect';
    button.dataset.effect = entry.file;

    const art = document.createElement('span');
    art.className = 'tile-art';

    // The resting state: the same sunk, dashed frame the picture tile wears
    // while it is waiting. A tile whose picture has not arrived yet is a tile
    // waiting for a picture, and this window already has a way of saying that.
    const blank = document.createElement('span');
    blank.className = 'tile-blank';
    art.append(blank);

    const image = document.createElement('img');
    image.className = 'tile-photo';
    image.alt = '';
    image.hidden = true;
    // A .png in the effects folder that is not a picture — truncated, half
    // written, or never one to begin with — arrives here as bytes like any
    // other and only fails when the browser tries to decode it. Without this
    // the tile un-hides a broken-image box, which is the one thing worse than
    // the resting frame: the resting frame says "no picture yet", a broken
    // image says "this app is broken". So the tile goes back to resting, which
    // is a state it already has and already looks right in.
    image.onerror = () => {
      image.hidden = true;
      image.removeAttribute?.('src');
    };
    art.append(image);

    const label = document.createElement('span');
    label.className = 'tile-label';
    label.textContent = entry.name;

    // Which effect is on the stage. `aria-current` is the whole announcement —
    // the ring around it is the same fact for whoever can see it.
    const openMark = document.createElement('span');
    openMark.className = 'visually-hidden';

    button.append(art, label, openMark);
    button.addEventListener('click', () => onOpenEffect?.(entry));
    return { entry, button, image, openMark };
  }

  /** Empty a node without assuming the whole DOM (a stand-in DOM in a test). */
  const clear = (node) => {
    if (typeof node.replaceChildren === 'function') node.replaceChildren();
  };

  function buildLibrary() {
    clear(libraryRail);
    libraryTiles = library.entries.map(makeEffectTile);
    for (const tile of libraryTiles) libraryRail.append(tile.button);
    if (libraryTiles.length === 0) libraryRail.append(empty);
    coversAsked = false;
    // Every tile the old loop was filling has just been thrown away, so the
    // loop itself is over: this is what tells it so.
    coverGeneration += 1;
    markCurrent();
    relabelLibrary();
    if (shown === 'library') loadCovers();
  }

  /**
   * Ask the main process for each tile's picture, once.
   *
   * One at a time and in the order they are shown: the main process draws a
   * missing cover in a window of its own, and asking for twelve at once would
   * be twelve of those. A picture that never arrives leaves the tile in its
   * resting state, which is a state it already has.
   *
   * THE GENERATION COUNTER, and why a loop that awaits needs one. This walk
   * takes as long as the slowest tile — a cover that has to be DRAWN means a
   * hidden window in the main process — and the library can be rebuilt while it
   * is part way through: a window regaining focus, an export landing, a folder
   * changed in Explorer. buildLibrary() then throws away every tile this loop
   * still holds a reference to, and the loop went on filling detached elements
   * with pictures nobody would ever see, while a second loop ran beside it on
   * the new ones — two loops, both asking the main process to draw, in the
   * order they happened to interleave.
   *
   * So each rebuild mints a generation and this loop carries the one it started
   * in: after every await it checks whether it is still the current loop and
   * stops if it is not. The same pattern the preview loop already uses
   * (components/preview.js), for the same reason and written the same way.
   */
  async function loadCovers() {
    if (coversAsked || !requestCover) return;
    coversAsked = true;
    const mine = coverGeneration;
    for (const tile of libraryTiles) {
      const png = await requestCover(tile.entry.file);
      // Checked after the await, not before it: the rebuild can only have
      // happened while this was waiting.
      if (mine !== coverGeneration) return;
      if (!png) continue;
      tile.image.src = `data:image/png;base64,${png}`;
      tile.image.hidden = false;
    }
  }

  function markCurrent() {
    for (const tile of libraryTiles) {
      const on = tile.entry.file === current;
      tile.button.classList.toggle('is-current', on);
      if (on) tile.button.setAttribute('aria-current', 'true');
      else tile.button.removeAttribute?.('aria-current');
      tile.openMark.textContent = on ? t('library.open') : '';
    }
  }

  function relabelLibrary() {
    empty.textContent = library.hasFolder ? t('library.empty') : t('library.noFolder');
    for (const tile of libraryTiles) tile.openMark.textContent =
      tile.entry.file === current ? t('library.open') : '';

    // One file or several, in the language in force. The count is put into the
    // sentence rather than glued in front of it, because German and English do
    // not agree about where a number goes or what it does to the noun after it.
    const skipped = Number(library.skipped) || 0;
    skippedNote.textContent = skipped === 1
      ? t('library.skippedOne')
      : t('library.skippedMany').replace('{count}', String(skipped));
    // Never on the starting shelf: it is a fact about the OTHER shelf, and the
    // four ways to begin an effect have nothing to do with it.
    skippedNote.hidden = skipped === 0 || shown !== 'library';
    if (skippedNote.hidden) libraryRail.removeAttribute?.('aria-describedby');
    else libraryRail.setAttribute('aria-describedby', skippedNote.id);
  }

  strip.append(heading, tabs, rail, libraryRail, skippedNote, picker);
  container.append(strip);

  function relabel() {
    heading.textContent = t('gallery.region');
    for (const item of built) item.label.textContent = t(item.tile.labelKey);
    tabList[0].text.textContent = t('gallery.title');
    tabList[1].text.textContent = t('library.title');
    tabList[1].count.textContent = library.entries.length > 0 ? String(library.entries.length) : '';
    relabelLibrary();
  }

  showTab('start');
  buildLibrary();
  relabel();

  return {
    relabel,
    element: strip,
    /**
     * What is in the effects folder now. Called on every refresh, so it has to
     * be cheap when nothing has changed — hence the comparison: rebuilding the
     * tiles would drop every picture already loaded and ask for them all again.
     */
    setLibrary(next) {
      const same = next.hasFolder === library.hasFolder
        // The count of what was left out is part of what the shelf SAYS, so a
        // folder that gained nothing but a foreign file still has to be said
        // again — otherwise the note goes stale in exactly the case it is for.
        && (Number(next.skipped) || 0) === (Number(library.skipped) || 0)
        && next.entries.length === library.entries.length
        && next.entries.every((entry, index) => {
          const was = library.entries[index];
          return was && was.file === entry.file && was.modified === entry.modified;
        });
      library = next;
      if (same) return;
      buildLibrary();
      relabel();
    },
    /** Which effect is on the stage, by file name, or null for none. */
    setCurrent(file) {
      current = file ?? null;
      markCurrent();
    }
  };
}
