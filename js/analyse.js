// ===== Track-Analyse (reine Rechenfunktion, ohne Browser-Abhängigkeiten) =====
// env: {low, m1, m2, hi, full} als Float32Arrays mit RMS pro Frame, hopS: Sekunden pro Frame
function analyzeEnvelopes(env, hopS) {
  const N = env.full.length;
  const clamp = v => Math.max(0, Math.min(1, v));
  const mean = (a, s = 0, e = a.length) => { let x = 0; for (let i = s; i < e; i++) x += a[i]; return e > s ? x / (e - s) : 0; };

  // Kick-Onsets aus dem Bassband
  const o = new Float32Array(N);
  for (let i = 1; i < N; i++) o[i] = Math.max(0, env.low[i] - env.low[i - 1]);

  // Tempo: Raster mit der stärksten Kick-Übereinstimmung, 100–200 BPM
  let best = -1, bpm = 140, phase = 0;
  for (let b = 100; b <= 200; b += 0.25) {
    const P = 60 / b / hopS;
    let sc = -1, ph = 0;
    for (let p = 0; p < P; p += P / 16) {
      let s = 0, c = 0;
      for (let x = p; x < N - 1; x += P) { const i = Math.round(x); s += o[i] + 0.5 * ((i > 0 ? o[i - 1] : 0) + o[i + 1]); c++; }
      s /= Math.max(1, c);
      if (s > sc) { sc = s; ph = p; }
    }
    const w = 1 + 0.08 * Math.exp(-(((b - 140) / 25) ** 2));
    if (sc * w > best) { best = sc * w; bpm = b; phase = ph; }
  }
  // Phase fein nachziehen
  let Pf = 60 / bpm / hopS;
  let bestPh = phase, bestS = -1;
  for (let p = phase - Pf / 16; p <= phase + Pf / 16; p += 0.25) {
    let s = 0; for (let x = p; x < N - 1; x += Pf) { const i = Math.round(x); if (i >= 0) s += o[i]; }
    if (s > bestS) { bestS = s; bestPh = p; }
  }
  phase = ((bestPh % Pf) + Pf) % Pf;

  // Feinabgleich: jeden Kick einzeln im 6-ms-Raster suchen und eine Gerade durch alle legen.
  // Ergebnis: Tempo auf ca. 0,01 BPM genau, das Raster driftet bis zum Track-Ende nicht weg.
  if (env.lowF && env.lowF.length > 64) {
    const q = env.lowF.length / N, L = env.lowF.length, of = new Float32Array(L), Pf0 = Pf;
    for (let i = 1; i < L; i++) of[i] = Math.max(0, env.lowF[i] - env.lowF[i - 1]);
    // Startfenster: die 32 Schläge mit dem stärksten Kick; dann Fenster verdoppeln, bis der ganze Track drin ist
    const K0 = Math.floor((L - 2 - phase * q) / (Pf * q));
    let c0 = 0, cBest = -1;
    for (let k = 0; k + 32 <= K0; k += 8) {
      let e = 0; for (let j = k; j < k + 32; j++) { const i = Math.round(phase + j * Pf); if (i > 0 && i < N) e += o[i]; }
      if (e > cBest) { cBest = e; c0 = k + 16; }
    }
    for (let span = 32, it = 0; it < 14; it++, span = Math.min(span * 2, 2 * K0 + 2)) {
      const P4 = Pf * q, ph4 = phase * q, win = P4 * 0.12, pk = [];
      const kLo = Math.max(0, Math.round(c0 - span / 2)), kHi = Math.min(K0, Math.round(c0 + span / 2));
      for (let k = kLo; k < kHi; k++) {
        const c = ph4 + k * P4; let bi = -1, bv = 0;
        for (let i = Math.max(1, Math.ceil(c - win)); i <= Math.min(L - 2, Math.floor(c + win)); i++) if (of[i] > bv) { bv = of[i]; bi = i; }
        if (bi > 0) {
          const a1 = of[bi - 1], a3 = of[bi + 1], den = a1 - 2 * bv + a3;
          const d = den < 0 ? Math.max(-0.5, Math.min(0.5, 0.5 * (a1 - a3) / den)) : 0;
          pk.push([k, bi + d, bv]);
        }
      }
      if (pk.length < 16) break;
      const vs = pk.map(p => p[2]).sort((x, y) => x - y), thr = Math.max(vs[Math.floor(vs.length * 0.4)], 0.25 * vs[Math.floor(vs.length * 0.9)]);
      let sw = 0, sk = 0, st = 0, skk = 0, skt = 0;
      for (const [k, tt, v] of pk) if (v >= thr && v > 0) { sw += v; sk += v * k; st += v * tt; skk += v * k * k; skt += v * k * tt; }
      const det = sw * skk - sk * sk;
      if (!(det > 0)) break;
      const slope = (sw * skt - sk * st) / det, icpt = (st - slope * sk) / sw;
      const nP = slope / q;
      if (!isFinite(nP) || Math.abs(nP - Pf0) / Pf0 > 0.012) break;   // Sicherheitsnetz: nur kleine Korrekturen
      Pf = nP; phase = icpt / q;
      if (kLo === 0 && kHi === K0 && it >= 10) break;
    }
    phase = ((phase % Pf) + Pf) % Pf;
    bpm = 60 / (Pf * hopS);
  }
  const beatS = 60 / bpm;

  // Werte pro Schlag
  const K = Math.floor((N - phase) / Pf);
  const bFull = new Float32Array(K), bKick = new Float32Array(K), bHi = new Float32Array(K), bMid = new Float32Array(K);
  for (let k = 0; k < K; k++) {
    const s = Math.round(phase + k * Pf), e = Math.min(N, Math.round(phase + (k + 1) * Pf));
    bFull[k] = mean(env.full, s, e); bHi[k] = mean(env.hi, s, e); bMid[k] = mean(env.m2, s, e);
    let mx = 0; for (let i = Math.max(1, s - 2); i <= Math.min(N - 1, s + 2); i++) mx = Math.max(mx, o[i]);
    bKick[k] = mx;
  }

  // Takt-Eins: dort, wo sich der Klang von Takt zu Takt am deutlichsten ändert (quadriert, damit halbe Übergänge weniger zählen)
  let barPhase = 0, bestBar = -1;
  for (let b = 0; b < 4; b++) {
    let s = 0, c = 0;
    for (let k = b + 4; k + 4 <= K; k += 4) {
      const dd = (mean(bFull, k, k + 4) - mean(bFull, k - 4, k)) / (mean(bFull, k - 4, k + 4) + 1e-9);
      s += dd * dd;
      c++;
    }
    s /= Math.max(1, c);
    if (s > bestBar) { bestBar = s; barPhase = b; }
  }

  // Kick pro Takt
  const nBars = Math.max(0, Math.floor((K - barPhase) / 4));
  const kickness = new Float32Array(nBars), barLow = new Float32Array(nBars);
  for (let j = 0; j < nBars; j++) {
    kickness[j] = mean(bKick, barPhase + 4 * j, barPhase + 4 * j + 4);
    const s = Math.round(phase + (barPhase + 4 * j) * Pf), e = Math.min(N, Math.round(phase + (barPhase + 4 * j + 4) * Pf));
    barLow[j] = mean(env.low, s, e);
  }
  const pct = (arr, q) => { const s = Array.from(arr).sort((a, b) => a - b); return s[Math.floor(s.length * q)] || 0; };
  const p75 = pct(kickness, 0.75), p75Low = pct(barLow, 0.75);
  // Kick-Takt: deutliche Kick-Anschläge und voller Bassdruck. Halbe Takte und einzelne Fill-Kicks zählen nicht.
  const kick = Array.from(kickness, (v, j) => p75 > 0 && v > 0.35 * p75 && barLow[j] > 0.5 * p75Low);
  for (let j = 1; j < nBars - 1; j++) if (!kick[j] && kick[j - 1] && kick[j + 1]) kick[j] = true;
  for (let j = 1; j < nBars - 1; j++) if (kick[j] && !kick[j - 1] && !kick[j + 1]) kick[j] = false;
  const kickShare = kick.filter(Boolean).length / Math.max(1, nBars);
  const grid = nBars >= 8 && kickShare >= 0.2;

  const barT = j => (phase + (barPhase + 4 * j) * Pf) * hopS;
  const types = new Array(nBars).fill('groove');
  const first = kick.indexOf(true), last = kick.lastIndexOf(true);
  if (grid) {
    for (let j = 0; j < nBars; j++) {
      if (j < first) types[j] = 'intro';
      else if (j > last) types[j] = 'outro';
    }
    // Läufe ohne Kick zwischen erstem und letztem Kick
    let j = first;
    while (j <= last) {
      if (!kick[j]) {
        let e = j; while (e <= last && !kick[e]) e++;
        const len = e - j;
        if (len >= 4) {
          for (let x = j; x < e; x++) types[x] = 'break';
          // Build-up: letzte Takte des Breaks, wenn Höhen und Mitten ansteigen
          const n = Math.min(8, Math.floor(len / 2));
          const a = mean(bHi, barPhase + 4 * j, barPhase + 4 * (j + 2)) + mean(bMid, barPhase + 4 * j, barPhase + 4 * (j + 2));
          const z = mean(bHi, barPhase + 4 * (e - 2), barPhase + 4 * e) + mean(bMid, barPhase + 4 * (e - 2), barPhase + 4 * e);
          if (n >= 2 && z > a * 1.15) for (let x = e - n; x < e; x++) types[x] = 'buildup';
          // Drop: die ersten 4 Takte, wenn der Kick zurückkommt
          for (let x = e; x < Math.min(e + 4, last + 1); x++) types[x] = 'drop';
        }
        j = e;
      } else j++;
    }
    // Langes Intro ohne Kick: Einstieg des Kicks zählt als Drop
    if (first >= 8) for (let x = first; x < Math.min(first + 4, nBars); x++) if (types[x] === 'groove') types[x] = 'drop';
  }

  // Abschnitte zusammenfassen
  const sections = [];
  for (let j = 0; j < nBars; j++) {
    const ty = grid ? types[j] : 'groove';
    const s = sections[sections.length - 1];
    if (s && s.type === ty) { s.endBar = j + 1; s.t1 = barT(j + 1); }
    else sections.push({ type: ty, startBar: j, endBar: j + 1, t0: barT(j), t1: barT(j + 1) });
  }
  if (sections.length) { sections[0].t0 = 0; sections[sections.length - 1].t1 = N * hopS; }
  else sections.push({ type: 'groove', startBar: 0, endBar: 0, t0: 0, t1: N * hopS });

  // Stimmung des Tracks aus den Abschnitten mit Kick
  let sl = 0, sm1 = 0, sm2 = 0, shi = 0, sfull = 0, cnt = 0, sweep = 0, swc = 0, mod = 0, modc = 0;
  const beatFrames = Math.max(2, Math.round(Pf));
  for (let j = 0; j < nBars; j++) {
    if (grid && !(types[j] === 'groove' || types[j] === 'drop')) continue;
    const s = Math.round(phase + (barPhase + 4 * j) * Pf), e = Math.min(N, Math.round(phase + (barPhase + 4 * j + 4) * Pf));
    for (let i = s; i < e; i++) {
      sl += env.low[i]; sm1 += env.m1[i]; sm2 += env.m2[i]; shi += env.hi[i]; sfull += env.full[i]; cnt++;
      if (i > s) { const m = env.m1[i] + env.m2[i], mp = env.m1[i - 1] + env.m2[i - 1]; mod += Math.abs(m - mp); modc += m; }
    }
    // Filterfahrten: wie stark sich das Verhältnis hohe/tiefe Mitten innerhalb eines Schlags bewegt
    for (let b = s; b + beatFrames <= e; b += beatFrames) {
      let rs = 0, rq = 0;
      for (let i = b; i < b + beatFrames; i++) { const r = env.m2[i] / (env.m1[i] + env.m2[i] + 1e-9); rs += r; rq += r * r; }
      const mu = rs / beatFrames; sweep += Math.sqrt(Math.max(0, rq / beatFrames - mu * mu)); swc++;
    }
  }
  cnt = Math.max(1, cnt);
  const rmsDb = 20 * Math.log10(sfull / cnt + 1e-9);
  const brightRatio = shi / (sm1 + sm2 + shi + 1e-9);
  const sw = sweep / Math.max(1, swc), md = mod / Math.max(1e-9, modc);
  const mood = {
    energy: clamp(0.5 * clamp((rmsDb + 14) / 10) + 0.5 * clamp((bpm - 118) / 30)),
    bright: clamp((brightRatio - 0.02) / 0.2),
    acid: clamp(clamp((sw - 0.04) / 0.12) * 0.6 + clamp((md - 0.08) / 0.25) * 0.4)
  };
  // Übergangslänge in ganzen Takten, vorab pro Abschnitt festgelegt: laute Grooves 2 Takte, ruhigere und Breaks/Intro/Outro 4 Takte.
  // Kurze Abschnitte bekommen höchstens die Hälfte ihrer Länge, damit der Übergang im Abschnitt fertig wird.
  const baseBars = { intro: 4, groove: mood.energy >= 0.65 ? 2 : 4, break: 4, buildup: 2, drop: 2, outro: 4 };
  for (const s of sections) s.blendBars = Math.max(1, Math.min(baseBars[s.type] || 2, Math.floor((s.endBar - s.startBar) / 2) || 1));
  const drops = sections.filter(s => s.type === 'drop').length;

  // Treffer-Listen für „Instrumente hören“, vorab aus dem Track: Mitten- und Höhen-Anschläge (Zeit in s, Stärke 0..1 im Wechsel)
  // und die Stärke jedes Schlags. So kommen sie punktgenau, die Live-Erkennung käme ca. 60–80 ms später. Gleiche Regel wie die Live-Melder (onsetStep).
  const onsetList = (x, k, tau, minGap, skip) => {
    const out = [], dtm = hopS * 1000, ca = 1 - Math.exp(-dtm / tau), cb = 1 - Math.exp(-dtm / 2500);
    let prev = 0, mean = 0, varr = 0, avg = 0, last = -1e9;
    for (let i = 1; i < x.length; i++) {
      const e = x[i], flux = Math.max(0, e - prev); prev = e;
      mean += (flux - mean) * ca; varr += ((flux - mean) ** 2 - varr) * ca; avg += (e - avg) * cb;
      const thr = mean + k * Math.sqrt(varr), tm = i * dtm;
      if (flux > thr && e > avg * 0.8 && e > 1e-5 && tm - last > minGap && !(skip && skip(tm))) { last = tm; out.push((i + 0.35) * hopS, Math.min(1, flux / (thr * 1.8 + 1e-9))); }
    }
    return Float32Array.from(out);
  };
  const kickMs = []; { const kl = onsetList(env.low, 2.0, 600, 180); for (let i = 0; i < kl.length; i += 2) kickMs.push(kl[i] * 1000); }
  let kp = 0;
  const nearKick = tm => { while (kp < kickMs.length && kickMs[kp] < tm - 45) kp++; return kp < kickMs.length && kickMs[kp] <= tm + 45; };   // Klick des Kicks in den Mitten nicht als Mitten-Anschlag zählen (tm steigt von Aufruf zu Aufruf)
  const midX = new Float32Array(N); for (let i = 0; i < N; i++) midX[i] = Math.hypot(env.m1[i], env.m2[i]);
  const onM = onsetList(midX, 1.6, 500, 80, nearKick), onH = onsetList(env.hi, 1.6, 400, 55);
  const refK = pct(bKick, 0.75) || 1e-9, kA = new Float32Array(K); for (let k = 0; k < K; k++) kA[k] = clamp(bKick[k] / refK);

  // Steckbrief fürs Mitschreiben: pro Takt wenige Zahlen als Hex-Text (kein Ton, ca. 14 Zeichen pro Takt).
  // Pegel 0..255 bezogen auf den 95-%-Wert des Tracks; dazu Abschnittsbuchstabe, Kicks im Takt (0..4) und Zahl der Mitten-/Höhen-Anschläge.
  // Damit lassen sich Scan, Melder und „Instrumente hören“ später am Rechner an echten Tracks nachspielen.
  let fp = null;
  if (grid && nBars > 0) {
    const perBar = get => {
      const a = new Float32Array(nBars);
      for (let j = 0; j < nBars; j++) {
        const s = Math.max(0, Math.round(phase + (barPhase + 4 * j) * Pf)), e = Math.min(N, Math.round(phase + (barPhase + 4 * j + 4) * Pf));
        let x = 0; for (let i = s; i < e; i++) x += get(i);
        a[j] = e > s ? x / (e - s) : 0;
      }
      return a;
    };
    const h2 = v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
    const lv = a => { const ref = pct(a, 0.95) || 1e-9; let t = ''; for (let j = 0; j < a.length; j++) t += h2(255 * a[j] / ref); return t; };
    const cnt = list => {
      const c = new Array(nBars).fill(0), t0b = barT(0), t1b = barT(nBars); let j = 0;
      for (let i = 0; i < list.length; i += 2) { const t = list[i]; if (t < t0b || t >= t1b) continue; while (j < nBars - 1 && t >= barT(j + 1)) j++; c[j]++; }
      return c.map(h2).join('');
    };
    const letter = { intro: 'i', groove: 'g', break: 'b', buildup: 'u', drop: 'd', outro: 'o' };
    let kc = ''; for (let j = 0; j < nBars; j++) { let n = 0; for (let b = 0; b < 4; b++) { const k = barPhase + 4 * j + b; if (k < K && kA[k] >= 0.35) n++; } kc += n; }
    fp = {
      b0: +(phase * hopS).toFixed(3), bs: +beatS.toFixed(4), bp: barPhase, n: nBars,
      lo: lv(perBar(i => env.low[i])), mi: lv(perBar(i => env.m1[i] + env.m2[i])), hi: lv(perBar(i => env.hi[i])), fu: lv(perBar(i => env.full[i])),
      ty: types.map(t => letter[t] || 'g').join(''), kc, om: cnt(onM), oh: cnt(onH)
    };
  }
  return { grid, bpm, beatS, beat0: phase * hopS, barPhase, sections, mood, drops, duration: N * hopS, onM, onH, kA, fp };
}

// ===== Schläge und Töne trennen (Build 41) =====
// Nach FitzGerald 2010 „Harmonic/Percussive Separation using Median Filtering“ (DAFx):
// Im Klangbild sind Schläge (Kick, Hats, Claps) kurze senkrechte Striche (kurz, alle Höhen), Töne (303, Synths, Pads)
// lange waagrechte Striche (bleiben auf einer Höhe). Median über die Zeit behält die Töne, Median über die Höhen die
// Schläge. Daraus pro Takt: wie stark Kick (Schlag unter 100 Hz), Töne (150–3000 Hz) und Hats (Schlag ab 6 kHz) sind.
const KLANG_FFT = 1024, KLANG_NB = 64, KLANG_F0 = 40, KLANG_F1 = 10000;
function klangSetup(SR) {
  const N = KLANG_FFT, win = new Float32Array(N), cos = new Float32Array(N / 2), sin = new Float32Array(N / 2), rev = new Uint16Array(N);
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N);
  for (let i = 0; i < N / 2; i++) { cos[i] = Math.cos(-2 * Math.PI * i / N); sin[i] = Math.sin(-2 * Math.PI * i / N); }
  for (let i = 0, bits = Math.log2(N); i < N; i++) { let r = 0; for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b); rev[i] = r; }
  // Bänder 40 Hz … 10 kHz: unten jedes FFT-Fach ein eigenes Band (sonst blieben tiefe Bänder leer), oben je 10 % breiter
  const binHz = SR / N, top = Math.min(KLANG_F1, SR / 2 * 0.95), edges = [KLANG_F0];
  while (edges[edges.length - 1] < top && edges.length <= KLANG_NB) edges.push(Math.max(edges[edges.length - 1] * 1.1, edges[edges.length - 1] + binHz));
  const NB = edges.length - 1, bandOf = new Int16Array(N / 2).fill(-1), fc = new Float32Array(NB);
  for (let k = 1; k < N / 2; k++) { const f = k * binHz; for (let b = 0; b < NB; b++) if (f >= edges[b] && f < edges[b + 1]) { bandOf[k] = b; break; } }
  for (let b = 0; b < NB; b++) fc[b] = Math.sqrt(edges[b] * edges[b + 1]);
  return { N, NB, win, cos, sin, rev, bandOf, fc, re: new Float32Array(N), im: new Float32Array(N) };
}
// Ein Bild: Ausschnitt ab pos (fehlende Proben = 0), Stärke pro Band in out[o..o+NB)
function klangFrame(K, d, pos, out, o) {
  const N = K.N, re = K.re, im = K.im;
  for (let i = 0; i < N; i++) { const j = K.rev[i], p = pos + j; re[i] = p < d.length ? d[p] * K.win[j] : 0; im[i] = 0; }
  for (let size = 2; size <= N; size <<= 1) {
    const half = size >> 1, step = N / size;
    for (let s = 0; s < N; s += size) for (let k = 0; k < half; k++) {
      const c = K.cos[k * step], sn = K.sin[k * step], a = s + k, b = a + half;
      const tr = re[b] * c - im[b] * sn, ti = re[b] * sn + im[b] * c;
      re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
    }
  }
  const NB = K.NB;
  for (let b = 0; b < NB; b++) out[o + b] = 0;
  for (let k = 1; k < N / 2; k++) { const b = K.bandOf[k]; if (b >= 0) out[o + b] += re[k] * re[k] + im[k] * im[k]; }
  for (let b = 0; b < NB; b++) out[o + b] = Math.sqrt(out[o + b]);
}
function median(a, n) {                 // a wird sortiert (Einfügen, n ist klein)
  for (let i = 1; i < n; i++) { const v = a[i]; let j = i - 1; while (j >= 0 && a[j] > v) { a[j + 1] = a[j]; j--; } a[j + 1] = v; }
  return a[n >> 1];
}
// M: Stärke pro Bild und Band (T x NB). Ergebnis pro Bild: Kick (Schlag tief), Töne (150–3000 Hz), Hats (Schlag hoch)
async function klangSplit(M, T, fc, tick) {
  const NB = fc.length, LT = 8, LF = 4, buf = new Float32Array(2 * LT + 1);
  const kick = new Float32Array(T), ton = new Float32Array(T), hat = new Float32Array(T);
  const bK = [], bT = [], bH = [];
  for (let b = 0; b < NB; b++) { if (fc[b] < 100) bK.push(b); if (fc[b] >= 150 && fc[b] <= 3000) bT.push(b); if (fc[b] >= 6000) bH.push(b); }
  const isK = new Uint8Array(NB), isT = new Uint8Array(NB), isH = new Uint8Array(NB);
  bK.forEach(b => isK[b] = 1); bT.forEach(b => isT[b] = 1); bH.forEach(b => isH[b] = 1);
  const H = new Float32Array(NB);
  for (let t = 0; t < T; t++) {
    const o = t * NB;
    for (let b = 0; b < NB; b++) {                                   // Töne: Median über die Zeit
      let n = 0; for (let k = -LT; k <= LT; k++) { const tt = t + k; buf[n++] = M[(tt < 0 ? 0 : tt >= T ? T - 1 : tt) * NB + b]; }
      H[b] = median(buf, n);
    }
    let sk = 0, st = 0, sh = 0;
    for (let b = 0; b < NB; b++) {                                   // Schläge: Median über die Höhen
      let n = 0; for (let k = -LF; k <= LF; k++) { const bb = b + k; if (bb >= 0 && bb < NB) buf[n++] = M[o + bb]; }
      const P = median(buf, n), m = M[o + b], h2 = H[b] * H[b], p2 = P * P, den = h2 + p2 + 1e-12, e = m * m;
      if (isK[b]) sk += e * p2 / den;
      if (isT[b]) st += e * h2 / den;
      if (isH[b]) sh += e * p2 / den;
    }
    kick[t] = Math.sqrt(sk); ton[t] = Math.sqrt(st); hat[t] = Math.sqrt(sh);
    if (tick && (t & 2047) === 2047) await tick();
  }
  return { kick, ton, hat };
}
// Pro Takt: Anteile Kick / Töne / Hats (je Kanal auf den eigenen 90-%-Wert des Tracks bezogen, quadriert, dann Anteile 0..1)
function klangBars(A, S, hopS) {
  if (!A || !A.grid || !S) return null;
  const T = S.kick.length, barS = 4 * A.beatS, t0 = A.beat0 + A.barPhase * A.beatS;
  const nBars = Math.max(1, Math.ceil((T * hopS - t0) / barS));
  const raw = [new Float32Array(nBars), new Float32Array(nBars), new Float32Array(nBars)], cnt = new Float32Array(nBars);
  for (let t = 0; t < T; t++) {
    const j = Math.floor((t * hopS - t0) / barS); if (j < 0 || j >= nBars) continue;
    raw[0][j] += S.kick[t]; raw[1][j] += S.ton[t]; raw[2][j] += S.hat[t]; cnt[j]++;
  }
  for (const r of raw) for (let j = 0; j < nBars; j++) r[j] /= Math.max(1, cnt[j]);
  const p90 = r => { const s = Array.from(r).filter(x => x > 0).sort((a, b) => a - b); return s.length ? s[Math.floor(s.length * 0.9)] : 1; };
  const ref = raw.map(p90), share = new Float32Array(nBars * 3);
  for (let j = 0; j < nBars; j++) {
    if (raw[0][j] + raw[1][j] + raw[2][j] < 1e-6) continue;           // Stille
    const v = raw.map((r, c) => { const x = Math.min(1.5, r[j] / (ref[c] + 1e-9)); return x * x; }), sum = v[0] + v[1] + v[2];   // quadriert: mehr Unterschied zwischen den Teilen
    for (let c = 0; c < 3; c++) share[j * 3 + c] = sum > 0.05 ? v[c] / sum : 0;
  }
  return { t0, barS, n: nBars, share };
}
// Für das Protokoll: mittlere Anteile je Abschnittsart, z. B. „Groove Kick 41 / Töne 33 / Hats 26 % · Break …“
function klangSummary(A) {
  const K = A.klang; if (!K) return '';
  const acc = {}, NAME = { intro: 'Intro', groove: 'Groove', break: 'Break', buildup: 'Aufbau', drop: 'Drop', outro: 'Outro' };
  for (let j = 0; j < K.n; j++) {
    const o = j * 3, sum = K.share[o] + K.share[o + 1] + K.share[o + 2]; if (sum < 0.5) continue;
    const tm = K.t0 + (j + 0.5) * K.barS, s = (A.sections || []).find(x => tm >= x.t0 && tm < x.t1); const k = s ? s.type : 'groove';
    const a = acc[k] || (acc[k] = [0, 0, 0, 0]); a[0] += K.share[o]; a[1] += K.share[o + 1]; a[2] += K.share[o + 2]; a[3]++;
  }
  return Object.keys(acc).map(k => { const a = acc[k], p = x => Math.round(100 * x / a[3]); return (NAME[k] || k) + ' Kick ' + p(a[0]) + ' / Töne ' + p(a[1]) + ' / Hats ' + p(a[2]) + ' %'; }).join(' · ');
}
