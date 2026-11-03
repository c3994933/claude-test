# Beat-synced neon night-drive video. Renders frames with PIL/numpy and pipes to ffmpeg.
import numpy as np, json, math, sys, subprocess, random
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageChops
from multiprocessing import Pool

W = int(sys.argv[1]) if len(sys.argv) > 1 else 720
H = W * 16 // 9
S = W / 720.0
FPS = 30
T0 = 2.0            # audio offset (video t=0 -> audio 2.0s)
DUR = 27.6
NF = int(DUR * FPS)
ONLY = sys.argv[2] if len(sys.argv) > 2 else None   # "preview" -> few stills

g = json.load(open('grid.json'))
P = 60.0 / g['bpm']
B0 = g['first']
F = np.load('vfeats.npz'); BANDS = F['bands']; FLUX = F['flux']; RMS = F['rms']

LATIN = '/usr/share/fonts/opentype/inter/Inter-Black.otf'
LATIN_I = '/usr/share/fonts/opentype/inter/Inter-BlackItalic.otf'
CJK = '/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc'
MONO = '/usr/share/fonts/truetype/jetbrains-mono/JetBrainsMono-ExtraBoldItalic.ttf'
_fc = {}
def font(path, size):
    k = (path, int(size))
    if k not in _fc: _fc[k] = ImageFont.truetype(path, int(size))
    return _fc[k]

def beat_t(k): return B0 + k * P
DROP = beat_t(12)        # 10.55
OUTRO = beat_t(36)       # 26.54
END_A = T0 + DUR

def s(v): return int(round(v * S))

# ---------------- palettes (sky top, sky bottom, neon A, neon B, sun top, sun bottom)
PALS = [
    ((10, 4, 30), (70, 10, 80), (255, 40, 200), (0, 230, 255), (255, 230, 90), (255, 40, 140)),
    ((4, 6, 34), (20, 40, 110), (0, 255, 200), (255, 60, 160), (255, 250, 140), (255, 90, 60)),
    ((20, 2, 20), (110, 10, 40), (255, 120, 0), (255, 0, 120), (255, 240, 120), (255, 30, 60)),
    ((2, 12, 22), (10, 70, 80), (120, 255, 60), (0, 180, 255), (230, 255, 140), (0, 200, 160)),
    ((18, 0, 40), (90, 0, 120), (255, 70, 220), (190, 80, 255), (255, 200, 255), (160, 40, 255)),
    ((30, 6, 4), (140, 30, 10), (255, 210, 0), (255, 60, 0), (255, 255, 160), (255, 80, 0)),
]
def lerp(a, b, u): return tuple(int(a[i] + (b[i] - a[i]) * u) for i in range(len(a)))
def palette(t):
    if t < DROP: return PALS[0]
    bar = int((t - DROP) / (4 * P))
    if t >= OUTRO: return PALS[0]
    return PALS[(bar + 1) % len(PALS)]

# ---------------- timing helpers
def since_last(events, t):
    best = None
    for e in events:
        if e <= t: best = e
        else: break
    return None if best is None else t - best

BEATS = [beat_t(k) for k in range(0, 42)]
BACKBEATS = [beat_t(k) for k in range(1, 40, 2)]
BAR_DOWN_MAIN = [beat_t(k) for k in range(12, 36, 4)]
def hop_events():
    ev = []
    for k in range(0, 36):
        t = beat_t(k)
        if 28 <= k < 32: ev.append((t, 52))          # BOUNCE bar: every beat, big
        elif k >= 12 and k % 2 == 1: ev.append((t, 30))
        elif k < 12 and k % 2 == 1: ev.append((t, 7))
    return ev
HOPS = hop_events()
FLAMES = []
for k in range(12, 36, 4):
    for off in (1.75, 2.75, 3.75):          # dembow off-beat 16ths
        FLAMES.append(beat_t(k) + off * P)
    FLAMES.append(beat_t(k))
FLAMES.sort()
SMOKES = [beat_t(k) for k in range(36, 40)] + [beat_t(36) + 0.5 * P, beat_t(37) + 0.5 * P]
SMOKES.sort()

def pulse(t, events, tau=0.12):
    d = since_last(events, t)
    return 0.0 if d is None else math.exp(-d / tau)

def speed(t):
    if t < DROP - 0.4: return 0.55
    if t < DROP: return 0.55 + 0.25 * (t - (DROP - 0.4)) / 0.4
    if t < OUTRO: return 3.4 + (0.6 if 28 <= (t - B0) / P < 32 else 0)
    u = min(1, (t - OUTRO) / 2.3)
    return 3.4 * (1 - u) ** 2

_ts = T0 + np.arange(NF + 2) / FPS
DIST = np.cumsum([speed(t) / FPS for t in _ts])

def fuel(t):
    if t < B0: return 0.03
    if t < DROP:
        k = (t - B0) / P
        kk = math.floor(k); fr = k - kk
        step = min(1, fr / 0.25)                         # glug per beat
        return 0.03 + 0.97 * (kk + step) / 12
    if t < OUTRO: return 1.0 - 0.15 * (t - DROP) / (OUTRO - DROP)
    u = min(1, (t - OUTRO) / 1.8)
    return max(0, 0.85 * (1 - u))

# ---------------- static layers
rng = np.random.default_rng(7)
STARS = [(rng.uniform(0, 720), rng.uniform(0, 640), rng.uniform(0.6, 2.2), rng.uniform(0, 6.28)) for _ in range(140)]
yy, xx = np.mgrid[0:H, 0:W]
VIGN = (1 - 0.55 * (((xx - W / 2) / (W * 0.75)) ** 2 + ((yy - H / 2) / (H * 0.75)) ** 2)).clip(0.25, 1).astype(np.float32)
SCAN = (1 - 0.07 * ((yy // max(1, s(2))) % 2)).astype(np.float32)
POST = (VIGN * SCAN)[..., None]

HOR = 680
CX = 360
SUN_C = (360, 520); SUN_R = 205

def sky(pal):
    top, bot = np.array(pal[0], np.float32), np.array(pal[1], np.float32)
    u = (np.arange(s(HOR)) / s(HOR))[:, None] ** 1.6
    col = top * (1 - u) + bot * u
    img = np.zeros((H, W, 3), np.float32)
    img[:s(HOR)] = col[:, None, :]
    # ground
    gu = (np.arange(H - s(HOR)) / (H - s(HOR)))[:, None]
    img[s(HOR):] = (np.array([6, 2, 14]) * (1 - gu) + np.array([2, 0, 6]) * gu)[:, None, :]
    return img

def glow_add(base, layer, radius, strength=1.0):
    """base: float array HxWx3, layer: PIL RGB. adds layer + blurred halo."""
    small = layer.resize((W // 4, H // 4), Image.BILINEAR).filter(ImageFilter.GaussianBlur(radius / 4 * S))
    halo = np.asarray(small.resize((W, H), Image.BILINEAR), np.float32)
    sharp = np.asarray(layer, np.float32)
    base += sharp + halo * 2.2 * strength
    return base

def draw_sun(img_np, t, pal):
    pb = pulse(t, BEATS, 0.15)
    r = SUN_R * (1 + 0.05 * pb + (0.10 * pulse(t, [DROP], 0.4)))
    cx, cy = SUN_C
    m_ = r + 220
    y0, y1 = int(s(cy - m_)), int(s(HOR))
    x0, x1 = int(s(cx - m_)), int(s(cx + m_))
    Y, X = np.mgrid[max(0, y0):y1, max(0, x0):min(W, x1)]
    d = np.sqrt((X - s(cx)) ** 2 + (Y - s(cy)) ** 2)
    inside = d < s(r)
    v = ((Y - s(cy - r)) / (2 * s(r))).clip(0, 1)
    # moving stripes in lower part
    stripe_phase = (t * 0.35) % 1
    yy_rel = (Y - s(cy)) / s(r)            # -1..1
    band = np.ones_like(d, bool)
    for i in range(7):
        c = ((i + stripe_phase) / 7.0) * 1.0
        th = 0.012 + 0.05 * c
        band &= ~((yy_rel > c - th) & (yy_rel < c + th))
    m = inside & band
    st, sb = np.array(pal[4], np.float32), np.array(pal[5], np.float32)
    col = st[None, None] * (1 - v[..., None]) + sb[None, None] * v[..., None]
    region = img_np[max(0, y0):y1, max(0, x0):min(W, x1)]
    region[m] = col[m] * (1.0 + 0.25 * pb)
    # halo
    halo = np.exp(-np.clip(d - s(r), 0, None) / (s(55))) * (~inside)
    region += halo[..., None] * sb[None, None] * (0.35 + 0.3 * pb)

def draw_stars(d, t):
    for (x, y, r, ph) in STARS:
        a = 0.5 + 0.5 * math.sin(t * 3 + ph)
        c = int(120 + 135 * a)
        rr = r * S
        d.ellipse([s(x) - rr, s(y) - rr, s(x) + rr, s(y) + rr], fill=(c, c, c))

def draw_skyline(d_dark, d_neon, i, pal):
    b = BANDS[min(i, len(BANDS) - 1)]
    n = 24
    bw = 720 / n
    for k in range(n):
        # mirror so low freqs are in the middle
        idx = abs(k - n // 2) * 2 if k != n // 2 else 0
        idx = min(23, idx)
        h = 30 + 160 * b[idx] ** 1.3
        x0 = k * bw + 3; x1 = (k + 1) * bw - 3
        d_dark.rectangle([s(x0), s(HOR - h), s(x1), s(HOR)], fill=(8, 3, 18))
        col = pal[2] if k % 2 else pal[3]
        d_neon.line([s(x0), s(HOR - h), s(x1), s(HOR - h)], fill=col, width=max(1, s(3)))
        # windows
        for wy in range(int(HOR - h + 12), HOR - 6, 14):
            if (k * 7 + wy) % 3 == 0:
                d_neon.rectangle([s(x0 + 5), s(wy), s(x0 + 9), s(wy + 4)], fill=tuple(int(c * 0.5) for c in col))

def draw_grid(d, t, i, pal):
    dist = DIST[i]
    pb = pulse(t, BEATS, 0.18)
    br = 0.45 + 0.55 * pb
    colA = tuple(int(c * br) for c in pal[2])
    colB = tuple(int(c * (0.6 + 0.4 * pb)) for c in pal[3])
    D = (1280 - HOR) * 1.0
    fr = dist % 1.0
    for n in range(1, 45):
        z = n - fr
        if z <= 0.15: continue
        y = HOR + D / z
        if y > 1300: continue
        fade = min(1, (y - HOR) / 120)
        c = tuple(int(v * fade) for v in colA)
        d.line([0, s(y), W, s(y)], fill=c, width=max(1, s(2.5 if y > 900 else 1.5)))
    for k in range(-14, 15):
        xb = CX + k * 110
        d.line([s(CX + k * 3), s(HOR), s(xb), s(1290)], fill=colA, width=max(1, s(2)))
    # road edges
    for k in (-2.3, 2.3):
        d.line([s(CX + k * 6), s(HOR), s(CX + k * 260), s(1290)], fill=colB, width=max(1, s(6)))
    # center dashes
    for n in range(1, 30):
        z0 = n * 2 - (dist * 1.0) % 2
        z1 = z0 + 0.9
        if z0 <= 0.3: continue
        y0 = HOR + D / z1; y1 = HOR + D / z0
        w0 = 2 + 30 / z1; w1 = 2 + 30 / z0
        d.polygon([(s(CX - w0 / 2), s(y0)), (s(CX + w0 / 2), s(y0)), (s(CX + w1 / 2), s(min(y1, 1300))), (s(CX - w1 / 2), s(min(y1, 1300)))], fill=(255, 255, 255))

def draw_speedlines(d, t, i, pal):
    sp = speed(t)
    if sp < 1.2: return
    r = random.Random(i * 7919)
    n = int(18 * (sp / 3.4))
    for _ in range(n):
        ang = r.uniform(0, 2 * math.pi)
        r0 = r.uniform(250, 600)
        L = r.uniform(80, 260) * sp / 3.4
        x0 = CX + math.cos(ang) * r0; y0 = 560 + math.sin(ang) * r0 * 1.2
        x1 = CX + math.cos(ang) * (r0 + L); y1 = 560 + math.sin(ang) * (r0 + L) * 1.2
        c = pal[3] if r.random() < 0.5 else (255, 255, 255)
        c = tuple(int(v * 0.55) for v in c)
        d.line([s(x0), s(y0), s(x1), s(y1)], fill=c, width=max(1, s(2)))

def hop_height(t):
    best = None
    for (te, h) in HOPS:
        if te <= t: best = (te, h)
        else: break
    if not best: return 0, 0
    dt = t - best[0]; T = min(0.42, P * 0.85)
    if dt < T:
        u = dt / T
        return best[1] * 4 * u * (1 - u), 0
    land = dt - T
    return 0, math.exp(-land / 0.08) * (best[1] / 52)  # squash amount

def draw_car(d, dn, t, pal):
    h, squash = hop_height(t)
    sway = 0
    k = (t - B0) / P
    if 20 <= k < 28: sway = 26 * math.sin((t - beat_t(20)) * math.pi / P)   # drift sway
    if t >= OUTRO:  # sputter jitter
        sway = 6 * math.sin(t * 60) * pulse(t, SMOKES, 0.15)
    cx = 360 + sway
    gy = 1075                              # ground line of wheels
    body_lift = h + 6 - squash * 10
    wheel_lift = h * 0.55
    # shadow
    sh = max(0.35, 1 - h / 90)
    d.ellipse([s(cx - 190 * sh), s(gy - 14), s(cx + 190 * sh), s(gy + 18)], fill=(2, 0, 4, 200))
    # wheels
    for wx in (-125, 125):
        d.rounded_rectangle([s(cx + wx - 34), s(gy - 58 - wheel_lift), s(cx + wx + 34), s(gy - wheel_lift)], radius=s(10), fill=(14, 12, 18))
    by = gy - 40 - body_lift
    sq = 1 + squash * 0.06
    # lower body
    bw = 175 * sq
    d.rounded_rectangle([s(cx - bw), s(by - 110 / sq), s(cx + bw), s(by)], radius=s(26), fill=(28, 16, 44))
    # bumper
    d.rounded_rectangle([s(cx - bw - 6), s(by - 28), s(cx + bw + 6), s(by + 6)], radius=s(12), fill=(16, 10, 26))
    # cabin
    top = by - 110 / sq - 92 / sq
    d.polygon([(s(cx - 120), s(top)), (s(cx + 120), s(top)), (s(cx + 160 * sq), s(by - 110 / sq)), (s(cx - 160 * sq), s(by - 110 / sq))], fill=(22, 12, 36))
    # rear window reflecting sun
    wt = top + 10
    wb = by - 110 / sq - 8
    d.polygon([(s(cx - 108), s(wt)), (s(cx + 108), s(wt)), (s(cx + 142 * sq), s(wb)), (s(cx - 142 * sq), s(wb))], fill=tuple(int(c * 0.45) for c in pal[1]))
    d.line([(s(cx - 60), s(wt + 4)), (s(cx - 95), s(wb - 4))], fill=tuple(int(c * 0.6) for c in pal[5]), width=s(8))
    # neon outline on body (glow layer)
    dn.rounded_rectangle([s(cx - bw), s(by - 110 / sq), s(cx + bw), s(by)], radius=s(26), outline=pal[3], width=max(1, s(3)))
    dn.line([(s(cx - 120), s(top)), (s(cx + 120), s(top))], fill=pal[3], width=max(1, s(3)))
    # tail lights (flash on backbeat)
    tl = 0.55 + 0.45 * pulse(t, BACKBEATS, 0.16)
    if t >= OUTRO: tl = 0.3 + 0.7 * (0.5 + 0.5 * math.sin(t * 40))
    red = (255, int(30 * tl), int(60 * tl))
    red = tuple(int(c * tl) for c in red)
    ly = by - 78 / sq
    for sx in (-1, 1):
        x_in, x_out = cx + sx * 60, cx + sx * (bw - 14)
        dn.rounded_rectangle([s(min(x_in, x_out)), s(ly), s(max(x_in, x_out)), s(ly + 22)], radius=s(8), fill=red)
    # plate
    d.rectangle([s(cx - 48), s(by - 48), s(cx + 48), s(by - 20)], fill=(235, 235, 220))
    d.text((s(cx), s(by - 34)), "GAS 90", font=font(MONO, s(18)), fill=(20, 20, 40), anchor='mm')
    # exhaust pipe
    ex = (cx + 95, by - 2)
    d.ellipse([s(ex[0] - 12), s(ex[1] - 7), s(ex[0] + 12), s(ex[1] + 9)], fill=(60, 60, 70))
    return ex

def draw_flames(dn, t, ex):
    for te in FLAMES:
        dt = t - te
        if dt < 0 or dt > 0.35: continue
        r = random.Random(int(te * 1000))
        u = dt / 0.35
        for j in range(26):
            vx = r.uniform(-80, 80); vy = r.uniform(30, 260)
            px = ex[0] + vx * dt * 2.2; py = ex[1] + vy * dt * 1.4
            rad = (14 + r.uniform(0, 22)) * (1 - u) * (1 + 2 * dt)
            heat = 1 - u
            col = (255, int(80 + 175 * heat * r.random()), int(40 * heat))
            col = tuple(int(c * (1 - u * 0.7)) for c in col)
            dn.ellipse([s(px - rad), s(py - rad), s(px + rad), s(py + rad)], fill=col)

def draw_smoke(d, t, ex):
    for te in SMOKES:
        dt = t - te
        if dt < 0 or dt > 1.2: continue
        r = random.Random(int(te * 777))
        u = dt / 1.2
        for j in range(10):
            px = ex[0] + r.uniform(-30, 60) * dt * 2 + 20 * dt
            py = ex[1] - r.uniform(20, 110) * dt * 1.5
            rad = (18 + r.uniform(0, 26)) * (0.5 + 1.6 * u)
            g = int(150 * (1 - u))
            d.ellipse([s(px - rad), s(py - rad), s(px + rad), s(py + rad)], fill=(170, 170, 185, int(230 * (1 - u))))

def draw_sparks(dn, t):
    for (te, cnt, origin) in ((DROP, 140, (360, 1000)),):
        dt = t - te
        if dt < 0 or dt > 1.4: continue
        r = random.Random(42)
        for j in range(cnt):
            ang = r.uniform(0, 2 * math.pi); v = r.uniform(250, 900)
            px = origin[0] + math.cos(ang) * v * dt
            py = origin[1] + math.sin(ang) * v * dt + 500 * dt * dt
            fade = max(0, 1 - dt / 1.4)
            c = (255, int(200 * fade + 55), int(80 * fade))
            c = tuple(int(x * fade) for x in c)
            L = 0.03
            qx = px - math.cos(ang) * v * L; qy = py - math.sin(ang) * v * L
            dn.line([s(qx), s(qy), s(px), s(py)], fill=c, width=max(1, s(3)))

# ---------------- text
def text_layer(txt, path, size, fill, stroke=None):
    f = font(path, s(size))
    l, tp, r, b = f.getbbox(txt, stroke_width=s(6) if stroke else 0)
    im = Image.new('RGBA', (r - l + s(40), b - tp + s(40)), (0, 0, 0, 0))
    dd = ImageDraw.Draw(im)
    if stroke:
        dd.text((s(20) - l, s(20) - tp), txt, font=f, fill=fill, stroke_width=s(6), stroke_fill=stroke)
    else:
        dd.text((s(20) - l, s(20) - tp), txt, font=f, fill=fill)
    return im

def paste_pop(base, im, center, scale, alpha, rot=0):
    if alpha <= 0.01 or scale <= 0.01: return
    w, h = im.size
    nw, nh = max(1, int(w * scale)), max(1, int(h * scale))
    im2 = im.resize((nw, nh), Image.BILINEAR)
    if rot: im2 = im2.rotate(rot, resample=Image.BILINEAR, expand=True)
    if alpha < 1:
        a = im2.getchannel('A').point(lambda v: int(v * alpha)); im2.putalpha(a)
    base.alpha_composite(im2, (int(s(center[0]) - im2.size[0] / 2), int(s(center[1]) - im2.size[1] / 2)))

def pop_curve(dt, life):
    """scale/alpha for a word popping at dt seconds of a life-long display"""
    if dt < 0 or dt > life: return 0, 0
    sc = 1 + 0.6 * math.exp(-dt / 0.06) * 1.0
    al = min(1, dt / 0.03) * (1 if dt < life - 0.12 else max(0, (life - dt) / 0.12))
    return sc, al

WORDS = []   # (beat, text, font, size, life_beats, y, color_idx)
for i, ch in enumerate("3 2 1".split()):
    WORDS.append((9 + i, ch, LATIN, 300, 1, 470, 'w'))
WORDS.append((8, "READY?", LATIN_I, 120, 1, 470, 'w'))
WORDS.append((12, "GO!!", LATIN_I, 260, 2, 470, 'w'))
for bar_start in (16, 24, 32):
    for j, wd in enumerate(["DAME", "MÁS", "GASO", "LINA!"]):
        WORDS.append((bar_start + j, wd, LATIN_I, 170 if len(wd) <= 4 else 150, 1, 470, 'a'))
for j, ch in enumerate("油门踩底"):
    WORDS.append((20 + j, ch, CJK, 240, 1, 470, 'a'))
for j in range(4):
    WORDS.append((28 + j, "BOUNCE", LATIN_I, 140, 1, 470 + (j % 2) * 0, 'b'))
WORDS.append((36, "没油了…", CJK, 130, 3.2, 470, 'w'))

def draw_texts(over, t, pal):
    k = (t - B0) / P
    # title letters (intro)
    title = "GASOLINA"
    f_size = 104
    fnt = font(LATIN_I, s(f_size))
    total_w = fnt.getlength(title) / S
    x = 360 - total_w / 2
    for i, ch in enumerate(title):
        cw = fnt.getlength(ch) / S
        tb = beat_t(i)                      # one letter per beat in intro
        dt = t - tb
        if dt >= 0:
            sc = 1 + 1.2 * math.exp(-dt / 0.07)
            yb = 150 - 30 * math.exp(-dt / 0.07)
            if t >= DROP:
                yb = 150 - 14 * pulse(t, BEATS, 0.1) * (1 if i % 2 == (int(k) % 2) else -1)
            col = pal[2] if t >= DROP else (255, 255, 255)
            if t >= OUTRO: col = lerp(pal[2], (90, 90, 110), min(1, (t - OUTRO) / 1.5))
            im = text_layer(ch, LATIN_I, f_size, col + (255,), stroke=(10, 0, 20, 255))
            paste_pop(over, im, (x + cw / 2, yb), sc, min(1, dt / 0.04))
        x += cw
    # subtitle
    if beat_t(4) <= t < DROP:
        dt = t - beat_t(4)
        im = text_layer("加 满 油 ，准 备 出 发", CJK, 40, (255, 255, 255, 230))
        paste_pop(over, im, (360, 232), 1, min(1, dt / 0.3))
    elif DROP <= t < OUTRO:
        im = text_layer("90 BPM  ·  NIGHT  DRIVE", MONO, 30, pal[3] + (230,))
        paste_pop(over, im, (360, 232), 1 + 0.06 * pulse(t, BEATS, 0.1), 1)
    # big words
    for (bk, txt, fp, size, life, y, ci) in WORDS:
        dt = t - beat_t(bk)
        sc, al = pop_curve(dt, life * P)
        if al <= 0: continue
        if ci == 'w': col = (255, 255, 255)
        elif ci == 'b': col = pal[3]
        else: col = (255, 255, 255)
        im = text_layer(txt, fp, size, col + (255,), stroke=pal[2] + (255,) if ci != 'w' else (255, 40, 160, 255))
        rot = 0
        if ci == 'b': rot = (-8 if bk % 2 else 8)
        if txt == "没油了…": sc = 1 + 0.03 * math.sin(t * 30) * pulse(t, SMOKES, 0.2)
        paste_pop(over, im, (360, y), sc, al, rot)

def draw_hud(d, dn, t, pal):
    # fuel gauge bottom-left
    cx, cy, R = 150, 1215, 92
    d.pieslice([s(cx - R), s(cy - R), s(cx + R), s(cy + R)], 180, 360, fill=(10, 4, 20))
    dn.arc([s(cx - R), s(cy - R), s(cx + R), s(cy + R)], 180, 360, fill=pal[3], width=max(1, s(4)))
    fu = fuel(t)
    # colored arc showing fuel
    col = (255, 60, 60) if fu < 0.2 else pal[2]
    dn.arc([s(cx - R + 14), s(cy - R + 14), s(cx + R - 14), s(cy + R - 14)], 180, 180 + 180 * max(0.001, fu), fill=col, width=max(1, s(10)))
    ang = math.pi * (1 - fu)
    if t >= OUTRO: ang += 0.06 * math.sin(t * 50)
    nx = cx + math.cos(ang) * (R - 22); ny = cy - math.sin(ang) * (R - 22)
    dn.line([s(cx), s(cy), s(nx), s(ny)], fill=(255, 255, 255), width=max(1, s(5)))
    d.text((s(cx - R + 12), s(cy + 6)), "E", font=font(LATIN, s(24)), fill=(255, 80, 80), anchor='lt')
    d.text((s(cx + R - 12), s(cy + 6)), "F", font=font(LATIN, s(24)), fill=(255, 255, 255), anchor='rt')
    d.text((s(cx), s(cy + 22)), "FUEL", font=font(MONO, s(22)), fill=(200, 200, 220), anchor='mt')
    if DROP <= t < DROP + 4 * P:
        if int((t - DROP) * 8) % 2 == 0:
            dn.text((s(cx), s(cy - R - 26)), "FULL TANK", font=font(MONO, s(22)), fill=(255, 255, 255), anchor='mm')
    # speedo bottom-right
    sp = speed(t)
    kmh = int(sp / 3.4 * 186 + (6 * pulse(t, BEATS, 0.1) if sp > 0.3 else 0))
    if t >= OUTRO: kmh = int(sp / 3.4 * 186)
    dn.text((s(600), s(1200)), f"{kmh:03d}", font=font(MONO, s(78)), fill=pal[2], anchor='mm')
    d.text((s(600), s(1250)), "KM/H", font=font(MONO, s(22)), fill=(200, 200, 220), anchor='mm')

# ---------------- frame
def render(i):
    t = T0 + i / FPS
    pal = palette(t)
    # crossfade palette quickly at bar starts
    img = sky(pal)
    stars = Image.new('RGB', (W, H)); draw_stars(ImageDraw.Draw(stars), t)
    img += np.asarray(stars, np.float32) * 0.8
    draw_sun(img, t, pal)

    dark = Image.fromarray(img.clip(0, 255).astype(np.uint8))
    neon = Image.new('RGB', (W, H))
    dd = ImageDraw.Draw(dark); dn = ImageDraw.Draw(neon)
    draw_skyline(dd, dn, i, pal)
    draw_grid(dn, t, i, pal)
    draw_speedlines(dn, t, i, pal)
    base = np.asarray(dark, np.float32).copy()
    energy = 0.8 + 0.5 * FLUX[min(i, NF - 1)]
    base = glow_add(base, neon, 18, strength=0.55 * energy)

    # foreground (occludes the road): car, smoke, HUD + its own neon
    fg = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    fneon = Image.new('RGB', (W, H))
    fd = ImageDraw.Draw(fg); fdn = ImageDraw.Draw(fneon)
    ex = draw_car(fd, fdn, t, pal)
    draw_hud(fd, fdn, t, pal)
    fa = np.asarray(fg, np.float32)
    al = fa[..., 3:4] / 255
    base = base * (1 - al) + fa[..., :3] * al
    smoke = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    draw_smoke(ImageDraw.Draw(smoke), t, ex)
    sa = np.asarray(smoke, np.float32); sal = sa[..., 3:4] / 255 * 0.75
    base = base * (1 - sal) + sa[..., :3] * sal
    draw_flames(fdn, t, ex)
    draw_sparks(fdn, t)
    base = glow_add(base, fneon, 16, strength=0.6 * energy)

    over = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    draw_texts(over, t, pal)
    ov = np.asarray(over, np.float32)
    a = ov[..., 3:4] / 255
    # text glow
    tglow = over.resize((W // 4, H // 4), Image.BILINEAR).filter(ImageFilter.GaussianBlur(6 * S / 1.0))
    tg = np.asarray(tglow.resize((W, H), Image.BILINEAR), np.float32)
    base += tg[..., :3] * (tg[..., 3:4] / 255) * 0.9
    base = base * (1 - a) + ov[..., :3] * a

    # flash on drop / bar downbeats
    fl = 0.85 * pulse(t, [DROP], 0.18) + 0.22 * pulse(t, BAR_DOWN_MAIN, 0.09)
    base = base * (1 - fl) + 255 * fl
    # fades
    if t < T0 + 0.5: base *= (t - T0) / 0.5
    if t > END_A - 1.0: base *= max(0, (END_A - t) / 1.0)
    base *= POST
    out = base.clip(0, 255).astype(np.uint8)

    # chromatic aberration + shake + zoom punch
    ca = int(s(10) * (pulse(t, BAR_DOWN_MAIN, 0.1) + pulse(t, [DROP], 0.3)))
    if ca > 0:
        out = out.copy()
        out[..., 0] = np.roll(out[..., 0], ca, axis=1)
        out[..., 2] = np.roll(out[..., 2], -ca, axis=1)
    im = Image.fromarray(out)
    shake = pulse(t, BAR_DOWN_MAIN, 0.12) * 14 + pulse(t, [DROP], 0.25) * 22
    if (28 <= (t - B0) / P < 32): shake += pulse(t, BEATS, 0.1) * 10
    zoom = 1 + 0.045 * pulse(t, BEATS, 0.1) * (1 if DROP <= t < OUTRO else 0.3) + 0.08 * pulse(t, [DROP], 0.25)
    if shake > 0.5 or zoom > 1.002:
        r = random.Random(i)
        dx = r.uniform(-1, 1) * shake * S; dy = r.uniform(-1, 1) * shake * S
        cw, ch = W / zoom, H / zoom
        x0 = (W - cw) / 2 - dx; y0 = (H - ch) / 2 - dy
        im = im.transform((W, H), Image.EXTENT, (x0, y0, x0 + cw, y0 + ch), Image.BILINEAR)
    return im.tobytes()

if __name__ == '__main__':
    if ONLY == 'preview':
        times = [float(x) for x in sys.argv[3].split(',')]
        ims = [Image.frombytes('RGB', (W, H), render(int((tt - T0) * FPS))) for tt in times]
        sheet = Image.new('RGB', (W * len(ims), H))
        for j, im in enumerate(ims): sheet.paste(im, (j * W, 0))
        sheet.save('preview.png'); sys.exit()
    out = sys.argv[3] if len(sys.argv) > 3 else 'out.mp4'
    ff = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-',
                           '-ss', str(T0), '-t', str(DUR), '-i', 'in/src.mp4',
                           '-map', '0:v', '-map', '1:a', '-af', f'afade=t=out:st={DUR-1.0}:d=1.0',
                           '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
                           '-c:a', 'aac', '-b:a', '192k', '-ac', '2', '-shortest', out], stdin=subprocess.PIPE)
    with Pool(4) as pool:
        for j, fr in enumerate(pool.imap(render, range(NF), chunksize=4)):
            ff.stdin.write(fr)
            if j % 60 == 0: print('frame', j, flush=True)
    ff.stdin.close(); ff.wait()
    print('done', out)
