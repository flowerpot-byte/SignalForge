// SignalForge — build SignalRGB effects from images, gradients, shapes and particles.
// Copyright (C) 2026 Max Leopold Blumenschein
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * WHAT ONE PRESS OF THE PARTICLE TILE ACTUALLY LOOKS LIKE, AFTER TWO SECONDS.
 *
 *   npx electron test/harness/tile-tune-shots.js [folder]
 *
 * The question this harness exists to answer is not "does the tile work" — the
 * unit tests have that — but the one thing no test can hold: whether the wake
 * behind a drop is a STREAK or a string of separate discs. That is a picture,
 * so this takes pictures, in the real window, without ever showing one:
 * `windowDisplay.show = false` before app/main.js opens it, a frame pump
 * installed in the page (a window Chromium is not showing never ticks
 * requestAnimationFrame), and `capturePage()` twice per picture because the
 * first commits the canvas's own layer. Nothing here calls show(), focus() or
 * maximize(). The same shape as wake-shots.js, which explains all of it at
 * length.
 *
 * WHAT IT TAKES
 *
 *   the press     the swarm two seconds after the tile was pressed, at
 *                 whatever the tile itself starts on — no slider is touched
 *                 anywhere in this file before this picture, which is the
 *                 whole point of it.
 *   the numbers   the four controls read back out of the inspector, so the
 *                 picture above and the values it was taken at are one record.
 *   the tile      the tile's own preview, cropped out of the window at the
 *                 size a person really sees it (about 168 x 105), to check
 *                 that the new geometry still reads as rain that small.
 *   the patterns  the same document at snow, rise and drift, because the
 *                 combobox is one click away from the tile and beading there
 *                 would be the same complaint in a different coat.
 */
import { BrowserWindow } from 'electron';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { folderDialog, discardDialog } from '../../app/main.js';
import { driver, runHarness, wait } from './driver.js';
import { harnessSandbox } from './sandbox.js';

const { effectsFolder } = harnessSandbox('tile-tune-shots', { show: false });

// Starting an effect from a tile leaves unsaved work, so the next gesture that
// would throw it away asks through a native, window-modal message box. Answered
// the way every shots harness answers it: discard, because everything this run
// throws away it made itself seconds earlier.
discardDialog.ask = async () => ({ response: 1 });

const OUT = resolve(process.argv[2] || join(process.cwd(), 'work', 'tile-tune-shots'));
mkdirSync(OUT, { recursive: true });

/** The window's smallest supported size — the hardest case for the strip. */
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
   * render. A wake is made of frames, so this matters more here than anywhere.
   */
  async function run(frames, gap = 40) {
    for (let i = 0; i < frames; i += 1) {
      await d.pump(1);
      await wait(gap);
    }
  }

  async function shot(name, { frames = 4, rect = null } = {}) {
    await d.pump(frames);
    await wait(200);
    const file = join(OUT, `${name}.png`);
    await win.capturePage();
    await wait(140);
    const image = rect ? await win.capturePage(rect) : await win.capturePage();
    writeFileSync(file, image.toPNG());
    process.stdout.write(`shot ${file}\n`);
    return file;
  }

  win.setContentSize(SMALLEST[0], SMALLEST[1]);
  await wait(300);

  folderDialog.open = async () => ({ canceled: false, filePaths: [effectsFolder] });
  await d.js(`document.getElementById('first-run-choose').click(), true`);
  await d.until(`document.getElementById('first-run').hidden === true`, 'the question is answered', 100);

  // ------------------------------------------------------------- the tile itself
  //
  // Photographed BEFORE it is pressed, at the size it is really seen: the
  // canvas on the tile is 320 x 200 and shown at about 168 x 105, and a
  // geometry that reads as rain full size can still turn into a row of blobs
  // when it is shrunk by half. Cropped from the window rather than read out of
  // the canvas, so it is the shrunk picture that is judged and not the big one.
  const tileBox = await d.js(`(() => {
    const node = document.querySelector('[data-tile="particles"] canvas');
    if (!node) return null;
    node.scrollIntoView({ block: 'nearest', inline: 'center' });
    const b = node.getBoundingClientRect();
    return { x: b.x, y: b.y, width: b.width, height: b.height };
  })()`);
  await wait(250);
  const tileNow = await d.js(`(() => {
    const b = document.querySelector('[data-tile="particles"] canvas').getBoundingClientRect();
    return { x: Math.round(b.x), y: Math.round(b.y),
             width: Math.round(b.width), height: Math.round(b.height) };
  })()`);
  notes.tilePreview = { asDeclared: tileBox, asCaptured: tileNow };
  await shot('01-the-tile-as-it-is-seen', { rect: tileNow });

  // ------------------------------------------------------- one press, two seconds
  //
  // The one measurement this harness is for. Nothing below is set, dragged or
  // typed before the picture is taken: what is on the stage is what the tile
  // produces, and only that.
  await d.js(`document.getElementById('gallery-particles').click(), true`);
  await d.until(
    `document.getElementById('preview-body').classList.contains('has-picture')`,
    'the particle effect is on the stage', 200
  );
  // About two seconds of a thirty-a-second loop.
  await run(60);
  await shot('02-one-press-two-seconds');

  notes.pressed = {
    pattern: await d.js(`document.getElementById('sf-layers-0-pattern').value`),
    count: await d.js(`document.getElementById('sf-layers-0-count').value`),
    size: await d.js(`document.getElementById('sf-layers-0-size').value`),
    speed: await d.js(`document.getElementById('sf-layers-0-speed').value`),
    trail: await d.js(`document.getElementById('sf-trail').value`),
    cost: await d.cost()
  };

  // ------------------------------------------------------------- the other three
  //
  // The pattern combobox is one click from the tile, so the same complaint has
  // three more chances to be true. The geometry is untouched between these —
  // only the pattern changes.
  notes.patterns = {};
  const patterns = [
    ['03-snow', 'snow'],
    ['04-rise', 'rise'],
    ['05-drift', 'drift']
  ];
  for (const [name, pattern] of patterns) {
    await d.setSelect('sf-layers-0-pattern', pattern);
    await wait(150);
    await run(60);
    await shot(name);
    notes.patterns[pattern] = { cost: await d.cost() };
  }

  // ------------------------------------------------- and the tile as it WAS
  //
  // The same crop, the same window, the same renderer — with the engine's own
  // defaults in the document instead of the tile's numbers, so the two
  // pictures of the tile can be put side by side rather than described. Drawn
  // straight onto the tile's canvas through the engine the strip itself uses
  // (window.SignalForgeEngine, exactly as paintTile does in gallery.js), which
  // is why this is the LAST thing this harness does: it leaves the strip
  // showing something the strip did not make.
  await d.js(`(() => {
    const canvas = document.querySelector('[data-tile="particles"] canvas');
    const SF = window.SignalForgeEngine;
    const renderer = SF.createRenderer();
    renderer.render(canvas.getContext('2d'), SF.normalizeDocument({
      layers: [{ id: 'fill', type: 'particles', motions: [] }]
    }).doc, new Map(), 0);
    renderer.dispose();
    return true;
  })()`);
  await wait(150);
  await shot('06-the-same-tile-at-the-engine-defaults', { frames: 0, rect: tileNow });

  writeFileSync(join(OUT, 'notes.json'), `${JSON.stringify(notes, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify(notes, null, 2)}\n`);
}

runHarness('tile-tune-shots', main);
