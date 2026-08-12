# SNAPSHOT

## Project

SignalForge builds SignalRGB lighting effects from images, shapes, gradients and particles. An effect is a self-contained HTML file whose engine composites layers onto a 320x200 canvas; SignalRGB samples that canvas under every LED. Public description: `C:\Users\Max\claud\signalforge\README.md`. Full specification: `C:\Users\Max\claud\signalforge\docs\entwurf-2026-08-09.md`.

## Verbatim-critical

- Project repo: `C:\Users\Max\claud\signalforge`, branch `main`, HEAD `74022c4`. Own git repo, untracked inside the parent repo at `C:\Users\Max\claud` (branch `master`) — never commit there. **The shell's working directory drifts into the parent repo between calls; check `pwd` before every git command.**
- `npm test`: 805 tests, 804 pass, 0 fail, 1 skipped (the drag-and-drop import; visible-window opt-in via `npm run test:import`). ~40 s. Working tree carries ONE uncommitted file: `test/export/shape-layer-host.test.js` — **it belongs to a separate running session** (Max' flake-fix task chip); never touch, stage, revert or commit it.
- Start the app from source: `npm start`. Installer: `npm run dist` → `release\SignalForge-Setup-0.1.0.exe` (per-user, no UAC). **Max' standing instruction (12.08. ~04:30): apply updates DIRECTLY to his installed app instead of making him reinstall** — the proven way: build, check `Get-Process SignalForge` is empty (if running, ask him to close), then `Start-Process release\SignalForge-Setup-0.1.0.exe -ArgumentList "/S" -Wait` (exit 0, per-user, silent). Done successfully once at 04:08.
- Installed copy: `C:\Users\Max\AppData\Local\Programs\SignalForge\SignalForge.exe` (currently 12.08. 04:08 build = HEAD `4ab06f6`; the three polish commits `9d4ff7d..74022c4` are NOT yet installed).
- SignalRGB effects folder: `C:\Users\Max\Documents\WhirlwindFX\Effects` — 6 files: `MaxAmbient.html` (community, keep), `SF Bergabend.html` + `SF Bergabend.png` (his, rebuilt current), 3× `Verlauf*.html` (his early exports, still carry the pre-fix motion bug, no tiles — he re-exports them himself via the library tab). Read-only except the standing rebuild command:
  `node bin/sfexport.js --image "C:\Users\Max\Pictures\Screenshots\Screenshot 2026-08-09 090938.png" --name "SF Bergabend" --motion warp --fit cover --force` (run after every engine change).
- Effect corpus inventory (31 real SignalRGB effects mapped to our vocabulary): `docs/effekt-inventur.md`. SignalRGB's cached community effects: `C:\Users\Max\AppData\Local\WhirlwindFX\SignalRgb\cache\effects\<ID>\effect.html` (read-only).
- Measured host facts: `docs/erkenntnisse-signalrgb-motor.md` (no video, no ctx.filter, no live data caveat see inventory) and `docs/erkenntnisse-signalrgb-oberflaeche.md` (design tokens measured off SignalRGB).
- Progress ledger + all German work reports (gitignored): `C:\Users\Max\claud\signalforge\.superpowers\sdd\`. Night log: `work/nachtschicht_2026-08-10.md` (morning summary at top).
- Hidden-window rules (hard, Max complained twice): every verification window `BrowserWindow({ show:false })` + TWO `capturePage()` calls; `requestAnimationFrame` does not tick hidden — drive frames externally; every Electron entry through `runHarness` in `test/harness/driver.js`, every spawn through `test/harness/spawn-electron.js`. **`test/harness/walkthrough.js` throws BEFORE the guard when `SF_WALK_OUT` is missing → Electron shows an error DIALOG on Max' screen and the process is immortal — this happened tonight, Max saw the dialog.** Fix pending (task 8 below).

## Running state

none. 0 Electron processes. The separate flake-fix session (Max' task chip `task_8ea7818e`) may run independently — its only footprint here is the uncommitted `test/export/shape-layer-host.test.js`.

## Decisions made

- Engine determinism is absolute: no clock, no `Math.random` in `src/engine/**`/`src/export/**`; particles are closed-form `x(i,t)` from the seeded `triple32` hash (`src/engine/hash.js`); parity preview↔export is exactly 0, sequence-based from frame 0 for trail documents (`test/export/parity.test.js`).
- Layer slots: `layers[0]` = optional background, last = foreground, id-based addressing (`src/engine/slots.js`). Multi-foreground does NOT exist yet — that is Max' top open wish.
- Motion render order `spin → drift → warp → pulse → breathe`, stated in every layer file; `motionKindsFor(type, figure)` offers only what visibly does something.
- The wake (trail) uses a second transparent buffer for the foreground; background stays live; Chromium's compositor cannot attenuate (stalls at 25/255, measured) so a JS loop does it.
- The conic gradient is 360 cached wedges, NOT `createConicGradient` (host Chromium version unknown/lies). Cache keys must carry EVERY drawing input — this bit twice.
- Design language measured off SignalRGB: bg `#060b11`, card `#212d3a`, accent `#ff0066`, radii 6/8, all colours in `tokens.css` only (guard test scans recursively). Dropdown popups styled via `appearance: base-select`/`::picker(select)` (Chromium 150 supports it; @supports-gated).
- Cover images: `<Name>.png` (512×288, frame 0, centre-cropped) beside every exported `.html` — mechanism proven by Max' own screenshot. Every exported effect embeds its document (`<script id="sf-document">`) and is reopenable via the library tab.
- appId `de.maxblu.signalforge` (still unconfirmed by Max). Installer unsigned — SmartScreen warns.

## Pick up here

Max' open list, in his priority order (his words paraphrased; work each as its own reviewed package, subagent-driven, message him after every package):

1. **Aspect distortion in SignalRGB (NEW, likely highest impact):** his star renders visibly stretched wide in SignalRGB's preview (screenshot 04:32). Hypothesis: SignalRGB stretches the 320×200 canvas to a wider viewport/LED space. MEASURE FIRST: read SignalRGB's own bundled/cached effects (paths above) for aspect compensation; check what MaxAmbient does; possibly a probe effect with a perfect circle (only with his OK if it must enter his real folder). Then fix at the cause (canvas size? aspect-corrected figure maths? a document/export setting?) without breaking parity or old effects.
2. **"In SignalRGB speichern" button gives zero feedback** — press/progress/success states; generally more polished buttons + animations. Use his installed skills: `emil-design-eng`, `design-taste-frontend`, `animate`, `apple-design`.
3. **hueCycle slider jumps colour when adjusted** — keep the current hue angle steady when tempo changes (rebase `hueShift` in the app at the preview's current time so only the speed changes; engine stays pure).
4. **Colour cycling between CHOSEN colours** (his newest wish, 04:45): "wie bei einem Regenbogen aber nur zwischen 2 oder mehr bestimmten Farben" — a palette-cycle (document/solid/shape colour animating through user-picked stops, not the full hue wheel). Design against the corpus's "Color Cycle" pattern in `docs/effekt-inventur.md`.
5. **Recent colours** at every colour input (small swatch row, persisted in settings).
6. **Custom cover image** ("eigenes Titelbild"): let him pick his own picture for the exported tile instead of the auto frame-0 render (embed in document, use at export; auto render stays the default).
7. **Multiple shapes per effect** — the layer list (add/remove/reorder foreground layers), plus: static rotation angle for shape layers, a zoom/grow motion, spin for all figures where visible, more figures (triangle, hexagon, diamond, cross, moon…). Biggest package; the seam is `src/engine/slots.js`.
8. **Fix `walkthrough.js`** so a missing `SF_WALK_OUT` exits with a printed message BEFORE Electron can show a dialog (validate env before `app.whenReady`, use the guard pattern from `test/harness/driver.js`).
9. **Re-inventory his saved effects** (`docs/effekt-inventur.md` update): every cached effect vs. today's vocabulary; build remaining feasible gaps; also research online (WebSearch: SignalRGB community wishes, r/SignalRGB, what people want from an effect builder) per his instruction "schau im Internet was Leute sich wünschen".
10. After each engine change: rebuild `SF Bergabend` (command above), keep 804+ tests green, and **silent-install the fresh build to his machine** (Verbatim-critical section) so he never has to reinstall manually.
