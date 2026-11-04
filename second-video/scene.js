// 1 秒钟 — a generative vertical short film (1080×1920, 60 fps).
// Every frame is a pure function of time t (seeded randomness), so frames render in any order.
'use strict';

const W = 1080, H = 1920, FPS = 60, DURATION = 45;
const cv = document.getElementById('c');
let ctx = cv.getContext('2d');

// ================================================================ utilities
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const lerp = (a, b, t) => a + (b - a) * t;
const ss = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const easeIO = t => { t = clamp(t); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
const easeOut = t => 1 - Math.pow(1 - clamp(t), 3);
const easeIn = t => clamp(t) ** 3;
const easeOutExpo = t => t >= 1 ? 1 : 1 - Math.pow(2, -10 * clamp(t));
const easeInExpo = t => t <= 0 ? 0 : Math.pow(2, 10 * clamp(t) - 10);
const easeOutBack = t => { t = clamp(t); const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
function rng(seed) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function hash(i) {
  let t = Math.imul(i | 0, 0x9E3779B1);
  t = Math.imul(t ^ t >>> 16, 0x85ebca6b);
  t = Math.imul(t ^ t >>> 13, 0xc2b2ae35);
  return ((t ^ t >>> 16) >>> 0) / 4294967296;
}
const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mixc = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const rgba = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${clamp(a)})`;
const fmt = n => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

// ================================================================ sprites & textures
function makeGlow(c, size = 64, soft = false) {
  const g = mk(size, size), x = g.getContext('2d'), r = size / 2;
  const gr = x.createRadialGradient(r, r, 0, r, r, r);
  if (soft) { gr.addColorStop(0, rgba(c, 1)); gr.addColorStop(0.35, rgba(c, 0.55)); gr.addColorStop(0.7, rgba(c, 0.15)); gr.addColorStop(1, rgba(c, 0)); }
  else { gr.addColorStop(0, rgba(mixc(c, [255, 255, 255], 0.7), 1)); gr.addColorStop(0.1, rgba(c, 0.85)); gr.addColorStop(0.3, rgba(c, 0.28)); gr.addColorStop(0.6, rgba(c, 0.06)); gr.addColorStop(1, rgba(c, 0)); }
  x.fillStyle = gr; x.fillRect(0, 0, size, size); return g;
}
const GL = {}, BB = {};
const glow = h => GL[h] || (GL[h] = makeGlow(hex(h), 64));
const blob = h => BB[h] || (BB[h] = makeGlow(hex(h), 256, true));
function spr(img, x, y, size, alpha, sx = 1, sy = 1) {
  if (alpha <= 0.003 || size <= 0.2) return;
  ctx.globalAlpha = clamp(alpha);
  ctx.drawImage(img, x - size * sx / 2, y - size * sy / 2, size * sx, size * sy);
}
function softGlow(x, y, r, rgb, alpha, sx = 1, sy = 1) {
  if (alpha <= 0.003) return;
  ctx.save(); ctx.translate(x, y); ctx.scale(sx, sy);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
  g.addColorStop(0, rgba(rgb, 1)); g.addColorStop(0.35, rgba(rgb, 0.5)); g.addColorStop(0.7, rgba(rgb, 0.13)); g.addColorStop(1, rgba(rgb, 0));
  ctx.globalAlpha = clamp(alpha); ctx.fillStyle = g; ctx.fillRect(-r, -r, 2 * r, 2 * r); ctx.restore();
}

// tileable fBm value noise
function tileNoise(size, periods, seed) {
  const r = rng(seed), out = new Float32Array(size * size); let sum = 0;
  periods.forEach((p, oi) => {
    const g = new Float32Array(p * p); for (let i = 0; i < g.length; i++) g[i] = r();
    const amp = Math.pow(0.55, oi); sum += amp;
    for (let y = 0; y < size; y++) {
      const gy = y / size * p, iy = Math.floor(gy), fy = gy - iy, sy = fy * fy * (3 - 2 * fy), y0 = iy % p, y1 = (iy + 1) % p;
      for (let x = 0; x < size; x++) {
        const gx = x / size * p, ix = Math.floor(gx), fx = gx - ix, sx = fx * fx * (3 - 2 * fx), x0 = ix % p, x1 = (ix + 1) % p;
        const a = lerp(g[y0 * p + x0], g[y0 * p + x1], sx), b = lerp(g[y1 * p + x0], g[y1 * p + x1], sx);
        out[y * size + x] += amp * lerp(a, b, sy);
      }
    }
  });
  for (let i = 0; i < out.length; i++) out[i] /= sum;
  return out;
}
function colorize(noise, size, stops, alphaFn) {
  const c = mk(size, size), x = c.getContext('2d'), id = x.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const v = noise[i];
    let k = 0; while (k < stops.length - 2 && v > stops[k + 1][0]) k++;
    const [p0, c0] = stops[k], [p1, c1] = stops[k + 1];
    const col = mixc(c0, c1, clamp((v - p0) / (p1 - p0)));
    id.data[i * 4] = col[0]; id.data[i * 4 + 1] = col[1]; id.data[i * 4 + 2] = col[2];
    id.data[i * 4 + 3] = alphaFn ? alphaFn(v) * 255 : 255;
  }
  x.putImageData(id, 0, 0); return c;
}
const N1 = tileNoise(512, [4, 8, 16, 32, 64, 128], 11);
const N2 = tileNoise(512, [3, 6, 12, 24, 48], 23);
const PLASMA = colorize(N1, 512, [[0.25, [30, 2, 0]], [0.42, [150, 22, 4]], [0.55, [240, 95, 15]], [0.66, [255, 180, 70]], [0.78, [255, 240, 200]]]);
const GRANULE = colorize(N2, 512, [[0.3, [120, 30, 0]], [0.5, [255, 140, 30]], [0.62, [255, 210, 110]], [0.75, [255, 248, 220]]]);
const CLOUDS = colorize(N1, 512, [[0, [255, 255, 255]], [1, [255, 255, 255]]], v => clamp((v - 0.5) / 0.18));
const LAND = colorize(N2, 512, [[0.0, [40, 110, 60]], [0.6, [70, 130, 60]], [0.7, [150, 130, 80]], [1, [190, 170, 120]]], v => v > 0.53 ? 1 : 0);
const pat = img => ctx.createPattern(img, 'repeat');

const TMP = mk(W, H), TMPX = TMP.getContext('2d');
const TMP2 = mk(W, H), TMP2X = TMP2.getContext('2d');
const BL1 = mk(W / 4, H / 4), BL1X = BL1.getContext('2d');
const BL2 = mk(W / 4, H / 4), BL2X = BL2.getContext('2d');
const BL3 = mk(W / 8, H / 8), BL3X = BL3.getContext('2d');
const VIG = (() => {
  const g = mk(W, H), x = g.getContext('2d');
  const gr = x.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.62);
  gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.55)');
  x.fillStyle = gr; x.fillRect(0, 0, W, H); return g;
})();
const GRAIN = [0, 1, 2, 3].map(s => {
  const g = mk(256, 256), x = g.getContext('2d'), id = x.createImageData(256, 256), r = rng(77 + s);
  for (let i = 0; i < id.data.length; i += 4) { const v = r() * 255; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 255; }
  x.putImageData(id, 0, 0); return g;
});

// ================================================================ text
function txt(s, x, y, o = {}) {
  const a = o.alpha ?? 1; if (a <= 0.003) return;
  const size = o.size || 60, sp = o.spacing || 0;
  ctx.save();
  ctx.translate(x, y); ctx.scale(o.scale ?? 1, o.scale ?? 1);
  ctx.font = `${o.weight || 900} ${size}px ${o.family || 'Sans'}`;
  ctx.letterSpacing = sp + 'px';
  ctx.textAlign = o.align || 'center'; ctx.textBaseline = 'middle';
  const off = (o.align || 'center') === 'center' ? sp / 2 : 0;
  if (o.blur > 0.2) ctx.filter = `blur(${o.blur.toFixed(1)}px)`;
  const ch = o.chroma || 0;
  if (ch > 0.4) {
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a * 0.8;
    ctx.fillStyle = '#ff2a5f'; ctx.fillText(s, off + ch, 0);
    ctx.fillStyle = '#20d0ff'; ctx.fillText(s, off - ch, 0);
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.globalAlpha = a;
  if (o.shadow) { ctx.shadowColor = o.shadow; ctx.shadowBlur = o.shadowBlur ?? 30; }
  ctx.fillStyle = typeof o.fill === 'function' ? o.fill(ctx) : (o.fill || '#fff');
  ctx.fillText(s, off, 0);
  ctx.restore();
}
function slam(s, x, y, t, t0, t1, o = {}) {
  if (t < t0 || t > t1) return;
  const age = t - t0, out = 1 - ss(t1 - 0.3, t1, t);
  txt(s, x, y, Object.assign({}, o, {
    scale: lerp(o.from || 1.9, 1, easeOutBack(age / (o.dur || 0.35))),
    alpha: ss(t0, t0 + 0.08, t) * out * (o.alpha ?? 1),
    chroma: (o.chroma ?? 14) * Math.exp(-age * 7),
    blur: Math.max(0, 9 * (1 - age / 0.15)),
  }));
}
function rise(s, x, y, t, t0, t1, o = {}) {
  if (t < t0 || t > t1) return;
  const p = ss(t0, t0 + (o.dur || 0.6), t), out = 1 - ss(t1 - 0.35, t1, t);
  txt(s, x, y + (1 - easeOut(p)) * 34, Object.assign({}, o, { alpha: p * out * (o.alpha ?? 1), blur: (1 - p) * 12 }));
}
const GOLD_FILL = c => { const g = c.createLinearGradient(0, -50, 0, 50); g.addColorStop(0, '#fffaf0'); g.addColorStop(1, '#ffbf5a'); return g; };
const SHADOW = 'rgba(0,0,0,0.65)';

function drawSun(cx, cy, R, t, burst = 0) {
  ctx.globalCompositeOperation = 'lighter';
  softGlow(cx, cy, R * 1.6, [255, 120, 30], 0.55);
  softGlow(cx, cy, R * 1.15, [255, 200, 90], 0.5);
  ctx.globalCompositeOperation = 'source-over';
  ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.clip();
  const P = pat(GRANULE); P.setTransform(new DOMMatrix().translate(cx + t * 8, cy).scale(Math.max(0.6, R / 1100)));
  ctx.fillStyle = P; ctx.globalAlpha = 1; ctx.fillRect(cx - R, cy - R, 2 * R, 2 * R);
  const ld = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
  ld.addColorStop(0, 'rgba(255,250,220,0.35)'); ld.addColorStop(0.75, 'rgba(255,170,60,0.1)'); ld.addColorStop(1, 'rgba(160,30,0,0.85)');
  ctx.fillStyle = ld; ctx.fillRect(cx - R, cy - R, 2 * R, 2 * R);
  ctx.restore();
  // corona: soft layered glow hugging the limb
  ctx.globalCompositeOperation = 'lighter';
  softGlow(cx, cy + R * 0.98, R * 0.5, [255, 150, 60], 0.35, 1.8, 0.35);
  ctx.globalCompositeOperation = 'source-over';
}
function earth(x, y, R, t) {
  ctx.globalCompositeOperation = 'lighter';
  softGlow(x, y, R * 1.25, [90, 180, 255], 0.55);
  ctx.globalCompositeOperation = 'source-over';
  ctx.save(); ctx.beginPath(); ctx.arc(x, y, R, 0, Math.PI * 2); ctx.clip();
  const og = ctx.createRadialGradient(x, y - R * 0.6, R * 0.1, x, y, R);
  og.addColorStop(0, '#3fa0ff'); og.addColorStop(0.6, '#0b4fb0'); og.addColorStop(1, '#03163a');
  ctx.globalAlpha = 1; ctx.fillStyle = og; ctx.fillRect(x - R, y - R, 2 * R, 2 * R);
  const sc = R / 700;
  const PL = pat(LAND); PL.setTransform(new DOMMatrix().translate(x + t * 10, y).scale(sc * 1.4));
  ctx.globalAlpha = 0.85; ctx.fillStyle = PL; ctx.fillRect(x - R, y - R, 2 * R, 2 * R);
  const PC = pat(CLOUDS); PC.setTransform(new DOMMatrix().translate(x - t * 18, y).scale(sc * 1.1));
  ctx.globalAlpha = 0.8; ctx.fillStyle = PC; ctx.fillRect(x - R, y - R, 2 * R, 2 * R);
  const sh = ctx.createLinearGradient(0, y - R, 0, y + R);
  sh.addColorStop(0, 'rgba(0,0,10,0)'); sh.addColorStop(0.55, 'rgba(0,0,10,0.1)'); sh.addColorStop(1, 'rgba(0,0,10,0.92)');
  ctx.globalAlpha = 1; ctx.fillStyle = sh; ctx.fillRect(x - R, y - R, 2 * R, 2 * R);
  const rim = ctx.createRadialGradient(x, y, R * 0.86, x, y, R);
  rim.addColorStop(0, 'rgba(120,200,255,0)'); rim.addColorStop(1, 'rgba(150,215,255,0.85)');
  ctx.fillStyle = rim; ctx.fillRect(x - R, y - R, 2 * R, 2 * R);
  ctx.restore();
}

// ================================================================ timeline
const SC = [   // [start, end] of each one-second fact
  [3.0, 7.4], [7.4, 11.8], [11.8, 16.2], [16.2, 20.6], [20.6, 25.0], [25.0, 29.0], [29.0, 33.4],
];
const TWIST = 33.4, TALLY = 35.6, END = 40.6;
const IMPACTS = [[0.0, 0.5], [1.25, 1.0], ...SC.map(s => [s[0], 0.55]), [TWIST, 0.9], [TALLY, 0.6], [END, 1.0]];
function impact(t, decay = 6) { let s = 0; for (const [ti, k] of IMPACTS) if (t >= ti && t - ti < 2) s += k * Math.exp(-(t - ti) * decay); return s; }
const STARS = []; { const r = rng(91); for (let i = 0; i < 420; i++) STARS.push([r() * W, r() * H, r(), r() * 6]); }

function bg(top, bot, glowC, glowA = 0.3) {
  const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, top); g.addColorStop(1, bot);
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; ctx.fillStyle = g; ctx.fillRect(-50, -50, W + 100, H + 100);
  if (glowC) { ctx.globalCompositeOperation = 'lighter'; softGlow(W / 2, H * 0.5, 900, glowC, glowA); ctx.globalCompositeOperation = 'source-over'; }
}
function stars(t, a = 1) {
  ctx.globalCompositeOperation = 'lighter';
  for (const [x, y, d, ph] of STARS) spr(glow('#ffffff'), x, y, 3 + d * 5, a * (0.3 + 0.4 * Math.sin(t * 2 + ph)) * (0.4 + d));
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
}
function panel(y, h, a) {
  if (a <= 0) return;
  const g = ctx.createLinearGradient(0, y - h / 2, 0, y + h / 2);
  g.addColorStop(0, 'rgba(4,4,14,0)'); g.addColorStop(0.25, 'rgba(4,4,14,0.72)'); g.addColorStop(0.75, 'rgba(4,4,14,0.72)'); g.addColorStop(1, 'rgba(4,4,14,0)');
  ctx.globalAlpha = a; ctx.fillStyle = g; ctx.fillRect(0, y - h / 2, W, h); ctx.globalAlpha = 1;
}

// the shared layout of a fact: a small kicker, the headline, and a big ticking number
function fact(t, i, line1, line2, value, unit, decimals, colr, note) {
  const [a, b] = SC[i];
  if (t < a || t > b) return;
  const k = ss(a + 0.6, b - 0.9, t), v = value * easeOut(k);
  panel(250, 330, ss(a, a + 0.2, t) * (1 - ss(b - 0.25, b, t)));
  rise('这 1 秒里', W / 2, 150, t, a + 0.05, b, { size: 40, weight: 700, spacing: 12, alpha: 0.85, shadow: SHADOW });
  slam(line1, W / 2, 245, t, a + 0.15, b, { size: 70, spacing: 4, shadow: SHADOW, from: 1.5 });
  if (line2) slam(line2, W / 2, 335, t, a + 0.35, b, { size: 70, spacing: 4, shadow: SHADOW, from: 1.5 });
  panel(1660, 360, ss(a + 0.4, a + 0.6, t) * (1 - ss(b - 0.25, b, t)));
  const num = decimals ? v.toFixed(decimals) : fmt(v);
  ctx.save(); ctx.letterSpacing = '0px'; ctx.font = '900 170px Mont'; const wn = ctx.measureText(decimals ? value.toFixed(decimals) : fmt(value)).width; ctx.font = '900 64px Sans'; const wu = ctx.measureText(unit).width; ctx.restore();
  const x0 = W / 2 - (wn + 24 + wu) / 2;
  slam(num, x0 + wn / 2, 1640, t, a + 0.5, b, { family: 'Mont', size: 170, weight: 900, spacing: 0, fill: c => rgba(colr), shadow: rgba(mixc(colr, [0, 0, 0], 0.5), 0.9), shadowBlur: 50, chroma: 8, from: 1.4 });
  slam(unit, x0 + wn + 24 + wu / 2, 1668, t, a + 0.6, b, { size: 64, spacing: 0, shadow: SHADOW, from: 1.4 });
  if (note) rise(note, W / 2, 1800, t, a + 0.9, b, { size: 34, weight: 600, alpha: 0.8, spacing: 2, shadow: SHADOW });
}

// a small "paused" stopwatch pill shown during the facts
function pausedPill(t) {
  const a = ss(3.0, 3.3, t) * (1 - ss(TWIST - 0.2, TWIST, t));
  if (a <= 0) return;
  ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.roundRect(W - 330, 40, 290, 62, 31); ctx.fill(); ctx.stroke();
  ctx.fillStyle = Math.sin(t * 6) > 0 ? '#ff4d5e' : 'rgba(255,77,94,0.35)'; ctx.fillRect(W - 300, 59, 8, 24); ctx.fillRect(W - 286, 59, 8, 24);
  ctx.restore();
  txt('00:01.000', W - 160, 72, { family: 'Mont', size: 32, weight: 800, alpha: a, spacing: 1 });
}

// ================================================================ hook: one second, frozen
function stopwatch(cx, cy, R, frac, t, glowK = 1) {
  ctx.globalCompositeOperation = 'lighter'; softGlow(cx, cy, R * 1.8, [80, 160, 255], 0.35 * glowK); ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  const g = ctx.createRadialGradient(cx, cy - R * 0.3, R * 0.1, cx, cy, R);
  g.addColorStop(0, '#1b2442'); g.addColorStop(1, '#0a0f22');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#dfe8ff'; ctx.lineWidth = 10; ctx.stroke();
  ctx.fillStyle = '#dfe8ff'; ctx.fillRect(cx - 36, cy - R - 70, 72, 46); ctx.fillRect(cx - 14, cy - R - 30, 28, 30);
  for (let i = 0; i < 60; i++) {
    const a = i / 60 * Math.PI * 2 - Math.PI / 2, big = i % 5 === 0;
    ctx.strokeStyle = big ? '#ffffff' : 'rgba(255,255,255,0.45)'; ctx.lineWidth = big ? 6 : 3;
    ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * R * 0.92, cy + Math.sin(a) * R * 0.92); ctx.lineTo(cx + Math.cos(a) * R * (big ? 0.8 : 0.86), cy + Math.sin(a) * R * (big ? 0.8 : 0.86)); ctx.stroke();
  }
  // the sweep: a glowing arc for the elapsed fraction
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = 'rgba(90,180,255,0.55)'; ctx.lineWidth = 26; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(cx, cy, R * 0.7, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2); ctx.stroke();
  ctx.globalCompositeOperation = 'source-over';
  const a = -Math.PI / 2 + frac * Math.PI * 2;
  ctx.strokeStyle = '#ff4d5e'; ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(cx - Math.cos(a) * R * 0.15, cy - Math.sin(a) * R * 0.15); ctx.lineTo(cx + Math.cos(a) * R * 0.85, cy + Math.sin(a) * R * 0.85); ctx.stroke();
  ctx.fillStyle = '#ff4d5e'; ctx.beginPath(); ctx.arc(cx, cy, 16, 0, Math.PI * 2); ctx.fill();
}
function sceneHook(t) {
  bg('#05081c', '#0c1238', [60, 90, 220], 0.35); stars(t, 0.6);
  const run = clamp((t + 0.25) / 1.5), frac = run;                 // the second sweeps by… then freezes
  const frozen = t > 1.25;
  const zoom = 1 + 6 * easeInExpo(ss(2.4, 3.0, t));
  ctx.save(); ctx.translate(W / 2, 1000); ctx.scale(zoom, zoom); ctx.translate(-W / 2, -1000);
  stopwatch(W / 2, 1000, 380, Math.min(1, frac), t, 1 + (frozen ? 0.6 * Math.exp(-(t - 1.25) * 3) : 0));
  if (frozen) {   // freeze ripple
    const age = t - 1.25;
    ctx.globalAlpha = Math.max(0, 1 - age / 0.9); ctx.strokeStyle = '#9fd0ff'; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(W / 2, 1000, 380 + age * 900, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
  }
  ctx.restore();
  const secs = Math.min(1, run);
  const clock = secs >= 1 ? '00:01.000' : `00:00.${String(Math.floor(secs * 1000)).padStart(3, '0')}`;
  txt(clock, W / 2, 1520, { family: 'Mont', size: 120, weight: 900, spacing: 4, alpha: 1 - ss(2.4, 2.7, t), fill: frozen ? '#ff6b7a' : '#ffffff', shadow: 'rgba(0,0,0,0.6)', shadowBlur: 30 });
  if (frozen) txt('已暂停', W / 2, 1640, { size: 52, weight: 800, spacing: 8, alpha: (1 - ss(2.4, 2.7, t)) * (0.6 + 0.4 * Math.sin(t * 8)), fill: '#ff6b7a' });
  slam('1 秒钟', W / 2, 260, t, 0.0, 3.0, { size: 120, spacing: 10, shadow: SHADOW, from: 1.4 });
  slam('能发生什么？', W / 2, 410, t, 1.25, 3.0, { size: 100, spacing: 6, fill: GOLD_FILL, shadow: 'rgba(120,60,0,0.9)', shadowBlur: 40, from: 2.2 });
}

// ================================================================ the seven facts
function sceneLight(t) {      // light circles the Earth 7.5 times
  const [a, b] = SC[0], u = ss(a + 0.6, b - 0.9, t);
  bg('#02061a', '#06113a', [40, 90, 220], 0.3); stars(t);
  earth(W / 2, 960, 330, t);
  const laps = 7.5 * easeOut(u), cx = W / 2, cy = 960, rx = 430, ry = 150, tilt = -0.32;
  ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
  // fading trail of the last half lap
  for (let k = 0; k < 40; k++) {
    const ang = (laps - k * 0.012) * Math.PI * 2, ang2 = (laps - (k + 1) * 0.012) * Math.PI * 2;
    const p = [cx + Math.cos(ang) * rx * Math.cos(tilt) - Math.sin(ang) * ry * Math.sin(tilt), cy + Math.cos(ang) * rx * Math.sin(tilt) + Math.sin(ang) * ry * Math.cos(tilt)];
    const q = [cx + Math.cos(ang2) * rx * Math.cos(tilt) - Math.sin(ang2) * ry * Math.sin(tilt), cy + Math.cos(ang2) * rx * Math.sin(tilt) + Math.sin(ang2) * ry * Math.cos(tilt)];
    const behind = Math.sin(ang) < 0 && Math.hypot(p[0] - cx, p[1] - cy) < 330;
    ctx.globalAlpha = (1 - k / 40) * (behind ? 0.15 : 0.9); ctx.strokeStyle = '#fff4d8'; ctx.lineWidth = 10 * (1 - k / 40) + 2;
    ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke();
  }
  const ang = laps * Math.PI * 2;
  const p = [cx + Math.cos(ang) * rx * Math.cos(tilt) - Math.sin(ang) * ry * Math.sin(tilt), cy + Math.cos(ang) * rx * Math.sin(tilt) + Math.sin(ang) * ry * Math.cos(tilt)];
  const behind = Math.sin(ang) < 0 && Math.hypot(p[0] - cx, p[1] - cy) < 330;
  spr(glow('#ffffff'), p[0], p[1], 120, behind ? 0.2 : 1); spr(glow('#fff2c8'), p[0], p[1], 300, behind ? 0.1 : 0.6);
  ctx.globalAlpha = 0.25; ctx.strokeStyle = '#9fc8ff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, tilt, 0, Math.PI * 2); ctx.stroke();
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  fact(t, 0, '光，绕着地球', '跑了 7.5 圈', 7.5, '圈', 1, [190, 225, 255], '光速：每秒约 30 万公里');
}
function sceneOrbit(t) {      // Earth flies ~30 km around the Sun
  const [a, b] = SC[1], u = ss(a + 0.4, b - 0.4, t);
  bg('#05030f', '#120a24', null); stars(t);
  drawSun(-260, 900, 620, t);
  ctx.globalAlpha = 0.25; ctx.strokeStyle = '#ffd9a0'; ctx.lineWidth = 3; ctx.setLineDash([8, 14]);
  ctx.beginPath(); ctx.arc(-260, 900, 1150, -0.55, 0.55); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
  const ang = lerp(-0.2, 0.2, u), ex = -260 + Math.cos(ang) * 1150, ey = 900 + Math.sin(ang) * 1150;
  ctx.globalCompositeOperation = 'lighter';
  for (let k = 1; k < 26; k++) { const a2 = ang - k * 0.008; ctx.globalAlpha = 0.5 * (1 - k / 26); ctx.fillStyle = '#9fd0ff'; ctx.beginPath(); ctx.arc(-260 + Math.cos(a2) * 1150, 900 + Math.sin(a2) * 1150, 90 * (1 - k / 30), 0, Math.PI * 2); ctx.fill(); }
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  earth(ex, ey, 110, t);
  txt('你在这里', ex - 150, ey - 120, { size: 32, weight: 800, align: 'right', alpha: ss(a + 0.8, a + 1.1, t) * (1 - ss(b - 0.3, b, t)), shadow: SHADOW });
  ctx.globalAlpha = ss(a + 0.8, a + 1.1, t) * (1 - ss(b - 0.3, b, t)); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(ex - 70, ey - 70); ctx.lineTo(ex - 145, ey - 115); ctx.stroke(); ctx.globalAlpha = 1;
  fact(t, 1, '地球带着你', '在太空里飞了', 30, '公里', 0, [255, 210, 120], '自转一圈的赤道上，你还转了约 465 米');
}
const BOLTS = []; { const r = rng(44); for (let k = 0; k < 44; k++) { const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 0.9; BOLTS.push([Math.cos(a) * d, Math.sin(a) * d * 0.95, r(), k]); } }
function sceneLightning(t) {  // ~44 lightning flashes worldwide
  const [a, b] = SC[2], u = ss(a + 0.6, b - 0.9, t);
  bg('#06021a', '#12062c', [110, 60, 220], 0.25); stars(t, 0.6);
  const cx = W / 2, cy = 960, R = 400;
  earth(cx, cy, R, t);
  ctx.globalAlpha = 0.55; ctx.fillStyle = '#05041a'; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;   // night side
  const shown = Math.floor(44 * easeOut(u) + 1e-6);
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 44; i++) {
    const [x, y, s] = BOLTS[i];
    if (i >= shown) continue;
    const born = a + 0.6 + (b - 1.5 - a) * (1 - Math.cbrt(1 - (i + 0.5) / 44)), age = t - born;
    const flash = age >= 0 ? Math.exp(-age * 5) : 0;
    const px = cx + x * R, py = cy + y * R;
    spr(glow('#d8ccff'), px, py, 60 + 260 * flash, 0.7 + 0.3 * flash); spr(glow('#ffffff'), px, py, 16 + 40 * flash, 0.9);
    if (flash > 0.2) {
      ctx.globalAlpha = flash; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 5; ctx.beginPath(); let qx = px, qy = py - 90;
      ctx.moveTo(qx, qy); for (let k = 0; k < 6; k++) { qx += (hash(i * 9 + k) - 0.5) * 40; qy += 15; ctx.lineTo(qx, qy); } ctx.stroke();
    }
  }
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  fact(t, 2, '全世界', '落下了约 44 道闪电', 44, '道', 0, [200, 180, 255], null);
}
function sceneBirth(t) {      // ~4 babies are born, ~2 people pass away
  const [a, b] = SC[3];
  bg('#2a0d22', '#4a1a2e', [255, 140, 160], 0.35);
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 120; i++) { const y = ((hash(i) * H - (t - a) * 40 * (0.5 + hash(i + 1))) % H + H) % H; spr(glow('#ffc8d8'), hash(i + 2) * W, y, 6 + 8 * hash(i + 3), 0.35); }
  ctx.globalCompositeOperation = 'source-over';
  const cx = W / 2, cy = 960;
  for (let k = 0; k < 4; k++) {
    const tb = a + 0.8 + k * 0.6, age = t - tb; if (age < 0) continue;
    const x = cx + (k - 1.5) * 220, y = cy - 60 + (k % 2) * 90, s = easeOutBack(age / 0.5);
    ctx.globalCompositeOperation = 'lighter'; softGlow(x, y, 160, [255, 190, 150], 0.6 * Math.min(1, age * 2)); ctx.globalCompositeOperation = 'source-over';
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    ctx.fillStyle = '#ffe6d2'; ctx.beginPath(); ctx.arc(0, -40, 42, 0, Math.PI * 2); ctx.fill();          // a swaddled baby
    ctx.fillStyle = ['#ffb3c7', '#a8d8ff', '#ffe08a', '#b8f0c8'][k]; ctx.beginPath(); ctx.ellipse(0, 40, 56, 78, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#3a2a2a'; ctx.beginPath(); ctx.arc(-14, -44, 4, 0, Math.PI * 2); ctx.arc(14, -44, 4, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#3a2a2a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, -30, 10, 0.2, Math.PI - 0.2); ctx.stroke();
    ctx.restore();
  }
  // two lights drifting gently upward
  ctx.globalCompositeOperation = 'lighter';
  for (let k = 0; k < 2; k++) { const tb = a + 2.0 + k * 0.5, age = t - tb; if (age < 0) continue; spr(glow('#fff0d8'), cx + (k ? 300 : -300), 1300 - age * 120, 80, 0.7 * Math.max(0, 1 - age / 2.8)); }
  ctx.globalCompositeOperation = 'source-over';
  fact(t, 3, '地球上', '约 4 个婴儿出生了', 4, '个', 0, [255, 190, 200], '也有约 2 个人，悄悄离开');
}
function sceneSunMass(t) {    // the Sun turns ~4 million tonnes of matter into light
  const [a, b] = SC[4];
  bg('#120400', '#2a0a00', null); stars(t, 0.4);
  drawSun(W / 2, 960, 360 * (1 + 0.01 * Math.sin(t * 3)), t);
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 260; i++) {
    const ang = hash(i) * Math.PI * 2, sp = 200 + hash(i + 1) * 700, life = 1.4 + hash(i + 2), ph = hash(i + 3) * life;
    const age = ((t - a) + ph) % life, d = 360 + sp * age;
    spr(glow(i % 3 ? '#ffd27a' : '#ffffff'), W / 2 + Math.cos(ang) * d, 960 + Math.sin(ang) * d, 8 + 10 * hash(i + 4), 0.8 * (1 - age / life));
  }
  ctx.globalCompositeOperation = 'source-over';
  fact(t, 4, '太阳里，约 400 万吨物质', '变成了光和热', 400, '万吨', 0, [255, 190, 90], null);
}
function sceneHeart(t) {      // your heart beats about once
  const [a, b] = SC[5];
  bg('#1a0208', '#2e0610', [255, 60, 90], 0.25);
  const beat = t - (a + 1.2), pulse = beat > 0 ? Math.exp(-beat * 3.5) * Math.sin(Math.min(Math.PI, beat * 14)) : 0;
  const s = 1 + 0.18 * Math.max(0, pulse);
  ctx.save(); ctx.translate(W / 2, 900); ctx.scale(s * 5.2, s * 5.2);
  ctx.fillStyle = '#ff3b5c'; ctx.shadowColor = 'rgba(255,60,90,0.9)'; ctx.shadowBlur = 30;
  ctx.beginPath(); ctx.moveTo(0, 30); ctx.bezierCurveTo(-60, -10, -40, -60, 0, -32); ctx.bezierCurveTo(40, -60, 60, -10, 0, 30); ctx.fill();
  ctx.restore(); ctx.shadowBlur = 0;
  // ECG trace
  const x0 = 60, x1 = W - 60, y0 = 1330, prog = ss(a + 0.3, b - 0.6, t);
  ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = '#7cffb2'; ctx.lineWidth = 6; ctx.lineJoin = 'round';
  ctx.beginPath();
  for (let x = x0; x <= lerp(x0, x1, prog); x += 4) {
    const u = (x - x0) / (x1 - x0), d = u - ss(a + 0.3, b - 0.6, a + 1.2);
    const y = y0 - 230 * Math.exp(-(d * d) / 0.00003) + 70 * Math.exp(-((d - 0.02) ** 2) / 0.00004) - 35 * Math.exp(-((d + 0.07) ** 2) / 0.0004) - 45 * Math.exp(-((d - 0.14) ** 2) / 0.0009);
    x === x0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.stroke(); spr(glow('#b8ffd8'), lerp(x0, x1, prog), y0, 60, 1);
  ctx.globalCompositeOperation = 'source-over';
  fact(t, 5, '你的心脏', '跳了约 1 下', 1, '下', 0, [255, 120, 140], null);
}
function sceneCells(t) {      // ~3.8 million cells replaced
  const [a, b] = SC[6];
  bg('#011418', '#02262a', [40, 200, 190], 0.3);
  // a human silhouette made of glittering cells
  const cx = W / 2, top = 520;
  ctx.globalCompositeOperation = 'lighter';
  const shape = (x, y) => {
    const dx = x - cx, dy = y - top;
    const head = (dx * dx) / (70 * 70) + ((dy - 80) ** 2) / (85 * 85) < 1;
    const body = dy > 170 && dy < 560 && Math.abs(dx) < 140 - Math.max(0, dy - 480) * 0.3;
    const arms = dy > 190 && dy < 520 && Math.abs(dx) > 150 && Math.abs(dx) < 200 - (dy - 190) * 0.05;
    const legs = dy >= 540 && dy < 900 && Math.abs(dx) > 14 && Math.abs(dx) < 120 - (dy - 540) * 0.12;
    return head || body || arms || legs;
  };
  for (let i = 0; i < 2600; i++) {
    const x = cx + (hash(i * 3) - 0.5) * 460, y = top + hash(i * 3 + 1) * 920;
    if (!shape(x, y)) continue;
    const renew = ((t - a) * 1.3 + hash(i * 3 + 2) * 4) % 1;
    const fl = renew < 0.08 ? 1 - renew / 0.08 : 0;
    spr(glow(fl > 0.1 ? '#ffffff' : (i % 3 ? '#5ef0d8' : '#a8fff0')), x, y, 10 + 18 * fl, 0.45 + 0.55 * fl);
  }
  ctx.globalCompositeOperation = 'source-over';
  fact(t, 6, '你的身体里', '约 380 万个细胞被更新', 380, '万个', 0, [120, 245, 225], null);
}

// ================================================================ twist: you've already watched N seconds
function sceneTwist(t) {
  bg('#05081c', '#0c1238', [60, 90, 220], 0.3); stars(t, 0.5);
  const real = t;   // the viewer has really been watching for t seconds
  const shake = t < TWIST + 0.4 ? (1 - (t - TWIST) / 0.4) * 10 : 0;
  ctx.save(); ctx.translate((hash(Math.floor(t * 60)) - 0.5) * shake, 0);
  stopwatch(W / 2, 760, 260, (real % 1), t, 0.8);
  ctx.restore();
  const m = Math.floor(real / 60), sec = Math.floor(real % 60), ms = Math.floor((real % 1) * 1000);
  txt(`${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(ms).padStart(3, '0')}`, W / 2, 1120, { family: 'Mont', size: 110, weight: 900, spacing: 4, fill: '#ffffff', shadow: 'rgba(0,0,0,0.6)', shadowBlur: 30 });
  slam('等等——', W / 2, 250, t, TWIST, TALLY, { size: 90, spacing: 10, shadow: SHADOW });
  slam(`你已经看了 ${Math.floor(real)} 秒了`, W / 2, 1300, t, TWIST + 0.6, TALLY, { size: 78, spacing: 4, fill: GOLD_FILL, shadow: 'rgba(120,60,0,0.9)', shadowBlur: 40 });
  // tally: live counters for the time already watched
  if (t > TALLY - 0.05) {
    rise(`这 ${Math.floor(real)} 秒里，地球上——`, W / 2, 250, t, TALLY, END, { size: 62, weight: 900, spacing: 4, shadow: SHADOW });
    const rows = [['约', fmt(4.25 * real), '个婴儿出生', [255, 190, 200]], ['约', fmt(44 * real), '道闪电落下', [200, 180, 255]], ['光绕地球约', fmt(7.48 * real), '圈', [190, 225, 255]], ['你的身体更新了约', (0.038 * real).toFixed(1), '亿个细胞', [120, 245, 225]]];
    rows.forEach(([pre, num, post, col], k) => {
      const t0 = TALLY + 0.3 + k * 0.45, y = 1350 + k * 120;
      if (t < t0) return;
      const a = ss(t0, t0 + 0.2, t) * (1 - ss(END - 0.25, END, t));
      txt(pre, 120, y, { size: 44, weight: 700, align: 'left', alpha: a, shadow: SHADOW });
      ctx.font = '700 44px Sans'; ctx.letterSpacing = '0px'; const w0 = ctx.measureText(pre).width;
      txt(num, 120 + w0 + 20, y - 4, { family: 'Mont', size: 70, weight: 900, align: 'left', alpha: a, fill: c => rgba(col), shadow: SHADOW });
      ctx.font = '900 70px Mont'; const w1 = ctx.measureText(num).width;
      txt(post, 120 + w0 + 20 + w1 + 20, y, { size: 44, weight: 700, align: 'left', alpha: a, shadow: SHADOW });
    });
  }
}
function sceneEnd(t) {
  bg('#05081c', '#1a0f38', [255, 160, 80], 0.25); stars(t, 0.8);
  // a ring of the seven facts orbiting the title
  const icons = ['#bfe1ff', '#ffd27a', '#c9b8ff', '#ffc0cc', '#ffb35a', '#ff6b80', '#78f5e1'];
  ctx.globalCompositeOperation = 'lighter';
  icons.forEach((c, k) => { const a = t * 0.6 + k / 7 * Math.PI * 2; spr(glow(c), W / 2 + Math.cos(a) * 420, 960 + Math.sin(a) * 420 * 0.35, 70, 0.9); });
  softGlow(W / 2, 960, 700, [255, 170, 90], 0.25);
  ctx.globalCompositeOperation = 'source-over';
  slam('每一秒', W / 2, 760, t, END, 46, { size: 100, spacing: 20, shadow: SHADOW, from: 1.5 });
  slam('都有奇迹发生', W / 2, 920, t, END + 0.3, 46, { size: 120, spacing: 8, fill: GOLD_FILL, shadow: 'rgba(160,70,0,0.9)', shadowBlur: 50, from: 2.0 });
  rise('别浪费你的下一秒', W / 2, 1100, t, END + 1.2, 46, { size: 58, weight: 700, spacing: 10, shadow: SHADOW });
  txt('1 秒钟', W / 2, 1700, { size: 46, weight: 800, spacing: 16, alpha: ss(END + 1.6, END + 2.2, t) * 0.8 });
}

// ================================================================ frame
const SCENES = [sceneLight, sceneOrbit, sceneLightning, sceneBirth, sceneSunMass, sceneHeart, sceneCells];
function renderTime(t) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; ctx.filter = 'none'; ctx.shadowBlur = 0; ctx.letterSpacing = '0px';
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  const imp = impact(t), f = Math.round(t * FPS);
  let big = 0; for (const [ti, k] of IMPACTS) if (k >= 0.8 && t >= ti && t - ti < 0.5) big = Math.max(big, k * Math.exp(-(t - ti) * 8));
  const sh = Math.min(12, big * 10);
  ctx.setTransform(1, 0, 0, 1, (hash(f * 2) - 0.5) * 2 * sh, (hash(f * 2 + 1) - 0.5) * 2 * sh);
  let bl = 0.45;
  if (t < 3.0) sceneHook(t);
  else if (t < TWIST) {
    const i = SC.findIndex(([a, b]) => t >= a && t < b);
    // quick zoom-punch transition into each fact
    const [a] = SC[i], k = 1 + 0.12 * Math.exp(-(t - a) * 6);
    ctx.save(); ctx.translate(W / 2, H / 2); ctx.scale(k, k); ctx.translate(-W / 2, -H / 2);
    SCENES[i](t);
    ctx.restore();
    ctx.setTransform(1, 0, 0, 1, 0, 0); pausedPill(t);
  } else if (t < END) { sceneTwist(t); }
  else { sceneEnd(t); bl = 0.5; }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  bloom(bl + 0.25 * Math.min(1, imp));
  chromaShift(Math.min(10, imp * 6));
  ctx.globalCompositeOperation = 'source-over';
  let flash = 0;
  for (const [ti, k] of IMPACTS) if (ti > 0 && t >= ti && t - ti < 0.5) flash = Math.max(flash, k * Math.exp(-(t - ti) * 14));
  if (flash > 0.01) { ctx.globalAlpha = Math.min(0.7, flash * 0.6); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H); }
  ctx.globalAlpha = 0.6; ctx.drawImage(VIG, 0, 0);
  ctx.globalCompositeOperation = 'overlay'; ctx.globalAlpha = 0.045;
  const gimg = GRAIN[f % 4], ox = -Math.floor(hash(f) * 256), oy = -Math.floor(hash(f + 999) * 256);
  for (let y = oy; y < H; y += 256) for (let x = ox; x < W; x += 256) ctx.drawImage(gimg, x, y);
  ctx.globalCompositeOperation = 'source-over';
  const black = ss(44.2, 44.9, t);
  if (black > 0) { ctx.globalAlpha = black; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); }
  ctx.globalAlpha = 1;
}
function renderCover() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; ctx.shadowBlur = 0;
  bg('#05081c', '#0c1238', [60, 90, 220], 0.35); stars(2, 0.6);
  stopwatch(W / 2, 1050, 380, 1, 2, 1.4);
  txt('1 秒钟', W / 2, 280, { size: 140, weight: 900, spacing: 10, shadow: SHADOW });
  txt('能发生什么？', W / 2, 450, { size: 110, weight: 900, spacing: 6, fill: GOLD_FILL, shadow: 'rgba(120,60,0,0.9)', shadowBlur: 40 });
  txt('00:01.000', W / 2, 1600, { family: 'Mont', size: 120, weight: 900, spacing: 4, fill: '#ff6b7a', shadow: 'rgba(0,0,0,0.6)', shadowBlur: 30 });
  bloom(0.4); ctx.globalAlpha = 0.6; ctx.drawImage(VIG, 0, 0); ctx.globalAlpha = 1;
}

window.renderFrame = i => renderTime(i / FPS);
window.renderTime = renderTime;
window.renderCover = renderCover;
window.META = { W, H, FPS, DURATION, IMPACTS, SC, TWIST, TALLY, END };
window.ready = (async () => {
  await Promise.all([document.fonts.load('900 100px Sans', '秒'), document.fonts.load('700 100px Sans', '秒'), document.fonts.load('900 100px Mont', '0123')]);
  await document.fonts.ready;
  if (!navigator.webdriver) {
    const t0 = performance.now();
    const loop = () => { renderTime(((performance.now() - t0) / 1000) % DURATION); requestAnimationFrame(loop); };
    loop();
  }
  return true;
})();
// ================================================================ post
function bloom(k) {
  if (k <= 0) return;
  BL1X.globalCompositeOperation = 'source-over'; BL1X.globalAlpha = 1;
  BL1X.drawImage(cv, 0, 0, W / 4, H / 4);
  BL1X.globalCompositeOperation = 'multiply'; BL1X.drawImage(BL1, 0, 0); BL1X.drawImage(BL1, 0, 0);
  BL2X.globalCompositeOperation = 'copy'; BL2X.filter = 'blur(5px)'; BL2X.drawImage(BL1, 0, 0); BL2X.filter = 'none';
  BL3X.globalCompositeOperation = 'copy'; BL3X.filter = 'blur(9px)'; BL3X.drawImage(BL1, 0, 0, W / 8, H / 8); BL3X.filter = 'none';
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = clamp(k); ctx.drawImage(BL2, 0, 0, W, H);
  ctx.globalAlpha = clamp(k * 0.8); ctx.drawImage(BL3, 0, 0, W, H);
  ctx.restore();
}
function chromaShift(px) {
  if (px < 0.8) return;
  TMPX.globalCompositeOperation = 'copy'; TMPX.drawImage(cv, 0, 0);
  TMPX.globalCompositeOperation = 'multiply'; TMPX.fillStyle = '#ff0000'; TMPX.fillRect(0, 0, W, H);
  TMP2X.globalCompositeOperation = 'copy'; TMP2X.drawImage(cv, 0, 0);
  TMP2X.globalCompositeOperation = 'multiply'; TMP2X.fillStyle = '#00ffff'; TMP2X.fillRect(0, 0, W, H);
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'copy'; ctx.drawImage(TMP2, -px * 0.5, 0);
  ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(TMP, px * 0.5, 0);
  ctx.restore();
}
