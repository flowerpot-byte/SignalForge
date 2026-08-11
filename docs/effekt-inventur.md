# Effekt-Inventur: Was populäre SignalRGB-Effekte tun — und was SignalForge davon kann

**Gelesen am:** 11.08.2026 · **Von:** Anhand der Dateien auf Max' Rechner, nicht aus dem Netz
· **SignalRGB-Version:** 2.5.74 (und 2.5.72 daneben)

Anlass ist Max' Auftrag: *„schau dir viele populäre und auch meine gespeicherten
SignalRGB-Effekte an und stelle sicher, dass man diese auch in unserer Software erstellen
könnte — nicht mit perfektem Bild, sondern mit Formen und Effekten."*

Das hier ist die **Bestandsaufnahme**, nicht der Bau. Gemessen wird an echtem Quelltext:
31 fremde Effektdateien, keine Vermutung darüber, „was so ein Effekt wohl macht".

---

## 0. Woher der Bestand kommt

| Quelle | Anzahl | Pfad |
|---|---|---|
| SignalRGBs eigene, mitgelieferte Effekte | 5 | `C:\Users\Max\AppData\Local\VortxEngine\app-2.5.74\Signal-x64\Effects\{Static,Dynamic}\` |
| Vom Markt geladene Effekte im Zwischenspeicher | 26 | `C:\Users\Max\AppData\Local\WhirlwindFX\SignalRgb\cache\effects\<ID>\effect.html` |
| Max' eigener, behaltener Effekt | 1 | `C:\Users\Max\Documents\WhirlwindFX\Effects\MaxAmbient.html` |

Die 26 aus dem Zwischenspeicher, mit Titel und Größe:

```
Arctic 5261   Aurora 4598   Biohazard 4826   Black Ice 2853   Calm Water 6931
Corrosive 6899   Crimson 5680   Custom Sunrise 2656   Dark Magic 4989   Electric 6244
Enigma 6956   Good Night! 609   Gradient Wave 10217   Hydrogen 15770   Jade 5009
Magma 5666   Nuclear 6444   Peach 6167   Poison 5848   Radar 7136   Rick and Morty 6284
Spin 2817   Starlight 4812   Terminal 2512   Titanium 4066   Vibe 9442
```

Die fünf mitgelieferten: `Rainbow`, `Neon Shift`, `Side To Side`, `Solid Color` (alle
`Static\`), `Screen Ambience` (`Dynamic\`).

**Nicht mitgezählt**, weil sie SignalForge selbst geschrieben hat: `SF Bergabend.html`,
`Verlauf.html`, `Verlaufizughuiz.html`, `Verlaufizughuizhjikhgu.html` im selben Ordner wie
MaxAmbient.

**Eine Lücke, ehrlich benannt:** In Max' Screenshot der Effektliste standen auch *Rain*,
*Rainbow Pulse*, *Cubes*, *Nebula*, *Snake*, *Bars Visualizer*, *Eye of Sauron*, *Touch
Grass*, *Waves*. Die liegen **nicht** im Zwischenspeicher — der enthält nur, was tatsächlich
schon einmal geladen wurde. Die Namen deuten auf Techniken, die im vorhandenen Bestand
ebenfalls vorkommen (Partikel, Kachelraster, Formen, Verlaufswellen); *Bars Visualizer* ist
der einzige, der nach Tonreaktion klingt, und dafür gibt es mit `Hydrogen` einen gelesenen
Beleg. Der Bestand hier ist also breit genug, aber er ist nicht vollständig.

---

## A. Was der Bestand technisch tut

Gruppiert nach **Technik**, nicht nach Effektnamen — derselbe Effektname taucht mehrfach auf,
weil ein Effekt meist drei bis vier Techniken übereinanderlegt.

### A1. Partikelsystem — die mit Abstand häufigste Technik (mind. 16 von 31)

Eine Liste von Objekten, jedes mit eigener Startposition, Geschwindigkeit, Größe, Farbe und
Lebensdauer. Pro Bild: alle zeichnen, tote entfernen, neue nachfüllen. Immer mit
`Math.random()` **beim Anlegen**, nie beim Zeichnen.

Beteiligt: `Poison`, `Corrosive`, `Nuclear`, `Calm Water`, `Peach`, `Jade`, `Crimson`,
`Titanium`, `Magma`, `Starlight`, `Arctic`, `Aurora`, `Enigma`, `Radar`, `Custom Sunrise`,
`Electric`, `Terminal`.

**Wichtigster Einzelbefund:** Neun dieser Effekte sind **dieselbe Datei mit anderen Farben**.
Ein `diff` von `Poison` gegen `Corrosive`, `Calm Water` und `Titanium` zeigt: gleiche
Funktionsnamen (`InitSquare`, `Square`, `UpSquare`), gleiche Schleife, gleiche Mathematik —
geändert sind Titel, Farbvorgaben und gelegentlich eine zusätzliche Sinuslinie. Der Kern ist
jedes Mal dieser:

```js
this.Draw = function () {
  ctx.strokeStyle = colors[this.ssi] + "88";
  ctx.lineWidth = this.size;
  ctx.beginPath();
  ctx.arc(this.x, this.y, this.radius, 0, 2 * Math.PI);
  ctx.stroke();
  this.x += this.speedX * (speedRaw / 50);
  this.y += this.speedY * (speedRaw / 50);
  if (speedRaw > 0) this.radius += (Math.random() / 1.3) * (speedRaw / 50);
};
```
(`cache\effects\-Mir7bKkFQmd2LF_9Leg\effect.html`, „Poison")

Ein wachsender, halbdurchsichtiger **Ring**, der langsam driftet. Mehr ist es nicht. Wer
diesen einen Baustein hat, hat neun Effekte des Bestandes.

Die Bewegung ist dabei fast überall **linear in der Zeit**: `x += v` pro Bild. Das ist
wichtig für Abschnitt C, weil `x(t) = x0 + v·t` eine geschlossene Formel ist — sie braucht
keinen Zustand von Bild zu Bild.

Zwei Ausreißer mit mehr Aufwand: `Arctic` baut jede Schneeflocke aus sieben Kreisen (ein
Mittelkreis plus sechs auf `Math.cos(i*π/3 + ang)`), und `Starlight` lässt jeden Punkt
ein- und ausblenden statt zu wandern (`this.a += 0.05` bis `count > 100`, dann rückwärts).

### A2. Nachzieh-Schleier (mind. 8 von 31)

Statt die Fläche zu löschen, wird jedes Bild ein **halbdurchsichtiges Rechteck** darübergelegt.
Was vorher da war, verblasst, statt zu verschwinden. Das ist es, was Partikel überhaupt erst
wie Funken, Regen oder Nordlicht aussehen lässt.

```js
ctx.fillStyle = bgColor + "22";   ctx.fillRect(0, 0, width, height);   // Poison-Familie
ctx.fillStyle = "rgba(0,0,0,0.15)";                                    // Terminal
ctx.fillStyle = 'hsla(' + iHue + ', 100%, ' + iLit/2 + '%, .05)';      // Neon Shift
ctx.fillStyle = `hsla(${proBack[0]},…%,…%,${(100 - trail)/100})`;      // Radar (regelbar!)
```

`Radar` macht die Schleierstärke sogar zum Bedienelement („trail"). `Aurora` benutzt `.04` —
so schwach, dass ein Streifen über Sekunden nachglüht.

**Das ist ein Rückkopplungsschleife über Bilder hinweg:** Bild N hängt an Bild N−1. Genau
darum kann SignalForge es heute nicht (siehe B und C2).

### A3. Vollflächiger Farbverlauf (mind. 7 von 31)

`createLinearGradient` / `createRadialGradient`, über die ganze Fläche gefüllt, Achse oder
Mitte pro Bild verschoben.

`Gradient Wave` ist der reinste Fall und praktisch eine Beschreibung unserer eigenen
Verlaufsebene: 2, 3 oder 4 Farben, als **wiederholte Rampe** mit von Hand gesetzten
Stoppunkten (0, 0.125, 0.25, 0.375, 0.5 … bei vier Farben), vier Richtungen (Left/Right/Up/Down
über `ctx.scale(-1,1)` bzw. `ctx.scale(1,-1)`), Versatz `i += speed / 10` pro Bild.

`Black Ice` legt einen festen Dreifarbverlauf hin und rührt ihn nie wieder an — der ganze
Effekt ist ein Standbild plus Tastendruck-Reaktion. `Arctic` benutzt einen Radialverlauf als
Hintergrundhimmel, `Rick and Morty` einen Radialverlauf mit vier Stoppunkten als Portal,
`Vibe` einen als weiche Kante („Feathered Edge").

**Nirgends im Bestand: `createConicGradient`.** Kein einziges Vorkommen in 31 Dateien.

### A4. Farbrotation („Color Cycle") — fast überall als Schalter

Der verbreitetste *Regler* des Bestandes. Immer nach demselben Rezept: Hex-Farbe des Nutzers
nach HSL umrechnen, einen laufenden Offset auf den Farbton addieren, als `hsl(...)`
zurückschreiben.

```js
globalColorCycle < 360 ? globalColorCycle += colorCycleSpeed / 50 : globalColorCycle %= 360;
realColor1 = `hsl(${proColor1[0] + globalColorCycle}, ${proColor1[1]}%, ${proColor1[2]}%)`
```
(`cache\effects\-Me3BsMN_hIlzeJwFbMs\effect.html`, „Gradient Wave")

In `Gradient Wave`, `Aurora`, `Arctic`, `Radar`, `Rick and Morty`, `Spin`, `Side to Side`
(dort „Rainbow Mode"), `Hydrogen`. Eine `hexToHSL`-Funktion ist in **acht** Dateien nahezu
wortgleich einkopiert (`Aurora`, `Arctic`, `Magma`, `Radar`, `Gradient Wave`,
`Rick and Morty`, dazu `Side To Side` und `Solid Color` in einer kürzeren Fassung) — sie ist
der Fingerabdruck dieser Technik.

### A5. Figuren aus Winkelmathematik (6 von 31)

`arc()`, `lineTo()`, `cos`/`sin` um einen Mittelpunkt.

- `Spin`: eine Spirale, 60 Schritte je Umlauf, bis `theta < 20π`, Winkelversatz aus der Zeit.
- `Radar`: Zeiger vom Mittelpunkt nach außen plus wachsender Ring plus Punkte („Blips"), die
  aufleuchten, wenn der Zeiger sie streift.
- `Vibe`: **Kreis, Herz oder Stern** (Kombifeld), pulsierend zwischen Mindest- und
  Höchstradius, wahlweise mit weicher Kante oder Regenbogenfüllung. Das Herz ist aus vier
  `bezierCurveTo`, der Stern aus zehn `lineTo` im Wechsel zwischen Außen- und Innenradius.
- `Custom Sunrise`: bis zu 400 gleichzeitig wachsende Ringe von einem einstellbaren Punkt aus.
- `Enigma`: Ringe („orbital") plus Ripples.

### A6. Kachelraster mit Phasenversatz (3 von 31)

Ein Gitter gleicher Zellen, jede mit eigener Startphase; die Helligkeit jeder Zelle ist eine
Sinuskurve.

```js
grid = MakeGrid(320 / hexWidth, 200 / hexWidth, hexWidth)
…
this.counter = 0 + Math.random() * 20;          // Startphase je Zelle
this.colorVal = (Math.sin(this.counter) + 1) / 2
```
(`cache\effects\-NIt9RINI5HwQ4_FjILd\effect.html`, „Dark Magic" — Sechsecke)

`Electric` macht dasselbe mit Quadraten plus herabfallenden „rainCubes". `Biohazard` legt
**5000** Punkte in ein Gitter (`x = sX * (i % nX)`), jeder mit eigenem Zeitversatz, und
schickt Wellen hindurch.

### A7. Wischbewegung über die ganze Fläche (1 von 31, aber mitgeliefert)

`Side To Side` schiebt ein volles Rechteck über die Fläche und lässt die Farbe stehen. Der
Spiegeltrick für die Gegenrichtung ist hübsch und typisch für den Bestand:

```js
ctx.translate(160, 100); ctx.scale(1 - this.mod * 2, 1); ctx.translate(-160, -100);
```

### A8. Regenbogen als Spaltenschleife (1, mitgeliefert — mit einer Warnung darin)

`Rainbow` malt 320 Streifen à 1 px, jeder ein anderer Farbton. Bemerkenswert ist der
Kommentar der SignalRGB-Entwickler selbst:

> `// Using ctx.fillRect on Ultralight is causing significant (250x) increases in frame render`
> `// time after the height goes above 100.`

Deshalb malt die waagerechte Variante mit `ctx.rect()` + `ctx.fill()` statt `fillRect`. Das
ist ein gemessener Hinweis auf den **Ultralight**-Motor, der neben Qt6WebEngine im
Installationsordner liegt (siehe `docs/messung-titelbilder.md`).

### A9. Atmen / Pulsieren über die Deckkraft (3 von 31)

`Solid Color` ist der Lehrbuchfall — und zugleich der einfachste Effekt, den SignalRGB
ausliefert:

```js
gAlpha = Math.sin(gCount) * .5 + .5
gCount += Math.PI / 4 * speed / 1000
```

`Vibe` pulsiert den Radius statt der Deckkraft, `Magma` einen Helligkeitszähler auf und ab.

### A10. Textdarstellung (1 von 31)

Nur `Terminal`: fallende Buchstaben, `ctx.font = fontSize + "px san-serif"`, `ctx.fillText`.
Es ist außerdem der einzige Effekt im ganzen Bestand, der **nicht** `requestAnimationFrame`
benutzt, sondern `setInterval(update, 20)` — also 50 Bilder/s statt „so schnell es geht".

### A11. Rechenfeld je Pixel (2 von 31)

`Hydrogen` rechnet für jeden Bildblock eine physikalische Formel (Laguerre-/Legendre-Polynome)
aus und hat dafür einen eigenen Regler „CPU Usage", der die Blockgröße zwischen 1 und 10 Pixeln
umschaltet. Danach dreht es die **ganze Fläche** mit `ctx.rotate`.

`MaxAmbient` (Max' eigener) verzieht ein Bild pixelweise mit bilinearer Abtastung — siehe
Abschnitt D.

### A12. Live-Daten vom Wirt (2 von 31) — und eine Korrektur an unseren eigenen Notizen

`docs/erkenntnisse-signalrgb-motor.md` sagt: *„Kann ein Effekt von außen mit Live-Daten
gefüttert werden? **Nein.**"* Das war für **Netzwerk** gemessen (fetch/XHR/WebSocket scheitern
an Mixed Content und fremder Herkunft) und stimmt dafür weiterhin.

Der Bestand zeigt aber: **SignalRGB schiebt Live-Daten von innen hinein**, über ein globales
Objekt `engine`.

```js
let freqs = engine.audio.freq;
if (freqs === 'undefined' || freqs === null || !freqs || freqs.byteLength !== 200) { … }
let freqView = new DataView(freqs);
… freqView.getUint8(i) / 255 …
```
(`cache\effects\-NIc4SbcPndIx2dhVy9O\effect.html`, „Hydrogen" — Beat-Erkennung)

Also: **ein 200-Byte-Frequenzband, jeder Wert 0–255.** `Hydrogen` bildet daraus Energie und
Varianz der letzten zwölf Bilder und erkennt so Schläge.

Und in `Screen Ambience` (mitgeliefert):

```js
const lightness = new Int8Array(engine.zone.lightness);
const sat       = new Int8Array(engine.zone.saturation);
const zhue      = new Int16Array(engine.zone.hue);
const src       = new Uint8ClampedArray(engine.zone.imagedata);   // Modus "HD"
```

560 Bildschirmzonen (28 × 20). Der Satz in unseren Notizen ist damit **zu weit gefasst
formuliert und muss beim nächsten Anfassen präzisiert werden**: verboten ist der Weg nach
außen, nicht die Fütterung von innen.

### A13. Eingabe: Tastendruck (9 von 31)

Der Wirt ruft eine frei benannte Funktion auf, wenn eine Taste gedrückt wird:

```js
function onCanvasTapped(x, y) { if (tapEffects) effects.push(new Ripple(x, y, "black")); }
```
(`cache\effects\-MTwqhnV_LPbIrkfZOfo\effect.html`, „Black Ice")

In `Black Ice`, `Enigma`, `Magma`, `Nuclear`, `Peach`, `Crimson`, `Rick and Morty`,
`Dark Magic`, `Electric`. Fast immer optional über einen Schalter „Keypress Effects".

### A14. Rückruf bei geänderter Einstellung (6 von 31)

`function on<Eigenschaft>Changed()` — der Wirt ruft sie auf, wenn der Nutzer einen Regler
bewegt. Wird benutzt, um teure Umrechnungen (Hex→HSL) nicht in jedem Bild zu machen:
`oncolor1Changed`, `onbackColorChanged`, `onblur_amountChanged`, `onbreatheChanged`.

### A15. Welche Zeichenbefehle vorkommen — und welche nicht

| Baustein | Vorkommen im Bestand | Für SignalForge |
|---|---|---|
| `fillRect`, `arc`, `lineTo`, `stroke` | überall | haben wir |
| `createLinearGradient` / `createRadialGradient` | 7 Dateien | haben wir |
| `save`/`restore`/`translate`/`scale`/`rotate` | 8 Dateien | haben wir |
| `Math.random()` | 22 Dateien | **bei uns verboten** (siehe B) |
| `requestAnimationFrame` | 30 von 31 | haben wir |
| `globalCompositeOperation` | **1** (`Vibe`, `destination-out`) | haben wir (5 Mischmodi) |
| `bezierCurveTo` | **1** (`Vibe`, Herz) | fehlt |
| `fillText` | **1** (`Terminal`) | fehlt |
| `getImageData`/`putImageData` | **2** (`Screen Ambience`, MaxAmbient) | haben wir |
| `engine.audio` / `engine.zone` | **2** | fehlt, siehe C |
| `createConicGradient` | **0** | wir haben Konisch (als gemaltes Bild, nicht über die API) |
| `createPattern` | **0** | — |
| `shadowBlur` | **0** | — |
| WebGL | **0** | — |
| `ctx.filter` | **0** | bei uns verboten (gemessen: fehlt im Wirt) |
| `canvas.style.filter` (CSS) | **1** (`Screen Ambience`) | siehe C7 |
| `<video>` | **0** | gemessen unmöglich |

Zwei Sachen fallen auf:

1. **Kein einziger Effekt im Bestand bettet ein Bild ein.** Nicht einer. SignalForges
   Bildebene hat im ganzen Markt-Zwischenspeicher keine Konkurrenz — das ist eher ein Beleg
   dafür, dass wir etwas können, was sonst niemand macht, als eine Lücke.
2. **Die Fläche ist immer 320 × 200 und heißt immer `exCanvas`** — außer bei `Biohazard`, das
   sich `window.innerWidth`/`innerHeight` holt. Der Wirt gibt der Ansicht also eine echte
   Fenstergröße.

---

## B. Was SignalForge davon heute schon kann

Unser Wortschatz, Stand HEAD (`src/engine/document.js`):

- **Ebenentypen:** Bild (JPEG/PNG eingebettet, `cover`/`stretch`/`contain`, Ausschnitt
  verschiebbar), Farbfläche, Verlauf.
- **Verlaufsformen:** `linear`, `radial`, `conic`, `stripes`, `waves`; 2–4 Farbstopps;
  Wiederholungen 1–24; Winkel 0–360.
- **Bewegungen:** `none`, `warp`, `drift`, `breathe`, `spin`, `pulse`, je mit Tempo (0–100)
  und Stärke (0–100). Nicht jede Bewegung wird jedem Ebenentyp angeboten (`motionKindsFor`).
- **Ebenen-Eigenschaften:** Deckkraft, Mischmodus (`normal`, `add`, `multiply`, `screen`,
  `lighten`), Sichtbarkeit.
- **Dokument-weit:** Helligkeit 0–200, Sättigung 0–200, Grün↔Magenta, Blau↔Gelb.
- **Feste Zusagen:** 30 Bilder/s, 320 × 200, **keine Uhr** (`Date.now`/`performance.now` sind
  im Motor und im Export verboten, `src/export/build-effect.js`), kein `Math.random` zur
  Laufzeit, kein `ctx.filter`. Ein Bild ist eine reine Funktion von `(Dokument, Assets, t)`.

Und die entscheidende Nuance: **Gesäter Zufall ist erlaubt.** Verboten ist `Math.random()`,
weil es bei jedem Start andere Bilder liefert und damit die Zusage bricht, dass Vorschau und
exportierte Datei dieselben Pixel zeigen. Eine Hash-Funktion über den Partikel-Index
(`rand(i) = fract(sin(i·12.9898)·43758.5453)` oder ein ganzzahliger Mischer) ist derselbe
„Zufall" fürs Auge und dabei bei jedem Lauf identisch. **Das ist der Weg zu allem in A1.**

### Technik für Technik

| Technik (A) | Heute | Bemerkung |
|---|---|---|
| A3 Vollflächiger Verlauf, linear/radial, wandernd | **Ja, ganz** | `Gradient Wave` ist unsere `stripes`-Form mit `drift`; `Black Ice` ist `linear` ohne Bewegung |
| A4 Farbrotation | **Ja, ganz** (seit 11.08., siehe C3) | Dokumentfelder `hueShift` (0–360) und `hueCycle` (Tempo, 0 = aus) im gemeinsamen Pixel-Durchgang |
| A9 Atmen/Pulsieren | **Ja, ganz** | `breathe` und `pulse`; `Solid Color` ist Farbfläche + `breathe` |
| A7 Wischbewegung | **Fast** | `drift` auf `linear`/`stripes` schwingt hin und her statt in eine Richtung zu marschieren — die Bewegung ist da, der harte Wisch mit stehenbleibender Farbe nicht |
| A8 Regenbogen-Spalten | **Ja, mit Umweg** | `stripes` mit vier Stopps und 24 Wiederholungen kommt nah; ein echter 360°-Regenbogen bräuchte mehr als 4 Stopps oder A4 |
| A11 Verzerrtes Bild | **Ja, ganz** | `warp` ist genau dieselbe Puffer-Mathematik (`src/engine/layers/warp-buffer.js`) |
| A1 Partikelsystem | **Nein** | Ebenentyp fehlt. Mit gesätem Zufall aber **machbar**, weil die Bewegung linear in `t` ist |
| A2 Nachzieh-Schleier | **Ja, mit einer Einschränkung** (seit 11.08., siehe C2) | Dokumentfeld `trail` (0 = aus = wie bisher). Sichtbar nur dort, wo eine Ebene die Fläche **nicht** deckend übermalt — also bei Deckkraft < 1, bei `atmen`/`pulsieren` oder (später) bei Partikeln |
| A5 Figuren (Kreis/Ring/Stern/Herz) | **Nein** | Ebenentyp fehlt. Rein zeichnerisch, keine Hürde |
| A6 Kachelraster | **Nein** | Ebenentyp oder Verlaufsform fehlt. Phase je Zelle aus gesätem Zufall |
| A10 Text | **Nein** | Schriftrendering im Wirt ungeprüft |
| A12 Ton- und Bildschirmreaktion | **Nein — und unter unseren Zusagen unmöglich** | siehe C8 |
| A13 Tastendruck | **Nein** | technisch möglich (Wirt ruft `onCanvasTapped`), aber unvorschaubar |
| A14 Rückruf bei Reglerwechsel | **Nein, brauchen wir aber nicht** | wir lesen die Regler in jedem Bild neu (`readControls`) |

**Nachtrag 11.08.2026:** Zwei Zeilen dieser Tabelle sind seither erledigt — A4 (Farbrotation)
ganz, A2 (Nachzieh-Schleier) mit einer Einschränkung, die bei C2 ausbuchstabiert ist. Die
Zusammenrechnung darunter ist die von vor diesem Bau und wird bewusst nicht überschrieben:
beide Bausteine zeigen ihren vollen Wert erst mit den Partikeln (C1), und bis dahin wäre eine
höhere Zahl hier eine Behauptung statt einer Messung.

**Zusammengerechnet:** Von 31 Effekten sind heute **etwa 6** ohne Abstriche nachbaubar
(`Solid Color`, `Good Night!`, `Rainbow` näherungsweise, `Black Ice` ohne Tastendruck,
`Gradient Wave`, `Neon Shift` näherungsweise) und einer ist unser eigener Bauplan
(`MaxAmbient`). Der große Rest hängt an **einem** fehlenden Baustein: Partikel.

---

## C. Was als Nächstes gebaut gehört, in dieser Reihenfolge

Sortiert nach **Häufigkeit im Bestand × Machbarkeit unter unseren gemessenen Grenzen**.

### C1. Partikelebene mit gesätem Zufall — der größte Hebel, mit Abstand

**Was:** Ein neuer Ebenentyp `particles`. Felder: Anzahl (1–200), Form (Ring / gefüllter Punkt
/ Quadrat), Größe + Streuung, Richtung + Streuung, Tempo, Wachstum, Farben aus 2–4 Stopps,
Lebensdauer.

**Schaltet frei:** `Poison`, `Corrosive`, `Nuclear`, `Calm Water`, `Peach`, `Jade`, `Crimson`,
`Titanium`, `Magma` (die neun aus derselben Vorlage), dazu `Starlight`, `Arctic`, `Aurora`,
`Custom Sunrise`, halb auch `Enigma` und `Electric`. **Rund die Hälfte des Bestandes.**

**Motorform:** neuer Ebenentyp in `src/engine/layers/`.

**Aufwand:** groß — der größte Posten der Liste, aber auch der einzige, der allein so viel
freischaltet.

**Grenze, die ihn bindet:** Kein Zustand über Bilder hinweg. Jedes Partikel muss eine
**geschlossene Funktion seines Index und der Zeit** sein:
`x(i,t) = x₀(i) + vₓ(i)·t`, `r(i,t) = r₀(i) + w(i)·t`, Lebenslauf über
`phase = (t/T + off(i)) mod 1`. Das ist keine Einschränkung gegenüber dem Bestand — der macht
`x += v` pro Bild, was genau dasselbe ist, nur aufsummiert statt ausgerechnet. Alle
`x₀, v, r₀, off` kommen aus einer Hash-Funktion über `i` und einem Dokument-Feld `seed`, damit
Max verschiedene Streuungen durchprobieren kann, ohne die Vorhersagbarkeit zu verlieren.

### C2. Nachzieh-Schleier — billig, und er ist es, der Partikel gut aussehen lässt

**Was:** Ein Dokument-Feld „Nachziehen" 0–100. Statt `fillRect` in Schwarz löscht `render()`
mit `rgba(0,0,0,α)`, α aus dem Feld.

**Schaltet frei:** den Blick von `Poison` & Co., `Neon Shift`, `Terminal`, `Aurora`, `Radar`.
Ohne ihn sehen Partikel wie einzelne Punkte aus statt wie Funken.

**Motorform:** ein Dokument-Feld plus drei Zeilen in `src/engine/engine.js`.

**Aufwand:** klein.

**Grenze, die ihn bindet — und die ehrlich ausgesprochen gehört:** Er **bricht** „ein Bild ist
eine reine Funktion von t". Bild N hängt dann an Bild N−1. Die Vorschau und der Export laufen
weiterhin auf dieselben Pixel zu, **solange beide bei t = 0 mit einer schwarzen Fläche
anfangen und jedes Bild durchlaufen** — was beide tun. Was nicht mehr geht: an eine Stelle
der Zeitachse springen und dasselbe Bild sehen. Der Paritätstest muss dann von Bild 0 an
laufen statt Einzelbilder zu vergleichen. Das ist der Preis, und er ist bezahlbar — aber er
gehört vor dem Bau in den Testplan, nicht danach.

**Nachtrag 11.08.2026 — gebaut.** Dokumentfeld `trail` 0–100, Standard 0. Die Deckkraft
des Schleiers ist **gemessen** statt geraten (`work/veil-probe.cjs`): Chromium bringt einen
Pixel bei jeder geprüften Deckkraft bis 0,01 **exakt auf 0** herunter, es bleibt also kein
Rest stehen — die Befürchtung, dass ein 8-Bit-Multiplikat bei kleinen Werten hängenbleibt,
hat sich nicht bestätigt. Deshalb ist die Skala geometrisch von 0,5 (Nachglühen 8 Bilder)
bis 0,02 (116 Bilder ≈ 3,9 s) gespannt. Die Ebenen werden dabei in eine eigene, unsichtbare
Fläche gemalt und erst danach kopiert und eingefärbt — sonst würde Helligkeit und Farbdrehung
bei jedem Bild erneut auf den Nachzieh-Rest angewandt und der liefe binnen einer Sekunde ins
Weiße. Die Parität ist wie angekündigt umgestellt: Einzelbild-Vergleich für Dokumente ohne
Schleier, Bildfolge ab Bild 0 für Dokumente mit (`test/export/parity.test.js`).

**Die Einschränkung, die vorher niemand ausgesprochen hatte:** Der Schleier liegt **unter**
dem, was gerade gezeichnet wird — genau wie im Bestand. Eine Ebene, die alle 320 × 200 Pixel
deckend übermalt, verdeckt damit ihr eigenes Nachziehen vollständig. Ein Verlauf tut genau
das. Sichtbar wird der Schleier heute also nur mit `atmen`/`pulsieren` (beide senken die
Deckkraft der Ebene), mit einem Bild in `Einpassen`, oder mit einer Ebenen-Deckkraft unter 1
— und die ist in der Einstellungsspalte gar nicht angeboten. Der eigentliche Nutznießer ist
**C1, die Partikel**: die decken die Fläche nie.

### C3. Farbrotation als Bewegung — der billigste Gewinn der Liste

**Was:** Bewegungsart `hue` (oder ein Dokument-Feld „Farbdrehung" mit Tempo). Der Farbton der
ganzen Fläche wandert mit der Zeit.

**Schaltet frei:** die „Color Cycle"/„Rainbow Mode"-Spielart von `Gradient Wave`, `Aurora`,
`Arctic`, `Radar`, `Rick and Morty`, `Spin`, `Side to Side` — plus `Rainbow` selbst und den
halben Reiz von allem anderen. Es ist der häufigste **Regler** im Bestand.

**Motorform:** Am günstigsten als Dokument-Feld, weil `applyFinish()` in
`src/engine/engine.js` ohnehin schon über jedes Pixel läuft, sobald Helligkeit oder Sättigung
nicht neutral sind: RGB→HSL→RGB je Pixel ist derselbe Durchgang. Als **Ebenen**-Bewegung wäre
es teurer und nur dann nötig, wenn zwei Ebenen unterschiedlich schnell drehen sollen.

**Aufwand:** klein bis mittel (die Farbumrechnung gibt es schon in `src/engine/color.js`).

**Grenze:** keine. Rein rechnerisch, zeitabhängig, deterministisch.

**Nachtrag 11.08.2026 — gebaut, als Dokumentfeld wie hier vorgeschlagen.** Zwei Felder statt
einem, weil der Bestand zwei braucht: `hueShift` (0–360, wo das Farbrad steht) und `hueCycle`
(Tempo 0–100, 0 = steht still). Gerechnet wird **nicht** mit `hexToHSL` je Pixel, sondern mit
einer 3 × 3-Drehung um die Grau-Achse — drei Koeffizienten, neun Multiplikationen, im ohnehin
schon laufenden Durchgang. Bewusst nicht die Matrix, die CSS `hue-rotate` benutzt: die dreht
um die Luma-Achse und ist erklärtermaßen eine Näherung (Rot bei 120° wird dort ein dunkles
Grün). Die Grau-Achsen-Drehung trifft bei 120° und 240° exakt den Kanaltausch, und Grau bleibt
bitgenau Grau. Gemessen: 0,405 ms/Bild allein (1,2 % eines Kerns), 0,180 ms zusätzlich, wenn
der Durchgang wegen Helligkeit ohnehin schon läuft; ein unberührtes Dokument zahlt weiterhin
0,010 ms, weil der ganze Durchgang übersprungen wird.

### C4. Formebene — Kreis, Ring, Stern, Herz, Vieleck

**Was:** Ebenentyp `shape` mit Form, Position (x/y), Größe, Randstärke (gefüllt oder Umriss),
weiche Kante, Farbe/Verlauf.

**Schaltet frei:** `Vibe` fast vollständig (mit `pulse`, das wir schon haben, sofort),
`Custom Sunrise`, den Ring von `Radar`, `Enigma`.

**Motorform:** neuer Ebenentyp. Die weiche Kante ist ein Radialverlauf mit `transparent` am
Ende — genau wie `Vibe` es macht, kein `shadowBlur` nötig.

**Aufwand:** mittel. Herz und Stern sind je zehn Zeilen (`Vibe` liefert die Vorlage frei Haus).

**Grenze:** keine.

### C5. Kachelraster mit Phasenversatz

**Was:** Ebenentyp oder Verlaufsform `tiles`: Gitter aus Quadraten oder Sechsecken, Zellgröße,
Fuge, Helligkeit je Zelle als Sinus mit gesät zufälliger Startphase.

**Schaltet frei:** `Dark Magic`, `Electric`, `Biohazard` — und das ist eine Optik, die auf
einer Tastatur besonders gut ankommt, weil jede Taste eine Zelle sein kann.

**Motorform:** neuer Ebenentyp (Sechsecke passen nicht in die Verlaufsform).

**Aufwand:** mittel.

**Grenze:** keine — die Phase je Zelle ist gesäter Zufall, alles andere ist `sin(t + phase)`.

### C6. Wisch-Bewegung („sweep")

**Was:** Bewegungsart, die eine Kante über die Fläche schiebt statt die Rampe zu schwenken.

**Schaltet frei:** `Side To Side`.

**Motorform:** neue Bewegungsart in `src/engine/motion/`.

**Aufwand:** klein. **Grenze:** keine.

### C7. Nachmessen: geht `canvas.style.filter` im Wirt?

Kein Bau, sondern eine Messung, die vor jedem weiteren Filter-Gedanken fällig ist. Unsere
Notizen sagen: **`ctx.filter` fehlt** (gemessen 09.08.). SignalRGBs eigener `Screen Ambience`
benutzt aber den **CSS**-Filter auf dem Element:

```js
canvas.style.filter = "hue-rotate(…deg) brightness(…%) saturate(…%) contrast(…%) blur(…px)"
// blur(0px) causes a black-screen compositing bug in Ultralight — omit it entirely at zero.
```

Wenn das im Wirt wirkt, wären Weichzeichnen und Farbdrehung fast umsonst zu haben statt
pixelweise. Der Kommentar über den Ultralight-Fehler bei `blur(0px)` steht im Auslieferungs-
code — er ist ein Beleg dafür, dass jemand es dort tatsächlich betrieben und dabei einen
Fehler gefunden hat. **Nicht ungeprüft benutzen:** Im Installationsordner liegen zwei
Motorfamilien nebeneinander (Ultralight und Qt6WebEngine, siehe `docs/messung-titelbilder.md`),
und welche einen Nutzer-Effekt aus `Documents\WhirlwindFX\Effects` ausführt, ist offen.

**Aufwand:** ein Wegwerf-Effekt, eine halbe Stunde.

### C8. Tonreaktion — **unter unseren Zusagen unmöglich**, und das ist die richtige Antwort

Der Wirt bietet sie an: `engine.audio.freq`, 200 Bytes, belegt in `Hydrogen`. Trotzdem gehört
sie nicht auf die Bauliste, und zwar aus einem Grund, der nichts mit Aufwand zu tun hat:

- **Die Vorschau kann sie nicht zeigen.** `engine` gibt es nur im SignalRGB-Wirt. In unserem
  Electron-Fenster ist es `undefined`. Eine tonreaktive Ebene wäre in der App eine schwarze
  oder eingefrorene Fläche — der Nutzer bekäme nicht zu sehen, was er baut.
- **Sie bricht die Paritätszusage endgültig.** Nicht „anders getestet" wie beim Schleier
  (C2), sondern grundsätzlich: das Bild hängt an dem, was gerade aus den Lautsprechern kommt.
  Zwei Läufe sind nie gleich, es gibt nichts zu vergleichen.

Wenn es je gebaut wird, dann als bewusst gekennzeichneter Sonderfall („dieser Effekt lässt
sich nicht in der Vorschau prüfen") — und nicht, bevor C1 bis C5 stehen. Dasselbe gilt für
Bildschirm-Ambiente (`engine.zone.*`): das liefert SignalRGB ohnehin schon selbst mit.

### C9. Tastendruck-Reaktion

Möglich (`onCanvasTapped`, neun Effekte im Bestand), aber sinnvoll erst **mit** Partikeln
(C1), und mit derselben Vorschau-Einschränkung wie C8: in der App drückt niemand eine Taste
auf einer Tastatur, die SignalRGB gehört. Später.

### C10. Textebene

Nur ein Effekt im Bestand (`Terminal`), und Schriftrendering im Wirt ist ungeprüft. Niedrige
Häufigkeit, offenes Risiko — hintenan.

### Was gemessen unmöglich bleibt

| Sache | Warum, mit Beleg |
|---|---|
| Video als Ebene über `<video>` | `TypeError: v.play is not a function` — der Browser des Wirts ist ohne Medienunterstützung gebaut (`docs/erkenntnisse-signalrgb-motor.md`) |
| Live-Daten aus dem Netz oder von `127.0.0.1` | Effekte laufen unter einer HTTPS-Herkunft; `fetch`/`XHR`/`ws` werden vor CORS blockiert (Mixed Content), gemessen mit einem Server, der `Access-Control-Allow-Origin: *` sendet |
| Ton- oder Bildschirmreaktion **mit** Vorschau-Parität | `engine.*` existiert nur im Wirt; ein Bild, das vom Mikrofon abhängt, ist keine Funktion von `t` mehr |
| `ctx.filter` zur Laufzeit | fehlt im Wirt (gemessen 09.08.); Weichzeichnen muss beim Import ins Bild oder von Hand über Pixelzugriff |

---

## D. Max' eigener Effekt: Lässt sich `MaxAmbient` heute nachbauen?

**Ja — zweimal, auf zwei verschiedene Arten.**

### D1. Als Bildebene: 1 : 1, und zwar deshalb, weil er die Vorlage war

`MaxAmbient.html` besteht aus vier Zutaten. Jede hat heute ihre Entsprechung:

| MaxAmbient | SignalForge | Bemerkung |
|---|---|---|
| PNG 488 × 200 als Base64 eingebettet (69.652 Zeichen) | Bildebene mit JPEG-Einbettung | derselbe Weg, **rund neunmal kleiner**: bei einem vergleichbaren Bild 15.656 statt 139.900 Zeichen (gemessen, `docs/erkenntnisse-signalrgb-motor.md`) |
| `ausschnitt`: „Fuellen" / „Ganzes Bild" | `fit`: `cover` / `stretch` | wortgleiche Bedeutung; wir haben zusätzlich `contain` |
| `modus`: „Wabern" / „Standbild", mit `tempo` 1–100 und `staerke` 0–100 | Bewegung `warp` mit Tempo und Stärke, bzw. `none` | **dieselbe Mathematik** — Wellentabellen je Zeile und Spalte, bilineare Abtastung, gepolsterter Quellpuffer mit gestreckten Randpixeln, halbe Auflösung (160 × 100). `src/engine/layers/warp-buffer.js` ist der aufgeräumte Nachfahre dieses Codes |
| `helligkeit` 5–100 über `ctx.globalAlpha` auf schwarzem Grund | Dokument-Helligkeit 0–200 | anderer Rechenweg (Kanal mal Faktor statt Deckkraft über Schwarz), **auf schwarzem Grund dasselbe Ergebnis** — und unsere kann zusätzlich aufhellen |
| `BILD_ABSTAND = 1000 / 30` | `FRAME_GAP = 1000 / 30` | identisch |

Einziger echter Unterschied: MaxAmbient rechnet den Bildausschnitt selbst
(`(SRC_W - breite) / 2`, also immer mittig), SignalForge lässt den Ausschnitt ziehen
(`offset.x/y`, −1 … 1). Das ist mehr, nicht weniger.

**Was heute fehlt: nichts.** Der Effekt ist mit der App in wenigen Griffen nachgebaut —
Bild ziehen, Ausschnitt wählen, Bewegung „Wabern", Tempo 15, Stärke 30, Helligkeit 100.

### D2. Ohne das Foto, nur mit Formen — geht ebenfalls, und besser als erwartet

Max' Auftrag lautet ausdrücklich *„nicht mit perfektem Bild, sondern mit Formen und
Effekten"*. Also die ehrliche Prüfung: Was **ist** das eingebettete Bild eigentlich?

Herausgelöst und ausgemessen (488 × 200, Mittelwerte über ein 5 × 3-Raster):

```
#020201  #14170b  #70714b  #616437  #2a341c
#090a06  #3a4b30  #686f44  #3b4624  #141709
#121b14  #6c8063  #697b5b  #313a25  #15160c
```
Gesamtmittel `#373f28`, hellster Pixel `(206, 203, 190)`, dunkelster `(0, 0, 0)`.

Das ist **ein stark weichgezeichnetes Waldbild**: ein dunkles Olivgrün-Feld, das zu allen vier
Rändern hin nach Schwarz abfällt, mit einem helleren, gelbstichigen Bereich etwas links der
Mitte und in der oberen Mitte. Keine erkennbare Kante, kein Motiv, kein Gegenstand — genau
das, was ein Ambientlicht sein soll.

**Damit ist es eine Verlaufsebene.** Konkret, heute baubar:

1. Ebene 1: Verlauf, Form `radial`, Mittelpunkt-Rampe von `#6c8063` (innen) über `#3a4b30`
   nach `#050503` (außen), Winkel egal.
2. Ebene 2 darüber: Verlauf, Form `radial`, Mischmodus `screen`, Deckkraft ~0,4, von
   `#70714b` nach Schwarz — das ist der hellere Fleck oben.
3. Beide Ebenen: Bewegung `warp`, Tempo 15, Stärke 30 (**dieselben Zahlen wie in MaxAmbient**),
   dazu auf Ebene 2 ein langsames `drift`, damit der helle Fleck wandert.
4. Dokument-Helligkeit nach Geschmack.

Was dabei verlorengeht: die feine Struktur des Laubs. Die ist im 320 × 200-Bild ohnehin schon
Matsch und wird von SignalRGB anschließend auf ein paar Dutzend LEDs heruntergerechnet — eine
LED sieht den Mittelwert eines ganzen Bildbereichs. **Auf der Hardware wäre der Unterschied
zwischen D1 und D2 vermutlich nicht zu sehen.** Vermutlich, nicht sicher: das ist eine
Vorhersage, keine Messung, und sie gehört nachgemessen, indem beide Fassungen nebeneinander
exportiert und je LED verglichen werden.

Was gewinnt: die Datei fällt von 78.652 auf unter 30.000 Bytes, die Farben sind jederzeit in
SignalRGBs eigener Bedienleiste änderbar, und der helle Fleck kann wandern, was das Standbild
nie könnte.

---

## E. Kurzfassung in einem Satz

Der Markt-Bestand ist zu ungefähr der Hälfte **dasselbe Partikelsystem in anderen Farben**,
zu einem Viertel **wandernde Verläufe** (die wir haben), und der Rest sind Figuren, Kachel-
raster und drei Sonderfälle; wer **Partikel mit gesätem Zufall (C1)**, **Nachzieh-Schleier
(C2)** und **Farbrotation (C3)** baut, kann aus 31 gelesenen Effekten grob 25 nachbauen — und
Max' eigener `MaxAmbient` geht schon heute, als Bild wie als Verlauf.

---

## Gelesene Dateien

Alle nur gelesen, keine verändert.

- `C:\Users\Max\Documents\WhirlwindFX\Effects\MaxAmbient.html`
- `C:\Users\Max\AppData\Local\WhirlwindFX\SignalRgb\cache\effects\<ID>\effect.html` für die
  26 IDs: `-M0UK0pcnuXzoqaS7-48` (Terminal), `-M6kb-ZFTdoKW5tRxV8Y` (Aurora),
  `-M6ojVXsfMF8BhRkGk9f` (Biohazard), `-MDRF1yNuxmbjNg7jjX5` (Starlight),
  `-MO8liV7Dy1JZC5l7nfQ` (Custom Sunrise), `-MTsd7Nkp20-S4uV_geE` (Enigma),
  `-MTwqhnV_LPbIrkfZOfo` (Black Ice), `-MUUef9Fu4_IZqoYlEkG` (Arctic),
  `-MUUh11VgH1ql3SG-UQ_` (Magma), `-MW1HiLVmaae68ySWvwo` (Radar),
  `-M_bG5GkyerNU7v-7zZs` (Good Night!), `-MdDOaykoA7jHwcb2e0r` (Spin),
  `-Me3BsMN_hIlzeJwFbMs` (Gradient Wave), `-Mir7bKkFQmd2LF_9Leg` (Poison),
  `-MjCaViky2lHnSRue7Ql` (Corrosive), `-MjGsRxFd8wpX_T5G1YR` (Nuclear),
  `-MkES4ONtPseIh34t2Ff` (Calm Water), `-MkdtLoF0jTZ2oqTdbT6` (Peach),
  `-MlmUaQsYtq_jb8V8Inm` (Jade), `-N--Ma4s4V5fQrlP0irI` (Titanium),
  `-N5HOxzFzULHR89qt0CA` (Crimson), `-NC1t0Cs_BFxL8Quq5Ry` (Rick and Morty),
  `-NIc4SbcPndIx2dhVy9O` (Hydrogen), `-NIt9RINI5HwQ4_FjILd` (Dark Magic),
  `-NVpCeOFFNWNd41pKVF9` (Electric), `-NyghEBs8-mYkxU6qRFv` (Vibe)
- `C:\Users\Max\AppData\Local\VortxEngine\app-2.5.74\Signal-x64\Effects\Static\Rainbow.html`
- `…\Static\Neon Shift.html`, `…\Static\Side To Side.html`, `…\Static\Solid Color.html`
- `…\Dynamic\Screen Ambience.html`
- Eigener Stand: `src/engine/document.js`, `src/engine/engine.js`,
  `src/engine/layers/gradient.js`, `src/export/build-effect.js`
- Frühere Messungen: `docs/erkenntnisse-signalrgb-motor.md`, `docs/messung-titelbilder.md`,
  `docs/entwurf-2026-08-09.md`
