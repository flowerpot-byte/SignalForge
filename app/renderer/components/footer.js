// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import { icon } from './icons.js';

/**
 * The transport bar: what is loaded, where it is going, and the button that
 * sends it.
 *
 * It has the shape SignalRGB's own bottom bar has, because it is doing the
 * same job: a thumbnail of the thing that is loaded and its two lines of
 * identity on the left, the actions on the right, the one that matters
 * furthest out. What it is NOT any more is a settings panel with buttons on
 * the end — the language switch and the effects folder have gone to the
 * settings column where they belong (see components/appsettings.js), which is
 * the only reason this row can be a transport bar at all.
 *
 * WHAT IT INHERITED FROM THE LEFT COLUMN
 *
 * Two things, when that column was taken out (see components/shell.js for why
 * it went), and this bar is where they belong rather than where there happened
 * to be room:
 *
 *  - THE WORDMARK, at the head of the row, and it is the window's one <h1>.
 *    The bar now runs the full width of the window and is the only strip of
 *    the window that belongs to the app rather than to the effect, so the
 *    app's own name reads as a label on that strip instead of as a heading
 *    over a stage it does not describe. It is set quiet on purpose: the loud
 *    things in this row are the name of the thing being built and the one
 *    filled button, and a wordmark that competes with either is decoration.
 *
 *  - THE WAY INTO THE APP'S OWN SETTINGS, as the first and quietest of the
 *    actions. It is a toggle, not a door: pressing it swaps the settings
 *    column between the effect's settings and the app's, and it says which of
 *    the two is showing with `aria-pressed` and with the same raised fill the
 *    left column's active entry used to wear. It sits at the far end from the
 *    export, with the two document actions between them, because the row reads
 *    outwards from "the app" through "this project" to "send it".
 *
 * That is deliberately not a fourth word-and-icon button: at 1040px this row
 * has four of those already when the overwrite question is up, and the app's
 * settings are the least urgent thing in it. It is the same square glyph
 * button the settings column's own section headings use, with the same
 * obligation — never without an accessible name.
 *
 * The thumbnail is the picture's three strongest colours rather than the
 * picture itself, and that is a decision rather than a shortcut: this app
 * makes light, the chip is 40px across, and a 320 x 200 crop shrunk to 40px is
 * mush — whereas three bands of the colour the desk is actually going to be
 * are legible at that size and are the thing being previewed. With no picture
 * loaded it is a quiet outline holding the app's own mark, so the bar is never
 * a row with a hole at the start of it.
 *
 * Deliberately free of decisions, as before. It reports what the user did and
 * shows what it is told. Every handler passed in is expected to carry its own
 * error handling already — these are click callbacks with nobody awaiting
 * them.
 *
 * Ids are stable and spelled out (`footer-export`, `footer-save`, ...): the
 * self-test and the acceptance walkthrough drive these very buttons, and
 * finding them by their place in the row is a test that breaks every time a
 * button is added.
 */
export function mountFooter(container, {
  t, onNameChange, onExport, onOverwrite, onSave, onOpen, onSettings
}) {
  container.replaceChildren();

  // ---------------------------------------------------------------- the app
  // The window's one <h1>, and the only honest candidate for it: the name of
  // the whole thing. Everything else that carries a heading — the stage's
  // caption, the starting gallery, the first-start notice, each section of the
  // settings column — is a part of it and is an <h2>.
  const wordmark = document.createElement('h1');
  wordmark.className = 'transport-brand';
  wordmark.id = 'transport-brand';

  // ------------------------------------------------------------- what is loaded
  const now = document.createElement('div');
  now.className = 'transport-now';

  const thumb = document.createElement('div');
  thumb.className = 'transport-thumb';
  thumb.id = 'footer-thumb';
  // At rest it held the app's own mark, which was right when this was the
  // first thing in the row and there was no wordmark anywhere near it. The
  // wordmark is now immediately to its left, and a wordmark standing beside
  // the very mark it spells is the app saying its own name twice — the same
  // sin the left column was removed for. So the resting state says what is
  // actually true instead: nothing is loaded. It says it with the sign the
  // empty stage and the picture tile in the starting strip both already use
  // for exactly that, so it is the window's existing word for "waiting", not
  // a new one invented here.
  thumb.append(icon('drop'));

  const identity = document.createElement('div');
  identity.className = 'transport-identity';

  const nameRow = document.createElement('div');
  nameRow.className = 'transport-name-row';

  const nameLabel = document.createElement('label');
  nameLabel.htmlFor = 'footer-name';
  nameLabel.className = 'transport-name-label';

  const name = document.createElement('input');
  name.type = 'text';
  name.id = 'footer-name';
  name.className = 'transport-name';
  name.addEventListener('input', () => onNameChange(name.value));

  /**
   * The one place in the window that says work is in no file yet.
   *
   * A dot beside the name of the thing that is unsaved, which is where every
   * editor puts it. It is driven entirely by the `has-unsaved-changes` class
   * app/renderer/main.js already sets on <html> — this file learns nothing new
   * and decides nothing; the flag was correct and merely invisible.
   *
   * Three properties it has to have, and how each is got (see .transport-unsaved
   * in styles/app.css):
   *
   *  - It is a CHARACTER, not a colour. Somebody who cannot tell the accent
   *    from the page still sees a dot appear where there was none.
   *  - It never moves the row. The dot is in the layout at all times and only
   *    its `visibility` changes, so the name field is never resized by it.
   *  - It is announced, and only while it is true. `visibility: hidden` takes
   *    an element out of the accessibility tree as well as off the screen, so
   *    the label below is read exactly when the dot is showing.
   */
  const unsaved = document.createElement('span');
  unsaved.className = 'transport-unsaved';
  unsaved.id = 'footer-unsaved';
  // Not a translated string, and deliberately not one: it is a mark, like the
  // "320 x 200" chip on the stage. What it MEANS is the label, and that is.
  unsaved.textContent = '•';
  unsaved.setAttribute('role', 'img');

  nameRow.append(nameLabel, name, unsaved);

  // Where it is going. The second line of the identity block, exactly where
  // the reference puts the author of the effect it is showing.
  const target = document.createElement('span');
  target.id = 'footer-target';
  target.className = 'transport-target';
  let lastTarget = {};

  identity.append(nameRow, target);
  now.append(thumb, identity);

  // ------------------------------------------------------------------ actions
  function button(id, glyph, className) {
    const element = document.createElement('button');
    element.type = 'button';
    element.id = id;
    if (className) element.className = className;
    const word = document.createElement('span');
    // The icon is decoration: the word is right beside it, so announcing the
    // glyph as well would say everything twice.
    element.append(icon(glyph), word);
    return { element, word };
  }

  /**
   * The one action in this row that is about the app and not about the
   * document: a square glyph button with no word beside it, exactly as the
   * settings column's own section headings carry theirs.
   *
   * `aria-pressed` and not `aria-expanded`: nothing is being expanded — the
   * settings column shows one of two panels and this says which. setSettings()
   * below is called by whoever actually performed the swap, so the button can
   * never claim to be showing something it is not.
   */
  const settings = document.createElement('button');
  settings.type = 'button';
  settings.id = 'footer-settings';
  settings.className = 'icon-button transport-settings';
  settings.append(icon('settings'));
  settings.setAttribute('aria-pressed', 'false');
  settings.addEventListener('click', onSettings);

  const open = button('footer-open', 'folder', 'quiet');
  open.element.addEventListener('click', onOpen);
  const save = button('footer-save', 'save', 'quiet');
  save.element.addEventListener('click', onSave);
  const overwrite = button('footer-overwrite', 'save', 'warn-outline');
  overwrite.element.addEventListener('click', onOverwrite);
  // Only ever on screen while there is a question waiting to be answered, so
  // it can never be pressed for an export nobody asked about.
  overwrite.element.hidden = true;
  const exportButton = button('footer-export', 'spark', 'primary');
  exportButton.element.addEventListener('click', onExport);

  // What the export button SAYS: idle its own word, busy "saving", done a
  // short "saved" that folds back to idle on its own. The state lives here
  // (not in main.js) so relabel() can keep the current state's word through
  // a language switch, and so the fold-back timer cannot outlive a newer
  // state — setExportState always clears it first. Disabled while busy: the
  // second press an impatient double-click produces would start a second
  // export into the same file.
  let exportState = 'idle';
  let exportStateTimer = null;
  const exportWord = () => t(exportState === 'busy' ? 'footer.exporting'
    : exportState === 'done' ? 'footer.exported' : 'footer.export');
  function setExportState(state) {
    clearTimeout(exportStateTimer);
    exportStateTimer = null;
    exportState = state;
    exportButton.element.disabled = state === 'busy';
    exportButton.element.classList.toggle('is-busy', state === 'busy');
    exportButton.element.classList.toggle('is-done', state === 'done');
    exportButton.word.textContent = exportWord();
    if (state === 'done') {
      exportStateTimer = setTimeout(() => setExportState('idle'), 1600);
    }
  }

  const actions = document.createElement('div');
  actions.className = 'transport-actions';
  // The order is the reading order and the tab order at once, running outwards
  // from the app, through this project, to the one action the whole app exists
  // for. The overwrite answer sits directly beside the export it belongs to.
  actions.append(settings, open.element, save.element, overwrite.element, exportButton.element);

  container.append(wordmark, now, actions);

  /**
   * Say everything again in whatever language `t` now speaks.
   *
   * In place rather than by rebuilding: rebuilding would throw away the typed
   * name, any pending overwrite question and the keyboard focus, none of which
   * has anything to do with the language.
   */
  function relabel() {
    wordmark.textContent = t('app.title');
    nameLabel.textContent = t('footer.name');
    // The glyph is the whole button, so the name is the only thing announcing
    // it — and the same word the panel it opens is headed with, because they
    // are one thing said twice. The tooltip carries it too, for a pointer.
    settings.setAttribute('aria-label', t('inspector.title'));
    settings.title = t('inspector.title');
    unsaved.setAttribute('aria-label', t('project.unsaved.marker'));
    exportButton.word.textContent = exportWord();
    overwrite.word.textContent = t('export.overwrite');
    save.word.textContent = t('footer.save');
    open.word.textContent = t('footer.open');
    setTarget(lastTarget);
  }

  /**
   * Where the export will land, and how that was decided — a folder the user
   * picked reads differently from one the app went looking for, and "none
   * found" has to be visible before the button is pressed rather than only
   * after.
   */
  function setTarget(next = {}) {
    lastTarget = next ?? {};
    const { folder, source } = lastTarget;
    if (!folder) {
      target.textContent = t('export.noFolder');
      target.title = target.textContent;
      return;
    }
    const how = source === 'configured' ? t('export.sourceConfigured') : t('export.sourceDetected');
    target.textContent = `${t('settings.effectsFolder')}: ${folder} (${how})`;
    // The bar truncates this line before anything else in it, and at the
    // smallest window there is little left of it — so the whole path stays
    // reachable by resting on it, and is in the message after every export.
    target.title = target.textContent;
  }

  relabel();

  return {
    relabel,
    setTarget,
    setExportState,
    /** Show the document's name; called after a drop or an opened project. */
    setName(text) { name.value = text ?? ''; },
    /** Offer, or withdraw, the answer to "that file already exists". */
    askOverwrite(asking) { overwrite.element.hidden = !asking; },
    /**
     * Mark the settings toggle, after somebody else has actually swapped the
     * column. Both halves of the state are said: the class is what the eye
     * reads, `aria-pressed` what a screen reader reads, and neither is left to
     * be inferred from the other.
     */
    setSettings(showing) {
      settings.classList.toggle('is-on', showing);
      settings.setAttribute('aria-pressed', showing ? 'true' : 'false');
    },
    /**
     * The thumbnail's three bands, from the picture that is loaded. An empty
     * list puts the resting mark back — which is what an opened project with
     * no picture in it must produce, rather than the previous project's
     * colours left standing.
     *
     * The colours are computed from the picture (see components/palette.js) and
     * so cannot live in tokens.css; the resting state's colours are a class,
     * and do.
     */
    setColours(colours) {
      const has = Array.isArray(colours) && colours.length > 0;
      thumb.classList.toggle('has-colours', has);
      thumb.style.removeProperty('background');
      if (!has) return;
      const stops = colours
        .map((colour, index) => `${colour} ${(index * 100) / colours.length}% ${((index + 1) * 100) / colours.length}%`)
        .join(', ');
      thumb.style.background = `linear-gradient(160deg, ${stops})`;
    }
  };
}
