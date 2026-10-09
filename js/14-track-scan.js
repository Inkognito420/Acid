// Acid Milkdrop · Teil 14 von 16: Track-Scan: Datei vorab analysieren
// Alle Teile teilen sich einen gemeinsamen Bereich (wie vorher der eine große Block in index.html).
// Reihenfolge ist wichtig: index.html lädt sie nacheinander. Bricht ein Teil ab, starten die folgenden nicht.
if (window.__AM_STEP !== 13) throw new Error('Acid Milkdrop: Teil 14 (track-scan) nicht gestartet, ein früherer Teil ist abgebrochen');

// ===== Track-Scan =====
function getDuration(file) {
  return new Promise(res => {
    const a = new Audio(); const url = URL.createObjectURL(file);
    let to = 0;
    const done = v => { clearTimeout(to); URL.revokeObjectURL(url); a.removeAttribute('src'); res(v); };
    to = setTimeout(() => done(NaN), 5000);
    a.preload = 'metadata';
    a.onloadedmetadata = () => done(a.duration);
    a.onerror = () => done(NaN);
    a.src = url;
  });
}
const tick = () => new Promise(r => setTimeout(r, 0));
async function analyzeFile(file) {
  const dur = await getDuration(file);
  if ((isFinite(dur) && dur > 900) || (!isFinite(dur) && file.size > 40e6) || file.size > 150e6) return { skipped: 'lang' };
  const report = p => { if (file === curFile) setTrackInfo('Scan ' + Math.round(p * 100) + ' %'); };
  report(0);
  const raw = await file.arrayBuffer();
  const decoded = await new Promise((res, rej) => { const p = ctx.decodeAudioData(raw, res, rej); if (p && p.then) p.then(res, rej); });
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  let SR = 22050;
  try { new OAC(1, 1, SR); } catch (e) { SR = 44100; }
  const hop = Math.round(SR * 0.02322);
  const segFrames = Math.round(60 / (hop / SR));
  const total = Math.floor(decoded.duration * SR / hop);
  const SUB = 4;                                     // Bassband zusätzlich 4x feiner (ca. 6 ms) für genaues Tempo
  const env = { lowF: new Float32Array(total * SUB), low: new Float32Array(total), m1: new Float32Array(total), m2: new Float32Array(total), hi: new Float32Array(total), full: new Float32Array(total) };
  const keys = ['low', 'm1', 'm2', 'hi', 'full'];
  for (let f0 = 0; f0 < total; f0 += segFrames) {
    const frames = Math.min(segFrames, total - f0);
    const off = new OAC(5, frames * hop, SR);
    const src = off.createBufferSource(); src.buffer = decoded;
    const merger = off.createChannelMerger(5);
    const bq = (type, f) => { const b = off.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = 0.707; return b; };
    const chain = (...nodes) => { let p = src; for (const n of nodes) { p.connect(n); p = n; } return p; };
    chain(bq('lowpass', 130), bq('lowpass', 130)).connect(merger, 0, 0);
    chain(bq('highpass', 300), bq('lowpass', 1000)).connect(merger, 0, 1);
    chain(bq('highpass', 1000), bq('lowpass', 3000)).connect(merger, 0, 2);
    chain(bq('highpass', 7000), bq('highpass', 7000)).connect(merger, 0, 3);
    src.connect(merger, 0, 4);
    merger.connect(off.destination);
    src.start(0, f0 * hop / SR, frames * hop / SR);
    const r = await off.startRendering();
    for (let c = 0; c < 5; c++) {
      const d = r.getChannelData(c), out = env[keys[c]];
      for (let f = 0; f < frames; f++) {
        let s = 0; const base = f * hop;
        for (let k = 0; k < hop; k++) { const v = d[base + k]; s += v * v; }
        out[f0 + f] = Math.sqrt(s / hop);
        if (c === 0) {
          const sh = hop / SUB;
          for (let u = 0; u < SUB; u++) {
            let s2 = 0; const b2 = base + Math.round(u * sh), e2 = base + Math.round((u + 1) * sh);
            for (let k = b2; k < e2; k++) { const v = d[k]; s2 += v * v; }
            env.lowF[(f0 + f) * SUB + u] = Math.sqrt(s2 / Math.max(1, e2 - b2));
          }
        }
      }
    }
    report(Math.min(0.95, (f0 + frames) / total));
    await tick();
  }
  const A = analyzeEnvelopes(env, hop / SR);
  A.file = file;
  return A;
}
function ensureScan(file) {
  if (!scanCache.has(file)) {
    const p = scanChain.then(() => analyzeFile(file)).catch(() => ({ skipped: 'fehler' }));
    scanChain = p.then(() => {});
    scanCache.set(file, p);
  }
  return scanCache.get(file);
}

function moodText(md) {
  const tone = md.bright < 0.38 ? 'dunkel' : md.bright > 0.62 ? 'hell' : 'neutral';
  const drive = md.energy > 0.6 ? 'treibend' : md.energy < 0.35 ? 'ruhig' : 'mittel';
  return tone + ' · ' + drive + ' · Acid ' + Math.round(md.acid * 100) + ' %';
}
function drawTimeline(A) {
  const tl = $('timeline');
  if (!A || !A.grid) { tl.hidden = true; return; }
  const dur = audio.duration && isFinite(audio.duration) ? audio.duration : A.duration;
  tl.innerHTML = A.sections.map(s => '<span class="t-' + s.type + '" style="left:' + (100 * s.t0 / dur).toFixed(3) + '%;width:' + (100 * (s.t1 - s.t0) / dur).toFixed(3) + '%"></span>').join('') + '<span id="head" style="left:0"></span>';
  tl.hidden = false;
}
function moveHead() {
  const h = document.getElementById('head');
  if (!h || !curAnalysis || !audio.duration) return;
  h.style.left = (100 * audio.currentTime / audio.duration).toFixed(2) + '%';
}

window.__AM_STEP = 14;
