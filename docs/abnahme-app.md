# Abnahme der App (Bauplan 2)

**Durchgespielt am:** 10.08.2026 · **Von:** dem Umsetzer von Aufgabe 12, am selben Rechner ·
**Stand:** Zweig `main`, ab Commit `695f8d5`

Das hier ist der Abschluss von Bauplan 2. Alle elf Punkte aus Aufgabe 12 wurden **selbst
durchgespielt, bevor Max gefragt wird** — am echten laufenden Fenster, mit echten Maus- und
Tastatureingaben, und zu jedem Punkt gibt es ein Bild, das angeschaut wurde. Max' eigener
Prüfpunkt (die vier Fragen) steht unten und ist **noch unbeantwortet**.

**Nachtrag vom 10.08.2026:** Die einzige Lücke, die dieser Durchlauf offengelassen hatte — der
Bildausschnitt ließ sich nicht mit der Tastatur verschieben — **ist geschlossen.** Punkt 11
unten ist entsprechend erweitert, und der Durchlauf wurde danach in beiden Durchgängen noch
einmal komplett gefahren.

---

## Testsatz

```
npm test  ->  295 Tests, 295 bestanden, 0 Fehler   (Stand 10.08.2026, dreimal hintereinander)
```

Zur Abnahme selbst waren es 254 (vorher 247; die sieben neuen gehörten zu Sprachwahl beim
ersten Start, Erststart-Fläche und Sprachumschalter). Bis zum Nachtrag oben sind daraus 280
geworden, und die fünfzehn Tests für die Tastaturbedienung des Ausschnitts machen 295 daraus.

---

## Was für diese Abnahme noch gebaut wurde

**1. Die Frage beim ersten Start.** Wenn der Effektordner von SignalRGB nicht gefunden wird,
stand das bisher nur als graue Zeile in der Fußleiste — die niemand liest, bevor er auf
„In SignalRGB speichern" drückt. Jetzt steht in der Mitte der Vorschauspalte eine ruhige
Fläche, die sagt, was fehlt, und genau einen Knopf anbietet. Kein Assistent über mehrere
Schritte, und nichts, was den Rest des Fensters sperrt: wer erst ein Bild hineinziehen und
spielen will, kann das tun und die Ordnerfrage später beantworten. Sie verschwindet, sobald
sie beantwortet ist, und kommt von allein zurück, falls der Ordner später verschwindet.

**2. Der Sprachumschalter — der fehlte wirklich.** Aufgabe 5 hatte den Textschlüssel
`settings.language` angelegt, aber **es gab im ganzen Fenster keine Bedienung dafür**. Die App
war fest deutsch, egal wie der Rechner eingestellt war. Gebaut wurde:

- Beim allerersten Start entscheidet die Sprache des Rechners (`navigator.language`), danach
  die gespeicherte Einstellung. Dafür musste „noch niemand hat gewählt" ein eigener Zustand
  werden: `DEFAULT_SETTINGS.language` ist jetzt `''` statt `'de'`, und das Fenster schreibt
  seine Wahl beim ersten Start zurück.
- Ein Auswahlfeld in der Fußleiste, beschriftet aus den Sprachdateien. Die Sprachen stehen in
  sich selbst da („Deutsch", „English") — wer versehentlich in einer Sprache landet, die er
  nicht lesen kann, muss wieder herausfinden können.
- Umgeschaltet wird **im Fenster beschriftet, nicht neu aufgebaut**. Ein Neuaufbau hätte die
  Vorschau samt laufender Zeichenschleife weggeworfen, das Bild verloren, an dem gerade
  gearbeitet wird, und die Tastaturmarkierung genau des Feldes zerstört, das man gerade bedient.

---

## Wie durchgespielt wurde

Zwei Werkzeuge, beide im Repository, beide wiederholbar:

- **`test/harness/walkthrough.js`** — ein eigener Electron-Start, der das echte `app/main.js`
  lädt und dann in dessen echtes Fenster hineingreift: Maus und Tastatur kommen über das
  Chrome-DevTools-Protokoll, also so, wie sie vom Betriebssystem kämen, und nicht als
  JavaScript, das Funktionen direkt aufruft. Läuft in zwei Durchgängen als zwei getrennte
  Prozesse, damit „App neu starten" wirklich heißt, dass sie angehalten und neu gestartet wurde.
- **Der Selbsttest in `app/main.js`** (`SF_SELFTEST=1`), der ohnehin Teil von `npm test` ist und
  jetzt zusätzlich den echten ersten Start abdeckt.

**Was echt bedient wurde und was nicht** — genau aufgeschrieben, weil ein Durchlauf, der mehr
behauptet, als er getan hat, schlimmer ist als einer, der seine Kanten zugibt. Dasselbe steht
auch im Quelltext an der Stelle, an der es passiert:

- **Echte Eingaben:** das Hineinziehen des Bildes (ein echtes Ziehen mit einem echten
  Dateipfad), das Ziehen des Ausschnitts (Drücken, viele Bewegungen, Loslassen), jeder
  Knopfdruck an seinen eigenen Koordinaten, die Mausbewegung, die die Greifhand erscheinen
  lässt, sowie Tabulator und Pfeiltasten — und seit dem Nachtrag auch das Tabben auf die
  Vorschau-Leinwand und das Verschieben des Ausschnitts mit Pfeil- und Umschalt-Pfeiltasten.
- **Am Element gesetzt, mit demselben Ereignis, das eine Handbewegung auslöst:** die
  Auswahlfelder (deren aufklappende Liste zeichnet das Betriebssystem, sie ist von der Seite
  aus nicht erreichbar) und die Schieberegler (dort geht es um genaue Werte — 0, 30, 100 —,
  die eine Maus, die irgendwo auf der Schiene landet, nicht zusichern kann). Punkt 11 schließt
  diese Lücke von der anderen Seite: dort wird ein Regler mit echten Pfeiltasten bewegt und
  nachgesehen, ob sich die Zahl wirklich ändert.
- **Ersetzt:** die drei Dateidialoge (Ordner wählen, Projekt speichern, Projekt öffnen). Ein
  Dialog des Betriebssystems würde auf einen Menschen warten, und ein Lauf, der auf einen
  Menschen wartet, prüft nichts.
- **In der Seite erzeugt:** das Ablegen der `.mp4` in Punkt 10. Diese Absage wird am
  Dateinamen entschieden, bevor irgendetwas die Festplatte anfasst — ein echtes Ziehen nähme
  denselben Weg.

Was die App selbst tut, tut in jedem Fall sie: der echte Import, die echte
Ausschnitt-Rechnung, die echte Zeichenschleife, der echte Export, die echte Projektdatei.

**Kein Zugriff auf den echten SignalRGB-Ordner.** Es wurde in einen Wegwerf-Ordner exportiert.
Der Beleg dafür steht mit im Bericht (`report-1.json`, Feld `exportTargetOnScreen`).

**Testbild:** 800 × 200, ein Farbverlauf von Grün nach Blau mit einem weißen Balken in der
Mitte. Der Balken ist die Marke, an der „das Bild folgt dem Zeiger" gemessen wird — bei einem
reinen Verlauf gibt es nichts Wiedererkennbares, das man wandern sehen könnte.

**Bilder und Messwerte:** `work/shots-task12/` (Selbsttest) und
`work/shots-task12/walkthrough/` (die elf Punkte, dazu `report-1.json` und `report-2.json` mit
jeder einzelnen Zahl). Der Nachtrag vom 10.08.2026 wurde noch einmal komplett gefahren, beide
Durchgänge, nach `work/shots-crop-keyboard/`. Die Bilder liegen bewusst nicht im Git — sie sind
mit den beiden Werkzeugen oben jederzeit neu erzeugbar.

---

## Die elf Punkte

| # | Punkt | Ergebnis |
|---|-------|----------|
| 1 | Frisch starten, Sprache auf Englisch und zurück | **bestanden** |
| 2 | Bild hineinziehen | **bestanden** |
| 3 | In der Vorschau ziehen | **bestanden** |
| 4 | Bildausschnitt umstellen | **bestanden** |
| 5 | Wellen und Atmen zugleich | **bestanden** |
| 6 | Sättigung auf 0, Farbachsen | **bestanden** |
| 7 | Helligkeit, Rechenlast unter 15 % | **bestanden** |
| 8 | Projekt speichern, App neu starten, öffnen | **bestanden** |
| 9 | Exportieren und das Ergebnis nachsehen | **bestanden** |
| 10 | Eine `.mp4` hineinziehen | **bestanden** |
| 11 | Nur mit der Tastatur bedienen (samt Ausschnitt verschieben) | **bestanden** |

### 1. Frisch starten, Sprache umschalten

Zwei Belege, weil zwei Dinge gemeint sind.

*Der wirklich erste Start* (Selbsttest, ohne vorhandene Einstellungsdatei und mit der Suche
nach einer vorhandenen SignalRGB-Installation auf einen Wegwerf-Ordner gelenkt, damit
„nichts gefunden" eine Tatsache ist und kein Zufall dieses Rechners): die Erststart-Fläche
erscheint, der Rest des Fensters bleibt bedienbar, die Sprache wird aus `navigator.language`
(`de`) übernommen, steht auf `<html lang>` und wird gespeichert.
Bilder: `shots-task12/00-first-run.png`, `00c-language-en.png`, `00d-folder-chosen.png`.

*Das Umschalten*: Deutsch → Englisch → Deutsch, über das Auswahlfeld in der Fußleiste. Es
wechselt **jede** Spalte, nicht nur die eine, in der der Schalter steht: Rahmen
(„Ebenen"/„Layers"), Einstellungsspalte („Helligkeit"/„Brightness"), Fußleiste
(„In SignalRGB speichern"/„Save to SignalRGB"), die Hinweiszeile („Bild hierher
ziehen"/„Drop an image here") und die Erststart-Fläche. Zurückgeschaltet stimmt jedes Wort
wieder. Bilder: `walkthrough/p1-a-fresh-start.png`, `p1-b-english.png`, `p1-c-german-again.png`.

### 2. Bild hineinziehen

Echtes Ziehen mit einem echten Dateipfad. Vorher war die Vorschau leer (mittlere Helligkeit 0),
danach zeigt sie das Bild (130). Der Namensschritt stimmt auch: im Namensfeld steht
`walkthrough-source`, ohne Dateiendung. Bild: `walkthrough/p2-picture-dropped.png`.

### 3. In der Vorschau ziehen

Der Zeiger über der Vorschau wird zur Greifhand (`grab`) — und zwar nur dort, wo Ziehen
überhaupt etwas bewirkt. Der weiße Balken steht anfangs bei Bildspalte 159. Maus 200 Punkte
nach rechts: Balken bei 262. Maus 400 nach links: Balken bei 57. **Das Bild folgt dem Zeiger.**
Am Rand: zweimal weit über das Ende hinaus gezogen ergibt zweimal exakt dasselbe Bild — es
hört auf, statt weiterzurutschen. Bilder: `walkthrough/p3-a-dragged-right.png`,
`p3-b-at-the-edge.png`.

### 4. Bildausschnitt umstellen

Drei verschiedene Ansichten, keine zwei gleich. „Einpassen" ist deutlich dunkler (mittlere
Helligkeit 51 statt 130), weil schwarze Balken dazukommen — genau das, was Einpassen tun soll.
Zurück auf „Füllen" ergibt wieder haargenau das vorherige Bild. Bilder:
`walkthrough/p4-a-contain.png`, `p4-b-stretch.png`.

### 5. Wellen und Atmen zugleich

Beide Bewegungen über die Knöpfe der Einstellungsspalte hinzugefügt, beide auf Stärke 100.
Über zwölf Aufnahmen hinweg:

- **Atmen** ist am Helligkeitshub zu sehen: 23 % Unterschied zwischen hellstem und dunkelstem
  Bild.
- **Wellen** ist daran zu sehen, dass der weiße Balken wandert, und zwar **in jeder Bildzeile
  anders**: bis zu 7 Bildpunkte Wanderung, und innerhalb eines einzigen Bildes stehen die
  drei gemessenen Zeilen bis zu 18 Punkte auseinander. Atmen allein könnte das nicht — es
  ändert nur die Helligkeit und verschiebt nichts.

Auf `walkthrough/p5-a-warp-and-breathe.png` sieht man beides mit bloßem Auge: der Balken ist
eine S-Kurve, und das Bild ist gegenüber Punkt 2 sichtbar abgedunkelt.

### 6. Sättigung und Farbachsen

Sättigung 0: **restlos grau.** Der gemessene Farbanteil fällt von 0,975 auf exakt 0, und der
Abstand zwischen den Kanälen Rot/Grün/Blau ist 0,0 — nicht „fast grau", sondern grau.
Bild: `walkthrough/p6-a-saturation-zero.png`.

Die Farbachsen kippen die Farbe, und zwar so herum, wie die Beschriftung von links nach rechts
gelesen wird (dieselbe Richtung wie in Bildbearbeitungsprogrammen):

| Regler | −100 | 0 | +100 |
|---|---|---|---|
| Grün/Magenta (Grün minus Rot) | 205,5 | 186,1 | 127,5 |
| Blau/Gelb (Blau minus Rot) | 203,9 | 184,3 | 126,4 |

Bilder: `walkthrough/p6-b-green.png`, `p6-c-magenta.png`, `p6-d-blue.png`, `p6-e-yellow.png`.

### 7. Helligkeit und Rechenlast

Helligkeit von 100 auf 30: mittlere Helligkeit von 130 auf 39. Dunkelt ab.
Bild: `walkthrough/p7-a-dimmed.png`.

Die Rechenlastanzeige, jeweils gemessen, nachdem sich der gleitende Mittelwert gesetzt hatte:

| Zustand | Anzeige | Anteil eines Kerns |
|---|---|---|
| Nur Bild, nichts eingestellt | 0,07 ms | 0 % |
| Wellen + Atmen | 0,39 ms | 1 % |
| Wellen + Atmen + Farbe und Helligkeit verstellt | 1,68 ms | 5 % |

Der dritte Fall ist der teuerste, den die App überhaupt erzeugen kann (der Farbdurchgang wird
komplett übersprungen, solange Farbe und Helligkeit neutral stehen). **5 % — die 15-%-Schwelle
ist weit weg.** Bilder: `walkthrough/p7-b-cost-with-motion.png`, `p7-c-cost-worst-case.png`.

### 8. Speichern, neu starten, öffnen

Projekt gespeichert, der Prozess beendet, ein **neuer Prozess** gestartet, Projekt geöffnet.
Alle zwölf Werte kommen unverändert zurück: Bildausschnitt, beide Bewegungsarten, alle vier
Bewegungsregler, alle drei Farbregler, Helligkeit und der Name. Das Bild ist wieder da und
wieder verschiebbar (die Greifhand erscheint, das heißt die Bildgröße wurde neu vermessen —
die Projektdatei trägt sie nicht mit). Bilder: `walkthrough/p8-b-fresh-window.png` (das leere
neue Fenster), `p8-c-opened-after-restart.png`.

### 9. Exportieren und nachsehen

**Nicht in SignalRGB selbst** — das ist Max' Prüfpunkt, und in den echten Effektordner wurde
bewusst nichts geschrieben. Stattdessen: exportiert in einen Wegwerf-Ordner und die fertige
Datei in einem echten Chromium-Fenster geöffnet.

*Sieht sie aus wie die Vorschau?* Für den Vergleich wurde ein Effekt **ohne Bewegung**
exportiert, damit beide Seiten stillstehen und Bild gegen Bild verglichen werden kann:

| | Rot | Grün | Blau |
|---|---|---|---|
| Vorschau | 6,340 | 192,440 | 190,614 |
| Exportierte Datei | 6,371 | 192,647 | 190,898 |

Größter Unterschied: **0,28 von 255** — das ist der Unterschied, den ein zweites Dekodieren
desselben Bildes macht, mehr nicht. Der Vergleich der Helligkeitsverteilung über alle 320
Spalten ergibt einen Abstand von 0,0016. Für das Auge sind sie dasselbe Bild
(`walkthrough/p9-b-still-effect-in-chromium.png` neben `p2-picture-dropped.png` halten).

*Läuft sie, und in der richtigen Größe?* Die Leinwand der exportierten Datei ist **320 × 200**.
Der bewegte Effekt zeigt sechs nacheinander gelesene Bilder, von denen keine zwei gleich sind,
und die Wellenbewegung ist im Bild deutlich zu sehen
(`walkthrough/p9-c-moving-effect-in-chromium.png`).

### 10. Eine `.mp4` hineinziehen

Die Absage lautet: **„Nicht unterstuetzter Dateityp: clip.mp4"** — sie nennt die Datei, sie ist
als Warnung eingefärbt, und die Arbeit bleibt unangetastet: alle Regler und der Name stehen
danach unverändert da, das Bild ist noch in der Vorschau. Bild: `walkthrough/p10-mp4-refused.png`.

### 11. Nur mit der Tastatur

18-mal Tabulator gedrückt. **An jeder einzelnen Station war der Fokusring sichtbar** (geprüft
nicht am Aussehen, sondern daran, dass das Element mit der Tastaturmarkierung dasselbe ist,
das der Browser als `:focus-visible` führt — also den Ring wirklich zeichnet). Erreicht werden
alle drei Arten von Bedienelement: Textfeld, Auswahlfeld, Knopf, Schieberegler. Die Reihenfolge
ist die des Fensters, ohne Sprünge:

`Name → In SignalRGB speichern → Projekt speichern → Projekt öffnen → Sprache →
Bildausschnitt → Bewegung 1 → Entfernen → Bewegung 2 → Entfernen → Bewegung hinzufügen →
Tempo 1 → Stärke 1 → Tempo 2 → Stärke 2 → Farbstärke → Grün/Magenta → Blau/Gelb → Helligkeit`

Und ein Regler wurde wirklich bedient, nicht nur angesprungen: fünfmal Pfeil-links auf der
Helligkeit macht aus 100 eine 95. Bilder: `walkthrough/p11-a-focus-ring.png`,
`p11-b-keyboard-changed-a-slider.png`.

**Der Ausschnitt, nur mit der Tastatur** (nachgetragen am 10.08.2026). Die Vorschau-Leinwand ist
jetzt selbst eine Station in der Tabulator-Reihenfolge — **fünfmal Tabulator vom Namensfeld aus,
und die Markierung steht auf ihr**, mit sichtbarem Fokusring
(`walkthrough/p11-c-canvas-focused.png`). Sie trägt dabei einen Namen für Vorleseprogramme
(„Bildvorschau - Ausschnitt mit den Pfeiltasten verschieben, mit Umschalt in groesseren Schritten") und
sagt über ihre Rolle, dass sie die Tasten selbst verarbeitet.

Bewegt wird mit echten Tastendrücken über das DevTools-Protokoll, gemessen wird am selben
weißen Balken wie beim Ziehen mit der Maus in Punkt 3 — deshalb sind die beiden Zahlenreihen
direkt vergleichbar:

| | Balken vorher | Balken danach | Richtung |
|---|---|---|---|
| Maus 200 Punkte nach rechts (Punkt 3) | 160 | 262 | nach rechts |
| Fünfmal Pfeil-rechts | 160 | 180 | nach rechts |
| Zehnmal Pfeil-links | 180 | 140 | nach links |

**Die Pfeiltasten laufen also genauso herum wie die Maus.** Ein Druck sind vier Bildpunkte der
Leinwand (5 × 4 = 20 gemessene Spalten, 10 × 4 = 40 zurück — auf die Spalte genau); mit
Umschalt sind es vierzig, damit man nicht 120-mal drücken muss, um quer über ein breites Bild
zu kommen, sondern zwölfmal. Am Ende hört es auf: zweimal weit über den Rand hinaus gedrückt
ergibt zweimal exakt dasselbe Bild (`p11-d-crop-at-the-edge.png`). Die Spalte verschiebt sich
dabei nicht — Rollstand vorher wie nachher 0. Bilder:
`p11-e-crop-moved-right-by-arrows.png`, `p11-f-crop-moved-left-by-arrows.png`.

**Die Station gibt es nur, wenn es etwas zu verschieben gibt.** Auf „Einpassen" umgestellt —
da wird nichts weggeschnitten — verschwindet die Leinwand wieder aus der Tabulator-Reihenfolge
und ist nur noch ein Bild; zurück auf „Füllen" ist sie wieder da. Eine Station, an der keine
Taste etwas tut, wäre schlimmer als keine.

Und die Pfeiltasten sind anderswo unangetastet geblieben: der Regler oben reagiert weiter, und
im Namensfeld wandert die Schreibmarke wie immer (von Stelle 18 auf 15 nach dreimal
Pfeil-links).

---

## Was beim Durchspielen aufgefallen ist und behoben wurde

1. **Die Erststart-Fläche schob die wichtigste Zeile aus dem Bild.** In den normalen Fluss
   gestellt stapelte sie sich über die Vorschau-Leinwand, die so breit ist wie die Spalte und
   damit mehrere hundert Punkte hoch — die Spalte fing an zu scrollen und „Bild hierher ziehen"
   rutschte unten heraus. Ausgerechnet beim ersten Start hätte also der eine Satz gefehlt, der
   sagt, was zu tun ist. Die Fläche liegt jetzt frei über der Mitte statt im Fluss.
2. **Die Selbsttest-Bilder zeigten immer den Zustand davor.** `capturePage()` liefert das
   zuletzt *gemalte* Bild, und eine Änderung eine Zeile vorher ist erst im Dokument, noch nicht
   auf dem Schirm. Jedes Beweisbild zeigte damit den Zustand vor dem, was es beweisen sollte.
   Es wird jetzt auf zwei Bildwechsel gewartet.
3. **Der Durchlauf selbst hat zweimal in den echten SignalRGB-Ordner geschrieben.** Nur die
   Einstellungsdatei umzulenken reicht nicht: findet die App dort keinen Effektordner, *sucht*
   sie unter dem echten Dokumente-Ordner weiter. Die beiden Dateien wurden sofort wieder
   entfernt (die beiden eigenen Effekte im Ordner blieben unberührt), und es gibt jetzt drei
   voneinander unabhängige Sicherungen dagegen — umgelenkte Einstellungen, ein vorab
   geschriebener Wegwerf-Ordner, und ein Blick auf die Fußleiste, bevor überhaupt ein
   Export-Knopf gedrückt wird. Im Selbsttest wird zusätzlich die Suche selbst in einen
   Wegwerf-Ordner umgelenkt.
4. **Drei Fehlalarme des Prüfprogramms, keine Fehler der App** — festgehalten, weil sie sonst
   als Mängel gelesen würden: der Zeiger wurde abgefragt, ohne die Maus vorher über die
   Vorschau zu bewegen (die App setzt ihn erst dann); „Wellen" wurde an einem Maß gemessen,
   das über alle Bildzeilen mittelt und die zeilenweise Verschiebung dabei auslöscht; und die
   Farbachsen wurden andersherum erwartet, als sie laufen. **Die Achsen laufen richtig:**
   −100 ist Grün beziehungsweise Blau, +100 ist Magenta beziehungsweise Gelb, wie die
   Beschriftung von links nach rechts gelesen wird und wie es in Bildbearbeitungsprogrammen
   üblich ist.

---

## Was offen bleibt

- ~~**Der Ausschnitt lässt sich nicht mit der Tastatur verschieben.**~~ **Erledigt am
  10.08.2026.** Die Vorschau-Leinwand ist eine Station in der Tabulator-Reihenfolge, sobald es
  etwas zu verschieben gibt, und die Pfeiltasten verschieben den Ausschnitt in derselben
  Richtung wie die Maus. Belege stehen oben bei Punkt 11. **Damit ist die App vollständig mit
  der Tastatur bedienbar (mit den beiden Einschränkungen unten)** — das war die einzige
  bekannte Lücke.
- **Kein Vorleseprogramm hat das Fenster geprüft.** `role="application"` auf der
  Vorschau-Leinwand ist begründet (siehe Punkt 11 oben), aber nicht mit NVDA oder der
  Windows-Sprachausgabe (Narrator) ausprobiert. Seit dem Nachtrag liest die Leinwand nach jedem
  Pfeildruck eine Positionsangabe vor (eine unsichtbare `aria-live`-Zeile); ob sich das mit
  einem echten Vorleseprogramm auch so anhört wie beabsichtigt, ist damit noch nicht geprüft.
- **Sehende Tastaturnutzer bekommen keinen sichtbaren Hinweis**, dass sich der Ausschnitt
  überhaupt mit der Tastatur verschieben lässt — man findet es nur durch Ausprobieren. Ein Satz
  in der Vorschauspalte oder ein kleines Tastensymbol wären beide vertretbar, das ist aber eine
  Gestaltungsentscheidung, die bewusst Max überlassen bleibt.
- **Der Fokusring und der Rahmen des Hauptknopfes haben dieselbe Farbe.** „In SignalRGB
  speichern" trägt von sich aus einen Rahmen in der Akzentfarbe; der Fokusring ist derselbe Ton,
  nur kräftiger und mit Abstand. Unterscheidbar, aber im ersten Moment ähnlich.
- **In SignalRGB selbst wurde nichts angesehen.** Bewusst — das ist Max' Prüfpunkt unten. Der
  Vergleich oben sagt: die exportierte Datei zeigt in einem echten Chromium dasselbe Bild wie
  die Vorschau. Ob SignalRGBs eigener Browser sich genauso verhält, ist damit nicht bewiesen,
  sondern nur sehr wahrscheinlich gemacht.
- **Die linke Spalte ist leer.** Eine Ebenenliste gehört zu Bauplan 3; im Moment steht dort nur
  die Überschrift „Ebenen". Das ist so geplant, sieht aber unfertig aus.
- **Sprache und Effektordner sind die einzigen Einstellungen.** Beide sitzen in der Fußleiste.
  Wenn mehr dazukommen, braucht es dafür einen eigenen Ort.

---

## Max' Prüfpunkt — noch offen

Die App läuft mit `npm start` im Ordner `signalforge`.

> 1. Zieh ein eigenes Bild hinein — geht das flüssig?
> 2. Verschieb den Ausschnitt mit der Maus. Fühlt sich die Richtung richtig an?
> 3. Bau einen Effekt, der dir gefällt, und exportier ihn. Sieht er in SignalRGB aus wie in der
>    Vorschau?
> 4. Und die Frage, auf die es ankommt: **Ist das angenehmer als die Kommandozeile, und würdest
>    du damit freiwillig Effekte bauen?**

**Antwort zu 1:**

**Antwort zu 2:**

**Antwort zu 3:**

**Antwort zu 4:**

*Dieser Abschnitt ist absichtlich leer. Er wird von Max ausgefüllt, von niemandem sonst. Nichts
in diesem Dokument ist eine Zustimmung von ihm — bis hier steht nur, was das Prüfprogramm
gemessen und der Umsetzer angesehen hat.*
