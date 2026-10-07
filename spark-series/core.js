// core.js — shared math, noise, textures, post-processing and overlays.
// Everything is a pure function of time so frames can be rendered in any order.
'use strict';

const W = 1920, H = 1080, FPS = 30;
const XF = 1.6; // cross-fade between scenes (seconds)

// ---------- math ----------
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };
const easeOut = t => 1 - Math.pow(1 - clamp(t), 3);
const easeIn = t => Math.pow(clamp(t), 3);
const easeInOut = t => { t = clamp(t); return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
// alpha window: fades in over fi starting at a, fades out over fo ending at b
const win = (t, a, b, fi = .8, fo = .8) => Math.min(smooth(a, a + fi, t), 1 - smooth(b - fo, b, t));
const TAU = Math.PI * 2;

function hash(i, j, s = 0) {
  let h = (i * 374761393 + j * 668265263 + s * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function rng(seed) { // mulberry32
  let a = seed >>> 0;
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
function vnoise(x, y, s = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y, o = 5, s = 0) {
  let v = 0, a = .5, f = 1, n = 0;
  for (let i = 0; i < o; i++) { v += a * vnoise(x * f, y * f, s + i * 17); n += a; a *= .5; f *= 2.03; }
  return v / n;
}
const n1 = (t, s = 0) => vnoise(t, .37, s);

// ---------- canvas helpers ----------
function mk(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function texture(w, h, fn) {
  const c = mk(w, h), x = c.getContext('2d'), im = x.createImageData(w, h), d = im.data, o = [0, 0, 0, 255];
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    o[3] = 255; fn(i, j, o); const p = (j * w + i) * 4;
    d[p] = o[0]; d[p + 1] = o[1]; d[p + 2] = o[2]; d[p + 3] = o[3];
  }
  x.putImageData(im, 0, 0); return c;
}
function glow(c, x, y, r, rgb, a = 1, mode = 'lighter') {
  if (a <= 0 || r <= 0) return;
  c.save(); c.globalCompositeOperation = mode;
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(${rgb},${a})`); g.addColorStop(.25, `rgba(${rgb},${a * .45})`); g.addColorStop(1, `rgba(${rgb},0)`);
  c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2); c.restore();
}
function cam(c, t, d, o) { // slow camera move: zoom/pan around center
  const k = easeInOut(t / d);
  const z = lerp(o.z0 ?? 1, o.z1 ?? 1.06, k), x = lerp(o.x0 ?? 0, o.x1 ?? 0, k), y = lerp(o.y0 ?? 0, o.y1 ?? 0, k);
  c.translate(W / 2 + x, H / 2 + y); c.scale(z, z); c.translate(-W / 2, -H / 2);
}
function strokeReveal(c, pts, p) { // draw polyline up to fraction p of its length
  if (p <= 0 || pts.length < 2) return;
  let L = 0; const seg = [];
  for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(l); L += l; }
  let left = L * clamp(p); c.beginPath(); c.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length && left > 0; i++) {
    const f = Math.min(1, left / seg[i - 1]);
    c.lineTo(lerp(pts[i - 1][0], pts[i][0], f), lerp(pts[i - 1][1], pts[i][1], f)); left -= seg[i - 1];
  }
  c.stroke();
}

// starfield with optional milky way band
function makeSky(o) {
  const w = o.w || W, h = o.h || H, top = o.top, bot = o.bot, r = rng(o.seed || 1);
  const c = texture(w >> 1, h >> 1, (i, j, out) => {
    const y = j / (h >> 1), x = i / (w >> 1);
    let col = [lerp(top[0], bot[0], y), lerp(top[1], bot[1], y), lerp(top[2], bot[2], y)];
    if (o.band) {
      const d = (y - (o.bandY ?? .35) - (x - .5) * (o.bandTilt ?? .5));
      const m = Math.exp(-d * d * 40) * fbm(x * 9, y * 9, 6, 3);
      const dust = fbm(x * 22, y * 22, 5, 9);
      const k = Math.max(0, m * 1.7 - .38) * (o.band) * (dust > .54 ? .35 : 1);
      col = col.map((v, ci) => v + k * [58, 56, 62][ci]);
    }
    out[0] = col[0]; out[1] = col[1]; out[2] = col[2];
  });
  const big = mk(w, h), x = big.getContext('2d');
  x.imageSmoothingQuality = 'high'; x.drawImage(c, 0, 0, w, h);
  const n = o.stars ?? 1400;
  for (let i = 0; i < n; i++) {
    const sx = r() * w, sy = r() * h * (o.starH ?? 1), m = Math.pow(r(), 6);
    const a = (.25 + .75 * r()) * (1 - sy / h * (o.starFade ?? .6));
    x.fillStyle = `rgba(${235 + r() * 20 | 0},${225 + r() * 25 | 0},${205 + r() * 40 | 0},${a})`;
    x.beginPath(); x.arc(sx, sy, .5 + m * 1.8, 0, TAU); x.fill();
    if (m > .5) glow(x, sx, sy, 6 + m * 10, '255,240,220', .35 * a);
  }
  if (o.band) { // dense faint star dust along the band
    for (let i = 0; i < 6000; i++) {
      const u = r(), sx = u * w, off = (r() + r() + r() - 1.5) * .09;
      const sy = ((o.bandY ?? .35) + (u - .5) * (o.bandTilt ?? .5) + off) * h;
      x.fillStyle = `rgba(240,232,220,${.15 + r() * .35})`; x.fillRect(sx, sy, .9 + r() * .7, .9 + r() * .7);
    }
  }
  return big;
}
function twinkle(c, t, seed, n, yMax = H * .6, a = 1) {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    const x = r() * W, y = r() * yMax, ph = r() * TAU, sp = .5 + r() * 2, s = .8 + r() * 1.6;
    const k = .5 + .5 * Math.sin(t * sp + ph);
    const al = a * k * k;
    c.fillStyle = `rgba(255,244,225,${al})`; c.fillRect(x - s / 2, y - s / 2, s, s);
    if (s > 2) glow(c, x, y, 9 * s, '255,235,200', .25 * al);
  }
}

// rising sparks / embers (stateless)
function sparks(c, t, o) {
  const r = rng(o.seed || 7);
  c.save(); c.globalCompositeOperation = 'lighter';
  for (let i = 0; i < o.n; i++) {
    const life = o.life * (.6 + .8 * r()), off = r() * life, sx = (r() - .5) * o.spread, sp = o.speed * (.6 + .8 * r());
    const ph = r() * 100, sz = (o.size || 2) * (.5 + r());
    const age = ((t + off) % life) / life;
    const y = o.y - age * life * sp;
    const x = o.x + sx * (1 + age * 1.8) + (vnoise(ph, age * 3 + t * .3, 3) - .5) * 160 * age;
    const a = (1 - age) * Math.min(1, age * 8) * (o.a ?? 1) * (.6 + .4 * Math.sin(t * 13 + ph));
    if (a <= 0) continue;
    c.fillStyle = `rgba(255,${190 - age * 90 | 0},${90 - age * 60 | 0},${a})`;
    c.beginPath(); c.arc(x, y, sz * (1 - age * .5), 0, TAU); c.fill();
    if (i % 3 === 0) { const g = c.createRadialGradient(x, y, 0, x, y, sz * 7); g.addColorStop(0, `rgba(255,150,60,${a * .35})`); g.addColorStop(1, 'rgba(255,120,40,0)'); c.fillStyle = g; c.fillRect(x - sz * 7, y - sz * 7, sz * 14, sz * 14); }
  }
  c.restore();
}

// campfire
function fire(c, t, x, y, s = 1, a = 1) {
  glow(c, x, y - 30 * s, 520 * s, '255,120,40', .28 * a * (0.9 + .2 * n1(t * 4, 5)));
  glow(c, x, y - 20 * s, 180 * s, '255,170,80', .5 * a);
  // logs
  c.save(); c.globalAlpha = a; c.fillStyle = '#1a0d07';
  for (const [ang, len] of [[-.35, 120], [.32, 130], [.05, 100]]) {
    c.save(); c.translate(x, y + 6 * s); c.rotate(ang); c.beginPath(); c.roundRect(-len * s / 2, -9 * s, len * s, 18 * s, 9 * s); c.fill();
    c.fillStyle = 'rgba(255,90,20,.55)'; c.fillRect(-len * s / 4, -9 * s, len * s / 2, 4 * s); c.fillStyle = '#1a0d07'; c.restore();
  }
  c.restore();
  c.save(); c.globalCompositeOperation = 'lighter';
  for (let k = 0; k < 9; k++) {
    const ph = k * 1.7, fw = (26 + 14 * hash(k, 1)) * s;
    const hgt = (90 + 90 * n1(t * 3.2 + ph, k) + (k % 3 === 0 ? 50 : 0)) * s;
    const fx = x + (k - 4) * 9 * s, sway = (n1(t * 2.5 + ph, k + 30) - .5) * 50 * s;
    const g = c.createLinearGradient(0, y, 0, y - hgt);
    g.addColorStop(0, `rgba(255,230,160,${.5 * a})`); g.addColorStop(.35, `rgba(255,150,40,${.38 * a})`); g.addColorStop(1, 'rgba(200,40,10,0)');
    c.fillStyle = g; c.beginPath(); c.moveTo(fx - fw, y);
    c.bezierCurveTo(fx - fw * 1.1, y - hgt * .45, fx + sway * .4 - fw * .3, y - hgt * .7, fx + sway, y - hgt);
    c.bezierCurveTo(fx + sway * .4 + fw * .3, y - hgt * .7, fx + fw * 1.1, y - hgt * .45, fx + fw, y);
    c.closePath(); c.fill();
  }
  glow(c, x, y - 25 * s, 60 * s, '255,240,200', .8 * a);
  c.restore();
}

// seated human silhouette hugging knees, facing dir (+1 right, -1 left), rim-lit from the front
function sitterPath(c, b) {
  c.beginPath();
  c.moveTo(-34, 0); c.bezierCurveTo(-42, -30, -34, -64, -16, -80 + b); c.quadraticCurveTo(-6, -86 + b, 2, -80 + b);
  c.quadraticCurveTo(14, -70 + b, 22, -58); c.quadraticCurveTo(36, -60, 46, -52); c.quadraticCurveTo(54, -40, 52, -22);
  c.lineTo(58, -4); c.quadraticCurveTo(60, 2, 50, 2); c.closePath();
  c.moveTo(16, -100 + b); c.ellipse(1, -100 + b, 15, 17, .15, 0, TAU);
  c.moveTo(-6, -84 + b); c.lineTo(6, -84 + b); c.lineTo(4, -92 + b); c.lineTo(-4, -92 + b); c.closePath();
}
function sitter(c, x, y, s, dir, col, t = 0, seed = 0, rim = .55) {
  const b = Math.sin(t * .8 + seed) * 1.2;
  c.save(); c.translate(x, y); c.scale(s * dir, s);
  c.save(); c.translate(3.2, 1); c.fillStyle = `rgba(255,140,60,${rim})`; sitterPath(c, b); c.fill(); c.restore();
  c.fillStyle = col; sitterPath(c, b); c.fill();
  c.restore();
}
// ---------- global textures ----------
const TEX = {};
function initCoreTextures() {
  // aged paper stains: mostly white (multiply-neutral) with blotches, foxing, crease and burnt edges
  const r = rng(42);
  TEX.paper = texture(W / 2, H / 2, (i, j, o) => {
    const x = i / (W / 2), y = j / (H / 2);
    const f = fbm(x * 3.2, y * 2.2, 6, 11), g = fbm(x * 9, y * 7, 4, 23);
    let v = 1 - Math.max(0, f - .52) * 1.1 - Math.max(0, g - .68) * .9;
    const ex = Math.min(x, 1 - x), ey = Math.min(y, 1 - y), e = Math.min(ex * 1.4, ey * 2.2);
    v -= Math.max(0, .12 - e) * 2.2 * (.6 + .8 * fbm(x * 20, y * 20, 3, 5));
    const crease = Math.exp(-Math.pow((x - .53 - (y - .5) * .02) * 380, 2)) * .22 * (0.5 + fbm(y * 30, 0, 3, 7));
    v -= crease;
    const tint = Math.max(0, f - .45);
    o[0] = clamp(v + tint * .1, 0, 1) * 255; o[1] = clamp(v - tint * .12, 0, 1) * 250; o[2] = clamp(v - tint * .35, 0, 1) * 236;
  });
  const px = TEX.paper.getContext('2d');
  for (let k = 0; k < 70; k++) { // foxing spots
    const x = r() * W / 2, y = r() * H / 2, rad = 1 + Math.pow(r(), 3) * 9;
    const g = px.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, `rgba(120,70,30,${.25 + r() * .3})`); g.addColorStop(1, 'rgba(120,70,30,0)');
    px.fillStyle = g; px.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  // fine paper fibre grain (overlay)
  TEX.fibre = texture(W / 2, H / 2, (i, j, o) => {
    const v = 128 + (fbm(i * .9, j * .08, 3, 31) - .5) * 70 + (hash(i, j, 3) - .5) * 26;
    o[0] = o[1] = o[2] = v;
  });
  // film grain frames
  TEX.grain = [];
  for (let k = 0; k < 6; k++) TEX.grain.push(texture(W / 2, H / 2, (i, j, o) => {
    const v = 128 + ((hash(i, j, k * 7 + 1) + hash(i, j, k * 7 + 2) + hash(i, j, k * 7 + 3)) / 3 - .5) * 150;
    o[0] = o[1] = o[2] = v;
  }));
  // vignette
  TEX.vig = mk(W, H); const vx = TEX.vig.getContext('2d');
  const vg = vx.createRadialGradient(W / 2, H * .5, H * .35, W / 2, H * .5, H * 1.05);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(.6, 'rgba(8,4,2,.35)'); vg.addColorStop(1, 'rgba(5,2,0,.85)');
  vx.fillStyle = vg; vx.fillRect(0, 0, W, H);
}

function post(c, T, o = {}) {
  c.save();
  c.globalCompositeOperation = 'multiply'; c.globalAlpha = o.paper ?? .6; c.drawImage(TEX.paper, 0, 0, W, H);
  c.globalCompositeOperation = 'overlay'; c.globalAlpha = o.fibre ?? .25; c.drawImage(TEX.fibre, 0, 0, W, H);
  c.globalAlpha = o.grain ?? .32; c.drawImage(TEX.grain[Math.floor(T * 24) % 6], 0, 0, W, H);
  c.globalCompositeOperation = 'source-over'; c.globalAlpha = o.vig ?? 1; c.drawImage(TEX.vig, 0, 0);
  // gate weave / exposure flicker
  const fl = (n1(T * 7, 99) - .5) * .05;
  c.globalAlpha = 1; c.fillStyle = fl > 0 ? `rgba(255,236,200,${fl})` : `rgba(0,0,0,${-fl})`; c.fillRect(0, 0, W, H);
  // occasional film scratch
  const sk = Math.floor(T * 3);
  if (hash(sk, 5) > .72) {
    const x = hash(sk, 6) * W, a = .08 + hash(sk, 7) * .12;
    c.strokeStyle = `rgba(255,240,220,${a})`; c.lineWidth = 1; c.beginPath(); c.moveTo(x, 0);
    c.lineTo(x + (hash(sk, 8) - .5) * 30, H); c.stroke();
  }
  c.restore();
}

// ---------- text overlays ----------
const F = {
  cn: w => `${w} 44px "Noto Serif SC"`,
  en: '400 italic 30px "Cormorant Garamond"',
  date: '600 36px "Cinzel","Noto Serif SC"',
  place: '400 20px "Noto Serif SC"',
};

function star8(c, x, y, r, col) {
  c.save(); c.translate(x, y); c.strokeStyle = col; c.lineWidth = 1.4;
  for (let k = 0; k < 8; k++) { c.rotate(Math.PI / 4); c.beginPath(); c.moveTo(0, 0); c.lineTo(0, k % 2 ? r * .55 : r); c.stroke(); }
  c.restore();
}

function header(c, sc, t) {
  if (!sc.date) return;
  const a = win(t, .5, sc.dur - .4, 1.2, 1.0);
  if (a <= 0) return;
  c.save(); c.globalAlpha = a;
  const light = sc.theme === 'light', col = light ? '40,28,20' : '238,224,200';
  const lp = easeOut((t - .5) / 1.2);
  c.strokeStyle = `rgba(${col},.85)`; c.lineWidth = 1.5; c.beginPath(); c.moveTo(80, 72); c.lineTo(80 + 62 * lp, 72); c.stroke();
  c.font = F.date; c.letterSpacing = `${lerp(14, 5, easeOut((t - .5) / 2))}px`;
  c.fillStyle = `rgba(${col},${a})`; c.textBaseline = 'middle';
  if (!light) { c.shadowColor = 'rgba(0,0,0,.6)'; c.shadowBlur = 12; }
  c.fillText(sc.date, 166, 72);
  c.font = F.place; c.letterSpacing = '6px'; c.globalAlpha = a * smooth(1.2, 2.4, t) * .8;
  c.fillText(sc.place, 168, 116);
  c.restore();
}

function subtitle(c, sc, t) {
  const light = sc.theme === 'light';
  for (const L of sc.lines) {
    const lt = t - L.at; if (lt < 0 || t > L.out) continue;
    const fade = 1 - smooth(L.out - .6, L.out, t);
    const chars = [...L.cn], per = window.SUB_PER || .085, Y = 862;
    c.save(); c.textBaseline = 'alphabetic';
    // soft backing so text reads on any scene
    c.save(); c.scale(1, .26);
    const by = (Y + 18) / .26, bg = c.createRadialGradient(W / 2, by, 10, W / 2, by, 760);
    bg.addColorStop(0, light ? `rgba(245,236,220,${.7 * fade})` : `rgba(8,5,3,${(sc.subBack ?? .5) * fade})`); bg.addColorStop(.6, light ? `rgba(245,236,220,${.3 * fade})` : `rgba(8,5,3,${(sc.subBack ?? .5) * .45 * fade})`); bg.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = bg; c.fillRect(0, by - 760, W, 1520); c.restore();
    c.font = F.cn(L.big ? 600 : 500); c.letterSpacing = '4px';
    const widths = chars.map(ch => c.measureText(ch).width);
    let x = W / 2 - widths.reduce((a, b) => a + b, 0) / 2;
    for (let i = 0; i < chars.length; i++) {
      const k = clamp((lt - i * per) / .32); if (k <= 0) break;
      const hot = clamp(1 - (lt - i * per - .25) / .9);
      const base = light ? [38, 26, 18] : [246, 238, 226], warm = light ? [160, 50, 30] : [240, 178, 140];
      const col = base.map((v, ci) => lerp(v, warm[ci], hot));
      c.fillStyle = `rgba(${col.join(',')},${k * fade})`;
      if (!light) { c.shadowColor = `rgba(0,0,0,${.75 * fade})`; c.shadowBlur = 14; }
      c.fillText(chars[i], x, Y + (1 - easeOut(k)) * 8);
      x += widths[i];
    }
    c.shadowBlur = 0;
    const done = chars.length * per + .2;
    // ornament divider
    const dp = easeOut((lt - .3) / 1.4), acc = light ? '170,40,30' : '226,92,58';
    c.strokeStyle = `rgba(${light ? '60,40,30' : '230,215,195'},${.45 * fade})`; c.lineWidth = 1;
    c.beginPath(); c.moveTo(W / 2 - 22, Y + 40); c.lineTo(W / 2 - 22 - 110 * dp, Y + 40);
    c.moveTo(W / 2 + 22, Y + 40); c.lineTo(W / 2 + 22 + 110 * dp, Y + 40); c.stroke();
    c.save(); c.globalAlpha = fade * dp; star8(c, W / 2, Y + 40, 8, `rgb(${acc})`); c.restore();
    // english
    const ea = smooth(done, done + .9, lt) * fade;
    if (ea > 0) {
      c.font = F.en; c.letterSpacing = '0.5px'; c.textAlign = 'center';
      c.fillStyle = light ? `rgba(50,36,26,${ea * .9})` : `rgba(232,218,198,${ea * .88})`;
      if (!light) { c.shadowColor = 'rgba(0,0,0,.7)'; c.shadowBlur = 10; }
      c.fillText(L.en, W / 2, Y + 86);
    }
    c.restore();
  }
}

function timeline(c, scenes, T, a) {
  if (a <= 0) return;
  const chap = scenes.filter(s => s.label);
  const x0 = 110, x1 = W - 110, y = 1036;
  const pos = i => lerp(x0 + 40, x1 - 40, i / (chap.length - 1));
  // current fractional position
  let p = 0;
  for (let i = 0; i < chap.length; i++) if (T >= chap[i].start) p = i + clamp((T - chap[i].start) / (chap[i].dur - XF)) * (i < chap.length - 1 ? 1 : 0);
  const cx = lerp(pos(0), pos(chap.length - 1), p / (chap.length - 1));
  c.save(); c.globalAlpha = a;
  c.strokeStyle = 'rgba(230,215,195,.28)'; c.setLineDash([2, 5]); c.lineWidth = 1;
  c.beginPath(); c.moveTo(x0, y); c.lineTo(x1, y); c.stroke(); c.setLineDash([]);
  c.strokeStyle = 'rgba(214,72,48,.85)'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(x0, y); c.lineTo(cx, y); c.stroke();
  chap.forEach((s, i) => {
    const x = pos(i), on = T >= s.start;
    c.fillStyle = on ? 'rgba(226,92,58,.9)' : 'rgba(230,215,195,.35)';
    c.beginPath(); c.arc(x, y, on ? 2.6 : 2, 0, TAU); c.fill();
  });
  // current label
  const cur = chap.reduce((m, s, i) => (T >= s.start ? i : m), 0);
  const la = Math.min(smooth(chap[cur].start, chap[cur].start + 1, T), 1 - smooth(chap[cur].start + chap[cur].dur - XF - .6, chap[cur].start + chap[cur].dur - XF, T) * (cur < chap.length - 1 ? 1 : 0));
  c.font = '600 22px "Noto Serif SC"'; c.textAlign = 'center'; c.fillStyle = `rgba(244,234,218,${la})`;
  c.shadowColor = 'rgba(0,0,0,.8)'; c.shadowBlur = 8;
  c.fillText(chap[cur].label, pos(cur), y - 16);
  c.shadowBlur = 0;
  glow(c, cx, y, 14, '255,120,70', .7);
  c.font = '400 14px "Noto Serif SC"'; c.letterSpacing = '3px'; c.fillStyle = 'rgba(230,215,195,.55)';
  c.textAlign = 'left'; c.fillText(window.TL_LEFT || '神话时代', x0, y + 26); c.textAlign = 'right'; c.fillText(window.TL_RIGHT || '今天', x1, y + 26);
  c.restore();
}

// ---------- extra helpers for the second film ----------
function loadImg(src) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('missing ' + src)); i.src = src; }); }
// soft bloom: blur a downscaled copy of the buffer and add it back
let _bloom;
function bloom(c, amt = .5, rad = 10, thr = 0) {
  if (!_bloom) { _bloom = mk(W / 4, H / 4); }
  const b = _bloom.getContext('2d');
  b.globalCompositeOperation = 'source-over'; b.filter = 'none'; b.clearRect(0, 0, W / 4, H / 4);
  b.drawImage(c.canvas, 0, 0, W / 4, H / 4);
  if (thr > 0) { b.globalCompositeOperation = 'multiply'; b.drawImage(_bloom, 0, 0); b.globalCompositeOperation = 'source-over'; }
  c.save(); c.globalCompositeOperation = 'screen'; c.globalAlpha = amt; c.filter = `blur(${rad}px)`;
  c.drawImage(_bloom, 0, 0, W, H); c.restore();
}
// anamorphic lens flare streak
function flare(c, x, y, len, a, rgb = '255,200,160') {
  if (a <= 0) return;
  c.save(); c.globalCompositeOperation = 'lighter';
  const g = c.createLinearGradient(x - len, 0, x + len, 0);
  g.addColorStop(0, `rgba(${rgb},0)`); g.addColorStop(.5, `rgba(${rgb},${a})`); g.addColorStop(1, `rgba(${rgb},0)`);
  c.fillStyle = g; c.fillRect(x - len, y - 1.5, len * 2, 3);
  c.globalAlpha = .5; c.fillRect(x - len * .6, y - 5, len * 1.2, 10);
  c.restore();
  glow(c, x, y, len * .25, rgb, a * .6);
}
