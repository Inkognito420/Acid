# Acid

Acid Milkdrop: Musik-Visualizer fuers iPhone. Laeuft im Browser (Safari oder als
Home-Bildschirm-App), nichts wird hochgeladen: https://inkognito420.github.io/Acid/

Eigene Tracks laden, Takt und Abschnitte werden vorab erkannt (Scan), Milkdrop
(Butterchurn) und eigene Shader reagieren auf Kick, Mitten und Hi-Hats.

## Dateien

- `index.html` - nur noch das Geruest: Leiste, Menue, Knoepfe und die Liste der Programmteile
- `style.css` - Aussehen (Farben, Leiste, Menue)
- `js/analyse.js` - Track-Analyse (Tempo, Takt, Abschnitte), reine Rechenfunktion
- `js/01-grundlagen.js` bis `js/16-start.js` - das Programm in 16 Teilen, in dieser Reihenfolge geladen:
  01 Grundlagen (Start, Audio-Weg, Protokoll, Zustand) · 02 Instrumente hoeren ·
  03 Eigene Shader · 04 Bildschirm (Groesse, Farbe) · 05 Presets vermessen ·
  06 Mitschrift · 07 Sichern/Laden · 08 Auswahl (Lastbremse, Preset-Auswahl, Wechsel) ·
  09 Schleife (60 fps, Waechter) · 10 Bedienung (Schalter, Automatik-Karte, Auto-Pegel) ·
  11 Ton-Sicherheit · 12 Erkennung (live und Scan) · 13 Effekte und Gesten ·
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
