// 一束光的旅行 — a generative vertical short film (1080×1920, 60 fps).
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

// ================================================================ impacts
const IMPACTS = [[0.25, 1.0], [1.2, 0.6], [3.25, 0.8], [15.0, 1.3], [25.0, 0.9], [29.4, 0.5], [35.8, 0.5], [37.9, 0.7], [39.4, 0.7], [41.0, 1.0]];
function impact(t, decay = 6) { let s = 0; for (const [ti, k] of IMPACTS) if (t >= ti && t - ti < 2) s += k * Math.exp(-(t - ti) * decay); return s; }

// ================================================================ the eye
const IR = 480;
const IRIS = (() => {
  const c = mk(1000, 1000), x = c.getContext('2d'), r = rng(808), C = 500;
  const g = x.createRadialGradient(C, C, 0, C, C, IR);
  g.addColorStop(0.0, '#2a1606'); g.addColorStop(0.28, '#b86b1e'); g.addColorStop(0.42, '#d99a3c');
  g.addColorStop(0.55, '#7a8a4a'); g.addColorStop(0.75, '#2f7d86'); g.addColorStop(0.93, '#1b4a57'); g.addColorStop(1, '#0a1a20');
  x.fillStyle = g; x.beginPath(); x.arc(C, C, IR, 0, Math.PI * 2); x.fill();
  x.lineCap = 'round';
  for (let i = 0; i < 2600; i++) {
    const a = r() * Math.PI * 2, r0 = IR * (0.2 + r() * 0.15), r1 = IR * (0.55 + r() * 0.43), ph = r() * 6;
    const warm = r() < 0.5;
    x.strokeStyle = warm ? `rgba(255,${190 + r() * 50 | 0},${110 + r() * 60 | 0},${0.08 + r() * 0.18})` : `rgba(${120 + r() * 60 | 0},${210 + r() * 40 | 0},${200 + r() * 50 | 0},${0.06 + r() * 0.16})`;
    x.lineWidth = 0.6 + r() * 2.2;
    x.beginPath();
    for (let k = 0; k <= 12; k++) {
      const rr = lerp(r0, r1, k / 12), aa = a + Math.sin(rr * 0.04 + ph) * 0.03;
      const px = C + Math.cos(aa) * rr, py = C + Math.sin(aa) * rr;
      k ? x.lineTo(px, py) : x.moveTo(px, py);
    }
    x.stroke();
  }
  for (let i = 0; i < 70; i++) {
    const a = r() * Math.PI * 2, rr = IR * (0.38 + r() * 0.45);
    x.save(); x.translate(C + Math.cos(a) * rr, C + Math.sin(a) * rr); x.rotate(a);
    x.fillStyle = `rgba(10,20,15,${0.15 + r() * 0.25})`; x.beginPath(); x.ellipse(0, 0, 18 + r() * 30, 5 + r() * 9, 0, 0, Math.PI * 2); x.fill(); x.restore();
  }
  x.strokeStyle = 'rgba(255,220,150,0.45)'; x.lineWidth = 3; x.beginPath();
  for (let k = 0; k <= 180; k++) { const a = k / 180 * Math.PI * 2, rr = IR * (0.42 + 0.03 * Math.sin(a * 23)); const px = C + Math.cos(a) * rr, py = C + Math.sin(a) * rr; k ? x.lineTo(px, py) : x.moveTo(px, py); }
  x.stroke();
  const lg = x.createRadialGradient(C, C, IR * 0.82, C, C, IR);
  lg.addColorStop(0, 'rgba(5,12,15,0)'); lg.addColorStop(1, 'rgba(5,12,15,0.95)');
  x.fillStyle = lg; x.beginPath(); x.arc(C, C, IR, 0, Math.PI * 2); x.fill();
  return c;
})();
const LASHES = []; { const r = rng(31); for (let i = 0; i < 90; i++) LASHES.push([r() * 2 - 1, 0.6 + r() * 0.8, r() * 0.4 - 0.2, r() < 0.75]); }

function drawEye(t, cx, cy, s, pupilR) {
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  const g = ctx.createRadialGradient(cx, cy, IR * s * 0.9, cx, cy, IR * s * 2.1);
  g.addColorStop(0, '#f4e9e2'); g.addColorStop(0.35, '#d9b5aa'); g.addColorStop(0.7, '#6a3a32'); g.addColorStop(1, '#1a0b0a');
  ctx.fillStyle = g; ctx.fillRect(-50, -50, W + 100, H + 100);
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(t * 0.01); ctx.drawImage(IRIS, -500 * s, -500 * s, 1000 * s, 1000 * s); ctx.restore();
  const pg = ctx.createRadialGradient(cx, cy, 0, cx, cy, pupilR * s * 1.08);
  pg.addColorStop(0, '#000'); pg.addColorStop(0.9, '#020102'); pg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = pg; ctx.beginPath(); ctx.arc(cx, cy, pupilR * s * 1.08, 0, Math.PI * 2); ctx.fill();
  // corneal reflections
  ctx.globalCompositeOperation = 'lighter';
  softGlow(cx - IR * s * 0.3, cy - IR * s * 0.32, 90 * s, [255, 255, 255], 0.35);
  ctx.save(); ctx.translate(cx - IR * s * 0.3, cy - IR * s * 0.33); ctx.rotate(-0.2);
  ctx.globalAlpha = 0.85; ctx.fillStyle = '#fff'; ctx.beginPath();
  ctx.roundRect(-34 * s, -24 * s, 68 * s, 48 * s, 12 * s); ctx.fill(); ctx.restore();
  softGlow(cx + IR * s * 0.36, cy + IR * s * 0.4, 40 * s, [255, 255, 255], 0.35);
  ctx.globalCompositeOperation = 'source-over';
  // eyelids
  const L = 720 * s;
  const upper = x => cy - 470 * s + 380 * s * ((x - cx) / L) ** 2;
  const lower = x => cy + 500 * s - 330 * s * ((x - cx) / L) ** 2;
  for (const [f, top] of [[upper, true], [lower, false]]) {
    ctx.beginPath(); ctx.moveTo(-60, top ? -60 : H + 60);
    for (let x = -60; x <= W + 60; x += 20) ctx.lineTo(x, f(x));
    ctx.lineTo(W + 60, top ? -60 : H + 60); ctx.closePath();
    const lg = ctx.createLinearGradient(0, f(cx) + (top ? -360 : 360) * s, 0, f(cx));
    lg.addColorStop(0, '#1c0d0a'); lg.addColorStop(0.75, '#5b3127'); lg.addColorStop(1, '#8a4a3c');
    ctx.fillStyle = lg; ctx.fill();
    ctx.strokeStyle = 'rgba(255,210,200,0.35)'; ctx.lineWidth = 3 * s; ctx.beginPath();
    for (let x = -60; x <= W + 60; x += 20) x === -60 ? ctx.moveTo(x, f(x)) : ctx.lineTo(x, f(x)); ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(8,4,3,0.9)'; ctx.lineCap = 'round';
  for (const [u, len, bend, top] of LASHES) {
    const x0 = cx + u * L * 1.1, y0 = top ? upper(x0) : lower(x0);
    const l = len * (top ? 120 : 50) * s * (1 - Math.abs(u) * 0.3), dir = top ? -1 : 1;
    ctx.lineWidth = (top ? 4 : 2.4) * s;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(x0 + u * l * 0.5 + bend * l, y0 + dir * l * 0.7, x0 + u * l * 0.9 + bend * l * 1.4, y0 + dir * l); ctx.stroke();
  }
}

// ================================================================ CHAPTER 1 — hook (0–3s)
function sceneHook(t) {
  const zoom = 1 + 9 * easeInExpo(ss(2.35, 3.0, t));
  const cx = W / 2, cy = H * 0.5;
  ctx.save(); ctx.translate(cx, cy); ctx.scale(zoom, zoom); ctx.translate(-cx, -cy);
  const pr = lerp(210, 120, easeOut((t - 0.25) / 0.6) * (t > 0.25 ? 1 : 0));
  drawEye(t, cx, cy, 1.0, pr);
  // the sunbeam
  const p = easeIn(ss(-0.05, 0.25, t));
  const sx = W * 1.15, sy = -260, tx = lerp(sx, cx, p), ty = lerp(sy, cy, p);
  const fadeBeam = 1 - ss(0.5, 2.2, t);
  ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
  for (const [w, a] of [[90, 0.06], [36, 0.18], [12, 0.6], [4, 1]]) {
    ctx.globalAlpha = a * fadeBeam; ctx.strokeStyle = '#ffd27a'; ctx.lineWidth = w;
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(tx, ty); ctx.stroke();
  }
  spr(glow('#fff2c8'), tx, ty, 220, fadeBeam);
  if (t > 0.25) {
    const k = Math.exp(-(t - 0.25) * 2.5);
    softGlow(cx, cy, 700, [255, 200, 120], 0.6 * k + 0.12 * fadeBeam);
    spr(glow('#ffffff'), cx, cy, 160, k);
    spr(glow('#ffe7b0'), cx, cy, 500, k * 0.8, 6, 0.06);
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.restore();
  rise('你此刻看到的阳光', W / 2, 250, t, 0.45, 2.45, { size: 72, weight: 800, spacing: 6, shadow: SHADOW, shadowBlur: 30 });
  slam('已经旅行了十几万年', W / 2, 1690, t, 1.2, 2.45, { size: 86, spacing: 4, fill: GOLD_FILL, shadow: 'rgba(120,40,0,0.9)', shadowBlur: 40 });
  if (t > 2.3) {
    const a = ss(2.3, 2.4, t) * (1 - ss(2.85, 3.0, t));
    txt('◀◀', W / 2 - 150, H / 2, { family: 'Sans', size: 90, alpha: a * (0.6 + 0.4 * Math.sin(t * 40)), shadow: SHADOW });
    txt('倒回去看看', W / 2 + 70, H / 2, { size: 64, weight: 800, alpha: a, spacing: 4, shadow: SHADOW });
  }
}

// ================================================================ CHAPTER 2 — trapped in the Sun (3–15s)
const WALK = [];
(function buildWalk() {
  const r = rng(4242);
  let p = [0, 0], t = 3.25;
  WALK.push({ p: p.slice(), t });
  while (t < 15.2) {
    const speed = 950 + 2800 * ss(11.5, 14.6, t);
    const len = 70 + r() * 170, a = r() * Math.PI * 2;
    p = [p[0] + Math.cos(a) * len, p[1] + Math.sin(a) * len];
    t += len / speed;
    WALK.push({ p: p.slice(), t });
  }
})();
function walkPos(t) {
  if (t <= WALK[0].t) return WALK[0].p;
  let lo = 0, hi = WALK.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (WALK[m].t < t) lo = m; else hi = m; }
  const a = WALK[lo], b = WALK[hi], k = clamp((t - a.t) / (b.t - a.t));
  return [lerp(a.p[0], b.p[0], k), lerp(a.p[1], b.p[1], k), lo];
}
const EVENTS = [
  { bp: 150000, date: '约 15 万年前', text: '智人还生活在非洲' },
  { bp: 70000, date: '约 7 万年前', text: '人类走出非洲' },
  { bp: 40000, date: '约 4 万年前', text: '洞穴里出现了壁画' },
  { bp: 10000, date: '约 1 万年前', text: '人类开始种地' },
  { bp: 5000, date: '约 5000 年前', text: '文字诞生了' },
  { bp: 2100, date: '约 2100 年前', text: '丝绸之路开通' },
  { bp: 57, date: '1969 年', text: '人类登上月球' },
  { bp: 0, date: '2026 年', text: '你，正在刷这条视频' },
];
const C0 = 3.6, C1 = 14.6;
EVENTS.forEach(e => { e.t = C0 + (1 - Math.cbrt(e.bp / 150000)) * (C1 - C0); });
const bpAt = t => 150000 * Math.pow(1 - clamp((t - C0) / (C1 - C0)), 3);
const IONS = []; { const r = rng(99); for (let i = 0; i < 520; i++) IONS.push([r() * 3000 - 1500, r() * 4000 - 2000, 0.4 + r() * 0.9, r() * 6.28, r()]); }

function sceneCore(t) {
  let cx = 0, cy = 0; for (let i = 0; i < 10; i++) { const p = walkPos(t - i * 0.07); cx += p[0]; cy += p[1]; } cx /= 10; cy /= 10;
  const toS = (x, y) => [x - cx + W / 2, y - cy + H * 0.47];
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  ctx.fillStyle = '#2a0300'; ctx.fillRect(-50, -50, W + 100, H + 100);
  const P1 = pat(PLASMA);
  P1.setTransform(new DOMMatrix().translate(-cx * 0.5 + t * 25, -cy * 0.5 + t * 12).scale(3.4));
  ctx.fillStyle = P1; ctx.fillRect(-50, -50, W + 100, H + 100);
  ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.4;
  const P2 = pat(PLASMA);
  P2.setTransform(new DOMMatrix().translate(-cx * 0.8 - t * 40, -cy * 0.8 + t * 30).rotate(30 + t * 2).scale(2.2));
  ctx.fillStyle = P2; ctx.fillRect(-50, -50, W + 100, H + 100);
  softGlow(W / 2, H * 0.47, 900, [255, 150, 40], 0.35 + 0.08 * Math.sin(t * 5));
  // ions
  for (let i = 0; i < IONS.length; i++) {
    const [x0, y0, d, ph, kind] = IONS[i];
    let x = ((x0 - cx * d + Math.sin(t * 3 + ph) * 8) % 3000 + 3000) % 3000 - 1000;
    let y = ((y0 - cy * d + Math.cos(t * 2.6 + ph) * 8) % 4000 + 4000) % 4000 - 1000;
    if (x < -40 || x > W + 40 || y < -40 || y > H + 40) continue;
    spr(glow(kind < 0.7 ? '#ffd28a' : '#9fd0ff'), x, y, 10 + 16 * d, 0.35 + 0.3 * d);
  }
  // fusion: two nuclei meet, a photon is born
  if (t < 3.6) {
    const k = easeIn(ss(3.0, 3.25, t));
    if (t < 3.25) for (const sg of [-1, 1]) { const q = toS(sg * lerp(420, 0, k), sg * lerp(-160, 0, k)); spr(glow('#a8d8ff'), q[0], q[1], 90, 0.95); spr(glow('#ffffff'), q[0], q[1], 26, 1); }
    if (t >= 3.25) { const a = t - 3.25; ctx.strokeStyle = '#fff'; ctx.lineWidth = 6 * (1 - a / 0.35); ctx.globalAlpha = 1 - a / 0.35; const q = toS(0, 0); ctx.beginPath(); ctx.arc(q[0], q[1], 30 + a * 1400, 0, Math.PI * 2); ctx.stroke(); }
  }
  if (t >= 3.25) {
    // trail along the random walk
    const cur = walkPos(t), idx = cur[2];
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const n = 30;
    for (let i = Math.max(0, idx - n); i <= idx; i++) {
      const a = WALK[i], b = i === idx ? { p: cur } : WALK[i + 1];
      const age = (idx - i) / n;
      const A = toS(a.p[0], a.p[1]), B = toS(b.p[0], b.p[1]);
      for (const [w, al] of [[22, 0.08], [8, 0.25], [2.5, 0.9]]) {
        ctx.globalAlpha = al * (1 - age) ** 1.5; ctx.strokeStyle = '#fff0c4'; ctx.lineWidth = w;
        ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.stroke();
      }
    }
    // collision sparks at recent vertices
    for (let i = Math.max(1, idx - 6); i <= idx; i++) {
      const age = t - WALK[i].t; if (age < 0 || age > 0.35) continue;
      const q = toS(WALK[i].p[0], WALK[i].p[1]);
      spr(glow('#ffffff'), q[0], q[1], 70 + 160 * age, (1 - age / 0.35));
      ctx.globalAlpha = (1 - age / 0.35) * 0.8; ctx.strokeStyle = '#ffe2a8'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(q[0], q[1], 10 + age * 220, 0, Math.PI * 2); ctx.stroke();
    }
    const q = toS(cur[0], cur[1]);
    spr(glow('#ffe7b0'), q[0], q[1], 260, 0.9);
    spr(glow('#ffffff'), q[0], q[1], 60, 1);
    spr(glow('#fff4d8'), q[0], q[1], 260, 0.5, 4, 0.06);
  }
  ctx.globalCompositeOperation = 'source-over';
  const dark = ctx.createLinearGradient(0, 0, 0, H);
  dark.addColorStop(0, 'rgba(20,0,0,0.55)'); dark.addColorStop(0.22, 'rgba(20,0,0,0)'); dark.addColorStop(0.62, 'rgba(20,0,0,0)'); dark.addColorStop(1, 'rgba(20,0,0,0.7)');
  ctx.globalAlpha = 1; ctx.fillStyle = dark; ctx.fillRect(0, 0, W, H);

  // ---- text
  rise('在太阳中心', W / 2, 220, t, 3.35, 6.3, { size: 60, weight: 700, spacing: 8, shadow: SHADOW });
  slam('一个光子诞生了', W / 2, 315, t, 3.8, 6.3, { size: 84, spacing: 6, fill: GOLD_FILL, shadow: 'rgba(90,20,0,0.9)', shadowBlur: 36 });
  rise('它被撞来撞去', W / 2, 225, t, 6.5, 14.9, { size: 64, weight: 800, spacing: 8, shadow: SHADOW });
  rise('怎么也逃不出去', W / 2, 315, t, 6.8, 14.9, { size: 64, weight: 800, spacing: 8, shadow: SHADOW });
  if (t > C0 - 0.2) {
    const a = ss(C0 - 0.2, C0 + 0.3, t) * (1 - ss(14.85, 15.0, t));
    const bp = bpAt(t), year = Math.round(2026 - bp);
    const ystr = year < 1 ? `公元前 ${fmt(1 - year)} 年` : `${year < 2026 ? '公元 ' : ''}${fmt(year).replace(',', '')} 年`;
    txt('此时的地球', W / 2, 500, { size: 34, weight: 500, alpha: a * 0.85, spacing: 10, shadow: SHADOW });
    txt(ystr, W / 2, 588, { size: 92, weight: 900, alpha: a, spacing: 2, shadow: 'rgba(80,10,0,0.9)', shadowBlur: 30, fill: GOLD_FILL });
  }
  for (let i = 0; i < EVENTS.length; i++) {
    const e = EVENTS[i], next = EVENTS[i + 1];
    const t1 = next ? next.t : 15.0;
    if (t < e.t || t > t1 + 0.25) continue;
    const pin = easeOutBack((t - e.t) / 0.35), pout = ss(t1, t1 + 0.25, t);
    const y = 1450 + (1 - pin) * 80 - pout * 80, a = ss(e.t, e.t + 0.12, t) * (1 - pout);
    ctx.save(); ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(30,6,0,0.55)'; ctx.strokeStyle = 'rgba(255,200,120,0.65)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(W / 2 - 440, y - 100, 880, 200, 28); ctx.fill(); ctx.stroke(); ctx.restore();
    txt(e.date, W / 2, y - 46, { size: 36, weight: 700, alpha: a, fill: '#ffc977', spacing: 4 });
    txt(e.text, W / 2, y + 30, { size: 64, weight: 900, alpha: a, spacing: 4, shadow: 'rgba(0,0,0,0.4)', shadowBlur: 16 });
  }
  txt('*光子逃离太阳所需时间，估算从数万年到十几万年不等', W / 2, 1830, { size: 24, weight: 400, alpha: 0.55 * ss(6.5, 7.2, t) * (1 - ss(14.7, 15, t)) });
}

// ================================================================ CHAPTER 3 — escape, 8 min 20 s through space (15–25s)
const SPD = t => t < 15 ? 0 : lerp(300, 3200, ss(15.0, 16.2, t)) + 600 * ss(22, 24.8, t);
const DTAB = [0]; for (let t = 0; t < DURATION; t += 1 / 240) DTAB.push(DTAB[DTAB.length - 1] + SPD(t) / 240);
const dist = t => { const i = clamp(t * 240, 0, DTAB.length - 2), i0 = Math.floor(i); return lerp(DTAB[i0], DTAB[i0 + 1], i - i0); };
const STARS = []; { const r = rng(5); for (let i = 0; i < 420; i++) STARS.push([r() * W, r() * (H + 400), 0.2 + r() * 0.8, r() * 6]); }

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
function planet(x, y, r, c1, c2, label, a) {
  if (y < -r - 100 || y > H + r + 100) return;
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  const g = ctx.createRadialGradient(x - r * 0.2, y - r * 0.5, r * 0.1, x, y, r * 1.05);
  g.addColorStop(0, c1); g.addColorStop(0.6, c2); g.addColorStop(1, '#050507');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.globalCompositeOperation = 'lighter'; softGlow(x, y - r * 0.2, r * 1.6, hex(c1), 0.12); ctx.globalCompositeOperation = 'source-over';
  txt(label, x, y - r - 50, { size: 44, weight: 800, alpha: a, spacing: 6, shadow: SHADOW });
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

function sceneSpace(t) {
  const u = t - 15;
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#0b0518'); bg.addColorStop(1, '#02040e');
  ctx.fillStyle = bg; ctx.fillRect(-50, -50, W + 100, H + 100);
  // streaking stars (we fall downward, so the stars stream up)
  const d = dist(t), v = SPD(t);
  ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
  for (const [x, y0, dd, ph] of STARS) {
    const y = ((y0 - d * dd * 0.5) % (H + 400) + H + 400) % (H + 400) - 200;
    const len = Math.min(120, v * dd * dd * 0.008) + 2;
    ctx.globalAlpha = (0.25 + 0.6 * dd * dd) * (0.7 + 0.3 * Math.sin(t * 3 + ph)); ctx.strokeStyle = dd > 0.85 ? '#ffe9c8' : (dd > 0.6 ? '#c8d8ff' : '#8fa6ff'); ctx.lineWidth = 0.8 + dd * dd * 2.5;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + len); ctx.stroke();
  }
  // the sun, receding above us
  const k = easeOut(ss(15.15, 19.5, t));
  const R = lerp(2600, 180, k), limb = lerp(560, 120, k);
  drawSun(W / 2, limb - R, R, t);
  // photon
  const py = lerp(limb, H * 0.42, easeOut(ss(15.0, 15.9, t)));
  ctx.globalCompositeOperation = 'lighter';
  for (const [w, a] of [[60, 0.07], [22, 0.22], [7, 0.6], [2.5, 1]]) {
    const g = ctx.createLinearGradient(0, py - 900, 0, py);
    g.addColorStop(0, 'rgba(255,240,200,0)'); g.addColorStop(1, `rgba(255,245,215,${a})`);
    ctx.globalAlpha = 1; ctx.strokeStyle = g; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(W / 2, py - 900); ctx.lineTo(W / 2, py); ctx.stroke();
  }
  spr(glow('#fff2d0'), W / 2, py, 280, 1);
  spr(glow('#ffffff'), W / 2, py, 70, 1);
  spr(glow('#fff2d0'), W / 2, py, 300, 0.55, 3.5, 0.07);
  // breakout shockwave
  if (u < 1.4) {
    const a = 1 - u / 1.4;
    ctx.globalAlpha = a * a; ctx.strokeStyle = '#fff3d0'; ctx.lineWidth = 10 * a + 1;
    ctx.beginPath(); ctx.ellipse(W / 2, limb, 40 + easeOutExpo(u / 1.2) * 1500, (40 + easeOutExpo(u / 1.2) * 1500) * 0.35, 0, 0, Math.PI * 2); ctx.stroke();
    for (let i = 0; i < 160; i++) {
      const ang = Math.PI * (0.05 + 0.9 * hash(i)), sp = 300 + hash(i + 7) * 1500, dd = sp * (1 - Math.exp(-u * 2.5)) / 2.5;
      spr(glow(i % 3 ? '#ffb347' : '#fff2c0'), W / 2 + Math.cos(ang) * dd, limb + Math.sin(ang) * dd * 0.9, 16 + 20 * hash(i + 3), a);
    }
  }
  // planets passing (they rise past us)
  const pass = (t0, t1) => lerp(H + 200, -200, (t - t0) / (t1 - t0));
  if (t > 16.9 && t < 19.1) planet(W * 0.12, pass(17.0, 19.0), 56, '#d6d0c8', '#6e6a66', '水星', ss(17.1, 17.4, t) * (1 - ss(18.6, 18.9, t)));
  if (t > 19.0 && t < 21.6) planet(W * 0.86, pass(19.1, 21.5), 92, '#fff1c8', '#c8a060', '金星', ss(19.3, 19.6, t) * (1 - ss(21.1, 21.4, t)));
  // earth rising from below
  if (t > 21.8) {
    const e = easeIn(ss(21.8, 25.0, t));
    const RE = lerp(120, 1700, e);
    const ey2 = lerp(H + 80, H * 0.43 + RE, e);
    earth(W / 2, ey2, RE, t);
    txt('地球', W / 2, ey2 - RE - 70, { size: 48, weight: 800, spacing: 12, alpha: ss(22.2, 22.6, t) * (1 - ss(23.6, 24.0, t)), shadow: SHADOW });
  }
  ctx.globalCompositeOperation = 'source-over';
  // ---- text
  slam('终于，它冲了出来', W / 2, 1220, t, 15.35, 18.2, { size: 84, spacing: 4, shadow: SHADOW, shadowBlur: 34 });
  rise('接下来这一程', W / 2, 1180, t, 18.4, 21.7, { size: 62, weight: 700, spacing: 8, shadow: SHADOW });
  slam('只要 8 分 20 秒', W / 2, 1290, t, 18.9, 21.7, { size: 104, spacing: 2, fill: GOLD_FILL, shadow: 'rgba(80,30,0,0.9)', shadowBlur: 40 });
  rise('光速：每秒约 30 万公里', W / 2, 1240, t, 21.9, 24.9, { size: 64, weight: 800, spacing: 4, shadow: SHADOW });
  if (t > 15.8) {
    const a = ss(15.8, 16.2, t) * (1 - ss(24.6, 24.9, t));
    const rem = Math.max(0, 500 * (1 - clamp((t - 16.0) / (24.8 - 16.0))));
    const mm = Math.floor(rem / 60), sec = Math.floor(rem % 60);
    txt('距离地球', W / 2, 1600, { size: 36, weight: 500, spacing: 10, alpha: a * 0.85, shadow: SHADOW });
    txt(`${String(mm).padStart(2, '0')}:${String(sec).padStart(2, '0')}`, W / 2, 1700, { family: 'Mont', size: 130, weight: 900, spacing: 6, alpha: a, shadow: 'rgba(0,0,0,0.6)', shadowBlur: 30 });
  }
}

// ================================================================ CHAPTER 4 — why the sky is blue (25–35s)
const SPECTRUM = ['#ff3b3b', '#ff8a2a', '#ffd83a', '#5cff6a', '#3ad1ff', '#3a6bff', '#8a4dff'];
const AIR = []; { const r = rng(12); for (let i = 0; i < 260; i++) AIR.push([r() * W, r() * (H + 300), r() * 6, 0.5 + r() * 0.5]); }
const CLOUDP = []; { const r = rng(17); for (let i = 0; i < 9; i++) { const parts = []; for (let k = 0; k < 9; k++) parts.push([(r() - 0.5) * 520, (r() - 0.5) * 120, 90 + r() * 140]); CLOUDP.push({ x: r() * W, t0: 31.3 + i * 0.14 + r() * 0.08, parts, s: 0.8 + r() * 0.8 }); } }
const LEAVES = []; { const r = rng(21); for (let i = 0; i < 26; i++) { const a = r() * Math.PI * 2; const d = 260 + r() * 600; LEAVES.push([Math.cos(a) * d, Math.sin(a) * d * 1.4, a + r(), 110 + r() * 150, r()]); } }

function sceneSky(t) {
  const blue = ss(25.6, 30.8, t), warm = ss(31.4, 33.4, t);
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, rgba(mixc([4, 8, 30], [20, 80, 200], blue)));
  bg.addColorStop(0.6, rgba(mixc([8, 18, 50], [70, 150, 240], blue)));
  bg.addColorStop(1, rgba(mixc([12, 26, 64], [170, 220, 255], blue)));
  ctx.fillStyle = bg; ctx.fillRect(-50, -50, W + 100, H + 100);
  const fall = (t - 25) * 900;
  // air molecules
  ctx.globalCompositeOperation = 'lighter';
  for (const [x, y0, ph, s] of AIR) {
    const y = ((y0 - fall * s * 0.6) % (H + 300) + H + 300) % (H + 300) - 150;
    spr(glow('#dfe9ff'), x + Math.sin(t * 2 + ph) * 6, y, 14 * s, 0.5 * (1 - warm));
  }
  // the beam: white above, a spectrum below the split point
  const split = 640, sp = ss(25.5, 26.3, t) * (1 - warm);
  for (const [w, a] of [[70, 0.06], [24, 0.22], [8, 0.7], [3, 1]]) {
    ctx.globalAlpha = a; ctx.strokeStyle = '#fff6e0'; ctx.lineWidth = w;
    ctx.beginPath(); ctx.moveTo(W / 2, -50); ctx.lineTo(W / 2, split + (1 - sp) * 1400); ctx.stroke();
  }
  if (sp > 0) {
    SPECTRUM.forEach((c, i) => {
      const ang = (i - 3) * 0.075 * sp;
      const ex = W / 2 + Math.sin(ang) * 1500, ey = split + Math.cos(ang) * 1500;
      const blueish = i >= 4;
      for (const [w, a] of [[30, 0.08], [9, 0.3], [3, 0.9]]) {
        ctx.globalAlpha = a * sp * (blueish ? 1 - 0.35 * blue : 1); ctx.strokeStyle = c; ctx.lineWidth = w;
        ctx.beginPath(); ctx.moveTo(W / 2, split); ctx.lineTo(ex, ey); ctx.stroke();
      }
      // blue light scatters off the air molecules in every direction
      if (blueish) {
        for (let k = 0; k < 150; k++) {
          const seed = i * 1000 + k, te = 25.9 + hash(seed) * 5.4, age = t - te;
          if (age < 0 || age > 1.8) continue;
          const f = 0.15 + hash(seed + 1) * 0.8, ox = W / 2 + Math.sin(ang) * 1500 * f, oy = split + Math.cos(ang) * 1500 * f;
          const da = hash(seed + 2) * Math.PI * 2, dd = (200 + hash(seed + 3) * 700) * age;
          const x = ox + Math.cos(da) * dd, y = oy + Math.sin(da) * dd;
          ctx.globalAlpha = 0.95 * (1 - age / 1.8); ctx.strokeStyle = c; ctx.lineWidth = 4;
          spr(glow(c), x, y, 26, 0.7 * (1 - age / 1.8));
          ctx.beginPath(); ctx.moveTo(x - Math.cos(da) * 26, y - Math.sin(da) * 26); ctx.lineTo(x, y); ctx.stroke();
          if (age < 0.15) spr(glow('#ffffff'), ox, oy, 40, 1 - age / 0.15);
        }
      }
    });
  }
  softGlow(W / 2, split, 220, [255, 250, 230], 0.7 * sp + 0.3);
  // clouds and leaves near the end
  ctx.globalCompositeOperation = 'source-over';
  for (const c of CLOUDP) {
    const age = t - c.t0; if (age < 0 || age > 1.6) continue;
    const y = lerp(H + 400, -500, age / 1.6), sc = c.s * (1 + age * 0.4);
    for (const [ox, oy, r] of c.parts) {
      const g = ctx.createRadialGradient(c.x + ox * sc, y + oy * sc - r * sc * 0.3, 0, c.x + ox * sc, y + oy * sc, r * sc);
      g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(0.7, 'rgba(235,242,255,0.7)'); g.addColorStop(1, 'rgba(220,232,255,0)');
      ctx.globalAlpha = 0.9; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(c.x + ox * sc, y + oy * sc, r * sc, 0, Math.PI * 2); ctx.fill();
    }
  }
  if (t > 32.8) {
    const k = easeIn(ss(32.8, 35.0, t)), sc = lerp(0.35, 2.6, k);
    ctx.globalCompositeOperation = 'lighter';
    softGlow(W / 2, H * 0.5, 700, [255, 220, 150], 0.5 * ss(32.8, 33.6, t));
    // god rays through the canopy
    for (let i = 0; i < 9; i++) {
      const a = (i - 4) * 0.09 + Math.sin(t + i) * 0.01;
      ctx.globalAlpha = 0.12 * ss(33.0, 33.6, t); ctx.fillStyle = '#fff0c0';
      ctx.beginPath(); ctx.moveTo(W / 2, H * 0.5); ctx.lineTo(W / 2 + Math.sin(a - 0.02) * 2600, H * 0.5 + 2600); ctx.lineTo(W / 2 + Math.sin(a + 0.02) * 2600, H * 0.5 + 2600); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    for (const [x, y, a, s, v] of LEAVES) {
      ctx.save(); ctx.translate(W / 2 + x * sc, H * 0.55 + y * sc * 0.8); ctx.rotate(a + Math.sin(t * 2 + v * 6) * 0.05); ctx.scale(sc, sc);
      ctx.globalAlpha = ss(32.8, 33.3, t);
      ctx.fillStyle = v < 0.5 ? '#0d2a12' : '#16391a';
      ctx.beginPath(); ctx.moveTo(-s, 0); ctx.quadraticCurveTo(0, -s * 0.55, s, 0); ctx.quadraticCurveTo(0, s * 0.55, -s, 0); ctx.fill();
      ctx.strokeStyle = 'rgba(120,200,90,0.35)'; ctx.lineWidth = 3 / sc; ctx.beginPath(); ctx.moveTo(-s, 0); ctx.lineTo(s, 0); ctx.stroke();
      ctx.restore();
    }
  }
  // the photon itself, warm white, falling with us
  ctx.globalCompositeOperation = 'lighter';
  spr(glow('#fff6e0'), W / 2, split, 200, 0.9);
  spr(glow('#ffffff'), W / 2, split, 50, 1);
  ctx.globalCompositeOperation = 'source-over';
  // ---- text
  rise('阳光里的蓝光', W / 2, 230, t, 25.45, 29.25, { size: 66, weight: 800, spacing: 8, shadow: SHADOW });
  rise('最容易被空气分子撞散', W / 2, 325, t, 25.9, 29.25, { size: 66, weight: 800, spacing: 4, shadow: SHADOW });
  if (t > 26.4 && t < 31.3) {
    const a = ss(26.4, 26.7, t) * (1 - ss(31.0, 31.3, t));
    ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = 'rgba(10,30,90,0.75)'; ctx.strokeStyle = 'rgba(160,210,255,0.9)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(W / 2 - 160, 1690, 320, 80, 40); ctx.fill(); ctx.stroke(); ctx.restore();
    txt('瑞利散射', W / 2, 1729, { size: 40, weight: 800, spacing: 8, alpha: a });
  }
  slam('于是，天空变成了蓝色', W / 2, 290, t, 29.4, 31.7, { size: 80, spacing: 4, shadow: 'rgba(0,30,90,0.8)', shadowBlur: 34 });
  rise('穿过云层', W / 2, 230, t, 31.85, 34.9, { size: 68, weight: 800, spacing: 10, shadow: 'rgba(0,25,70,0.95)', shadowBlur: 40 });
  rise('穿过树叶的缝隙', W / 2, 330, t, 32.5, 34.9, { size: 68, weight: 800, spacing: 6, shadow: 'rgba(0,25,70,0.95)', shadowBlur: 40 });
}

// ================================================================ CHAPTER 5 — into your eye (35–41s)
const NEURONS = [];
(function buildNeurons() {
  const r = rng(77);
  (function grow(p, h, L, depth, t0) {
    if (depth > 7) return;
    const n = 1 + (depth < 2 ? 1 : (r() < 0.75 ? 1 : 0));
    for (let i = 0; i <= n; i++) {
      const hh = h + (r() - 0.5) * (depth === 0 ? 0.3 : 1.1);
      const pts = [p]; let q = p.slice(), a = hh;
      for (let k = 0; k < 6; k++) { a += (r() - 0.5) * 0.5; q = [q[0] + Math.cos(a) * L / 6, q[1] + Math.sin(a) * L / 6]; pts.push(q.slice()); }
      const dur = 0.16 + r() * 0.12;
      NEURONS.push({ pts, t0, t1: t0 + dur, depth, hue: r() < 0.5 ? '#7ee8ff' : '#ffd27a' });
      grow(q, a, L * (0.78 + r() * 0.12), depth + 1, t0 + dur);
    }
  })([W / 2, 1400], -Math.PI / 2, 300, 0, 37.95);
})();
const CELLS = []; { const r = rng(3); for (let row = 0; row < 7; row++) for (let col = 0; col < 9; col++) CELLS.push([60 + col * 120 + (row % 2) * 60 + (r() - 0.5) * 20, 1180 + row * 115 + (r() - 0.5) * 20, r() < 0.5]); }

function sceneEye2(t) {
  const zoom = 1 + 11 * easeInExpo(ss(37.0, 37.55, t));
  const cx = W / 2, cy = H * 0.5;
  ctx.save(); ctx.translate(cx, cy); ctx.scale(zoom, zoom); ctx.translate(-cx, -cy);
  const pr = lerp(150, 105, easeOut((t - 35.8) / 0.5) * (t > 35.8 ? 1 : 0));
  drawEye(t, cx, cy, 1.0, pr);
  const p = easeIn(ss(35.0, 35.8, t));
  if (t < 35.95) {
    const y = lerp(-100, cy, p);
    ctx.globalCompositeOperation = 'lighter';
    for (const [w, a] of [[40, 0.1], [12, 0.4], [4, 1]]) { ctx.globalAlpha = a; ctx.strokeStyle = '#ffe9b0'; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(cx, y - 600); ctx.lineTo(cx, y); ctx.stroke(); }
    spr(glow('#ffffff'), cx, y, 140, 1);
  }
  if (t > 35.8) { ctx.globalCompositeOperation = 'lighter'; const k = Math.exp(-(t - 35.8) * 3); softGlow(cx, cy, 500, [255, 210, 140], 0.6 * k); spr(glow('#ffffff'), cx, cy, 120, k); }
  ctx.globalCompositeOperation = 'source-over';
  ctx.restore();
  rise('最后，它落进了你的眼睛', W / 2, 260, t, 35.3, 37.1, { size: 70, weight: 800, spacing: 4, shadow: SHADOW });
}
function sceneRetina(t) {
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  const bg = ctx.createRadialGradient(W / 2, 1400, 100, W / 2, 1000, 1500);
  bg.addColorStop(0, '#5a0f3a'); bg.addColorStop(0.5, '#25062a'); bg.addColorStop(1, '#07010d');
  ctx.fillStyle = bg; ctx.fillRect(-50, -50, W + 100, H + 100);
  // photoreceptors
  const hit = 37.9;
  ctx.globalCompositeOperation = 'lighter';
  for (const [x, y, cone] of CELLS) {
    const near = Math.hypot(x - W / 2, y - 1400);
    const wave = t > hit ? Math.exp(-Math.abs(near - (t - hit) * 900) / 60) : 0;
    const lit = (near < 70 && t > hit ? Math.exp(-(t - hit) * 1.5) : 0) + wave * 0.7;
    const c = cone ? [255, 120, 180] : [120, 200, 255];
    ctx.globalAlpha = 0.28 + 0.6 * lit; ctx.fillStyle = rgba(mixc(c, [255, 255, 255], lit));
    ctx.beginPath(); ctx.roundRect(x - 22, y - 46, 44, 92, 22); ctx.fill();
    if (lit > 0.05) spr(glow('#ffffff'), x, y, 160, lit);
  }
  // incoming photon
  if (t < hit + 0.05) { const y = lerp(-80, 1400, easeIn(ss(37.45, hit, t))); spr(glow('#fff2c8'), W / 2, y, 200, 1); spr(glow('#ffffff'), W / 2, y, 50, 1); }
  // neural signal racing up to the brain
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const n of NEURONS) {
    if (t < n.t0) continue;
    const f = clamp((t - n.t0) / (n.t1 - n.t0)), m = Math.max(1, Math.round(f * (n.pts.length - 1)));
    const age = t - n.t1;
    const a = 0.85 * (age > 0 ? 0.55 + 0.45 * Math.exp(-age * 3) : 1);
    ctx.beginPath(); ctx.moveTo(n.pts[0][0], n.pts[0][1]); for (let i = 1; i <= m; i++) ctx.lineTo(n.pts[i][0], n.pts[i][1]);
    for (const [w, al] of [[16, 0.08], [6, 0.3], [2, 1]]) { ctx.globalAlpha = a * al; ctx.strokeStyle = n.hue; ctx.lineWidth = w * (1 - n.depth * 0.08); ctx.stroke(); }
    const tip = n.pts[m];
    if (f < 1) spr(glow('#ffffff'), tip[0], tip[1], 60, 1);
    else if (age < 0.4) spr(glow(n.hue), tip[0], tip[1], 90, 1 - age / 0.4);
  }
  const bloom = ss(39.3, 40.9, t);
  softGlow(W / 2, 700, 900, [255, 230, 190], 0.5 * bloom);
  ctx.globalCompositeOperation = 'source-over';
  slam('于是，你看见了光', W / 2, 960, t, 39.4, 40.95, { size: 100, spacing: 6, fill: GOLD_FILL, shadow: 'rgba(80,10,60,0.9)', shadowBlur: 40 });
}

// ================================================================ CHAPTER 6 — poster (41–45s)
const MOTES = []; { const r = rng(8); for (let i = 0; i < 160; i++) MOTES.push([r() * W, r() * H, 0.3 + r() * 0.7, r() * 6]); }
function scenePoster(t) {
  const age = t - 41;
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#101a4d'); bg.addColorStop(0.42, '#5a3b8a'); bg.addColorStop(0.62, '#ff8a5c'); bg.addColorStop(0.76, '#ffd49a'); bg.addColorStop(1, '#ffe8c4');
  ctx.fillStyle = bg; ctx.fillRect(-50, -50, W + 100, H + 100);
  const sy = 1430 - 40 * easeOut(age / 4);
  ctx.globalCompositeOperation = 'lighter';
  ctx.save(); ctx.globalAlpha = 0.16 + 0.2 * Math.exp(-age * 2);
  const rg = ctx.createRadialGradient(W / 2, sy, 0, W / 2, sy, 1500); rg.addColorStop(0, 'rgba(255,240,200,0.9)'); rg.addColorStop(1, 'rgba(255,240,200,0)');
  ctx.fillStyle = rg; ctx.beginPath();
  for (let i = 0; i < 26; i++) { const a = -Math.PI + (i + 0.5) / 26 * Math.PI + t * 0.02, w = 0.025 + hash(i) * 0.03; ctx.moveTo(W / 2, sy); ctx.lineTo(W / 2 + Math.cos(a - w) * 1800, sy + Math.sin(a - w) * 1800); ctx.lineTo(W / 2 + Math.cos(a + w) * 1800, sy + Math.sin(a + w) * 1800); }
  ctx.fill(); ctx.restore();
  softGlow(W / 2, sy, 700, [255, 200, 120], 0.6);
  ctx.globalCompositeOperation = 'source-over';
  const sg = ctx.createRadialGradient(W / 2, sy, 0, W / 2, sy, 150);
  sg.addColorStop(0, '#fffef6'); sg.addColorStop(0.8, '#fff1c8'); sg.addColorStop(1, 'rgba(255,220,150,0)');
  ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(W / 2, sy, 150, 0, Math.PI * 2); ctx.fill();
  // hills
  const hill = (base, amp, f, ph, col) => {
    ctx.beginPath(); ctx.moveTo(-50, H + 50);
    for (let x = -50; x <= W + 50; x += 15) ctx.lineTo(x, base - amp * Math.sin(x * f + ph) - amp * 0.5 * Math.sin(x * f * 2.3 + ph * 2));
    ctx.lineTo(W + 50, H + 50); ctx.closePath(); ctx.fillStyle = col; ctx.fill();
  };
  hill(1560, 40, 0.004, 1.0, '#7a3f6a');
  hill(1640, 30, 0.006, 2.5, '#4a2148');
  // the one who sees: a small figure on the near hill, looking up at the sun
  const fx = W * 0.56, fy = 1660 - 30 * Math.sin(fx * 0.006 + 2.5) - 15 * Math.sin(fx * 0.0138 + 5);
  hill(1700, 26, 0.005, 4.2, '#25102a');
  ctx.fillStyle = '#1a0a1e';
  ctx.beginPath(); ctx.arc(fx, 1580, 15, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.moveTo(fx - 14, 1600); ctx.quadraticCurveTo(fx, 1592, fx + 14, 1600); ctx.lineTo(fx + 10, 1652); ctx.lineTo(fx + 12, 1700); ctx.lineTo(fx + 3, 1700); ctx.lineTo(fx, 1660); ctx.lineTo(fx - 3, 1700); ctx.lineTo(fx - 12, 1700); ctx.lineTo(fx - 10, 1652); ctx.closePath(); ctx.fill();
  ctx.fillRect(0, 1695, W, H);
  ctx.globalCompositeOperation = 'lighter';
  for (const [x, y0, s, ph] of MOTES) { const y = ((y0 - age * 60 * s) % H + H) % H; spr(glow('#fff2c8'), x + Math.sin(t + ph) * 12, y, 8 + 12 * s, 0.5 * s); }
  ctx.globalCompositeOperation = 'source-over';
  slam('一束光的旅行', W / 2, 470, t, 41.05, 45.2, { family: 'Serif', size: 132, spacing: 10, fill: GOLD_FILL, shadow: 'rgba(60,10,40,0.85)', shadowBlur: 50, from: 1.5 });
  txt('THE JOURNEY OF A PHOTON', W / 2, 590, { family: 'Mont', size: 30, weight: 700, spacing: lerp(30, 14, easeOut((t - 41.4) / 1.2)), alpha: ss(41.4, 42.0, t), shadow: 'rgba(0,0,0,0.4)', shadowBlur: 16 });
  rise('它走了十几万年', W / 2, 760, t, 42.0, 45.2, { family: 'Serif', size: 64, weight: 600, spacing: 10, shadow: 'rgba(40,10,40,0.6)', shadowBlur: 24 });
  rise('只为落进你的眼里', W / 2, 860, t, 42.6, 45.2, { family: 'Serif', size: 64, weight: 600, spacing: 10, shadow: 'rgba(40,10,40,0.6)', shadowBlur: 24 });
}

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
function rewindFx(t, k) {
  if (k <= 0.02) return;
  TMPX.globalCompositeOperation = 'copy'; TMPX.drawImage(cv, 0, 0);
  const f = Math.floor(t * 30);
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  let y = 0, i = 0;
  while (y < H) { const h = 14 + hash(f * 31 + i) * 140; const dx = (hash(f * 17 + i * 3) - 0.5) * 2 * 90 * k; ctx.drawImage(TMP, 0, y, W, h, dx, y, W, h); y += h; i++; }
  ctx.globalAlpha = 0.25 * k; ctx.fillStyle = '#fff';
  for (let j = 0; j < 6; j++) ctx.fillRect(0, (hash(f * 7 + j) * H) | 0, W, 2 + hash(j + f) * 5);
  ctx.restore();
  chromaShift(18 * k);
}

// ================================================================ frame
function renderTime(t) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; ctx.filter = 'none'; ctx.shadowBlur = 0; ctx.letterSpacing = '0px';
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  const imp = impact(t);
  const f = Math.round(t * FPS);
  let big = 0; for (const [ti, k] of IMPACTS) if (k >= 0.7 && t >= ti && t - ti < 0.6) big = Math.max(big, k * Math.exp(-(t - ti) * 7));
  const sh = Math.min(14, big * 12);
  ctx.setTransform(1, 0, 0, 1, (hash(f * 2) - 0.5) * 2 * sh, (hash(f * 2 + 1) - 0.5) * 2 * sh);

  let bl = 0.5;
  if (t < 3.0) { sceneHook(t); bl = 0.45; }
  else if (t < 15.0) { sceneCore(t); bl = 0.4; }
  else if (t < 25.0) { sceneSpace(t); bl = 0.55; }
  else if (t < 35.0) { sceneSky(t); bl = 0.35; }
  else if (t < 37.5) { sceneEye2(t); bl = 0.45; }
  else if (t < 41.0) { sceneRetina(t); bl = 0.6; }
  else { scenePoster(t); bl = 0.35; }

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  bloom(bl + 0.25 * Math.min(1, imp));
  if (t > 2.3 && t < 3.0) rewindFx(t, ss(2.3, 2.6, t));
  chromaShift(Math.min(12, imp * 7));
  ctx.globalCompositeOperation = 'source-over';
  let flash = 0;
  for (const [ti, k] of IMPACTS) if (t >= ti && t - ti < 0.6) flash = Math.max(flash, k * Math.exp(-(t - ti) * 12));
  // transitions: white bloom into the next chapter
  flash = Math.max(flash, ss(14.85, 15.0, t) * (t < 15 ? 1 : 0), ss(24.8, 25.0, t) * (t < 25 ? 1 : 0), ss(40.85, 41.0, t) * (t < 41 ? 1 : 0), ss(34.8, 35.0, t) * (t < 35 ? 0.8 : 0));
  if (flash > 0.01) { ctx.globalAlpha = Math.min(0.9, flash * 0.8); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H); }
  ctx.globalAlpha = 1; ctx.drawImage(VIG, 0, 0);
  ctx.globalCompositeOperation = 'overlay'; ctx.globalAlpha = 0.05;
  const gimg = GRAIN[f % 4], ox = -Math.floor(hash(f) * 256), oy = -Math.floor(hash(f + 999) * 256);
  for (let y = oy; y < H; y += 256) for (let x = ox; x < W; x += 256) ctx.drawImage(gimg, x, y);
  ctx.globalCompositeOperation = 'source-over';
  let black = ss(44.2, 44.9, t);
  if (t > 2.92 && t < 3.0) black = 1;
  if (t >= 3.0 && t < 3.2) black = 1 - ss(3.0, 3.2, t);
  if (t > 37.45 && t < 37.7) black = Math.max(black, ss(37.45, 37.52, t) * (1 - ss(37.55, 37.7, t)));
  if (black > 0) { ctx.globalAlpha = clamp(black); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); }
  ctx.globalAlpha = 1;
}

window.renderFrame = i => renderTime(i / FPS);
window.renderTime = renderTime;
window.META = { W, H, FPS, DURATION, IMPACTS, EVENTS: EVENTS.map(e => e.t), WALK: WALK.map(w => w.t) };
window.ready = (async () => {
  await Promise.all([
    document.fonts.load('900 100px Sans', '光'), document.fonts.load('500 100px Sans', '光'),
    document.fonts.load('900 100px Serif', '光'), document.fonts.load('600 100px Serif', '光'),
    document.fonts.load('900 100px Mont', '0123'), document.fonts.load('700 100px Mont', 'THE'),
  ]);
  await document.fonts.ready;
  if (!navigator.webdriver) {
    const t0 = performance.now();
    const loop = () => { renderTime(((performance.now() - t0) / 1000) % DURATION); requestAnimationFrame(loop); };
    loop();
  }
  return true;
})();
