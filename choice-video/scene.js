// 选择 · CHOICE — generative short film, v2.
// Every frame is a pure function of time t (seeded randomness), so frames render in any order.
'use strict';

const W = 1920, H = 1080, FPS = 30, DURATION = 45, BPM = 120, BEAT = 60 / BPM;
const F = 900;                       // focal length (px) for the 3D flight
const cv = document.getElementById('c');
let ctx = cv.getContext('2d');

// ================================================================ utilities
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const lerp = (a, b, t) => a + (b - a) * t;
const ss = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const easeIO = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const easeOut = t => 1 - Math.pow(1 - clamp(t), 3);
const easeOutExpo = t => t >= 1 ? 1 : 1 - Math.pow(2, -10 * clamp(t));
const easeInExpo = t => t <= 0 ? 0 : Math.pow(2, 10 * clamp(t) - 10);
const easeOutBack = t => { t = clamp(t); const c1 = 2.2, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
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
const fmt = n => n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');

// ================================================================ sprites
function makeGlow(c, size = 128, soft = false) {
  const g = document.createElement('canvas'); g.width = g.height = size;
  const x = g.getContext('2d'); const r = size / 2;
  const gr = x.createRadialGradient(r, r, 0, r, r, r);
  if (soft) {
    gr.addColorStop(0, rgba(c, 1)); gr.addColorStop(0.35, rgba(c, 0.55)); gr.addColorStop(0.7, rgba(c, 0.15)); gr.addColorStop(1, rgba(c, 0));
  } else {
    gr.addColorStop(0, rgba(mixc(c, [255, 255, 255], 0.7), 1)); gr.addColorStop(0.1, rgba(c, 0.85));
    gr.addColorStop(0.3, rgba(c, 0.28)); gr.addColorStop(0.6, rgba(c, 0.06)); gr.addColorStop(1, rgba(c, 0));
  }
  x.fillStyle = gr; x.fillRect(0, 0, size, size);
  return g;
}
const GLOWS = {}, BLOBS = {};
const glow = h => GLOWS[h] || (GLOWS[h] = makeGlow(hex(h), 64));
const blob = h => BLOBS[h] || (BLOBS[h] = makeGlow(hex(h), 256, true));
function spr(img, x, y, size, alpha, sx = 1, sy = 1) {
  if (alpha <= 0.003 || size <= 0.2) return;
  ctx.globalAlpha = clamp(alpha);
  const w = size * sx, h = size * sy;
  ctx.drawImage(img, x - w / 2, y - h / 2, w, h);
}
function softGlow(x, y, r, rgb, alpha, sx = 1, sy = 1) {
  if (alpha <= 0.003) return;
  ctx.save(); ctx.translate(x, y); ctx.scale(sx, sy);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
  g.addColorStop(0, rgba(rgb, 1)); g.addColorStop(0.35, rgba(rgb, 0.55)); g.addColorStop(0.7, rgba(rgb, 0.15)); g.addColorStop(1, rgba(rgb, 0));
  ctx.globalAlpha = clamp(alpha); ctx.fillStyle = g; ctx.fillRect(-r, -r, 2 * r, 2 * r); ctx.restore();
}
const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const TMP = mk(W, H), TMPX = TMP.getContext('2d');
const TMP2 = mk(W, H), TMP2X = TMP2.getContext('2d');
const BL1 = mk(W / 4, H / 4), BL1X = BL1.getContext('2d');
const BL2 = mk(W / 4, H / 4), BL2X = BL2.getContext('2d');
const BL3 = mk(W / 8, H / 8), BL3X = BL3.getContext('2d');
const TXT = mk(W, H), TXTX = TXT.getContext('2d');
const VIG = (() => {
  const g = mk(W, H), x = g.getContext('2d');
  const gr = x.createRadialGradient(W / 2, H / 2, H * 0.42, W / 2, H / 2, W * 0.7);
  gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.6)');
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
  if (o.rot) ctx.rotate(o.rot);
  ctx.font = `${o.italic ? 'italic ' : ''}${o.weight || 900} ${size}px ${o.family || 'Sans'}`;
  ctx.letterSpacing = sp + 'px';
  ctx.textAlign = o.align || 'center'; ctx.textBaseline = 'middle';
  const off = (o.align || 'center') === 'center' ? sp / 2 : 0;
  if (o.blur > 0.2) ctx.filter = `blur(${o.blur.toFixed(1)}px)`;
  const ch = o.chroma || 0;
  if (ch > 0.4) {
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a * 0.9;
    ctx.fillStyle = '#ff1f6b'; ctx.fillText(s, off + ch, ch * 0.15);
    ctx.fillStyle = '#1fd8ff'; ctx.fillText(s, off - ch, -ch * 0.15);
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.globalAlpha = a;
  if (o.shadow) { ctx.shadowColor = o.shadow; ctx.shadowBlur = o.shadowBlur ?? 30; }
  if (o.stroke) { ctx.lineWidth = o.lineWidth || 3; ctx.strokeStyle = o.stroke; ctx.strokeText(s, off, 0); }
  if (o.fill !== null) { ctx.fillStyle = typeof o.fill === 'function' ? o.fill(ctx) : (o.fill || '#fff'); ctx.fillText(s, off, 0); }
  ctx.restore();
}
// a slam: big → normal with overshoot, chromatic split settling
function slam(s, x, y, t, t0, o = {}) {
  if (t < t0) return;
  const age = t - t0, out = o.t1 ? 1 - ss(o.t1 - 0.25, o.t1, t) : 1;
  if (out <= 0) return;
  const k = easeOutBack(age / (o.dur || 0.32));
  txt(s, x, y, Object.assign({}, o, {
    scale: lerp(o.from || 2.1, 1, k) * (o.scale || 1),
    alpha: ss(t0, t0 + 0.06, t) * out * (o.alpha ?? 1),
    chroma: (o.chroma ?? 18) * Math.exp(-age * 7) + 1.2,
    blur: Math.max(0, 10 * (1 - age / 0.12)),
  }));
}
// rise: soft fade up with blur
function rise(s, x, y, t, t0, t1, o = {}) {
  if (t < t0 || t > t1) return;
  const p = ss(t0, t0 + (o.dur || 0.6), t), out = 1 - ss(t1 - 0.3, t1, t);
  txt(s, x, y + (1 - easeOut(p)) * 30, Object.assign({}, o, { alpha: p * out * (o.alpha ?? 1), blur: (1 - p) * 12 }));
}

// ================================================================ impacts (flash / shake / chroma)
const FORK_T = [20.0, 22.0, 24.0, 26.0, 28.0, 30.2, 32.4];
const IMPACTS = [
  [0.0, 1.0], [2.0, 0.9],
  ...[4.5, 5.0, 5.5, 6.0, 6.5, 7.0, 8.0].map(t => [t, 0.35]), [4.0, 0.6],
  [12.0, 0.7], [15.5, 0.35], [16.5, 0.35], [17.5, 0.45],
  [FORK_T[0], 1.2], [FORK_T[1], 0.5], [FORK_T[2], 0.5], [FORK_T[3], 0.5], [FORK_T[4], 0.35],
  [32.2, 0.45], [36.0, 1.3], [41.3, 0.5],
];
function impact(t, decay = 6) {
  let s = 0;
  for (const [ti, k] of IMPACTS) if (t >= ti && t - ti < 2) s += k * Math.exp(-(t - ti) * decay);
  return s;
}
const beatPulse = (t, from, to) => (t < from || t > to) ? 0 : Math.exp(-(((t - from) % BEAT)) * 9);

// ================================================================ background blobs (hook & title)
function liquid(t, cols, base, alpha = 0.6) {
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  ctx.fillStyle = base; ctx.fillRect(-200, -200, W + 400, H + 400);
  ctx.globalCompositeOperation = 'lighter';
  cols.forEach((c, i) => {
    const x = W * (0.5 + 0.38 * Math.sin(t * (0.35 + i * 0.07) + i * 2.1));
    const y = H * (0.5 + 0.34 * Math.cos(t * (0.29 + i * 0.05) + i * 1.3));
    spr(blob(c), x, y, 1500 + 300 * Math.sin(i + t * 0.4), alpha, 1.25, 1);
  });
}
function rays(t, cx, cy, col, alpha, n = 22, rot = 0.15) {
  if (alpha <= 0) return;
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = alpha;
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 1300);
  g.addColorStop(0, rgba(col, 0.9)); g.addColorStop(0.4, rgba(col, 0.25)); g.addColorStop(1, rgba(col, 0));
  ctx.fillStyle = g; ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const a = t * rot + i / n * Math.PI * 2 + hash(i) * 0.2, w = 0.02 + hash(i + 40) * 0.05;
    ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a - w) * 1600, cy + Math.sin(a - w) * 1600); ctx.lineTo(cx + Math.cos(a + w) * 1600, cy + Math.sin(a + w) * 1600);
  }
  ctx.fill(); ctx.restore();
}
function burst(t, t0, cx, cy, n, cols, power = 1, seed = 1) {
  const age = t - t0; if (age < 0 || age > 2.2) return;
  ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const a = hash(i * 7 + seed) * Math.PI * 2, sp = (500 + hash(i * 7 + seed + 1) * 2200) * power;
    const life = 0.9 + hash(i * 7 + seed + 2) * 1.3; if (age > life) continue;
    const d = sp * (1 - Math.exp(-age * 2.6)) / 2.6, d0 = sp * (1 - Math.exp(-Math.max(0, age - 0.05) * 2.6)) / 2.6;
    const al = Math.pow(1 - age / life, 1.6);
    const c = cols[i % cols.length];
    ctx.globalAlpha = al; ctx.strokeStyle = c; ctx.lineWidth = 1 + hash(i + seed) * 3;
    ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * d0, cy + Math.sin(a) * d0); ctx.lineTo(cx + Math.cos(a) * d, cy + Math.sin(a) * d); ctx.stroke();
    if (i % 3 === 0) spr(glow(c), cx + Math.cos(a) * d, cy + Math.sin(a) * d, 18 + 20 * hash(i), al * 0.8);
  }
}

// ================================================================ SCENE 1 — hook (0–4s)
function sceneHook(t) {
  const out = easeInExpo(ss(3.45, 4.0, t));
  ctx.save();
  const z = 1 + out * 2.6 + 0.04 * Math.sin(t * 2);
  ctx.translate(W / 2, H / 2); ctx.scale(z, z); ctx.translate(-W / 2, -H / 2);
  liquid(t + 3, ['#ff2e88', '#7b2ff7', '#ff7a18', '#1f6bff', '#ff006e'], '#14001f', 0.55);
  rays(t, W / 2, H / 2, [255, 210, 240], 0.05 + 0.22 * impact(t, 4), 26, 0.12);
  burst(t, 0.0, W / 2, H / 2, 420, ['#ffffff', '#ffd166', '#ff2e88', '#00e5ff'], 1.0, 3);
  burst(t, 2.0, W / 2, H / 2 + 40, 320, ['#ffffff', '#ffd166', '#ff7a18'], 0.8, 91);

  ctx.globalCompositeOperation = 'source-over';
  const u = clamp(t / 1.95);
  const val = Math.round(35000 * (1 - Math.pow(1 - u, 2.4)));
  const lock = t >= 2.0 ? Math.exp(-(t - 2.0) * 7) : 0;
  rise('据说，人每天要做', W / 2, H / 2 - 220, t, 0.05, 4.2, { size: 58, weight: 700, spacing: 10, shadow: 'rgba(0,0,0,0.35)' });
  txt(fmt(val), W / 2, H / 2 - 10, {
    family: 'Mont', weight: 900, size: 300, spacing: 4,
    scale: (t < 0.25 ? lerp(1.6, 1, easeOutBack(t / 0.25)) : 1) * (1 + 0.18 * lock),
    chroma: 4 + (1 - u) * 22 + lock * 30, shadow: 'rgba(255,60,160,0.8)', shadowBlur: 60,
    fill: c => { const g = c.createLinearGradient(0, -150, 0, 150); g.addColorStop(0, '#ffffff'); g.addColorStop(0.6, '#fff1c9'); g.addColorStop(1, '#ffc46b'); return g; },
  });
  slam('个选择', W / 2, H / 2 + 210, t, 2.0, { size: 120, weight: 900, spacing: 26, shadow: 'rgba(255,40,140,0.9)', shadowBlur: 40, from: 2.6 });
  ctx.restore();
  if (out > 0) { ctx.globalAlpha = out; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
}

// ================================================================ SCENE 2 — a day of small choices (4–10s)
const PAIRS = [
  { t0: 4.0, d: 0.5, time: '07:00', a: '早起', b: '再睡五分钟', ca: '#ffb703', cb: '#5a4fcf', ta: '#2a1300', pick: 1 },
  { t0: 4.5, d: 0.5, time: '07:40', a: '咖啡', b: '茶', ca: '#ff6b35', cb: '#12b886', pick: 0 },
  { t0: 5.0, d: 0.5, time: '08:15', a: '地铁', b: '打车', ca: '#ff2e88', cb: '#00a6ff', pick: 0 },
  { t0: 5.5, d: 0.5, time: '12:30', a: '米饭', b: '面条', ca: '#ffd23f', cb: '#ee4266', ta: '#2a1a00', pick: 1 },
  { t0: 6.0, d: 0.5, time: '18:00', a: '说出口', b: '算了', ca: '#9b5de5', cb: '#f15bb5', pick: 1 },
  { t0: 6.5, d: 0.5, time: '21:00', a: '向前', b: '回头', ca: '#00c2a8', cb: '#ff8c42', pick: 0 },
  { t0: 7.0, d: 1.0, time: '23:30', a: '坚持', b: '放弃', ca: '#ff006e', cb: '#3a0ca3', pick: 0 },
  { t0: 8.0, d: 2.0, time: '23:59', a: '留下', b: '离开', ca: '#3a86ff', cb: '#ff006e', pick: -1 },
];
const TILT = Math.tan(0.16);
function sceneMontage(t) {
  const P = PAIRS.find(p => t >= p.t0 && t < p.t0 + p.d) || PAIRS[PAIRS.length - 1];
  const age = t - P.t0;
  const sel = P.t0 + Math.min(0.2, P.d * 0.4);
  let div = W / 2;
  let win = 0;
  if (P.pick >= 0) { win = easeOutExpo((t - sel) / 0.28) * (t > sel ? 1 : 0); div += (P.pick === 0 ? 1 : -1) * W * 0.23 * win; }
  else { div += Math.sin((t - 8.0) * 5.2) * W * 0.13 * ss(8.15, 8.7, t) * (1 + 0.6 * ss(9.0, 9.6, t)); }
  const punch = 1 + 0.07 * Math.exp(-age * 9) + (P.pick < 0 ? 0.05 * ss(8, 10, t) : 0);
  ctx.save();
  ctx.translate(W / 2, H / 2); ctx.scale(punch, punch); ctx.translate(-W / 2, -H / 2);

  const halves = [[P.ca, -300, 0], [P.cb, 1, W + 300]];
  halves.forEach(([col, ,], i) => {
    ctx.save();
    ctx.beginPath();
    const xt = div + (H / 2 + 100) * TILT, xb = div - (H / 2 + 100) * TILT;
    if (i === 0) { ctx.moveTo(-300, -100); ctx.lineTo(xt, -100); ctx.lineTo(xb, H + 100); ctx.lineTo(-300, H + 100); }
    else { ctx.moveTo(xt, -100); ctx.lineTo(W + 300, -100); ctx.lineTo(W + 300, H + 100); ctx.lineTo(xb, H + 100); }
    ctx.closePath(); ctx.clip();
    const c = hex(col);
    const g = ctx.createLinearGradient(0, 0, W * 0.3, H);
    g.addColorStop(0, rgba(mixc(c, [255, 255, 255], 0.22))); g.addColorStop(1, rgba(mixc(c, [0, 0, 0], 0.28)));
    ctx.globalAlpha = 1; ctx.fillStyle = g; ctx.fillRect(-300, -100, W + 600, H + 200);
    ctx.globalCompositeOperation = 'lighter';
    spr(blob('#ffffff'), i === 0 ? div * 0.45 : div + (W - div) * 0.55, H * 0.35, 1300, 0.18);
    ctx.globalCompositeOperation = 'source-over';
    // giant ghost word as texture
    const word = i === 0 ? P.a : P.b;
    txt(word, i === 0 ? div / 2 : (div + W) / 2, H / 2 + 20, { size: Math.min(640, 1500 / word.length), alpha: 0.12, fill: null, stroke: 'rgba(255,255,255,0.9)', lineWidth: 2, scale: 1 + age * 0.05 });
    ctx.restore();
  });
  // loser darkening
  if (P.pick >= 0 && win > 0) {
    ctx.save(); ctx.globalAlpha = 0.35 * win; ctx.fillStyle = '#000'; ctx.beginPath();
    const xt = div + (H / 2 + 100) * TILT, xb = div - (H / 2 + 100) * TILT;
    if (P.pick === 1) { ctx.moveTo(-300, -100); ctx.lineTo(xt, -100); ctx.lineTo(xb, H + 100); ctx.lineTo(-300, H + 100); }
    else { ctx.moveTo(xt, -100); ctx.lineTo(W + 300, -100); ctx.lineTo(W + 300, H + 100); ctx.lineTo(xb, H + 100); }
    ctx.fill(); ctx.restore();
  }
  // divider
  ctx.save(); ctx.globalCompositeOperation = 'source-over';
  ctx.shadowColor = 'rgba(255,255,255,0.9)'; ctx.shadowBlur = 30; ctx.strokeStyle = '#fff'; ctx.lineWidth = 7;
  ctx.beginPath(); ctx.moveTo(div + (H / 2 + 100) * TILT, -100); ctx.lineTo(div - (H / 2 + 100) * TILT, H + 100); ctx.stroke(); ctx.restore();
  // words
  const entry = easeOutBack(age / 0.22);
  [[P.a, P.ta, 0], [P.b, P.tb, 1]].forEach(([w, tc, i]) => {
    const isWin = P.pick === i, isLose = P.pick >= 0 && !isWin;
    const cx = i === 0 ? div / 2 : (div + W) / 2;
    const size = Math.min(170, 640 / w.length);
    const sc = lerp(0.6, 1, entry) * (isWin ? 1 + 0.22 * win : isLose ? 1 - 0.12 * win : 1);
    const al = isLose ? 1 - 0.55 * win : 1;
    txt(w, cx, H / 2 + (i === 0 ? -1 : 1) * (1 - entry) * 60, { size, weight: 900, spacing: 6, scale: sc, alpha: al, fill: tc || '#ffffff', shadow: 'rgba(0,0,0,0.25)', shadowBlur: 24, chroma: isWin ? 6 * Math.exp(-(t - sel) * 6) : 0 });
    if (isWin && t > sel) {
      const k = easeOutExpo((t - sel) / 0.3);
      ctx.save(); ctx.globalAlpha = 1; ctx.fillStyle = tc || '#fff';
      const bw = size * w.length * 0.9 * k * sc;
      ctx.fillRect(cx - bw / 2, H / 2 + size * 0.75 * sc, bw, 10); ctx.restore();
      ctx.save(); ctx.globalAlpha = Math.max(0, 1 - (t - sel) / 0.35); ctx.strokeStyle = '#fff'; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.arc(cx, H / 2, size * (1 + (t - sel) * 6), 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    }
  });
  // OR badge
  const bs = P.pick >= 0 ? 1 - win : 1;
  if (bs > 0.02) {
    ctx.save(); ctx.translate(div, H / 2); ctx.scale(bs * entry, bs * entry);
    ctx.fillStyle = '#fff'; ctx.shadowColor = 'rgba(0,0,0,0.3)'; ctx.shadowBlur = 30;
    ctx.beginPath(); ctx.arc(0, 0, 62, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    txt('OR', div, H / 2 + 2, { family: 'Mont', weight: 900, size: 44, scale: bs * entry, fill: '#16082b', spacing: 2 });
  }
  ctx.restore();
  // HUD: clock
  txt('今天', 112, 92, { size: 26, weight: 500, align: 'left', alpha: 0.85, spacing: 6 });
  txt(P.time, 108, 138, { family: 'Mont', size: 54, weight: 900, align: 'left', spacing: 2, shadow: 'rgba(0,0,0,0.3)', shadowBlur: 20 });
  const n = PAIRS.indexOf(P) + 1;
  txt(`第 ${fmt(n * 4375)} 个选择`, W - 110, 110, { size: 30, weight: 700, align: 'right', alpha: 0.9, spacing: 4, shadow: 'rgba(0,0,0,0.3)', shadowBlur: 16 });
  if (P.pick < 0) txt('？', W / 2, H / 2 - 220, { size: 120, weight: 900, alpha: ss(8.6, 9.0, t), scale: 1 + 0.1 * Math.sin(t * 9), shadow: 'rgba(0,0,0,0.3)' });
}

// ================================================================ SCENE 3 — breakdown text (10–14s)
const STARS2D = []; { const r = rng(5); for (let i = 0; i < 260; i++) STARS2D.push([r() * W, r() * H, r(), r() * 6]); }
function sceneBreak(t) {
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  ctx.fillStyle = '#05010d'; ctx.fillRect(-200, -200, W + 400, H + 400);
  ctx.globalCompositeOperation = 'lighter';
  spr(blob('#5a1aa8'), W / 2, H / 2, 1700, 0.35 + 0.1 * Math.sin(t * 3), 1.4, 0.8);
  for (const [x, y, d, ph] of STARS2D) spr(glow('#cdb8ff'), x + (t - 10) * 20 * d, y, 3 + d * 5, (0.3 + 0.5 * Math.sin(t * 2 + ph)) * 0.6);
}
function breakText(t) {
  rise('但有些选择', W / 2, H / 2 - 10, t, 10.15, 11.95, { family: 'Serif', weight: 600, size: 92, spacing: 22, shadow: 'rgba(170,120,255,0.8)', shadowBlur: 40 });
  slam('会改变一切', W / 2, H / 2 - 10, t, 12.0, {
    t1: 14.3, family: 'Serif', weight: 900, size: 150, spacing: 30, shadow: 'rgba(255,150,60,0.95)', shadowBlur: 50, from: 1.7,
    fill: c => { const g = c.createLinearGradient(0, -80, 0, 80); g.addColorStop(0, '#fffaf0'); g.addColorStop(1, '#ffb347'); return g; },
  });
}

// ================================================================ SCENE 4 — the flight (12.3–36s)
const PAL = {
  dusk: { top: '#090222', mid: '#3a0f6b', hor: '#c2459a', ground: '#07021a', grid: '#c64bff', sun: ['#ffe08a', '#ff3d8b'], m: ['#5a1e7a', '#38105a', '#1d0638'] },
  warm: { top: '#1a0430', mid: '#9a1d6e', hor: '#ff8a3d', ground: '#150320', grid: '#ff3d8b', sun: ['#fff4b0', '#ff4d6d'], m: ['#b23a6a', '#6e1650', '#33082f'] },
  cool: { top: '#010622', mid: '#0b2c8a', hor: '#22d8ff', ground: '#020a22', grid: '#2fc6ff', sun: ['#e8fdff', '#3a8bff'], m: ['#2a64a8', '#123a73', '#06163d'] },
  rose: { top: '#160226', mid: '#6a1390', hor: '#ff63b0', ground: '#100219', grid: '#ff6ad5', sun: ['#ffe9f5', '#ff2e88'], m: ['#a03a9a', '#5a1270', '#2a0640'] },
  gold: { top: '#1c0712', mid: '#8a2a1a', hor: '#ffc24d', ground: '#150806', grid: '#ffae1f', sun: ['#fffbe0', '#ff8a1f'], m: ['#b8533a', '#6b2420', '#2e0c12'] },
  aqua: { top: '#050520', mid: '#1b2a8a', hor: '#2ee6ff', ground: '#03081c', grid: '#7a5cff', sun: ['#f2fbff', '#29b6ff'], m: ['#3a4fb0', '#1c2670', '#0a0f38'] },
};
for (const k in PAL) { const p = PAL[k]; for (const q of ['top', 'mid', 'hor', 'ground', 'grid']) p[q] = hex(p[q]); p.sun = p.sun.map(hex); p.m = p.m.map(hex); }
function mixPal(a, b, k) {
  if (k <= 0) return a; if (k >= 1) return b;
  const o = {};
  for (const q of ['top', 'mid', 'hor', 'ground', 'grid']) o[q] = mixc(a[q], b[q], k);
  o.sun = a.sun.map((c, i) => mixc(c, b.sun[i], k)); o.m = a.m.map((c, i) => mixc(c, b.m[i], k));
  return o;
}
const SECTION = ['warm', 'rose', 'gold', 'aqua', 'rose', 'warm', 'gold'];
function palAt(t, az) {
  if (t < FORK_T[0]) {
    const w = 1 / (1 + Math.exp(az * 7));
    return mixPal(PAL.dusk, mixPal(PAL.cool, PAL.warm, w), ss(13.8, 15.8, t));
  }
  const w = 1 / (1 + Math.exp(az * 7));
  let p = mixPal(mixPal(PAL.cool, PAL.warm, w), PAL.warm, ss(FORK_T[0], FORK_T[0] + 0.5, t));
  for (let k = 1; k < FORK_T.length; k++) p = mixPal(p, PAL[SECTION[k]], ss(FORK_T[k], FORK_T[k] + 0.9, t));
  return p;
}

// ---------- camera arc length S(t)
function vel(t) {
  if (t < 12.3) return 0;
  if (t < 14) return 30 * ss(12.3, 14, t);
  if (t < 19.3) return 30;
  if (t < 19.9) return lerp(30, 4, ss(19.3, 19.9, t));
  if (t < 20.25) return lerp(4, 80, ss(19.9, 20.25, t));
  if (t < 21.5) return lerp(80, 54, ss(20.25, 21.5, t));
  if (t < 27.6) return 54;
  if (t < 31) return lerp(54, 14, ss(27.6, 31, t));
  return 14;
}
const SDT = 1 / 600, STAB = [0];
for (let t = 0; t < DURATION + 1; t += SDT) STAB.push(STAB[STAB.length - 1] + vel(t) * SDT);
const S = t => { const i = clamp(t / SDT, 0, STAB.length - 2), i0 = Math.floor(i); return lerp(STAB[i0], STAB[i0 + 1], i - i0); };

// ---------- road network on the ground (x,z)
const R = rng(4512);
const dir = h => [Math.sin(h), Math.cos(h)];
function bez(p0, h0, L, h1) {
  const hm = (h0 + h1) / 2, dm = dir(hm), d0 = dir(h0), d1 = dir(h1);
  const p1 = [p0[0] + dm[0] * L, p0[1] + dm[1] * L];
  const c0 = [p0[0] + d0[0] * L * 0.38, p0[1] + d0[1] * L * 0.38], c1 = [p1[0] - d1[0] * L * 0.38, p1[1] - d1[1] * L * 0.38];
  const n = Math.max(8, Math.ceil(L / 1.6)), pts = [], cum = [0];
  for (let i = 0; i <= n; i++) {
    const u = i / n, v = 1 - u, a = v * v * v, b = 3 * v * v * u, c = 3 * v * u * u, d = u * u * u;
    pts.push([a * p0[0] + b * c0[0] + c * c1[0] + d * p1[0], a * p0[1] + b * c0[1] + c * c1[1] + d * p1[1]]);
    if (i) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  }
  return { p0, p1, h0, h1, L, pts, cum, len: cum[n] };
}
const HUES = ['#22e6ff', '#ff3df2', '#8dff5a', '#a875ff', '#ffb020', '#ff4d6d', '#3dffd1'];
const LABELS = ['另一座城市', '另一份梦想', '另一段相遇', '另一个你'];
const CHOSEN = [];      // polyline points
const GHOSTS = [];      // {pts, hue, depth, phase}
const FORKS = [];
(function build() {
  const add = seg => { const s0 = CHOSEN.length ? 1 : 0; for (let i = s0; i < seg.pts.length; i++) CHOSEN.push(seg.pts[i]); };
  let p = [0, 0], h = 0;
  let trunk = bez(p, 0, S(FORK_T[0]), 0); add(trunk); p = trunk.p1;
  const signs = [-1, 1, -1, 1, -1, 1, -1];
  for (let k = 0; k < FORK_T.length; k++) {
    const sg = signs[k];
    const target = k + 1 < FORK_T.length ? S(FORK_T[k + 1]) - S(FORK_T[k]) : 400;
    const h0 = h + sg * 0.42, h1 = clamp(h + sg * 0.16, -0.45, 0.45);
    let L = target, seg;
    for (let it = 0; it < 4; it++) { seg = bez(p, h0, L, h1); L *= target / seg.len; }
    seg = bez(p, h0, L, h1);
    // the road not taken, and everything it could have become
    const hue = HUES[k % HUES.length];
    const g0 = h - sg * 0.5;
    const first = bez(p, g0, k === 0 ? 170 : 150, g0 - sg * 0.25);
    GHOSTS.push({ pts: first.pts, hue, depth: 1, phase: R(), k, label: LABELS[k] });
    (function grow(par, ph, L, depth) {
      if (depth > 5) return;
      for (const s2 of [-1, 1]) {
        if (depth >= 3 && R() < 0.2) continue;
        const hh = clamp(ph + s2 * (0.32 + R() * 0.4), -1.5, 1.5);
        const b = bez(par, hh, L * (0.72 + R() * 0.14), hh + s2 * R() * 0.25);
        GHOSTS.push({ pts: b.pts, hue, depth, phase: R(), k });
        grow(b.p1, b.h1, L * 0.78, depth + 1);
      }
    })(first.p1, first.h1, 120, 2);
    FORKS.push({ p: p.slice(), t: FORK_T[k], sign: sg });
    add(seg); p = seg.p1; h = seg.h1;
  }
})();
const CCUM = [0]; for (let i = 1; i < CHOSEN.length; i++) CCUM.push(CCUM[i - 1] + Math.hypot(CHOSEN[i][0] - CHOSEN[i - 1][0], CHOSEN[i][1] - CHOSEN[i - 1][1]));
function pathAt(s) {
  s = clamp(s, 0, CCUM[CCUM.length - 1]);
  let lo = 0, hi = CCUM.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (CCUM[m] < s) lo = m; else hi = m; }
  const k = (s - CCUM[lo]) / Math.max(1e-6, CCUM[hi] - CCUM[lo]);
  return [lerp(CHOSEN[lo][0], CHOSEN[hi][0], k), lerp(CHOSEN[lo][1], CHOSEN[hi][1], k), lo];
}
const NET = (() => {
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  const sMax = S(34);
  for (let i = 0; i < CHOSEN.length; i++) if (CCUM[i] <= sMax + 60) { const q = CHOSEN[i]; x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); z0 = Math.min(z0, q[1]); z1 = Math.max(z1, q[1]); }
  for (const g of GHOSTS) for (const q of g.pts) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); z0 = Math.min(z0, q[1]); z1 = Math.max(z1, q[1]); }
  z0 = Math.max(z0, S(FORK_T[0]) - 140);
  return { x0, x1, z0, z1, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2 };
})();

// ---------- camera
let CAM = null;
function setCam(c) {
  const sy = Math.sin(c.yaw), cy = Math.cos(c.yaw), sp = Math.sin(c.pitch), cp = Math.cos(c.pitch);
  c.fw = [sy * cp, -sp, cy * cp]; c.rt = [cy, 0, -sy]; c.up = [sy * sp, cp, cy * sp];
  c.fog = 230 + 1.6 * c.y;
  CAM = c; return c;
}
function groundCam(t) {
  const s = S(t), v = vel(t);
  const p = pathAt(s);
  let la = clamp(v * 0.55, 2.5, 34), la2 = la * 2.2;
  if (t < FORK_T[0]) { const room = Math.max(0.5, S(FORK_T[0]) - s - 0.5); la = Math.min(la, room); la2 = Math.min(la2, room + 0.2); }
  const a = pathAt(s + la), b = pathAt(s + Math.max(la2, la + 0.2));
  const yaw = Math.atan2(a[0] - p[0], a[1] - p[1]);
  const yaw2 = Math.atan2(b[0] - a[0], b[1] - a[1]);
  const roll = clamp(-(yaw2 - yaw) * 0.9, -0.2, 0.2);
  return { x: p[0], y: 4.3 + 0.3 * Math.sin(t * 1.4), z: p[1], yaw, pitch: 0.07 + 0.02 * Math.sin(t * 0.9), roll };
}
const OVER = (() => {
  const pitch = 1.43, hO = Math.max((NET.x1 - NET.x0) * F / W, (NET.z1 - NET.z0) * F / H) * 1.02;
  return { x: NET.cx, y: hO, z: NET.cz - hO / Math.tan(pitch), yaw: 0, pitch, roll: 0 };
})();
function camAt(t) {
  const tt = Math.min(t, 34);
  const g = groundCam(Math.min(tt, 31.5));
  const k = easeIO(ss(27.6, 31.6, tt));
  if (k <= 0) return setCam(g);
  const drift = ss(31, 34, tt);
  let yawG = g.yaw; while (yawG > Math.PI) yawG -= 2 * Math.PI;
  return setCam({
    x: lerp(g.x, OVER.x, k), z: lerp(g.z, OVER.z + drift * 18, k),
    y: Math.exp(lerp(Math.log(g.y), Math.log(OVER.y * (1 - 0.06 * drift)), k)),
    yaw: lerp(yawG, 0.05 * drift, k), pitch: lerp(g.pitch, OVER.pitch, easeIO(ss(27.9, 31.4, tt))), roll: lerp(g.roll, 0, k),
  });
}
const NEAR = 0.8;
function toCam(x, y, z) {
  const dx = x - CAM.x, dy = y - CAM.y, dz = z - CAM.z;
  return [dx * CAM.rt[0] + dz * CAM.rt[2], dx * CAM.up[0] + dy * CAM.up[1] + dz * CAM.up[2], dx * CAM.fw[0] + dy * CAM.fw[1] + dz * CAM.fw[2]];
}
const scr = c => [W / 2 + F * c[0] / c[2], H / 2 - F * c[1] / c[2]];

// stroke a ground polyline (array of [x,z]) with perspective width and fog
function road(pts, y, width, col, alpha, passes, i0 = 0, i1 = pts.length, maxPx = 26, fogPow = 1) {
  const chunk = [];
  let depth = 0, prev = null;
  const flush = () => {
    if (chunk.length >= 2) {
      const d = depth / chunk.length;
      const fog = Math.exp(-d * fogPow / CAM.fog);
      const a = alpha * fog;
      if (a > 0.004) {
        const px = Math.min(maxPx, Math.max(0.8, width * F / d));
        ctx.beginPath(); ctx.moveTo(chunk[0][0], chunk[0][1]);
        for (let i = 1; i < chunk.length; i++) ctx.lineTo(chunk[i][0], chunk[i][1]);
        for (const [mw, ma] of passes) { ctx.lineWidth = Math.min(px * mw, maxPx * 2.2); ctx.strokeStyle = rgba(col, a * ma); ctx.stroke(); }
      }
    }
    const last = chunk[chunk.length - 1]; chunk.length = 0; depth = 0;
    return last;
  };
  for (let i = i0; i < i1; i++) {
    const c = toCam(pts[i][0], y, pts[i][1]);
    if (c[2] < NEAR) {
      if (prev && prev[2] >= NEAR) { const k = (prev[2] - NEAR) / (prev[2] - c[2]); const q = [lerp(prev[0], c[0], k), lerp(prev[1], c[1], k), NEAR]; chunk.push(scr(q)); depth += NEAR; }
      flush(); prev = c; continue;
    }
    if (prev && prev[2] < NEAR) { const k = (NEAR - prev[2]) / (c[2] - prev[2]); const q = [lerp(prev[0], c[0], k), lerp(prev[1], c[1], k), NEAR]; chunk.push(scr(q)); depth += NEAR; }
    if (c[2] > CAM.fog * 5) { flush(); prev = c; continue; }
    chunk.push(scr(c)); depth += c[2];
    if (chunk.length >= 7) { const last = flush(); chunk.push(last); depth += c[2]; }
    prev = c;
  }
  flush();
}

const SKYSTARS = []; { const r = rng(9); for (let i = 0; i < 380; i++) SKYSTARS.push([r() * 6.283 - 3.14, 0.02 + Math.pow(r(), 1.5) * 0.7, r(), r() * 6]); }
function ridge(a, L) {
  const s = Math.sin, p = L * 1.7;
  const v = 0.55 * Math.abs(s(a * (2.1 + L) + p)) + 0.3 * Math.abs(s(a * (5.3 + L * 2) + p * 2)) + 0.15 * Math.abs(s(a * (13 + L * 3) + p * 3));
  return v;
}

function sceneFlight(t, fade) {
  const c = camAt(t);
  const hy = H / 2 - F * Math.tan(c.pitch);
  const pulse = beatPulse(t, 20, 28) + 0.6 * beatPulse(t, 36, 40);
  ctx.save();
  ctx.translate(W / 2, H / 2); ctx.rotate(c.roll); ctx.translate(-W / 2, -H / 2);
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  // ---- sky and ground, in azimuth strips
  const STRIP = 16;
  for (let x = -480; x < W + 480; x += STRIP) {
    const az = c.yaw + Math.atan((x + STRIP / 2 - W / 2) / F);
    const p = palAt(t, az);
    if (hy > -100) {
      const g = ctx.createLinearGradient(0, hy - H * 0.95, 0, hy);
      g.addColorStop(0, rgba(p.top)); g.addColorStop(0.55, rgba(p.mid)); g.addColorStop(1, rgba(p.hor));
      ctx.fillStyle = g; ctx.fillRect(x, -600, STRIP + 1, hy + 601);
    }
    const g2 = ctx.createLinearGradient(0, hy, 0, hy + H * 0.9);
    g2.addColorStop(0, rgba(mixc(p.hor, p.ground, 0.25))); g2.addColorStop(0.12, rgba(mixc(p.hor, p.ground, 0.75))); g2.addColorStop(1, rgba(p.ground));
    ctx.fillStyle = g2; ctx.fillRect(x, Math.max(-600, hy), STRIP + 1, H + 700 - Math.max(-600, hy));
  }
  const P0 = palAt(t, c.yaw);
  ctx.globalCompositeOperation = 'lighter';
  if (hy > -200) {
    // stars
    for (const [a, e, d, ph] of SKYSTARS) {
      const da = a - c.yaw; if (Math.abs(da) > 1.2) continue;
      const x = W / 2 + F * Math.tan(da), y = hy - F * Math.tan(e);
      spr(glow('#ffffff'), x, y, 3 + d * 6, (0.35 + 0.4 * Math.sin(t * 2 + ph)) * (0.4 + e));
    }
    // aurora on the cool side (before the first choice)
    const aur = (1 - ss(FORK_T[0], FORK_T[0] + 0.8, t)) * ss(14, 16, t);
    if (aur > 0.01) {
      for (let r = 0; r < 3; r++) {
        for (let x = -100; x < W + 100; x += 14) {
          const az = c.yaw + Math.atan((x - W / 2) / F);
          const inten = ss(0.08, 0.4, az) * (1 - ss(1.1, 1.5, az)) * aur;
          if (inten < 0.02) continue;
          const yb = hy - F * (0.16 + 0.05 * Math.sin(az * 4 + t * 0.7 + r * 2) + r * 0.05);
          const ht = F * (0.10 + 0.05 * Math.sin(az * 7 - t * 0.9 + r));
          const g = ctx.createLinearGradient(0, yb, 0, yb - ht);
          g.addColorStop(0, rgba([60, 255, 200], 0.0)); g.addColorStop(0.15, rgba([60, 255, 200], 0.5 * inten)); g.addColorStop(1, rgba([140, 90, 255], 0));
          ctx.fillStyle = g; ctx.globalAlpha = 1; ctx.fillRect(x, yb - ht, 15, ht);
        }
      }
    }
    // sun
    const sa = -0.3 - c.yaw, se = 0.085;
    if (Math.abs(sa) < 1.2) {
      const sx = W / 2 + F * Math.tan(sa), sy = hy - F * Math.tan(se), sr = F * 0.17;
      softGlow(sx, sy, sr * 3.2, P0.sun[1], 0.28 + 0.15 * pulse, 1.6, 0.9);
      ctx.globalCompositeOperation = 'source-over';
      ctx.save(); ctx.beginPath(); ctx.arc(sx, sy, sr, 0, Math.PI * 2); ctx.clip();
      const g = ctx.createLinearGradient(0, sy - sr, 0, sy + sr);
      g.addColorStop(0, rgba(P0.sun[0])); g.addColorStop(1, rgba(P0.sun[1]));
      ctx.fillStyle = g; ctx.globalAlpha = 1; ctx.fillRect(sx - sr, sy - sr, sr * 2, sr * 2);
      ctx.fillStyle = rgba(mixc(P0.mid, P0.hor, 0.5));
      for (let i = 0; i < 7; i++) { const yy = sy + sr * (0.05 + i * 0.14), hh = sr * (0.015 + i * 0.012) * (1 + 0.3 * Math.sin(t * 2 + i)); ctx.fillRect(sx - sr, yy, sr * 2, hh); }
      ctx.restore();
      ctx.globalCompositeOperation = 'lighter';
    }
    // mountains
    ctx.globalCompositeOperation = 'source-over';
    for (let L = 0; L < 3; L++) {
      ctx.beginPath(); ctx.moveTo(-480, hy + 2);
      for (let x = -480; x <= W + 480; x += 12) {
        const az = c.yaw + Math.atan((x - W / 2) / F);
        const hgt = F * (0.018 + 0.03 * (2 - L) * 0.5 + 0.012 * L) * ridge(az * (1 + L * 0.3), L) * (1.6 - L * 0.35);
        ctx.lineTo(x, hy - hgt);
      }
      ctx.lineTo(W + 480, hy + 2); ctx.closePath();
      const mc = palAt(t, c.yaw).m[L];
      ctx.fillStyle = rgba(mixc(mc, P0.hor, 0.18 * (2 - L))); ctx.globalAlpha = 1; ctx.fill();
    }
    ctx.globalCompositeOperation = 'lighter';
    softGlow(W / 2, hy, W * 0.8, P0.hor, 0.18, 1.6, 0.1);
  }

  // ---- grid
  {
    const ctr = c.pitch > 0.5 ? [OVER.x, NET.cz] : [c.x + c.fw[0] * 120, c.z + c.fw[2] * 120];
    const RAD = c.pitch > 0.5 ? 1100 : 520, SP = 18;
    const buckets = Array.from({ length: 10 }, () => []);
    const gx0 = Math.floor((ctr[0] - RAD) / SP) * SP, gz0 = Math.floor((ctr[1] - RAD) / SP) * SP;
    const seg = (x0, z0, x1, z1) => {
      let a = toCam(x0, 0, z0), b = toCam(x1, 0, z1);
      if (a[2] < NEAR && b[2] < NEAR) return;
      if (a[2] < NEAR) { const k = (NEAR - a[2]) / (b[2] - a[2]); a = [lerp(a[0], b[0], k), lerp(a[1], b[1], k), NEAR]; }
      if (b[2] < NEAR) { const k = (NEAR - b[2]) / (a[2] - b[2]); b = [lerp(b[0], a[0], k), lerp(b[1], a[1], k), NEAR]; }
      const d = (a[2] + b[2]) / 2, fog = Math.exp(-d / (CAM.fog * 0.7));
      const lvl = Math.min(9, Math.floor(fog * 10)); if (lvl < 1) return;
      buckets[lvl].push(scr(a), scr(b));
    };
    const N = 12;
    for (let gx = gx0; gx <= ctr[0] + RAD; gx += SP) for (let i = 0; i < N; i++) seg(gx, gz0 + (i / N) * 2 * RAD, gx, gz0 + ((i + 1) / N) * 2 * RAD);
    for (let gz = gz0; gz <= ctr[1] + RAD; gz += SP) for (let i = 0; i < N; i++) seg(gx0 + (i / N) * 2 * RAD, gz, gx0 + ((i + 1) / N) * 2 * RAD, gz);
    ctx.lineWidth = 1.3;
    buckets.forEach((b, lvl) => {
      if (!b.length) return;
      ctx.beginPath(); for (let i = 0; i < b.length; i += 2) { ctx.moveTo(b[i][0], b[i][1]); ctx.lineTo(b[i + 1][0], b[i + 1][1]); }
      ctx.strokeStyle = rgba(P0.grid, (lvl / 10) * (0.22 + 0.35 * pulse) * fade); ctx.globalAlpha = 1; ctx.stroke();
    });
  }

  // ---- roads
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const top = ss(28.5, 31, t);
  const GP = [[6, 0.035], [2.8, 0.13], [1.2, 0.55], [0.5, 1]];
  for (const g of GHOSTS) {
    const col = hex(g.hue);
    const appear = g.depth === 1 ? 1 : lerp(0.75, 1, top);
    road(g.pts, 0.05, 0.9 + 0.5 * top, col, (0.9 + 0.4 * pulse) * appear * fade, GP, 0, g.pts.length, 26, lerp(2.2, 1, top));
  }
  // chosen road: surface + edges + core
  const s = S(Math.min(t, 34));
  const pAt = pathAt(Math.max(0, s - 6))[2];
  const pEnd = top > 0.01 ? pathAt(S(34) + 40)[2] : pathAt(s + CAM.fog * 3)[2];
  const i0 = top > 0.01 ? 0 : pAt;
  const gold = [255, 214, 140];
  // road surface (quads)
  if (top < 0.9) {
    const surfA = (1 - top) * fade;
    for (let i = Math.max(i0, 0); i < pEnd - 1; i++) {
      const a = CHOSEN[i], b = CHOSEN[i + 1];
      const hx = b[0] - a[0], hz = b[1] - a[1], hl = Math.hypot(hx, hz) || 1;
      const nx = hz / hl * 2.4, nz = -hx / hl * 2.4;
      const q = [toCam(a[0] - nx, 0.02, a[1] - nz), toCam(a[0] + nx, 0.02, a[1] + nz), toCam(b[0] + nx, 0.02, b[1] + nz), toCam(b[0] - nx, 0.02, b[1] - nz)];
      if (q.some(v => v[2] < NEAR)) continue;
      const d = q[0][2], fog = Math.exp(-d / CAM.fog);
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 0.55 * fog * surfA;
      ctx.fillStyle = '#12051c';
      ctx.beginPath(); q.forEach((v, j) => { const p = scr(v); j ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); }); ctx.fill();
    }
    ctx.globalCompositeOperation = 'lighter';
    // edges
    for (const sgn of [-1, 1]) {
      const edge = [];
      for (let i = Math.max(i0, 0); i < pEnd; i++) {
        const a = CHOSEN[Math.max(0, i - 1)], b = CHOSEN[Math.min(CHOSEN.length - 1, i + 1)];
        const hx = b[0] - a[0], hz = b[1] - a[1], hl = Math.hypot(hx, hz) || 1;
        edge.push([CHOSEN[i][0] + sgn * hz / hl * 2.4, CHOSEN[i][1] - sgn * hx / hl * 2.4]);
      }
      road(edge, 0.03, 0.22, mixc(P0.grid, [255, 255, 255], 0.35), (1 + pulse) * (1 - top) * fade, [[6, 0.08], [2.2, 0.3], [1, 1]]);
    }
  }
  ctx.globalCompositeOperation = 'lighter';
  road(CHOSEN, 0.05, lerp(0.35, 2.4, top), gold, (1 + 0.6 * pulse) * fade, [[7, 0.06], [3, 0.2], [1.2, 0.7], [0.5, 1]], Math.max(0, i0), pEnd);
  // travelling energy pulses along the chosen road
  if (top < 0.95) {
    for (let k = 0; k < 26; k++) {
      const ps = s + ((k * 13 - t * 60) % 338 + 338) % 338 - 8;
      const q = pathAt(ps), cc = toCam(q[0], 0.3, q[1]);
      if (cc[2] < NEAR + 0.5) continue;
      const p = scr(cc), fog = Math.exp(-cc[2] / CAM.fog);
      spr(glow('#fff1c4'), p[0], p[1], Math.min(150, 7 * F / cc[2]), 0.8 * fog * (1 - top) * fade, 2.2, 0.6);
    }
  }
  // other selves on the untaken roads
  if (top > 0.05) {
    for (let i = 0; i < GHOSTS.length; i++) {
      const g = GHOSTS[i];
      const u = ((t * 0.22 + g.phase) % 1), q = g.pts[Math.floor(u * (g.pts.length - 1))];
      const cc = toCam(q[0], 0.3, q[1]); if (cc[2] < NEAR) continue;
      const p = scr(cc);
      spr(glow(g.hue), p[0], p[1], 10 + 900 / cc[2] * 6, top * fade * 0.9);
    }
    const end = pathAt(S(34)); const cc = toCam(end[0], 0.5, end[1]);
    if (cc[2] > NEAR) { const p = scr(cc); spr(glow('#ffe7b0'), p[0], p[1], 90, top * fade); spr(glow('#ffffff'), p[0], p[1], 26, top * fade); }
  }
  // fork flares
  for (const fk of FORKS) {
    const cc = toCam(fk.p[0], 0.5, fk.p[1]); if (cc[2] < NEAR) continue;
    const p = scr(cc), fog = Math.exp(-cc[2] / CAM.fog);
    const near = t >= fk.t ? Math.exp(-(t - fk.t) * 3) : 0;
    spr(glow('#ffffff'), p[0], p[1], Math.min(140, 12 * F / cc[2] * 0.3 + 24) * (1 + 1.5 * near), (0.35 + 0.6 * near) * fog * fade);
  }

  // ---- speed streaks
  const spd = vel(t), streakA = (1 - top) * ss(12.5, 14, t) * fade;
  if (streakA > 0.01) {
    for (let i = 0; i < 260; i++) {
      const x = (hash(i * 3) - 0.5) * 120, y = hash(i * 3 + 1) * 26 + 0.4 - c.y;
      const zr = ((hash(i * 3 + 2) * 240 - s) % 240 + 240) % 240 + 2;
      const len = Math.max(0.3, spd * 0.045);
      if (zr - len < NEAR) continue;
      const a = scr([x, y, zr]), b = scr([x, y, zr - len]);
      const fogk = Math.exp(-zr / 160);
      const colh = i % 3 === 0 ? '#ffffff' : HUES[i % HUES.length];
      ctx.globalAlpha = streakA * fogk * 0.8; ctx.strokeStyle = colh; ctx.lineWidth = Math.max(1, 3 * 30 / zr);
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    }
  }
  ctx.restore();

  // ---- labels on the roads not taken (screen space, not rolled for legibility)
  ctx.save(); ctx.translate(W / 2, H / 2); ctx.rotate(c.roll); ctx.translate(-W / 2, -H / 2);
  for (const g of GHOSTS) {
    if (!g.label || t < FORK_T[g.k] - 0.15) continue;
    const q = g.pts[Math.floor(g.pts.length * 0.42)];
    const cc = toCam(q[0], 7, q[1]); if (cc[2] < 6) continue;
    const p = scr(cc);
    const a = ss(260, 150, cc[2]) * ss(10, 32, cc[2]) * (1 - top) * fade;
    txt(g.label, p[0], p[1], { size: clamp(10 * F / cc[2], 20, 150), weight: 900, alpha: a, spacing: 6, fill: '#ffffff', shadow: g.hue, shadowBlur: 40 });
  }
  ctx.restore();
}

function flightText(t) {
  slam('向左？', W * 0.27, H * 0.2, t, 15.5, { t1: 17.4, size: 130, spacing: 10, shadow: 'rgba(120,20,0,0.9)', shadowBlur: 40 });
  slam('向右？', W * 0.73, H * 0.2, t, 16.5, { t1: 17.4, size: 130, spacing: 10, shadow: 'rgba(0,40,120,0.9)', shadowBlur: 40 });
  if (t >= 17.5 && t < 19.5) {
    const chars = [...'你会怎么选？'];
    chars.forEach((chr, i) => {
      const t0 = 17.5 + i * 0.125;
      slam(chr, W / 2 + (i - (chars.length - 1) / 2) * 150, H * 0.2, t, t0, { t1: 19.45, size: 140, from: 2.4, chroma: 14, shadow: 'rgba(0,0,0,0.55)', shadowBlur: 40 });
    });
  }
  slam('每一条没走的路', W / 2, H * 0.80, t, 30.5, { t1: 32.15, size: 80, weight: 800, spacing: 16, shadow: 'rgba(0,0,0,0.7)', shadowBlur: 30, from: 1.5, chroma: 8 });
  slam('都藏着另一个你', W / 2, H * 0.80, t, 32.2, {
    t1: 34.2, size: 104, weight: 900, spacing: 20, shadow: 'rgba(255,120,200,0.95)', shadowBlur: 50, from: 1.9,
    fill: c => { const g = c.createLinearGradient(0, -50, 0, 50); g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#ffd27a'); return g; },
  });
}

// ================================================================ SCENE 5 — convergence (34–36s)
let SWARM = null;
function buildSwarm() {
  camAt(34);
  const pts = [];
  const take = (arr, col, step) => { for (let i = 0; i < arr.length; i += step) { const cc = toCam(arr[i][0], 0.1, arr[i][1]); if (cc[2] > NEAR) { const p = scr(cc); if (p[0] > -50 && p[0] < W + 50 && p[1] > -50 && p[1] < H + 50) pts.push([p[0], p[1], col]); } } };
  for (const g of GHOSTS) take(g.pts, g.hue, 2);
  take(CHOSEN.slice(0, pathAt(S(34))[2]), '#ffe3a0', 1);
  SWARM = pts.map((p, i) => {
    const dx = p[0] - W / 2, dy = p[1] - H / 2;
    return { r0: Math.hypot(dx, dy), a0: Math.atan2(dy, dx), col: p[2], start: 34.05 + hash(i * 5) * 0.55 + (1 - Math.hypot(dx, dy) / 1100) * 0.25, dur: 1.05 + hash(i * 5 + 1) * 0.45 };
  });
}
function sceneConverge(t) {
  if (t < 34 || t > 36.05) return;
  ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
  for (let i = 0; i < SWARM.length; i++) {
    const p = SWARM[i];
    const u = clamp((t - p.start) / p.dur), e = easeInExpo(u) * 0.85 + u * 0.15;
    const u2 = clamp((t - 0.05 - p.start) / p.dur), e2 = easeInExpo(u2) * 0.85 + u2 * 0.15;
    const r = p.r0 * (1 - e), a = p.a0 + 1.9 * e;
    const r2 = p.r0 * (1 - e2), a2 = p.a0 + 1.9 * e2;
    const x = W / 2 + Math.cos(a) * r, y = H / 2 + Math.sin(a) * r * 0.8;
    const x2 = W / 2 + Math.cos(a2) * r2, y2 = H / 2 + Math.sin(a2) * r2 * 0.8;
    if (u >= 1) continue;
    ctx.globalAlpha = 0.85; ctx.strokeStyle = p.col; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x2, y2); ctx.lineTo(x, y); ctx.stroke();
    if ((i & 3) === 0) spr(glow(p.col), x, y, 14, 0.7);
  }
  const core = ss(34.6, 36, t);
  spr(blob('#ffffff'), W / 2, H / 2, 200 + 1400 * easeInExpo(core), core * 0.9);
  spr(glow('#ffe7b0'), W / 2, H / 2, 300 * core, core);
}

// ================================================================ SCENE 6 — title (36–45s)
function sceneTitle(t) {
  const age = t - 36;
  liquid(t, ['#ff2e88', '#ff7a18', '#7b2ff7', '#1f6bff', '#ff006e'], '#0f0019', 0.5);
  rays(t, W / 2, H * 0.42, [255, 220, 170], 0.05 + 0.3 * Math.exp(-age * 2) + 0.05 * beatPulse(t, 36, 40), 30, 0.05);
  burst(t, 36.0, W / 2, H * 0.42, 700, ['#ffffff', '#ffd166', '#ff2e88', '#00e5ff', '#ff7a18'], 1.25, 17);
  burst(t, 41.3, W / 2, H * 0.79, 260, ['#ffffff', '#ffd166', '#ff7a18'], 0.6, 55);
  // shockwave
  if (age < 1.4) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.pow(1 - age / 1.4, 2);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 10 * (1 - age / 1.4) + 1;
    ctx.beginPath(); ctx.ellipse(W / 2, H * 0.42, 60 + easeOutExpo(age / 1.2) * 1300, (60 + easeOutExpo(age / 1.2) * 1300) * 0.55, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
  }
  ctx.globalCompositeOperation = 'source-over';
  // title, rendered offscreen so a light sweep can be clipped to the glyphs
  const sc = lerp(1.45, 1, easeOutBack(age / 0.5)) * (1 + 0.012 * Math.sin(t * 2));
  const tx = TXTX;
  tx.setTransform(1, 0, 0, 1, 0, 0); tx.clearRect(0, 0, W, H); tx.globalCompositeOperation = 'source-over'; tx.globalAlpha = 1;
  tx.save(); tx.translate(W / 2, H * 0.42); tx.scale(sc, sc);
  tx.font = '900 330px Serif'; tx.letterSpacing = '50px'; tx.textAlign = 'center'; tx.textBaseline = 'middle';
  const g = tx.createLinearGradient(0, -170, 0, 170);
  g.addColorStop(0, '#ffffff'); g.addColorStop(0.45, '#ffe6a8'); g.addColorStop(0.8, '#ffb347'); g.addColorStop(1, '#ff7a3d');
  tx.fillStyle = g; tx.fillText('选择', 25, 0);
  tx.restore();
  const sw = (t - 37.3) / 1.0;
  if (sw > 0 && sw < 1) {
    tx.globalCompositeOperation = 'source-atop';
    const x = lerp(-400, W + 400, easeIO(sw));
    const lg = tx.createLinearGradient(x - 220, 0, x + 220, 0);
    lg.addColorStop(0, 'rgba(255,255,255,0)'); lg.addColorStop(0.5, 'rgba(255,255,255,0.95)'); lg.addColorStop(1, 'rgba(255,255,255,0)');
    tx.save(); tx.translate(x, H * 0.42); tx.rotate(0.35); tx.translate(-x, -H * 0.42); tx.fillStyle = lg; tx.fillRect(x - 220, -400, 440, H + 800); tx.restore();
    tx.globalCompositeOperation = 'source-over';
  }
  const ch = 34 * Math.exp(-age * 5) + 2;
  const ta = ss(35.98, 36.05, t) * (1 - ss(43.6, 44.8, t));
  ctx.save();
  ctx.globalAlpha = ta * 0.9; ctx.shadowColor = 'rgba(255,90,40,0.9)'; ctx.shadowBlur = 70;
  ctx.drawImage(TXT, 0, 0); ctx.shadowBlur = 0;
  ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = ta * 0.55;
  TMP2X.globalCompositeOperation = 'source-over'; TMP2X.clearRect(0, 0, W, H); TMP2X.drawImage(TXT, 0, 0);
  TMP2X.globalCompositeOperation = 'source-in'; TMP2X.fillStyle = '#ff1f6b'; TMP2X.fillRect(0, 0, W, H);
  ctx.drawImage(TMP2, ch, 0);
  TMP2X.globalCompositeOperation = 'source-over'; TMP2X.clearRect(0, 0, W, H); TMP2X.drawImage(TXT, 0, 0);
  TMP2X.globalCompositeOperation = 'source-in'; TMP2X.fillStyle = '#18d6ff'; TMP2X.fillRect(0, 0, W, H);
  ctx.drawImage(TMP2, -ch, 0);
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = ta; ctx.drawImage(TXT, 0, 0);
  ctx.restore();

  const ca = ss(36.9, 37.6, t) * (1 - ss(43.6, 44.8, t));
  const trk = lerp(70, 36, easeOut((t - 36.9) / 1.2));
  txt('CHOICE', W / 2, H * 0.42 + 230, { family: 'Mont', weight: 800, size: 50, spacing: trk, alpha: ca, shadow: 'rgba(255,120,60,0.9)', shadowBlur: 30 });
  const lw = 300 * easeOutExpo((t - 37.1) / 0.8);
  if (lw > 1) {
    ctx.save(); ctx.globalAlpha = ca; ctx.fillStyle = '#fff';
    ctx.fillRect(W / 2 - 330 - lw, H * 0.42 + 229, lw, 2); ctx.fillRect(W / 2 + 330, H * 0.42 + 229, lw, 2); ctx.restore();
  }
  rise('没有标准答案', W / 2, H * 0.79, t, 39.9, 44.6, { size: 58, weight: 500, spacing: 18, alpha: 0.92, shadow: 'rgba(0,0,0,0.5)', shadowBlur: 24 });
  if (t > 41.3) slam('只有你的答案', W / 2, H * 0.79 + 92, t, 41.3, {
    t1: 44.6, size: 84, weight: 900, spacing: 22, from: 1.8, shadow: 'rgba(255,110,40,0.95)', shadowBlur: 40,
    fill: c => { const g2 = c.createLinearGradient(0, -45, 0, 45); g2.addColorStop(0, '#fff6d8'); g2.addColorStop(1, '#ffb347'); return g2; },
  });
}

// ================================================================ post-processing
function bloom(k) {
  if (k <= 0) return;
  BL1X.globalCompositeOperation = 'source-over'; BL1X.globalAlpha = 1; BL1X.filter = 'none';
  BL1X.drawImage(cv, 0, 0, W / 4, H / 4);
  BL1X.globalCompositeOperation = 'multiply'; BL1X.drawImage(BL1, 0, 0); BL1X.drawImage(BL1, 0, 0);
  BL2X.globalCompositeOperation = 'copy'; BL2X.filter = 'blur(5px)'; BL2X.drawImage(BL1, 0, 0); BL2X.filter = 'none';
  BL3X.globalCompositeOperation = 'copy'; BL3X.filter = 'blur(9px)'; BL3X.drawImage(BL1, 0, 0, W / 8, H / 8); BL3X.filter = 'none';
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = clamp(k);
  ctx.drawImage(BL2, 0, 0, W, H);
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
function glitch(t, k) {
  if (k <= 0.02) return;
  TMPX.globalCompositeOperation = 'copy'; TMPX.drawImage(cv, 0, 0);
  const f = Math.floor(t * 30);
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  let y = 0, i = 0;
  while (y < H) {
    const h = 10 + hash(f * 31 + i) * 120;
    const dx = (hash(f * 17 + i * 3) - 0.5) * 2 * 160 * k * (hash(f + i * 7) > 0.45 ? 1 : 0.1);
    ctx.drawImage(TMP, 0, y, W, h, dx, y, W, h);
    y += h; i++;
  }
  ctx.restore();
  chromaShift(26 * k);
}

// ================================================================ frame
function renderTime(t) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; ctx.filter = 'none'; ctx.shadowBlur = 0; ctx.letterSpacing = '0px';
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  const imp = impact(t);
  const f = Math.round(t * FPS);
  const sh = Math.min(28, imp * 16);
  ctx.setTransform(1, 0, 0, 1, (hash(f * 2) - 0.5) * 2 * sh, (hash(f * 2 + 1) - 0.5) * 2 * sh);

  let bl = 0.6;
  if (t < 4) { sceneHook(t); bl = 0.55; }
  else if (t < 10) { sceneMontage(t); bl = 0.06; }
  else if (t < 36) {
    if (t < 13.8) sceneBreak(t);
    const lineFade = 1 - ss(34.0, 34.7, t);
    if (t >= 12.3 && lineFade > 0) sceneFlightComposite(t, ss(12.3, 13.8, t), lineFade);
    if (t >= 34) {
      ctx.save(); ctx.globalAlpha = ss(34, 35, t) * 0.85; ctx.fillStyle = '#080010'; ctx.fillRect(-100, -100, W + 200, H + 200); ctx.restore();
      sceneConverge(t);
    }
    if (t < 14.4) breakText(t);
    flightText(t);
    bl = t < 28 ? 0.45 : 0.7;
    if (t > 19.45 && t < 20) { // time stands still
      ctx.save(); ctx.globalAlpha = 0.45 * ss(19.45, 19.6, t); ctx.fillStyle = '#000'; ctx.fillRect(-100, -100, W + 200, H + 200); ctx.restore();
    }
  } else { sceneTitle(t); bl = 0.7; }

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  bloom(bl + 0.3 * Math.min(1, imp));
  if (t > 9.2 && t < 9.95) glitch(t, ss(9.2, 9.8, t) * (0.5 + 0.5 * hash(f)));
  chromaShift(Math.min(18, imp * 9));

  // flash, vignette, grain, black fades
  ctx.globalCompositeOperation = 'source-over';
  let flash = 0;
  for (const [ti, k] of IMPACTS) if (ti > 0 && t >= ti && t - ti < 0.6) flash = Math.max(flash, k * Math.exp(-(t - ti) * 12));
  if (flash > 0.01) { ctx.globalAlpha = Math.min(0.85, flash * 0.75); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H); }
  ctx.globalAlpha = t >= 4 && t < 10 ? 0.35 : 1; ctx.drawImage(VIG, 0, 0);
  ctx.globalCompositeOperation = 'overlay'; ctx.globalAlpha = 0.06;
  const gimg = GRAIN[f % 4], ox = -Math.floor(hash(f) * 256), oy = -Math.floor(hash(f + 999) * 256);
  for (let y = oy; y < H; y += 256) for (let x = ox; x < W; x += 256) ctx.drawImage(gimg, x, y);
  ctx.globalCompositeOperation = 'source-over';
  const black = Math.max(ss(44.3, 44.95, t), t > 9.78 && t < 10.12 ? 1 : 0);
  if (black > 0) { ctx.globalAlpha = black; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); }
  ctx.globalAlpha = 1;
}
// draw the flight on its own layer, then composite (fade-in over the breakdown scene)
const FL = mk(W, H), FLX = FL.getContext('2d');
function sceneFlightComposite(t, inA, lineFade) {
  if (inA >= 1) { sceneFlight(t, lineFade); return; }
  const real = ctx;
  FLX.setTransform(1, 0, 0, 1, 0, 0); FLX.globalAlpha = 1; FLX.globalCompositeOperation = 'source-over'; FLX.clearRect(0, 0, W, H);
  ctx = FLX; sceneFlight(t, lineFade); ctx = real;
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = inA; ctx.drawImage(FL, 0, 0); ctx.restore();
}

window.renderFrame = i => renderTime(i / FPS);
window.renderTime = renderTime;
window.META = { W, H, FPS, DURATION, BPM, FORK_T, IMPACTS, forks: FORKS.map(f => ({ t: f.t, sign: f.sign })) };
window.ready = (async () => {
  await Promise.all([
    document.fonts.load('900 100px Sans', '选择'), document.fonts.load('500 100px Sans', '选择'),
    document.fonts.load('900 100px Serif', '选择'), document.fonts.load('600 100px Serif', '选择'),
    document.fonts.load('900 100px Mont', '0123'), document.fonts.load('800 100px Mont', 'CHOICE'),
  ]);
  await document.fonts.ready;
  buildSwarm();
  window.META.swarm = SWARM.length; window.META.ghosts = GHOSTS.length;
  if (!navigator.webdriver) {
    const t0 = performance.now();
    const loop = () => { renderTime(((performance.now() - t0) / 1000) % DURATION); requestAnimationFrame(loop); };
    loop();
  }
  return true;
})();
