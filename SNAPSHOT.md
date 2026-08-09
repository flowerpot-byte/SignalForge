# SNAPSHOT

## Project

SignalForge builds SignalRGB lighting effects from images. An effect is a self-contained HTML file whose engine composites layers onto a 320x200 canvas; SignalRGB samples that canvas under every LED. Nothing else on the market makes effects from photos — the existing community tools only do geometric shapes.

Read `C:\Users\Max\claud\signalforge\README.md` for the public description, `C:\Users\Max\claud\signalforge\docs\entwurf-2026-08-09.md` for the full specification.

## Verbatim-critical

- Project repo: `C:\Users\Max\claud\signalforge`, branch `main`, HEAD `f59f2ed`. Own git repo, untracked inside the parent repo at `C:\Users\Max\claud` (branch `master`) — do not commit it there.
- SignalRGB effects folder: `C:\Users\Max\Documents\WhirlwindFX\Effects`
- Max' test image: `C:\Users\Max\Pictures\Screenshots\Screenshot 2026-08-09 090938.png`
- Rebuild his effect after any change to `bin/sfexport.js` or the engine:
  `node bin/sfexport.js --image "C:\Users\Max\Pictures\Screenshots\Screenshot 2026-08-09 090938.png" --name "SF Bergabend" --motion warp --fit cover --force`
- Current build plan: `C:\Users\Max\claud\signalforge\docs\superpowers\plans\2026-08-09-signalforge-app.md` — 12 tasks, tasks 1 and 2 done.
- Progress ledger (gitignored): `C:\Users\Max\claud\signalforge\.superpowers\sdd\progress.md`
- Extract a task brief: `C:\Users\Max\.claude\plugins\cache\superpowers-marketplace\superpowers\6.1.1\skills\subagent-driven-development\scripts\task-brief <plan> <n>`
- Generate a review diff: `C:\Users\Max\.claude\plugins\cache\superpowers-marketplace\superpowers\6.1.1\skills\subagent-driven-development\scripts\review-package <base> <head>`
- `npm test` currently: 149 pass, 0 fail. `pretest` rebuilds `dist/engine.bundle.js`; several tests launch real Electron, so a run takes about 7 seconds.
- Prototype kept for reference only, do not develop: `C:\Users\Max\claud\signalrgb-effekt`

## Running state

none

Nothing is running in the background. The loopback probe server on port 47821 was stopped and OpenRGB was uninstalled at Max' request (PawnIO driver deliberately left installed — Max was told and has not asked for its removal).

## Decisions made

- **Video inside a SignalRGB effect is impossible.** Measured on the real host: `<video>` exists but has no `play()`, so the script aborts and the render loop never starts. Not the file size, not the codec — both an embedded data URI and a sibling file fail identically. Any future video feature must go through an image sequence. Evidence: `C:\Users\Max\claud\signalforge\docs\erkenntnisse-signalrgb-motor.md`.
- **An effect cannot receive live data.** SignalRGB serves effects from its own HTTPS origin (`signalrgbmarketplace.pages.dev`), so a sibling file is out of origin and a localhost server is mixed content, blocked before CORS is consulted. Everything an effect knows must be baked in at export time. This closes off wallpaper synchronisation. Same document.
- **`ctx.filter` is absent on the host.** Brightness and colour are computed by hand over the pixel buffer, in one shared pass that is skipped entirely when neutral. No layer type may use `ctx.filter` at render time.
- **The preview loads the same `dist/engine.bundle.js` the export embeds.** This is what makes `test/export/parity.test.js` meaningful and must not be replaced by importing engine sources directly in the app.
- **Layers carry `motions` (an array), not `motion`.** `normalizeDocument` still converts the old singular form so previously exported effects and saved projects load. Render order is fixed (drift, then warp, then breathe), not list order, so the result does not depend on how the user sorted the list.
- **An own lighting application on top of OpenRGB was considered and deliberately deferred**, at Max' decision on 2026-08-09: he wants a finished effect builder in reasonable time first. Findings and effort estimate are preserved in section 9b of the specification. Do not reopen it unless Max raises it.
- **Licence GPLv3, code and commits in English, docs in German, interface bilingual.** Name SignalForge chosen by Max after being told it sits close to the SignalRGB trademark.

## Pick up here

Implement Task 3 of `C:\Users\Max\claud\signalforge\docs\superpowers\plans\2026-08-09-signalforge-app.md` — the Electron shell.

Concretely: extract the brief with

```
cd C:\Users\Max\claud\signalforge
"C:\Users\Max\.claude\plugins\cache\superpowers-marketplace\superpowers\6.1.1\skills\subagent-driven-development\scripts\task-brief" "docs/superpowers/plans/2026-08-09-signalforge-app.md" 3
```

then follow `superpowers:subagent-driven-development`: one fresh implementer per task, then a reviewer against the same diff, fix rounds until the reviewer is clean, append to `.superpowers/sdd/progress.md`, then the next task.

Task 3 creates `app/main.js`, `app/preload.cjs`, `app/renderer/index.html`, `app/renderer/main.js`, adds `main` and a `start` script to `package.json`, and is proved by `test/app/boot.test.js` — the window opens, `window.sf` exists, and the renderer cannot reach Node.

Tasks 4 to 12 follow in the plan: settings and effects-folder resolution, the glass shell with two languages, the live preview with its cost readout, dragging an image in, choosing the crop by dragging, the inspector, save and open, export, and acceptance.

Two places in the plan are deliberately unfinished and say so in the text: the offset formula in Task 8 Step 3 (the code there is a proposal containing a redundant variable; the tests are the truth) and the origin of the control list in Task 11 Step 3 (extract it from `bin/sfexport.js`, do not copy it).
