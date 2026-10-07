// plates.js — heavy, one-time renders ("plates") that scenes animate over.
// Run via `node plates.mjs` → writes plates/*.png
'use strict';
const PW = 2304, PH = 1296; // plates are 1.2× the frame so the camera can push in

// ─────────────── photoreal library: raymarched in GLSL ───────────────
const LIBRARY_FS = `
#define BW 0.074
#define SH 0.46
#define WA 1.25
#define DE 0.42
#define BL 2.4
#define ZEND 34.0
float box(vec3 p, vec3 b){ vec3 q = abs(p) - b; return length(max(q, 0.)) + min(max(q.x, max(q.y, q.z)), 0.); }
float gMat; vec3 gBook;
float map(vec3 p){
  float d = p.y; gMat = 1.;
  float ce = 5.2 - p.y; if (ce < d){ d = ce; gMat = 2.; }
  float ew = ZEND - p.z; if (ew < d){ d = ew; gMat = 6.; }
  vec3 q = p; float side = sign(p.x); q.x = abs(q.x);
  float wall = (WA + DE + .02) - q.x; if (wall < d){ d = wall; gMat = 3.; }
  float top = SH * 8.;
  float ym = q.y - SH * floor(q.y / SH), yb = min(ym, SH - ym);
  float board = max(max(abs(q.x - (WA + DE*.5)) - DE*.5 - .01, yb - .022), q.y - top - .02);
  if (board < d){ d = board; gMat = 4.; }
  float zm = p.z - BL * floor(p.z / BL + .5);
  float up = max(max(abs(q.x - (WA + DE*.5)) - DE*.5 - .02, abs(zm) - .055), q.y - top - .3);
  if (up < d){ d = up; gMat = 4.; }
  float cor = max(abs(q.x - (WA + DE*.5)) - DE*.5 - .07, abs(q.y - top - .2) - .1);
  if (cor < d){ d = cor; gMat = 4.; }
  if (q.y < top && q.x > WA - .06){
    float iy = floor(q.y / SH), ly = q.y - iy * SH;
    float iz = floor(p.z / BW), lz = p.z - (iz + .5) * BW;
    vec2 id = vec2(iz, iy + side * 37.);
    float r = hh(id), r2 = hh(id + 13.1), r3 = hh(id + 7.7);
    float cz = (iz + .5) * BW, zmB = abs(cz - BL * floor(cz / BL + .5));
    if (r3 > .05 && zmB > .1){
      float hw = BW * .5 * (.6 + .36 * r), bh = SH * (.6 + .3 * r2), dep = DE * (.8 + .16 * r3);
      float b = box(vec3(q.x - (WA + DE - dep*.5 - .01), ly - .022 - bh*.5, lz), vec3(dep*.5, bh*.5, hw)) - .003;
      if (b < d){ d = b; gMat = 5.; gBook = vec3(r, r2, (ly - .022) / bh); }
    }
    d = min(d, max(BW*.5 - abs(lz), 0.) + .004);
  }
  float lz2 = p.z - BL * (floor(p.z / BL) + .5);
  float lamp = length(vec3(p.x, p.y - 3.95, lz2)) - .12;
  if (lamp < d){ d = lamp; gMat = 7.; }
  float cord = max(length(vec2(p.x, lz2)) - .007, 4.0 - p.y);
  if (cord < d){ d = cord; gMat = 8.; }
  return d;
}
vec3 nrm(vec3 p){ vec2 e = vec2(.0012, 0.); return normalize(vec3(map(p+e.xyy)-map(p-e.xyy), map(p+e.yxy)-map(p-e.yxy), map(p+e.yyx)-map(p-e.yyx))); }
float ao(vec3 p, vec3 n){ float s = 0., w = 1.; for (int i = 1; i <= 5; i++){ float h = .04 * float(i); s += w * (h - map(p + n*h)); w *= .6; } return clamp(1. - 3.5*s, 0., 1.); }
vec3 bookCol(float r){
  vec3 c = r < .18 ? vec3(.34,.05,.04) : r < .34 ? vec3(.06,.18,.09) : r < .5 ? vec3(.05,.08,.2) : r < .64 ? vec3(.42,.27,.13) : r < .78 ? vec3(.05,.04,.035) : r < .9 ? vec3(.48,.3,.07) : vec3(.55,.48,.38);
  return c;
}
void main(){
  vec2 uv = (gl_FragCoord.xy - R*.5) / R.y;
  vec3 ro = vec3(.12, 1.55, -2.2), ta = vec3(0., 1.85, ZEND);
  vec3 fw = normalize(ta - ro), rt = normalize(cross(vec3(0,1,0), fw)), up = cross(fw, rt);
  vec3 rd = normalize(uv.x*rt + uv.y*up + 1.25*fw);
  float t = .02, d; int i;
  for (i = 0; i < 260; i++){ d = map(ro + rd*t); if (d < .0006*t) break; t += d * .9; if (t > 60.) break; }
  vec3 p = ro + rd*t, n = nrm(p); float m = gMat; vec3 bk = gBook;
  vec3 win = vec3(0., 2.1, ZEND);
  vec3 alb = vec3(.1); vec3 emi = vec3(0.); float spec = 0.;
  if (m == 1.){ float pl = floor(p.x * 4.5); float g = hh(vec2(pl, floor(p.z * .7 + hh(vec2(pl)) * 9.)));
    alb = vec3(.2,.105,.05) * (.65 + .35*g) * (.85 + .3*fbm(vec2(p.x*40., p.z*2.))); spec = .9; }
  else if (m == 2.){ alb = vec3(.09,.05,.03) * (.8 + .4*fbm(p.xz*3.)); }
  else if (m == 3.){ alb = vec3(.07,.04,.025); }
  else if (m == 4.){ alb = vec3(.17,.085,.04) * (.75 + .4*fbm(vec2(p.y*30., p.z*3.))); spec = .25; }
  else if (m == 5.){ alb = bookCol(bk.x) * (.6 + .5*bk.y) * (.85 + .3*fbm(p.yz*60.));
    float band = step(.1, bk.z)*step(bk.z, .13) + step(.84, bk.z)*step(bk.z, .87) + step(.45, bk.z)*step(bk.z, .47)*step(.5, bk.y);
    if (band > 0. && abs(n.x) > .7){ alb = vec3(.75,.55,.22); spec = 1.2; } }
  else if (m == 6.){ alb = vec3(.06,.04,.03);
    vec2 w = p.xy - vec2(0., 2.1); bool inW = abs(w.x) < 1.05 && w.y > -1.5 && (w.y < 1. || length(vec2(w.x, w.y - 1.)) < 1.05);
    if (inW){ float bars = max(step(abs(fract(w.x/.35+.5)-.5)*.35, .018), step(abs(fract(w.y/.5+.5)-.5)*.5, .018));
      emi = mix(vec3(3.2,2.7,2.1), vec3(.05,.03,.02), bars); } }
  else if (m == 7.){ emi = vec3(7.,4.6,2.2); }
  else if (m == 8.){ alb = vec3(.02); }
  vec3 col = emi;
  if (dot(emi, emi) == 0.){
    float oc = ao(p, n);
    vec3 lit = vec3(.025,.018,.014) * oc;
    for (int k = -1; k <= 2; k++){
      vec3 lp = vec3(0., 3.82, BL * (floor(p.z / BL) + .5 + float(k)));
      vec3 l = lp - p; float dl = length(l); l /= dl;
      float df = max(dot(n, l), 0.), at = 1. / (1. + dl*dl*.5);
      lit += vec3(1.,.62,.32) * 1.9 * df * at * oc;
      if (spec > 0.) lit += vec3(1.,.7,.4) * spec * pow(max(dot(reflect(rd, n), l), 0.), 30.) * at * 2.;
    }
    vec3 wl = win - p; float dw = length(wl); wl /= dw;
    lit += vec3(1.,.82,.6) * max(dot(n, wl), 0.) * 7. / (1. + dw*dw*.08) * oc;
    if (m == 1.) lit += vec3(1.,.85,.65) * pow(max(dot(reflect(rd, n), wl), 0.), 18.) * 2.2 / (1. + dw*.05);
    col = alb * lit;
  }
  float fogA = 1. - exp(-t * .034);
  vec3 haze = vec3(1., .72, .44) * (.025 + 1.3 * pow(max(dot(rd, normalize(win - ro)), 0.), 22.));
  col = col * (1. - fogA) + haze * fogA;
  for (int k = 0; k < 16; k++){ // glowing halos around the pendant lamps
    vec3 lp = vec3(0., 3.95, BL * (float(k) + .5)); float tp = dot(lp - ro, rd);
    if (tp < 0. || tp > t + .2) continue;
    float dd = length(ro + rd*tp - lp);
    col += vec3(1.,.6,.3) * (.0022 / (dd*dd + .0009)) * exp(-tp*.03);
  }
  col = aces(col * .95);
  o = vec4(pow(col, vec3(1./2.2)), 1.);
}`;

// ─────────────── paper lit by raking light (normal from fibre height) ───────────────
const PAPER_FS = `
uniform vec3 TINT; uniform vec2 LIGHT;
float H(vec2 p){ return fbm(p*3.) * .55 + fbm(p*vec2(26., 22.)) * .25 + fbm(p*vec2(90., 80.))*.12 + hh(floor(p*700.))*.015; }
void main(){
  vec2 uv = gl_FragCoord.xy / R.y; float e = 1. / R.y;
  float h = H(uv), hx = H(uv + vec2(e,0.)) - h, hy = H(uv + vec2(0.,e)) - h;
  vec3 n = normalize(vec3(-hx*220., -hy*220., 1.));
  vec3 L = normalize(vec3(LIGHT, .55));
  float df = max(dot(n, L), 0.);
  float stain = smoothstep(.55, .8, fbm(uv*2.2 + 5.)) * .25;
  vec3 col = TINT * (.72 + .45*df) * (1. - stain*vec3(.2,.35,.6));
  vec2 c = gl_FragCoord.xy / R - .5; col *= 1. - dot(c,c)*.5;
  o = vec4(col, 1.);
}`;

// ─────────────── impasto: light the painted colour with its stroke height ───────────────
const IMPASTO_FS = `
uniform sampler2D C; uniform sampler2D Hm; uniform float K;
void main(){
  vec2 uv = gl_FragCoord.xy / R, e = 1. / R;
  float h = texture(Hm, uv).r;
  float hx = texture(Hm, uv + vec2(e.x, 0.)).r - texture(Hm, uv - vec2(e.x, 0.)).r;
  float hy = texture(Hm, uv + vec2(0., e.y)).r - texture(Hm, uv - vec2(0., e.y)).r;
  float weave = (sin(gl_FragCoord.x*1.9)*sin(gl_FragCoord.y*1.9))*.012;
  vec3 n = normalize(vec3(-hx*K, -hy*K, 1.));
  vec3 L = normalize(vec3(-.55, .6, .6));
  float df = dot(n, L), sp = pow(max(dot(reflect(-L, n), vec3(0,0,1)), 0.), 24.);
  vec3 c = texture(C, uv).rgb;
  c = c * (.82 + .32*df + weave) + sp * .16;
  o = vec4(c, 1.);
}`;

// ─────────────── painterly rendering (Hertzmann-style layered curved strokes) ───────────────
function paintify(src, o = {}) {
  const w = src.width, h = src.height, r = rng(o.seed || 1);
  const radii = o.radii || [26, 13, 7, 4];
  const out = mk(w, h), oc = out.getContext('2d', { willReadFrequently: true });
  const hm = mk(w, h), hc = hm.getContext('2d');
  oc.drawImage(src, 0, 0); oc.filter = 'blur(20px)'; oc.drawImage(src, 0, 0); oc.filter = 'none';
  hc.fillStyle = '#7a7a7a'; hc.fillRect(0, 0, w, h);
  const blurC = mk(w, h), bc = blurC.getContext('2d');
  radii.forEach((R0, li) => {
    bc.filter = `blur(${Math.max(1, R0 * .5)}px)`; bc.clearRect(0, 0, w, h); bc.drawImage(src, 0, 0); bc.filter = 'none';
    const B = bc.getImageData(0, 0, w, h).data, C = oc.getImageData(0, 0, w, h).data;
    const px = (x, y) => { x = clamp(x | 0, 0, w - 1); y = clamp(y | 0, 0, h - 1); const i = (y * w + x) * 4; return [B[i], B[i + 1], B[i + 2]]; };
    const lum = (x, y) => { const p = px(x, y); return .3 * p[0] + .59 * p[1] + .11 * p[2]; };
    const strokes = [], step = R0 * .85, T = li === 0 ? -1 : (o.thresh ?? 18);
    for (let y = 0; y < h; y += step) for (let x = 0; x < w; x += step) {
      const sx = x + (r() - .5) * step, sy = y + (r() - .5) * step;
      const b = px(sx, sy), ci = ((clamp(sy | 0, 0, h - 1)) * w + clamp(sx | 0, 0, w - 1)) * 4;
      const err = Math.abs(C[ci] - b[0]) + Math.abs(C[ci + 1] - b[1]) + Math.abs(C[ci + 2] - b[2]);
      if (err <= T * 3) continue;
      const pts = [[sx, sy]]; let cx = sx, cy = sy, dx = 0, dy = 0;
      const maxL = o.len ?? 9;
      for (let k = 0; k < maxL; k++) {
        const gx = lum(cx + 2, cy) - lum(cx - 2, cy), gy = lum(cx, cy + 2) - lum(cx, cy - 2);
        let nx = -gy, ny = gx; const gl = Math.hypot(nx, ny);
        if (gl < 1.5) { if (k === 0) { const a = (o.angle ?? 0) + (r() - .5) * (o.spreadA ?? .5); nx = Math.cos(a); ny = Math.sin(a); } else { nx = dx; ny = dy; } }
        else { nx /= gl; ny /= gl; }
        if (k > 0 && nx * dx + ny * dy < 0) { nx = -nx; ny = -ny; }
        if (k > 0) { nx = lerp(dx, nx, o.curv ?? .7); ny = lerp(dy, ny, o.curv ?? .7); const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l; }
        cx += nx * R0 * .9; cy += ny * R0 * .9; dx = nx; dy = ny;
        const c2 = px(cx, cy);
        if (k > 2 && Math.abs(c2[0] - b[0]) + Math.abs(c2[1] - b[1]) + Math.abs(c2[2] - b[2]) > 70) break;
        pts.push([cx, cy]);
      }
      const j = (o.jitter ?? 10);
      strokes.push({ pts, R0, col: [b[0] + (r() - .5) * j, b[1] + (r() - .5) * j, b[2] + (r() - .5) * j], hv: 110 + r() * 110 });
    }
    for (let i = strokes.length - 1; i > 0; i--) { const k = r() * (i + 1) | 0; [strokes[i], strokes[k]] = [strokes[k], strokes[i]]; }
    for (const s of strokes) {
      const path = (c) => { c.beginPath(); c.moveTo(s.pts[0][0], s.pts[0][1]); for (let k = 1; k < s.pts.length; k++) { const a = s.pts[k - 1], b = s.pts[k]; c.quadraticCurveTo(a[0], a[1], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2); } const L = s.pts[s.pts.length - 1]; c.lineTo(L[0], L[1]); };
      oc.lineCap = hc.lineCap = 'round'; oc.lineJoin = hc.lineJoin = 'round';
      oc.strokeStyle = `rgb(${s.col.map(v => clamp(v, 0, 255) | 0).join(',')})`; oc.lineWidth = s.R0 * 1.7; path(oc); oc.stroke();
      // height: a ridge per stroke plus bristle grooves
      hc.strokeStyle = `rgb(${s.hv | 0},${s.hv | 0},${s.hv | 0})`; hc.lineWidth = s.R0 * 1.7; path(hc); hc.stroke();
      hc.lineWidth = Math.max(1, s.R0 * .18);
      for (let b = -2; b <= 2; b++) {
        hc.save(); const a = Math.atan2(s.pts[1] ? s.pts[1][1] - s.pts[0][1] : 0, s.pts[1] ? s.pts[1][0] - s.pts[0][0] : 1);
        hc.translate(-Math.sin(a) * b * s.R0 * .32, Math.cos(a) * b * s.R0 * .32);
        hc.strokeStyle = `rgba(${b % 2 ? 60 : 210},${b % 2 ? 60 : 210},${b % 2 ? 60 : 210},${o.bristle ?? .16})`; path(hc); hc.stroke(); hc.restore();
      }
    }
  });
  const g = new GLRunner(w, h);
  const lit = g.run(IMPASTO_FS, { K: o.relief ?? 2.2 }, { C: out, Hm: hm });
  const res = mk(w, h); res.getContext('2d').drawImage(lit, 0, 0); return res;
}

// ─────────────── base images (then painted) ───────────────
function sfBase(w, h) { // Golden Gate in morning fog
  const c = mk(w, h), x = c.getContext('2d'), r = rng(2021);
  const sky = x.createLinearGradient(0, 0, 0, h * .62);
  sky.addColorStop(0, '#24324f'); sky.addColorStop(.45, '#7d6d86'); sky.addColorStop(.8, '#e0a48a'); sky.addColorStop(1, '#f6cf9f');
  x.fillStyle = sky; x.fillRect(0, 0, w, h);
  // clouds
  for (let k = 0; k < 40; k++) { const cx = r() * w, cy = h * (.08 + r() * .3), s = 80 + r() * 200; const g = x.createRadialGradient(cx, cy, 0, cx, cy, s); g.addColorStop(0, `rgba(250,${200 + r() * 30 | 0},190,${.18 + r() * .2})`); g.addColorStop(1, 'rgba(250,210,190,0)'); x.fillStyle = g; x.save(); x.scale(1, .35); x.beginPath(); x.arc(cx, cy / .35, s, 0, TAU); x.fill(); x.restore(); }
  // sun
  const sx = w * .7, sy = h * .58; const sg = x.createRadialGradient(sx, sy, 0, sx, sy, h * .5); sg.addColorStop(0, 'rgba(255,240,200,1)'); sg.addColorStop(.06, 'rgba(255,220,160,.9)'); sg.addColorStop(.3, 'rgba(255,170,120,.3)'); sg.addColorStop(1, 'rgba(255,150,110,0)');
  x.fillStyle = sg; x.fillRect(0, 0, w, h);
  // water
  const wg = x.createLinearGradient(0, h * .62, 0, h); wg.addColorStop(0, '#c99a8a'); wg.addColorStop(.25, '#5c5a72'); wg.addColorStop(1, '#1d2236');
  x.fillStyle = wg; x.fillRect(0, h * .62, w, h * .38);
  for (let k = 0; k < 500; k++) { const y = h * .62 + Math.pow(r(), 1.6) * h * .38, len = 20 + r() * 140 * (y / h); const near = Math.abs(r() * w - sx) < 300 * (y / h + .3); x.fillStyle = near ? `rgba(255,220,170,${.5 * r()})` : `rgba(230,190,180,${.15 * r()})`; x.fillRect(near ? sx + (r() - .5) * 500 * (y / h) : r() * w, y, len, 2 + y / h * 3); }
  // distant hills of the city side
  x.fillStyle = '#9a7c8c'; x.beginPath(); x.moveTo(w * .25, h * .62); for (let px = w * .25; px <= w; px += 10) x.lineTo(px, h * .6 - 40 * fbm(px / 200, 5, 4, 8)); x.lineTo(w, h * .62); x.fill();
  // headlands
  x.fillStyle = '#3c3048'; x.beginPath(); x.moveTo(0, h * .64); for (let px = 0; px <= w * .3; px += 10) x.lineTo(px, h * .64 - 170 * Math.sin(px / (w * .3) * Math.PI * .9) - 30 * fbm(px / 120, 1, 4, 3)); x.lineTo(w * .32, h * .64); x.fill();
  x.fillStyle = '#5a4a5c'; x.beginPath(); x.moveTo(w * .78, h * .63); for (let px = w * .78; px <= w; px += 10) x.lineTo(px, h * .63 - 90 * smooth(w * .78, w, px) - 20 * fbm(px / 90, 2, 4, 4)); x.lineTo(w, h * .63); x.fill();
  // bridge
  const deck = h * .56, T1 = w * .33, T2 = w * .74, top = h * .17;
  const tower = (tx, s) => {
    x.fillStyle = '#8a2a20';
    for (const dx of [-26, 26]) x.fillRect(tx + dx * s - 11 * s, top + (1 - s) * 200, 22 * s, h * .64 - top - (1 - s) * 200);
    for (const yy of [.0, .22, .45, .7]) x.fillRect(tx - 37 * s, top + (1 - s) * 200 + yy * (deck - top) + 10, 74 * s, 16 * s);
  };
  x.strokeStyle = '#7a2a22'; x.lineWidth = 5;
  const cable = (a, b, ya, yb, sag) => { x.beginPath(); for (let k = 0; k <= 60; k++) { const t = k / 60, X = lerp(a, b, t), Y = lerp(ya, yb, t) + sag * (1 - (2 * t - 1) ** 2); k ? x.lineTo(X, Y) : x.moveTo(X, Y); } x.stroke(); };
  cable(T1, T2, top + 14, top + 34, 300); cable(-50, T1, deck + 30, top + 14, 60); cable(T2, w + 50, top + 34, deck + 20, 70);
  x.lineWidth = 1.4; x.strokeStyle = 'rgba(120,40,34,.8)';
  for (let k = 1; k < 40; k++) { const t = k / 40, X = lerp(T1, T2, t), Y = lerp(top + 14, top + 34, t) + 300 * (1 - (2 * t - 1) ** 2); x.beginPath(); x.moveTo(X, Y); x.lineTo(X, deck); x.stroke(); }
  tower(T1, 1); tower(T2, .92);
  x.fillStyle = '#6e241d'; x.fillRect(0, deck, w, 16);
  // fog bank swallowing the deck and the tower feet
  for (let k = 0; k < 260; k++) {
    const fx = r() * w, fy = deck + 30 + (r() - .4) * 150, s = 80 + r() * 260;
    x.save(); x.translate(fx, fy); x.scale(1, .32);
    const g = x.createRadialGradient(0, 0, 0, 0, 0, s); g.addColorStop(0, `rgba(252,${222 + r() * 20 | 0},${208 + r() * 20 | 0},${.16 + r() * .22})`); g.addColorStop(1, 'rgba(250,226,214,0)');
    x.fillStyle = g; x.beginPath(); x.arc(0, 0, s, 0, TAU); x.fill(); x.restore();
  }
  return c;
}

function savannaBase(w, h, sky) { // the campfire under the Milky Way (people included)
  const c = mk(w, h), x = c.getContext('2d'), r = rng(303);
  x.drawImage(sky, 0, 0, w, h);
  x.fillStyle = '#1b130d'; x.beginPath(); x.moveTo(0, h);
  for (let px = 0; px <= w; px += 8) x.lineTo(px, h * .6 - 40 * fbm(px / 300, 1, 4, 301) - (px > w * .1 && px < w * .32 ? 34 * Math.sin((px - w * .1) / (w * .22) * Math.PI) : 0));
  x.lineTo(w, h); x.fill();
  const g = x.createLinearGradient(0, h * .6, 0, h); g.addColorStop(0, '#2c2016'); g.addColorStop(1, '#0d0806'); x.fillStyle = g; x.fillRect(0, h * .61, w, h);
  const fx = w * .45, fy = h * .74;
  const lg = x.createRadialGradient(fx, fy, 10, fx, fy, w * .45); lg.addColorStop(0, 'rgba(255,150,60,.75)'); lg.addColorStop(.3, 'rgba(200,90,30,.3)'); lg.addColorStop(1, 'rgba(120,50,20,0)');
  x.fillStyle = lg; x.fillRect(0, 0, w, h);
  const ppl = [[-330, -10, 1.15, 1], [-200, 34, 1.32, 1], [-70, -44, .95, 1], [110, -44, .98, -1], [250, 30, 1.28, -1], [380, -6, 1.1, -1]];
  ppl.forEach(([dx, dy, s, dir], k) => sitter(x, fx + dx * 1.2, fy + dy, s, dir, '#0b0604', 0, k, .9));
  const lg2 = x.createRadialGradient(fx, fy - 30, 5, fx, fy - 30, 160); lg2.addColorStop(0, 'rgba(255,220,150,.9)'); lg2.addColorStop(1, 'rgba(255,140,50,0)'); x.fillStyle = lg2; x.fillRect(fx - 200, fy - 220, 400, 400);
  x.fillStyle = '#0c0805'; const ax = w * .83, ay = h * .61;
  x.beginPath(); x.moveTo(ax - 8, ay); x.lineTo(ax, ay - 110); x.lineTo(ax - 36, ay - 190); x.lineTo(ax - 26, ay - 192); x.lineTo(ax + 6, ay - 130); x.lineTo(ax + 40, ay - 200); x.lineTo(ax + 50, ay - 196); x.lineTo(ax + 14, ay - 110); x.lineTo(ax + 10, ay); x.fill();
  for (let k = 0; k < 70; k++) { x.beginPath(); x.ellipse(ax - 160 + r() * 330, ay - 214 + r() * 34, 30 + r() * 60, 8 + r() * 12, 0, 0, TAU); x.fill(); }
  return c;
}

// ─────────────── registry ───────────────
const PLATES = {
  async library_test() { const g = new GLRunner(640, 360); const c = g.run(LIBRARY_FS); const o = mk(640, 360); o.getContext('2d').drawImage(c, 0, 0); return o; },
  async library() {
    const g = new GLRunner(PW * 1.25, PH * 1.25); const c = g.run(LIBRARY_FS);
    const o = mk(PW, PH), x = o.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(c, 0, 0, PW, PH); return o;
  },
  async paper() { const g = new GLRunner(PW, PH); const c = g.run(PAPER_FS, { TINT: [.93, .88, .78], LIGHT: [-.8, .35] }); const o = mk(PW, PH); o.getContext('2d').drawImage(c, 0, 0); return o; },
  async parchment() { const g = new GLRunner(PW, PH); const c = g.run(PAPER_FS, { TINT: [.9, .8, .62], LIGHT: [-.9, .2] }); const o = mk(PW, PH); o.getContext('2d').drawImage(c, 0, 0); return o; },
  async bokeh() { // a night city seen through rain: out-of-focus lights
    const w = PW, h = PH, c = mk(w, h), x = c.getContext('2d'), r = rng(88);
    const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#060912'); g.addColorStop(.55, '#101828'); g.addColorStop(1, '#1a1410'); x.fillStyle = g; x.fillRect(0, 0, w, h);
    const b = mk(w, h), bx = b.getContext('2d');
    for (let k = 0; k < 26; k++) { const bw = 80 + r() * 200, bh = 200 + r() * 700, x0 = r() * w; bx.fillStyle = `rgb(${10 + r() * 12 | 0},${12 + r() * 14 | 0},${20 + r() * 16 | 0})`; bx.fillRect(x0, h * .75 - bh, bw, bh + h);
      for (let j = 0; j < bh / 26; j++) for (let i = 0; i < bw / 22; i++) if (r() < .35) { bx.fillStyle = r() < .8 ? `rgba(255,${190 + r() * 50 | 0},${110 + r() * 60 | 0},${.5 + r() * .5})` : 'rgba(170,210,255,.8)'; bx.fillRect(x0 + 6 + i * 22, h * .75 - bh + 8 + j * 26, 10, 14); } }
    x.filter = 'blur(14px)'; x.drawImage(b, 0, 0); x.filter = 'none';
    x.globalCompositeOperation = 'lighter';
    const cols = ['255,190,110', '255,220,170', '255,120,80', '120,200,255', '255,90,70', '200,255,220', '255,160,60'];
    for (let k = 0; k < 300; k++) {
      const bx2 = r() * w, by = h * (.3 + Math.pow(r(), .7) * .7), rad = 12 + Math.pow(r(), 2.4) * 85, col = cols[r() * cols.length | 0], a = .06 + r() * .26;
      const gg = x.createRadialGradient(bx2, by, 0, bx2, by, rad);
      gg.addColorStop(0, `rgba(${col},${a * .7})`); gg.addColorStop(.82, `rgba(${col},${a})`); gg.addColorStop(.92, `rgba(${col},${a * 1.2})`); gg.addColorStop(1, `rgba(${col},0)`);
      x.fillStyle = gg; x.beginPath(); x.arc(bx2, by, rad, 0, TAU); x.fill();
    }
    // street-level traffic streak glow
    const tg = x.createLinearGradient(0, h * .8, 0, h); tg.addColorStop(0, 'rgba(255,120,60,0)'); tg.addColorStop(.5, 'rgba(255,120,60,.25)'); tg.addColorStop(1, 'rgba(255,80,40,.05)'); x.fillStyle = tg; x.fillRect(0, h * .8, w, h * .2);
    return c;
  },
  async sf() { return paintify(sfBase(PW, PH), { seed: 7, radii: [30, 15, 8, 4], relief: 1.6, bristle: .14 }); },
  async savanna() {
    const sky = makeSky({ w: PW, h: PH, top: [8, 10, 26], bot: [70, 50, 38], band: 1.2, bandY: .2, bandTilt: .55, seed: 300, stars: 0 });
    const p = paintify(savannaBase(PW, PH, sky), { seed: 9, radii: [22, 11, 6, 3.5], relief: 1.6, thresh: 10, bristle: .12 });
    const stars = makeSky({ w: PW, h: PH, top: [0, 0, 0], bot: [0, 0, 0], seed: 301, stars: 2400, starH: .6 });
    const x = p.getContext('2d'); x.globalCompositeOperation = 'screen'; x.drawImage(stars, 0, 0);
    return p;
  },
};
