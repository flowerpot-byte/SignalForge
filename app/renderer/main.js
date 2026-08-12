// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import { createI18n, pickLanguage } from './i18n/i18n.js';
import { mountShell } from './components/shell.js';
import { createPreview } from './components/preview.js';
import { mountDrop, isSupportedImage } from './components/drop.js';
import { mountCrop } from './components/crop.js';
import { mountInspector } from './components/inspector.js';
import { mountFooter } from './components/footer.js';
import { mountFirstRun } from './components/firstrun.js';
import { mountGallery } from './components/gallery.js';
import { mountAppSettings } from './components/appsettings.js';
import { samplePalette } from './components/palette.js';
import { rememberColor, isRecentColor } from './components/recent-colors.js';
import { createCoverPicker } from './components/cover-picker.js';
import { enter } from './components/motion.js';
import { decodeAsset as decodeImage } from './components/decode.js';
// Pure arithmetic over the document's own layer list, the same kind of import
// the settings column already makes (see components/inspector.js): which layer
// is the one being edited and which is the background is a question about the
// document, not about the window, and it is answered in one place.
import { foregroundOf } from '../../src/engine/slots.js';

// The preview loads dist/engine.bundle.js as a plain script tag (see
// index.html) rather than importing engine sources directly — that is what
// keeps test/export/parity.test.js meaningful: the preview and the export
// must run the exact same bundle. If the build step was skipped, fail loud
// and visible instead of leaving the window blank.
if (!window.SignalForgeEngine) {
  document.body.textContent = 'dist/engine.bundle.js is missing. Run: npm run build:engine';
  throw new Error('engine bundle missing');
}

// Dropping a file anywhere Chromium considers a valid drop target normally
// navigates the window to that file — the exact "blank/replace the window"
// failure the drop zone below must never trigger. This guard sits at the
// window level, outside boot(), so it is active even if boot() itself fails,
// and it covers every drop that lands outside the dedicated zone (over the
// layers or inspector panels, for instance): mountDrop()'s own handler
// stops propagation for drops it handles, so this one only ever sees drops
// nobody else claimed, and simply swallows them.
window.addEventListener('dragover', (event) => event.preventDefault());
window.addEventListener('drop', (event) => event.preventDefault());

/**
 * Everything that can fail (missing/blocked language file, bridge call)
 * lives in here so a rejection can be turned into a visible message instead
 * of leaving the user staring at a blank window.
 */
async function boot() {
  const dictionaries = {
    de: await (await fetch('./i18n/de.json')).json(),
    en: await (await fetch('./i18n/en.json')).json()
  };

  const settings = await window.sf.settings.all();
  // On a first start nothing has been chosen yet (DEFAULT_SETTINGS.language is
  // '' — see src/main/settings.js), so the machine's own language decides;
  // after that the stored choice does, whatever the machine is set to. The
  // list of languages is the list of language files, so adding a third one
  // needs no change here or in the footer's switch.
  const languages = Object.keys(dictionaries);
  const language = pickLanguage(settings.language, navigator.language, languages);
  const i18n = createI18n(dictionaries, language);
  // Announce the language to the browser itself, not only to the reader:
  // hyphenation, quotation marks and, above all, what a screen reader sounds
  // like all follow this attribute.
  document.documentElement.lang = language;

  /**
   * The thumbnail at the head of the transport bar: the picture's three
   * strongest colours.
   *
   * This is what is left of the blurred backdrop that used to stand behind the
   * whole window, and it is what that idea was actually worth. Sampling the
   * picture was never the problem — washing it across every panel was, because
   * it made the surface under every label a colour nobody had chosen. Here the
   * same six lines of sampling produce a 40px chip that says what the desk is
   * about to look like, in the one place a bar like this has always shown what
   * is loaded.
   *
   * Deliberately cheap and deliberately rare: a 48 x 30 copy of the picture,
   * once, at the moment it is imported or opened — never per frame, never off
   * the preview canvas. A picture with no readable colour in it (an entirely
   * transparent PNG) yields nothing and the chip goes back to its resting
   * outline rather than to a colour that was invented for it.
   */
  function retintThumbnail(image) {
    footer.setColours(image ? samplePalette(image) : []);
  }

  /**
   * Whether there is a picture in the frame, said out loud to the stylesheet.
   *
   * Empty, the frame draws its edge dashed: it is the drop target, and an
   * opaque rectangle the size of the window with nothing in it read as a hole
   * rather than as a screen waiting for something.
   */
  /**
   * Say — to the stylesheet and to the crop — what is on the stage now.
   *
   * The class is still called `has-picture` although a solid colour is not a
   * picture: what it actually means, and always meant, is "there is something
   * on the stage, so stop inviting a file to be dropped on it". The stylesheet
   * and the harness both know that name, and renaming it would be a change to
   * three files that means nothing.
   *
   * `arrived` says a NEW document has just landed, which is the one moment
   * this window still has to move anything for the user. It does two things
   * and no more, where the left column used to make it do four:
   *
   *  - It puts the settings column back to the top. The first section of a
   *    document is the one that says what the document IS — a gradient's
   *    "Fläche", a picture's "Bild" — and it is already the first thing in
   *    that column, so arriving at it is a scroll to zero and not a search for
   *    a heading. That one line is the whole of what is left of the old
   *    scrollIntoView / mark-what-you-scrolled-past machinery.
   *  - It leaves the app's own settings if they happen to be showing. Somebody
   *    who starts an effect while looking at the language dropdown means to
   *    look at the effect.
   */
  function showContent({ arrived = false } = {}) {
    const doc = preview.document();
    regions.preview.classList.toggle('has-picture', doc.layers.length > 0);
    if (!arrived) return;
    showSettings(false);
    regions.column.scrollTop = 0;
  }
  const regions = mountShell(document.getElementById('app'));

  /** Whether the settings column is showing the app's settings rather than the effect's. */
  let settingsShowing = false;

  /**
   * Swap the settings column between the effect's settings and the app's.
   *
   * The two share the column and take turns; the effect's controls stay in the
   * document either way (see mountInspector on why they are never torn down),
   * so nothing is lost by looking away from them.
   *
   * The panel that arrives is marked `sf-enter` for as long as its entrance
   * lasts, which is the one thing that says the column SWAPPED rather than
   * that its contents teleported. `initial` is how the very first call — the
   * one that puts the window into its resting state during boot — declines
   * that: an animation nobody caused is an animation nobody asked for.
   */
  function showSettings(next, { initial = false } = {}) {
    settingsShowing = next;
    regions.inspector.hidden = next;
    regions.settings.hidden = !next;
    footer.setSettings(next);
    if (!initial) enter(next ? regions.settings : regions.inspector);
  }

  const preview = createPreview(regions.preview, (k) => i18n.t(k));

  // The one line of feedback in the window: rejections, failures, the path an
  // export landed at. Deliberately empty until something happens — the
  // invitation to drop a picture in is not feedback, it belongs in the empty
  // frame it is talking about (see components/preview.js), and saying it here
  // as well would have been the same sentence in two places.
  const message = document.createElement('p');
  message.className = 'muted drop-message';
  regions.preview.append(message);

  // Which translation key the line is currently showing, or null when it is
  // showing a sentence assembled from one (with a file name or a path in it).
  // A switch of language can honestly repeat the former; the latter is a
  // report about something that has already happened and is left where it is
  // rather than being half-translated.
  let messageKey = null;

  /** The one line of feedback in the window; `warn` colours it. */
  function showMessage(text, warn = false) {
    messageKey = null;
    message.classList.toggle('drop-warn', warn);
    message.textContent = text;
  }

  /** The same line, but from a key alone, so a language switch can redo it. */
  function showKey(key, warn = false) {
    showMessage(i18n.t(key), warn);
    messageKey = key;
  }

  // The one question a first start has to ask, and only when there is one: it
  // shows itself if and only if no effects folder could be found (see
  // components/firstrun.js). showTarget() below tells it, and the footer, the
  // same answer.
  const firstRun = mountFirstRun(regions.preview, {
    t: (k) => i18n.t(k),
    onChoose: guard('settings.folderFailed', async () => {
      showTarget(await window.sf.chooseFolder());
    })
  });

  // The id the dropped picture always gets. One layer for now; the layer
  // list is a later task.
  const IMAGE_LAYER = 'image';

  /**
   * The id a solid or a gradient layer gets. Deliberately not IMAGE_LAYER:
   * these documents are saved and read by people, and a gradient stored under
   * a layer called "image" is a lie in a file somebody may open in an editor.
   */
  const COLOUR_LAYER = 'fill';

  /**
   * The layer this window edits, whatever it is, asked for by slot rather than
   * by a fixed id. A project whose picture layer was named something else (an
   * effect exported by the command line calls it "a1") used to arrive with no
   * measurable picture at all, because the lookup was by the name this window
   * happens to use.
   *
   * IT IS THE LAST LAYER AND NOT THE FIRST, which is the one line in this file
   * that the background slot actually changed. `layers[0]` was the same layer
   * either way for as long as a document could only hold one; a document with a
   * background carries that background first, so reading index 0 would hand the
   * crop drag, the thumbnail and the settings column the layer UNDERNEATH the
   * one the user is working on. See src/engine/slots.js for the whole
   * position-and-id decision.
   */
  const editedLayer = (doc = preview.document()) => foregroundOf(doc.layers);

  /** That layer, but only when it is a picture — otherwise nothing. */
  const pictureLayer = (doc = preview.document()) => {
    const layer = editedLayer(doc);
    return layer && layer.type === 'image' ? layer : null;
  };

  /**
   * Whether the document on screen holds work that is in no file yet.
   *
   * One boolean, owned here, and deliberately not a second copy of the
   * document to compare against: `preview.document()` is the one live
   * document (the crop drag and the settings column write straight into it),
   * and snapshotting it to diff — thirty times a second during a crop drag —
   * would cost more than everything it was guarding. A flag cannot be out of
   * date the way a copy can; it can only be forgotten, which is why every
   * single writer below sets it and why each of them is checked one at a time
   * (test/harness/unsaved.js).
   *
   * It is false at a fresh start, false again immediately after a successful
   * save and after a successful open, and true from the first change of
   * anything the user can change: the crop (mouse and keyboard), any control
   * in the settings column, the fit mode, a motion added or removed, the
   * name, and a picture imported.
   *
   * Deliberately erring towards true: a gesture that ends up writing the same
   * value it found (an arrow key at the edge of the crop, a slider put back)
   * still counts. A warning too many costs a click; a warning too few costs
   * the work.
   */
  let unsavedChanges = false;

  /**
   * Say it out loud to the window as well as remembering it.
   *
   * The class is what the marker beside the name field hangs off — the dot in
   * the transport bar (.transport-unsaved in styles/app.css, built in
   * components/footer.js). That is deliberately the only thing this line does:
   * the flag says WHETHER, the stylesheet says what it looks like, and nothing
   * in here has to know about either.
   *
   * It is also what lets a test at the real window see the flag at all without
   * the renderer having to hand its internals out over the bridge.
   */
  function setUnsavedChanges(next) {
    unsavedChanges = next;
    document.documentElement.classList.toggle('has-unsaved-changes', next);
  }

  /** Something the user can change has changed. */
  const markChanged = () => setUnsavedChanges(true);
  /** Everything on screen is now in a file: a save, an open, a fresh start. */
  const markSaved = () => setUnsavedChanges(false);

  markSaved();

  // The only thing about the picture the document does not carry:
  // normalizeDocument keeps an asset's kind, mime and bytes, not the size the
  // importer scaled it down to. Everything else about the layer — its fit,
  // its offset — is read straight out of the live document below, never
  // copied, so the crop drag and the settings column cannot disagree about
  // it. null while no picture has been dropped yet.
  let sourceSize = null;

  /**
   * The picture the user can drag around, assembled fresh on every call from
   * the live document plus the importer's source size. Deliberately not
   * stored: a stored copy is what used to hold its own `fit`, which the
   * settings column now also writes — the crop would have gone on computing
   * its slack for whichever fit was in force when the picture was dropped.
   */
  /**
   * The picture itself, decoded — and given up on if it never arrives.
   *
   * Its own file, with its own watchdog and its own tests: see
   * components/decode.js for why waiting on a decoder is the one step in this
   * path that has to be able to stop waiting.
   */
  const decodeAsset = (asset) => decodeImage(asset);

  /**
   * The size a picture actually has, read from the picture itself.
   *
   * An asset in the document carries its bytes but not the size the importer
   * scaled it to (normalizeDocument keeps kind, mime and data, nothing else),
   * so a project that comes back from a file has to be measured again before
   * the crop drag can work out how much slack there is to drag.
   *
   * Rejecting on a picture that will not decode is the point as much as the
   * measurement is: it happens before the opened document is allowed near the
   * preview, so a project whose picture is damaged leaves the one on screen
   * alone instead of replacing it with an empty canvas. The refusal is what the
   * caller must then SAY — see the guard around onOpenEffect, without which a
   * tile press ended here in silence.
   */
  async function measureAsset(asset) {
    const image = await decodeAsset(asset);
    return { width: image.naturalWidth, height: image.naturalHeight, image };
  }

  async function measureEmbeddedAssets(doc) {
    const sizes = new Map();
    for (const [id, asset] of Object.entries(doc.assets)) {
      // An asset that names a sibling file instead of carrying its bytes
      // belongs to the export path, not to a self-contained project file.
      if (typeof asset.data !== 'string') continue;
      sizes.set(id, await measureAsset(asset));
    }
    return sizes;
  }

  /**
   * The picture's colours, on a best-effort basis.
   *
   * Never fatal: the backdrop is decoration that means something, not part of
   * the import. A picture that arrived, decoded and is on screen must not be
   * rejected because a second decode for the sake of a tint went wrong.
   */
  async function retintFromAsset(asset) {
    try {
      retintThumbnail(await decodeAsset(asset));
    } catch (err) {
      console.error('could not take the thumbnail from the picture:', err);
    }
  }

  /**
   * The picture that can be dragged, or nothing.
   *
   * "Nothing" is what a solid or a gradient effect gives, and it is what makes
   * the crop drag INERT rather than present-but-dead on such a document:
   * mountCrop's syncAffordance() takes the canvas out of the tab order, puts
   * its role back to "img", drops the grab cursor and refuses pointerdown as
   * soon as this returns null (see components/crop.js). There is nothing to
   * hide, because a crop control that is not there is not drawn in the first
   * place — the "Bild" section of the settings column simply does not exist
   * for a layer type with no picture in it.
   */
  function draggableLayer() {
    if (!sourceSize) return null;
    const layer = pictureLayer();
    if (!layer) return null;
    return { ...layer, sourceWidth: sourceSize.width, sourceHeight: sourceSize.height };
  }

  // A visually hidden live region a screen reader announces on its own,
  // updated after every arrow-key crop move (see components/crop.js). The
  // canvas's role="application" is what stops a screen reader from noticing
  // the move by itself, so without this an arrow press would be silent to
  // anyone not looking at the screen.
  const cropAnnouncement = document.createElement('div');
  cropAnnouncement.className = 'visually-hidden';
  cropAnnouncement.setAttribute('aria-live', 'polite');
  regions.preview.append(cropAnnouncement);

  // Whether the canvas is a tab stop at all depends on whether there is
  // anything to move — which changes when a picture arrives and when the fit
  // mode changes, so crop.refresh() is called at both (and on a language
  // switch, because the canvas's accessible name is a translated string).
  const crop = mountCrop(preview.canvas, {
    t: (k) => i18n.t(k),
    getLayer: draggableLayer,
    // Writes straight into the live document; the preview's frame loop shows
    // it on its next frame (see components/preview.js). Both ways of moving
    // the crop — the mouse drag and the arrow keys — arrive here, so this one
    // line covers both of them.
    onChange: (offset) => {
      const layer = pictureLayer();
      if (!layer) return;
      preview.setLayerOffset(layer.id, offset);
      markChanged();
    },
    announce: (message) => { cropAnnouncement.textContent = message; }
  });

  // The remembered swatches under every colour input. The list's arithmetic
  // is components/recent-colors.js; what is here is only its keeping — the
  // working copy seeded once from the settings the window already loaded,
  // and every change written back through remember(), the same road the
  // language switch takes, so a write that fails shows the one visible
  // settings line instead of vanishing into the console. The working copy is
  // updated regardless: the colour stays remembered for this session even
  // when the disk said no.
  let recentColors = Array.isArray(settings.recentColors)
    ? settings.recentColors.filter(isRecentColor)
    : [];
  const recents = {
    list: () => recentColors,
    remember(color) {
      const next = rememberColor(recentColors, color);
      if (next.length === recentColors.length
        && next.every((entry, index) => entry === recentColors[index])) return;
      recentColors = next;
      remember('recentColors', next);
    }
  };

  // The tile picker: the dialog, the crop and the asset all happen in the
  // main process (sf:chooseCover hands back a finished 512x288 tile), so
  // what lands in the document is tile-sized and never a whole photograph.
  // The gestures themselves live in components/cover-picker.js, where a test
  // can drive them; the closures below are late-bound on purpose, so the
  // factory may be built before `inspector` exists.
  const coverPicker = createCoverPicker({
    chooseCover: () => window.sf.chooseCover(),
    getDocument: () => preview.document(),
    setDocument: (doc) => preview.setDocument(doc),
    markChanged: () => markChanged(),
    refresh: () => inspector.refresh(),
    onError: (message) => showMessage(`${i18n.t('inspector.coverFailed')}: ${message}`, true)
  });

  const inspector = mountInspector(regions.inspector, {
    t: (k) => i18n.t(k),
    getDocument: () => preview.document(),
    recents,
    coverPicker,
    // The effect time of the frame on screen, for the one control whose
    // change must not move the picture: the Farbwechsel tempo re-parks the
    // hue at this very moment's angle (see the hueCycle note in
    // mountInspector, and rebasedHueShift in src/engine/motion/hue.js).
    previewTime: () => preview.currentTime(),
    /**
     * What a fresh document would carry at one field's path — which is what
     * every slider's reset button puts it back to.
     *
     * Through the bundle, like every other piece of document arithmetic this
     * window does, and asked of the LIVE document at the moment it is asked:
     * a gradient's second colour stop only has a starting position because
     * there are stops either side of it, so the answer depends on the document
     * as it stands and not on some empty one. src/engine/document.js says at
     * length why the question is answered by normalizing rather than by a
     * table of numbers kept somewhere.
     */
    defaultAt: (path) => window.SignalForgeEngine.defaultValueAt(preview.document(), path),
    /**
     * Which way a change reaches the picture depends on what kind of change
     * it is:
     *
     *  - A whole new motions list (adding or removing one) is the only
     *    change that alters the document's shape, so it is the only one that
     *    goes back through setDocument: normalizeDocument then fills a new
     *    entry's speed and amount, clamps them and drops any duplicate kind,
     *    which is work no code here should be repeating. It costs a reload
     *    of the picture, which is fine for something that happens on a
     *    button press.
     *  - Everything else — every slider, the fit dropdown, a motion's kind —
     *    is a single value at a path that already exists, so it is written
     *    straight into the live document and the running loop shows it on
     *    its next frame. Reloading the picture on every pixel of a slider
     *    drag would be unusable.
     */
    onChange: async (path, value) => {
      const doc = preview.document();
      if (!window.SignalForgeEngine.setByPath(doc, path, value)) {
        console.error('inspector: refused to write', path);
        return;
      }
      // The live document has just been written into — that is true of every
      // control in the column: a slider, the fit dropdown, a motion's kind,
      // and the whole motions list when one is added or removed. It counts
      // even if the reload below then fails, because setByPath wrote into the
      // live document itself and that change is already on screen.
      markChanged();
      if (Array.isArray(value)) await preview.setDocument(doc);
      // The fit dropdown decides whether anything is croppable at all, so the
      // canvas's tab stop has to follow it. Called for every change rather
      // than only for the fit: it is a little arithmetic and two attribute
      // reads, and a list of "which paths matter" here is a list that goes
      // stale the moment a new one is added.
      crop.refresh();
    },
    /**
     * The one change above that can genuinely fail is the one that reloads
     * the picture, and nobody is awaiting it — the settings column reports a
     * change from an event handler. Send it to the same line every other
     * failure in this window arrives on, exactly as guard() does for the
     * footer's buttons.
     */
    onError: (err) => {
      showMessage(`${i18n.t('inspector.changeFailed')}: ${err.message || err}`, true);
    }
  });

  /**
   * Take a picture in, from wherever it came.
   *
   * There are two entrances now — a file dragged onto the stage, and the
   * "own picture" tile in the starting gallery, which opens a file dialog —
   * and they must not be two implementations. Both hand over a real `File`
   * object and nothing else; only app/preload.cjs is trusted to turn that into
   * a filesystem path (webUtils.getPathForFile), so adding the second entrance
   * added no new way for the window to name a file.
   *
   * Asks about unsaved work first, exactly as openProject and startEffect do:
   * all four entrances to a new document behave alike, and they behave alike in
   * the one direction that cannot lose anything. The question comes after the
   * file has been named here rather than before it — the other way round from
   * openProject — because there is nothing to put it in front of: a drop
   * arrives with the file already chosen, and the picture tile's file dialog is
   * opened by the browser on the click itself.
   */
  async function importFile(file) {
      if (!(await mayDiscard())) return;
      // The gesture is acknowledged the instant there is nothing left to ask
      // about — sf:importImage runs in the main process and takes on the
      // order of half a second, and until now the stage said nothing for the
      // whole of it. See preview.js's setLoading for what this looks like and
      // why a fast import does not flash.
      //
      // Cleared in `finally`, not at the end of the try block: that is what
      // makes it impossible to get stuck showing "loading" — a refusal
      // (`!result.ok`, which returns early), a rejection anywhere in here (a
      // bridge error, setDocument's own rejection) and the ordinary success
      // path all fall through the same finally, with no exit that skips it.
      preview.setLoading(true);
      // sf:importImage already turns its own failures into { ok: false }
      // (see app/main.js) rather than a rejection, but this runs from an event
      // callback with nobody awaiting it — an unexpected throw anywhere in
      // here (a bridge error, setDocument rejecting) must still end up on
      // screen instead of an unhandled rejection in the console.
      try {
        // The File itself goes to the bridge; only preload.cjs resolves it
        // to a real path (see components/drop.js). file.name is already
        // just the leaf name, so it doubles as the document name with no
        // path-splitting needed here.
        const result = await window.sf.importImage(file);
        if (!result.ok) {
          showMessage(`${i18n.t('preview.dropFailed')}: ${result.message}`, true);
          return;
        }
        showMessage('');
        await preview.setDocument({
          // Without the extension: this name becomes the effect's own name
          // and, through it, the file the export writes — "photo.png.html"
          // is not what anybody meant. Same rule the command line has always
          // followed for --image (see bin/sfexport.js). file.name is already
          // just the leaf name, so there is no path to split here.
          name: file.name.replace(/\.[^.]+$/, ''),
          layers: [{ id: IMAGE_LAYER, type: 'image', asset: 'image', fit: 'cover', motions: [] }],
          assets: { image: result.asset }
        });
        sourceSize = { width: result.asset.width, height: result.asset.height };
        // A picture that has been imported and not yet saved is work like any
        // other — and it is the change the whole ten minutes that follow are
        // built on. Marked only once the import has actually succeeded: a
        // refused or unreadable file changes nothing and must say nothing.
        markChanged();
        // What is on the stage is a new picture, not the effect the library
        // tile was marking.
        setCurrentEffect(null);
        // The transport bar takes the new picture's colours. Not awaited: the
        // picture is already on screen and the chip is allowed to arrive a
        // frame later.
        retintFromAsset(result.asset);
        // There is something to move now, so the canvas becomes a tab stop.
        crop.refresh();
        // The column had nothing but the document-wide sliders until now.
        inspector.refresh();
        showContent({ arrived: true });
        showName(preview.document().name);
        preview.start();
      } catch (err) {
        console.error('image import failed:', err);
        showMessage(`${i18n.t('preview.dropFailed')}: ${err.message || err}`, true);
      } finally {
        preview.setLoading(false);
      }
  }

  /**
   * What each tile in the starting gallery actually makes.
   *
   * Deliberately as little as it can possibly be: a type, and for a gradient
   * the one word that says which way it runs. Every other field — the colour,
   * the stops, their positions, the angle — is left out so that
   * normalizeDocument fills it in (see DEFAULT_SOLID_COLOR and
   * DEFAULT_GRADIENT_STOPS in src/engine/document.js).
   *
   * That is not brevity for its own sake. It is what keeps every colour in
   * this app out of app/renderer entirely: the window never names a colour, it
   * shows and edits the ones the document carries. test/app/color-literals.js
   * scans this whole tree, and it passes because there is genuinely nothing
   * here to find rather than because anything was hidden from it.
   */
  const STARTERS = Object.freeze({
    solid: { type: 'solid' },
    linear: { type: 'gradient', shape: 'linear' },
    radial: { type: 'gradient', shape: 'radial' },
    // The three that repeat. They name their shape and nothing else, exactly
    // as the two above do: the band count is left out so DEFAULT_BANDS
    // (src/engine/document.js) fills it in, which is what keeps the tile's
    // picture and the effect the tile makes the same data rather than two
    // descriptions of it.
    conic: { type: 'gradient', shape: 'conic' },
    stripes: { type: 'gradient', shape: 'stripes' },
    waves: { type: 'gradient', shape: 'waves' },
    // The four figures. They name their figure and nothing else, exactly as
    // the five above name their shape: the colour, the size, the position, the
    // ring's thickness and the star's point count are all left out so that
    // normalizeDocument fills them in (DEFAULT_SHAPE_SIZE and its neighbours in
    // src/engine/document.js). That is what keeps the tile's picture and the
    // effect the tile makes the same data rather than two descriptions of it —
    // and it is what keeps this file free of every colour, which is the rule
    // test/app/color-literals.test.js enforces over this whole tree.
    circle: { type: 'shape', figure: 'circle' },
    ring: { type: 'shape', figure: 'ring' },
    star: { type: 'shape', figure: 'star' },
    heart: { type: 'shape', figure: 'heart' },
    // The swarm, and the ONE entry in this table that names numbers. The
    // pattern is still left out — its own default is the first entry of
    // PARTICLE_PATTERNS, and there is one particle tile rather than four (see
    // gallery.js for why at length), so there is no pattern here to
    // distinguish. What is named is the GEOMETRY, and it is named because the
    // engine's defaults are a different picture from the one this tile is for.
    //
    // At the engine's own numbers — 80 drops of size 3 travelling at 30 — a
    // drop moves further between two frames than it is wide, so the wake the
    // trail leaves arrives as a string of separate discs rather than a streak.
    // Measured, photographed and written up: work/wake-shots/
    // 05-the-money-shot-rain-with-a-wake-over-a-moving-gradient.png beside
    // 05b-the-same-wake-at-the-corpus-geometry.png, and the "Wie es aussieht —
    // ehrlich" section of .superpowers/sdd/background-layer-report.md.
    //
    // These four numbers are that second picture: the geometry read off the
    // corpus of community rain effects (`Poison`, whose drops are up to 11 px
    // wide, move a pixel or two a frame, number 30 rather than 150, and whose
    // veil is alpha 0.13 — the SHORT end of our trail slider, about 45). Set
    // this way the same engine draws continuous comet tails, which is what
    // somebody pressing a tile called "Partikel" is picturing.
    //
    // Named HERE and not in normalizeDocument on purpose. The engine's
    // defaults are pinned by the compatibility tests — every document ever
    // written that says nothing about count, size or speed must keep rendering
    // byte for byte as it did — so a starting point is a property of the TILE,
    // not of the format. This is the same table making the same kind of choice
    // it makes by staying silent everywhere else; it simply has something to
    // say here.
    particles: { type: 'particles', count: 50, size: 10, speed: 16 }
  });

  /**
   * What a tile says about the WHOLE document rather than about its one layer.
   *
   * A second table because it holds a different kind of thing: STARTERS above
   * is spread into the layer, and these fields sit beside `layers` at the top
   * of the document. Keeping them apart is what lets the eleven silent entries
   * above stay one line each instead of every one of them growing a wrapper
   * for a field it has nothing to say about.
   *
   * One entry, and the wake is the whole reason it exists. The trail is a
   * document-wide veil (see MAX_TRAIL in src/engine/document.js), so the
   * particle tile cannot ask for it from inside its layer — and without it the
   * geometry above is only half the picture: big slow drops with no wake are
   * big slow drops, not comet tails. 45 is the short end of the slider, which
   * is where the corpus's own alpha 0.13 lands.
   */
  const STARTER_DOCUMENT_FIELDS = Object.freeze({
    particles: { trail: 45 }
  });

  /**
   * The document a tile produces, as data — the ONE definition of it.
   *
   * Handed to the starting gallery so each tile can draw what it makes, and
   * used by startEffect below to actually make it. That is the whole guard
   * against a tile that lies: there is no second description of a starting
   * document anywhere for the preview to drift away from, so a change to
   * STARTERS above, or to any default normalizeDocument fills in, moves the
   * picture on the tile in the same instant it moves the effect.
   *
   * Hands back null for a kind nothing starts, which is how the picture tile
   * is told apart from the other three without either side naming it.
   */
  function starterDocument(kind) {
    const starter = STARTERS[kind];
    if (!starter) return null;
    return {
      // Whatever this tile says about the document as a whole (the wake, for
      // the swarm), then its one layer. Before `layers` rather than after so
      // that a table entry can never overwrite it by accident.
      ...STARTER_DOCUMENT_FIELDS[kind],
      layers: [{ id: COLOUR_LAYER, ...starter, motions: [] }]
    };
  }

  /**
   * Begin an effect that has no picture in it.
   *
   * The counterpart of importFile above, and it follows the same order for the
   * same reasons — document first, then the crop (which now has nothing to
   * drag and says so), then the column, then the name, then the loop.
   *
   * And, like all four of them, it asks about unsaved work before it throws any
   * away. These three tiles are the only genuinely one-click destructive
   * controls in the window — the picture tile at least puts a file dialog in
   * front of the damage, and a drop takes a deliberate drag — and they sit
   * directly under the stage, a few pixels from where the work is. A mis-click
   * there used to replace the whole document with no dialog, no cancel and no
   * undo. All four entrances now behave alike, and they behave alike in the
   * direction that cannot lose work.
   */
  async function startEffect(kind) {
    const starter = starterDocument(kind);
    if (!starter) {
      console.error('gallery: no such effect kind', kind);
      return;
    }
    // Before anything on screen is touched, and before the message line is
    // cleared: a cancelled question must leave the window exactly as it was,
    // down to the sentence it is showing.
    if (!(await mayDiscard())) return;
    try {
      showMessage('');
      await preview.setDocument({
        // The tile's own word, which is a translated string the user can then
        // type over. A name is not optional: it becomes the file SignalRGB
        // lists, and the export refuses an empty one rather than inventing
        // "Untitled" (see src/main/export-effect.js).
        name: i18n.t(`gallery.${kind}`),
        ...starter
      });
      // Nothing to crop: this is what makes the canvas stop being a tab stop
      // and the drag inert (see draggableLayer above).
      sourceSize = null;
      // No picture, so no colours to take a thumbnail from. Back to the
      // resting outline rather than leaving the last picture's tint behind.
      retintThumbnail(null);
      markChanged();
      // A fresh effect is not the effect any library tile stands for.
      setCurrentEffect(null);
      crop.refresh();
      inspector.refresh();
      showContent({ arrived: true });
      showName(preview.document().name);
      preview.start();
    } catch (err) {
      console.error('could not start an effect:', err);
      showMessage(`${i18n.t('gallery.startFailed')}: ${err.message || err}`, true);
    }
  }

  mountDrop(regions.preview, {
    onFile: importFile,
    onReject: (name) => {
      showMessage(`${i18n.t('preview.dropUnsupported')}: ${name}`, true);
    }
  });

  // The starting gallery, under the stage: how an effect begins. All four
  // tiles do something now — a picture through the same import path a drop
  // uses, and the other three straight into a document (see startEffect).
  const gallery = mountGallery(regions.preview, {
    t: (k) => i18n.t(k),
    onStart: startEffect,
    // What each tile draws on itself: the very document pressing it produces.
    starterDocument,
    // The other shelf: an effect that already exists, opened again. Goes
    // through the same unsaved-work question every other entrance does — and
    // through the same guard, which is the part that was missing. A tile press
    // is fire and forget (gallery.js awaits nothing), so anything that threw on
    // the way — a foreign effect whose embedded picture will not decode being
    // the real case — made pressing a tile do visibly nothing at all.
    onOpenEffect: guard('library.openFailed', openEffect),
    /**
     * One library tile's picture, as PNG bytes in base64.
     *
     * The window asks by the leaf name it was handed and gets bytes back; it
     * never learns where the file is, and it cannot ask for one that is not in
     * the folder (see findEffect in src/main/effects-library.js). A tile whose
     * picture cannot be produced gets null and keeps its resting state, which
     * is why this swallows rather than reports: a missing tile picture is not
     * worth taking the one line of feedback away from whatever the user did.
     */
    requestCover: async (file) => {
      try {
        const result = await window.sf.library.cover(file);
        return result.ok ? result.png : null;
      } catch (err) {
        console.error('could not get a tile picture:', err);
        return null;
      }
    },
    // A dialog can only offer what the importer accepts, but `accept` is a
    // hint the operating system is free to ignore ("all files" is one click
    // away in every file dialog there is), so the same judgement the drop
    // path makes is made here too rather than trusted to the dialog.
    onPicture: (file) => {
      if (!isSupportedImage(file.name)) {
        showMessage(`${i18n.t('preview.dropUnsupported')}: ${file.name}`, true);
        return;
      }
      importFile(file);
    }
  });

  /**
   * Save what is on screen.
   *
   * `preview.document()` is the one live document — the same object the crop
   * drag and the settings column write into — so what gets saved is by
   * construction what the user is looking at, with no second copy to be out
   * of date. Which file it lands in is decided by a dialog the main process
   * opens; nothing here names a path, and the bridge has no parameter for one
   * (see app/preload.cjs).
   *
   * Hands back whether the document is now in a file — false for a cancelled
   * dialog as much as for a failed write, because the one caller that asks
   * (mayDiscard below) is about to throw the document away if it is told yes.
   */
  async function saveProject() {
    const result = await window.sf.saveProject(preview.document());
    if (result.canceled) return false;
    if (!result.ok) {
      showMessage(`${i18n.t('project.saveFailed')}: ${result.message}`, true);
      return false;
    }
    showMessage(`${i18n.t('project.saved')}: ${result.name}`);
    // What is on screen is now in a file, character for character — the
    // document that was written is the live one (see above), not a copy.
    markSaved();
    return true;
  }

  /**
   * Whether the document on screen may be thrown away, asking first when
   * there is anything to lose.
   *
   * The question is a native, window-modal one the main process opens (see
   * sf:confirmDiscard in app/main.js); every word in it comes from here,
   * because this is where the language is. Answering "save" runs the ordinary
   * save, dialog and all, and a save that is cancelled or fails means the
   * work is still unsaved and nothing may be discarded — so it says no.
   *
   * With nothing unsaved it asks nothing at all: a question that appears when
   * there is no risk is how a user learns to click it away without reading.
   */
  async function mayDiscard() {
    if (!unsavedChanges) return true;
    const answer = await window.sf.confirmDiscard({
      title: i18n.t('project.unsaved.title'),
      body: i18n.t('project.unsaved.body'),
      save: i18n.t('project.unsaved.save'),
      discard: i18n.t('project.unsaved.discard'),
      cancel: i18n.t('project.unsaved.cancel')
    });
    if (answer === 'save') return saveProject();
    return answer === 'discard';
  }

  /**
   * Open a project, replacing everything on screen — but only once the user
   * has been asked about anything unsaved, and only once the file has proved
   * itself readable and its picture decodable. Up to that point the project
   * already open is untouched, which is what an unreadable, truncated or
   * foreign file must leave behind: a message, and the work the user still
   * had.
   *
   * The question comes before the file dialog rather than after it, which is
   * the other way round from most programs. It is deliberate: being made to
   * pick a file and only then being told the work is about to be lost is two
   * decisions in the wrong order, and the first of them was wasted.
   */
  async function openProject() {
    if (!(await mayDiscard())) return;

    const result = await window.sf.openProject();
    if (result.canceled) return;
    if (!result.ok) {
      showMessage(`${i18n.t('project.openFailed')}: ${result.message}`, true);
      return;
    }

    await showDocument(result.document);
    // A project file and an effect file are two different things: what is on
    // the stage came out of a .sfx, so no tile in the library stands for it.
    setCurrentEffect(null);

    // A project that had to be corrected on the way in says so rather than
    // quietly presenting something other than what the file held.
    if (result.problems.length > 0) {
      showMessage(`${i18n.t('project.repaired')}: ${result.problems.join(' ')}`, true);
    } else {
      showMessage(`${i18n.t('project.opened')}: ${result.name}`);
    }
  }

  /**
   * Put a document that came out of a FILE on the stage.
   *
   * The one path for it, and there are two files it can have come out of now: a
   * saved project (.sfx) and an exported effect (.html, reopened out of the
   * library). Written once because the order of these lines is load-bearing and
   * a second copy would drift out of it — the picture is measured and decoded
   * BEFORE anything on screen is touched, so a file whose picture will not
   * decode leaves the document already open exactly as it was, message and all.
   *
   * Everything after the measurement is the window catching up with a document
   * it did not have a moment ago: the crop (which now has something else to
   * drag, or nothing), the settings column (whose sections depend on the layer
   * type), the column's scroll position, the name in both places it is shown,
   * and the render loop.
   */
  async function showDocument(doc) {
    const sizes = await measureEmbeddedAssets(doc);

    await preview.setDocument(doc);
    // Whatever the one layer is: a document that carries a gradient has no
    // asset to measure, and one whose picture layer is called something
    // other than this window's own name for it (a document built by the
    // command line calls it "a1") still has to be measurable.
    const layer = pictureLayer(doc);
    const measured = layer && sizes.has(layer.asset) ? sizes.get(layer.asset) : null;
    sourceSize = measured ? { width: measured.width, height: measured.height } : null;
    // The pictures were decoded a few lines up to be measured, so the colours
    // for the backdrop cost nothing more than reading one of them. A document
    // with no picture in it puts the seed colours back rather than leaving
    // the previous one's tint behind.
    retintThumbnail(measured ? measured.image : null);
    // A document brings its own picture and its own fit mode, so whether the
    // canvas is a tab stop is decided fresh here too.
    crop.refresh();
    inspector.refresh();
    // A whole new document: the column goes back to its top, where the section
    // that says what this document IS already sits.
    showContent({ arrived: true });
    showName(doc.name);
    preview.start();
    // What is on screen came out of a file and has not been touched since.
    // That holds for a repaired document too: the corrections are the parser's,
    // not the user's, and there is no work here of theirs to lose.
    markSaved();
  }

  // -------------------------------------------------------------- the library

  /**
   * Which effect in the library is the one on the stage, by file name, or null.
   *
   * Set when one is opened out of the library and when an export lands (the
   * export writes exactly that file, so the strip would be lying if it went on
   * marking the previous one). Cleared by every gesture that begins something
   * new, because from that moment what is on the stage is no longer the effect
   * that file holds.
   */
  let currentEffect = null;

  function setCurrentEffect(file) {
    currentEffect = file;
    gallery.setCurrent(file);
  }

  /**
   * Read the effects folder again and show what is in it.
   *
   * WHEN, AND WHY THERE IS NO WATCHER. Three moments: the window starting, an
   * export landing, and the window being given the focus back. The last one is
   * what covers everything that happens outside this app — an effect deleted in
   * Explorer, one written by the command line — and it covers it at the only
   * moment it could matter, because a folder cannot have changed under a window
   * that has had the focus the whole time. A watcher on that folder would have
   * to run whether or not anybody ever looks at the strip; this costs a
   * directory listing at the moment somebody comes back to the window, and the
   * main process answers most of those out of a cache (see app/main.js).
   *
   * Never fatal and never a message: a library that could not be read is an
   * empty shelf, and the one line of feedback belongs to the thing the user
   * just did.
   */
  async function refreshLibrary() {
    try {
      const result = await window.sf.library.list();
      gallery.setLibrary({
        entries: result.ok ? result.entries : [],
        hasFolder: result.ok ? result.hasFolder : false,
        // What the folder holds that this shelf cannot offer. It was counted
        // and thrown away, so a file the user knows is in that folder simply
        // vanished — MaxAmbient.html, his own, being the case that matters.
        skipped: result.ok ? result.skipped : 0
      });
      gallery.setCurrent(currentEffect);
    } catch (err) {
      console.error('could not read the effects folder:', err);
    }
  }

  /**
   * Open an effect out of the library.
   *
   * The same shape as openProject above, question and all: the unsaved-work
   * question comes first, then the file is read and proved readable, and only a
   * document that arrived intact ever reaches the stage. An effect made by an
   * older SignalForge opens here too — that is what normalizeDocument's
   * compatibility is for, and it is why the document comes back through the
   * very same gate a project file passes (see src/main/effect-document.js).
   */
  async function openEffect(entry) {
    if (!(await mayDiscard())) return;

    const result = await window.sf.library.open(entry.file);
    if (!result.ok) {
      showMessage(`${i18n.t('library.openFailed')}: ${result.message}`, true);
      return;
    }

    await showDocument(result.document);
    // The effect on the stage IS this file now, so the strip says so.
    setCurrentEffect(result.file);

    if (result.problems.length > 0) {
      showMessage(`${i18n.t('project.repaired')}: ${result.problems.join(' ')}`, true);
    } else {
      showMessage(`${i18n.t('library.opened')}: ${result.name}`);
    }
  }

  /**
   * Write the finished effect into SignalRGB's own folder.
   *
   * `preview.document()` again: the same one live document the crop drag,
   * the settings column and the name field all write into, so what lands in
   * SignalRGB is by construction what is on screen. No path is passed —
   * `force` is the only thing this end gets to decide, and it is only ever
   * true because the user answered the question below (see app/preload.cjs).
   *
   * A "not found" folder is asked about first, once, and the export is then
   * tried again rather than making the user press the button twice.
   */
  async function exportEffect(force = false) {
    footer.askOverwrite(false);

    let result = await window.sf.exportEffect(preview.document(), { force });
    if (result.reason === 'folder') {
      showTarget(await window.sf.chooseFolder());
      result = await window.sf.exportEffect(preview.document(), { force });
    }

    if (result.ok) {
      // Path and size, because "saved" without them is a claim the user
      // cannot check. The restart hint the CLI still prints is deliberately
      // left out: docs/erkenntnisse-signalrgb-motor.md records, measured,
      // that a new file appears in SignalRGB's list at once.
      const kb = (result.bytes / 1024).toFixed(1);
      // The effect is saved either way; the tile picture beside it is the one
      // part that can fail on its own (it needs a window to draw in). Saying
      // so is the whole point — a tile that silently did not appear would
      // leave somebody looking for it in SignalRGB with no idea why.
      if (result.coverMessage) {
        showMessage(`${i18n.t('export.done')}: ${result.path} (${kb} KB) — `
          + `${i18n.t('export.noCover')}: ${result.coverMessage}`, true);
      } else {
        showMessage(`${i18n.t('export.done')}: ${result.path} (${kb} KB)`);
      }
      // The name field must show what actually ended up on disk. When the
      // document's own name held a character effectFileName had to clean up
      // (a "/", a ":", ...), leaving the original text in the field would
      // read as a promise the export did not keep — the file on disk is
      // named after result.name, not after whatever is still typed here.
      showName(result.name);
      // The effects folder has just gained (or replaced) a file, so the shelf
      // that shows that folder is read again — this is what makes an effect
      // appear as a tile the moment it is written, with the tile picture the
      // export drew for it. And what is on the stage is now that very file, so
      // it is the tile that gets marked as open.
      setCurrentEffect(result.file);
      refreshLibrary();
      return;
    }

    if (result.reason === 'exists') {
      // Never silently. The full path is in the question, and the answer is
      // a button that has to be pressed on purpose.
      //
      // And the question names everything the answer spends. Pressing
      // "Überschreiben" replaces the tile picture beside the effect too, so a
      // question that named only the .html was asking for less than it took —
      // the main process says which of the two files that actually applies to
      // (see exportEffect), rather than this end guessing from a name and an
      // extension it would have to know.
      const question = result.coverPath ? 'export.existsWithCover' : 'export.exists';
      showMessage(`${i18n.t(question)} ${result.path}`, true);
      footer.askOverwrite(true);
      return;
    }

    const reasons = {
      name: 'export.badName',
      empty: 'export.nothing',
      folder: 'export.needsFolder'
    };
    if (reasons[result.reason]) {
      showKey(reasons[result.reason], true);
      return;
    }
    showMessage(`${i18n.t('export.failed')}: ${result.message}`, true);
  }

  /**
   * A footer action. Every failure ends up on the same line of the window as
   * every other one: these handlers are event callbacks with nobody awaiting
   * them, so an unexpected throw would otherwise be an unhandled rejection
   * nobody but the console ever hears about.
   */
  function guard(failedKey, run) {
    // The arguments travel through, so a handler that is HANDED something can
    // be guarded too: a library tile passes the entry it stands for
    // (see onOpenEffect below), and before this it was the one document
    // entrance in the window with no guard at all.
    return (...args) => run(...args).catch((err) => {
      console.error(`${failedKey} failed:`, err);
      showMessage(`${i18n.t(failedKey)}: ${err.message || err}`, true);
    });
  }

  /**
   * Say everything in the window again, in the language now in force.
   *
   * Deliberately re-labelling the pieces that are already on screen instead of
   * rebuilding the window: a rebuild would take the preview canvas (and the
   * render loop drawing into it) with it, drop the picture and the crop the
   * user has been working on, and throw away the keyboard focus — all for a
   * change that alters nothing but words.
   */
  /**
   * The names of the two regions, which nobody sees and a screen reader needs.
   *
   * The window used to have a named `<nav>` landmark and, through it, one place
   * to jump to. With that column gone the two columns that ARE the window have
   * to carry their own names, or a screen reader meets one undifferentiated
   * main region: `<section aria-label>` is a region landmark, so this is the
   * whole of it. Set from here rather than in components/shell.js because they
   * are translated strings and that file deliberately owns no text — see the
   * note there on why the frame must never be rebuilt.
   */
  function labelRegions() {
    regions.stage.setAttribute('aria-label', i18n.t('region.stage'));
    regions.column.setAttribute('aria-label', i18n.t('region.settings'));
  }

  function applyLanguage(next) {
    i18n.setLanguage(next);
    document.documentElement.lang = i18n.language;
    labelRegions();
    gallery.relabel();
    appSettings.relabel();
    firstRun.relabel();
    footer.relabel();
    // The empty frame's invitation. The cost chip beside it re-states itself
    // on the next frame it draws, but the invitation is only written when the
    // language says so — and it is on screen exactly when nothing is drawing.
    preview.relabel();
    // The canvas's accessible name is a translated string like any other; it
    // is just the only one nobody can see.
    crop.refresh();
    // Rebuilt rather than re-labelled: which fields exist depends on the
    // document, and mountInspector puts the keyboard focus back by itself.
    inspector.refresh();
    if (messageKey) showKey(messageKey, message.classList.contains('drop-warn'));
  }

  /**
   * A setting the window changed on the user's behalf.
   *
   * The write can fail (a read-only profile, a full disk), and `sf.settings.set`
   * rejects when it does — in which case what is on screen is still what the
   * user asked for, but it will not be there after a restart. That is worth a
   * line in the window: silently forgetting a choice is exactly the kind of
   * thing somebody blames themselves for.
   */
  function remember(key, value) {
    return window.sf.settings.set(key, value).catch((err) => {
      console.error(`could not store ${key}:`, err);
      showKey('settings.saveFailed', true);
    });
  }

  const footer = mountFooter(regions.footer, {
    t: (k) => i18n.t(k),
    // Straight into the live document, through the engine's own setByPath,
    // exactly like every field in the settings column — so the name the
    // export uses and the name a saved project carries are the same one,
    // with no second copy kept here to go stale.
    onNameChange: (value) => {
      if (!window.SignalForgeEngine.setByPath(preview.document(), 'name', value)) {
        console.error('footer: refused to write the name');
        return;
      }
      // The name is part of the document and travels into the saved file, so
      // typing in that field is unsaved work like anything else. Only a write
      // that actually took counts — and only a write the USER made: the
      // export's own showName() puts text in the field without firing this,
      // which is right, because an export is not a change to the project.
      markChanged();
      // The caption under the stage is the same name, so it follows the field
      // as it is typed rather than only when a document arrives.
      preview.setTitle(value);
    },
    onExport: guard('export.failed', () => exportEffect(false)),
    onOverwrite: guard('export.failed', () => exportEffect(true)),
    onSave: guard('project.saveFailed', saveProject),
    onOpen: guard('project.openFailed', openProject),
    // A toggle, and read as one: pressing it while the app's settings are up
    // is how somebody gets back to the effect they were editing. There is no
    // other way back and there does not need to be — the same control, in the
    // same place, marked with the state it is in.
    onSettings: () => showSettings(!settingsShowing)
  });

  // The app's own two settings, in the settings column, reached by the toggle
  // at the head of the transport bar's actions. They were wedged into the
  // footer beside the buttons once, which is what stopped that row from ever
  // being a transport bar; the left column then held the way to them, and that
  // column has since gone the way of everything else that only pointed at
  // something already on screen.
  const appSettings = mountAppSettings(regions.settings, {
    t: (k) => i18n.t(k),
    language,
    languages,
    onLanguageChange: (next) => {
      applyLanguage(next);
      remember('language', next);
    },
    onChooseFolder: guard('settings.folderFailed', async () => {
      showTarget(await window.sf.chooseFolder());
    })
  });

  /**
   * The effect's name, in both places it is said: the field in the transport
   * bar and the caption under the stage. One call, so the two cannot drift.
   */
  function showName(text) {
    footer.setName(text);
    preview.setTitle(text);
  }

  /** The transport bar, the settings panel and the first-start question all
   * read the same target. */
  function showTarget(target) {
    footer.setTarget(target);
    appSettings.setTarget(target);
    firstRun.setTarget(target);
  }

  labelRegions();
  showName(preview.document().name);
  // The resting state: the effect's own settings, with nothing announced as
  // having arrived, because nothing has.
  showSettings(false, { initial: true });
  showTarget(await window.sf.effectsTarget());

  // What is already in the effects folder, now and whenever the window is
  // given the focus back — see refreshLibrary on why that is the whole of the
  // watching this needs. Not awaited: the window is usable without the strip's
  // second shelf, and a slow folder must not hold the first paint up.
  window.addEventListener('focus', () => { refreshLibrary(); });
  refreshLibrary();

  // The first start's own language is not a choice the user made, so it is
  // written back now: from the next start on, the machine's language has no
  // say and the stored one decides. Deliberately last and deliberately not
  // awaited — the window is already usable, and a settings file that cannot be
  // written must not keep the app from starting.
  if (settings.language !== language) remember('language', language);
}

boot().catch((err) => {
  console.error('SignalForge failed to start:', err);
  // The language files themselves failed to load, so this last-resort
  // message cannot come from them — it is deliberately a plain, hard-coded
  // English sentence rather than a translation-key lookup, and that is not
  // a violation of the "no hard-coded UI strings" rule.
  document.getElementById('app').textContent =
    'SignalForge failed to start. See the console for details.';
});
