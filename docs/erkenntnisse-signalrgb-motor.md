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

## Kann ein Effekt von außen mit Live-Daten gefüttert werden?

**Nein.** Damit ist echte Synchronisation mit irgendetwas Laufendem — Wallpaper, Musik,
Sensoren — ausgeschlossen, solange SignalRGB nichts von sich aus anbietet.

Der entscheidende Fund steht in der Konsole:

```
[blocked] The page at https://signalrgbmarketplace.pages.dev/ was not allowed to
          display insecure content from http://127.0.0.1:47821/
Fetch API cannot load http://127.0.0.1:47821/ due to access control checks.
```

**Effekte laufen nicht als lokale Datei.** SignalRGB lädt sie unter einer eigenen
HTTPS-Herkunft (`signalrgbmarketplace.pages.dev`), obwohl die Datei auf der Platte liegt. Das
erklärt beide Absagen mit einer Ursache:

| Weg | Ergebnis | Warum |
|---|---|---|
| Nachbardatei per `fetch` | ❌ | Die Seite ist keine `file://`-Seite; die Datei liegt außerhalb ihrer Herkunft |
| Nachbardatei per `XMLHttpRequest` | ❌ | dasselbe |
| `http://127.0.0.1` per `fetch` | ❌ | **Mixed Content** — eine HTTPS-Seite darf kein unverschlüsseltes HTTP laden |
| `http://127.0.0.1` per `XMLHttpRequest` | ❌ | dasselbe |

Geprüft mit einem Server, der ausdrücklich `Access-Control-Allow-Origin: *` sendet. Es lag also
nicht an fehlender Freigabe — die Anfrage wurde blockiert, **bevor** CORS überhaupt zum Zug kam.

### Was das ausschließt, und was übrig bleibt

Ein lokaler HTTPS-Server wäre theoretisch möglich, bräuchte aber ein Zertifikat, dem der Browser
traut. Das hieße, auf jedem Rechner eine eigene Zertifizierungsstelle zu installieren — ein
tiefer Eingriff ins System, für ein Beleuchtungswerkzeug nicht vertretbar, und für Freunde und
Fremde erst recht nicht zumutbar. `ws://` scheitert an derselben Regel.

**Übrig bleibt: alles vorher ausrechnen und in den Effekt hineinschreiben.** Der Effekt ist eine
in sich geschlossene Datei, die nichts von der Außenwelt erfährt. Das ist die Grenze, innerhalb
derer SignalForge arbeitet.

Für das Wallpaper heißt das: Quelldatei lesen, einmal umrechnen, als Schleife einbetten. Kein
Gleichlauf mit dem echten Wallpaper — und das darf auch nicht versprochen werden.

## Bilder einbetten: JPEG statt PNG (gemessen am 10.08.2026)

Umsetzung von Wunsch 4 aus Abschnitt 9c des Entwurfs. Die Schätzung dort („bei einem Foto wäre
JPEG etwa ein Viertel so groß") war deutlich zu vorsichtig — gemessen wird es **rund neunmal**
kleiner. Der Grund: der Importer zeichnet das Bild mit 1,4 px weich, und weiche Farbverläufe sind
genau das, was PNG am schlechtesten packt.

Gemessen an zwei echten Bildern, jeweils so verkleinert und weichgezeichnet, wie der Importer es
tut. Die Zahlen sind **base64-Zeichen** — das ist, was wirklich in der Effektdatei landet.

| Kodierung | Screenshot 1128×463 → 487×200 | Foto 1200×1600 → 150×200 |
|---|---|---|
| PNG (bisher) | 139.900 | 67.884 |
| JPEG 0,80 | 10.204 | 6.044 |
| JPEG 0,85 | 11.800 | 6.888 |
| JPEG 0,88 | 13.240 | 7.600 |
| JPEG 0,90 | 14.356 | 8.204 |
| **JPEG 0,92 (gewählt)** | **15.656** | **8.744** |
| JPEG 0,95 | 20.544 | 10.956 |

Ganze Effektdatei, über `bin/sfexport.js` in einen Wegwerf-Ordner gebaut:

| Bild | vorher | nachher |
|---|---|---|
| Max' Screenshot | 173.237 Bytes (169,2 KB) | 49.474 Bytes (48,3 KB) |
| Foto | 101.241 Bytes (98,9 KB) | 42.582 Bytes (41,6 KB) |

Damit ist der Motor (28 KB) jetzt der größere Teil der Datei, nicht mehr das Bild.

### Was es an Bildqualität kostet

Nicht am Quellbild gemessen, sondern **am fertigen 320×200-Bild**, das SignalRGB später je LED
abtastet — nur das zählt. Verglichen wurde das mit PNG eingebettete gegen das mit JPEG
eingebettete Bild, Pixel für Pixel:

| Bild | größte Abweichung (R/G/B) | mittlere Abweichung (R/G/B) | Pixel mit mehr als 4/255 |
|---|---|---|---|
| Screenshot @ 0,92 | 6 / 4 / 9 | 0,65 / 0,47 / 0,85 | 194 von 64.000 |
| Foto @ 0,92 | 7 / 4 / 8 | 0,84 / 0,56 / 1,30 | 875 von 64.000 |

Im Mittel unter **0,4 %** eines Kanals — weit unter dem, was eine LED zeigen kann. **Warum
0,92:** 0,85 spart nochmal rund 4 KB, vervierfacht aber die Zahl der sichtbar abweichenden
Pixel; 0,95 kostet ein Viertel mehr Bytes für weitere 0,1/255. Der Sprung von 0,90 auf 0,92
kostet 1,3 KB und ist billig erkauft.

**Nebenbefund:** Chromium schreibt **immer** 4:2:0-Farbunterabtastung (`2x2,1x1,1x1` im
SOF0-Marker), egal welche Qualität. Die verbreitete Annahme, ab 0,90 werde auf 4:4:4 umgeschaltet,
stimmt hier nicht — nachgesehen im erzeugten JPEG selbst.

### Transparenz: die Falle mit dem Weichzeichner

JPEG kennt kein Alpha, also muss ein wirklich durchsichtiges Bild PNG bleiben. Zwei Dinge sind
dabei gemessen worden, und beide waren nicht offensichtlich:

1. **Ein Alphakanal ist noch keine Transparenz.** Windows-Screenshots bringen einen mit, in dem
   jedes einzelne Pixel 255 ist. Würde man nach dem Kanal entscheiden statt nach den Pixeln,
   ginge die ganze Ersparnis bei genau den Bildern verloren, die Max am häufigsten benutzt.
2. **Der Weichzeichner erfindet Transparenz.** `blur()` tastet über den Bildrand hinaus und legt
   einen halbdurchsichtigen Saum um alle vier Kanten: bei Max' Screenshot — einem Bild ohne ein
   einziges durchsichtiges Pixel — **4.086 von 97.400 Pixeln**, Alpha bis herunter auf 101.
   Nach dem Weichzeichnen zu fragen, würde also *jedes* Bild für durchsichtig halten und nie
   bei JPEG landen.

Deshalb wird die Frage an einer **unverwischten** Zeichnung gestellt. Das ist auch belastbar:
Verkleinern allein erzeugt bei einem deckenden Bild nie Alpha unter 255 (gemessen), und ein
einziges wirklich durchsichtiges Pixel in einem 2000×1200-Bild kommt nach dem Verkleinern auf
333×200 immer noch als Alpha 249 an — wird also gefunden.

### Offen: WebP wäre nochmal halb so groß

In derselben Messreihe: WebP mit Qualität 0,9 braucht für den Screenshot nur **8.056** Zeichen —
gut die Hälfte von JPEG 0,92 — und kann außerdem Alpha, würde die PNG-Sonderbehandlung also ganz
überflüssig machen. **Nicht umgesetzt, weil ungemessen:** in der Bausteine-Tabelle oben steht
nicht, ob SignalRGBs eingefrorenes Chromium WebP aus einer `data:`-Adresse dekodiert. Das gehört
erst in den Motorcheck, dann in den Bau — nicht umgekehrt.

## Der Motorcheck bleibt

`tools/motorcheck/` erzeugt den Prüfeffekt neu. Bei jedem neuen Browser-Baustein, den ein
Ebenentyp benutzen will, gehört er erst in diese Liste und wird gemessen — nicht angenommen.
Die Liste kostet Max dreißig Sekunden und hat hier schon zwei Annahmen widerlegt.
