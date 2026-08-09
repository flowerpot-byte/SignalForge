# Erkenntnisse: Was SignalRGBs Browser kann und was nicht

**Geprüft am:** 09.08.2026 · **Von:** Max am eigenen Rechner · **SignalRGB-Version:** 2.5.74+00298716

Das war Stufe 0 des Bauplans (Risiken R1 und R2 der Spezifikation). Gemessen, nicht vermutet:
vier Wegwerf-Effekte, die ihre Ergebnisse als Farbstreifen in die Vorschau malen und zusätzlich
in SignalRGBs eigene Konsole schreiben.

---

## Spielt SignalRGB Video ab?

**Nein. Endgültig.**

```
TypeError: v.play is not a function. (In 'v.play()', 'v.play' is undefined)
```

`document.createElement('video')` liefert ein Element, aber es hat **keine Abspielfunktion**.
Der Browser ist ohne Medienunterstützung gebaut.

Zwei Ausreden ausgeschlossen:

- **Nicht die Dateigröße.** Das Video wurde einmal als 300-KB-Base64 eingebettet und einmal als
  eigene Datei danebengelegt. Beide scheitern identisch.
- **Nicht der Codec.** Es kommt gar nicht so weit — die Funktion fehlt, bevor irgendetwas
  dekodiert würde.

**Wichtiger Nebenbefund:** Weil das Skript an `v.play()` abbricht, läuft die Zeichenschleife
**gar nicht erst an**. Der Effekt bleibt komplett schwarz. Der erste Testaufbau konnte deshalb
„Video kaputt" nicht von „Skript tot" unterscheiden — beide sahen gleich aus. Der zweite Aufbau
zeichnete deshalb in jedem Bild zwei vom Video unabhängige Lebenszeichen (blauer Block,
wandernder Balken). Erst daran war der Unterschied zu sehen.

**Merksatz für später:** Ein Ausfalltest, dessen Fehlerzustand genauso aussieht wie „nichts läuft",
misst nichts. Immer ein vom Prüfgegenstand unabhängiges Lebenszeichen mitzeichnen.

### Folge für den Bau

Die Videoebene aus Abschnitt 6 der Spezifikation kann **nicht** über `<video>` laufen. Es bleibt
der Ausweichweg aus Risiko R1: das Video beim Import in Einzelbilder zerlegen, alle Bilder
nebeneinander in ein großes PNG legen und im Effekt durchblättern. Das braucht keinen
Videoplayer, nur `drawImage` — und das funktioniert nachweislich.

An der Bedienung ändert sich dadurch nichts. An der Dateigröße schon: eine Bilderfolge ist
deutlich größer als ein komprimiertes Video. Das spricht dafür, sie als Nachbardatei neben die
HTML zu legen statt sie einzubetten.

---

## Erkennt SignalRGB neue Effektdateien ohne Neustart?

**Ja.** Jeder neu in den Ordner geschriebene Effekt tauchte sofort in der Liste auf, ohne
SignalRGB neu zu starten.

---

## Welcher Browser steckt drin?

```
userAgent = Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)
            Chrome/85.0.4183.121 Safari/537.36 SignalRgbClient/2.5.74.0
vendor    = Apple Computer, Inc.
```

**Chromium, eingebettet über CEF** (im Prozessbaum läuft `CefSharp.BrowserSubprocess`).

**Die Versionsangabe ist aber nicht vertrauenswürdig.** Sie behauptet Chrome 85 (Baujahr 2020),
gleichzeitig ist `structuredClone` vorhanden — das gibt es erst ab Chrome 98. Die Kennung ist
also eingefroren; der echte Motor ist neuer, wie viel neuer ist unbekannt.

**Für die Architektur heißt das:** Electron als Vorschau bleibt richtig, es ist dieselbe
Motorfamilie. Aber der Paritätstest beweist Gleichheit *innerhalb eines Motors* — er beweist
nicht, dass sich SignalRGBs Chromium genauso verhält wie Electrons neueres. Der Motorcheck unten
ist deshalb dauerhaft aufzuheben und bei jedem neuen Browser-Baustein erneut zu befragen.

---

## Bausteine: was ist da, was fehlt

| Baustein | Vorhanden | Wo SignalForge ihn braucht |
|---|---|---|
| `structuredClone` | ✅ | `applyControls` klont das Dokument |
| `getImageData` | ✅ | Wabern liest den Quellpuffer |
| `putImageData` | ✅ | Wabern schreibt das Ergebnis |
| `createImageData` | ✅ | Wabern legt den Ausgabepuffer an |
| `createElement('canvas')` | ✅ | `buildSource` baut den gepolsterten Puffer |
| `Float32Array` | ✅ | Wellentabellen |
| `Map` | ✅ | Ebenen-Verzeichnis, geladene Assets |
| `Promise` | ✅ | `loadAssets` |
| `Image` mit `onload` | ✅ | Bilder dekodieren |
| `imageSmoothingQuality` | ✅ | weiches Hochziehen des halbaufgelösten Puffers |
| `globalCompositeOperation: multiply` | ✅ | Mischmodi der Ebenen |
| Optional Chaining und `??` | ✅ | überall |
| **`ctx.filter`** | ❌ **fehlt** | nur `prepareImageAsset` (Weichzeichnen beim Import) |
| **`<video>` mit `play()`** | ❌ **fehlt** | Videoebene — muss anders gelöst werden |

**`ctx.filter` ist unkritisch**, aber man muss wissen warum: Es wird ausschließlich in
`src/engine/asset-import.js` benutzt, und das läuft **in der App**, nicht im exportierten Effekt.
Die Datei wird zwar mitgebündelt, aber dort nie aufgerufen.

**Regel daraus:** Kein Ebenentyp darf `ctx.filter` zur Laufzeit benutzen. Weichzeichnen,
Sättigung und ähnliche Filter müssen entweder beim Import ins Bild eingerechnet oder von Hand
über Pixelzugriff gemacht werden.

---

## Der Motorcheck bleibt

`tools/motorcheck/` erzeugt den Prüfeffekt neu. Bei jedem neuen Browser-Baustein, den ein
Ebenentyp benutzen will, gehört er erst in diese Liste und wird gemessen — nicht angenommen.
Die Liste kostet Max dreißig Sekunden und hat hier schon zwei Annahmen widerlegt.
