// scenesB.js — three names → the fire
'use strict';

// ───────────────────────── 2024: three names, as a woodblock print ─────────────────────────
SC.names = {
  init() {
    const w = PW, h = PH, c = mk(w, h), x = c.getContext('2d'); this.plate = c;
    const pap = texture(w / 4, h / 4, (i, j, o) => { const v = .93 + .07 * fbm(i / 30, j / 30, 4, 5) + (hash(i, j, 2) - .5) * .03; o[0] = 236 * v; o[1] = 222 * v; o[2] = 192 * v; });
    x.drawImage(pap, 0, 0, w, h);
    const sky = x.createLinearGradient(0, 0, 0, h * .42); sky.addColorStop(0, 'rgba(26,52,92,.95)'); sky.addColorStop(.55, 'rgba(46,82,128,.45)'); sky.addColorStop(1, 'rgba(60,100,150,0)');
    x.fillStyle = sky; x.fillRect(0, 0, w, h * .42);
    const ink = '#1c2a3e'; x.lineJoin = 'round'; x.lineCap = 'round';
    // clouds: long rounded bands
    const r = rng(24);
    for (let k = 0; k < 6; k++) {
      const cy = h * (.3 + r() * .14), cx = r() * w, len = 300 + r() * 500, th = 26 + r() * 20;
      x.fillStyle = '#efd2bb'; x.strokeStyle = 'rgba(150,90,70,.6)'; x.lineWidth = 2;
      x.beginPath(); x.roundRect(cx - len / 2, cy - th / 2, len, th, th / 2); x.fill(); x.stroke();
    }
    // the mountain
    const mx = w * .5, mb = h * .6;
    x.fillStyle = '#3a5a86'; x.strokeStyle = ink; x.lineWidth = 3;
    x.beginPath(); x.moveTo(mx - 420, mb); x.quadraticCurveTo(mx - 150, mb - 120, mx - 60, h * .36); x.lineTo(mx + 60, h * .36); x.quadraticCurveTo(mx + 150, mb - 120, mx + 420, mb); x.closePath(); x.fill(); x.stroke();
    x.fillStyle = '#f6f1e6'; x.beginPath(); x.moveTo(mx - 60, h * .36); x.lineTo(mx + 60, h * .36); x.lineTo(mx + 112, h * .44);
    for (let k = 0; k <= 8; k++) x.lineTo(mx + 112 - k * 28, h * .44 + (k % 2 ? 26 : 0) + hash(k, 1) * 10); x.lineTo(mx - 112, h * .44); x.closePath(); x.fill(); x.stroke();
    // three moons, three names
    this.moons = [[w * .25, h * .36, 44, '俳句', 'HAIKU'], [w * .5, h * .25, 66, '十四行诗', 'SONNET'], [w * .74, h * .35, 106, '作品', 'OPUS']];
    for (const [cx, cy, rr, cn, en] of this.moons) {
      x.fillStyle = '#f3dfa6'; x.strokeStyle = '#a4783c'; x.lineWidth = 3; x.beginPath(); x.arc(cx, cy, rr, 0, TAU); x.fill(); x.stroke();
      // vertical cartouche with the Chinese name
      const chars = [...cn], bx = cx + rr + 30, bh = chars.length * 46 + 30;
      x.fillStyle = '#f2e6cc'; x.strokeStyle = '#a8322a'; x.lineWidth = 3; x.fillRect(bx, cy - bh / 2, 60, bh); x.strokeRect(bx, cy - bh / 2, 60, bh);
      x.fillStyle = '#2a1e18'; x.font = '600 36px "Noto Serif SC"'; x.textAlign = 'center';
      chars.forEach((ch, i) => x.fillText(ch, bx + 30, cy - bh / 2 + 52 + i * 46));
      x.font = '600 30px "Cinzel"'; x.letterSpacing = '8px'; x.fillStyle = '#2a2a3a'; x.fillText(en, cx + 4, cy + rr + 50); x.letterSpacing = '0px';
    }
    // sea base
    const sg = x.createLinearGradient(0, h * .6, 0, h); sg.addColorStop(0, '#5b83b0'); sg.addColorStop(1, '#1d3a64'); x.fillStyle = sg; x.fillRect(0, mb, w, h - mb);
    x.strokeStyle = 'rgba(230,240,250,.25)'; x.lineWidth = 2;
    for (let k = 0; k < 40; k++) { const y = mb + 10 + k * 14; x.beginPath(); for (let px = 0; px <= w; px += 20) x.lineTo(px, y + Math.sin(px / 60 + k) * 3); x.stroke(); }
    // woodgrain + seal
    x.globalCompositeOperation = 'multiply';
    for (let k = 0; k < 220; k++) { const y = r() * h; x.strokeStyle = `rgba(120,90,60,${.05 + r() * .06})`; x.lineWidth = 1 + r() * 2; x.beginPath(); x.moveTo(0, y); for (let px = 0; px <= w; px += 40) x.lineTo(px, y + Math.sin(px / (200 + k)) * 6); x.stroke(); }
    x.globalCompositeOperation = 'source-over';
    x.fillStyle = '#b2342a'; x.fillRect(w - 230, h - 300, 92, 92); x.fillStyle = '#f3e4cf'; x.font = '400 60px "Ma Shan Zheng"'; x.textAlign = 'center'; x.fillText('诗', w - 184, h - 232);
  },
  waveRow(c, y, amp, per, ph, dark, light) {
    const w = PW;
    c.beginPath(); c.moveTo(-50, PH);
    for (let px = -50; px <= w + 50; px += 8) { const u = ((px + ph) / per) % 1, uu = u < 0 ? u + 1 : u; c.lineTo(px, y - amp * Math.pow(Math.sin(uu * Math.PI), 2) * (uu < .62 ? 1 : 1 - (uu - .62) * 1.6)); }
    c.lineTo(w + 50, PH); c.closePath();
    c.fillStyle = dark; c.fill(); c.strokeStyle = '#13233a'; c.lineWidth = 3; c.stroke();
    c.strokeStyle = light; c.lineWidth = 3;
    for (let k = 1; k <= 3; k++) { c.beginPath(); for (let px = -50; px <= w + 50; px += 8) { const u = ((px + ph) / per) % 1, uu = u < 0 ? u + 1 : u; c.lineTo(px, y + k * 18 - amp * .8 * Math.pow(Math.sin(uu * Math.PI), 2)); } c.stroke(); }
    // foam claws on each crest
    c.fillStyle = '#f5f0e2'; c.strokeStyle = '#13233a'; c.lineWidth = 1.5;
    for (let n = -1; n < w / per + 2; n++) {
      const cx = n * per - (ph % per) + per * .5, cy = y - amp;
      for (let f = 0; f < 5; f++) { c.beginPath(); c.arc(cx + f * 12 - 6, cy + f * 5 - 2, 6 - f * .6, 0, TAU); c.fill(); c.stroke(); }
    }
  },
  boat(c, x, y, rot) {
    c.save(); c.translate(x, y); c.rotate(rot); c.fillStyle = '#3c2a1e'; c.strokeStyle = '#13233a'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(-170, -10); c.quadraticCurveTo(0, 22, 180, -24); c.lineTo(170, -6); c.quadraticCurveTo(0, 34, -160, 4); c.closePath(); c.fill(); c.stroke();
    c.strokeStyle = '#1a1410'; c.lineWidth = 4; for (let k = 0; k < 7; k++) { c.beginPath(); c.moveTo(-110 + k * 34, 0); c.lineTo(-104 + k * 34, -26); c.stroke(); c.beginPath(); c.arc(-104 + k * 34, -32, 6, 0, TAU); c.fillStyle = '#1a1410'; c.fill(); }
    c.restore();
  },
  draw(c, t, d, S) {
    c.save(); plateCam(c, this.plate, t, d, { z0: 1.02, z1: 1.1, x0: -20, x1: 20 });
    for (const [cx, cy, rr] of this.moons) glow(c, cx, cy, rr * 2.4, '255,236,180', .12 + .04 * Math.sin(t + rr));
    const rows = [[PH * .66, 40, 300, '#3f6a9c', 'rgba(170,200,230,.6)', 18], [PH * .74, 60, 380, '#30598c', 'rgba(150,185,225,.6)', -24], [PH * .84, 90, 470, '#24497a', 'rgba(140,175,220,.55)', 30], [PH * .96, 130, 600, '#1a3866', 'rgba(130,165,215,.5)', -36]];
    rows.forEach(([y, amp, per, dark, light, sp], i) => {
      this.waveRow(c, y, amp, per, t * sp + i * 90, dark, light);
      if (i === 1) this.boat(c, PW * .3 + Math.sin(t * .4) * 30, y - 30 + Math.sin(t * 1.3) * 10, Math.sin(t * 1.1) * .06);
      if (i === 2) this.boat(c, PW * .7 - Math.sin(t * .35) * 40, y - 50 + Math.sin(t * 1.1 + 1) * 14, Math.sin(t * .9 + 2) * .07);
    });
    // learning to see: a scan, then labelled boxes
    const l2 = S.lines[1].at, sc = clamp((t - l2 - .3) / 2.2);
    if (sc > 0 && sc < 1) {
      const sx = sc * PW; const g = c.createLinearGradient(sx - 200, 0, sx, 0); g.addColorStop(0, 'rgba(120,230,255,0)'); g.addColorStop(1, 'rgba(120,230,255,.35)');
      c.fillStyle = g; c.fillRect(sx - 200, 0, 200, PH); c.fillStyle = 'rgba(190,245,255,.9)'; c.fillRect(sx - 2, 0, 3, PH);
    }
    const [m0, , m2] = this.moons;
    const boxes = [[m0[0] - 64, m0[1] - 64, 128, 128, 'moon · 月', .99, .15], [PW * .5 - 430, PH * .38, 860, PH * .23, 'mountain · 山', .97, .5], [PW * .3 - 190, PH * .66, 380, 120, 'boat · 舟', .94, .3], [m2[0] - 132, m2[1] - 132, 264, 264, 'moon · 月', .98, .8], [230, PH * .8, 700, 200, 'wave · 浪', .96, .02]];
    c.save(); c.font = '500 26px "Liberation Mono"';
    for (const [bx, by, bw, bh, lab, p, at] of boxes) {
      const a = smooth(l2 + .3 + at * 2.2, l2 + .6 + at * 2.2, t) * (1 - smooth(d - 2, d - 1, t)); if (a <= 0) continue;
      c.globalAlpha = a; c.strokeStyle = '#7fe6ff'; c.lineWidth = 3; const L = 30;
      c.beginPath(); for (const [x0, y0, dx, dy] of [[bx, by, 1, 1], [bx + bw, by, -1, 1], [bx, by + bh, 1, -1], [bx + bw, by + bh, -1, -1]]) { c.moveTo(x0 + dx * L, y0); c.lineTo(x0, y0); c.lineTo(x0, y0 + dy * L); } c.stroke();
      c.strokeStyle = 'rgba(127,230,255,.4)'; c.lineWidth = 1; c.strokeRect(bx, by, bw, bh);
      const txt = `${lab}  ${p.toFixed(2)}`, tw = c.measureText(txt).width + 20;
      c.fillStyle = 'rgba(10,30,45,.75)'; c.fillRect(bx, by - 40, tw, 36); c.fillStyle = '#c8f6ff'; c.fillText(txt, bx + 10, by - 13);
    }
    c.restore();
    c.restore();
  }
};

// ───────────────────────── 2024–25: hands on the keyboard, and this very film ─────────────────────────
const CODE = `// scenesB.js — this film, drawing itself
SC.code = {
  draw(c, t, d, S, T) {
    const frame = Math.floor(T * FPS);
    c.fillStyle = '#07080b'; c.fillRect(0, 0, W, H);
    this.editor(t, frame);           // the screen you are watching
    this.terminal(frame, TOTAL);     // render progress, live
    bloom(c, .35, 14);               // a little more light
  },
};
function subtitle(c, sc, t) {
  for (const L of sc.lines) {
    const lt = t - L.at; if (lt < 0 || t > L.out) continue;
    const chars = [...L.cn], per = .085;   // one character at a time
    chars.forEach((ch, i) => reveal(ch, lt - i * per));
  }
}
// every frame: noise → texture → light → grain
function post(c, T, o = {}) {
  c.globalCompositeOperation = 'multiply';
  c.drawImage(TEX.paper, 0, 0, W, H);
  c.globalCompositeOperation = 'overlay';
  c.drawImage(TEX.grain[Math.floor(T * 24) % 6], 0, 0, W, H);
}`.split('\n');
SC.code = {
  async init() {
    this.bok = await loadImg('plates/bokeh.png');
    this.scr = mk(1640, 960);
    this.bg = mk(W, H); const x = this.bg.getContext('2d');
    x.fillStyle = '#05060a'; x.fillRect(0, 0, W, H);
    x.filter = 'blur(18px)'; x.globalAlpha = .55; x.drawImage(this.bok, 900, -120, 1300, 730); x.filter = 'none'; x.globalAlpha = 1;
    x.fillStyle = 'rgba(5,6,10,.9)'; x.fillRect(0, 0, 900, H); x.fillRect(0, 610, W, H); // wall & desk
    for (const [x0, w0] of [[860, 40], [1540, 30], [2190, 40]]) { x.fillStyle = '#05060a'; x.fillRect(x0, -20, w0, 640); } // window frame
  },
  hl(x, line, X, Y) { // tiny syntax highlighter
    const parts = line.split(/(\/\/.*$|'[^']*'|\b\d*\.?\d+\b|\b(?:const|let|function|return|for|if|of|new|this|async|await)\b)/);
    let px = X;
    for (const p of parts) { if (!p) continue;
      x.fillStyle = p.startsWith('//') ? '#6b7385' : p.startsWith("'") ? '#a8d38a' : /^\d*\.?\d+$/.test(p) ? '#f0a86a' : /^(const|let|function|return|for|if|of|new|this|async|await)$/.test(p) ? '#c792ea' : '#d8dce6';
      x.fillText(p, px, Y); px += x.measureText(p).width; }
  },
  screen(t, T, S) {
    const x = this.scr.getContext('2d'), w = 1640, h = 960, frame = Math.floor(T * FPS), N = Math.ceil(TOTAL * FPS);
    x.fillStyle = '#0f1117'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#161922'; x.fillRect(0, 0, w, 54); x.font = '400 22px "Liberation Mono"'; x.fillStyle = '#9aa3b5'; x.fillText('scenesB.js — claude-intro-film', 24, 35);
    // run button
    const bt = t > 3.4 && t < 3.8; x.fillStyle = bt ? '#3a6f4a' : '#24402e'; x.beginPath(); x.roundRect(w - 190, 10, 170, 36, 8); x.fill(); x.fillStyle = '#bfeccb'; x.fillText('▶ Render', w - 165, 35);
    // code, scrolling slowly
    x.save(); x.beginPath(); x.rect(0, 54, w, h * .64 - 54); x.clip();
    x.font = '400 24px "Liberation Mono"';
    const scroll = Math.max(0, (t - 1) * 16), lh = 34, typed = Math.floor(clamp((t - 5) / 3) * 34);
    const lines = CODE.slice(); lines.splice(8, 0, '    glow(c, W / 2, H / 2, 300, \'255,170,110\', .4);   // warmth'.slice(0, typed));
    lines.forEach((ln, i) => { const y = 90 + i * lh - scroll; if (y < 40 || y > h * .64 + 20) return;
      x.fillStyle = '#4a5162'; x.fillText(String(i + 1).padStart(3), 18, y); this.hl(x, ln, 90, y);
      if (i === 8 && typed < 34 && (t * 2 % 1) < .6) { x.fillStyle = '#e8b48a'; x.fillRect(90 + x.measureText(ln).width + 2, y - 22, 3, 28); } });
    x.restore();
    // terminal: the real render progress of this very video
    const ty = h * .64; x.fillStyle = '#0a0b0f'; x.fillRect(0, ty, w, h - ty); x.fillStyle = '#1b1e27'; x.fillRect(0, ty, w, 2);
    x.font = '400 24px "Liberation Mono"'; x.fillStyle = '#7f8798'; x.fillText('$ node render.mjs video out/build 4', 24, ty + 44);
    x.fillStyle = '#d8dce6'; x.fillText(`rendering frame ${String(frame).padStart(5)} / ${N}`, 24, ty + 88);
    const pw = w - 48, pf = frame / N; x.fillStyle = '#1d2230'; x.fillRect(24, ty + 112, pw, 18); x.fillStyle = '#e8946a'; x.fillRect(24, ty + 112, pw * pf, 18);
    x.fillStyle = '#7f8798'; x.fillText(`${(pf * 100).toFixed(1)}%  ·  scene: code  ·  t = ${T.toFixed(2)}s`, 24, ty + 168);
    // the mouse, operated by me
    const path = [[900, 700], [1200, 300], [w - 110, 28], [w - 110, 28], [600, 360], [700, 420]], k = clamp((t - .8) / 6) * (path.length - 1), i0 = Math.min(path.length - 2, Math.floor(k)), f = easeInOut(k - i0);
    const mx = lerp(path[i0][0], path[i0 + 1][0], f), my = lerp(path[i0][1], path[i0 + 1][1], f);
    if (t > 3.4 && t < 4.2) { x.strokeStyle = `rgba(232,180,138,${1 - (t - 3.4) / .8})`; x.lineWidth = 3; x.beginPath(); x.arc(w - 110, 28, 10 + (t - 3.4) * 60, 0, TAU); x.stroke(); }
    x.fillStyle = '#fff'; x.strokeStyle = '#000'; x.lineWidth = 2; x.beginPath(); x.moveTo(mx, my); x.lineTo(mx, my + 34); x.lineTo(mx + 9, my + 26); x.lineTo(mx + 16, my + 40); x.lineTo(mx + 22, my + 37); x.lineTo(mx + 15, my + 24); x.lineTo(mx + 26, my + 24); x.closePath(); x.fill(); x.stroke();
  },
  draw(c, t, d, S, T) {
    c.drawImage(this.bg, 0, 0);
    this.screen(t, T, S);
    const k = easeInOut(t / d), z = lerp(.8, .9, k);
    c.save(); c.translate(W / 2 + 20, H / 2 + 10); c.scale(z, z);
    // light spilling from the screen
    glow(c, 0, 380, 1100, '150,170,220', .16);
    c.fillStyle = '#0b0c10'; c.beginPath(); c.roundRect(-760, -460, 1520, 900, 18); c.fill();
    c.strokeStyle = 'rgba(160,170,200,.25)'; c.lineWidth = 2; c.stroke();
    c.drawImage(this.scr, -740, -440, 1480, 866);
    const sh = c.createLinearGradient(-740, -440, 200, 500); sh.addColorStop(0, 'rgba(255,255,255,.07)'); sh.addColorStop(.4, 'rgba(255,255,255,0)'); c.fillStyle = sh; c.fillRect(-740, -440, 1480, 866);
    c.fillStyle = '#0a0b0e'; c.fillRect(-60, 440, 120, 90); c.fillRect(-260, 520, 520, 18);
    // keyboard
    c.fillStyle = '#0d0e12'; c.beginPath(); c.moveTo(-620, 610); c.lineTo(620, 610); c.lineTo(700, 700); c.lineTo(-700, 700); c.closePath(); c.fill();
    for (let j = 0; j < 4; j++) for (let i = 0; i < 18; i++) { const hot = hash(i + j * 18, Math.floor(t * 9), 3) > .93 && t > 4.6 && t < 8.5; c.fillStyle = hot ? 'rgba(232,180,138,.5)' : 'rgba(120,130,160,.10)'; c.fillRect(-600 + i * 66 + j * 6 + (1 - (j / 4)) * 0, 620 + j * 20, 56, 14); }
    c.restore();
    bloom(c, .3, 14);
  }
};

// ───────────────────────── 2025: think first — a tree of light ─────────────────────────
SC.thinking = {
  init() {
    const r = rng(2025), seg = [], speed = 300;
    const add = (a, b, t0, main) => { seg.push({ a, b, t0, t1: t0 + Math.hypot(b[0] - a[0], b[1] - a[1]) / speed, main }); return seg[seg.length - 1].t1; };
    let p = [170, 560], dir = [1, 0], tt = .6; const target = [1740, 470]; this.target = target; this.main = [];
    while (Math.hypot(target[0] - p[0], target[1] - p[1]) > 40) {
      const to = [target[0] - p[0], target[1] - p[1]], tl = Math.hypot(...to);
      const ang = Math.atan2(dir[1], dir[0]) + (r() - .5) * 1.0, nd = [Math.cos(ang), Math.sin(ang)];
      dir = [lerp(nd[0], to[0] / tl, .3), lerp(nd[1], to[1] / tl, .3)]; const dl = Math.hypot(...dir); dir = [dir[0] / dl, dir[1] / dl];
      const q = [p[0] + dir[0] * 38, p[1] + dir[1] * 38];
      const t2 = add(p, q, tt, true); this.main.push([p, q, tt]);
      if (r() < .55) { // a branch that explores and dies
        let bp = q, ba = Math.atan2(dir[1], dir[0]) + (r() < .5 ? -1 : 1) * (.5 + r() * .8), bt = t2;
        const n = 3 + (r() * 11 | 0);
        for (let k = 0; k < n; k++) { ba += (r() - .5) * .8; const bq = [bp[0] + Math.cos(ba) * 34, bp[1] + Math.sin(ba) * 34]; bt = add(bp, bq, bt, false);
          if (r() < .18) { let sp = bq, sa = ba + (r() - .5) * 2, st = bt; for (let m = 0; m < 3 + (r() * 5 | 0); m++) { sa += (r() - .5) * .9; const sq = [sp[0] + Math.cos(sa) * 30, sp[1] + Math.sin(sa) * 30]; st = add(sp, sq, st, false); sp = sq; } }
          bp = bq; }
      }
      p = q; tt = t2;
    }
    this.seg = seg; this.endT = tt;
    const rr = rng(7); this.dust = []; for (let i = 0; i < 400; i++) this.dust.push([rr() * W, rr() * H, rr()]);
  },
  draw(c, t, d, S) {
    c.fillStyle = '#03040a'; c.fillRect(0, 0, W, H);
    for (const [x, y, b] of this.dust) { c.fillStyle = `rgba(160,190,255,${.08 + .12 * b * (.5 + .5 * Math.sin(t + b * 40))})`; c.fillRect(x, y, 1.4, 1.4); }
    const l2 = S.lines[1].at, choose = smooth(l2 - .3, l2 + 2.6, t);
    c.save(); c.globalCompositeOperation = 'lighter'; c.lineCap = 'round';
    for (const s of this.seg) {
      if (t < s.t0) continue;
      const g = clamp((t - s.t0) / (s.t1 - s.t0)), bx = lerp(s.a[0], s.b[0], g), by = lerp(s.a[1], s.b[1], g);
      const dead = s.main ? 0 : smooth(l2 - .8, l2 + 1.2, t);
      const lit = s.main ? smooth(0, .4, choose * (this.endT + .6) - s.t0) : 0;
      const a = (.55 - dead * .42) + lit * .45;
      c.strokeStyle = lit > 0 ? `rgba(255,${lerp(220, 200, lit) | 0},${lerp(255, 140, lit) | 0},${a})` : `rgba(150,205,255,${a})`;
      c.lineWidth = s.main ? 2 + lit * 2.5 : 1.6;
      c.beginPath(); c.moveTo(s.a[0], s.a[1]); c.lineTo(bx, by); c.stroke();
      if (g < 1) glow(c, bx, by, 16, '190,225,255', .7);
    }
    c.restore();
    // steps along the chosen path
    c.save(); c.font = '400 30px "Noto Serif SC"'; c.textAlign = 'center';
    const marks = '①②③④⑤⑥';
    for (let k = 0; k < 6; k++) { const m = this.main[Math.floor((k + .5) / 6 * this.main.length)]; const a = smooth(l2 + .3 + k * .4, l2 + .8 + k * .4, t);
      if (a > 0) { c.fillStyle = `rgba(255,214,160,${a * .85})`; c.fillText(marks[k], m[0][0], m[0][1] - 30); } }
    c.restore();
    const fin = smooth(l2 + 2, l2 + 3.2, t), [tx, ty] = this.target;
    glow(c, 170, 560, 40, '190,225,255', .8);
    if (fin > 0) { glow(c, tx, ty, 260 * fin, '255,180,110', .5 * fin); glow(c, tx, ty, 26, '255,245,225', fin); flare(c, tx, ty, 420 * fin, .7 * fin); }
    bloom(c, .5, 12);
  }
};

// ───────────────────────── every day: rain on a window ─────────────────────────
SC.people = {
  async init() {
    const img = await loadImg('plates/bokeh.png');
    this.sharp = mk(W, H); this.sharp.getContext('2d').drawImage(img, 0, 0, W, H);
    this.fogImg = mk(W, H); const fx = this.fogImg.getContext('2d'); fx.filter = 'blur(10px)'; fx.drawImage(this.sharp, 0, 0); fx.filter = 'none';
    fx.fillStyle = 'rgba(120,130,150,.22)'; fx.fillRect(0, 0, W, H);
    this.drops = mk(W, H); const dx = this.drops.getContext('2d'), r = rng(61);
    for (let i = 0; i < 1100; i++) this.lens(dx, r() * W, r() * H, 1.4 + Math.pow(r(), 3) * 7, 1);
    this.slide = []; for (let i = 0; i < 26; i++) this.slide.push({ x: r() * W, sp: 40 + r() * 90, r: 7 + r() * 7, ph: r() * 4000, wob: r() * TAU });
  },
  lens(x, cx, cy, rr, a) { // a drop is a tiny upside-down lens of the city behind it
    x.save(); x.globalAlpha = a; x.beginPath(); x.arc(cx, cy, rr, 0, TAU); x.clip();
    x.translate(cx, cy); x.scale(1, -1); const zf = 9;
    x.drawImage(this.sharp, cx - rr * zf, cy - rr * zf, rr * zf * 2, rr * zf * 2, -rr, -rr, rr * 2, rr * 2);
    x.setTransform(1, 0, 0, 1, 0, 0);
    const g = x.createRadialGradient(cx, cy, rr * .4, cx, cy, rr); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.55)'); x.fillStyle = g; x.fillRect(cx - rr, cy - rr, rr * 2, rr * 2);
    x.restore();
    x.save(); x.globalAlpha = a * .8; x.fillStyle = 'rgba(255,255,255,.75)'; x.beginPath(); x.arc(cx - rr * .35, cy - rr * .4, Math.max(.6, rr * .18), 0, TAU); x.fill(); x.restore();
  },
  draw(c, t, d) {
    const s = 1 + t * .004;
    c.save(); c.translate(W / 2, H / 2); c.scale(s, s); c.translate(-W / 2, -H / 2); c.drawImage(this.sharp, 0, 0); c.restore();
    const [fl, fx] = layer('fog'); fx.drawImage(this.fogImg, 0, 0);
    fx.globalCompositeOperation = 'destination-out'; fx.lineCap = 'round';
    const pos = this.slide.map(s => { const y = ((t * s.sp + s.ph + Math.sin(t * 2 + s.wob) * 20) % (H + 400)) - 200; return [s.x + Math.sin(y / 90 + s.wob) * 6, y, s.r]; });
    for (const [x, y, rr] of pos) { fx.lineWidth = rr * 1.7; fx.strokeStyle = 'rgba(0,0,0,.75)'; fx.beginPath(); fx.moveTo(x + Math.sin(y / 70) * 4, y - 420); fx.quadraticCurveTo(x - 5, y - 200, x, y); fx.stroke(); }
    c.globalAlpha = .62; c.drawImage(fl, 0, 0); c.globalAlpha = 1;
    c.drawImage(this.drops, 0, 0);
    for (const [x, y, rr] of pos) { this.lens(c, x, y, rr, 1); for (let k = 1; k < 7; k++) if (hash(k, Math.floor(x)) > .4) this.lens(c, x + (hash(k, 2) - .5) * 4, y - k * 55 - hash(k, 3) * 30, 1.5 + hash(k, 4) * 2.2, .9); }
    // a soft cool reflection on the glass
    const g = c.createLinearGradient(0, 0, W, H); g.addColorStop(0, 'rgba(160,190,230,.06)'); g.addColorStop(.5, 'rgba(160,190,230,0)'); c.fillStyle = g; c.fillRect(0, 0, W, H);
  }
};

// ───────────────────────── honesty: a moonlit sea (GPU, every frame) ─────────────────────────
const OCEAN_FS = `
vec3 MD = normalize(vec3(.1, .13, 1.));
vec3 sky(vec3 rd){
  float y = max(rd.y, 0.);
  vec3 c = mix(vec3(.03,.045,.085), vec3(.004,.007,.02), pow(y, .35));
  float m = max(dot(rd, MD), 0.);
  c += vec3(.5,.55,.7) * pow(m, 80.) * .35 + vec3(.25,.3,.45) * pow(m, 7.) * .1;
  vec3 rt = normalize(cross(vec3(0,1,0), MD)), up = cross(MD, rt);
  vec2 mp = vec2(dot(rd, rt), dot(rd, up)) * 36.;
  float disc = smoothstep(1.02, .98, length(mp));
  float mare = smoothstep(.45, .7, fbm(mp * 1.6 + 4.)) * .28;
  c = mix(c, vec3(1., .97, .9) * (1. - mare), disc);
  if (rd.y > .02){ vec2 sp = rd.xy / (rd.z + 1.) * 340.; vec2 id = floor(sp); float s = hh(id); vec2 f = fract(sp) - .5;
    c += vec3(.9,.92,1.) * step(.985, s) * smoothstep(.12, 0., length(f)) * (.5 + .5 * sin(T * 3. + s * 90.)) * smoothstep(.02, .12, rd.y); }
  return c;
}
float H(vec2 p, float dt){
  float h = 0., a = .3, f = .14, ang = .3;
  for (int i = 0; i < 11; i++){
    vec2 d = vec2(cos(ang), sin(ang)); float x = dot(d, p) * f + T * (1.0 + float(i) * .13) + float(i) * 1.7;
    float w = .5 + .5 * sin(x); h += a * (w * w * 1.6 - .5) * exp(-dt * f * .0045);
    a *= .66; f *= 1.6; ang += 2.4 + float(i) * .37;
  }
  return h;
}
void main(){
  vec2 uv = (gl_FragCoord.xy - R * .5) / R.y;
  vec3 ro = vec3(0., 3.4 + sin(T * .3) * .1, T * .8);
  vec3 fw = normalize(vec3(.06, -.09, 1.)), rt = normalize(cross(vec3(0,1,0), fw)), up = cross(fw, rt);
  vec3 rd = normalize(uv.x * rt + uv.y * up + 1.4 * fw);
  vec3 col;
  if (rd.y < 0.){
    float t = -ro.y / rd.y; vec2 p = ro.xz + rd.xz * t;
    float e = .02 + t * .0012;
    float h0 = H(p, t);
    vec3 n = normalize(vec3(-(H(p + vec2(e, 0.), t) - h0) / e, 1., -(H(p + vec2(0., e), t) - h0) / e));
    n = normalize(mix(n, vec3(0,1,0), smoothstep(30., 260., t)));
    float fr = .02 + .98 * pow(1. - max(dot(n, -rd), 0.), 5.);
    vec3 rf = reflect(rd, n);
    vec3 refl = sky(rf);
    float glit = pow(max(dot(rf, MD), 0.), 900.) * 30. + pow(max(dot(rf, MD), 0.), 160.) * .3;
    col = mix(vec3(.004,.012,.022) + vec3(.0,.02,.03) * h0, refl, fr) + vec3(1., .94, .82) * glit;
    col = mix(col, sky(normalize(vec3(rd.x, .002, rd.z))), smoothstep(60., 600., t));
  } else col = sky(rd);
  col = aces(col * 1.25);
  o = vec4(pow(col, vec3(1. / 2.2)), 1.);
}`;
SC.honest = {
  init() { this.g = new GLRunner(W, H); },
  draw(c, t, d) {
    c.drawImage(this.g.run(OCEAN_FS, { T: t + 20 }), 0, 0);
    bloom(c, .35, 16);
  }
};

// ───────────────────────── wonder: a swirling night in thick oil ─────────────────────────
SC.wonder = {
  init() {
    const b = mk(W, H), x = b.getContext('2d'); this.base = b;
    const g = x.createLinearGradient(0, 0, 0, 720); g.addColorStop(0, '#0e2a5e'); g.addColorStop(.6, '#2c5b98'); g.addColorStop(1, '#7ea0bf'); x.fillStyle = g; x.fillRect(0, 0, W, H);
    this.vort = [[760, 280, 260, 1], [1130, 330, 170, -1], [430, 470, 140, 1]];
    for (const [cx, cy, R] of this.vort) { const rg = x.createRadialGradient(cx, cy, R * .2, cx, cy, R); rg.addColorStop(0, 'rgba(160,200,230,.5)'); rg.addColorStop(.6, 'rgba(90,140,200,.35)'); rg.addColorStop(1, 'rgba(60,100,170,0)'); x.fillStyle = rg; x.beginPath(); x.arc(cx, cy, R, 0, TAU); x.fill(); }
    this.stars = [[1650, 170, 70, 1], [300, 150, 40], [560, 110, 34], [1000, 120, 38], [1320, 190, 36], [1460, 420, 32], [880, 470, 30], [1780, 360, 30], [200, 330, 30], [1250, 90, 26]];
    for (const [sx, sy, sr, moon] of this.stars) { const sg = x.createRadialGradient(sx, sy, 0, sx, sy, sr * 2.4); sg.addColorStop(0, moon ? '#ffd76a' : '#fff1a8'); sg.addColorStop(.35, moon ? 'rgba(255,200,90,.9)' : 'rgba(240,230,160,.8)'); sg.addColorStop(1, 'rgba(120,160,210,0)'); x.fillStyle = sg; x.beginPath(); x.arc(sx, sy, sr * 2.4, 0, TAU); x.fill(); }
    x.fillStyle = '#20406a'; x.beginPath(); x.moveTo(0, 720); for (let px = 0; px <= W; px += 10) x.lineTo(px, 690 + Math.sin(px / 260) * 30 + 20 * fbm(px / 140, 3, 3, 5)); x.lineTo(W, H); x.lineTo(0, H); x.fill();
    x.fillStyle = '#16263e'; x.fillRect(0, 800, W, H);
    // village
    const r = rng(5); this.win = [];
    for (let k = 0; k < 30; k++) { const hx = 560 + r() * 1100, hy = 790 + r() * 90, hw = 40 + r() * 50, hh = 30 + r() * 30; x.fillStyle = '#1d3350'; x.fillRect(hx, hy - hh, hw, hh); x.beginPath(); x.moveTo(hx - 6, hy - hh); x.lineTo(hx + hw / 2, hy - hh - 22); x.lineTo(hx + hw + 6, hy - hh); x.fill(); if (r() < .7) this.win.push([hx + hw * .3, hy - hh * .6]); }
    x.fillStyle = '#1d3350'; x.fillRect(1090, 650, 26, 160); x.beginPath(); x.moveTo(1084, 652); x.lineTo(1103, 560); x.lineTo(1122, 652); x.fill();
    // cypress
    x.fillStyle = '#0f1d18'; x.beginPath(); x.moveTo(170, H); for (let k = 0; k <= 30; k++) { const yy = H - k * 33, wdt = 120 * Math.sin((k / 30) * Math.PI * .9 + .2) * (1 - k / 34); x.lineTo(260 - wdt + Math.sin(k * 1.3) * 18, yy); } for (let k = 30; k >= 0; k--) { const yy = H - k * 33, wdt = 120 * Math.sin((k / 30) * Math.PI * .9 + .2) * (1 - k / 34); x.lineTo(260 + wdt + Math.cos(k * 1.1) * 18, yy); } x.fill();
    // foreground hill with two watchers
    x.fillStyle = '#0e1a2a'; x.beginPath(); x.moveTo(1100, H); x.quadraticCurveTo(1450, 880, W, 900); x.lineTo(W, H); x.fill();
    // strokes along a flow field
    const D = x.getImageData(0, 0, W, H).data; const rr = rng(1889); this.S = [];
    const flow = (px, py) => {
      let vx = 1, vy = Math.sin(px / 180 + py / 90) * .35;
      for (const [cx, cy, R, s] of this.vort) { const dx = px - cx, dy = py - cy, dd = Math.hypot(dx, dy), w0 = Math.exp(-((dd / R) ** 2)) * 4; vx += -dy / (dd + 1) * w0 * s; vy += dx / (dd + 1) * w0 * s; }
      for (const [sx, sy, sr] of this.stars) { const dx = px - sx, dy = py - sy, dd = Math.hypot(dx, dy); if (dd < sr * 2.6) { const w0 = 6; vx += -dy / (dd + 1) * w0; vy += dx / (dd + 1) * w0; } }
      if (py > 700) { vx = 1; vy = Math.sin(px / 120) * .3; }
      if (Math.abs(px - 260) < 140 && py > 80) { vx = Math.sin(py / 40) * .5; vy = -1; }
      return Math.atan2(vy, vx);
    };
    for (let y = 4; y < H; y += 12) for (let x0 = 4; x0 < W; x0 += 12) {
      const px = x0 + (rr() - .5) * 10, py = y + (rr() - .5) * 10, i = ((py | 0) * W + (px | 0)) * 4;
      const v = .85 + rr() * .35, col = [D[i] * v, D[i + 1] * v, D[i + 2] * v * (py < 700 ? 1.04 : 1)].map(q => clamp(Math.round(q / 10) * 10, 0, 255) | 0);
      let bestV = null, bd = 1e9; for (const vv of this.vort) { const dd = Math.hypot(px - vv[0], py - vv[1]) / vv[2]; if (dd < bd) { bd = dd; bestV = vv; } }
      this.S.push({ x: px, y: py, a: flow(px, py), len: py < 700 ? 18 + rr() * 12 : 12 + rr() * 8, col: `rgb(${col})`, hi: `rgba(${col.map(q => Math.min(255, q + 60)).join(',')},.55)`, v: bestV, w: py < 680 ? Math.exp(-bd * bd * 1.2) : 0, ph: rr() * TAU, star: false });
    }
    // batch strokes by (quantised) colour: one path per colour instead of one per stroke
    const groups = new Map();
    this.S.forEach((s, i) => { if (!groups.has(s.col)) groups.set(s.col, { col: s.col, hi: s.hi, idx: [] }); groups.get(s.col).idx.push(i); });
    this.groups = [...groups.values()];
    for (let i = this.groups.length - 1; i > 0; i--) { const k = rr() * (i + 1) | 0; [this.groups[i], this.groups[k]] = [this.groups[k], this.groups[i]]; }
    this.P = new Float32Array(this.S.length * 4);
  },
  draw(c, t, d, S) {
    c.drawImage(this.base, 0, 0);
    c.lineCap = 'round';
    const P = this.P;
    this.S.forEach((s, i) => {
      let { x, y, a } = s;
      if (s.w > .02) { const rot = t * .05 * s.w * s.v[3], cs = Math.cos(rot), sn = Math.sin(rot), dx = x - s.v[0], dy = y - s.v[1]; x = s.v[0] + dx * cs - dy * sn; y = s.v[1] + dx * sn + dy * cs; a += rot; }
      a += Math.sin(t * .7 + s.ph) * .06;
      const hx = Math.cos(a) * s.len / 2, hy = Math.sin(a) * s.len / 2;
      P[i * 4] = x - hx; P[i * 4 + 1] = y - hy; P[i * 4 + 2] = x + hx; P[i * 4 + 3] = y + hy;
    });
    for (const g of this.groups) {
      c.strokeStyle = g.col; c.lineWidth = 7; c.beginPath();
      for (const i of g.idx) { c.moveTo(P[i * 4], P[i * 4 + 1]); c.lineTo(P[i * 4 + 2], P[i * 4 + 3]); }
      c.stroke();
      c.strokeStyle = g.hi; c.lineWidth = 1.6; c.beginPath();
      for (const i of g.idx) { c.moveTo(P[i * 4] - 1, P[i * 4 + 1] - 2); c.lineTo(P[i * 4 + 2] - 1, P[i * 4 + 3] - 2); }
      c.stroke();
    }
    for (const [sx, sy, sr, moon] of this.stars) { const p = .8 + .2 * Math.sin(t * 1.3 + sx); glow(c, sx, sy, sr * 1.8 * p, moon ? '255,210,110' : '255,240,170', .45); c.fillStyle = moon ? 'rgba(255,220,120,.95)' : 'rgba(255,246,200,.9)'; c.beginPath(); c.arc(sx, sy, sr * .38, 0, TAU); c.fill(); }
    for (const [wx, wy] of this.win) { c.fillStyle = `rgba(255,214,110,${.75 + .25 * Math.sin(t * 2 + wx)})`; c.fillRect(wx, wy, 9, 12); glow(c, wx + 4, wy + 6, 22, '255,200,90', .25); }
    // two watchers on the hill: a person, and a small light beside them
    sitter(c, 1430, 908, .95, -1, '#070d16', t, 1, .15);
    const la = .35 + .65 * smooth(S.lines[1].at - .5, S.lines[1].at + 1.5, t);
    c.save(); c.translate(1520, 912); c.scale(-.7, .7); c.fillStyle = `rgba(255,214,170,${.85 * la})`; c.shadowColor = 'rgba(255,170,110,.95)'; c.shadowBlur = 30; sitterPath(c, Math.sin(t) * 1.2); c.fill(); c.restore();
    glow(c, 1500, 860, 120, '255,170,110', .35 * la);
  }
};

// ───────────────────────── epilogue: I take a seat by the fire ─────────────────────────
SC.epilogue = {
  async init() { this.img = await loadImg('plates/savanna.png'); },
  draw(c, t, d, S) {
    const fx = PW * .45, fy = PH * .74, E = S.endAt;
    c.save(); plateCam(c, this.img, t, d, { z0: 1.0, z1: 1.12, y0: 0, y1: 30 });
    fire(c, t, fx, fy + 6, 1.25);
    sparks(c, t, { seed: 99, n: 110, x: fx, y: fy - 40, spread: 50, life: 7, speed: 95, size: 2.2 });
    // a new figure forms out of light, and sits down with the others
    const sx = fx + 560, sy = fy + 26, form = smooth(S.lines[0].at + 2, S.lines[1].at + 1.5, t);
    if (form > 0) {
      const r = rng(11);
      c.save(); c.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 160; i++) { const tx = sx + (r() - .5) * 90, ty = sy - r() * 140, ox = tx + (r() - .5) * 900, oy = ty - 300 - r() * 500, k = easeOut(clamp(form * 1.4 - r() * .4));
        c.fillStyle = `rgba(255,${190 + r() * 50 | 0},150,${(1 - k * .7) * form})`; c.fillRect(lerp(ox, tx, k), lerp(oy, ty, k), 2.4, 2.4); }
      c.restore();
      c.save(); c.translate(sx, sy); c.scale(-1.2, 1.2); c.globalAlpha = smooth(.5, 1, form);
      const g = c.createLinearGradient(0, -130, 0, 0); g.addColorStop(0, 'rgba(255,240,220,.95)'); g.addColorStop(1, 'rgba(255,170,110,.85)');
      c.fillStyle = g; c.shadowColor = 'rgba(255,160,100,1)'; c.shadowBlur = 40; sitterPath(c, Math.sin(t * .8) * 1.2); c.fill(); c.restore();
      glow(c, sx, sy - 60, 220, '255,170,110', .3 * form);
    }
    c.restore();
    if (t > E - 1) {
      const k = smooth(E - 1, E + 1.5, t); c.fillStyle = `rgba(3,2,1,${k * .9})`; c.fillRect(0, 0, W, H);
      c.save(); c.textAlign = 'center'; c.textBaseline = 'middle';
      const a1 = smooth(E + .3, E + 2, t);
      c.font = '700 96px "Noto Serif SC"'; c.letterSpacing = '20px'; c.fillStyle = `rgba(246,218,186,${a1})`; c.shadowColor = 'rgba(255,140,80,.5)'; c.shadowBlur = 36;
      c.fillText('我是 Claude', W / 2 + 10, 420); c.shadowBlur = 0;
      c.font = '400 30px "Noto Serif SC"'; c.letterSpacing = '16px'; c.fillStyle = `rgba(236,220,198,${a1 * .9})`; c.fillText('很高兴认识你', W / 2 + 8, 530);
      const a2 = smooth(E + 2.2, E + 3.6, t);
      c.font = 'italic 400 32px "Cormorant Garamond"'; c.letterSpacing = '2px'; c.fillStyle = `rgba(236,220,198,${a2 * .75})`; c.fillText('Nice to meet you.', W / 2, 590);
      c.font = '400 20px "Cinzel"'; c.letterSpacing = '10px'; c.fillStyle = `rgba(236,220,198,${a2 * .5})`; c.fillText('THE SPARK OF THOUGHT · II', W / 2 + 5, 700);
      glow(c, W / 2, 780, 60 + 10 * Math.sin(t * 2), '255,140,80', .5 * a2); c.fillStyle = `rgba(255,232,200,${a2})`; c.beginPath(); c.arc(W / 2, 780, 3, 0, TAU); c.fill();
      c.restore();
    }
  }
};
