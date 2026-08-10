// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * The self-test: the app started for real, worked through from the outside,
 * and every measurement printed as one line of JSON for test/app/boot.test.js
 * to judge.
 *
 * This is an Electron main entry of its own — the same shape as
 * walkthrough.js, and for the same reason. It imports app/main.js, the real
 * one, unchanged: that registers every IPC handler and opens the real window
 * on its own, and everything below then reaches into that window from out
 * here. It used to live inside app/main.js behind SF_SELFTEST, which meant
 * Electron read some 380 lines of test driver on every ordinary start of the
 * app and two mutable test variables sat in production scope. Nothing about
 * what is checked changed in the move; only where the checking lives.
 *
 *   npx electron test/harness/selftest.js
 *
 * `npm test` spawns exactly that (see test/app/boot.test.js). Two optional
 * environment variables are for a human running it by hand:
 *
 *   SF_SELFTEST_SHOTS  a folder to photograph every step into
 *   SF_SELFTEST_IMAGE  a real image file to put through the actual importer,
 *                      instead of the 4x4 PNG below
 *
 * Nothing here may touch the machine's real SignalRGB folder. Three things see
 * to that, all set up below before app/main.js's own whenReady handler runs:
 * userData is redirected into a throwaway directory (so the settings file is
 * genuinely absent and the first start is a real first start), SF_EFFECTS_SANDBOX
 * names that same directory as the sandbox app/main.js may not resolve outside
 * of, and the search for an existing installation is pointed at it too — so
 * "found nothing" is a fact rather than an accident of this machine.
 */
import { app, BrowserWindow } from 'electron';
import { readFileSync, writeFileSync, readdirSync, mkdtempSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SANDBOX_ENV } from '../../src/main/effects-target.js';
import { prepareImageFile } from '../../src/main/prepare-image.js';
import { serializeProject } from '../../src/main/project.js';
import { normalizeDocument } from '../../src/engine/document.js';
import { folderDialog, projectDialogs, searchRoots } from '../../app/main.js';
import { driver, wait } from './driver.js';

// This block has to run before app/main.js's own app.whenReady handler does,
// and it does: importing that module only REGISTERS the handler, and every
// module body finishes before the ready event fires.
const runDir = mkdtempSync(join(tmpdir(), 'signalforge-selftest-run-'));
const effectsFolder = join(runDir, 'Effects');
mkdirSync(effectsFolder, { recursive: true });

// The settings, and the effects folder, in a throwaway directory. Two reasons,
// both of them about not touching the machine this runs on: a test must not
// rewrite the settings of the app its owner actually uses, and the effects
// folder it exports into must provably not be the real SignalRGB one.
app.setPath('userData', runDir);
// The sandbox app/main.js must stay inside (src/main/effects-target.js). Set
// through the environment because app/main.js reads it at call time, not at
// import time — an ES import runs before every statement in this file, so
// setting it earlier is not possible. With it set, even a settings file that
// named somewhere real would be refused rather than written into.
process.env[SANDBOX_ENV] = runDir;
// The effects folder is deliberately NOT seeded: this starts from a settings
// file that does not exist, so it goes through the genuine first start — no
// folder found, the window asks, the answer is given through the real
// sf:chooseFolder handler (see selfTestFirstRun). Pointing the search for an
// existing installation at the throwaway directory is what makes "found
// nothing" a fact rather than an accident of the machine this runs on, and is
// a second guarantee that nothing here can reach the real SignalRGB folder
// even if a later change stopped setting one.
searchRoots.documents = () => runDir;
searchRoots.home = () => runDir;

/** Pictures only if a human asked for them; see SF_SELFTEST_SHOTS above. */
const DRIVING = { shotsDir: process.env.SF_SELFTEST_SHOTS || null };

/**
 * A 4x4 PNG, one colour per quarter — the smallest thing that is a real,
 * decodable picture rather than a placeholder string, so the checks below
 * exercise the genuine decode. Set SF_SELFTEST_IMAGE to a real image file to
 * put that through the actual importer instead, which is what the screenshots
 * for a human to look at are taken with.
 */
const SELFTEST_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAJ0lEQVR42mP4YGPzwcbG5kOFzYcKBhSOW94vt7xfv+7Y/Lpjg8IBAJkqGzE5EWVwAAAAAElFTkSuQmCC';

/**
 * The first start, driven in the real window.
 *
 * Two things happen exactly once in the life of an installation and are
 * therefore the easiest to get wrong and never notice again: the app has no
 * effects folder and has to ask for it, and nobody has chosen a language so
 * the machine's own has to decide. Both are checked here, on a settings file
 * that genuinely does not exist yet and with the search for an existing
 * SignalRGB installation pointed at a throwaway folder, so "found nothing" is
 * a fact rather than an accident of this machine.
 *
 * Only the folder dialog is replaced, for the same reason the two project
 * dialogs are: a modal OS dialog would sit waiting for a human.
 */
async function selfTestFirstRun(win, folder) {
  const { js, clickById, clickAndWait, shot, until, setSelect } = driver(win, DRIVING);
  const out = {};

  await until(`document.getElementById('first-run') !== null`, 'the window is built', 100);

  out.firstRunShown = await js(`document.getElementById('first-run').hidden === false`);
  // `hidden` is a property; whether anybody can SEE it is a computed style, and
  // the two came apart for real: giving .first-run a `display` of its own in
  // the stylesheet silently outranked the browser's `[hidden] { display: none }`
  // and left the question on screen for ever, with every check here still green.
  out.firstRunReallyVisible = await js(
    `getComputedStyle(document.getElementById('first-run')).display !== 'none'`
  );
  out.firstRunAsks = await js(`document.querySelector('#first-run button').textContent`);
  // The rest of the window must stay usable while the question is on screen —
  // that is the whole difference between a panel and a modal assistant.
  out.firstRunLeavesTheAppUsable = await js(
    `document.getElementById('footer-export').disabled === false`
  );
  await shot('00-first-run');

  // The language nobody chose. It has to be one the app actually speaks, it
  // has to be reflected on the document element, and it has to be written back
  // so the next start no longer depends on the machine's setting.
  out.navigatorLanguage = await js(`navigator.language`);
  out.documentLanguage = await js(`document.documentElement.lang`);
  // executeJavaScript evaluates a plain script, where top-level await is not
  // allowed — but it does resolve a promise the script hands back, so every
  // bridge call here is written as .then().
  await until(`window.sf.settings.all().then((s) => s.language !== '')`, 'the language is stored', 100);
  out.storedLanguage = await js(`window.sf.settings.all().then((s) => s.language)`);

  /** The language switch in the footer, operated the way a person operates it. */
  const chooseLanguage = async (code) => {
    await setSelect('footer-language', code);
    return js(`({
      settings: document.getElementById('inspector-title').textContent,
      section: document.querySelector('#inspector-body .field-group > h3').textContent,
      exportButton: document.getElementById('footer-export').textContent,
      brightness: document.querySelector('label[for="sf-brightness"]').textContent,
      // The invitation moved into the empty frame it is talking about (see
      // components/preview.js), so this reads it where it now lives. Its
      // second line names the file types the importer actually accepts, and
      // is translated too — a list nobody translates is how "PNG, JPG" ends
      // up being the only English left in a German window.
      hint: document.getElementById('preview-empty-title').textContent,
      formats: document.getElementById('preview-empty-formats').textContent,
      awaitingImage: document.querySelector('#inspector-body .section-note').textContent,
      lineOfFeedback: document.querySelector('.drop-message').textContent,
      firstRun: document.querySelector('#first-run h2').textContent,
      documentLanguage: document.documentElement.lang
    })`);
  };

  out.inGerman = await chooseLanguage('de');
  await shot('00b-language-de');
  out.inEnglish = await chooseLanguage('en');
  await shot('00c-language-en');
  out.backInGerman = await chooseLanguage('de');
  // A chosen language is only chosen if it is still there after a restart.
  await until(
    `window.sf.settings.all().then((s) => s.language === 'de')`,
    'the chosen language is stored',
    100
  );

  // And the answer to the question. The folder dialog is the stub; everything
  // else is the real handler writing a real settings file.
  folderDialog.open = async () => ({ canceled: false, filePaths: [folder] });
  await clickById('first-run-choose');
  await until(`document.getElementById('first-run').hidden === true`, 'the question is answered', 100);
  out.firstRunReallyGone = await js(
    `getComputedStyle(document.getElementById('first-run')).display === 'none'`
  );
  out.targetAfterChoosing = await js(`document.getElementById('footer-target').textContent`);
  await shot('00d-folder-chosen');

  // The one line of feedback, and whether it follows a language switch.
  //
  // It used to carry the drop invitation from the moment the window opened,
  // so the checks above covered this for free; the invitation now lives in
  // the empty frame, which leaves the line honestly empty until something
  // happens. So make something happen: pressing export with no picture is the
  // cheapest keyed message there is — the export refuses before it touches the
  // disk (reason 'empty', see src/main/export-effect.js), and it comes back as
  // a KEY rather than as a sentence with a path in it, which is exactly the
  // case applyLanguage has to be able to say again.
  out.emptyExportMessage = await clickAndWait('footer-export');
  out.emptyExportInEnglish = (await chooseLanguage('en')).lineOfFeedback;
  out.emptyExportBackInGerman = (await chooseLanguage('de')).lineOfFeedback;

  return out;
}

/**
 * The one setting the window owns, and the two it must not, asked through the
 * real bridge in the real window.
 *
 * Run after selfTestFirstRun, deliberately: by then a folder has actually been
 * chosen, so "the effects folder is unchanged" is a statement about a real
 * path rather than about two empty strings, and the language is settled, so
 * setting it again to what it already is proves the channel still works
 * without disturbing the first-start checks above.
 */
async function selfTestSettingsGate(win) {
  return win.webContents.executeJavaScript(`(async () => {
    const before = await window.sf.settings.all();
    const refused = async (key, value) => {
      try { await window.sf.settings.set(key, value); return false; } catch { return true; }
    };
    const effectsFolder = await refused('effectsFolder', 'Z:\\\\renderer-chosen');
    const lastProjectFolder = await refused('lastProjectFolder', 'Z:\\\\renderer-chosen');
    const after = await window.sf.settings.all();
    const stored = await window.sf.settings.set('language', before.language);
    return {
      rendererCannotSetEffectsFolder: effectsFolder,
      rendererCannotSetLastProjectFolder: lastProjectFolder,
      pathSettingsUnchangedAfterRefusal:
        after.effectsFolder === before.effectsFolder &&
        after.lastProjectFolder === before.lastProjectFolder,
      rendererCanStillSetTheLanguage: stored.language === before.language && before.language !== ''
    };
  })()`);
}

/**
 * Save and open, driven through the app's own footer buttons.
 *
 * Only the two file dialogs are replaced (see projectDialogs in app/main.js):
 * a modal OS dialog would sit waiting for a human, and a test that waits for a
 * human is not a test. Everything else is the real thing — the real IPC
 * handlers, the real atomic write, the real parseProject, the real buttons
 * being clicked in the real window, the real picture being decoded.
 *
 * Deliberately asserts on the settings column's controls rather than on
 * rendered pixels: requestAnimationFrame does not tick in a window the
 * desktop is not actually showing, so a pixel check here would be a coin
 * toss. The screenshots (SF_SELFTEST_SHOTS) are where pixels get looked at.
 */
async function selfTestProjects(win) {
  const dir = mkdtempSync(join(tmpdir(), 'signalforge-selftest-'));
  const seedFile = join(dir, 'seed.sfx');
  const savedFile = join(dir, 'saved.sfx');
  const corruptFile = join(dir, 'corrupt.sfx');
  const smuggledFile = join(dir, 'smuggled.sfx');

  const imageFile = process.env.SF_SELFTEST_IMAGE;
  const asset = imageFile
    ? await prepareImageFile(imageFile)
    : { kind: 'image', mime: 'image/png', data: SELFTEST_PNG };

  // Every field a round trip has to carry, all of them away from their
  // defaults so a value that silently reverted would show up as a difference.
  const seed = normalizeDocument({
    name: 'Selftest', description: 'round trip', publisher: 'nobody',
    brightness: 42, saturation: 133, greenMagenta: -20, blueYellow: 15,
    layers: [{
      id: 'image', type: 'image', asset: 'image', name: 'the picture',
      fit: 'contain', opacity: 0.6, blend: 'screen', offset: { x: 0.25, y: -0.5 },
      motions: [{ kind: 'drift', speed: 7, amount: 66 }, { kind: 'breathe', speed: 88, amount: 12 }]
    }],
    assets: { image: asset }
  }).doc;
  writeFileSync(seedFile, serializeProject(seed), 'utf8');
  // Truncated mid-object: unreadable JSON, the commonest way a file goes bad.
  writeFileSync(corruptFile, '{"format": 1, "document": {"layers": [{"id": "ima', 'utf8');
  // Review finding: a shared .sfx whose asset names a `file` instead of
  // embedding it would have had the renderer's image loader try to resolve
  // an attacker-chosen path the moment the project opened. Written as raw
  // JSON, not through serializeProject/normalizeDocument — those would
  // normalize the asset shape away, which is exactly not what a foreign file
  // arriving over the open dialog looks like.
  writeFileSync(smuggledFile, JSON.stringify({
    format: 1,
    document: { ...seed, assets: { image: { kind: 'image', mime: 'image/png', file: 'C:/Windows/win.ini' } } }
  }), 'utf8');

  let saveTo = savedFile;
  let openFrom = seedFile;
  projectDialogs.save = async () => ({ canceled: false, filePath: saveTo });
  projectDialogs.open = async () => ({ canceled: false, filePaths: [openFrom] });

  const { js, clickAndWait, shot } = driver(win, DRIVING);
  /** The settings column's controls, by the ids field.js derives from the paths. */
  const controls = () => js(`({
    fit: document.getElementById('sf-layers-0-fit')?.value ?? null,
    motion0: document.getElementById('sf-layers-0-kind-0')?.value ?? null,
    motion1: document.getElementById('sf-layers-0-kind-1')?.value ?? null,
    speed0: document.getElementById('sf-layers-0-motions-0-speed')?.value ?? null,
    amount0: document.getElementById('sf-layers-0-motions-0-amount')?.value ?? null,
    brightness: document.getElementById('sf-brightness')?.value ?? null,
    saturation: document.getElementById('sf-saturation')?.value ?? null,
    greenMagenta: document.getElementById('sf-greenMagenta')?.value ?? null
  })`);

  const SAVE = 'footer-save';
  const OPEN = 'footer-open';
  const out = {};

  // boot() is asynchronous (language files, settings), so the footer may not
  // exist yet when the checks above have finished.
  for (let tries = 0; tries < 100; tries += 1) {
    if (await js(`document.getElementById('${OPEN}') !== null`)) break;
    await wait(50);
  }

  await shot('01-empty');
  out.projectOpenedMessage = await clickAndWait(OPEN);
  out.projectOpenedControls = await controls();
  await shot('02-opened');

  out.projectSavedMessage = await clickAndWait(SAVE);
  await shot('03-saved');
  // The strongest statement available: a project written out of what the live
  // window is showing is byte for byte the project that was read into it.
  out.projectRoundTripIdentical =
    readFileSync(savedFile, 'utf8') === readFileSync(seedFile, 'utf8');

  openFrom = corruptFile;
  out.corruptProjectMessage = await clickAndWait(OPEN);
  out.corruptProjectWarned = await js(
    `document.querySelector('.drop-message').classList.contains('drop-warn')`
  );
  // Untouched means untouched: the settings column must still be showing the
  // project that was already open, not defaults and not a blank document.
  out.controlsAfterCorrupt = await controls();
  await shot('04-corrupt');

  openFrom = smuggledFile;
  out.smuggledFileMessage = await clickAndWait(OPEN);
  out.smuggledFileWarned = await js(
    `document.querySelector('.drop-message').classList.contains('drop-warn')`
  );
  // Same untouched guarantee as the corrupt-file case above: a project
  // trying to smuggle an outside file reference must leave the window
  // showing exactly the project that was already open.
  out.controlsAfterSmuggled = await controls();
  await shot('05-smuggled');

  // The brightness slider stops at 5 on purpose (see RANGES in
  // components/inspector.js), but a document may carry less. An
  // <input type=range> shows the nearest end of its range for a value outside
  // it, so without widenToInclude this slider would sit at 5 and write 5 back
  // over the 3 in the file the moment anybody touched it. Only a real browser
  // can prove that clamping is gone; a plain node test cannot.
  const dimFile = join(dir, 'dim.sfx');
  writeFileSync(dimFile, serializeProject(normalizeDocument({
    ...seed, brightness: 3, layers: [{ ...seed.layers[0], fit: 'cover' }]
  }).doc), 'utf8');
  openFrom = dimFile;
  await clickAndWait(OPEN);
  out.dimBrightness = await js(`({
    value: document.getElementById('sf-brightness').value,
    min: document.getElementById('sf-brightness').min
  })`);

  // A document does not carry the size of its picture, so an opened project
  // has to have it measured again before the crop drag knows how much slack
  // there is. The cursor is the visible proof: 'grab' only appears where a
  // drag would actually do something (see restCursor in components/crop.js),
  // so a bare cursor here would mean the picture came back but could no
  // longer be moved.
  out.cursorOverPicture = await js(`(() => {
    const canvas = document.getElementById('preview-canvas');
    canvas.dispatchEvent(new PointerEvent('pointermove', { clientX: 10, clientY: 10, bubbles: true }));
    return canvas.style.cursor;
  })()`);

  return out;
}

/**
 * Export, driven through the app's own footer.
 *
 * Nothing here is stubbed. There is no dialog to replace: the target folder
 * comes from resolveEffectsTarget reading the settings, and this run's
 * settings live in a throwaway folder of their own (see the top of this file),
 * pointed at a throwaway Effects folder. That is the whole trick — the real
 * IPC handler, the real control list, the real buildEffectHtml, the real
 * atomic write, into a directory nobody cares about. A test must never
 * install anything into the SignalRGB folder the machine's owner actually
 * uses, and this one provably cannot: the path it wrote comes back in the
 * report for the check in test/app/boot.test.js to look at.
 */
async function selfTestExport(win, folder) {
  const { js, clickAndWait, shot, setInput } = driver(win, DRIVING);
  const out = { exportFolder: folder };

  const EXPORT = 'footer-export';
  const OVERWRITE = 'footer-overwrite';

  const overwriteOffered = () => js(`document.getElementById('${OVERWRITE}').hidden === false`);

  out.targetShown = await js(`document.getElementById('footer-target').textContent`);

  // The project left open by selfTestProjects carries brightness 3, which
  // would export as an effect nobody can see. Turning it back up with the
  // app's own slider is also the proof that an export carries what the
  // settings column currently says: the number that ends up in the written
  // file is checked against this one below.
  out.brightnessBeforeExport = await setInput('sf-brightness', '100');

  await setInput('footer-name', 'Selftest Export');
  out.exportedMessage = await clickAndWait(EXPORT);
  out.exportedFiles = readdirSync(folder);
  // Read straight out of the file that was written: the brightness control's
  // advertised default has to be the value the slider was standing at.
  out.exportedBrightnessDefault = /<meta property="brightness"[^>]*default="([^"]*)"/
    .exec(readFileSync(join(folder, 'Selftest Export.html'), 'utf8'))?.[1] ?? null;
  await shot('06-exported');

  // Exporting the same name again must ask, not overwrite. The question has
  // to name the full path and the answer has to be a button somebody presses
  // on purpose.
  out.existsMessage = await clickAndWait(EXPORT);
  out.existsWarned = await js(`document.querySelector('.drop-message').classList.contains('drop-warn')`);
  out.overwriteOffered = await overwriteOffered();
  await shot('07-overwrite-question');

  // Written before the answer, so "the file changed" below is a fact about
  // the overwrite and not about the first export.
  const target = join(folder, 'Selftest Export.html');
  writeFileSync(target, 'the effect that was already there', 'utf8');
  out.overwrittenMessage = await clickAndWait(OVERWRITE);
  out.overwriteReplacedTheFile = readFileSync(target, 'utf8').includes('SignalForgeEngine');
  out.overwriteWithdrawn = !(await overwriteOffered());
  await shot('08-overwritten');

  // A name made only of path separators must be refused out loud, and must
  // not have quietly become a folder, a drive or a file somewhere else.
  await setInput('footer-name', '///');
  out.badNameMessage = await clickAndWait(EXPORT);
  out.filesAfterBadName = readdirSync(folder);
  await shot('09-bad-name');

  // And a name that IS usable but full of characters a path is made of has
  // to land in this folder under a plain file name.
  await setInput('footer-name', 'a/b:c?d');
  out.sanitisedMessage = await clickAndWait(EXPORT);
  out.filesAfterSanitised = readdirSync(folder);
  // The name field must be left showing what actually landed on disk, not
  // the raw text that was typed — see the "sanitised name echoed back" check
  // in test/app/boot.test.js.
  out.nameFieldAfterSanitised = await js(`document.getElementById('footer-name').value`);
  await shot('10-sanitised-name');

  return out;
}

app.whenReady().then(async () => {
  try {
    // app/main.js's own whenReady handler is registered first (its module body
    // ran at import time) and runs to completion before this one, so the
    // window it opens is already there.
    const win = BrowserWindow.getAllWindows()[0];
    if (!win) throw new Error('app/main.js did not open a window');

    // Boot check for the test suite: prove the window came up, that the
    // renderer has the bridge but no Node, and that the navigation/popup
    // guards actually hold, then quit.
    if (win.webContents.isLoading()) {
      await new Promise((resolve) => win.webContents.once('did-finish-load', resolve));
    }
    const report = await win.webContents.executeJavaScript(
      `({ windowOpened: true, bridge: typeof window.sf === 'object',
          nodeInRenderer: typeof require === 'function' || typeof process === 'object' })`
    );

    // Read back rather than assumed: the background colour is taken out of
    // tokens.css (see backgroundFromTokens in app/main.js), and a read that
    // quietly found nothing would show up only as a white flash somebody
    // happened to notice on startup.
    report.windowBackground = win.getBackgroundColor();

    const urlBeforeNav = win.webContents.getURL();
    win.webContents
      .executeJavaScript(`location.href = 'https://example.invalid/blocked'`)
      .catch(() => {});
    await wait(300);
    report.navigationBlocked = win.webContents.getURL() === urlBeforeNav;

    const windowCountBefore = BrowserWindow.getAllWindows().length;
    const openReturnedNull = await win.webContents.executeJavaScript(
      `window.open('https://example.invalid/popup') === null`
    );
    report.popupBlocked =
      openReturnedNull === true && BrowserWindow.getAllWindows().length === windowCountBefore;

    // Finding-2 regression guard: a File object a renderer script forges
    // itself (as opposed to one that came from a real OS drop) has no disk
    // backing, so webUtils.getPathForFile resolves it to '' in the
    // preload. Prove that reaches the user as the ordinary visible-error
    // shape, not a silent no-op, an unhandled rejection, or — if the ''
    // guard in sf:importImage ever regressed — an actual filesystem read.
    const forgedImportResult = await win.webContents.executeJavaScript(
      `window.sf.importImage(new File([], 'forged.png'))`
    );
    report.forgedFileImportRejected =
      forgedImportResult != null &&
      forgedImportResult.ok === false &&
      typeof forgedImportResult.message === 'string' &&
      forgedImportResult.message.length > 0;

    Object.assign(report, await selfTestFirstRun(win, effectsFolder));
    Object.assign(report, await selfTestSettingsGate(win));
    Object.assign(report, await selfTestProjects(win));
    Object.assign(report, await selfTestExport(win, effectsFolder));

    if (DRIVING.shotsDir) process.stdout.write(`self-test screenshots: ${DRIVING.shotsDir}\n`);
    process.stdout.write(`self-test effects folder: ${effectsFolder}\n`);
    process.stdout.write(JSON.stringify(report) + '\n');
    app.quit();
  } catch (err) {
    console.error('self-test failed:', err);
    app.exit(1);
  }
});
