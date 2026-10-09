// Misst für jedes Preset, wie stark es auf eine Filterfahrt (303 öffnet sich) mit Helligkeit und Farbsättigung reagiert.
// Aufruf: LIBS=<Ordner mit node_modules/butterchurn + butterchurn-presets> node test/messen-fahrt.js <ausgabe.json> [Teile=4] [nur-N-Presets]
// Je Preset drei Durchläufe (Filter öffnet sich / Filter bleibt gleich / noch einmal ohne Fahrt = Rauschen der Presets), gleiche Kick-Spur. Ergebnis [dHell, dSatt] = Änderung beim offenen
// gegenüber dem geschlossenen Filter, abzüglich der Eigenbewegung des Presets (Durchlauf ohne Fahrt). Positiv = wird heller / satter.
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..'), libs = process.env.LIBS;
const [out, partsArg, limitArg] = process.argv.slice(2), PARTS = +partsArg || 4, LIMIT = +limitArg || 0;
if (!out || !libs) { console.error('Aufruf: LIBS=<ordner> node test/messen-fahrt.js <ausgabe.json> [Teile] [nur-N]'); process.exit(2); }
const L = n => path.join(libs, 'node_modules', n);
const files = { '/bc.js': L('butterchurn/lib/butterchurn.min.js'), '/bp.js': L('butterchurn-presets/lib/butterchurnPresets.min.js'), '/bx.js': L('butterchurn-presets/lib/butterchurnPresetsExtra.min.js'), '/ap.js': path.join(root, 'acid-presets.js') };
const PAGE = `<!doctype html><meta charset=utf-8><canvas id=c width=128 height=72></canvas><script src=/bc.js></script><script src=/bp.js></script><script src=/bx.js></script><script src=/ap.js></script><script>
const SR = 44100, FR = 60, SPF = SR / FR, F = 330, W = 576;
function signal(ramp) {                      // Kick 140 BPM + 303-Säge, Filter: Rampe 250 → 5000 Hz (Frames 100-220) oder fest 1200 Hz
  const N = Math.ceil(F * SPF + W), s = new Float32Array(N); let lo = 0, bp = 0, seed = 5;
  for (let i = 0; i < N; i++) {
    const t = i / SR, fr = t * FR, beat = 60 / 140, ph = (t % beat) / beat;
    const kick = Math.sin(2 * Math.PI * (45 + 90 * Math.exp(-(t % beat) * 30)) * (t % beat)) * Math.exp(-(t % beat) * 8);
    const st = (t % (beat / 4)) / (beat / 4), saw = (2 * ((110 * t) % 1) - 1) * Math.exp(-st * 3);
    const fc = ramp ? 250 * Math.pow(20, Math.min(1, Math.max(0, (fr - 100) / 120))) : 1200;
    const g = 2 * Math.sin(Math.PI * Math.min(0.45, fc / SR)); lo += g * bp; const hi = saw - lo - 0.25 * bp; bp += g * hi;
    s[i] = 0.55 * kick + 0.5 * lo;
  }
  return s;
}
const SIG = [signal(true), signal(false), null]; SIG[2] = SIG[1];
const cv = document.getElementById('c'), sm = document.createElement('canvas'); sm.width = 32; sm.height = 18; const sx = sm.getContext('2d', { willReadFrequently: true });
const ac = new AudioContext(), viz = butterchurn.default.createVisualizer(ac, cv, { width: 128, height: 72, pixelRatio: 1, textureRatio: 1 });
const P = {}; try { Object.assign(P, butterchurnPresets.getPresets()); } catch (e) {} try { Object.assign(P, butterchurnPresetsExtra.getPresets()); } catch (e) {} try { Object.assign(P, window.ACID_PRESETS || {}); } catch (e) {}
window.names = () => Object.keys(P).sort();
function bytes(sig, f) { const a = new Uint8Array(W), o = Math.floor(f * SPF); for (let i = 0; i < W; i++) a[i] = Math.max(0, Math.min(255, Math.round(128 + 127 * (sig[o + i] || 0)))); return a; }
function frameStat() {
  sx.drawImage(cv, 0, 0, 32, 18); const d = sx.getImageData(0, 0, 32, 18).data; let L = 0, S = 0, n = 0;
  for (let i = 0; i < d.length; i += 4) { const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b); L += 0.2126 * r + 0.7152 * g + 0.0722 * b; S += mx > 0.02 ? (mx - mn) / mx : 0; n++; }
  return [L / n, S / n];
}
async function pass(name, k) {
  viz.loadPreset(P[name], 0); const sig = SIG[k], A = [], B = [];
  for (let f = 0; f < F; f++) {
    const a = bytes(sig, f); viz.render({ audioLevels: { timeByteArray: a, timeByteArrayL: a, timeByteArrayR: a }, elapsedTime: 1 / FR });
    if (f % 5 === 0 && f >= 70 && f < 100) A.push(frameStat()); else if (f % 5 === 0 && f >= 260) B.push(frameStat());
  }
  const m = (X, j) => X.reduce((s, x) => s + x[j], 0) / X.length;
  return [m(B, 0) - m(A, 0), m(B, 1) - m(A, 1), m(A, 0)];
}
window.measure = async name => { try { const r = await pass(name, 0), q = await pass(name, 1), q2 = await pass(name, 2); return { ok: 1, dL: r[0] - (q[0] + q2[0]) / 2, dS: r[1] - (q[1] + q2[1]) / 2, nL: Math.abs(q[0] - q2[0]), nS: Math.abs(q[1] - q2[1]), L0: r[2] }; } catch (e) { return { ok: 0, err: String(e && e.message || e) }; } };
</script>`;
const srv = http.createServer((q, r) => {
  if (q.url === '/' ) { r.writeHead(200, { 'content-type': 'text/html' }); return r.end(PAGE); }
  const f = files[q.url.split('?')[0]] || path.join(root, q.url.split('?')[0]);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': f.endsWith('.js') ? 'application/javascript' : 'application/octet-stream' }); fs.createReadStream(f).pipe(r);
});
(async () => {
  await new Promise(r => srv.listen(0, '127.0.0.1', r)); const port = srv.address().port;
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--mute-audio', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const part = +(process.env.PART || 0), res = {};
  const page = await b.newPage(); page.on('pageerror', e => console.error('Seitenfehler', String(e).slice(0, 120)));
  await page.goto('http://127.0.0.1:' + port + '/'); await page.waitForFunction(() => window.measure, null, { timeout: 120000 });
  let names = await page.evaluate(() => window.names()); if (LIMIT) names = names.slice(0, LIMIT);
  const mine = names.filter((_, i) => i % PARTS === part), t0 = Date.now();
  for (let i = 0; i < mine.length; i++) {
    const r = await page.evaluate(n => window.measure(n), mine[i]); res[mine[i]] = r;
    if (i % 10 === 9) { console.log('Teil ' + part + ': ' + (i + 1) + '/' + mine.length + ' nach ' + Math.round((Date.now() - t0) / 1000) + ' s'); fs.writeFileSync(out + '.teil' + part, JSON.stringify(res)); }
  }
  fs.writeFileSync(out + '.teil' + part, JSON.stringify(res)); console.log('Teil ' + part + ' fertig: ' + mine.length + ' Presets in ' + Math.round((Date.now() - t0) / 1000) + ' s');
  await b.close(); srv.close();
})();
