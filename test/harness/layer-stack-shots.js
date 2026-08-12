// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * The layer stack with MANY layers in it, worked with a real mouse — without
 * ever showing the window.
 *
 *   npx electron test/harness/layer-stack-shots.js [folder]
 *
 * WHY THIS EXISTS. The stack was built on 12.08. and every check it has seen
 * so far runs on two or three layers: the unit tests stand up three in a fake
 * DOM, and the walkthrough's point 12 adds exactly one figure to one picture.
 * Nothing has ever asked what the column does when somebody keeps pressing the
 * add button — and that is the one question a list control cannot answer by
 * design review, because the answers are all about space: does the column
 * scroll or does the stack push the sections below it off the window, do the
 * cards keep their width once there are more of them than fit, can the arrows
 * still be hit with a pointer at the smallest supported window size.
 *
 * It is a measuring harness and not a test: it writes numbers and pictures for
 * a person to read. Anything it finds that ought to stay found belongs in
 * test/app or test/engine afterwards, as a check that fails on its own.
 *
 * Same rules as every harness beside it, set out at length in
 * gradient-shots.js: `show = false` before app/main.js opens its window, two
 * capturePage() per picture, and a frame pump driven from outside because a
 * window Chromium is not showing never ticks requestAnimationFrame. Nothing
 * here calls show(), focus() or maximize() — the machine's owner is at his
 * desk while this runs.
 *
 * The gestures are REAL pointer events through the debugger (d.click on a
 * measured box), not element.click(). That distinction is the whole point of a
 * harness about reachability: element.click() fires on a button that is
 * scrolled out of sight, covered by another element, or a pixel tall, and
 * would report every one of those as working.
 */
import { BrowserWindow } from 'electron';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { folderDialog, discardDialog } from '../../app/main.js';
import { driver, runHarness, wait } from './driver.js';
import { harnessSandbox } from './sandbox.js';

const { effectsFolder } = harnessSandbox('layer-stack-shots', { show: false });

// Starting an effect from a tile leaves unsaved work, and the next one asks
// about it in a native, window-modal box. Answered here for the same reason
// the other shot harnesses answer it: everything this run discards it made
// itself seconds earlier. THAT the question gets asked is proved elsewhere
// (test/harness/unsaved.js).
discardDialog.ask = async () => ({ response: 1 });

const OUT = resolve(process.argv[2] || join(process.cwd(), 'work', 'layer-stack-shots'));
mkdirSync(OUT, { recursive: true });

/** The window's smallest supported size — where space runs out first. */
const SMALLEST = [1040, 700];

/** How many foreground layers to pile up. */
const PILE = 6;

/**
 * What the stack looks like right now, measured rather than photographed.
 *
 * Every number here is about SPACE, because that is what more cards costs.
 * `offScreen` is the one that matters most: a card whose box sits outside its
 * own scrolling column is unreachable however good it looks in a picture of
 * the part that is visible.
 */
const READ_STACK = `(() => {
  const box = (node) => {
    const r = node.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
  };
  const stack = document.querySelector('.layer-stack');
  if (!stack) return { present: false };
  const column = document.getElementById('inspector');
  const frame = column.getBoundingClientRect();
  const cards = [...stack.querySelectorAll('.layer-card')];
  const rows = cards.map((card) => {
    const pick = card.querySelector('.layer-pick');
    const buttons = [...card.querySelectorAll('button')].map((b) => ({ id: b.id, ...box(b) }));
    const b = box(card);
    return {
      id: pick ? pick.id : null,
      label: pick ? pick.textContent.trim() : null,
      pressed: pick ? pick.getAttribute('aria-pressed') : null,
      card: b,
      buttons,
      // Inside its own scroller, top and bottom both.
      visibleInColumn: b.y >= frame.top - 1 && b.y + b.h <= frame.bottom + 1
    };
  });
  const widths = [...new Set(rows.map((r) => r.card.w))];
  return {
    present: true,
    count: rows.length,
    rows,
    // One width for every card is what "the cards fill the box" means; this is
    // the number the align-items fix of 12.08. is about, asked of a stack big
    // enough to run out of room.
    widths,
    allSameWidth: widths.length === 1,
    stack: box(stack),
    column: { scrollTop: column.scrollTop, scrollHeight: column.scrollHeight,
      clientHeight: column.clientHeight, scrolls: column.scrollHeight > column.clientHeight + 1 },
    // The sections BELOW the stack have to survive it. If the stack pushed
    // them out of the document rather than making the column scroll, this is
    // where it shows.
    //
    // A field-group with a data-section, and not a heading class: the column
    // has no element class for its headings at all — openSection() in
    // inspector.js builds a plain h2 inside a section whose data-section names
    // it. The first version of this line looked for a section-title class,
    // matched nothing ever, and reported "no sections left" on a stack of one,
    // which is how a measurement invents a defect.
    //
    // (No backticks anywhere inside this string, in prose either: the whole
    // block is a template literal, and one in a comment ends it. That mistake
    // does not fail like a normal typo — the module throws while Electron is
    // still LOADING it, which is before runHarness has armed its watchdog, and
    // the process then sat there for six minutes behind an error dialog nobody
    // could see because the window is deliberately hidden.)
    sectionsBelow: [...document.querySelectorAll('#inspector .field-group[data-section]')]
      .map((g) => g.dataset.section)
      .filter((name) => name !== 'layers'),
    // Smallest button in the whole stack: the arrows and the minus are the
    // controls that shrink first when a row gets crowded.
    smallestButton: Math.min(...rows.flatMap((r) => r.buttons.map((b) => Math.min(b.w, b.h))))
  };
})()`;

async function main() {
  const [win] = BrowserWindow.getAllWindows();
  const d = driver(win);
  const notes = { problems: [] };
  const complain = (what) => { notes.problems.push(what); process.stdout.write(`PROBLEM ${what}\n`); };

  await d.until(`document.getElementById('footer-export') !== null`, 'the window is built', 300);
  await d.installPump();
  await win.webContents.debugger.attach('1.3');

  async function shot(name, { frames = 6 } = {}) {
    await d.pump(frames);
    await wait(180);
    const file = join(OUT, `${name}.png`);
    await win.capturePage();
    await wait(140);
    writeFileSync(file, (await win.capturePage()).toPNG());
    process.stdout.write(`shot ${file}\n`);
    return file;
  }

  /** Is that selector in the document at all? Asked before every box(). */
  const exists = (selector) => d.js(`document.querySelector(${JSON.stringify(selector)}) !== null`);

  /**
   * A real pointer press on whatever that selector's box is right now.
   *
   * The existence check is separate because d.box() throws on a missing
   * element, and "the button is not there" deserves a sentence naming the
   * button rather than a TypeError about null.
   */
  async function press(selector) {
    if (!await exists(selector)) throw new Error(`nothing to press at ${selector}`);
    const at = await d.box(selector);
    await d.click(at.cx, at.cy);
  }

  win.setContentSize(SMALLEST[0], SMALLEST[1]);
  await wait(300);

  folderDialog.open = async () => ({ canceled: false, filePaths: [effectsFolder] });
  await d.js(`document.getElementById('first-run-choose').click(), true`);
  await d.until(`document.getElementById('first-run').hidden === true`, 'the question is answered', 100);

  // A figure to start from, so the stack has a foreground layer at all.
  await d.js(`document.getElementById('gallery-star').click(), true`);
  await d.until(`document.querySelector('.layer-stack') !== null`, 'the stack is there', 200);
  notes.atStart = await d.js(READ_STACK);
  await shot('01-one-layer');

  // ------------------------------------------------ pile them on, by pointer
  notes.growth = [];
  for (let n = 0; n < PILE - 1; n += 1) {
    // Alternating kinds, because a stack of six identical cards would not
    // show a label that is too long for its card.
    await d.setSelect('sf-layer-add-kind', n % 2 === 0 ? 'shape' : 'particles');
    await press('#sf-layer-add');
    await d.until(
      `document.querySelectorAll('.layer-card').length === ${n + 2}`,
      `layer ${n + 2} arrived`, 200
    );
    const now = await d.js(READ_STACK);
    notes.growth.push({
      count: now.count, allSameWidth: now.allSameWidth, widths: now.widths,
      columnScrolls: now.column.scrolls,
      offScreen: now.rows.filter((r) => !r.visibleInColumn).map((r) => r.id),
      smallestButton: now.smallestButton
    });
  }
  notes.piled = await d.js(READ_STACK);
  await shot('02-six-layers');

  if (!notes.piled.allSameWidth) {
    complain(`cards have ${notes.piled.widths.length} different widths at ${PILE} layers: ${notes.piled.widths.join(', ')}`);
  }
  if (notes.piled.count !== PILE) complain(`expected ${PILE} cards, counted ${notes.piled.count}`);
  if (notes.piled.smallestButton < 16) {
    complain(`smallest button in the stack is ${notes.piled.smallestButton}px — under a pointer's reach`);
  }
  // Cards below the fold are fine ONLY if the column scrolls to them.
  const hidden = notes.piled.rows.filter((r) => !r.visibleInColumn).map((r) => r.id);
  if (hidden.length > 0 && !notes.piled.column.scrolls) {
    complain(`cards out of view (${hidden.join(', ')}) and the column does not scroll`);
  }
  notes.cardsBelowTheFold = hidden;
  // The sections under the stack must still be in the document.
  if (notes.piled.sectionsBelow.length < 2) {
    complain(`only ${notes.piled.sectionsBelow.length} section heading(s) left below a full stack`);
  }

  // -------------------------------------------- still workable at six layers
  //
  // The bottom card's up arrow, pressed for real. If the stack has grown past
  // the column, the button has to be scrolled to first — which is itself part
  // of the question, so it is done the way a person would: scroll, then aim at
  // where the button now is.
  const bottom = notes.piled.rows[notes.piled.rows.length - 1];
  notes.move = { card: bottom.id, before: notes.piled.rows.map((r) => r.id) };
  await d.js(`document.getElementById(${JSON.stringify(bottom.id)}).scrollIntoView({ block: 'center' }), true`);
  await wait(160);
  const upButton = `#${bottom.id}-up`;
  const upBox = await exists(upButton) ? await d.box(upButton) : null;
  if (!upBox) complain(`the bottom card's up arrow (${upButton}) is not in the window`);
  else {
    await d.click(upBox.cx, upBox.cy);
    await wait(200);
    const after = await d.js(READ_STACK);
    notes.move.after = after.rows.map((r) => r.id);
    notes.move.orderChanged = notes.move.before.join() !== notes.move.after.join();
    if (!notes.move.orderChanged) complain('a real click on the up arrow did not change the order');
  }
  await shot('03-after-moving-the-bottom-card-up');

  // Picking a card in the middle, by pointer, and it must become the pressed
  // one without the document being touched.
  const middle = (await d.js(READ_STACK)).rows[Math.floor(PILE / 2)];
  await d.js(`document.getElementById(${JSON.stringify(middle.id)}).scrollIntoView({ block: 'center' }), true`);
  await wait(160);
  await press(`#${middle.id}`);
  await wait(200);
  const picked = await d.js(READ_STACK);
  notes.pick = {
    asked: middle.id,
    pressedNow: picked.rows.filter((r) => r.pressed === 'true').map((r) => r.id)
  };
  if (notes.pick.pressedNow.length !== 1) {
    complain(`after one pick, ${notes.pick.pressedNow.length} cards report themselves pressed`);
  } else if (notes.pick.pressedNow[0] !== middle.id) {
    complain(`picked ${middle.id} but ${notes.pick.pressedNow[0]} is the pressed one`);
  }
  await shot('04-middle-card-picked');

  // ------------------------------------------------ and all the way back down
  //
  // Removing until one is left proves the floor holds with a real pointer as
  // well as in the unit test: the last stack card's remove button is disabled,
  // and a disabled button that is still clickable would show up here.
  for (let guard = 0; guard < PILE + 2; guard += 1) {
    const now = await d.js(READ_STACK);
    if (now.count <= 1) break;
    const first = now.rows[0];
    await d.js(`document.getElementById(${JSON.stringify(first.id)}).scrollIntoView({ block: 'center' }), true`);
    await wait(120);
    const removeSelector = `#${first.id}-remove-stack`;
    if (!await exists(removeSelector)) { complain(`no remove button on ${first.id}`); break; }
    const removeBox = await d.box(removeSelector);
    await d.click(removeBox.cx, removeBox.cy);
    await wait(180);
  }
  notes.atEnd = await d.js(READ_STACK);
  if (notes.atEnd.count !== 1) complain(`removing down to the floor left ${notes.atEnd.count} cards`);
  const lastRemove = notes.atEnd.rows[0]?.buttons.find((b) => b.id.endsWith('-remove-stack'));
  notes.lastRemoveDisabled = await d.js(
    `document.getElementById(${JSON.stringify(lastRemove ? lastRemove.id : '')})?.disabled ?? null`
  );
  if (notes.lastRemoveDisabled !== true) complain('the last stack card can still be removed');
  if (lastRemove) {
    await d.click(lastRemove.x + lastRemove.w / 2, lastRemove.y + lastRemove.h / 2);
    await wait(180);
    const after = await d.js(READ_STACK);
    if (after.count !== 1) complain('clicking the disabled remove button emptied the stack anyway');
  }
  await shot('05-back-to-one');

  notes.ok = notes.problems.length === 0;
  writeFileSync(join(OUT, 'notes.json'), JSON.stringify(notes, null, 2), 'utf8');
  process.stdout.write(`notes ${join(OUT, 'notes.json')}\n`);
  process.stdout.write(notes.ok ? 'layer stack: no problems found\n' : `layer stack: ${notes.problems.length} problem(s)\n`);
}

// runHarness ends this process however main() ends — see test/harness/driver.js.
runHarness('layer-stack-shots', main);
