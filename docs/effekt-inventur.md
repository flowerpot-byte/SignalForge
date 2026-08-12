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
| SignalRGBs eigene, mitgelieferte Effekte | 5 | `C:\Users\<Benutzer>\AppData\Local\VortxEngine\app-2.5.74\Signal-x64\Effects\{Static,Dynamic}\` |
| Vom Markt geladene Effekte im Zwischenspeicher | 26 | `C:\Users\<Benutzer>\AppData\Local\WhirlwindFX\SignalRgb\cache\effects\<ID>\effect.html` |
| Max' eigener, behaltener Effekt | 1 | `C:\Users\<Benutzer>\Documents\WhirlwindFX\Effects\MaxAmbient.html` |

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

**Warum hier kein fremder Code steht.** Diese Untersuchung liest 31 Effekte, die anderen
Leuten gehören — fünf davon SignalRGB selbst, 26 Autorinnen und Autoren aus dem Markt. Was
sie tun, ist unten ausführlich beschrieben; **abgedruckt ist ihr Quelltext nirgends**.
Jede Stelle, an der früher ein Ausschnitt stand, ist durch eine Beschreibung in eigenen
Worten ersetzt, mit Fundstelle daneben, damit die Aussage nachprüfbar bleibt. Techniken
sind frei — der Text, in dem jemand sie aufgeschrieben hat, ist es nicht, und für eine
Veröffentlichung dieses Repositoriums ist der Unterschied wichtig. Codeblöcke in diesem
Dokument zeigen ab hier ausschließlich **SignalForge-eigenen** Code oder Pseudocode.

Wo die Grenze liegt, ausdrücklich: Kein **abgedruckter Ausschnitt** aus einem fremden
Effekt, nirgends — weder hier noch in den Kommentaren des Motors. Einzelne **Zahlen und
Namen** als Beleg dagegen bleiben stehen (`spikes = 5`, `this.x += speed / 50`): Das sind
Tatsachenangaben über ein Programm, so wie eine Dateigröße oder eine Versionsnummer, und
ohne sie wäre keine Behauptung dieser Untersuchung nachprüfbar. Wer die Linie enger ziehen
will, muss die Belege streichen und bekommt dafür ein Dokument, das man glauben muss.

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

> **In eigenen Worten** (der Bestand wird durchweg beschrieben statt abgedruckt —
> siehe die Anmerkung in Abschnitt 0): Jedes Teilchen zeichnet
> sich selbst als **gestrichenen Kreisbogen**. Die Strichfarbe ist ein Eintrag aus einer
> kleinen Farbliste, an den zwei Hex-Ziffern für die Deckkraft angehängt werden — knapp
> über der Hälfte, also halbdurchsichtig. Die Strichstärke ist die eigene Größe des
> Teilchens, der Radius sein eigener Radius; gefüllt wird nichts.
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

> **In eigenen Worten:** Alle vier Familien machen dasselbe und unterscheiden sich nur
> darin, WOMIT sie übermalen. Die Poison-Familie legt die eigene Hintergrundfarbe mit
> etwa 13 % Deckkraft über die ganze Fläche; `Terminal` nimmt Schwarz mit 15 %;
> `Neon Shift` eine Farbe aus dem laufenden Farbton mit 5 %; `Radar` dieselbe Idee, aber
> mit einer **regelbaren** Deckkraft — der Nutzer stellt die Länge der Spur selbst ein.
> Das ist der einzige der vier, der die Spur zur Einstellung macht.

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

> **In eigenen Worten:** Ein **einziger globaler Zähler** wächst pro Bild um das
> eingestellte Tempo geteilt durch 50 und schlägt bei 360 wieder auf 0 um. Jede Farbe des
> Effekts wird dann in HSL gebildet, indem dieser Zähler auf ihren eigenen Farbton addiert
> wird — Sättigung und Helligkeit bleiben, wie sie waren. Alle Farben drehen sich also
> gemeinsam und behalten ihre Abstände zueinander.
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

> **In eigenen Worten:** Aus Zellbreite und Zeichenfläche wird ein Gitter gebaut (320
> und 200 geteilt durch die Zellbreite). Jede Zelle bekommt bei ihrer Erzeugung **einen
> eigenen zufälligen Startwert** zwischen 0 und 20. Ihre Helligkeit ist dann der Sinus
> dieses Werts, von −1…1 auf 0…1 umgerechnet; der Wert wächst pro Bild weiter. Weil jede
> Zelle woanders startet, atmet das Gitter versetzt statt im Gleichtakt.
(`cache\effects\-NIt9RINI5HwQ4_FjILd\effect.html`, „Dark Magic" — Sechsecke)

`Electric` macht dasselbe mit Quadraten plus herabfallenden „rainCubes". `Biohazard` legt
**5000** Punkte in ein Gitter (`x = sX * (i % nX)`), jeder mit eigenem Zeitversatz, und
schickt Wellen hindurch.

### A7. Wischbewegung über die ganze Fläche (1 von 31, aber mitgeliefert)

`Side To Side` schiebt ein volles Rechteck über die Fläche und lässt die Farbe stehen. Der
Spiegeltrick für die Gegenrichtung ist hübsch und typisch für den Bestand:

> **In eigenen Worten:** Der Nullpunkt wird in die Mitte der Fläche geschoben, dann wird
> waagerecht mit einem Faktor skaliert, der von 1 nach −1 läuft, und der Nullpunkt wieder
> zurückgeschoben. Ein negativer Faktor ist eine **Spiegelung**: derselbe Wisch läuft
> damit auf dem Rückweg andersherum, ohne dass ein zweiter Zeichenweg nötig wäre.

### A8. Regenbogen als Spaltenschleife (1, mitgeliefert — mit einer Warnung darin)

`Rainbow` malt 320 Streifen à 1 px, jeder ein anderer Farbton. Bemerkenswert ist eine
Warnung, die die SignalRGB-Entwickler selbst als Kommentar hinterlassen haben — **in
eigenen Worten:** Ein gefülltes Rechteck über die übliche Kurzform zu zeichnen koste auf
Ultralight ab einer Höhe von rund hundert Pixeln das **250-fache** an Zeit pro Bild.

Deshalb malt die waagerechte Variante mit `ctx.rect()` + `ctx.fill()` statt `fillRect`. Das
ist ein gemessener Hinweis auf den **Ultralight**-Motor, der neben Qt6WebEngine im
Installationsordner liegt (siehe `docs/messung-titelbilder.md`).

### A9. Atmen / Pulsieren über die Deckkraft (3 von 31)

`Solid Color` ist der Lehrbuchfall — und zugleich der einfachste Effekt, den SignalRGB
ausliefert:

> **In eigenen Worten:** Die Deckkraft ist ein Sinus, von −1…1 auf 0…1 umgerechnet. Der
> Zähler dahinter wächst pro Bild um ein Achtel einer vollen Umdrehung, mal Tempo, geteilt
> durch tausend — also eine sehr langsame Schwingung, deren Geschwindigkeit am Regler
> hängt.

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

> **In eigenen Worten:** Der Effekt holt sich vom Wirt einen Puffer mit dem Frequenzbild
> des Tons, prüft ihn misstrauisch (nicht vorhanden, leer, oder nicht genau **200 Byte**
> lang → nichts tun) und liest ihn dann Byte für Byte als Zahl von 0…255, die er durch 255
> teilt. Also 200 Bänder, jedes ein Wert zwischen 0 und 1. Die Sorgfalt bei der Prüfung
> ist bemerkenswert: Der Wirt liefert diesen Puffer offenbar nicht immer.
(`cache\effects\-NIc4SbcPndIx2dhVy9O\effect.html`, „Hydrogen" — Beat-Erkennung)

Also: **ein 200-Byte-Frequenzband, jeder Wert 0–255.** `Hydrogen` bildet daraus Energie und
Varianz der letzten zwölf Bilder und erkennt so Schläge.

Und in `Screen Ambience` (mitgeliefert):

> **In eigenen Worten:** Der Wirt reicht den Bildschirminhalt in vier getrennten Puffern
> herüber — Helligkeit, Sättigung und Farbton je als eigene Zahlenreihe, dazu im
> hochauflösenden Modus die rohen Bildpunkte. Der Effekt legt über jeden Puffer die
> passende typisierte Sicht (vorzeichenbehaftete Bytes für Helligkeit und Sättigung,
> größere Zahlen für den Farbton, begrenzte Bytes für die Bilddaten) und liest daraus.

560 Bildschirmzonen (28 × 20). Der Satz in unseren Notizen ist damit **zu weit gefasst
formuliert und muss beim nächsten Anfassen präzisiert werden**: verboten ist der Weg nach
außen, nicht die Fütterung von innen.

### A13. Eingabe: Tastendruck (9 von 31)

Der Wirt ruft eine frei benannte Funktion auf, wenn eine Taste gedrückt wird:

> **In eigenen Worten:** Der Wirt ruft bei einem Tastendruck eine Funktion mit den
> Koordinaten der betroffenen Stelle auf. Der Effekt legt dort — sofern der Schalter dafür
> an ist — eine neue Welle in seine Liste laufender Wellen. Mehr ist es nicht: eine
> Rückrufstelle und eine Liste.
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
| A1 Partikelsystem | **Ja, ganz** (seit 11.08., siehe C1) | Ebenentyp `particles`; geschlossene Formel je Partikel aus gesätem Zufall, vier Muster |
| A2 Nachzieh-Schleier | **Ja, ganz** (seit 12.08., siehe C2) | Dokumentfeld `trail` (0 = aus = wie bisher). Über durchsichtigem Grund ein Schleier nach Schwarz; über einem Hintergrund eine zweite, durchsichtige Spurfläche, die zur **aktuellen** Farbe des Hintergrunds verblasst — mehr als der Bestand kann, dessen Hintergrund stehen muss |
| A5 Figuren (Kreis/Ring/Stern/Herz) | **Ja, ganz** (seit 11.08., siehe C4) | Ebenentyp `shape`; Kreis, Ring, Stern, Herz auf durchsichtigem Grund |
| A6 Kachelraster | **Nein** | Ebenentyp oder Verlaufsform fehlt. Phase je Zelle aus gesätem Zufall |
| A10 Text | **Nein** | Schriftrendering im Wirt ungeprüft |
| A12 Ton- und Bildschirmreaktion | **Nein** | siehe C8 samt Nachtrag 12.08. — der alte Zusatz „unter unseren Zusagen unmöglich" ist überholt |
| A13 Tastendruck | **Nein** | technisch möglich (Wirt ruft `onCanvasTapped`), aber unvorschaubar |
| A14 Rückruf bei Reglerwechsel | **Nein, brauchen wir aber nicht** | wir lesen die Regler in jedem Bild neu (`readControls`) |

**Nachtrag 11.08.2026:** Drei Zeilen dieser Tabelle sind seither erledigt — A4 (Farbrotation)
ganz, A2 (Nachzieh-Schleier) mit einer Einschränkung, die bei C2 ausbuchstabiert ist, und
A5 (Figuren) ganz. Die Zusammenrechnung darunter ist die von vor diesem Bau und wird bewusst
nicht überschrieben: der volle Wert der ersten beiden zeigt sich erst mit den Partikeln (C1),
und bis dahin wäre eine höhere Zahl hier eine Behauptung statt einer Messung.

**Nachtrag 11.08.2026, zweiter — A1 ist gebaut, und damit ist der Satz oben eingelöst.**
Die Partikelebene steht (C1). Die Einschränkung bei A2 ist damit ganz weg: der Schleier hat
jetzt genau das, wofür er gedacht war, denn eine Partikelebene deckt die Fläche nie. Gemessen
im echten Fenster: mittlere Bildhelligkeit 3,08 ohne Schleier, 34,57 mit
(`work/particles-shots/`, elffach).

**Die Zusammenrechnung ist damit fällig, und hier ist sie — ehrlich gerechnet.** Von den 31
gelesenen Effekten sind jetzt nachbaubar: die **neun** aus der Poison-Vorlage (`Poison`,
`Corrosive`, `Calm Water`, `Titanium`, `Crimson`, `Jade`, `Nuclear`, `Peach`, `Magma`) —
alle sind wandernde Partikel in 3–4 Farben mit Schleier, und alle drei Bausteine gibt es;
dazu `Arctic` (Schnee, einfarbig mit Deckkraft-Streuung), `Starlight` (Partikel bei
Reisetempo 0), `Custom Sunrise` und `Aurora` näherungsweise, plus die sechs, die schon vorher
gingen (`Solid Color`, `Good Night!`, `Rainbow`, `Black Ice`, `Gradient Wave`, `Neon Shift`)
und `MaxAmbient`. Das sind **rund 20 von 31**. Die vorhergesagten „grob 25" sind damit
**nicht** erreicht, und das ist keine Nachlässigkeit, sondern die Rechnung von damals war zu
optimistisch: sie hat A6 (Kachelraster, drei Effekte) und A5-Reste mitgezählt, die C5 noch
gar nicht gebaut hat, und `Hydrogen`, `Terminal`, `Biohazard`, `Radar`, `Vibe`, `Spin`,
`Enigma`, `Electric`, `Dark Magic` und `Rick and Morty` brauchen weiter Bausteine, die es
nicht gibt (Tonreaktion, Text, Kachelraster, Zeiger-Geometrie). Der Sprung durch C1 ist
trotzdem der größte einzelne des ganzen Projekts: **von 6 auf ungefähr 20.**

**Und eine Einschränkung ist mit A5 weggefallen, nicht nur eine Zeile dazugekommen.** Der
Nachzieh-Schleier (C2) hatte bis dahin nichts, woran er sichtbar werden konnte: jede Ebene,
die es gab, übermalte alle 320 × 200 deckend und verdeckte damit ihr eigenes Nachziehen. Die
Formebene übermalt nichts — sie zeichnet eine Figur und lässt jeden Pixel daneben so, wie sie
ihn vorgefunden hat. Eine wandernde Figur mit Schleier dahinter ist damit das erste, was in
SignalForge eine Nachzieh-Spur aus dem Grund zeigt, aus dem es sie gibt. Gemessen im echten
Fenster: mittlere Bildhelligkeit 1,88 ohne Schleier, 3,23 mit (`work/shape-layer-shots/`).

**Nachtrag 12.08.2026 (Nachtschicht):** Vier Bausteine sind dazugekommen, und eine Zeile
der Technik-Tabelle ist von der Wirklichkeit überholt worden.

- **Seitenverhältnis-Ausgleich (`aspect`):** SignalRGB rendert jeden Effekt in einer festen
  320×200-Ultralight-View und streckt das fertige Bild aufs Vorschau-Panel (bei Max ≈1,54×
  breiter, gemessen am eigenen Log + Screenshot). Kein einziger der 27 gelesenen Effekte
  gleicht das aus — unsere Figuren und Partikel können es jetzt (Regler „Aspect Fix",
  Dokumentfeld `aspect`). Wir zeichnen damit die ersten Kreise, die in SignalRGBs Vorschau
  wirklich rund sind.
- **Farbwechsel zwischen GEWÄHLTEN Farben (`stops`+`cycleSpeed` an Fläche und Figur):** die
  A4-Spielart, die der Bestand NICHT hat — dort rotiert „Color Cycle" die Farbtöne übers
  ganze Rad; hier blendet ein Ring durch 2–4 selbst gewählte Farben. Tempo-Änderung springt
  nicht (Anker `cyclePhase`, in der App automatisch umgeparkt — dieselbe Mechanik, die seit
  heute auch `hueCycle` beim Verstellen still hält).
- **Eigenes Titelbild (`cover`):** die Kachel neben der Effektdatei kann jetzt ein gewähltes
  Bild sein (512×288, beim Wählen zugeschnitten und eingebettet); Automatik bleibt Standard.
- **Zuletzt benutzte Farben** an jeder Farbauswahl der App (acht, überleben den Neustart).

**Die überholte Zeile ist A12 (Tonreaktion): „unter unseren Zusagen unmöglich" stimmt nicht
mehr.** SignalRGB dokumentiert offiziell ein `engine.audio`-Objekt für Lightscripts
(`docs.signalrgb.com/developer/lightscripts/audio-visualizer`): `level` (Lautstärke),
`density`, `freq` (200 Frequenzbänder) — vom WIRT in den Effekt hineingereicht, kein fetch,
keine Außenwelt. **C8s eigene zwei Gründe (Vorschau kann es nicht zeigen; Parität bricht)
gelten weiter** — der Nachtrag BEI C8 beschreibt den ehrlichen Weg daran vorbei
(deterministisches Probesignal in der Vorschau, Parität als „gleiches Signal → gleiche
Pixel", Motorcheck zuerst). Dann wäre der meistgewünschte Effekttyp der Community
(Audio-Visualizer, mit Abstand) baubar, und `Hydrogen` rückt vom „braucht fehlende
Bausteine"-Stapel herunter.

Aus derselben Recherche, fürs Einordnen: Der meistgesehene Feature-Wunsch im offiziellen
SignalRGB-Forum ist kein neuer Effekttyp, sondern **weichere Übergänge** — Politur schlägt
Neuheit. Es gibt zwei kostenlose No-Code-Konkurrenten (RGBJunkie Effect Builder, SRGBmods
Effect Creator) — SignalForge unterscheidet sich über Vorschau-Ehrlichkeit, Parität und
Bildqualität, nicht übers bloße Existieren. Und ein Logfund am Rande: SignalRGB kappt bei
Free-Tier-Konten „non-owned user-dir effects" bei **zehn** — falls je mehr als zehn fremde
Effekte in Max' Ordner liegen, verschwinden welche aus der Liste, ohne dass SignalForge
etwas dafür kann.

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

**Nachtrag 11.08.2026 — gebaut, mit fünf Abweichungen von diesem Entwurf.**

Gebaut ist der Ebenentyp `particles` mit `pattern` (Regen / Aufsteigen / Treiben / Schnee),
`stops` (2–4 Farben), `count` (1–400), `size` (1–25 % der Bildhöhe), `speed` (0–100 auf der
gemeinsamen Tempokurve), `tilt` (−180…180) und `seed` (0–99). **Eine** Kachel in der
Startleiste, nicht vier.

1. **Die Bewegung ist ein FELD und keine Bewegungsart.** Jede andere Ebene ist ein Standbild,
   dem man eine Bewegung hinzufügen kann; eine Partikelebene ohne Bewegung ist gar keine
   Partikelebene, sondern ein Punktehaufen. Das Reisen IST die Ebene. `motions` bedeutet
   deshalb weiter genau das, was es überall bedeutet, und angeboten werden dort nur `atmen`
   und `pulsieren` — `wandern` und `drehen` würden die Streuung als Ganzes verschieben und
   eine wachsende leere Kante hinterlassen, weil es kein Nachfüllen gibt.
2. **Keine Lebensdauer.** Der Entwurf sah eine vor. Es gibt keine: die Phase läuft im Kreis
   (`frac`), was dasselbe ist wie Sterben-und-Nachfüllen, nur in einem Schritt statt zwei.
   Der Sprung passiert nachweislich außerhalb der Leinwand (`test/engine/particles.test.js`).
3. **Keine Form-Wahl (Ring / Punkt / Quadrat).** Der Bestand malt Ringe; auf 320 × 200 und
   danach auf ein paar Dutzend LEDs heruntergerechnet ist ein 6-Pixel-Ring ein Punkt mit
   einem Loch, das niemand sieht. Weggelassen, nicht vergessen — die Formebene (C4) malt
   Ringe, wenn es um Ringe geht.
4. **Die Richtung gehört dem Muster, das Feld ist nur eine NEIGUNG.** Der erste Entwurf hatte
   einen absoluten Winkel mit musterabhängigem Standardwert. Das war falsch und ist im
   echten Fenster aufgefallen: „Aufsteigen" fiel nach unten, sobald das Dokument einmal
   normalisiert war. Siehe `MAX_PARTICLE_TILT` in `src/engine/document.js`.
5. **`Anzahl` ist bei 400 gedeckelt, und die Messung sagt, dass nicht die Kosten das
   entscheiden.** Gemessen (`test/harness/particle-cost.js`): 1,02 µs je Partikel bei
   Standardgröße, 2,47 µs bei der größten — die 5-ms-Linie läge erst bei rund 2000 bis 4900
   Partikeln. 400 ist gewählt für Luft auf einem nie gemessenen Wirt, weil der Bestand bei
   50–200 liegt, und weil die Leinwand vorher voll ist als der Prozessor.

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
bis 0,02 (116 Bilder) gespannt — die Bildzahlen sind die eigentliche Messung, wirtunabhängig,
weil der Schleier pro gezeichnetem Bild aufgetragen wird und nicht pro Sekunde. Die
Sekundenangabe (≈ 3,9 s für 116 Bilder) gilt nur bei sauberen 30 fps und ist es nicht selbst:
ein Wirt, der schneller oder langsamer zeichnet, durchläuft dieselben 116 Bilder in einer
anderen Zeit. Die Ebenen werden dabei in eine eigene, unsichtbare
Fläche gemalt und erst danach kopiert und eingefärbt — sonst würde Helligkeit und Farbdrehung
bei jedem Bild erneut auf den Nachzieh-Rest angewandt und der liefe binnen einer Sekunde ins
Weiße. Die Parität ist wie angekündigt umgestellt: Einzelbild-Vergleich für Dokumente ohne
Schleier, Bildfolge ab Bild 0 für Dokumente mit (`test/export/parity.test.js`).

**Nachtrag 11.08.2026, zweiter — die Einschränkung darunter ist aufgehoben.** Mit der
Formebene (C4) gibt es endlich eine Ebene, die die Fläche nicht deckt, und damit ist der
Schleier das, was er sein soll. Der Absatz darunter bleibt trotzdem stehen: er beschreibt
richtig, warum der Schleier auf Verläufen und Bildern kaum zu sehen ist, und das gilt weiter.

**Nachtrag 12.08.2026, dritter — und damit ist A2 ganz erledigt.** Der Absatz
darunter beschrieb bis heute eine zweite, echte Grenze: ein Hintergrund
übermalt alle 320 × 200 Pixel und verdeckt damit die Spur des Vordergrunds
vollständig — der Regler tat, mit Hintergrund, nachweislich **nichts** (Differenz
exakt 0, ein Tag lang so festgenagelt). Gebaut ist jetzt die Trennung, die der
Bestand gar nicht braucht, weil sein Hintergrund stillsteht: eine **zweite,
durchsichtige Spurfläche**, die nur den Vordergrund hält, während der Hintergrund
jedes Bild frisch darunter gezeichnet wird. Ein Geist verblasst damit zur Farbe,
die der Hintergrund **jetzt** hat, und wo nichts vorbeikam, kommt der Hintergrund
Byte für Byte unberührt durch — er ist von seiner eigenen Spur ausgenommen, denn
mit sich selbst geschleiert würde ein bewegter Hintergrund zum Mittelwert der
letzten hundert Bilder seiner selbst.

Der Bestand veilt in der Hintergrundfarbe (`bgColor + "22"`, Abschnitt A2 oben) —
das ist derselbe Gedanke, und er funktioniert dort nur, weil `bgColor` eine
einzige, stehende Farbe ist. Was uns dabei überrascht hat, steht ausführlich in
`.superpowers/sdd/background-layer-report.md`, Abschnitt 6, und in einem Satz:
**der Browser kann ein Canvas-Alpha nicht auf 0 multiplizieren** — alle vier Wege
bleiben bei 25/255 oder 42/255 stehen, weil sie runden statt abzuschneiden. Über
Schwarz tut Chromiums `source-over` genau das Gegenteil und erreicht exakt 0. Der
Motor rechnet deshalb an dieser einen Stelle selbst.

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

**Nachtrag 11.08.2026 — gebaut, mit drei Abweichungen von diesem Entwurf und einer Zugabe.**

Gebaut ist der Ebenentyp `shape` mit `figure` (Kreis / Ring / Stern / Herz), `color`, `size`
(Prozent der Bildhöhe), `position` (x/y in Prozent), `thickness` (Ringwand in Prozent des
eigenen Radius) und `points` (Zacken, 3–12). Vier Kacheln in der Startleiste, eine je Figur.

1. **Kein Vieleck.** Ein Vieleck ist derselbe Streckenzug wie der Stern mit
   `innerRadius = outerRadius`, also kein eigener Baustein, sondern ein zweiter Regler am
   Stern — und dessen ganze Spanne hieße „immer noch ein Stern". Es ist weggelassen, nicht
   vergessen; wer es will, bekommt es als Verhältnis-Regler am Stern, nicht als fünfte Figur.
2. **Keine weiche Kante.** Der Entwurf schlug sie als Radialverlauf mit `transparent` am Ende
   vor, so wie `Vibe` es macht. Sie ist nicht gebaut, weil sie mit dem gebauten Ergebnis
   zusammenstößt: eine weiche Kante ist eine Füllung mit Verlauf, und eine Figur, die als
   Verlauf gefüllt wird, hat keine Farbe mehr, die SignalRGBs eigenes Farbfeld ändern kann.
   Das ist eine eigene Entscheidung und gehört auf die Liste, nicht in diesen Bau geschmuggelt.
3. **Kein Verlauf als Füllung**, aus demselben Grund.
4. **Zugabe: `spin` je Figur entschieden.** `motionKindsFor` bekommt ein zweites Argument.
   Ein Kreis und ein Ring sind um ihren eigenen Mittelpunkt drehsymmetrisch — die Drehung
   kann kein Pixel ändern — also wird sie dort gar nicht erst angeboten, genau wie beim
   Farbflächen-Fall. Bei Stern und Herz ist sie der Sinn der Sache.

**Was nicht geht und warum, gemessen:** `warp` wird auf keiner Figur angeboten. `drawWarped`
(`src/engine/layers/warp-buffer.js`) schreibt bauartbedingt `alpha = 255` in jeden Pixel —
eine gewarpte Figur wäre also ein deckendes 320 × 200-Rechteck und würde jede Ebene darunter
und ihr eigenes Nachziehen verdecken. Den Puffer alphafähig zu machen ist ein eigener Bau.

**Kosten, gemessen** (`test/harness/shape-cost.js`, Median über 400 Bilder): jede Figur mit
jeder angebotenen Bewegung liegt bei 0,00–0,01 ms je Bild, also unter 0,03 % eines Kerns.
Der teuerste Einzelfall ist ein Stern bei Größe 200 mit 0,09 % (p95 von 20); mit Schleier 70
dazu 0,57 %. Zum Vergleich steht in derselben Tabelle unverändert der Farbkreis beim Ziehen
eines Farbstopps mit 15,34 %.

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

**Aufwand:** klein. ~~**Grenze:** keine.~~

**Korrektur 12.08.2026 — „Grenze: keine" war falsch, und zwar aus einem Grund, der schon
im Motor steht.** Ein endloser Marsch braucht eine Rampe, die umläuft, und der Übergang von
der letzten Farbe zurück zur ersten ist **eine harte Naht, die quer über die Fläche
wandert**. Das ist genau die Begründung, aus der `drift` schwingt statt zu marschieren
(`src/engine/motion/drift.js`, Kommentar über `driftSwing`); den Zusatz „außer die beiden
Farben passen zufällig zusammen" trägt die Zwillingsstelle in
`src/engine/layers/gradient.js` (Bewegungsliste, Absatz `drift`). Wer C6 als „klein, keine
Grenze" liest, baut genau in diese Naht hinein.

Die Naht ist aber nicht überall ein Problem, und das entscheidet die **Form**, nicht die
Bewegung:

| Form | Marsch nahtlos? | Warum |
| --- | --- | --- |
| `waves` | **ja** | Die Farbe folgt `ramp(0.5 - 0.5·cos(2πu))`: bei u = 0 und u = 1 dieselbe Farbe. Nicht dieselbe *Steigung* — gezeichnet wird die Kurve als 16 gerade Stücke je Bogen (`WAVE_SAMPLES`), an der Nahtstelle treffen zwei mit entgegengesetzter Neigung aufeinander, also ein Knick. Er liegt in derselben Größenordnung wie der ohnehin dokumentierte Näherungsfehler der Kurve und ist im Betrieb nicht zu sehen — aber „vollkommen unsichtbar" ist eine Behauptung über die ideale Formel, nicht über das Bild |
| `stripes` | **ja** | Wiederholt sich ohnehin, und an jeder Bandgrenze stehen zwei Farbstopps am selben Ort — die harte Kante ist schon da. Die Nähte wandern einfach mit, genau der gewünschte Lauf |
| `conic` | **nahtlos ja — aber überflüssig** | 0° und 360° sind derselbe Ort, es kommt also keine NEUE Naht hinzu. Nur: Ein Marsch auf einem rein winkelabhängigen Rad ist dasselbe Bild wie `g.rotate()`, und das ist `spin`, das es schon gibt. Pixelgleich, solange kein `drift` läuft; mit Drift unterscheiden sie sich, weil `spin` das wandernde Zentrum mitdreht (`driftedCentre`). Eine zweite Bewegung, die im Normalfall dasselbe tut wie eine vorhandene, gehört nicht in die Liste |
| `linear` | **nein** | Eine einzige Rampe über die Fläche; der Umlauf setzt eine sichtbare Kante hinein |
| `radial` | **nein** | Rampe von Mitte nach Rand; der Umlauf setzt einen sichtbaren Ring hinein |

Übrig bleiben damit **zwei** Formen, auf denen C6 klein und sinnvoll ist: `waves` und
`stripes`. Für `linear` und `radial` wäre **erst zu entscheiden, was der Regler dort
überhaupt bedeuten soll** — die Bewegung dort nicht anbieten (dafür gibt es Präzedenz: die
Spalte lässt die Positionsregler bei `stripes` weg, `inspector.js`), die Naht als gewollten
Wisch zulassen, oder die Rampe für den Marsch spiegeln, was nahtlos ist, aber jede Farbe
zweimal zeigt.

**Und der Effekt, der C6 überhaupt motiviert, will etwas anderes.** `Side To Side` marschiert
gar nicht: Er schiebt laut A7 ein volles Rechteck über die Fläche und kehrt per Spiegeltrick
um — ein Hin und Her mit stehenbleibender Farbe, kein umlaufender Verlauf. Als Beleg für
„die Naht ist der gewollte Wisch" taugt er also nicht, und was ihn wirklich freischalten
würde, ist eine wandernde Kante bzw. Fläche, nicht ein Rampen-Marsch. Wer C6 angeht, sollte
zuerst entscheiden, welche der beiden Sachen gemeint ist.

**Deshalb nicht in der Nachtschicht gebaut:** Was am Ende gut aussieht, ist eine
Geschmacksfrage, und die gehört Max. Alles andere daran ist vorbereitet — die Formtabelle
oben ist die Analyse, die der Bau sonst zuerst hätte machen müssen.

### C7. Nachmessen: geht `canvas.style.filter` im Wirt?

Kein Bau, sondern eine Messung, die vor jedem weiteren Filter-Gedanken fällig ist. Unsere
Notizen sagen: **`ctx.filter` fehlt** (gemessen 09.08.). SignalRGBs eigener `Screen Ambience`
benutzt aber den **CSS**-Filter auf dem Element:

> **In eigenen Worten:** Der Effekt setzt die Filterkette nicht auf den Zeichenkontext,
> sondern als **CSS-Eigenschaft auf das Canvas-Element** — Farbdrehung, Helligkeit,
> Sättigung, Kontrast und Weichzeichnen in einer Zeichenkette. Daneben steht in seinem
> Auslieferungscode eine Warnung: Ein Weichzeichnen von **null** Pixeln löst in Ultralight
> einen Fehler aus, bei dem der Bildschirm schwarz bleibt; der Filter muss bei null also
> ganz weggelassen werden statt auf 0 gesetzt.

Wenn das im Wirt wirkt, wären Weichzeichnen und Farbdrehung fast umsonst zu haben statt
pixelweise. Der Kommentar über den Ultralight-Fehler bei `blur(0px)` steht im Auslieferungs-
code — er ist ein Beleg dafür, dass jemand es dort tatsächlich betrieben und dabei einen
Fehler gefunden hat. **Nicht ungeprüft benutzen:** Im Installationsordner liegen zwei
Motorfamilien nebeneinander (Ultralight und Qt6WebEngine, siehe `docs/messung-titelbilder.md`),
und welche einen Nutzer-Effekt aus `Documents\WhirlwindFX\Effects` ausführt, ist offen.

**Aufwand:** ein Wegwerf-Effekt, eine halbe Stunde.

### C8. Tonreaktion — **erst messen, dann bauen**

> Diese Überschrift hieß bis zum 12.08.2026 „unter unseren Zusagen unmöglich, und das ist
> die richtige Antwort". Der Abschnitt darunter ist unverändert richtig — die zwei Gründe
> gelten weiter —, aber der Nachtrag am Ende zeigt einen Weg an ihnen vorbei. Wer nur die
> Überschrift liest, soll nicht die überholte Antwort mitnehmen.

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

**Nachtrag 12.08.2026 — C1 bis C5 stehen, die Recherche ist da, und die zwei Gründe oben
gelten unverändert. Was sich geändert hat, ist der WEG an ihnen vorbei, nicht die Gründe —
und damit wird aus der Absage ein „erst messen, dann bauen":**

- `engine.audio` ist inzwischen **offiziell dokumentiert**
  (`docs.signalrgb.com/developer/lightscripts/audio-visualizer`: `level`, `density`,
  `freq[200]`) — nicht mehr nur aus `Hydrogen` herausgelesen. Und es ist der mit Abstand
  meistgewünschte Effekttyp der Community (Forum, alle Vergleichs-Tools).
- Die Vorschau-Absage lässt sich ehrlich auflösen statt umgehen: Die App zeigt eine
  tonreaktive Ebene mit einem **eingebauten, deterministischen Probesignal** (eine feste
  „Musik" aus der Dose, Funktion von `t`) und sagt dazu, dass der echte Ton erst in
  SignalRGB kommt. Parität heißt dann: **gleiches Signal rein → gleiche Pixel raus**, in
  der App wie in der exportierten Datei mit injiziertem Signal testbar — die Zusage wird
  umformuliert, nicht gebrochen.
- **Vor jedem Bau der Motorcheck** (`tools/motorcheck/`, wie immer): Existiert
  `engine.audio` wirklich in Max' SignalRGB-Version? Welche Form haben `level` (−100..0?),
  `density`, `freq` (Länge, Wertebereich, Aktualisierungsrate)? Was steht drin, wenn NICHTS
  spielt — und was im Exclusive-Mode (ASIO/WASAPI), der SignalRGB das Signal kappt (bekannter
  Community-Stolperstein, gehört als Hinweis in jede Audio-Bedienfläche)?

Erst wenn der Motorcheck die Antworten hat, gehört eine Audio-Ebene auf die Bauliste — dann
aber als das wertvollste einzelne Stück, das dieses Projekt noch bauen kann.

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

- `C:\Users\<Benutzer>\Documents\WhirlwindFX\Effects\MaxAmbient.html`
- `C:\Users\<Benutzer>\AppData\Local\WhirlwindFX\SignalRgb\cache\effects\<ID>\effect.html` für die
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
- `C:\Users\<Benutzer>\AppData\Local\VortxEngine\app-2.5.74\Signal-x64\Effects\Static\Rainbow.html`
- `…\Static\Neon Shift.html`, `…\Static\Side To Side.html`, `…\Static\Solid Color.html`
- `…\Dynamic\Screen Ambience.html`
- Eigener Stand: `src/engine/document.js`, `src/engine/engine.js`,
  `src/engine/layers/gradient.js`, `src/export/build-effect.js`
- Frühere Messungen: `docs/erkenntnisse-signalrgb-motor.md`, `docs/messung-titelbilder.md`,
  `docs/entwurf-2026-08-09.md`
