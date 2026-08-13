// SignalForge — build SignalRGB effects from images, gradients, shapes and particles.
// Copyright (C) 2026 Max Leopold Blumenschein
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * The pictures the project page is made of.
 *
 *   npx electron test/harness/readme-shots.js [folder]
 *
 * Photographs of the real window in a few states worth showing to somebody who
 * has never seen the program: what it looks like working, what the layer stack
 * is for, and that the settings column is where the effect is shaped.
 *
 * WHY IT IS A HARNESS AND NOT A SCREENSHOT KEY. The window must not be shown
 * while these are taken — the machine's owner is at his desk. So the same rules
 * as every harness beside it (gradient-shots.js sets them out at length):
 * `show = false` before app/main.js opens its window, two capturePage() per
 * picture because the first only commits the canvas layer, and a frame pump
 * driven from outside because a window Chromium is not showing never ticks
 * requestAnimationFrame.
 *
 * The states are built with the app's own starting tiles and its own controls,
 * never by writing a document into it: a picture of a state the program cannot
 * be put into by hand would be a lie, and this is the one place where a lie
 * would be seen by strangers.
 */
import { BrowserWindow } from 'electron';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { folderDialog, discardDialog } from '../../app/main.js';
import { driver, runHarness, wait } from './driver.js';
import { harnessSandbox } from './sandbox.js';

const { effectsFolder } = harnessSandbox('readme-shots', { show: false });
discardDialog.ask = async () => ({ response: 1 });

const OUT = resolve(process.argv[2] || join(process.cwd(), 'work', 'readme-shots'));
mkdirSync(OUT, { recursive: true });

/** Wide enough that the stage, the shelf and the column all breathe. */
const SIZE = [1440, 900];

async function main() {
  const [win] = BrowserWindow.getAllWindows();
  const d = driver(win);
  await d.until(`document.getElementById('footer-export') !== null`, 'the window is built', 300);
  await d.installPump();
  await win.webContents.debugger.attach('1.3');
  win.setContentSize(SIZE[0], SIZE[1]);
  await wait(300);

  folderDialog.open = async () => ({ canceled: false, filePaths: [effectsFolder] });
  await d.js(`document.getElementById('first-run-choose').click(), true`);
  await d.until(`document.getElementById('first-run').hidden === true`, 'answered', 100);

  /**
   * The footer line that names the effects folder, replaced by the path a
   * normal installation actually uses.
   *
   * WHAT IS AND IS NOT BEING DRESSED UP: the real line here would read
   * "…\AppData\Local\Temp\signalforge-readme-shots-kA0101\Effects", because these
   * pictures are taken in a throwaway sandbox (harnessSandbox above) so that
   * nothing touches the real SignalRGB folder. Publishing that would show
   * strangers a temp path and this machine's user name, and would tell them
   * something FALSE about where the program writes. The replacement is where
   * SignalRGB's own effects folder actually is. Nothing else in these pictures
   * is touched — every pixel of the stage, the column and the shelf is what
   * the program really drew.
   */
  const dressFolderLine = () => d.js(`(() => {
    const line = document.getElementById('footer-target');
    // Backslashes assembled from their character code: this string travels
    // through a template literal and then through the debugger before a
    // browser sees it, and every layer eats an escape. The first version
    // arrived as "C:UsersDuDocuments..." with every separator gone.
    const sep = String.fromCharCode(92);
    const path = ['C:', 'Users', 'Du', 'Documents', 'WhirlwindFX', 'Effects'].join(sep);
    if (line) line.textContent = 'Effektordner: ' + path;
    return line ? line.textContent : null;
  })()`);

  async function shot(name, { frames = 12 } = {}) {
    await dressFolderLine();
    await d.pump(frames);
    await wait(260);
    const file = join(OUT, `${name}.png`);
    await win.capturePage();
    await wait(160);
    writeFileSync(file, (await win.capturePage()).toPNG());
    process.stdout.write(`shot ${file}\n`);
  }

  const start = async (tile) => {
    await d.js(`document.getElementById('gallery-rail').scrollLeft = 0, true`);
    await d.js(`document.getElementById('gallery-${tile}').click(), true`);
    await wait(500);
  };
  const slider = async (id, value) => { await d.setInput(id, String(value)); await wait(160); };
  const select = async (id, value) => { await d.setSelect(id, value); await wait(220); };

  /**
   * The id of a control, found rather than guessed.
   *
   * The settings column names its controls after the DOCUMENT PATH they write
   * (fieldId in components/field.js), so a layer's index is part of the id and
   * changes as layers are added. Hard-coding "sf-layers-2-figure" is how the
   * first version of this file broke: it assumed an index that only existed in
   * my head. The column shows exactly one layer's fill fields at a time — the
   * selected one — so a search for the pattern finds the one that is on screen.
   */
  const findId = async (pattern) => {
    const all = JSON.parse(await d.js(
      `JSON.stringify([...document.querySelectorAll('#inspector [id^=\"sf-\"]')].map((e) => e.id))`
    ));
    const hit = all.find((id) => new RegExp(pattern).test(id));
    if (!hit) throw new Error(`no control matching /${pattern}/ — column has: ${all.join(', ')}`);
    return hit;
  };
  const setFound = async (pattern, value, how = 'select') => {
    const id = await findId(pattern);
    if (how === 'select') await select(id, value); else await slider(id, value);
  };
  const addLayer = async (kind) => {
    await d.setSelect('sf-layer-add-kind', kind);
    const at = await d.box('#sf-layer-add');
    await d.click(at.cx, at.cy);
    await wait(320);
  };

  // ------------------------------------------------------- 1. particles, moving
  //
  // The opening picture. A swarm over a deep gradient is the most immediately
  // legible thing the program makes: it is obviously lighting, obviously
  // moving, and obviously not something you could draw by hand.
  await start('particles');
  // A ground for the swarm to be seen against: the black default makes a fine
  // effect and a dull photograph.
  // The background chooser is called sf-layers because it writes the whole
  // layer ARRAY (it inserts a layer underneath), not a field — see
  // backgroundField in components/field.js.
  await setFound('^sf-layers$', 'gradient');
  await wait(400);
  // Denser and smaller than the default, with a wake behind it — the swarm
  // reads as weather rather than as a handful of discs.
  await setFound('layers-[0-9]+-count$', 220, 'slider');
  await setFound('layers-[0-9]+-size$', 6, 'slider');
  await slider('sf-trail', 55);
  await d.setInput('footer-name', 'Aurora');
  await wait(400);
  await shot('01-particles');

  // ------------------------------------------------------ 2. the layer stack
  //
  // Several shapes over the swarm, so the stack has something to be about.
  // Each figure a colour of its own, so the picture shows THREE layers rather
  // than one pink smudge — the whole point of the shot.
  await addLayer('shape');
  await setFound('layers-[0-9]+-figure$', 'star');
  await setFound('layers-[0-9]+-size$', 70, 'slider');
  await setFound('layers-[0-9]+-color$', '#ffd166', 'slider');
  await addLayer('shape');
  await setFound('layers-[0-9]+-figure$', 'ring');
  await setFound('layers-[0-9]+-size$', 135, 'slider');
  await setFound('layers-[0-9]+-thickness$', 5, 'slider');
  await setFound('layers-[0-9]+-color$', '#ffffff', 'slider');
  await d.setInput('footer-name', 'Layers');
  await wait(200);
  await shot('02-layers');

  // --------------------------------------------------- 3. a gradient in motion
  //
  // The quietest of the three, and the one that shows the settings column doing
  // its job: a shape chosen, an angle set, motion added.
  await start('waves');
  await setFound('layers-[0-9]+-angle$', 35, 'slider');
  await setFound('layers-[0-9]+-bands$', 8, 'slider');
  await slider('sf-hueShift', 200);
  await d.setInput('footer-name', 'Waves');
  await wait(200);
  await shot('03-gradient');

  process.stdout.write('readme shots: done\n');
}

// runHarness ends this process however main() ends — see test/harness/driver.js.
runHarness('readme-shots', main);
