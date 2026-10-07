// scenes2.js — the winter → today
'use strict';

function snowLand(o) { // layered mountains under a winter sky
  const sky = makeSky({ top: o.top, bot: o.bot, band: o.band || 0, seed: o.seed, stars: o.stars ?? 0, starH: .5 });
  const x = sky.getContext('2d');
  const layers = o.layers;
  layers.forEach((L, li) => {
    const pts = [];
    for (let px = 0; px <= W; px += 4) {
      const v = clamp((fbm(px / L.sc, li * 3.1, 6, 90 + li) - .5) * 3.2, -1, 1), ridge = 1 - Math.abs(v);
      pts.push([px, L.y - L.amp * (.2 + .8 * ridge * ridge) * (.55 + .9 * fbm(px / (L.sc * 3), li, 3, 99))]);
    }
    const g = x.createLinearGradient(0, L.y - L.amp, 0, L.y + 200);
    g.addColorStop(0, L.top); g.addColorStop(1, L.bot);
    x.fillStyle = g; x.beginPath(); x.moveTo(0, H); pts.forEach(p => x.lineTo(p[0], p[1])); x.lineTo(W, H); x.fill();
    // etched snow gullies running down from the ridge
    x.save(); x.beginPath(); x.moveTo(0, H); pts.forEach(p => x.lineTo(p[0], p[1])); x.lineTo(W, H); x.clip();
    const rr = rng(o.seed + li); x.strokeStyle = L.snow; x.lineWidth = 1;
    for (let k = 0; k < 520; k++) { const p = pts[(rr() * pts.length) | 0], len = 20 + rr() * 140, sl = (rr() - .5) * .9; x.globalAlpha = (.12 + rr() * .3) * (o.etch ?? 1); x.beginPath(); x.moveTo(p[0], p[1] + 2); x.lineTo(p[0] + sl * len, p[1] + len); x.stroke(); }
    x.restore(); x.globalAlpha = 1;
    // snow caps on the ridges
    x.strokeStyle = L.snow; x.lineWidth = 3; x.beginPath(); pts.forEach((p, i) => i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1])); x.stroke();
    // fog between layers
    const fg = x.createLinearGradient(0, L.y - 40, 0, L.y + 120); fg.addColorStop(0, 'rgba(0,0,0,0)'); fg.addColorStop(1, o.fog);
    x.fillStyle = fg; x.fillRect(0, L.y - 40, W, 200);
  });
  return sky;
}
function snow(c, t, n, seed, a = 1, wind = 40) {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    const depth = r(), sp = 30 + depth * 110, sz = .8 + depth * 3.2, x0 = r() * W, y0 = r() * H, ph = r() * TAU;
    const y = (y0 + t * sp) % (H + 20) - 10, x = ((x0 + t * wind * (.4 + depth) + Math.sin(t * .8 + ph) * 22 * depth) % W + W) % W;
    c.fillStyle = `rgba(235,242,255,${a * (.35 + .6 * depth)})`; c.beginPath(); c.arc(x, y, sz, 0, TAU); c.fill();
  }
}
function netLayout(xs, ys) { const N = []; xs.forEach((x, l) => { const k = ys[l]; for (let i = 0; i < k; i++) N.push({ l, x, y: 380 - (k - 1) * 46 + i * 92, i }); }); return N; }

// ───────────────────────── AI WINTER ─────────────────────────
S1.winter = {
  init() {
    this.bg = snowLand({
      top: [14, 20, 32], bot: [74, 90, 108], seed: 74, fog: 'rgba(150,170,190,.35)',
      layers: [{ y: 520, amp: 260, sc: 520, top: '#55667a', bot: '#3a4858', snow: 'rgba(230,240,255,.5)' },
        { y: 650, amp: 200, sc: 380, top: '#3c4a5a', bot: '#26303c', snow: 'rgba(220,232,250,.45)' },
        { y: 800, amp: 110, sc: 300, top: '#9aa8b8', bot: '#5f6c7c', snow: 'rgba(240,246,255,.7)' }]
    });
    this.frost = texture(W / 2, H / 2, (i, j, o) => {
      const x = i / (W / 2), y = j / (H / 2), e = Math.min(x, 1 - x, y * 1.3, (1 - y) * 1.3);
      const ridge = 1 - Math.abs(fbm(x * 18, y * 18, 4, 33) - .5) * 2;
      const a = clamp((.1 - e) * 9 + (ridge - .8) * 2.2) * clamp((.15 - e) * 8);
      o[0] = 225; o[1] = 236; o[2] = 250; o[3] = a * 200;
    });
    this.N = netLayout([620, 860, 1100, 1300], [4, 6, 6, 2]);
  },
  draw(c, t, d) {
    c.save(); cam(c, t, d, { z0: 1.0, z1: 1.1, y0: 0, y1: 40 });
    c.drawImage(this.bg, 0, 0);
    // frozen network: lights die one by one
    const N = this.N;
    c.save();
    for (const a of N) for (const b of N) if (b.l === a.l + 1) {
      const alive = 1 - smooth(1 + hash(a.i * 9 + a.l, b.i) * (d * .55), 3 + hash(a.i * 9 + a.l, b.i) * (d * .55), t);
      c.strokeStyle = `rgba(${lerp(170, 255, alive) | 0},${lerp(200, 190, alive) | 0},${lerp(230, 120, alive) | 0},${.12 + .25 * alive})`; c.lineWidth = 1;
      c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke();
    }
    for (const a of N) {
      const alive = 1 - smooth(1.5 + hash(a.i, a.l, 4) * d * .6, 3 + hash(a.i, a.l, 4) * d * .6, t);
      glow(c, a.x, a.y, 40, '255,180,90', .55 * alive);
      c.fillStyle = `rgb(${lerp(150, 255, alive) | 0},${lerp(175, 210, alive) | 0},${lerp(200, 150, alive) | 0})`; c.beginPath(); c.arc(a.x, a.y, 7, 0, TAU); c.fill();
      c.strokeStyle = `rgba(230,240,255,${.7 * (1 - alive)})`; c.lineWidth = 1.2; // ice crystal
      for (let k = 0; k < 6; k++) { const an = k / 6 * TAU + a.i; c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(a.x + Math.cos(an) * 16, a.y + Math.sin(an) * 16); c.stroke(); }
    }
    c.restore();
    snow(c, t, 260, 5, .9, 60);
    c.restore();
    c.globalAlpha = smooth(0, d * .8, t) * .9 + .1; c.drawImage(this.frost, 0, 0, W, H); c.globalAlpha = 1;
    // cold grade
    c.save(); c.globalCompositeOperation = 'multiply'; c.fillStyle = 'rgba(170,190,220,1)'; c.fillRect(0, 0, W, H); c.restore();
  }
};

// ───────────────────────── BACKPROP 1986: keepers of the fire ─────────────────────────
S1.backprop = {
  init() {
    this.bg = snowLand({
      top: [4, 6, 14], bot: [26, 30, 42], seed: 86, stars: 1300, etch: .45, fog: 'rgba(40,50,70,.4)',
      layers: [{ y: 560, amp: 220, sc: 480, top: '#1e2632', bot: '#141a24', snow: 'rgba(180,200,230,.3)' },
        { y: 700, amp: 140, sc: 360, top: '#2a3240', bot: '#1a2029', snow: 'rgba(190,210,235,.35)' },
        { y: 820, amp: 60, sc: 300, top: '#4a5260', bot: '#2a2e36', snow: 'rgba(230,236,250,.45)' }]
    });
    this.N = netLayout([560, 820, 1100, 1360], [3, 5, 5, 2]).map(n => ({ ...n, y: n.y - 120 }));
  },
  draw(c, t, d, S) {
    const fx = W / 2, fy = 820, l2 = S.lines[1].at;
    c.save(); cam(c, t, d, { z0: 1.08, z1: 1.0, y0: 30, y1: 0 });
    c.drawImage(this.bg, 0, 0); twinkle(c, t, 87, 70, H * .4, .8);
    // warm light spilling on snow
    c.save(); c.globalCompositeOperation = 'lighter';
    c.save(); c.scale(1, .4); const sg = c.createRadialGradient(fx, fy / .4, 10, fx, fy / .4, 760); sg.addColorStop(0, 'rgba(255,140,60,.35)'); sg.addColorStop(1, 'rgba(255,100,40,0)');
    c.fillStyle = sg; c.fillRect(fx - 760, fy / .4 - 760, 1520, 1520); c.restore(); c.restore();
    // network in the sky, born from sparks
    const N = this.N, born = smooth(1, 5, t);
    const fwd = (t * .55) % 1, bwd = t > l2 ? ((t - l2) * .55) % 1 : -1;
    for (const a of N) for (const b of N) if (b.l === a.l + 1) {
      const w = hash(a.i + a.l * 7, b.i, 6);
      c.strokeStyle = `rgba(255,200,140,${(.08 + .25 * w) * born})`; c.lineWidth = .8 + w * 1.6;
      c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke();
      const lf = fwd * 3 - a.l; if (lf > 0 && lf < 1) glow(c, lerp(a.x, b.x, lf), lerp(a.y, b.y, lf), 14, '255,210,120', .7 * born * w);
      if (bwd >= 0) { const lb = bwd * 3 - (2 - a.l); if (lb > 0 && lb < 1) glow(c, lerp(b.x, a.x, lb), lerp(b.y, a.y, lb), 16, '255,70,50', .9 * w); }
    }
    for (const a of N) { const pa = born * smooth(0, 1, (t - 1) - a.l * .6); glow(c, a.x, a.y, 34, '255,190,110', .6 * pa); c.fillStyle = `rgba(255,236,200,${pa})`; c.beginPath(); c.arc(a.x, a.y, 5, 0, TAU); c.fill(); }
    if (t > l2) {
      c.save(); c.font = 'italic 400 34px "Cormorant Garamond"'; c.fillStyle = `rgba(255,170,150,${smooth(l2, l2 + 1.5, t) * .8})`;
      c.fillText('∂E / ∂w', 1430, 210); c.font = 'italic 400 24px "Cormorant Garamond"'; c.fillStyle = `rgba(240,220,200,${smooth(l2 + .6, l2 + 2, t) * .6})`;
      c.fillText('Rumelhart · Hinton · Williams, 1986', 1300, 590); c.restore();
    }
    // keepers of the fire
    const people = [[-260, 10, .9, 1], [-150, 40, 1.05, 1], [170, 34, 1.0, -1], [280, 6, .85, -1]];
    people.forEach(([dx, dy, s, dir], k) => sitter(c, fx + dx, fy + dy, s, dir, '#0a0604', t, k));
    fire(c, t, fx, fy + 20, .9);
    sparks(c, t, { seed: 13, n: 70, x: fx, y: fy - 20, spread: 40, life: 6, speed: 70, size: 1.8 });
    snow(c, t, 90, 9, .45, 20);
    c.restore();
  }
};

// ───────────────────────── DEEP BLUE 1997 ─────────────────────────
const PIECE = {
  king: [[.5, 0], [.5, .12], [.4, .2], [.36, .3], [.25, .4], [.2, 1.0], [.17, 1.35], [.32, 1.42], [.2, 1.5], [.26, 1.68], [.33, 1.86], [.1, 1.92], [0, 1.92]],
  queen: [[.48, 0], [.48, .12], [.38, .2], [.34, .3], [.23, .4], [.18, .95], [.15, 1.25], [.3, 1.32], [.18, 1.4], [.24, 1.55], [.34, 1.72], [.2, 1.74], [0, 1.78]],
  rook: [[.46, 0], [.46, .12], [.36, .2], [.32, .3], [.25, .4], [.24, .95], [.34, 1.0], [.34, 1.22], [0, 1.22]],
  pawn: [[.4, 0], [.4, .1], [.3, .17], [.26, .25], [.17, .35], [.13, .62], [.24, .68], [.13, .74], [0, .74]],
};
function piece(c, kind, x, y, s, white, ang = 0, refl = false) {
  const P = PIECE[kind];
  c.save(); c.translate(x, y); if (refl) c.scale(1, -.45); c.rotate(ang); c.scale(s, s);
  c.beginPath(); c.moveTo(-P[0][0], 0);
  P.forEach(([r, h]) => c.lineTo(-r, -h)); for (let i = P.length - 1; i >= 0; i--) c.lineTo(P[i][0], -P[i][1]); c.closePath();
  const g = c.createLinearGradient(-.5, 0, .5, 0);
  if (white) { g.addColorStop(0, '#5c584e'); g.addColorStop(.45, '#d8d2c2'); g.addColorStop(.7, '#fffaf0'); g.addColorStop(1, '#8a8478'); }
  else { g.addColorStop(0, '#06070b'); g.addColorStop(.55, '#151a26'); g.addColorStop(.82, '#86a6ee'); g.addColorStop(1, '#0c0f18'); }
  c.fillStyle = g; c.fill();
  const top = P[P.length - 1][1];
  if (kind === 'pawn') { c.beginPath(); c.arc(0, -top - .17, .2, 0, TAU); c.fill(); }
  if (kind === 'king') { c.fillRect(-.04, -top - .4, .08, .4); c.fillRect(-.14, -top - .3, .28, .08); }
  if (kind === 'queen') { for (let k = -2; k <= 2; k++) { c.beginPath(); c.arc(k * .08, -top - .06, .05, 0, TAU); c.fill(); } }
  if (kind === 'rook') { for (let k = -1; k <= 1; k++) c.fillRect(k * .22 - .07, -top - .14, .14, .14); }
  c.restore();
}
S1.deepblue = {
  init() {},
  proj(X, Z) { const f = 1300, D = 6, h = 3.4, hz = 240; return [W / 2 + X * f / (Z + D), hz + h * f / (Z + D), f / (Z + D)]; },
  draw(c, t, d, S) {
    c.fillStyle = '#020309'; c.fillRect(0, 0, W, H);
    c.save(); cam(c, t, d, { z0: 1.0, z1: 1.12, y0: 0, y1: 40 });
    // server racks, blinking in the dark
    for (let k = 0; k < 6; k++) {
      const x = 1300 + k * 92, y = 120, h = 380;
      c.fillStyle = '#05070e'; c.fillRect(x, y, 70, h); c.strokeStyle = 'rgba(70,100,170,.25)'; c.strokeRect(x, y, 70, h);
      for (let j = 0; j < 30; j++) { const on = hash(k * 40 + j, Math.floor(t * 4 + j * .3), 2) > .55; if (!on) continue; c.fillStyle = hash(k, j) > .7 ? 'rgba(255,170,60,.85)' : 'rgba(90,150,255,.85)'; c.fillRect(x + 10 + (j % 3) * 18, y + 14 + (j / 3 | 0) * 36, 6, 3); }
    }
    for (let k = 0; k < 4; k++) { const x = 140 + k * 92; c.fillStyle = '#04060c'; c.fillRect(x, 150, 70, 350); }
    // the board
    for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {
      const X0 = i - 4, Z0 = j, a = this.proj(X0, Z0), b = this.proj(X0 + 1, Z0), cc = this.proj(X0 + 1, Z0 + 1), dd = this.proj(X0, Z0 + 1);
      c.fillStyle = (i + j) % 2 ? '#77746c' : '#121726';
      c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.lineTo(cc[0], cc[1]); c.lineTo(dd[0], dd[1]); c.fill();
    }
    const fade = c.createLinearGradient(0, 520, 0, 760); fade.addColorStop(0, 'rgba(2,3,9,1)'); fade.addColorStop(1, 'rgba(2,3,9,0)');
    c.fillStyle = fade; c.fillRect(0, 500, W, 260);
    // pieces: [kind, X, Z, white]
    const kf = S.lines[1].at - .4, fall = easeIn((t - kf) / 1.1), bounce = t > kf + 1.1 ? Math.exp(-(t - kf - 1.1) * 6) * Math.sin((t - kf - 1.1) * 26) * .06 : 0;
    const set = [['rook', -2.5, 6.5, true], ['pawn', 1.5, 6.5, false], ['pawn', 2.5, 5.5, false], ['queen', -1.5, 3.5, true], ['king', .5, 4.5, false], ['pawn', -3.5, 2.5, true]];
    set.sort((a, b) => b[2] - a[2]).forEach(([k, X, Z, wh]) => {
      const [x, y, s] = this.proj(X, Z), isK = k === 'king', ang = isK ? Math.max(0, fall) * 1.38 + bounce : 0;
      c.save(); c.globalAlpha = .18; piece(c, k, x, y, s, wh, -ang, true); c.restore();
      piece(c, k, x, y, s, wh, ang);
    });
    // spotlight
    const [kx, ky] = this.proj(.5, 4.5);
    c.save(); c.globalCompositeOperation = 'lighter';
    const sl = c.createLinearGradient(0, 0, 0, ky); sl.addColorStop(0, 'rgba(120,160,255,0)'); sl.addColorStop(1, 'rgba(150,180,255,.12)');
    c.fillStyle = sl; c.beginPath(); c.moveTo(kx - 60, 0); c.lineTo(kx + 60, 0); c.lineTo(kx + 330, ky + 30); c.lineTo(kx - 330, ky + 30); c.fill();
    c.restore();
    glow(c, kx, ky, 380, '110,150,255', .22);
    // dust in the beam
    const r = rng(97);
    for (let k = 0; k < 90; k++) { const y = (r() * ky + t * 6 * r()) % ky, x = kx + (r() - .5) * (60 + y / ky * 600); c.fillStyle = `rgba(200,220,255,${.5 * r()})`; c.fillRect(x, y, 1.6, 1.6); }
    c.restore();
    const sa = smooth(S.lines[1].at + 1, S.lines[1].at + 2.5, t);
    if (sa > 0) {
      c.save(); c.textAlign = 'center'; c.font = '600 30px "Cinzel"'; c.letterSpacing = '8px'; c.fillStyle = `rgba(200,215,255,${sa * .85})`;
      c.fillText('DEEP BLUE  3½  —  2½  KASPAROV', W / 2, 190); c.font = 'italic 400 24px "Cormorant Garamond"'; c.letterSpacing = '1px';
      c.fillStyle = `rgba(200,215,255,${sa * .6})`; c.fillText('New York · May 11, 1997 · Game Six', W / 2, 230); c.restore();
    }
    c.save(); c.globalCompositeOperation = 'multiply'; c.fillStyle = '#b4c4ff'; c.fillRect(0, 0, W, H); c.restore();
  }
};

// ───────────────────────── ALEXNET 2012: learning to see ─────────────────────────
S1.alexnet = {
  init() {
    const r = rng(12); this.tiles = [];
    for (let k = 0; k < 90; k++) {
      const h1 = r() * 360, h2 = (h1 + 40 + r() * 140) % 360;
      const tc = mk(40, 40), x = tc.getContext('2d'), g = x.createLinearGradient(0, 0, 40 * r(), 40);
      g.addColorStop(0, `hsl(${h1},${30 + r() * 40}%,${25 + r() * 40}%)`); g.addColorStop(1, `hsl(${h2},${30 + r() * 40}%,${20 + r() * 35}%)`);
      x.fillStyle = g; x.fillRect(0, 0, 40, 40);
      x.fillStyle = `hsla(${h2},50%,${50 + r() * 30}%,.7)`; x.beginPath(); x.ellipse(10 + r() * 20, 10 + r() * 20, 4 + r() * 10, 4 + r() * 10, r() * 3, 0, TAU); x.fill();
      this.tiles.push(tc);
    }
    // leopard coat for the input image
    this.leo = texture(180, 180, (i, j, o) => {
      const x = i / 18, y = j / 18, fx = Math.floor(x), fy = Math.floor(y); let d1 = 9, d2 = 9;
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
        const px = fx + a + hash(fx + a, fy + b, 1), py = fy + b + hash(fx + a, fy + b, 2), dd = Math.hypot(x - px, y - py);
        if (dd < d1) { d2 = d1; d1 = dd; } else if (dd < d2) d2 = dd;
      }
      const ring = d1 > .22 && d1 < .42, base = .75 + .25 * fbm(i / 30, j / 30, 3, 4);
      if (ring) { o[0] = 40; o[1] = 26; o[2] = 14; } else if (d1 <= .22) { o[0] = 190 * base; o[1] = 120 * base; o[2] = 50 * base; }
      else { o[0] = 226 * base; o[1] = 170 * base; o[2] = 90 * base; }
    });
    this.L = [[180, 180, 6], [120, 120, 34], [92, 92, 52], [62, 62, 62], [62, 62, 62], [62, 62, 50], [16, 300, 6], [16, 300, 6], [16, 170, 6]];
  },
  box(c, x, y, w, h, d, a, hue) {
    const dx = d * .7, dy = -d * .45;
    c.save(); c.strokeStyle = `hsla(${hue},90%,70%,${a})`; c.fillStyle = `hsla(${hue},80%,50%,${a * .1})`; c.lineWidth = 1.4;
    c.shadowColor = `hsla(${hue},90%,60%,${a})`; c.shadowBlur = 14;
    c.beginPath(); c.moveTo(x, y - h / 2); c.lineTo(x + dx, y - h / 2 + dy); c.lineTo(x + w + dx, y - h / 2 + dy); c.lineTo(x + w + dx, y + h / 2 + dy); c.lineTo(x + w, y + h / 2); c.lineTo(x, y + h / 2); c.closePath(); c.fill(); c.stroke();
    c.beginPath(); c.rect(x, y - h / 2, w, h); c.moveTo(x + w, y - h / 2); c.lineTo(x + w + dx, y - h / 2 + dy); c.stroke();
    c.restore();
  },
  draw(c, t, d, S) {
    c.fillStyle = '#04050a'; c.fillRect(0, 0, W, H);
    c.save(); cam(c, t, d, { z0: 1.05, z1: 1.1, x0: 40, x1: -40 });
    // the wall of a million images
    for (let j = 0; j < 30; j++) for (let i = 0; i < 52; i++) {
      const x = i * 40 - ((t * 30) % 40), y = j * 40 - 40, h = hash(i + Math.floor(t * 30 / 40), j, 7);
      const a = (.10 + .2 * Math.pow(hash(i, j + Math.floor(t * 3), 8), 8)) * (1 - smooth(1, d * .6, t) * .5);
      c.globalAlpha = a; c.drawImage(this.tiles[h * 90 | 0], x, y, 38, 38);
    }
    c.globalAlpha = 1;
    const vg = c.createRadialGradient(W / 2, 470, 100, W / 2, 470, 900); vg.addColorStop(0, 'rgba(4,5,10,.75)'); vg.addColorStop(1, 'rgba(4,5,10,.2)'); c.fillStyle = vg; c.fillRect(0, 0, W, H);
    // the network
    const cy = 470; let x = 250; const xs = [];
    this.L.forEach(([w, h, dd], k) => {
      const a = smooth(.8 + k * .45, 1.6 + k * .45, t);
      if (k === 0) { c.save(); c.globalAlpha = a; c.drawImage(this.leo, x, cy - 90, 180, 180); c.restore(); }
      this.box(c, x, cy, k === 0 ? 180 : dd * 1.2, h, k === 0 ? 10 : w, a, k < 6 ? 190 : 38);
      xs.push([x, k === 0 ? 180 : dd * 1.2]); x += (k === 0 ? 180 : dd * 1.2) + (k < 6 ? 70 : 60);
    });
    // light flowing through
    c.save(); c.globalCompositeOperation = 'lighter'; const r = rng(31);
    for (let k = 0; k < 160; k++) {
      const sp = .25 + r() * .2, ph = r(), yo = (r() - .5) * 200, pp = ((t * sp + ph) % 1);
      const px = lerp(250, x - 60, pp), py = cy + yo * (1 - pp * .8) + Math.sin(pp * 20 + k) * 6;
      const a = smooth(2, 5, t) * Math.sin(pp * Math.PI);
      c.fillStyle = pp < .65 ? `rgba(120,220,255,${a})` : `rgba(255,200,110,${a})`; c.fillRect(px, py, 2.4, 2.4);
    }
    c.restore();
    c.save(); c.font = 'italic 400 22px "Cormorant Garamond"'; c.fillStyle = `rgba(200,230,255,${smooth(3, 5, t) * .7})`; c.textAlign = 'center';
    ['conv1', 'conv2', 'conv3', 'conv4', 'conv5', 'fc6', 'fc7', 'fc8'].forEach((s, k) => c.fillText(s, xs[k + 1][0] + 20, cy + 200));
    c.restore();
    // prediction
    const pa = smooth(S.lines[1].at, S.lines[1].at + 1.5, t);
    if (pa > 0) {
      const px = x + 10, top = [['leopard', .92], ['jaguar', .05], ['cheetah', .02], ['snow leopard', .006], ['Egyptian cat', .004]];
      c.save(); c.globalAlpha = pa; c.font = '400 26px "Cormorant Garamond"';
      top.forEach(([n, p], k) => { const y = cy - 70 + k * 36; c.fillStyle = k ? 'rgba(220,220,230,.6)' : '#ffe0a8'; c.fillText(n, px, y); c.fillStyle = k ? 'rgba(120,200,255,.5)' : 'rgba(255,190,90,.9)'; c.fillRect(px, y + 8, 150 * p * pa, 4); });
      c.restore();
    }
    c.save(); c.textAlign = 'center'; c.font = '600 26px "Cinzel"'; c.letterSpacing = '8px'; c.fillStyle = `rgba(210,232,255,${smooth(1, 3, t) * .75})`;
    c.fillText('IMAGENET · 1.2 MILLION IMAGES', W / 2, 170);
    c.font = 'italic 400 26px "Cormorant Garamond"'; c.letterSpacing = '1px'; c.fillStyle = `rgba(255,215,160,${pa * .85})`;
    c.fillText('top-5 error  26.2%  →  15.3%', W / 2, 212); c.restore();
    c.restore();
  }
};

// ───────────────────────── ALPHAGO 2016: ink and stone ─────────────────────────
S1.alphago = {
  init() {
    this.paper = texture(W / 2, H / 2, (i, j, o) => {
      const x = i / (W / 2), y = j / (H / 2), f = fbm(x * 6, y * 6, 5, 21), fib = fbm(x * 60, y * 5, 2, 22);
      const v = .9 + .08 * f + .04 * fib;
      o[0] = 236 * v; o[1] = 226 * v; o[2] = 204 * v;
    });
    this.mount = texture(W / 2, H / 2, (i, j, o) => {
      const x = i / (W / 2), y = j / (H / 2); let a = 0;
      [[.33, .2, 1.6, .22], [.39, .17, 2.6, .36], [.45, .13, 3.4, .5]].forEach(([base, amp, sc, ink], k) => {
        const ridge = base - amp * (1 - Math.abs(fbm(x * sc + k * 7, k, 5, 40 + k) - .5) * 2.4);
        if (y > ridge) { const depth = (y - ridge) / .1; a = Math.max(a, ink * clamp(1 - depth) * (.6 + .6 * fbm(x * 30, y * 30, 3, 50 + k))); }
      });
      o[0] = 22; o[1] = 20; o[2] = 18; o[3] = a * 255;
    });
    // AlphaGo (black) vs Lee Sedol (white), game two — illustrative position
    const r = rng(37); this.stones = []; const used = new Set();
    for (let k = 0; k < 36; k++) { let X, Z; do { X = (r() * 19 | 0) - 9; Z = 2 + (r() * 15 | 0); } while (used.has(X + ',' + Z) || (X === 3 && Z === 9)); used.add(X + ',' + Z); this.stones.push([X, Z, k % 2 === 0]); }
  },
  proj(X, Z) { const f = 1050, D = 5, h = 3, hz = 360; return [W / 2 + X * f / (Z + D), hz + h * f / (Z + D), f / (Z + D)]; },
  stone(c, X, Z, black, a) {
    const [x, y, s] = this.proj(X, Z), sq = .45 + .35 * (1 - Z / 18), r = s * .46;
    c.save(); c.globalAlpha = a; c.translate(x, y); c.scale(1, sq);
    if (black) { const g = c.createRadialGradient(-r * .3, -r * .3, 0, 0, 0, r * 1.05); g.addColorStop(0, '#4a4642'); g.addColorStop(.5, '#141210'); g.addColorStop(.92, 'rgba(10,8,6,.95)'); g.addColorStop(1, 'rgba(10,8,6,0)'); c.fillStyle = g; }
    else { const g = c.createRadialGradient(-r * .3, -r * .3, 0, 0, 0, r); g.addColorStop(0, '#fffdf6'); g.addColorStop(.8, '#e4dccb'); g.addColorStop(1, '#8c8478'); c.fillStyle = g; }
    c.beginPath(); c.arc(0, 0, r, 0, TAU); c.fill(); c.restore();
  },
  draw(c, t, d, S) {
    c.save(); cam(c, t, d, { z0: 1.0, z1: 1.06, y0: 10, y1: -20 });
    c.drawImage(this.paper, 0, 0, W, H);
    glow(c, 1260, 190, 120, '200,60,40', .35, 'multiply'); c.fillStyle = 'rgba(196,74,52,.55)'; c.beginPath(); c.arc(1260, 190, 58, 0, TAU); c.fill();
    c.save(); c.translate(0, t * 2); c.drawImage(this.mount, 0, 0, W, H); c.restore();
    // drifting mist
    for (let k = 0; k < 4; k++) { const mx = ((t * (10 + k * 6) + k * 600) % (W + 900)) - 450; const g = c.createRadialGradient(mx, 520 + k * 30, 0, mx, 520 + k * 30, 420); g.addColorStop(0, 'rgba(240,232,214,.6)'); g.addColorStop(1, 'rgba(240,232,214,0)'); c.fillStyle = g; c.fillRect(mx - 420, 100 + k * 30, 840, 840); }
    // the board, drawn in ink
    c.save(); c.strokeStyle = 'rgba(30,26,22,.55)'; c.lineWidth = 1.3;
    const ga = smooth(.3, 2.2, t);
    for (let k = 0; k < 19; k++) {
      const p = clamp(ga * 1.4 - k / 19 * .4);
      let a = this.proj(k - 9, 0), b = this.proj(k - 9, 18); c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(lerp(a[0], b[0], p), lerp(a[1], b[1], p)); c.stroke();
      a = this.proj(-9, k); b = this.proj(9, k); c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(lerp(a[0], b[0], p), b[1]); c.stroke();
    }
    c.restore();
    const fade = c.createLinearGradient(0, 470, 0, 640); fade.addColorStop(0, 'rgba(236,226,204,1)'); fade.addColorStop(1, 'rgba(236,226,204,0)'); c.fillStyle = fade; c.fillRect(0, 440, W, 200);
    this.stones.slice().sort((a, b) => b[1] - a[1]).forEach(([X, Z, bl]) => { const k = this.stones.findIndex(s => s[0] === X && s[1] === Z); this.stone(c, X, Z, bl, smooth(1.5 + k * .1, 1.8 + k * .1, t)); });
    // move 37
    const m37 = S.lines[1].at - .3, [mx, my, ms] = this.proj(3, 9);
    if (t > m37) {
      const k = t - m37;
      for (let w = 0; w < 3; w++) { const rr = ms * (.5 + (k - w * .5) * 1.4); if (rr <= 0) continue; c.save(); c.translate(mx, my); c.scale(1, .5); c.strokeStyle = `rgba(30,24,20,${clamp(.35 - (k - w * .5) * .09)})`; c.lineWidth = 2; c.beginPath(); c.arc(0, 0, rr, 0, TAU); c.stroke(); c.restore(); }
      glow(c, mx, my, ms * 1.8, '196,60,40', .25 * clamp(k / 1.5), 'multiply');
      this.stone(c, 3, 9, true, smooth(0, .25, k));
    }
    c.restore();
    // calligraphy & seal
    const ca = smooth(m37 + .4, m37 + 3, t);
    c.save(); c.font = '400 92px "Ma Shan Zheng"'; c.fillStyle = 'rgba(24,20,18,.9)'; c.textAlign = 'center';
    [...'第三十七手'].forEach((ch, i) => { const k = clamp(ca * 5 - i); c.globalAlpha = k; c.fillText(ch, 1700, 230 + i * 104); });
    c.globalAlpha = smooth(m37 + 2.5, m37 + 3.2, t);
    c.fillStyle = '#b8322a'; c.fillRect(1664, 770, 72, 72); c.fillStyle = '#f6eadc'; c.font = '400 30px "Ma Shan Zheng"'; c.fillText('弈', 1700, 820);
    c.restore();
  }
};

// ───────────────────────── ATTENTION 2017 ─────────────────────────
S1.attention = {
  init() {
    this.words = ['The', 'animal', "didn't", 'cross', 'the', 'street', 'because', 'it', 'was', 'too', 'tired'];
    const strong = { '7,1': 3.2, '7,10': 1.4, '10,1': 1.8, '3,5': 2.0, '2,3': 1.6, '1,0': 1.2, '5,4': 1.3, '6,7': 1.2, '9,10': 2.0, '8,7': 1.5 };
    this.Wt = this.words.map((_, i) => { const s = this.words.map((__, j) => (i === j ? -9 : (strong[i + ',' + j] || 0) + hash(i, j, 4) * .9)); const m = Math.max(...s), e = s.map(v => Math.exp(v - m)), z = e.reduce((a, b) => a + b); return e.map(v => v / z); });
  },
  draw(c, t, d, S) {
    c.fillStyle = '#05060c'; c.fillRect(0, 0, W, H);
    const bg = c.createRadialGradient(W / 2, 520, 50, W / 2, 520, 1100); bg.addColorStop(0, 'rgba(40,36,70,.6)'); bg.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = bg; c.fillRect(0, 0, W, H);
    c.save(); cam(c, t, d, { z0: 1.0, z1: 1.07 });
    c.fillStyle = 'rgba(160,160,220,.12)'; for (let i = 0; i < W; i += 48) for (let j = 0; j < H; j += 48) c.fillRect(i, j, 1.5, 1.5);
    const y = 600; c.font = '500 50px "Cormorant Garamond"'; c.letterSpacing = '1px';
    const ws = this.words.map(w => c.measureText(w).width), gap = 40, tot = ws.reduce((a, b) => a + b) + gap * (ws.length - 1);
    let x = W / 2 - tot / 2; const cx = ws.map(w => { const m = x + w / 2; x += w + gap; return m; });
    const l2 = S.lines[1].at, multi = smooth(l2 - .5, l2 + 1.5, t);
    // which word is "looking"
    const seq = [0, 1, 2, 3, 5, 7, 7, 10], step = 1.15, fi = Math.min(seq.length - 1, Math.max(0, Math.floor((t - 1) / step)));
    const focus = seq[fi], fk = smooth(0, .4, (t - 1) - fi * step);
    const heads = [[42, 255, 200, 120, 1], [0, 255, 120, 110, -1], [190, 140, 210, 255, 1]];
    heads.forEach(([hue, r, g, b, dir], hi) => {
      const ha = hi === 0 ? 1 : multi; if (ha <= 0) return;
      const sources = hi === 0 && multi < .5 ? [focus] : this.words.map((_, i) => i);
      for (const i of sources) for (let j = 0; j < this.words.length; j++) {
        if (i === j) continue;
        const w = this.Wt[(i + hi * 3) % this.words.length][j]; let a = w * ha * (sources.length > 1 ? .55 : fk * 1.4);
        if (a < .02) continue;
        const x1 = cx[i], x2 = cx[j], hh = Math.abs(x2 - x1) * .42 * dir, yy = y + (dir > 0 ? -50 : 22);
        c.strokeStyle = `rgba(${r},${g},${b},${Math.min(.9, a)})`; c.lineWidth = .6 + w * 7;
        c.shadowColor = `rgba(${r},${g},${b},.8)`; c.shadowBlur = 10;
        c.beginPath(); c.moveTo(x1, yy); c.quadraticCurveTo((x1 + x2) / 2, yy - hh, x2, yy); c.stroke();
        if (w > .25) { const p = (t * .9 + i * .13) % 1, qx = (1 - p) * (1 - p) * x1 + 2 * p * (1 - p) * (x1 + x2) / 2 + p * p * x2, qy = (1 - p) * (1 - p) * yy + 2 * p * (1 - p) * (yy - hh) + p * p * yy; glow(c, qx, qy, 16, `${r},${g},${b}`, a); }
      }
    });
    c.shadowBlur = 0;
    this.words.forEach((w, i) => {
      const on = (i === focus && multi < .5) ? fk : 0, recv = multi < .5 ? this.Wt[focus][i] * fk : 0;
      c.fillStyle = `rgba(${lerp(220, 255, on) | 0},${lerp(214, 214, on) | 0},${lerp(200, 140, on) | 0},${.55 + .45 * Math.max(on, recv * 2, multi)})`;
      if (on > 0) glow(c, cx[i], y - 14, 70, '255,200,120', .35 * on);
      c.textAlign = 'center'; c.fillText(w, cx[i], y);
    });
    const ta = smooth(l2 + .5, l2 + 2.5, t);
    if (ta > 0) { c.font = 'italic 500 84px "Cormorant Garamond"'; c.textAlign = 'center'; c.fillStyle = `rgba(255,236,200,${ta})`; c.shadowColor = 'rgba(255,190,110,.7)'; c.shadowBlur = 30; c.fillText('Attention Is All You Need', W / 2, 260); c.shadowBlur = 0; c.font = '400 22px "Cinzel"'; c.letterSpacing = '8px'; c.fillStyle = `rgba(220,210,240,${ta * .6})`; c.fillText('VASWANI · SHAZEER · PARMAR · USZKOREIT · JONES · GOMEZ · KAISER · POLOSUKHIN', W / 2, 318); }
    c.restore();
  }
};

// ───────────────────────── 2022: the world starts talking ─────────────────────────
S1.chat = {
  init() {
    this.cx = W / 2; this.cy = 2050; this.R = 1380;
    const { cx, cy, R } = this;
    this.earth = texture(W / 2, H / 2, (i, j, o) => {
      const x = i * 2, y = j * 2, nx = (x - cx) / R, ny = (y - cy) / R, rr = nx * nx + ny * ny;
      if (rr > 1) { o[3] = 0; return; }
      const nz = Math.sqrt(1 - rr), lon = Math.atan2(nx, nz), lat = Math.asin(-ny);
      const land = fbm(lon * 2.2 + 3, lat * 3 + 1, 6, 64), shade = .35 + .65 * nz;
      const L = land > .5;
      o[0] = (L ? 22 : 6) * shade; o[1] = (L ? 26 : 12) * shade; o[2] = (L ? 34 : 30) * shade; o[3] = 255;
    });
    const r = rng(22); this.cities = [];
    while (this.cities.length < 4200) {
      const x = r() * W, y = 650 + r() * 430, nx = (x - cx) / R, ny = (y - cy) / R, rr = nx * nx + ny * ny; if (rr > .995) continue;
      const nz = Math.sqrt(1 - rr), lon = Math.atan2(nx, nz), lat = Math.asin(-ny);
      if (fbm(lon * 2.2 + 3, lat * 3 + 1, 6, 64) < .51) continue;
      const urb = fbm(lon * 14, lat * 14, 3, 65); if (r() > urb * urb * 2.2) continue;
      this.cities.push([x, y, Math.pow(r(), .55), .4 + r() * .6]);
    }
    this.sky = makeSky({ top: [2, 3, 8], bot: [6, 8, 18], seed: 23, stars: 1500 });
  },
  draw(c, t, d, S) {
    c.drawImage(this.sky, 0, 0);
    c.save(); cam(c, t, d, { z0: 1.0, z1: 1.1, y0: 30, y1: -10 });
    const { cx, cy, R } = this;
    c.drawImage(this.earth, 0, 0, W, H);
    // atmosphere rim + dawn
    c.save(); c.globalCompositeOperation = 'lighter';
    const ag = c.createRadialGradient(cx, cy, R - 40, cx, cy, R + 90); ag.addColorStop(0, 'rgba(60,140,255,0)'); ag.addColorStop(.3, 'rgba(80,160,255,.55)'); ag.addColorStop(.42, 'rgba(120,190,255,.25)'); ag.addColorStop(1, 'rgba(60,120,255,0)');
    c.fillStyle = ag; c.fillRect(0, 0, W, H); c.restore();
    glow(c, cx + R * Math.sin(.75), cy - R * Math.cos(.75), 520, '255,170,90', .35);
    // cities wake up
    const prog = smooth(.5, d - 2, t);
    c.save(); c.globalCompositeOperation = 'lighter';
    const act = [];
    for (const [x, y, on, b] of this.cities) {
      const k = smooth(on, on + .04, prog); if (k <= 0) continue;
      c.fillStyle = `rgba(255,${200 + b * 40 | 0},140,${k * b})`; c.fillRect(x, y, 1.8, 1.8);
      if (b > .93) glow(c, x, y, 12, '255,190,110', .4 * k); if (act.length < 400 && b > .7) act.push([x, y]);
    }
    // conversations arcing across the planet
    const n = Math.floor(prog * 50);
    for (let k = 0; k < n && act.length > 10; k++) {
      const a = act[(hash(k, 1) * act.length) | 0], b = act[(hash(k, 2) * act.length) | 0];
      const mx = (a[0] + b[0]) / 2, my = Math.min(a[1], b[1]) - Math.abs(a[0] - b[0]) * .35;
      const p = (t * .35 + hash(k, 3)) % 1;
      c.strokeStyle = `rgba(255,200,140,${.12})`; c.lineWidth = 1; c.beginPath(); c.moveTo(a[0], a[1]); c.quadraticCurveTo(mx, my, b[0], b[1]); c.stroke();
      const qx = (1 - p) * (1 - p) * a[0] + 2 * p * (1 - p) * mx + p * p * b[0], qy = (1 - p) * (1 - p) * a[1] + 2 * p * (1 - p) * my + p * p * b[1];
      glow(c, qx, qy, 10, '255,230,180', .9);
    }
    c.restore();
    c.restore();
    const l2 = S.lines[1].at, ca = smooth(l2, l2 + .8, t);
    if (ca > 0) {
      const v = Math.floor(1e8 * easeOut(clamp((t - l2) / 2.6)));
      c.save(); c.textAlign = 'center'; c.font = '600 92px "Cinzel"'; c.letterSpacing = '6px'; c.fillStyle = `rgba(255,236,206,${ca})`;
      c.shadowColor = 'rgba(255,170,90,.7)'; c.shadowBlur = 30; c.fillText(v.toLocaleString('en-US'), W / 2, 330);
      c.shadowBlur = 0; c.font = '400 24px "Cinzel"'; c.letterSpacing = '12px'; c.fillStyle = `rgba(230,220,200,${ca * .7})`; c.fillText('PEOPLE · IN TWO MONTHS', W / 2, 390); c.restore();
    }
  }
};

// ───────────────────────── TODAY: a mind made of light ─────────────────────────
S1.today = {
  init() {
    const r = rng(2026); this.P = [];
    for (let i = 0; i < 3400; i++) {
      const arm = i % 5, rad = Math.pow(r(), .6) * 560, ang = arm / 5 * TAU + rad * .009 + (r() - .5) * .5;
      this.P.push([Math.cos(ang) * rad, (r() - .5) * 60 * (1 - rad / 600) + (r() - .5) * 10, Math.sin(ang) * rad, rad / 560, r()]);
    }
    this.E = []; for (let i = 0; i < 900; i++) { const j = i + 5 + (hash(i, 1) * 20 | 0); if (j < this.P.length) this.E.push([i, j]); }
    this.chars = [...'铜算问名学冬火棋看弈意话'];
  },
  draw(c, t, d, S) {
    c.fillStyle = '#04030a'; c.fillRect(0, 0, W, H);
    c.save(); cam(c, t, d, { z0: 1.0, z1: 1.12 });
    const rot = t * .09, tilt = 1.12, cxx = W / 2, cyy = 500, f = 1500, camz = 1700, grow = smooth(0, 4, t);
    const pr = this.P.map(([x, y, z]) => {
      const x1 = x * Math.cos(rot) - z * Math.sin(rot), z1 = x * Math.sin(rot) + z * Math.cos(rot);
      const y2 = y * Math.cos(tilt) - z1 * Math.sin(tilt), z2 = y * Math.sin(tilt) + z1 * Math.cos(tilt);
      const s = f / (camz + z2); return [cxx + x1 * s * grow, cyy + y2 * s * grow, s];
    });
    c.save(); c.globalCompositeOperation = 'lighter';
    c.lineWidth = .6;
    for (const [i, j] of this.E) { const a = pr[i], b = pr[j]; if (Math.hypot(a[0] - b[0], a[1] - b[1]) > 90) continue; c.strokeStyle = `rgba(255,180,140,${.08 + .1 * Math.sin(t * 2 + i)})`; c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke(); }
    this.P.forEach(([, , , rn, rr], i) => {
      const [x, y, s] = pr[i], tw = .6 + .4 * Math.sin(t * 3 + rr * 50);
      const col = rn < .25 ? '255,240,210' : rn < .6 ? '255,160,120' : '170,150,255';
      c.fillStyle = `rgba(${col},${(.35 + .5 * (1 - rn)) * tw})`; const sz = (1 + rr * 1.6) * s; c.fillRect(x, y, sz, sz);
    });
    c.restore();
    glow(c, cxx, cyy, 380 * grow, '255,150,100', .35); glow(c, cxx, cyy, 120, '255,236,210', .8);
    // ring of the story so far
    c.save(); c.font = '600 34px "Noto Serif S1"'; c.textAlign = 'center'; c.textBaseline = 'middle';
    this.chars.forEach((ch, i) => {
      const a = i / this.chars.length * TAU - t * .12, x = cxx + Math.cos(a) * 760, z = Math.sin(a), y = cyy + z * 210;
      const ap = smooth(1 + i * .25, 2 + i * .25, t) * (.35 + .65 * (z + 1) / 2);
      c.fillStyle = `rgba(255,232,200,${ap})`; c.shadowColor = 'rgba(255,150,90,.9)'; c.shadowBlur = 18; c.fillText(ch, x, y);
    });
    c.restore();
    c.restore();
  }
};

// ───────────────────────── EPILOGUE: back to the fire ─────────────────────────
S1.epilogue = {
  init() {
    this.sky = makeSky({ top: [8, 10, 22], bot: [70, 52, 36], band: 1.1, bandY: .2, bandTilt: .55, seed: 300, stars: 2200, starH: .62 });
    const x = this.sky.getContext('2d');
    // far hills
    x.fillStyle = '#1a140f'; x.beginPath(); x.moveTo(0, H);
    for (let px = 0; px <= W; px += 8) x.lineTo(px, 650 - 40 * fbm(px / 300, 1, 4, 301) - (px > 200 && px < 600 ? 30 * Math.sin((px - 200) / 400 * Math.PI) : 0));
    x.lineTo(W, H); x.fill();
    // savanna floor
    const g = x.createLinearGradient(0, 650, 0, H); g.addColorStop(0, '#2a1f16'); g.addColorStop(1, '#0c0806'); x.fillStyle = g; x.fillRect(0, 660, W, H);
    const r = rng(303); x.strokeStyle = 'rgba(10,6,4,.6)'; x.lineWidth = 1;
    for (let k = 0; k < 2600; k++) { const gx = r() * W, gy = 660 + Math.pow(r(), .7) * 420, h = 4 + (gy - 660) / 20 * r(); x.beginPath(); x.moveTo(gx, gy); x.lineTo(gx + (r() - .5) * 6, gy - h); x.stroke(); }
    // acacia
    x.fillStyle = '#0c0805'; x.beginPath(); x.moveTo(1584, 660); x.lineTo(1592, 560); x.lineTo(1560, 480); x.lineTo(1570, 478); x.lineTo(1598, 540); x.lineTo(1630, 470); x.lineTo(1640, 474); x.lineTo(1606, 560); x.lineTo(1600, 660); x.fill();
    for (let k = 0; k < 60; k++) { x.beginPath(); x.ellipse(1460 + r() * 300, 456 + r() * 34 - Math.sin((r()) * Math.PI) * 10, 30 + r() * 50, 8 + r() * 10, 0, 0, TAU); x.fill(); }
  },
  draw(c, t, d, S) {
    c.save(); cam(c, t, d, { z0: 1.0, z1: 1.1, y0: 0, y1: 30 });
    c.drawImage(this.sky, 0, 0); twinkle(c, t, 301, 120, H * .55);
    const fx = W / 2 - 120, fy = 780;
    const people = [[-330, -10, .95, 1], [-210, 30, 1.1, 1], [-70, -40, .8, 1], [90, -40, .82, -1], [220, 26, 1.05, -1], [340, -4, .9, -1]];
    // constellation linking the people (as in the stories told by the fire)
    const la = smooth(2, 5, t);
    c.save(); c.setLineDash([2, 6]); c.strokeStyle = `rgba(255,200,150,${.45 * la})`; c.lineWidth = 1.2;
    const heads = people.map(([dx, dy, s, dir]) => [fx + dx + 4 * s * dir, fy + dy - 116 * s]);
    for (let i = 0; i < heads.length; i++) for (let j = i + 1; j < heads.length; j++) if ((i + j) % 2 === 1 || j === i + 1) { c.beginPath(); c.moveTo(...heads[i]); c.lineTo(...heads[j]); c.stroke(); }
    c.setLineDash([]); c.restore();
    people.forEach(([dx, dy, s, dir], k) => sitter(c, fx + dx, fy + dy, s, dir, '#0b0604', t, k));
    heads.forEach(([x, y]) => { glow(c, x, y, 16, '255,140,90', .8 * la); c.fillStyle = `rgba(255,190,150,${la})`; c.beginPath(); c.arc(x, y, 3, 0, TAU); c.fill(); });
    fire(c, t, fx, fy + 10, 1.05);
    sparks(c, t, { seed: 99, n: 90, x: fx, y: fy - 30, spread: 40, life: 7, speed: 85, size: 1.9 });
    c.restore();
    // end card
    const E = S.endAt;
    if (t > E - 1) {
      const k = smooth(E - 1, E + 1.5, t);
      c.fillStyle = `rgba(3,2,1,${k * .93})`; c.fillRect(0, 0, W, H);
      c.save(); c.textAlign = 'center'; c.textBaseline = 'middle';
      const a1 = smooth(E + .3, E + 2, t);
      c.font = '700 96px "Noto Serif S1"'; c.letterSpacing = '24px'; c.fillStyle = `rgba(244,214,160,${a1})`; c.shadowColor = 'rgba(255,140,60,.5)'; c.shadowBlur = 36;
      c.fillText('思想的火种', W / 2 + 12, 430); c.shadowBlur = 0;
      c.font = '400 28px "Cinzel"'; c.letterSpacing = '14px'; c.fillStyle = `rgba(234,216,188,${a1 * .9})`; c.fillText('THE SPARK OF THOUGHT', W / 2 + 7, 530);
      const a2 = smooth(E + 2.2, E + 3.6, t);
      c.font = '400 26px "Noto Serif S1"'; c.letterSpacing = '16px'; c.fillStyle = `rgba(234,216,188,${a2 * .85})`; c.fillText('未 完 待 续', W / 2 + 8, 640);
      c.font = 'italic 400 26px "Cormorant Garamond"'; c.letterSpacing = '2px'; c.fillStyle = `rgba(234,216,188,${a2 * .6})`; c.fillText('to be continued', W / 2, 690);
      glow(c, W / 2, 770, 60 + 10 * Math.sin(t * 2), '255,140,60', .5 * a2); c.fillStyle = `rgba(255,230,190,${a2})`; c.beginPath(); c.arc(W / 2, 770, 3, 0, TAU); c.fill();
      c.restore();
    }
  }
};
