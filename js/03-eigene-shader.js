// Acid Milkdrop · Teil 3 von 16: Eigene Shader und Track-Flug (eigene Zeichenfläche über Butterchurn)
// Alle Teile teilen sich einen gemeinsamen Bereich (wie vorher der eine große Block in index.html).
// Reihenfolge ist wichtig: index.html lädt sie nacheinander. Bricht ein Teil ab, starten die folgenden nicht.
if (window.__AM_STEP !== 2) throw new Error('Acid Milkdrop: Teil 3 (eigene-shader) nicht gestartet, ein früherer Teil ist abgebrochen');

// ===== Eigene Shader (acid-shader.js): eigene Zeichenfläche über Butterchurn, ca. 15 % der Wechsel =====
// Läuft getrennt vom Ton-Weg. Fehlt die Datei oder startet die Grafik nicht, läuft alles wie vorher.
const shEl = $('sh'), SH = {};
try { (window.ACID_SHADERS || []).forEach(d => { SH['Eigen · ' + d.name] = d; }); } catch (e) {}
let shPlayer = null, shCur = null, shOp = 0, shFrom = 0, shTo = 0, shT0 = 0, shDur = 0;
let shTime = 0, shLastT = 0, shBar = 0, shHue0 = 0, lastShStyle = '';
const shLv = { b: 0, m: 0, h: 0, pb: 1e-4, pm: 1e-4, ph: 1e-4 };
// ===== Track-Flug (Build 36): durch den Track fliegen =====
// Der Shader „Track-Flug“ (acid-shader.js) bekommt den ganzen gescannten Track als Textur und zeigt die nächsten Takte als Tunnel vor dir:
// Kicks = Rahmen, die genau auf dem Schlag den Bildrand erreichen, Hats = Punkte, Mitten (303) = Bögen, Abschnittswechsel = große Ringe, nächster Drop = Wand am Ende.
// Automatisch ab 12 Takten vor einem Drop bis 8 Takte danach (Schalter „Track-Flug bei Drops“); Knopf „Flug“ = Dauer-Modus für jeden gescannten Track.
// Solange er läuft, warten die automatischen Wechsel (Phrase, Abschnitt, Zeitgeber); Wischen, Doppeltipp und Wächter beenden ihn wie jedes andere Bild.
const FLUG_NAME = 'Eigen · Track-Flug';
const FLUG_LEAD_BARS = 12, FLUG_AFTER_BARS = 8, FLUG_COOL_BARS = 24;
const flug = { clk: 0, clkT: 0, ok: false, endTs: 0, coolUntil: 0, mode: false, release: false, why: '', t0: 0, kind: '', fpsSum: 0, fpsN: 0, fpsMin: 99, lastLeave: 0 };
const isFlug = () => shCur === FLUG_NAME;
function syncFlugBtn() { const b = $('flugBtn'); if (!b) return; const on = flug.mode || isFlug(); b.classList.toggle('hot', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); }
// Spielzeit des Tracks in Sekunden: lokale Uhr, die sich sanft an audio.currentTime anlehnt (currentTime kommt im iPhone leicht ruckelig an,
// die Rahmen im Tunnel würden sonst zittern). Beim Springen oder großer Abweichung sofort neu setzen.
function flugClock(t) {
  const raw = audio.currentTime - (+latEl.value) / 1000;
  const dt = flug.clkT ? Math.min(0.1, Math.max(0, (t - flug.clkT) / 1000)) : 0; flug.clkT = t;
  if (!flug.ok || audio.seeking || Math.abs(flug.clk - raw) > 0.35) { flug.clk = raw; flug.ok = true; }
  else {
    if (!audio.paused) flug.clk += dt * (audio.playbackRate || 1);
    flug.clk += (raw - flug.clk) * (1 - Math.exp(-dt / 0.15));
  }
  return flug.clk;
}
// Track als Textur zum Spieler bringen (einmal pro Track, die Textur bleibt an der Analyse hängen)
function flugPrepare() {
  const A = curAnalysis;
  if (!A || !A.grid || !shEnsure()) return false;
  if (shPlayer.trk.id === A) return true;
  try {
    if (!A._flugT) A._flugT = window.AcidShaderPlayer.buildTrack(A);
    if (!A._flugT) return false;
    shPlayer.setTrack(A._flugT, A);
    rea('Track-Flug: Track als Textur geladen (' + A._flugT.n + ' Schritte, ' + A._flugT.w + '×' + A._flugT.h + ')');
    return true;
  } catch (e) { err('Track-Flug: Textur fehlgeschlagen (' + e.message + ')'); broken.add(FLUG_NAME); flug.mode = false; return false; }
}
const flugReady = manual => !!(SH[FLUG_NAME] && usable(FLUG_NAME) && curAnalysis && curAnalysis.grid && !micOn && (manual || toggles.own));
function flugStart(kind, info) {
  if (!flugReady(kind === 'hand' || kind === 'mode')) return false;
  flug.ok = false; flug.kind = kind;
  const ok = loadByName(FLUG_NAME, kind === 'drop' ? blendSecs(sectionKey()) : 2, true, 'l');
  if (ok) { flug.t0 = performance.now(); flug.fpsSum = 0; flug.fpsN = 0; flug.fpsMin = 99; rea('Track-Flug: Start (' + (kind === 'drop' ? 'Drop in ' + info + ' Takten' : kind === 'hand' ? 'Knopf' : 'Dauer-Modus') + ')'); }
  else { flug.coolUntil = performance.now() + FLUG_COOL_BARS * 4 * curAnalysis.beatS * 1000; if (kind !== 'drop') flug.mode = false; }
  syncFlugBtn(); return ok;
}
// Ende des Laufs vermerken (egal wie er endete: Abschnitt, Wischen, Wächter ...)
function flugEnded(why) {
  const secs = Math.round((performance.now() - flug.t0) / 1000);
  rea('Track-Flug: beendet (' + why + ') nach ' + secs + ' s' + (flug.fpsN ? ', Ø ' + Math.round(flug.fpsSum / flug.fpsN) + ' fps, tiefster ' + flug.fpsMin : ''));
  flug.coolUntil = performance.now() + FLUG_COOL_BARS * 4 * (curAnalysis ? curAnalysis.beatS : 0.45) * 1000;   // Sperre in echter Zeit: gilt auch über Trackwechsel und Spulen
  flug.endTs = 0; flug.lastLeave = performance.now();
}
function flugLeave(info, tag) {
  if (!isFlug()) return;
  flug.why = info; flug.release = true;
  try { nextPreset(2.0, moodTarget(sectionKey()), false, tag || 's'); } finally { flug.release = false; }
  syncFlugBtn();
}
// Pro Bild: Zeit und Drop-Abstand (in Schlägen) für den Shader. false = der Flug kann nicht weiterlaufen (Track weg) und wird beendet.
function flugTick(t, S) {
  const A = curAnalysis;
  if (!A || !A.grid || micOn) { if (t - flug.lastLeave > 1500) { flug.lastLeave = t; flugLeave('kein Scan', 'k'); } return false; }
  if (shPlayer.trk.id !== A && !flugPrepare()) { if (t - flug.lastLeave > 1500) { flug.lastLeave = t; flugLeave('Textur', 'g'); } return false; }
  const ts = flugClock(t), bs = A.beatS;
  S.nb = (ts - A.beat0) / bs;
  const dr = A._drops || (A._drops = A.sections.filter(x => x.type === 'drop').map(x => x.t0));
  let nd = -1, ld = -1;
  for (const d of dr) { if (d >= ts) { nd = d; break; } ld = d; }
  S.dropIn = nd >= 0 ? (nd - ts) / bs : 1e3;
  S.sinceDrop = ld >= 0 ? (ts - ld) / bs : 1e3;
  if (window.__FLUG) flug.S = S;
  return true;
}
if (/[?&]debug\b/.test(location.search)) window.__FLUG = { flug, isFlug, flugStart, flugLeave, get A() { return curAnalysis; }, get shOp() { return shOp; }, get S() { return flug.S; } };   // nur zum Testen
// Im Scan-Modus pro Bild: Einstieg vor dem nächsten Drop, Ende nach dem Drop, Dauer-Modus nach einem Trackwechsel wieder aufnehmen
function flugAuto(A, ts, t) {
  if (frozen) return;                                           // Halten (Freeze): das laufende Bild bleibt, auch der Flug
  if (isFlug()) {
    if (auto && !flug.mode && flug.endTs > 0 && ts > flug.endTs && t - flug.lastLeave > 1500) { flug.lastLeave = t; flugLeave('nach dem Drop', 's'); }
    return;
  }
  if (audio.paused || t - lastSwitch < 3000) return;
  if (flug.mode) { flugStart('mode'); return; }                 // Dauer-Modus kommt auch mit Auto aus wieder (nach Trackwechsel)
  if (!auto || !toggles.flug || !toggles.own || !(t > flug.coolUntil) || !A._drops) return;
  let nd = -1; for (const d of A._drops) if (d > ts) { nd = d; break; }
  if (nd < 0) return;
  const left = (nd - ts) / (4 * A.beatS);
  if (left <= FLUG_LEAD_BARS && left >= 1) { flug.endTs = nd + FLUG_AFTER_BARS * 4 * A.beatS; if (!flugStart('drop', Math.round(left))) flug.endTs = 0; }
}
function shSize() {
  if (!W || !H) return;
  const T = targetSize(true);                                                         // ohne Lastbremse: die gilt nur für Milkdrop-Presets, eigene Shader laufen immer voll (halb)
  const w = Math.max(2, Math.round(T[0] * 0.5)), h = Math.max(2, Math.round(T[1] * 0.5));   // halbe Auflösung: spart Grafikleistung, Shader sind weich genug
  if (shEl.width !== w || shEl.height !== h) { shEl.width = w; shEl.height = h; }
}
function shEnsure() {
  if (shPlayer) return true;
  if (!window.AcidShaderPlayer) return false;
  try { shSize(); shPlayer = new window.AcidShaderPlayer(shEl); rea('Eigene Shader: Grafik gestartet (' + shEl.width + '×' + shEl.height + ')'); return true; }
  catch (e) { err('Eigene Shader: Grafik startet nicht (' + e.message + ')'); for (const n in SH) broken.add(n); return false; }
}
function shFade(to, secs) { shFrom = shOp; shTo = to; shT0 = performance.now(); shDur = Math.max(150, secs * 1000); }
function shShow(n, blend) {
  if (!shEnsure()) return false;
  const d = SH[n];
  if (d.track && !flugPrepare()) return false;
  if (!shPlayer.use(d.id)) { err('Eigener Shader kaputt: ' + n + ' · ' + (shPlayer.errors[d.id] || '')); broken.add(n); return false; }
  if (shCur !== n) shHue0 = Math.random();
  shCur = n; shFade(1, blend); return true;
}
// Stil aus dem Abschnitt und der Stimmung: Drop = Peak Time, viel 303 = Acid, ruhige Teile = Driving
function shStyle() {
  const sec = sectionKey(), md = trackMood();
  if (sec === 'drop') return 'peak';
  if ((snd.acid || 0) > 0.4 || (md && md.acid > 0.35)) return 'acid';
  if (sec === 'break' || sec === 'intro' || sec === 'outro') return 'driving';
  return md && md.energy > 0.6 ? 'peak' : 'driving';
}
function pickShader() {
  const st = shStyle(), lastFew = recent.slice(-8), all = Object.keys(SH).filter(n => !SH[n].track);
  const ok = n => usable(n) && n !== curName && !lastFew.includes(n);
  let a = all.filter(n => SH[n].style === st && ok(n));
  if (!a.length) a = all.filter(ok);
  if (!a.length) return null;
  const f = a.filter(n => favs.has(n)); if (f.length && Math.random() < 0.5) a = f;
  lastShStyle = st; return a[Math.floor(Math.random() * a.length)];
}
// Pegel für die Shader: Bass, Mitten (303), Höhen, je 0..1 an der eigenen Spitze gemessen
function shLevels(dt, b, m, h) {
  const k = Math.exp(-dt / 8000);
  shLv.pb = Math.max(shLv.pb * k, b, 1e-4); shLv.pm = Math.max(shLv.pm * k, m, 1e-4); shLv.ph = Math.max(shLv.ph * k, h, 1e-4);
  shLv.b = ema(shLv.b, clamp(b / shLv.pb), dt, 40); shLv.m = ema(shLv.m, clamp(m / shLv.pm), dt, 60); shLv.h = ema(shLv.h, clamp(h / shLv.ph), dt, 40);
}
// Vorbereiten: kurz nach dem Start jeden Shader einzeln übersetzen (unsichtbar), damit der erste echte Wechsel nicht ruckelt
let shWarmI = 0, shWarmAt = 0, shWarmMs = 0, shWarmMax = 0;
function shWarmStep(t) {
  const list = window.ACID_SHADERS || [];
  if (!toggles.own || frozen || shWarmI >= list.length || shCur || shOp >= 0.002) return;
  if (!shWarmAt) { shWarmAt = t + 1500; return; }            // erst 1,5 s nach dem Start, dann alle 0,3 s einer
  if (t < shWarmAt || !shEnsure()) return;
  const d = list[shWarmI++], ms = shPlayer.warm(d.id);
  shWarmAt = t + 300;
  if (ms < 0) { err('Eigener Shader kaputt: Eigen · ' + d.name + ' · ' + (shPlayer.errors[d.id] || '')); broken.add('Eigen · ' + d.name); }
  else { shWarmMs += ms; shWarmMax = Math.max(shWarmMax, ms); }
  if (shWarmI >= list.length) rea('Eigene Shader vorbereitet: ' + list.length + ' Stück, zusammen ' + Math.round(shWarmMs) + ' ms, längster ' + Math.round(shWarmMax) + ' ms');
}
function shFrame(t) {
  shWarmStep(t);
  if (shDur) { const p = Math.min(1, (t - shT0) / shDur); shOp = shFrom + (shTo - shFrom) * p; if (p >= 1) shDur = 0; }
  const o = shOp < 0.002 ? '0' : shOp.toFixed(3);
  if (shEl.style.opacity !== o) shEl.style.opacity = o;
  const dt = shLastT ? Math.min(100, t - shLastT) : 16; shLastT = t;
  if (shOp < 0.002 || !shPlayer || frozen) return;
  shTime += dt / 1000;
  shSize();
  try {
    const S = { time: shTime, bass: shLv.b, mid: shLv.m, treb: shLv.h, beat: kickGlow, bar: shBar,
      build: toggles.build ? build : 0, hue: (shHue0 + shTime * 0.003) % 1, flash: reduceMotion ? 0.3 : 1 };
    if (shCur === FLUG_NAME && !flugTick(t, S)) return;
    shPlayer.draw(S);
  } catch (e) { if (shCur) { err('Eigener Shader Fehler: ' + e.message); broken.add(shCur); nextPreset(0.5, undefined, false, 'g'); } }
}

window.__AM_STEP = 3;
