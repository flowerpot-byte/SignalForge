# Messung: Titelbilder für Effekte — und ein Blick auf WebP

> **Ergebnis vom 11.08.2026: die Nachbardatei-Hypothese ist BELEGT.** Max hat in SignalRGBs eigener
> Effektliste nachgesehen: `SF Probe Mit Bild` zeigte dort die magentafarbene Kachel mit dem weißen
> „SF" — genau das Bild aus `SF Probe Mit Bild.png`. Damit ist die Frage, die dieses Dokument
> gestellt hat, beantwortet; der Text darunter bleibt unverändert als Protokoll der Indizienlage
> stehen, die zu der Probe geführt hat. Was jetzt gilt, steht in Abschnitt 2 unter
> **„Belegt seit 11.08.2026"**. Die Probedateien sind wieder entfernt.

**Geprüft am:** 10.08.2026 · Rein lesend, am laufenden System von Max, ohne SignalRGB zu starten
oder zu bedienen. Kein Sondiereffekt wurde installiert; die beiden Dateien in
`C:\Users\Max\Documents\WhirlwindFX\Effects` (`MaxAmbient.html`, `SF Bergabend.html`) wurden nur
gelesen, nicht verändert.

Anlass: Abschnitt 9c, Wunsch 3 des Entwurfs — „Wie SignalRGB an das Vorschaubild kommt, ist
ungeklärt — erst messen, dann versprechen." Diese Datei ist die Messung. Als Nebenfrage (Wunsch 5
des Auftrags) wurde mitgeprüft, was sich über SignalRGBs Browsermotor und WebP-Unterstützung sagen
lässt — mit einem Fund, der die bisherige CEF-Annahme aus `erkenntnisse-signalrgb-motor.md` infrage
stellt.

**Wie gemessen wurde:** Dateisystem von Max' eigenem SignalRGB-Ordner gelesen (Installationsordner,
Cache, Log-Dateien), zwei von SignalRGB selbst mitgelieferte eingebaute Effekte im Volltext gelesen,
offizielle Entwicklerdokumentation und das SignalRGB-Forum abgefragt. Nichts davon zählt als
Ausprobieren auf dem Zielsystem — es ist Indizienlage aus echten, vorhandenen Dateien plus
Dokumentenlage. Der Unterschied zu einer echten Probe steht unten bei jedem Punkt.

---

## Kurzfassung

Die stärkste vorhandene Spur — SignalRGBs **eigene, mitgelieferte** Effekte auf Max' Rechner —
zeigt ein klares Muster: **eine PNG-Datei mit genau demselben Dateinamen wie die HTML-Datei, im
selben Ordner.** Kein `<meta>`-Tag, kein `<link>`, kein JSON-Feld in der HTML-Datei verweist darauf.
Das war am 10.08.2026 an eingebauten Effekten beobachtet, nicht an einem selbst abgelegten Effekt im
Ordner `Documents\WhirlwindFX\Effects` — dorthin reichte die Beobachtung nicht direkt, sie war
**wahrscheinlich**, nicht **belegt**. Die dafür vorgeschlagene Probe wurde durchgeführt und **hat
die Regel bestätigt** (11.08.2026, siehe Kasten oben und Abschnitt 2).

Nebenbefund, der eigentlich zur Video-/CEF-Frage aus `erkenntnisse-signalrgb-motor.md` gehört: In
zwei mitgelieferten SignalRGB-Effekten steht im Quellcode wörtlich **„Ultralight"** als Name der
Engine, mit konkreten, benannten Ultralight-Bugs. Ultralight ist kein Chromium, sondern ein
WebKit-Abkömmling. Das erklärt die widersprüchlichen Messwerte vom 09.08. (Chrome-85-Kennung,
aber `structuredClone` aus Chrome 98) besser als „eingefrorenes CEF" — ist aber selbst nicht
abschließend bewiesen. Siehe Abschnitt 4.

---

## 1. Zwei getrennte Kataloge — Marktplatz und lokaler Ordner

Bevor es um die eigentliche Frage geht: SignalRGB kennt zwei ganz verschiedene Wege, an ein
Effektbild zu kommen, und sie dürfen nicht verwechselt werden.

### 1a. Marktplatz-Effekte: ein Bild-Feld im Katalog-JSON, nichts in der HTML-Datei

`C:\Users\Max\AppData\Local\WhirlwindFX\SignalRgb\cache\catalog_en.json` (248 KB, auf Max' Rechner)
ist der heruntergeladene Katalog aller Marktplatz-Effekte („Liquid", „Lightning", „Rainbow Pulse", …).
Jeder Eintrag trägt ein eigenes Feld:

```json
"image": "https://firebasestorage.googleapis.com/v0/b/whirlwindengine.appspot.com/o/releases%2F-M0UK0pcnuXzoqaS7-48%2Fimage.png?alt=media&token=0e34f4df-88be-4cfe-a16b-202676fb49ab"
```

Das Bild liegt auf einem Firebase-Speicher, hochgeladen beim Veröffentlichen im Marktplatz, verlinkt
über die Release-ID. Die Effekt-HTML selbst (siehe `cache\effects\-M0UK0pcnuXzoqaS7-48\effect.html`
im selben Cache) enthält dazu nichts — das Bild ist reine Server-Metadatensache, nicht Teil der
Datei. **Belegt**, aber für SignalForge irrelevant: SignalForge liefert keinen Marktplatz-Upload,
sondern schreibt direkt in den lokalen Ordner.

### 1b. Lokaler Ordner (`Documents\WhirlwindFX\Effects`): Datei-Konvention, kein Server

Das ist der Weg, den SignalForge tatsächlich benutzt. Dafür ist die Marktplatz-Beobachtung kein
Beleg — sie zeigt nur, dass SignalRGB grundsätzlich Bilder zu Effekten hält, nicht wie es das für
lokal abgelegte Dateien tut. Abschnitt 2 befasst sich nur noch mit diesem Weg.

---

## 2. Der lokale Effects-Ordner: Titelbild als gleichnamige Nachbardatei

### Belegt seit 11.08.2026 — die Probe ist gelaufen

**Die Regel gilt auch für selbst abgelegte Effekte: eine PNG-Datei mit demselben Grundnamen wie die
`.html`, im selben Ordner, wird von SignalRGB als Kachelbild des Effekts angezeigt.**

Woraus das folgt — die Beweiskette, Schritt für Schritt:

1. Am 10.08.2026 wurden drei Wegwerf-Dateien in `C:\Users\Max\Documents\WhirlwindFX\Effects` gelegt
   (Protokoll: `work/titelbild-probe.md`): `SF Probe Mit Bild.html` **plus** `SF Probe Mit Bild.png`
   (512 × 288, vollflächig Magenta mit riesigem weißem „SF" — in einer Liste unverwechselbar), und
   `SF Probe Ohne Bild.html` **ohne** Bilddatei. Beide HTML-Dateien mit `bin/sfexport.js` gebaut,
   also echte SignalForge-Exporte. Die zwei vorher vorhandenen Dateien blieben unverändert
   (SHA-256-Vergleich davor/danach identisch, Hashes stehen im Protokoll).
2. Am 11.08.2026 hat **Max selbst** SignalRGB geöffnet und in dessen eigener Effektliste
   nachgesehen. Sein Befund, mit Bildschirmfoto der Liste: der Effekt `SF Probe Mit Bild` trägt dort
   die magentafarbene Kachel mit dem weißen „SF" — also genau das Bild aus der Nachbardatei, in
   einer Reihe mit den normalen Effektkacheln daneben.
3. Damit ist ausgeschlossen, was am 10.08. offen bleiben musste: dass die Bildzuordnung nur für
   SignalRGBs **eingebaute** Effekte gilt (fest verdrahtete Ressourcen-IDs im Programmcode) und der
   Ordner-Scanner für Nutzerdateien gar keine lokalen Bilder unterstützt. Das Bild kann hier aus
   nichts anderem stammen als aus der Nachbardatei: es lag ausschließlich dort, es gibt keinen
   Marktplatz-Eintrag für diesen Effekt, und in der HTML-Datei steht kein einziger Verweis darauf
   (`bin/sfexport.js` schreibt keinen).

Die Beweisart ist damit eine andere als am 10.08.: nicht mehr Indizien aus gelesenen Dateien,
sondern eine Probe mit vorher festgelegtem, eindeutig unterscheidbarem Erwartungsbild, angesehen
im echten Programm auf dem Zielsystem — dieselbe Methode wie beim Video-Test in
`erkenntnisse-signalrgb-motor.md`.

**Aufräumen:** Die drei Probedateien sind wieder entfernt; der Ordner enthält nur noch Max' eigene
Dateien (per Verzeichnisauflistung geprüft). Nichts von der Probe bleibt liegen.

**Was die Probe NICHT beantwortet hat**, und deshalb weiter offen bleibt:

- Was `SF Probe Ohne Bild` in der Liste zeigte. Max hat den bestätigenden Fall berichtet, nicht den
  Vergleichsfall; die Forumsaussage „no thumbnail, just a gradient one" bleibt also unbestätigte
  Forumsmeinung. Für den Bau ist das ohne Folgen: Was ohne Bild passiert, ist genau der Zustand,
  in dem SignalForge bis jetzt ausgeliefert hat.
- Ob ein **ausgetauschtes** Bild sofort erscheint oder erst nach einem Neustart von SignalRGB. Die
  Probedateien waren neu, nicht ersetzt. Für Max heißt das praktisch: erscheint nach einem erneuten
  Export das alte Bild, hilft ein Neustart von SignalRGB.
- Groß-/Kleinschreibung, andere Bildformate (`.jpg`, `.webp`) und die Frage, ob ein bestimmtes
  Seitenverhältnis erwartet wird. Die Probe lief mit 512 × 288 — deshalb schreibt SignalForge jetzt
  genau diese Größe (siehe Abschnitt 5), statt eine ungeprüfte zu erfinden.

### Belegt (Stand 10.08.2026, Indizienlage vor der Probe)

SignalRGB 2.5.74 ist auf Max' Rechner installiert unter
`C:\Users\Max\AppData\Local\VortxEngine\app-2.5.74\` (Registry-Eintrag
`HKLM\...\Uninstall\SignalRgb`, `InstallLocation`, `DisplayVersion 2.5.74` — deckt sich mit der
Version aus `erkenntnisse-signalrgb-motor.md`). Im Unterordner
`Signal-x64\Effects\` liegen SignalRGBs **eigene, mitgelieferte** Effekte, in zwei
Kategorie-Unterordnern:

```
Signal-x64\Effects\Dynamic\Screen Ambience.html
Signal-x64\Effects\Dynamic\Screen Ambience.png     (1280×720, 957.364 Bytes)
Signal-x64\Effects\Static\Neon Shift.html
Signal-x64\Effects\Static\Neon Shift.png           (512×288, 112.991 Bytes)
Signal-x64\Effects\Static\Rainbow.html
Signal-x64\Effects\Static\Rainbow.png              (512×288, 11.445 Bytes)
Signal-x64\Effects\Static\Side To Side.html
Signal-x64\Effects\Static\Side to Side.png         (512×288, 388.616 Bytes)
Signal-x64\Effects\Static\Solid Color.html
Signal-x64\Effects\Static\Solid Color.png          (512×288, 135.915 Bytes)
```

Jede `.html`-Datei hat eine gleichnamige `.png`-Datei daneben. Der komplette `<head>`-Bereich von
`Rainbow.html` und `Screen Ambience.html` wurde gelesen (nicht nur angerissen): beide enthalten
ausschließlich `<title>`, `<meta description>`, `<meta publisher>` und die üblichen
`<meta property="…">`-Reglerdefinitionen — **keinerlei** `<link>`, `<meta>` oder sonstiges Feld,
das auf die PNG-Datei verweist. Die Zuordnung geschieht also, wenn überhaupt, allein über den
gemeinsamen Dateinamen, nicht über einen Eintrag in der HTML.

Auffällig: Die PNGs sind **nicht** 320×200 (das Seitenverhältnis der Zeichenfläche, 8:5), sondern
durchgehend 16:9 (512×288 bzw. 1280×720). Das sind erkennbar eigens gestaltete Bilder, keine
automatischen Schnappschüsse der laufenden Zeichenfläche.

Zum Vergleich: `Documents\WhirlwindFX\Effects` — der Ordner, in den sowohl `MaxAmbient.html`
(Community-Effekt) als auch `SF Bergabend.html` (SignalForge-Export) geschrieben wurden — enthält
**nur diese zwei Dateien**, keine einzige PNG (per Verzeichnisauflistung geprüft). `MaxAmbient.html`
hat also **keine** Nachbardatei. Der Auftrag ging davon aus, dieser Effekt habe „vermutlich ein
Titelbild in seiner Liste" — das lässt sich mit reinem Lesen des Dateisystems nicht bestätigen, im
Gegenteil: **fehlt die Nachbardatei tatsächlich das entscheidende Puzzlestück, zeigt SignalRGB nach
einer Forumsaussage (siehe unten) für diesen Effekt gerade kein eigenes Bild, sondern einen
generischen Verlauf.** Das ist selbst nur eine Vermutung — siehe „Ungeklärt" unten —, aber es zeigt:
die Annahme aus dem Auftrag ist durch das, was auf der Platte liegt, nicht gedeckt.

Offizielle Entwicklerdokumentation wurde ebenfalls geprüft:
[docs.signalrgb.com/developer/lightscripts/it-s-a-webpage/](https://docs.signalrgb.com/developer/lightscripts/it-s-a-webpage/)
beschreibt `<title>`, `<meta description>`, `<meta publisher>` und `<meta property>` — **keine**
Erwähnung von Titelbildern, PNGs oder einem Bild-Meta-Tag. Auch
[docs.signalrgb.com/guides/effects-customization/how-to-customize-effects/](https://docs.signalrgb.com/guides/effects-customization/how-to-customize-effects/)
und die Entwickler-Übersichtsseite behandeln das Thema nicht. **Belegt ist also auch: die offizielle
Dokumentation schweigt zu Titelbildern vollständig** — weder bestätigt noch widerlegt sie die
Namenskonvention.

### Wahrscheinlich

Mehrere voneinander unabhängige, nicht-offizielle Quellen beschreiben denselben Ablauf für
heruntergeladene Community-Effekte: „Custom effects go in
`%userprofile%\Documents\WhirlwindFX\Effects\`. Both the `.html` file and its `.png` preview go
directly into that folder." Das deckt sich mit dem, was auf Max' Rechner in SignalRGBs eigenem
Installationsordner liegt (Abschnitt „Belegt" oben). Keine dieser Quellen nennt aber ausdrücklich
die Regel „gleicher Dateiname" — das ist eine Schlussfolgerung aus dem Beispiel, keine zitierte
Aussage.

Ein Forumsbeitrag im offiziellen SignalRGB-Forum
([forum.signalrgb.com/t/how-to-test-use-ligthscripts-stored-in-effects-directory/2337](https://forum.signalrgb.com/t/how-to-test-use-ligthscripts-stored-in-effects-directory/2337),
als Forumsmeinung markiert, nicht als offizielle Doku) sagt zu einer selbst abgelegten HTML-Datei
ohne Bild: „It won't have a thumbnail, just a gradient one" (mit Screenshot eines generischen
Verlaufs). Das stützt die Vermutung, dass SignalRGB pro Effekt nach *etwas* Bildhaftem sucht und bei
Fehlen einen Platzhalter zeigt — passt zur Nachbardatei-Hypothese, beweist aber nicht, dass
ausgerechnet der Dateiname der Schlüssel ist (es könnte z. B. auch am fehlenden Marktplatz-Eintrag
liegen, unabhängig vom Dateinamen).

### Ungeklärt (Stand 10.08.2026 — der erste Absatz ist seit 11.08.2026 erledigt)

**Die entscheidende Lücke:** Alle harten Belege stammen aus SignalRGBs eigenen, fest eingebauten
Effekten (`Signal-x64\Effects\...`) — nicht aus dem vom Nutzer gefüllten Ordner
`Documents\WhirlwindFX\Effects`, in den SignalForge tatsächlich schreibt. Es ist denkbar, dass die
eingebauten Effekte über eine andere, festverdrahtete Zuordnung laufen (z. B. Ressourcen-IDs im
Programmcode) und der Ordner-Scanner für nutzereigene Dateien etwas ganz anderes tut oder gar keine
lokalen Bilder unterstützt. Reines Lesen kann diesen Unterschied nicht auflösen.

Ebenfalls offen:

- Ob Groß-/Kleinschreibung beim Dateinamen eine Rolle spielt (`Side To Side.html` vs.
  `Side to Side.png` — unter Windows durch Case-Insensitivität irrelevant, wäre aber auf einem
  anderen System ein Unterschied; SignalRGB läuft laut Entwurf ohnehin nur unter Windows).
- Ob andere Bildformate (`.jpg`, `.webp`) als Nachbardatei ebenso funktionieren wie `.png` — alle
  gefundenen Beispiele sind ausschließlich PNG.
- Ob ein bestimmtes Seitenverhältnis oder eine Mindest-/Höchstgröße erwartet wird, oder ob
  SignalRGB jedes Bild einfach in die Kachel einpasst.
- Ob ein neu hinzugefügtes oder ausgetauschtes Bild sofort erscheint (wie bei der HTML-Datei selbst,
  siehe `erkenntnisse-signalrgb-motor.md`) oder ob dafür ein Neustart nötig ist, wie es der oben
  zitierte Forumsbeitrag für die HTML-Erkennung behauptet — was Max' eigener, bereits dokumentierter
  Messung widerspricht. Dieser Widerspruch wurde nicht aufgelöst, weil er zur Bild-Frage nichts
  beiträgt und die HTML-Frage bereits von Max selbst gemessen und in `erkenntnisse-signalrgb-motor.md`
  festgehalten ist.
- Ob überhaupt ein generischer Verlauf angezeigt wird, wenn ein Bild fehlt, oder etwas anderes (die
  einzige Quelle dafür ist der eine Forumsbeitrag).

**Probe, die das klären würde** (ausgeführt; Ergebnis oben unter „Belegt seit 11.08.2026"):

Zwei Wegwerf-Dateipaare kurz in `Documents\WhirlwindFX\Effects` legen, in SignalRGBs Effektliste
nachsehen, danach sofort wieder löschen:

1. Eine winzige HTML-Kopie von `SF Bergabend.html` unter neuem Namen (z. B. `ZZ Probe A.html`) samt
   `ZZ Probe A.png` — ein auffällig eingefärbtes, klar wiedererkennbares Testbild (z. B. reines
   Magenta mit einem großen weißen „A").
2. Dieselbe HTML-Kopie unter `ZZ Probe B.html`, **ohne** Bilddatei daneben.

Danach in SignalRGBs eigener Effektliste nachsehen: zeigt Probe A das Magenta-Bild als Kachel und
Probe B einen generischen Verlauf (oder etwas anderes)? Das beantwortet die Frage direkt und
zerstört nichts — beide Dateien werden danach sofort wieder entfernt, genau wie bei den
Wegwerf-Effekten aus dem Video-Test. Diese Probe wurde **nicht** durchgeführt, weil das Aufgabenlimit
für diese Messung ausdrücklich keinen Sondiereffekt und keine Bedienung von SignalRGB erlaubt,
solange Max wach am Rechner ist und nicht ausdrücklich zugestimmt hat.

**Nachtrag 10.08.2026:** Max hat diese eine Probe ausdrücklich freigegeben. Drei Dateien liegen
jetzt in `Documents\WhirlwindFX\Effects` — `SF Probe Mit Bild.html` + `SF Probe Mit Bild.png`
(512×288, magentafarben mit großem weißem „SF") und `SF Probe Ohne Bild.html` ohne Bilddatei —,
beide mit `bin/sfexport.js` gebaut. SignalRGB wurde dabei nicht gestartet oder bedient; die beiden
vorhandenen Dateien (`MaxAmbient.html`, `SF Bergabend.html`) sind unverändert (Hash-Vergleich
davor/danach identisch). Die Probe wartete auf Max' Blick in SignalRGBs eigene Effektliste — Details
in `work/titelbild-probe.md`.

**Nachtrag 11.08.2026:** Max hat nachgesehen. Die magentafarbene „SF"-Kachel stand in seiner echten
Effektliste; die Nachbardatei-Hypothese ist damit **bestätigt** (ausführlich oben unter „Belegt seit
11.08.2026"). Die drei Probedateien wurden danach wieder entfernt.

---

## 3. Nebenbefund: Ultralight statt (oder neben) CEF

### Belegt

`erkenntnisse-signalrgb-motor.md` schließt aus dem Prozessbaum (`CefSharp.BrowserSubprocess`) und
der User-Agent-Zeichenkette auf „Chromium, eingebettet über CEF" mit eingefrorener Versionsangabe.
Beim Lesen der beiden mitgelieferten Effekte aus Abschnitt 2 fanden sich zwei wörtliche,
unabhängige Erwähnungen einer ganz anderen Engine, direkt im Quellcode von SignalRGBs eigenen
Effekten:

```js
// Rainbow.html, Zeile 38
// Using ctx.fillRect on Ultralight is causing significant (250x) increases in frame render time
// after the height goes above 100.
```

```js
// Screen Ambience.html, Zeile 118
// blur(0px) causes a black-screen compositing bug in Ultralight — omit it entirely at zero.
```

Beide Kommentare stammen von SignalRGBs eigenen Entwicklern, in Effekten, die über denselben
Mechanismus laufen wie jeder selbst abgelegte. **Ultralight ist kein Chromium**, sondern ein
eigenständiger, GPU-beschleunigter HTML-Renderer auf WebKit-Basis (Hersteller-Angabe auf
[ultralig.ht](https://ultralig.ht/): „Ultra-portable WebKit fork", Kernversion „WebKit
615.1.18.100.1" — Herstellerseite, keine SignalRGB-eigene Aussage).

Im Installationsordner (`Signal-x64\`) liegen tatsächlich **beide** Engine-Familien nebeneinander:

| Datei | Was sie ist | Version (Dateimetadaten) |
|---|---|---|
| `Qt6WebEngineCore.dll`, `QtWebEngineProcess.exe` | Qt WebEngine (Chromium-basiert) | **6.8.1.0**, belegt über `Get-Item ... VersionInfo` |
| `Ultralight.dll`, `UltralightCore.dll`, `WebCore.dll` | Ultralight (WebKit-basiert) | keine Versionsangabe in den Dateimetadaten (leer) |
| `webp.dll` | WebP-Bibliothek, liegt direkt neben `WebCore.dll` | keine Versionsangabe |

Offizielle SignalRGB-Changelogs (docs.signalrgb.com/changelogs/) erwähnen „Ultralight" mehrfach als
benannte Komponente, in Zusammenhang mit dem Effekt-Rendering selbst, nicht nur mit
LCD-Bildschirmen:

- Version 2.5.55: „Fixed multiple crash scenarios in the Ultralight LCD renderer (double free, null
  pointer, exit-time destruction order)."
- Version 2.5.39: „Fixed multiple memory leaks in WMI, HID handle fetching, and UltraLight string
  allocations", im selben Eintrag wie „Fixed memory leaks in CanvasEffect class" — `CanvasEffect`
  ist erkennbar die Klasse, die die 320×200-Zeichenfläche jedes Effekts betreibt, nicht nur ein
  LCD-Panel.

### Wahrscheinlich

Die widersprüchlichen Messwerte vom 09.08. — User-Agent behauptet Chrome 85 (2020), gleichzeitig
ist `structuredClone` vorhanden (erst ab Chrome 98) — passen zu einem bekannten Verhalten von
Ultralight: Es gibt sich standardmäßig als aktuelles Chrome aus, um mit Webseiten kompatibel zu
bleiben, die auf „Chrome" im User-Agent prüfen, obwohl der eigentliche Motor WebKit ist und ein
eigenes, davon unabhängiges JavaScript-Engine-Versionsschema hat. Das erklärt den Widerspruch
schlüssiger als „eingefrorene CEF-Kennung" — ist aber eine Interpretation, kein Beweis: Es wurde
nicht geprüft, ob Ultralight tatsächlich diesen konkreten User-Agent-String verwendet, nur dass es
generell so etwas tut (Herstelleraussage, nicht SignalRGB-spezifisch).

Am wahrscheinlichsten: SignalRGB benutzt **beide** Engines, für verschiedene Aufgaben. Qt WebEngine
(Chromium) vermutlich für Teile der eigenen Oberfläche oder den Marktplatz-Browser, Ultralight für
die Effekt-Zeichenfläche selbst (`CanvasEffect`). Das würde beide Messungen — den CEF-Prozess im
Baum und die Ultralight-Kommentare im Effekt-Code — gleichzeitig wahr sein lassen, ohne dass eine
der beiden Beobachtungen falsch war.

### Ungeklärt

Ob **tatsächlich Ultralight** die Zeichenfläche rendert, auf der SignalForges Effekte laufen (statt
z. B. eines von mehreren möglichen eingebetteten Browsern, je nach Effekttyp oder SignalRGB-Version),
ist mit reinem Lesen nicht zu beweisen — nur sehr wahrscheinlich zu machen. Der bisherige
Motorcheck (`tools/motorcheck/`) hat nie danach gefragt, weil die Frage bis jetzt nicht gestellt
wurde. Das ist die wichtigste Korrektur, die aus dieser Messung an das Projekt zurückgeht: **der
nächste Durchlauf des Motorchecks sollte `navigator.userAgent` protokollieren, dazu gezielt nach
Ultralight-typischen Eigenheiten fragen** (z. B. das oben zitierte `blur(0px)`-Verhalten), um CEF
und Ultralight sauber zu unterscheiden. Das ist eine Beobachtung für den Bau, keine Entscheidung, die
hier getroffen wird.

---

## 4. Die WebP-Frage

### Belegt

Nichts direkt — wie im Auftrag vermutet. `erkenntnisse-signalrgb-motor.md` hat WebP nie gegen den
tatsächlichen Effekt-Renderer geprüft, nur die JPEG-Ersparnis gemessen.

### Wahrscheinlich

Eine `webp.dll` liegt **direkt neben** `WebCore.dll` und `Ultralight.dll` im selben
Installationsordner (`Signal-x64\`) — nicht in einem für Qt reservierten Unterordner. Das ist ein
Indiz, aber kein Beweis: Bibliotheken, die nebeneinanderliegen, müssen nicht miteinander verdrahtet
sein. Zusätzlich liegt in `Signal-x64\imageformats\qwebp.dll` Qts eigenes WebP-Bildformat-Plugin —
das gehört aber nachweislich zu Qt (der Ordnername `imageformats` ist Qt-Konvention für
Bild-Plugins) und damit eher zur Chromium-Seite (Qt WebEngine/Qt-Oberfläche) als zu Ultralight. Für
die Frage „kann ein per `data:`-URI eingebettetes WebP-Bild in einer laufenden Effekt-Zeichenfläche
dekodiert werden" sagt das wenig, weil genau unklar ist, welche der beiden Engines diese
Zeichenfläche überhaupt bedient (siehe Abschnitt 3).

Der Ultralight-Hersteller wirbt allgemein mit „modern web spec" und nennt in aktuellen Versionen
WebP-Unterstützung — das ist eine Herstelleraussage zu Ultralight im Allgemeinen, keine Aussage
darüber, welche Ultralight-Version SignalRGB 2.5.74 tatsächlich einbettet oder ob deren
Bild-Decoder-Konfiguration WebP einschließt.

### Ungeklärt

Ob ein `data:image/webp;base64,...`-Bild, per `new Image()` in einem SignalRGB-Effekt geladen und
auf die Zeichenfläche gezeichnet, tatsächlich erscheint. Das ist exakt dieselbe Art Frage wie die
Video-Frage, die bereits mit einem Wegwerf-Effekt beantwortet wurde — und braucht dieselbe Methode.

**Probe, die das klären würde** (nicht ausgeführt — Vorschlag zur Freigabe):

Ein einziger Wegwerf-Effekt, nach dem Muster der vier Test-Effekte aus
`erkenntnisse-signalrgb-motor.md`:

1. Ein kleines, eindeutig erkennbares Testbild als WebP kodieren (z. B. eine grüne Fläche mit
   einem roten „X").
2. Als `data:image/webp;base64,...` in eine `<img>`/`new Image()`-Ladefolge einbetten, `onload` und
   `onerror` **beide** mit sichtbaren, voneinander unabhängigen Lebenszeichen auf der
   320×200-Zeichenfläche versehen (Merksatz aus derselben Datei: ein Fehlerzustand, der aussieht
   wie „nichts läuft", misst nichts) — z. B. links ein wandernder Balken als Beweis, dass das
   Skript überhaupt läuft, und rechts entweder das dekodierte Bild (Erfolg) oder ein rotes Feld mit
   Text „WEBP FAILED" (Fehlschlag), zusätzlich beides in SignalRGBs eigene Konsole geloggt.
3. Gleichzeitig `navigator.userAgent` und das `blur(0px)`-Verhalten aus Abschnitt 3 mitprotokollieren,
   um WebP-Frage und Engine-Frage in einem einzigen Wegwerf-Effekt zu beantworten statt in zweien.

Nicht ausgeführt, aus demselben Grund wie Probe A: Das Aufgabenlimit dieser Messung erlaubt keinen
Sondiereffekt und keine Bedienung von SignalRGB ohne Max' ausdrückliche Zustimmung.

---

## 5. Folge für den Bau — umgesetzt am 11.08.2026

**Was jetzt gebaut ist** (die Vorhersage darunter ist von 10.08. und stimmte im Wesentlichen):

- Jeder Export schreibt zwei Dateien: `<Name>.html` und `<Name>.png`, beide aus **demselben**
  bereinigten Grundnamen gebildet (`src/main/export-effect.js`) — ein umbenannter Effekt erzeugt
  also ein neues **Paar** und nie eine neue HTML neben dem alten Bild.
- **Welches Bild:** Bild 0 (t = 0) genau dieses Dokuments, gezeichnet vom echten Motor
  (`dist/engine.bundle.js`, derselbe, der die Vorschau, die Galeriekacheln und den fertigen Effekt
  antreibt). Kein gemaltes Symbol, keine zweite Zeichenroutine — die Kachel kann also nicht zeigen,
  was der Effekt nicht tut. t = 0 ist bei einer Bewegung die ehrliche Wahl: es ist das Bild, mit dem
  der Effekt tatsächlich anfängt, statt eines später herausgesuchten, schmeichelhafteren.
- **Größe:** 512 × 288, genau die Größe aus dieser Messung und aus der bestätigten Probe. Gezeichnet
  wird bei den echten 320 × 200 der Zeichenfläche und dann auf Kachelgröße vergrößert — größer
  zeichnen ginge nicht, ohne zu lügen, weil der Abschlussdurchgang des Motors (`applyFinish`)
  die Bildpunkte fest mit 320 × 200 zurückliest. Weil 8:5 nicht 16:9 ist, wird mittig
  **beschnitten** (volle Breite, die mittleren 90 % der Höhe) statt mit schwarzen Balken
  eingepasst: Balken sähen aus wie ein Symbol in einer Kachel, und SignalRGBs eigene Kacheln sind
  randlos. Alle vier Ecken sind deshalb deckend.
- **Wo gezeichnet wird:** im Hauptprozess, in einem Fenster, das nie sichtbar wird
  (`src/main/cover-image.js`) — innerhalb von Electron direkt, außerhalb (Kommandozeile) über einen
  gestarteten zweiten Electron, genau wie beim Bild-Import. Der Renderer schickt **keine** Bilddaten
  und erst recht keinen Pfad: Dateinamen vergibt weiterhin nur der Hauptprozess.
- **Wenn das Bild nicht entsteht** (kein Electron, Fenster lässt sich nicht öffnen, Schreibfehler):
  Der Effekt wird trotzdem geschrieben, und es steht als Meldung im Fenster bzw. auf der
  Kommandozeile, warum es kein Titelbild gibt. Lieber ein Effekt ohne Kachel als kein Effekt.

Belegt ist das nicht durch Zusehen, sondern durch Messen: `test/main/cover-image.test.js` exportiert
einen Bild- und einen Verlaufseffekt, liest die geschriebenen PNGs zurück und vergleicht sie
punktweise mit dem, was der Motor für das im Effekt eingebettete Dokument bei t = 0 zeichnet
(Abweichung 0,0 von 255) — und zusätzlich mit dem Bild des **anderen** Effekts, das deutlich
abweichen muss (63 von 255), damit ein schwarzes oder immer gleiches Bild den Test nicht bestehen
kann.

### Die Vorhersage vom 10.08.2026 (unverändert stehen gelassen)

Unabhängig vom Ausgang der Probe aus Abschnitt 2 lässt sich schon jetzt sagen, **was** eine
Umsetzung anfassen müsste, falls die Nachbardatei-Hypothese sich bestätigt — und was sie am
Kernversprechen des Projekts kostet.

- **`src/export/build-effect.js`** (`buildEffectHtml()`, Zeilen 106–152) baut ausschließlich die
  HTML-Zeichenkette und schreibt nichts auf die Platte — das bleibt so. Ein Titelbild als
  Nachbardatei ist reine Dateisystem-Arbeit und gehört damit nicht hierher; die Engine-Grenze aus
  Abschnitt 3 der Spezifikation (kein Node, keine Uhr, kein Zufall in `engine/`) bleibt unberührt,
  solange die neue Logik in `src/main/` bleibt.
- **`src/main/export-effect.js`** (`exportEffect()`, Zeilen 90–126) schreibt heute genau **eine**
  Datei: `io.writeFile(path, html)` (Zeile 124), wo `path` aus dem sanitierten `fileName` gebildet
  wird (Zeile 109: `` `${fileName}.${EFFECT_EXTENSION}` ``). Für ein Titelbild nach dem beobachteten
  Muster bräuchte es einen zweiten Schreibvorgang mit demselben `fileName`, anderer Endung:
  `join(folder, `${fileName}.png`)`. Die Bilddaten selbst hat `export-effect.js` nicht — die Datei
  ist reiner Hauptprozess-Code ohne Zeichenfläche. Sie müssten vom Renderer mitgeliefert werden
  (dort existiert die Live-Vorschau bereits als Canvas), genau wie `doc` und `engineSource` heute
  schon als Parameter hereinkommen.
- Die vorhandene Überschreib-Prüfung (`io.exists(path) && !force`, Zeile 113) prüft nur den
  `.html`-Pfad. Mit einer zweiten Datei entstünde ein neuer Randfall: Was, wenn nur die `.png`
  bereits existiert (z. B. Rest eines vorigen Exports mit anderem Bild), die `.html` aber nicht?
  Das ist eine Entwurfsfrage, keine hier beantwortete.
- Zur Bildquelle: Weder aus SignalRGBs eigenen Beispielen noch aus der Dokumentation lässt sich ein
  festes Seitenverhältnis ableiten (Abschnitt 2 fand 16:9 bei allen fünf mitgelieferten Effekten,
  während die Zeichenfläche selbst 8:5 ist) — die App müsste also entweder das Seitenverhältnis der
  Zeichenfläche beibehalten (320×200 als PNG) oder gezielt auf ein anderes Format zuschneiden, ohne
  dass belegt ist, ob SignalRGB darauf überhaupt empfindlich reagiert.

**Kostet das die Ein-Datei-Eigenschaft?** Ja, konkret: Ein Export mit Titelbild würde zwei Dateien
in den Effektordner schreiben statt einer (`SF Bergabend.html` und `SF Bergabend.png`), nicht mehr
eine einzige in sich geschlossene Datei. Der Effekt selbst bliebe davon unberührt — er lädt die PNG
zur Laufzeit nicht nach, denn (das ist der Punkt aus dem Auftrag, der hier bewusst nicht vermischt
wird) SignalRGBs Katalog-Anzeige liest die Nachbardatei mutmaßlich mit seinem eigenen,
systemnahen Datei-Scanner, **bevor** der Effekt überhaupt als Webseite geladen wird — das ist ein
anderer Vorgang als der in `erkenntnisse-signalrgb-motor.md` gemessene, gescheiterte
`fetch()`/`XMLHttpRequest`-Zugriff **aus dem laufenden Effekt heraus** auf eine Nachbardatei, der an
SignalRGBs eigener HTTPS-Herkunft (`signalrgbmarketplace.pages.dev`) scheitert. Der Effekt selbst
bräuchte die PNG nie zu lesen; nur SignalRGBs Listenansicht täte es, mutmaßlich mit normalen
Windows-Dateisystemzugriffen statt über eine abgeschottete Webseite. Ob genau das zutrifft, ist Teil
dessen, was die Probe aus Abschnitt 2 zeigen würde — hier steht nur, warum die beiden Befunde sich
nicht widersprechen müssen.

Ob eine zusätzliche Datei pro Export hingenommen wird, ist eine Entscheidung für Max, keine, die
diese Messung trifft.

---

## Quellen

**Dateien auf diesem Rechner (belegt):**

- `C:\Users\Max\Documents\WhirlwindFX\Effects\MaxAmbient.html` (gelesen, nicht verändert)
- `C:\Users\Max\Documents\WhirlwindFX\Effects\SF Bergabend.html` (gelesen, nicht verändert)
- `C:\Users\Max\AppData\Local\WhirlwindFX\SignalRgb\cache\catalog_en.json`
- `C:\Users\Max\AppData\Local\VortxEngine\app-2.5.74\Signal-x64\Effects\Dynamic\Screen Ambience.html` / `.png`
- `C:\Users\Max\AppData\Local\VortxEngine\app-2.5.74\Signal-x64\Effects\Static\Rainbow.html` / `.png`
- `C:\Users\Max\AppData\Local\VortxEngine\app-2.5.74\Signal-x64\Effects\Static\Neon Shift.html` / `.png`
- `C:\Users\Max\AppData\Local\VortxEngine\app-2.5.74\Signal-x64\Effects\Static\Side To Side.html` / `Side to Side.png`
- `C:\Users\Max\AppData\Local\VortxEngine\app-2.5.74\Signal-x64\Effects\Static\Solid Color.html` / `.png`
- `C:\Users\Max\AppData\Local\VortxEngine\app-2.5.74\Signal-x64\Qt6WebEngineCore.dll`, `QtWebEngineProcess.exe`, `Ultralight.dll`, `UltralightCore.dll`, `WebCore.dll`, `webp.dll`, `imageformats\qwebp.dll`
- Registry `HKLM\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\SignalRgb`

**Offizielle Dokumentation:**

- [docs.signalrgb.com/developer/lightscripts/it-s-a-webpage/](https://docs.signalrgb.com/developer/lightscripts/it-s-a-webpage/) — keine Erwähnung von Titelbildern
- [docs.signalrgb.com/guides/effects-customization/how-to-customize-effects/](https://docs.signalrgb.com/guides/effects-customization/how-to-customize-effects/) — keine Erwähnung von Titelbildern
- [docs.signalrgb.com/changelogs/](https://docs.signalrgb.com/changelogs/) — Versionen 2.5.55, 2.5.50, 2.5.39: „Ultralight" als benannte Komponente, u. a. zusammen mit „CanvasEffect class"

**Forum / Community (ausdrücklich als solche markiert, nicht offiziell):**

- [forum.signalrgb.com/t/how-to-test-use-ligthscripts-stored-in-effects-directory/2337](https://forum.signalrgb.com/t/how-to-test-use-ligthscripts-stored-in-effects-directory/2337) — „no thumbnail, just a gradient one"
- Diverse Community-Repos und Showcases (GitHub `stronk-dev/SignalRGB_Effects`, `effectbuilder.github.io/showcase.html`, `srgbmods.net/effectcreator/`) — allgemeine Beschreibung „`.html` + `.png` in denselben Ordner", keine der Quellen belegt die genaue Namensregel wörtlich

**Herstellerseite eines Drittanbieters (nicht SignalRGB-spezifisch):**

- [ultralig.ht](https://ultralig.ht/) — Ultralight als „ultra-portable WebKit fork", Kernversion „WebKit 615.1.18.100.1"

**Projekt-eigene Dateien (Referenz, nicht verändert):**

- `docs/erkenntnisse-signalrgb-motor.md` (Ausgangsbefund CEF, Video-Test-Methode als Vorbild für die
  vorgeschlagenen Proben)
- `docs/entwurf-2026-08-09.md`, Abschnitt 9c, Wunsch 3
- `src/export/build-effect.js`
- `src/main/export-effect.js`
