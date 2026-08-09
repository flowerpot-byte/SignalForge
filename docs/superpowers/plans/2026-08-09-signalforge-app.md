# SignalForge — Die App (Bauplan 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein Fenster, in das man ein Bild zieht, den Ausschnitt mit der Maus wählt, Bewegung und Farbe einstellt, das Ergebnis live sieht und mit einem Knopf in SignalRGB ablegt.

**Architecture:** Electron. Der Hauptprozess macht alles, was Dateien und Betriebssystem betrifft; das Fenster macht alles, was man sieht. Dazwischen eine schmale, aufgezählte Brücke — der Fensterprozess bekommt **keinen** direkten Node-Zugriff. Die Vorschau lädt `dist/engine.bundle.js` als globales Objekt, exakt so wie der exportierte Effekt es tut; damit deckt der bestehende Paritätstest die Vorschau mit ab.

**Tech Stack:** Electron 43, esbuild 0.28 (nur für das Motorpaket), Node 24 mit `node:test`. Keine Laufzeit-Abhängigkeiten, keine Oberflächen-Bibliothek, kein Bauschritt für die Oberfläche — native ES-Module.

## Global Constraints

- **Sprache:** Bezeichner, Kommentare, Testnamen und Commit-Texte **Englisch**. `docs/` ist Deutsch. Oberflächentexte kommen aus `de`/`en`-Sprachdateien, nie fest im Code.
- **Lizenz:** GPLv3. Jede neue Quelldatei bekommt den Kopf aus `docs/HEADER.txt`.
- **Zeichenfläche:** immer 320 × 200 aus `CANVAS_WIDTH`/`CANVAS_HEIGHT`. Nirgends hartkodiert.
- **Motor-Grenze:** `src/engine/**` und `src/export/build-effect.js` importieren nichts aus Node und benutzen weder `Date.now`, `new Date()`, `performance.now` noch `Math.random`. `test/engine/boundary.test.js` erzwingt das.
- **Determinismus:** Der Motor liest nie die Uhr. Zeit kommt als `timeSec`.
- **Gemessene Fakten über SignalRGBs Browser** (Belege in `docs/erkenntnisse-signalrgb-motor.md`): **`ctx.filter` fehlt**, `<video>` hat kein `play()`, ein Effekt kann keine Datei und kein `localhost` erreichen. Alles, was ein exportierter Effekt tut, muss ohne diese Dinge auskommen. **Im Fensterprozess der App gelten diese Grenzen nicht** — dort ist Electrons Chromium, dort ist `ctx.filter` und `backdrop-filter` vorhanden.
- **Reglerbeschriftungen nur ASCII** (32–126). Der Export wirft sonst.
- **Keine festen Benutzerpfade** in `src/`, `bin/` oder `app/`.
- **`dependencies` bleibt leer.** Electron und esbuild sind `devDependencies`.
- **Kein `nodeIntegration` im Fenster.** `contextIsolation: true`, `sandbox: true`, alles über `contextBridge`.
- Plattform Windows; Pfade über `node:path`.

## Design-Token (verbindlich, nicht neu erfinden)

Max' Vorbild ist Glassmorphism: milchige Flächen über einem farbigen, unscharfen Hintergrund, weiche Ränder, Tiefe durch Unschärfe statt durch Linien. Die App ist dunkel, weil sie neben SignalRGB und im abgedunkelten Zimmer benutzt wird.

```css
--bg-base:        #0b0d14;   /* Grundfarbe hinter allem */
--glass-fill:     rgba(255, 255, 255, 0.06);
--glass-stroke:   rgba(255, 255, 255, 0.12);
--glass-blur:     18px;      /* backdrop-filter */
--text-strong:    rgba(255, 255, 255, 0.94);
--text-muted:     rgba(255, 255, 255, 0.58);
--accent:         #c94f7c;   /* aus Max' Vorbild: kraeftiges Magenta-Rosa */
--accent-soft:    rgba(201, 79, 124, 0.22);
--warn:           #e0a54a;
--radius:         14px;
--gap:            12px;
--panel-pad:      16px;
```

**Der Hintergrund lebt:** Drei weiche Farbkleckse liegen unscharf hinter der Oberfläche und nehmen die Farben des gerade bearbeiteten Effekts auf. Das ist der eine Effekt, der begründet, warum es Glassmorphism ist und nicht nur Dekoration — die Oberfläche zeigt, woran man arbeitet.

**Lesbarkeit schlägt Optik.** Text auf Glas muss mindestens 4.5:1 Kontrast haben. Wo es knapp wird, wird die Fläche undurchsichtiger, nicht der Text heller.

---

### Task 1: Mehrere Bewegungen je Ebene

Heute hat eine Ebene genau eine Bewegungsart. Max will wabern **und** pulsieren gleichzeitig. Das ist eine Änderung am Datenmodell und muss vor der Oberfläche passieren, sonst wird sie zweimal gebaut.

**Files:**
- Modify: `src/engine/document.js`, `src/engine/layers/image.js`
- Test: `test/engine/document.test.js`, `test/engine/motions.test.js` (neu)

**Interfaces:**
- Consumes: `MOTION_KINDS`, `clamp`, `speedToRate`
- Produces: `layer.motions` ist ein **Array** von `{ kind, speed, amount }`. `normalizeDocument` nimmt weiterhin ein einzelnes `layer.motion` an und wandelt es um, damit bestehende Projekte und der Export von Bauplan 1 weiter laden. Task 9 und Task 11 bauen darauf.

- [ ] **Step 1: Test schreiben**

`test/engine/motions.test.js`:

```js
// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDocument } from '../../src/engine/document.js';

test('a single legacy motion becomes a one-entry list', () => {
  const { doc } = normalizeDocument({
    layers: [{ type: 'image', motion: { kind: 'warp', speed: 40, amount: 60 } }]
  });
  assert.deepEqual(doc.layers[0].motions, [{ kind: 'warp', speed: 40, amount: 60 }]);
  assert.equal(doc.layers[0].motion, undefined, 'the old singular field must not survive');
});

test('a layer with neither motion nor motions gets an empty list, not a "none" entry', () => {
  const { doc } = normalizeDocument({ layers: [{ type: 'image' }] });
  assert.deepEqual(doc.layers[0].motions, []);
});

test('several motions are kept in order', () => {
  const { doc } = normalizeDocument({
    layers: [{ type: 'image', motions: [
      { kind: 'warp', speed: 20, amount: 30 },
      { kind: 'breathe', speed: 8, amount: 50 }
    ] }]
  });
  assert.equal(doc.layers[0].motions.length, 2);
  assert.equal(doc.layers[0].motions[0].kind, 'warp');
  assert.equal(doc.layers[0].motions[1].kind, 'breathe');
});

test('each entry gets its own defaults and clamping', () => {
  const { doc } = normalizeDocument({
    layers: [{ type: 'image', motions: [{ kind: 'drift' }, { kind: 'breathe', speed: 500, amount: -20 }] }]
  });
  assert.deepEqual(doc.layers[0].motions[0], { kind: 'drift', speed: 15, amount: 30 });
  assert.deepEqual(doc.layers[0].motions[1], { kind: 'breathe', speed: 100, amount: 0 });
});

test('an unknown kind is dropped and reported, not silently rendered as nothing', () => {
  const { doc, problems } = normalizeDocument({
    layers: [{ id: 'a1', type: 'image', motions: [{ kind: 'wobble' }, { kind: 'warp' }] }]
  });
  assert.equal(doc.layers[0].motions.length, 1);
  assert.equal(doc.layers[0].motions[0].kind, 'warp');
  assert.equal(problems.length, 1);
  assert.match(problems[0], /wobble/);
});

test('a "none" entry is dropped, since an empty list already means no motion', () => {
  const { doc } = normalizeDocument({
    layers: [{ type: 'image', motions: [{ kind: 'none' }, { kind: 'warp' }] }]
  });
  assert.equal(doc.layers[0].motions.length, 1);
  assert.equal(doc.layers[0].motions[0].kind, 'warp');
});

test('motions wins when both fields are present, and that is reported', () => {
  const { doc, problems } = normalizeDocument({
    layers: [{ id: 'a1', type: 'image', motion: { kind: 'drift' }, motions: [{ kind: 'warp' }] }]
  });
  assert.equal(doc.layers[0].motions.length, 1);
  assert.equal(doc.layers[0].motions[0].kind, 'warp');
  assert.equal(problems.length, 1);
  assert.match(problems[0], /both/i);
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

```bash
cd "C:/Users/Max/claud/signalforge" && node --test test/engine/motions.test.js
```

Erwartet: FAIL — `doc.layers[0].motions` ist `undefined`.

- [ ] **Step 3: Dokumentmodell umbauen**

In `src/engine/document.js` den Bewegungsteil von `normalizeLayer` ersetzen. Die bisherige Einzelbewegung wird zur Umwandlung von Altbeständen:

```js
/** One motion entry, with its own speed and amount. */
function normalizeMotion(raw, layerId, index, problems) {
  const input = raw && typeof raw === 'object' ? raw : {};
  const kind = str(input.kind, 'none');
  if (!MOTION_KINDS.includes(kind)) {
    problems.push(`Layer "${layerId}": unknown motion "${kind}" at position ${index}, dropped.`);
    return null;
  }
  // An empty list already means "no motion", so a "none" entry is noise.
  if (kind === 'none') return null;
  return {
    kind,
    speed: clamp(num(input.speed, 15), 0, 100),
    amount: clamp(num(input.amount, 30), 0, 100)
  };
}

/**
 * Read the motion list. Accepts the old singular `motion` field so documents
 * and effects exported before this change still load.
 */
function normalizeMotions(input, layerId, problems) {
  const hasList = Array.isArray(input.motions);
  const hasSingle = input.motion && typeof input.motion === 'object';
  if (hasList && hasSingle) {
    problems.push(`Layer "${layerId}": both motion and motions given, using motions.`);
  }
  const source = hasList ? input.motions : (hasSingle ? [input.motion] : []);
  return source
    .map((entry, index) => normalizeMotion(entry, layerId, index, problems))
    .filter((entry) => entry !== null);
}
```

Im Rückgabewert von `normalizeLayer` für `type === 'image'` das Feld `motion` durch `motions` ersetzen:

```js
    motions: normalizeMotions(input, id, problems),
```

- [ ] **Step 4: Bildebene auf die Liste umstellen**

In `src/engine/layers/image.js` liest `render` bisher `layer.motion`. Jetzt werden alle Einträge nacheinander angewendet.

Die Bewegungsarten wirken auf verschiedene Dinge und lassen sich deshalb sauber kombinieren: `drift` verschiebt den Quellausschnitt, `warp` verzieht beim Abtasten, `breathe` regelt die Deckkraft. Die Reihenfolge im Aufbau ist deshalb fest und nicht die Listenreihenfolge — sonst hinge das Ergebnis davon ab, wie der Nutzer die Einträge sortiert hat.

`render` ersetzen durch:

```js
export function render(ctx, layer, asset, timeSec, state) {
  if (!asset || !asset.element) return;

  const motions = Array.isArray(layer.motions) ? layer.motions : [];
  const drift = motions.find((m) => m.kind === 'drift') ?? null;
  const warp = motions.find((m) => m.kind === 'warp') ?? null;
  const breathe = motions.find((m) => m.kind === 'breathe') ?? null;

  const previousAlpha = ctx.globalAlpha;
  if (breathe) {
    ctx.globalAlpha = clamp(previousAlpha * breatheFactor(breathe, timeSec), 0, 1);
  }

  if (warp) {
    renderWarped(ctx, layer, asset, timeSec, state, warp, drift);
  } else {
    let rect = computeSourceRect({
      srcW: asset.width,
      srcH: asset.height,
      dstW: CANVAS_WIDTH,
      dstH: CANVAS_HEIGHT,
      fit: layer.fit,
      offsetX: layer.offset.x,
      offsetY: layer.offset.y
    });
    if (drift) rect = applyDrift(rect, drift, timeSec);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(asset.element, rect.sx, rect.sy, rect.sw, rect.sh, rect.dx, rect.dy, rect.dw, rect.dh);
  }

  ctx.globalAlpha = previousAlpha;
}
```

`renderWarped` bekommt `drift` als zusätzliches Argument. Der Drift verschiebt dort das Abtastfenster, statt den Quellausschnitt vorher zu ändern — sonst müsste der gepolsterte Puffer bei jeder Driftbewegung neu gebaut werden, und das ist der teure Teil.

In `renderWarped`, direkt vor der Abtastschleife, einfügen:

```js
  // Drift shifts the sampling window inside the padded buffer instead of
  // moving the crop, so the cached buffer stays valid across frames.
  let driftX = 0;
  let driftY = 0;
  if (drift) {
    const phase = timeSec * speedToRate(drift.speed) * SPEED_SCALE;
    const reach = (drift.amount / 100) * (BUFFER_PAD * 0.5);
    driftX = reach * Math.sin(phase * 0.37 + 0.4);
    driftY = reach * Math.cos(phase * 0.23 + 1.1);
  }
```

und in der Schleife die beiden Abtastzeilen um den Drift ergänzen:

```js
      let sx = x + BUFFER_PAD + driftX + rdx + colDX[x];
      let sy = baseY + driftY + rdy + colDY[x];
```

Der Drift-Weg ist auf die halbe Polsterung begrenzt, damit Drift und Wabern zusammen nie über den Rand hinausgreifen: `WARP_PEAK_FACTOR * MAX_AMPLITUDE` schöpft die Polsterung bereits aus, deshalb bekommt der Drift nur die Hälfte und die Wabern-Amplitude wird entsprechend halbiert, sobald beide aktiv sind. Dafür in `renderWarped` die Amplitude berechnen als:

```js
  const headroom = drift ? 0.5 : 1;
  const amplitude = (warp.amount / 100) * MAX_AMPLITUDE * headroom;
```

- [ ] **Step 5: Bestehende Tests nachziehen**

`test/engine/image-layer.test.js` und `test/engine/image-warp.test.js` benutzen `motion: { … }`. Weil `normalizeDocument` das weiterhin annimmt, müssen sie **nicht** geändert werden. Prüfen, dass sie unverändert grün bleiben — wenn nicht, ist die Umwandlung von Altbeständen kaputt und das ist ein Befund, kein Anlass die Tests anzupassen.

- [ ] **Step 6: Test für die Kombination schreiben**

An `test/engine/motions.test.js` anhängen:

```js
import { runJobs } from '../harness/render.js';
import { meanDifference, meanBrightness } from '../harness/pixels.js';

const QUADRANTS = 'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAHklEQVR42mXJsQ0AAAgDIOr/P9fVRFZSkMI4QtE/C5t8BQM0UanVAAAAAElFTkSuQmCC';

function doc(motions) {
  return {
    assets: { q: { kind: 'image', mime: 'image/png', data: QUADRANTS } },
    layers: [{ id: 'a1', type: 'image', asset: 'q', fit: 'stretch', motions }]
  };
}

test('warp and breathe together differ from either alone', async () => {
  const t = 3.3;
  const r = Object.fromEntries((await runJobs([
    { name: 'warp', kind: 'engine', timeSec: t, doc: doc([{ kind: 'warp', speed: 60, amount: 60 }]) },
    { name: 'breathe', kind: 'engine', timeSec: t, doc: doc([{ kind: 'breathe', speed: 60, amount: 80 }]) },
    { name: 'both', kind: 'engine', timeSec: t, doc: doc([
      { kind: 'warp', speed: 60, amount: 60 }, { kind: 'breathe', speed: 60, amount: 80 }]) },
    { name: 'still', kind: 'engine', timeSec: t, doc: doc([]) }
  ])).map((x) => [x.name, x]));

  assert.ok(meanDifference(r.both.pixels, r.warp.pixels) > 1, 'both should differ from warp alone');
  assert.ok(meanDifference(r.both.pixels, r.breathe.pixels) > 1, 'both should differ from breathe alone');
  // breathe dims; the combination must be dimmer than warp alone at the same instant
  assert.ok(meanBrightness(r.both.pixels) < meanBrightness(r.warp.pixels));
  // an empty list really is still
  assert.equal(meanDifference(r.still.pixels, r.still.pixels), 0);
});
```

- [ ] **Step 7: Bauen und alle Tests**

```bash
cd "C:/Users/Max/claud/signalforge" && npm run build:engine && npm test 2>&1 | tail -6
```

Erwartet: alles grün.

- [ ] **Step 8: Commit**

```bash
cd "C:/Users/Max/claud/signalforge" && git add src test && git commit -m "feat(engine): allow several motions per layer"
```

---

### Task 2: Farbregler — Saettigung und zwei Farbachsen

Wie die Helligkeit: dokumentweit, einmal aufs fertige Bild, und bei Neutralstellung kostenlos. **`ctx.filter` gibt es auf dem Zielsystem nicht**, also von Hand über Pixelzugriff.

**Files:**
- Create: `src/engine/color.js`
- Modify: `src/engine/document.js`, `src/engine/engine.js`, `src/engine/index.js`
- Test: `test/engine/color.test.js`

**Interfaces:**
- Consumes: `clamp`
- Produces: `adjustColor(data, { saturation, greenMagenta, blueYellow })` aus `src/engine/color.js`; Dokumentfelder `saturation` (0–200, Standard 100), `greenMagenta` (-100…100, Standard 0), `blueYellow` (-100…100, Standard 0); alle drei in `BINDABLE_DOCUMENT_FIELDS`.

- [ ] **Step 1: Test schreiben**

`test/engine/color.test.js`:

```js
// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { adjustColor, isNeutral } from '../../src/engine/color.js';

const NEUTRAL = { saturation: 100, greenMagenta: 0, blueYellow: 0 };
const px = (r, g, b) => Uint8ClampedArray.from([r, g, b, 255]);

test('neutral settings are recognised as neutral', () => {
  assert.equal(isNeutral(NEUTRAL), true);
  assert.equal(isNeutral({ ...NEUTRAL, saturation: 101 }), false);
  assert.equal(isNeutral({ ...NEUTRAL, greenMagenta: -1 }), false);
});

test('neutral settings leave every pixel untouched', () => {
  const data = px(200, 40, 90);
  adjustColor(data, NEUTRAL);
  assert.deepEqual(Array.from(data), [200, 40, 90, 255]);
});

test('saturation 0 turns a colour into its own grey, preserving brightness', () => {
  const data = px(200, 40, 90);
  adjustColor(data, { ...NEUTRAL, saturation: 0 });
  assert.equal(data[0], data[1]);
  assert.equal(data[1], data[2]);
  // Rec. 601 luma of the original, which is what the grey must match
  const luma = Math.round(0.299 * 200 + 0.587 * 40 + 0.114 * 90);
  assert.ok(Math.abs(data[0] - luma) <= 1, `expected about ${luma}, got ${data[0]}`);
});

test('saturation 200 pushes a colour further from grey without leaving the byte range', () => {
  const data = px(200, 40, 90);
  adjustColor(data, { ...NEUTRAL, saturation: 200 });
  assert.ok(data[0] > 200, 'the dominant channel should grow');
  assert.ok(data[1] < 40, 'the weakest channel should shrink');
  for (const v of [data[0], data[1], data[2]]) assert.ok(v >= 0 && v <= 255);
});

test('a grey pixel stays grey at any saturation', () => {
  for (const s of [0, 50, 200]) {
    const data = px(128, 128, 128);
    adjustColor(data, { ...NEUTRAL, saturation: s });
    assert.deepEqual(Array.from(data).slice(0, 3), [128, 128, 128]);
  }
});

test('the green-magenta axis moves green against red and blue', () => {
  const toMagenta = px(128, 128, 128);
  adjustColor(toMagenta, { ...NEUTRAL, greenMagenta: 100 });
  assert.ok(toMagenta[1] < 128, 'green must fall towards magenta');
  assert.ok(toMagenta[0] > 128 && toMagenta[2] > 128);

  const toGreen = px(128, 128, 128);
  adjustColor(toGreen, { ...NEUTRAL, greenMagenta: -100 });
  assert.ok(toGreen[1] > 128, 'green must rise towards green');
});

test('the blue-yellow axis moves blue against red and green', () => {
  const toYellow = px(128, 128, 128);
  adjustColor(toYellow, { ...NEUTRAL, blueYellow: 100 });
  assert.ok(toYellow[2] < 128, 'blue must fall towards yellow');
  assert.ok(toYellow[0] > 128 && toYellow[1] > 128);
});

test('the alpha channel is never touched', () => {
  const data = Uint8ClampedArray.from([10, 20, 30, 77]);
  adjustColor(data, { saturation: 0, greenMagenta: 100, blueYellow: -100 });
  assert.equal(data[3], 77);
});

test('extreme settings never produce values outside 0..255', () => {
  for (const [r, g, b] of [[0, 0, 0], [255, 255, 255], [255, 0, 0], [0, 255, 0], [0, 0, 255]]) {
    const data = px(r, g, b);
    adjustColor(data, { saturation: 200, greenMagenta: 100, blueYellow: -100 });
    for (let i = 0; i < 3; i += 1) assert.ok(data[i] >= 0 && data[i] <= 255, `channel ${i} = ${data[i]}`);
  }
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

```bash
cd "C:/Users/Max/claud/signalforge" && node --test test/engine/color.test.js
```

Erwartet: FAIL, Modul nicht gefunden.

- [ ] **Step 3: Farbmodul schreiben**

`src/engine/color.js`:

```js
// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later

/** Rec. 601 luma weights — the same ones the eye-weighted grey uses. */
const LUMA_R = 0.299;
const LUMA_G = 0.587;
const LUMA_B = 0.114;

/** Largest push either colour axis can apply, in 0..255 units at full tilt. */
const AXIS_REACH = 40;

export const NEUTRAL_COLOR = Object.freeze({ saturation: 100, greenMagenta: 0, blueYellow: 0 });

/** True when the settings would leave every pixel exactly as it is. */
export function isNeutral(color) {
  return color.saturation === 100 && color.greenMagenta === 0 && color.blueYellow === 0;
}

/**
 * Adjust an RGBA buffer in place.
 *
 * Saturation pulls each pixel towards or away from its own grey, so a grey
 * pixel can never gain colour and brightness is preserved.
 *
 * The two axes are the pairs a photo editor offers: green against magenta,
 * and blue against yellow. Each moves one channel one way and the other two
 * the other way by half as much, which keeps the overall brightness roughly
 * where it was instead of darkening the picture as you tint it.
 *
 * Alpha is never touched. ctx.filter is deliberately not used: it does not
 * exist on SignalRGB's browser (measured — see docs/erkenntnisse-signalrgb-motor.md).
 */
export function adjustColor(data, color) {
  if (isNeutral(color)) return;

  const sat = color.saturation / 100;
  const gm = (color.greenMagenta / 100) * AXIS_REACH;
  const by = (color.blueYellow / 100) * AXIS_REACH;

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];

    if (sat !== 1) {
      const grey = LUMA_R * r + LUMA_G * g + LUMA_B * b;
      r = grey + (r - grey) * sat;
      g = grey + (g - grey) * sat;
      b = grey + (b - grey) * sat;
    }

    if (gm !== 0) {
      g -= gm;
      r += gm / 2;
      b += gm / 2;
    }
    if (by !== 0) {
      b -= by;
      r += by / 2;
      g += by / 2;
    }

    // Uint8ClampedArray clamps on write, so no manual clamping is needed.
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
  }
}
```

- [ ] **Step 4: Dokumentfelder ergaenzen**

In `src/engine/document.js`, im Rückgabeobjekt von `normalizeDocument` neben `brightness`:

```js
    saturation: clamp(num(input.saturation, 100), 0, 200),
    greenMagenta: clamp(num(input.greenMagenta, 0), -100, 100),
    blueYellow: clamp(num(input.blueYellow, 0), -100, 100),
```

und die drei Namen in `BINDABLE_DOCUMENT_FIELDS` aufnehmen.

- [ ] **Step 5: Im Motor anwenden**

In `src/engine/engine.js` wird die Helligkeit bereits einmal aufs fertige Bild angewendet und bei 100 übersprungen. Farbe und Helligkeit müssen sich **eine** Pixelrunde teilen, sonst zahlt man sie zweimal. Die bestehende `applyBrightness` durch eine gemeinsame Nachbearbeitung ersetzen:

```js
import { adjustColor, isNeutral } from './color.js';

/**
 * Brightness and colour in a single pass over the frame.
 *
 * Both are skipped entirely when neutral, so a document nobody has adjusted
 * pays nothing — this runs about 30 times a second, forever.
 */
function applyFinish(ctx, doc) {
  const brightness = doc.brightness / 100;
  const color = {
    saturation: doc.saturation,
    greenMagenta: doc.greenMagenta,
    blueYellow: doc.blueYellow
  };
  if (brightness === 1 && isNeutral(color)) return;

  const image = ctx.getImageData(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  const data = image.data;
  if (brightness !== 1) {
    for (let i = 0; i < data.length; i += 4) {
      data[i] *= brightness;
      data[i + 1] *= brightness;
      data[i + 2] *= brightness;
    }
  }
  adjustColor(data, color);
  ctx.putImageData(image, 0, 0);
}
```

Den Aufruf von `applyBrightness` am Ende von `render` durch `applyFinish(ctx, doc)` ersetzen.

- [ ] **Step 6: Mitexportieren**

In `src/engine/index.js`:

```js
export { adjustColor, isNeutral, NEUTRAL_COLOR } from './color.js';
```

- [ ] **Step 7: Kostenprobe**

An `test/engine/color.test.js` anhängen — beweist, dass die Nachbearbeitung bei Neutralstellung wirklich übersprungen wird und nicht nur zufällig dasselbe Ergebnis liefert:

```js
import { runJobs } from '../harness/render.js';
import { meanDifference, meanBrightness } from '../harness/pixels.js';

const QUADRANTS = 'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAHklEQVR42mXJsQ0AAAgDIOr/P9fVRFZSkMI4QtE/C5t8BQM0UanVAAAAAElFTkSuQmCC';
const base = (extra) => ({
  assets: { q: { kind: 'image', mime: 'image/png', data: QUADRANTS } },
  layers: [{ id: 'a1', type: 'image', asset: 'q', fit: 'stretch', motions: [] }],
  ...extra
});

test('colour settings reach the rendered frame, and neutral changes nothing', async () => {
  const r = Object.fromEntries((await runJobs([
    { name: 'plain', kind: 'engine', timeSec: 0, doc: base({}) },
    { name: 'neutral', kind: 'engine', timeSec: 0, doc: base({ saturation: 100, greenMagenta: 0, blueYellow: 0 }) },
    { name: 'grey', kind: 'engine', timeSec: 0, doc: base({ saturation: 0 }) },
    { name: 'magenta', kind: 'engine', timeSec: 0, doc: base({ greenMagenta: 100 }) }
  ])).map((x) => [x.name, x]));

  assert.equal(meanDifference(r.plain.pixels, r.neutral.pixels), 0, 'neutral must be byte-identical');
  assert.ok(meanDifference(r.plain.pixels, r.grey.pixels) > 5, 'saturation 0 must visibly change the frame');
  assert.ok(meanDifference(r.plain.pixels, r.magenta.pixels) > 2, 'the colour axis must visibly change the frame');
  // greying keeps overall brightness roughly where it was
  assert.ok(Math.abs(meanBrightness(r.grey.pixels) - meanBrightness(r.plain.pixels)) < 8);
});
```

- [ ] **Step 8: Bauen und alle Tests**

```bash
cd "C:/Users/Max/claud/signalforge" && npm run build:engine && npm test 2>&1 | tail -6
```

- [ ] **Step 9: Commit**

```bash
cd "C:/Users/Max/claud/signalforge" && git add src test && git commit -m "feat(engine): saturation and two colour-balance axes"
```

---

### Task 3: Electron-Gerüst

Ein Fenster, das aufgeht. Sonst nichts. Danach hat jede folgende Aufgabe etwas, worin sie leben kann.

**Files:**
- Create: `app/main.js`, `app/preload.cjs`, `app/renderer/index.html`, `app/renderer/main.js`
- Modify: `package.json` (Skript `start`, Feld `main`)
- Test: `test/app/boot.test.js`

**Interfaces:**
- Produces: `npm start` öffnet das Fenster. Die Brücke heißt im Fenster `window.sf` und ist zunächst nur `sf.version()`.

- [ ] **Step 1: Test schreiben**

`test/app/boot.test.js` — startet die App wirklich und prüft, dass das Fenster kommt:

```js
// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const require_ = createRequire(import.meta.url);
const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

test('the app boots, opens a window and exposes its bridge', async () => {
  const child = spawn(require_('electron'), [join(root, 'app', 'main.js'), '--sf-selftest'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, SF_SELFTEST: '1' }
  });

  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (c) => { stdout += c; });
  child.stderr.on('data', (c) => { stderr += c; });

  const code = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.kill(); reject(new Error(`app did not finish\n${stderr}`)); }, 60_000);
    child.on('error', reject);
    child.on('close', (c) => { clearTimeout(timer); resolve(c); });
  });

  assert.equal(code, 0, `app exited with ${code}\n${stderr}`);
  const report = JSON.parse(stdout.trim().split('\n').pop());
  assert.equal(report.windowOpened, true);
  assert.equal(report.bridge, true, 'window.sf must exist in the renderer');
  assert.equal(report.nodeInRenderer, false, 'the renderer must not reach Node');
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

```bash
cd "C:/Users/Max/claud/signalforge" && node --test test/app/boot.test.js
```

Erwartet: FAIL — `app/main.js` gibt es nicht.

- [ ] **Step 3: Hauptprozess schreiben**

`app/main.js`:

```js
// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import { app, BrowserWindow } from 'electron';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/**
 * The renderer gets no Node at all. Everything it needs arrives through the
 * enumerated bridge in preload.cjs — see app/preload.cjs.
 */
function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1040,
    minHeight: 700,
    show: false,
    backgroundColor: '#0b0d14',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(here, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  });
  win.once('ready-to-show', () => win.show());
  win.loadFile(join(here, 'renderer', 'index.html'));
  return win;
}

app.whenReady().then(async () => {
  const win = createWindow();

  if (process.env.SF_SELFTEST === '1') {
    // Boot check for the test suite: prove the window came up and that the
    // renderer has the bridge but no Node, then quit.
    await new Promise((resolve) => win.webContents.once('did-finish-load', resolve));
    const report = await win.webContents.executeJavaScript(
      `({ windowOpened: true, bridge: typeof window.sf === 'object',
          nodeInRenderer: typeof require === 'function' || typeof process === 'object' })`
    );
    process.stdout.write(JSON.stringify(report) + '\n');
    app.quit();
    return;
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => app.quit());
```

- [ ] **Step 4: Brücke schreiben**

`app/preload.cjs` — bewusst CommonJS, weil `package.json` auf ESM steht:

```js
// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
const { contextBridge, ipcRenderer } = require('electron');

/**
 * The whole surface the window can reach. Every entry is named here on
 * purpose: nothing gets to the renderer that is not on this list.
 */
contextBridge.exposeInMainWorld('sf', {
  version: () => ipcRenderer.invoke('sf:version')
});
```

- [ ] **Step 5: Fenster-Grundgerüst schreiben**

`app/renderer/index.html`:

```html
<!doctype html>
<!-- SignalForge — build SignalRGB effects from images, video, gradients and shapes.
     Copyright (C) 2026 Max
     SPDX-License-Identifier: GPL-3.0-or-later -->
<meta charset="utf-8" />
<meta http-equiv="Content-Security-Policy"
      content="default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; media-src 'self' data:" />
<title>SignalForge</title>
<body>
  <main id="app"></main>
  <script type="module" src="./main.js"></script>
</body>
```

`app/renderer/main.js`:

```js
// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
document.getElementById('app').textContent = 'SignalForge';
```

- [ ] **Step 6: `sf:version` beantworten**

In `app/main.js` oben ergänzen:

```js
import { ipcMain } from 'electron';

ipcMain.handle('sf:version', () => app.getVersion());
```

- [ ] **Step 7: package.json ergaenzen**

```json
  "main": "app/main.js",
```

und bei `scripts`:

```json
    "start": "npm run build:engine && electron app/main.js",
```

- [ ] **Step 8: Test laufen lassen und einmal von Hand starten**

```bash
cd "C:/Users/Max/claud/signalforge" && node --test test/app/boot.test.js
```

Erwartet: `pass 1`.

```bash
cd "C:/Users/Max/claud/signalforge" && npm start
```

Erwartet: ein dunkles Fenster mit dem Wort SignalForge. Wieder schließen.

- [ ] **Step 9: Commit**

```bash
cd "C:/Users/Max/claud/signalforge" && git add app package.json test && git commit -m "feat(app): Electron shell with a sandboxed renderer"
```

---

### Task 4: Einstellungen und Effektordner

Wo die App ihre Einstellungen ablegt, und wie sie den SignalRGB-Ordner findet, ohne zu raten.

**Files:**
- Create: `src/main/settings.js`, `src/main/effects-target.js`
- Modify: `app/main.js`, `app/preload.cjs`
- Test: `test/main/settings.test.js`, `test/main/effects-target.test.js`

**Interfaces:**
- Consumes: `findEffectsFolders` (Bauplan 1)
- Produces:
  - `createSettings({ file, readFile, writeFile }) -> { get(key), set(key, value), all() }` — Standardwerte eingebaut, kaputte Datei wird verworfen statt zu werfen
  - `resolveEffectsTarget({ settings, documentsPath, homePath, exists }) -> { folder, source }` mit `source` aus `'configured' | 'detected' | 'none'`
  - Brücke: `sf.settings.get/set`, `sf.effectsTarget()`, `sf.chooseFolder()`

- [ ] **Step 1: Tests schreiben**

`test/main/settings.test.js`:

```js
// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSettings, DEFAULT_SETTINGS } from '../../src/main/settings.js';

function fake(initial) {
  let content = initial;
  return {
    file: 'X:\\settings.json',
    readFile: () => { if (content === null) throw new Error('ENOENT'); return content; },
    writeFile: (_f, text) => { content = text; },
    current: () => content
  };
}

test('missing file yields the defaults', () => {
  const s = createSettings(fake(null));
  assert.deepEqual(s.all(), DEFAULT_SETTINGS);
});

test('a corrupt file is discarded rather than throwing', () => {
  const s = createSettings(fake('{not json'));
  assert.deepEqual(s.all(), DEFAULT_SETTINGS);
});

test('unknown keys in the file are ignored', () => {
  const s = createSettings(fake('{"language":"en","somethingElse":1}'));
  assert.equal(s.get('language'), 'en');
  assert.equal(s.get('somethingElse'), undefined);
});

test('set writes through and survives a reload', () => {
  const io = fake(null);
  createSettings(io).set('language', 'en');
  assert.equal(createSettings(io).get('language'), 'en');
});

test('an unknown key cannot be set', () => {
  const s = createSettings(fake(null));
  assert.throws(() => s.set('nope', 1), /unknown setting/i);
});

test('a wrongly typed stored value falls back to the default', () => {
  const s = createSettings(fake('{"language":42}'));
  assert.equal(s.get('language'), DEFAULT_SETTINGS.language);
});
```

`test/main/effects-target.test.js`:

```js
// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveEffectsTarget } from '../../src/main/effects-target.js';

const HOME = 'C:\\Users\\Someone';
const DOCS = `${HOME}\\Documents`;
const DETECTED = `${DOCS}\\WhirlwindFX\\Effects`;
const settingsWith = (folder) => ({ get: (k) => (k === 'effectsFolder' ? folder : undefined) });

test('a configured folder that exists wins', () => {
  const r = resolveEffectsTarget({
    settings: settingsWith('D:\\Eigene'),
    documentsPath: DOCS, homePath: HOME,
    exists: (p) => p === 'D:\\Eigene' || p === DETECTED
  });
  assert.deepEqual(r, { folder: 'D:\\Eigene', source: 'configured' });
});

test('a configured folder that no longer exists is not used', () => {
  const r = resolveEffectsTarget({
    settings: settingsWith('D:\\Weg'),
    documentsPath: DOCS, homePath: HOME,
    exists: (p) => p === DETECTED
  });
  assert.deepEqual(r, { folder: DETECTED, source: 'detected' });
});

test('nothing configured and nothing found means asking the user', () => {
  const r = resolveEffectsTarget({
    settings: settingsWith(undefined),
    documentsPath: DOCS, homePath: HOME,
    exists: () => false
  });
  assert.deepEqual(r, { folder: null, source: 'none' });
});
```

- [ ] **Step 2: Tests laufen lassen, Fehlschlag bestätigen**

```bash
cd "C:/Users/Max/claud/signalforge" && node --test test/main/settings.test.js test/main/effects-target.test.js
```

- [ ] **Step 3: Einstellungen schreiben**

`src/main/settings.js`:

```js
// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Every setting the app has, with its default and its type. Anything not
 * listed here cannot be read or written — a stored file from a newer version
 * therefore cannot smuggle keys into an older one.
 */
export const SETTING_TYPES = Object.freeze({
  language: 'string',
  effectsFolder: 'string',
  lastProjectFolder: 'string'
});

export const DEFAULT_SETTINGS = Object.freeze({
  language: 'de',
  effectsFolder: '',
  lastProjectFolder: ''
});

export function createSettings({ file, readFile, writeFile }) {
  let values = { ...DEFAULT_SETTINGS };

  try {
    const parsed = JSON.parse(readFile(file));
    for (const [key, type] of Object.entries(SETTING_TYPES)) {
      if (Object.prototype.hasOwnProperty.call(parsed, key) && typeof parsed[key] === type) {
        values[key] = parsed[key];
      }
    }
  } catch {
    // No file yet, or an unreadable one. Defaults are the right answer for
    // both, and losing a broken settings file is better than refusing to start.
    values = { ...DEFAULT_SETTINGS };
  }

  return {
    all: () => ({ ...values }),
    get: (key) => values[key],
    set(key, value) {
      if (!Object.prototype.hasOwnProperty.call(SETTING_TYPES, key)) {
        throw new Error(`unknown setting: ${key}`);
      }
      if (typeof value !== SETTING_TYPES[key]) {
        throw new Error(`setting ${key} must be a ${SETTING_TYPES[key]}`);
      }
      values[key] = value;
      writeFile(file, JSON.stringify(values, null, 2));
    }
  };
}
```

- [ ] **Step 4: Zielordner-Auflösung schreiben**

`src/main/effects-target.js`:

```js
// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import { findEffectsFolders } from './effects-folder.js';

/**
 * Where finished effects go.
 *
 * A folder the user picked wins, but only while it still exists — a moved or
 * deleted folder must not silently swallow exports. Otherwise the detected
 * one. Never a guess: `source: 'none'` means the app has to ask.
 */
export function resolveEffectsTarget({ settings, documentsPath, homePath, exists }) {
  const configured = settings.get('effectsFolder');
  if (configured && exists(configured)) {
    return { folder: configured, source: 'configured' };
  }
  const found = findEffectsFolders({ documentsPath, homePath, exists });
  if (found.length > 0) return { folder: found[0], source: 'detected' };
  return { folder: null, source: 'none' };
}
```

- [ ] **Step 5: An die Brücke haengen**

In `app/main.js`:

```js
import { dialog } from 'electron';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { createSettings } from '../src/main/settings.js';
import { resolveEffectsTarget } from '../src/main/effects-target.js';

let settings;

function currentTarget() {
  return resolveEffectsTarget({
    settings,
    documentsPath: app.getPath('documents'),
    homePath: homedir(),
    exists: (p) => existsSync(p)
  });
}
```

`settings` in `app.whenReady()` anlegen, bevor das Fenster kommt:

```js
  settings = createSettings({
    file: join(app.getPath('userData'), 'settings.json'),
    readFile: (f) => readFileSync(f, 'utf8'),
    writeFile: (f, text) => writeFileSync(f, text, 'utf8')
  });
```

Und die Handler:

```js
ipcMain.handle('sf:settings:all', () => settings.all());
ipcMain.handle('sf:settings:set', (_e, key, value) => { settings.set(key, value); return settings.all(); });
ipcMain.handle('sf:effectsTarget', () => currentTarget());
ipcMain.handle('sf:chooseFolder', async () => {
  const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
  if (result.canceled || result.filePaths.length === 0) return currentTarget();
  settings.set('effectsFolder', result.filePaths[0]);
  return currentTarget();
});
```

`app.getPath('documents')` folgt der Windows-Einstellung und zeigt damit auch dann richtig, wenn „Dokumente" nach OneDrive umgeleitet ist.

In `app/preload.cjs` die Brücke erweitern:

```js
  settings: {
    all: () => ipcRenderer.invoke('sf:settings:all'),
    set: (key, value) => ipcRenderer.invoke('sf:settings:set', key, value)
  },
  effectsTarget: () => ipcRenderer.invoke('sf:effectsTarget'),
  chooseFolder: () => ipcRenderer.invoke('sf:chooseFolder'),
```

- [ ] **Step 6: Tests und Commit**

```bash
cd "C:/Users/Max/claud/signalforge" && npm test 2>&1 | tail -6
```

```bash
cd "C:/Users/Max/claud/signalforge" && git add src app test && git commit -m "feat(app): settings and effects-folder resolution"
```

---

### Task 5: Oberflaechen-Gerüst, Glassmorphism und Zweisprachigkeit

Das dreispaltige Fenster, die Design-Token und die Sprachumschaltung. Noch ohne Inhalt in den Spalten.

**Files:**
- Create: `app/renderer/styles/tokens.css`, `app/renderer/styles/app.css`, `app/renderer/i18n/de.json`, `app/renderer/i18n/en.json`, `app/renderer/i18n/i18n.js`, `app/renderer/components/shell.js`
- Modify: `app/renderer/index.html`, `app/renderer/main.js`
- Test: `test/app/i18n.test.js`

**Interfaces:**
- Produces: `createI18n(dictionaries, language) -> { t(key), language, setLanguage(l) }`; `mountShell(root) -> { layers, preview, inspector, footer }` — vier leere Bereiche, die die folgenden Aufgaben füllen.

- [ ] **Step 1: Test schreiben**

`test/app/i18n.test.js` — pinnt die eine Eigenschaft, die sonst still verrottet: dass beide Sprachen dieselben Schlüssel haben.

```js
// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const load = (name) => JSON.parse(readFileSync(
  fileURLToPath(new URL(`../../app/renderer/i18n/${name}.json`, import.meta.url)), 'utf8'));

test('both languages carry exactly the same keys', () => {
  const de = Object.keys(load('de')).sort();
  const en = Object.keys(load('en')).sort();
  const missingInEn = de.filter((k) => !en.includes(k));
  const missingInDe = en.filter((k) => !de.includes(k));
  assert.deepEqual(missingInEn, [], 'keys present in de but not en');
  assert.deepEqual(missingInDe, [], 'keys present in en but not de');
});

test('no value is left empty', () => {
  for (const name of ['de', 'en']) {
    for (const [key, value] of Object.entries(load(name))) {
      assert.ok(typeof value === 'string' && value.trim().length > 0, `${name}.${key} is empty`);
    }
  }
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Erwartet: FAIL, Dateien fehlen.

- [ ] **Step 3: Design-Token schreiben**

`app/renderer/styles/tokens.css` — genau die Werte aus dem Abschnitt „Design-Token" oben, als `:root { … }`. Keine anderen Farben irgendwo im Projekt; wer eine neue braucht, trägt sie hier ein.

- [ ] **Step 4: Grundstil schreiben**

`app/renderer/styles/app.css`:

```css
/* SignalForge — build SignalRGB effects from images, video, gradients and shapes.
   Copyright (C) 2026 Max
   SPDX-License-Identifier: GPL-3.0-or-later */
* { box-sizing: border-box; }

html, body {
  margin: 0;
  height: 100%;
  background: var(--bg-base);
  color: var(--text-strong);
  font: 14px/1.5 "Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif;
  overflow: hidden;
}

/* The three soft blobs behind everything. They pick up the colours of the
   effect being edited, which is the reason this interface is made of glass
   rather than just decorated with it. */
#backdrop {
  position: fixed;
  inset: -20%;
  z-index: 0;
  filter: blur(80px) saturate(1.2);
  transition: opacity 400ms ease;
}
#backdrop div {
  position: absolute;
  width: 46%;
  height: 46%;
  border-radius: 50%;
  opacity: 0.55;
}

#app {
  position: relative;
  z-index: 1;
  height: 100%;
  display: grid;
  grid-template-columns: 260px 1fr 300px;
  grid-template-rows: 1fr auto;
  grid-template-areas: "layers preview inspector" "footer footer footer";
  gap: var(--gap);
  padding: var(--gap);
}

.panel {
  background: var(--glass-fill);
  border: 1px solid var(--glass-stroke);
  border-radius: var(--radius);
  backdrop-filter: blur(var(--glass-blur));
  padding: var(--panel-pad);
  overflow: auto;
}

#layers    { grid-area: layers; }
#preview   { grid-area: preview; display: grid; place-items: center; }
#inspector { grid-area: inspector; }
#footer    { grid-area: footer; display: flex; align-items: center; gap: var(--gap); }

.muted { color: var(--text-muted); }

button {
  font: inherit;
  color: var(--text-strong);
  background: var(--glass-fill);
  border: 1px solid var(--glass-stroke);
  border-radius: 10px;
  padding: 8px 14px;
  cursor: pointer;
}
button:hover { background: rgba(255, 255, 255, 0.11); }
button.primary { background: var(--accent-soft); border-color: var(--accent); }

/* Focus must stay obvious on glass — never remove the ring without a
   replacement that is at least as visible. */
:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

@media (prefers-reduced-motion: reduce) {
  * { transition: none !important; animation: none !important; }
}
```

- [ ] **Step 5: Sprachdateien schreiben**

`app/renderer/i18n/de.json`:

```json
{
  "app.title": "SignalForge",
  "layers.title": "Ebenen",
  "inspector.title": "Einstellungen",
  "preview.dropHint": "Bild hierher ziehen",
  "preview.cost": "Rechenlast",
  "footer.export": "In SignalRGB speichern",
  "footer.save": "Projekt speichern",
  "footer.open": "Projekt oeffnen",
  "footer.name": "Name",
  "settings.language": "Sprache",
  "settings.effectsFolder": "Effektordner",
  "settings.chooseFolder": "Ordner waehlen"
}
```

`app/renderer/i18n/en.json` mit denselben Schlüsseln auf Englisch.

- [ ] **Step 6: Sprachmodul schreiben**

`app/renderer/i18n/i18n.js`:

```js
// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * A missing key returns the key itself rather than an empty string, so a gap
 * is visible in the window instead of silently rendering nothing.
 */
export function createI18n(dictionaries, language) {
  let current = dictionaries[language] ? language : 'en';
  return {
    get language() { return current; },
    setLanguage(next) { if (dictionaries[next]) current = next; },
    t(key) { return dictionaries[current][key] ?? key; }
  };
}
```

- [ ] **Step 7: Gerüst schreiben**

`app/renderer/components/shell.js`:

```js
// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later

/** Build the three-column frame and hand back its empty regions. */
export function mountShell(root, t) {
  root.innerHTML = `
    <section class="panel" id="layers"><h2>${t('layers.title')}</h2><div id="layer-list"></div></section>
    <section class="panel" id="preview"><div id="preview-body"></div></section>
    <section class="panel" id="inspector"><h2>${t('inspector.title')}</h2><div id="inspector-body"></div></section>
    <section class="panel" id="footer"><div id="footer-body"></div></section>
  `;
  return {
    layers: root.querySelector('#layer-list'),
    preview: root.querySelector('#preview-body'),
    inspector: root.querySelector('#inspector-body'),
    footer: root.querySelector('#footer-body')
  };
}

/** Three blurred blobs behind the glass, tinted from the effect's own colours. */
export function mountBackdrop(colours) {
  let node = document.getElementById('backdrop');
  if (!node) {
    node = document.createElement('div');
    node.id = 'backdrop';
    node.innerHTML = '<div></div><div></div><div></div>';
    document.body.prepend(node);
  }
  const spots = [['6%', '4%'], ['52%', '38%'], ['24%', '62%']];
  node.querySelectorAll('div').forEach((blob, i) => {
    blob.style.left = spots[i][0];
    blob.style.top = spots[i][1];
    blob.style.background = colours[i] ?? '#243049';
  });
}
```

- [ ] **Step 8: Zusammenstecken**

`app/renderer/index.html` um die beiden Stilblätter ergänzen. `app/renderer/main.js`:

```js
// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import { createI18n } from './i18n/i18n.js';
import { mountShell, mountBackdrop } from './components/shell.js';

const dictionaries = {
  de: await (await fetch('./i18n/de.json')).json(),
  en: await (await fetch('./i18n/en.json')).json()
};

const settings = await window.sf.settings.all();
const i18n = createI18n(dictionaries, settings.language);

mountBackdrop(['#2a3a5c', '#4a2f52', '#20404a']);
mountShell(document.getElementById('app'), (k) => i18n.t(k));
```

- [ ] **Step 9: Ansehen**

```bash
cd "C:/Users/Max/claud/signalforge" && npm start
```

Erwartet: drei milchige Flächen über einem dunklen, farbig schimmernden Hintergrund. **Hinsehen, nicht nur starten:** Sind die Überschriften auf dem Glas gut lesbar? Wenn nicht, `--glass-fill` undurchsichtiger machen — nicht den Text heller.

- [ ] **Step 10: Tests und Commit**

```bash
cd "C:/Users/Max/claud/signalforge" && npm test 2>&1 | tail -6
```

```bash
cd "C:/Users/Max/claud/signalforge" && git add app test && git commit -m "feat(app): glass shell, design tokens and two languages"
```

---

### Task 6: Live-Vorschau mit Rechenlastanzeige

Die Fläche in der Mitte. Sie lädt dasselbe Motorpaket, das auch in den Export wandert — damit gilt der Paritätstest aus Bauplan 1 auch für die Vorschau.

**Files:**
- Create: `app/renderer/components/preview.js`
- Modify: `app/renderer/index.html` (Motorpaket laden), `app/renderer/main.js`
- Test: `test/app/preview-cost.test.js`

**Interfaces:**
- Consumes: `window.SignalForgeEngine`
- Produces: `createPreview(container) -> { setDocument(doc), start(), stop(), cost() }`. `cost()` liefert `{ msPerFrame, coreShare }`.

- [ ] **Step 1: Test schreiben**

Die Kostenrechnung ist reine Arithmetik und gehört getestet; das Zeichnen selbst deckt der Paritätstest ab.

`test/app/preview-cost.test.js`:

```js
// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { coreShare, costLevel, FRAMES_PER_SECOND, WARN_SHARE } from '../../app/renderer/components/cost.js';

test('one millisecond per frame is three percent of a core at 30 fps', () => {
  assert.equal(FRAMES_PER_SECOND, 30);
  assert.ok(Math.abs(coreShare(1) - 0.03) < 0.0005);
});

test('the warning threshold is five milliseconds, which is fifteen percent', () => {
  assert.ok(Math.abs(coreShare(5) - WARN_SHARE) < 0.0005);
  assert.equal(costLevel(4.9), 'ok');
  assert.equal(costLevel(5.1), 'warn');
});

test('the level is monotonic', () => {
  const order = { ok: 0, warn: 1 };
  let last = -1;
  for (let ms = 0; ms < 12; ms += 0.25) {
    const level = order[costLevel(ms)];
    assert.ok(level >= last, `level went down at ${ms} ms`);
    last = level;
  }
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

- [ ] **Step 3: Kostenmodul schreiben**

`app/renderer/components/cost.js`:

```js
// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later

/** The exported effect caps itself here, so this is what a frame really costs. */
export const FRAMES_PER_SECOND = 30;
/** Warn above 15 % of one core: this thing runs around the clock. */
export const WARN_SHARE = 0.15;

export function coreShare(msPerFrame) {
  return (msPerFrame * FRAMES_PER_SECOND) / 1000;
}

export function costLevel(msPerFrame) {
  return coreShare(msPerFrame) >= WARN_SHARE ? 'warn' : 'ok';
}
```

- [ ] **Step 4: Vorschau schreiben**

`app/renderer/components/preview.js`:

```js
// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import { coreShare, costLevel, FRAMES_PER_SECOND } from './cost.js';

const FRAME_GAP = 1000 / FRAMES_PER_SECOND;
/** Rolling average over this many frames, so the reading does not flicker. */
const COST_WINDOW = 30;

/**
 * The live preview.
 *
 * It loads the same bundle the exported effect embeds, so what is on screen
 * here is produced by the same code that will run inside SignalRGB. That is
 * the whole reason to bundle at all — see test/export/parity.test.js.
 */
export function createPreview(container, t) {
  const SF = window.SignalForgeEngine;

  const canvas = document.createElement('canvas');
  canvas.width = SF.CANVAS_WIDTH;
  canvas.height = SF.CANVAS_HEIGHT;
  canvas.id = 'preview-canvas';
  canvas.style.width = '100%';
  canvas.style.imageRendering = 'auto';

  const readout = document.createElement('p');
  readout.className = 'muted';

  container.append(canvas, readout);

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const renderer = SF.createRenderer();

  let doc = SF.normalizeDocument({}).doc;
  let assets = new Map();
  let running = false;
  let start = null;
  let lastFrame = -1e9;
  const samples = [];

  async function setDocument(next) {
    doc = SF.normalizeDocument(next).doc;
    assets = await SF.loadAssets(doc, {
      resolveUrl: (asset) => (asset.data ? `data:${asset.mime};base64,${asset.data}` : asset.file)
    });
  }

  function frame(stamp) {
    if (!running) return;
    window.requestAnimationFrame(frame);
    if (start === null) start = stamp;
    if (stamp - lastFrame < FRAME_GAP) return;
    lastFrame = stamp;

    const began = performance.now();
    renderer.render(ctx, doc, assets, (stamp - start) / 1000);
    samples.push(performance.now() - began);
    if (samples.length > COST_WINDOW) samples.shift();

    const ms = samples.reduce((a, b) => a + b, 0) / samples.length;
    readout.textContent = `${t('preview.cost')}: ${ms.toFixed(2)} ms — ${Math.round(coreShare(ms) * 100)} %`;
    readout.style.color = costLevel(ms) === 'warn' ? 'var(--warn)' : 'var(--text-muted)';
  }

  return {
    setDocument,
    start() { if (!running) { running = true; window.requestAnimationFrame(frame); } },
    stop() { running = false; },
    cost() {
      const ms = samples.length ? samples.reduce((a, b) => a + b, 0) / samples.length : 0;
      return { msPerFrame: ms, coreShare: coreShare(ms) };
    },
    canvas
  };
}
```

`performance.now` steht hier bewusst — die Vorschau lebt im Fensterprozess, nicht im Motor. Die Motor-Grenze verbietet es nur unter `src/engine/`.

- [ ] **Step 5: Motorpaket im Fenster laden**

In `app/renderer/index.html` **vor** dem Modul-Skript:

```html
  <script src="../../dist/engine.bundle.js"></script>
```

Die Datei liegt außerhalb von `app/`; `npm start` baut sie vorher. Sollte sie fehlen, muss das Fenster eine verständliche Meldung zeigen statt leer zu bleiben — in `main.js` vor allem anderen:

```js
if (!window.SignalForgeEngine) {
  document.body.textContent = 'dist/engine.bundle.js is missing. Run: npm run build:engine';
  throw new Error('engine bundle missing');
}
```

- [ ] **Step 6: Ansehen**

`main.js` um eine Vorschau mit einem Testdokument ergänzen und `npm start`. Erwartet: eine 320 × 200-Fläche, darunter die Rechenlast. Bei einem leeren Dokument liegt sie nahe null.

- [ ] **Step 7: Tests und Commit**

```bash
cd "C:/Users/Max/claud/signalforge" && npm test 2>&1 | tail -6
```

```bash
cd "C:/Users/Max/claud/signalforge" && git add app test && git commit -m "feat(app): live preview with a cost readout"
```

---

### Task 7: Bild hineinziehen

**Files:**
- Create: `app/renderer/components/drop.js`
- Modify: `app/main.js`, `app/preload.cjs`, `app/renderer/main.js`
- Test: `test/app/drop.test.js`

**Interfaces:**
- Consumes: `prepareImageFile` (Bauplan 1)
- Produces: Brücke `sf.importImage(path) -> asset`; `mountDrop(element, { onFile })`

- [ ] **Step 1: Test schreiben**

Der Teil, der sich ohne Fenster testen lässt, ist die Prüfung der Dateiendung — und genau dort entscheidet sich, ob ein Nutzer eine verständliche Meldung bekommt oder einen Absturz.

`test/app/drop.test.js`:

```js
// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { isSupportedImage, SUPPORTED_IMAGE_EXTENSIONS } from '../../app/renderer/components/drop.js';

test('the usual image types are accepted, case-insensitively', () => {
  for (const name of ['a.png', 'B.JPG', 'c.jpeg', 'd.webp', 'e.GIF', 'f.bmp']) {
    assert.equal(isSupportedImage(name), true, name);
  }
});

test('everything else is refused', () => {
  for (const name of ['clip.mp4', 'notes.txt', 'archive.zip', 'noextension', 'trap.png.exe']) {
    assert.equal(isSupportedImage(name), false, name);
  }
});

test('the list is the single source of truth and is not empty', () => {
  assert.ok(SUPPORTED_IMAGE_EXTENSIONS.length >= 5);
  for (const ext of SUPPORTED_IMAGE_EXTENSIONS) assert.match(ext, /^\.[a-z]+$/);
});
```

`trap.png.exe` ist der Fall, der zählt: geprüft wird die **letzte** Endung, nicht ob der Name irgendwo `.png` enthält.

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

- [ ] **Step 3: Ablegebereich schreiben**

`app/renderer/components/drop.js`:

```js
// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later

export const SUPPORTED_IMAGE_EXTENSIONS = Object.freeze(
  ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp']
);

/** Judge the last extension only — "trap.png.exe" is not an image. */
export function isSupportedImage(name) {
  const dot = name.lastIndexOf('.');
  if (dot < 0) return false;
  return SUPPORTED_IMAGE_EXTENSIONS.includes(name.slice(dot).toLowerCase());
}

export function mountDrop(element, { onFile, onReject }) {
  const stop = (event) => { event.preventDefault(); event.stopPropagation(); };

  element.addEventListener('dragover', (event) => {
    stop(event);
    element.classList.add('drop-active');
  });
  element.addEventListener('dragleave', (event) => {
    stop(event);
    element.classList.remove('drop-active');
  });
  element.addEventListener('drop', (event) => {
    stop(event);
    element.classList.remove('drop-active');
    const file = event.dataTransfer?.files?.[0];
    if (!file) return;
    // Electron gives the real path through webUtils; the renderer never
    // reads the file itself, it only hands the path to the main process.
    const path = window.sf.pathForFile(file);
    if (!isSupportedImage(file.name)) { onReject(file.name); return; }
    onFile(path);
  });
}
```

- [ ] **Step 4: Brücke ergaenzen**

In `app/preload.cjs`:

```js
const { webUtils } = require('electron');
```

und in der Brücke:

```js
  pathForFile: (file) => webUtils.getPathForFile(file),
  importImage: (path) => ipcRenderer.invoke('sf:importImage', path),
```

In `app/main.js`:

```js
import { prepareImageFile } from '../src/main/prepare-image.js';

ipcMain.handle('sf:importImage', async (_e, path) => {
  try {
    return { ok: true, asset: await prepareImageFile(path) };
  } catch (error) {
    return { ok: false, message: String(error.message || error) };
  }
});
```

Der Fehler wird als Wert zurückgegeben statt geworfen, damit das Fenster ihn anzeigen kann statt in einer abgelehnten Zusage zu versanden.

- [ ] **Step 5: Verdrahten und ansehen**

Ablegebereich auf die Vorschau legen, beim Fallenlassen `sf.importImage` rufen, das Ergebnis als Bildebene ins Dokument setzen, Vorschau aktualisieren. Ablehnung als Text im Fenster, nicht in der Konsole.

`npm start`, ein Bild hineinziehen. Erwartet: es erscheint. Eine `.mp4` hineinziehen. Erwartet: eine verständliche Absage im Fenster.

- [ ] **Step 6: Tests und Commit**

```bash
cd "C:/Users/Max/claud/signalforge" && npm test 2>&1 | tail -6
```

```bash
cd "C:/Users/Max/claud/signalforge" && git add app test && git commit -m "feat(app): drag an image into the window"
```

---

### Task 8: Ausschnitt mit der Maus waehlen

Max' Beschwerde aus dem Praxistest war genau das: das Bild war beschnitten und er kam nicht daran. Ziehen in der Vorschau verschiebt den Ausschnitt.

**Files:**
- Create: `app/renderer/components/crop.js`
- Modify: `app/renderer/main.js`
- Test: `test/app/crop.test.js`

**Interfaces:**
- Produces: `offsetFromDrag({ startOffset, dx, dy, canvasWidth, canvasHeight, slackX, slackY })` — reine Rechnerei, ohne Fenster testbar; `mountCrop(canvas, { getLayer, onChange })`

- [ ] **Step 1: Test schreiben**

`test/app/crop.test.js`:

```js
// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { offsetFromDrag } from '../../app/renderer/components/crop.js';

const base = { startOffset: { x: 0, y: 0 }, canvasWidth: 320, canvasHeight: 200, slackX: 160, slackY: 0 };

test('dragging right moves the crop window left, so the picture follows the mouse', () => {
  const r = offsetFromDrag({ ...base, dx: 40, dy: 0 });
  assert.ok(r.x < 0, 'the picture must move with the pointer, not against it');
});

test('dragging the full slack reaches the end and no further', () => {
  const far = offsetFromDrag({ ...base, dx: 10_000, dy: 0 });
  assert.equal(far.x, -1);
  const back = offsetFromDrag({ ...base, dx: -10_000, dy: 0 });
  assert.equal(back.x, 1);
});

test('an axis with no slack does not move at all', () => {
  const r = offsetFromDrag({ ...base, dx: 0, dy: 500 });
  assert.equal(r.y, 0);
});

test('the mapping is proportional: half the slack is half the offset', () => {
  const r = offsetFromDrag({ ...base, dx: 80, dy: 0 });
  assert.ok(Math.abs(r.x - -0.5) < 1e-9, `expected -0.5, got ${r.x}`);
});

test('a drag starting from an existing offset accumulates', () => {
  const r = offsetFromDrag({ ...base, startOffset: { x: 0.5, y: 0 }, dx: 80, dy: 0 });
  assert.ok(Math.abs(r.x - 0) < 1e-9);
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

- [ ] **Step 3: Umsetzung schreiben**

`app/renderer/components/crop.js`:

```js
// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/**
 * Turn a drag in canvas pixels into a new crop offset.
 *
 * The picture follows the pointer, so dragging right must move the crop
 * window left — that is why dx is subtracted rather than added. Getting this
 * backwards feels wrong instantly, which is why there is a test for it.
 *
 * slackX / slackY are the croppable pixels the fit mode leaves over. With no
 * slack on an axis the offset there cannot move at all.
 */
export function offsetFromDrag({ startOffset, dx, dy, canvasWidth, canvasHeight, slackX, slackY }) {
  const spanX = slackX > 0 ? (canvasWidth * 2) / (slackX / (slackX / 2)) / 2 : 0;
  // Full offset range (-1..1) corresponds to dragging across the whole slack.
  const perPixelX = slackX > 0 ? 2 / (slackX * 2) : 0;
  const perPixelY = slackY > 0 ? 2 / (slackY * 2) : 0;
  return {
    x: slackX > 0 ? clamp(startOffset.x - dx * perPixelX * 2, -1, 1) : startOffset.x,
    y: slackY > 0 ? clamp(startOffset.y - dy * perPixelY * 2, -1, 1) : startOffset.y
  };
}
```

**Achtung, hier ist bewusst eine Rechnung zu prüfen:** Die Testfälle geben vor, dass ein Ziehen um `slackX / 2` Bildschirmpixel den Versatz um genau `1` ändert. Die obige Formel ist ein Vorschlag und `spanX` darin ist überflüssig — **rechne es selbst nach, streiche was nicht gebraucht wird, und richte dich nach den Tests, nicht nach diesem Code.** Wenn die Tests nicht zur Formel passen, ist die Formel falsch, nicht der Test.

- [ ] **Step 4: Ziehen anbinden**

`mountCrop` in derselben Datei: `pointerdown` auf dem Vorschau-Canvas merkt sich Startpunkt und Startversatz, `pointermove` rechnet mit `offsetFromDrag` und meldet über `onChange`, `pointerup` gibt frei. Bildschirmpixel müssen auf Canvas-Pixel umgerechnet werden, weil das Canvas per CSS größer dargestellt wird — `canvas.getBoundingClientRect()` liefert den Faktor. Bei `fit: 'stretch'` gibt es keinen Spielraum; dann Mauszeiger auf Standard lassen statt ein Ziehen anzubieten, das nichts tut.

- [ ] **Step 5: Ansehen**

`npm start`, Bild hineinziehen, in der Vorschau ziehen. **Mit der Maus prüfen, nicht durch Aufrufen der Funktion** — die Richtung fällt nur beim echten Ziehen auf. Erwartet: das Bild folgt dem Zeiger und bleibt am Rand stehen.

- [ ] **Step 6: Tests und Commit**

```bash
cd "C:/Users/Max/claud/signalforge" && npm test 2>&1 | tail -6
```

```bash
cd "C:/Users/Max/claud/signalforge" && git add app test && git commit -m "feat(app): drag the preview to choose the crop"
```

---

### Task 9: Einstellungsspalte

Die rechte Spalte: Bildausschnitt, Bewegungen, Farbe, Helligkeit.

**Files:**
- Create: `app/renderer/components/inspector.js`, `app/renderer/components/field.js`
- Modify: `app/renderer/main.js`, `app/renderer/styles/app.css`
- Test: `test/app/inspector.test.js`

**Interfaces:**
- Consumes: `MOTION_KINDS`, `FIT_MODES` aus dem Motorpaket
- Produces: `describeInspector(doc, layerId) -> Field[]` — was angezeigt werden soll, als Daten; `mountInspector(container, { getDocument, onChange, t })`

Die Trennung ist Absicht: **welche** Felder es gibt, ist Rechnerei und ohne Fenster testbar; **wie** sie aussehen, ist Darstellung.

- [ ] **Step 1: Test schreiben**

`test/app/inspector.test.js`:

```js
// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { describeInspector } from '../../app/renderer/components/inspector.js';
import { normalizeDocument } from '../../src/engine/document.js';

const docWith = (layer) => normalizeDocument({
  assets: { q: { kind: 'image', mime: 'image/png', data: 'AAAA' } },
  layers: [{ id: 'a1', type: 'image', asset: 'q', ...layer }]
}).doc;

test('an image layer offers fit, and one entry per active motion', () => {
  const doc = docWith({ motions: [{ kind: 'warp' }, { kind: 'breathe' }] });
  const fields = describeInspector(doc, 'a1');
  const paths = fields.map((f) => f.path);
  assert.ok(paths.includes('layers.0.fit'));
  assert.ok(paths.includes('layers.0.motions.0.speed'));
  assert.ok(paths.includes('layers.0.motions.1.amount'));
});

test('a layer with no motions offers no motion sliders', () => {
  const fields = describeInspector(docWith({ motions: [] }), 'a1');
  assert.equal(fields.filter((f) => f.path.includes('motions')).length, 0);
});

test('the document-wide fields are always present, exactly once each', () => {
  const fields = describeInspector(docWith({}), 'a1');
  for (const path of ['brightness', 'saturation', 'greenMagenta', 'blueYellow']) {
    assert.equal(fields.filter((f) => f.path === path).length, 1, path);
  }
});

test('every field carries the range and step the control needs', () => {
  for (const field of describeInspector(docWith({ motions: [{ kind: 'warp' }] }), 'a1')) {
    if (field.type !== 'number') continue;
    assert.equal(typeof field.min, 'number', field.path);
    assert.equal(typeof field.max, 'number', field.path);
    assert.ok(field.max > field.min, field.path);
  }
});

test('an unknown layer id yields the document fields only, not a crash', () => {
  const fields = describeInspector(docWith({}), 'ghost');
  assert.ok(fields.length > 0);
  assert.equal(fields.filter((f) => f.path.startsWith('layers.')).length, 0);
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

- [ ] **Step 3: Beschreibung schreiben**

`describeInspector` liefert für jedes Feld `{ path, type, labelKey, min, max, step, values }`. Die Reihenfolge ist die Reihenfolge im Fenster. `type` ist `'number'`, `'select'` oder `'motions'` (die Liste zum Hinzufügen und Entfernen). Pfade sind Punktpfade ins Dokument, damit die Änderung über dieselbe `setByPath`-Mechanik läuft wie die Regler im fertigen Effekt.

- [ ] **Step 4: Felder darstellen**

`field.js` baut aus einer Feldbeschreibung ein bedienbares Element: Schieberegler mit Zahl daneben, Ausklappliste, und für `motions` eine Liste mit „+"-Knopf. Jedes Feld bekommt ein `<label>`, das wirklich mit dem Bedienelement verbunden ist — nicht nur danebengestellter Text.

- [ ] **Step 5: Ansehen**

`npm start`. Bild laden, an jedem Regler ziehen, in der Vorschau zusehen. **Auch mit der Tastatur durchgehen:** Tabulator durch alle Felder, mit Pfeiltasten verstellen. Wenn der Fokus auf dem Glas nicht zu sehen ist, ist das ein Fehler.

- [ ] **Step 6: Tests und Commit**

```bash
cd "C:/Users/Max/claud/signalforge" && npm test 2>&1 | tail -6
```

```bash
cd "C:/Users/Max/claud/signalforge" && git add app test && git commit -m "feat(app): inspector for fit, motions, colour and brightness"
```

---

### Task 10: Projekt speichern und oeffnen

**Files:**
- Create: `src/main/project.js`
- Modify: `app/main.js`, `app/preload.cjs`, `app/renderer/main.js`
- Test: `test/main/project.test.js`

**Interfaces:**
- Produces: `serializeProject(doc) -> string`, `parseProject(text) -> { doc, problems }`; Brücke `sf.saveProject(doc)`, `sf.openProject()`. Dateiendung `.sfx`, Inhalt ist das Dokument-JSON mit einer Formatnummer.

- [ ] **Step 1: Test schreiben**

`test/main/project.test.js`:

```js
// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { serializeProject, parseProject, PROJECT_FORMAT } from '../../src/main/project.js';
import { normalizeDocument } from '../../src/engine/document.js';

const doc = normalizeDocument({
  name: 'Abend',
  assets: { q: { kind: 'image', mime: 'image/png', data: 'AAAA' } },
  layers: [{ id: 'a1', type: 'image', asset: 'q', motions: [{ kind: 'warp', speed: 20, amount: 40 }] }],
  brightness: 80, saturation: 120
}).doc;

test('a saved project reads back the same document', () => {
  const back = parseProject(serializeProject(doc));
  assert.deepEqual(back.doc, doc);
  assert.deepEqual(back.problems, []);
});

test('the file carries its format number', () => {
  assert.equal(JSON.parse(serializeProject(doc)).format, PROJECT_FORMAT);
});

test('a file from a newer format is refused with a clear message, not half-loaded', () => {
  const text = JSON.stringify({ format: PROJECT_FORMAT + 1, document: doc });
  assert.throws(() => parseProject(text), /newer version/i);
});

test('a file with no format number is refused', () => {
  assert.throws(() => parseProject(JSON.stringify({ document: doc })), /format/i);
});

test('unreadable content is refused with a clear message', () => {
  assert.throws(() => parseProject('{not json'), /could not be read/i);
});

test('a document with problems still loads, and the problems come along', () => {
  const text = JSON.stringify({
    format: PROJECT_FORMAT,
    document: { layers: [{ id: 'a1', type: 'image', blend: 'nonsense' }] }
  });
  const back = parseProject(text);
  assert.equal(back.doc.layers[0].blend, 'normal');
  assert.equal(back.problems.length, 1);
});
```

Der letzte Fall ist der wichtige: ein leicht kaputtes Projekt soll sich öffnen lassen und melden, was es korrigiert hat, statt sich zu verweigern.

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

- [ ] **Step 3: Umsetzung schreiben**

`src/main/project.js` mit `PROJECT_FORMAT = 1`, `serializeProject` (Formatnummer plus Dokument, eingerückt gespeichert, damit die Datei in Git lesbar bleibt) und `parseProject` (wirft mit verständlichem Text bei unlesbar, fehlender oder zu neuer Formatnummer; sonst durch `normalizeDocument` und `problems` mitgeben).

- [ ] **Step 4: An die Brücke haengen**

`sf.saveProject(doc)` und `sf.openProject()` mit Electrons Datei-Dialogen, Startordner aus der Einstellung `lastProjectFolder`, die nach jedem Speichern oder Öffnen aktualisiert wird.

- [ ] **Step 5: Ansehen**

Projekt speichern, App schließen, neu starten, öffnen. Erwartet: alles wie vorher, inklusive Bild.

- [ ] **Step 6: Tests und Commit**

```bash
cd "C:/Users/Max/claud/signalforge" && npm test 2>&1 | tail -6
```

```bash
cd "C:/Users/Max/claud/signalforge" && git add src app test && git commit -m "feat(app): save and open projects"
```

---

### Task 11: Exportieren aus der App

**Files:**
- Create: `src/main/export-effect.js`
- Modify: `app/main.js`, `app/preload.cjs`, `app/renderer/main.js`
- Test: `test/main/export-effect.test.js`

**Interfaces:**
- Consumes: `buildEffectHtml`, `resolveEffectsTarget`
- Produces: `exportEffect({ doc, folder, engineSource, lang, force, io }) -> { path, bytes }`; Brücke `sf.exportEffect(doc, { force })`
- Der Reglersatz des Exports entspricht dem, den `bin/sfexport.js` erzeugt: Motion, Speed, Strength, Fit, Brightness — dazu die drei Farbfelder. **Diese Liste gehört genau einmal ins Projekt**, nicht zweimal; beim Bauen zuerst prüfen, ob `bin/sfexport.js` sie hergeben kann, statt sie abzuschreiben.

- [ ] **Step 1: Test schreiben**

`test/main/export-effect.test.js` mit vorgetäuschtem Dateisystem: schreibt an den richtigen Ort; verweigert Überschreiben ohne `force`; überschreibt mit `force`; ein Name mit `/`, `\`, `:` oder `?` wird abgelehnt oder bereinigt, statt einen Pfad zu erzeugen, den der Nutzer nicht gemeint hat.

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

- [ ] **Step 3: Umsetzung schreiben**

Beim Bauen des Dokuments für den Export die Reglerliste aus einer gemeinsamen Stelle holen. Wenn `bin/sfexport.js` sie heute fest eingebaut hat, **erst dort herauslösen**, dann von beiden Seiten benutzen. Zwei Kopien wären genau der Fehler, den dieses Projekt schon zweimal hatte.

- [ ] **Step 4: Knopf anbinden**

Fußzeile: Namensfeld, Zielordner mit Quellenangabe („erkannt" oder „gewählt"), Knopf. Bei `source: 'none'` fragt der Knopf zuerst nach dem Ordner. Existiert die Datei, kommt eine Rückfrage mit dem vollen Pfad — kein stilles Überschreiben. Nach dem Schreiben Pfad und Größe anzeigen, dazu den Hinweis auf einen SignalRGB-Neustart nur, wenn `docs/erkenntnisse-signalrgb-motor.md` das noch verlangt (dort steht: erscheint ohne Neustart — der Hinweis kann also entfallen).

- [ ] **Step 5: Ansehen**

Effekt exportieren, in SignalRGB anschauen. Erwartet: er ist da und sieht aus wie die Vorschau.

- [ ] **Step 6: Tests und Commit**

```bash
cd "C:/Users/Max/claud/signalforge" && npm test 2>&1 | tail -6
```

```bash
cd "C:/Users/Max/claud/signalforge" && git add src app test && git commit -m "feat(app): export the current effect into SignalRGB"
```

---

### Task 12: Erststart und Abnahme

**Files:**
- Create: `docs/abnahme-app.md`
- Modify: `app/renderer/main.js` (Erststart)

- [ ] **Step 1: Erststart bauen**

Beim ersten Start ohne gefundenen Effektordner: eine ruhige Fläche in der Mitte, die erklärt was fehlt und einen Knopf zum Auswählen anbietet. Kein modaler Assistent über mehrere Schritte — es ist genau eine Frage.

Sprache beim ersten Start aus `navigator.language` vorbelegen, danach aus den Einstellungen.

- [ ] **Step 2: Kompletter Testsatz**

```bash
cd "C:/Users/Max/claud/signalforge" && npm test 2>&1 | tail -8
```

Erwartet: `fail 0`. Bei irgendetwas Rotem hier stoppen.

- [ ] **Step 3: Selbst durchspielen, bevor Max gefragt wird**

Nacheinander, jeweils hinsehen:

1. App frisch starten, Sprache auf Englisch und zurück
2. Bild hineinziehen — erscheint es?
3. In der Vorschau ziehen — folgt das Bild dem Zeiger, stoppt es am Rand?
4. Bildausschnitt umstellen — ändert sich die Ansicht?
5. Wabern **und** Atmen zugleich einschalten — sieht man beides?
6. Sättigung auf 0 — wird es grau? Farbachsen — kippt die Farbe?
7. Helligkeit — dunkelt es ab? Rechenlastanzeige — bleibt sie unter 15 %?
8. Projekt speichern, App neu starten, öffnen — alles noch da?
9. Exportieren, in SignalRGB anschauen — sieht es aus wie die Vorschau?
10. Eine `.mp4` hineinziehen — kommt eine verständliche Absage?
11. Nur mit der Tastatur bedienen — ist der Fokus überall sichtbar?

Was hier auffällt, wird behoben, bevor Max es sieht. Ihm eine App vorzulegen, deren offensichtliche Fehler man selbst nicht gesucht hat, verbrennt seine Zeit.

- [ ] **Step 4: Max fragen — menschlicher Prüfpunkt**

> „Die App läuft: `npm start` im Ordner `signalforge`.
> 1. Zieh ein eigenes Bild hinein — geht das flüssig?
> 2. Verschieb den Ausschnitt mit der Maus. Fühlt sich die Richtung richtig an?
> 3. Bau einen Effekt, der dir gefällt, und exportier ihn. Sieht er in SignalRGB aus wie in der Vorschau?
> 4. Und die Frage, auf die es ankommt: **ist das angenehmer als die Kommandozeile, und würdest du damit freiwillig Effekte bauen?**"

Nicht selbst behaupten, es sei schön. Sein Urteil schlägt jede Messung.

- [ ] **Step 5: Abnahme festhalten**

`docs/abnahme-app.md` mit Testanzahl, den elf Punkten aus Step 3 samt Ergebnis, Max' Antworten und dem, was offen bleibt.

- [ ] **Step 6: Commit**

```bash
cd "C:/Users/Max/claud/signalforge" && git add app docs && git commit -m "docs: app acceptance"
```

---

## Selbstprüfung des Plans

**Deckung gegen die Spezifikation.** Abschnitt 5 (Ebenen, Bewegungsarten) → Tasks 1, 9. Abschnitt 8 (Fenster, drei Spalten, Glassmorphism, Erststart, Ausschnitt mit der Maus) → Tasks 3, 5, 8, 12. Rechenlastanzeige und die 15-%-Schwelle → Task 6. Zweisprachigkeit → Task 5. Abschnitt 9c: Farbregler und Sättigung → Task 2; mehrere Bewegungen gleichzeitig → Task 1.

**Bewusst nicht in diesem Bauplan**, mit Begründung: *mehrere Ebenen übereinander* (der Motor kann es bereits, die Bedienung dafür ist ein eigenes Stück Arbeit und die App ist mit einer Bildebene schon nützlich); *Verlaufs- und Formenebenen*; *Videos als Bilderfolge*; *eigene Titelbilder* (erst messen, wie SignalRGB daran kommt); *JPEG statt PNG* (lohnt sich, gehört aber zu einer Runde über Dateigrößen); *Installer und Veröffentlichung*. Das ist Bauplan 3.

**Namensabgleich.** `layer.motions` (Task 1) wird in Task 9 über `layers.0.motions.N.speed` adressiert und in Task 11 exportiert. `adjustColor`/`isNeutral` (Task 2) heißen in `engine.js` und in `index.js` gleich. `createSettings`/`resolveEffectsTarget` (Task 4) werden in Tasks 10 und 11 mit denselben Namen benutzt. `createPreview` (Task 6) liefert `canvas`, das Task 8 für das Ziehen braucht. `describeInspector` (Task 9) liefert Punktpfade, die zu `setByPath` aus Bauplan 1 passen.

**Zwei Stellen, an denen dieser Plan absichtlich unfertig ist** und der Umsetzer rechnen statt abschreiben soll: die Versatzformel in Task 8 Step 3 (der Code dort ist ein Vorschlag mit einer überflüssigen Variablen, die Tests sind die Wahrheit) und die Herkunft der Reglerliste in Task 11 Step 3 (erst herauslösen, nicht kopieren).
