// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max Leopold Blumenschein
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Put a background under the layer the window already edits, in the real
 * window, and photograph it — without ever showing it.
 *
 *   npx electron test/harness/background-shots.js [folder]
 *
 * The same shape as particle-shots.js, and for the reasons set out at length
 * there: `windowDisplay.show = false` before app/main.js opens its window,
 * `capturePage()` twice per picture (the first commits the canvas's own layer),
 * and a frame pump installed in the page because a window Chromium is not
 * showing never ticks requestAnimationFrame. Nothing here ever calls show(),
 * focus() or maximize().
 *
 * WHAT THIS ONE HAS TO PROVE
 *
 *   under         a background is BEHIND the swarm and not in front of it, in
 *                 the real window: the corner of the stage takes the
 *                 background's colour while the rain goes on falling over it.
 *   moving        the shot Max asked for — rain over a gradient that wanders —
 *                 shown to be moving by two hashes of the stage a second apart
 *                 with the swarm itself held still, so what moved can only be
 *                 the layer underneath.
 *   the trap      the foreground's own controls are still the foreground's
 *                 after the insert. Their ids move from sf-layers-0-* to
 *                 sf-layers-1-*, and the value read back out of the document
 *                 has to be the one the slider was dragged to.
 *   off again     removing it puts the document back to one layer and the ids
 *                 back where they were.
 *   worst         400 particles at the largest size, a conic background that
 *                 spins, a full trail and a turning hue: what the most
 *                 expensive thing this window can now be asked for costs,
 *                 against the 15 % of a core the cost chip warns at.
 */
import { BrowserWindow } from 'electron';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { folderDialog, discardDialog } from '../../app/main.js';
import { driver, runHarness, wait } from './driver.js';
import { harnessSandbox } from './sandbox.js';

const { effectsFolder } = harnessSandbox('background-shots', { show: false });

// Starting an effect from a tile leaves unsaved work, so the next gesture that
// would throw it away asks through a native, window-modal message box. Answered
// here the way every shots harness answers it: "discard", because everything
// this run throws away it made itself seconds earlier.
discardDialog.ask = async () => ({ response: 1 });

const OUT = resolve(process.argv[2] || join(process.cwd(), 'work', 'background-shots'));
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
   * render. Anything that has to advance a clock needs real time between them.
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

  /** What the column is holding, by id — the list that says which cards exist. */
  const controls = () => d.js(`[...document.querySelectorAll(
    '#inspector-body input, #inspector-body select')].map((e) => e.id).filter(Boolean)`);

  /** The live document's layers, as types and ids. */
  const layers = () => d.js(`(() => {
    const chip = document.getElementById('preview-cost');
    return window.__sfLayers ? window.__sfLayers() : null;
  })()`);

  win.setContentSize(SMALLEST[0], SMALLEST[1]);
  await wait(300);

  folderDialog.open = async () => ({ canceled: false, filePaths: [effectsFolder] });
  await d.js(`document.getElementById('first-run-choose').click(), true`);
  await d.until(`document.getElementById('first-run').hidden === true`, 'the question is answered', 100);

  // ------------------------------------------------------------ rain, alone
  await d.js(`document.getElementById('gallery-particles').click(), true`);
  await d.until(
    `document.getElementById('preview-body').classList.contains('has-picture')`,
    'the particle effect is on the stage',
    200
  );
  await d.pump(6);
  await d.js(`document.getElementById('inspector').scrollTop = 0, true`);
  await wait(120);

  notes.before = {
    controls: await controls(),
    // The combobox exists on a swarm, and it is the only thing in its section.
    hasBackgroundControl: await d.js(`document.getElementById('sf-layers') !== null`),
    backgroundKind: await d.js(`document.getElementById('sf-layers').value`),
    sections: await d.js(
      `[...document.querySelectorAll('#inspector-body .field-group')].map((s) => s.dataset.section)`
    )
  };
  await run(12);
  notes.before.corner = await pixel(6, 6);
  await shot('01-rain-with-no-background');

  // A gradient behind the picture is not offered where it could not be seen.
  // Photographed from the same window, one tile along, so the two can be put
  // side by side.
  await d.js(`document.getElementById('gallery-linear').click(), true`);
  await d.until(`document.getElementById('sf-layers-0-shape') !== null`, 'a gradient is on the stage', 200);
  notes.notOffered = {
    toAGradient: await d.js(`document.getElementById('sf-layers') === null`),
    sections: await d.js(
      `[...document.querySelectorAll('#inspector-body .field-group')].map((s) => s.dataset.section)`
    )
  };
  await shot('02-a-gradient-is-offered-none');

  // ------------------------------------------------- and now one behind the rain
  await d.js(`document.getElementById('gallery-particles').click(), true`);
  await d.until(`document.getElementById('sf-layers') !== null`, 'the swarm is back', 200);
  await d.pump(6);

  // Drag the swarm's count somewhere unmistakable BEFORE the insert, so what is
  // read back afterwards proves the value went with the layer rather than with
  // the number.
  await d.setInput('sf-layers-0-count', '150');
  await wait(80);

  await d.setSelect('sf-layers', 'solid');
  await d.until(`document.getElementById('sf-layers-0-color') !== null`, 'a flat colour is behind', 200);
  await run(12);
  notes.solidBehind = {
    corner: await pixel(6, 6),
    controls: await controls(),
    boxed: await d.js(
      `document.querySelector('.field-group[data-section="background"] .field-cards') !== null`
    ),
    inTheBox: await d.js(`[...document.querySelectorAll(
      '.field-group[data-section="background"] .field-cards input, '
      + '.field-group[data-section="background"] .field-cards select')].map((e) => e.id)`)
  };
  await shot('03-rain-over-a-flat-colour');

  // ------------------------------------------------------------- THE TRAP
  //
  // The swarm's own controls moved from layers.0 to layers.1 — and they are
  // still the swarm's. The count is read back off the control that now carries
  // the other number.
  notes.trap = {
    countIsNowAt: await d.js(`document.getElementById('sf-layers-1-count')?.value ?? null`),
    nothingLeftAtTheOldNumber: await d.js(`document.getElementById('sf-layers-0-count') === null`),
    // And a drag on it after the insert still lands on the swarm.
    afterDrag: null
  };
  await d.setInput('sf-layers-1-count', '90');
  await wait(80);
  notes.trap.afterDrag = await d.js(`document.getElementById('sf-layers-1-count').value`);

  // ------------------------------------- the shot he asked for: a moving one
  await d.setSelect('sf-layers', 'gradient');
  await d.until(`document.getElementById('sf-layers-0-shape') !== null`, 'a gradient is behind', 200);
  await d.setSelect('sf-layers-0-shape', 'conic');
  await wait(120);
  // Its own motion, from its own add button in its own heading.
  await d.clickById('sf-layers-0-add');
  await wait(200);
  await d.setSelect('sf-layers-0-kind-0', 'spin');
  await wait(200);
  await d.setInput('sf-layers-0-motions-0-speed', '55');
  await wait(80);

  notes.movingBackground = {
    kind: await d.js(`document.getElementById('sf-layers').value`),
    shape: await d.js(`document.getElementById('sf-layers-0-shape').value`),
    motion: await d.js(`document.getElementById('sf-layers-0-kind-0').value`),
    // The swarm on top of it is held still, so anything that changes between
    // the two hashes below can only be the layer underneath.
    swarmSpeed: await d.setInput('sf-layers-1-speed', '0')
  };
  await run(8);
  const beforeTurn = await d.stats();
  const cornerBefore = await pixel(6, 6);
  await run(28);
  const afterTurn = await d.stats();
  const cornerAfter = await pixel(6, 6);
  notes.movingBackground.hashBefore = beforeTurn.hash;
  notes.movingBackground.hashAfter = afterTurn.hash;
  notes.movingBackground.moved = beforeTurn.hash !== afterTurn.hash;
  notes.movingBackground.cornerBefore = cornerBefore;
  notes.movingBackground.cornerAfter = cornerAfter;
  notes.movingBackground.cornerChanged = JSON.stringify(cornerBefore) !== JSON.stringify(cornerAfter);
  await shot('04-rain-over-a-moving-gradient');

  // Let the rain fall again for the picture that is actually the answer to the
  // question that was asked.
  await d.setInput('sf-layers-1-speed', '45');
  await run(24);
  await shot('05-rain-over-a-moving-gradient-running');

  // The column itself, scrolled to the section that did all this.
  await d.js(`(() => { const s = document.querySelector(
    '.field-group[data-section="background"]'); s.scrollIntoView(); return true; })()`);
  await wait(200);
  await shot('06-the-background-section');

  // ------------------------------------------------------------ the worst case
  //
  // 400 particles at the largest size over a conic that spins, with the whole
  // wake and the whole hue cycle switched on — every expensive thing this
  // window can be asked for, at once. The trail is included even though it
  // cannot be SEEN under an opaque background (it is measured in
  // test/engine/background-render.test.js and reported): what is being measured
  // here is what it COSTS, and the veil canvas is composited whether or not
  // anything survives on it.
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

  // ------------------------------------------------------------ and off again
  await d.setInput('sf-trail', '0');
  await d.setInput('sf-hueCycle', '0');
  await d.setInput('sf-saturation', '100');
  await d.setInput('sf-layers-1-count', '90');
  await d.setInput('sf-layers-1-size', '3');
  await wait(120);
  await d.setSelect('sf-layers', 'none');
  await d.until(`document.getElementById('sf-layers-0-count') !== null`, 'the swarm is first again', 200);
  await run(12);
  notes.removed = {
    controls: await controls(),
    backgroundKind: await d.js(`document.getElementById('sf-layers').value`),
    nothingBehind: await d.js(
      `document.querySelector('.field-group[data-section="background"] .field-cards') === null`
    ),
    corner: await pixel(6, 6),
    // Back to the hard clear, which is what "there is nothing behind it" looks
    // like on the stage.
    cornerIsBlackAgain: null
  };
  notes.removed.cornerIsBlackAgain = notes.removed.corner.r === 0
    && notes.removed.corner.g === 0 && notes.removed.corner.b === 0;
  await shot('08-the-background-taken-off-again');

  // ------------------------------------------------------- and it really exports
  await d.setSelect('sf-layers', 'gradient');
  await d.until(`document.getElementById('sf-layers-0-shape') !== null`, 'a gradient is behind', 200);
  await d.setSelect('sf-layers-0-shape', 'conic');
  await wait(150);
  await d.js(`(() => { const f = document.getElementById('footer-name');
    f.value = 'Regen vor einem Farbkreis';
    f.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
  await wait(120);
  notes.export = { message: await d.clickAndWait('footer-export') };
  await wait(300);
  await shot('09-exported');

  writeFileSync(join(OUT, 'notes.json'), `${JSON.stringify(notes, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify(notes, null, 2)}\n`);
}

runHarness('background-shots', main);
