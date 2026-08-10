# Gemessen an SignalRGBs eigener Oberflaeche

Grundlage ist ein echter Bildschirmfoto-Ausschnitt aus SignalRGBs eigener
Anleitung: der Bildschirm "Customize" mit dem Effekt *Rain*, 1568 x 1065
Bildpunkte, unskaliert.

Alle Werte unten sind **abgelesen, nicht geschaetzt**. Gelesen wurde mit
`nativeImage.toBitmap()` aus Electron, also Bildpunkt fuer Bildpunkt aus der
Datei. Wo mehrere Messpunkte angegeben sind, kam an jedem derselbe Wert heraus.

## Farben

| Was | Wert | Wo gemessen (x, y) |
| --- | --- | --- |
| Seite / Buehne / rechte Spalte | `#060b11` | 700,25 · 1230,780 · 210,780 · 1400,30 |
| Linke Spalte | `#0f1620` | 100,600 · 100,900 · 10,10 |
| Karte in der rechten Spalte | `#212d3a` | 1320,620 · 1400,700 · 1400,306 |
| Aktiver Eintrag links (Pille) | `#272d36` | Zeile y=177, x=12..190 |
| Vertiefung in einer Karte (Zahl) | `#18212b` | 1490..1525, 530..550 |
| Umschalter oben rechts | `#3a4e60` | 1300..1380, 50..70 |
| Kraeftige Schrift | `#f8f8ff` | hellster Punkt in fuenf Textlaeufen |
| Ruhige Schrift (Kartennamen) | `#a3c5d6` | "Speed", "Drop Size", "Effect Presets" |
| Leiseste Schrift | `#7d98a6` | "Save and load Effect settings" |
| Akzent | `#ff0066` | 1450,245 · 1400,279 |
| Regler, gefuellter Teil (neutral) | `#97b3c9` | 1330,570 |
| Regler, leerer Teil | `#485969` | 1490,570 |
| Trennlinie | `#212d3a` | 200,600 (rechte Kante der linken Spalte) |

Bemerkenswert und beim blossen Hinsehen falsch geraten:

* Die **linke Spalte ist heller als die Buehne**, nicht dunkler.
* Die **Karten haben keinen Rand.** Ein Abtasten quer ueber die linke Kante
  einer Karte (Zeile y=620) geht in einem einzigen Bildpunkt von `#060b11` auf
  `#212d3a` — kein Zwischenwert, keine Haarlinie. Karten werden allein durch
  ihre Fuellung und eine Luecke voneinander getrennt.
* Der aktive Eintrag links ist **neutral grau**, nicht im Akzent eingefaerbt.
* SignalRGB benutzt **zwei** Reglerfuellungen: allgemeine Regler (Speed, Drop
  Size) hellneutral, **Farbregler** (Saturation, Brightness) im Akzent.

## Masse

| Was | Wert | Wie gemessen |
| --- | --- | --- |
| Breite der linken Spalte | 200 px | Trennlinie bei x=200 |
| Breite der rechten Spalte | ~300 px | Karten 1268..1556 bei 1568 Fensterbreite, 12 px Rand |
| Luecke zwischen zwei Karten | 8 px | Spalte x=1400: y=508..515 sind Seitenfarbe |
| Eckenradius einer Karte | ~6 px | Kurve laeuft ueber 5 Zeilen von +7 auf +2 |
| Eckenradius der Pille links | ~8 px | Kurve laeuft ueber 8 Zeilen von +10 auf +2 |
| Hoehe einer Reglerbahn | 4 px | Spalte x=1310: y=568..571 |

## Was daraus im Fenster wurde

Die Werte stehen jetzt in `app/renderer/styles/tokens.css`, jeder mit dem
Messpunkt daneben. Der frueher benutzte Radius von 14 px, die Milchglas-Flaechen
(`backdrop-filter`), der eingefaerbte Hintergrund und der Schein unter dem Bild
sind ersatzlos weg — nichts davon kommt in der Vorlage vor.

Uebernommen wurde auch die Regel mit den zwei Reglerfuellungen: die
Bewegungsregler (Tempo, Staerke) fuellen neutral, die vier Farbregler fuellen im
Akzent. Das passt genau auf diese App und ist der Grund, warum der Akzent nicht
sechsmal untereinander steht.
