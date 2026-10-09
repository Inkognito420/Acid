// Acid Milkdrop · Teil 16 von 16: System: Wachhalter, Sichtbarkeit, Start
// Alle Teile teilen sich einen gemeinsamen Bereich (wie vorher der eine große Block in index.html).
// Reihenfolge ist wichtig: index.html lädt sie nacheinander. Bricht ein Teil ab, starten die folgenden nicht.
if (window.__AM_STEP !== 15) throw new Error('Acid Milkdrop: Teil 16 (start) nicht gestartet, ein früherer Teil ist abgebrochen');

// ===== System =====
canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); viz = null; say('Grafik wurde vom System pausiert. Startet neu …'); });
canvas.addEventListener('webglcontextrestored', () => { if (createViz()) say(''); });
// Bildschirm-Wachhalter: Weg 1 = Wake-Lock-API, Weg 2 (falls Weg 1 fehlt oder scheitert) = winziges stummes Video-Loop
let wakeSentinel = null, wakeVideo = null, wakeState = '', wakeTries = 0;
const WAKE_MP4 = 'data:video/mp4;base64,AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAMzbW9vdgAAAGxtdmhkAAAAAAAAAAAAAAAAAAAD6AAAB9AAAQAAAQAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAAl10cmFrAAAAXHRraGQAAAADAAAAAAAAAAAAAAABAAAAAAAAB9AAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAABAAAAAQAAAAAAAkZWR0cwAAABxlbHN0AAAAAAAAAAEAAAfQAAAAAAABAAAAAAHVbWRpYQAAACBtZGhkAAAAAAAAAAAAAAAAAABAAAAAgABVxAAAAAAALWhkbHIAAAAAAAAAAHZpZGUAAAAAAAAAAAAAAABWaWRlb0hhbmRsZXIAAAABgG1pbmYAAAAUdm1oZAAAAAEAAAAAAAAAAAAAACRkaW5mAAAAHGRyZWYAAAAAAAAAAQAAAAx1cmwgAAAAAQAAAUBzdGJsAAAAuHN0c2QAAAAAAAAAAQAAAKhhdmMxAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAABAAEABIAAAASAAAAAAAAAABFUxhdmM2MC4zMS4xMDIgbGlieDI2NAAAAAAAAAAAAAAAGP//AAAALmF2Y0MBQsAK/+EAFmdCwArZHsBEAAADAAQAAAMAEDxImSABAAVoy4PLIAAAABBwYXNwAAAAAQAAAAEAAAAUYnRydAAAAAAAAAqAAAAKgAAAABhzdHRzAAAAAAAAAAEAAAAEAAAgAAAAABRzdHNzAAAAAAAAAAEAAAABAAAAHHN0c2MAAAAAAAAAAQAAAAEAAAAEAAAAAQAAACRzdHN6AAAAAAAAAAAAAAAEAAACgwAAAAoAAAAKAAAACQAAABRzdGNvAAAAAAAAAAEAAANjAAAAYnVkdGEAAABabWV0YQAAAAAAAAAhaGRscgAAAAAAAAAAbWRpcmFwcGwAAAAAAAAAAAAAAAAtaWxzdAAAACWpdG9vAAAAHWRhdGEAAAABAAAAAExhdmY2MC4xNi4xMDAAAAAIZnJlZQAAAqhtZGF0AAACcAYF//9s3EXpvebZSLeWLNgg2SPu73gyNjQgLSBjb3JlIDE2NCByMzEwOCAzMWUxOWY5IC0gSC4yNjQvTVBFRy00IEFWQyBjb2RlYyAtIENvcHlsZWZ0IDIwMDMtMjAyMyAtIGh0dHA6Ly93d3cudmlkZW9sYW4ub3JnL3gyNjQuaHRtbCAtIG9wdGlvbnM6IGNhYmFjPTAgcmVmPTMgZGVibG9jaz0xOjA6MCBhbmFseXNlPTB4MToweDExMSBtZT1oZXggc3VibWU9NyBwc3k9MSBwc3lfcmQ9MS4wMDowLjAwIG1peGVkX3JlZj0xIG1lX3JhbmdlPTE2IGNocm9tYV9tZT0xIHRyZWxsaXM9MSA4eDhkY3Q9MCBjcW09MCBkZWFkem9uZT0yMSwxMSBmYXN0X3Bza2lwPTEgY2hyb21hX3FwX29mZnNldD0tMiB0aHJlYWRzPTEgbG9va2FoZWFkX3RocmVhZHM9MSBzbGljZWRfdGhyZWFkcz0wIG5yPTAgZGVjaW1hdGU9MSBpbnRlcmxhY2VkPTAgYmx1cmF5X2NvbXBhdD0wIGNvbnN0cmFpbmVkX2ludHJhPTAgYmZyYW1lcz0wIHdlaWdodHA9MCBrZXlpbnQ9MjUwIGtleWludF9taW49MiBzY2VuZWN1dD00MCBpbnRyYV9yZWZyZXNoPTAgcmNfbG9va2FoZWFkPTQwIHJjPWNyZiBtYnRyZWU9MSBjcmY9MjMuMCBxY29tcD0wLjYwIHFwbWluPTAgcXBtYXg9NjkgcXBzdGVwPTQgaXBfcmF0aW89MS40MCBhcT0xOjEuMDAAgAAAAAtliIQFPJigAD+/gAAAAAZBmjgKeoAAAAAGQZpUAp6gAAAABUGaYBL1';
const WAKE_WEBM = 'data:video/webm;base64,GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQJChYECGFOAZwEAAAAAAAInEU2bdLpNu4tTq4QVSalmU6yBoU27i1OrhBZUrmtTrIHYTbuMU6uEElTDZ1OsggEeTbuMU6uEHFO7a1OsggIR7AEAAAAAAABZAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVSalmsirXsYMPQkBNgI1MYXZmNjAuMTYuMTAwV0GNTGF2ZjYwLjE2LjEwMESJiECfQAAAAAAAFlSua8GuAQAAAAAAADjXgQFzxYjFMvH4un7ZEJyBACK1nIN1bmSIgQCGhVZfVlA4g4EBI+ODhB3NZQDgibCBELqBEJqBAhJUw2f8c3OgY8CAZ8iaRaOHRU5DT0RFUkSHjUxhdmY2MC4xNi4xMDBzc9ZjwItjxYjFMvH4un7ZEGfIoUWjh0VOQ09ERVJEh5RMYXZjNjAuMzEuMTAyIGxpYnZweGfIoUWjiERVUkFUSU9ORIeTMDA6MDA6MDIuMDAwMDAwMDAwAB9DtnXt54EAo6OBAACAEAIAnQEqEAAQAABHCIWFiIWEiAICAAwNYAD+/6tQgKOVgQH0ALEBAAEQEAAYABhYL/QACAAAo5WBA+gAsQEAARAQABgAGFgv9AAIAACjlYEF3ACxAQABEBAAGAAYWC/0AAgAABxTu2uRu4+zgQC3iveBAfGCAZ/wgQM=';
function wakeLog(s) { if (s !== wakeState) { wakeState = s; rea('Bildschirm-Wachhalter: ' + s); } }
function wakeFallback(why) {
  try {
    if (!wakeVideo) {
      wakeVideo = document.createElement('video');
      wakeVideo.muted = true; wakeVideo.loop = true; wakeVideo.setAttribute('playsinline', ''); wakeVideo.setAttribute('muted', '');
      wakeVideo.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0.01;pointer-events:none;left:0;top:0';
      for (const [u, ty] of [[WAKE_MP4, 'video/mp4'], [WAKE_WEBM, 'video/webm']]) { const so = document.createElement('source'); so.src = u; so.type = ty; wakeVideo.appendChild(so); }
      document.body.appendChild(wakeVideo); wakeVideo.load();
    }
    wakeVideo.play().then(() => wakeLog('an über Video-Ersatz (' + why + ')'), e => wakeLog('Video-Ersatz wartet auf Tipp (' + why + '; ' + (e && e.name) + ')'));
  } catch (e) { wakeLog('aus (' + why + '; ' + (e && e.message) + ')'); }
}
async function requestWake() {
  if (document.visibilityState !== 'visible') return;
  if (wakeSentinel && !wakeSentinel.released) return;
  if (!('wakeLock' in navigator)) { wakeFallback('API fehlt'); return; }
  try {
    wakeSentinel = await navigator.wakeLock.request('screen');
    wakeLog('an (Wake-Lock)');
    wakeSentinel.addEventListener('release', () => { wakeLog('Sperre freigegeben, hole sie neu'); wakeSentinel = null; setTimeout(requestWake, 300); });
  } catch (e) {
    wakeTries++; wakeLog('Wake-Lock abgelehnt (' + (e && e.name) + ')'); wakeFallback('Wake-Lock abgelehnt');
  }
}
// erster Tipp und Start der Wiedergabe: nochmal versuchen (manche Browser erlauben es erst nach einer Berührung)
['pointerdown', 'touchend', 'click'].forEach(ev => document.addEventListener(ev, () => { if (!wakeSentinel || wakeSentinel.released) requestWake(); if (wakeVideo && wakeVideo.paused) wakeVideo.play().then(() => wakeLog('an über Video-Ersatz (nach Tipp)'), () => {}); }, { capture: true, passive: true }));
audio.addEventListener('playing', () => requestWake());
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') { requestWake(); if (wakeVideo && wakeVideo.paused) wakeVideo.play().catch(() => {}); unlock(); resize(); jrSplit('h'); }
  else { saveProfiles(performance.now()); jrEnd('h'); jrSave(performance.now(), true); }
});
window.addEventListener('pagehide', () => { saveProfiles(performance.now()); jrEnd('h'); jrSave(performance.now(), true); });

if (createViz()) requestWake();
loop();

window.__AM_STEP = 16;
