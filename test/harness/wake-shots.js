// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * THE MONEY SHOT: rain that leaves a wake, over a background that moves.
 *
 *   npx electron test/harness/wake-shots.js [folder]
 *
 * The one picture this whole change was asked for, taken in the real window and
 * never shown: `windowDisplay.show = false` before app/main.js opens its
 * window, a frame pump installed in the page (a window Chromium is not showing
 * never ticks requestAnimationFrame), and `capturePage()` twice per picture
 * because the first commits the canvas's own layer. Nothing here ever calls
 * show(), focus() or maximize(). The same shape as background-shots.js, which
 * explains all of that at length.
 *
 * WHAT IT HAS TO PROVE, over and above the engine tests
 *
 *   the ladder    the same swarm over the same moving background at trail 0,
 *                 40, 70 and 100 — four pictures from one window, so the
 *                 slider's effect can be seen rather than described. Until
 *                 12.08.2026 all four were the SAME picture.
 *   the money     rain with a wake over a gradient that turns: the thing that
 *                 was asked for, at settings somebody would actually choose.
 *   the corner    a pixel the rain has not reached, read at trail 0 and at
 *                 trail 100 with the background held still. It must be the
 *                 same colour: the background is exempt from the wake, so
 *                 where nothing moved nothing is smeared.
 *   the cost      400 particles at the largest size, a conic background that
 *                 spins, a full wake and a turning hue — the same recipe
 *                 background-shots.js measured before this change, so the two
 *                 numbers can be put side by side against the 15 % of a core
 *                 the cost chip warns at.
 */
import { BrowserWindow } from 'electron';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { folderDialog, discardDialog } from '../../app/main.js';
import { driver, runHarness, wait } from './driver.js';
import { harnessSandbox } from './sandbox.js';

const { effectsFolder } = harnessSandbox('wake-shots', { show: false });

// Starting an effect from a tile leaves unsaved work, so the next gesture that
// would throw it away asks through a native, window-modal message box. Answered
// the way every shots harness answers it: discard, because everything this run
// throws away it made itself seconds earlier.
discardDialog.ask = async () => ({ response: 1 });

const OUT = resolve(process.argv[2] || join(process.cwd(), 'work', 'wake-shots'));
mkdirSync(OUT, { recursive: true });

/** The window's smallest supported size. */
const SMALLEST = [1040, 700];

async function main() {
  const [win] = BrowserWindow.getAllWindows();
  const d = driver(win);
  const notes = {};

  await d.until(`document.getElementById('footer-export') !== null`, 'the window is built', 300);
  await d.installPump();

  /**
   * Let the preview really run for `frames` frames.
   *
   * NOT `d.pump(n)`: the preview loop drops any frame arriving less than
   * 1000/30 ms after the last one it drew, so forty pumps in a row produce ONE
   * render. A wake is made of frames, so this one matters more here than
   * anywhere else.
   */
  async function run(frames, gap = 40) {
    for (let i = 0; i < frames; i += 1) {
      await d.pump(1);
      await wait(gap);
    }
  }

  async function shot(name, { frames = 10 } = {}) {
    await d.pump(frames);
    await wait(200);
    const file = join(OUT, `${name}.png`);
    await win.capturePage();
    await wait(140);
    writeFileSync(file, (await win.capturePage()).toPNG());
    process.stdout.write(`shot ${file}\n`);
    return file;
  }

  /** One pixel of the stage, read off the preview canvas itself. */
  const pixel = (x, y) => d.js(`(() => {
    const canvas = document.getElementById('preview-canvas');
    const d = canvas.getContext('2d').getImageData(${x}, ${y}, 1, 1).data;
    return { r: d[0], g: d[1], b: d[2] };
  })()`);

  win.setContentSize(SMALLEST[0], SMALLEST[1]);
  await wait(300);

  folderDialog.open = async () => ({ canceled: false, filePaths: [effectsFolder] });
  await d.js(`document.getElementById('first-run-choose').click(), true`);
  await d.until(`document.getElementById('first-run').hidden === true`, 'the question is answered', 100);

  // ------------------------------------------------- rain over a moving gradient
  await d.js(`document.getElementById('gallery-particles').click(), true`);
  await d.until(
    `document.getElementById('preview-body').classList.contains('has-picture')`,
    'the particle effect is on the stage', 200
  );
  await d.pump(6);
  await d.js(`document.getElementById('inspector').scrollTop = 0, true`);

  await d.setSelect('sf-layers', 'gradient');
  await d.until(`document.getElementById('sf-layers-0-shape') !== null`, 'a gradient is behind', 200);
  await d.setSelect('sf-layers-0-shape', 'conic');
  await wait(120);
  await d.clickById('sf-layers-0-add');
  await wait(200);
  await d.setSelect('sf-layers-0-kind-0', 'spin');
  await wait(200);
  await d.setInput('sf-layers-0-motions-0-speed', '55');
  await d.setInput('sf-layers-1-count', '150');
  await d.setInput('sf-layers-1-speed', '45');
  await wait(120);

  notes.document = {
    backgroundKind: await d.js(`document.getElementById('sf-layers').value`),
    backgroundShape: await d.js(`document.getElementById('sf-layers-0-shape').value`),
    backgroundMotion: await d.js(`document.getElementById('sf-layers-0-kind-0').value`),
    count: await d.js(`document.getElementById('sf-layers-1-count').value`),
    speed: await d.js(`document.getElementById('sf-layers-1-speed').value`)
  };

  // ------------------------------------------------------------------ the ladder
  notes.ladder = [];
  for (const trail of [0, 40, 70, 100]) {
    await d.setInput('sf-trail', String(trail));
    await wait(120);
    await run(36);
    notes.ladder.push({
      trail,
      hash: (await d.stats()).hash,
      cost: await d.cost()
    });
    await shot(`0${notes.ladder.length}-wake-${String(trail).padStart(3, '0')}`);
  }
  // NOT evidence, and marked so rather than left to be misread. Four hashes off
  // a running animation differ because they were taken at four different
  // moments, wake or no wake — checked by running this same harness against the
  // engine as it stood at aa59c8e, where the trail under a background did
  // provably nothing, and getting four different hashes there too. What the
  // wake does is measured in test/engine/background-render.test.js against a
  // controlled document; the hashes are here only to show the run really moved
  // between shots.
  notes.ladderHashesAreNotEvidence = true;

  // ------------------------------------------------------------- THE MONEY SHOT
  await d.setInput('sf-trail', '70');
  await wait(120);
  await run(60);
  await shot('05-the-money-shot-rain-with-a-wake-over-a-moving-gradient');
  notes.moneyShot = { trail: 70, cost: await d.cost() };

  // ------------------------------------------------- and the same at corpus settings
  //
  // The money shot above is at OUR defaults, and it beads: 150 drops of size 3
  // travelling at 45 move further between frames than they are wide, so the
  // wake is a string of separate discs rather than a streak. That is a setting
  // and not a defect, and this shot is what says so — the corpus's own
  // geometry, read off `Poison` (cache\effects\-Mir7bKkFQmd2LF_9Leg):
  //
  //   its veil is `bgColor + "22"`, which is alpha 34/255 = 0.13 — the SHORT
  //   end of our slider (about trail 45), not the long end;
  //   its drops are strokes up to 11 px wide moving one or two pixels a frame,
  //   so consecutive frames overlap heavily and the wake is continuous;
  //   there are 30 of them, not 150.
  //
  // Set the same way, ours does the same thing.
  await d.setInput('sf-layers-1-count', '50');
  await d.setInput('sf-layers-1-size', '10');
  await d.setInput('sf-layers-1-speed', '16');
  await d.setInput('sf-trail', '45');
  await wait(150);
  await run(70);
  await shot('05b-the-same-wake-at-the-corpus-geometry');
  notes.corpusGeometry = {
    count: '50', size: '10', speed: '16', trail: '45', cost: await d.cost()
  };
  await d.setInput('sf-layers-1-count', '150');
  await d.setInput('sf-layers-1-size', '3');
  await d.setInput('sf-layers-1-speed', '45');
  await wait(150);

  // ------------------------------------------------------- the background is exempt
  //
  // The background held STILL and the swarm turned off, so the corner is the
  // background's own colour and nothing else. It must read the same with the
  // wake at its longest as with no wake at all — a background veiled by its own
  // wake would arrive as an average of the last hundred frames of itself, and
  // this corner would drift.
  //
  // A FLAT COLOUR rather than the conic with its spin turned down, and the
  // first run of this harness is why: the speed slider's floor is 1, not 0, so
  // "spin at speed 0" comes back as speed 1 and the background goes on turning
  // slowly. The control-for-the-control below caught that (`fixtureIsStill`),
  // and the fix is to use a background that cannot move at all rather than one
  // asked nicely to stop. Switching kind keeps the layer and its motions, so
  // the conic and its spin are still there to be switched back to afterwards.
  await d.setSelect('sf-layers', 'solid');
  await d.until(`document.getElementById('sf-layers-0-color') !== null`, 'a flat colour is behind', 200);
  await d.setInput('sf-layers-1-speed', '0');
  await d.setInput('sf-layers-1-count', '25');
  await wait(150);
  await d.setInput('sf-trail', '0');
  await wait(120);
  await run(30);
  const cornerFlat = await pixel(6, 6);
  // The control for the control: thirty more frames with NOTHING changed. If
  // this already differs, the fixture is not standing still and the comparison
  // below would be measuring the wrong thing.
  await run(30);
  const cornerFlatAgain = await pixel(6, 6);
  await d.setInput('sf-trail', '100');
  await wait(120);
  await run(60);
  const cornerWake = await pixel(6, 6);
  notes.backgroundExempt = {
    backgroundKind: await d.js(`document.getElementById('sf-layers').value`),
    swarmSpeed: await d.js(`document.getElementById('sf-layers-1-speed').value`),
    swarmMotions: await d.js(`[...document.querySelectorAll(
      '[id^="sf-layers-1-kind-"]')].map((e) => e.value)`),
    cornerFlat,
    cornerFlatAgain,
    fixtureIsStill: JSON.stringify(cornerFlat) === JSON.stringify(cornerFlatAgain),
    cornerWake,
    same: JSON.stringify(cornerFlat) === JSON.stringify(cornerWake)
  };
  await shot('06-a-still-background-under-the-longest-wake');

  // ------------------------------------------------------------- the worst case
  //
  // The same recipe background-shots.js measured before this change: 400
  // particles at the largest size over a conic that spins, a full wake and a
  // turning hue. The wake is no longer free under a background — it now keeps a
  // second canvas and reads all 64000 pixels of it back every frame — so this
  // is the number that has to be looked at again.
  await d.setSelect('sf-layers', 'gradient');
  await d.until(`document.getElementById('sf-layers-0-shape') !== null`, 'the conic is back', 200);
  await d.setInput('sf-layers-0-motions-0-speed', '55');
  await d.setInput('sf-layers-1-speed', '45');
  await d.setInput('sf-layers-1-count', '400');
  await d.setInput('sf-layers-1-size', '25');
  await d.setInput('sf-trail', '100');
  await d.setInput('sf-hueCycle', '100');
  await d.setInput('sf-saturation', '160');
  await wait(120);
  await run(50, 34);
  notes.worstCase = {
    readout: await d.cost(),
    count: await d.js(`document.getElementById('sf-layers-1-count').value`),
    size: await d.js(`document.getElementById('sf-layers-1-size').value`),
    trail: await d.js(`document.getElementById('sf-trail').value`),
    hueCycle: await d.js(`document.getElementById('sf-hueCycle').value`),
    warned: await d.js(
      `document.getElementById('preview-cost').classList.contains('cost-warn')`
    )
  };
  await shot('07-the-worst-composite');

  // And the same composite with the wake alone taken off, so what the wake
  // itself costs can be read as a difference rather than guessed at.
  await d.setInput('sf-trail', '0');
  await wait(120);
  await run(50, 34);
  notes.worstCaseWithoutWake = {
    readout: await d.cost(),
    warned: await d.js(
      `document.getElementById('preview-cost').classList.contains('cost-warn')`
    )
  };

  writeFileSync(join(OUT, 'notes.json'), `${JSON.stringify(notes, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify(notes, null, 2)}\n`);
}

runHarness('wake-shots', main);
