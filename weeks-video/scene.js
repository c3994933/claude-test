// 人生只有 4000 周 — a generative vertical short film (1080×1920, 60 fps).
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

// ================================================================ the grid: 80 years × 52 weeks
const COLS = 52, ROWS = 80, N = COLS * ROWS, CS = 17.4, PAD = 3.2;
const GX = (W - COLS * CS) / 2 + 26, GY = 300;
const cellXY = i => [GX + (i % COLS) * CS + CS / 2, GY + Math.floor(i / COLS) * CS + CS / 2];
const AGE = 25, PAST = AGE * COLS;                       // 1300 weeks already lived
const FREE_END = 1950, MISC_END = 2314, PHONE_END = 2791, WORK_END = 3207;
const CAT = i => i < PAST ? 'past' : i < FREE_END ? 'free' : i < MISC_END ? 'misc' : i < PHONE_END ? 'phone' : i < WORK_END ? 'work' : 'sleep';
const CATCOL = { past: [92, 92, 108], free: [255, 214, 110], misc: [178, 110, 255], phone: [34, 211, 238], work: [255, 110, 92], sleep: [80, 96, 255] };
const RANGE = { free: [PAST, FREE_END], misc: [FREE_END, MISC_END], phone: [MISC_END, PHONE_END], work: [PHONE_END, WORK_END], sleep: [WORK_END, N] };
const CATT = { sleep: [15.0, 16.2], work: [17.5, 18.2], phone: [20.0, 20.7], misc: [22.3, 22.9], free: [24.0, 24.6] };
const VIVID = ['#ff5e7e', '#ffb547', '#ffe066', '#5eead4', '#60a5fa', '#a78bfa', '#f472b6', '#34d399'].map(hex);
const RANK_HOOK = new Float32Array(N), RANK_RAND = new Float32Array(N), VIV = new Uint8Array(N);
(function ranks() {
  const r = rng(404), c = [GX + COLS * CS / 2, GY + ROWS * CS / 2];
  const a = [...Array(N).keys()].map(i => { const p = cellXY(i); return [Math.hypot(p[0] - c[0], (p[1] - c[1]) * 0.75) + r() * 60, i]; }).sort((x, y) => x[0] - y[0]);
  a.forEach(([, i], k) => { RANK_HOOK[i] = k / N; });
  const b = [...Array(N).keys()].map(i => [r(), i]).sort((x, y) => x[0] - y[0]);
  b.forEach(([, i], k) => { RANK_RAND[i] = k / N; VIV[i] = Math.floor(r() * VIVID.length); });
})();
// 125 days with your parents ≈ 18 weeks, scattered across the next 25 years
const PARENT = []; for (let k = 0; k < 18; k++) PARENT.push(PAST + Math.floor((k + 0.5) / 18 * 1300) + (k % 3) * 7);
const PARENT_SET = new Set(PARENT);
const ZOOM_CELL = PAST + 26;

function camAt(t) {
  // zoom into one week, then back out
  const zin = easeIO(ss(3.25, 4.0, t)) * (1 - easeIO(ss(5.3, 5.9, t)));
  const p = cellXY(ZOOM_CELL);
  return { s: 1 + 2.4 * zin, fx: lerp(W / 2, p[0], zin), fy: lerp(H / 2, p[1], zin), tx: W / 2, ty: lerp(H / 2, 1060, zin) };
}

function drawGrid(t) {
  const cam = camAt(t);
  ctx.save();
  ctx.translate(cam.tx, cam.ty); ctx.scale(cam.s, cam.s); ctx.translate(-cam.fx, -cam.fy);
  const sweepRow = (t - 7.5) / 1.4 * ROWS;
  const dimAll = lerp(lerp(1, 0.22, ss(26.6, 27.4, t)), 1, ss(34.8, 35.6, t));
  const catFade = 1 - ss(34.8, 35.6, t);
  const gatherK = easeIO(ss(29.9, 30.9, t)) * (1 - easeIO(ss(34.7, 35.5, t)));
  const parentRows = ss(28.2, 28.8, t) * (1 - ss(29.6, 30.2, t));
  const greyNext = i => i >= PAST && i < PAST + 20 && t > 35.6 + (i - PAST) * 0.09;
  const s0 = CS - PAD;
  const glowCells = [];
  for (let i = 0; i < N; i++) {
    const [x, y] = cellXY(i), row = Math.floor(i / COLS);
    // hook cascade
    const ta = -0.55 + RANK_HOOK[i] * 1.75, ap = clamp((t - ta) / 0.18);
    if (ap <= 0) continue;
    let col = [255, 255, 255], a = 0.13, sz = s0, bright = 0;
    if (t < 3.2) { const flash = Math.exp(-(t - ta) * 4); a = lerp(lerp(0.13, 1, flash), 0.13, ss(2.4, 3.2, t)); col = mixc([255, 255, 255], [255, 200, 120], flash * 0.5); sz = s0 * easeOutBack(ap); }
    // row sweep "from birth to 80"
    if (t > 7.4 && t < 9.2) { const k = Math.exp(-Math.abs(row - sweepRow) / 1.6); a += 0.6 * k; bright = Math.max(bright, k); }
    // highlight one row
    if (t > 5.7 && t < 7.4 && row === AGE + 5) { const k = ss(5.8, 6.1, t) * (1 - ss(7.1, 7.4, t)); a += 0.7 * k * ss(0, 1, ((t - 5.8) * 2.2 * COLS - (i % COLS)) / 4); col = mixc(col, [255, 214, 110], k); }
    // the weeks already lived
    const cat = CAT(i);
    if (cat === 'past') {
      const tp = 9.45 + i / PAST * 1.6, k = clamp((t - tp) / 0.12);
      if (k > 0) { const fl = Math.exp(-(t - tp) * 9); col = mixc(CATCOL.past, [255, 255, 255], fl); a = lerp(a, 0.9, k) + fl * 0.3; bright = Math.max(bright, fl); }
    } else if (t > 15.0) {
      const [c0, c1] = CATT[cat];
      const [lo, hi] = RANGE[cat];
      const tc = lerp(c0, c1, cat === 'free' ? (i - lo) / (hi - lo) : (hi - 1 - i) / (hi - lo));
      const k = clamp((t - tc) / 0.15) * catFade;
      if (k > 0) {
        const fl = Math.exp(-(t - tc) * 8);
        col = mixc(col, mixc(CATCOL[cat], [255, 255, 255], fl * 0.6), k);
        a = lerp(a, cat === 'free' ? 0.95 : 0.85, k) + fl * 0.3;
        if (cat === 'free' && t > 24.0) bright = Math.max(bright, (0.4 + 0.3 * Math.sin(t * 6 + i * 0.3)) * k);
      }
    }
    // parents: dim everything, light the next 25 years, then gather 18 weeks
    if (t > 26.6) {
      a *= dimAll;
      if (i >= PAST && i < PAST + 1300 && parentRows > 0) { a = lerp(a, 0.6, parentRows); col = mixc(col, [255, 240, 220], parentRows); }
    }
    if (greyNext(i)) { const tg = 35.6 + (i - PAST) * 0.09, fl = Math.exp(-(t - tg) * 8); col = mixc(CATCOL.past, [255, 255, 255], fl); a = 0.9; bright = Math.max(bright, fl); }
    // the colourful ending: every empty week fills with life
    if (t > 39.35 && i >= PAST + 20) {
      const tf = 39.4 + RANK_RAND[i] * 1.5, k = clamp((t - tf) / 0.2);
      if (k > 0) { const fl = Math.exp(-(t - tf) * 6); col = mixc(col, mixc(VIVID[VIV[i]], [255, 255, 255], fl * 0.7), k); a = lerp(a, 0.95, k); sz = s0 * (1 + 0.5 * fl); bright = Math.max(bright, fl); }
    }
    if (PARENT_SET.has(i) && gatherK > 0) continue;   // drawn separately while gathered
    ctx.globalAlpha = clamp(a); ctx.fillStyle = rgba(col);
    ctx.fillRect(x - sz / 2, y - sz / 2, sz, sz);
    if (bright > 0.35 && (i & 1) === 0) glowCells.push([x, y, col, bright]);
  }
  ctx.globalCompositeOperation = 'lighter';
  for (const [x, y, col, b] of glowCells) { ctx.globalAlpha = 0.22 * b; ctx.fillStyle = rgba(col); ctx.fillRect(x - CS, y - CS, CS * 2, CS * 2); }
  ctx.globalCompositeOperation = 'source-over';

  // "you are here"
  if (t > 11.2 && t < 26.6) {
    const [x, y] = cellXY(PAST), a = ss(11.2, 11.5, t) * (1 - ss(26.2, 26.6, t)), p = (t * 1.6) % 1;
    ctx.globalAlpha = a * (1 - p); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(x, y, 10 + p * 34, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = a; ctx.fillStyle = '#fff'; ctx.fillRect(x - s0 / 2 - 2, y - s0 / 2 - 2, s0 + 4, s0 + 4);
    txt('你在这里', x + 150, y - 34, { size: 30, weight: 800, alpha: a, align: 'left', shadow: SHADOW, shadowBlur: 12 });
    ctx.globalAlpha = a; ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x + 12, y - 8); ctx.lineTo(x + 140, y - 34); ctx.stroke();
  }
  // age labels
  const la = ss(5.7, 6.3, t) * (1 - ss(40.6, 41.0, t)) * (t > 26.6 ? lerp(1, 0.3, ss(26.6, 27.4, t)) + 0.7 * ss(34.8, 35.6, t) : 1);
  if (la > 0) {
    for (let r = 0; r <= 80; r += 10) txt(`${r}岁`, GX - 14, GY + r * CS, { size: 22, weight: 600, align: 'right', alpha: la * 0.75 });
  }
  ctx.restore();

  // zoom callout: one week = 7 days
  const za = ss(3.9, 4.2, t) * (1 - ss(5.2, 5.5, t));
  if (za > 0) {
    const days = ['一', '二', '三', '四', '五', '六', '日'];
    const bw = 116, gap = 14, x0 = W / 2 - (7 * bw + 6 * gap) / 2, y0 = 1480;
    days.forEach((d, k) => {
      const kk = easeOutBack((t - 4.0 - k * 0.06) / 0.3);
      ctx.save(); ctx.globalAlpha = za; ctx.translate(x0 + k * (bw + gap) + bw / 2, y0 + bw / 2); ctx.scale(kk, kk);
      ctx.fillStyle = k >= 5 ? 'rgba(255,214,110,0.95)' : 'rgba(255,255,255,0.92)'; ctx.beginPath(); ctx.roundRect(-bw / 2, -bw / 2, bw, bw, 18); ctx.fill(); ctx.restore();
      txt(d, x0 + k * (bw + gap) + bw / 2, y0 + bw / 2 + 2, { size: 52, weight: 900, fill: '#16121f', alpha: za, scale: Math.max(0.01, kk) });
    });
    ctx.globalAlpha = za * 0.8; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(W / 2, 1110); ctx.lineTo(W / 2, 1460); ctx.stroke();
  }
}

// the 18 weeks with your parents, gathered into one small block
function drawParents(t) {
  const k = easeIO(ss(29.9, 30.9, t)) * (1 - easeIO(ss(34.7, 35.5, t)));
  if (k <= 0) return;
  const bs = 92, gap = 16, cols = 6, rows = 3;
  const x0 = W / 2 - (cols * bs + (cols - 1) * gap) / 2 + bs / 2, y0 = 960 - (rows * bs + (rows - 1) * gap) / 2 + bs / 2;
  ctx.globalCompositeOperation = 'lighter';
  softGlow(W / 2, 960, 520, [255, 190, 90], 0.35 * k);
  ctx.globalCompositeOperation = 'source-over';
  PARENT.forEach((i, n) => {
    const [sx, sy] = cellXY(i);
    const tx = x0 + (n % cols) * (bs + gap), ty = y0 + Math.floor(n / cols) * (bs + gap);
    const kk = easeIO(clamp((k - n * 0.012) / 0.8));
    const x = lerp(sx, tx, kk), y = lerp(sy, ty, kk) - Math.sin(Math.PI * kk) * 120, s = lerp(CS - PAD, bs, kk);
    const pulse = 0.9 + 0.1 * Math.sin(t * 4 + n);
    ctx.globalAlpha = 1; ctx.fillStyle = rgba(mixc([255, 214, 110], [255, 250, 230], 0.2 * pulse));
    ctx.shadowColor = 'rgba(255,170,60,0.9)'; ctx.shadowBlur = 30 * kk;
    ctx.beginPath(); ctx.roundRect(x - s / 2, y - s / 2, s, s, 4 + 14 * kk); ctx.fill(); ctx.shadowBlur = 0;
  });
}

function panel(y, h, a) {
  if (a <= 0) return;
  const g = ctx.createLinearGradient(0, y - h / 2, 0, y + h / 2);
  g.addColorStop(0, 'rgba(8,6,16,0)'); g.addColorStop(0.25, 'rgba(8,6,16,0.82)'); g.addColorStop(0.75, 'rgba(8,6,16,0.82)'); g.addColorStop(1, 'rgba(8,6,16,0)');
  ctx.globalAlpha = a; ctx.fillStyle = g; ctx.fillRect(0, y - h / 2, W, h); ctx.globalAlpha = 1;
}
function chip(x, y, colr, label, a, w = 440) {
  if (a <= 0) return;
  ctx.save(); ctx.globalAlpha = a;
  ctx.fillStyle = 'rgba(20,16,34,0.85)'; ctx.strokeStyle = rgba(colr, 0.9); ctx.lineWidth = 2;
  ctx.beginPath(); ctx.roundRect(x - w / 2, y - 30, w, 60, 30); ctx.fill(); ctx.stroke();
  ctx.fillStyle = rgba(colr); ctx.fillRect(x - w / 2 + 24, y - 11, 22, 22);
  ctx.restore();
  txt(label, x - w / 2 + 64, y + 1, { size: 30, weight: 800, align: 'left', alpha: a });
}

// ================================================================ text track
const TOP1 = 140, TOP2 = 232;
function captions(t) {
  // hook
  if (t < 3.2) {
    const a = 1 - ss(2.75, 3.1, t);
    ctx.globalAlpha = 1;
    const rg = ctx.createRadialGradient(W / 2, 960, 50, W / 2, 960, 620);
    rg.addColorStop(0, `rgba(8,6,16,${0.85 * a})`); rg.addColorStop(1, 'rgba(8,6,16,0)');
    ctx.fillStyle = rg; ctx.fillRect(0, 300, W, 1400);
    rise('你的一生，只有', W / 2, 180, t, 0.15, 3.05, { size: 76, weight: 900, spacing: 8, shadow: SHADOW });
    const u = clamp((t + 0.35) / 1.85), v = Math.round(4160 * (1 - Math.pow(1 - u, 2.6)));
    const lock = t > 1.55 ? Math.exp(-(t - 1.55) * 7) : 0;
    txt(fmt(v), W / 2, 900, { family: 'Mont', size: 280, weight: 900, spacing: 4, alpha: a, scale: (t < 0.25 ? lerp(1.25, 1, easeOutBack(t / 0.25)) : 1) * (1 + 0.15 * lock), chroma: 3 + (1 - u) * 16 + lock * 22, fill: GOLD_FILL, shadow: 'rgba(255,140,40,0.85)', shadowBlur: 60 });
    slam('个星期', W / 2, 1110, t, 1.6, 3.05, { size: 120, spacing: 30, shadow: 'rgba(0,0,0,0.8)', from: 2.4 });
    rise('按 80 岁算：80 年 × 52 周', W / 2, 1800, t, 0.7, 3.05, { size: 34, weight: 600, spacing: 4, alpha: 0.8 });
  }
  rise('每一格，是一个星期', W / 2, 180, t, 3.25, 5.6, { size: 72, weight: 900, spacing: 6, shadow: SHADOW });
  rise('每一行，是一年', W / 2, 180, t, 5.75, 7.4, { size: 72, weight: 900, spacing: 6, shadow: SHADOW });
  rise('从出生，到 80 岁', W / 2, 180, t, 7.5, 8.95, { size: 72, weight: 900, spacing: 6, shadow: SHADOW });
  slam('如果你今年 25 岁', W / 2, 180, t, 9.0, 11.3, { size: 80, spacing: 4, fill: GOLD_FILL, shadow: 'rgba(0,0,0,0.8)' });
  rise('这些格子，已经用掉了', W / 2, 180, t, 11.4, 12.95, { size: 72, weight: 900, spacing: 4, shadow: SHADOW });
  rise('剩下的 2,860 格', W / 2, TOP1, t, 13.0, 14.95, { size: 74, weight: 900, spacing: 4, shadow: SHADOW });
  rise('把它们按用途排在一起', W / 2, TOP2, t, 13.4, 14.95, { size: 48, weight: 600, spacing: 6, alpha: 0.9, shadow: SHADOW });
  slam('约 1/3 用来睡觉', W / 2, 180, t, 15.0, 17.4, { size: 80, spacing: 4, fill: c => rgba([150, 165, 255]), shadow: 'rgba(0,0,0,0.85)' });
  slam('工作，约 8 年', W / 2, 180, t, 17.5, 19.9, { size: 80, spacing: 4, fill: c => rgba([255, 150, 130]), shadow: 'rgba(0,0,0,0.85)' });
  slam('刷手机，约 9 年', W / 2, 180, t, 20.0, 22.2, { size: 80, spacing: 4, fill: c => rgba([110, 230, 250]), shadow: 'rgba(0,0,0,0.85)' });
  slam('吃饭、通勤、家务，约 7 年', W / 2, 180, t, 22.3, 23.9, { size: 64, spacing: 2, fill: c => rgba([205, 160, 255]), shadow: 'rgba(0,0,0,0.85)' });
  slam('真正属于你自己的', W / 2, TOP1, t, 24.0, 26.4, { size: 64, spacing: 4, shadow: 'rgba(0,0,0,0.85)', from: 1.5 });
  slam('大约只剩 12 年', W / 2, TOP2 + 10, t, 24.35, 26.4, { size: 92, spacing: 4, fill: GOLD_FILL, shadow: 'rgba(120,60,0,0.9)', shadowBlur: 40 });
  // legend chips
  const ca = 1 - ss(26.2, 26.6, t);
  chip(W / 2 - 236, 1752, CATCOL.sleep, '睡觉 ≈ 18 年', ss(15.2, 15.5, t) * ca);
  chip(W / 2 + 236, 1752, CATCOL.work, '工作 ≈ 8 年', ss(17.7, 18.0, t) * ca);
  chip(W / 2 - 236, 1830, CATCOL.phone, '刷手机 ≈ 9 年', ss(20.2, 20.5, t) * ca);
  chip(W / 2 + 236, 1830, CATCOL.misc, '吃饭通勤家务 ≈ 7 年', ss(22.5, 22.8, t) * ca);
  txt('*按每天睡 8 小时、工作到 60 岁、每天刷手机 4 小时等假设估算', W / 2, 1893, { size: 21, weight: 400, alpha: 0.6 * ss(15.2, 15.6, t) * ca });
  // parents
  rise('还有一件事', W / 2, 180, t, 26.6, 27.95, { size: 72, weight: 900, spacing: 10, shadow: SHADOW });
  rise('如果爸妈今年 55 岁', W / 2, TOP1, t, 28.0, 29.85, { size: 70, weight: 900, spacing: 4, shadow: SHADOW });
  rise('你每年回家一次，每次 5 天', W / 2, TOP2, t, 28.5, 29.85, { size: 52, weight: 700, spacing: 4, shadow: SHADOW });
  panel(560, 260, ss(30.9, 31.2, t) * (1 - ss(34.6, 35.0, t)));
  slam('你还能陪他们的日子', W / 2, 560, t, 31.0, 35.0, { size: 76, spacing: 6, shadow: SHADOW, from: 1.5 });
  panel(1330, 300, ss(31.7, 32.0, t) * (1 - ss(34.6, 35.0, t)));
  slam('可能只剩 125 天', W / 2, 1330, t, 31.8, 35.0, { size: 112, spacing: 4, fill: GOLD_FILL, shadow: 'rgba(160,70,0,0.9)', shadowBlur: 50 });
  rise('*假设父母活到 80 岁：25 年 × 5 天 = 125 天', W / 2, 1830, t, 32.2, 35.0, { size: 26, weight: 500, alpha: 0.7 });
  // ending
  rise('格子会一格一格变灰', W / 2, 180, t, 35.3, 37.4, { size: 72, weight: 900, spacing: 6, shadow: SHADOW });
  rise('但剩下的每一格', W / 2, 180, t, 37.5, 39.3, { size: 72, weight: 900, spacing: 6, shadow: SHADOW });
  slam('都由你来填满', W / 2, 180, t, 39.4, 41.0, { size: 88, spacing: 8, fill: GOLD_FILL, shadow: 'rgba(0,0,0,0.85)' });
}
function poster(t) {
  if (t < 40.9) return;
  const a = ss(40.95, 41.3, t);
  panel(960, 700, a * 0.95);
  slam('人生只有', W / 2, 800, t, 41.0, 46, { size: 96, spacing: 20, shadow: SHADOW, from: 1.6 });
  slam('4000 周', W / 2, 960, t, 41.25, 46, { size: 190, weight: 900, spacing: 6, fill: GOLD_FILL, shadow: 'rgba(200,90,0,0.85)', shadowBlur: 60, from: 2.0 });
  txt('LIFE IN WEEKS', W / 2, 1085, { family: 'Mont', size: 30, weight: 700, spacing: lerp(30, 16, easeOut((t - 41.5) / 1.0)), alpha: ss(41.5, 42.0, t) });
  rise('今天，也是其中一格', W / 2, 1180, t, 42.1, 46, { size: 56, weight: 700, spacing: 8, shadow: SHADOW });
}

// ================================================================ impacts & frame
const IMPACTS = [[0.0, 0.6], [1.6, 0.8], [9.0, 0.6], [15.0, 1.1], [17.5, 0.5], [20.0, 0.5], [22.3, 0.4], [24.35, 0.7], [31.8, 0.5], [39.4, 0.8], [41.25, 1.0]];
function impact(t, decay = 6) { let s = 0; for (const [ti, k] of IMPACTS) if (t >= ti && t - ti < 2) s += k * Math.exp(-(t - ti) * decay); return s; }

function background(t) {
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  const warm = ss(39.4, 41, t), emo = ss(26.6, 28, t) * (1 - ss(34.8, 36, t));
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, rgba(mixc(mixc([14, 10, 30], [20, 10, 8], emo), [30, 12, 40], warm)));
  g.addColorStop(1, rgba(mixc(mixc([6, 6, 14], [10, 6, 4], emo), [12, 6, 20], warm)));
  ctx.fillStyle = g; ctx.fillRect(-50, -50, W + 100, H + 100);
  ctx.globalCompositeOperation = 'lighter';
  softGlow(W * (0.3 + 0.1 * Math.sin(t * 0.3)), H * 0.35, 900, mixc([60, 40, 160], [160, 90, 20], emo), 0.22 + 0.15 * warm);
  softGlow(W * (0.75 + 0.08 * Math.cos(t * 0.25)), H * 0.7, 900, mixc([150, 30, 120], [120, 60, 10], emo), 0.18 + 0.15 * warm);
  ctx.globalCompositeOperation = 'source-over';
}

function renderTime(t) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; ctx.filter = 'none'; ctx.shadowBlur = 0; ctx.letterSpacing = '0px';
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  const imp = impact(t), f = Math.round(t * FPS);
  let big = 0; for (const [ti, k] of IMPACTS) if (k >= 0.8 && t >= ti && t - ti < 0.5) big = Math.max(big, k * Math.exp(-(t - ti) * 8));
  const sh = Math.min(10, big * 9);
  ctx.setTransform(1, 0, 0, 1, (hash(f * 2) - 0.5) * 2 * sh, (hash(f * 2 + 1) - 0.5) * 2 * sh);
  background(t);
  drawGrid(t);
  drawParents(t);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  captions(t);
  poster(t);
  bloom(0.4 + 0.25 * Math.min(1, imp));
  chromaShift(Math.min(10, imp * 6));
  ctx.globalCompositeOperation = 'source-over';
  let flash = 0;
  for (const [ti, k] of IMPACTS) if (ti > 0 && t >= ti && t - ti < 0.5) flash = Math.max(flash, k * Math.exp(-(t - ti) * 14));
  if (flash > 0.01) { ctx.globalAlpha = Math.min(0.6, flash * 0.5); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H); }
  ctx.globalAlpha = 0.7; ctx.drawImage(VIG, 0, 0);
  ctx.globalCompositeOperation = 'overlay'; ctx.globalAlpha = 0.045;
  const gimg = GRAIN[f % 4], ox = -Math.floor(hash(f) * 256), oy = -Math.floor(hash(f + 999) * 256);
  for (let y = oy; y < H; y += 256) for (let x = ox; x < W; x += 256) ctx.drawImage(gimg, x, y);
  ctx.globalCompositeOperation = 'source-over';
  const black = ss(44.2, 44.9, t);
  if (black > 0) { ctx.globalAlpha = black; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); }
  ctx.globalAlpha = 1;
}

function renderCover() {
  renderTime(41.2);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  // redraw the title fully settled for the cover
  background(0); drawGrid(41.8); panel(960, 760, 0.95);
  txt('你的一生，只有', W / 2, 760, { size: 84, weight: 900, spacing: 10, shadow: SHADOW });
  txt('4000 周', W / 2, 955, { size: 200, weight: 900, spacing: 6, fill: GOLD_FILL, shadow: 'rgba(200,90,0,0.85)', shadowBlur: 60 });
  txt('你还剩多少格？', W / 2, 1150, { size: 64, weight: 800, spacing: 8, shadow: SHADOW });
  bloom(0.4); ctx.globalAlpha = 0.6; ctx.drawImage(VIG, 0, 0); ctx.globalAlpha = 1;
}

window.renderFrame = i => renderTime(i / FPS);
window.renderTime = renderTime;
window.renderCover = renderCover;
window.META = { W, H, FPS, DURATION, IMPACTS };
window.ready = (async () => {
  await Promise.all([
    document.fonts.load('900 100px Sans', '格'), document.fonts.load('500 100px Sans', '格'),
    document.fonts.load('900 100px Mont', '0123'), document.fonts.load('700 100px Mont', 'LIFE'),
  ]);
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
