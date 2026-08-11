# SNAPSHOT

## Project

SignalForge builds SignalRGB lighting effects from images. An effect is a self-contained HTML file whose engine composites layers onto a 320x200 canvas; SignalRGB samples that canvas under every LED. Nothing else on the market makes effects from photos — the existing community tools only do geometric shapes.

Read `C:\Users\Max\claud\signalforge\README.md` for the public description, `C:\Users\Max\claud\signalforge\docs\entwurf-2026-08-09.md` for the full specification.

## Verbatim-critical

- Project repo: `C:\Users\Max\claud\signalforge`, branch `main`, HEAD `0c5f3fd`. Own git repo, untracked inside the parent repo at `C:\Users\Max\claud` (branch `master`) — do not commit it there. **The shell's working directory drifts into the parent repo between sessions; check `pwd` before every git command.**
- Start the app: `npm start` in the repo.
- **Installer bauen: `npm run dist`.** Ergebnis: `C:\Users\Max\claud\signalforge\release\SignalForge-Setup-0.1.0.exe` (rund 95 MB). Das ist die Datei, die Max doppelklickt. Sie installiert **nur für ihn** (`perMachine: false`, `allowElevation: false`, Manifest `asInvoker`) und fragt deshalb **nie** nach Administratorrechten; Ziel ist `%LOCALAPPDATA%\Programs\SignalForge`. Sie legt einen Startmenü-Eintrag an (darum ist die App danach in der Windows-Suche zu finden) und eine Desktop-Verknüpfung. Die Desktop-Verknüpfung abschalten: `"createDesktopShortcut": false` im `build.nsis`-Block der `package.json` — eine Zeile.
- Nur das entpackte Programm ohne Installer bauen (schneller, zum Prüfen): `npm run dist:dir` → `release\win-unpacked\SignalForge.exe`. `release/` ist gitignored. Beide Skripte bauen vorher `dist/engine.bundle.js` (`predist` / `predist:dir`) — ohne das Bündel ist die App kaputt.
- Programmsymbol: `build/icon.png`, 512 x 512, gezeichnet von `tools/icon/build-icon.mjs` (`npm run build:icon`) aus `GLYPHS.mark` in `app/renderer/components/icons.js`. electron-builder macht daraus selbst die `.ico` (7 Größen, 16 bis 256). Neu zeichnen und dabei die kleinen Größen beurteilen: `npx electron tools/icon/build-icon.mjs --preview work/icon-preview.png`.
- SignalRGB effects folder: `C:\Users\Max\Documents\WhirlwindFX\Effects`
- Max' test image: `C:\Users\Max\Pictures\Screenshots\Screenshot 2026-08-09 090938.png`
- Rebuild his effect after any change to `bin/sfexport.js` or the engine:
  `node bin/sfexport.js --image "C:\Users\Max\Pictures\Screenshots\Screenshot 2026-08-09 090938.png" --name "SF Bergabend" --motion warp --fit cover --force`
- Current build plan: `C:\Users\Max\claud\signalforge\docs\superpowers\plans\2026-08-09-signalforge-app.md` — **all 12 tasks done and reviewed**, plus a whole-branch review whose 6 findings are fixed. Acceptance record: `docs/abnahme-app.md` (Max' own Prüfpunkt is deliberately still empty).
- Progress ledger (gitignored): `C:\Users\Max\claud\signalforge\.superpowers\sdd\progress.md`
- Extract a task brief: `C:\Users\Max\.claude\plugins\cache\superpowers-marketplace\superpowers\6.1.1\skills\subagent-driven-development\scripts\task-brief <plan> <n>`
- Generate a review diff: `C:\Users\Max\.claude\plugins\cache\superpowers-marketplace\superpowers\6.1.1\skills\subagent-driven-development\scripts\review-package <base> <head>`
- **`npm test` zeigt kein Fenster mehr.** Alle Testläufe fahren die App in einem nie angezeigten Fenster (`windowDisplay.show = false` plus Frame-Pumpe, siehe `test/harness/shots.js`). Die eine Prüfung, die dafür ein sichtbares Fenster braucht — eine Bilddatei per Drag-and-drop auf die Vorschau, weil Chromiums Drag-Pipeline ein verstecktes Fenster nicht bedient — läuft nur auf Zuruf: **`npm run test:import`** führt die komplette Testreihe **einschließlich** dieser Prüfung aus und zeigt dabei für ein paar Sekunden das Fenster. Ohne sie meldet `node:test` die Prüfung ausdrücklich als übersprungen samt Grund (`{ skip }`), sie verschwindet also nicht still. Geschaltet wird das über `SF_UNSAVED_DROP_IMPORT`, scharfgemacht durch `--import ./test/support/drop-import-test.js` — dieselbe Bauart wie `SF_EFFECTS_SANDBOX_REQUIRED` und `SF_SINGLE_INSTANCE_TEST`.
- `npm test` currently: 445 Prüfungen, 444 bestanden, 0 durchgefallen, 1 übersprungen (der Drag-and-drop-Import oben), rund 40 Sekunden. `pretest` rebuilds `dist/engine.bundle.js`; several tests launch real Electron. `npm test` also arms the effects-folder sandbox in every test process via `--import ./test/support/effects-sandbox.js` — a test that redirects `userData` but forgets to name a sandbox folder now fails loudly instead of writing into the real SignalRGB folder.
- Full-window walkthrough (real mouse and keyboard through CDP, 11 points, screenshots): `test/harness/walkthrough.js`. It is deliberately not a `*.test.js`, so `npm test` does not run it — run it by hand when the interface changes.
- Self-test: `test/harness/selftest.js`, a second Electron entry of the same shape — it imports the real `app/main.js`, drives the window it opens, and prints one line of JSON that `test/app/boot.test.js` judges. Both harnesses share one driver, `test/harness/driver.js`. Until 10.08.2026 this driver lived inside `app/main.js` behind `SF_SELFTEST`; that variable is gone, running the file is the signal.
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

## Since build plan 2 (10.08.2026)

Max said three times that the window looked cheap, then: *"vergiss glass morphism aber designe es genauso wie signal rgb"*, plus too much blank space and missing icons. Also: no way to make an effect without a picture, and he could not find SignalForge in Windows search.

- **The window was rebuilt in SignalRGB's own visual language.** Glassmorphism is gone. The colours were **measured** off a real screenshot of SignalRGB's Customize screen — `docs/erkenntnisse-signalrgb-oberflaeche.md` records the sample points. Icon sidebar, near-black neutral background, card per control group, transport-style bottom bar, hand-drawn inline SVG icons (no icon library, no download).
- **Effects without a picture:** `solid` and `gradient` layer types. Radial is a *field* of `gradient`, not a second type — only a field can be switched from SignalRGB's own panel. The starting gallery renders each tile from the very defaults the tile creates; a test fails if a tile ever shows something the click does not build.
- **Packaged as a real Windows app.** `npm run dist` → `release/SignalForge-Setup-0.1.0.exe`, per-user, **no administrator prompt**, Start-menu entry, own icon from the app's own mark. Not installed — that is Max' decision. Unsigned, so SmartScreen will warn.
- **JPEG instead of PNG** for opaque pictures: his effect went 169.2 KB → 48.3 KB.
- Crop by keyboard, an unsaved-changes question, and `requestSingleInstanceLock` all landed.

**No visible windows.** Max complained that windows kept popping up — those were verification runs. Every harness now opens `BrowserWindow({ show: false })` and uses `capturePage()`. `npm test` shows no window (measured with a Win32 window watcher across three runs). Two facts worth keeping: `requestAnimationFrame` does not tick in a hidden window (drive frames from outside), and a hidden window needs **two** `capturePage()` calls or the canvas comes out blank.

**And no leftover processes.** Three orphaned `electron.exe` from harness runs were found six hours old on Max' machine. **An Electron main process does not die of an unhandled promise rejection** — it prints a warning and runs on forever with its window open, which is measurable and was measured. So every Electron entry goes through `runHarness`/`guardHarness` in `test/harness/driver.js` (watchdog, `uncaughtException` + `unhandledRejection`, and a `finally` that always leaves) and every spawn goes through `runElectron` in `test/harness/spawn-electron.js` (which always kills). **Rules for anyone adding a harness:** use those two, never write `app.whenReady().then(...)` bare, never `app.quit()` — it is a request a close handler may refuse and it carries no exit code — and keep a harness's own watchdog *below* its caller's timeout. Never make a harness exit 0 unconditionally to "fix" a leak: that turns a red run green. Details and the falsifiability evidence: `.superpowers/sdd/harness-cleanup-report.md`.

- Build the installer: `npm run dist` (runs `build:engine` first).
- The one check that needs a visible window is opt-in: `npm run test:import` (Chromium's drag pipeline refuses a hidden window). It reports itself as skipped in a normal run rather than passing quietly.

## Waiting on Max

1. **His verdict on the design.** He is the criterion; it has been rebuilt four times against his words.
2. **His own acceptance run** — `docs/abnahme-app.md`, section left blank on purpose. Nobody may fill it in for him.
3. **The thumbnail probe is still in his effects folder** — `SF Probe Mit Bild.html/.png` and `SF Probe Ohne Bild.html`, placed with his approval. One look at SignalRGB's effect list answers whether custom cover images are possible at all. **Remove all three as soon as he has looked.**
4. **`appId` is a guess:** `de.maxblu.signalforge`. Settle it before the first real install; it is hard to change afterwards.
5. **Unmeasured in SignalRGB itself:** `type="color"`, the `shape` combobox, and the two negative-minimum sliders (`greenMagenta`, `blueYellow`, −100..100 — the first of their kind this project ships).

## Deliberately deferred, with reasons

- **A visible-window pass is owed.** The colour dialog end to end, Tab order through the rebuilt window, the canvas focus ring, the `aria-live` crop announcement with a real screen reader, drag-and-drop, and `test/harness/walkthrough.js` were all left unverified *because opening a window was forbidden*. The full list is in the whole-diff review (`.superpowers/sdd/`). Run it when Max is away from the machine.
- **Preparing a picture in the packaged layout is settled, not assumed.** A whole-diff review claimed `prepare-image.js`'s default window factory had only ever run from a source checkout; that was **wrong**, and it was checked rather than believed. It now runs from the real `release/win-unpacked/SignalForge.exe` (`app.isPackaged: true`) against its own `app.asar`, with nothing injected, and `test/main/packaged-factory.test.js` packs a real `.asar` and holds it there. First start against a temp Documents folder resolves `detected` when `WhirlwindFX\Effects` exists and `none` when it does not; a packaged export writes a complete, animating effect. What is still untried: the installer itself (Start-menu entry, uninstall, SmartScreen) and a real drag gesture on the packaged app — Chromium will not drag onto a hidden window, and the same import path is covered through the file input.
- Build plan 3 material: several layers on top of each other, shape layers, video as an image sequence, own cover images.
