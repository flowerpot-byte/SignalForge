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
import { mountSidebar, DESTINATIONS } from './components/sidebar.js';
import { mountGallery } from './components/gallery.js';
import { mountAppSettings } from './components/appsettings.js';
import { samplePalette } from './components/palette.js';

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
  function showPicture(has) {
    regions.preview.classList.toggle('has-picture', has);
    sidebar.setHasPicture(has);
    // The two picture-dependent destinations only exist once there is a
    // picture, so somebody standing on one of them when a project without one
    // is opened has to be moved off it rather than left looking at an empty
    // column. Going the other way, a picture that has just arrived puts the
    // column on "Bild", which is where its fit and its crop are.
    if (has && !hasPicture) showSection('image');
    if (!has && DESTINATIONS.some((d) => d.key === section && d.needsPicture)) showSection('colour');
    hasPicture = has;
  }
  const regions = mountShell(document.getElementById('app'));

  /**
   * Which destination the left column is pointing at.
   *
   * 'colour' at a fresh start, deliberately: it is the one section that exists
   * whether or not there is a picture, so the window never opens on a column
   * that is waiting for something.
   */
  let section = 'colour';
  let hasPicture = false;

  /** Mark the group the left column is pointing at, without moving anything. */
  function markSection() {
    sidebar.setActive(section);
    for (const group of regions.inspector.querySelectorAll('.field-group')) {
      group.classList.toggle('is-active', group.dataset.section === section);
    }
  }

  /**
   * Go to a destination.
   *
   * For the three that belong to the effect this scrolls the settings column
   * to that group and marks it; all three stay on screen, because one at a
   * time left the column mostly empty (see mountInspector for the measurement
   * and the screenshot that settled it). The fourth swaps the column for the
   * app's own settings, which is a different thing entirely and does take
   * over.
   */
  function showSection(next, { scroll = true } = {}) {
    section = next;
    // The app's own settings and the effect's settings share the column and
    // take turns; the effect's controls stay in the document either way (see
    // mountInspector on why they are never torn down).
    const settingsShowing = next === 'settings';
    regions.inspector.hidden = settingsShowing;
    regions.settings.hidden = !settingsShowing;
    markSection();
    if (settingsShowing || !scroll) return;
    const group = regions.inspector.querySelector(`.field-group[data-section="${next}"]`);
    // 'auto' rather than 'smooth': a scroll that animates would still be
    // moving when the next thing (a screenshot, a keyboard user's next arrow
    // press) arrives.
    if (group) group.scrollIntoView({ block: 'start', behavior: 'auto' });
  }

  const sidebar = mountSidebar(regions.nav, {
    t: (k) => i18n.t(k),
    active: section,
    onSelect: showSection
  });

  /**
   * Which group is actually under the eye, said back to the left column.
   *
   * Without this the marked entry would only ever be the last one clicked, so
   * scrolling the column past all three would leave the left column claiming
   * the wrong one — a map that lies about where you are is worse than no map.
   * It only ever MARKS; it never scrolls anything, so it cannot fight the
   * gesture that caused it.
   */
  regions.column.addEventListener('scroll', () => {
    if (section === 'settings') return;
    const top = regions.column.getBoundingClientRect().top + 24;
    let arrived = null;
    for (const group of regions.inspector.querySelectorAll('.field-group')) {
      if (group.getBoundingClientRect().top <= top) arrived = group;
    }
    const first = regions.inspector.querySelector('.field-group');
    const now = (arrived || first)?.dataset.section;
    if (!now || now === section) return;
    section = now;
    markSection();
  });

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
   * The class carries no styling yet — the window's visuals are being rebuilt
   * — but it is the one place a marker for "not saved" would hang off, and it
   * is what lets a test at the real window see the flag at all without the
   * renderer having to hand its internals out over the bridge.
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
   * alone instead of replacing it with an empty canvas.
   */
  function decodeAsset(asset) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('a picture in this project could not be decoded'));
      image.src = `data:${asset.mime};base64,${asset.data}`;
    });
  }

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

  function draggableLayer() {
    if (!sourceSize) return null;
    const layer = preview.document().layers.find((entry) => entry.id === IMAGE_LAYER);
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
      preview.setLayerOffset(IMAGE_LAYER, offset);
      markChanged();
    },
    announce: (message) => { cropAnnouncement.textContent = message; }
  });

  const inspector = mountInspector(regions.inspector, {
    t: (k) => i18n.t(k),
    getDocument: () => preview.document(),
    // Which of the three the left column is pointing at. Read on every redraw
    // rather than passed in once, so a redraw caused by something else — a
    // motion added, a project opened, a language switched — cannot put the
    // column back to showing all three.
    visibleSection: () => section,
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
   */
  async function importFile(file) {
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
        // The transport bar takes the new picture's colours. Not awaited: the
        // picture is already on screen and the chip is allowed to arrive a
        // frame later.
        retintFromAsset(result.asset);
        showPicture(true);
        // There is something to move now, so the canvas becomes a tab stop.
        crop.refresh();
        // The column had nothing but the document-wide sliders until now.
        inspector.refresh();
        showName(preview.document().name);
        preview.start();
      } catch (err) {
        console.error('image import failed:', err);
        showMessage(`${i18n.t('preview.dropFailed')}: ${err.message || err}`, true);
      }
  }

  mountDrop(regions.preview, {
    onFile: importFile,
    onReject: (name) => {
      showMessage(`${i18n.t('preview.dropUnsupported')}: ${name}`, true);
    }
  });

  // The starting gallery, under the stage: how an effect begins. Only the
  // "own picture" tile does anything today; the solid-colour and gradient
  // tiles are on screen and marked as unbuilt, because they need layer types
  // the engine does not have yet (see components/gallery.js).
  const gallery = mountGallery(regions.preview, {
    t: (k) => i18n.t(k),
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

    const doc = result.document;
    const sizes = await measureEmbeddedAssets(doc);

    await preview.setDocument(doc);
    const layer = doc.layers.find((entry) => entry.id === IMAGE_LAYER);
    const measured = layer && sizes.has(layer.asset) ? sizes.get(layer.asset) : null;
    sourceSize = measured ? { width: measured.width, height: measured.height } : null;
    // The pictures were decoded a few lines up to be measured, so the colours
    // for the backdrop cost nothing more than reading one of them. A project
    // with no picture in it puts the seed colours back rather than leaving
    // the previous project's tint behind.
    retintThumbnail(measured ? measured.image : null);
    showPicture(Boolean(measured));
    // A project brings its own picture and its own fit mode, so whether the
    // canvas is a tab stop is decided fresh here too.
    crop.refresh();
    inspector.refresh();
    showName(doc.name);
    preview.start();
    // What is on screen came out of a file and has not been touched since.
    // That holds for a repaired project too (below): the corrections are the
    // parser's, not the user's, and there is no work here of theirs to lose.
    markSaved();

    // A project that had to be corrected on the way in says so rather than
    // quietly presenting something other than what the file held.
    if (result.problems.length > 0) {
      showMessage(`${i18n.t('project.repaired')}: ${result.problems.join(' ')}`, true);
    } else {
      showMessage(`${i18n.t('project.opened')}: ${result.name}`);
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
      showMessage(`${i18n.t('export.done')}: ${result.path} (${kb} KB)`);
      // The name field must show what actually ended up on disk. When the
      // document's own name held a character effectFileName had to clean up
      // (a "/", a ":", ...), leaving the original text in the field would
      // read as a promise the export did not keep — the file on disk is
      // named after result.name, not after whatever is still typed here.
      showName(result.name);
      return;
    }

    if (result.reason === 'exists') {
      // Never silently. The full path is in the question, and the answer is
      // a button that has to be pressed on purpose.
      showMessage(`${i18n.t('export.exists')} ${result.path}`, true);
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
    return () => run().catch((err) => {
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
  function applyLanguage(next) {
    i18n.setLanguage(next);
    document.documentElement.lang = i18n.language;
    sidebar.relabel();
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
    onOpen: guard('project.openFailed', openProject)
  });

  // The app's own two settings, in the settings column behind the entry pinned
  // to the bottom of the left column. They used to be wedged into the footer
  // beside the buttons, which is what stopped that row from ever being a
  // transport bar.
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

  showName(preview.document().name);
  showSection(section);
  showTarget(await window.sf.effectsTarget());

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
