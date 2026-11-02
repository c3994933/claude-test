// 选择 · Choice — a short generative film.
// Every frame is a pure function of time t, so frames can be rendered in any order.
'use strict';

const W = 1920, H = 1080, FPS = 30, DURATION = 48;
const cv = document.getElementById('c');
const ctx = cv.getContext('2d');

// ---------------------------------------------------------------- utilities
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const lerp = (a, b, t) => a + (b - a) * t;
const ss = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const easeIO = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const easeOut = t => 1 - Math.pow(1 - t, 3);
const easeIn = t => t * t;
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
const mixc = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${clamp(a)})`;

// ---------------------------------------------------------------- palette
const GOLD = [255, 190, 105];
const WARM = [255, 236, 205];
const BLUE = [120, 170, 255];
const VIOLET = [165, 125, 255];
const CYAN = [95, 215, 255];
function ghostColor(depth, k) {
  const a = mixc(BLUE, VIOLET, clamp((depth - 1) / 4));
  return mixc(a, CYAN, 0.35 * k);
}

// ---------------------------------------------------------------- sprites
function makeGlow(c, size = 128) {
  const g = document.createElement('canvas'); g.width = g.height = size;
  const x = g.getContext('2d'); const r = size / 2;
  const gr = x.createRadialGradient(r, r, 0, r, r, r);
  gr.addColorStop(0.00, rgba(mixc(c, [255, 255, 255], 0.6), 1));
  gr.addColorStop(0.08, rgba(c, 0.85));
  gr.addColorStop(0.25, rgba(c, 0.30));
  gr.addColorStop(0.55, rgba(c, 0.07));
  gr.addColorStop(1.00, rgba(c, 0));
  x.fillStyle = gr; x.fillRect(0, 0, size, size);
  return g;
}
const SPR = {
  gold: makeGlow(GOLD), warm: makeGlow(WARM), blue: makeGlow(BLUE),
  violet: makeGlow(VIOLET), cyan: makeGlow(CYAN), white: makeGlow([255, 255, 255]),
};
// small tinted sprites for the particle swarm (fast path)
const DOTS = [];
for (let i = 0; i < 16; i++) DOTS.push(makeGlow(mixc(mixc(BLUE, VIOLET, (i % 4) / 3), GOLD, Math.floor(i / 4) / 3), 32));
function dotSprite(srcIdx, goldMix) { return DOTS[srcIdx + 4 * Math.min(3, Math.round(goldMix * 3))]; }

function sprite(img, x, y, size, alpha, sx = 1, sy = 1) {
  if (alpha <= 0.002) return;
  ctx.globalAlpha = clamp(alpha);
  const w = size * sx, h = size * sy;
  ctx.drawImage(img, x - w / 2, y - h / 2, w, h);
}

// vignette + grain
const VIG = (() => {
  const g = document.createElement('canvas'); g.width = W; g.height = H;
  const x = g.getContext('2d');
  const gr = x.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, W * 0.72);
  gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.78)');
  x.fillStyle = gr; x.fillRect(0, 0, W, H); return g;
})();
const GRAIN = [0, 1, 2, 3].map(s => {
  const g = document.createElement('canvas'); g.width = g.height = 256;
  const x = g.getContext('2d'); const id = x.createImageData(256, 256); const r = rng(99 + s);
  for (let i = 0; i < id.data.length; i += 4) { const v = r() * 255; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 255; }
  x.putImageData(id, 0, 0); return g;
});

// ---------------------------------------------------------------- timeline
const T = {
  ignite: 1.0, moveStart: 7.0, arriveFork: 10.5, choice: 13.0,
  ghostWake: 19.5, dissolve: 30.0, formed: 36.0, fadeOut: 44.6, end: 48.0,
};
const HESITATE = [10.6, 11.2, 11.8, 12.4];       // alternating "considering" beats

const CAPTIONS = [
  { t0: 2.2, t1: 6.4, zh: '每一刻，都是一次选择', en: 'Every moment is a choice', y: H * 0.72 },
  { t0: 9.6, t1: 12.9, zh: '向左，还是向右', en: 'Left, or right', y: H * 0.80 },
  { t0: 13.9, t1: 18.0, zh: '选择一条路，便告别了另一条', en: 'To take one road is to leave another', y: H * 0.80 },
  { t0: 20.0, t1: 24.4, zh: '未曾走过的路', en: 'The roads not taken', y: H * 0.86 },
  { t0: 24.6, t1: 29.2, zh: '也在某处，静静发光', en: 'still glow, somewhere', y: H * 0.86 },
  { t0: 39.6, t1: 44.4, zh: '你走过的每一步，都在成为你', en: 'Every step you take becomes who you are', y: H * 0.835 },
];

// ---------------------------------------------------------------- the tree of paths
const R = rng(20261102);
const segs = [];
const chosen = [];
const forks = [];
const dir = h => [Math.cos(h), Math.sin(h)];

function makeSeg(p0, h0, L, h1, t0, t1, kind, depth) {
  const hm = (h0 + h1) / 2, dm = dir(hm), d0 = dir(h0), d1 = dir(h1);
  const p1 = [p0[0] + dm[0] * L, p0[1] + dm[1] * L];
  const c0 = [p0[0] + d0[0] * L * 0.38, p0[1] + d0[1] * L * 0.38];
  const c1 = [p1[0] - d1[0] * L * 0.38, p1[1] - d1[1] * L * 0.38];
  const N = 24, pts = [], cum = [0];
  for (let i = 0; i <= N; i++) {
    const u = i / N, v = 1 - u;
    const a = v * v * v, b = 3 * v * v * u, c = 3 * v * u * u, d = u * u * u;
    pts.push([a * p0[0] + b * c0[0] + c * c1[0] + d * p1[0], a * p0[1] + b * c0[1] + c * c1[1] + d * p1[1]]);
    if (i) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  }
  const s = { p0, p1, h0, h1, L, pts, cum, len: cum[N], t0, t1, kind, depth, phase: R(), kids: 0 };
  segs.push(s);
  return s;
}
function segPoint(s, f) {
  const target = clamp(f) * s.len, c = s.cum;
  let i = 1; while (i < c.length - 1 && c[i] < target) i++;
  const k = (target - c[i - 1]) / Math.max(1e-6, c[i] - c[i - 1]);
  return [lerp(s.pts[i - 1][0], s.pts[i][0], k), lerp(s.pts[i - 1][1], s.pts[i][1], k)];
}

function growGhost(parent, depth) {
  if (depth > 5) return;
  for (const sg of [-1, 1]) {
    if (depth >= 3 && R() < 0.22) continue;
    const spread = 0.28 + R() * 0.34;
    const h0 = clamp(parent.h1 + sg * spread, -1.45, 1.45);
    const h1 = clamp(h0 + sg * R() * 0.22, -1.5, 1.5);
    const L = parent.L * (0.70 + R() * 0.12);
    const start = Math.max(parent.t1, T.ghostWake + (depth - 2) * 0.05 + R() * 0.35);
    const dur = L / 1050;
    if (start + dur > T.dissolve - 0.25) continue;
    parent.kids++;
    growGhost(makeSeg(parent.p1, h0, L, h1, start, start + dur, 'ghost', depth), depth + 1);
  }
}

(function buildTree() {
  const trunk = makeSeg([0, 0], 0, 700, 0, T.moveStart, T.arriveFork, 'chosen', 0);
  chosen.push(trunk);
  const durs = [2.2, 1.9, 1.7, 1.5, 1.4, 1.3, 1.25, 1.2, 1.15, 1.1, 1.1, 1.1];
  let p = trunk.p1, h = 0, t = T.choice, k = 0;
  while (t < 29.4) {
    const dur = durs[k] ?? 1.1;
    const L = k === 0 ? 540 : (420 + R() * 110) * Math.pow(0.975, k);
    let sg = k === 0 ? -1 : (R() < 0.5 ? -1 : 1);
    if (p[1] > 230) sg = -1;
    if (p[1] < -230) sg = 1;
    const spread = 0.40 + R() * 0.12;
    const cs = makeSeg(p, h + sg * spread, L, sg * 0.06, t, t + dur, 'chosen', 0);
    const gh0 = h - sg * (spread + 0.08);
    const gs = makeSeg(p, gh0, L * 0.92, k === 0 ? -sg * 0.06 : gh0 * 1.2, t, t + dur * 0.92, 'ghost', 1);
    forks.push({ p: p.slice(), t, sign: sg });
    growGhost(gs, 2);
    chosen.push(cs);
    p = cs.p1; h = cs.h1; t += dur; k++;
  }
})();

// bounds of the whole tree -> final framing
const BOUNDS = (() => {
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (const s of segs) for (const q of s.pts) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]); }
  return { x0, x1, y0, y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
})();
const ZF = Math.min(W * 0.86 / (BOUNDS.x1 - BOUNDS.x0), H * 0.70 / (BOUNDS.y1 - BOUNDS.y0));
const FINAL_CAM = { x: BOUNDS.cx, y: BOUNDS.cy + 40 / ZF, z: ZF };

// ---------------------------------------------------------------- the traveller
function lightPos(t) {
  if (t <= T.moveStart) return [0, 0];
  for (let i = 0; i < chosen.length; i++) {
    const s = chosen[i];
    if (t < s.t0) return s.p0;                    // waiting at a fork
    if (t <= s.t1) {
      let f = (t - s.t0) / (s.t1 - s.t0);
      if (i === 0) f = easeIO(f);
      else if (i === 1) f = f < 0.35 ? easeIn(f / 0.35) * 0.35 * 0.5 + f * 0.5 : f;  // gentle restart
      return segPoint(s, f);
    }
  }
  return chosen[chosen.length - 1].p1;
}
function chosenProgress(s, t) {
  if (t <= s.t0) return 0;
  if (t >= s.t1) return 1;
  const p = lightPos(t);
  // find arc length fraction of p on s (cheap: nearest polyline vertex refinement)
  let best = 0, bd = 1e18;
  for (let i = 0; i < s.pts.length; i++) { const d = (s.pts[i][0] - p[0]) ** 2 + (s.pts[i][1] - p[1]) ** 2; if (d < bd) { bd = d; best = i; } }
  // refine between neighbours
  let lo = Math.max(0, best - 1), hi = Math.min(s.pts.length - 1, best + 1);
  let fl = s.cum[lo] / s.len, fh = s.cum[hi] / s.len;
  for (let it = 0; it < 14; it++) {
    const m1 = lerp(fl, fh, 0.33), m2 = lerp(fl, fh, 0.67);
    const a = segPoint(s, m1), b = segPoint(s, m2);
    const da = (a[0] - p[0]) ** 2 + (a[1] - p[1]) ** 2, db = (b[0] - p[0]) ** 2 + (b[1] - p[1]) ** 2;
    if (da < db) fh = m2; else fl = m1;
  }
  return (fl + fh) / 2;
}

// ---------------------------------------------------------------- camera
function camAt(t) {
  if (t >= T.dissolve) return FINAL_CAM;
  let fx = 0, fy = 0; const n = 12;
  for (let i = 0; i < n; i++) { const p = lightPos(t - i * 0.07); fx += p[0]; fy += p[1]; }
  fx /= n; fy /= n;
  let z = t < T.moveStart ? lerp(1.32, 1.14, ss(0, 7, t)) : lerp(1.14, 1.0, ss(7, 10.5, t));
  const zt = easeIO(ss(16.5, 29.4, t));
  z = Math.exp(lerp(Math.log(z), Math.log(ZF), zt));
  const lead = 240 * ss(7.2, 9.5, t) / z * (1 - zt);
  let x = fx + lead, y = fy * 0.55;
  const k = easeIO(ss(18.5, 29.4, t));
  x = lerp(x, FINAL_CAM.x, k); y = lerp(y, FINAL_CAM.y, k);
  return { x, y, z };
}
let CAM = { x: 0, y: 0, z: 1 };
const toS = p => [(p[0] - CAM.x) * CAM.z + W / 2, (p[1] - CAM.y) * CAM.z + H / 2];

// ---------------------------------------------------------------- stars & nebula
const STARS = [];
{ const r = rng(7); for (let i = 0; i < 520; i++) STARS.push({ x: r(), y: r(), d: 0.15 + r() * 0.85, s: 0.6 + r() * 1.6, ph: r() * 6.28, sp: 0.5 + r() * 2 }); }

function drawBackground(t) {
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  const warm = ss(33, 40, t);
  const g = ctx.createRadialGradient(W / 2, H * 0.52, 0, W / 2, H * 0.52, W * 0.78);
  g.addColorStop(0, rgba(mixc([13, 18, 38], [26, 18, 22], warm), 1));
  g.addColorStop(0.5, rgba(mixc([7, 10, 22], [12, 9, 14], warm), 1));
  g.addColorStop(1, '#020308');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

  ctx.globalCompositeOperation = 'lighter';
  const nb = 0.10 + 0.05 * ss(19, 24, t);
  sprite(SPR.blue, W * (0.28 + 0.03 * Math.sin(t * 0.11)), H * (0.38 + 0.03 * Math.cos(t * 0.13)), 1500, nb * (1 - warm * 0.5), 1.3, 0.9);
  sprite(SPR.violet, W * (0.76 + 0.03 * Math.cos(t * 0.09)), H * (0.66 + 0.04 * Math.sin(t * 0.12)), 1300, nb * 0.85, 1.2, 0.85);
  sprite(SPR.gold, W * 0.5, H * 0.45, 1600, 0.09 * warm, 1.4, 0.7);

  // star dust with parallax
  const intro = ss(0.0, 1.6, t);
  for (let i = 0; i < STARS.length; i++) {
    const s = STARS[i];
    const par = 0.10 * s.d;
    let x = s.x * (W + 200) - CAM.x * par * Math.sqrt(CAM.z) - t * 4 * s.d;
    let y = s.y * (H + 200) - CAM.y * par * Math.sqrt(CAM.z) - t * 1.5 * s.d;
    x = ((x % (W + 200)) + W + 200) % (W + 200) - 100;
    y = ((y % (H + 200)) + H + 200) % (H + 200) - 100;
    const tw = 0.55 + 0.45 * Math.sin(t * s.sp + s.ph);
    const a = intro * tw * (0.18 + 0.5 * s.d) * 0.55;
    sprite(i % 7 === 0 ? SPR.warm : SPR.blue, x, y, s.s * 7, a);
  }
}

// ---------------------------------------------------------------- path drawing
function pathTo(s, fEnd) {
  const target = fEnd * s.len;
  let p = toS(s.pts[0]);
  ctx.moveTo(p[0], p[1]);
  for (let i = 1; i < s.pts.length; i++) {
    if (s.cum[i] >= target) {
      const q = toS(segPoint(s, fEnd)); ctx.lineTo(q[0], q[1]); return;
    }
    p = toS(s.pts[i]); ctx.lineTo(p[0], p[1]);
  }
}
function strokeGlow(s, f, col, alpha, w, passes) {
  if (f <= 0 || alpha <= 0.003) return;
  ctx.beginPath(); pathTo(s, f);
  for (const [mw, ma] of passes) {
    ctx.lineWidth = w * mw; ctx.strokeStyle = rgba(col, alpha * ma); ctx.stroke();
  }
}
const CHOSEN_PASSES = [[9, 0.035], [4.2, 0.09], [2.0, 0.28], [1, 0.95]];
const GHOST_PASSES = [[8, 0.045], [3.2, 0.16], [1.3, 0.55], [0.7, 1.0]];

function ghostAlpha(t) {
  if (t < T.choice) return 0;
  if (t < T.ghostWake) return lerp(0.95, 0.32, ss(T.choice + 0.8, T.choice + 3.6, t));
  return lerp(0.32, 1, ss(T.ghostWake, T.ghostWake + 1.8, t));
}

function drawPaths(t, fade) {
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const z = CAM.z;
  const ga = ghostAlpha(t) * fade;

  // ghosts
  if (ga > 0) {
    for (const s of segs) {
      if (s.kind !== 'ghost' || t <= s.t0) continue;
      const f = s.depth === 1 ? ss(0, 1, (t - s.t0) / (s.t1 - s.t0)) : easeOut(clamp((t - s.t0) / (s.t1 - s.t0)));
      const col = ghostColor(s.depth, s.phase);
      const w = Math.max(1.15, 2.2 * z * (1 - s.depth * 0.08));
      strokeGlow(s, f, col, ga * (1 - s.depth * 0.07), w, GHOST_PASSES);
    }
    // nodes, leaf blooms and travelling pulses
    for (const s of segs) {
      if (s.kind !== 'ghost' || t < s.t1) continue;
      const age = t - s.t1;
      const col = s.depth > 3 ? SPR.cyan : SPR.violet;
      if (s.kids === 0) {
        const pop = 1 + 1.6 * Math.exp(-age * 5);
        const q = toS(s.p1);
        sprite(col, q[0], q[1], (10 + 18 * z) * pop, ga * 0.75 * (0.75 + 0.25 * Math.sin(t * 2 + s.phase * 9)));
      }
      if (t > T.ghostWake + 1.2) {
        const u = ((t - Math.max(s.t1, T.ghostWake)) * 0.45 + s.phase) % 1;
        const q = toS(segPoint(s, u));
        sprite(SPR.cyan, q[0], q[1], 8 + 14 * z, ga * 0.55 * Math.sin(u * Math.PI));
      }
    }
  }

  // chosen road
  for (const s of chosen) {
    if (t <= s.t0) continue;
    const f = chosenProgress(s, t);
    const w = Math.max(1.4, 2.7 * z);
    strokeGlow(s, f, GOLD, 0.95 * fade, w, CHOSEN_PASSES);
  }
  // fork markers on the chosen road
  for (const fk of forks) {
    if (t < fk.t) continue;
    const q = toS(fk.p), age = t - fk.t;
    sprite(SPR.gold, q[0], q[1], (14 + 26 * z) * (1 + 1.2 * Math.exp(-age * 4)), 0.8 * fade);
  }
}

// dotted previews of the two possible roads, pulsing alternately while the light hesitates
function drawPreviews(t) {
  if (t < 9.6 || t > T.choice + 0.6) return;
  const appear = ss(9.6, 10.6, t), gone = 1 - ss(T.choice, T.choice + 0.6, t);
  const up = chosen[1], down = segs.find(s => s.kind === 'ghost' && s.depth === 1);
  ctx.globalCompositeOperation = 'lighter';
  ctx.setLineDash([1, 15 * CAM.z]); ctx.lineCap = 'round';
  [[up, 0], [down, 1]].forEach(([s, side]) => {
    let pulse = 0;
    HESITATE.forEach((hb, i) => { if (i % 2 === side && t >= hb) pulse = Math.max(pulse, Math.exp(-(t - hb) * 2.6)); });
    const a = appear * gone * (0.25 + 0.75 * pulse);
    ctx.beginPath(); pathTo(s, 1);
    ctx.lineWidth = 5 * CAM.z; ctx.strokeStyle = rgba(side ? BLUE : GOLD, a * 0.9); ctx.stroke();
    ctx.lineWidth = 14 * CAM.z; ctx.strokeStyle = rgba(side ? BLUE : GOLD, a * 0.12); ctx.stroke();
    const q = toS(s.p1);
    sprite(side ? SPR.blue : SPR.gold, q[0], q[1], 40 * CAM.z * (1 + pulse), a * 0.8);
  });
  ctx.setLineDash([]);
}

function drawShock(t) {
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < forks.length; i++) {
    const te = forks[i].t, k = i === 0 ? 1.0 : 0.35;
    const age = t - te; if (age < 0 || age > 1.6) continue;
    const q = toS(forks[i].p);
    const r = (40 + age * 520 * k) * Math.sqrt(CAM.z);
    const a = Math.pow(1 - age / 1.6, 2) * 0.55 * k;
    ctx.beginPath(); ctx.arc(q[0], q[1], r, 0, Math.PI * 2);
    ctx.lineWidth = 2.2; ctx.strokeStyle = rgba(WARM, a); ctx.stroke();
    ctx.lineWidth = 10; ctx.strokeStyle = rgba(GOLD, a * 0.15); ctx.stroke();
    if (te === T.choice) sprite(SPR.warm, q[0], q[1], 900, a * 0.6);
  }
}

function drawLight(t, fade) {
  if (t < T.ignite) return;
  const ign = ss(T.ignite, T.ignite + 1.4, t);
  const flash = Math.exp(-Math.max(0, t - T.ignite) * 2.2) * ss(T.ignite, T.ignite + 0.15, t);
  let hes = 0; HESITATE.forEach(hb => { if (t >= hb) hes = Math.max(hes, Math.exp(-(t - hb) * 3)); });
  const breath = 0.92 + 0.08 * Math.sin(t * 2.4);
  const zs = 0.55 + 0.45 * Math.sqrt(CAM.z);
  const p = toS(lightPos(t));
  const I = ign * fade * breath;
  ctx.globalCompositeOperation = 'lighter';

  // sparks shed by the light
  const rate = 40, life = 1.4;
  const k0 = Math.floor((t - life) * rate), k1 = Math.floor(t * rate);
  for (let k = Math.max(Math.ceil(T.ignite * rate), k0); k <= k1; k++) {
    const te = k / rate, age = t - te;
    if (age < 0 || age > life) continue;
    const o = toS(lightPos(te));
    const ang = hash(k * 3 + 1) * Math.PI * 2, sp = (14 + hash(k * 3 + 2) * 46) * zs;
    const x = o[0] + Math.cos(ang) * sp * age, y = o[1] + Math.sin(ang) * sp * age - 18 * age * age;
    const a = Math.pow(1 - age / life, 2) * 0.8 * fade * ign;
    sprite(hash(k * 3 + 3) < 0.7 ? SPR.gold : SPR.warm, x, y, (5 + hash(k) * 7) * zs, a);
  }

  sprite(SPR.gold, p[0], p[1], 520 * zs * (1 + 0.4 * hes), I * 0.22);
  sprite(SPR.gold, p[0], p[1], 170 * zs * (1 + 0.3 * hes), I * 0.75);
  sprite(SPR.warm, p[0], p[1], 46 * zs, I);
  sprite(SPR.white, p[0], p[1], 16 * zs, I);
  // anamorphic streak
  sprite(SPR.warm, p[0], p[1], 120 * zs, I * 0.55, 6.5, 0.045);
  sprite(SPR.gold, p[0], p[1], 120 * zs, I * 0.25, 12, 0.09);
  if (flash > 0.001) {
    sprite(SPR.warm, p[0], p[1], 1100, flash * 0.55);
    sprite(SPR.white, p[0], p[1], 300, flash * 0.6, 8, 0.05);
  }
}

// ---------------------------------------------------------------- particles → 「选择」
const GLYPH = { text: '选择', size: 380, y: H * 0.43 };
let SWARM = null;
function buildSwarm() {
  CAM = FINAL_CAM;
  // sources: points along every road, as it stands at the moment of dissolve
  const src = [];
  const spacing = 2.3;
  for (const s of segs) {
    const n = Math.max(2, Math.ceil(s.len * CAM.z / spacing));
    for (let i = 0; i < n; i++) {
      const q = toS(segPoint(s, (i + hash(src.length * 7 + 5)) / n));
      const chosenRoad = s.kind === 'chosen';
      src.push({ x: q[0], y: q[1], chosen: chosenRoad, tint: chosenRoad ? 3 : Math.min(3, s.depth - 1) });
    }
  }
  // targets: pixels of the title glyphs
  const off = document.createElement('canvas'); off.width = W; off.height = H;
  const o = off.getContext('2d');
  o.fillStyle = '#fff'; o.textAlign = 'center'; o.textBaseline = 'middle';
  o.font = `600 ${GLYPH.size}px NSC`; o.letterSpacing = '70px';
  o.fillText(GLYPH.text, W / 2 + 35, GLYPH.y);
  const img = o.getImageData(0, 0, W, H).data;
  const filled = [];
  for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) if (img[(y * W + x) * 4 + 3] > 140) filled.push([x, y]);
  const r = rng(4242);
  const maxN = 11000;
  let chosenSrc = src;
  if (src.length > maxN) { chosenSrc = []; const step = src.length / maxN; for (let i = 0; i < maxN; i++) chosenSrc.push(src[Math.floor(i * step)]); }
  const tg = chosenSrc.map(() => { const f = filled[Math.floor(r() * filled.length)]; return [f[0] + (r() - 0.5) * 2, f[1] + (r() - 0.5) * 2]; });
  // pair left→left, right→right for a sweeping flow
  const sIdx = chosenSrc.map((s, i) => [s.x + (r() - 0.5) * 260, i]).sort((a, b) => a[0] - b[0]).map(a => a[1]);
  const tIdx = tg.map((p, i) => [p[0] + (r() - 0.5) * 120, i]).sort((a, b) => a[0] - b[0]).map(a => a[1]);
  SWARM = sIdx.map((si, k) => {
    const s = chosenSrc[si], g = tg[tIdx[k]];
    const delay = 0.7 + (s.x / W) * 1.5 + r() * 0.6;
    return {
      sx: s.x, sy: s.y, tx: g[0], ty: g[1], tint: s.tint, chosen: s.chosen,
      start: T.dissolve + delay, dur: 2.5 + r() * 1.0,
      amp: (r() < 0.5 ? -1 : 1) * (60 + r() * 200) * (0.6 + 0.4 * Math.sin(s.x * 0.004)), ph: r() * 6.283, sz: s.chosen ? 1.25 : 0.9 + r() * 0.5,
    };
  });
  // arrival times exported for the score
  window.ARRIVALS = SWARM.map(p => p.start + p.dur).sort((a, b) => a - b);
}

function drawSwarm(t) {
  if (t < T.dissolve - 0.1) return;
  ctx.globalCompositeOperation = 'lighter';
  const appear = ss(T.dissolve - 0.1, T.dissolve + 0.5, t);
  const out = ss(T.fadeOut, T.end - 0.6, t);
  const cx = W / 2, cy = GLYPH.y;
  for (let i = 0; i < SWARM.length; i++) {
    const p = SWARM[i];
    const u = clamp((t - p.start) / p.dur), e = easeIO(u);
    const dx = p.tx - p.sx, dy = p.ty - p.sy, dl = Math.hypot(dx, dy) + 1e-6;
    const arc = Math.sin(Math.PI * e) * p.amp;
    let x = lerp(p.sx, p.tx, e) - dy / dl * arc;
    let y = lerp(p.sy, p.ty, e) + dx / dl * arc;
    // pre-flight shimmer and settled breathing
    const jig = (1 - e) * 1.6 + e * 0.7;
    x += Math.sin(t * 2.1 + p.ph) * jig; y += Math.cos(t * 1.7 + p.ph * 1.3) * jig;
    if (out > 0) { x += (x - cx) * out * 0.08 + Math.sin(p.ph * 5) * out * 30; y += (y - cy) * out * 0.06 - out * 40 * (0.5 + hash(i)); }
    const goldMix = p.chosen ? 1 : clamp(e * 0.92);
    const spr = dotSprite(p.chosen ? 3 : p.tint, goldMix);
    const sparkle = hash(i * 13 + Math.floor(t * 6)) > 0.985 ? 2.2 : 1;
    const moving = Math.sin(Math.PI * u);
    const a = appear * (0.42 + 0.25 * moving) * sparkle * (1 - out);
    const sz = (6.5 + 4 * moving) * p.sz * (sparkle > 1 ? 1.6 : 1);
    sprite(spr, x, y, sz, a);
    if (moving > 0.35 && (i & 15) === 0) { // comet tails on a few
      const e2 = easeIO(clamp((t - 0.14 - p.start) / p.dur)), arc2 = Math.sin(Math.PI * e2) * p.amp;
      const x2 = lerp(p.sx, p.tx, e2) - dy / dl * arc2, y2 = lerp(p.sy, p.ty, e2) + dx / dl * arc2;
      ctx.globalAlpha = a * 0.35 * moving; ctx.strokeStyle = rgba(mixc(BLUE, GOLD, goldMix), 1);
      ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(x2, y2); ctx.lineTo(x, y); ctx.stroke();
    }
  }
}

function drawTitle(t) {
  if (t < 34.5) return;
  const out = 1 - ss(T.fadeOut, T.end - 0.8, t);
  const a = ss(34.8, 37.2, t) * out;
  ctx.save();
  // soft back-light
  ctx.globalCompositeOperation = 'lighter';
  sprite(SPR.gold, W / 2, GLYPH.y, 1300, 0.16 * a, 1.5, 0.75);
  // crisp glyph, gently gilded
  ctx.globalCompositeOperation = 'source-over';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `600 ${GLYPH.size}px NSC`; ctx.letterSpacing = '70px';
  const gr = ctx.createLinearGradient(0, GLYPH.y - 190, 0, GLYPH.y + 190);
  gr.addColorStop(0, 'rgba(255,244,222,1)'); gr.addColorStop(0.55, 'rgba(255,205,130,1)'); gr.addColorStop(1, 'rgba(214,140,70,1)');
  ctx.fillStyle = gr; ctx.globalAlpha = 0.34 * a;
  ctx.shadowColor = 'rgba(255,180,90,0.9)'; ctx.shadowBlur = 40;
  ctx.fillText(GLYPH.text, W / 2 + 35, GLYPH.y);
  ctx.shadowBlur = 0;

  // CHOICE + hairline
  const a2 = ss(37.0, 38.6, t) * out;
  if (a2 > 0) {
    ctx.font = '300 44px Corm'; ctx.letterSpacing = '30px';
    ctx.fillStyle = rgba(WARM, 1); ctx.globalAlpha = a2 * 0.9;
    ctx.shadowColor = 'rgba(255,190,110,0.6)'; ctx.shadowBlur = 18;
    ctx.fillText('CHOICE', W / 2 + 15, GLYPH.y + 262);
    ctx.shadowBlur = 0;
    const lw = 520 * easeOut(ss(37.3, 39.0, t));
    const lg = ctx.createLinearGradient(W / 2 - lw / 2, 0, W / 2 + lw / 2, 0);
    lg.addColorStop(0, 'rgba(255,200,120,0)'); lg.addColorStop(0.5, 'rgba(255,215,150,0.9)'); lg.addColorStop(1, 'rgba(255,200,120,0)');
    ctx.fillStyle = lg; ctx.globalAlpha = a2;
    ctx.fillRect(W / 2 - lw / 2, GLYPH.y + 212, lw, 1.2);
  }
  ctx.restore();
}

// ---------------------------------------------------------------- captions
function drawCaption(t, c) {
  if (t < c.t0 || t > c.t1) return;
  const fo = 1 - ss(c.t1 - 0.9, c.t1, t);
  const size = c.size || 46;
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  ctx.font = `300 ${size}px NSC`; ctx.letterSpacing = '0px';
  const sp = size * 0.30;
  const chars = [...c.zh];
  const ws = chars.map(ch => ctx.measureText(ch).width);
  const total = ws.reduce((a, b) => a + b, 0) + sp * (chars.length - 1);
  let x = W / 2 - total / 2;
  chars.forEach((ch, i) => {
    const st = c.t0 + i * 0.075, p = ss(st, st + 1.0, t), a = p * fo;
    if (a > 0.003) {
      ctx.globalAlpha = a;
      ctx.filter = `blur(${((1 - p) * 7).toFixed(2)}px)`;
      ctx.shadowColor = 'rgba(255,196,130,0.55)'; ctx.shadowBlur = 22;
      ctx.fillStyle = '#f5ecdc';
      ctx.fillText(ch, x, c.y + (1 - easeOut(p)) * 14);
    }
    x += ws[i] + sp;
  });
  ctx.filter = 'none';
  if (c.en) {
    const pe = ss(c.t0 + 0.7, c.t0 + 2.0, t) * fo;
    ctx.globalAlpha = pe * 0.72; ctx.shadowBlur = 0;
    ctx.textAlign = 'center'; ctx.font = 'italic 300 30px Corm'; ctx.letterSpacing = '3px';
    ctx.fillStyle = '#ddd6ea';
    ctx.fillText(c.en, W / 2, c.y + 58);
  }
  ctx.restore();
}

// ---------------------------------------------------------------- frame
function renderTime(t) {
  CAM = camAt(t);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.filter = 'none'; ctx.globalAlpha = 1; ctx.shadowBlur = 0; ctx.letterSpacing = '0px';
  drawBackground(t);
  const lineFade = 1 - ss(T.dissolve, T.dissolve + 0.9, t);
  if (lineFade > 0) {
    drawPreviews(t);
    drawPaths(t, lineFade);
    drawShock(t);
    drawLight(t, lineFade);
  }
  drawSwarm(t);
  drawTitle(t);
  for (const c of CAPTIONS) drawCaption(t, c);

  // finishing: vignette, grain, fades
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  ctx.drawImage(VIG, 0, 0);
  const f = Math.round(t * FPS);
  ctx.globalCompositeOperation = 'overlay'; ctx.globalAlpha = 0.07;
  const g = GRAIN[f % 4], ox = -Math.floor(hash(f) * 256), oy = -Math.floor(hash(f + 999) * 256);
  for (let y = oy; y < H; y += 256) for (let x = ox; x < W; x += 256) ctx.drawImage(g, x, y);
  ctx.globalCompositeOperation = 'source-over';
  const black = Math.max(1 - ss(0, 0.8, t), ss(T.end - 1.4, T.end - 0.2, t));
  if (black > 0) { ctx.globalAlpha = black; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); }
  ctx.globalAlpha = 1;
}

window.renderFrame = i => renderTime(i / FPS);
window.renderTime = renderTime;
window.META = { W, H, FPS, DURATION, T, HESITATE, forks: forks.map(f => ({ t: f.t, sign: f.sign })), captions: CAPTIONS.map(c => c.t0) };

window.ready = (async () => {
  await Promise.all([
    document.fonts.load(`300 46px NSC`, '选择'), document.fonts.load(`600 380px NSC`, '选择'),
    document.fonts.load('300 44px Corm', 'CHOICE'), document.fonts.load('italic 300 30px Corm', 'Every'),
  ]);
  await document.fonts.ready;
  buildSwarm();
  window.META.arrivals = window.ARRIVALS.filter((_, i) => i % 50 === 0);
  window.META.segCount = segs.length; window.META.swarm = SWARM.length; window.META.zf = ZF;
  // preview in a normal browser: play in real time
  if (!navigator.webdriver) {
    const t0 = performance.now();
    const loop = () => { renderTime(((performance.now() - t0) / 1000) % DURATION); requestAnimationFrame(loop); };
    loop();
  }
  return true;
})();
