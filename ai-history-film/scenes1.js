// scenes1.js — prologue → 1958
'use strict';
const SC = {};

// ───────────────────────── PROLOGUE: an ember in the dark ─────────────────────────
SC.prologue = {
  init() { this.sky = makeSky({ top: [3, 4, 10], bot: [16, 10, 8], band: 1, bandY: .25, bandTilt: .3, seed: 3, stars: 2000 }); },
  draw(c, t, d, S) {
    c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
    const T0 = S.titleAt;
    c.save(); cam(c, t, d, { z0: 1.15, z1: 1.0, y0: 60, y1: 0 });
    c.globalAlpha = smooth(.5, 7, t); c.drawImage(this.sky, 0, 0); c.globalAlpha = 1;
    twinkle(c, t, 11, 90, H * .7, smooth(1, 7, t));
    c.restore();
    // ground
    const g = c.createLinearGradient(0, 700, 0, H); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(.3, '#050302'); g.addColorStop(1, '#020100');
    c.fillStyle = g; c.fillRect(0, 700, W, H - 700);
    // the ember
    const ex = W / 2, ey = 700, life = smooth(.2, 3, t), flare = smooth(T0 - .8, T0 + 1.6, t);
    const pulse = .85 + .15 * Math.sin(t * 2.3) + .1 * n1(t * 5, 2);
    glow(c, ex, ey, (260 + 500 * flare) * pulse, '255,110,40', .25 * life + .2 * flare);
    glow(c, ex, ey, (40 + 30 * flare) * pulse, '255,200,120', .9 * life);
    c.fillStyle = `rgba(255,236,200,${life})`; c.beginPath(); c.arc(ex, ey, 3.2 + 2 * flare, 0, TAU); c.fill();
    sparks(c, t, { seed: 5, n: 26 + (flare * 60 | 0), x: ex, y: ey, spread: 30, life: 5, speed: 60, size: 1.6, a: life });
    // title card
    if (t > T0 - 1) {
      const tt = t - T0;
      c.save(); c.textAlign = 'center'; c.textBaseline = 'middle';
      const title = [...'思想的火种'];
      c.font = '700 132px "Noto Serif SC"'; c.letterSpacing = '30px';
      const ws = title.map(ch => c.measureText(ch).width); let x = W / 2 - ws.reduce((a, b) => a + b) / 2 + 15;
      title.forEach((ch, i) => {
        const k = smooth(i * .28, i * .28 + 1.6, tt);
        if (k <= 0) { x += ws[i]; return; }
        const gr = c.createLinearGradient(0, 330, 0, 470); gr.addColorStop(0, '#fff3d6'); gr.addColorStop(.55, '#f1c27a'); gr.addColorStop(1, '#b8642c');
        c.filter = `blur(${(1 - k) * 14}px)`; c.globalAlpha = k;
        c.shadowColor = 'rgba(255,140,60,.55)'; c.shadowBlur = 40;
        c.fillStyle = gr; c.fillText(ch, x + ws[i] / 2, 400 + (1 - k) * 18);
        x += ws[i];
      });
      c.filter = 'none'; c.shadowBlur = 0;
      const k2 = smooth(1.8, 3.2, tt);
      c.globalAlpha = k2; c.strokeStyle = 'rgba(240,210,170,.6)'; c.lineWidth = 1;
      c.beginPath(); c.moveTo(W / 2 - 260 * k2, 500); c.lineTo(W / 2 - 24, 500); c.moveTo(W / 2 + 24, 500); c.lineTo(W / 2 + 260 * k2, 500); c.stroke();
      star8(c, W / 2, 500, 9, 'rgb(230,100,60)');
      c.font = '400 30px "Cinzel"'; c.letterSpacing = `${lerp(30, 14, k2)}px`; c.fillStyle = '#ead8bc';
      c.fillText('THE SPARK OF THOUGHT', W / 2 + 7, 556);
      c.globalAlpha = smooth(2.6, 4, tt) * .8; c.font = '400 24px "Noto Serif SC"'; c.letterSpacing = '18px';
      c.fillText('人工智能简史', W / 2 + 9, 610);
      c.restore();
    }
  }
};

// ───────────────────────── TALOS: black-figure vase ─────────────────────────
function limb(c, a, b, w1, w2) {
  const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
  c.beginPath(); c.moveTo(a[0] + nx * w1, a[1] + ny * w1); c.lineTo(b[0] + nx * w2, b[1] + ny * w2);
  c.lineTo(b[0] - nx * w2, b[1] - ny * w2); c.lineTo(a[0] - nx * w1, a[1] - ny * w1); c.fill();
  c.beginPath(); c.arc(a[0], a[1], w1, 0, TAU); c.arc(b[0], b[1], w2, 0, TAU); c.fill();
}
const pol = (o, ang, len) => [o[0] + Math.sin(ang) * len, o[1] + Math.cos(ang) * len];

SC.talos = {
  init() {
    const bg = texture(W / 2, H / 2, (i, j, o) => {
      const x = i / (W / 2), y = j / (H / 2);
      const f = fbm(x * 5, y * 4, 5, 51), curve = Math.cos((x - .42) * 2.6);
      const v = (.72 + .3 * f) * (.55 + .5 * curve);
      o[0] = 196 * v; o[1] = 92 * v; o[2] = 44 * v;
    });
    this.bg = mk(W, H); const x = this.bg.getContext('2d'); x.drawImage(bg, 0, 0, W, H);
    // craquelure
    const r = rng(9); x.strokeStyle = 'rgba(40,16,6,.16)'; x.lineWidth = 1;
    for (let k = 0; k < 160; k++) {
      let px = r() * W, py = r() * H, a = r() * TAU; x.beginPath(); x.moveTo(px, py);
      for (let s = 0; s < 14; s++) { a += (r() - .5) * 1.4; px += Math.cos(a) * 14; py += Math.sin(a) * 14; x.lineTo(px, py); }
      x.stroke();
    }
    // specular band of the curved vase
    const sg = x.createLinearGradient(0, 0, W, 0);
    sg.addColorStop(0, 'rgba(255,220,180,0)'); sg.addColorStop(.33, 'rgba(255,220,180,.10)'); sg.addColorStop(.38, 'rgba(255,230,200,.16)'); sg.addColorStop(.45, 'rgba(255,220,180,0)');
    x.fillStyle = sg; x.fillRect(0, 0, W, H);
  },
  meander(c, y, h, off) {
    c.fillStyle = '#140a06'; c.fillRect(0, y, W, h);
    c.strokeStyle = 'rgba(190,96,48,.95)'; c.lineWidth = h * .09; c.lineJoin = 'miter';
    const u = h * .19, per = u * 4.2;
    for (let px = -per + (off % per); px < W + per; px += per) {
      const p = [[0, 3.6], [0, .5], [3, .5], [3, 3], [1.1, 3], [1.1, 1.6], [2, 1.6]];
      c.beginPath(); p.forEach(([a, b], i) => (i ? c.lineTo : c.moveTo).call(c, px + a * u, y + b * u * 1.05 + h * .04)); c.stroke();
    }
    c.beginPath(); c.moveTo(0, y + h * .06); c.lineTo(W, y + h * .06); c.moveTo(0, y + h * .94); c.lineTo(W, y + h * .94); c.stroke();
  },
  waves(c, y, off, amp) {
    c.strokeStyle = '#150a06'; c.lineWidth = 5; c.lineCap = 'round';
    for (let px = -140 + (off % 110); px < W + 110; px += 110) {
      const pts = [[px, y]];
      for (let s = 0; s <= 10; s++) pts.push([px + s * 6, y - Math.sin(s / 10 * Math.PI / 2) * 30 * amp]);
      const cx = px + 66, cy = y - 18 * amp;
      for (let th = 0; th < TAU * 1.05; th += .2) { const rr = 14 * amp * (1 - th / (TAU * 1.25)); pts.push([cx + Math.sin(th) * rr, cy - Math.cos(th) * rr]); }
      c.beginPath(); pts.forEach(([a, b], i) => i ? c.lineTo(a, b) : c.moveTo(a, b)); c.stroke();
      c.beginPath(); c.moveTo(px - 50, y); c.lineTo(px + 60, y); c.stroke();
    }
  },
  giant(c, x, y, s, ph, raise) {
    const ink = '#130a06', inc = 'rgba(200,100,50,.9)';
    c.save(); c.translate(x, y); c.scale(s, s); c.fillStyle = ink;
    const sw = Math.sin(ph) * .42, bob = Math.abs(Math.cos(ph)) * 1.2;
    const hip = [0, -50 + bob], neck = [3, -82 + bob], head = [5, -90 + bob];
    // legs
    for (const sgn of [1, -1]) {
      const a = sw * sgn, knee = pol(hip, a, 24), bend = Math.max(0, -Math.sin(ph) * sgn) * .7;
      const ankle = pol(knee, a - bend, 25);
      limb(c, hip, knee, 6.5, 4.6); limb(c, knee, ankle, 4.4, 2.6);
      c.beginPath(); c.moveTo(ankle[0] - 2, ankle[1]); c.lineTo(ankle[0] + 9, ankle[1] + 1.5); c.lineTo(ankle[0] - 3, ankle[1] + 3); c.fill();
      if (sgn === 1) this.ankle = [x + ankle[0] * s, y + ankle[1] * s];
    }
    // torso
    c.beginPath(); c.moveTo(-6, -50 + bob); c.lineTo(-8, -66 + bob); c.lineTo(-9, -78 + bob); c.lineTo(14, -80 + bob); c.lineTo(9, -64 + bob); c.lineTo(6, -48 + bob); c.closePath(); c.fill();
    // skirt / greaves pleats
    c.beginPath(); c.moveTo(-8, -54 + bob); c.lineTo(10, -54 + bob); c.lineTo(12, -44 + bob); c.lineTo(-9, -44 + bob); c.fill();
    // arms: one raised with boulder, one with shield
    const sh = [8, -77 + bob], sh2 = [-6, -77 + bob];
    const up = lerp(.4, 2.6, raise), el = pol(sh, Math.PI - up, 16), hd = pol(el, Math.PI - up - .5 * raise, 15);
    limb(c, sh, el, 3.6, 3); limb(c, el, hd, 3, 2.4);
    c.beginPath(); c.arc(hd[0] + 2, hd[1] - 6 * raise, 8, 0, TAU); c.fill(); // boulder
    const el2 = pol(sh2, -.3 - sw * .3, 15), hd2 = pol(el2, .5, 13); limb(c, sh2, el2, 3.6, 3); limb(c, el2, hd2, 3, 2.4);
    c.beginPath(); c.arc(hd2[0] - 2, hd2[1] - 2, 13, 0, TAU); c.fill(); // round hoplite shield
    // head + crested helmet
    c.beginPath(); c.arc(head[0], head[1], 6.5, 0, TAU); c.fill(); limb(c, neck, head, 3, 3);
    c.beginPath(); c.moveTo(head[0] - 7, head[1] - 4); c.quadraticCurveTo(head[0] - 2, head[1] - 22, head[0] + 14, head[1] - 12);
    c.quadraticCurveTo(head[0] + 4, head[1] - 12, head[0] - 2, head[1] - 4); c.fill();
    // incised details
    c.strokeStyle = inc; c.lineWidth = .55;
    c.beginPath(); c.arc(hd2[0] - 2, hd2[1] - 2, 10, 0, TAU); c.moveTo(hd2[0] + 3, hd2[1] - 2); c.arc(hd2[0] - 2, hd2[1] - 2, 5, 0, TAU); c.stroke();
    c.beginPath(); c.moveTo(-6, -71 + bob); c.quadraticCurveTo(3, -67 + bob, 11, -71 + bob); c.moveTo(-5, -60 + bob); c.lineTo(8, -60 + bob); c.stroke();
    for (let k = 0; k < 6; k++) { c.beginPath(); c.moveTo(-7 + k * 3.3, -53 + bob); c.lineTo(-8 + k * 3.6, -45 + bob); c.stroke(); }
    c.beginPath(); c.moveTo(head[0] + 1, head[1] - 1); c.lineTo(head[0] + 6, head[1] - 1); c.stroke(); // eye slit
    // the single vein, neck → ankle (the myth's one weakness)
    c.strokeStyle = 'rgba(232,140,70,.95)'; c.lineWidth = .8; c.beginPath();
    c.moveTo(neck[0], neck[1] + 3); c.quadraticCurveTo(-1, -62 + bob, 2, -50 + bob);
    const kneeF = pol(hip, sw, 24); c.quadraticCurveTo(kneeF[0], kneeF[1], (this.ankle[0] - x) / s, (this.ankle[1] - y) / s - 1); c.stroke();
    c.restore();
  },
  ship(c, x, y, t) {
    c.save(); c.translate(x, y + Math.sin(t * 1.3) * 4); c.rotate(Math.sin(t * 1.1) * .02); c.fillStyle = '#130a06';
    c.beginPath(); c.moveTo(-170, -20); c.quadraticCurveTo(-120, 18, 60, 14); c.lineTo(150, 6); c.lineTo(170, 18); c.lineTo(150, -4);
    c.quadraticCurveTo(80, -10, -140, -16); c.quadraticCurveTo(-170, -50, -150, -66); c.quadraticCurveTo(-178, -46, -170, -20); c.fill();
    c.fillRect(-4, -190, 6, 180); c.fillRect(-90, -186, 180, 7);
    c.beginPath(); c.moveTo(-86, -180); c.lineTo(86, -180); c.quadraticCurveTo(98, -110, 80, -60); c.lineTo(-80, -60); c.quadraticCurveTo(-96, -110, -86, -180); c.fill();
    c.strokeStyle = 'rgba(200,100,50,.8)'; c.lineWidth = 1;
    for (let k = -3; k <= 3; k++) { c.beginPath(); c.moveTo(k * 24, -176); c.lineTo(k * 26, -64); c.stroke(); }
    c.beginPath(); c.arc(132, -2, 4, 0, TAU); c.stroke(); // painted eye
    c.strokeStyle = '#130a06'; c.lineWidth = 3;
    for (let k = 0; k < 11; k++) { const ox = -110 + k * 20, a = .5 + Math.sin(t * 3 + k * .15) * .35; c.beginPath(); c.moveTo(ox, 4); c.lineTo(ox - Math.sin(a) * 60, 4 + Math.cos(a) * 60); c.stroke(); }
    c.restore();
  },
  draw(c, t, d, S) {
    c.save(); cam(c, t, d, { z0: 1.05, z1: 1.1, x0: 40, x1: -40 });
    c.drawImage(this.bg, 0, 0);
    // sun disc with rings
    c.save(); c.translate(1440, 400); c.strokeStyle = 'rgba(20,10,6,.85)';
    for (let k = 0; k < 4; k++) { c.lineWidth = k === 0 ? 4 : 2; c.beginPath(); c.arc(0, 0, 90 + k * 22, 0, TAU); c.stroke(); }
    c.fillStyle = 'rgba(20,10,6,.85)'; for (let k = 0; k < 24; k++) { c.save(); c.rotate(k / 24 * TAU + t * .03); c.beginPath(); c.moveTo(-6, 180); c.lineTo(0, 205); c.lineTo(6, 180); c.fill(); c.restore(); }
    c.restore();
    // filler rosettes
    const rr = rng(4); c.fillStyle = 'rgba(20,10,6,.8)';
    for (let k = 0; k < 16; k++) {
      const x = rr() * W, y = 260 + rr() * 360; if (Math.abs(x - 860) < 260) continue;
      for (let p = 0; p < 8; p++) { c.beginPath(); c.arc(x + Math.cos(p / 8 * TAU) * 9, y + Math.sin(p / 8 * TAU) * 9, 3.4, 0, TAU); c.fill(); }
      c.beginPath(); c.arc(x, y, 4, 0, TAU); c.fill();
    }
    // land, sea, ship
    c.fillStyle = '#130a06'; c.beginPath(); c.moveTo(0, 782); c.lineTo(1120, 782); c.quadraticCurveTo(1180, 790, 1200, 830); c.lineTo(0, 830); c.fill();
    this.waves(c, 860, t * 22, 1); this.waves(c, 920, -t * 16 + 40, .8);
    this.ship(c, 1560 - t * 9, 820, t);
    // Talos patrols
    const raise = smooth(S.lines[1].at - 1.5, S.lines[1].at + 1.5, t);
    this.giant(c, 640 + t * 12 * (1 - raise * .6), 784, 5.0, t * 1.25 * (1 - raise * .8), raise);
    glow(c, this.ankle[0] + 4, this.ankle[1] - 4, 26, '255,190,90', .55 + .25 * Math.sin(t * 3)); // the bronze nail
    c.restore();
    this.meander(c, 150, 52, t * 10); this.meander(c, 950, 30, -t * 10);
  }
};

// ───────────────────────── ADA LOVELACE: brass and candlelight ─────────────────────────
function gear(c, x, y, R, n, rot, o = {}) {
  const th = R * .12, inner = R - th;
  c.save(); c.translate(x, y); c.rotate(rot);
  c.beginPath();
  for (let k = 0; k < n; k++) {
    const a = k / n * TAU, s = TAU / n;
    c.lineTo(Math.cos(a) * inner, Math.sin(a) * inner);
    c.lineTo(Math.cos(a + s * .18) * R, Math.sin(a + s * .18) * R);
    c.lineTo(Math.cos(a + s * .48) * R, Math.sin(a + s * .48) * R);
    c.lineTo(Math.cos(a + s * .66) * inner, Math.sin(a + s * .66) * inner);
  }
  c.closePath();
  const spokes = o.spokes ?? 5;
  for (let k = 0; k < spokes; k++) { // windows (reverse winding → holes with evenodd)
    const a = k / spokes * TAU + .3, mx = Math.cos(a) * R * .52, my = Math.sin(a) * R * .52;
    c.moveTo(mx + R * .22, my); c.arc(mx, my, R * .22, 0, TAU, true);
  }
  c.moveTo(R * .1, 0); c.arc(0, 0, R * .1, 0, TAU, true);
  c.rotate(-rot);
  const g = c.createLinearGradient(-R, -R, R, R);
  g.addColorStop(0, o.hi || '#f6d48e'); g.addColorStop(.45, o.mid || '#b47a32'); g.addColorStop(1, o.lo || '#3e2408');
  c.fillStyle = g; c.fill('evenodd');
  c.strokeStyle = 'rgba(30,16,4,.8)'; c.lineWidth = 2; c.stroke();
  c.strokeStyle = 'rgba(255,230,170,.35)'; c.lineWidth = 2; c.beginPath(); c.arc(0, 0, R * .8, Math.PI * 1.05, Math.PI * 1.6); c.stroke();
  c.fillStyle = '#2a1806'; c.beginPath(); c.arc(0, 0, R * .16, 0, TAU); c.fill();
  c.fillStyle = 'rgba(255,220,150,.5)'; c.beginPath(); c.arc(-R * .04, -R * .04, R * .05, 0, TAU); c.fill();
  c.restore();
}

SC.ada = {
  init() {
    this.bg = texture(W / 2, H / 2, (i, j, o) => {
      const x = i / (W / 2), y = j / (H / 2), f = fbm(x * 4, y * 3, 5, 77), grain = fbm(x * 2, y * 40, 3, 78);
      const v = .5 + .5 * f + .2 * grain;
      o[0] = 38 * v; o[1] = 22 * v; o[2] = 12 * v;
    });
  },
  draw(c, t, d, S) {
    c.save(); cam(c, t, d, { z0: 1.12, z1: 1.0, x0: -60, x1: 30 });
    c.drawImage(this.bg, 0, 0, W, H);
    // engine: gear train
    const w = t * .35, m = 7.2;
    const G = [[620, 430, 44, w], [0, 0, 22, 0], [0, 0, 30, 0], [0, 0, 16, 0], [0, 0, 36, 0]];
    const ang = [0, .55, -.9, 2.3, 1.5];
    for (let k = 1; k < G.length; k++) {
      const p = G[k === 4 ? 0 : k - 1], R1 = m * p[2] / 2, R2 = m * G[k][2] / 2;
      G[k][0] = p[0] + Math.cos(ang[k]) * (R1 + R2 - 4); G[k][1] = p[1] + Math.sin(ang[k]) * (R1 + R2 - 4);
      G[k][3] = -p[3] * p[2] / G[k][2] + Math.PI / G[k][2] + ang[k] * (1 + p[2] / G[k][2]);
    }
    G.forEach(([x, y, n, r], k) => gear(c, x, y, m * n / 2, n, r, { spokes: n > 24 ? 6 : 4 }));
    // number-wheel columns of the Analytical Engine's "store"
    for (let col = 0; col < 5; col++) {
      const cx = 1180 + col * 120, top = 270 + (col % 2) * 30;
      c.fillStyle = '#2a1708'; c.fillRect(cx - 4, top - 30, 8, 640);
      for (let k = 0; k < 7; k++) {
        const y = top + k * 64, roll = t * (.4 + col * .13) + k * 1.7, dig = Math.floor(roll) % 10, fr = roll % 1;
        const g = c.createLinearGradient(cx - 48, 0, cx + 48, 0); g.addColorStop(0, '#3a2208'); g.addColorStop(.35, '#d8a656'); g.addColorStop(.6, '#9a6524'); g.addColorStop(1, '#2a1504');
        c.fillStyle = g; c.beginPath(); c.ellipse(cx, y + 26, 48, 10, 0, 0, Math.PI); c.lineTo(cx - 48, y); c.ellipse(cx, y, 48, 10, 0, Math.PI, TAU, false); c.closePath(); c.fill();
        c.fillStyle = '#e4bb72'; c.beginPath(); c.ellipse(cx, y, 48, 10, 0, 0, TAU); c.fill();
        c.save(); c.beginPath(); c.rect(cx - 30, y + 2, 60, 26); c.clip();
        c.font = '600 22px "Cinzel"'; c.textAlign = 'center'; c.fillStyle = 'rgba(30,14,4,.9)';
        const ease = easeInOut(clamp((fr - .8) / .2));
        c.fillText(dig, cx, y + 23 - ease * 26); c.fillText((dig + 1) % 10, cx, y + 49 - ease * 26);
        c.restore();
      }
    }
    // Jacquard punched-card chain
    for (let k = -1; k < 12; k++) {
      const x = ((k * 190 - t * 40) % (13 * 190) + 13 * 190) % (13 * 190) - 200;
      c.save(); c.translate(x, 742); c.rotate(-.04);
      c.fillStyle = '#7c6a4c'; c.fillRect(0, 0, 176, 64); c.strokeStyle = 'rgba(30,18,8,.6)'; c.strokeRect(0, 0, 176, 64);
      c.fillStyle = '#1c1006';
      for (let a = 0; a < 16; a++) for (let b = 0; b < 4; b++) if (hash(k + 30, a * 4 + b, 2) > .55) { c.beginPath(); c.arc(10 + a * 10.4, 12 + b * 13, 3, 0, TAU); c.fill(); }
      c.restore();
    }
    // Note G, revealed like ink drying
    c.save(); c.font = 'italic 400 34px "Cormorant Garamond"'; c.fillStyle = 'rgba(240,214,170,.5)';
    const notes = ['Note G.', 'B₇ = −1·(A₀ + A₁B₁ + A₃B₃ + A₅B₅)', '“…the engine might compose elaborate', '   and scientific pieces of music…”'];
    notes.forEach((s, i) => {
      const p = smooth(1 + i * 1.8, 3.2 + i * 1.8, t);
      c.save(); c.beginPath(); c.rect(440, 50 + i * 44, 1300 * p, 60); c.clip(); c.fillText(s, 470 + (i > 1 ? 120 : 0), 92 + i * 44 + (i > 1 ? 14 : 0)); c.restore();
    });
    c.restore();
    c.restore();
    // candle light: darken away from the flame
    const fx = 190, fy = 560, fl = .9 + .1 * n1(t * 9, 4);
    c.save(); c.globalCompositeOperation = 'multiply';
    const lg = c.createRadialGradient(fx, fy, 50, fx + 300, fy - 100, 1500 * fl);
    lg.addColorStop(0, '#fff'); lg.addColorStop(.45, '#b88a60'); lg.addColorStop(1, '#1a0c06');
    c.fillStyle = lg; c.fillRect(0, 0, W, H); c.restore();
    // the candle
    const cg = c.createLinearGradient(160, 0, 220, 0); cg.addColorStop(0, '#3a2e22'); cg.addColorStop(.35, '#cdb994'); cg.addColorStop(.55, '#a8916c'); cg.addColorStop(1, '#2a2018');
    c.fillStyle = cg; c.beginPath(); c.moveTo(165, fy + 26); c.quadraticCurveTo(190, fy + 14, 215, fy + 26); c.lineTo(215, H); c.lineTo(165, H); c.fill();
    const cv = c.createLinearGradient(0, fy + 20, 0, H); cv.addColorStop(0, 'rgba(0,0,0,0)'); cv.addColorStop(1, 'rgba(10,5,2,.85)'); c.fillStyle = cv; c.fillRect(160, fy + 20, 60, H);
    c.fillStyle = '#2a1a0c'; c.fillRect(188, fy + 4, 3, 16);
    c.save(); c.globalCompositeOperation = 'lighter';
    const sway = (n1(t * 3, 8) - .5) * 10, fh = 64 * fl;
    const fg = c.createRadialGradient(fx, fy, 2, fx, fy - 20, fh);
    fg.addColorStop(0, 'rgba(255,255,230,.95)'); fg.addColorStop(.4, 'rgba(255,190,90,.7)'); fg.addColorStop(1, 'rgba(255,90,20,0)');
    c.fillStyle = fg; c.beginPath(); c.moveTo(fx - 14, fy + 8); c.quadraticCurveTo(fx - 16, fy - fh * .4, fx + sway, fy - fh); c.quadraticCurveTo(fx + 16, fy - fh * .4, fx + 14, fy + 8); c.fill();
    c.restore();
    glow(c, fx, fy - 20, 380 * fl, '255,170,80', .35);
    // dust motes in the candlelight
    const r = rng(21); c.save(); c.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 120; k++) {
      const x = (r() * W + t * (8 + r() * 14)) % W, y = (r() * H + Math.sin(t * .4 + k) * 20 - t * 4 * r() + H) % H;
      const a = (1 - Math.min(1, Math.hypot(x - fx, y - fy) / 900)) * .6 * r();
      c.fillStyle = `rgba(255,220,170,${a})`; c.fillRect(x, y, 2, 2);
    }
    c.restore();
  }
};

// ───────────────────────── TURING: chalk on slate ─────────────────────────
function chalk(c, fn, a = .85, w = 3) {
  for (let k = 0; k < 3; k++) {
    c.save(); c.translate((k - 1) * .9, (k % 2) * .8); c.globalAlpha = a * (k === 1 ? 1 : .35); c.lineWidth = w * (k === 1 ? 1 : 1.6);
    fn(); c.restore();
  }
}
SC.turing = {
  init() {
    this.bg = texture(W / 2, H / 2, (i, j, o) => {
      const x = i / (W / 2), y = j / (H / 2);
      const f = fbm(x * 3, y * 3, 6, 61), smear = fbm(x * 1.2 + y * .4, y * 6, 4, 62);
      const v = .8 + .35 * f + Math.max(0, smear - .55) * .9;
      o[0] = 26 * v; o[1] = 38 * v; o[2] = 34 * v;
    });
  },
  draw(c, t, d, S) {
    c.save(); cam(c, t, d, { z0: 1.0, z1: 1.07, y0: 20, y1: -20 });
    c.drawImage(this.bg, 0, 0, W, H);
    c.strokeStyle = 'rgba(236,236,226,1)'; c.fillStyle = 'rgba(236,236,226,.9)'; c.lineCap = 'round';
    // state diagram (top-left/right)
    const st = [[330, 300, 'q₀'], [560, 230, 'q₁'], [560, 400, 'q₂'], [1560, 280, 'q₃'], [1740, 380, 'halt']];
    st.forEach(([x, y, l], i) => {
      const p = smooth(.6 + i * .7, 1.8 + i * .7, t);
      chalk(c, () => { c.beginPath(); c.arc(x, y, 44, -1.2, -1.2 + TAU * p); c.stroke(); }, .8, 2.6);
      if (l === 'halt') chalk(c, () => { c.beginPath(); c.arc(x, y, 36, 0, TAU * p); c.stroke(); }, .6, 2);
      c.save(); c.globalAlpha = p * .9; c.font = 'italic 400 34px "Cormorant Garamond"'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(l, x, y); c.restore();
    });
    const arrows = [[[374, 286], [516, 238]], [[374, 316], [516, 392]], [[560, 274], [560, 356]], [[1604, 296], [1700, 360]]];
    arrows.forEach((ln, i) => { const p = smooth(2 + i * .6, 3 + i * .6, t); chalk(c, () => strokeReveal(c, ln, p), .7, 2.4); });
    c.save(); c.globalAlpha = smooth(4, 5.5, t) * .7; c.font = 'italic 400 30px "Cormorant Garamond"';
    c.fillText('δ(q, a) → (q′, b, R)', 1300, 470); c.fillText('1 / 0 , R', 400, 200); c.restore();
    // the infinite tape
    const ty = 560, cw = 84, off = (t * 26) % cw, head = W / 2;
    chalk(c, () => { c.beginPath(); c.moveTo(0, ty - 44); c.lineTo(W, ty - 44); c.moveTo(0, ty + 44); c.lineTo(W, ty + 44); c.stroke(); }, .8, 2.4);
    c.font = '400 46px "Liberation Mono"'; c.textAlign = 'center'; c.textBaseline = 'middle';
    for (let k = -2; k < W / cw + 3; k++) {
      const x = k * cw - off, idx = k + Math.floor(t * 26 / cw);
      chalk(c, () => { c.beginPath(); c.moveTo(x, ty - 44); c.lineTo(x, ty + 44); c.stroke(); }, .55, 2);
      let sym = hash(idx, 3, 5) > .45 ? (hash(idx, 4, 5) > .5 ? '1' : '0') : '';
      if (x + cw / 2 < head) sym = hash(idx, 9, 5) > .3 ? (hash(idx, 8, 5) > .5 ? '1' : '0') : sym; // already rewritten cells
      c.save(); c.globalAlpha = .85; c.fillText(sym, x + cw / 2, ty + 2); c.restore();
    }
    // read/write head
    chalk(c, () => { c.beginPath(); c.moveTo(head - 28, ty - 120); c.lineTo(head + 28, ty - 120); c.lineTo(head, ty - 62); c.closePath(); c.stroke(); }, .9, 3);
    glow(c, head, ty, 90, '255,240,200', .12 + .06 * Math.sin(t * 4));
    // the question
    const q = 'Can machines think?', qa = S.lines[1].at - .2, n = Math.floor(clamp((t - qa) / 1.6) * q.length);
    c.save(); c.font = '400 68px "Liberation Mono"'; c.textAlign = 'center'; c.fillStyle = 'rgba(244,240,228,.95)';
    chalk(c, () => c.fillText(q.slice(0, n) + (n < q.length && t > qa && (t * 2 % 1) < .5 ? '▌' : ''), W / 2, 780 - 20), .9);
    c.restore();
    c.save(); c.globalAlpha = smooth(5, 7, t) * .55; c.font = 'italic 400 24px "Cormorant Garamond"'; c.textAlign = 'right';
    c.fillText('“Computing Machinery and Intelligence” — A. M. Turing, Mind, 1950', W - 120, 160); c.restore();
    c.restore();
  }
};

// ───────────────────────── DARTMOUTH 1956: a summer night gets a name ─────────────────────────
SC.dartmouth = {
  init() {
    this.sky = makeSky({ top: [6, 9, 26], bot: [34, 42, 58], band: .8, bandY: .15, bandTilt: -.25, seed: 56, stars: 1700, starH: .75 });
    // treeline + hall silhouette
    this.fg = mk(W, H); const x = this.fg.getContext('2d'), r = rng(19);
    x.fillStyle = '#05070b';
    for (let k = 0; k < 90; k++) { const tx = r() * W, ty = 700 + r() * 60, s = 60 + r() * 90; x.beginPath(); x.ellipse(tx, ty, s, s * (.8 + r() * .5), 0, 0, TAU); x.fill(); }
    x.fillRect(0, 760, W, H);
    // Dartmouth Hall: long colonial building with cupola
    const bx = 560, by = 610, bw = 800, bh = 170;
    x.fillStyle = '#0b0d12'; x.fillRect(bx, by, bw, bh);
    x.beginPath(); x.moveTo(bx - 10, by); x.lineTo(bx + bw / 2, by - 50); x.lineTo(bx + bw + 10, by); x.fill();
    x.beginPath(); x.moveTo(bx + bw / 2 - 90, by); x.lineTo(bx + bw / 2, by - 80); x.lineTo(bx + bw / 2 + 90, by); x.fill();
    x.fillRect(bx + bw / 2 - 34, by - 150, 68, 80); x.fillRect(bx + bw / 2 - 26, by - 200, 52, 52);
    x.beginPath(); x.arc(bx + bw / 2, by - 200, 26, Math.PI, 0); x.fill();
    x.fillRect(bx + bw / 2 - 2, by - 270, 4, 50);
    this.windows = [];
    for (let row = 0; row < 3; row++) for (let k = 0; k < 22; k++) {
      const wx = bx + 30 + k * 34.5, wy = by + 30 + row * 46;
      if (Math.abs(wx - (bx + bw / 2)) < 30 && row === 2) continue;
      this.windows.push([wx, wy, r(), r()]);
    }
    this.names = [['McCarthy', 860, 210], ['Minsky', 1010, 150], ['Shannon', 1180, 220], ['Rochester', 1330, 160], ['Simon', 1480, 250],
      ['Newell', 1350, 330], ['Solomonoff', 1150, 360], ['Selfridge', 960, 330], ['Samuel', 760, 330], ['More', 640, 230]];
  },
  draw(c, t, d, S) {
    c.save(); cam(c, t, d, { z0: 1.06, z1: 1.0, y0: -30, y1: 20 });
    c.drawImage(this.sky, 0, 0); twinkle(c, t, 57, 120, H * .55);
    // constellation of the founders
    const N = this.names, p0 = 1.5;
    c.save(); c.strokeStyle = 'rgba(220,210,180,.5)'; c.lineWidth = 1; c.setLineDash([3, 6]);
    for (let i = 0; i < N.length; i++) {
      const a = N[i], b = N[(i + 1) % N.length], p = smooth(p0 + i * .55, p0 + i * .55 + 1.2, t);
      if (p > 0) { c.beginPath(); c.moveTo(a[1], a[2]); c.lineTo(lerp(a[1], b[1], p), lerp(a[2], b[2], p)); c.stroke(); }
    }
    c.setLineDash([]);
    N.forEach(([nm, x, y], i) => {
      const a = smooth(p0 + i * .55, p0 + i * .55 + .6, t);
      glow(c, x, y, 26, '255,236,200', .7 * a); c.fillStyle = `rgba(255,248,230,${a})`; c.beginPath(); c.arc(x, y, 2.6, 0, TAU); c.fill();
      c.font = 'italic 400 21px "Cormorant Garamond"'; c.fillStyle = `rgba(230,220,200,${a * .7})`; c.fillText(nm, x + 10, y - 10);
    });
    c.restore();
    c.drawImage(this.fg, 0, 0);
    // the name, written in the sky
    const na = S.lines[1].at + .8, k = smooth(na, na + 2.5, t);
    if (k > 0) {
      c.save(); c.textAlign = 'center'; c.font = '600 70px "Cinzel"'; c.letterSpacing = `${lerp(40, 18, easeOut(k))}px`;
      c.shadowColor = 'rgba(255,200,120,.9)'; c.shadowBlur = 40; c.fillStyle = `rgba(255,240,210,${k})`;
      c.fillText('ARTIFICIAL INTELLIGENCE', W / 2 + 9, 470); c.restore();
      glow(c, W / 2, 450, 700, '255,190,120', .12 * k);
    }

    // lit windows
    for (const [x, y, r1, r2] of this.windows) {
      const on = r1 > .45 || (t > 4 && r2 > .6);
      if (!on) continue;
      const fl = .7 + .3 * n1(t * .8 + r1 * 30, 3);
      c.fillStyle = `rgba(255,${200 + r2 * 30 | 0},120,${.85 * fl})`; c.fillRect(x, y, 14, 22);
      glow(c, x + 7, y + 11, 30, '255,190,100', .2 * fl);
    }
    // fireflies
    const r = rng(77);
    for (let k = 0; k < 46; k++) {
      const bx = r() * W, by = 620 + r() * 240, ph = r() * TAU, sp = .2 + r() * .4;
      const x = bx + Math.sin(t * sp + ph) * 60, y = by + Math.cos(t * sp * 1.3 + ph) * 30;
      const b = Math.max(0, Math.sin(t * (1 + r()) + ph * 3)); if (b < .1) continue;
      glow(c, x, y, 18, '200,255,120', .7 * b * b); c.fillStyle = `rgba(240,255,190,${b})`; c.fillRect(x - 1, y - 1, 2, 2);
    }
    c.restore();
  }
};

// ───────────────────────── PERCEPTRON 1958 ─────────────────────────
SC.perceptron = {
  init() {
    // newspaper page
    const p = texture(W / 2, H / 2, (i, j, o) => {
      const x = i / (W / 2), y = j / (H / 2), f = fbm(x * 4, y * 4, 5, 81), v = .82 + .2 * f;
      o[0] = 222 * v; o[1] = 206 * v; o[2] = 170 * v;
    });
    this.paper = mk(W, H); const x = this.paper.getContext('2d'); x.drawImage(p, 0, 0, W, H);
    const r = rng(3); x.fillStyle = 'rgba(40,30,22,.95)';
    x.font = '700 78px "Liberation Serif"'; x.textAlign = 'center'; x.fillText('NEW NAVY DEVICE LEARNS BY DOING', W / 2, 250);
    x.font = 'italic 400 38px "Liberation Serif"'; x.fillText('Psychologist Shows Embryo of Computer Designed to Read and Grow Wiser', W / 2, 318);
    x.fillRect(120, 350, W - 240, 3); x.fillRect(120, 150, W - 240, 6);
    x.font = '400 22px "Liberation Serif"'; x.textAlign = 'left'; x.fillText('WASHINGTON, July 7 (UPI)', 140, 395);
    for (let col = 0; col < 6; col++) for (let ln = 0; ln < 34; ln++) {
      const cx = 140 + col * 280, y = 420 + ln * 19, wdt = ln % 9 === 8 ? 120 + r() * 100 : 250;
      for (let wx = 0; wx < wdt;) { const ww = 12 + r() * 38; x.fillStyle = `rgba(50,40,30,${.35 + r() * .25})`; x.fillRect(cx + wx, y, Math.min(ww, wdt - wx), 8); wx += ww + 7; }
    }
    // a 20×20 retina showing the letter "A"
    const g = mk(20, 20), gx = g.getContext('2d'); gx.fillStyle = '#fff'; gx.font = '700 22px "Liberation Sans"'; gx.textAlign = 'center'; gx.textBaseline = 'middle'; gx.fillText('A', 10, 11);
    const dta = gx.getImageData(0, 0, 20, 20).data; this.cells = [];
    for (let j = 0; j < 20; j++) for (let i = 0; i < 20; i++) this.cells.push(dta[(j * 20 + i) * 4 + 3] > 90);
    this.links = []; const rr = rng(8);
    for (let k = 0; k < 140; k++) { const ci = rr() * 400 | 0; this.links.push([ci, rr() * 14 | 0, rr()]); }
  },
  draw(c, t, d, S) {
    const l2 = S.lines[1].at, news = smooth(l2 - 1.2, l2 + .8, t);
    c.fillStyle = '#0d0805'; c.fillRect(0, 0, W, H);
    c.save(); cam(c, t, d, { z0: 1.0, z1: 1.0 });
    const z = lerp(1.05, 1.32, easeInOut(clamp((t - l2 + 1.2) / (d - l2)))) ;
    c.translate(W / 2, H / 2); c.scale(z, z); c.rotate(-.025); c.translate(-W / 2, -H / 2 + lerp(0, 50, news));
    c.globalAlpha = lerp(.18, .95, news); c.drawImage(this.paper, 0, 0); c.globalAlpha = 1;
    c.restore();
    c.save(); c.globalCompositeOperation = 'multiply'; c.fillStyle = `rgba(150,100,60,${.6 - .3 * news})`; c.fillRect(0, 0, W, H); c.restore();
    // the machine, glowing amber
    const da = 1 - news * .85;
    if (da > 0) {
      c.save(); c.globalAlpha = da;
      const gx = 300, gy = 290, cs = 15, ax = 1040, ox = 1500;
      const learn = smooth(1, d - 2, t);
      c.globalCompositeOperation = 'lighter';
      // connections retina → association → response
      this.links.forEach(([ci, ai, w], k) => {
        const sx = gx + (ci % 20) * cs + cs / 2, sy = gy + (ci / 20 | 0) * cs + cs / 2, ay = 250 + ai * 32;
        const on = this.cells[ci], pulse = .5 + .5 * Math.sin(t * 3 - k * .3);
        c.strokeStyle = `rgba(255,${150 + w * 80 | 0},70,${(on ? .14 + .22 * pulse * learn : .04)})`; c.lineWidth = on ? 1 + w * 1.5 * learn : .6;
        c.beginPath(); c.moveTo(sx, sy); c.bezierCurveTo(700, sy, 760, ay, ax, ay); c.stroke();
      });
      for (let a = 0; a < 14; a++) {
        const ay = 250 + a * 32, act = hash(a, 1) * learn;
        for (const [oy, wsg] of [[380, 1], [540, -1]]) {
          c.strokeStyle = `rgba(255,${wsg > 0 ? 200 : 90},80,${.1 + .3 * act})`; c.lineWidth = 1 + 2 * act;
          c.beginPath(); c.moveTo(ax, ay); c.lineTo(ox, oy); c.stroke();
        }
        glow(c, ax, ay, 22, '255,170,80', .5 + .5 * act); c.fillStyle = '#ffd9a0'; c.beginPath(); c.arc(ax, ay, 5, 0, TAU); c.fill();
      }
      c.globalCompositeOperation = 'source-over';
      for (let i = 0; i < 400; i++) {
        const on = this.cells[i], x = gx + (i % 20) * cs, y = gy + (i / 20 | 0) * cs;
        c.fillStyle = on ? `rgba(255,214,140,${.5 + .5 * smooth(.5, 2.5, t)})` : 'rgba(80,50,30,.6)'; c.fillRect(x + 1, y + 1, cs - 2, cs - 2);
      }
      glow(c, gx + 150, gy + 150, 260, '255,170,80', .2);
      const win = smooth(3, 5, t) * (.6 + .4 * Math.sin(t * 2));
      glow(c, ox, 380, 70, '255,210,130', .4 + .6 * win); glow(c, ox, 540, 40, '200,120,80', .3);
      c.fillStyle = '#fff1d8'; c.beginPath(); c.arc(ox, 380, 9, 0, TAU); c.arc(ox, 540, 7, 0, TAU); c.fill();
      c.font = '600 34px "Cinzel"'; c.fillStyle = `rgba(255,236,200,${.4 + .6 * win})`; c.fillText('A', ox + 30, 392);
      c.fillStyle = 'rgba(255,236,200,.35)'; c.fillText('B', ox + 30, 552);
      c.font = 'italic 400 24px "Cormorant Garamond"'; c.fillStyle = 'rgba(240,210,170,.7)'; c.textAlign = 'center';
      c.fillText('S-units · 400 photocells', gx + 150, gy + 340); c.fillText('A-units', ax, 230); c.fillText('R-units', ox, 330);
      c.font = '600 26px "Cinzel"'; c.letterSpacing = '10px'; c.fillStyle = 'rgba(255,220,170,.75)'; c.fillText('MARK I PERCEPTRON', W / 2, 160);
      c.restore();
    }
  }
};
