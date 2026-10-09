# Acid

Acid Milkdrop: Musik-Visualizer fuers iPhone. Laeuft im Browser (Safari oder als
Home-Bildschirm-App), nichts wird hochgeladen: https://inkognito420.github.io/Acid/

Eigene Tracks laden, Takt und Abschnitte werden vorab erkannt (Scan), Milkdrop
(Butterchurn) und eigene Shader reagieren auf Kick, Mitten und Hi-Hats.

## Dateien

- `index.html` - nur noch das Geruest: Leiste, Menue, Knoepfe und die Liste der Programmteile
- `style.css` - Aussehen (Farben, Leiste, Menue)
- `js/analyse.js` - Track-Analyse (Tempo, Takt, Abschnitte, Klangbild, Klangmesser), reine Rechenfunktionen
- `js/01-grundlagen.js` bis `js/16-start.js` - das Programm in 16 Teilen, in dieser Reihenfolge geladen:
  01 Grundlagen (Start, Audio-Weg, Protokoll, Zustand) · 02 Instrumente hoeren ·
  03 Eigene Shader · 04 Bildschirm (Groesse, Farbe) · 05 Presets vermessen ·
  06 Mitschrift · 07 Sichern/Laden · 08 Auswahl (Lastbremse, Preset-Auswahl, Wechsel) ·
  09 Schleife (60 fps, Waechter) · 10 Bedienung (Schalter, Automatik-Karte, Auto-Pegel) ·
  11 Ton-Sicherheit · 12 Erkennung (live und Scan) · 12b Mischpult (Koerper & Funken) · 13 Effekte und Gesten ·
  14 Track-Scan · 15 Tracks und Mikro · 16 Start
  Alle Teile teilen sich einen gemeinsamen Bereich; jeder Teil prueft am Anfang, ob der
  vorige fertig ist (`window.__AM_STEP`), sonst startet er nicht.
  Nach jeder Aenderung die Zahl `?b=` in index.html hochzaehlen (= Build), damit das
  Handy keine alten Teile aus dem Zwischenspeicher nimmt.
- `acid-shader.js` - eigene Shader (WebGL) und der Player dafuer
- `acid-profile.js`, `acid-presets.js` - vermessene Milkdrop-Presets, eigene Presets
- `adaptive-preset-blender.js`, `audio-reactive-controller.js` - Presets mischen, Reaktion
- `shader-test.html` - Testseite fuer die eigenen Shader (Messlauf)
- `acid-bild-*.jpg` - Bilder fuer die Bild-Presets

Syntax pruefen: `for f in js/*.js; do node --check $f; done`

## Track-Flug (ab Build 36, seit Build 38 aus)

Eigener Shader (`flug-track` in `acid-shader.js`): Der Scan eines Tracks wird als
Tunnel gezeichnet, in dem man auf der Zeitachse nach vorne fliegt. Die naechsten
Takte sind schon zu sehen: Kicks als Rahmen, Hi-Hats als Punkte an der Wand, Mitten
als Boegen, Abschnittsgrenzen als Ringe, der Drop als Tor.

- Automatisch: 12 Takte vor einem Drop bis 8 Takte danach (Schalter "Track-Flug bei
  Drops" in der Werkstatt, Standard aus).
- Knopf "Flug": seit Build 38 ausgeblendet (hielt die Automatik an). Nur noch ueber die Werkstatt einschaltbar.
- Texturformat (Einheit 3): 4 Schritte pro Schlag, R Kick, G Hi-Hat, B Mitten,
  A Abschnitt (siehe `AcidShaderPlayer.buildTrack`).
- Debug: Seite mit `?debug` oeffnen, dann `window.__FLUG`.

## Klangmesser (ab Build 43)

Messwerte pro Takt, im Scan berechnet (`kmSetup`, `kmFrame`, `kmChroma`, `kmBars` in `js/analyse.js`, Ergebnis `A.km`).
Rechenwege und Skalen stammen aus dem eigenständigen Klangmesser, laufen hier aber auf dem Raster des Scans
(Tempo auf 0,01 BPM, echte Takt-Eins) und im selben Durchlauf wie der Scan (keine zweite Dekodierung).

| Wert | Bedeutung | Wirkung im Visualizer |
| --- | --- | --- |
| Druck | Lautstärke und Bass | Bildwahl: Helligkeit |
| Hektik | 8tel/16tel/32tel-Puls in Mitten und Höhen | Bildwahl: Bewegung, Funken-Menge |
| Schärfe | Klangschwerpunkt, Rauschigkeit | Bildwahl: Sättigung |
| Spannung | Takt gegen die 8 davor (0,5 = neutral) | Stärke des Kick-Pulses (0,7 bis 1,3) |
| Filter | Schwanken des Klangschwerpunkts im Takt | Acid-Farbe (0,6 bis 1,4), Bildwahl: Acid-Grün |
| Ton | stärkster der 12 Töne (ab 100 Hz) | Farbsprung beim Tonwechsel (30° pro Halbton) |

- Druck, Hektik, Schärfe und Filter werden für die Bildwahl auf den Track selbst bezogen (`K.lo`/`K.hi`, 10- bis 90-%-Wert der vollen Takte), Spannung bleibt absolut.
- Ohne Scan (Mikro, langer Mix) fehlen die Werte, alles läuft dann wie vorher.
- Fehler im Klangmesser stoppen den Scan nicht: `A.kmErr`, Protokollzeile „Klangmesser fehlgeschlagen“.
- Protokoll nach dem Scan: „Klangmesser (… ms): Druck … · Hektik … · Grundton …“. Die Stimmungszeile zeigt zusätzlich Puls und Grundton.
- Test ohne Browser: Rechenfunktionen laufen in Node (`vm.runInThisContext` auf `js/analyse.js`), z. B. mit einem künstlichen Track.

## Mischpult „Koerper & Funken“ (ab Build 46)

`js/12b-mischpult.js`. Zwei Arten von Reaktion, an einer Stelle gemischt:

- **Koerper** (alles, was sich bewegt): Zoom, Drehen, Schwanken als Federn. Die Zoom-Feder ist auf das
  Tempo gestimmt (eine Schwingung pro Schlag): rein auf dem Kick, zurueck zum Offbeat. Mit Scan kommt der
  Stoss so frueh, dass die Spitze genau auf dem Kick liegt. Drehen folgt der 303-Filterfahrt (eine
  Schwingung pro Takt), Schwanken geht auf der Takt-Eins links/rechts (eine pro zwei Takte).
- **Funken** (alles, was auftaucht): Funken und Ringe kosten Energie aus einem Konto. Pro Schlag kommt
  Energie dazu (Drop viel, Break wenig). Vor dem Drop wird angespart (in 8 Takten fast voll), im Drop
  geht alles auf einmal raus (Funken und Blitz je nach Kontostand).
- **Sidechain / Unruhe-Budget**: Der Kick drueckt Drehen und Schwanken kurz weg, grosse Funken druecken
  den Koerper weg, ein stark schwingender Koerper bekommt weniger Funken. Deckel pro Abschnitt.
- **Ausholen**: Vor dem Drop wird die Dreh-Feder aufgezogen und das Bild zoomt langsam rein, einen Schlag
  vorher zieht es zurueck, im Drop schnappt die Feder los und schwingt 2 Takte frei aus.

Ersetzt (Schalter „Mischpult“ an, Standard): den alten Zoom aus Kick-Puls und Build-up, die
Uebergangs-Verformung des Blenders, Funken-Menge, Ringe, Drop-Blitz und Drop-Funken. Farbe, Vignette und
Bildwahl bleiben. Schalter in der Werkstatt: Kick-Puls (Zoom), Uebergangs-Verformung (Drehen, Schwanken,
Stoss beim Bildwechsel), Hats & Snares (Funken), Build-up (Ansparen, Ausholen). Mischpult aus = Verhalten
wie Build 45. Bricht `12b` ab, laeuft alles wie vorher (`window.__AMX` fehlt).
Protokoll: „Mischpult · Drop: Konto …“, „Mischpult · Feder geloest …“ und einmal pro Minute eine Zeile
mit Kick-Stoessen, Zoom, Drehen, Schwanken, Funken, Konto und wie oft gedeckelt wurde. Debug: `?debug`, `window.__MX`.
