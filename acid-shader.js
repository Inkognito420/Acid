/* ============================================================
   Acid Milkdrop: eigene Shader
   Stand: 08.10.2026 (Build 36)

   Was ist das?
   Sieben selbst geschriebene Bild-Effekte (Fragment-Shader), je zwei pro Stil
   (Peak Time, Driving, Acid) plus Nr. 7 "Echo-Ring" nach dem Milkdrop-Prinzip
   (Nachzieh-Spur + Leuchten, zwei Durchgänge mit Zwischenbildern). Sie laufen auf einer EIGENEN Zeichenfläche
   (eigenes <canvas>), getrennt von Butterchurn und vom Ton-Weg.
   Sie können später vom Autopilot über/unter Butterchurn gelegt werden.

   Werte, die der Visualizer pro Bild liefern muss (alle 0..1, außer Zeit):
     u_time   Sekunden
     u_res    Größe der Fläche in Pixeln
     u_bass   Tiefen (Kick/Rumble)
     u_mid    Mitten (303)
     u_treb   Höhen (Hi-Hats)
     u_beat   springt bei jedem Kick auf 1 und fällt weich auf 0
     u_bar    springt auf jeder Takt-Eins auf 1 und fällt weich auf 0
     u_build  Drop-Aufbau (dropPre) 0..1
     u_hue    Grundfarbe 0..1 (barHue + Stimmung, als Anteil eines Kreises)
     u_flash  Strobo-Schutz: 0..1, dämpft das Aufleuchten auf der Takt-Eins
              (Takt-Eins hellt nur helle Stellen auf, Schwarz bleibt schwarz)

   Alle Schleifen sind klein und fest (iPhone-freundlich).

   Build 36 – Track-Flug (Nr. 8, style 'flug'): Du fliegst durch einen Tunnel, in dem die nächsten Takte des
   Tracks schon vor dir liegen. Jeder Kick ist ein Rahmen, der auf dich zukommt und genau auf dem Schlag den
   Bildrand erreicht; Hi-Hats sind Punkte an der Wand, Mitten (303, Synths) kurze Bögen, Abschnittswechsel
   große Ringe in der Farbe des neuen Abschnitts, und der nächste Drop ist eine leuchtende Wand am Ende des
   Tunnels, die größer wird und beim Drop durchbrochen wird.
   Dazu bekommt der Spieler den ganzen Track vorab als Textur (AcidShaderPlayer.buildTrack(A) -> setTrack):
   pro Schritt (1/4 Schlag) ein Texel RGBA = Kick-Stärke | Hat (Stärke*16 + Feinversatz) | Mitte (ebenso) |
   Abschnitt (Typ*32 + 16 beim ersten Schritt eines Abschnitts). Die Textur liegt auf Steckplatz 3.
   Uniforms dazu: u_ti = (Texturbreite, -höhe, Schritte, Takt-Versatz), u_fl = (ganze Schläge, Rest,
   Schläge bis zum nächsten Drop, Schläge seit dem letzten Drop).

   Build 31 – drei Spar-Tricks (Modus "neu", Standard; "alt" = wie Build 30):
     1. Echo-Ring: Leuchten wird auf einem Zwischenbild in halber Breite/Höhe
        gerechnet (wie Milkdrops Blur) -> ca. 4,5 statt 8 Bild-Abfragen pro Pixel.
     2. Rauschen (Rumble-Nebel) kommt aus einem fertigen 256x256-Zufallsbild
        statt 4 Sinus-Rechnungen pro Punkt -> 12 Abfragen statt 48 Sinus.
     3. warm(id): Shader vorab übersetzen und einmal 1x1 Pixel zeichnen, damit
        beim ersten echten Wechsel nichts mehr ruckelt.
   ============================================================ */
(function () {
  var PRELUDE = [
    '#ifdef GL_FRAGMENT_PRECISION_HIGH',
    'precision highp float;',
    '#else',
    'precision mediump float;',
    '#endif',
    'uniform float u_time; uniform vec2 u_res;',
    'uniform float u_bass, u_mid, u_treb, u_beat, u_bar, u_build, u_hue, u_flash;',
    'vec3 hsv(float h, float s, float v){',
    '  vec3 k = clamp(abs(mod(h*6.0 + vec3(0.0,4.0,2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);',
    '  return v * mix(vec3(1.0), k, s);',
    '}',
    'float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }',
    'float vnoise(vec2 p){',
    '  vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);',
    '  return mix(mix(hash(i), hash(i+vec2(1.0,0.0)), f.x),',
    '             mix(hash(i+vec2(0.0,1.0)), hash(i+vec2(1.0,1.0)), f.x), f.y);',
    '}',
    'vec2 uvc(){ return (gl_FragCoord.xy - 0.5*u_res) / u_res.y; }',
    ''
  ].join('\n');
  // Modus "neu": gleiches Rauschen, aber aus einem fertigen Zufallsbild gelesen (eine Abfrage statt 4x Sinus).
  // Die Grafikkarte mischt die 4 Nachbarpunkte selbst (LINEAR), der weiche Übergang (f*f*(3-2f)) bleibt.
  var PRELUDE_FAST = PRELUDE.replace(
    /float vnoise\(vec2 p\)\{[\s\S]*?\n\}\n/,
    'uniform sampler2D u_noise;\n' +
    'float vnoise(vec2 p){\n' +
    '  vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);\n' +
    '  return texture2D(u_noise, (i + f + 0.5) / 256.0).r;\n' +
    '}\n');

  var SHADERS = [];

  /* ---------- PEAK TIME: groß, hell, Stadion ---------- */

  // 1) Strahlen: Lichtstrahlen aus der Mitte, Ring bei jedem Kick, Weiß-Blitz auf der Takt-Eins
  SHADERS.push({
    id: 'peak-strahlen', style: 'peak', name: 'Peak · Strahlen',
    glsl: [
      'void main(){',
      '  vec2 p = uvc();',
      '  float r = length(p);',
      '  float a = atan(p.y, p.x);',
      '  float wob = sin(r*4.0 - u_time*1.2) * (0.8 + u_mid);',
      '  float rays = 0.5 + 0.5*sin(a*14.0 + u_time*0.5 + wob);',
      '  rays = pow(rays, 2.0 + 5.0*(1.0 - u_bass));',
      '  float fade = exp(-r*1.6);',
      '  float rad = 1.1*(1.0 - u_beat);',
      '  float ring = exp(-abs(r - rad)*14.0) * u_beat;',
      '  float core = 0.05/(r + 0.05) * (0.5 + 0.8*u_bass);',
      '  float h = u_hue + 0.08*r + 0.05*sin(a*3.0);',
      '  vec3 col = hsv(h, 0.55, 1.0) * (rays*fade*(0.8 + u_build) + core);',
      '  col += hsv(h + 0.12, 0.35, 1.0) * ring * 1.2;',
      '  col *= 1.0 + 0.6*u_bar*u_flash;',
      '  col += vec3(1.0) * u_treb * 0.08 * fade;',
      '  gl_FragColor = vec4(col, 1.0);',
      '}'
    ].join('\n')
  });

  // 2) Lichtwand: Säulen wie eine LED-Wand, Höhe tanzt mit Bass/Mitten/Höhen
  SHADERS.push({
    id: 'peak-lichtwand', style: 'peak', name: 'Peak · Lichtwand',
    glsl: [
      'void main(){',
      '  vec2 q = gl_FragCoord.xy / u_res;',
      '  float n = 20.0;',
      '  float col_i = floor(q.x * n);',
      '  float cx = fract(q.x * n);',
      '  float seed = hash(vec2(col_i, 1.0));',
      '  float band = col_i / n;',
      '  float lvl = mix(u_bass, mix(u_mid, u_treb, smoothstep(0.5, 1.0, band)), smoothstep(0.0, 0.5, band));',
      '  float hgt = 0.12 + 0.75*lvl*(0.6 + 0.4*sin(u_time*3.0 + seed*20.0)) + 0.1*u_beat;',
      '  float bar = step(q.y, hgt) * step(0.08, cx) * step(cx, 0.92);',
      '  float seg = step(0.25, fract(q.y * 36.0));',
      '  float glow = exp(-abs(q.y - hgt)*18.0) * 0.6;',
      '  float h = u_hue + band*0.25 + q.y*0.1;',
      '  vec3 c = hsv(h, 0.7, 1.0) * (bar*seg*(0.7 + 0.3*q.y) + glow);',
      '  c *= 1.0 + 0.4*u_bar*u_flash;',
      '  c *= 0.85 + 0.3*u_build;',
      '  gl_FragColor = vec4(c, 1.0);',
      '}'
    ].join('\n')
  });

  /* ---------- DRIVING: hypnotisch, Tunnel, Sog (kaum Blitze, Pulsieren) ---------- */

  // 3) Sog-Tunnel: endloser Tunnel mit Gitter, pulsiert leise mit dem Kick
  SHADERS.push({
    id: 'driving-tunnel', style: 'driving', name: 'Driving · Sog-Tunnel',
    glsl: [
      'void main(){',
      '  vec2 p = uvc();',
      '  p += 0.03*vec2(sin(u_time*0.3), cos(u_time*0.23));',
      '  float r = length(p) + 0.0001;',
      '  float a = atan(p.y, p.x) / 6.2831853;',
      '  float z = 0.35/r + u_time*0.55;',
      '  float w = a*10.0 + 0.3*sin(z*0.7);',
      '  float gz = abs(fract(z) - 0.5);',
      '  float gw = abs(fract(w) - 0.5);',
      '  float line = smoothstep(0.06, 0.0, gz) + smoothstep(0.04, 0.0, gw)*0.6;',
      '  float fog = smoothstep(0.0, 0.5, r);',
      '  float pulse = 0.65 + 0.35*u_beat + 0.2*u_bass;',
      '  float h = u_hue + 0.04*sin(z*0.5);',
      '  vec3 c = hsv(h, 0.65, 1.0) * line * fog * pulse;',
      '  c += hsv(h + 0.5, 0.5, 0.25) * (1.0 - fog) * 0.6;',
      '  c += vec3(0.04, 0.04, 0.06);',
      '  c *= 0.85 + 0.4*u_build;',
      '  gl_FragColor = vec4(c, 1.0);',
      '}'
    ].join('\n')
  });

  // 4) Rumble-Nebel: dunkler, langsamer Nebel, der mit dem Rumpeln atmet
  SHADERS.push({
    id: 'driving-nebel', style: 'driving', name: 'Driving · Rumble-Nebel',
    glsl: [
      'float fbm(vec2 p){',
      '  float s = 0.0, a = 0.5;',
      '  for (int i = 0; i < 4; i++){ s += a*vnoise(p); p = p*2.03 + 17.0; a *= 0.5; }',
      '  return s;',
      '}',
      'void main(){',
      '  vec2 p = uvc()*2.2;',
      '  float t = u_time*0.08;',
      '  vec2 q = vec2(fbm(p + t), fbm(p + vec2(5.2, 1.3) - t));',
      '  float f = fbm(p + 2.0*q + vec2(0.0, t*2.0) + 0.6*u_bass);',
      '  float dens = smoothstep(0.25, 0.9, f);',
      '  float h = u_hue + 0.1*q.x;',
      '  vec3 c = hsv(h, 0.6, 1.0) * dens * (0.35 + 0.55*u_bass + 0.2*u_beat);',
      '  c += hsv(h + 0.45, 0.5, 1.0) * pow(dens, 3.0) * 0.4 * u_mid;',
      '  float vig = 1.0 - 0.9*dot(uvc(), uvc());',
      '  c *= clamp(vig, 0.0, 1.0);',
      '  c *= 0.9 + 0.5*u_build;',
      '  gl_FragColor = vec4(c, 1.0);',
      '}'
    ].join('\n')
  });

  /* ---------- ACID: giftig, quietschend, verdreht (Farbe springt mit den Mitten/303) ---------- */

  // 5) 303-Welle: verdrehtes Plasma, Mitten (303-Filter) verbiegen das Bild und drehen die Farbe
  SHADERS.push({
    id: 'acid-welle', style: 'acid', name: 'Acid · 303-Welle',
    glsl: [
      'void main(){',
      '  vec2 p = uvc()*3.0;',
      '  float k = 0.5 + 1.3*u_mid;',
      '  for (int i = 0; i < 4; i++){',
      '    float fi = float(i);',
      '    p += k*vec2(sin(p.y*1.4 + u_time*0.7 + fi), cos(p.x*1.4 - u_time*0.6 + fi*1.7)) * 0.55;',
      '  }',
      '  float v = sin(p.x*2.0) + sin(p.y*2.0) + sin((p.x + p.y)*1.5);',
      '  float band = 0.5 + 0.5*sin(v*3.0 + u_time);',
      '  float edge = smoothstep(0.35, 0.0, abs(band - 0.5));',
      '  float h = u_hue + v*0.12 + u_mid*0.35;',
      '  vec3 c = hsv(h, 1.0, 1.0) * (0.25 + 0.75*band);',
      '  c += hsv(h + 0.33, 1.0, 1.0) * edge * (0.5 + 0.8*u_beat);',
      '  c *= 1.0 + 0.35*u_bar*u_flash;',
      '  c *= 0.85 + 0.5*u_build;',
      '  gl_FragColor = vec4(c, 1.0);',
      '}'
    ].join('\n')
  });

  // 6) Säure-Kaleidoskop: gespiegelte Segmente, Farbsäume (RGB leicht versetzt)
  SHADERS.push({
    id: 'acid-kaleido', style: 'acid', name: 'Acid · Säure-Kaleidoskop',
    glsl: [
      'float pat(vec2 p, float t){',
      '  float r = length(p);',
      '  float a = atan(p.y, p.x);',
      '  float seg = 6.2831853/6.0;',
      '  a = abs(mod(a, seg) - 0.5*seg);',
      '  vec2 q = r*vec2(cos(a), sin(a));',
      '  float v = sin(q.x*9.0 + t) + sin(q.y*11.0 - t*1.3) + sin(r*14.0 - t*2.0);',
      '  return 0.5 + 0.5*sin(v*2.0 + u_mid*4.0);',
      '}',
      'void main(){',
      '  vec2 p = uvc();',
      '  float s = sin(u_time*0.15), c0 = cos(u_time*0.15);',
      '  p = mat2(c0, -s, s, c0) * p;',
      '  p *= 1.0 + 0.25*u_beat - 0.1*u_build;',
      '  float off = 0.01 + 0.03*u_treb + 0.02*u_beat;',
      '  float t = u_time*0.8;',
      '  float vr = pat(p + vec2(off, 0.0), t);',
      '  float vg = pat(p, t);',
      '  float vb = pat(p - vec2(off, 0.0), t);',
      '  vec3 base = hsv(u_hue + 0.1*length(p), 0.9, 1.0);',
      '  vec3 col = vec3(vr, vg, vb) * base;',
      '  col += base.zxy * pow(vg, 6.0) * 0.6;',
      '  col *= 1.0 + 0.35*u_bar*u_flash;',
      '  col *= 0.85 + 0.4*u_build;',
      '  gl_FragColor = vec4(col, 1.0);',
      '}'
    ].join('\n')
  });


  /* ---------- MILKDROP-PRINZIP: Nachzieh-Spur + Leuchten (zwei Durchgänge) ---------- */

  // 7) Echo-Ring: wie Milkdrop. Das alte Bild wird jedes Mal leicht gezoomt, gedreht,
  //    gewellt und abgedunkelt (decay) -> Spur. Neu gezeichnet wird nur ein tanzender Ring.
  //    Danach ein zweiter Durchgang für das Leuchten (Glow, wie Milkdrops Blur).
  SHADERS.push({
    id: 'acid-echo', style: 'acid', name: 'Acid · Echo-Ring', feedback: true,
    glsl: [
      'uniform sampler2D u_tex;',
      'void main(){',
      '  vec2 uv = gl_FragCoord.xy / u_res;',
      '  float asp = u_res.x / u_res.y;',
      '  vec2 p = (uv - 0.5) * vec2(asp, 1.0);',
      // Verzerren (wie Milkdrops Warp: Zoom, Drehung, Wellen)
      '  float zoom = 1.012 + 0.035*u_bass + 0.03*u_build;',
      '  float rot = 0.004*sin(u_time*0.21) + 0.014*(u_mid - 0.5);',
      '  float cs = cos(rot), sn = sin(rot);',
      '  vec2 q = mat2(cs, -sn, sn, cs) * p / zoom;',
      '  float wa = 0.003 + 0.006*u_treb;',
      '  q += wa*vec2(sin(u_time*0.9 + q.y*9.0), cos(u_time*0.77 + q.x*8.0));',
      '  vec3 prev = texture2D(u_tex, q / vec2(asp, 1.0) + 0.5).rgb;',
      // Abdunkeln; kleiner Abzug, damit keine Geisterreste stehen bleiben
      '  float decay = 0.90 + 0.06*u_build;',
      '  prev = max(prev*decay - 1.5/255.0, 0.0);',
      // Neuer Ring (nachgebaut nach Milkdrops Kreis-Welle)
      '  float r = length(p);',
      '  float a = atan(p.y, p.x);',
      '  float wob = 0.06*(0.4 + u_mid)*sin(a*5.0 + u_time*2.0) + 0.03*u_treb*sin(a*13.0 - u_time*5.0);',
      '  float rad = 0.16 + 0.12*u_bass + wob;',
      '  float w = 0.004 + 0.010*u_beat;',
      '  float line = smoothstep(w, 0.0, abs(r - rad));',
      '  vec3 ink = hsv(u_hue + u_time*0.03 + a*0.08, 0.85, 1.0) * line * (0.7 + 0.6*u_beat);',
      '  gl_FragColor = vec4(min(prev + ink, 1.0), 1.0);',
      '}'
    ].join('\n'),
    post: [
      'uniform sampler2D u_tex;',
      'void main(){',
      '  vec2 uv = gl_FragCoord.xy / u_res;',
      '  vec2 px = 1.0 / u_res;',
      '  vec3 c = texture2D(u_tex, uv).rgb;',
      '  float gr = 6.0 + 10.0*u_build + 6.0*u_bass;',
      '  vec3 g = vec3(0.0);',
      // 6 Proben im Ring (fest, damit nichts flimmert)
      '  float spin = 0.3;',
      '  for (int i = 0; i < 6; i++){',
      '    float an = float(i)*1.0472 + spin;',
      '    vec2 o = vec2(cos(an), sin(an)) * gr * 1.6 * px;',
      '    g += texture2D(u_tex, uv + o).rgb;',
      '  }',
      '  g /= 5.0;',
      '  vec3 col = c + g*(0.8 + 0.6*u_build);',
      '  col *= 1.0 + 0.35*u_bar*u_flash;',
      '  col = col / (1.0 + 0.25*col);',
      '  gl_FragColor = vec4(col, 1.0);',
      '}'
    ].join('\n'),
    // Modus "neu", Schritt A: Leuchten auf einem Zwischenbild in HALBER Größe (u_res = halbe Größe)
    glow: [
      'uniform sampler2D u_tex;',
      'void main(){',
      '  vec2 uv = gl_FragCoord.xy / u_res;',
      '  vec2 px = 0.5 / u_res;',            // ein Pixel der vollen Fläche
      '  float gr = 6.0 + 10.0*u_build + 6.0*u_bass;',
      '  vec3 g = vec3(0.0);',
      '  float spin = 0.3;',
      '  for (int i = 0; i < 6; i++){',
      '    float an = float(i)*1.0472 + spin;',
      '    vec2 o = vec2(cos(an), sin(an)) * gr * 1.6 * px;',
      '    g += texture2D(u_tex, uv + o).rgb;',
      '  }',
      '  gl_FragColor = vec4(g / 5.0, 1.0);',
      '}'
    ].join('\n'),
    // Modus "neu", Schritt B: Bild + hochgezogenes Leuchten zusammen (2 Abfragen pro Pixel)
    comp: [
      'uniform sampler2D u_tex;',
      'uniform sampler2D u_glow;',
      'void main(){',
      '  vec2 uv = gl_FragCoord.xy / u_res;',
      '  vec3 c = texture2D(u_tex, uv).rgb;',
      '  vec3 g = texture2D(u_glow, uv).rgb;',
      '  vec3 col = c + g*(0.8 + 0.6*u_build);',
      '  col *= 1.0 + 0.35*u_bar*u_flash;',
      '  col = col / (1.0 + 0.25*col);',
      '  gl_FragColor = vec4(col, 1.0);',
      '}'
    ].join('\n')
  });

  /* ---------- TRACK-FLUG: durch den Track fliegen (Build 36) ---------- */

  // 8) Track-Flug. Perspektive: Ein Rahmen, der b Schläge vor dir liegt, hat die Größe RHO0 / (1 + KAP*b)
  //    (Bildrand = 1, also genau auf dem Schlag am Bildrand). Umgekehrt weiß jeder Bildpunkt aus seinem Abstand
  //    zur Mitte, wie viele Schläge voraus er zeigt (b), und liest dort direkt in der Track-Textur nach:
  //    keine Schleife über alle Ereignisse, nur ca. 5 Abfragen pro Bildpunkt.
  //    Rahmenform: "Superellipse" (abgerundetes Rechteck in der Form des Bildschirms), Kamera schwankt leicht.
  SHADERS.push({
    id: 'flug-track', style: 'flug', track: true, name: 'Track-Flug',
    glsl: [
      '#define SPB 4.0',
      '#define RHO0 1.0',
      'uniform sampler2D u_trk;',
      'uniform vec4 u_ti;',
      'uniform vec4 u_fl;',
      'vec4 trk(float s){',
      '  float top = max(u_ti.z - 1.0, 0.0);',
      '  float ok = step(0.0, s) * step(s, top);',
      '  s = clamp(s, 0.0, top);',
      '  float row = floor(s / u_ti.x);',
      '  float col = s - row * u_ti.x;',
      '  return floor(texture2D(u_trk, vec2((col + 0.5) / u_ti.x, (row + 0.5) / u_ti.y)) * 255.0 + 0.5) * ok;',
      '}',
      'float h11(float p){ p = fract(mod(p, 8192.0) * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }',
      'float wrapA(float a){ return a - 6.2831853 * floor((a + 3.1415927) / 6.2831853); }',
      'float ln(float d, float w, float px){',
      '  float ww = max(w, px);',
      '  return (1.0 - smoothstep(0.0, ww, abs(d))) * (w / ww);',
      '}',
      'vec3 secLook(float t){',
      '  if (t < 0.5) return vec3(0.52, 0.55, 0.55);',
      '  if (t < 1.5) return vec3(0.00, 0.80, 1.00);',
      '  if (t < 2.5) return vec3(0.64, 0.60, 0.62);',
      '  if (t < 3.5) return vec3(0.90, 0.70, 0.95);',
      '  if (t < 4.5) return vec3(0.08, 0.90, 1.25);',
      '  return vec3(0.52, 0.50, 0.45);',
      '}',
      'void main(){',
      '  vec2 q = (gl_FragCoord.xy / u_res - 0.5) * 2.0;',
      '  float rl = 0.035 * sin(u_time * 0.23);',
      '  q = mat2(cos(rl), -sin(rl), sin(rl), cos(rl)) * q;',
      '  q += vec2(0.06 * sin(u_time * 0.31), 0.05 * cos(u_time * 0.19));',
      '  vec2 q2 = q * q;',
      '  float rho = sqrt(sqrt(q2.x * q2.x + q2.y * q2.y)) + 1e-3;',
      '  float ang = atan(q.y, q.x);',
      '  float kap = 0.5 + 0.2 * u_build;',
      '  float b = (RHO0 / rho - 1.0) / kap;',
      '  float pxr = 2.0 / u_res.y;',
      '  float dbpx = RHO0 / (kap * rho * rho) * pxr;',
      '  float dapx = pxr / rho;',
      '  float fog = exp(-max(b, 0.0) * 0.075) * smoothstep(-0.7, -0.1, b);',
      // Stelle im Track: Schritte relativ zur ganzen Schlagzahl
      '  float xr = u_fl.y + b;',
      '  float xs = xr * SPB;',
      '  float nbs = u_fl.x * SPB;',
      '  float s0 = nbs + floor(xs);',
      '  vec4 c0 = trk(s0);',
      '  vec3 L = secLook(floor(c0.a / 32.0));',
      '  float hue = u_hue + L.x;',
      // Schlag-Linien, Takt-Linien, Kick-Rahmen, Abschnittsgrenzen
      '  float kbr = floor(xr + 0.5);',
      '  float dk = xr - kbr;',
      '  float ks = (u_fl.x + kbr) * SPB;',
      '  vec4 tk = trk(ks);',
      '  float inr = step(0.0, ks) * step(ks, u_ti.z - 1.0);',
      '  float kick = tk.r / 255.0;',
      '  float stFlag = floor(mod(tk.a, 32.0) / 16.0);',
      '  vec3 Lk = secLook(floor(tk.a / 32.0));',
      '  float barLine = 1.0 - step(0.5, mod(u_fl.x + kbr - u_ti.w, 4.0));',
      '  float grid = ln(dk, 0.03, dbpx) * inr * (0.10 + 0.30 * barLine);',
      '  float bw = 1.0 + 0.5 * barLine;',
      '  float ring = (ln(dk, 0.075 * bw, dbpx) + 0.35 * ln(dk, 0.28 * bw, dbpx)) * kick * (1.0 + 0.35 * barLine);',
      '  float wB = 0.11 + 0.0012 * b * b;',
      '  float bnd = stFlag * (ln(dk, wB, dbpx) + 0.5 * ln(dk, 4.0 * wB, dbpx));',
      // Hi-Hats (Punkte an der Wand) und Mitten (Bögen) aus den drei Schritten um den Bildpunkt.
      // Maß an der Wand: Abstand am Rahmen des Bildrands in halber Bildhöhe (Sehne), damit die Punkte am nahen Rand rund aussehen
      '  float asp = u_res.x / u_res.y;',
      '  vec2 pp = q / rho * vec2(asp, 1.0);',
      '  float hatS = 0.0;',
      '  float midS = 0.0;',
      '  for (int i = 0; i < 3; i++){',
      '    float sN = s0 + float(i) - 1.0;',
      '    vec4 e = trk(sN);',
      '    float rel = sN - nbs;',
      '    float hv = floor(e.g / 16.0);',
      '    float ho = e.g - hv * 16.0;',
      '    float dxb = (xs - (rel + (ho + 0.5) / 16.0)) / SPB;',
      '    float ah = h11(sN) * 6.2831853;',
      '    vec2 ce = vec2(cos(ah), sin(ah));',
      '    ce /= sqrt(sqrt(ce.x * ce.x * ce.x * ce.x + ce.y * ce.y * ce.y * ce.y));',
      '    ce *= vec2(asp, 1.0);',
      '    float sc = 0.5 * length(ce);',
      '    float ch = min(length(pp - ce), length(pp + ce));',
      '    float R = 0.016 + 0.0016 * hv;',
      '    float RR = max(R, max(dbpx * sc, pxr / rho));',
      '    float d = length(vec2(dxb * sc, ch));',
      '    float hc = 1.0 - smoothstep(0.0, RR, d);',
      '    float hh = 1.0 - smoothstep(0.0, 2.6 * RR, d);',
      '    hatS += step(0.5, hv) * (hv / 15.0) * (hc * hc + 0.35 * hh * hh) * (R * R) / (RR * RR);',
      '    float mv = floor(e.b / 16.0);',
      '    float mo = e.b - mv * 16.0;',
      '    float dxm = (xs - (rel + (mo + 0.5) / 16.0)) / SPB;',
      '    float am = h11(sN + 77.0) * 6.2831853;',
      '    vec2 cm = vec2(cos(am), sin(am));',
      '    cm /= sqrt(sqrt(cm.x * cm.x * cm.x * cm.x + cm.y * cm.y * cm.y * cm.y));',
      '    cm *= vec2(asp, 1.0);',
      '    float cmh = min(length(pp - cm), length(pp + cm));',
      '    float hw = 0.16 + 0.02 * mv;',
      '    midS += step(0.5, mv) * (mv / 15.0) * (1.0 - smoothstep(hw * 0.55, hw, cmh)) * ln(dxm, 0.05, dbpx);',
      '  }',
      // Speichen entlang des Tunnels
      '  float su = ang * 16.0 / 6.2831853;',
      '  float sd = abs(fract(su + 0.5) - 0.5);',
      '  float dash = mix(0.5, 0.5 + 0.5 * cos(6.2831853 * xr * 2.0), 1.0 - smoothstep(0.1, 0.4, dbpx));',
      '  float spoke = (1.0 - smoothstep(0.0, 0.03 + dapx * 2.5, sd)) * smoothstep(0.03, 0.2, rho) * 0.16 * (0.3 + 0.7 * dash);',
      // Farben
      '  vec3 cK = hsv(hue, L.y, 1.0);',
      '  vec3 cB = hsv(u_hue + Lk.x, Lk.y * 0.6, 1.0);',
      '  vec3 cH = mix(vec3(1.0), hsv(hue + 0.5, 0.5, 1.0), 0.4);',
      '  vec3 cM = hsv(hue + 0.30, 1.0, 1.0);',
      '  vec3 col = cK * (grid + 1.5 * ring) * L.z;',
      '  float fogB = exp(-max(b, 0.0) * 0.03) * smoothstep(-0.7, -0.1, b);',
      '  col += cH * hatS * 1.6 * L.z + cM * midS * 1.8 * L.z;',
      '  col += cK * spoke * (0.5 + 0.8 * u_bass) * L.z;',
      '  col *= fog * (0.9 + 0.5 * u_build + 0.25 * u_beat);',
      '  col += cB * bnd * 1.6 * fogB;',
      '  col += mix(cK, vec3(1.0), 0.5) * ln(rho - 0.965, 0.010, pxr) * (0.07 + 0.55 * u_beat + 0.25 * u_bar) * L.z * u_flash;',
      '  col += hsv(hue, 0.5, 1.0) * (0.03 + 0.05 * u_bass) / (rho * rho * 6.0 + 0.15) * L.z;',
      // Drop-Wand am Ende des Tunnels
      '  float bd = u_fl.z;',
      '  float slab = step(0.0, bd) * step(bd, b);',
      '  float rhoD = RHO0 / (1.0 + kap * max(bd, 0.0));',
      '  float fr = clamp(rho / rhoD, 0.0, 1.0);',
      '  float nr = 1.0 - smoothstep(2.0, 32.0, bd);',
      '  float wave = 0.5 + 0.5 * sin(fr * 16.0 - u_time * 4.0);',
      '  float rays = 0.5 + 0.5 * sin(ang * 10.0 + u_time * 0.7 + fr * 4.0);',
      '  vec3 face = hsv(u_hue + 0.08 + 0.16 * fr, 0.7 - 0.3 * (1.0 - fr), 1.0) * (0.35 + 0.65 * (1.0 - fr)) * (0.55 + 0.25 * wave + 0.2 * rays);',
      '  face += vec3(1.0) * exp(-fr * 3.0) * (0.3 + 0.7 * nr);',
      '  face *= (0.8 + 0.6 * nr) * (0.9 + 0.25 * u_beat);',
      '  float fade = smoothstep(0.0, 0.4, bd);',
      '  col = mix(col, face, slab * fade * 0.82);',
      '  float rim = ln(b - bd, 0.14, dbpx) * step(0.0, bd) * fade;',
      '  col += hsv(u_hue + 0.1, 0.35, 1.0) * rim * (0.6 + 1.6 * nr);',
      // Knall nach dem Drop: Druckwelle von der Mitte
      '  float sdr = u_fl.w;',
      '  float shock = ln(rho - (0.06 + 1.4 * (1.0 - exp(-sdr * 1.5))), 0.05 + 0.05 * sdr, 0.003) * exp(-sdr * 0.9) * step(0.0, sdr);',
      '  col += hsv(u_hue + 0.08, 0.3, 1.0) * shock * 1.4 * u_flash;',
      '  col *= 1.0 + 0.8 * exp(-sdr * 1.2) * step(0.0, sdr) * u_flash;',
      '  col *= 1.0 + 0.3 * u_bar * u_flash;',
      '  col = col / (1.0 + 0.25 * col);',
      '  gl_FragColor = vec4(col, 1.0);',
      '}'
    ].join('\n')
  });

  /* ---------- Mini-Spieler: eigene Fläche, ein Shader aktiv ---------- */
  var VERT = 'attribute vec2 a; void main(){ gl_Position = vec4(a, 0.0, 1.0); }';
  var NAMES = ['u_time','u_res','u_bass','u_mid','u_treb','u_beat','u_bar','u_build','u_hue','u_flash','u_ti','u_fl'];

  // opts.fast: true (Standard) = Spar-Tricks an; false = genau wie Build 30 (zum Vergleichen)
  function AcidShaderPlayer(canvas, opts) {
    var gl = canvas.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'high-performance' });
    if (!gl) throw new Error('Kein WebGL');
    this.gl = gl; this.canvas = canvas; this.progs = {}; this.cur = null; this.curId = null; this.errors = {};
    this.fast = !(opts && opts.fast === false);
    this.fb = null; // Zwischenbilder für Nachzieh-Shader (werden erst bei Bedarf angelegt)
    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW); // ein großes Dreieck
    if (this.fast) this._noise();
    this._trackInit();
  }
  // Zufallsbild 256x256 für das Rauschen, fest auf Steckplatz 2 (wird nie umgesteckt)
  AcidShaderPlayer.prototype._noise = function () {
    var gl = this.gl, n = 256, d = new Uint8Array(n * n * 4), x = 1234567, i;
    for (i = 0; i < n * n; i++) {
      x = (x * 1103515245 + 12345) & 0x7fffffff;        // fester Zufall: jedes Mal dasselbe Bild
      d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = (x >> 16) & 255; d[i * 4 + 3] = 255;
    }
    var t = gl.createTexture();
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, n, n, 0, gl.RGBA, gl.UNSIGNED_BYTE, d);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.activeTexture(gl.TEXTURE0);
  };
  // Track-Textur (nur der Track-Flug liest sie) fest auf Steckplatz 3. Bis ein Track da ist: 1x1 Platzhalter, Schrittzahl 0.
  AcidShaderPlayer.prototype._trackInit = function () {
    var gl = this.gl;
    this.trkTex = gl.createTexture();
    this.trk = { w: 1, h: 1, n: 0, barPhase: 0, id: null };
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, this.trkTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.activeTexture(gl.TEXTURE0);
  };
  // T kommt von AcidShaderPlayer.buildTrack(A). id: Merker, welcher Track gerade hochgeladen ist.
  AcidShaderPlayer.prototype.setTrack = function (T, id) {
    var gl = this.gl;
    if (!T) { this.trk.n = 0; this.trk.id = null; return; }
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, this.trkTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, T.w, T.h, 0, gl.RGBA, gl.UNSIGNED_BYTE, T.data);
    gl.activeTexture(gl.TEXTURE0);
    this.trk = { w: T.w, h: T.h, n: T.n, barPhase: T.barPhase, id: id == null ? null : id };
  };
  // Den ganzen Track als Textur aufbereiten. A = Ergebnis von analyzeEnvelopes (grid, beat0, beatS, barPhase, sections, kA, onM, onH, duration).
  // Schritte: 4 pro Schlag, Schritt 0 = erster Schlag des Rasters (beat0). Zeilen von 2048 Texeln, damit lange Tracks passen.
  var TRK_SPB = 4, TRK_W = 2048, TRK_TYPE = { intro: 0, groove: 1, break: 2, buildup: 3, drop: 4, outro: 5 };
  AcidShaderPlayer.buildTrack = function (A) {
    if (!A || !A.beatS || !(A.duration > 0)) return null;
    var SPB = TRK_SPB, beats = Math.max(1, Math.ceil((A.duration - A.beat0) / A.beatS) + 1), n = beats * SPB;
    var rows = Math.max(1, Math.ceil(n / TRK_W)), d = new Uint8Array(TRK_W * rows * 4), i, k, j;
    var cl = function (v) { return v < 0 ? 0 : v > 1 ? 1 : v; };
    // Abschnitte (Typ + Startmarke), die Abschnitte beginnen auf Takt-Eins = ganzen Schlägen
    var secs = A.sections || [];
    for (j = 0; j < secs.length; j++) {
      var sc = secs[j], code = (TRK_TYPE[sc.type] == null ? 1 : TRK_TYPE[sc.type]) * 32;
      var a = Math.max(0, Math.round((sc.t0 - A.beat0) / A.beatS * SPB)), e = Math.min(n, Math.round((sc.t1 - A.beat0) / A.beatS * SPB));
      if (j === secs.length - 1) e = n;
      if (j === 0) a = 0;
      for (i = a; i < e; i++) d[i * 4 + 3] = code;
      if (j > 0 && a < n) d[a * 4 + 3] = code + 16;
    }
    // Kicks: nur echte (Stärke ab 0,35), genau auf dem Schlag
    if (A.kA) for (k = 0; k < A.kA.length && k * SPB < n; k++) if (A.kA[k] >= 0.35) d[k * SPB * 4] = Math.round(255 * cl(A.kA[k]));
    // Hats (Kanal G) und Mitten (Kanal B): Stärke 1..15 in den oberen 4 Bit, Feinversatz im Schritt in den unteren 4 Bit
    var put = function (list, ch) {
      if (!list) return;
      for (var p = 0; p + 1 < list.length; p += 2) {
        var x = (list[p] - A.beat0) / A.beatS * SPB;
        if (!(x >= 0) || x >= n) continue;
        var st = Math.floor(x), off = Math.min(15, Math.floor((x - st) * 16)), sv = 1 + Math.floor(cl(list[p + 1]) * 14.999);
        var o = st * 4 + ch;
        if (d[o] === 0 || (d[o] >> 4) < sv) d[o] = sv * 16 + off;
      }
    };
    put(A.onH, 1); put(A.onM, 2);
    return { w: TRK_W, h: rows, n: n, spb: SPB, barPhase: A.barPhase || 0, data: d };
  };
  AcidShaderPlayer.prototype._compile = function (type, src) {
    var gl = this.gl, sh = gl.createShader(type);
    gl.shaderSource(sh, src); gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
    return sh;
  };
  AcidShaderPlayer.prototype._program = function (fragBody) {
    var gl = this.gl, p = gl.createProgram(), i;
    gl.attachShader(p, this._compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(p, this._compile(gl.FRAGMENT_SHADER, (this.fast ? PRELUDE_FAST : PRELUDE) + fragBody));
    gl.bindAttribLocation(p, 0, 'a');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    var loc = { u_tex: gl.getUniformLocation(p, 'u_tex'), u_glow: gl.getUniformLocation(p, 'u_glow'), u_noise: gl.getUniformLocation(p, 'u_noise'), u_trk: gl.getUniformLocation(p, 'u_trk') };
    for (i = 0; i < NAMES.length; i++) loc[NAMES[i]] = gl.getUniformLocation(p, NAMES[i]);
    return { p: p, loc: loc };
  };
  AcidShaderPlayer.prototype.use = function (id) {
    var gl = this.gl, def = null, i;
    for (i = 0; i < SHADERS.length; i++) if (SHADERS[i].id === id) def = SHADERS[i];
    if (!def) return false;
    if (!this.progs[id]) {
      try {
        var main = this._program(def.glsl);
        if (def.feedback && this.fast && def.glow) { main.glow = this._program(def.glow); main.comp = this._program(def.comp); }
        else if (def.feedback) main.post = this._program(def.post);
        this.progs[id] = main;
      } catch (e) { this.errors[id] = String(e.message || e); return false; }
    }
    this.cur = this.progs[id]; this.curId = id;
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    return true;
  };
  // Vorbereiten ohne Anzeigen: übersetzen + ein Bild mit 1x1 Pixel zeichnen (der Treiber baut erst beim
  // ersten Zeichnen wirklich alles fertig). Danach ist wieder der vorherige Shader aktiv.
  // Nur aufrufen, solange die Fläche unsichtbar ist. Gibt die gebrauchte Zeit in ms zurück (oder -1 bei Fehler).
  AcidShaderPlayer.prototype.warm = function (id) {
    var t0 = performance.now(), prev = this.curId;
    if (!this.use(id)) return -1;
    this._render({ time: 0, hue: 0, flash: 1 }, true);
    if (prev && prev !== id) this.use(prev); else if (!prev) { this.cur = null; this.curId = null; }
    this.gl.finish();
    return performance.now() - t0;
  };
  AcidShaderPlayer.prototype.warmAll = function () {
    var ms = 0, i, r;
    for (i = 0; i < SHADERS.length; i++) { r = this.warm(SHADERS[i].id); if (r > 0) ms += r; }
    return ms;
  };
  function makeTarget(gl, w, h) {
    var t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    var fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
    return { tex: t, fbo: fbo };
  }
  // Zwei Zwischenbilder (Ping-Pong): eins wird gelesen (letztes Bild), ins andere wird geschrieben.
  // Im Modus "neu" dazu ein drittes in halber Größe fürs Leuchten.
  AcidShaderPlayer.prototype._targets = function (w, h) {
    var gl = this.gl, f = this.fb, i;
    if (f && f.w === w && f.h === h) return f;
    gl.activeTexture(gl.TEXTURE0);
    if (f) {
      for (i = 0; i < 2; i++) { gl.deleteTexture(f.tex[i]); gl.deleteFramebuffer(f.fbo[i]); }
      if (f.glow) { gl.deleteTexture(f.glow.tex); gl.deleteFramebuffer(f.glow.fbo); }
    }
    f = { w: w, h: h, tex: [], fbo: [], src: 0, glow: null, gw: 0, gh: 0 };
    for (i = 0; i < 2; i++) { var r = makeTarget(gl, w, h); f.tex.push(r.tex); f.fbo.push(r.fbo); }
    if (this.fast) { f.gw = Math.max(1, Math.ceil(w / 2)); f.gh = Math.max(1, Math.ceil(h / 2)); f.glow = makeTarget(gl, f.gw, f.gh); }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.fb = f;
    return f;
  };
  AcidShaderPlayer.prototype._uniforms = function (prog, s, rw, rh) {
    var gl = this.gl, L = prog.loc;
    gl.useProgram(prog.p);
    gl.uniform1f(L.u_time, s.time || 0);
    gl.uniform2f(L.u_res, rw || this.canvas.width, rh || this.canvas.height);
    gl.uniform1f(L.u_bass, s.bass || 0);
    gl.uniform1f(L.u_mid, s.mid || 0);
    gl.uniform1f(L.u_treb, s.treb || 0);
    gl.uniform1f(L.u_beat, s.beat || 0);
    gl.uniform1f(L.u_bar, s.bar || 0);
    gl.uniform1f(L.u_build, s.build || 0);
    gl.uniform1f(L.u_hue, s.hue || 0);
    gl.uniform1f(L.u_flash, s.flash == null ? 1 : s.flash);
    if (L.u_tex) gl.uniform1i(L.u_tex, 0);
    if (L.u_glow) gl.uniform1i(L.u_glow, 1);
    if (L.u_noise) gl.uniform1i(L.u_noise, 2);
    if (L.u_trk) {
      var T = this.trk, nb = s.nb || 0, nb0 = Math.floor(nb);
      gl.uniform1i(L.u_trk, 3);
      gl.uniform4f(L.u_ti, T.w, T.h, T.n, T.barPhase);
      gl.uniform4f(L.u_fl, nb0, nb - nb0, s.dropIn == null ? 1e3 : s.dropIn, s.sinceDrop == null ? 1e3 : s.sinceDrop);
    }
  };
  // s = { time, bass, mid, treb, beat, bar, build, hue, flash }; nur Track-Flug: nb (Schläge seit beat0), dropIn, sinceDrop (Schläge)
  AcidShaderPlayer.prototype.draw = function (s) { this._render(s, false); };
  AcidShaderPlayer.prototype._render = function (s, tiny) {
    if (!this.cur) return;
    var gl = this.gl, w = this.canvas.width, h = this.canvas.height, P = this.cur;
    var vw = tiny ? 1 : w, vh = tiny ? 1 : h;
    if (!P.post && !P.glow) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, vw, vh);
      this._uniforms(P, s);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      return;
    }
    var f = this._targets(w, h), src = f.src, dst = 1 - src;
    // Durchgang 1: altes Bild verzerren + abdunkeln + Neues dazumalen -> Zwischenbild
    gl.bindFramebuffer(gl.FRAMEBUFFER, f.fbo[dst]);
    gl.viewport(0, 0, vw, vh);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, f.tex[src]);
    this._uniforms(P, s);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (P.glow) {
      // Durchgang 2 (neu): Leuchten in halber Größe
      gl.bindFramebuffer(gl.FRAMEBUFFER, f.glow.fbo);
      gl.viewport(0, 0, tiny ? 1 : f.gw, tiny ? 1 : f.gh);
      gl.bindTexture(gl.TEXTURE_2D, f.tex[dst]);
      this._uniforms(P.glow, s, f.gw, f.gh);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      // Durchgang 3 (neu): Bild + Leuchten auf den Bildschirm
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, vw, vh);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, f.glow.tex);
      gl.activeTexture(gl.TEXTURE0);
      this._uniforms(P.comp, s);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    } else {
      // Durchgang 2 (alt): Zwischenbild mit Leuchten (7 Abfragen pro Pixel) auf den Bildschirm
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, vw, vh);
      gl.bindTexture(gl.TEXTURE_2D, f.tex[dst]);
      this._uniforms(P.post, s);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    if (!tiny) f.src = dst;     // beim Vorbereiten nicht umschalten: das echte Bild bleibt erhalten
  };

  window.ACID_SHADERS = SHADERS;
  window.AcidShaderPlayer = AcidShaderPlayer;
})();
