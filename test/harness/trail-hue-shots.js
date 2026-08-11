// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * The trail and the hue, worked in the real window and photographed — without
 * ever showing it.
 *
 *   npx electron test/harness/trail-hue-shots.js [folder]
 *
 * Same shape as gradient-shots.js and for the same reasons: `show: false`
 * before app/main.js opens its window, a frame pump in the page because a
 * window Chromium is not showing never ticks requestAnimationFrame, and two
 * capturePage() calls per picture because the first is what commits the
 * canvas's own layer.
 *
 * WHAT IT IS FOR, BEYOND THE PICTURES
 *
 *  - The hue is photographed mid-rotation, at four points of one turn, so a
 *    reader can see that the whole picture moves round the wheel together
 *    rather than one colour at a time.
 *  - The trail is photographed against a document whose wake can actually be
 *    seen — see the note beside `breathe` below, which is the interesting
 *    finding of this file rather than an incidental of it.
 *  - And the crop is DRAGGED with a trail running, with real mouse events
 *    through the debugger protocol, because the crop writes into the live
 *    document in place while the render loop reads it (setLayerOffset in
 *    components/preview.js) and a veil is the first thing in this engine that
 *    carries a frame into the next one. Whether those two get in each other's
 *    way is a question about a running window, not about arithmetic.
 */
import { app, BrowserWindow } from 'electron';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { serializeProject } from '../../src/main/project.js';
import { normalizeDocument } from '../../src/engine/document.js';
import { folderDialog, discardDialog, projectDialogs } from '../../app/main.js';
import { driver, runHarness, wait } from './driver.js';
import { harnessSandbox } from './sandbox.js';

const { runDir, effectsFolder } = harnessSandbox('trail-hue-shots', { show: false });
discardDialog.ask = async () => ({ response: 1 });

const OUT = resolve(process.argv[2] || join(process.cwd(), 'work', 'trail-hue-shots'));
mkdirSync(OUT, { recursive: true });

async function main() {
  const [win] = BrowserWindow.getAllWindows();
  const d = driver(win);
  const notes = { runDir };

  await d.until(`document.getElementById('footer-export') !== null`, 'the window is built', 300);
  await d.installPump();
  // Real mouse events go through the debugger protocol, and the protocol needs
  // somebody attached to it first — the driver holds the handle but does not
  // attach, exactly as in walkthrough.js and unsaved.js.
  await win.webContents.debugger.attach('1.3');

  async function shot(name, { frames = 10 } = {}) {
    await d.pump(frames);
    await wait(180);
    const file = join(OUT, `${name}.png`);
    await win.capturePage();
    await wait(140);
    writeFileSync(file, (await win.capturePage()).toPNG());
    process.stdout.write(`shot ${file}\n`);
    return file;
  }

  /** What the stage is showing, as numbers rather than as a picture. */
  const state = () => d.js(`(() => {
    const canvas = document.getElementById('preview-canvas');
    const g = canvas.getContext('2d', { willReadFrequently: true });
    const d = g.getImageData(0, 0, canvas.width, canvas.height).data;
    let r = 0, gg = 0, b = 0, hash = 0, max = 0;
    for (let i = 0; i < d.length; i += 4) {
      r += d[i]; gg += d[i + 1]; b += d[i + 2];
      const m = Math.max(d[i], d[i + 1], d[i + 2]);
      if (m > max) max = m;
      hash = (hash * 31 + d[i] + d[i + 1] * 3 + d[i + 2] * 7) | 0;
    }
    const n = canvas.width * canvas.height;
    return { r: r / n, g: gg / n, b: b / n, mean: (r + gg + b) / (3 * n), max, hash };
  })()`);

  win.setContentSize(1280, 820);
  await wait(300);

  folderDialog.open = async () => ({ canceled: false, filePaths: [effectsFolder] });
  await d.js(`document.getElementById('first-run-choose').click(), true`);
  await d.until(`document.getElementById('first-run').hidden === true`, 'the question is answered', 100);

  // A stripes effect, which is what the brief asks these pictures to be shown
  // on and is also the shape a wake reads most clearly against.
  await d.js(`document.getElementById('gallery-stripes').click(), true`);
  await d.until(
    `document.getElementById('preview-body').classList.contains('has-picture')`,
    'the stripes effect is on the stage', 200
  );
  await d.pump(6);
  notes.plain = await state();
  await shot('01-stripes-plain');

  // ------------------------------------------------------------------ the hue
  //
  // Parked, first: one still picture at a quarter turn, so the shift can be
  // compared with the plain one above without any question of when it was
  // taken.
  await d.setInput('sf-hueShift', 90);
  await d.pump(4);
  notes.hueShift90 = await state();
  await shot('02-hue-shift-90');
  await d.setInput('sf-hueShift', 180);
  await d.pump(4);
  notes.hueShift180 = await state();
  await shot('03-hue-shift-180');
  await d.setInput('sf-hueShift', 0);
  await d.pump(4);

  // And turning: four pictures across one rotation. The pump is what makes
  // this reproducible — every picture is taken a known number of frames after
  // the last, not a known number of milliseconds.
  await d.setInput('sf-hueCycle', 60);
  notes.cycle = [];
  for (let step = 0; step < 4; step += 1) {
    await d.pump(9);
    notes.cycle.push(await state());
    await shot(`04-hue-cycling-${step + 1}`, { frames: 0 });
  }
  await d.setInput('sf-hueCycle', 0);
  await d.setInput('sf-hueShift', 0);
  await d.pump(4);

  // ---------------------------------------------------------------- the trail
  //
  // THE FINDING THIS FILE EXISTS TO RECORD. A trail is a veil laid UNDER the
  // frame being drawn, so anything that repaints all 320 x 200 opaquely hides
  // its own wake completely — and a gradient does exactly that. On a plain
  // stripes layer the trail slider is therefore a control that does nothing
  // visible, whatever it is set to, and the first run of this harness showed
  // precisely that: identical pictures at trail 0 and trail 90.
  //
  // What lets the past through is anything that stops the layer being opaque,
  // and the app has one of those on the very next heading: `breathe` and
  // `pulse` are both factors on the layer's own alpha (see motion/breathe.js),
  // so a breathing stripes layer is translucent for most of its cycle and its
  // wake is plainly there. So both are photographed — the one that shows
  // nothing as well as the one that shows something, because the first is the
  // honest half of what this control currently is.
  await d.setInput('sf-trail', 90);
  await d.pump(20);
  notes.trailOpaque = await state();
  await shot('05-trail-90-opaque-layer');

  await d.js(`document.getElementById('sf-layers-0-add').click(), true`);
  await d.until(`document.getElementById('sf-layers-0-kind-0') !== null`,
    'the motion card is there', 100);
  await d.setSelect('sf-layers-0-kind-0', 'breathe');
  await d.setInput('sf-layers-0-motions-0-speed', 45);
  await d.setInput('sf-layers-0-motions-0-amount', 100);

  await d.setInput('sf-trail', 0);
  await d.pump(24);
  notes.breathingNoTrail = await state();
  await shot('06-breathing-no-trail');

  await d.setInput('sf-trail', 90);
  await d.pump(24);
  notes.breathingTrail = await state();
  await shot('07-breathing-trail-90');

  // Both at once, which is what the two together are for.
  await d.setInput('sf-hueCycle', 55);
  await d.pump(12);
  notes.trailAndHue = await state();
  await shot('08-trail-and-hue-cycling');
  await d.setInput('sf-hueCycle', 0);

  // ------------------------------------------------- the crop, with a wake on
  //
  // A picture is needed for this one, because the crop only exists for an
  // image layer. The drag is real mouse events through the debugger protocol,
  // one move at a time — the crop follows pointermove, so a single jump would
  // not prove it tracks. What is being watched for is the two writers falling
  // over each other: the drag writes the offset straight into the live
  // document while the render loop is reading it, and the veil now carries
  // each frame into the next.
  // The picture comes in as a saved project opened through the app's own
  // button, exactly as test/harness/shots.js does it: dropping a file needs a
  // VISIBLE window (Chromium's drag pipeline does not serve a hidden one), and
  // showing a window is the one thing every harness here refuses to do.
  const dataUrl = await d.js(`(() => {
    const c = document.createElement('canvas');
    // 960 x 300 rather than the canvas's own 16:10, because a crop can only be
    // dragged where there is slack, and slack is what a picture of a different
    // shape from the frame has. A picture that fits exactly has none, and the
    // drag would be a gesture with nothing to move.
    c.width = 960; c.height = 300;
    const g = c.getContext('2d');
    for (let y = 0; y < 300; y += 60) {
      for (let x = 0; x < 960; x += 60) {
        g.fillStyle = ((x + y) / 60) % 2 ? '#ffd166' : '#0b1020';
        g.fillRect(x, y, 60, 60);
      }
    }
    g.fillStyle = '#ffffff';
    g.fillRect(400, 0, 24, 300);
    return c.toDataURL('image/png');
  })()`);
  const seed = normalizeDocument({
    name: 'Wake and Crop',
    trail: 85,
    layers: [{
      id: 'image', type: 'image', asset: 'image', fit: 'cover',
      offset: { x: 0, y: 0 },
      // `cover` is what gives the crop something to move, and it also covers
      // all 320 x 200 opaquely — which would hide the wake entirely. A pulse
      // is the way to have both: it is a factor on the layer's own alpha, so
      // the picture is translucent for most of every beat and the trail is in
      // the frame while the crop is being dragged.
      motions: [{ kind: 'pulse', speed: 40, amount: 90 }]
    }],
    assets: { image: { kind: 'image', mime: 'image/png', data: dataUrl.split(',')[1] } }
  }).doc;
  const seedFile = join(runDir, 'wake-and-crop.sfx');
  writeFileSync(seedFile, serializeProject(seed), 'utf8');
  projectDialogs.open = async () => ({ canceled: false, filePaths: [seedFile] });

  await d.clickAndWait('footer-open');
  await d.until(
    `document.getElementById('preview-body').classList.contains('has-picture')`,
    'the picture is on the stage', 300
  );
  await d.pump(16);

  const box = await d.box('#preview-canvas');
  notes.cropBefore = await state();
  await shot('09-crop-trail-before-drag');

  // The drag itself, with the render loop pumped THROUGH it rather than
  // before and after: a wake that only survives a still window would prove
  // nothing about a window somebody is working in.
  const steps = 10;
  await d.send('Input.dispatchMouseEvent', {
    type: 'mousePressed', x: box.cx, y: box.cy, button: 'left', buttons: 1, clickCount: 1
  });
  const during = [];
  for (let i = 1; i <= steps; i += 1) {
    await d.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: box.cx - (i * box.width) / (steps * 3),
      y: box.cy,
      button: 'left', buttons: 1, clickCount: 1
    });
    await d.pump(2);
    during.push(await state());
  }
  await d.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased', x: box.cx - box.width / 3, y: box.cy, button: 'left', buttons: 0, clickCount: 1
  });
  await d.pump(4);
  notes.cropDuring = during;
  notes.cropAfter = await state();
  await shot('10-crop-trail-after-drag');

  // Everything must still be a picture: no black frame, no runaway to white,
  // and the crop must actually have moved something.
  const sane = (entry) => entry.mean > 1 && entry.mean < 250;
  notes.verdict = {
    everyFrameDuringDragIsAPicture: during.every(sane),
    theDragChangedTheFrame: notes.cropBefore.hash !== notes.cropAfter.hash,
    theWakeShowsOnABreathingLayer: notes.breathingTrail.hash !== notes.breathingNoTrail.hash,
    theWakeShowsNothingOnAnOpaqueLayer: notes.trailOpaque.hash === notes.plain.hash,
    theHueMovedThePicture: notes.hueShift90.hash !== notes.plain.hash,
    theHueKeptTurning: new Set(notes.cycle.map((entry) => entry.hash)).size === notes.cycle.length
  };

  writeFileSync(join(OUT, 'notes.json'), JSON.stringify(notes, null, 2), 'utf8');
  process.stdout.write(`${JSON.stringify(notes.verdict)}\n`);
  return Object.values(notes.verdict).every(Boolean) ? 0 : 1;
}

runHarness('trail-hue-shots', main, { watchdogMs: 120_000 });
