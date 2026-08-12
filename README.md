# SignalForge

Build your own SignalRGB lighting effects from **images and video** — not just
geometric shapes.

SignalRGB can play effects but not create them. The community tools that exist only
handle shapes; nothing lets you turn a photo or a video clip into lighting.
SignalForge does.

## Why images matter

A SignalRGB effect is a 320x200 web page. SignalRGB overlays your device layout and
samples the colour under every LED. So any picture you can draw becomes lighting —
your own photos included.

## What it can do

- **Pictures and video** as the effect itself: dropped in, cropped on the stage,
  fitted the way you choose.
- **Shapes** — circle, ring, star, heart, triangle, hexagon, diamond, cross,
  moon — with size, position, rotation and a zoom that breathes.
- **Gradients** in five shapes (linear, radial, conic, stripes, waves) and
  **flat colours**.
- **Particles**: four patterns, up to four hundred of them, from seeded noise, so
  the same effect draws the same picture every single time.
- **Several layers per effect**, stacked and reordered in a layer list.
- **Motion**: warp, drift, spin, pulse, breathe, zoom — and a wake that trails
  behind moving things.
- **Colour over time**: hue rotation, and a cycle through colours you pick.
- A **live preview** that is the same engine the exported effect runs, so what
  you see is what SignalRGB plays.
- Your own **tile picture** for the effect, and your **name** on it.

## Building it yourself

Node 20 or newer, then:

```
npm install
npm start
```

`npm test` runs the suite. `npm run dist` builds a Windows installer into
`release/`.

## Installing the built app

The installer is **not code-signed** — signing certificates cost money this
project does not have. Windows SmartScreen will therefore warn you the first
time you run it ("Windows protected your PC"). That warning means "nobody paid
for a certificate", not "this is malware". Choose *More info* → *Run anyway*, or
build it yourself with the two commands above.

## A note on references to `.superpowers/`

Comments here and there point at files under `.superpowers/` — build plans and
measurement reports written while the program was being built. They are **not in
this repository**: they are instructions and working notes addressed to the
people and tools that did the building, they name paths on the machine they were
written on, and they say nothing a reader of the code needs.

Where such a reference appears, everything needed to understand the code is in
the comment beside it; the reference only records where the measurement or the
decision originally came from. Nothing is hidden — nothing is missing either.

## Licence

**GPL-3.0-or-later**, with one additional term under GPL section 7(b):
**the author attribution has to stay.**

- Full licence text: [`LICENSE`](LICENSE)
- The additional term, and what it means in plain words:
  [`ADDITIONAL-TERMS.md`](ADDITIONAL-TERMS.md)

In short: use it for anything, change it, share it, sell what you build with it.
If you pass the program or a changed version on, keep it open source and keep
the line that says who wrote it — beside your own name, not instead of it.

The **name** "SignalForge" and the app's icon are not covered by the licence.
Fork the code freely; give your fork its own name.

Effects you build with SignalForge are **yours** — the licence puts no
obligation of any kind on them.

Copyright (C) 2026 Max Leopold Blumenschein

## Not affiliated with SignalRGB

SignalForge is an independent community project. It is not made by, endorsed by, or
affiliated with WhirlwindFX or SignalRGB. It writes standard effect files into the
folder SignalRGB reads; it does not modify SignalRGB itself.
