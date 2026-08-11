// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import { CANVAS_WIDTH, CANVAS_HEIGHT, normalizeDocument, isValidIdentifier } from '../engine/document.js';

const ASCII_PRINTABLE = /^[\x20-\x7E]*$/;

/**
 * The id of the script block the finished effect carries its document in.
 *
 * Written here and read back by src/main/effect-document.js, which is what
 * makes an exported effect openable again — the effects folder is the app's
 * library, and this block is the whole reason a file in it is more than a
 * finished artefact. One constant rather than the same string typed in two
 * files: an effect whose document could not be found again would not fail
 * loudly, it would simply stop being reopenable, and nothing but a test would
 * ever notice.
 */
export const DOCUMENT_SCRIPT_ID = 'sf-document';

function attribute(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Keep the JSON payload from terminating its own script block. */
function jsonBlock(value) {
  return JSON.stringify(value).replace(/<\//g, '<\\/');
}

function controlMeta(control, lang) {
  const label = control.label[lang] ?? control.label.en;
  if (!ASCII_PRINTABLE.test(label)) {
    throw new Error(`Control "${control.property}": label "${label}" must be ASCII only. `
      + 'SignalRGB\'s handling of non-ASCII labels is unverified.');
  }
  const parts = [
    `property="${attribute(control.property)}"`,
    `label="${attribute(label)}"`,
    `type="${attribute(control.type)}"`
  ];
  if (control.type === 'number') {
    parts.push(`min="${attribute(control.min)}"`, `max="${attribute(control.max)}"`);
  }
  if (control.type === 'combobox') {
    for (const value of control.values) {
      if (value.includes(',')) {
        throw new Error(`Control "${control.property}": combobox value "${value}" contains a comma. `
          + 'SignalRGB\'s "values" attribute is comma-separated, so this value cannot be represented '
          + 'and would silently split into two options.');
      }
    }
    parts.push(`values="${attribute(control.values.join(','))}"`);
  }
  parts.push(`default="${attribute(control.default)}"`);
  return `  <meta ${parts.join(' ')} />`;
}

function bootstrap(controls) {
  const reads = controls
    .map((c) => `    values[${JSON.stringify(c.property)}] = `
      + `(typeof ${c.property} !== 'undefined') ? ${c.property} : undefined;`)
    .join('\n');

  return `
  var SF = window.SignalForgeEngine;
  var canvas = document.getElementById('exCanvas');
  var ctx = canvas.getContext('2d');
  var raw = JSON.parse(document.getElementById('${DOCUMENT_SCRIPT_ID}').textContent);
  var base = SF.normalizeDocument(raw).doc;
  var renderer = SF.createRenderer();
  var assets = null;

  // ---- The clock, and why it is not simply the host's timestamp ----------
  //
  // SignalRGB's documentation and every effect it ships drive an effect from
  // window.requestAnimationFrame, so that is still the way in. What has
  // changed is that neither the loop nor the timestamp is trusted to be the
  // ONLY way in, because in the real host neither is guaranteed:
  //
  //  - the effect runs in an offscreen Ultralight view, and SignalRGB carries
  //    its own recovery code for one whose frames have gone stale
  //    (UltralightView::TryRecoverIfBehind re-kicks a single remembered
  //    callback, and logs "Still stale after {} frames: recovery did not
  //    help"). A loop that stops delivering is a designed-for condition there.
  //  - every effect SignalRGB itself ships ignores the timestamp argument
  //    entirely and steps a counter once per frame instead. An effect that
  //    cannot draw without a well-behaved timestamp is depending on something
  //    the host's own effects never depend on.
  //
  // So: elapsed time is accumulated here rather than derived, from the
  // timestamp whenever it advances sanely and from a plain frame count
  // whenever it does not. With a healthy host this is exactly the old
  // (stamp - start) / 1000 and the preview and the exported file still land
  // on the same pixels for the same frames; with a host that repeats a
  // timestamp, hands over none, or resumes after a long pause, the picture
  // keeps moving instead of freezing on a perfect still frame.
  //
  // No wall clock is read (Date.now / performance.now are forbidden here and
  // in the engine, so that a frame depends on nothing but its own inputs) --
  // the fallback is a frame count, which needs no clock at all.
  var FRAME_GAP = 1000 / 30;
  var NOMINAL_STEP = 1 / 30;
  /** Longer than this between two timestamps means the view was paused. */
  var MAX_STEP_SEC = 1;

  var seconds = 0;
  var previousStamp = null;
  var drawnStamp = null;
  var drawnAny = false;
  var ticks = 0;

  SF.loadAssets(base, {
    resolveUrl: function (asset) {
      return asset.data ? 'data:' + asset.mime + ';base64,' + asset.data : asset.file;
    }
  }).then(function (loaded) { assets = loaded; }).catch(function (err) {
    // Without this, a rejected load leaves assets === null forever: update()
    // keeps returning early every frame and the effect is silently black,
    // with nothing but an unhandled-rejection nobody is watching for.
    console.log('SignalForge: failed to load assets, effect will stay blank.', err);
  });

  function readControls() {
    var values = {};
${reads}
    for (var key in values) {
      if (values[key] === undefined) delete values[key];
    }
    return values;
  }

  function usable(stamp) {
    return typeof stamp === 'number' && isFinite(stamp);
  }

  /**
   * Hold the effect to 30 frames a second -- but only ever on the strength of
   * a timestamp that is actually moving forward. The old gate was
   * "stamp - lastFrame < FRAME_GAP", which is true forever the moment the
   * host stops advancing its timestamp: the render step is then never reached
   * again and the effect freezes on the frame it happens to have drawn. A gate
   * that cannot tell "too soon" from "not moving" must not be allowed to
   * refuse.
   */
  function tooSoon(stamp) {
    if (!drawnAny || !usable(stamp) || drawnStamp === null) return false;
    var since = stamp - drawnStamp;
    return since > 0 && since < FRAME_GAP;
  }

  /** Move the effect's own clock on by one frame. */
  function advance(stamp) {
    if (!drawnAny) {
      // The first frame is always t = 0, whatever the host started counting
      // from -- which is what keeps the exported file and the preview on the
      // same frame for the same elapsed time.
      drawnAny = true;
      if (usable(stamp)) { previousStamp = stamp; drawnStamp = stamp; }
      return;
    }
    if (usable(stamp) && previousStamp !== null && stamp > previousStamp) {
      var step = (stamp - previousStamp) / 1000;
      previousStamp = stamp;
      drawnStamp = stamp;
      // A jump far larger than a frame is a view that was paused and has come
      // back, not a second of animation to catch up on in one go.
      seconds += step <= MAX_STEP_SEC ? step : NOMINAL_STEP;
      return;
    }
    // No timestamp, or one that stood still or went backwards: count the
    // frame instead, exactly as SignalRGB's own bundled effects do.
    //
    // The step is a nominal thirtieth of a second because there is no way to
    // ask how long a frame really took without reading a wall clock, which is
    // forbidden here. That is an accepted trade with a known worst case: a
    // host that both ticks animation frames at 60Hz AND hands over a timestamp
    // that never moves would play this at twice speed -- and, since render()
    // is then called once per real animation frame, at twice the compute cost
    // of the intended 30fps too, not only twice the apparent tempo. Frozen is
    // fatal and twice speed is not, and the pump below runs at exactly this
    // rate, so the one case that matters -- no animation frames at all -- is
    // exact.
    if (usable(stamp)) {
      previousStamp = stamp;
      drawnStamp = stamp;
    } else {
      // No timestamp means this is the interval fallback (see the pump
      // below), which just added a nominal step to seconds on the strength
      // of no clock at all. Leaving previousStamp at its old value would let
      // the next REAL frame compute its delta from before this fallback
      // tick -- double-counting the wall-clock gap a NOMINAL_STEP already
      // covered, so every dropped host frame would add an extra ~33ms of
      // drift on exactly the stalling host this fallback targets. Clearing
      // it instead sends that next real frame through this same branch
      // (usable(stamp) true, previousStamp null fails the delta check above)
      // so it also costs exactly one nominal step and re-anchors
      // previousStamp for the frame after that. drawnStamp is deliberately
      // left alone -- tooSoon()'s 30fps gate must keep comparing against the
      // last frame actually drawn, not get reset by a fallback tick that drew
      // one too.
      previousStamp = null;
    }
    seconds += NOMINAL_STEP;
  }

  /** One frame, from whichever way in reached it. */
  function step(stamp) {
    if (!assets) return;
    if (tooSoon(stamp)) return;
    advance(stamp);
    var doc = SF.applyControls(base, readControls());
    renderer.render(ctx, doc, assets, seconds);
  }

  function update(stamp) {
    if (typeof window.requestAnimationFrame === 'function') window.requestAnimationFrame(update);
    ticks += 1;
    step(stamp);
  }

  // The second way in. setInterval keeps running where requestAnimationFrame
  // has stopped (measured in this project's own harness), so a timer that only
  // draws when no animation frame has arrived since it last looked keeps a
  // stalled effect alive without drawing a single extra frame while the loop
  // is healthy.
  if (typeof setInterval === 'function') {
    var seenTicks = -1;
    setInterval(function () {
      if (ticks === seenTicks) step(undefined);
      seenTicks = ticks;
    }, FRAME_GAP);
  }

  if (typeof window.requestAnimationFrame === 'function') window.requestAnimationFrame(update);`;
}

/**
 * Build a standalone SignalRGB effect file.
 *
 * engineSource is the bundled engine (dist/engine.bundle.js). The very same
 * bundle drives the preview, which is what makes the preview trustworthy.
 */
export function buildEffectHtml({ doc: rawDoc, engineSource, lang = 'en' }) {
  const { doc } = normalizeDocument(rawDoc);

  // normalizeDocument only *records* an invalid control.property as an advisory
  // problem — it doesn't reject it, because it's a general-purpose sanitizer also
  // used for previews, where a stray property name is merely unfortunate. Here it
  // is fatal: control.property is spliced unescaped into the bootstrap script below
  // (`(typeof ${c.property} !== 'undefined') ? ...`), and an invalid identifier
  // turns that into a SyntaxError that kills the whole bootstrap — asset loading,
  // the render loop, everything, with no debugger attached to the host to see it.
  // So we surface exactly this one category of problem as a hard build error,
  // using document.js's exported isValidIdentifier() — the same predicate
  // normalizeDocument used to decide this — instead of parsing its problems[]
  // wording. Every other problem it records (duplicate layer ids renamed, unknown
  // blend/fit/motion/type substituted with a safe default) is something it already
  // recovered from, so we deliberately leave those as non-fatal and don't surface
  // them.
  const badControl = doc.controls.find((control) => !isValidIdentifier(control.property));
  if (badControl) {
    throw new Error(`Cannot build effect: control "${badControl.property}" is not a valid javascript identifier.`);
  }

  if (/<\/script/i.test(engineSource)) {
    throw new Error('engineSource contains a literal "</script", which would truncate the '
      + 'embedded <script> block. HTML-escaping is not an option here since this is live '
      + 'JavaScript, not JSON, so the build must fail loudly instead of shipping a truncated effect.');
  }

  const metas = doc.controls.map((control) => controlMeta(control, lang)).join('\n');

  return `<head>
  <title>${attribute(doc.name)}</title>
  <meta description="${attribute(doc.description)}" />
  <meta publisher="${attribute(doc.publisher)}" />
${metas}
</head>

<body style="margin: 0; padding: 0; background: #000">
  <canvas id="exCanvas" width="${CANVAS_WIDTH}" height="${CANVAS_HEIGHT}"></canvas>
</body>

<script id="${DOCUMENT_SCRIPT_ID}" type="application/json">${jsonBlock(doc)}</script>
<script>${engineSource}</script>
<script>${bootstrap(doc.controls)}
</script>
`;
}
