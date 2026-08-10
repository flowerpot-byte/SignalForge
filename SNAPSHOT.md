# SNAPSHOT

## Project

SignalForge builds SignalRGB lighting effects from images. An effect is a self-contained HTML file whose engine composites layers onto a 320x200 canvas; SignalRGB samples that canvas under every LED. Nothing else on the market makes effects from photos — the existing community tools only do geometric shapes.

Read `C:\Users\Max\claud\signalforge\README.md` for the public description, `C:\Users\Max\claud\signalforge\docs\entwurf-2026-08-09.md` for the full specification.

## Verbatim-critical

- Project repo: `C:\Users\Max\claud\signalforge`, branch `main`, HEAD `8e9b0cb`. Own git repo, untracked inside the parent repo at `C:\Users\Max\claud` (branch `master`) — do not commit it there.
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
- `npm test` currently: 414 Prüfungen, 413 bestanden, 0 durchgefallen, 1 übersprungen (der Drag-and-drop-Import oben), rund 40 Sekunden. `pretest` rebuilds `dist/engine.bundle.js`; several tests launch real Electron. `npm test` also arms the effects-folder sandbox in every test process via `--import ./test/support/effects-sandbox.js` — a test that redirects `userData` but forgets to name a sandbox folder now fails loudly instead of writing into the real SignalRGB folder.
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

## Waiting on Max

Build plan 2 is finished. What is open is his, not the code's:

1. **His own acceptance run** — Task 12 Step 4. `npm start`, drop a picture, move the crop, build an effect, export it, look at it in SignalRGB. The four questions are in `docs/abnahme-app.md`, section left blank on purpose. Nobody may fill it in for him.
2. **Negative-minimum controls in SignalRGB are unmeasured.** `greenMagenta` and `blueYellow` are the first controls this project ships with a `min` below zero. When he opens the exported effect in SignalRGB, look at whether those two sliders really offer −100..100.
3. **German UI without umlauts.** `app/renderer/i18n/de.json` says "Fuellen", "Staerke", "Gruen/Magenta" because the plan authored it that way. The ASCII-only rule binds *exported effect control labels* (`build-effect.js` throws otherwise) — **not** the app's own interface. Changing them is safe; only `test/app/boot.test.js` matches on two of those words. His call.

## Deliberately deferred, with reasons

- **The crop cannot be moved by keyboard** — the preview canvas is not in the tab order. Everything else in the window is keyboard-complete, so this is the single hole. Roughly `tabindex="0"` plus arrow keys calling the same `offsetFromDrag`.
- **No unsaved-changes guard when opening a project.** The two open paths that can destroy a file are already safe; this is the one that succeeds and still loses work. Behaviour Max should choose.
- **No `requestSingleInstanceLock`** — two windows share one `settings.json` and one effects folder, last writer wins.
- Build plan 3 material, listed in the plan's own self-check: several layers on top of each other, gradient and shape layers, video as an image sequence, own cover images, JPEG instead of PNG, installer.

## Next work, if nobody says otherwise

Section 9c of `docs/entwurf-2026-08-09.md` — own cover images, JPEG instead of PNG, several layers. Smallest provable things first.
