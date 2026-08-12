// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max Leopold Blumenschein
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * The one entrance in this window, and the one rule about how it is cleaned up.
 *
 * WHAT IT IS FOR
 *
 * Two things in this app appear where a moment ago there was nothing: a
 * section of the settings column when the document grows one (a picture
 * arrives, so "Bild" exists now), and the settings column's other panel when
 * it is swapped. Both are STATE, and both were previously instantaneous — the
 * column simply held different things than it had a frame earlier, with
 * nothing saying that anything had happened. Everything else in the window
 * that moves does so as a transition on an element that is already there
 * (a press, the unsaved mark, the drop target) and needs none of this.
 *
 * Deliberately NOT used for: the picture arriving on the stage (it is the
 * product, and it must be there the instant it is there), the starting
 * gallery at boot, or anything on a repeat — see the report for the full list
 * of what was proposed and rejected.
 *
 * WHY THE CLASS IS TAKEN OFF AGAIN, AND WHY WITH A TIMER AS WELL
 *
 * The animation is declared with no fill, so an element that is not
 * mid-entrance simply wears its own resting style. That is not enough on its
 * own: this window is photographed by five Electron harnesses that run it with
 * `show: false`, and a window Chromium is not showing does not necessarily
 * advance an animation's clock — the same reason those harnesses have to pump
 * frames by hand (see test/harness/driver.js). An entrance that never
 * advances would hold its first keyframe, i.e. opacity 0, and the section
 * would be missing from the photograph and only from the photograph.
 *
 * So the class comes off on `animationend` when the animation ran, and on a
 * timer just past its own duration when it did not. Whichever fires first
 * wins and the other is disarmed. The window can therefore never be left
 * holding a half-played entrance, whether or not anybody is looking at it.
 *
 * The duration below is the one number in this file, and it has to stay just
 * above --motion-enter in styles/tokens.css. It is deliberately a plain number
 * rather than a read of the custom property: this must still fire when the
 * animation was never started at all, which is precisely when the stylesheet
 * cannot be trusted to answer.
 */
const ENTER_MS = 220;

/** Play the entrance on `element`, and make sure it ends. */
export function enter(element) {
  if (!element) return;
  element.classList.remove('sf-enter');
  // Reading a layout property between the two writes is what makes a repeat of
  // the same entrance on the same element (swap to the app's settings and
  // straight back) actually restart rather than be coalesced into no change.
  void element.offsetWidth;
  element.classList.add('sf-enter');

  let timer = null;
  const done = () => {
    clearTimeout(timer);
    element.removeEventListener('animationend', done);
    element.classList.remove('sf-enter');
  };
  element.addEventListener('animationend', done);
  timer = setTimeout(done, ENTER_MS);
}
