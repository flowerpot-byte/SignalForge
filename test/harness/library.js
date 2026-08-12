// SignalForge — build SignalRGB effects from images, gradients, shapes and particles.
// Copyright (C) 2026 Max Leopold Blumenschein
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * The effect library, driven in the real window.
 *
 * An Electron main entry of its own, the same shape as selftest.js and
 * unsaved.js and for the same reasons: it imports app/main.js — the real one,
 * unchanged — which registers every IPC handler and opens the real window, and
 * everything below reaches into that window from out here.
 *
 *   npx electron test/harness/library.js
 *
 * `npm test` spawns exactly that (see test/app/effect-library.test.js) and
 * judges the one line of JSON this prints.
 *
 * WHAT IT PROVES, end to end, in one run:
 *
 *  - two effects exported from the window appear as tiles, newest first, with
 *    the tile picture the export drew for them;
 *  - an effect that was never a project — only ever an exported .html — opens
 *    again, renders, and MOVES;
 *  - the unsaved-work question stands in front of that opening, both ways:
 *    cancelled, nothing changes at all; discarded, the effect arrives;
 *  - an effect opened from the library exports back under its own name, over
 *    the file it came from, and the tile picture is replaced with it;
 *  - and the library only ever READS the folder — looking at a shelf of tiles
 *    writes nothing into somebody's effects folder.
 *
 * THE REAL FILE. The last of those is checked twice: once against effects this
 * run made itself, and once against one of the machine owner's own effects,
 * copied into the throwaway folder. That file predates every one of this
 * project's motion fixes and was exported at a time when nothing could open an
 * effect again — it is the exact case the library was built for, and the only
 * honest way to know it opens is to open it. It is COPIED, never touched: the
 * original is read once, and nothing in this file writes anywhere but the
 * throwaway directory.
 *
 * THE WINDOW IS NEVER SHOWN (windowDisplay.show stays false via harnessSandbox),
 * which is why the frame pump is installed before anything is measured.
 */
import { app, BrowserWindow } from 'electron';
import { writeFileSync, readFileSync, copyFileSync, existsSync, readdirSync, statSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { discardDialog, DISCARD_ANSWERS } from '../../app/main.js';
import { readEffectDocument } from '../../src/main/effect-document.js';
import { driver, runHarness, wait } from './driver.js';
import { harnessSandbox } from './sandbox.js';

const { runDir, effectsFolder } = harnessSandbox('library');

// The folder is named up front: this harness is about what is IN it, not about
// the first-start question, and a panel over the stage would sit on top of the
// strip every check below reads.
writeFileSync(
  join(runDir, 'settings.json'),
  JSON.stringify({ effectsFolder, lastProjectFolder: runDir, language: 'de' }, null, 2),
  'utf8'
);

/**
 * One of the machine owner's own effects, copied in before the window ever
 * reads the folder.
 *
 * Read-only in every sense: copyFileSync reads the original and writes into the
 * throwaway directory, and nothing anywhere in this run writes to the source
 * folder. An absent one is reported rather than fatal — this harness has to
 * pass on a machine that has never run SignalRGB.
 */
const REAL_EFFECT = join(homedir(), 'Documents', 'WhirlwindFX', 'Effects', 'Verlauf.html');
const realAvailable = existsSync(REAL_EFFECT);
/** What the original looked like before this run touched anything. */
const realBefore = realAvailable
  ? (() => { const info = statSync(REAL_EFFECT); return { size: info.size, modified: info.mtimeMs }; })()
  : null;
if (realAvailable) copyFileSync(REAL_EFFECT, join(effectsFolder, 'Verlauf.html'));

app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');

const SHOTS = process.env.SF_LIBRARY_SHOTS || null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

/** How the unsaved-work question is answered next, and how often it was asked. */
let discardAnswer = 'discard';
let discardsAsked = 0;
discardDialog.ask = async () => {
  discardsAsked += 1;
  return { response: DISCARD_ANSWERS.indexOf(discardAnswer) };
};

const files = () => readdirSync(effectsFolder).sort();
const pngs = () => files().filter((name) => name.toLowerCase().endsWith('.png'));

const out = { realVerlaufAvailable: realAvailable };

runHarness('library harness', async () => {
  const [win] = BrowserWindow.getAllWindows();
  const {
    js, until, setInput, clickById, clickAndWait, message, stats, installPump, pump
  } = driver(win);

  /**
   * One photograph, the way a harness that pumps its own frames has to take it.
   *
   * The driver's own shot() waits for two REAL animation frames, and the pump
   * below has just taken requestAnimationFrame over — so it would wait forever
   * (it says so in driver.js). This is the same helper test/harness/shots.js
   * uses, and the two captures are for the same measured reason: on a window
   * nobody is showing, the FIRST capturePage() is what commits the canvas's own
   * layer, so a single one photographs an empty stage.
   */
  async function shot(name, { frames = 8 } = {}) {
    if (!SHOTS) return null;
    await pump(frames);
    await wait(200);
    const file = join(SHOTS, `${name}.png`);
    await win.capturePage();
    await wait(140);
    writeFileSync(file, (await win.capturePage()).toPNG());
    return file;
  }

  await new Promise((resolve) => win.webContents.once('did-finish-load', resolve));
  await installPump();
  // The strip reads the folder as the window starts; it is asked for over the
  // bridge, so it lands a tick or two after the first paint.
  await until(`document.querySelectorAll('.tile-effect').length === ${realAvailable ? 1 : 0}`,
    'the library to have read the folder');

  // ------------------------------------------------------------ the two shelves

  out.tabs = await js(`[...document.querySelectorAll('[role="tab"]')].map((tab) => ({
    id: tab.id,
    label: tab.textContent.trim(),
    selected: tab.getAttribute('aria-selected'),
    controls: tab.getAttribute('aria-controls'),
    tabIndex: tab.tabIndex
  }))`);
  out.startingTilesVisible = await js(`document.getElementById('gallery-rail').hidden === false`);
  out.libraryHiddenAtRest = await js(`document.getElementById('gallery-library').hidden === true`);
  // The four ways to start an effect are still exactly where they were.
  out.startingTiles = await js(
    `[...document.querySelectorAll('#gallery-rail .tile')].map((tile) => tile.dataset.tile)`
  );
  out.tabPaintAtRest = await js(`[...document.querySelectorAll('[role="tab"]')].map((tab) => {
    const style = getComputedStyle(tab);
    return {
      id: tab.id,
      selected: tab.getAttribute('aria-selected'),
      underline: style.borderBottomColor,
      colour: style.color
    };
  })`);
  await shot('01-start-shelf');

  // The library, opened.
  await clickById('gallery-tab-library');
  out.afterSwitching = await js(`({
    start: document.getElementById('gallery-rail').hidden,
    library: document.getElementById('gallery-library').hidden,
    selected: [...document.querySelectorAll('[role="tab"]')]
      .filter((tab) => tab.getAttribute('aria-selected') === 'true').map((tab) => tab.id)
  })`);

  /**
   * What the two headings actually LOOK like, read out of the window rather
   * than off a screenshot.
   *
   * The first photograph of this row showed both tabs underlined, which turned
   * out not to be a fault in the window at all: a window nobody is showing
   * composites nothing, so a CSS transition started by a click freezes part-way
   * and is photographed there. The transition is gone now (a heading that swaps
   * a shelf must not fade — see styles/app.css), and this is what keeps that
   * true: the paint is measured, not eyeballed, so a transition creeping back
   * onto this row shows up as two tabs whose underlines are neither fully on
   * nor fully off.
   */
  const tabPaint = () => js(`[...document.querySelectorAll('[role="tab"]')].map((tab) => {
    const style = getComputedStyle(tab);
    return {
      id: tab.id,
      selected: tab.getAttribute('aria-selected'),
      underline: style.borderBottomColor,
      colour: style.color
    };
  })`);

  const tileNames = () => js(
    `[...document.querySelectorAll('.tile-effect')].map((tile) => tile.querySelector('.tile-label').textContent)`
  );
  out.libraryAtStart = await tileNames();
  out.tabPaintOnLibrary = await tabPaint();

  /**
   * The tile picture of an effect that never had one.
   *
   * His Verlauf.html was exported before this app drew tile pictures at all, so
   * there is no .png beside it — the picture on that tile can only have come
   * from the effect's own first frame, drawn on demand in a window nobody sees.
   */
  if (realAvailable) {
    out.pngsBeforeLooking = pngs();
    await until(
      `document.querySelector('.tile-effect[data-effect="Verlauf.html"] .tile-photo')?.hidden === false`,
      'the lazily drawn tile picture to arrive'
    );
    out.drawnCover = await js(`(() => {
      const image = document.querySelector('.tile-effect[data-effect="Verlauf.html"] .tile-photo');
      return { isData: image.src.startsWith('data:image/png;base64,'), bytes: image.src.length };
    })()`);
    // And the folder is exactly as it was: looking at a shelf writes nothing.
    out.pngsAfterLooking = pngs();
  }
  await shot('02-library-shelf');

  // ------------------------------------------------- two effects, made and saved

  async function makeAndExport(tile, name) {
    await clickById('gallery-tab-start');
    await clickById(`gallery-${tile}`);
    await until(`document.getElementById('footer-name').value.length > 0`, `the ${tile} effect to start`);
    await setInput('footer-name', name);
    return clickAndWait('footer-export');
  }

  out.exportedA = await makeAndExport('linear', 'Tempo A');
  // A second one, and deliberately a different kind, so the two tiles cannot be
  // the same picture by accident.
  out.exportedB = await makeAndExport('solid', 'Tempo B');
  out.filesAfterExports = files();

  await clickById('gallery-tab-library');
  await until(`document.querySelectorAll('.tile-effect').length === ${realAvailable ? 3 : 2}`,
    'both new effects to appear as tiles');
  out.libraryAfterExports = await tileNames();
  out.tabCount = await js(`document.querySelector('#gallery-tab-library .gallery-tab-count').textContent`);
  // The effect that was just written is the one on the stage, and the strip
  // says which one that is.
  out.markedAfterExport = await js(
    `[...document.querySelectorAll('.tile-effect.is-current')].map((tile) => tile.dataset.effect)`
  );
  out.markedIsAriaCurrent = await js(
    `document.querySelector('.tile-effect.is-current')?.getAttribute('aria-current')`
  );
  // The tile pictures the exports wrote, shown as themselves.
  await until(
    `[...document.querySelectorAll('.tile-effect .tile-photo')].every((image) => image.hidden === false)`,
    'every tile to have a picture'
  );
  /**
   * What the strip costs in height, against the number the stage's own width is
   * derived from (--content-width in styles/app.css). They are two statements of
   * the same fact and there is no way to make one follow the other in CSS, so
   * the drift is measured instead: everything under the picture is meant to be
   * exactly as wide as the picture.
   */
  out.strip = await js(`(() => {
    const body = document.getElementById('preview-body');
    const gallery = document.getElementById('gallery');
    const picture = document.querySelector('.stage-inner');
    return {
      galleryHeight: Math.round(gallery.getBoundingClientRect().height),
      galleryWidth: Math.round(gallery.getBoundingClientRect().width),
      pictureWidth: Math.round(picture.getBoundingClientRect().width),
      tabsHeight: Math.round(document.getElementById('gallery-tabs').getBoundingClientRect().height),
      railHeight: Math.round(document.getElementById('gallery-library').getBoundingClientRect().height)
    };
  })()`);
  await shot('03-library-three');

  if (!realAvailable) {
    process.stdout.write(`${JSON.stringify(out)}\n`);
    return 0;
  }

  // ----------------------------------------------- the question, both answers

  // There is unsaved work on the stage (the effect that was just built; an
  // export is not a save), so opening another effect has to ask.
  out.unsavedBeforeOpening = await js(
    `document.documentElement.classList.contains('has-unsaved-changes')`
  );

  const openVerlauf = () => js(
    `document.querySelector('.tile-effect[data-effect="Verlauf.html"]').click(), true`
  );

  discardAnswer = 'cancel';
  const asked = discardsAsked;
  const messageBefore = await message();
  await openVerlauf();
  await wait(400);
  out.cancelled = {
    asked: discardsAsked - asked,
    name: await js(`document.getElementById('footer-name').value`),
    message: (await message()) === messageBefore,
    marked: await js(
      `[...document.querySelectorAll('.tile-effect.is-current')].map((tile) => tile.dataset.effect)`
    )
  };

  discardAnswer = 'discard';
  await openVerlauf();
  await until(`document.getElementById('footer-name').value === 'Verlauf'`, 'his effect to open');
  out.opened = {
    asked: discardsAsked - asked - 1,
    name: await js(`document.getElementById('footer-name').value`),
    message: await message(),
    marked: await js(
      `[...document.querySelectorAll('.tile-effect.is-current')].map((tile) => tile.dataset.effect)`
    ),
    // Nothing unsaved: what is on the stage came out of a file, untouched.
    unsaved: await js(`document.documentElement.classList.contains('has-unsaved-changes')`),
    // The settings column rebuilt itself around the document that arrived —
    // this is a gradient, so it has a gradient's controls and the motion his
    // effect carries.
    shape: await js(`document.getElementById('sf-layers-0-shape')?.value ?? null`),
    angle: await js(`document.getElementById('sf-layers-0-angle')?.value ?? null`),
    motion: await js(`document.getElementById('sf-layers-0-kind-0')?.value ?? null`),
    speed: await js(`document.getElementById('sf-layers-0-motions-0-speed')?.value ?? null`),
    amount: await js(`document.getElementById('sf-layers-0-motions-0-amount')?.value ?? null`),
    // The two colours of his ramp, read off the two colour fields.
    stops: await js(`[...document.querySelectorAll('#inspector-body input[type="color"]')]
      .map((input) => input.value)`)
  };
  // What the file itself says, read out here with the same reader the window
  // used — so "it opened correctly" is a comparison, not an impression.
  out.fileSays = (() => {
    const { doc } = readEffectDocument(readFileSync(join(effectsFolder, 'Verlauf.html'), 'utf8'));
    return {
      name: doc.name,
      shape: doc.layers[0].shape,
      angle: doc.layers[0].angle,
      motion: doc.layers[0].motions[0]?.kind ?? null,
      speed: doc.layers[0].motions[0]?.speed ?? null,
      amount: doc.layers[0].motions[0]?.amount ?? null,
      stops: doc.layers[0].stops
    };
  })();
  await shot('04-his-effect-open');

  // --------------------------------------------------------------- and it moves

  /**
   * Twelve frames, spread over real time: an effect that opened but stands
   * still would pass a "does it draw" check and fail the only one that matters.
   * His Verlauf carries a warp, which displaces each row of the picture
   * separately — that is what `bars` reads (see driver.js) — and it is the
   * motion that could not have survived unless the document really did come
   * back out of the file whole.
   *
   * The waits between the pumps are load-bearing: the pump hands each frame the
   * real performance.now(), so twelve frames pumped in one go would all land at
   * the same instant of the effect's own clock and the picture would rightly be
   * identical. This is 12 frames across about half a second, which is what the
   * effect would have got from a window somebody was looking at.
   */
  const frames = [];
  for (let i = 0; i < 12; i += 1) {
    await pump(1);
    await wait(40);
    frames.push(await stats());
  }
  out.animates = {
    drawsSomething: frames[0].mean > 1,
    framesDiffer: new Set(frames.map((frame) => frame.hash)).size,
    // How far the brightest column of three individual ROWS travelled: warp's
    // signature, and the one thing a still picture cannot fake.
    markerTravel: [0, 1, 2].map((row) => {
      const xs = frames.map((frame) => frame.bars[row]);
      return Math.max(...xs) - Math.min(...xs);
    }),
    saturated: frames.at(-1).saturation > 0.1
  };

  // ------------------------------------------------- saving it back over itself

  const before = statSync(join(effectsFolder, 'Verlauf.html'));
  out.coverBeforeSavingBack = existsSync(join(effectsFolder, 'Verlauf.png'));

  // A change somebody would make: the effect gets brighter.
  await setInput('sf-brightness', '160');
  out.changedBrightness = await js(`document.getElementById('sf-brightness').value`);
  out.unsavedAfterChange = await js(
    `document.documentElement.classList.contains('has-unsaved-changes')`
  );
  await shot('05-changed');

  // The name field still says what the file is called, so the export lands on
  // the very file it came from — and is asked about first.
  out.exportBack = await clickAndWait('footer-export');
  out.overwriteOffered = await js(`document.getElementById('footer-overwrite') !== null`);
  out.overwritten = await clickAndWait('footer-overwrite');

  const after = statSync(join(effectsFolder, 'Verlauf.html'));
  out.savedBack = {
    replaced: after.mtimeMs !== before.mtimeMs || after.size !== before.size,
    stillOneFile: files().filter((name) => name.startsWith('Verlauf')).sort(),
    coverAfter: existsSync(join(effectsFolder, 'Verlauf.png')),
    // The proof that it is the same effect with the change in it, read back out
    // of the file that is now on disk.
    brightness: readEffectDocument(
      readFileSync(join(effectsFolder, 'Verlauf.html'), 'utf8')
    ).doc.brightness
  };
  // And the original, in the machine owner's own folder, is exactly as it was —
  // measured against what it was before this run began, not against itself.
  // The copy in the throwaway folder has just been overwritten and its cover
  // written beside it, so "the same size and the same modification time" is a
  // real claim about the original and not a tautology.
  out.originalUntouched = (() => {
    const now = statSync(REAL_EFFECT);
    return now.size === realBefore.size && now.mtimeMs === realBefore.modified;
  })();

  // The tile picture that was drawn for it on the fly is now a real file, and
  // the strip shows that one.
  await clickById('gallery-tab-library');
  await until(`document.querySelectorAll('.tile-effect').length === 3`, 'the library to settle');
  out.libraryAtEnd = await tileNames();
  await shot('06-saved-back');

  // ------------------------------------------------------- and it speaks German

  out.germanTabs = await js(
    `[...document.querySelectorAll('[role="tab"]')].map((tab) => tab.firstChild.textContent)`
  );
  await js(`(() => {
    const select = document.getElementById('settings-language');
    select.value = 'en';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
  await wait(200);
  out.englishTabs = await js(
    `[...document.querySelectorAll('[role="tab"]')].map((tab) => tab.firstChild.textContent)`
  );
  // The strip is rebuilt on a language switch; the tiles and the mark survive it.
  out.afterLanguageSwitch = {
    tiles: await tileNames(),
    marked: await js(
      `[...document.querySelectorAll('.tile-effect.is-current')].map((tile) => tile.dataset.effect)`
    )
  };
  await shot('07-english');

  // The one thing this whole run must never have done.
  out.wroteOnlyIntoTheSandbox = files();

  process.stdout.write(`${JSON.stringify(out)}\n`);
  return 0;
}, { watchdogMs: 75_000 });
