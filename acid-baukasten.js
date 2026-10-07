// Preset-Baukasten für Acid Milkdrop: baut aus ein paar Reglern ein vollständiges Butterchurn-Preset.
// Eingänge aus dem Ton wie bei den eigenen Acid-Presets: Kick (a.bass), 303-/Mitten-Linie (a.mid), Hats/Claps (a.treb).
// Belegung der Shader-Variablen: q5 = Kick, q6 = Farbwanderung, q7 = Hats (bei Ringen: Blitz), q8 = Fahrt-Phase.
(function () {
  const none = n => Array.from({ length: n }, () => ({ baseVals: { enabled: 0 }, init_eqs_str: '', frame_eqs_str: '' }));
  const noWave = n => Array.from({ length: n }, () => ({ baseVals: { enabled: 0 }, init_eqs_str: '', frame_eqs_str: '', point_eqs_str: '' }));
  const f = v => (+v).toFixed(3);
  const v3 = c => 'vec3(' + f(c[0]) + ', ' + f(c[1]) + ', ' + f(c[2]) + ')';

  const FORMS = ['Tunnel', 'Gitter', 'Ringe', 'Spirale'];
  const PALS = [
    { n: 'Acid-Grün', dk: [0, 0.07, 0], br: [0.78, 1, 0.08] },
    { n: 'Magenta', dk: [0.12, 0, 0.18], br: [1, 0.18, 0.85] },
    { n: 'Eisblau', dk: [0, 0.04, 0.12], br: [0.2, 0.8, 1] },
    { n: 'Feuer', dk: [0.12, 0.01, 0], br: [1, 0.45, 0.05] },
    { n: 'Weiß', dk: [0, 0, 0], br: [1, 1, 1] },
    { n: 'Regenbogen', dk: [0, 0, 0], br: [1, 1, 1], rainbow: true }
  ];
  const SEGS = [1, 3, 4, 6, 8];
  const DEF = { form: 0, pal: 0, segs: 1, kick: 1, acid: 1, hats: 1, speed: 1, spin: 0.5, trail: 0.9, pump: 1, glow: 0.5 };
  const RANGE = { kick: [0, 2], acid: [0, 2], hats: [0, 2], speed: [0.2, 2.5], spin: [-1, 1], trail: [0.8, 0.97], pump: [0, 2], glow: [0, 1.5] };

  function norm(p) {
    const o = {}, num = (v, d) => (Number.isFinite(+v) && v !== null && v !== '' ? +v : d);
    for (const k in DEF) o[k] = num(p && p[k], DEF[k]);
    for (const k in RANGE) o[k] = Math.max(RANGE[k][0], Math.min(RANGE[k][1], o[k]));
    o.form = Math.max(0, Math.min(FORMS.length - 1, Math.round(o.form)));
    o.pal = Math.max(0, Math.min(PALS.length - 1, Math.round(o.pal)));
    o.segs = SEGS.includes(Math.round(o.segs)) ? Math.round(o.segs) : 1;
    return o;
  }

  function comp(P, pal) {
    const seg = P.segs > 1
      ? 'float an = atan(p.y, p.x); float rr = length(p); float sg = 6.2831853 / ' + P.segs + '.0; an = abs(mod(an, sg) - sg * 0.5); p = rr * vec2(cos(an), sin(an));'
      : '';
    const bright = pal.rainbow ? 'vec3 bc = 0.5 + 0.5 * cos(6.2831853 * (q6 * 0.12 + vec3(0.0, 0.33, 0.67)));' : 'vec3 bc = ' + v3(pal.br) + ';';
    const colorE = pal.rainbow
      ? 'mix(vec3(0.0), 0.5 + 0.5 * cos(6.2831853 * (l * 0.8 + q6 * 0.12 + vec3(0.0, 0.33, 0.67))), smoothstep(0.03, 0.4, l))'
      : 'mix(' + v3(pal.dk) + ', bc, l) + vec3(0.9, 1.0, 0.8) * l * l * l * 0.5';
    const grid = P.form === 1 ? `
  float y = abs(p.y) + 0.02;
  float z = 0.12 / y;
  vec2 gc = vec2(p.x * z * 3.0, z * 2.5 + q8);
  vec2 gd = abs(fract(gc - 0.5) - 0.5);
  vec2 fw = fwidth(gc) + 0.0001;
  vec2 ln = 1.0 - smoothstep(vec2(0.0), fw * 1.6, gd);
  float line = max(ln.x, ln.y) * clamp(1.0 - max(fw.x, fw.y) * 1.2, 0.0, 1.0);
  line *= exp(-z * 0.15);
  vec3 gcol = mix(bc, vec3(1.0, 1.0, 0.9), clamp(q5, 0.0, 1.0));
  col = col * 0.9 + gcol * line * (0.22 + 1.5 * q5);` : '';
    const hats = P.form === 2
      ? 'col *= 1.0 + 0.8 * q7;'
      : 'col *= 1.0 + 0.25 * q7 * step(0.5, fract(sin(floor(time * 24.0)) * 43758.5453));';
    return ` shader_body {
  vec2 p = uv - 0.5;
  float asp = texsize.x * texsize.w;
  p.x *= asp;
  ${seg}
  vec2 uv2 = p;
  uv2.x /= asp;
  uv2 += 0.5;
  uv2 = abs(mod(uv2 + 1.0, 2.0) - 1.0);
  vec3 c = texture(sampler_main, uv2).xyz;
  float l = clamp(dot(c, vec3(0.3, 0.59, 0.11)) * 1.5, 0.0, 1.0);
  ${bright}
  vec3 col = ${colorE};${grid}
  col *= 1.0 + ${f(P.glow)} * 0.8 * q5;
  ${hats}
  col *= 1.0 - 0.55 * dot(uv - 0.5, uv - 0.5) * 2.0;
  ret = col;
 }`;
  }

  function build(params) {
    const P = norm(params), pal = PALS[P.pal], br = pal.br;
    const ring = P.form === 2;
    const wc = pal.rainbow
      ? 'a.r=.5+.5*Math.sin(a.q3);a.g=.5+.5*Math.sin(a.q3+2.1);a.b=.5+.5*Math.sin(a.q3+4.2);'
      : 'a.r=' + f(br[0]) + ';a.g=' + f(br[1]) + ';a.b=' + f(br[2]) + ';';

    let init = 'a.kk=0;a.ac=0;a.hh=0;a.ph=0;a.hue=0;a.tp=0;a.dt=0;a.q1=0;a.q2=0;a.q3=0;a.q4=0;a.q5=0;a.q6=0;a.q7=0;a.q8=0;';
    let frame =
      'a.dt=Math.min(.1,Math.max(0,a.time-a.tp));a.tp=a.time;' +
      'a.kk=Math.max(a.kk*.84,Math.min(1.6,Math.max(0,a.bass-1.05))*' + f(P.kick) + ');' +
      'a.ac=a.ac*.9+.1*Math.min(2,Math.max(0,a.mid-.9))*' + f(P.acid) + ';' +
      'a.hh=Math.max(a.hh*.78,Math.min(1.5,Math.max(0,a.treb-1.05))*' + f(P.hats) + ');' +
      'a.ph+=a.dt*' + f(P.speed) + '*(.5+2.2*a.kk+.6*a.bass_att);' +
      'a.hue+=a.dt*(.15+1.1*a.ac);' +
      'a.q5=a.kk;a.q6=a.hue;a.q7=a.hh;a.q8=a.ph;' +
      'a.zoom=1.008+' + f(0.05 * P.pump) + '*a.kk;' +
      'a.rot=' + f(P.spin) + '*(.008+.012*a.ac);' +
      'a.decay=Math.min(.985,' + f(P.trail) + '+.03*(1-Math.min(1,a.kk)));';
    let pixel = '', shapes = none(4), waves = noWave(4);

    if (ring) {
      init += 'a.sn=0;a.sp=0;a.rr=0;a.t1=-99;a.t2=-99;a.t3=-99;a.t4=-99;a.fl=0;a.q1=99;a.q2=99;a.q3=99;a.q4=99;';
      frame +=
        'a.sn=Math.max(0,(a.mid+a.treb)*.5-1.0);' +
        'if(a.sn>.28&&a.sp<=.28&&a.time-Math.max(a.t1,a.t2,a.t3,a.t4)>.16){a.rr=(a.rr%4)+1;if(a.rr==1)a.t1=a.time;if(a.rr==2)a.t2=a.time;if(a.rr==3)a.t3=a.time;if(a.rr==4)a.t4=a.time;a.fl=Math.min(1,a.sn*2*' + f(Math.max(0.3, P.hats)) + ');}' +
        'a.sp=a.sn;a.fl*=.8;' +
        'a.q1=a.time-a.t1;a.q2=a.time-a.t2;a.q3=a.time-a.t3;a.q4=a.time-a.t4;a.q7=a.fl;';
      pixel = 'a.rot=a.rot+.01*a.q7*a.rad;';
      const mk = i => ({
        baseVals: { enabled: 1, sides: 56, additive: 1, textured: 0, thickoutline: 1, x: 0.5, y: 0.5, rad: 0.1, r: 0, g: 0, b: 0, a: 0, r2: 0, g2: 0, b2: 0, a2: 0, border_r: br[0], border_g: br[1], border_b: br[2], border_a: 0 },
        init_eqs_str: 'a.q1=99;a.q2=99;a.q3=99;a.q4=99;',
        frame_eqs_str:
          'a.age=a.q' + i + ';a.rad=.03+a.age*' + f(0.8 * P.speed) + ';a.border_a=Math.max(0,1-a.age*1.15);' +
          (pal.rainbow
            ? 'a.border_r=.5+.5*Math.sin(a.age*3+' + i + ');a.border_g=.5+.5*Math.sin(a.age*3+' + i + '+2.1);a.border_b=.5+.5*Math.sin(a.age*3+' + i + '+4.2);'
            : 'a.border_r=' + f(br[0]) + ';a.border_g=' + f(br[1]) + ';a.border_b=' + f(br[2]) + ';')
      });
      shapes = [mk(1), mk(2), mk(3), mk(4)];
    } else {
      frame += 'a.q1=a.kk;a.q2=a.ac;a.q3=a.hue;';
      let pt, wb;
      if (P.form === 0) {            // Tunnel: Ring, der mit dem Kick pumpt
        pt = 'a.an=a.sample*6.2832;a.rd=.22+a.value1*.12*(1+a.q2*1.5)+.05*a.q1;a.x=.5+a.rd*Math.cos(a.an);a.y=.5+a.rd*Math.sin(a.an);' + wc + 'a.a=.5+.5*Math.min(1,a.q1);';
        wb = { samples: 200 };
        pixel = 'a.zoom=a.zoom+' + f(0.03 * P.pump) + '*a.q1*a.rad*a.rad;a.rot=a.rot+.02*Math.sin(a.ang*4+a.q8)*a.q2*a.rad;';
      } else if (P.form === 1) {     // Gitter: Linie quer durchs Bild, Gitterboden im Shader
        pt = 'a.x=a.sample;a.y=.5+a.value1*.18*(1+a.q2);' + wc + 'a.a=.8;';
        wb = { samples: 128 };
      } else {                       // Spirale: dreht sich mit der Fahrt-Phase
        pt = 'a.an=a.sample*18.85+a.q8*.6;a.rd=.04+a.sample*.38*(1+.5*a.q1)+a.value1*.05;a.x=.5+a.rd*Math.cos(a.an);a.y=.5+a.rd*Math.sin(a.an);' + wc + 'a.a=.6+.4*Math.min(1,a.q1);';
        wb = { samples: 240 };
        pixel = 'a.zoom=a.zoom+' + f(0.02 * P.pump) + '*a.q1*a.rad;a.rot=a.rot+.015*a.q2*a.rad;';
      }
      waves = [{
        baseVals: Object.assign({ enabled: 1, sep: 0, scaling: 1, smoothing: 0.5, thick: 1, additive: 1, usedots: 0, spectrum: 0, r: br[0], g: br[1], b: br[2], a: 0.9 }, wb),
        init_eqs_str: 'a.q1=0;a.q2=0;a.q3=0;a.q8=0;',
        frame_eqs_str: '',
        point_eqs_str: pt
      }, ...noWave(3)];
    }

    return {
      baseVals: { rating: 5, gammaadj: 1.5, decay: P.trail, zoom: 1.01, wrap: 0, warp: 0, echo_zoom: 1, echo_alpha: 0, wave_a: 0, ob_a: 0, ib_a: 0, mv_a: 0, darken_center: 0 },
      init_eqs_str: init, frame_eqs_str: frame, pixel_eqs_str: pixel,
      shapes, waves, warp: '', comp: comp(P, pal)
    };
  }

  function randomParams() {
    const r = (a, b) => a + Math.random() * (b - a);
    return norm({
      form: Math.floor(Math.random() * FORMS.length), pal: Math.floor(Math.random() * PALS.length),
      segs: Math.random() < 0.45 ? 1 : SEGS[1 + Math.floor(Math.random() * (SEGS.length - 1))],
      kick: r(0.7, 1.7), acid: r(0.5, 1.6), hats: r(0.4, 1.5), speed: r(0.5, 1.8),
      spin: r(-0.9, 0.9), trail: r(0.84, 0.95), pump: r(0.6, 1.6), glow: r(0.2, 1.1)
    });
  }

  const label = p => { const P = norm(p); return FORMS[P.form] + ' ' + PALS[P.pal].n + (P.segs > 1 ? ' ' + P.segs + 'er' : ''); };

  window.AcidKit = { FORMS, PALS, SEGS, DEF, RANGE, norm, build, randomParams, label };
})();
