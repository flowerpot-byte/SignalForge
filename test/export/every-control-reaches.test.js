// SignalForge — build SignalRGB effects from images, gradients, shapes and particles.
// Copyright (C) 2026 Max Leopold Blumenschein
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runJobs } from '../harness/render.js';
import { meanDifference } from '../harness/pixels.js';
import { buildEffectHtml } from '../../src/export/build-effect.js';
import { effectControls } from '../../src/export/effect-controls.js';
import { normalizeDocument } from '../../src/engine/document.js';
import { foregroundOf, backgroundOf } from '../../src/engine/slots.js';

/**
 * EVERY knob an exported effect offers must reach the picture.
 *
 * WHY THIS FILE EXISTS. The report on 12.08.2026 was "the colour slider in
 * SignalRGB for the background does not work". Going looking for it turned up
 * something worse than the bug: the whole corpus of export tests renders with
 * NO host values set. Every control had only ever been exercised at its own
 * default. The tests proved the knobs are declared correctly — right meta tag,
 * right bind path, right default — and nothing anywhere proved that turning one
 * changes a pixel.
 *
 * So this is not a test for one slider. It walks the entire control list of a
 * real document, turns each knob on its own the way the host turns it (a plain
 * global; SignalRGB's injection template is `var %1 = "%2";`), and requires the
 * frame to change. A knob that does nothing is named in the failure, with its
 * measured difference beside it.
 *
 * WHAT COUNTS AS A PROBE VALUE. Far from the default and inside the declared
 * range, chosen per type: the opposite corner of a slider, a different option
 * from a dropdown, a colour nothing in the document already is. A probe that
 * lands on the default would prove nothing, so each one is checked against it.
 */

/** A figure on a gradient — the shape the star tile plus a background makes. */
function starOnGradient() {
  const { doc } = normalizeDocument({
    name: 'EveryControl',
    description: 'every knob must reach the picture',
    publisher: 'SignalForge',
    assets: {},
    layers: [
      {
        id: 'fill',
        type: 'gradient',
        shape: 'linear',
        angle: 0,
        stops: [{ at: 0, color: '#00ff00' }, { at: 100, color: '#ff0066' }]
      },
      { id: 'shape', type: 'shape', figure: 'star', color: '#ff0000', size: 40 }
    ]
  });
  return {
    ...doc,
    controls: effectControls(doc, foregroundOf(doc.layers).id, backgroundOf(doc.layers).id)
  };
}

/**
 * A ring on a plain colour, with the colour cycle actually running.
 *
 * The second shape exists because the first one cannot ask three of the
 * questions: a solid background takes a different branch in effectControls
 * (one `bgColor` instead of a `bgColor<n>` per stop), a ring is the only figure
 * whose wall thickness means anything, and the cycle colours are ignored
 * outright while the tempo is zero — which is a fact about the ENGINE
 * (cyclePaint returns the resting colour at speed 0) and therefore a knob that
 * can only be tested with the cycle switched on.
 */
function ringOnSolidWithCycle() {
  const { doc } = normalizeDocument({
    name: 'EveryControlCycling',
    description: 'every knob must reach the picture, second shape',
    publisher: 'SignalForge',
    assets: {},
    layers: [
      { id: 'fill', type: 'solid', color: '#203040' },
      {
        id: 'shape',
        type: 'shape',
        figure: 'ring',
        color: '#ff0000',
        size: 60,
        thickness: 30,
        // Switched ON but crawling, and parked between the two palette
        // entries. Tempo 40 was the first try and it made the document
        // unmeasurable: a cycling effect repaints on wall-clock time through
        // its own setInterval safety net (see the bootstrap in
        // src/export/build-effect.js), so two identical runs differ by more
        // than a knob does — under the load of the full suite that wobble grew
        // until a whole colour swap disappeared into it. Tempo 1 keeps
        // cyclePaint on the palette branch (it needs only speed > 0) while
        // moving the colour a fraction of a percent across these four frames,
        // and phase 25 parks it midway so BOTH palette entries are in the
        // mix and swapping either one shows.
        cycleSpeed: 1,
        cyclePhase: 25,
        stops: [{ at: 0, color: '#ff0066' }, { at: 100, color: '#00b3ff' }]
      }
    ]
  });
  return {
    ...doc,
    controls: effectControls(doc, foregroundOf(doc.layers).id, backgroundOf(doc.layers).id)
  };
}

/**
 * Knobs that CANNOT change a given picture, and why.
 *
 * Every entry is a fact about that document, not about the knob: each of these
 * does move a picture shaped to need it, and each is therefore exercised by the
 * OTHER shape above. They are named here rather than quietly skipped so the
 * list stays short, arguable, and visible to whoever reads a failure.
 */
const CANNOT_MOVE = {
  'star on a gradient': new Map([
    ['thickness', 'a star is filled — there is no wall to thin (the ring shape covers it)'],
    ['bgBands', 'this background is linear, which repeats once (the stripes case would cover it)']
    // No cycleColor entries here any more: this document's cycle stands at
    // tempo 0, and since 12.08. the palette is not offered at all while it
    // stands. There is nothing to exempt because there is nothing on offer —
    // which is the whole point of that change.
  ]),
  'ring on a solid, cycling': new Map()
};

/**
 * The four the first shape cannot ask about, and nothing else.
 *
 * The second shape deliberately does NOT walk its whole panel. Its colour cycle
 * is running, and a running effect is not reproducible frame for frame: the
 * exported effect keeps a setInterval alive as a second way in (see the
 * bootstrap in src/export/build-effect.js), so frames land between the ones the
 * harness drives, timed by the wall clock. Two identical runs of this document
 * differ by more than a real knob does, which is a fact about robustness in the
 * host and not a defect — but it means a pixel comparison there can only be
 * trusted for knobs whose effect is LARGE. These four are: a whole colour
 * replaced, or a wall thickness halved.
 */
const ONLY_THE_CYCLING_SHAPE_CAN_ASK = ['cycleColor1', 'cycleColor2', 'bgColor', 'thickness'];

/**
 * Several frames and not one.
 *
 * `trail` is the reason: a wake is what earlier frames leave behind, so a
 * single frame is the one condition under which the knob provably cannot do
 * anything. Measured: at one frame it moved the picture by 0.371 against a
 * noise floor of 0.4 on the cycling shape, i.e. it read as dead. Everything
 * else here is happy with one frame and unbothered by four.
 */
const STAMPS = [1000, 1100, 1200, 1300];

/** A value far from `control.default` and inside what the control declares. */
function probeFor(control) {
  if (control.type === 'color') {
    // Blue unless the default already is; nothing in the document is either.
    return String(control.default).toLowerCase() === '#0000ff' ? '#ffff00' : '#0000ff';
  }
  if (control.type === 'combobox') {
    return control.values.find((value) => value !== control.default) ?? null;
  }
  const { min, max, default: now } = control;
  // A full-circle slider is cyclic: 360 IS 0, so the far end of the range is
  // the one value guaranteed to draw the identical picture. The first version
  // of this function picked exactly that for rotation, bgAngle and hueShift
  // and reported all three as dead knobs. Half a turn is the honest opposite.
  if (max - min === 360) return ((now - min + 180) % 360) + min;
  // Otherwise whichever end of the slider is further from where it sits.
  return (now - min) >= (max - now) ? min : max;
}

async function checkEveryControl(shapeName, doc, dir, only = null) {
  {
    const file = join(dir, `${shapeName.replace(/\W+/g, '-')}.html`);
    const engineSource = readFileSync(new URL('../../dist/engine.bundle.js', import.meta.url), 'utf8');
    writeFileSync(file, buildEffectHtml({ doc, engineSource, lang: 'en' }), 'utf8');

    const probes = doc.controls
      .filter((control) => !only || only.includes(control.property))
      .map((control) => ({ control, value: probeFor(control) }))
      .filter(({ control, value }) => value !== null && value !== control.default);

    assert.equal(probes.length, only ? only.length : probes.length,
      `${shapeName}: expected to probe ${only ? only.join(', ') : 'the whole panel'}, `
      + `got ${probes.map((p) => p.control.property).join(', ')}`);
    assert.ok(probes.length >= (only ? only.length : 18),
      `${shapeName}: expected the whole panel to be probed, got ${probes.length} probes`);

    // One Electron launch for all of them — see runJobs. The SECOND base run
    // is not a duplicate: it is how the noise floor gets measured instead of
    // guessed. An effect whose colour cycle is running does not paint the same
    // frame twice even at the same stamp, and a fixed threshold below that
    // wobble reads it as "the knob worked" — which it did here, reporting two
    // knobs alive at exactly the same 0.159 as each other.
    const [base, baseAgain, ...turned] = await runJobs([
      { name: 'base', kind: 'html', file, stamps: STAMPS },
      { name: 'base-again', kind: 'html', file, stamps: STAMPS },
      ...probes.map(({ control, value }) => ({
        name: control.property, kind: 'html', file, stamps: STAMPS,
        setGlobals: { [control.property]: value }
      }))
    ]);

    // Three times the wobble, floor 0.05. Three because the wobble is what two
    // IDENTICAL runs differ by, so anything a knob does has to stand clear of
    // it rather than merely exceed it.
    const noise = meanDifference(base.pixels, baseAgain.pixels);
    const threshold = Math.max(0.05, noise * 3);

    const dead = [];
    const moved = [];
    probes.forEach(({ control, value }, index) => {
      const difference = meanDifference(base.pixels, turned[index].pixels);
      const line = `${control.property} (${JSON.stringify(control.default)} -> `
        + `${JSON.stringify(value)}): ${difference.toFixed(3)}`;
      if (difference > threshold) moved.push(line);
      else dead.push(line);
    });

    const exempt = CANNOT_MOVE[shapeName];
    const unexpectedlyDead = dead.filter((line) => !exempt.has(line.split(' ')[0]));
    assert.deepEqual(unexpectedlyDead, [],
      `${shapeName}: these knobs did not change one pixel:\n  ${unexpectedlyDead.join('\n  ')}\n`
      + `(knobs that did work: ${moved.length} of ${probes.length})`);

    // And the other direction: an exemption that has started working is an
    // exemption that must go, or the list rots into an excuse.
    const exemptedButAlive = moved.filter((line) => exempt.has(line.split(' ')[0]));
    assert.deepEqual(exemptedButAlive, [],
      `${shapeName}: these are listed as unable to move this picture, but they moved it:\n  ${exemptedButAlive.join('\n  ')}`);
  }
}

test('every control in an exported effect changes the picture when the host turns it', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'signalforge-allctl-'));
  try {
    await checkEveryControl('star on a gradient', starOnGradient(), dir);
    await checkEveryControl('ring on a solid, cycling', ringOnSolidWithCycle(), dir,
      ONLY_THE_CYCLING_SHAPE_CAN_ASK);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
