# SignalForge — Motor und Export (Bauplan 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein getesteter Effekt-Motor plus Export, der aus einer Effektbeschreibung eine lauffähige SignalRGB-Effektdatei erzeugt — bedienbar über die Kommandozeile, damit die ganze Kette beweisbar funktioniert, bevor eine einzige Zeile Oberfläche entsteht.

**Architecture:** Der Motor (`src/engine/`) ist eine reine Funktion aus (Dokument, Zeit) auf eine Zeichenfläche und darf nichts aus Node importieren. esbuild bündelt ihn zu einer Datei, die sowohl die spätere Vorschau als auch der Export einbetten — dieselbe Datei, nicht zwei Umsetzungen. Ein Paritätstest rendert dasselbe Dokument über beide Wege in echtem Chromium und vergleicht die Pixel.

**Tech Stack:** Node 24 (vorhanden), `node:test` als Testläufer (keine Fremdpakete), esbuild 0.28 zum Bündeln, Electron 43 als Rendermotor für Tests und später als App-Rahmen, ffmpeg (vorhanden) nur für den Videotest.

## Global Constraints

- **Sprache:** Bezeichner, Kommentare und Commit-Texte auf **Englisch**. Diese Plandatei und `docs/` sind Deutsch.
- **Lizenz:** GPLv3 (`GPL-3.0-or-later`). Jede neue Quelldatei bekommt den Kurz-Kopf aus Task 1.
- **Zeichenfläche:** immer 320 × 200. Nirgends eine andere Zahl hartkodieren — `CANVAS_WIDTH`/`CANVAS_HEIGHT` aus `src/engine/document.js` benutzen.
- **Motor-Grenze:** Unter `src/engine/` und in `src/export/build-effect.js` sind **keine** Node-Importe erlaubt (`node:*`, `fs`, `path`, `electron`, `require(`). Task 11 erzwingt das automatisch.
- **Determinismus:** Der Motor liest **nie** die Uhr und **nie** Zufall. Zeit kommt immer als Parameter `timeSec`. Ohne das ist der Paritätstest unmöglich.
- **Regler-Beschriftungen:** nur ASCII (Zeichencodes 32–126). Wie SignalRGB Umlaute darstellt, ist ungeprüft.
- **Keine festen Benutzerpfade** im Code. Kein `C:\Users\Max\…` außerhalb von Tests.
- **Keine Fremdpakete zur Laufzeit.** `dependencies` bleibt leer; Electron und esbuild sind `devDependencies`.
- **Plattform:** Windows. Pfadtrennzeichen nie von Hand zusammenbauen.

---

### Task 0: Video-Machbarkeit in SignalRGB prüfen

Wegwerfarbeit außerhalb des Repos. **Muss vor allem anderen passieren** — Bauplan 2 und die Videostufe hängen an dem Ergebnis (Risiko R1 und R2 der Spezifikation).

**Files:**
- Create: `%TEMP%\signalforge-videotest\` (Wegwerf, nicht ins Repo)
- Create: `C:\Users\Max\Documents\WhirlwindFX\Effects\ZZ-VideoTest.html` (wird am Ende wieder gelöscht)
- Create: `docs/erkenntnisse-video.md` (kommt ins Repo)

**Interfaces:**
- Consumes: nichts
- Produces: `docs/erkenntnisse-video.md` mit zwei belegten Antworten: (1) spielt SignalRGB eingebettetes WebM/VP9 ab, (2) erkennt SignalRGB neue Dateien im Effektordner ohne Neustart. Task 13 und Bauplan 2 lesen diese Datei.

- [ ] **Step 1: Testvideo erzeugen**

Ein bewegtes Testbild, 6 Sekunden, VP9. Bewusst klein gehalten, damit das eingebettete Base64 handlich bleibt.

```bash
mkdir -p "$TEMP/signalforge-videotest" && ffmpeg -f lavfi -i testsrc2=size=480x300:rate=30:duration=6 -c:v libvpx-vp9 -b:v 400k -pix_fmt yuv420p -an -y "$TEMP/signalforge-videotest/test.webm"
```

Erwartet: eine Datei unter 500 KB. Prüfen mit `ls -l "$TEMP/signalforge-videotest/test.webm"`.

- [ ] **Step 2: Testeffekt bauen**

Skript `%TEMP%\signalforge-videotest\bau.mjs`:

```js
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2];
const target = process.argv[3];
const b64 = readFileSync(join(dir, 'test.webm')).toString('base64');

const html = `<head>
  <title>ZZ VideoTest</title>
  <meta description="Throwaway probe: does SignalRGB play embedded WebM?" />
  <meta publisher="SignalForge" />
</head>
<body style="margin:0;padding:0;background:#000">
  <canvas id="exCanvas" width="320" height="200"></canvas>
</body>
<script>
  var c = document.getElementById('exCanvas');
  var ctx = c.getContext('2d');
  var v = document.createElement('video');
  v.muted = true; v.loop = true; v.autoplay = true; v.playsInline = true;
  v.src = 'data:video/webm;base64,${b64}';
  v.play();
  function update() {
    window.requestAnimationFrame(update);
    if (v.readyState >= 2) {
      ctx.drawImage(v, 0, 0, 320, 200);
    } else {
      // Solid red = video did not start. Unmistakable on the LEDs.
      ctx.fillStyle = '#ff0000';
      ctx.fillRect(0, 0, 320, 200);
    }
  }
  window.requestAnimationFrame(update);
</script>`;

writeFileSync(target, html, 'utf8');
console.log('written', target, (html.length / 1024).toFixed(1), 'KB');
```

Der rote Vollbild-Notfall ist Absicht: Max muss nichts inspizieren. Bewegte bunte Muster = Video läuft. Alles rot = Video läuft nicht.

- [ ] **Step 3: Effekt installieren, dabei R2 mitprüfen**

**SignalRGB vorher geöffnet lassen.** Dann:

```bash
node "$TEMP/signalforge-videotest/bau.mjs" "$TEMP/signalforge-videotest" "$USERPROFILE/Documents/WhirlwindFX/Effects/ZZ-VideoTest.html"
```

- [ ] **Step 4: Max fragen — menschlicher Prüfpunkt**

Hier stoppt die Arbeit. Max wörtlich fragen:

> „Der Testeffekt ist installiert. Bitte drei Dinge:
> 1. Taucht **ZZ VideoTest** in der Effektliste auf, **ohne** dass du SignalRGB neu startest?
> 2. Wähle ihn aus. Siehst du **bewegte bunte Muster** oder **alles rot**?
> 3. Falls rot: bitte SignalRGB einmal neu starten und nochmal schauen."

Nicht weiterarbeiten, bevor die Antwort da ist. Nicht raten und nicht selbst behaupten, es funktioniere — die LED-Ausgabe kann von hier aus niemand sehen.

- [ ] **Step 5: Ergebnis festhalten**

`docs/erkenntnisse-video.md`, die eckigen Klammern durch Max' Antwort ersetzen:

```markdown
# Erkenntnisse: Video in SignalRGB

**Geprüft am:** 2026-08-09 · **Von:** Max am eigenen Rechner · **SignalRGB-Version:** [eintragen]

## Spielt SignalRGB eingebettetes WebM/VP9 ab?

**Antwort:** [JA / NEIN]

Testaufbau: 320×200-Effekt, `<video>` mit `data:video/webm;base64,…` (VP9, 480×300, 6 s),
per `drawImage` auf die Zeichenfläche. Fällt das Video aus, wird die Fläche voll rot.

Beobachtung: [bewegte Muster / alles rot]

## Erkennt SignalRGB neue Effektdateien ohne Neustart?

**Antwort:** [JA / NEIN]

Beobachtung: [erschien sofort / erst nach Neustart]

## Folgen für den Bau

- [Wenn JA: Videoebene wird wie in der Spezifikation gebaut, `<video>` + `drawImage`.]
- [Wenn NEIN: Ausweichweg aus Risiko R1 — Video beim Import in eine Bilderfolge zerlegen
  (alle Einzelbilder nebeneinander in einem PNG) und durchblättern. Bedienung bleibt gleich.]
- [Wenn Neustart nötig: Die App muss das nach dem Export ansagen.]
```

- [ ] **Step 6: Testeffekt wieder entfernen**

```bash
rm -f "$USERPROFILE/Documents/WhirlwindFX/Effects/ZZ-VideoTest.html"
```

- [ ] **Step 7: Commit**

Das Repo gibt es an dieser Stelle noch nicht — Task 1 legt es an. Die Datei liegt bereit und wird in Task 1 mit eingecheckt.

---

### Task 1: Repo-Gerüst

**Files:**
- Create: `package.json`, `.gitignore`, `LICENSE`, `README.md`, `docs/HEADER.txt`
- Create: `test/smoke.test.js`
- Modify: nichts

**Interfaces:**
- Consumes: nichts
- Produces: `npm test` läuft und findet Tests. `npm run build:engine` existiert (schlägt bis Task 5 fehl, weil es die Eingabedatei noch nicht gibt — das ist in Ordnung und wird in Task 5 behoben).

- [ ] **Step 1: Git-Repo anlegen**

```bash
cd "C:/Users/Max/claud/signalforge" && git init -b main
```

- [ ] **Step 2: `.gitignore` schreiben**

```gitignore
node_modules/
dist/
out/
scratch/
*.log
.DS_Store
```

- [ ] **Step 3: `package.json` schreiben**

```json
{
  "name": "signalforge",
  "version": "0.1.0",
  "description": "Build SignalRGB lighting effects from images, videos, gradients and shapes.",
  "license": "GPL-3.0-or-later",
  "type": "module",
  "private": true,
  "engines": {
    "node": ">=20"
  },
  "scripts": {
    "build:engine": "esbuild src/engine/index.js --bundle --format=iife --global-name=SignalForgeEngine --outfile=dist/engine.bundle.js",
    "pretest": "npm run build:engine",
    "test": "node --test"
  },
  "dependencies": {},
  "devDependencies": {
    "electron": "43.3.0",
    "esbuild": "0.28.2"
  }
}
```

`dependencies` bleibt dauerhaft leer — der Motor kommt ohne Fremdcode aus. Electron und esbuild sind reine Bauwerkzeuge.

- [ ] **Step 4: Lizenz holen**

```bash
curl -fsSL -o LICENSE https://www.gnu.org/licenses/gpl-3.0.txt
```

Prüfen: `head -3 LICENSE` muss `GNU GENERAL PUBLIC LICENSE` enthalten.

- [ ] **Step 5: Dateikopf festlegen**

`docs/HEADER.txt` — kommt an den Anfang jeder neuen Quelldatei:

```
// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
```

- [ ] **Step 6: README schreiben**

`README.md`, englisch, mit dem Markenhinweis aus Risiko R5:

```markdown
# SignalForge

Build your own SignalRGB lighting effects from **images and video** — not just
geometric shapes.

SignalRGB can play effects but not create them. The community tools that exist only
handle shapes; nothing lets you turn a photo or a video clip into lighting.
SignalForge does.

**Status:** early development. Nothing to install yet.

## Why images matter

A SignalRGB effect is a 320x200 web page. SignalRGB overlays your device layout and
samples the colour under every LED. So any picture you can draw becomes lighting —
your own photos included.

## Licence

GPLv3. See `LICENSE`.

## Not affiliated with SignalRGB

SignalForge is an independent community project. It is not made by, endorsed by, or
affiliated with WhirlwindFX or SignalRGB. It writes standard effect files into the
folder SignalRGB reads; it does not modify SignalRGB itself.
```

- [ ] **Step 7: Rauchtest schreiben**

`test/smoke.test.js` — beweist nur, dass der Testläufer läuft:

```js
// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';

test('test runner is wired up', () => {
  assert.equal(1 + 1, 2);
});
```

- [ ] **Step 8: Abhängigkeiten installieren**

```bash
cd "C:/Users/Max/claud/signalforge" && npm install
```

Erwartet: Electron lädt rund 100 MB herunter, das dauert. Danach existiert `node_modules/electron/`.

- [ ] **Step 9: Testläufer prüfen**

```bash
npm test --prefix "C:/Users/Max/claud/signalforge" 2>&1 | tail -20
```

Erwartet: `pretest` schlägt fehl, weil `src/engine/index.js` noch nicht existiert (`Could not resolve`). Das ist der erwartete Zustand. Zum Gegenbeweis, dass der Läufer selbst geht:

```bash
cd "C:/Users/Max/claud/signalforge" && node --test test/smoke.test.js
```

Erwartet: `pass 1`.

- [ ] **Step 10: Commit**

```bash
cd "C:/Users/Max/claud/signalforge" && git add -A && git commit -m "chore: scaffold repository, GPLv3, node:test runner"
```

---

### Task 2: Dokumentmodell

**Files:**
- Create: `src/engine/document.js`
- Test: `test/engine/document.test.js`

**Interfaces:**
- Consumes: nichts
- Produces:
  - `CANVAS_WIDTH = 320`, `CANVAS_HEIGHT = 200`
  - `BLEND_MODES` — Objekt `{ normal:'source-over', add:'lighter', multiply:'multiply', screen:'screen', lighten:'lighten' }`
  - `FIT_MODES = ['cover','stretch','contain']`, `MOTION_KINDS = ['none','warp','drift','breathe']`
  - `normalizeDocument(raw) -> { doc, problems }` — `problems` ist ein Array englischer Meldungen
  - `clamp(value, lo, hi) -> number`

- [ ] **Step 1: Test schreiben**

`test/engine/document.test.js`:

```js
// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDocument, BLEND_MODES, CANVAS_WIDTH, CANVAS_HEIGHT } from '../../src/engine/document.js';

test('canvas size is fixed at 320x200', () => {
  assert.equal(CANVAS_WIDTH, 320);
  assert.equal(CANVAS_HEIGHT, 200);
});

test('empty input produces a valid empty document', () => {
  const { doc, problems } = normalizeDocument(undefined);
  assert.equal(doc.version, 1);
  assert.equal(doc.name, 'Untitled');
  assert.deepEqual(doc.layers, []);
  assert.deepEqual(doc.controls, []);
  assert.deepEqual(doc.assets, {});
  assert.deepEqual(problems, []);
});

test('image layer gets full defaults', () => {
  const { doc } = normalizeDocument({ layers: [{ type: 'image', asset: 'a' }] });
  const layer = doc.layers[0];
  assert.equal(layer.id, 'layer-0');
  assert.equal(layer.visible, true);
  assert.equal(layer.opacity, 1);
  assert.equal(layer.blend, 'normal');
  assert.equal(layer.fit, 'cover');
  assert.deepEqual(layer.offset, { x: 0, y: 0 });
  assert.deepEqual(layer.motion, { kind: 'none', speed: 15, amount: 30 });
});

test('unknown blend falls back to normal and is reported', () => {
  const { doc, problems } = normalizeDocument({ layers: [{ id: 'x', type: 'image', blend: 'burn' }] });
  assert.equal(doc.layers[0].blend, 'normal');
  assert.equal(problems.length, 1);
  assert.match(problems[0], /blend/);
});

test('opacity is clamped into 0..1', () => {
  const { doc } = normalizeDocument({ layers: [{ type: 'image', opacity: 5 }, { type: 'image', opacity: -2 }] });
  assert.equal(doc.layers[0].opacity, 1);
  assert.equal(doc.layers[1].opacity, 0);
});

test('offset is clamped into -1..1', () => {
  const { doc } = normalizeDocument({ layers: [{ type: 'image', offset: { x: 9, y: -9 } }] });
  assert.deepEqual(doc.layers[0].offset, { x: 1, y: -1 });
});

test('duplicate layer ids are made unique and reported', () => {
  const { doc, problems } = normalizeDocument({
    layers: [{ id: 'same', type: 'image' }, { id: 'same', type: 'image' }]
  });
  assert.notEqual(doc.layers[0].id, doc.layers[1].id);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /duplicate/i);
});

test('control labels must be ASCII', () => {
  const { doc, problems } = normalizeDocument({
    controls: [{ property: 'speed', label: { de: 'Staerke', en: 'Strength' }, type: 'number' },
               { property: 'x', label: { de: 'Stärke', en: 'Strength' }, type: 'number' }]
  });
  assert.equal(doc.controls.length, 2);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /ASCII/);
});

test('control property must be a valid javascript identifier', () => {
  const { problems } = normalizeDocument({
    controls: [{ property: '2speed', label: { de: 'A', en: 'A' }, type: 'number' }]
  });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /identifier/i);
});

test('blend mode table maps onto canvas composite operations', () => {
  assert.equal(BLEND_MODES.normal, 'source-over');
  assert.equal(BLEND_MODES.add, 'lighter');
  assert.equal(Object.keys(BLEND_MODES).length, 5);
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

```bash
cd "C:/Users/Max/claud/signalforge" && node --test test/engine/document.test.js
```

Erwartet: FAIL, `Cannot find module … src/engine/document.js`.

- [ ] **Step 3: Umsetzung schreiben**

`src/engine/document.js`:

```js
// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later

/** The canvas SignalRGB samples. Never hardcode these numbers elsewhere. */
export const CANVAS_WIDTH = 320;
export const CANVAS_HEIGHT = 200;

/** Document blend name -> canvas globalCompositeOperation. */
export const BLEND_MODES = Object.freeze({
  normal: 'source-over',
  add: 'lighter',
  multiply: 'multiply',
  screen: 'screen',
  lighten: 'lighten'
});

export const FIT_MODES = Object.freeze(['cover', 'stretch', 'contain']);
export const MOTION_KINDS = Object.freeze(['none', 'warp', 'drift', 'breathe']);
export const CONTROL_TYPES = Object.freeze(['number', 'boolean', 'color', 'combobox']);

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const ASCII_PRINTABLE = /^[\x20-\x7E]*$/;

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

  if (type !== 'image') return base;

  let fit = str(input.fit, 'cover');
  if (!FIT_MODES.includes(fit)) {
    problems.push(`Layer "${id}": unknown fit "${fit}", using "cover".`);
    fit = 'cover';
  }

  const motionInput = input.motion && typeof input.motion === 'object' ? input.motion : {};
  let kind = str(motionInput.kind, 'none');
  if (!MOTION_KINDS.includes(kind)) {
    problems.push(`Layer "${id}": unknown motion "${kind}", using "none".`);
    kind = 'none';
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
    motion: {
      kind,
      speed: clamp(num(motionInput.speed, 15), 0, 100),
      amount: clamp(num(motionInput.amount, 30), 0, 100)
    }
  };
}

function normalizeControl(raw, index, problems) {
  const input = raw && typeof raw === 'object' ? raw : {};
  const property = str(input.property, '');
  if (!IDENTIFIER.test(property)) {
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
  for (const [id, value] of Object.entries(assetsInput)) assets[id] = normalizeAsset(value);

  const doc = {
    version: 1,
    name: str(input.name, '').trim() || 'Untitled',
    description: str(input.description, ''),
    publisher: str(input.publisher, ''),
    layers,
    controls,
    assets
  };

  return { doc, problems };
}
```

- [ ] **Step 4: Test laufen lassen**

```bash
cd "C:/Users/Max/claud/signalforge" && node --test test/engine/document.test.js
```

Erwartet: `pass 10`, `fail 0`.

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/Max/claud/signalforge" && git add src/engine/document.js test/engine/document.test.js && git commit -m "feat(engine): document model with defaults and validation"
```

---

### Task 3: Ausschnitt-Mathematik

**Files:**
- Create: `src/engine/util/fit.js`
- Test: `test/engine/fit.test.js`

**Interfaces:**
- Consumes: `clamp` aus `src/engine/document.js`
- Produces: `computeSourceRect({ srcW, srcH, dstW, dstH, fit, offsetX, offsetY }) -> { sx, sy, sw, sh, dx, dy, dw, dh }`. `s*` ist der Ausschnitt im Quellbild, `d*` das Ziel auf der Zeichenfläche — genau die acht Werte, die `ctx.drawImage` in der Neun-Argument-Form braucht.

- [ ] **Step 1: Test schreiben**

`test/engine/fit.test.js`:

```js
// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { computeSourceRect } from '../../src/engine/util/fit.js';

const CANVAS = { dstW: 320, dstH: 200 };

test('stretch uses the whole source and the whole destination', () => {
  const r = computeSourceRect({ srcW: 100, srcH: 50, ...CANVAS, fit: 'stretch' });
  assert.deepEqual(r, { sx: 0, sy: 0, sw: 100, sh: 50, dx: 0, dy: 0, dw: 320, dh: 200 });
});

test('cover on a wide source crops the sides, centred by default', () => {
  // 488x200 is the prototype working image: aspect 2.44 against 1.6.
  const r = computeSourceRect({ srcW: 488, srcH: 200, ...CANVAS, fit: 'cover' });
  assert.equal(r.sh, 200);
  assert.equal(r.sw, 320);
  assert.equal(r.sx, 84);
  assert.equal(r.sy, 0);
  assert.equal(r.dw, 320);
  assert.equal(r.dh, 200);
});

test('cover offset -1 pins to the left edge, +1 to the right', () => {
  const left = computeSourceRect({ srcW: 488, srcH: 200, ...CANVAS, fit: 'cover', offsetX: -1 });
  const right = computeSourceRect({ srcW: 488, srcH: 200, ...CANVAS, fit: 'cover', offsetX: 1 });
  assert.equal(left.sx, 0);
  assert.equal(right.sx, 168);
});

test('cover offset beyond the range is clamped, never off the image', () => {
  const r = computeSourceRect({ srcW: 488, srcH: 200, ...CANVAS, fit: 'cover', offsetX: 4 });
  assert.equal(r.sx, 168);
  assert.ok(r.sx + r.sw <= 488);
});

test('cover on a tall source crops top and bottom', () => {
  const r = computeSourceRect({ srcW: 100, srcH: 100, ...CANVAS, fit: 'cover' });
  assert.equal(r.sw, 100);
  assert.equal(r.sh, 62.5);
  assert.equal(r.sy, 18.75);
});

test('contain letterboxes instead of cropping', () => {
  const r = computeSourceRect({ srcW: 488, srcH: 200, ...CANVAS, fit: 'contain' });
  assert.equal(r.sw, 488);
  assert.equal(r.sh, 200);
  assert.equal(r.dw, 320);
  assert.ok(Math.abs(r.dh - 131.147) < 0.01);
  assert.ok(Math.abs(r.dy - 34.426) < 0.01);
  assert.equal(r.dx, 0);
});

test('matching aspect ratios crop nothing', () => {
  const r = computeSourceRect({ srcW: 640, srcH: 400, ...CANVAS, fit: 'cover' });
  assert.equal(r.sx, 0);
  assert.equal(r.sy, 0);
  assert.equal(r.sw, 640);
  assert.equal(r.sh, 400);
});

test('zero or negative sizes are rejected loudly', () => {
  assert.throws(() => computeSourceRect({ srcW: 0, srcH: 10, ...CANVAS, fit: 'cover' }), /positive/);
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

```bash
cd "C:/Users/Max/claud/signalforge" && node --test test/engine/fit.test.js
```

Erwartet: FAIL, Modul nicht gefunden.

- [ ] **Step 3: Umsetzung schreiben**

`src/engine/util/fit.js`:

```js
// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import { clamp } from '../document.js';

/**
 * Work out which part of a source image goes where on the canvas.
 * Returns the eight values ctx.drawImage() wants in its nine-argument form.
 *
 * offsetX / offsetY run from -1 to +1 and slide the crop window across the
 * slack that cropping leaves over. They do nothing when there is no slack.
 */
export function computeSourceRect({ srcW, srcH, dstW, dstH, fit = 'cover', offsetX = 0, offsetY = 0 }) {
  if (!(srcW > 0 && srcH > 0 && dstW > 0 && dstH > 0)) {
    throw new Error('computeSourceRect: all sizes must be positive');
  }

  if (fit === 'stretch') {
    return { sx: 0, sy: 0, sw: srcW, sh: srcH, dx: 0, dy: 0, dw: dstW, dh: dstH };
  }

  const srcAspect = srcW / srcH;
  const dstAspect = dstW / dstH;

  if (fit === 'contain') {
    let dw;
    let dh;
    if (srcAspect > dstAspect) {
      dw = dstW;
      dh = dstW / srcAspect;
    } else {
      dh = dstH;
      dw = dstH * srcAspect;
    }
    return { sx: 0, sy: 0, sw: srcW, sh: srcH, dx: (dstW - dw) / 2, dy: (dstH - dh) / 2, dw, dh };
  }

  // cover
  let sw;
  let sh;
  if (srcAspect > dstAspect) {
    sh = srcH;
    sw = srcH * dstAspect;
  } else {
    sw = srcW;
    sh = srcW / dstAspect;
  }

  const slackX = srcW - sw;
  const slackY = srcH - sh;
  const sx = (slackX * (clamp(offsetX, -1, 1) + 1)) / 2;
  const sy = (slackY * (clamp(offsetY, -1, 1) + 1)) / 2;

  return { sx, sy, sw, sh, dx: 0, dy: 0, dw: dstW, dh: dstH };
}
```

- [ ] **Step 4: Test laufen lassen**

```bash
cd "C:/Users/Max/claud/signalforge" && node --test test/engine/fit.test.js
```

Erwartet: `pass 8`, `fail 0`.

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/Max/claud/signalforge" && git add src/engine/util/fit.js test/engine/fit.test.js && git commit -m "feat(engine): cover/stretch/contain source rect maths"
```

---

### Task 4: Wabern-Feld

Die Wellen, die das Bild verziehen. Getrennt in Zeilen- und Spaltenanteil — dadurch braucht ein Bild rund 260 Sinus-Rechnungen statt 100 000. Der Prototyp hat dieses Verfahren bei 1,58 ms pro Bild gemessen.

**Files:**
- Create: `src/engine/motion/warp.js`
- Test: `test/engine/warp.test.js`

**Interfaces:**
- Consumes: nichts
- Produces:
  - `WARP_PEAK_FACTOR = 2` — der größtmögliche Versatz ist `amplitude * WARP_PEAK_FACTOR`. Task 7 verlässt sich darauf, um seinen Puffer breit genug zu machen.
  - `createWarpField(width, height) -> { rowDX, rowDY, colDX, colDY, update(timeSec, amplitude) }`. Der Versatz eines Punktes ist `rowDX[y] + colDX[x]` waagerecht und `rowDY[y] + colDY[x]` senkrecht.

- [ ] **Step 1: Test schreiben**

`test/engine/warp.test.js`:

```js
// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { createWarpField, WARP_PEAK_FACTOR } from '../../src/engine/motion/warp.js';

const peak = (array) => array.reduce((m, v) => Math.max(m, Math.abs(v)), 0);

test('amplitude zero means no displacement at all', () => {
  const field = createWarpField(160, 100);
  field.update(12.5, 0);
  assert.equal(peak(field.rowDX), 0);
  assert.equal(peak(field.rowDY), 0);
  assert.equal(peak(field.colDX), 0);
  assert.equal(peak(field.colDY), 0);
});

test('same time gives the same field — the engine must be deterministic', () => {
  const a = createWarpField(160, 100);
  const b = createWarpField(160, 100);
  a.update(7.25, 3);
  b.update(7.25, 3);
  assert.deepEqual(Array.from(a.rowDX), Array.from(b.rowDX));
  assert.deepEqual(Array.from(a.colDY), Array.from(b.colDY));
});

test('the field actually moves over time', () => {
  const field = createWarpField(160, 100);
  field.update(0, 3);
  const before = Array.from(field.rowDX);
  field.update(9, 3);
  const after = Array.from(field.rowDX);
  assert.notDeepEqual(before, after);
});

test('displacement never exceeds amplitude * WARP_PEAK_FACTOR', () => {
  const field = createWarpField(160, 100);
  const amplitude = 5;
  const limit = amplitude * WARP_PEAK_FACTOR + 1e-4;
  for (let t = 0; t < 60; t += 0.37) {
    field.update(t, amplitude);
    assert.ok(peak(field.rowDX) + peak(field.colDX) <= limit, `x overflow at t=${t}`);
    assert.ok(peak(field.rowDY) + peak(field.colDY) <= limit, `y overflow at t=${t}`);
  }
});

test('field arrays match the requested size', () => {
  const field = createWarpField(160, 100);
  assert.equal(field.rowDX.length, 100);
  assert.equal(field.colDX.length, 160);
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

```bash
cd "C:/Users/Max/claud/signalforge" && node --test test/engine/warp.test.js
```

Erwartet: FAIL, Modul nicht gefunden.

- [ ] **Step 3: Umsetzung schreiben**

`src/engine/motion/warp.js`:

```js
// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Largest displacement the field can produce, as a multiple of amplitude.
 * The per-row and per-column coefficients below add up to exactly this on
 * both axes. Callers size their padding from it.
 */
export const WARP_PEAK_FACTOR = 2;

/**
 * A slow organic warp built from overlaid sine waves.
 *
 * The displacement is split into a row part and a column part, so one frame
 * costs (height + width) trig calls instead of height * width. Frequencies are
 * deliberately unrelated to each other so no visible pattern repeats.
 */
export function createWarpField(width, height) {
  const rowDX = new Float32Array(height);
  const rowDY = new Float32Array(height);
  const colDX = new Float32Array(width);
  const colDY = new Float32Array(width);

  return {
    rowDX,
    rowDY,
    colDX,
    colDY,
    update(timeSec, amplitude) {
      for (let y = 0; y < height; y += 1) {
        rowDX[y] = amplitude * (Math.sin(y * 0.055 + timeSec * 0.31)
          + 0.55 * Math.sin(y * 0.021 - timeSec * 0.19 + 1.7));
        rowDY[y] = amplitude * (0.50 * Math.cos(y * 0.037 + timeSec * 0.23 + 0.9));
      }
      for (let x = 0; x < width; x += 1) {
        colDX[x] = amplitude * (0.45 * Math.sin(x * 0.029 + timeSec * 0.13 + 2.4));
        colDY[x] = amplitude * (Math.cos(x * 0.041 - timeSec * 0.27)
          + 0.50 * Math.cos(x * 0.017 + timeSec * 0.16 + 0.4));
      }
    }
  };
}
```

Die Koeffizienten summieren sich absichtlich auf genau 2 je Achse: waagerecht `1 + 0.55 + 0.45`, senkrecht `0.50 + 1 + 0.50`. Der Prototyp hatte senkrecht `0.60` und lag damit bei 2,1 — knapp über der eigenen Zusage. Hier korrigiert.

- [ ] **Step 4: Test laufen lassen**

```bash
cd "C:/Users/Max/claud/signalforge" && node --test test/engine/warp.test.js
```

Erwartet: `pass 5`, `fail 0`.

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/Max/claud/signalforge" && git add src/engine/motion/warp.js test/engine/warp.test.js && git commit -m "feat(engine): separable sine warp field"
```

---

### Task 5: Motorkern und Render-Prüfstand

Der Kern, der Ebenen übereinanderlegt — und der Prüfstand, der ihn in echtem Chromium rendern lässt. Ohne den Prüfstand ließe sich ab hier nichts mehr beweisen, weil Node keine Zeichenfläche hat.

**Files:**
- Create: `src/engine/layers/index.js`, `src/engine/engine.js`, `src/engine/index.js`
- Create: `test/harness/electron-main.cjs`, `test/harness/page.html`, `test/harness/render.js`, `test/harness/pixels.js`
- Test: `test/engine/engine-core.test.js`

**Interfaces:**
- Consumes: `normalizeDocument`, `BLEND_MODES`, `CANVAS_WIDTH`, `CANVAS_HEIGHT` (Task 2)
- Produces:
  - `LAYER_RENDERERS` — `Map<string, { createState(), render(ctx, layer, asset, timeSec, state) }>`, `registerLayer(type, renderer)`
  - `createRenderer() -> { render(ctx, doc, assets, timeSec), dispose() }`
  - `loadAssets(doc, { resolveUrl }) -> Promise<Map<string, { kind, element, width, height }>>`
  - `src/engine/index.js` — der Bündelpunkt; alles daraus liegt zur Laufzeit unter `window.SignalForgeEngine`
  - Prüfstand: `runJobs(jobs) -> Promise<results>` aus `test/harness/render.js`; Auswertehilfen `meanBrightness`, `pixelAt`, `maxDifference` aus `test/harness/pixels.js`

- [ ] **Step 1: Auswertehilfen schreiben**

`test/harness/pixels.js` — reine Rechnerei auf rohen RGBA-Bytes, ohne Chromium testbar:

```js
// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later

/** Decode the base64 RGBA blob the harness page returns. */
export function decodePixels(base64) {
  return new Uint8Array(Buffer.from(base64, 'base64'));
}

export function pixelAt(pixels, width, x, y) {
  const i = (y * width + x) * 4;
  return { r: pixels[i], g: pixels[i + 1], b: pixels[i + 2], a: pixels[i + 3] };
}

export function meanBrightness(pixels) {
  let sum = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    sum += (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3;
  }
  return sum / (pixels.length / 4);
}

/** Largest per-channel difference between two equally sized frames. */
export function maxDifference(a, b) {
  if (a.length !== b.length) throw new Error('maxDifference: frames differ in size');
  let max = 0;
  for (let i = 0; i < a.length; i += 1) {
    const d = Math.abs(a[i] - b[i]);
    if (d > max) max = d;
  }
  return max;
}

/** Mean per-channel difference. Small values mean "visually identical". */
export function meanDifference(a, b) {
  if (a.length !== b.length) throw new Error('meanDifference: frames differ in size');
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) sum += Math.abs(a[i] - b[i]);
  return sum / a.length;
}

/** True when the colour is within tolerance of the expected one. */
export function isColour(actual, expected, tolerance = 12) {
  return Math.abs(actual.r - expected[0]) <= tolerance
    && Math.abs(actual.g - expected[1]) <= tolerance
    && Math.abs(actual.b - expected[2]) <= tolerance;
}
```

- [ ] **Step 2: Prüfstandsseite schreiben**

`test/harness/page.html` — lädt das gebündelte Motorpaket und stellt `__run` bereit:

```html
<!doctype html>
<meta charset="utf-8" />
<title>SignalForge render harness</title>
<body style="margin:0;padding:0;background:#000">
  <canvas id="exCanvas" width="320" height="200"></canvas>
</body>
<script src="../../dist/engine.bundle.js"></script>
<script>
  const canvas = document.getElementById('exCanvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  function grab() {
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let binary = '';
    const bytes = image.data;
    for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
    return { width: canvas.width, height: canvas.height, pixels: btoa(binary) };
  }

  window.__run = async function (job) {
    const { createRenderer, loadAssets, normalizeDocument } = window.SignalForgeEngine;
    const { doc } = normalizeDocument(job.doc);
    const assets = await loadAssets(doc, {
      resolveUrl: (asset) => (asset.data ? `data:${asset.mime};base64,${asset.data}` : asset.file)
    });
    const renderer = createRenderer();
    // Render twice so any lazily built scratch buffers exist for the measured frame.
    renderer.render(ctx, doc, assets, job.timeSec);
    renderer.render(ctx, doc, assets, job.timeSec);
    const result = grab();
    renderer.dispose();
    return result;
  };

  window.__grab = grab;
</script>
```

- [ ] **Step 3: Electron-Hauptskript des Prüfstands schreiben**

`test/harness/electron-main.cjs` — bewusst CommonJS, damit `"type": "module"` nicht hineinfunkt:

```js
// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

// Software rendering keeps results reproducible across machines.
app.disableHardwareAcceleration();

const jobFile = process.argv[2];
const outFile = process.argv[3];

async function main() {
  const { jobs } = JSON.parse(fs.readFileSync(jobFile, 'utf8'));
  const win = new BrowserWindow({
    show: false,
    width: 400,
    height: 300,
    webPreferences: { offscreen: false, backgroundThrottling: false }
  });

  const results = [];
  for (const job of jobs) {
    if (job.kind === 'html') {
      // Load an exported effect file and read its canvas back.
      await win.loadFile(job.file);
      await new Promise((resolve) => setTimeout(resolve, job.settleMs ?? 120));
      const value = await win.webContents.executeJavaScript(`(() => {
        const c = document.getElementById('exCanvas');
        const g = c.getContext('2d', { willReadFrequently: true });
        const d = g.getImageData(0, 0, c.width, c.height).data;
        let s = '';
        for (let i = 0; i < d.length; i += 1) s += String.fromCharCode(d[i]);
        return { width: c.width, height: c.height, pixels: btoa(s) };
      })()`);
      results.push({ name: job.name, ...value });
    } else {
      await win.loadFile(path.join(__dirname, 'page.html'));
      const value = await win.webContents.executeJavaScript(
        `window.__run(${JSON.stringify(job)})`
      );
      results.push({ name: job.name, ...value });
    }
  }

  fs.writeFileSync(outFile, JSON.stringify(results), 'utf8');
  app.quit();
}

app.whenReady().then(main).catch((error) => {
  fs.writeFileSync(outFile, JSON.stringify({ error: String(error && error.stack || error) }), 'utf8');
  app.exit(1);
});
```

- [ ] **Step 4: Node-Seite des Prüfstands schreiben**

`test/harness/render.js`:

```js
// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { decodePixels } from './pixels.js';

const here = dirname(fileURLToPath(import.meta.url));
const electronBinary = createRequire(import.meta.url)('electron');

/**
 * Render a batch of jobs in one Electron launch and return their pixels.
 *
 * Batching matters: starting Electron costs a second or two, running a job
 * costs milliseconds. Always pass every job a test needs in one call.
 */
export async function runJobs(jobs) {
  const dir = mkdtempSync(join(tmpdir(), 'signalforge-harness-'));
  const jobFile = join(dir, 'jobs.json');
  const outFile = join(dir, 'out.json');
  writeFileSync(jobFile, JSON.stringify({ jobs }), 'utf8');

  try {
    await new Promise((resolve, reject) => {
      const child = spawn(electronBinary, [join(here, 'electron-main.cjs'), jobFile, outFile], {
        stdio: ['ignore', 'pipe', 'pipe']
      });
      let stderr = '';
      child.stderr.on('data', (chunk) => { stderr += chunk; });
      child.on('error', reject);
      child.on('exit', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`harness exited with ${code}\n${stderr}`));
      });
    });

    const raw = JSON.parse(readFileSync(outFile, 'utf8'));
    if (raw.error) throw new Error(`harness page failed: ${raw.error}`);
    return raw.map((entry) => ({
      name: entry.name,
      width: entry.width,
      height: entry.height,
      pixels: decodePixels(entry.pixels)
    }));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
```

- [ ] **Step 5: Test schreiben**

`test/engine/engine-core.test.js`:

```js
// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { runJobs } from '../harness/render.js';
import { meanBrightness, pixelAt } from '../harness/pixels.js';

test('engine renders a 320x200 canvas and clears unknown layers to black', async (t) => {
  t.diagnostic('launches Electron once for both jobs');
  const [empty, unknown] = await runJobs([
    { name: 'empty', kind: 'engine', doc: { layers: [] }, timeSec: 0 },
    { name: 'unknown', kind: 'engine', doc: { layers: [{ type: 'does-not-exist' }] }, timeSec: 3 }
  ]);

  assert.equal(empty.width, 320);
  assert.equal(empty.height, 200);
  assert.equal(meanBrightness(empty.pixels), 0);
  assert.deepEqual(pixelAt(empty.pixels, 320, 0, 0), { r: 0, g: 0, b: 0, a: 255 });

  // An unknown layer type must be skipped, not crash the whole effect.
  assert.equal(meanBrightness(unknown.pixels), 0);
});
```

- [ ] **Step 6: Test laufen lassen, Fehlschlag bestätigen**

```bash
cd "C:/Users/Max/claud/signalforge" && node --test test/engine/engine-core.test.js
```

Erwartet: FAIL — `src/engine/index.js` fehlt, also gibt es kein Bündel.

- [ ] **Step 7: Ebenen-Verzeichnis schreiben**

`src/engine/layers/index.js`:

```js
// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * type -> { createState(), render(ctx, layer, asset, timeSec, state) }
 *
 * Adding a layer type means adding a file and one registerLayer call.
 * Nothing existing has to change.
 */
export const LAYER_RENDERERS = new Map();

export function registerLayer(type, renderer) {
  if (typeof renderer.render !== 'function') {
    throw new Error(`registerLayer("${type}"): render must be a function`);
  }
  LAYER_RENDERERS.set(type, {
    createState: renderer.createState ?? (() => ({})),
    render: renderer.render
  });
}
```

- [ ] **Step 8: Motorkern schreiben**

`src/engine/engine.js`:

```js
// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import { BLEND_MODES, CANVAS_WIDTH, CANVAS_HEIGHT } from './document.js';
import { LAYER_RENDERERS } from './layers/index.js';

/**
 * Turn the document's assets into things a canvas can draw.
 * resolveUrl decides where the bytes come from: an embedded data URI in the
 * exported effect, or a sibling file next to it.
 */
export async function loadAssets(doc, { resolveUrl }) {
  const assets = new Map();
  const pending = [];

  for (const [id, asset] of Object.entries(doc.assets)) {
    const url = resolveUrl(asset);
    if (asset.kind === 'image') {
      pending.push(new Promise((resolve) => {
        const element = new Image();
        element.onload = () => {
          assets.set(id, {
            kind: 'image',
            element,
            width: element.naturalWidth,
            height: element.naturalHeight
          });
          resolve();
        };
        // A broken asset must not stop the whole effect from starting.
        element.onerror = () => resolve();
        element.src = url;
      }));
    }
  }

  await Promise.all(pending);
  return assets;
}

/**
 * A renderer instance. It owns the per-layer scratch buffers, which is why
 * this is a factory and not a bare function.
 *
 * render() is a pure function of (doc, assets, timeSec) as far as output goes:
 * the same inputs always produce the same frame. It never reads the clock.
 */
export function createRenderer() {
  const states = new Map();

  function stateFor(layer, renderer) {
    const existing = states.get(layer.id);
    if (existing && existing.type === layer.type) return existing.value;
    const value = renderer.createState();
    states.set(layer.id, { type: layer.type, value });
    return value;
  }

  return {
    render(ctx, doc, assets, timeSec) {
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      for (const layer of doc.layers) {
        if (!layer.visible || layer.opacity === 0) continue;
        const renderer = LAYER_RENDERERS.get(layer.type);
        if (!renderer) continue;

        ctx.globalAlpha = layer.opacity;
        ctx.globalCompositeOperation = BLEND_MODES[layer.blend];
        const asset = layer.asset ? assets.get(layer.asset) : null;
        renderer.render(ctx, layer, asset, timeSec, stateFor(layer, renderer));
      }

      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    },

    dispose() {
      states.clear();
    }
  };
}
```

- [ ] **Step 9: Bündelpunkt schreiben**

`src/engine/index.js`:

```js
// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
export {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  BLEND_MODES,
  FIT_MODES,
  MOTION_KINDS,
  CONTROL_TYPES,
  clamp,
  normalizeDocument
} from './document.js';

export { createRenderer, loadAssets } from './engine.js';
export { LAYER_RENDERERS, registerLayer } from './layers/index.js';
export { computeSourceRect } from './util/fit.js';
export { createWarpField, WARP_PEAK_FACTOR } from './motion/warp.js';
```

- [ ] **Step 10: Bündeln und Test laufen lassen**

```bash
cd "C:/Users/Max/claud/signalforge" && npm run build:engine && node --test test/engine/engine-core.test.js
```

Erwartet: `dist/engine.bundle.js` entsteht, dann `pass 1`, `fail 0`. Der erste Lauf dauert wegen Electron-Start ein paar Sekunden.

- [ ] **Step 11: Commit**

```bash
cd "C:/Users/Max/claud/signalforge" && git add src/engine test/harness test/engine/engine-core.test.js package.json && git commit -m "feat(engine): layer compositor plus Electron render harness"
```

---

### Task 6: Bildebene ohne Verzerrung

Die drei einfachen Bewegungsarten: `none`, `breathe`, `drift`. `warp` kommt in Task 7 dazu, weil es einen ganz anderen Rechenweg braucht und für sich abnehmbar sein soll.

**Files:**
- Create: `src/engine/layers/image.js`
- Modify: `src/engine/index.js` (Ebene anmelden)
- Test: `test/engine/image-layer.test.js`

**Interfaces:**
- Consumes: `computeSourceRect` (Task 3), `registerLayer` (Task 5), `clamp` (Task 2)
- Produces: registrierte Ebene `'image'`. Task 7 erweitert `render` um den Zweig `warp` und exportiert dafür zusätzlich `BUFFER_WIDTH`, `BUFFER_HEIGHT`, `BUFFER_PAD`.

- [ ] **Step 1: Test schreiben**

`test/engine/image-layer.test.js`. Das Testbild ist ein echtes 4 × 4-PNG mit vier farbigen Vierteln — rot oben links, grün oben rechts, blau unten links, weiß unten rechts:

```js
// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { runJobs } from '../harness/render.js';
import { meanBrightness, pixelAt, isColour, meanDifference } from '../harness/pixels.js';

// 4x4 PNG: red / green / blue / white quadrants, two pixels each way.
const QUADRANTS = 'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAHklEQVR42mXJsQ0AAAgDIOr/P9fVRFZSkMI4QtE/C5t8BQM0UanVAAAAAElFTkSuQmCC';

// The breathe cycle starts at full brightness and dips. Its darkest point is
// half a cycle in: phase = timeSec * (speed/100) * SPEED_SCALE must equal PI,
// and with speed 100 and SPEED_SCALE 0.6 that lands here.
const BREATHE_DARKEST_AT = Math.PI / 0.6;

function docWith(layer) {
  return {
    assets: { q: { kind: 'image', mime: 'image/png', data: QUADRANTS } },
    layers: [{ type: 'image', asset: 'q', ...layer }]
  };
}

test('image layer draws the picture and honours fit, opacity and motion', async () => {
  const jobs = [
    { name: 'stretch', kind: 'engine', timeSec: 0, doc: docWith({ fit: 'stretch' }) },
    { name: 'half', kind: 'engine', timeSec: 0, doc: docWith({ fit: 'stretch', opacity: 0.5 }) },
    { name: 'contain', kind: 'engine', timeSec: 0, doc: docWith({ fit: 'contain' }) },
    { name: 'still-a', kind: 'engine', timeSec: 0, doc: docWith({ fit: 'stretch', motion: { kind: 'none' } }) },
    { name: 'still-b', kind: 'engine', timeSec: 40, doc: docWith({ fit: 'stretch', motion: { kind: 'none' } }) },
    { name: 'breathe-bright', kind: 'engine', timeSec: 0, doc: docWith({ fit: 'stretch', motion: { kind: 'breathe', speed: 100, amount: 100 } }) },
    { name: 'breathe-dark', kind: 'engine', timeSec: BREATHE_DARKEST_AT, doc: docWith({ fit: 'stretch', motion: { kind: 'breathe', speed: 100, amount: 100 } }) },
    { name: 'drift-a', kind: 'engine', timeSec: 0, doc: docWith({ fit: 'cover', motion: { kind: 'drift', speed: 100, amount: 100 } }) },
    { name: 'drift-b', kind: 'engine', timeSec: 20, doc: docWith({ fit: 'cover', motion: { kind: 'drift', speed: 100, amount: 100 } }) },
    { name: 'missing', kind: 'engine', timeSec: 0, doc: { layers: [{ type: 'image', asset: 'nope' }] } }
  ];
  const byName = Object.fromEntries((await runJobs(jobs)).map((r) => [r.name, r]));

  // Stretch: each corner of the canvas shows its quadrant's colour.
  const s = byName.stretch;
  assert.ok(isColour(pixelAt(s.pixels, 320, 8, 8), [255, 0, 0]), 'top left should be red');
  assert.ok(isColour(pixelAt(s.pixels, 320, 311, 8), [0, 255, 0]), 'top right should be green');
  assert.ok(isColour(pixelAt(s.pixels, 320, 8, 191), [0, 0, 255]), 'bottom left should be blue');
  assert.ok(isColour(pixelAt(s.pixels, 320, 311, 191), [255, 255, 255]), 'bottom right should be white');

  // Opacity 0.5 over black halves the brightness.
  const full = meanBrightness(s.pixels);
  const half = meanBrightness(byName.half.pixels);
  assert.ok(Math.abs(half / full - 0.5) < 0.02, `expected half brightness, got ${half / full}`);

  // Contain letterboxes rather than cropping. The test picture is SQUARE, so on
  // a 320x200 canvas it fills the full height and the bars fall left and right
  // (dw = 200, dx = 60) — not top and bottom.
  assert.deepEqual(pixelAt(byName.contain.pixels, 320, 8, 100), { r: 0, g: 0, b: 0, a: 255 }, 'left bar');
  assert.deepEqual(pixelAt(byName.contain.pixels, 320, 311, 100), { r: 0, g: 0, b: 0, a: 255 }, 'right bar');
  assert.ok(meanBrightness(byName.contain.pixels) > 0, 'something must be drawn between the bars');

  // motion "none" must be perfectly still.
  assert.equal(meanDifference(byName['still-a'].pixels, byName['still-b'].pixels), 0);

  // breathe starts at full brightness and dips to its darkest half a cycle in.
  const bright = meanBrightness(byName['breathe-bright'].pixels);
  assert.ok(Math.abs(bright - full) < 0.5, `breathe at t=0 should be full brightness, got ${bright} vs ${full}`);
  assert.ok(meanBrightness(byName['breathe-dark'].pixels) < full * 0.45);

  // drift moves the picture without changing what is in it.
  const driftDelta = meanDifference(byName['drift-a'].pixels, byName['drift-b'].pixels);
  assert.ok(driftDelta > 1, `drift should move, mean delta was ${driftDelta}`);

  // A missing asset is skipped, not a crash.
  assert.equal(meanBrightness(byName.missing.pixels), 0);
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

```bash
cd "C:/Users/Max/claud/signalforge" && npm run build:engine && node --test test/engine/image-layer.test.js
```

Erwartet: FAIL — nichts wird gezeichnet, die Fläche bleibt schwarz.

- [ ] **Step 3: Umsetzung schreiben**

`src/engine/layers/image.js`:

```js
// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import { CANVAS_WIDTH, CANVAS_HEIGHT, clamp } from '../document.js';
import { computeSourceRect } from '../util/fit.js';

/** Motion speed 0..100 maps onto this many radians per second at full tilt. */
const SPEED_SCALE = 0.6;
/** Drift eats at most this fraction of the source rect to make room to pan. */
const DRIFT_MAX_INSET = 0.12;
/** Breathe dims by at most this fraction at full amount. */
const BREATHE_MAX_DEPTH = 0.7;

export function createState() {
  return { warp: null, source: null, sourceKey: null, buffer: null, bufferCtx: null, imageData: null };
}

/** Slide and shrink the source rect so the picture wanders without deforming. */
function applyDrift(rect, motion, timeSec) {
  const phase = timeSec * (motion.speed / 100) * SPEED_SCALE;
  const inset = (motion.amount / 100) * DRIFT_MAX_INSET;
  const insetX = rect.sw * inset;
  const insetY = rect.sh * inset;
  return {
    ...rect,
    sx: rect.sx + insetX * (1 + Math.sin(phase * 0.37 + 0.4)),
    sy: rect.sy + insetY * (1 + Math.cos(phase * 0.23 + 1.1)),
    sw: rect.sw - 2 * insetX,
    sh: rect.sh - 2 * insetY
  };
}

/** A slow swell between full brightness and BREATHE_MAX_DEPTH below it. */
function breatheFactor(motion, timeSec) {
  const phase = timeSec * (motion.speed / 100) * SPEED_SCALE;
  const depth = (motion.amount / 100) * BREATHE_MAX_DEPTH;
  return 1 - depth * (0.5 - 0.5 * Math.cos(phase));
}

export function render(ctx, layer, asset, timeSec, state) {
  if (!asset || !asset.element) return;

  const motion = layer.motion ?? { kind: 'none', speed: 15, amount: 30 };

  if (motion.kind === 'warp') {
    renderWarped(ctx, layer, asset, timeSec, state, motion);
    return;
  }

  let rect = computeSourceRect({
    srcW: asset.width,
    srcH: asset.height,
    dstW: CANVAS_WIDTH,
    dstH: CANVAS_HEIGHT,
    fit: layer.fit,
    offsetX: layer.offset.x,
    offsetY: layer.offset.y
  });

  if (motion.kind === 'drift') rect = applyDrift(rect, motion, timeSec);

  const previousAlpha = ctx.globalAlpha;
  if (motion.kind === 'breathe') {
    ctx.globalAlpha = clamp(previousAlpha * breatheFactor(motion, timeSec), 0, 1);
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(asset.element, rect.sx, rect.sy, rect.sw, rect.sh, rect.dx, rect.dy, rect.dw, rect.dh);

  ctx.globalAlpha = previousAlpha;
}

/** Filled in by Task 7. Until then warp falls back to a still picture. */
function renderWarped(ctx, layer, asset, timeSec, state, motion) {
  const rect = computeSourceRect({
    srcW: asset.width,
    srcH: asset.height,
    dstW: CANVAS_WIDTH,
    dstH: CANVAS_HEIGHT,
    fit: layer.fit,
    offsetX: layer.offset.x,
    offsetY: layer.offset.y
  });
  ctx.drawImage(asset.element, rect.sx, rect.sy, rect.sw, rect.sh, rect.dx, rect.dy, rect.dw, rect.dh);
}
```

- [ ] **Step 4: Ebene anmelden**

In `src/engine/index.js` ganz oben, vor den `export`-Zeilen, einfügen:

```js
import { registerLayer } from './layers/index.js';
import * as imageLayer from './layers/image.js';

registerLayer('image', imageLayer);
```

- [ ] **Step 5: Test laufen lassen**

```bash
cd "C:/Users/Max/claud/signalforge" && npm run build:engine && node --test test/engine/image-layer.test.js
```

Erwartet: `pass 1`, `fail 0`.

- [ ] **Step 6: Commit**

```bash
cd "C:/Users/Max/claud/signalforge" && git add src/engine test/engine/image-layer.test.js && git commit -m "feat(engine): image layer with none, breathe and drift motion"
```

---

### Task 7: Wabern in der Bildebene

Der teure Rechenweg: für jeden Punkt wird ausgerechnet, von welcher Stelle des Bildes er seine Farbe holt. Gerechnet wird bei halber Kantenlänge und danach weich hochgezogen — bei unscharfen Bildern sieht man das nicht, und es ist viermal billiger.

**Files:**
- Modify: `src/engine/layers/image.js` (`renderWarped` ersetzen, Konstanten ergänzen)
- Test: `test/engine/image-warp.test.js`

**Interfaces:**
- Consumes: `createWarpField`, `WARP_PEAK_FACTOR` (Task 4), `computeSourceRect` (Task 3)
- Produces: `BUFFER_WIDTH = 160`, `BUFFER_HEIGHT = 100`, `BUFFER_PAD = 10` aus `src/engine/layers/image.js`

- [ ] **Step 1: Test schreiben**

`test/engine/image-warp.test.js`:

```js
// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { runJobs } from '../harness/render.js';
import { meanBrightness, meanDifference, pixelAt } from '../harness/pixels.js';

const QUADRANTS = 'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAHklEQVR42mXJsQ0AAAgDIOr/P9fVRFZSkMI4QtE/C5t8BQM0UanVAAAAAElFTkSuQmCC';

function warpDoc(amount, timeSecIgnored) {
  return {
    assets: { q: { kind: 'image', mime: 'image/png', data: QUADRANTS } },
    layers: [{ type: 'image', asset: 'q', fit: 'stretch', motion: { kind: 'warp', speed: 60, amount } }]
  };
}

test('warp moves the picture without draining or blowing out its colours', async () => {
  const jobs = [
    { name: 'still', kind: 'engine', timeSec: 0, doc: { assets: warpDoc(0).assets, layers: [{ type: 'image', asset: 'q', fit: 'stretch', motion: { kind: 'none' } }] } },
    { name: 'zero-a', kind: 'engine', timeSec: 0, doc: warpDoc(0) },
    { name: 'zero-b', kind: 'engine', timeSec: 30, doc: warpDoc(0) },
    { name: 'warp-a', kind: 'engine', timeSec: 0, doc: warpDoc(60) },
    { name: 'warp-b', kind: 'engine', timeSec: 12, doc: warpDoc(60) },
    { name: 'warp-a-again', kind: 'engine', timeSec: 0, doc: warpDoc(60) },
    { name: 'warp-max', kind: 'engine', timeSec: 5, doc: warpDoc(100) }
  ];
  const r = Object.fromEntries((await runJobs(jobs)).map((x) => [x.name, x]));

  // Amount 0 is a still picture, whatever the clock says.
  assert.equal(meanDifference(r['zero-a'].pixels, r['zero-b'].pixels), 0);

  // Same time, same frame — the engine must be deterministic.
  assert.equal(meanDifference(r['warp-a'].pixels, r['warp-a-again'].pixels), 0);

  // Different time, different frame.
  assert.ok(meanDifference(r['warp-a'].pixels, r['warp-b'].pixels) > 1);

  // Warping moves colour around, it does not create or destroy it.
  const still = meanBrightness(r.still.pixels);
  for (const name of ['warp-a', 'warp-b', 'warp-max']) {
    const value = meanBrightness(r[name].pixels);
    assert.ok(Math.abs(value - still) / still < 0.12, `${name} brightness drifted to ${value} from ${still}`);
  }

  // The padded buffer must keep the frame edges filled — no black border creeping in.
  for (const [x, y] of [[0, 0], [319, 0], [0, 199], [319, 199], [160, 0], [0, 100]]) {
    const p = pixelAt(r['warp-max'].pixels, 320, x, y);
    assert.ok(p.r + p.g + p.b > 30, `edge pixel ${x},${y} went black: ${JSON.stringify(p)}`);
  }
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

```bash
cd "C:/Users/Max/claud/signalforge" && npm run build:engine && node --test test/engine/image-warp.test.js
```

Erwartet: FAIL bei „different time, different frame" — der Platzhalter aus Task 6 zeichnet ein Standbild.

- [ ] **Step 3: Konstanten und Importe ergänzen**

Oben in `src/engine/layers/image.js`, nach den vorhandenen Importen:

```js
import { createWarpField, WARP_PEAK_FACTOR } from '../motion/warp.js';

/** Warping is computed at half the canvas edge length and scaled back up. */
export const BUFFER_WIDTH = 160;
export const BUFFER_HEIGHT = 100;
/** Spare border of stretched edge pixels, so warping never pulls in blackness. */
export const BUFFER_PAD = 10;
/** Largest warp amplitude that still fits inside BUFFER_PAD. */
const MAX_AMPLITUDE = BUFFER_PAD / WARP_PEAK_FACTOR;
```

- [ ] **Step 4: Quellpuffer-Bau schreiben**

In `src/engine/layers/image.js` einfügen, vor `renderWarped`:

```js
/**
 * Draw the visible part of the picture into a padded buffer.
 *
 * The padding is real image content wherever the picture extends past the
 * crop, and stretched edge pixels where it does not. Warping then has
 * something to reach into instead of pulling black in from outside.
 */
function buildSource(asset, layer, state) {
  const key = `${layer.asset}|${layer.fit}|${layer.offset.x}|${layer.offset.y}|${asset.width}x${asset.height}`;
  if (state.sourceKey === key && state.source) return state.source;

  const width = BUFFER_WIDTH + 2 * BUFFER_PAD;
  const height = BUFFER_HEIGHT + 2 * BUFFER_PAD;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext('2d', { willReadFrequently: true });
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  g.fillStyle = '#000';
  g.fillRect(0, 0, width, height);

  const rect = computeSourceRect({
    srcW: asset.width,
    srcH: asset.height,
    dstW: BUFFER_WIDTH,
    dstH: BUFFER_HEIGHT,
    fit: layer.fit,
    offsetX: layer.offset.x,
    offsetY: layer.offset.y
  });

  // How many source pixels one buffer pixel is worth.
  const scaleX = rect.sw / rect.dw;
  const scaleY = rect.sh / rect.dh;

  // Reach BUFFER_PAD buffer pixels further out, then clamp to the real image.
  const wantX = rect.sx - BUFFER_PAD * scaleX;
  const wantY = rect.sy - BUFFER_PAD * scaleY;
  const wantW = rect.sw + 2 * BUFFER_PAD * scaleX;
  const wantH = rect.sh + 2 * BUFFER_PAD * scaleY;

  const gotX = Math.max(0, wantX);
  const gotY = Math.max(0, wantY);
  const gotW = Math.min(asset.width, wantX + wantW) - gotX;
  const gotH = Math.min(asset.height, wantY + wantH) - gotY;

  // Anchor on the crop origin, NOT on the want origin. A source pixel s sits at
  // BUFFER_PAD + rect.d? + (s - rect.s?) / scale — that is what puts the crop
  // itself at BUFFER_PAD and lets whatever real content exists beyond it spill
  // into the padding. Measuring from wantX instead shifts everything by one
  // BUFFER_PAD and, in cover mode, pushes the right edge off the buffer.
  const destX = BUFFER_PAD + rect.dx + (gotX - rect.sx) / scaleX;
  const destY = BUFFER_PAD + rect.dy + (gotY - rect.sy) / scaleY;
  const destW = gotW / scaleX;
  const destH = gotH / scaleY;

  g.drawImage(asset.element, gotX, gotY, gotW, gotH, destX, destY, destW, destH);

  // Fill whatever padding the picture did not reach by stretching its edges.
  const left = Math.max(0, Math.ceil(destX));
  const top = Math.max(0, Math.ceil(destY));
  const right = Math.min(width, Math.floor(destX + destW));
  const bottom = Math.min(height, Math.floor(destY + destH));
  const innerW = Math.max(1, right - left);
  const innerH = Math.max(1, bottom - top);

  if (top > 0) g.drawImage(canvas, left, top, innerW, 1, left, 0, innerW, top);
  if (bottom < height) g.drawImage(canvas, left, bottom - 1, innerW, 1, left, bottom, innerW, height - bottom);
  if (left > 0) g.drawImage(canvas, left, 0, 1, height, 0, 0, left, height);
  if (right < width) g.drawImage(canvas, right - 1, 0, 1, height, right, 0, width - right, height);

  const source = { data: g.getImageData(0, 0, width, height).data, width, height };
  state.source = source;
  state.sourceKey = key;
  return source;
}
```

- [ ] **Step 5: `renderWarped` ersetzen**

Die Platzhalter-Fassung aus Task 6 vollständig durch diese ersetzen:

```js
function renderWarped(ctx, layer, asset, timeSec, state, motion) {
  const source = buildSource(asset, layer, state);

  if (!state.buffer) {
    state.buffer = document.createElement('canvas');
    state.buffer.width = BUFFER_WIDTH;
    state.buffer.height = BUFFER_HEIGHT;
    state.bufferCtx = state.buffer.getContext('2d', { willReadFrequently: true });
    state.imageData = state.bufferCtx.createImageData(BUFFER_WIDTH, BUFFER_HEIGHT);
  }
  if (!state.warp) state.warp = createWarpField(BUFFER_WIDTH, BUFFER_HEIGHT);

  const amplitude = (motion.amount / 100) * MAX_AMPLITUDE;
  const phase = timeSec * (motion.speed / 100) * 2.0;
  state.warp.update(phase, amplitude);

  const { rowDX, rowDY, colDX, colDY } = state.warp;
  const src = source.data;
  const srcW = source.width;
  const out = state.imageData.data;
  const maxX = srcW - 1.001;
  const maxY = source.height - 1.001;
  let o = 0;

  for (let y = 0; y < BUFFER_HEIGHT; y += 1) {
    const rdx = rowDX[y];
    const rdy = rowDY[y];
    const baseY = y + BUFFER_PAD;
    for (let x = 0; x < BUFFER_WIDTH; x += 1) {
      let sx = x + BUFFER_PAD + rdx + colDX[x];
      let sy = baseY + rdy + colDY[x];
      if (sx < 0) sx = 0; else if (sx > maxX) sx = maxX;
      if (sy < 0) sy = 0; else if (sy > maxY) sy = maxY;

      const x0 = sx | 0;
      const y0 = sy | 0;
      const fx = sx - x0;
      const fy = sy - y0;
      const gx = 1 - fx;
      const gy = 1 - fy;

      const i00 = (y0 * srcW + x0) * 4;
      const i10 = i00 + 4;
      const i01 = i00 + srcW * 4;
      const i11 = i01 + 4;
      const w00 = gx * gy;
      const w10 = fx * gy;
      const w01 = gx * fy;
      const w11 = fx * fy;

      out[o] = src[i00] * w00 + src[i10] * w10 + src[i01] * w01 + src[i11] * w11;
      out[o + 1] = src[i00 + 1] * w00 + src[i10 + 1] * w10 + src[i01 + 1] * w01 + src[i11 + 1] * w11;
      out[o + 2] = src[i00 + 2] * w00 + src[i10 + 2] * w10 + src[i01 + 2] * w01 + src[i11 + 2] * w11;
      out[o + 3] = 255;
      o += 4;
    }
  }

  state.bufferCtx.putImageData(state.imageData, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(state.buffer, 0, 0, BUFFER_WIDTH, BUFFER_HEIGHT, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
}
```

Die Klemmung auf `srcW - 1.001` ist kein Schönheitsfehler: dadurch ist `x0` höchstens `srcW - 2`, also sind `i10` und `i11` garantiert noch in derselben Zeile. Ohne sie liest die Interpolation am rechten Rand in die nächste Zeile hinein.

- [ ] **Step 6: Test laufen lassen**

```bash
cd "C:/Users/Max/claud/signalforge" && npm run build:engine && node --test test/engine/image-warp.test.js
```

Erwartet: `pass 1`, `fail 0`.

- [ ] **Step 7: Alle Tests laufen lassen**

```bash
cd "C:/Users/Max/claud/signalforge" && npm test 2>&1 | tail -15
```

Erwartet: alles grün.

- [ ] **Step 8: Commit**

```bash
cd "C:/Users/Max/claud/signalforge" && git add src/engine/layers/image.js test/engine/image-warp.test.js && git commit -m "feat(engine): warp motion with padded source buffer"
```

---

### Task 8: Regler-Bindung

Übersetzt die SignalRGB-Reglerwerte in Änderungen am Dokument. Reine Rechnerei, ohne Chromium testbar.

**Files:**
- Create: `src/engine/bind.js`
- Modify: `src/engine/index.js` (mitexportieren)
- Test: `test/engine/bind.test.js`

**Interfaces:**
- Consumes: nichts
- Produces:
  - `getByPath(object, path)` / `setByPath(object, path, value)` mit Punktpfaden wie `layers.0.motion.speed`
  - `resolveLayerPath(doc, path)` — übersetzt `a1.motion.speed` (Ebenen-Kennung) in `layers.0.motion.speed`
  - `applyControls(doc, values) -> doc` — liefert eine geänderte Kopie, das Ausgangsdokument bleibt unberührt

- [ ] **Step 1: Test schreiben**

`test/engine/bind.test.js`:

```js
// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { getByPath, setByPath, resolveLayerPath, applyControls } from '../../src/engine/bind.js';

const base = () => ({
  layers: [
    { id: 'a1', type: 'image', opacity: 1, motion: { kind: 'warp', speed: 15, amount: 30 } },
    { id: 'b2', type: 'image', opacity: 1, motion: { kind: 'warp', speed: 15, amount: 30 } }
  ],
  controls: [
    { property: 'tempo', type: 'number', default: 15, bind: ['a1.motion.speed', 'b2.motion.speed'] },
    { property: 'fade', type: 'number', default: 100, bind: ['a1.opacity'] }
  ]
});

test('getByPath walks dotted paths including array indices', () => {
  assert.equal(getByPath(base(), 'layers.0.motion.speed'), 15);
  assert.equal(getByPath(base(), 'layers.9.motion.speed'), undefined);
  assert.equal(getByPath(base(), 'nope.nope'), undefined);
});

test('setByPath writes through dotted paths', () => {
  const doc = base();
  setByPath(doc, 'layers.1.motion.amount', 77);
  assert.equal(doc.layers[1].motion.amount, 77);
});

test('setByPath refuses to create missing branches', () => {
  const doc = base();
  setByPath(doc, 'layers.0.nothing.here', 1);
  assert.equal(doc.layers[0].nothing, undefined);
});

test('resolveLayerPath turns a layer id into an index path', () => {
  const doc = base();
  assert.equal(resolveLayerPath(doc, 'b2.motion.speed'), 'layers.1.motion.speed');
  assert.equal(resolveLayerPath(doc, 'ghost.motion.speed'), null);
});

test('applyControls writes every bound value', () => {
  const doc = applyControls(base(), { tempo: 90, fade: 40 });
  assert.equal(doc.layers[0].motion.speed, 90);
  assert.equal(doc.layers[1].motion.speed, 90);
  assert.equal(doc.layers[0].opacity, 40);
});

test('applyControls leaves the original document untouched', () => {
  const original = base();
  applyControls(original, { tempo: 90 });
  assert.equal(original.layers[0].motion.speed, 15);
});

test('missing values fall back to the control default', () => {
  const doc = applyControls(base(), {});
  assert.equal(doc.layers[0].motion.speed, 15);
});

test('unknown bindings are ignored rather than throwing', () => {
  const input = base();
  input.controls.push({ property: 'x', type: 'number', default: 1, bind: ['ghost.motion.speed'] });
  assert.doesNotThrow(() => applyControls(input, { x: 5 }));
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

```bash
cd "C:/Users/Max/claud/signalforge" && node --test test/engine/bind.test.js
```

Erwartet: FAIL, Modul nicht gefunden.

- [ ] **Step 3: Umsetzung schreiben**

`src/engine/bind.js`:

```js
// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later

export function getByPath(object, path) {
  let current = object;
  for (const key of path.split('.')) {
    if (current === null || typeof current !== 'object') return undefined;
    current = current[key];
  }
  return current;
}

/**
 * Write a value at a dotted path. Refuses to invent missing branches so a
 * typo in a binding cannot quietly grow junk into the document.
 */
export function setByPath(object, path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  let current = object;
  for (const key of keys) {
    if (current === null || typeof current !== 'object' || !(key in current)) return false;
    current = current[key];
  }
  if (current === null || typeof current !== 'object' || !(last in current)) return false;
  current[last] = value;
  return true;
}

/** "a1.motion.speed" -> "layers.0.motion.speed", or null if there is no such layer. */
export function resolveLayerPath(doc, path) {
  const dot = path.indexOf('.');
  if (dot < 0) return null;
  const layerId = path.slice(0, dot);
  const index = doc.layers.findIndex((layer) => layer.id === layerId);
  if (index < 0) return null;
  return `layers.${index}.${path.slice(dot + 1)}`;
}

/**
 * Apply SignalRGB control values to a copy of the document.
 *
 * values comes from the exported effect's global variables. Anything missing
 * falls back to the control's own default, so a half-configured effect still
 * renders instead of breaking.
 */
export function applyControls(doc, values) {
  const copy = structuredClone(doc);
  for (const control of copy.controls) {
    const raw = Object.prototype.hasOwnProperty.call(values, control.property)
      ? values[control.property]
      : control.default;
    const value = control.type === 'number' ? Number(raw) : raw;
    if (control.type === 'number' && !Number.isFinite(value)) continue;
    for (const binding of control.bind) {
      const path = resolveLayerPath(copy, binding);
      if (path) setByPath(copy, path, value);
    }
  }
  return copy;
}
```

- [ ] **Step 4: Mitexportieren**

In `src/engine/index.js` ergänzen:

```js
export { getByPath, setByPath, resolveLayerPath, applyControls } from './bind.js';
```

- [ ] **Step 5: Test laufen lassen**

```bash
cd "C:/Users/Max/claud/signalforge" && node --test test/engine/bind.test.js
```

Erwartet: `pass 8`, `fail 0`.

- [ ] **Step 6: Commit**

```bash
cd "C:/Users/Max/claud/signalforge" && git add src/engine/bind.js src/engine/index.js test/engine/bind.test.js && git commit -m "feat(engine): bind SignalRGB control values into the document"
```

---

### Task 9: Export-Erzeuger

Baut aus Dokument und Motorpaket die fertige `.html`. Reine Zeichenkettenarbeit ohne Dateisystem — deshalb liegt sie unter der Motor-Grenze und ist ohne Chromium testbar.

**Files:**
- Create: `src/export/build-effect.js`
- Test: `test/export/build-effect.test.js`

**Interfaces:**
- Consumes: `normalizeDocument` (Task 2)
- Produces: `buildEffectHtml({ doc, engineSource, lang }) -> string`. Task 10 und Task 13 rufen genau das auf.

- [ ] **Step 1: Test schreiben**

`test/export/build-effect.test.js`:

```js
// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEffectHtml } from '../../src/export/build-effect.js';

const ENGINE = 'window.SignalForgeEngine = {};';

const doc = {
  name: 'Bergabend',
  description: 'Evening in the mountains',
  publisher: 'Max',
  layers: [{ id: 'a1', type: 'image', asset: 'q', motion: { kind: 'warp', speed: 15, amount: 30 } }],
  controls: [
    { property: 'tempo', label: { de: 'Tempo', en: 'Speed' }, type: 'number', min: 1, max: 100, default: 15, bind: ['a1.motion.speed'] },
    { property: 'style', label: { de: 'Modus', en: 'Mode' }, type: 'combobox', values: ['Warp', 'Still'], default: 'Warp', bind: [] }
  ],
  assets: { q: { kind: 'image', mime: 'image/png', data: 'AAAA' } }
};

test('head carries title, description, publisher and the canvas', () => {
  const html = buildEffectHtml({ doc, engineSource: ENGINE, lang: 'de' });
  assert.match(html, /<title>Bergabend<\/title>/);
  assert.match(html, /<meta description="Evening in the mountains"/);
  assert.match(html, /<meta publisher="Max"/);
  assert.match(html, /<canvas id="exCanvas" width="320" height="200">/);
});

test('controls become SignalRGB meta tags in the chosen language', () => {
  const de = buildEffectHtml({ doc, engineSource: ENGINE, lang: 'de' });
  assert.match(de, /<meta property="tempo" label="Tempo" type="number" min="1" max="100" default="15"/);
  const en = buildEffectHtml({ doc, engineSource: ENGINE, lang: 'en' });
  assert.match(en, /label="Speed"/);
});

test('combobox controls carry their values list', () => {
  const html = buildEffectHtml({ doc, engineSource: ENGINE, lang: 'en' });
  assert.match(html, /<meta property="style" label="Mode" type="combobox" values="Warp,Still" default="Warp"/);
});

test('non-ASCII labels are rejected loudly instead of shipping broken', () => {
  const bad = structuredClone(doc);
  bad.controls[0].label.de = 'Stärke';
  assert.throws(() => buildEffectHtml({ doc: bad, engineSource: ENGINE, lang: 'de' }), /ASCII/);
});

test('the engine bundle and the document are both embedded', () => {
  const html = buildEffectHtml({ doc, engineSource: ENGINE, lang: 'de' });
  assert.ok(html.includes(ENGINE));
  assert.match(html, /id="sf-document" type="application\/json"/);
  assert.ok(html.includes('"Bergabend"'));
});

test('a closing script tag inside the document cannot break out of the json block', () => {
  const nasty = structuredClone(doc);
  nasty.description = 'oops </script><script>alert(1)</script>';
  const html = buildEffectHtml({ doc: nasty, engineSource: ENGINE, lang: 'de' });
  assert.ok(!html.includes('</script><script>alert(1)'));
  assert.ok(html.includes('<\\/script>'));
});

test('quotes in text are escaped so attributes stay intact', () => {
  const quoted = structuredClone(doc);
  quoted.description = 'a "quoted" thing';
  const html = buildEffectHtml({ doc: quoted, engineSource: ENGINE, lang: 'de' });
  assert.match(html, /<meta description="a &quot;quoted&quot; thing"/);
});

test('the bootstrap reads every control global and caps the frame rate', () => {
  const html = buildEffectHtml({ doc, engineSource: ENGINE, lang: 'de' });
  assert.ok(html.includes("typeof tempo"));
  assert.ok(html.includes("typeof style"));
  assert.match(html, /1000 \/ 30/);
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

```bash
cd "C:/Users/Max/claud/signalforge" && node --test test/export/build-effect.test.js
```

Erwartet: FAIL, Modul nicht gefunden.

- [ ] **Step 3: Umsetzung schreiben**

`src/export/build-effect.js`:

```js
// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import { CANVAS_WIDTH, CANVAS_HEIGHT, normalizeDocument } from '../engine/document.js';

const ASCII_PRINTABLE = /^[\x20-\x7E]*$/;

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
    parts.push(`min="${control.min}"`, `max="${control.max}"`);
  }
  if (control.type === 'combobox') {
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
  var raw = JSON.parse(document.getElementById('sf-document').textContent);
  var base = SF.normalizeDocument(raw).doc;
  var renderer = SF.createRenderer();
  var assets = null;
  var start = null;
  var lastFrame = -1e9;
  var FRAME_GAP = 1000 / 30;

  SF.loadAssets(base, {
    resolveUrl: function (asset) {
      return asset.data ? 'data:' + asset.mime + ';base64,' + asset.data : asset.file;
    }
  }).then(function (loaded) { assets = loaded; });

  function readControls() {
    var values = {};
${reads}
    for (var key in values) {
      if (values[key] === undefined) delete values[key];
    }
    return values;
  }

  function update(stamp) {
    window.requestAnimationFrame(update);
    if (!assets) return;
    if (start === null) start = stamp;
    if (stamp - lastFrame < FRAME_GAP) return;
    lastFrame = stamp;
    var doc = SF.applyControls(base, readControls());
    renderer.render(ctx, doc, assets, (stamp - start) / 1000);
  }

  window.requestAnimationFrame(update);`;
}

/**
 * Build a standalone SignalRGB effect file.
 *
 * engineSource is the bundled engine (dist/engine.bundle.js). The very same
 * bundle drives the preview, which is what makes the preview trustworthy.
 */
export function buildEffectHtml({ doc: rawDoc, engineSource, lang = 'en' }) {
  const { doc } = normalizeDocument(rawDoc);
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

<script id="sf-document" type="application/json">${jsonBlock(doc)}</script>
<script>${engineSource}</script>
<script>${bootstrap(doc.controls)}
</script>
`;
}
```

- [ ] **Step 4: Test laufen lassen**

```bash
cd "C:/Users/Max/claud/signalforge" && node --test test/export/build-effect.test.js
```

Erwartet: `pass 8`, `fail 0`.

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/Max/claud/signalforge" && git add src/export/build-effect.js test/export/build-effect.test.js && git commit -m "feat(export): build standalone SignalRGB effect html"
```

---

### Task 10: Paritätstest

Der Test, der die wichtigste Zusage der Architektur absichert: **was die Vorschau zeigt, ist was der exportierte Effekt zeigt.** Wenn dieser Test grün ist, kann die Vorschau nicht heimlich von der Wirklichkeit abweichen.

**Files:**
- Modify: `test/harness/render.js` (Auftragsart `html` bekommt eine Datei geschrieben)
- Test: `test/export/parity.test.js`

**Interfaces:**
- Consumes: `runJobs` (Task 5), `buildEffectHtml` (Task 9)
- Produces: nichts Neues für spätere Tasks — reine Absicherung.

- [ ] **Step 1: Test schreiben**

`test/export/parity.test.js`:

```js
// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runJobs } from '../harness/render.js';
import { meanDifference, maxDifference, meanBrightness } from '../harness/pixels.js';
import { buildEffectHtml } from '../../src/export/build-effect.js';

const QUADRANTS = 'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAHklEQVR42mXJsQ0AAAgDIOr/P9fVRFZSkMI4QtE/C5t8BQM0UanVAAAAAElFTkSuQmCC';

const DOC = {
  name: 'Parity',
  description: 'preview and export must agree',
  publisher: 'SignalForge',
  assets: { q: { kind: 'image', mime: 'image/png', data: QUADRANTS } },
  layers: [
    { id: 'a1', type: 'image', asset: 'q', fit: 'cover', motion: { kind: 'none' } },
    { id: 'a2', type: 'image', asset: 'q', fit: 'stretch', opacity: 0.4, blend: 'screen', motion: { kind: 'none' } }
  ],
  controls: []
};

test('the exported effect renders the same pixels as the engine does', async () => {
  const engineSource = readFileSync(new URL('../../dist/engine.bundle.js', import.meta.url), 'utf8');
  const dir = mkdtempSync(join(tmpdir(), 'signalforge-parity-'));
  const file = join(dir, 'effect.html');
  writeFileSync(file, buildEffectHtml({ doc: DOC, engineSource, lang: 'en' }), 'utf8');

  try {
    const [viaEngine, viaExport] = await runJobs([
      { name: 'engine', kind: 'engine', doc: DOC, timeSec: 0 },
      { name: 'export', kind: 'html', file, settleMs: 400 }
    ]);

    // Something must actually be on screen, otherwise "identical" is meaningless.
    assert.ok(meanBrightness(viaEngine.pixels) > 5, 'engine frame is blank');
    assert.ok(meanBrightness(viaExport.pixels) > 5, 'exported frame is blank');

    assert.equal(viaEngine.width, viaExport.width);
    assert.equal(viaEngine.height, viaExport.height);

    // Still motion at t=0: the two paths must land on the same pixels.
    assert.equal(maxDifference(viaEngine.pixels, viaExport.pixels), 0,
      `mean difference was ${meanDifference(viaEngine.pixels, viaExport.pixels)}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
```

Bewusst nur unbewegte Ebenen: der exportierte Effekt läuft an seiner eigenen Uhr, der Motoraufruf an einer vorgegebenen Zeit. Bei Bewegung würde der Test die Uhr messen statt die Übereinstimmung. Bei `motion: none` ist die Zeit egal und der Vergleich sauber.

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

```bash
cd "C:/Users/Max/claud/signalforge" && npm run build:engine && node --test test/export/parity.test.js
```

Erwartet: FAIL. Der Prüfstand kennt die Auftragsart `html` in `render.js` zwar noch nicht als Sonderfall, aber `electron-main.cjs` aus Task 5 behandelt sie bereits — der Fehlschlag zeigt, ob der Weg wirklich trägt. Sollte der Test hier schon durchlaufen, ist Step 3 nicht nötig; das dann kurz vermerken und weitergehen.

- [ ] **Step 3: Prüfstand nachziehen, falls nötig**

Falls Step 2 daran scheitert, dass `runJobs` den Auftrag verändert oder Felder verschluckt: in `test/harness/render.js` sicherstellen, dass die Aufträge **unverändert** durchgereicht werden. Die Fassung aus Task 5 tut das bereits (`JSON.stringify({ jobs })`), also ist hier in aller Regel nichts zu tun.

- [ ] **Step 4: Test laufen lassen**

```bash
cd "C:/Users/Max/claud/signalforge" && node --test test/export/parity.test.js
```

Erwartet: `pass 1`, `fail 0`.

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/Max/claud/signalforge" && git add test/export/parity.test.js test/harness/render.js && git commit -m "test: preview and exported effect must render identical pixels"
```

---

### Task 11: Motor-Grenze erzwingen

Risiko R6 aus der Spezifikation. Wenn in den Motor ein Node-Import rutscht, lässt sich der Effekt nicht mehr exportieren — und zwar erst dann, wenn es weh tut. Ein Test verhindert das.

**Files:**
- Test: `test/engine/boundary.test.js`

**Interfaces:**
- Consumes: nichts
- Produces: nichts — reine Absicherung.

- [ ] **Step 1: Test schreiben**

`test/engine/boundary.test.js`:

```js
// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));

/** Everything here has to survive being bundled into a plain web page. */
const GUARDED = ['src/engine', 'src/export/build-effect.js'];

const FORBIDDEN = [
  { pattern: /\brequire\s*\(/, why: 'CommonJS require' },
  { pattern: /from\s+['"]node:/, why: 'node: builtin import' },
  { pattern: /from\s+['"](fs|path|os|child_process|url|crypto)['"]/, why: 'node builtin import' },
  { pattern: /from\s+['"]electron['"]/, why: 'electron import' },
  { pattern: /\bprocess\.(env|argv|cwd)\b/, why: 'process access' },
  { pattern: /\b__dirname\b|\b__filename\b/, why: 'CommonJS path global' }
];

function collect(relative) {
  const absolute = join(root, relative);
  if (statSync(absolute).isFile()) return [relative];
  const out = [];
  for (const entry of readdirSync(absolute, { withFileTypes: true })) {
    const next = `${relative}/${entry.name}`;
    if (entry.isDirectory()) out.push(...collect(next));
    else if (entry.name.endsWith('.js')) out.push(next);
  }
  return out;
}

test('the engine never reaches into Node', () => {
  const files = GUARDED.flatMap(collect);
  assert.ok(files.length >= 7, `expected to scan the whole engine, only found ${files.length} files`);

  const offences = [];
  for (const file of files) {
    const source = readFileSync(join(root, file), 'utf8');
    for (const { pattern, why } of FORBIDDEN) {
      if (pattern.test(source)) offences.push(`${file}: ${why}`);
    }
  }
  assert.deepEqual(offences, [], `engine boundary broken:\n${offences.join('\n')}`);
});

test('the engine never reads the clock or rolls dice', () => {
  const files = GUARDED.flatMap(collect);
  const offences = [];
  for (const file of files) {
    const source = readFileSync(join(root, file), 'utf8');
    if (/\bMath\.random\s*\(/.test(source)) offences.push(`${file}: Math.random`);
    if (/\bDate\.now\s*\(/.test(source)) offences.push(`${file}: Date.now`);
    if (/\bnew Date\s*\(\s*\)/.test(source)) offences.push(`${file}: new Date()`);
    if (/\bperformance\.now\s*\(/.test(source)) offences.push(`${file}: performance.now`);
  }
  assert.deepEqual(offences, [], `engine must be deterministic:\n${offences.join('\n')}`);
});
```

- [ ] **Step 2: Test laufen lassen**

```bash
cd "C:/Users/Max/claud/signalforge" && node --test test/engine/boundary.test.js
```

Erwartet: `pass 2`, `fail 0` — der Motor ist bisher sauber gebaut. Sollte etwas rot sein, ist das ein echter Fund: die betroffene Datei bereinigen, nicht den Test aufweichen.

- [ ] **Step 3: Gegenprobe, dass der Test wirklich greift**

Vorübergehend `import { readFileSync } from 'node:fs';` an den Anfang von `src/engine/document.js` setzen und erneut laufen lassen. Erwartet: FAIL mit `src/engine/document.js: node: builtin import`. **Danach die Zeile wieder entfernen** und nochmal laufen lassen — grün.

Ein Test, der nie fehlschlägt, testet nichts. Diese Gegenprobe beweist, dass er greift.

- [ ] **Step 4: Commit**

```bash
cd "C:/Users/Max/claud/signalforge" && git add test/engine/boundary.test.js && git commit -m "test: enforce engine boundary and determinism"
```

---

### Task 12: Effektordner finden

**Files:**
- Create: `src/main/effects-folder.js`
- Test: `test/main/effects-folder.test.js`

**Interfaces:**
- Consumes: nichts
- Produces: `findEffectsFolders({ documentsPath, homePath, exists }) -> string[]` — Liste vorhandener Ordner, beste Fundstelle zuerst. Alle Abhängigkeiten werden hineingereicht, damit der Test ohne echtes Dateisystem auskommt. Task 13 benutzt das.

- [ ] **Step 1: Test schreiben**

`test/main/effects-folder.test.js`:

```js
// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { findEffectsFolders } from '../../src/main/effects-folder.js';

const HOME = 'C:\\Users\\Someone';
const withFolders = (present) => (candidate) => present.includes(candidate);

test('finds the plain Documents location', () => {
  const found = findEffectsFolders({
    documentsPath: `${HOME}\\Documents`,
    homePath: HOME,
    exists: withFolders([`${HOME}\\Documents\\WhirlwindFX\\Effects`])
  });
  assert.deepEqual(found, [`${HOME}\\Documents\\WhirlwindFX\\Effects`]);
});

test('finds the OneDrive-redirected location', () => {
  const found = findEffectsFolders({
    documentsPath: `${HOME}\\OneDrive\\Documents`,
    homePath: HOME,
    exists: withFolders([`${HOME}\\OneDrive\\Documents\\WhirlwindFX\\Effects`])
  });
  assert.equal(found.length, 1);
  assert.match(found[0], /OneDrive/);
});

test('the known Documents folder wins over the guessed ones', () => {
  const documents = `${HOME}\\OneDrive\\Documents`;
  const found = findEffectsFolders({
    documentsPath: documents,
    homePath: HOME,
    exists: withFolders([
      `${documents}\\WhirlwindFX\\Effects`,
      `${HOME}\\Documents\\WhirlwindFX\\Effects`
    ])
  });
  assert.equal(found[0], `${documents}\\WhirlwindFX\\Effects`);
  assert.equal(found.length, 2);
});

test('nothing found gives an empty list, never a guess', () => {
  const found = findEffectsFolders({
    documentsPath: `${HOME}\\Documents`,
    homePath: HOME,
    exists: () => false
  });
  assert.deepEqual(found, []);
});

test('the same folder reachable two ways is only listed once', () => {
  const found = findEffectsFolders({
    documentsPath: `${HOME}\\Documents`,
    homePath: HOME,
    exists: withFolders([`${HOME}\\Documents\\WhirlwindFX\\Effects`])
  });
  assert.equal(found.length, 1);
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

```bash
cd "C:/Users/Max/claud/signalforge" && node --test test/main/effects-folder.test.js
```

Erwartet: FAIL, Modul nicht gefunden.

- [ ] **Step 3: Umsetzung schreiben**

`src/main/effects-folder.js`:

```js
// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import { join } from 'node:path';

const EFFECTS_SUFFIX = ['WhirlwindFX', 'Effects'];

/**
 * Look for SignalRGB's effects folder.
 *
 * documentsPath comes from Electron's app.getPath('documents'), which follows
 * the Windows known-folder setting and therefore already points at OneDrive
 * when Documents has been redirected. The other two are fallbacks for the
 * cases where that lookup is wrong or unavailable.
 *
 * Returns every folder that actually exists, best first. Never guesses: an
 * empty list means "ask the user", not "use this path anyway".
 */
export function findEffectsFolders({ documentsPath, homePath, exists }) {
  const candidates = [];
  if (documentsPath) candidates.push(join(documentsPath, ...EFFECTS_SUFFIX));
  if (homePath) {
    candidates.push(join(homePath, 'Documents', ...EFFECTS_SUFFIX));
    candidates.push(join(homePath, 'OneDrive', 'Documents', ...EFFECTS_SUFFIX));
  }

  const found = [];
  for (const candidate of candidates) {
    if (!found.includes(candidate) && exists(candidate)) found.push(candidate);
  }
  return found;
}
```

- [ ] **Step 4: Test laufen lassen**

```bash
cd "C:/Users/Max/claud/signalforge" && node --test test/main/effects-folder.test.js
```

Erwartet: `pass 5`, `fail 0`.

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/Max/claud/signalforge" && git add src/main/effects-folder.js test/main/effects-folder.test.js && git commit -m "feat(main): locate the SignalRGB effects folder without guessing"
```

---

### Task 13: Kommandozeilen-Export mit Bildaufbereitung

Macht die Kette benutzbar: ein Bild rein, ein fertiger Effekt raus. Das ersetzt das heutige `bau.py` und beweist die ganze Kette, bevor eine Oberfläche existiert.

Die Bildaufbereitung läuft im Prüfstands-Chromium, nicht in Node. Grund: **es soll nur eine Umsetzung geben.** Die spätere App bereitet Bilder im selben Browserkontext auf, mit demselben Code.

**Files:**
- Create: `src/engine/asset-import.js`, `src/main/engine-host.html`, `src/main/prepare-image-runner.cjs`, `src/main/prepare-image.js`, `bin/sfexport.js`
- Modify: `src/engine/index.js`, `package.json` (Skript `export`)
- Test: `test/main/cli.test.js`

**Interfaces:**
- Consumes: `buildEffectHtml` (Task 9), `findEffectsFolders` (Task 12), `runJobs`-Bauart (Task 5)
- Produces: `prepareImageAsset(dataUrl, { maxHeight, blur }) -> { mime, data, width, height }` (Motorseite) und `prepareImageFile(path, options) -> Promise<asset>` (Node-Seite, treibt Electron)

- [ ] **Step 1: Test schreiben**

`test/main/cli.test.js`:

```js
// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const cli = join(root, 'bin', 'sfexport.js');

// A 60x20 solid blue PNG. Verified real, not a placeholder.
const BLUE_60x20 = 'iVBORw0KGgoAAAANSUhEUgAAADwAAAAUCAIAAABeYcl+AAAAKklEQVR42u3OAQ0AAAgDoGv/zlpDN0hAJZNvOg9JS0tLS0tLS0tLS0vftzy0ASdQ1Ru5AAAAAElFTkSuQmCC';

test('the cli turns an image into an installed effect file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'signalforge-cli-'));
  const image = join(dir, 'blue.png');
  const outDir = join(dir, 'Effects');
  writeFileSync(image, Buffer.from(BLUE_60x20, 'base64'));

  try {
    const stdout = execFileSync(process.execPath, [
      cli, '--image', image, '--name', 'CLI Test', '--out', outDir, '--motion', 'warp'
    ], { encoding: 'utf8', cwd: root });

    const target = join(outDir, 'CLI Test.html');
    assert.ok(existsSync(target), `expected ${target}\n${stdout}`);

    const html = readFileSync(target, 'utf8');
    assert.match(html, /<title>CLI Test<\/title>/);
    assert.match(html, /<canvas id="exCanvas" width="320" height="200">/);
    assert.match(html, /"kind":\s*"warp"/);
    assert.ok(html.includes('SignalForgeEngine'));
    // The picture must be embedded, not referenced.
    assert.match(html, /"data":\s*"[A-Za-z0-9+/=]{100,}"/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the cli refuses to overwrite silently', () => {
  const dir = mkdtempSync(join(tmpdir(), 'signalforge-cli-'));
  const image = join(dir, 'blue.png');
  const outDir = join(dir, 'Effects');
  writeFileSync(image, Buffer.from(BLUE_60x20, 'base64'));

  try {
    const args = [cli, '--image', image, '--name', 'Twice', '--out', outDir];
    execFileSync(process.execPath, args, { encoding: 'utf8', cwd: root });
    assert.throws(
      () => execFileSync(process.execPath, args, { encoding: 'utf8', cwd: root, stdio: 'pipe' }),
      /already exists/
    );
    // --force gets through.
    execFileSync(process.execPath, [...args, '--force'], { encoding: 'utf8', cwd: root });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

```bash
cd "C:/Users/Max/claud/signalforge" && node --test test/main/cli.test.js
```

Erwartet: FAIL — `bin/sfexport.js` gibt es nicht.

- [ ] **Step 3: Bildaufbereitung auf der Motorseite schreiben**

`src/engine/asset-import.js` — Browserkontext, kein Node:

```js
// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import { CANVAS_HEIGHT } from './document.js';

/**
 * Shrink a picture down to what a 320x200 canvas can actually show and
 * soften the worst compression blocking.
 *
 * Height is what matters: 'cover' scales to fill the height, so anything
 * taller than the canvas is wasted bytes in the effect file.
 */
export async function prepareImageAsset(dataUrl, { maxHeight = CANVAS_HEIGHT, blur = 1.4 } = {}) {
  const image = await new Promise((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error('could not decode image'));
    element.src = dataUrl;
  });

  const scale = Math.min(1, maxHeight / image.naturalHeight);
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  if (blur > 0) ctx.filter = `blur(${blur}px)`;
  ctx.drawImage(image, 0, 0, width, height);
  ctx.filter = 'none';

  const out = canvas.toDataURL('image/png');
  return {
    kind: 'image',
    mime: 'image/png',
    data: out.slice(out.indexOf(',') + 1),
    width,
    height
  };
}
```

In `src/engine/index.js` ergänzen:

```js
export { prepareImageAsset } from './asset-import.js';
```

- [ ] **Step 4: Electron-Läufer für die Aufbereitung schreiben**

Zwei Dateien, beide unter `src/main/`. **Nicht** unter `test/` — Produktivcode darf nicht
vom Testverzeichnis abhängen, sonst zerbricht die App, sobald jemand die Tests nicht
mitausliefert.

Erst die Seite, die nichts tut außer das Motorpaket zu laden — `src/main/engine-host.html`:

```html
<!doctype html>
<meta charset="utf-8" />
<title>SignalForge engine host</title>
<body style="margin:0;padding:0;background:#000"></body>
<script src="../../dist/engine.bundle.js"></script>
```

Dann der Läufer `src/main/prepare-image-runner.cjs`:

```js
// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

app.disableHardwareAcceleration();

const requestFile = process.argv[2];
const outFile = process.argv[3];

app.whenReady().then(async () => {
  try {
    const request = JSON.parse(fs.readFileSync(requestFile, 'utf8'));
    const win = new BrowserWindow({ show: false, webPreferences: { backgroundThrottling: false } });
    await win.loadFile(path.join(__dirname, 'engine-host.html'));
    const asset = await win.webContents.executeJavaScript(
      `window.SignalForgeEngine.prepareImageAsset(${JSON.stringify(request.dataUrl)}, `
      + `${JSON.stringify(request.options)})`
    );
    fs.writeFileSync(outFile, JSON.stringify(asset), 'utf8');
    app.quit();
  } catch (error) {
    fs.writeFileSync(outFile, JSON.stringify({ error: String((error && error.stack) || error) }), 'utf8');
    app.exit(1);
  }
});
```

- [ ] **Step 5: Node-Seite der Aufbereitung schreiben**

`src/main/prepare-image.js`:

```js
// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);
const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

const MIME_BY_EXTENSION = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp'
};

/**
 * Prepare an image file for embedding, using the very same engine code the
 * app uses. Runs it inside Electron because that is where a canvas exists.
 */
export async function prepareImageFile(imagePath, options = {}) {
  const extension = extname(imagePath).toLowerCase();
  const mime = MIME_BY_EXTENSION[extension];
  if (!mime) throw new Error(`unsupported image type: ${extension || '(none)'}`);

  const dataUrl = `data:${mime};base64,${readFileSync(imagePath).toString('base64')}`;
  const dir = mkdtempSync(join(tmpdir(), 'signalforge-prepare-'));
  const requestFile = join(dir, 'request.json');
  const outFile = join(dir, 'asset.json');
  writeFileSync(requestFile, JSON.stringify({ dataUrl, options }), 'utf8');

  try {
    await new Promise((resolve, reject) => {
      const child = spawn(require_('electron'), [
        join(root, 'src', 'main', 'prepare-image-runner.cjs'), requestFile, outFile
      ], { stdio: ['ignore', 'ignore', 'pipe'] });
      let stderr = '';
      child.stderr.on('data', (chunk) => { stderr += chunk; });
      child.on('error', reject);
      child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`prepare failed (${code})\n${stderr}`))));
    });

    const asset = JSON.parse(readFileSync(outFile, 'utf8'));
    if (asset.error) throw new Error(asset.error);
    return asset;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
```

- [ ] **Step 6: Kommandozeilenprogramm schreiben**

`bin/sfexport.js`:

```js
#!/usr/bin/env node
// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildEffectHtml } from '../src/export/build-effect.js';
import { findEffectsFolders } from '../src/main/effects-folder.js';
import { prepareImageFile } from '../src/main/prepare-image.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

const USAGE = `Usage:
  node bin/sfexport.js --image <file> [options]
  node bin/sfexport.js --project <file.json> [options]

Options:
  --name <text>      Effect name (default: the image file name)
  --motion <kind>    none | warp | drift | breathe   (default: warp)
  --fit <kind>       cover | stretch | contain       (default: cover)
  --out <folder>     Where to write. Default: the detected SignalRGB folder.
  --force            Overwrite an existing effect of the same name.
`;

function parseArguments(argv) {
  const options = { motion: 'warp', fit: 'cover', force: false };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--force') { options.force = true; continue; }
    const key = flag.startsWith('--') ? flag.slice(2) : null;
    if (!key) throw new Error(`unexpected argument: ${flag}`);
    i += 1;
    if (i >= argv.length) throw new Error(`${flag} needs a value`);
    options[key] = argv[i];
  }
  return options;
}

function resolveOutputFolder(explicit) {
  if (explicit) return explicit;
  const found = findEffectsFolders({
    documentsPath: join(homedir(), 'Documents'),
    homePath: homedir(),
    exists: (candidate) => existsSync(candidate)
  });
  if (found.length === 0) {
    throw new Error('No SignalRGB effects folder found. Pass --out <folder> explicitly.');
  }
  return found[0];
}

async function buildDocument(options) {
  if (options.project) {
    return JSON.parse(readFileSync(options.project, 'utf8'));
  }
  if (!options.image) throw new Error(USAGE);

  const asset = await prepareImageFile(options.image);
  const name = options.name || basename(options.image).replace(/\.[^.]+$/, '');
  return {
    name,
    description: `Built from ${basename(options.image)} with SignalForge.`,
    publisher: 'SignalForge',
    assets: { picture: asset },
    layers: [{
      id: 'a1',
      type: 'image',
      name: 'Picture',
      asset: 'picture',
      fit: options.fit,
      motion: { kind: options.motion, speed: 15, amount: 30 }
    }],
    controls: [
      { property: 'tempo', label: { de: 'Tempo', en: 'Speed' }, type: 'number', min: 1, max: 100, default: 15, bind: ['a1.motion.speed'] },
      { property: 'strength', label: { de: 'Staerke', en: 'Strength' }, type: 'number', min: 0, max: 100, default: 30, bind: ['a1.motion.amount'] },
      { property: 'brightness', label: { de: 'Helligkeit', en: 'Brightness' }, type: 'number', min: 5, max: 100, default: 100, bind: [] }
    ]
  };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const doc = await buildDocument(options);

  const bundle = join(root, 'dist', 'engine.bundle.js');
  if (!existsSync(bundle)) throw new Error('dist/engine.bundle.js missing. Run: npm run build:engine');
  const engineSource = readFileSync(bundle, 'utf8');

  const folder = resolveOutputFolder(options.out);
  mkdirSync(folder, { recursive: true });
  const target = join(folder, `${doc.name}.html`);

  if (existsSync(target) && !options.force) {
    throw new Error(`"${target}" already exists. Pass --force to overwrite.`);
  }

  const html = buildEffectHtml({ doc, engineSource, lang: 'en' });
  writeFileSync(target, html, 'utf8');
  const kb = (statSync(target).size / 1024).toFixed(1);
  console.log(`Wrote ${target} (${kb} KB)`);
  console.log('If SignalRGB does not list it, restart SignalRGB (see docs/erkenntnisse-video.md).');
}

main().catch((error) => {
  console.error(String(error.message || error));
  process.exit(1);
});
```

- [ ] **Step 7: Skript eintragen**

In `package.json` bei `scripts` ergänzen:

```json
    "export": "node bin/sfexport.js"
```

- [ ] **Step 8: Test laufen lassen**

```bash
cd "C:/Users/Max/claud/signalforge" && npm run build:engine && node --test test/main/cli.test.js
```

Erwartet: `pass 2`, `fail 0`.

- [ ] **Step 9: Commit**

```bash
cd "C:/Users/Max/claud/signalforge" && git add src bin test package.json && git commit -m "feat(cli): export an effect from a single image"
```

---

### Task 14: Abnahme gegen den Prototyp

Beweist am echten Bild, dass Bauplan 1 fertig ist: dasselbe Foto wie heute, durch die neue Kette, und Max schaut auf seine Beleuchtung.

**Files:**
- Create: `docs/abnahme-stufe-1.md`
- Test: keiner neu — der ganze bestehende Satz muss grün sein

**Interfaces:**
- Consumes: alles Vorherige
- Produces: eine belegte Abnahme, auf die Bauplan 2 aufsetzt

- [ ] **Step 1: Kompletten Testsatz laufen lassen**

```bash
cd "C:/Users/Max/claud/signalforge" && npm test 2>&1 | tail -25
```

Erwartet: `fail 0`. Bei irgendeinem roten Test hier stoppen und beheben — nicht weitergehen.

- [ ] **Step 2: Effekt aus Max' Foto bauen**

```bash
cd "C:/Users/Max/claud/signalforge" && node bin/sfexport.js --image "C:/Users/Max/Pictures/Screenshots/Screenshot 2026-08-09 090938.png" --name "SF Bergabend" --motion warp --fit cover
```

Erwartet: `Wrote …\WhirlwindFX\Effects\SF Bergabend.html (… KB)`. Die Größe sollte in der Nähe der 76 KB des Prototyps liegen.

- [ ] **Step 3: Gegen den Prototyp messen**

```bash
cd "C:/Users/Max/claud/signalforge" && node -e "const {statSync}=require('node:fs');for(const p of ['C:/Users/Max/claud/signalrgb-effekt/MaxAmbient.html','C:/Users/Max/Documents/WhirlwindFX/Effects/SF Bergabend.html'])console.log((statSync(p).size/1024).toFixed(1)+' KB  '+p)"
```

Der neue Effekt darf größer sein — er trägt den ganzen Motor statt einer einzigen fest verdrahteten Ebene. Mehr als etwa das Doppelte wäre allerdings ein Hinweis, dass etwas Unnötiges mit hineingebündelt wurde; dann `dist/engine.bundle.js` anschauen.

Ein Unterschied im Bild ist zu erwarten: der Prototyp hat das „Konsole"-Overlay wegretuschiert, die neue Kette noch nicht. Das ist kein Fehler — Retusche ist Sache der Oberfläche in Bauplan 2.

- [ ] **Step 4: Max fragen — menschlicher Prüfpunkt**

> „In SignalRGB liegt jetzt **SF Bergabend**, gebaut mit der neuen Kette aus demselben Foto.
> 1. Sieht es auf deiner Beleuchtung genauso gut aus wie **Max Ambient** von heute Morgen?
> 2. Wabert es genauso ruhig, oder wirkt es anders?
> 3. Funktionieren die drei Regler (Tempo, Staerke, Helligkeit)?
>
> Der Unterschied, den du sehen wirst: unten rechts leuchtet wieder der kleine helle
> Fleck vom „Konsole"-Text mit. Das Wegretuschieren kommt mit der Oberfläche."

Nicht selbst behaupten, es sehe gut aus — die LED-Ausgabe ist von hier aus nicht sichtbar.

- [ ] **Step 5: Abnahme festhalten**

`docs/abnahme-stufe-1.md`:

```markdown
# Abnahme Bauplan 1 — Motor und Export

**Datum:** [eintragen] · **Geprüft von:** Max

## Testsatz

`npm test`: [Anzahl] Tests, 0 Fehlschläge.

Darunter die beiden tragenden:
- **Parität** — Vorschau und exportierter Effekt liefern Pixel für Pixel dasselbe Bild.
- **Motor-Grenze** — kein Node-Import, keine Uhr, kein Zufall unter `src/engine/`.

## Am echten Bild

Effekt `SF Bergabend`, gebaut aus `Screenshot 2026-08-09 090938.png`.

- Dateigröße: [x] KB (Prototyp zum Vergleich: 76,6 KB)
- Sieht so gut aus wie der Prototyp: [JA / NEIN — Anmerkung]
- Wabert gleich ruhig: [JA / NEIN — Anmerkung]
- Regler funktionieren: [JA / NEIN — Anmerkung]

## Bekannte Unterschiede zum Prototyp

- Das „Konsole"-Overlay wird noch nicht wegretuschiert. Kommt mit der Oberfläche.

## Offen für Bauplan 2

- Electron-Fenster und Oberfläche (Glassmorphism, dreispaltig)
- Zweisprachigkeit
- Vorschau mit Rechenzeitanzeige
- Ebenenliste, Einstellungsspalte, Reglereditor
- Bild per Ziehen-und-Fallenlassen, Ausschnitt mit der Maus
- Videoebene — abhängig vom Ergebnis in `docs/erkenntnisse-video.md`
- Erststart-Assistent für den Effektordner
```

- [ ] **Step 6: Testeffekt aufräumen und committen**

```bash
rm -f "C:/Users/Max/Documents/WhirlwindFX/Effects/SF Bergabend.html"
cd "C:/Users/Max/claud/signalforge" && git add docs && git commit -m "docs: stage 1 acceptance"
```

Den Effekt nur löschen, wenn Max ihn nicht behalten will — vorher fragen.

---

## Selbstprüfung des Plans

**Deckung gegen die Spezifikation.** Abschnitt 3 (Aufbau, geteilter Motor) → Tasks 5, 9, 10. Abschnitt 4 (Dokumentmodell, Regler) → Tasks 2, 8. Abschnitt 5 (Ebenen, Mischmodi, Bewegungsarten, Rechenleistung) → Tasks 2, 5, 6, 7. Abschnitt 7 (Export) → Tasks 9, 13. Abschnitt 8 (Effektordner, kein fester Pfad) → Task 12. Risiken R1 und R2 → Task 0. R6 → Task 11.

**Bewusst nicht in diesem Bauplan**, weil sie zur Oberfläche gehören und in Bauplan 2 landen: Abschnitt 6 (Video — hängt am Ergebnis von Task 0), Abschnitt 8 (Fenster, Glassmorphism, Zweisprachigkeit, Erststart-Assistent), die Anzeige der Rechenzeit, und die Warnschwelle von 15 %. Der Motor ist so gebaut, dass die Messung von außen möglich ist: `render` ist ein einzelner Aufruf, dessen Dauer die Oberfläche selbst stoppen kann.

**Namensabgleich.** `createRenderer`/`render`/`dispose` (Task 5) werden in Tasks 6, 7 und im Startstück von Task 9 gleich benannt verwendet. `createState`/`render` als Ebenenschnittstelle (Task 5) passt zu `src/engine/layers/image.js` (Tasks 6, 7). `computeSourceRect` liefert `sx,sy,sw,sh,dx,dy,dw,dh` (Task 3) — genau diese Felder lesen Tasks 6 und 7. `BUFFER_PAD` und `WARP_PEAK_FACTOR` hängen über `MAX_AMPLITUDE` zusammen (Tasks 4, 7). `findEffectsFolders` (Task 12) wird in `bin/sfexport.js` (Task 13) mit denselben Parameternamen aufgerufen.
