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
