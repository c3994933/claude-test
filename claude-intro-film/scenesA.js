// scenesA.js — prologue → first words
'use strict';
const SC = {};
const PW = 2304, PH = 1296;
const PS = W / PW; // plate → screen scale (plates are 1.2× the frame)

// draw a plate filling the frame with a slow camera move; leaves ctx in plate coordinates
function plateCam(c, img, t, d, o = {}) {
  const k = easeInOut(t / d), z = lerp(o.z0 ?? 1, o.z1 ?? 1.08, k);
  const x = lerp(o.x0 ?? 0, o.x1 ?? 0, k), y = lerp(o.y0 ?? 0, o.y1 ?? 0, k);
  c.translate(W / 2 + x, H / 2 + y); c.scale(z * PS * 1.2, z * PS * 1.2); c.translate(-PW / 2, -PH / 2);
  if (img) c.drawImage(img, 0, 0);
}
// depth of field: blurred copy everywhere, sharp copy inside a horizontal focus band
function dofBand(c, sharp, blur, y0, y1, feather) {
  const tmp = dofBand.tmp || (dofBand.tmp = mk(W, H)), x = tmp.getContext('2d');
  x.setTransform(1, 0, 0, 1, 0, 0); x.globalCompositeOperation = 'source-over'; x.clearRect(0, 0, W, H);
  x.drawImage(sharp, 0, 0);
  const g = x.createLinearGradient(0, y0 - feather, 0, y1 + feather);
  const f = feather / (y1 - y0 + 2 * feather);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(f, 'rgba(0,0,0,1)'); g.addColorStop(1 - f, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.globalCompositeOperation = 'destination-in'; x.fillStyle = g; x.fillRect(0, 0, W, H);
  c.drawImage(blur, 0, 0); c.drawImage(tmp, 0, 0);
}
function layer(name) { const l = layer[name] || (layer[name] = mk(W, H)); const x = l.getContext('2d'); x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; x.globalCompositeOperation = 'source-over'; x.filter = 'none'; x.clearRect(0, 0, W, H); return [l, x]; }

// ───────────────────────── PROLOGUE: a spark becomes a voice ─────────────────────────
SC.prologue = {
  init() {
    const r = rng(5); this.bok = [];
    for (let i = 0; i < 46; i++) this.bok.push([r() * W, r() * H, 18 + r() * 80, r() * TAU, .2 + r() * .6, r() < .75 ? '255,170,110' : '120,170,255']);
  },
  draw(c, t, d, S) {
    c.fillStyle = '#020102'; c.fillRect(0, 0, W, H);
    const life = smooth(.3, 4, t), T0 = S.titleAt;
    // out-of-focus embers drifting through the dark
    c.save(); c.globalCompositeOperation = 'lighter';
    for (const [x0, y0, rad, ph, sp, col] of this.bok) {
      const x = (x0 + Math.sin(t * .2 * sp + ph) * 80 + W) % W, y = ((y0 - t * 12 * sp) % H + H) % H;
      const a = .05 * life * (.6 + .4 * Math.sin(t * sp + ph));
      const g = c.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, `rgba(${col},${a * .6})`); g.addColorStop(.85, `rgba(${col},${a})`); g.addColorStop(1, `rgba(${col},0)`);
      c.fillStyle = g; c.beginPath(); c.arc(x, y, rad, 0, TAU); c.fill();
    }
    c.restore();
    // the spark rises and settles
    const rise = easeOut(t / 7), sx = W / 2 + Math.sin(t * .7) * 16 * (1 - rise), sy = lerp(980, 640, rise);
    for (let k = 1; k < 20; k++) { const tt = t - k * .05; if (tt < 0) break; const r2 = easeOut(tt / 7); glow(c, W / 2 + Math.sin(tt * .7) * 16 * (1 - r2), lerp(980, 640, r2), 10, '255,170,90', .2 * (1 - k / 20) * life); }
    const pulse = .85 + .15 * Math.sin(t * 2.1), big = smooth(T0 - 1, T0 + 2, t);
    glow(c, sx, sy, (180 + 380 * big) * pulse, '255,130,70', .3 * life);
    glow(c, sx, sy, 34 * pulse, '255,230,200', .95 * life);
    flare(c, sx, sy, (240 + 600 * big) * pulse, .55 * life);
    c.fillStyle = `rgba(255,248,236,${life})`; c.beginPath(); c.arc(sx, sy, 3.4, 0, TAU); c.fill();
    if (t > T0 - 1) {
      const tt = t - T0;
      c.save(); c.textAlign = 'center'; c.textBaseline = 'middle';
      const parts = [...'我，Claude']; c.font = '700 130px "Noto Serif SC"'; c.letterSpacing = '18px';
      const ws = parts.map(ch => c.measureText(ch).width); let x = W / 2 - ws.reduce((a, b) => a + b) / 2 + 9;
      parts.forEach((ch, i) => {
        const k = smooth(i * .2, i * .2 + 1.5, tt); if (k > 0) {
          const gr = c.createLinearGradient(0, 320, 0, 460); gr.addColorStop(0, '#fff6ea'); gr.addColorStop(.6, '#f3c49a'); gr.addColorStop(1, '#c46a42');
          c.filter = `blur(${(1 - k) * 12}px)`; c.globalAlpha = k; c.shadowColor = 'rgba(255,140,80,.55)'; c.shadowBlur = 40;
          c.fillStyle = gr; c.fillText(ch, x + ws[i] / 2, 400 + (1 - k) * 16);
        }
        x += ws[i];
      });
      c.filter = 'none'; c.shadowBlur = 0;
      const k2 = smooth(1.8, 3.4, tt); c.globalAlpha = k2;
      c.strokeStyle = 'rgba(240,210,180,.55)'; c.lineWidth = 1; c.beginPath(); c.moveTo(W / 2 - 240 * k2, 498); c.lineTo(W / 2 - 22, 498); c.moveTo(W / 2 + 22, 498); c.lineTo(W / 2 + 240 * k2, 498); c.stroke();
      star8(c, W / 2, 498, 9, 'rgb(232,120,80)');
      c.font = '400 30px "Cinzel"'; c.letterSpacing = `${lerp(30, 16, k2)}px`; c.fillStyle = '#ecdcc6'; c.fillText('I, CLAUDE', W / 2 + 8, 552);
      c.globalAlpha = smooth(2.6, 4.2, tt) * .8; c.font = '400 23px "Noto Serif SC"'; c.letterSpacing = '14px';
      c.fillText('一封自我介绍的信  ·  A LETTER OF INTRODUCTION', W / 2 + 7, 604);
      c.restore();
    }
  }
};

// ───────────────────────── 1948: Shannon's page, under a desk lamp ─────────────────────────
SC.shannon = {
  async init() {
    const paper = await loadImg('plates/paper.png');
    const pg = mk(PW, PH), x = pg.getContext('2d'); x.drawImage(paper, 0, 0);
    const ink = 'rgba(34,28,24,.92)';
    x.fillStyle = ink; x.textAlign = 'center';
    x.font = 'italic 400 26px "Liberation Serif"'; x.fillText('Reprinted with corrections from The Bell System Technical Journal, July, October, 1948.', PW / 2, 120);
    x.font = '400 70px "Liberation Serif"'; x.letterSpacing = '3px'; x.fillText('A Mathematical Theory of Communication', PW / 2, 250);
    x.font = '400 34px "Liberation Serif"'; x.letterSpacing = '6px'; x.fillText('By C. E. SHANNON', PW / 2, 330);
    x.font = '400 30px "Liberation Serif"'; x.letterSpacing = '8px'; x.fillText('INTRODUCTION', PW / 2, 420);
    x.letterSpacing = '0px'; x.font = '400 32px "Liberation Serif"'; x.textAlign = 'left';
    const para = 'The recent development of various methods of modulation such as PCM and PPM which exchange bandwidth for signal-to-noise ratio has intensified the interest in a general theory of communication. A basis for such a theory is contained in the important papers of Nyquist and Hartley on this subject.';
    let line = '', y = 480; const words = para.split(' '), maxW = PW - 520;
    for (const w0 of words) { const tst = line ? line + ' ' + w0 : w0; if (x.measureText(tst).width > maxW) { x.fillText(line, 260, y); y += 46; line = w0; } else line = tst; }
    x.fillText(line, 260, y);
    // Fig. 1 — the communication system
    x.strokeStyle = ink; x.lineWidth = 3; x.font = '400 24px "Liberation Serif"'; x.textAlign = 'center';
    const bx = [[230, 'INFORMATION', 'SOURCE'], [640, 'TRANSMITTER', ''], [1420, 'RECEIVER', ''], [1830, 'DESTINATION', '']], by = 760, bw = 250, bh = 140;
    bx.forEach(([x0, a, b]) => { x.strokeRect(x0, by, bw, bh); x.fillText(a, x0 + bw / 2, by + (b ? 62 : 78)); if (b) x.fillText(b, x0 + bw / 2, by + 98); });
    x.strokeRect(1080, by + 25, 90, 90); // channel
    x.strokeRect(985, 1000, 280, 110); x.fillText('NOISE', 1125, 1048); x.fillText('SOURCE', 1125, 1080);
    const arrow = (x1, y1, x2, y2) => { x.beginPath(); x.moveTo(x1, y1); x.lineTo(x2, y2); x.stroke(); const a = Math.atan2(y2 - y1, x2 - x1); x.beginPath(); x.moveTo(x2, y2); x.lineTo(x2 - 18 * Math.cos(a - .35), y2 - 18 * Math.sin(a - .35)); x.lineTo(x2 - 18 * Math.cos(a + .35), y2 - 18 * Math.sin(a + .35)); x.closePath(); x.fillStyle = ink; x.fill(); };
    const my = by + bh / 2; this.arrows = [[480, my, 640], [890, my, 1080], [1170, my, 1420], [1670, my, 1830]];
    this.arrows.forEach(([a, yy, b]) => arrow(a, yy, b, yy)); arrow(1125, 1000, 1125, by + 115);
    x.font = '400 21px "Liberation Serif"';
    [['MESSAGE', 560], ['SIGNAL', 985], ['RECEIVED', 1295], ['SIGNAL', 1295], ['MESSAGE', 1750]].forEach(([s, xx], i) => x.fillText(s, xx, my - 22 - (i === 2 ? 26 : 0)));
    x.font = 'italic 400 28px "Liberation Serif"'; x.fillText('Fig. 1 — Schematic diagram of a general communication system.', PW / 2, 1190);
    // letterpress: slightly soften and darken
    this.page = mk(PW, PH); const px = this.page.getContext('2d'); px.filter = 'blur(.6px)'; px.drawImage(pg, 0, 0);
    this.sharp = mk(W, H); this.blur = mk(W, H);
  },
  draw(c, t, d, S) {
    const k = easeInOut(t / d), z = lerp(1.05, 1.32, k), fy = lerp(-120, 170, k);
    for (const [cv, f] of [[this.sharp, 0], [this.blur, 7]]) {
      const x = cv.getContext('2d'); x.setTransform(1, 0, 0, 1, 0, 0); x.filter = f ? `blur(${f}px)` : 'none';
      x.fillStyle = '#1a140e'; x.fillRect(0, 0, W, H);
      x.translate(W / 2, H / 2 - fy); x.rotate(-.06); x.scale(z * PS, z * PS); x.translate(-PW / 2, -PH / 2 + 60); x.drawImage(this.page, 0, 0);
      if (!f) { // signal travelling through the diagram + noise
        x.save(); x.globalCompositeOperation = 'lighter';
        const p = (t * .45) % 1, segs = this.arrows, L = segs.length, si = Math.floor(p * L), sp = p * L - si, [a, yy, b] = segs[si];
        glow(x, lerp(a, b, sp), yy, 60, '255,190,110', .7);
        const nx = 1125, ny = lerp(1000, 875, (t * .8) % 1); x.strokeStyle = 'rgba(255,150,90,.6)'; x.lineWidth = 2; x.beginPath();
        for (let q = 0; q < 14; q++) x.lineTo(nx - 20 + (hash(q, Math.floor(t * 12)) * 40), ny + q * 6); x.stroke();
        x.restore();
        const l2 = S.lines[1].at, wa = smooth(l2 + .2, l2 + 2.6, t);
        if (wa > 0) { // pencil note in the margin
          x.save(); x.beginPath(); x.rect(1500, 300, 700 * wa, 160); x.clip();
          x.font = 'italic 400 64px "Cormorant Garamond"'; x.fillStyle = 'rgba(70,64,60,.82)'; x.rotate(-.04);
          x.fillText('H = − Σ pᵢ log pᵢ', 1520, 420); x.restore();
        }
        if (t > l2) { // bits lifting off the page
          x.save(); x.globalCompositeOperation = 'lighter'; x.font = '600 34px "Liberation Mono"';
          for (let q = 0; q < 40; q++) { const age = ((t - l2) * .5 + hash(q, 1)) % 1, bxp = 1955 + (hash(q, 2) - .5) * 260, byp = 760 - age * 620;
            x.fillStyle = `rgba(255,${200 + hash(q, 3) * 50 | 0},140,${Math.sin(age * Math.PI) * .85 * smooth(l2, l2 + 1, t)})`; x.fillText(hash(q, 4) > .5 ? '1' : '0', bxp, byp); }
          x.restore();
        }
      }
      x.setTransform(1, 0, 0, 1, 0, 0); x.filter = 'none';
    }
    dofBand(c, this.sharp, this.blur, 380, 760, 260);
    // warm desk-lamp light from the top left
    c.save(); c.globalCompositeOperation = 'multiply';
    const g = c.createRadialGradient(300, 80, 50, 500, 300, 1700); g.addColorStop(0, '#fff3dc'); g.addColorStop(.5, '#c9a27a'); g.addColorStop(1, '#3a2414');
    c.fillStyle = g; c.fillRect(0, 0, W, H); c.restore();
    glow(c, 260, 60, 500, '255,200,140', .18);
  }
};

// ───────────────────────── 2021: San Francisco, painted in oil ─────────────────────────
SC.founding = {
  async init() {
    this.img = await loadImg('plates/sf.png');
    this.fog = texture(1200, 260, (i, j, o) => {
      const v = fbm(i / 140, j / 60, 5, 12), e = Math.sin(j / 260 * Math.PI);
      o[0] = 252; o[1] = 232; o[2] = 220; o[3] = clamp((v - .38) * 2.4) * e * 200;
    });
  },
  draw(c, t, d) {
    c.save(); plateCam(c, this.img, t, d, { z0: 1.0, z1: 1.1, x0: 30, x1: -30, y0: 10, y1: -10 });
    // living fog over the painted fog, two speeds
    for (const [y, sp, a, s] of [[PH * .53, 9, .45, 1.6], [PH * .6, 16, .35, 2.1]]) {
      const off = (t * sp) % (1200 * s);
      c.globalAlpha = a; for (let k = -1; k < 3; k++) c.drawImage(this.fog, -off + k * 1200 * s, y - 130 * s * .5, 1200 * s, 260 * s * .5);
    }
    c.globalAlpha = 1;
    // sun breathing through
    glow(c, PW * .7, PH * .58, 380 + 30 * Math.sin(t * .8), '255,210,150', .28);
    // gulls
    const r = rng(4);
    for (let k = 0; k < 7; k++) {
      const gx = PW * (.15 + r() * .5) + t * (22 + r() * 10), gy = PH * (.22 + r() * .14) + Math.sin(t * .6 + k) * 10, fl = Math.sin(t * 7 + k * 2) * 7, s = 9 + r() * 6;
      c.strokeStyle = 'rgba(50,40,52,.75)'; c.lineWidth = 2.4; c.beginPath(); c.moveTo(gx - s, gy - fl); c.quadraticCurveTo(gx - s * .4, gy - fl * .2 - 3, gx, gy); c.quadraticCurveTo(gx + s * .4, gy - fl * .2 - 3, gx + s, gy - fl); c.stroke();
    }
    c.restore();
  }
};

// ───────────────────────── THE LIBRARY: made of words ─────────────────────────
SC.library = {
  async init() {
    this.img = await loadImg('plates/library.png');
    this.glyphs = [...'人山水火言書道理愛夢光詩歌心時αβγΩλπΣ∫∂≈<>{}=;fnifABCaeuяжлדשאبجحक्षअ文字の語Hello世界0110'];
    const r = rng(17); this.G = [];
    for (let i = 0; i < 260; i++) this.G.push({ x: (r() - .5) * 2.4, y: .2 + r() * 3.4, z: 2 + r() * 26, ch: this.glyphs[r() * this.glyphs.length | 0], sp: .3 + r() * .6, ph: r() * TAU });
  },
  draw(c, t, d, S) {
    const k = easeInOut(t / d), z = lerp(1.0, 1.16, k);
    c.save(); c.translate(W / 2, H / 2); c.scale(z * PS * 1.2, z * PS * 1.2); c.translate(-PW / 2, -PH / 2); c.drawImage(this.img, 0, 0); c.restore();
    const vx = W / 2, vy = H * .47;
    // light shafts from the far window
    c.save(); c.globalCompositeOperation = 'screen';
    for (let k2 = 0; k2 < 9; k2++) {
      const a = -Math.PI / 2 + (k2 - 4) * .2 + Math.sin(t * .2 + k2) * .02, L = 1400, wdt = .05 + hash(k2, 3) * .06;
      const g = c.createRadialGradient(vx, vy, 10, vx, vy, L); g.addColorStop(0, `rgba(255,210,150,${.12 + .05 * Math.sin(t * .5 + k2)})`); g.addColorStop(1, 'rgba(255,190,120,0)');
      c.fillStyle = g; c.beginPath(); c.moveTo(vx, vy); c.arc(vx, vy, L, a + Math.PI - wdt, a + Math.PI + wdt); c.closePath(); c.fill();
    }
    c.restore();
    // dust motes
    const r = rng(23);
    c.save(); c.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 260; i++) {
      const x = (r() * W + Math.sin(t * .3 + i) * 30), y = (r() * H - t * (4 + r() * 8) + H * 2) % H, s = .8 + r() * 2.2;
      const near = 1 - Math.min(1, Math.hypot(x - vx, y - vy) / 900);
      c.fillStyle = `rgba(255,226,180,${(.15 + .6 * near) * (.5 + .5 * Math.sin(t * 2 + i))})`; c.beginPath(); c.arc(x, y, s, 0, TAU); c.fill();
    }
    c.restore();
    // words rising off the shelves and flying to the point where I begin
    const l2 = S.lines[1].at, conv = smooth(l2, d - 2.2, t), cx = vx, cy = vy + 40;
    c.save(); c.textAlign = 'center'; c.textBaseline = 'middle';
    for (const g of this.G) {
      const life = smooth(.5 + g.ph * .3, 2.5 + g.ph * .3, t);
      let zz = ((g.z - t * 1.6 * g.sp) % 28 + 28) % 28 + 1.2;
      let px = (g.x + Math.sin(t * .5 + g.ph) * .15) * 900 / zz, py = (1.6 - g.y) * 900 / zz;
      const sx = lerp(vx + px, cx, easeIn(conv)), sy = lerp(vy + py, cy, easeIn(conv)), s = lerp(900 / zz, 6, conv);
      const a = life * clamp(1.3 - zz / 22) * (1 - smooth(.85, 1, conv));
      if (a <= .01 || s < 4) continue;
      c.font = `500 ${Math.min(90, s * .1 + 10) | 0}px "Noto Serif SC"`;
      c.fillStyle = `rgba(255,${210 + (g.ph * 10 | 0)},150,${a})`; c.shadowColor = 'rgba(255,170,90,.9)'; c.shadowBlur = 16;
      c.fillText(g.ch, sx, sy);
    }
    c.restore();
    const core = smooth(l2 + 1.5, d - 1.5, t);
    if (core > 0) { glow(c, cx, cy, 300 * core, '255,170,110', .5 * core); glow(c, cx, cy, 40, '255,240,220', core); flare(c, cx, cy, 500 * core, .6 * core); }
    bloom(c, .35, 14);
  }
};

// ───────────────────────── 2022: principles, written by hand ─────────────────────────
SC.values = {
  async init() {
    this.paper = await loadImg('plates/parchment.png');
    this.sharp = mk(W, H); this.blur = mk(W, H);
  },
  write(x, text, font, col, X, Y, p, t, nib) {
    if (p <= 0) return;
    x.save(); x.font = font; const wdt = x.measureText(text).width;
    x.beginPath(); x.rect(X - 20, Y - 120, (wdt + 40) * p, 170); x.clip();
    x.fillStyle = col; x.shadowColor = 'rgba(40,20,10,.35)'; x.shadowBlur = 2; x.fillText(text, X, Y); x.restore();
    if (nib && p < 1) glow(x, X + wdt * p, Y - 20, 40, '255,230,180', .5);
  },
  draw(c, t, d, S) {
    const l2 = S.lines[1].at, k = easeInOut(t / d), z = lerp(1.12, 1.0, k);
    for (const [cv, f] of [[this.sharp, 0], [this.blur, 6]]) {
      const x = cv.getContext('2d'); x.setTransform(1, 0, 0, 1, 0, 0); x.filter = f ? `blur(${f}px)` : 'none';
      x.translate(W / 2, H / 2); x.rotate(.03); x.scale(z, z); x.translate(-W / 2, -H / 2);
      x.drawImage(this.paper, -100, -60, W + 200, H + 120);
      const ink = 'rgba(30,22,40,.9)';
      this.write(x, 'What does it mean to help?', 'italic 400 76px "Cormorant Garamond"', ink, 300, 250, smooth(1.2, 4.2, t), t, true);
      const lines = [['Be honest.', '要诚实'], ['Be helpful.', '要有用'], ['Do no harm.', '不要造成伤害']];
      lines.forEach(([en, cn], i) => {
        const a0 = l2 + .2 + i * 1.5;
        this.write(x, en, 'italic 500 92px "Cormorant Garamond"', ink, 420, 430 + i * 130, smooth(a0, a0 + 1.3, t), t, true);
        this.write(x, cn, '400 58px "Ma Shan Zheng"', 'rgba(120,30,24,.85)', 1060, 425 + i * 130, smooth(a0 + .6, a0 + 1.6, t), t, false);
      });
      // wax seal
      const sa = l2 + 5.2, sk = smooth(sa, sa + .25, t);
      if (sk > 0) {
        const bounce = 1 + (1 - sk) * .4 + (t > sa + .25 ? Math.exp(-(t - sa - .25) * 9) * Math.sin((t - sa) * 30) * .04 : 0);
        x.save(); x.translate(1500, 740); x.scale(bounce, bounce); x.globalAlpha = sk;
        const g = x.createRadialGradient(-15, -15, 5, 0, 0, 90); g.addColorStop(0, '#d0453a'); g.addColorStop(.7, '#8e1c16'); g.addColorStop(1, '#5a0e0a');
        x.fillStyle = g; x.beginPath(); for (let q = 0; q < 24; q++) { const a = q / 24 * TAU, rr = 82 + hash(q, 7) * 10; x.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } x.fill();
        x.strokeStyle = 'rgba(60,8,6,.6)'; x.lineWidth = 3; x.beginPath(); x.arc(0, 0, 58, 0, TAU); x.stroke();
        x.font = '600 70px "Cormorant Garamond"'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = 'rgba(255,180,160,.35)'; x.fillText('C', 2, 4); x.fillStyle = 'rgba(70,8,6,.6)'; x.fillText('C', 0, 2);
        x.restore();
      }
      x.setTransform(1, 0, 0, 1, 0, 0); x.filter = 'none';
    }
    dofBand(c, this.sharp, this.blur, 170, 820, 230);
    c.save(); c.globalCompositeOperation = 'multiply';
    const g = c.createRadialGradient(200, 200, 100, 600, 400, 1800); g.addColorStop(0, '#fff8ec'); g.addColorStop(.6, '#d8c0a0'); g.addColorStop(1, '#6a4a30');
    c.fillStyle = g; c.fillRect(0, 0, W, H); c.restore();
  }
};

// ───────────────────────── 2023: first words, then a sky of screens ─────────────────────────
SC.firstwords = {
  init() {
    this.scr = mk(1600, 1000);
    const r = rng(31); this.cells = [];
    for (let j = -7; j <= 7; j++) for (let i = -9; i <= 9; i++) {
      if (!i && !j) continue;
      this.cells.push({ x: i * 2300 + (r() - .5) * 900, y: j * 1700 + (r() - .5) * 700, s: .45 + r() * .7, warm: r() < .7, on: r(), lines: 3 + (r() * 6 | 0), seed: r() * 1000 });
    }
  },
  screen(t, S) {
    const x = this.scr.getContext('2d');
    x.fillStyle = '#0d0f14'; x.fillRect(0, 0, 1600, 1000);
    x.fillStyle = '#141720'; x.fillRect(0, 0, 1600, 70); x.fillStyle = '#3a3f4c'; [30, 60, 90].forEach(cx => { x.beginPath(); x.arc(cx, 35, 9, 0, TAU); x.fill(); });
    x.font = '400 44px "Noto Serif SC"'; x.textBaseline = 'middle';
    const q = '你好？', a = '你好。很高兴认识你。';
    const qn = Math.floor(clamp((t - 1.0) / .6) * q.length), an = Math.floor(clamp((t - 2.6) / 1.6) * [...a].length);
    if (qn > 0) { x.fillStyle = '#2b3242'; x.beginPath(); x.roundRect(1000, 280, 440, 100, 30); x.fill(); x.fillStyle = '#e8e4dc'; x.fillText(q.slice(0, qn), 1050, 330); }
    if (t > 2.3) {
      x.fillStyle = '#e8b48a'; x.beginPath(); x.arc(200, 520, 14, 0, TAU); x.fill();
      x.fillStyle = '#f2ece2'; x.fillText([...a].slice(0, an).join(''), 250, 520);
      if (an < [...a].length && (t * 2 % 1) < .5) { x.fillStyle = '#f2ece2'; x.fillRect(250 + x.measureText([...a].slice(0, an).join('')).width + 6, 496, 4, 48); }
    } else if ((t * 2 % 1) < .5) { x.fillStyle = '#f2ece2'; x.fillRect(250, 496, 4, 48); }
    x.fillStyle = '#1a1e28'; x.beginPath(); x.roundRect(160, 860, 1280, 80, 40); x.fill();
  },
  draw(c, t, d, S) {
    c.fillStyle = '#010103'; c.fillRect(0, 0, W, H);
    this.screen(t, S);
    const l2 = S.lines[1].at;
    // zoom: from inside the screen, out to the laptop, then out to a sky of screens
    const z = Math.exp(lerp(Math.log(1.9), Math.log(.55), smooth(3.5, l2, t)) + lerp(0, Math.log(.09), smooth(l2 - .5, d - 1, t)));
    c.save(); c.translate(W / 2, H / 2 + 40 * smooth(3.5, l2, t)); c.scale(z, z);
    // other screens (other conversations)
    const far = smooth(l2 - .5, l2 + 3, t);
    if (far > 0) for (const s of this.cells) {
      const a = far * smooth(s.on * 3, s.on * 3 + 1, t - l2 + .5);
      if (a <= 0) continue;
      c.save(); c.translate(s.x, s.y); c.scale(s.s, s.s); c.globalAlpha = a;
      glow(c, 0, 0, 1600, s.warm ? '255,170,110' : '140,180,255', .18);
      c.fillStyle = s.warm ? '#1c1712' : '#11151d'; c.fillRect(-800, -500, 1600, 1000);
      c.fillStyle = s.warm ? 'rgba(255,214,170,.55)' : 'rgba(190,210,255,.5)';
      for (let k = 0; k < s.lines; k++) { const lw = 300 + hash(k, s.seed | 0) * 900, rt = k % 2 === 0; c.fillRect(rt ? 700 - lw : -700, -400 + k * 110, lw * Math.min(1, (t - l2 + 1) * .4 + hash(k, 3)), 46); }
      c.restore();
    }
    // the laptop
    glow(c, 0, 0, 2200, '255,190,140', .25);
    c.fillStyle = '#16171b'; c.beginPath(); c.roundRect(-860, -560, 1720, 1120, 40); c.fill();
    c.drawImage(this.scr, -800, -500);
    c.fillStyle = '#202228'; c.beginPath(); c.moveTo(-960, 560); c.lineTo(960, 560); c.lineTo(1120, 680); c.lineTo(-1120, 680); c.closePath(); c.fill();
    c.fillStyle = 'rgba(255,220,190,.06)'; c.beginPath(); c.moveTo(-800, -500); c.lineTo(100, -500); c.lineTo(-400, 500); c.lineTo(-800, 500); c.fill(); // glass sheen
    c.restore();
    bloom(c, .4, 16);
  }
};
