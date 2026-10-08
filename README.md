# Acid

Acid Milkdrop: Musik-Visualizer fuers iPhone. Laeuft im Browser (Safari oder als
Home-Bildschirm-App), nichts wird hochgeladen: https://inkognito420.github.io/Acid/

Eigene Tracks laden, Takt und Abschnitte werden vorab erkannt (Scan), Milkdrop
(Butterchurn) und eigene Shader reagieren auf Kick, Mitten und Hi-Hats.

## Dateien

- `index.html` - die ganze App (Scan, Steuerung, Mitschrift, Sichern/Laden)
- `acid-shader.js` - eigene Shader (WebGL) und der Player dafuer
- `acid-profile.js`, `acid-presets.js` - vermessene Milkdrop-Presets, eigene Presets
- `adaptive-preset-blender.js`, `audio-reactive-controller.js` - Presets mischen, Reaktion
- `shader-test.html` - Testseite fuer die eigenen Shader (Messlauf)
- `acid-bild-*.jpg` - Bilder fuer die Bild-Presets

## Track-Flug (ab Build 36)

Eigener Shader (`flug-track` in `acid-shader.js`): Der Scan eines Tracks wird als
Tunnel gezeichnet, in dem man auf der Zeitachse nach vorne fliegt. Die naechsten
Takte sind schon zu sehen: Kicks als Rahmen, Hi-Hats als Punkte an der Wand, Mitten
als Boegen, Abschnittsgrenzen als Ringe, der Drop als Tor.

- Automatisch: 12 Takte vor einem Drop bis 8 Takte danach (Schalter "Track-Flug bei
  Drops" im Sound-Menue).
- Knopf "Flug": dauerhaft an; Wischen oder Doppeltipp beendet ihn.
- Texturformat (Einheit 3): 4 Schritte pro Schlag, R Kick, G Hi-Hat, B Mitten,
  A Abschnitt (siehe `AcidShaderPlayer.buildTrack`).
- Debug: Seite mit `?debug` oeffnen, dann `window.__FLUG`.
