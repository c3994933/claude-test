# "一拍 = 视野 ×10" — beat-synced zoom from inside an atom to the observable universe.
import numpy as np, json, math, sys, subprocess, random
from PIL import Image, ImageDraw, ImageFilter, ImageFont
from multiprocessing import Pool

W = int(sys.argv[1]) if len(sys.argv) > 1 else 720
H = W * 16 // 9
S = W / 720.0
FPS = 30
T0, DUR = 2.0, 27.6
NF = int(DUR * FPS)
MODE = sys.argv[2] if len(sys.argv) > 2 else 'full'

g = json.load(open('grid.json'))
P = 60.0 / g['bpm']; B0 = g['first']
F = np.load('vfeats.npz'); FLUX = F['flux']; BANDS = F['bands']
def beat_t(k): return B0 + k * P
N0 = -12                      # exponent shown at beat 0
NLAST = 26
KLAST = NLAST - N0            # 38
DROP = beat_t(12)             # beat 12 -> 10^0 m
ENDCARD = beat_t(KLAST + 1)
END_A = T0 + DUR

LATIN = '/usr/share/fonts/opentype/inter/Inter-Black.otf'
LATIN_B = '/usr/share/fonts/opentype/inter/Inter-Bold.otf'
CJK = '/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc'
MONO = '/usr/share/fonts/truetype/jetbrains-mono/JetBrainsMono-Bold.ttf'
_fc = {}
def font(p, sz):
    k = (p, int(sz))
    if k not in _fc: _fc[k] = ImageFont.truetype(p, max(6, int(sz)))
    return _fc[k]
def s(v): return v * S
def si(v): return int(round(v * S))

CX, CY = W / 2, s(610)
R0 = s(220)                   # radius (px) of an object whose size is 10^z at rest

# ---------------------------------------------------------------- facts
FACTS = {
 -12: ("原子内部", "中间那个亮点，就是原子核"),
 -11: ("电子云", "电子没有固定轨道，只有“概率云”"),
 -10: ("氢原子", "约 0.1 纳米，内部几乎全是空的"),
  -9: ("DNA 双螺旋", "直径约 2 纳米，记录着生命的代码"),
  -8: ("核糖体", "约 25 纳米，细胞里的蛋白质工厂"),
  -7: ("流感病毒", "约 100 纳米，光学显微镜看不见"),
  -6: ("大肠杆菌", "约 2 微米长，靠鞭毛游泳"),
  -5: ("红细胞", "直径约 7 微米，成熟后没有细胞核"),
  -4: ("头发丝", "直径约 0.07 毫米"),
  -3: ("沙粒", "约 1 毫米"),
  -2: ("蜜蜂", "约 1.5 厘米，翅膀每秒振动约 200 次"),
  -1: ("手机", "约 15 厘米"),
   0: ("你", "约 1.7 米 —— 从这里出发"),
   1: ("公交车", "约 12 米"),
   2: ("足球场", "长约 105 米"),
   3: ("哈利法塔", "828 米，目前世界最高建筑"),
   4: ("珠穆朗玛峰", "海拔 8849 米"),
   5: ("卡门线", "海拔 100 公里，常用的太空边界"),
   6: ("月球", "直径约 3474 公里"),
   7: ("地球", "直径约 12742 公里"),
   8: ("地月距离", "约 38.4 万公里，光要走 1.3 秒"),
   9: ("太阳", "直径约 139 万公里，能装下约 130 万个地球"),
  10: ("光速 33 秒", "光每秒约走 30 万公里"),
  11: ("地球轨道", "日地距离 1.5 亿公里，光走 8 分 20 秒"),
  12: ("土星轨道", "距太阳约 14 亿公里"),
  13: ("旅行者 1 号", "1977 年发射，已飞出约 250 亿公里"),
  14: ("赛德娜", "远日点约 1400 亿公里，公转一圈约 1 万年"),
  15: ("奥尔特云", "推测中彗星的老家"),
  16: ("1 光年", "约 9.46 万亿公里"),
  17: ("比邻星", "离太阳最近的恒星，约 4.2 光年"),
  18: ("昴星团", "约 440 光年，肉眼可见的“七姐妹”"),
  19: ("猎户座大星云", "约 1344 光年，恒星的摇篮"),
  20: ("银河系旋臂", "太阳距银河系中心约 2.6 万光年"),
  21: ("银河系", "直径约 10 万光年，上千亿颗恒星"),
  22: ("仙女座星系", "约 250 万光年，正以约 110 km/s 靠近我们"),
  23: ("本星系群", "80 多个星系组成的“小家庭”"),
  24: ("室女座星系团", "约 5400 万光年外，上千个星系"),
  25: ("拉尼亚凯亚超星系团", "我们的超星系团，直径约 5 亿光年"),
  26: ("可观测宇宙", "直径约 930 亿光年"),
}
ZONES = [(-12, -4.5, "微观", (0, 220, 210)), (-4.5, 4.5, "人类尺度", (255, 190, 80)), (4.5, 8.5, "地球", (80, 170, 255)),
         (8.5, 15.5, "太阳系", (255, 140, 60)), (15.5, 22.5, "银河", (190, 120, 255)), (22.5, 26, "宇宙", (255, 90, 170))]

# ---------------------------------------------------------------- timing
def ease_out(u):
    u = min(1, max(0, u)); return 1 - (1 - u) ** 4

def zoom(t):
    """log10 size (m) that maps to R0."""
    if t < beat_t(0): return N0 - 1 + 0.25 * max(0, (t - T0) / (beat_t(0) - T0))
    k = min(KLAST, int((t - B0) / P))
    dt = t - beat_t(k)
    n = N0 + k
    if k >= KLAST:
        return NLAST + 0.12 * (1 - math.exp(-dt / 1.2))
    return (n - 1) + 0.25 * 0 + (0.75 * ease_out(dt / 0.28) if False else 0) + 0.94 * ease_out(dt / 0.3) + 0.06 * min(1, dt / P)

# fix: zoom before beat 0 should end at N0-1 at beat 0 for continuity
def Z(t):
    if t < beat_t(0):
        u = (t - T0) / (beat_t(0) - T0)
        return N0 - 1.25 + 0.25 * u
    return zoom(t)

def since(t, ev):
    best = None
    for e in ev:
        if e <= t: best = e
        else: break
    return None if best is None else t - best
BEATS = [beat_t(k) for k in range(0, 44)]
def pulse(t, ev, tau=0.12):
    d = since(t, ev); return 0.0 if d is None else math.exp(-d / tau)

def smooth(a, b, x):
    if b == a: return 1.0 if x >= b else 0.0
    u = min(1, max(0, (x - a) / (b - a))); return u * u * (3 - 2 * u)

# ---------------------------------------------------------------- numpy helpers
YY, XX = np.mgrid[0:H, 0:W].astype(np.float32)
VIGN = (1 - 0.5 * (((XX - W / 2) / (W * 0.8)) ** 2 + ((YY - H / 2) / (H * 0.8)) ** 2)).clip(0.3, 1)[..., None]

def glow(buf, cx, cy, R, col, k=1.0, power=2.0):
    """additive radial falloff exp(-(d/R)^power)."""
    if R < 0.5 or k <= 0.003: return
    ext = R * (3.0 if power >= 2 else 6.0)
    x0, x1 = int(max(0, cx - ext)), int(min(W, cx + ext + 1))
    y0, y1 = int(max(0, cy - ext)), int(min(H, cy + ext + 1))
    if x0 >= x1 or y0 >= y1: return
    d = np.sqrt((XX[y0:y1, x0:x1] - cx) ** 2 + (YY[y0:y1, x0:x1] - cy) ** 2) / R
    v = np.exp(-d ** power) * k
    buf[y0:y1, x0:x1] += v[..., None] * np.array(col, np.float32)

def A(c, k=1.0): return (int(c[0]), int(c[1]), int(c[2]), int(255 * max(0, min(1, k))))
def lw(r, f, mn=1): return max(mn, int(r * f))

# ---------------------------------------------------------------- deterministic random shapes
def rnd(seed): return random.Random(seed)
SAND = [(math.cos(a) * (0.75 + 0.25 * rnd(i).random()), math.sin(a) * (0.75 + 0.25 * rnd(i + 99).random())) for i, a in enumerate(np.linspace(0, 2 * math.pi, 14, endpoint=False))]
def blob_pts(seed, n=10, jitter=0.35):
    r = rnd(seed)
    return [(math.cos(a) * (1 - jitter + jitter * r.random()), math.sin(a) * (1 - jitter + jitter * r.random())) for a in np.linspace(0, 2 * math.pi, n, endpoint=False)]
CONTS = [(rnd(s).uniform(-0.6, 0.6), rnd(s + 1).uniform(-0.6, 0.6), rnd(s + 2).uniform(0.18, 0.4), blob_pts(s, 9, 0.5)) for s in range(5)]
CRATERS = [(rnd(s).uniform(-0.7, 0.7), rnd(s + 5).uniform(-0.7, 0.7), rnd(s + 9).uniform(0.05, 0.18)) for s in range(16)]
def shell_pts(seed, n, r0, r1):
    r = rnd(seed); out = []
    for _ in range(n):
        th = r.uniform(0, 2 * math.pi); rr = r.uniform(r0, r1)
        out.append((math.cos(th) * rr, math.sin(th) * rr * r.uniform(0.6, 1), r.random()))
    return out
OORT = shell_pts(3, 420, 0.45, 1.0)
FIELD = [(rnd(i).uniform(-1.3, 1.3), rnd(i + 5000).uniform(-2.2, 2.2), rnd(i + 9000).random()) for i in range(500)]
GALS = [(rnd(i).gauss(0, 0.5), rnd(i + 77).gauss(0, 0.5), rnd(i + 99).random()) for i in range(400)]

# ---------------------------------------------------------------- object drawings
# each: f(d, buf, cx, cy, r, t, a)   d=ImageDraw(RGBA layer), buf=float glow buffer, r=radius px, a=alpha
def o_atom(d, buf, cx, cy, r, t, a):
    damp = min(1.0, (1.5 * R0 / r) ** 0.6)
    glow(buf, cx, cy, r * 0.75, (0, 140, 170), 0.9 * a * damp)
    glow(buf, cx, cy, r * 0.35, (40, 200, 230), 0.35 * a * damp)
    for i in range(3):
        ang = t * 0.7 + i * math.pi / 3
        pts = []
        for th in np.linspace(0, 2 * math.pi, 60):
            x, y = math.cos(th) * r * 0.9, math.sin(th) * r * 0.32
            pts.append((cx + x * math.cos(ang) - y * math.sin(ang), cy + x * math.sin(ang) + y * math.cos(ang)))
        if r < 4 * W: d.line(pts + [pts[0]], fill=A((120, 230, 255), 0.35), width=lw(r, 0.006))
        th = t * 3 + i * 2.1
        ex, ey = math.cos(th) * r * 0.9, math.sin(th) * r * 0.32
        px, py = cx + ex * math.cos(ang) - ey * math.sin(ang), cy + ex * math.sin(ang) + ey * math.cos(ang)
        glow(buf, px, py, max(s(4), r * 0.03), (150, 240, 255), 1.2 * a)
    nr = max(s(3.5), r * 1e-4 * 30)
    glow(buf, cx, cy, nr * 2.5, (255, 200, 120), 1.6 * a)
    d.ellipse([cx - nr, cy - nr, cx + nr, cy + nr], fill=A((255, 240, 210)))

def o_dna(d, buf, cx, cy, r, t, a):
    L = W * 0.9 + r * 4
    per = r * 3.4
    xs = np.arange(cx - L, cx + L, max(2, per / 40))
    ph = t * 2.2
    for strand, col in ((0, (90, 170, 255)), (math.pi, (255, 110, 180))):
        pts = [(x, cy + math.sin((x - cx) / per * 2 * math.pi + ph + strand) * r * 0.9) for x in xs]
        d.line(pts, fill=A(col), width=lw(r, 0.16))
    step = per / 10
    x = cx - L + ((ph * per / (2 * math.pi)) % step)
    i = 0
    while x < cx + L:
        th = (x - cx) / per * 2 * math.pi + ph
        y1, y2 = cy + math.sin(th) * r * 0.9, cy + math.sin(th + math.pi) * r * 0.9
        c = [(255, 210, 80), (120, 255, 160), (255, 120, 90), (160, 140, 255)][i % 4]
        d.line([(x, y1), (x, y2)], fill=A(c, 0.85), width=lw(r, 0.07))
        x += step; i += 1

def o_ribo(d, buf, cx, cy, r, t, a):
    d.line([(cx - r * 3, cy + r * 0.1 + math.sin(t) * r * 0.05), (cx + r * 3, cy + r * 0.1)], fill=A((255, 220, 120), 0.8), width=lw(r, 0.05))
    pl = [(cx + x * r * 0.85, cy - r * 0.15 + y * r * 0.6) for x, y in blob_pts(11, 12, 0.2)]
    ps = [(cx + x * r * 0.6, cy + r * 0.45 + y * r * 0.35) for x, y in blob_pts(12, 12, 0.2)]
    d.polygon(pl, fill=A((150, 90, 220)), outline=A((210, 170, 255)))
    d.polygon(ps, fill=A((90, 70, 200)), outline=A((180, 160, 255)))
    # nascent protein chain
    pts = [(cx + r * 0.2 + k * r * 0.12, cy - r * 0.7 - math.sin(k * 1.3 + t * 3) * r * 0.1 - k * r * 0.05) for k in range(14)]
    for p in pts: d.ellipse([p[0] - r * 0.05, p[1] - r * 0.05, p[0] + r * 0.05, p[1] + r * 0.05], fill=A((120, 255, 200)))

def o_virus(d, buf, cx, cy, r, t, a):
    rr = r * 0.78
    for i in range(28):
        th = i / 28 * 2 * math.pi + t * 0.2
        x0, y0 = cx + math.cos(th) * rr, cy + math.sin(th) * rr
        x1, y1 = cx + math.cos(th) * r, cy + math.sin(th) * r
        d.line([(x0, y0), (x1, y1)], fill=A((255, 170, 60)), width=lw(r, 0.04))
        k = r * 0.06; d.ellipse([x1 - k, y1 - k, x1 + k, y1 + k], fill=A((255, 90, 60)))
    d.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], fill=A((200, 80, 50)), outline=A((255, 160, 100)), width=lw(r, 0.03))
    pts = [(cx + math.cos(k * 0.9) * rr * 0.55 * math.sin(k * 0.37 + t), cy + math.sin(k * 1.1) * rr * 0.55) for k in range(20)]
    d.line(pts, fill=A((255, 230, 150), 0.8), width=lw(r, 0.025))

def o_bact(d, buf, cx, cy, r, t, a):
    for j in range(4):
        pts = [(cx + r * 0.9 + k * r * 0.07, cy + (j - 1.5) * r * 0.18 + math.sin(k * 0.5 - t * 12 + j) * r * 0.08) for k in range(30)]
        d.line(pts, fill=A((160, 255, 160), 0.7), width=lw(r, 0.015))
    d.rounded_rectangle([cx - r, cy - r * 0.38, cx + r, cy + r * 0.38], radius=r * 0.38, fill=A((60, 160, 90)), outline=A((150, 255, 170)), width=lw(r, 0.025))
    for k in range(6):
        x = cx - r * 0.6 + k * r * 0.24
        d.ellipse([x - r * 0.06, cy - r * 0.1, x + r * 0.06, cy + r * 0.1], fill=A((120, 220, 140), 0.7))

def o_rbc(d, buf, cx, cy, r, t, a):
    for (ox, oy, k) in ((-1.6, -1.2, 0.9), (1.7, 0.9, 1.0), (-1.2, 1.6, 0.85), (1.3, -1.7, 0.95), (0, 0, 1.0)):
        x, y, rr = cx + ox * r, cy + oy * r, r * k
        d.ellipse([x - rr, y - rr, x + rr, y + rr], fill=A((200, 30, 40)), outline=A((255, 90, 90)), width=lw(r, 0.02))
        q = rr * 0.5; d.ellipse([x - q, y - q, x + q, y + q], fill=A((140, 10, 25)))

def o_hair(d, buf, cx, cy, r, t, a):
    hw = r * 0.7
    d.rectangle([cx - hw, 0, cx + hw, H], fill=A((120, 80, 45)))
    step = max(3, hw * 0.35)
    y = -(t * hw) % step
    while y < H:
        d.line([(cx - hw, y + step * 0.6), (cx, y), (cx + hw, y + step * 0.6)], fill=A((170, 120, 70), 0.8), width=lw(r, 0.02))
        y += step
    d.rectangle([cx - hw * 0.35, 0, cx - hw * 0.15, H], fill=A((200, 150, 90), 0.35))

def o_sand(d, buf, cx, cy, r, t, a):
    pts = [(cx + x * r * 0.9, cy + y * r * 0.8) for x, y in SAND]
    d.polygon(pts, fill=A((205, 170, 110)), outline=A((240, 210, 150)))
    pts2 = [(cx - r * 0.3 + x * r * 0.25, cy - r * 0.3 + y * r * 0.2) for x, y in SAND]
    d.polygon(pts2, fill=A((240, 215, 165), 0.7))

def o_bee(d, buf, cx, cy, r, t, a):
    flap = math.sin(t * 60) * 0.5 + 0.5
    for sx in (-1, 1):
        wx = cx + sx * r * 0.25; wy = cy - r * 0.45
        d.ellipse([wx - r * 0.35, wy - r * (0.2 + 0.25 * flap), wx + r * 0.35, wy + r * 0.2], fill=A((210, 235, 255), 0.45))
    d.ellipse([cx - r * 0.95, cy - r * 0.38, cx + r * 0.6, cy + r * 0.38], fill=A((250, 190, 30)))
    for k in range(3):
        x = cx - r * 0.55 + k * r * 0.35
        d.rectangle([x, cy - r * 0.36, x + r * 0.14, cy + r * 0.36], fill=A((30, 20, 10)))
    d.ellipse([cx + r * 0.45, cy - r * 0.3, cx + r * 0.95, cy + r * 0.3], fill=A((40, 30, 15)))
    d.line([(cx + r * 0.8, cy - r * 0.2), (cx + r * 1.05, cy - r * 0.55)], fill=A((40, 30, 15)), width=lw(r, 0.03))

def o_phone(d, buf, cx, cy, r, t, a):
    w, h = r * 0.48, r * 0.98
    d.rounded_rectangle([cx - w, cy - h, cx + w, cy + h], radius=r * 0.12, fill=A((25, 25, 35)), outline=A((150, 150, 170)), width=lw(r, 0.015))
    d.rounded_rectangle([cx - w * 0.9, cy - h * 0.93, cx + w * 0.9, cy + h * 0.93], radius=r * 0.09, fill=A((30, 60, 120)))
    for k in range(5):
        y = cy - h * 0.6 + k * h * 0.28
        d.rounded_rectangle([cx - w * 0.7, y, cx + w * (0.2 + 0.1 * (k % 3)), y + h * 0.1], radius=r * 0.03, fill=A((90, 150, 255), 0.7))

def o_human(d, buf, cx, cy, r, t, a):
    hgt = r * 1.7; top = cy - hgt / 2; u = hgt / 8
    col = A((255, 225, 190)); c2 = A((60, 120, 230)); c3 = A((40, 40, 60))
    d.ellipse([cx - u * 0.5, top, cx + u * 0.5, top + u], fill=col)
    d.rounded_rectangle([cx - u * 0.75, top + u * 1.1, cx + u * 0.75, top + u * 4.2], radius=u * 0.3, fill=c2)
    d.rounded_rectangle([cx - u * 0.62, top + u * 4.0, cx - u * 0.08, top + u * 8], radius=u * 0.2, fill=c3)
    d.rounded_rectangle([cx + u * 0.08, top + u * 4.0, cx + u * 0.62, top + u * 8], radius=u * 0.2, fill=c3)
    d.line([(cx - u * 0.75, top + u * 1.4), (cx - u * 1.0, top + u * 4.0)], fill=c2, width=lw(u, 0.35))
    wave = math.sin(t * 9) * 0.35
    hx, hy = cx + u * 0.75 + math.cos(-1.1 + wave) * u * 1.6, top + u * 1.4 + math.sin(-1.1 + wave) * u * 1.6
    d.line([(cx + u * 0.75, top + u * 1.4), (hx, hy)], fill=c2, width=lw(u, 0.35))
    d.ellipse([hx - u * 0.22, hy - u * 0.22, hx + u * 0.22, hy + u * 0.22], fill=col)

def o_bus(d, buf, cx, cy, r, t, a):
    w, h = r * 1.0, r * 0.27
    d.rounded_rectangle([cx - w, cy - h, cx + w, cy + h], radius=r * 0.05, fill=A((220, 50, 50)))
    for k in range(9):
        x = cx - w * 0.9 + k * w * 0.2
        d.rectangle([x, cy - h * 0.75, x + w * 0.15, cy - h * 0.1], fill=A((170, 220, 255)))
    for wx in (-0.65, 0.65):
        x = cx + wx * w; d.ellipse([x - h * 0.4, cy + h * 0.6, x + h * 0.4, cy + h * 1.4], fill=A((25, 25, 30)))

def o_field(d, buf, cx, cy, r, t, a):
    w, h = r * 1.0, r * 0.65
    for k in range(10):
        x0 = cx - w + k * w * 0.2
        d.rectangle([x0, cy - h, x0 + w * 0.2, cy + h], fill=A((40, 140, 60) if k % 2 else (50, 160, 70)))
    lc = A((240, 255, 240)); ww = lw(r, 0.008)
    d.rectangle([cx - w, cy - h, cx + w, cy + h], outline=lc, width=ww)
    d.line([(cx, cy - h), (cx, cy + h)], fill=lc, width=ww)
    q = r * 0.17; d.ellipse([cx - q, cy - q, cx + q, cy + q], outline=lc, width=ww)
    for sx in (-1, 1):
        d.rectangle([cx + sx * w - (r * 0.31 if sx > 0 else 0), cy - h * 0.6, cx + sx * w + (r * 0.31 if sx < 0 else 0), cy + h * 0.6], outline=lc, width=ww)

def o_burj(d, buf, cx, cy, r, t, a):
    hgt = r * 1.66; base = cy + hgt / 2
    pts = [(cx - r * 0.13, base), (cx - r * 0.1, base - hgt * 0.35), (cx - r * 0.06, base - hgt * 0.6), (cx - r * 0.03, base - hgt * 0.8), (cx, base - hgt),
           (cx + r * 0.03, base - hgt * 0.8), (cx + r * 0.06, base - hgt * 0.6), (cx + r * 0.1, base - hgt * 0.35), (cx + r * 0.13, base)]
    d.polygon(pts, fill=A((170, 190, 215)), outline=A((230, 240, 255)))
    d.line([(cx - r * 1.4, base), (cx + r * 1.4, base)], fill=A((120, 110, 90)), width=lw(r, 0.01))
    glow(buf, cx, base - hgt, s(6), (255, 60, 60), (0.5 + 0.5 * math.sin(t * 6)) * a)

def o_everest(d, buf, cx, cy, r, t, a):
    base = cy + r * 0.45
    d.polygon([(cx - r * 1.3, base), (cx - r * 0.5, base - r * 0.55), (cx - r * 0.15, base - r * 0.42), (cx + r * 0.1, base - r * 0.88), (cx + r * 0.5, base - r * 0.5), (cx + r * 1.3, base)], fill=A((80, 85, 110)))
    d.polygon([(cx - r * 0.12, base - r * 0.62), (cx + r * 0.1, base - r * 0.88), (cx + r * 0.33, base - r * 0.62), (cx + r * 0.15, base - r * 0.68), (cx, base - r * 0.6)], fill=A((240, 245, 255)))

def o_karman(d, buf, cx, cy, r, t, a):
    R = r * 2 * 63.7 / 1.0 * 0.5   # earth radius in px if 100 km == r*... (artistic)
    R = r * 30
    gy = cy + r * 0.5
    def arc(rad, n=120):
        span = min(math.pi, (W * 1.6) / max(1, rad))
        return [(cx + math.sin(th) * rad, gy + R - math.cos(th) * rad) for th in np.linspace(-span, span, n)]
    for k, al in ((1.0, 0.10), (0.75, 0.13), (0.5, 0.18), (0.25, 0.25)):
        pts = arc(R + r * k)
        d.polygon(pts + [(W * 3, H * 3), (-W * 2, H * 3)], fill=A((70, 150, 255), al))
    d.polygon(arc(R) + [(W * 3, H * 3), (-W * 2, H * 3)], fill=A((30, 60, 90)))
    pts = arc(R + r * 1.0, 80)
    for i in range(0, len(pts) - 1, 2):
        d.line([pts[i], pts[i + 1]], fill=A((255, 255, 255), 0.9), width=lw(r, 0.012, 2))
    d.text((cx + r * 0.9, gy - r * 1.08), "100 km", font=font(MONO, max(10, s(22))), fill=A((255, 255, 255), 0.9), anchor='ls')

def o_moon(d, buf, cx, cy, r, t, a):
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=A((175, 175, 180)))
    for x, y, k in CRATERS:
        q = k * r; d.ellipse([cx + x * r - q, cy + y * r - q, cx + x * r + q, cy + y * r + q], fill=A((140, 140, 148)))
    d.pieslice([cx - r, cy - r, cx + r, cy + r], 100, 260, fill=A((0, 0, 10), 0.45))

def o_earth(d, buf, cx, cy, r, t, a):
    glow(buf, cx, cy, r * 1.15, (40, 110, 255), 0.35 * a, power=4)
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=A((25, 80, 190)))
    for x, y, k, pts in CONTS:
        ox = ((x + t * 0.08 + 1) % 2) - 1
        if abs(ox) > 0.8: continue
        d.polygon([(cx + (ox + px * k) * r, cy + (y + py * k) * r) for px, py in pts], fill=A((60, 160, 80)))
    d.pieslice([cx - r, cy - r, cx + r, cy + r], 90, 270, fill=A((0, 0, 15), 0.5))
    d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=A((150, 200, 255), 0.8), width=lw(r, 0.02))

def dot(d, buf, x, y, rr, col, gk=1.0):
    glow(buf, x, y, rr * 2.5, col, gk)
    d.ellipse([x - rr, y - rr, x + rr, y + rr], fill=A(col))

def o_earthmoon(d, buf, cx, cy, r, t, a):
    d.ellipse([cx - r * 0.9, cy - r * 0.9, cx + r * 0.9, cy + r * 0.9], outline=A((180, 180, 200), 0.5), width=lw(r, 0.006))
    th = t * 0.5
    mx, my = cx + math.cos(th) * r * 0.9, cy + math.sin(th) * r * 0.9
    dot(d, buf, cx, cy, max(s(4), r * 0.9 / 60), (80, 150, 255), a)
    dot(d, buf, mx, my, max(s(3), r * 0.9 / 220), (220, 220, 230), a * 0.6)
    u = ((t - B0) / P) % 1
    lx, ly = cx + (mx - cx) * u, cy + (my - cy) * u
    d.line([(cx, cy), (lx, ly)], fill=A((255, 250, 180), 0.8), width=lw(r, 0.008))
    glow(buf, lx, ly, s(10), (255, 250, 200), a)

def o_sun(d, buf, cx, cy, r, t, a):
    glow(buf, cx, cy, r * 1.6, (255, 120, 20), 0.55 * a)
    glow(buf, cx, cy, r * 1.08, (255, 200, 80), 0.6 * a, power=6)
    d.ellipse([cx - r * 0.95, cy - r * 0.95, cx + r * 0.95, cy + r * 0.95], fill=A((255, 215, 90)))
    rr = rnd(int(t * 8))
    for k in range(18):
        x = cx + rr.uniform(-0.6, 0.6) * r; y = cy + rr.uniform(-0.6, 0.6) * r; q = r * rr.uniform(0.05, 0.12)
        d.ellipse([x - q, y - q, x + q, y + q], fill=A((255, 180, 50), 0.6))
    ex = cx + r * 1.3
    dot(d, buf, ex, cy, max(s(2), r / 109), (80, 150, 255), a * 0.5)
    if r > s(60): d.text((ex + s(10), cy), "← 地球", font=font(CJK, s(20)), fill=A((180, 210, 255), 0.9), anchor='lm')

def o_light(d, buf, cx, cy, r, t, a):
    sr = r * 0.14
    dot(d, buf, cx, cy, max(s(3), sr), (255, 220, 100), a)
    u = ((t - B0) / P) % 1
    for k, ang in enumerate((-0.5, 0.4, 2.2, 3.6, 4.6)):
        L = r * 0.95 * u
        x0, y0 = cx + math.cos(ang) * sr, cy + math.sin(ang) * sr
        x1, y1 = cx + math.cos(ang) * (sr + L), cy + math.sin(ang) * (sr + L)
        d.line([(x0, y0), (x1, y1)], fill=A((255, 250, 190), 0.55), width=lw(r, 0.006))
        glow(buf, x1, y1, s(9), (255, 250, 200), a)
    d.ellipse([cx - r * 0.95, cy - r * 0.95, cx + r * 0.95, cy + r * 0.95], outline=A((255, 250, 190), 0.35), width=lw(r, 0.004))

def orbits(d, buf, cx, cy, r, t, a, planets, scale, sun=True):
    for (au, per, col, sz) in planets:
        rr = au * scale
        if rr < s(2): continue
        d.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], outline=A(col, 0.45), width=lw(r, 0.004))
        th = t * 6.0 / per ** 0.6 + au
        dot(d, buf, cx + math.cos(th) * rr, cy + math.sin(th) * rr, s(sz), col, a * 0.8)
    if sun: dot(d, buf, cx, cy, s(5), (255, 220, 100), a)

PLANETS = [(0.39, 0.24, (180, 170, 160), 2.5), (0.72, 0.62, (240, 210, 150), 3), (1.0, 1.0, (90, 160, 255), 3.5), (1.52, 1.88, (230, 100, 70), 3),
           (5.2, 11.9, (230, 190, 140), 6), (9.5, 29.5, (240, 220, 160), 5), (19.2, 84, (150, 230, 240), 4), (30.1, 165, (90, 120, 255), 4)]
def o_inner(d, buf, cx, cy, r, t, a): orbits(d, buf, cx, cy, r, t, a, PLANETS[:4], r * 0.95 / 1.52)
def o_outer(d, buf, cx, cy, r, t, a): orbits(d, buf, cx, cy, r, t, a, PLANETS[:6], r * 0.95 / 9.5)
def o_voyager(d, buf, cx, cy, r, t, a):
    sc = r * 0.9 / 170
    orbits(d, buf, cx, cy, r, t, a, PLANETS[4:], sc)
    hr = 120 * sc
    for i in range(0, 72, 2):
        th0, th1 = i / 72 * 360, (i + 1) / 72 * 360
        d.arc([cx - hr, cy - hr, cx + hr, cy + hr], th0, th1, fill=A((120, 200, 255), 0.6), width=lw(r, 0.006))
    ang = -0.6
    vx, vy = cx + math.cos(ang) * r * 0.9, cy + math.sin(ang) * r * 0.9
    d.line([(cx, cy), (vx, vy)], fill=A((255, 255, 255), 0.35), width=lw(r, 0.004))
    dot(d, buf, vx, vy, s(4), (255, 255, 255), a)
    if r > s(80): d.text((vx + s(10), vy), "旅行者 1 号", font=font(CJK, s(22)), fill=A((255, 255, 255), 0.9), anchor='lm')
    if r > s(80): d.text((cx + hr * 0.72, cy + hr * 0.72), "日球层顶", font=font(CJK, s(18)), fill=A((140, 210, 255), 0.85), anchor='lt')

def o_sedna(d, buf, cx, cy, r, t, a):
    sc = r * 0.95 / 937
    a_ = (76 + 937) / 2 * sc; c_ = a_ - 76 * sc; b_ = math.sqrt(a_ ** 2 - c_ ** 2)
    ang = 2.4
    pts = [(cx + math.cos(ang) * (c_ + math.cos(th) * a_) - math.sin(ang) * math.sin(th) * b_,
            cy + math.sin(ang) * (c_ + math.cos(th) * a_) + math.cos(ang) * math.sin(th) * b_) for th in np.linspace(0, 2 * math.pi, 140)]
    d.line(pts, fill=A((255, 150, 120), 0.7), width=lw(r, 0.005))
    th = 2.7 + t * 0.05
    sx = cx + math.cos(ang) * (c_ + math.cos(th) * a_) - math.sin(ang) * math.sin(th) * b_
    sy = cy + math.sin(ang) * (c_ + math.cos(th) * a_) + math.cos(ang) * math.sin(th) * b_
    dot(d, buf, sx, sy, s(4), (255, 120, 90), a)
    hr = 120 * sc
    d.ellipse([cx - hr, cy - hr, cx + hr, cy + hr], outline=A((120, 200, 255), 0.5), width=lw(r, 0.004))
    dot(d, buf, cx, cy, s(4), (255, 220, 100), a)

def o_oort(d, buf, cx, cy, r, t, a):
    rot = t * 0.15
    for x, y, b in OORT:
        xr = x * math.cos(rot) - y * math.sin(rot); yr = x * math.sin(rot) + y * math.cos(rot)
        q = s(1.2 + 1.5 * b)
        d.ellipse([cx + xr * r - q, cy + yr * r - q, cx + xr * r + q, cy + yr * r + q], fill=A((180, 210, 255), 0.4 + 0.5 * b))
    dot(d, buf, cx, cy, s(4), (255, 220, 100), a)

def o_ly(d, buf, cx, cy, r, t, a):
    for i in range(0, 90, 2):
        d.arc([cx - r * 0.95, cy - r * 0.95, cx + r * 0.95, cy + r * 0.95], i * 4, i * 4 + 4, fill=A((255, 255, 255), 0.7), width=lw(r, 0.006))
    d.line([(cx, cy), (cx + r * 0.95, cy)], fill=A((255, 255, 255), 0.5), width=lw(r, 0.004))
    if r > s(80): d.text((cx + r * 0.47, cy - s(8)), "1 光年", font=font(CJK, s(22)), fill=A((255, 255, 255), 0.9), anchor='ms')
    dot(d, buf, cx, cy, s(4), (255, 220, 100), a)

def o_proxima(d, buf, cx, cy, r, t, a):
    ang = -2.3
    px, py = cx + math.cos(ang) * r * 0.85, cy + math.sin(ang) * r * 0.85
    for i in range(30):
        u0, u1 = i / 30, (i + 0.5) / 30
        d.line([(cx + (px - cx) * u0, cy + (py - cy) * u0), (cx + (px - cx) * u1, cy + (py - cy) * u1)], fill=A((255, 255, 255), 0.45), width=lw(r, 0.004))
    dot(d, buf, cx, cy, s(5), (255, 220, 100), a)
    dot(d, buf, px, py, s(4), (255, 90, 60), a)
    dot(d, buf, px + s(14), py + s(6), s(5), (255, 230, 170), a * 0.7)
    if r > s(80):
        d.text((px, py - s(16)), "比邻星", font=font(CJK, s(22)), fill=A((255, 170, 150), 0.95), anchor='ms')
        d.text((cx + s(10), cy + s(16)), "太阳", font=font(CJK, s(20)), fill=A((255, 230, 150), 0.9), anchor='lt')

def o_pleiades(d, buf, cx, cy, r, t, a):
    ox, oy = cx + r * 0.6, cy - r * 0.62
    for (x, y, b) in [(0, 0, 1), (0.08, 0.05, .8), (-0.07, 0.07, .9), (0.12, -0.06, .7), (-0.03, -0.09, .75), (0.17, 0.1, .6), (-0.12, -0.02, .65)]:
        dot(d, buf, ox + x * r, oy + y * r, s(2.5 + 2 * b), (170, 200, 255), a * b)
    glow(buf, ox, oy, r * 0.18, (60, 90, 200), 0.35 * a)
    dot(d, buf, cx, cy, s(3.5), (255, 220, 100), a)

def o_orion(d, buf, cx, cy, r, t, a):
    ox, oy = cx - r * 0.55, cy + r * 0.55
    for k, (dx, dy, rr, col) in enumerate([(0, 0, 0.32, (255, 80, 150)), (0.12, -0.08, 0.22, (90, 140, 255)), (-0.1, 0.1, 0.2, (255, 150, 90)), (0.05, 0.12, 0.15, (180, 90, 255))]):
        glow(buf, ox + dx * r, oy + dy * r, rr * r, col, 0.55 * a)
    for i in range(4): dot(d, buf, ox + (i - 1.5) * s(5), oy + (i % 2) * s(5), s(2.5), (230, 240, 255), a)
    dot(d, buf, cx, cy, s(3.5), (255, 220, 100), a)

def o_arm(d, buf, cx, cy, r, t, a):
    for x, y, b in FIELD:
        xx = x * 0.8; yy = y * 0.35 + x * 0.5
        q = s(0.8 + 1.4 * b)
        d.ellipse([cx + xx * r - q, cy + yy * r - q, cx + xx * r + q, cy + yy * r + q], fill=A((220, 210, 255), 0.25 + 0.5 * b))
    glow(buf, cx, cy, r * 0.5, (110, 80, 200), 0.25 * a)
    ang = 2.6
    ax, ay = cx + math.cos(ang) * r * 0.9, cy + math.sin(ang) * r * 0.9
    d.line([(cx + math.cos(ang) * r * 0.25, cy + math.sin(ang) * r * 0.25), (ax, ay)], fill=A((255, 255, 255), 0.7), width=lw(r, 0.006))
    if r > s(80): d.text((ax, ay - s(14)), "↙ 银心方向", font=font(CJK, s(20)), fill=A((255, 255, 255), 0.85), anchor='ms')

GAL_OFF = (math.cos(2.6) * 0.52, math.sin(2.6) * 0.52)
def galaxy(d, buf, gx, gy, r, t, a, tilt=1.0, rot=0.0, col=(200, 180, 255), seed=1):
    rr = rnd(seed)
    glow(buf, gx, gy, r * 0.22, (255, 230, 190), 0.9 * a)
    glow(buf, gx, gy, r * 0.6, (col[0] * 0.4, col[1] * 0.4, col[2] * 0.5), 0.5 * a)
    if r < s(3): return
    for arm in range(2):
        for k in range(160):
            u = k / 160
            th = arm * math.pi + u * 4.2 + rot
            rad = r * (0.1 + 0.9 * u)
            jx, jy = rr.gauss(0, 0.05) * r, rr.gauss(0, 0.05) * r
            x = math.cos(th) * rad + jx; y = (math.sin(th) * rad + jy) * tilt
            q = max(0.8, s(1.6) * (1 - u * 0.5))
            d.ellipse([gx + x - q, gy + y - q, gx + x + q, gy + y + q], fill=A(col, 0.65))

def o_milkyway(d, buf, cx, cy, r, t, a):
    gx, gy = cx + GAL_OFF[0] * r, cy + GAL_OFF[1] * r
    galaxy(d, buf, gx, gy, r, t, a, 1.0, t * 0.05)
    glow(buf, cx, cy, s(6), (255, 255, 120), (0.6 + 0.4 * math.sin(t * 8)) * a)
    if r > s(80): d.text((cx + s(12), cy), "太阳在这里", font=font(CJK, s(20)), fill=A((255, 255, 160), 0.95), anchor='lm')

def o_andromeda(d, buf, cx, cy, r, t, a):
    galaxy(d, buf, cx + r * 0.55, cy - r * 0.55, r * 0.36, t, a, 0.4, 0.6, (230, 200, 255), 5)
    galaxy(d, buf, cx, cy, r * 0.1, t, a, 1.0, t * 0.05)

def o_localgroup(d, buf, cx, cy, r, t, a):
    for x, y, b in GALS[:60]:
        glow(buf, cx + x * r * 1.2, cy + y * r * 1.2, s(3 + 3 * b), (200, 190, 255), 0.7 * a)
    galaxy(d, buf, cx + r * 0.065, cy - r * 0.06, r * 0.025, t, a, 0.4, 0.6, (230, 200, 255), 5)
    glow(buf, cx, cy, s(5), (255, 240, 220), a)
    for i in range(0, 90, 2):
        d.arc([cx - r * 0.95, cy - r * 0.75, cx + r * 0.95, cy + r * 0.75], i * 4, i * 4 + 4, fill=A((200, 190, 255), 0.4), width=lw(r, 0.004))

def o_virgo(d, buf, cx, cy, r, t, a):
    ox, oy = cx - r * 0.55, cy - r * 0.55
    for x, y, b in GALS[:250]:
        glow(buf, ox + x * r * 0.35, oy + y * r * 0.35, s(1.5 + 2.5 * b), (255, 210, 180), 0.8 * a)
    for x, y, b in GALS[250:]:
        glow(buf, cx + x * r * 1.6, cy + y * r * 1.6, s(1.5 + 2 * b), (190, 190, 255), 0.6 * a)
    glow(buf, cx, cy, s(5), (255, 240, 220), a)

def o_laniakea(d, buf, cx, cy, r, t, a):
    ga = (cx - r * 0.3, cy + r * 0.25)
    rr = rnd(21)
    for k in range(46):
        th = k / 46 * 2 * math.pi
        x, y = ga[0] + math.cos(th) * r * 1.1, ga[1] + math.sin(th) * r * 1.0
        pts = []
        for step in range(40):
            dx, dy = ga[0] - x, ga[1] - y; dist = math.hypot(dx, dy) + 1e-6
            sw = 0.35 * math.sin(th * 3)
            x += (dx / dist * math.cos(sw) - dy / dist * math.sin(sw)) * r * 0.03
            y += (dy / dist * math.cos(sw) + dx / dist * math.sin(sw)) * r * 0.03
            pts.append((x, y))
            if dist < r * 0.05: break
        d.line(pts, fill=A((150, 220, 255), 0.35), width=lw(r, 0.005))
        u = ((t * 0.5 + k * 0.137) % 1)
        idx = int(u * (len(pts) - 1))
        glow(buf, pts[idx][0], pts[idx][1], s(3), (200, 240, 255), 0.9 * a)
    glow(buf, ga[0], ga[1], r * 0.12, (120, 200, 255), 0.6 * a)
    glow(buf, cx, cy, s(5), (255, 240, 220), a)

def o_universe(d, buf, cx, cy, r, t, a):
    rr = r * 0.95
    # cosmic web: random filaments between nodes
    rng_ = rnd(77)
    nodes = [(cx + rng_.uniform(-0.85, 0.85) * rr, cy + rng_.uniform(-0.85, 0.85) * rr) for _ in range(70)]
    nodes = [p for p in nodes if math.hypot(p[0] - cx, p[1] - cy) < rr * 0.92]
    for i, p in enumerate(nodes):
        ds = sorted(((math.hypot(p[0] - q[0], p[1] - q[1]), j) for j, q in enumerate(nodes) if j != i))[:3]
        for _, j in ds:
            d.line([p, nodes[j]], fill=A((170, 120, 255), 0.35), width=lw(r, 0.004))
        glow(buf, p[0], p[1], max(s(2), r * 0.025), (220, 170, 255), 0.7 * a)
    # CMB edge
    rngc = rnd(5)
    for k in range(180):
        th = k / 180 * 2 * math.pi
        c = (255, 150, 60) if rngc.random() < 0.5 else (90, 160, 255)
        d.arc([cx - rr, cy - rr, cx + rr, cy + rr], math.degrees(th), math.degrees(th) + 2.2, fill=A(c, 0.9), width=lw(r, 0.025, 2))
    glow(buf, cx, cy, s(6), (255, 255, 200), (0.6 + 0.4 * math.sin(t * 8)) * a)

# n -> (drawer, upper fade start, fast fade-out?)
OBJ = {
 -10: (o_atom, 2.6, False), -9: (o_dna, 0.9, False), -8: (o_ribo, 0.9, False), -7: (o_virus, 0.9, False), -6: (o_bact, 0.9, False),
 -5: (o_rbc, 0.9, False), -4: (o_hair, 0.9, False), -3: (o_sand, 0.9, False), -2: (o_bee, 0.9, False), -1: (o_phone, 0.9, False),
 0: (o_human, 0.9, False), 1: (o_bus, 0.9, False), 2: (o_field, 0.9, False), 3: (o_burj, 0.9, False), 4: (o_everest, 0.9, False),
 5: (o_karman, 0.9, True), 6: (o_moon, 0.9, True), 7: (o_earth, 0.9, True), 8: (o_earthmoon, 0.9, False), 9: (o_sun, 0.9, True),
 10: (o_light, 0.9, False), 11: (o_inner, 0.9, False), 12: (o_outer, 0.9, False), 13: (o_voyager, 0.9, False), 14: (o_sedna, 0.9, False),
 15: (o_oort, 0.9, False), 16: (o_ly, 0.9, False), 17: (o_proxima, 0.9, True), 18: (o_pleiades, 0.9, True), 19: (o_orion, 0.9, True),
 20: (o_arm, 0.9, True), 21: (o_milkyway, 0.9, False), 22: (o_andromeda, 0.9, False), 23: (o_localgroup, 0.9, True), 24: (o_virgo, 0.9, True),
 25: (o_laniakea, 0.9, True), 26: (o_universe, 0.9, False),
}

def obj_alpha(n, z):
    rel = n - z
    up = OBJ[n][1]
    a_hi = 1 - smooth(up - 0.55, up, rel)
    if OBJ[n][2]: a_lo = smooth(-0.95, -0.55, rel)
    else: a_lo = smooth(-1.6, -0.85, rel)
    return a_hi * a_lo

# ---------------------------------------------------------------- background
BG_KEYS = [(-13, (2, 14, 22), (0, 40, 55)), (-6, (4, 22, 20), (10, 60, 50)), (-1.5, (14, 12, 30), (60, 40, 70)), (3, (20, 30, 60), (90, 120, 170)),
           (5.2, (5, 10, 30), (20, 40, 90)), (6.5, (0, 0, 6), (6, 6, 18)), (27, (0, 0, 6), (8, 4, 20))]
def bg_cols(z):
    for (z0, a0, b0), (z1, a1, b1) in zip(BG_KEYS, BG_KEYS[1:]):
        if z0 <= z <= z1:
            u = (z - z0) / (z1 - z0)
            return [tuple(p + (q - p) * u for p, q in zip(x, y)) for x, y in ((a0, a1), (b0, b1))]
    return [BG_KEYS[-1][1], BG_KEYS[-1][2]]
GRAD_U = (np.linspace(0, 1, H)[:, None, None] ** 1.3).astype(np.float32)

def starfield(d, z):
    k = smooth(5.3, 6.5, z)
    if k <= 0: return
    f = z % 1
    for layer in (0, 1):
        scale = 10 ** (layer + 1 - f) * 0.5 if layer == 0 else 10 ** (-f) * 0.5 * 10 ** 0
        scale = [10 ** (1 - f), 10 ** (-f)][layer] * 0.6
        lay_a = [smooth(10, 3, scale) if scale > 3 else 1.0, 1.0][layer] * k
        if layer == 1: lay_a *= smooth(0.05, 0.25, scale)
        for x, y, b in FIELD[:300]:
            px, py = CX + x * W * scale, CY + y * W * scale
            if 0 <= px < W and 0 <= py < H:
                q = s(0.7 + 1.3 * b)
                c = int(150 + 105 * b)
                d.ellipse([px - q, py - q, px + q, py + q], fill=(c, c, min(255, c + 20), int(255 * lay_a * (0.4 + 0.6 * b))))

# ---------------------------------------------------------------- text helpers
def tlayer(txt, path, size, fill, stroke=0, stroke_fill=(0, 0, 0, 255)):
    f = font(path, s(size))
    l, tp, r, b = f.getbbox(txt, stroke_width=int(s(stroke)))
    pad = int(s(12))
    im = Image.new('RGBA', (r - l + 2 * pad, b - tp + 2 * pad), (0, 0, 0, 0))
    ImageDraw.Draw(im).text((pad - l, pad - tp), txt, font=f, fill=fill, stroke_width=int(s(stroke)), stroke_fill=stroke_fill)
    return im

def paste(base, im, cx, cy, sc=1.0, al=1.0, anchor='c'):
    if al <= 0.01: return
    if abs(sc - 1) > 0.01:
        im = im.resize((max(1, int(im.size[0] * sc)), max(1, int(im.size[1] * sc))), Image.BILINEAR)
    if al < 0.999:
        im = im.copy(); im.putalpha(im.getchannel('A').point(lambda v: int(v * al)))
    x = cx - im.size[0] / 2 if anchor == 'c' else cx
    base.alpha_composite(im, (int(x), int(cy - im.size[1] / 2)))

def exponent_img(n, col):
    big = font(LATIN, s(118)); sup = font(LATIN, s(62)); unit = font(LATIN_B, s(52))
    e = ("−" if n < 0 else "") + str(abs(n))
    wb = big.getlength("10"); ws = sup.getlength(e); wu = unit.getlength(" 米")
    im = Image.new('RGBA', (int(wb + ws + wu + s(50)), int(s(170))), (0, 0, 0, 0))
    dd = ImageDraw.Draw(im)
    x = s(10); base_y = s(140)
    dd.text((x, base_y), "10", font=big, fill=col, anchor='ls', stroke_width=int(s(3)), stroke_fill=(0, 0, 0, 200)); x += wb + s(4)
    dd.text((x, base_y - s(62)), e, font=sup, fill=col, anchor='ls', stroke_width=int(s(2)), stroke_fill=(0, 0, 0, 200)); x += ws + s(10)
    dd.text((x, base_y), " 米", font=font(CJK, s(52)), fill=(230, 230, 240, 255), anchor='ls')
    return im

def zone_of(z):
    for z0, z1, name, col in ZONES:
        if z0 <= z < z1 + 0.001: return name, col
    return ZONES[-1][2], ZONES[-1][3]

# ---------------------------------------------------------------- frame
def render(i):
    t = T0 + i / FPS
    z = Z(t)
    k = int((t - B0) / P) if t >= B0 else -1
    n_cur = None if k < 0 else min(NLAST, N0 + k)
    energy = FLUX[min(i, NF - 1)]
    main = DROP <= t < ENDCARD

    c1, c2 = bg_cols(z)
    buf = (np.array(c1, np.float32) * (1 - GRAD_U) + np.array(c2, np.float32) * GRAD_U) * np.ones((1, W, 1), np.float32)
    buf = np.ascontiguousarray(np.broadcast_to(buf, (H, W, 3))).copy()

    frame = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    starfield(ImageDraw.Draw(frame), z)

    # objects, large first so smaller ones sit on top
    vis = []
    for n in sorted(OBJ.keys(), reverse=True):
        a = obj_alpha(n, z)
        if a > 0.01: vis.append((n, a))
    for n, a in vis:
        r = R0 * 10 ** (n - z)
        lay = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        gbuf = np.zeros((H, W, 3), np.float32)
        OBJ[n][0](ImageDraw.Draw(lay), gbuf, CX, CY, r, t, a)
        buf += gbuf * a
        if a < 0.999: lay.putalpha(lay.getchannel('A').point(lambda v, a=a: int(v * a)))
        frame.alpha_composite(lay)

    # x10 frame: on each beat, a box the size of the old view shrinks to 1/10
    bt = since(t, BEATS[:KLAST + 1])
    if bt is not None and bt < 0.45 and t >= B0:
        u = ease_out(bt / 0.3)
        sc = 1 - 0.9 * u
        bw, bh = W * 0.46 * sc, W * 0.46 * sc
        al = (1 - bt / 0.45) * (0.9 if main else 0.6)
        dd = ImageDraw.Draw(frame)
        dd.rectangle([CX - bw, CY - bh, CX + bw, CY + bh], outline=(255, 255, 255, int(255 * al)), width=max(1, int(s(3))))
        dd.text((CX + bw + s(8), CY - bh), "×10", font=font(LATIN, s(30)), fill=(255, 255, 255, int(255 * al)), anchor='lt')

    # ---- HUD text
    top = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    td = ImageDraw.Draw(top)
    td.text((W / 2, s(62)), "♪ 一拍 = 视野放大 10 倍", font=font(CJK, s(30)), fill=(255, 255, 255, 220), anchor='mm', stroke_width=int(s(1)), stroke_fill=(255, 255, 255, 220))
    zn, zc = zone_of(z)
    if n_cur is not None and t < ENDCARD:
        dt = t - beat_t(k)
        sc = 1 + 0.35 * math.exp(-dt / 0.07) * (1.3 if main else 0.8)
        paste(top, exponent_img(n_cur, zc + (255,)), W / 2, s(175), sc, min(1, dt / 0.03 + 0.2))
        name, fact = FACTS[n_cur]
        big = 70 if len(name) <= 5 else (58 if len(name) <= 7 else 48)
        if n_cur == 0: big = 110
        paste(top, tlayer(name, CJK, big, (255, 255, 255, 255), stroke=2, stroke_fill=(255, 255, 255, 255)), W / 2, s(1000), 1 + 0.25 * math.exp(-dt / 0.06), min(1, dt / 0.04 + 0.1))
        fa = min(1, max(0, (dt - 0.05) / 0.12))
        paste(top, tlayer(fact, CJK, 33, (225, 230, 245, 255)), W / 2 + s(30) * (1 - fa), s(1080), 1, fa)
    elif t < B0:
        u = min(1, (t - T0) / 0.4)
        paste(top, tlayer("从原子内部，到可观测宇宙", CJK, 44, (255, 255, 255, 255), stroke=1, stroke_fill=(255, 255, 255, 255)), W / 2, s(1000), 1, u)

    # ---- log ruler
    if t < ENDCARD + 0.2:
        x0, x1, ry = s(70), s(650), s(1185)
        def xof(v): return x0 + (v - N0) / (NLAST - N0) * (x1 - x0)
        for z0, z1, name, col in ZONES:
            td.line([(xof(z0) + s(2), ry), (xof(z1) - s(2), ry)], fill=col + (200,), width=max(2, int(s(5))))
            td.text(((xof(z0) + xof(z1)) / 2, ry + s(22)), name, font=font(CJK, s(17)), fill=col + (200,), anchor='mt')
        for v in range(N0, NLAST + 1):
            h_ = s(9) if v % 6 == 0 else s(4)
            td.line([(xof(v), ry - h_), (xof(v), ry + h_)], fill=(255, 255, 255, 160), width=1)
        for v in (-12, -6, 0, 6, 12, 18, 24):
            td.text((xof(v), ry - s(14)), str(v), font=font(MONO, s(15)), fill=(255, 255, 255, 170), anchor='ms')
        zc_ = max(N0, min(NLAST, z))
        mx = xof(zc_)
        td.polygon([(mx, ry - s(6)), (mx - s(10), ry - s(26)), (mx + s(10), ry - s(26))], fill=zc + (255,))
        td.text((W / 2, s(1255)), "数量级（10 的几次方 米）", font=font(CJK, s(16)), fill=(200, 200, 215, 170), anchor='mm')

    # ---- end card
    if t >= ENDCARD - 0.1:
        u = min(1, (t - (ENDCARD - 0.1)) / 0.25)
        ov = Image.new('RGBA', (W, H), (0, 0, 0, int(150 * u)))
        frame.alpha_composite(ov)
        paste(top, tlayer("38 个数量级", CJK, 92, (255, 255, 255, 255), stroke=2, stroke_fill=(255, 255, 255, 255)), W / 2, s(560), 1 + 0.2 * math.exp(-(t - ENDCARD) / 0.08) if t > ENDCARD else 1, u)
        paste(top, tlayer("从原子内部  →  可观测宇宙", CJK, 38, (255, 210, 120, 255)), W / 2, s(670), 1, u)
        paste(top, tlayer("只用了 25 秒", CJK, 38, (200, 220, 255, 255)), W / 2, s(730), 1, u)

    # ---- composite
    fr = np.asarray(frame, np.float32)
    al = fr[..., 3:4] / 255
    img = buf * (1 - al) + fr[..., :3] * al
    # beat flash / drop
    fl = 0.75 * pulse(t, [DROP], 0.2) + (0.12 if main else 0.05) * pulse(t, BEATS[:KLAST + 1], 0.08) * (0.6 + 0.6 * energy)
    img = img * (1 - fl) + 255 * fl
    tp = np.asarray(top, np.float32); ta = tp[..., 3:4] / 255
    img = img * (1 - ta) + tp[..., :3] * ta
    img *= VIGN
    if t < T0 + 0.35: img *= (t - T0) / 0.35
    if t > END_A - 0.9: img *= max(0, (END_A - t) / 0.9)
    out = Image.fromarray(img.clip(0, 255).astype(np.uint8))
    zoom_punch = 1 + (0.035 if main else 0.015) * pulse(t, BEATS[:KLAST + 1], 0.09) + 0.06 * pulse(t, [DROP], 0.25)
    if zoom_punch > 1.002:
        cw, ch = W / zoom_punch, H / zoom_punch
        out = out.transform((W, H), Image.EXTENT, ((W - cw) / 2, (H - ch) / 2, (W + cw) / 2, (H + ch) / 2), Image.BILINEAR)
    return out.tobytes()

if __name__ == '__main__':
    if MODE == 'preview':
        times = [float(x) for x in sys.argv[3].split(',')]
        ims = [Image.frombytes('RGB', (W, H), render(int(round((tt - T0) * FPS)))) for tt in times]
        cols = min(len(ims), 8); rows = math.ceil(len(ims) / cols)
        sheet = Image.new('RGB', (W * cols, H * rows))
        for j, im in enumerate(ims): sheet.paste(im, ((j % cols) * W, (j // cols) * H))
        sheet.save(sys.argv[4] if len(sys.argv) > 4 else 'preview.png'); sys.exit()
    out = sys.argv[3] if len(sys.argv) > 3 else 'scale.mp4'
    ff = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-',
                           '-ss', str(T0), '-t', str(DUR), '-i', 'in/src.mp4', '-map', '0:v', '-map', '1:a',
                           '-af', f'afade=t=in:d=0.2,afade=t=out:st={DUR - 0.9}:d=0.9',
                           '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
                           '-c:a', 'aac', '-b:a', '192k', '-ac', '2', '-shortest', out], stdin=subprocess.PIPE)
    with Pool(4) as pool:
        for j, fr in enumerate(pool.imap(render, range(NF), chunksize=3)):
            ff.stdin.write(fr)
            if j % 120 == 0: print('frame', j, flush=True)
    ff.stdin.close(); ff.wait(); print('done', out)
