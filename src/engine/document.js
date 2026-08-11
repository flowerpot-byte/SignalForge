// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later

/** The canvas SignalRGB samples. Never hardcode these numbers elsewhere. */
export const CANVAS_WIDTH = 320;
export const CANVAS_HEIGHT = 200;

/**
 * The shape number every normalized document carries.
 *
 * It was written straight into normalizeDocument's output and nowhere else,
 * which was enough while nothing ever READ it back. Something does now: an
 * exported effect carries its normalized document inside itself, and the app
 * can open one again (src/main/effect-document.js) — so "was this made by a
 * SignalForge that knew more than this one does" is a question that has to be
 * answerable against a number rather than against a comment. Bump it only when
 * an older SignalForge could no longer make sense of a newer document; every
 * field normalizeDocument can already fill in, clamp or substitute is NOT a
 * change to this number, because such a document opens and says what it
 * corrected.
 */
export const DOCUMENT_VERSION = 1;

/** Document blend name -> canvas globalCompositeOperation. */
export const BLEND_MODES = Object.freeze({
  normal: 'source-over',
  add: 'lighter',
  multiply: 'multiply',
  screen: 'screen',
  lighten: 'lighten'
});

export const FIT_MODES = Object.freeze(['cover', 'stretch', 'contain']);

/**
 * Every motion the document accepts. Which of them a given layer type is
 * OFFERED is a narrower question — see motionKindsFor below.
 *
 * Appended to rather than reordered: an effect exported before "spin" and
 * "pulse" existed carries its own Motion combobox with the first four values
 * baked into it, and the order here is the order that dropdown is built in.
 * Keeping the old four where they were means a person's list does not
 * reshuffle itself under them when they update.
 */
export const MOTION_KINDS = Object.freeze(['none', 'warp', 'drift', 'breathe', 'spin', 'pulse']);
export const CONTROL_TYPES = Object.freeze(['number', 'boolean', 'color', 'combobox']);

/**
 * The two ways a gradient can be laid out.
 *
 * Deliberately a FIELD of one `gradient` layer type rather than two layer
 * types ("gradient" and "radial"). Three reasons, in the order they decided
 * it:
 *
 *  1. The plan this project is built from already says so: docs/entwurf-
 *     2026-08-09.md, section 5, lists one type "gradient" whose settings are
 *     "linear oder radial, Farbstopps, Winkel". Splitting it would be
 *     inventing a second design without a reason to.
 *  2. Everything else about the two is identical — the same stops, the same
 *     angle field, the same motions, the same controls. Two types would mean
 *     two copies of the stop handling in normalizeLayer, two entries in the
 *     settings column and two branches in effectControls, all to express one
 *     word.
 *  3. It is the only shape that lets SignalRGB's own UI switch between them.
 *     A layer type is baked into the exported file and cannot be changed from
 *     a control; a field can, so the finished effect gets a "Shape" dropdown
 *     for free (see src/export/effect-controls.js). Somebody who exported a
 *     linear gradient can try the radial one without going back to the app.
 */
export const GRADIENT_SHAPES = Object.freeze(['linear', 'radial', 'conic', 'stripes', 'waves']);

/**
 * The figures a `shape` layer can be.
 *
 * A FIELD of one `shape` layer type rather than four layer types, for exactly
 * the three reasons GRADIENT_SHAPES gives just above — and the third of them is
 * the one that decides it here too: a layer type is baked into the exported
 * file and cannot be changed from a control, a field can, so the finished
 * effect gets a "Figure" dropdown for free and somebody who exported a circle
 * can try the heart without coming back to the app.
 *
 * The order is the order the dropdown is built in, and it is smallest-idea
 * first: the circle is the figure everything else is a variation of (the ring
 * is a circle with its middle taken out, the star is a circle its outline
 * folds in and out of, the heart is the one that is none of those).
 *
 * The maths for the star and the heart is not invented here. Both come from
 * `Vibe`, the one effect in the 31 read for docs/effekt-inventur.md that draws
 * figures for their own sake (`cache\effects\-NyghEBs8-mYkxU6qRFv\effect.html`,
 * its drawStar and drawHeart) — see src/engine/layers/shape.js, which cites the
 * lines it takes and says what it changed and why.
 */
export const SHAPE_FIGURES = Object.freeze(['circle', 'ring', 'star', 'heart']);

/**
 * The four ways a `particles` layer can move.
 *
 * A FIELD of one `particles` layer type rather than four layer types, for the
 * same three reasons GRADIENT_SHAPES and SHAPE_FIGURES both give above, and
 * the third of them decides it here as well: the pattern is a dropdown in
 * SignalRGB's own panel, so somebody who exported rain can try snow without
 * coming back to the app.
 *
 * WHY THESE FOUR AND NOT SOME OTHER FOUR. docs/effekt-inventur.md, section A1,
 * counts at least 16 of the 31 effects read as particle systems and finds nine
 * of them to be one file recoloured. Reading what those files actually do, the
 * corpus moves particles in exactly these ways:
 *
 *   rain   `Poison`'s `Square`: y grows every frame, x wanders a little, and
 *          the drop is finished when it is past the bottom. The most common
 *          single movement in the corpus.
 *   rise   `Poison`'s `UpSquare`, the same file's other half: y SHRINKS every
 *          frame. `Poison` runs both at once, which is why the two are
 *          patterns of one layer type and not one pattern with a sign.
 *   drift  `Arctic`'s `Drop`: `this.x += speed / 50`, straight across, with a
 *          slow global sway. Sideways travel, not falling.
 *   snow   the look `Arctic` is named for, which its own maths only half
 *          delivers: a slow fall with a sideways sway. Its sway is global
 *          (`gDrop = Math.sin(gCount)`, one value for every flake at once);
 *          ours is per particle, because a hundred flakes swaying in lockstep
 *          is the one thing real snow never does.
 *
 * The order is the order the dropdown is built in, and it is commonest first.
 *
 * Everything a pattern MEANS — which way it travels, how fast, how much the
 * speeds and sizes vary, how far it sways and whether it grows as it goes —
 * is in PARTICLE_PATTERN_LOOKS in src/engine/layers/particles.js. Including the
 * direction, which is the one that had to move there: a direction that lived
 * here as a per-pattern DEFAULT for a field could be left behind when the
 * pattern changed, and was (see MAX_PARTICLE_TILT below).
 */
export const PARTICLE_PATTERNS = Object.freeze(['rain', 'rise', 'drift', 'snow']);

/**
 * How far off its own direction a swarm leans, in degrees.
 *
 * A LEAN AND NOT AN ABSOLUTE ANGLE, and that is the correction of a real
 * mistake rather than a preference. The first design gave a particle layer an
 * `angle` field like a gradient's — absolute, 0..360 — whose DEFAULT depended
 * on the pattern: 90 for rain, 270 for rise. It survived every unit test and
 * was caught by the walkthrough in test/harness/particle-shots.js, which
 * measured the angle after switching the pattern from the real dropdown and
 * recorded 90 for all four. The reason is obvious once seen: normalizeDocument
 * fills in a default only for a field that was never set, so a layer that had
 * been through it once already carried an angle, and choosing "rise" left it
 * falling. THE PATTERN'S NAME WAS A LIE, in the app and in SignalRGB's own
 * panel alike.
 *
 * Two ways out were weighed. Making the settings column write the new pattern's
 * angle whenever the pattern changed would fix the app and NOT the exported
 * effect — SignalRGB's controls write one value each and there is nowhere to
 * put such a rule — so the same lie would survive where nobody could see it
 * being told. Making the field a lean fixes both at once, with no rule
 * anywhere: each pattern carries its own direction (PARTICLE_PATTERN_LOOKS in
 * src/engine/layers/particles.js, beside everything else a pattern means), and
 * this field says how far off it to lean.
 *
 * So "rise" rises, always, whatever else is set; snow falls; drift goes
 * sideways. Nothing is lost by giving up the absolute angle, because the range
 * is the whole circle: a lean of 180 turns any pattern round completely, so
 * every direction is still reachable for every pattern. What is gained is that
 * one slider means one thing — "lean" — instead of meaning "direction, unless
 * you change the pattern, in which case it silently means the old pattern's
 * direction".
 *
 * SIGNED, so that leaning left and leaning right are a step either side of
 * nothing rather than 15 and 345. The same shape greenMagenta and blueYellow
 * already have. Zero is the default and it is the pattern's own direction
 * exactly, so a document that says nothing about the lean gets the pattern
 * undisturbed.
 */
export const MAX_PARTICLE_TILT = 180;
export const DEFAULT_PARTICLE_TILT = 0;

/**
 * How many particles there are.
 *
 * THE CEILING IS A MEASUREMENT AND NOT A TASTE — but the measurement did not
 * pick it, and saying which part of it is which is the whole of this note. It
 * was taken by rendering, in a real Chromium with hardware acceleration off
 * (the honest setting: SignalRGB runs effects in an offscreen view with
 * `is_accelerated: 0`), and reading the cost against the frame budget. The
 * table is in .superpowers/sdd/particles-report.md and is reproduced by
 * `npx electron test/harness/particle-cost.js`.
 *
 * The budget is the 15 % of one core the window's own cost readout warns at
 * (app/renderer/components/cost.js), which at 30 frames a second is 5 ms a
 * frame. What the sweep found is that the cost is very nearly a straight line
 * in the count, as it must be — one filled disc each:
 *
 *   at the DEFAULT size   1.04 microseconds a particle, so the budget is
 *                         reached at about 4800 of them
 *   at the LARGEST size   2.48 microseconds a particle, so the budget is
 *                         reached at about 2000 of them
 *
 * So the honest finding is that COST DOES NOT DECIDE THIS CEILING. 400 at the
 * largest size costs 1.01 ms, a fifth of the budget; the worst combination a
 * single layer can be asked for — 400 of them at the largest size, four
 * colours, a wake and a turning hue making applyFinish walk all 64000 pixels
 * on top — costs 1.13 ms, and 1.42 ms in a bad frame. That is 4.25 % of a core
 * against a line at 15 %.
 *
 * WHAT DID DECIDE IT, then, said plainly rather than dressed up as a
 * measurement:
 *
 *  1. HEADROOM FOR A HOST NOBODY HAS MEASURED. Everything above is this
 *     machine's Chromium. The effect runs in SignalRGB's Ultralight, a
 *     different browser on somebody else's computer, very likely while a game
 *     is running. 400 leaves 5x at the worst size and 12x at the default; a
 *     ceiling set where this machine's line falls would be a promise this
 *     project cannot keep.
 *  2. NOTHING IN THE CORPUS COMES CLOSE. `Poison` and its eight copies run 30
 *     objects of each of two kinds, and docs/effekt-inventur.md puts the
 *     corpus's whole range at 50 to 200. 400 is already twice the busiest thing
 *     anybody has been observed to want.
 *  3. THE CANVAS RUNS OUT BEFORE THE PROCESSOR DOES. 400 particles at the
 *     default size cover about a fifth of a 320 x 200 canvas; past that a swarm
 *     stops reading as particles and starts reading as a texture, which is what
 *     the gradient layer is for.
 *
 * If any of those three ever changes — a measured host, a corpus effect that
 * wants more, a reason to fill the canvas — this number can move, and the
 * measurement above says it may move a long way before cost is the reason to
 * stop.
 *
 * The floor is 1 rather than 0 for the reason MIN_SHAPE_SIZE gives: zero
 * particles is not a setting, it is "not there", and the visibility switch is
 * what says that.
 */
export const MIN_PARTICLE_COUNT = 1;
export const MAX_PARTICLE_COUNT = 400;
export const DEFAULT_PARTICLE_COUNT = 80;

/**
 * How big one particle is, as a percent of the CANVAS HEIGHT.
 *
 * The same sentence `size` means on a shape layer (see MIN_SHAPE_SIZE): it is
 * the DIAMETER of the particle, as a percent of the canvas's height. One word
 * meaning one thing across two layer types is worth more than a scale tuned to
 * each, and it means somebody who has learned what "size 50" does to a circle
 * already knows what it would do to a particle.
 *
 * The ceiling is 25 and not 200. A shape layer's figure is the picture, so it
 * is allowed to be larger than the canvas; a particle is one of up to four
 * hundred, and at 25 (a diameter of half the canvas height) eighty of them
 * already cover the frame several times over. Above that the layer stops being
 * particles and becomes a slowly churning field of overlapping discs, which is
 * a thing the gradient layer does better.
 *
 * The default is 3 — a diameter of six canvas pixels. Small, because the point
 * of this layer is many of them, and because SignalRGB samples this canvas down
 * to a few dozen LEDs: what reads on the hardware is where the light IS, not
 * how big each dot was.
 */
export const MIN_PARTICLE_SIZE = 1;
export const MAX_PARTICLE_SIZE = 25;
export const DEFAULT_PARTICLE_SIZE = 3;

/**
 * How fast the particles travel, 0..100, on the shared tempo curve.
 *
 * A FIELD OF THE LAYER AND NOT A MOTION ENTRY, which is the one structural
 * decision this layer type makes that none of the other four had to. Every
 * other layer in this engine is a still picture that a motion may or may not be
 * added to: a gradient with no motion is a perfectly good gradient. A particle
 * layer with no motion is not a particle layer at all — it is a scatter of
 * dots. The travel IS the layer, so it is a field of it, and `motions` keeps
 * meaning exactly what it means everywhere else: something done to a layer on
 * top of what the layer already is.
 *
 * It goes through speedToRate (src/engine/motion/speed.js) like every other
 * tempo in this app, so the slider feels the same here as it does on a drift,
 * and the two ends of it mean the same kind of thing.
 *
 * The default is 30 rather than the 15 every motion defaults to, and the
 * difference is the point above restated: a motion at 15 is a slow motion added
 * to a picture that is already there, while a particle layer at 15 is a picture
 * that has not arrived yet. At 30 (rate 0.72, from the table in speed.js) rain
 * crosses the canvas in about two seconds, which is rain.
 */
export const DEFAULT_PARTICLE_SPEED = 30;

/**
 * Which scatter it is, 0..99.
 *
 * The one field in this whole document that is not a quality of the picture. It
 * does not make the effect faster, bigger or a different colour: it hands back
 * a DIFFERENT ARRANGEMENT of the same effect, so that somebody who likes
 * everything about their rain except where the drops happen to be can have
 * another go without changing anything they chose.
 *
 * That is the field that makes seeded noise worth having rather than merely
 * necessary. `Math.random` gives a new arrangement every time the effect
 * starts and no way back to the one that looked right; this gives a hundred of
 * them, each reachable again for ever, in the preview and in the exported file
 * alike.
 *
 * WHY A HUNDRED AND NOT TEN THOUSAND, WHICH WAS THE FIRST ANSWER. The hash
 * behind this accepts any 32-bit number and every one of them gives an
 * unrelated arrangement, so the ceiling is a decision about the CONTROL rather
 * than about the arithmetic — and the control is a slider with no text field
 * beside it (app/renderer/components/field.js builds every number as an
 * `<input type="range">`). At 9999 a slider a few hundred pixels wide moves
 * thirty seeds per pixel: it cannot be aimed, arrow-keying from one end to the
 * other takes ten thousand presses, and the readout beside it is a number
 * nobody can form an opinion about. At 99 one press of an arrow key is one new
 * arrangement, which is exactly the gesture this field exists for — the slider
 * IS the reroll button, instead of needing one built beside it.
 *
 * A hundred unrelated arrangements is far more than anybody auditions. Nothing
 * is lost by the smaller range because there is no order to these: seed 7 is
 * not "between" seed 6 and seed 8 in any sense, so having fewer of them is
 * having fewer things to try, not a coarser version of anything.
 *
 * Whole numbers only: a seed of 3.7 is the seed 4 with a false suggestion that
 * there is something between them.
 *
 * The default is fixed at 0, which is what "reproducible" means here: a fresh
 * document, opened on two machines a year apart, is the same picture. Zero is
 * safe to default to only because the hash salts it — see SEED_SALT in
 * src/engine/hash.js, where mix32's one fixed point is dealt with.
 */
export const MIN_PARTICLE_SEED = 0;
export const MAX_PARTICLE_SEED = 99;
export const DEFAULT_PARTICLE_SEED = 0;

/**
 * How big the figure is, as a percent of the CANVAS HEIGHT.
 *
 * One number for four figures, and what it names is the same thing in all four:
 * the diameter of the circle the figure is drawn inside. The circle IS that
 * circle; the ring's outer edge is; the star's points touch it; the heart is as
 * wide as it and centred in it. So "size 100" always means "as big across as
 * the canvas is high", whichever figure is chosen — which is what lets the
 * figure be switched from SignalRGB's own panel without the size meaning
 * something different afterwards.
 *
 * The ceiling is 200 and not 100 because 100 is not the largest useful value:
 * a circle of the canvas's own height still leaves all four corners black, and
 * covering the canvas outright needs 189 (the diagonal, 377, over the height,
 * 200). Above that it is off the edge on every side, which is a real thing to
 * want — a wall of colour with a figure's edge just out of sight — so the range
 * is rounded up to 200 rather than cut at the exact number.
 *
 * The floor is 1 rather than 0 because zero is not a size, it is "not there",
 * and a layer that is not there is what the visibility switch is for.
 */
export const MIN_SHAPE_SIZE = 1;
export const MAX_SHAPE_SIZE = 200;
export const DEFAULT_SHAPE_SIZE = 50;

/**
 * How thick the ring's wall is, as a percent of its own outer radius.
 *
 * A percent of the radius rather than of the canvas, so that making a ring
 * bigger makes its wall thicker in proportion instead of turning it into a
 * hoop of wire. 100 means the wall reaches the middle, i.e. a filled disc —
 * the range runs continuously into the circle rather than stopping just short
 * of it, so there is no unreachable state between the two figures.
 *
 * Stored on every shape layer, not only on rings, for the reason `bands` is
 * stored on every gradient (see MIN_BANDS above): the figure can be switched
 * from SignalRGB's panel at any moment, and a field that only existed while
 * one figure was chosen would be a dead end the moment somebody switched to
 * the figure that needs it.
 */
export const MIN_SHAPE_THICKNESS = 1;
export const MAX_SHAPE_THICKNESS = 100;
export const DEFAULT_SHAPE_THICKNESS = 25;

/**
 * How many points the star has.
 *
 * Three is the fewest that is still a star rather than a line; twelve is where
 * a star stops reading as one on this canvas. At size 50 the outer radius is 50
 * canvas pixels, so twelve points put a spike every 26 pixels of circumference
 * — and SignalRGB then samples that down to a few dozen LEDs, where anything
 * finer is one colour. Five is `Vibe`'s own default and the shape everybody
 * pictures when they read the word.
 */
export const MIN_STAR_POINTS = 3;
export const MAX_STAR_POINTS = 12;
export const DEFAULT_STAR_POINTS = 5;

/**
 * How many times the ramp repeats across a shape that repeats.
 *
 * Live on three of the five shapes and dead on two, and that is a property of
 * the shapes rather than an oversight: "linear" and "radial" ARE one traversal
 * of the ramp by definition, so there is nothing for a repeat count to do
 * there. It is stored on every gradient all the same, for the same reason
 * `angle` is (see the note beside the angle control in
 * src/export/effect-controls.js): the shape can be switched from SignalRGB's
 * own panel at any moment, and a field that only exists while a particular
 * shape is chosen would be a dead end the moment somebody switched to one that
 * needs it.
 *
 * Whole repeats only. Half a band is not a thing the ramp can be built out of
 * — the generated colour stops step from one repeat to the next — and a
 * fractional count would put a truncated band against the canvas edge on one
 * side only, which reads as a rendering fault rather than as a setting.
 *
 * The ceiling is what the engine can still DRAW cleanly, not a taste: at 24
 * repeats of a four-colour ramp a stripes layer already generates 192 colour
 * stops per frame, and the bands are 13 canvas pixels wide before the LED
 * sampling ever gets to them.
 */
export const MIN_BANDS = 1;
export const MAX_BANDS = 24;
export const DEFAULT_BANDS = 6;

/**
 * Which motions a layer type can actually be seen to perform.
 *
 * A uniform field of one colour is invariant under both displacement motions:
 * drift slides it and warp bends it, and in both cases every pixel it moves
 * has exactly the colour of the pixel it replaced. So a solid layer offers
 * the two motions that work on opacity and nothing else — that is not a
 * limitation of the renderer, it is what "one colour everywhere" means. A
 * drift entry stored on a solid layer by hand is kept rather than dropped
 * (the data is the user's), it simply renders as nothing, exactly like a
 * "none" entry.
 *
 * SPIN IS THE SECOND MOTION THAT IS NOT OFFERED EVERYWHERE, AND WHY
 *
 * Spin turns the whole field about the middle of the canvas.
 *
 *  - On a solid colour it is invariant for exactly the reason drift is: every
 *    pixel it moves is replaced by a pixel of the same colour.
 *  - On a PICTURE it is not invariant — and it is still not offered. A
 *    320 x 200 rectangle turned about its centre only stays covered if the
 *    picture inside it is first zoomed until its shorter side spans the
 *    canvas diagonal: sqrt(320^2 + 200^2) / 200 = 1.885, so 1 - 1/1.885^2 =
 *    72 % of the chosen crop would have to be thrown away before the first
 *    frame, and everything the crop drag is for would be undone by turning
 *    the motion on. The alternative — letting it turn and showing the corners
 *    — puts black wedges over the LEDs four times a turn. Neither is a thing
 *    to offer; a picture that should rotate is a picture that should be
 *    rotated before it is imported.
 *  - On a gradient it is exactly right, because a gradient has no edges: it
 *    is painted across the whole canvas at whatever angle it is asked for, so
 *    turning it costs nothing and hides nothing.
 *
 * The two lists are therefore no longer "solid, and everything else".
 *
 * ===========================================================================
 * AND A THIRD ANSWER, WHICH IS THE FIRST ONE THAT DEPENDS ON A FIELD
 * ===========================================================================
 *
 * A `shape` layer needs both of the arguments above answered separately,
 * because two different things are true of it at once:
 *
 *  - WARP IS NOT OFFERED ON ANY FIGURE, and this one is not about taste. Warp
 *    is the only motion in this engine that goes through the half-resolution
 *    buffer (layers/warp-buffer.js), and drawWarped writes `out[o + 3] = 255`
 *    for every pixel of it — an opaque 320 x 200 rectangle, by construction.
 *    A shape layer's whole point is that it draws a figure on transparent
 *    ground: warping it would paint over every layer beneath it and hide its
 *    own trail, which is the opposite of what the motion is for. Making the
 *    buffer alpha-aware is a change to a file the picture and gradient layers
 *    both render through and both have parity tests over; it is a real piece
 *    of work and not this one.
 *  - SPIN DEPENDS ON WHICH FIGURE IT IS. On a shape layer spin turns the
 *    figure about ITS OWN centre (see layers/shape.js — that is where the
 *    pivot differs from the gradient's), so a figure that is symmetric under
 *    rotation about that centre cannot be seen to spin at all. A circle is
 *    symmetric under every angle and a ring is too; a star has five-fold
 *    symmetry and a heart none, so both of those visibly turn. Offering spin
 *    on a circle would be exactly the fault the solid layer's note above
 *    describes: a control that provably cannot change a byte.
 *
 * That is why motionKindsFor takes a second argument. It is the smallest
 * honest step: every existing caller passes one argument and gets exactly what
 * it always got, and the one type whose answer genuinely varies within itself
 * is the one type that has to say which figure it is asking about. The
 * alternative — passing the whole layer — would have rewritten four call sites
 * to answer a question only one of them has.
 *
 * A shape layer whose figure is unknown or missing gets the SYMMETRIC list,
 * i.e. the narrower one. That matches what normalizeLayer does with an unknown
 * figure (it becomes a circle), so the offer and the document agree.
 */
export const SOLID_MOTION_KINDS = Object.freeze(['none', 'breathe', 'pulse']);
/**
 * A particle layer offers the two opacity motions and nothing else — the same
 * list a solid colour gets, arrived at from the opposite direction and for
 * completely different reasons. The coincidence is written down here so that
 * nobody later "tidies" the two into one constant: a change to what a flat
 * colour can be seen to do has nothing to say about what a swarm can.
 *
 * DRIFT IS NOT OFFERED, and this one is measurable rather than aesthetic. Drift
 * displaces a whole layer bodily by up to DRIFT_CENTRE_REACH of the canvas
 * (motion/drift.js). A particle layer covers the canvas by CONSTRUCTION: every
 * particle's spawn position is drawn once, from the hash, across a span that is
 * exactly the canvas plus a margin, and nothing refills a gap because there is
 * no respawn logic to do it with (see src/engine/layers/particles.js). Sliding
 * that span bodily would push its covered area off one edge and leave a widening
 * empty band at the other — not a moving swarm, a swarm with a hole beside it.
 * The layer already has a field for "which way do they go", and it is `angle`.
 *
 * SPIN IS NOT OFFERED for the same reason, one dimension up: turning the span
 * about the middle of the canvas sweeps its corners off the canvas and brings
 * empty corners in. It would also fight the field that already says which way
 * the particles travel.
 *
 * WARP IS NOT OFFERED for the reason it is offered on no figure either:
 * drawWarped (layers/warp-buffer.js) writes an alpha of 255 into every pixel by
 * construction, so a warped particle layer would be an opaque 320 x 200
 * rectangle — covering every layer beneath it and its own wake with them, which
 * is the one thing this layer type exists not to do.
 *
 * BREATHE AND PULSE ARE OFFERED because they work on ctx.globalAlpha, which
 * needs to know nothing whatsoever about what is being drawn. A swarm that
 * swells and fades is a swarm.
 */
export const PARTICLE_MOTION_KINDS = Object.freeze(['none', 'breathe', 'pulse']);
export const IMAGE_MOTION_KINDS = Object.freeze(['none', 'warp', 'drift', 'breathe', 'pulse']);
export const GRADIENT_MOTION_KINDS = MOTION_KINDS;
export const SHAPE_MOTION_KINDS = Object.freeze(['none', 'drift', 'breathe', 'pulse']);
export const SPINNING_SHAPE_MOTION_KINDS = Object.freeze([
  'none', 'drift', 'breathe', 'spin', 'pulse'
]);

/** The figures a spin can actually be seen on: the ones with no rotational symmetry. */
export const SPINNABLE_FIGURES = Object.freeze(['star', 'heart']);

/**
 * The motion kinds worth offering for a layer of this type.
 *
 * `figure` is read for one type only — see the long note above.
 */
export function motionKindsFor(type, figure) {
  if (type === 'solid') return SOLID_MOTION_KINDS;
  if (type === 'image') return IMAGE_MOTION_KINDS;
  if (type === 'particles') return PARTICLE_MOTION_KINDS;
  if (type === 'shape') {
    return SPINNABLE_FIGURES.includes(figure) ? SPINNING_SHAPE_MOTION_KINDS : SHAPE_MOTION_KINDS;
  }
  return GRADIENT_MOTION_KINDS;
}

/** Fewest and most colour stops a gradient may carry. */
export const MIN_GRADIENT_STOPS = 2;
export const MAX_GRADIENT_STOPS = 4;

/**
 * What a colour layer starts out as.
 *
 * These live here, in the engine's document module, and NOT in the app's
 * tokens.css — which is where every colour the WINDOW paints itself with has
 * to live (test/app/color-literals.test.js). The two rules do not collide,
 * because these are not the window's palette: they are the opening value of a
 * field in the user's own document, the same kind of thing as `brightness:
 * 100`. The window never writes a colour of its own; it starts a solid or a
 * gradient layer by naming the type alone and lets normalizeDocument fill
 * these in, then shows and edits whatever the document says. That is why the
 * colour guard still passes honestly rather than by an exemption.
 *
 * ONE COINCIDENCE, WRITTEN DOWN
 *
 * DEFAULT_SOLID_COLOR is the same value as `--accent` in
 * app/renderer/styles/tokens.css. That is not an accident and it is load
 * bearing: the "Farbfläche" tile in the starting gallery draws its preview
 * swatch from the accent, so the tile is an honest picture of what pressing it
 * produces only for as long as the two agree. They are deliberately different
 * kinds of thing and must not import each other, so what enforces it is a test
 * standing between them: test/app/accent-default-colour.test.js reads --accent
 * out of the stylesheet and compares it with this constant. Retune one and the
 * build asks for the other. The same note stands beside --accent over there.
 */
export const DEFAULT_SOLID_COLOR = '#ff0066';
export const DEFAULT_GRADIENT_STOPS = Object.freeze([
  Object.freeze({ at: 0, color: '#ff0066' }),
  Object.freeze({ at: 100, color: '#00b3ff' })
]);

/**
 * Top-level document fields a control's `bind` array may address directly,
 * i.e. a bind entry with no dot (see `resolveBindingPath` in bind.js, which
 * is the only place that reads this list). This is an allowlist, not a
 * shape check: `brightness` is listed because it is meant to be
 * controllable from an exported effect's UI. `layers`, `controls`,
 * `assets` and `version` are deliberately NOT listed even though they are
 * also own properties of a normalized document — a control silently
 * overwriting one of those wholesale with a raw number would corrupt the
 * render loop. Anything not in this list resolves to nothing, exactly like
 * an unknown layer id, instead of falling through to a generic "is this an
 * own property" check.
 */
export const BINDABLE_DOCUMENT_FIELDS = Object.freeze([
  'brightness',
  'saturation',
  'greenMagenta',
  'blueYellow',
  'hueShift',
  'hueCycle',
  'trail'
]);

/**
 * How far round the colour wheel the whole document is turned, and how fast it
 * keeps turning. See src/engine/motion/hue.js for why this is two fields.
 *
 * The angle is CLAMPED rather than wrapped, the same decision a gradient's
 * `angle` already made and for the same reason: the control is a slider with
 * two ends, and a document that says 400 is more likely to be a mistake than an
 * intent to mean 40. (The renderer wraps whatever it is finally handed, because
 * the cycle adds to it and would otherwise walk off the end of the slider's
 * range within seconds.)
 */
export const MAX_HUE_SHIFT = 360;

/**
 * How much of the previous frame survives into this one, 0..100.
 *
 * 0 is the hard clear this engine has always done and is the default, so every
 * document written before this field renders byte for byte as it did. Above 0
 * the frame is veiled instead of cleared and the picture leaves a wake — which
 * is what docs/effekt-inventur.md, section A2, found in at least eight of the
 * 31 effects read, and what `Radar` alone among them puts on a control of its
 * own (also called "trail").
 *
 * The ceiling is 100 because that is what a percentage is; what 100 MEANS in
 * veil terms is the engine's business, and the two ends of it were measured
 * rather than picked — see trailAlpha in src/engine/engine.js.
 */
export const MAX_TRAIL = 100;

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const ASCII_PRINTABLE = /^[\x20-\x7E]*$/;

/**
 * Whether a string is a usable JavaScript identifier — the rule that decides
 * whether a control's `property` can be spliced into generated code. This is
 * the single definition of that rule; callers must use it directly instead
 * of re-deriving or string-matching it.
 */
export function isValidIdentifier(value) {
  return IDENTIFIER.test(value);
}

export function clamp(value, lo, hi) {
  return value < lo ? lo : value > hi ? hi : value;
}

function num(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function str(value, fallback) {
  return typeof value === 'string' ? value : fallback;
}

const HEX_LONG = /^#?([0-9a-f]{6})$/i;
const HEX_SHORT = /^#?([0-9a-f]{3})$/i;
const RGB_CALL = /^rgba?\(\s*(-?[0-9.]+)\s*,\s*(-?[0-9.]+)\s*,\s*(-?[0-9.]+)\s*(?:,\s*-?[0-9.]+\s*)?\)$/i;

const hex2 = (value) => clamp(Math.round(value), 0, 255).toString(16).padStart(2, '0');

/**
 * Turn whatever a colour arrived as into "#rrggbb", or hand back the fallback.
 *
 * Deliberately generous about the input and strict about the output, and both
 * halves matter:
 *
 *  - Generous, because this string does not only come from a project file this
 *    app wrote. It also comes from a SignalRGB colour control at runtime (see
 *    applyControls in bind.js, which writes a control's raw value straight
 *    into the layer), and what exactly SignalRGB hands a `type="color"`
 *    control is UNVERIFIED — docs/erkenntnisse-signalrgb-motor.md records
 *    nothing about it, because this project has never shipped one before.
 *    "#RRGGBB", "RRGGBB", "#RGB" and "rgb(r, g, b)" are all accepted, so the
 *    likely shapes all work rather than one of them going silently black.
 *  - Strict, because the alternative is worse than a wrong colour. Assigning
 *    an unparseable string to ctx.fillStyle is a no-op: the canvas keeps
 *    whatever fill it had, so a junk value would paint the PREVIOUS layer's
 *    colour and look like a rendering bug rather than a bad value.
 */
export function normalizeColor(value, fallback = DEFAULT_SOLID_COLOR) {
  const text = typeof value === 'string' ? value.trim() : '';
  const long = HEX_LONG.exec(text);
  if (long) return `#${long[1].toLowerCase()}`;
  const short = HEX_SHORT.exec(text);
  if (short) {
    const [r, g, b] = short[1].toLowerCase();
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  const call = RGB_CALL.exec(text);
  if (call) {
    const parts = [call[1], call[2], call[3]].map(Number);
    if (parts.every(Number.isFinite)) return `#${parts.map(hex2).join('')}`;
  }
  return fallback;
}

/**
 * One motion entry, with its own speed and amount. "none" is kept as an
 * ordinary, inert entry rather than special-cased away: it is a real member
 * of MOTION_KINDS (it is the motion combobox's own default value), and
 * render()'s per-kind lookups (layers/image.js) already ignore any entry
 * whose kind isn't "drift", "warp" or "breathe" -- a stored "none" entry
 * renders exactly like an empty list, no special-casing required. Dropping
 * it used to be tempting because an empty list already means "no motion",
 * but that shortcut is also what forced sfexport.js to bake a fake "warp"
 * placeholder for `--motion none` (see buildImageDocument there): a dropped
 * entry leaves nothing for the motion/tempo/strength controls' bind paths to
 * write into. Keeping "none" gives those bindings a real, honest target.
 */
function normalizeMotion(raw, layerId, index, problems) {
  const input = raw && typeof raw === 'object' ? raw : {};
  const kind = str(input.kind, 'none');
  if (!MOTION_KINDS.includes(kind)) {
    problems.push(`Layer "${layerId}": unknown motion "${kind}" at position ${index}, dropped.`);
    return null;
  }
  return {
    kind,
    speed: clamp(num(input.speed, 15), 0, 100),
    amount: clamp(num(input.amount, 30), 0, 100)
  };
}

/**
 * Read the motion list. Accepts the old singular `motion` field so documents
 * and effects exported before this change still load.
 *
 * render() (layers/image.js) picks the first entry matching a given kind via
 * `motions.find(...)`, so two entries of the same kind would otherwise render
 * according to array order -- a "depends on how the user sorted the list"
 * surprise. Resolved here, once, explicitly: the first occurrence of a kind
 * wins and every later one is dropped and reported, the same recovery style
 * as an unknown kind above.
 */
function normalizeMotions(input, layerId, problems) {
  const hasList = Array.isArray(input.motions);
  const hasSingle = input.motion && typeof input.motion === 'object';
  if (hasList && hasSingle) {
    problems.push(`Layer "${layerId}": both motion and motions given, using motions.`);
  }
  const source = hasList ? input.motions : (hasSingle ? [input.motion] : []);

  const seenKinds = new Set();
  const result = [];
  source.forEach((entry, index) => {
    const motion = normalizeMotion(entry, layerId, index, problems);
    if (motion === null) return;
    if (seenKinds.has(motion.kind)) {
      problems.push(`Layer "${layerId}": duplicate motion "${motion.kind}" at position ${index}, `
        + 'dropped -- the first one wins.');
      return;
    }
    seenKinds.add(motion.kind);
    result.push(motion);
  });
  return result;
}

/**
 * The colour stops of a gradient, as a list of `{ at, color }`.
 *
 * `at` is a WHOLE PERCENT, 0..100, not the 0..1 the canvas API wants. Every
 * other number a person can set in this app is a percent with a step of 1
 * (speed, strength, brightness, saturation), and a stop position is the same
 * kind of thing; the division by 100 belongs in the one place that paints
 * (src/engine/layers/gradient.js), not in every slider and every control range.
 *
 * Recovery rather than refusal, in the same spirit as the rest of this file:
 * a list that is too long is cut and reported, one that is too short is filled
 * up from DEFAULT_GRADIENT_STOPS, a stop with no usable position is spaced
 * evenly, and a stop with no usable colour takes the default rather than
 * making the whole layer disappear. The list is NOT sorted here — the indices
 * are what the settings column's cards and the exported effect's `color1` /
 * `color2` controls address, so re-ordering them behind the user's back would
 * move a control onto a different stop. Sorting is a painting concern and
 * happens there.
 */
function normalizeStops(raw, layerId, problems) {
  const input = Array.isArray(raw) ? raw : [];
  if (input.length > MAX_GRADIENT_STOPS) {
    problems.push(`Layer "${layerId}": ${input.length} colour stops given, `
      + `only the first ${MAX_GRADIENT_STOPS} are kept.`);
  }
  const kept = input.slice(0, MAX_GRADIENT_STOPS);
  const count = Math.max(kept.length, MIN_GRADIENT_STOPS);

  const stops = [];
  for (let index = 0; index < count; index += 1) {
    const entry = kept[index] && typeof kept[index] === 'object' ? kept[index] : {};
    const fallback = DEFAULT_GRADIENT_STOPS[Math.min(index, DEFAULT_GRADIENT_STOPS.length - 1)];
    const evenly = (index / (count - 1)) * 100;
    stops.push({
      at: clamp(num(entry.at, index < kept.length ? evenly : fallback.at), 0, 100),
      color: normalizeColor(entry.color, fallback.color)
    });
  }
  if (input.length > 0 && input.length < MIN_GRADIENT_STOPS) {
    problems.push(`Layer "${layerId}": a gradient needs at least ${MIN_GRADIENT_STOPS} colour stops, `
      + 'the missing one was filled in.');
  }
  return stops;
}

/**
 * The colour a gradient already shows at a given position along it.
 *
 * Built for exactly one gesture: adding a new stop should not change how the
 * gradient looks, so the new stop needs to start out as the colour that was
 * already there rather than a fresh default (see createStops in
 * app/renderer/components/field.js, the only caller). It lives here and not
 * in the renderer for the same reason normalizeColor and normalizeStops do:
 * blending two stop colours is arithmetic on the document's own gradient
 * maths, and the renderer is not allowed to know a colour of its own — every
 * colour a stop can start out as has to come from the document
 * (test/app/color-literals.test.js), which this function reads instead of
 * restating.
 *
 * It is deliberately NOT folded into normalizeStops. normalizeStops answers a
 * different question -- "what should a stop with no usable colour become",
 * for a document that arrived that way (an old file, a hand-edited one) --
 * and its answer, the neighbouring DEFAULT_GRADIENT_STOPS colour, must stay
 * exactly what it always was; see the "document from before" compatibility
 * test in colour-layers-document.test.js. This function answers a narrower
 * question for a caller that already knows exactly which two real,
 * already-normalized stops the new position falls between.
 *
 * MATCHES CANVASGRADIENT, ON PURPOSE. `addColorStop` blends between two
 * fully-opaque stops with a plain per-channel interpolation of the sRGB
 * bytes -- no gamma correction, no other colour space -- because that is
 * what every stop here already is: an opaque "#rrggbb". Reaching for a
 * "nicer" perceptual blend (e.g. interpolating in linear light or in
 * Lab/OkLab) would produce a midpoint the canvas itself would never paint,
 * which is the opposite of "unchanged": the new stop would sit on the ramp
 * showing a colour neither neighbour drew before it was added. Matching is
 * confirmed by rendering, not assumed -- see 'adding a stop changes no
 * pixel' in test/engine/colour-layers-render.test.js, which renders the
 * default two-stop gradient, adds a third stop with this function's colour,
 * renders again, and requires the two frames to be identical.
 *
 * `at` at or beyond either end returns that end's own colour, the same
 * clamping `addColorStop` applies to an offset outside 0..1 -- relevant only
 * if a future caller ever asks for a position outside the existing stops;
 * nextStopPosition (field.js) never does, since it only ever returns the
 * midpoint of two real neighbouring stops. Two stops at the same position
 * make a hard step with nothing to interpolate; asking for the colour
 * exactly there returns the earlier one in sorted order -- an arbitrary but
 * deterministic choice, not a wrong one, since the true answer depends on
 * which side of the step you approach from.
 */
export function colorAtPosition(stops, at) {
  const usable = (Array.isArray(stops) ? stops : [])
    .filter((stop) => stop && Number.isFinite(Number(stop.at)))
    .map((stop) => ({ at: Number(stop.at), color: normalizeColor(stop.color) }))
    .sort((a, b) => a.at - b.at);

  if (usable.length === 0) return DEFAULT_SOLID_COLOR;
  if (usable.length === 1 || at <= usable[0].at) return usable[0].color;
  const last = usable[usable.length - 1];
  if (at >= last.at) return last.color;

  let lower = usable[0];
  let upper = last;
  for (let index = 1; index < usable.length; index += 1) {
    if (usable[index].at >= at) {
      lower = usable[index - 1];
      upper = usable[index];
      break;
    }
  }

  if (upper.at === lower.at) return lower.color;
  const fraction = (at - lower.at) / (upper.at - lower.at);
  const from = hexToRgb(lower.color);
  const to = hexToRgb(upper.color);
  return `#${hex2(from.r + (to.r - from.r) * fraction)}`
    + `${hex2(from.g + (to.g - from.g) * fraction)}`
    + `${hex2(from.b + (to.b - from.b) * fraction)}`;
}

/** Split an already-normalized "#rrggbb" back into its three byte values. */
function hexToRgb(color) {
  return {
    r: parseInt(color.slice(1, 3), 16),
    g: parseInt(color.slice(3, 5), 16),
    b: parseInt(color.slice(5, 7), 16)
  };
}

function normalizeLayer(raw, index, usedIds, problems) {
  const input = raw && typeof raw === 'object' ? raw : {};
  let id = str(input.id, '').trim() || `layer-${index}`;
  if (usedIds.has(id)) {
    problems.push(`Layer ${index}: duplicate id "${id}", renamed.`);
    let n = 2;
    while (usedIds.has(`${id}-${n}`)) n += 1;
    id = `${id}-${n}`;
  }
  usedIds.add(id);

  const type = str(input.type, 'unknown');

  let blend = str(input.blend, 'normal');
  if (!Object.prototype.hasOwnProperty.call(BLEND_MODES, blend)) {
    problems.push(`Layer "${id}": unknown blend "${blend}", using "normal".`);
    blend = 'normal';
  }

  const base = {
    id,
    type,
    name: str(input.name, id),
    visible: input.visible !== false,
    opacity: clamp(num(input.opacity, 1), 0, 1),
    blend
  };

  // Two layer types that own no asset at all. They are answered before the
  // image branch, and they answer it fully: a solid or a gradient has no
  // `asset`, no `fit` and no `offset`, because it has no picture to place —
  // handing it those fields would be handing the settings column and the crop
  // drag something to steer that does not exist. What they DO share with an
  // image layer is `motions`, so the whole motion machinery (the list, the
  // add/remove buttons, the exported motion/tempo/strength controls, the
  // "first entry of a kind wins" rule) applies to them unchanged.
  if (type === 'solid') {
    return {
      ...base,
      color: normalizeColor(input.color, DEFAULT_SOLID_COLOR),
      motions: normalizeMotions(input, id, problems)
    };
  }

  // One figure on transparent ground. Like the two above it owns no asset, and
  // unlike either of them it does not cover the canvas — which is the whole
  // reason it exists (docs/effekt-inventur.md, C4) and also what finally makes
  // the trail visible on something other than a half-transparent layer.
  //
  // EVERY field is stored and clamped whatever the figure is, including the two
  // that only one figure reads. That is the same decision `angle` and `bands`
  // already made on a gradient and it is made here for the same reason: the
  // Figure dropdown is in SignalRGB's own panel, so a thickness that only
  // existed while "ring" was chosen would leave somebody who switched to the
  // ring with no way to set the one thing a ring is about.
  if (type === 'shape') {
    let figure = str(input.figure, SHAPE_FIGURES[0]);
    if (!SHAPE_FIGURES.includes(figure)) {
      problems.push(`Layer "${id}": unknown figure "${figure}", using "${SHAPE_FIGURES[0]}".`);
      figure = SHAPE_FIGURES[0];
    }
    const positionInput = input.position && typeof input.position === 'object' ? input.position : {};
    return {
      ...base,
      figure,
      color: normalizeColor(input.color, DEFAULT_SOLID_COLOR),
      // Percent of the canvas height — see MIN_SHAPE_SIZE above.
      size: clamp(num(input.size, DEFAULT_SHAPE_SIZE), MIN_SHAPE_SIZE, MAX_SHAPE_SIZE),
      // Where the middle of the figure sits, as a percent of each edge, so 50/50
      // is the middle of the canvas. A percent rather than the image layer's
      // -1..1 offset because this is a POSITION and not a nudge away from one:
      // an image fills the canvas and is slid about inside it, a figure is put
      // somewhere.
      position: {
        x: clamp(num(positionInput.x, 50), 0, 100),
        y: clamp(num(positionInput.y, 50), 0, 100)
      },
      thickness: clamp(
        num(input.thickness, DEFAULT_SHAPE_THICKNESS), MIN_SHAPE_THICKNESS, MAX_SHAPE_THICKNESS
      ),
      // Whole points only, rounded rather than truncated so a document carrying
      // 5.7 lands on 6 instead of always downwards — the same rule `bands` uses.
      points: clamp(
        Math.round(num(input.points, DEFAULT_STAR_POINTS)), MIN_STAR_POINTS, MAX_STAR_POINTS
      ),
      motions: normalizeMotions(input, id, problems)
    };
  }

  // A swarm on transparent ground. Like the shape layer it owns no asset and
  // covers nothing — which is the whole reason docs/effekt-inventur.md puts it
  // first on the build list (C1) and calls the trail's real beneficiary (C2).
  //
  // It shares `stops` with the gradient rather than inventing a second way to
  // say "two to four colours", and that is a decision about the CORPUS as much
  // as about this codebase. Reading the nine effects that are one file
  // recoloured: `Poison`, `Calm Water`, `Crimson`, `Jade`, `Nuclear` and `Peach`
  // all keep `colors = [color1, color2, color3]` and give each particle one of
  // them by `this.ssi = Math.floor(a Math.random draw * colors.length)`. So the
  // commonest particle effect there is is THREE colours picked per particle,
  // not one — and `Arctic` and `Titanium`, which do use a single colour, are
  // reached from here by setting every stop to the same value. Two to four
  // covers both ends of what the corpus actually does.
  //
  // What a stop's `at` means here: nothing, and it is neither read nor offered
  // — exactly as it already is for the `stripes` gradient shape, which has the
  // same property that its colours have an order but no positions along
  // anything. The field is still stored and still normalized, because the same
  // normalizeStops does the work and because a layer whose type somebody
  // changes by hand must not lose data on the way through.
  if (type === 'particles') {
    let pattern = str(input.pattern, PARTICLE_PATTERNS[0]);
    if (!PARTICLE_PATTERNS.includes(pattern)) {
      problems.push(`Layer "${id}": unknown pattern "${pattern}", using "${PARTICLE_PATTERNS[0]}".`);
      pattern = PARTICLE_PATTERNS[0];
    }
    return {
      ...base,
      pattern,
      stops: normalizeStops(input.stops, id, problems),
      // Whole particles only, rounded rather than truncated — the same rule
      // `bands` and a star's `points` follow.
      count: clamp(
        Math.round(num(input.count, DEFAULT_PARTICLE_COUNT)),
        MIN_PARTICLE_COUNT, MAX_PARTICLE_COUNT
      ),
      // Percent of the canvas height, meaning the particle's DIAMETER — the
      // same sentence `size` means on a shape layer.
      size: clamp(num(input.size, DEFAULT_PARTICLE_SIZE), MIN_PARTICLE_SIZE, MAX_PARTICLE_SIZE),
      // How fast they travel, on the shared tempo curve. A field of the layer
      // and not a motion entry — see DEFAULT_PARTICLE_SPEED above for why that
      // is the one structural difference this layer type has from the other
      // four. 0 is inside the range on purpose, and it is not "stopped by
      // mistake": particles that do not travel are a still field of points,
      // which is precisely what `Starlight` in the corpus is (its points never
      // move at all, they only fade in and out).
      speed: clamp(num(input.speed, DEFAULT_PARTICLE_SPEED), 0, 100),
      // How far off the pattern's own direction they lean — NOT an absolute
      // angle. See MAX_PARTICLE_TILT above for the mistake that was, and why a
      // lean is the only shape of this field that keeps a pattern's name honest
      // in SignalRGB's panel as well as in ours.
      tilt: clamp(num(input.tilt, DEFAULT_PARTICLE_TILT), -MAX_PARTICLE_TILT, MAX_PARTICLE_TILT),
      // Which arrangement. Whole numbers only.
      seed: clamp(
        Math.round(num(input.seed, DEFAULT_PARTICLE_SEED)),
        MIN_PARTICLE_SEED, MAX_PARTICLE_SEED
      ),
      motions: normalizeMotions(input, id, problems)
    };
  }

  if (type === 'gradient') {
    let shape = str(input.shape, 'linear');
    if (!GRADIENT_SHAPES.includes(shape)) {
      problems.push(`Layer "${id}": unknown gradient shape "${shape}", using "linear".`);
      shape = 'linear';
    }
    return {
      ...base,
      shape,
      // Degrees, 0 = left to right, growing clockwise. Clamped rather than
      // wrapped: the control is a slider with two ends, and a document that
      // says 400 is more likely to be a mistake than an intent to mean 40.
      angle: clamp(num(input.angle, 0), 0, 360),
      // Whole repeats of the ramp — see MIN_BANDS above. Rounded rather than
      // truncated so that a document carrying 4.7 lands on the nearer whole
      // number instead of always downwards.
      bands: clamp(Math.round(num(input.bands, DEFAULT_BANDS)), MIN_BANDS, MAX_BANDS),
      stops: normalizeStops(input.stops, id, problems),
      motions: normalizeMotions(input, id, problems)
    };
  }

  if (type !== 'image') return base;

  let fit = str(input.fit, 'cover');
  if (!FIT_MODES.includes(fit)) {
    problems.push(`Layer "${id}": unknown fit "${fit}", using "cover".`);
    fit = 'cover';
  }

  const offsetInput = input.offset && typeof input.offset === 'object' ? input.offset : {};

  return {
    ...base,
    asset: str(input.asset, null),
    fit,
    offset: {
      x: clamp(num(offsetInput.x, 0), -1, 1),
      y: clamp(num(offsetInput.y, 0), -1, 1)
    },
    motions: normalizeMotions(input, id, problems)
  };
}

function normalizeControl(raw, index, problems) {
  const input = raw && typeof raw === 'object' ? raw : {};
  const property = str(input.property, '');
  if (!isValidIdentifier(property)) {
    problems.push(`Control ${index}: "${property}" is not a valid javascript identifier.`);
  }

  const labelInput = input.label && typeof input.label === 'object' ? input.label : {};
  const label = { de: str(labelInput.de, property), en: str(labelInput.en, property) };
  for (const lang of ['de', 'en']) {
    if (!ASCII_PRINTABLE.test(label[lang])) {
      problems.push(`Control "${property}": label (${lang}) must be ASCII only.`);
    }
  }

  let type = str(input.type, 'number');
  if (!CONTROL_TYPES.includes(type)) {
    problems.push(`Control "${property}": unknown type "${type}", using "number".`);
    type = 'number';
  }

  return {
    property,
    label,
    type,
    min: num(input.min, 0),
    max: num(input.max, 100),
    values: Array.isArray(input.values) ? input.values.map(String) : [],
    default: input.default ?? 0,
    bind: Array.isArray(input.bind) ? input.bind.filter((p) => typeof p === 'string') : []
  };
}

function normalizeAsset(raw) {
  const input = raw && typeof raw === 'object' ? raw : {};
  const asset = {
    kind: str(input.kind, 'image'),
    mime: str(input.mime, 'image/png')
  };
  // Exactly one of data (embedded) or file (sibling in the effects folder).
  if (typeof input.data === 'string') asset.data = input.data;
  else asset.file = str(input.file, '');
  return asset;
}

export function normalizeDocument(raw) {
  const problems = [];
  const input = raw && typeof raw === 'object' ? raw : {};
  const usedIds = new Set();

  const layers = (Array.isArray(input.layers) ? input.layers : [])
    .map((layer, index) => normalizeLayer(layer, index, usedIds, problems));

  const controls = (Array.isArray(input.controls) ? input.controls : [])
    .map((control, index) => normalizeControl(control, index, problems));

  const assets = {};
  const assetsInput = input.assets && typeof input.assets === 'object' ? input.assets : {};
  for (const [id, value] of Object.entries(assetsInput)) {
    // defineProperty rather than assets[id] = ..., for exactly one id: an
    // asset called "__proto__" hit Object.prototype's setter instead of
    // becoming a key, so it vanished without a word and every layer pointing at
    // it drew nothing. A document is data, and "__proto__" is a perfectly legal
    // name for a picture in it — JSON.parse itself makes it an ordinary own
    // property, so a document that round-trips through a file has one, and only
    // this assignment lost it.
    //
    // Defined rather than switching the object to a null prototype, because
    // this object is handed out to everything downstream (the renderer, the
    // exported effect's bootstrap, the tests) and a null-prototype object is a
    // different KIND of thing to be handed one of: no hasOwnProperty, no
    // toString, and a debugger that shows it differently. A plain object with
    // an own "__proto__" key behaves like every other assets object there is.
    Object.defineProperty(assets, id, {
      value: normalizeAsset(value), enumerable: true, writable: true, configurable: true
    });
  }

  const doc = {
    version: DOCUMENT_VERSION,
    name: str(input.name, '').trim() || 'Untitled',
    description: str(input.description, ''),
    publisher: str(input.publisher, ''),
    // Overall output gain, 0..200, applied once to the finished frame by the
    // renderer (see engine.js). 100 = unchanged, matching every document that
    // predates this field so old previews/exports don't shift; below 100
    // dims, above 100 brightens. The ceiling used to be 100, which meant the
    // control could only ever darken — the same shape saturation already has
    // (0..200, default 100) is what it has now.
    brightness: clamp(num(input.brightness, 100), 0, 200),
    // Colour post-processing, applied together with brightness in one pass
    // over the finished frame (see engine.js applyFinish). Defaults match
    // color.js's NEUTRAL_COLOR so a document that predates this field, or
    // one where nobody touched these controls, renders byte-identical to
    // before.
    saturation: clamp(num(input.saturation, 100), 0, 200),
    greenMagenta: clamp(num(input.greenMagenta, 0), -100, 100),
    blueYellow: clamp(num(input.blueYellow, 0), -100, 100),
    // Where the colour wheel is parked and how fast it keeps turning. Both
    // default to "not turned and not turning", which is what every document
    // written before them says by saying nothing (see MAX_HUE_SHIFT above).
    hueShift: clamp(num(input.hueShift, 0), 0, MAX_HUE_SHIFT),
    hueCycle: clamp(num(input.hueCycle, 0), 0, 100),
    // How much of the previous frame survives into this one. 0 is the hard
    // clear this engine has always done — see MAX_TRAIL above.
    trail: clamp(num(input.trail, 0), 0, MAX_TRAIL),
    layers,
    controls,
    assets
  };

  return { doc, problems };
}
