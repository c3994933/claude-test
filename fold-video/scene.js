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

// ================================================================ the fold count over time
const T0 = 0.1e-3;                          // one sheet ≈ 0.1 mm
const FOLD_T = []; for (let k = 0; k < 10; k++) FOLD_T.push(3.4 + k * 0.52);   // ten folds you can watch
const KEYS = [[8.6, 10], [9.4, 10], [11.0, 14], [11.7, 14], [12.5, 17], [13.1, 17], [14.0, 20], [14.7, 20], [15.6, 23], [16.7, 23],
  [18.0, 27], [18.9, 27], [20.0, 30], [20.8, 30], [21.6, 32], [22.8, 32], [25.0, 38], [28.4, 42], [29.5, 42], [30.6, 51], [31.4, 51], [32.4, 103]];
function foldN(t) {
  if (t < 3.4) return 0;
  if (t < KEYS[0][0]) { let n = 0; for (const ft of FOLD_T) n += easeIO((t - ft) / 0.36); return n; }
  for (let i = 0; i < KEYS.length - 1; i++) {
    const [a, na] = KEYS[i], [b, nb] = KEYS[i + 1];
    if (t <= b) {
      const u = (t - a) / (b - a);
      return lerp(na, nb, i === KEYS.length - 2 ? easeIn(u) * 0.7 + u * 0.3 : easeIO(u));
    }
  }
  return 103;
}
const thick = n => T0 * Math.pow(2, n);
function fmtLen(m) {
  if (m < 0.01) return `${(m * 1000).toFixed(1)} 毫米`;
  if (m < 1) return `${(m * 100).toFixed(1)} 厘米`;
  if (m < 1000) return `${m.toFixed(m < 10 ? 2 : 0)} 米`;
  const km = m / 1000;
  if (km < 1e8) return `${fmt(km)} 公里`;
  const ly = m / 9.461e15;
  if (ly < 1) return `${(km / 1e8).toFixed(2)} 亿公里`;
  if (ly < 1e8) return `${fmt(ly)} 光年`;
  return `${fmt(ly / 1e8)} 亿光年`;
}

// ================================================================ the world (metres; ground at y = 0)
const RE = 6.371e6, MOON_D = 3.844e8, RM = 1.737e6, SUN_D = 1.496e11, RS = 6.96e8;
let PPM = 1, GYS = H * 0.86;
const sx = x => W / 2 + x * PPM, sy = y => GYS - y * PPM;
function camera(t) {
  const h = thick(foldN(t));
  const want = (H * 0.6) / Math.max(h, 1e-9);
  PPM = 1 / (1 / 2600 + 1 / want);            // soft-min: desk close-up first, then follow the stack
  GYS = H * 0.86;
  return h;
}
const SKYSTARS = []; { const r = rng(61); for (let i = 0; i < 500; i++) SKYSTARS.push([r() * W, r() * H, r(), r() * 6]); }

function sky(t, h) {
  // h = altitude at the top of the frame
  const top = (GYS) / PPM;
  const k1 = ss(Math.log10(2e3), Math.log10(3e4), Math.log10(top)), k2 = ss(Math.log10(3e4), Math.log10(2e5), Math.log10(top));
  const indoor = 1 - ss(0.35, 1.4, top);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  const cTop = mixc(mixc([70, 150, 255], [20, 50, 150], k1), [2, 3, 12], k2), cBot = mixc(mixc([190, 230, 255], [90, 150, 230], k1), [6, 8, 24], k2);
  g.addColorStop(0, rgba(cTop)); g.addColorStop(1, rgba(cBot));
  ctx.globalAlpha = 1; ctx.fillStyle = g; ctx.fillRect(-50, -50, W + 100, H + 100);
  if (k2 > 0.01) {
    ctx.globalCompositeOperation = 'lighter';
    for (const [x, y, d, ph] of SKYSTARS) spr(glow('#ffffff'), x, y, 3 + d * 6, k2 * (0.35 + 0.45 * Math.sin(t * 2 + ph)) * (0.4 + d));
    ctx.globalCompositeOperation = 'source-over';
  }
  if (indoor > 0.01) {   // the desk at the very beginning
    const wg = ctx.createLinearGradient(0, 0, 0, H);
    wg.addColorStop(0, '#2b1a14'); wg.addColorStop(0.75, '#5a3a26'); wg.addColorStop(1, '#7a5034');
    ctx.globalAlpha = indoor; ctx.fillStyle = wg; ctx.fillRect(-50, -50, W + 100, H + 100);
    ctx.globalCompositeOperation = 'lighter'; softGlow(W * 0.78, H * 0.18, 700, [255, 190, 110], 0.45 * indoor); ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }
  return indoor;
}

function ground(t, indoor) {
  const R = RE * PPM;
  if (R > 4e5) {
    ctx.globalAlpha = 1;
    const g = ctx.createLinearGradient(0, GYS, 0, H);
    const alt = ss(3, 4.25, Math.log10(GYS / PPM));
    g.addColorStop(0, rgba(mixc(mixc([70, 150, 70], [60, 150, 230], alt), [120, 80, 50], indoor))); g.addColorStop(1, rgba(mixc(mixc([30, 80, 40], [20, 80, 170], alt), [70, 45, 28], indoor)));
    ctx.fillStyle = g; ctx.fillRect(-50, GYS, W + 100, H - GYS + 50);
    if (indoor > 0.01) { ctx.globalAlpha = indoor; ctx.fillStyle = '#8a5a38'; ctx.fillRect(-50, GYS, W + 100, 14); ctx.globalAlpha = 1; }
    return;
  }
  // the curved Earth
  const cx = sx(0), cy = sy(-RE), r = Math.max(R, 26);
  ctx.globalCompositeOperation = 'lighter'; softGlow(cx, cy, r * 1.12 + 30, [90, 170, 255], 0.6); ctx.globalCompositeOperation = 'source-over';
  const g = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.4, r * 0.1, cx, cy, r);
  g.addColorStop(0, '#5cc0ff'); g.addColorStop(0.6, '#1660c8'); g.addColorStop(1, '#06204a');
  ctx.globalAlpha = 1; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  if (r < 3000) {
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
    ctx.globalAlpha = 0.55; ctx.fillStyle = '#4fae5a';
    for (let i = 0; i < 9; i++) { const a = i * 0.7 + 0.3, d = r * (0.2 + 0.5 * hash(i)); ctx.beginPath(); ctx.ellipse(cx + Math.cos(a) * d, cy + Math.sin(a) * d, r * (0.12 + 0.15 * hash(i + 3)), r * (0.08 + 0.1 * hash(i + 7)), a, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
  }
  if (R < 60) label('地球', cx + r + 30, cy, 34, 1, 'left');
}

function label(s, x, y, size = 34, a = 1, align = 'center', color = '#ffffff') {
  const w = [...s].length * size * 0.85;
  if (align === 'center') x = clamp(x, w / 2 + 30, W - w / 2 - 30);
  else if (align === 'left') x = Math.min(x, W - w - 30);
  else x = Math.max(x, w + 30);
  txt(s, x, y, { size, weight: 800, alpha: a, align, fill: color, shadow: 'rgba(0,0,0,0.7)', shadowBlur: 16, spacing: 2 });
}
const vis = (px, lo = 8, hi = 4000) => ss(lo, lo * 3, px) * (1 - ss(hi, hi * 2.5, px));

function landmarks(t) {
  ctx.globalCompositeOperation = 'source-over';
  // desk props: a pencil and a mug
  { const px = 0.1 * PPM, a = vis(px, 6, 900);
    if (a > 0) {
      ctx.globalAlpha = a; ctx.fillStyle = '#e9e2d6'; ctx.beginPath(); ctx.roundRect(sx(-0.24), sy(0.095), 0.085 * PPM, 0.095 * PPM, 0.01 * PPM); ctx.fill();
      ctx.strokeStyle = '#e9e2d6'; ctx.lineWidth = 0.008 * PPM; ctx.beginPath(); ctx.arc(sx(-0.155), sy(0.05), 0.022 * PPM, -Math.PI / 2, Math.PI / 2); ctx.stroke();
      ctx.save(); ctx.translate(sx(0.16), sy(0.004)); ctx.rotate(-0.05); ctx.fillStyle = '#f2b636'; ctx.fillRect(0, -0.008 * PPM, 0.17 * PPM, 0.008 * PPM); ctx.fillStyle = '#f3d7b0'; ctx.beginPath(); ctx.moveTo(0.17 * PPM, -0.008 * PPM); ctx.lineTo(0.19 * PPM, -0.004 * PPM); ctx.lineTo(0.17 * PPM, 0); ctx.fill(); ctx.restore();
    } }
  // a person
  { const hm = 1.7, px = hm * PPM, a = vis(px, 10, 1400);
    if (a > 0) { const x = sx(-0.9), y = sy(0), s = PPM; ctx.globalAlpha = a; ctx.fillStyle = '#1c2340';
      ctx.beginPath(); ctx.arc(x, y - 1.58 * s, 0.11 * s, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.roundRect(x - 0.2 * s, y - 1.45 * s, 0.4 * s, 0.62 * s, 0.1 * s); ctx.fill();
      ctx.fillRect(x - 0.17 * s, y - 0.86 * s, 0.14 * s, 0.86 * s); ctx.fillRect(x + 0.03 * s, y - 0.86 * s, 0.14 * s, 0.86 * s);
      label('1.7 米的你', x, y - 1.95 * s, 30, a * ss(10.5, 11.2, t)); } }
  // houses and trees
  { const px = 10 * PPM, a = vis(px, 8, 2500);
    if (a > 0) { ctx.globalAlpha = a;
      for (const [x0, w0, h0, c] of [[6, 9, 7, '#e08a5a'], [-14, 8, 6, '#d9b25a'], [17, 7, 9, '#7aa0d8']]) { ctx.fillStyle = c; ctx.fillRect(sx(x0 - w0 / 2), sy(h0 * 0.65), w0 * PPM, h0 * 0.65 * PPM); ctx.fillStyle = '#7a3a30'; ctx.beginPath(); ctx.moveTo(sx(x0 - w0 / 2 - 0.5), sy(h0 * 0.65)); ctx.lineTo(sx(x0), sy(h0)); ctx.lineTo(sx(x0 + w0 / 2 + 0.5), sy(h0 * 0.65)); ctx.fill(); }
      for (const x0 of [-6, 11, -22]) { ctx.fillStyle = '#5a3a24'; ctx.fillRect(sx(x0 - 0.3), sy(3), 0.6 * PPM, 3 * PPM); ctx.fillStyle = '#3f8f4a'; ctx.beginPath(); ctx.arc(sx(x0), sy(4.5), 2.3 * PPM, 0, Math.PI * 2); ctx.fill(); } } }
  // a 32-storey tower
  { const px = 105 * PPM, a = vis(px, 10, 2600);
    if (a > 0) { ctx.globalAlpha = a; const x = sx(-38), w = 30 * PPM; ctx.fillStyle = '#3d4a6a'; ctx.fillRect(x - w / 2, sy(105), w, 105 * PPM);
      ctx.fillStyle = 'rgba(255,230,150,0.8)'; if (w > 20) for (let f = 1; f < 32; f++) for (let c = 0; c < 4; c++) if (hash(f * 7 + c) > 0.35) ctx.fillRect(x - w / 2 + (c + 0.3) * w / 4, sy(f * 3.3), w / 4 * 0.45, 3.3 * PPM * 0.45);
      label('32 层大楼', x, sy(105) - 40, 32, a * ss(13.8, 14.4, t) * (1 - ss(15.4, 15.8, t))); } }
  // Burj Khalifa, 828 m
  { const px = 828 * PPM, a = vis(px, 10, 2600);
    if (a > 0) { ctx.globalAlpha = a; ctx.fillStyle = '#34405e';
      const x = sx(250); ctx.beginPath(); ctx.moveTo(x - 60 * PPM, sy(0));
      [[60, 0], [48, 160], [38, 300], [28, 450], [18, 580], [10, 680], [4, 760], [1.2, 828]].forEach(([hw, y]) => ctx.lineTo(x - hw * PPM, sy(y)));
      [[1.2, 828], [4, 760], [10, 680], [18, 580], [28, 450], [38, 300], [48, 160], [60, 0]].forEach(([hw, y]) => ctx.lineTo(x + hw * PPM, sy(y)));
      ctx.closePath(); ctx.fill();
      label('迪拜塔 828 米', x, sy(828) - 40, 32, a * ss(15.4, 16.0, t) * (1 - ss(17.4, 17.8, t)), 'left'); } }
  // clouds, Everest and a plane
  { const px = 8849 * PPM, a = vis(px, 10, 3200);
    if (a > 0) {
      ctx.globalAlpha = a; const pk = sx(-3600);
      const mg = ctx.createLinearGradient(0, sy(8849), 0, sy(0)); mg.addColorStop(0, '#f2f6ff'); mg.addColorStop(0.18, '#e8eefc'); mg.addColorStop(0.22, '#6b7894'); mg.addColorStop(1, '#3a4258');
      ctx.fillStyle = mg; ctx.beginPath(); ctx.moveTo(sx(-20000), sy(0)); ctx.lineTo(sx(-9600), sy(5200)); ctx.lineTo(sx(-7100), sy(4600)); ctx.lineTo(pk, sy(8849)); ctx.lineTo(sx(-1600), sy(5600)); ctx.lineTo(sx(-400), sy(5000)); ctx.lineTo(sx(6000), sy(0)); ctx.fill();
      label('珠穆朗玛峰 8,849 米', pk, sy(8849) - 36, 32, a * ss(17.8, 18.4, t) * (1 - ss(19.6, 20.0, t)));
      for (let i = 0; i < 14; i++) { const cx = sx((hash(i) - 0.5) * 60000), cy = sy(2500 + hash(i + 5) * 3500), r = (1200 + hash(i + 9) * 1600) * PPM; ctx.globalAlpha = a * 0.75; ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.ellipse(cx, cy, r * 1.8, r * 0.5, 0, 0, Math.PI * 2); ctx.fill(); }
      ctx.globalAlpha = a; ctx.fillStyle = '#ffffff'; const px0 = sx(7000), py0 = sy(10500), s = 60 * PPM * 20;
      ctx.beginPath(); ctx.moveTo(px0 - s, py0); ctx.lineTo(px0 + s, py0 - s * 0.1); ctx.lineTo(px0 + s * 0.2, py0 + s * 0.05); ctx.fill();
    } }
  // the edge of space, 100 km
  { const px = 1e5 * PPM, a = vis(px, 30, 3500);
    if (a > 0) { const y = sy(1e5); ctx.globalAlpha = a * 0.8; ctx.strokeStyle = '#9fd0ff'; ctx.lineWidth = 3; ctx.setLineDash([16, 14]); ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); ctx.setLineDash([]);
      label('太空边界 100 公里', W - 40, y - 34, 32, a * ss(19.8, 20.3, t) * (1 - ss(21.4, 21.8, t)), 'right', '#cfe6ff'); } }
  // the space station, ~420 km
  { const px = 4.2e5 * PPM, a = vis(px, 30, 3500);
    if (a > 0) { const x = sx(1.15e5), y = sy(4.2e5); ctx.globalAlpha = a; ctx.fillStyle = '#e0e6f0';
      ctx.fillRect(x - 40, y - 4, 80, 8); ctx.fillStyle = '#3f6fd8'; ctx.fillRect(x - 46, y - 22, 16, 44); ctx.fillRect(x + 30, y - 22, 16, 44);
      label('空间站 ≈ 400 公里', x, y - 52, 30, a * ss(21.4, 21.9, t) * (1 - ss(24.0, 24.5, t))); } }
  // the Moon
  { const px = MOON_D * PPM, a = vis(px, 20, 9000);
    if (a > 0) { const x = sx(0), y = sy(MOON_D), r = Math.max(RM * PPM, 28);
      ctx.globalCompositeOperation = 'lighter'; softGlow(x, y, r * 3, [255, 245, 220], 0.35 * a); ctx.globalCompositeOperation = 'source-over';
      const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r); g.addColorStop(0, '#fbf6ea'); g.addColorStop(1, '#a9a49a');
      ctx.globalAlpha = a; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(120,115,105,0.5)'; for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc(x + (hash(i) - 0.5) * r * 1.2, y + (hash(i + 3) - 0.5) * r * 1.2, r * (0.08 + 0.12 * hash(i + 6)), 0, Math.PI * 2); ctx.fill(); }
      label('月球 ≈ 38.4 万公里', x + r + 26, y, 32, a * (1 - ss(29.4, 29.8, t)), 'left'); } }
  // the Sun
  { const px = SUN_D * PPM, a = vis(px, 20, 9000);
    if (a > 0) { const x = sx(0), y = sy(SUN_D), r = Math.max(RS * PPM, 34);
      ctx.globalCompositeOperation = 'lighter'; softGlow(x, y, r * 5, [255, 170, 60], 0.6 * a); softGlow(x, y, r * 1.6, [255, 230, 150], 0.8 * a); ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = a; ctx.fillStyle = '#fff4c8'; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      label('太阳 ≈ 1.5 亿公里', x + r + 30, y, 32, a * ss(30.5, 30.9, t) * (1 - ss(31.4, 31.7, t)), 'left'); } }
  // the Milky Way and the observable universe (during the last, wild stretch)
  { const D = 9.5e20, px = D * PPM, a = vis(px, 30, 6000);
    if (a > 0) { const x = sx(0), y = sy(3e20), r = D / 2 * PPM;
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 900; i++) { const arm = i % 2, u = hash(i) , ang = u * 9 + arm * Math.PI, rr = u * r; spr(glow(i % 5 ? '#c8d2ff' : '#ffd8a8'), x + Math.cos(ang) * rr + (hash(i + 3) - 0.5) * r * 0.12, y + Math.sin(ang) * rr * 0.4 + (hash(i + 5) - 0.5) * r * 0.06, 6, a * 0.7); }
      softGlow(x, y, r * 0.3, [255, 220, 170], 0.5 * a);
      ctx.globalCompositeOperation = 'source-over';
      label('银河系', x + r * 0.7, y - r * 0.4, 32, a); } }
  { const Ru = 4.4e26, px = Ru * PPM, a = vis(px, 40, 9000);
    if (a > 0) { const x = sx(0), y = sy(Ru), r = Ru * PPM;
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 700; i++) { const ang = hash(i) * 6.283, rr = Math.sqrt(hash(i + 1)) * r; spr(glow(['#9fb4ff', '#ffb0d8', '#ffe3a0'][i % 3]), x + Math.cos(ang) * rr, y + Math.sin(ang) * rr, 5 + 4 * hash(i + 2), a * 0.6); }
      ctx.globalAlpha = a * 0.7; ctx.strokeStyle = '#b8c8ff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
      label('可观测宇宙 ≈ 930 亿光年', x, y - r - 44, 34, a * ss(32.2, 32.6, t)); } }
}

// the paper stack itself
function stack(t, h, n) {
  const x = sx(0), top = sy(h), bottom = sy(0);
  const w = Math.max(7, Math.min(lerp(520, 150, clamp(n / 3)), 0.6 * 0.21 * PPM + 7));
  const th = Math.max(6, bottom - top), topY = bottom - th;
  let flap = 0;
  if (t < KEYS[0][0]) for (const ft of FOLD_T) { const u = (t - ft) / 0.36; if (u > 0 && u < 1) flap = u; }
  ctx.globalCompositeOperation = 'source-over';
  if (w > 40) {
    ctx.globalAlpha = 1;
    const g = ctx.createLinearGradient(x - w / 2, 0, x + w / 2, 0); g.addColorStop(0, '#d8d2c6'); g.addColorStop(0.5, '#fffdf6'); g.addColorStop(1, '#d8d2c6');
    ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 24;
    ctx.fillStyle = g; ctx.fillRect(x - w / 2, topY, flap > 0 ? w / 2 : w, th);
    ctx.shadowBlur = 0;
    const layers = Math.round(Math.pow(2, n));
    if (th > 12 && layers < 300) { ctx.strokeStyle = 'rgba(120,110,90,0.35)'; ctx.lineWidth = 1; for (let k = 1; k < layers; k++) { const y = lerp(bottom, topY, k / layers); ctx.beginPath(); ctx.moveTo(x - w / 2, y); ctx.lineTo(x + w / 2, y); ctx.stroke(); } }
    if (flap > 0) {   // the right half lifts and flips over onto the left half
      const ang = Math.PI * easeIO(flap);
      ctx.save(); ctx.translate(x, topY); ctx.rotate(-ang);
      ctx.fillStyle = '#fffaf0'; ctx.shadowColor = 'rgba(255,220,150,0.6)'; ctx.shadowBlur = 20;
      ctx.fillRect(0, -th, w / 2, th); ctx.restore();
    }
  } else {
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 1; ctx.fillStyle = '#fff7e0'; ctx.fillRect(x - w / 2, top, w, bottom - top);
    for (const [ww, al] of [[w * 5, 0.08], [w * 2.2, 0.25]]) { ctx.globalAlpha = al; ctx.fillRect(x - ww / 2, top, ww, bottom - top); }
    spr(glow('#ffffff'), x, top, 90, 0.9);
    spr(glow('#ffe7b0'), x, top, 240, 0.5);
    ctx.globalCompositeOperation = 'source-over';
  }
}

// ================================================================ scenes
function sceneJourney(t) {
  const n = foldN(t), h = camera(t);
  const indoor = sky(t, h);
  ground(t, indoor);
  landmarks(t);
  stack(t, h, n);
  // HUD
  const a = ss(3.3, 3.6, t) * (1 - ss(33.0, 33.3, t));
  const nn = Math.floor(n + 1e-6);
  const pop = (() => { let p = 0; if (t < KEYS[0][0]) for (const ft of FOLD_T) if (t > ft + 0.3) p = Math.max(p, Math.exp(-(t - ft - 0.3) * 8)); return p; })();
  panel(330, 330, a * 0.8);
  txt('对折', W / 2 - 150, 300, { size: 50, weight: 800, alpha: a, spacing: 6, shadow: SHADOW });
  txt(`${nn}`, W / 2 + 10, 290, { family: 'Mont', size: 150, weight: 900, alpha: a, fill: GOLD_FILL, shadow: 'rgba(160,70,0,0.85)', shadowBlur: 40, scale: 1 + 0.2 * pop });
  txt('次', W / 2 + 170, 300, { size: 50, weight: 800, alpha: a, spacing: 6, shadow: SHADOW });
  txt(`厚度 ≈ ${fmtLen(thick(nn))}`, W / 2, 410, { size: 52, weight: 800, alpha: a, spacing: 2, shadow: SHADOW });
}
const MILE = [
  [3.25, 5.0, '一张纸，厚约 0.1 毫米'], [5.0, 8.5, '对折一次，厚度翻一倍'], [8.6, 9.8, '10 次：约 10 厘米'],
  [11.0, 12.0, '14 次：和你一样高'], [12.5, 13.4, '17 次：4 层楼那么高'], [14.0, 15.0, '20 次：超过 30 层大楼'],
  [15.6, 17.0, '23 次：超过迪拜塔'], [18.0, 19.2, '27 次：比珠峰还高'], [20.0, 21.1, '30 次：进入太空'],
  [21.6, 23.1, '32 次：超过空间站'], [23.4, 28.3, '地球，越来越小……'],
];
function journeyText(t) {
  for (const [a, b, s] of MILE) slam(s, W / 2, 1790, t, a, b, { size: 76, spacing: 4, shadow: 'rgba(0,0,0,0.85)', shadowBlur: 30, from: 1.5 });
  panel(1790, 230, (ss(28.4, 28.6, t) * (1 - ss(29.3, 29.5, t))));
  slam('42 次：碰到月亮！', W / 2, 1790, t, 28.4, 29.45, { size: 96, spacing: 4, fill: GOLD_FILL, shadow: 'rgba(120,60,0,0.9)', shadowBlur: 40, from: 2.2 });
  slam('51 次：超过太阳', W / 2, 1790, t, 30.6, 31.35, { size: 88, spacing: 4, fill: GOLD_FILL, shadow: 'rgba(120,60,0,0.9)', shadowBlur: 40 });
  slam('103 次', W / 2, 1700, t, 32.4, 33.25, { size: 110, spacing: 4, fill: GOLD_FILL, shadow: 'rgba(120,60,0,0.9)', shadowBlur: 40 });
  slam('比整个可观测宇宙还大', W / 2, 1830, t, 32.55, 33.25, { size: 70, spacing: 4, shadow: 'rgba(0,0,0,0.85)' });
}

function sceneHook(t, noText = false) {
  // night sky, the Moon, and a sheet of paper folding
  const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#05071a'); g.addColorStop(1, '#1a1440');
  ctx.globalAlpha = 1; ctx.fillStyle = g; ctx.fillRect(-50, -50, W + 100, H + 100);
  ctx.globalCompositeOperation = 'lighter';
  for (const [x, y, d, ph] of SKYSTARS) spr(glow('#ffffff'), x, y, 3 + d * 5, (0.3 + 0.4 * Math.sin(t * 3 + ph)) * (0.4 + d));
  const mx = W / 2, my = 560 + 10 * Math.sin(t * 2), mr = 150 * (1 + 0.04 * Math.sin(t * 3));
  softGlow(mx, my, mr * 3, [255, 240, 210], 0.5);
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  const mg = ctx.createRadialGradient(mx - mr * 0.3, my - mr * 0.3, mr * 0.1, mx, my, mr); mg.addColorStop(0, '#fffaf0'); mg.addColorStop(1, '#b8b2a6');
  ctx.fillStyle = mg; ctx.beginPath(); ctx.arc(mx, my, mr, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(130,125,115,0.45)'; for (let i = 0; i < 7; i++) { ctx.beginPath(); ctx.arc(mx + (hash(i) - 0.5) * mr * 1.2, my + (hash(i + 3) - 0.5) * mr * 1.2, mr * (0.07 + 0.1 * hash(i + 6)), 0, Math.PI * 2); ctx.fill(); }
  // dotted path from paper to moon
  ctx.globalAlpha = 0.7; ctx.strokeStyle = '#ffe7b0'; ctx.lineWidth = 4; ctx.setLineDash([2, 18]); ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(W / 2, 1380); ctx.lineTo(W / 2, my + mr + 20); ctx.stroke(); ctx.setLineDash([]);
  // the paper, folding in half twice (pseudo 3D)
  const ph = (t % 1.4) / 1.4, fold = easeIO(clamp(ph * 1.6));
  const pw = 520 * (ph < 0.62 ? 1 : 0.5) , ph2 = 380;
  ctx.save(); ctx.translate(W / 2, 1460); ctx.rotate(-0.12);
  ctx.globalAlpha = 1; ctx.fillStyle = '#fffdf6'; ctx.shadowColor = 'rgba(255,220,150,0.6)'; ctx.shadowBlur = 40;
  ctx.fillRect(-pw / 2, -ph2 / 2, pw / 2, ph2);
  ctx.shadowBlur = 0;
  const sx2 = Math.cos(Math.PI * fold);
  ctx.fillStyle = sx2 > 0 ? '#fffdf6' : '#e8e2d4';
  ctx.fillRect(0, -ph2 / 2, (pw / 2) * sx2, ph2);
  ctx.strokeStyle = 'rgba(150,140,120,0.5)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, -ph2 / 2); ctx.lineTo(0, ph2 / 2); ctx.stroke();
  ctx.restore();
  if (noText) return;
  slam('一张纸对折 42 次', W / 2, 200, t, 0.0, 3.0, { size: 88, spacing: 4, shadow: SHADOW, from: 1.4 });
  slam('能碰到月亮？', W / 2, 950, t, 0.9, 3.0, { size: 110, spacing: 6, fill: GOLD_FILL, shadow: 'rgba(120,60,0,0.9)', shadowBlur: 40, from: 2.2 });
}

function sceneTwist(t) {
  // back to the desk: reality check
  const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#2b1a14'); g.addColorStop(0.75, '#5a3a26'); g.addColorStop(1, '#7a5034');
  ctx.globalAlpha = 1; ctx.fillStyle = g; ctx.fillRect(-50, -50, W + 100, H + 100);
  ctx.globalCompositeOperation = 'lighter'; softGlow(W * 0.78, H * 0.18, 700, [255, 190, 110], 0.45); ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#8a5a38'; ctx.fillRect(-50, 1400, W + 100, 600);
  // a stubborn, barely-folded wad of paper
  const k = easeOutBack((t - 33.4) / 0.4);
  ctx.save(); ctx.translate(W / 2, 1330); ctx.scale(k, k); ctx.rotate(-0.06);
  ctx.fillStyle = '#fffdf6'; ctx.shadowColor = 'rgba(0,0,0,0.4)'; ctx.shadowBlur = 30;
  for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.roundRect(-150 + i * 4, -20 - i * 22, 300 - i * 8, 26, 10); ctx.fill(); }
  ctx.restore();
  rise('但现实中——', W / 2, 260, t, 33.4, 36.5, { size: 80, weight: 900, spacing: 8, shadow: SHADOW });
  slam('人类最多只把纸', W / 2, 560, t, 34.3, 36.5, { size: 80, spacing: 4, shadow: SHADOW, from: 1.4 });
  slam('对折过 13 次', W / 2, 700, t, 34.6, 36.5, { size: 112, spacing: 4, fill: GOLD_FILL, shadow: 'rgba(120,60,0,0.9)', shadowBlur: 40 });
  rise('*这项纪录由一群美国学生在 2011 年创下', W / 2, 1820, t, 34.9, 36.5, { size: 28, weight: 500, alpha: 0.75 });
}

function sceneLesson(t) {
  const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#0c0a24'); g.addColorStop(1, '#1d0f2e');
  ctx.globalAlpha = 1; ctx.fillStyle = g; ctx.fillRect(-50, -50, W + 100, H + 100);
  ctx.globalCompositeOperation = 'lighter'; softGlow(W * 0.7, H * 0.4, 900, [120, 60, 200], 0.3); ctx.globalCompositeOperation = 'source-over';
  rise('这就是「指数」的力量', W / 2, 230, t, 36.55, 41.0, { size: 74, weight: 900, spacing: 4, shadow: SHADOW });
  // two curves over 365 days
  const x0 = 140, x1 = W - 100, y0 = 1350, y1 = 560;
  const prog = easeIO(ss(37.2, 39.6, t));
  ctx.globalAlpha = ss(36.9, 37.3, t); ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x0, y1 - 40); ctx.lineTo(x0, y0); ctx.lineTo(x1 + 20, y0); ctx.stroke();
  txt('第 1 天', x0, y0 + 40, { size: 28, weight: 600, alpha: 0.7 * ss(36.9, 37.3, t) });
  txt('第 365 天', x1, y0 + 40, { size: 28, weight: 600, alpha: 0.7 * ss(36.9, 37.3, t) });
  const curve = (base, col, w) => {
    const m = Math.max(1, Math.floor(365 * prog));
    ctx.beginPath();
    for (let d = 0; d <= m; d++) { const v = Math.pow(base, d), x = lerp(x0, x1, d / 365), y = y0 - (y0 - y1) * (v / 37.8); d ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.globalAlpha = 1; ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineJoin = 'round'; ctx.stroke();
    const v = Math.pow(base, m); return [lerp(x0, x1, m / 365), y0 - (y0 - y1) * (v / 37.8)];
  };
  if (t > 37.2) {
    ctx.shadowColor = 'rgba(255,180,60,0.8)'; ctx.shadowBlur = 20;
    const up = curve(1.01, '#ffc24d', 8);
    ctx.shadowColor = 'rgba(120,160,255,0.6)';
    const down = curve(0.99, '#8aa0ff', 6);
    ctx.shadowBlur = 0;
    ctx.globalCompositeOperation = 'lighter'; spr(glow('#ffe7b0'), up[0], up[1], 90, 1); spr(glow('#b8c8ff'), down[0], down[1], 60, 1); ctx.globalCompositeOperation = 'source-over';
  }
  powSlam('1.01', '365', ' ≈ 37.8', W / 2 - 60, 640, t, 39.7, 41.05, 92, GOLD_FILL, 'rgba(120,60,0,0.9)');
  rise('每天进步 1%', W / 2 - 60, 740, t, 39.8, 41.05, { size: 48, weight: 800, spacing: 4, shadow: SHADOW });
  powSlam('0.99', '365', ' ≈ 0.03', W / 2, 1490, t, 40.1, 41.05, 76, '#a9b8ff', 'rgba(0,0,0,0.8)');
  rise('每天退步 1%', W / 2, 1580, t, 40.2, 41.05, { size: 44, weight: 700, spacing: 4, alpha: 0.85, shadow: SHADOW });
}

function powSlam(base, ex, tail, cx, y, t, t0, t1, size, fill, shadow) {
  if (t < t0 || t > t1) return;
  const age = t - t0, sc = lerp(1.6, 1, easeOutBack(age / 0.35)), a = ss(t0, t0 + 0.08, t) * (1 - ss(t1 - 0.3, t1, t));
  ctx.save(); ctx.font = `900 ${size}px Mont`; ctx.letterSpacing = '0px';
  const wb = ctx.measureText(base).width; ctx.font = `900 ${size * 0.5}px Mont`; const we = ctx.measureText(ex).width;
  ctx.font = `900 ${size}px Mont`; const wt = ctx.measureText(tail).width; ctx.restore();
  const total = wb + we + wt, x0 = -total / 2;
  ctx.save(); ctx.translate(cx, y); ctx.scale(sc, sc);
  const o = { family: 'Mont', weight: 900, align: 'left', alpha: a, fill, shadow, shadowBlur: 30, chroma: 12 * Math.exp(-age * 7) };
  txt(base, x0, 0, Object.assign({ size }, o));
  txt(ex, x0 + wb + 4, -size * 0.38, Object.assign({}, o, { size: size * 0.5 }));
  txt(tail, x0 + wb + we + 8, 0, Object.assign({ size }, o));
  ctx.restore();
}
function scenePoster(t) {
  sceneJourneyFrozen();
  panel(940, 760, 0.9 * ss(41.0, 41.3, t));
  slam('一张纸的', W / 2, 760, t, 41.05, 46, { size: 90, spacing: 20, shadow: SHADOW, from: 1.5 });
  slam('42 次对折', W / 2, 920, t, 41.3, 46, { size: 150, spacing: 6, fill: GOLD_FILL, shadow: 'rgba(200,90,0,0.85)', shadowBlur: 60, from: 2.0 });
  rise('每天多一点点', W / 2, 1100, t, 42.1, 46, { size: 64, weight: 800, spacing: 12, shadow: SHADOW });
  rise('时间会帮你折到月亮', W / 2, 1190, t, 42.6, 46, { size: 50, weight: 600, spacing: 8, alpha: 0.9, shadow: SHADOW });
}
function sceneJourneyFrozen() {   // background for the poster: Earth, the beam and the Moon
  const tt = 28.6; const n = 42, h = thick(n);
  PPM = 1 / (1 / 2600 + 1 / ((H * 0.6) / h)); GYS = H * 0.86;
  sky(tt, h); ground(tt, 0); landmarks(tt); stack(tt, h, n);
}

// ================================================================ impacts & frame
const IMPACTS = [[0.0, 0.5], [0.9, 0.8], ...FOLD_T.map(f => [f + 0.3, 0.25]), [11.0, 0.35], [12.5, 0.35], [14.0, 0.35], [15.6, 0.45], [18.0, 0.5], [20.0, 0.6], [21.6, 0.45],
  [28.4, 1.2], [30.6, 0.8], [32.4, 1.0], [33.4, 0.6], [34.6, 0.6], [39.7, 0.6], [41.3, 1.0]];
function impact(t, decay = 6) { let s = 0; for (const [ti, k] of IMPACTS) if (t >= ti && t - ti < 2) s += k * Math.exp(-(t - ti) * decay); return s; }
function panel(y, h, a) {
  if (a <= 0) return;
  const g = ctx.createLinearGradient(0, y - h / 2, 0, y + h / 2);
  g.addColorStop(0, 'rgba(6,6,18,0)'); g.addColorStop(0.25, 'rgba(6,6,18,0.7)'); g.addColorStop(0.75, 'rgba(6,6,18,0.7)'); g.addColorStop(1, 'rgba(6,6,18,0)');
  ctx.globalAlpha = a; ctx.fillStyle = g; ctx.fillRect(0, y - h / 2, W, h); ctx.globalAlpha = 1;
}

function renderTime(t) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; ctx.filter = 'none'; ctx.shadowBlur = 0; ctx.letterSpacing = '0px';
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  const imp = impact(t), f = Math.round(t * FPS);
  let big = 0; for (const [ti, k] of IMPACTS) if (k >= 0.8 && t >= ti && t - ti < 0.5) big = Math.max(big, k * Math.exp(-(t - ti) * 8));
  const sh = Math.min(12, big * 10);
  ctx.setTransform(1, 0, 0, 1, (hash(f * 2) - 0.5) * 2 * sh, (hash(f * 2 + 1) - 0.5) * 2 * sh);
  let bl = 0.35;
  if (t < 3.15) { sceneHook(t); bl = 0.45; }
  else if (t < 33.3) { sceneJourney(t); ctx.setTransform(1, 0, 0, 1, 0, 0); journeyText(t); bl = t > 22 ? 0.55 : 0.3; }
  else if (t < 36.5) { sceneTwist(t); bl = 0.3; }
  else if (t < 41.0) { sceneLesson(t); bl = 0.5; }
  else { scenePoster(t); bl = 0.5; }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  bloom(bl + 0.25 * Math.min(1, imp));
  chromaShift(Math.min(10, imp * 6));
  ctx.globalCompositeOperation = 'source-over';
  let flash = 0;
  for (const [ti, k] of IMPACTS) if (ti > 0 && t >= ti && t - ti < 0.5) flash = Math.max(flash, k * Math.exp(-(t - ti) * 14));
  flash = Math.max(flash, ss(3.0, 3.15, t) * (t < 3.15 ? 1 : 0), ss(36.35, 36.5, t) * (t < 36.5 ? 0.8 : 0), ss(40.85, 41.0, t) * (t < 41 ? 1 : 0));
  if (flash > 0.01) { ctx.globalAlpha = Math.min(0.85, flash * 0.7); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H); }
  ctx.globalAlpha = 0.6; ctx.drawImage(VIG, 0, 0);
  ctx.globalCompositeOperation = 'overlay'; ctx.globalAlpha = 0.045;
  const gimg = GRAIN[f % 4], ox = -Math.floor(hash(f) * 256), oy = -Math.floor(hash(f + 999) * 256);
  for (let y = oy; y < H; y += 256) for (let x = ox; x < W; x += 256) ctx.drawImage(gimg, x, y);
  ctx.globalCompositeOperation = 'source-over';
  let black = ss(44.2, 44.9, t);
  if (t > 33.22 && t < 33.45) black = Math.max(black, 1 - ss(33.3, 33.45, t));   // hard stop: the reality check
  if (black > 0) { ctx.globalAlpha = clamp(black); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); }
  ctx.globalAlpha = 1;
}

function renderCover() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; ctx.shadowBlur = 0;
  sceneHook(1.9, true);
  txt('一张纸对折 42 次', W / 2, 220, { size: 96, weight: 900, spacing: 4, shadow: SHADOW });
  txt('能碰到月亮？', W / 2, 960, { size: 120, weight: 900, spacing: 6, fill: GOLD_FILL, shadow: 'rgba(120,60,0,0.9)', shadowBlur: 40 });
  bloom(0.4); ctx.globalAlpha = 0.6; ctx.drawImage(VIG, 0, 0); ctx.globalAlpha = 1;
}

window.renderFrame = i => renderTime(i / FPS);
window.renderTime = renderTime;
window.renderCover = renderCover;
window.META = { W, H, FPS, DURATION, IMPACTS, FOLD_T, KEYS };
window.ready = (async () => {
  await Promise.all([
    document.fonts.load('900 100px Sans', '纸'), document.fonts.load('500 100px Sans', '纸'),
    document.fonts.load('900 100px Mont', '0123'),
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
