// SignalForge — build SignalRGB effects from images, gradients, shapes and particles.
// Copyright (C) 2026 Max Leopold Blumenschein
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Seeded noise: the same "randomness" every time, for ever.
 *
 * ===========================================================================
 * WHY THIS FILE EXISTS
 * ===========================================================================
 *
 * `Math.random` is banned in this engine, and test/engine/boundary.test.js
 * greps for it across the whole of src/engine and src/export. That ban is not
 * fastidiousness: it is what makes the parity guarantee possible. The preview
 * and the exported file are required to land on the SAME PIXELS
 * (test/export/parity.test.js), and a call to Math.random anywhere in a layer
 * would make that a coin toss.
 *
 * docs/effekt-inventur.md counts `Math.random` in 22 of the 31 real
 * SignalRGB effects it read, and at least 16 of the 31 are particle systems
 * built on it — nine of them the same file in different colours. So the ban
 * closes the door on half the corpus unless there is another way in. Section B
 * of that document names the other way in, and this file is it:
 *
 *   "Gesäter Zufall ist erlaubt. Verboten ist `Math.random`, weil es bei
 *    jedem Start andere Bilder liefert ... Eine Hash-Funktion über den
 *    Partikel-Index ist derselbe 'Zufall' fürs Auge und dabei bei jedem Lauf
 *    identisch. Das ist der Weg zu allem in A1."
 *
 * The corpus rolls its dice ONCE, when a particle is constructed, and then
 * keeps the results on the object (`this.x` is set from a `Math.random` draw times 320). We cannot
 * keep anything between frames and must not roll anything at all — so the
 * constants of particle `i` are LOOKED UP instead of drawn: they are a pure
 * function of `i` and the layer's `seed`. Same scatter to the eye, same bytes
 * on every run, and no state whatsoever.
 *
 * ===========================================================================
 * WHY AN INTEGER MIXER AND NOT sin(i * 12.9898) * 43758.5453
 * ===========================================================================
 *
 * The inventory offers `fract(sin(i * 12.9898) * 43758.5453)` — the shader
 * world's usual one-liner — as an alternative to an integer mixer. It is
 * rejected here, for a reason that is specifically about THIS project rather
 * than about taste:
 *
 * That expression's result depends on the exact value of `Math.sin` for a huge
 * argument, and then throws away everything except the last few bits of it.
 * ECMAScript does not require `Math.sin` to be correctly rounded — the spec
 * says only that it is implementation-approximated — so two JavaScript engines,
 * or one engine on two processors, may legitimately differ in the last bit and
 * the "random" number then comes out completely different. This engine's whole
 * promise is that the preview in Electron's Chromium and the exported file in
 * SignalRGB's Ultralight paint the same pixels. Building the scatter on a
 * function whose last bits are explicitly not pinned down would put that
 * promise on sand, and the failure would look like "the effect is different on
 * his machine" rather than like a bug anybody could find.
 *
 * The mixer below uses only `^`, `>>>` and `Math.imul`. All three are exactly
 * specified on 32-bit integers, so every engine that runs JavaScript at all
 * produces the identical number. That is the whole argument.
 *
 * ===========================================================================
 * THE MIXER
 * ===========================================================================
 *
 * `triple32`, from Chris Wellons's hash-prospector search
 * (https://github.com/skeeto/hash-prospector) — three rounds of xor-shift and
 * multiply. Two properties matter here and both are why it was chosen over
 * something hand-rolled:
 *
 *  - IT IS A BIJECTION on the 32-bit integers. Every step is invertible (an
 *    xor-shift is its own kind of invertible, an odd multiplier is invertible
 *    modulo 2^32), so distinct inputs give distinct outputs — ALWAYS, not
 *    usually. For a particle system that is not a nicety: it means particle 7
 *    and particle 8 can never be handed the same spawn position, and two
 *    channels of the same particle can never collide into the same draw. The
 *    test asserts it over a sweep rather than trusting the claim.
 *  - ITS AVALANCHE IS MEASURED. The prospector's search reports a bias of
 *    0.0208 for this function, which is the reason to prefer it to the
 *    better-known but weaker mixers: flipping one input bit changes every
 *    output bit with probability essentially one half. That is what makes
 *    consecutive indices — 0, 1, 2, 3 — look unrelated, which is the only thing
 *    a particle system actually needs from a hash.
 *
 * The constants are NOT to be retuned. Every effect Max has already exported
 * bakes the scatter these three multiplies produce; changing one digit
 * rearranges every particle of every particle effect ever saved. If a better
 * mixer is ever wanted it belongs beside this one under a new name, not in
 * place of it.
 */

/**
 * The mixer: a 32-bit whole number in, a 32-bit whole number out, one to one.
 *
 * `Math.imul` rather than `*` on purpose. Ordinary multiplication of two
 * 32-bit values produces a double that cannot hold all 64 bits of the product,
 * so the low bits — the only ones this function goes on to use — are silently
 * rounded away and the mixer stops being a bijection. `Math.imul` is defined as
 * the low 32 bits of the true product, exactly, which is what the algorithm
 * asks for.
 *
 * The `>>> 0` at the end is what makes the RESULT unsigned. Everything in
 * between is happy to run on signed 32-bit values: `>>>` reads its left operand
 * as unsigned whatever its sign, and `^` is bit for bit either way, so the
 * arithmetic is identical — only the one number handed back needs to be a
 * plain non-negative integer, so that dividing it below gives a fraction rather
 * than a sign.
 */
export function mix32(value) {
  let x = value >>> 0;
  x ^= x >>> 17;
  x = Math.imul(x, 0xed5ad4bb);
  x ^= x >>> 11;
  x = Math.imul(x, 0xac4c1b51);
  x ^= x >>> 15;
  x = Math.imul(x, 0x31848bab);
  x ^= x >>> 14;
  return x >>> 0;
}

/**
 * 2^32, as the divisor that turns a mixed integer into a fraction.
 *
 * Named because the test divides by it too, and a fraction that lands where
 * the arithmetic says is only a falsifiable claim if both sides read the same
 * number.
 */
export const HASH_RANGE = 4294967296;

/**
 * The one thing a bijection on 32 bits cannot avoid having: a fixed point.
 *
 * `mix32(0)` is exactly 0 — every step of the mixer maps zero to zero, because
 * shifting zero gives zero, xoring it with zero gives zero and multiplying it
 * gives zero. That is not a flaw to be hidden (a permutation of a finite set is
 * allowed a fixed point, and the test below pins this one down rather than
 * looking away from it), but it IS a trap for the one input a person is most
 * likely to hand over: seed 0, particle 0, channel 0 would otherwise mix to
 * zero three times over and hand back a fraction of exactly 0.0. The default
 * document would then open with its first particle pinned to the very start of
 * its span while every other particle scattered — a single wrong-looking dot,
 * in the default, for ever.
 *
 * So the seed is salted before it is mixed. The constant is 2^32 divided by the
 * golden ratio, the usual choice for this job (it is the same number Java's
 * hash spreader and countless mixers use) and picked here for the one property
 * that matters: it is not zero, and its bits are not a pattern. Any other odd
 * number with a well-spread bit pattern would do the same job — what must not
 * change is that it stays THIS number, because it is baked into the scatter of
 * every particle effect anybody exports.
 */
const SEED_SALT = 0x9e3779b9;

/**
 * The one number everything about particle `index` is drawn from.
 *
 * Two mixes rather than one, and the second one is the one that matters: with
 * a single `mix32(seed + index)` the pair (seed 0, index 5) and the pair
 * (seed 5, index 0) would be the SAME particle, so two documents that differ
 * only in their seed would share whole stretches of their scatter. Mixing the
 * salted seed first spreads it across all 32 bits before the index is folded
 * in, so two seeds one apart give two completely unrelated families.
 *
 * Split out from hashUnit below so a caller with many draws to make can pay for
 * it once — the particle layer computes this once per particle and then takes
 * six fractions off it (see src/engine/layers/particles.js).
 */
export function seedHash(seed, index) {
  return mix32((mix32(((seed >>> 0) ^ SEED_SALT) >>> 0) ^ (index >>> 0)) >>> 0);
}

/**
 * One draw from a particle's base hash, as a fraction in [0, 1).
 *
 * `channel` says WHICH constant is being asked for — 0 might be the spawn
 * position, 1 the phase offset, 2 the size jitter. It is folded in and mixed
 * again rather than sliced out of the base's bits: slicing 32 bits into five
 * fields would leave six bits, i.e. 64 distinct spawn positions across a canvas
 * 320 pixels wide, and the visible result is particles queuing up in columns.
 * A whole mix per channel costs seven machine operations and gives every
 * channel the full 32 bits.
 *
 * HALF OPEN, [0, 1) AND NEVER 1. The largest value `mix32` can return is
 * 2^32 - 1, so the largest fraction is 1 - 2^-32. That is what lets callers
 * use it as an index into a list (`floor(u * n)` can never be `n`) and as a
 * position along a span without ever landing exactly on the far end.
 */
export function unitFrom(base, channel) {
  return mix32((base ^ (channel >>> 0)) >>> 0) / HASH_RANGE;
}

/**
 * The whole thing in one call: draw `channel` for particle `index` of a layer
 * seeded `seed`, as a fraction in [0, 1).
 *
 * For callers with one draw to make. The particle layer does not use it — it
 * splits the two halves above so the base is computed once per particle — but
 * it is what makes this module usable as the project's seeded-noise primitive
 * without every caller having to know that it comes in two halves. The tile
 * grid docs/effekt-inventur.md section C5 asks for next wants exactly this
 * shape: a seed, a cell index and a channel in, one fraction out — one draw
 * per cell for its starting phase.
 *
 * (This said "the plasma field ... section C5" until 12.08.2026. There is no
 * plasma anywhere in that document; C5 is the tile grid, and a per-pixel field
 * is A11, which is not on the build list at all. The shape the sentence claims
 * is needed is the right one either way, which is exactly why the wrong name
 * survived unnoticed.)
 */
export function hashUnit(seed, index, channel) {
  return unitFrom(seedHash(seed, index), channel);
}
