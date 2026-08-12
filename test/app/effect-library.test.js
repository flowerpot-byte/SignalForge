// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max Leopold Blumenschein
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { runElectron } from '../harness/spawn-electron.js';
import { TILES } from '../../app/renderer/components/gallery.js';

const require_ = createRequire(import.meta.url);
const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

const dictionary = (name) => JSON.parse(
  readFileSync(join(root, 'app', 'renderer', 'i18n', `${name}.json`), 'utf8')
);

/**
 * Run test/harness/library.js — the real app/main.js, the real window, the real
 * effects folder (a throwaway one) — and hand back the JSON it prints.
 *
 * 90 s here against the harness's own 75 s watchdog, so a wedged run says which
 * step it wedged on rather than being killed without a word. The window holds a
 * running preview and draws tile pictures in windows of its own, so it yields
 * priority for the same reason the unsaved-changes harness does.
 */
async function runLibraryHarness() {
  const { code, stdout, stderr } = await runElectron(
    require_('electron'),
    [join(root, 'test', 'harness', 'library.js')],
    { timeoutMs: 90_000, label: 'the effect-library harness', yieldPriority: true }
  );
  assert.equal(code, 0, `the harness exited with ${code}\n${stderr}`);
  return JSON.parse(stdout.trim().split('\n').pop());
}

/**
 * The complaint this whole feature answers, in the machine owner's own words:
 * effects already made cannot be called up again in the app to go on working
 * on them. Every subtest below is one half-sentence of that.
 */
test('an effect that has been exported can be found and opened again', async (t) => {
  const report = await runLibraryHarness();

  await t.test('the strip has two shelves, and starting an effect is still the one it opens on', () => {
    assert.equal(report.tabs.length, 2);
    assert.deepEqual(report.tabs.map((tab) => tab.id), ['gallery-tab-start', 'gallery-tab-library']);
    assert.equal(report.tabs[0].selected, 'true', 'somebody with no effects yet must not meet an empty shelf');
    assert.equal(report.startingTilesVisible, true);
    assert.equal(report.libraryHiddenAtRest, true, 'one shelf at a time, or the strip is a junk drawer');
    // The roving tabindex: one stop in the tab order for the pair.
    assert.deepEqual(report.tabs.map((tab) => tab.tabIndex), [0, -1]);
    assert.deepEqual(
      report.tabs.map((tab) => tab.controls),
      ['gallery-rail', 'gallery-library'],
      'each tab must control the shelf it names'
    );
  });

  await t.test('every way to start an effect is untouched by it', () => {
    // Read out of TILES rather than written out here. This subtest is about the
    // LIBRARY: what it has to say is that adding a second shelf did not disturb
    // the first one, and a list copied by hand answers that question by going
    // red every time a tile is added, which is the opposite of what it is for.
    // (There were seven when this was written and there are eleven now, and the
    // shelf gaining four figures is not something the library shelf broke.)
    assert.deepEqual(report.startingTiles, TILES.map((tile) => tile.key));
  });

  await t.test('pressing the other heading swaps the shelves', () => {
    assert.equal(report.afterSwitching.start, true);
    assert.equal(report.afterSwitching.library, false);
    assert.deepEqual(report.afterSwitching.selected, ['gallery-tab-library']);
  });

  /**
   * And it LOOKS swapped, measured off the window rather than off a screenshot.
   *
   * The first photograph of this row showed both headings underlined, which was
   * not a fault in the window: a window nobody is showing composites nothing, so
   * a CSS transition started by a click freezes part-way and is photographed
   * there. The transition is gone (a heading that swaps a shelf must not fade,
   * and this row is pressed far too often for one), and this is what keeps it
   * gone — a transition creeping back leaves one of these two underlines
   * somewhere between the accent and nothing.
   */
  await t.test('exactly one heading is painted as the one showing, in both states', () => {
    for (const [state, paint] of [['at rest', report.tabPaintAtRest], ['on the library', report.tabPaintOnLibrary]]) {
      const on = paint.filter((tab) => tab.selected === 'true');
      assert.equal(on.length, 1, `${state}: exactly one tab may claim to be showing`);
      const off = paint.filter((tab) => tab.selected === 'false');
      assert.match(on[0].underline, /^rgb\(/, `${state}: the showing one carries a solid underline`);
      for (const tab of off) {
        assert.equal(
          tab.underline,
          'rgba(0, 0, 0, 0)',
          `${state}: ${tab.id} must carry no underline at all, not a faded one`
        );
        assert.notEqual(tab.colour, on[0].colour, `${state}: and it must not be as bright as the one showing`);
      }
    }
    // The two states really are different paint, not the same picture twice.
    assert.notDeepEqual(report.tabPaintAtRest, report.tabPaintOnLibrary);
  });

  await t.test('an effect exported from the window appears as a tile, newest first', () => {
    assert.match(report.exportedA, /Tempo A\.html/);
    assert.match(report.exportedB, /Tempo B\.html/);
    assert.deepEqual(
      report.libraryAfterExports,
      ['Tempo B', 'Tempo A', 'Verlauf'],
      'the one just written is the first tile, because it is the one most likely wanted back'
    );
    assert.equal(report.tabCount, '3', 'the shelf says how much is on it without being opened');
  });

  await t.test('the strip says which effect is the one on the stage', () => {
    assert.deepEqual(report.markedAfterExport, ['Tempo B.html'], 'the export lands on that file, so that tile is the open one');
    assert.equal(report.markedIsAriaCurrent, 'true', 'and it is announced, not only drawn');
  });

  /**
   * The effects the machine owner already had were exported before this app
   * could draw a tile picture at all, so there is no .png beside them. The tile
   * still shows the effect — drawn on demand, through the export's own cover
   * pipeline, in a window nobody sees.
   */
  await t.test('an effect with no tile picture on disk still gets a real one', (subtest) => {
    if (!report.realVerlaufAvailable) return subtest.skip('no real effect on this machine to check against');
    assert.equal(report.drawnCover.isData, true, 'the picture arrives as bytes, not as a path');
    assert.ok(report.drawnCover.bytes > 5000, 'and it is a real picture rather than an empty one');
    return undefined;
  });

  await t.test('looking at the library writes nothing into the effects folder', (subtest) => {
    if (!report.realVerlaufAvailable) return subtest.skip('no real effect on this machine to check against');
    assert.deepEqual(report.pngsBeforeLooking, []);
    assert.deepEqual(
      report.pngsAfterLooking,
      [],
      'a drawn tile picture is kept in memory — somebody\'s folder must not gain files because they looked at a shelf'
    );
    return undefined;
  });

  // ------------------------------------------------- the question, both answers

  await t.test('opening an effect asks about unsaved work first, and a cancel changes nothing', (subtest) => {
    if (!report.realVerlaufAvailable) return subtest.skip('no real effect on this machine to check against');
    assert.equal(report.unsavedBeforeOpening, true, 'there has to be something to lose, or the question proves nothing');
    assert.equal(report.cancelled.asked, 1, 'the question was asked');
    assert.equal(report.cancelled.name, 'Tempo B', 'and the effect on the stage is still the one that was there');
    assert.equal(report.cancelled.message, true, 'down to the sentence the window was showing');
    assert.deepEqual(report.cancelled.marked, ['Tempo B.html'], 'and the strip still marks the same tile');
    return undefined;
  });

  /**
   * The heart of it: a file that was only ever an exported effect — never saved
   * as a project, made by a SignalForge that predates this project's motion
   * fixes — comes back as the document it was made from.
   *
   * Every field is checked against the file itself, read by the same reader,
   * rather than against numbers typed out here: the claim is "the window is
   * showing what is in the file", and that is a comparison.
   */
  await t.test('his own effect opens, with everything that was in it', (subtest) => {
    if (!report.realVerlaufAvailable) return subtest.skip('no real effect on this machine to check against');
    assert.equal(report.opened.asked, 1, 'asked once more, and answered "discard" this time');
    assert.equal(report.opened.name, report.fileSays.name);
    assert.match(report.opened.message, /Verlauf/);
    assert.deepEqual(report.opened.marked, ['Verlauf.html'], 'and now THAT tile is the open one');
    assert.equal(report.opened.unsaved, false, 'what came out of a file has nothing unsaved about it');

    assert.equal(report.opened.shape, report.fileSays.shape);
    assert.equal(Number(report.opened.angle), report.fileSays.angle);
    assert.equal(report.opened.motion, report.fileSays.motion);
    assert.equal(Number(report.opened.speed), report.fileSays.speed);
    assert.equal(Number(report.opened.amount), report.fileSays.amount);
    assert.deepEqual(
      report.opened.stops.map((colour) => colour.toLowerCase()),
      report.fileSays.stops.map((stop) => stop.color.toLowerCase()),
      'his two colours, in his order'
    );
    return undefined;
  });

  await t.test('and it moves, which is the only proof the motion survived', (subtest) => {
    if (!report.realVerlaufAvailable) return subtest.skip('no real effect on this machine to check against');
    assert.equal(report.opened.motion, 'warp', 'this check is about a warp; a still effect would prove nothing');
    assert.equal(report.animates.drawsSomething, true);
    assert.equal(report.animates.framesDiffer, 12, 'twelve frames, twelve different pictures');
    assert.ok(
      Math.max(...report.animates.markerTravel) >= 2,
      `the warp must displace rows: ${JSON.stringify(report.animates.markerTravel)}`
    );
    return undefined;
  });

  // ------------------------------------------------------------- and back again

  await t.test('an effect opened from the library saves back over itself', (subtest) => {
    if (!report.realVerlaufAvailable) return subtest.skip('no real effect on this machine to check against');
    assert.equal(report.changedBrightness, '160', 'something about it was changed');
    assert.equal(report.unsavedAfterChange, true);
    // The name field was prefilled from the document, so the export lands on
    // the file it came from — and is asked about, never silent.
    assert.match(report.exportBack, /Verlauf\.html/);
    assert.equal(report.overwriteOffered, true, 'the answer is a button that has to be pressed on purpose');
    assert.match(report.overwritten, /Verlauf\.html/);
    assert.equal(report.savedBack.replaced, true, 'the file on disk is a different file now');
    assert.equal(report.savedBack.brightness, 160, 'and it carries the change, read back out of it');
    assert.deepEqual(
      report.savedBack.stillOneFile,
      ['Verlauf.html', 'Verlauf.png'],
      'one effect and one tile picture — not a second file under a new name'
    );
    assert.equal(report.coverBeforeSavingBack, false);
    assert.equal(report.savedBack.coverAfter, true, 'and the tile picture is now a real file beside it');
    assert.deepEqual(report.libraryAtEnd, ['Verlauf', 'Tempo B', 'Tempo A'], 'the strip followed');
    return undefined;
  });

  await t.test('the machine owner\'s own file was only ever read', (subtest) => {
    if (!report.realVerlaufAvailable) return subtest.skip('no real effect on this machine to check against');
    assert.equal(
      report.originalUntouched,
      true,
      'the harness works on a COPY: the original must have the same size and the same modification time it had before'
    );
    assert.deepEqual(
      report.wroteOnlyIntoTheSandbox,
      ['Tempo A.html', 'Tempo A.png', 'Tempo B.html', 'Tempo B.png', 'Verlauf.html', 'Verlauf.png'],
      'and everything this run wrote is in the throwaway folder'
    );
    return undefined;
  });

  await t.test('every word of it comes from the language files', () => {
    const de = dictionary('de');
    const en = dictionary('en');
    assert.deepEqual(report.germanTabs, [de['gallery.title'], de['library.title']]);
    assert.deepEqual(report.englishTabs, [en['gallery.title'], en['library.title']]);
  });

  await t.test('a language switch keeps the shelf and what is marked on it', (subtest) => {
    if (!report.realVerlaufAvailable) return subtest.skip('no real effect on this machine to check against');
    assert.deepEqual(report.afterLanguageSwitch.tiles, report.libraryAtEnd);
    assert.deepEqual(report.afterLanguageSwitch.marked, ['Verlauf.html']);
    return undefined;
  });
});
