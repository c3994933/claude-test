"""Render the ENFP 竞选者 beat-synced neon line-art draft (1920x1080, 30 fps).

Usage:
  python render.py video OUT.mp4          # full render (+ synthesized beat track)
  python render.py stills OUTDIR t1 t2 ... # single frames for checking
Fonts are read from $FONT_DIR (Noto Serif SC 900/600, Noto Sans SC 500, Cinzel 700).
"""
import math
import os
import subprocess
import sys
from multiprocessing import Pool

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

from timeline import B, BAR, DUR, E_PEOPLE, N_STEP, P_STEP, T, T0, bt

W, H, FPS = 1920, 1080, 30          # layout space (all coordinates below are in 1080p units)
SS = int(os.environ.get("SCALE", "2"))  # output = layout x SS  (2 -> 3840x2160)
OW, OH = W * SS, H * SS
NFRAMES = int(round(DUR * FPS))
FONT_DIR = os.environ.get("FONT_DIR", os.path.join(os.path.dirname(__file__), "fonts"))
FONT_FILES = {"serif": "serif900.ttf", "serif6": "serif600.ttf", "sans": "sans500.ttf", "latin": "cinzel.ttf"}

# palette (RGB)
CORAL = (255, 122, 89)
PINK = (255, 95, 162)
GOLD = (255, 209, 102)
COLD = (92, 108, 138)
ICE = (120, 165, 230)
CREAM = (255, 238, 226)
WARMS = [CORAL, PINK, GOLD]

# ---------------------------------------------------------------- math utils


def clamp01(x):
    return max(0.0, min(1.0, x))


def seg(t, a, b):
    return clamp01((t - a) / (b - a))


def smooth(x):
    x = clamp01(x)
    return x * x * (3 - 2 * x)


def ease_out(x):
    x = clamp01(x)
    return 1 - (1 - x) ** 3


def ease_in(x):
    x = clamp01(x)
    return x ** 3


def mixc(c1, c2, f):
    return tuple(a + (b - a) * f for a, b in zip(c1, c2))


def hsh(x):
    """Cheap deterministic hash -> [0,1) (vectorized)."""
    v = np.sin(np.asarray(x, dtype=np.float64) * 12.9898 + 78.233) * 43758.5453
    return v - np.floor(v)


def adir(a):
    """Angle measured from straight down; +pi/2 points to +x."""
    return np.array([math.sin(a), math.cos(a)])


# ---------------------------------------------------------------- geometry helpers


def arc(c, r, a0, a1, n=48, ry=None):
    a = np.linspace(a0, a1, n)
    ry = r if ry is None else ry
    return np.stack([c[0] + r * np.cos(a), c[1] + ry * np.sin(a)], 1)


def bez(p0, p1, p2, p3, n=24):
    s = np.linspace(0, 1, n)[:, None]
    p0, p1, p2, p3 = map(np.asarray, (p0, p1, p2, p3))
    return (1 - s) ** 3 * p0 + 3 * (1 - s) ** 2 * s * p1 + 3 * (1 - s) * s ** 2 * p2 + s ** 3 * p3


def trim(pts, f0, f1):
    pts = np.asarray(pts, float)
    if f1 <= f0 or len(pts) < 2:
        return None
    d = np.r_[0, np.cumsum(np.linalg.norm(np.diff(pts, axis=0), axis=1))]
    tot = d[-1]
    if tot <= 0:
        return None
    a, b = f0 * tot, f1 * tot
    pa = np.array([np.interp(a, d, pts[:, 0]), np.interp(a, d, pts[:, 1])])
    pb = np.array([np.interp(b, d, pts[:, 0]), np.interp(b, d, pts[:, 1])])
    mid = pts[(d > a) & (d < b)]
    return np.vstack([pa, mid, pb])


def heart_pts(c, s, n=60):
    a = np.linspace(0, 2 * np.pi, n)
    x = 16 * np.sin(a) ** 3
    y = -(13 * np.cos(a) - 5 * np.cos(2 * a) - 2 * np.cos(3 * a) - np.cos(4 * a))
    return np.stack([c[0] + x * s / 16, c[1] + y * s / 16], 1)


# ---------------------------------------------------------------- camera + drawing


class Cam:
    cx, cy, zoom, sx, sy = 960.0, 540.0, 1.0, 0.0, 0.0


CAM = Cam()


def P(pts):
    pts = np.asarray(pts, float).reshape(-1, 2)
    return ((pts - [CAM.cx, CAM.cy]) * CAM.zoom + [W / 2 + CAM.sx, H / 2 + CAM.sy]) * SS


def col(c, a):
    return tuple(int(max(0, min(255, v * a))) for v in c)


def poly(L, pts, c, a=1.0, th=2.0, closed=False, core=True):
    if pts is None or a <= 0.01 or len(pts) < 2:
        return
    p = np.round(P(pts) * 16).astype(np.int32).reshape(-1, 1, 2)
    t = max(1, int(round(th * CAM.zoom * SS)))
    cv2.polylines(L, [p], closed, col(c, a), t, cv2.LINE_AA, shift=4)
    if core and t >= 2:
        cv2.polylines(L, [p], closed, col(mixc(c, (255, 255, 255), 0.65), a), max(1, int(round(t * 0.5))), cv2.LINE_AA, shift=4)


def dot(L, p, r, c, a=1.0):
    if a <= 0.01:
        return
    q = np.round(P(p)[0] * 16).astype(int)
    cv2.circle(L, (int(q[0]), int(q[1])), max(1, int(round(r * CAM.zoom * 16 * SS))), col(c, a), -1, cv2.LINE_AA, shift=4)


def line(L, p0, p1, c, a=1.0, th=1.5):
    poly(L, np.array([p0, p1]), c, a, th, core=False)


# ---------------------------------------------------------------- particles (stateless)


def sparks(L, emit_pos, t, t0, t1, rate=70, life=(0.25, 0.7), speed=(80, 260), g=520.0,
           seed=1.0, colors=WARMS, a=1.0, cone=(0, 2 * np.pi), th=1.6):
    lo = max(t0, t - life[1])
    hi = min(t1, t)
    if hi < lo:
        return
    ks = np.arange(math.ceil(lo * rate), math.floor(hi * rate) + 1)
    for k in ks:
        te = k / rate
        age = t - te
        r = hsh([k * 1.37 + seed, k * 2.11 + seed * 3, k * 0.77 + seed * 7, k * 5.3 + seed])
        lf = life[0] + (life[1] - life[0]) * r[0]
        if age > lf or age < 0:
            continue
        ang = cone[0] + (cone[1] - cone[0]) * r[1]
        sp = speed[0] + (speed[1] - speed[0]) * r[2]
        v = np.array([math.cos(ang), math.sin(ang)]) * sp
        p0 = np.asarray(emit_pos(te), float)

        def at(s):
            return p0 + v * s + np.array([0, 0.5 * g * s * s])

        f = 1 - age / lf
        line(L, at(max(0, age - 0.035)), at(age), colors[int(r[3] * len(colors)) % len(colors)], a * f, th)


def burst(L, c, t, t0, n=40, speed=(500, 1300), life=1.1, seed=3.0, colors=WARMS, a=1.0,
          g=160.0, th=2.2, tail=0.08, drag=3.0):
    age = t - t0
    if age < 0 or age > life:
        return
    i = np.arange(n)
    r1, r2, r3 = hsh(i * 1.7 + seed), hsh(i * 3.1 + seed * 2), hsh(i * 0.37 + seed * 5)
    for k in range(n):
        ang = 2 * np.pi * (k + 0.5 * r1[k]) / n
        sp = speed[0] + (speed[1] - speed[0]) * r2[k]
        d = np.array([math.cos(ang), math.sin(ang)])

        def at(s):
            return np.asarray(c) + d * sp * (1 - math.exp(-s * drag)) / drag + np.array([0, 0.5 * g * s * s])

        f = (1 - age / life) ** 1.4
        line(L, at(max(0, age - tail)), at(age), colors[int(r3[k] * 3) % 3], a * f, th)
        dot(L, at(age), th * 0.9, CREAM, a * f)


def ring(L, c, t, t0, rmax, dur=0.5, colr=CORAL, a=1.0, th=3.0):
    s = seg(t, t0, t0 + dur)
    if s <= 0 or s >= 1:
        return
    r = rmax * ease_out(s)
    poly(L, arc(c, r, 0, 2 * np.pi, 120), colr, a * (1 - s) ** 1.2, th)


# ---------------------------------------------------------------- characters


def stick_pose(kind, ph=0.0, t=0.0):
    """Returns a pose dict. Angles from straight down, +pi/2 = facing +x."""
    if kind == "stand":
        sw = 0.04 * math.sin(t * 2.0 + ph)
        return dict(hip=(0, -95), lean=sw, lt=-0.07, ls=-0.05, rt=0.07, rs=0.05,
                    lu=-0.22, lf=-0.12, ru=0.22, rf=0.12, head=0.0)
    if kind == "run":
        p = 2 * math.pi * ph
        s = math.sin(p)
        return dict(hip=(0, -95 - 7 * abs(math.cos(p))), lean=0.2,
                    lt=0.65 * s, ls=0.65 * s - 0.25 - 0.9 * max(0, -math.sin(p + 0.9)),
                    rt=-0.65 * s, rs=-0.65 * s - 0.25 - 0.9 * max(0, math.sin(p + 0.9)),
                    lu=-0.8 * s, lf=-0.8 * s + 1.3, ru=0.8 * s, rf=0.8 * s + 1.3, head=0.1)
    if kind == "walk":
        p = 2 * math.pi * ph
        s = math.sin(p)
        return dict(hip=(0, -95 - 3 * abs(math.cos(p))), lean=0.06,
                    lt=0.35 * s, ls=0.35 * s - 0.25 * max(0, -math.sin(p + 0.6)),
                    rt=-0.35 * s, rs=-0.35 * s - 0.25 * max(0, math.sin(p + 0.6)),
                    lu=-0.35 * s, lf=-0.35 * s + 0.3, ru=0.35 * s, rf=0.35 * s + 0.3, head=0.0)
    if kind == "cheer":
        w = 0.25 * math.sin(t * 9 + ph)
        return dict(hip=(0, -95), lean=0.0, lt=-0.12, ls=-0.08, rt=0.12, rs=0.08,
                    lu=-(math.pi - 0.55), lf=-(math.pi - 0.2) + w, ru=math.pi - 0.55, rf=math.pi - 0.2 - w, head=0.0)
    if kind == "reach":
        return dict(hip=(0, -95), lean=0.25, lt=-0.15, ls=-0.05, rt=0.35, rs=0.0,
                    lu=-0.1, lf=0.1, ru=1.25, rf=1.5, head=0.25)
    if kind == "sit":
        return dict(hip=(0, -22), lean=0.12, lt=1.45, ls=0.15, rt=1.35, rs=0.05,
                    lu=0.45, lf=1.4, ru=0.6, rf=1.5, head=0.1)
    if kind == "crouch":
        return dict(hip=(0, -28), lean=0.75, lt=2.35, ls=0.12, rt=2.25, rs=0.05,
                    lu=1.1, lf=2.3, ru=1.2, rf=2.45, head=1.15)
    raise ValueError(kind)


def blend_pose(a, b, f):
    out = {}
    for k in a:
        if k == "hip":
            out[k] = (a[k][0] + (b[k][0] - a[k][0]) * f, a[k][1] + (b[k][1] - a[k][1]) * f)
        else:
            out[k] = a[k] + (b[k] - a[k]) * f
    return out


def stick(L, pose, origin, s, c, a=1.0, flip=1, dress=False, hair=False, t=0.0, th=2.4,
          heart=0.0, sparkler=False, spark_seed=1.0, tsec=0.0):
    """Small line figure; she gets the dress, burst hair, and sparkler."""
    o = np.asarray(origin, float)

    def X(p):
        p = np.asarray(p, float).reshape(-1, 2)
        return o + p * np.array([flip, 1.0]) * s

    hip = np.array(pose["hip"], float)
    up = np.array([math.sin(pose["lean"]), -math.cos(pose["lean"])])
    neck = hip + 55 * up
    hd = np.array([math.sin(pose["lean"] + pose["head"]), -math.cos(pose["lean"] + pose["head"])])
    head = neck + 21 * hd
    lk = hip + 50 * adir(pose["lt"])
    lft = lk + 48 * adir(pose["ls"])
    rk = hip + 50 * adir(pose["rt"])
    rft = rk + 48 * adir(pose["rs"])
    le = neck + 34 * adir(pose["lu"])
    lh = le + 31 * adir(pose["lf"])
    re = neck + 34 * adir(pose["ru"])
    rh = re + 31 * adir(pose["rf"])

    poly(L, X(arc(head, 15, 0, 2 * np.pi, 32)), c, a, th)
    poly(L, X(np.array([neck, hip])), c, a, th)
    poly(L, X(np.array([lft, lk, hip, rk, rft])), c, a, th)
    poly(L, X(np.array([lh, le, neck, re, rh])), c, a, th)
    if dress:
        side = np.array([-up[1], up[0]])
        d0l, d0r = neck + 14 * -up + 7 * side, neck + 14 * -up - 7 * side
        hl, hr = hip + 34 * -up * -1 + 30 * side, hip + 34 * -up * -1 - 30 * side
        hl = hip + np.array([-30, 36])
        hr = hip + np.array([30, 36])
        poly(L, X(np.array([d0l, hl, hr, d0r])), c, a, th)
    if hair:
        for k in range(7):
            ang = -2.6 + k * 0.33 + 0.08 * math.sin(t * 6 + k)
            base = head + 15 * np.array([math.cos(ang), math.sin(ang)])
            tip = head + (30 + 6 * (k % 2)) * np.array([math.cos(ang - 0.25), math.sin(ang - 0.25)])
            poly(L, X(np.array([base, (base + tip) / 2 + np.array([0, -3]), tip])), PINK, a, th * 0.8, core=False)
            dot(L, X(tip)[0], 2.2 * s, GOLD, a)
    if heart > 0:
        poly(L, heart_pts(X(neck + 18 * -up)[0], 9 * s), GOLD, a * heart, th * 0.9, closed=True)
    if sparkler:
        tip = X(rh + 22 * adir(pose["rf"] + 0.4))[0]
        poly(L, np.array([X(rh)[0], tip]), GOLD, a, th * 0.7, core=False)
        dot(L, tip, 3.5 * s, CREAM, a)
        sparks(L, lambda te: tip, tsec, tsec - 1, tsec + 1, rate=60, life=(0.15, 0.45),
               speed=(60, 200), g=300, seed=spark_seed, a=a, th=1.3)
    return dict(head=X(head)[0], hand=X(rh)[0], neck=X(neck)[0], chest=X(neck + 18 * -up)[0])


def crouch(L, origin, s, c, a=1.0, flip=-1, lift=0.0, heart=0.0, th=2.6):
    """Side view, sitting on the ground hugging knees, head down; lift raises the head."""
    o = np.asarray(origin, float)

    def X(p):
        return o + np.asarray(p, float).reshape(-1, 2) * np.array([flip, 1.0]) * s

    hc = np.array([16 - 10 * lift, -84 - 22 * lift])
    neck = np.array([4 - 6 * lift, -70 - 8 * lift])
    hip = np.array([-30.0, -12.0])
    knee = np.array([24.0, -54.0])
    foot = np.array([30.0, 0.0])
    poly(L, X(arc(hc, 15, 0, 2 * np.pi, 32)), c, a, th)
    poly(L, X(bez(neck, (-26, -74), (-44, -40), hip, 16)), c, a, th)
    poly(L, X(np.array([hip, knee, foot])), c, a, th)
    poly(L, X(np.array([[12, -8], foot + [8, 0]])), c, a * 0.8, th * 0.8)
    poly(L, X(bez(neck + [2, 4], (30, -64), (40, -48), (22, -40), 12)), c, a, th)
    chest = np.array([-8.0, -52.0])
    if heart > 0:
        poly(L, heart_pts(X(chest)[0], 8 * s), GOLD, a * heart, th * 0.9, closed=True)
    return dict(head=X(hc)[0], chest=X(chest)[0])


def hero_parts(t):
    """The ENFP heroine, detailed. Local coords: feet at (0,0), ~720 tall."""
    hc = np.array([0.0, -592.0])
    parts = []  # (pts, color, th, order, closed)
    add = lambda pts, c, th, o, cl=False: parts.append((np.asarray(pts, float), c, th, o, cl))

    # halo
    add(arc(hc, 128, -np.pi / 2, 1.5 * np.pi, 120), CORAL, 1.6, 0.0, True)
    add(arc(hc, 300, -np.pi / 2, 1.5 * np.pi, 160), PINK, 1.0, 0.05, True)
    for k in range(24):
        a = k / 24 * 2 * np.pi
        r0, r1 = (128, 146) if k % 6 else (128, 168)
        add([hc + r0 * np.array([math.cos(a), math.sin(a)]), hc + r1 * np.array([math.cos(a), math.sin(a)])],
            CORAL, 1.2, 0.08 + k * 0.004)
    # head + face
    add(arc(hc, 48, -np.pi / 2, 1.5 * np.pi, 64), CORAL, 3.0, 0.1, True)
    add(arc(hc + [-17, -4], 9, np.pi + 0.35, 2 * np.pi - 0.35, 12), CREAM, 2.2, 0.35)
    add(arc(hc + [17, -4], 9, np.pi + 0.35, 2 * np.pi - 0.35, 12), CREAM, 2.2, 0.35)
    add(arc(hc + [0, 14], 13, 0.4, np.pi - 0.4, 14), CREAM, 2.2, 0.36)
    # bob hair outline
    add(np.vstack([[[-50, -548]], arc(hc, 60, np.pi * 0.86, np.pi * 2.14, 50), [[50, -548]]]), PINK, 2.6, 0.15)
    # firework strands bursting from the hair
    for k in range(11):
        a0 = -np.pi + 0.22 + k * (np.pi - 0.44) / 10
        wig = 0.05 * math.sin(t * 5.0 + k * 1.3)
        base = hc + 60 * np.array([math.cos(a0), math.sin(a0)])
        ln = 70 + 35 * hsh(k * 3.3)
        pts = []
        for j in range(10):
            s = j / 9
            a = a0 + (0.35 + wig) * s * s
            pts.append(base + ln * s * np.array([math.cos(a), math.sin(a)]))
        add(pts, PINK if k % 2 else CORAL, 2.0, 0.2 + 0.01 * k)
    # neck, collar, pendant
    add([[-11, -546], [-10, -516]], CORAL, 2.6, 0.25)
    add([[11, -546], [10, -516]], CORAL, 2.6, 0.25)
    add([[-32, -510], [0, -468], [32, -510]], CORAL, 2.2, 0.3)
    add(heart_pts((0, -440), 14), GOLD, 2.4, 0.5, True)
    # dress
    add(np.vstack([bez((-10, -516), (-40, -512), (-62, -506), (-64, -492), 10),
                   bez((-64, -492), (-46, -440), (-34, -410), (-36, -385), 12),
                   bez((-36, -385), (-80, -300), (-140, -200), (-172, -122), 16)]), CORAL, 3.0, 0.3)
    add(np.vstack([bez((10, -516), (40, -512), (62, -506), (64, -492), 10),
                   bez((64, -492), (46, -440), (34, -410), (36, -385), 12),
                   bez((36, -385), (80, -300), (140, -200), (172, -122), 16)]), CORAL, 3.0, 0.3)
    xs = np.linspace(-172, 172, 90)
    add(np.stack([xs, -122 + 14 * np.abs(np.sin((xs + 172) / 344 * 6 * np.pi))], 1), PINK, 2.6, 0.45)
    add([[-36, -385], [36, -385]], GOLD, 2.0, 0.4)
    add(bez((-14, -385), (-24, -300), (-45, -200), (-64, -128), 12), CORAL, 1.4, 0.5)
    add(bez((14, -385), (24, -300), (45, -200), (64, -128), 12), CORAL, 1.4, 0.5)
    # stars on the skirt
    for k, (x, y) in enumerate([(-95, -190), (-40, -250), (30, -175), (100, -230), (0, -320)]):
        add(arc((x, y), 3.5, 0, 2 * np.pi, 8), GOLD, 2.0, 0.55 + 0.02 * k, True)
    # legs + feet
    add([[-46, -116], [-49, -20], [-70, 0]], CORAL, 2.6, 0.55)
    add([[46, -116], [50, -20], [72, 0]], CORAL, 2.6, 0.55)
    # arms (left relaxed, right raised with sparkler)
    add(bez((-64, -494), (-90, -440), (-104, -400), (-108, -370), 12).tolist() +
        bez((-108, -370), (-114, -340), (-118, -320), (-120, -300), 8).tolist(), CORAL, 2.6, 0.4)
    add(arc((-121, -292), 9, 0, 2 * np.pi, 16), CORAL, 2.2, 0.5, True)
    add(bez((64, -494), (100, -520), (130, -540), (150, -548), 10).tolist() +
        bez((150, -548), (180, -570), (205, -600), (222, -618), 10).tolist(), CORAL, 2.6, 0.4)
    add(arc((226, -624), 10, 0, 2 * np.pi, 16), CORAL, 2.2, 0.5, True)
    add([[230, -632], [278, -712]], GOLD, 2.0, 0.6)
    # ground rings
    for k, (rx, ry) in enumerate([(220, 22), (330, 34), (450, 46)]):
        add(arc((0, 0), rx, 0, 2 * np.pi, 120, ry=ry), PINK if k else CORAL, 1.2, 0.6 + 0.05 * k, True)
    return parts


HERO_TIP = np.array([278.0, -712.0])
HERO_HEART = np.array([0.0, -440.0])


def hero(L, t, origin, s, reveal=1.0, a=1.0, sparks_on=True, seed=11.0):
    o = np.asarray(origin, float)
    breathe = 1 + 0.006 * math.sin(t * 2.4)
    for pts, c, th, order, closed in hero_parts(t):
        f = clamp01((reveal - order * 0.55) / 0.45)
        if f <= 0:
            continue
        w = o + pts * [s, s * breathe]
        sub = w if f >= 1 else trim(w, 0, ease_out(f))
        poly(L, sub, c, a, th * max(0.7, s), closed=closed and f >= 1)
    tip = o + HERO_TIP * [s, s * breathe]
    if reveal > 0.9 and sparks_on:
        dot(L, tip, 5 * s + 2, CREAM, a)
        sparks(L, lambda te: tip, t, t - 1, t + 1, rate=90, life=(0.2, 0.6), speed=(90, 300),
               g=420, seed=seed, a=a, th=1.6)
    return tip, o + HERO_HEART * s


# ---------------------------------------------------------------- text


_FONTS = {}
_TILES = {}


def font(name, size):
    k = (name, size)
    if k not in _FONTS:
        _FONTS[k] = ImageFont.truetype(os.path.join(FONT_DIR, FONT_FILES[name]), size)
    return _FONTS[k]


def char_tile(ch, fname, size):
    k = (ch, fname, size)
    if k in _TILES:
        return _TILES[k]
    f = font(fname, size)
    asc, desc = f.getmetrics()
    adv = f.getlength(ch)
    pad = int(size * 0.35)
    w, h = int(math.ceil(adv)) + 2 * pad, asc + desc + 2 * pad
    im = Image.new("L", (w, h), 0)
    ImageDraw.Draw(im).text((pad, pad), ch, font=f, fill=255)
    al = np.asarray(im, np.float32) / 255
    sh = cv2.GaussianBlur(al, (0, 0), size * 0.12 + 1)
    gl = cv2.GaussianBlur(al, (0, 0), size * 0.25 + 1)
    _TILES[k] = (al, sh, gl, pad, adv, asc + desc)
    return _TILES[k]


def blit(out, al, rgb, x, y, alpha, mode="over"):
    h, w = al.shape
    x, y = int(round(x)), int(round(y))
    x0, y0, x1, y1 = max(0, x), max(0, y), min(OW, x + w), min(OH, y + h)
    if x1 <= x0 or y1 <= y0:
        return
    a = al[y0 - y:y1 - y, x0 - x:x1 - x, None] * alpha
    reg = out[y0:y1, x0:x1]
    if mode == "over":
        reg *= 1 - a
        reg += a * rgb
    elif mode == "shadow":
        reg *= 1 - a
    else:  # add
        reg += a * rgb


def text_line(out, t, segs, x, y, size, fname="serif", align="c", speed=0.055, tracking=0.0,
              t_out=None, glow=0.25, rise=14):
    """segs: list of (text, rgb, t_start). Characters fade/rise in one by one."""
    x, y, size, tracking, rise = x * SS, y * SS, int(round(size * SS)), tracking * SS, rise * SS
    chars = []
    for txt, c, ts in segs:
        for i, ch in enumerate(txt):
            chars.append((ch, c, ts + i * speed))
    tiles = [char_tile(ch, fname, size) for ch, _, _ in chars]
    width = sum(tl[4] for tl in tiles) + tracking * (len(tiles) - 1)
    cx = {"c": x - width / 2, "l": x, "r": x - width}[align]
    fo = 1.0 if t_out is None else 1 - seg(t, t_out, t_out + 0.3)
    if fo <= 0:
        return
    for (ch, c, ti), tl in zip(chars, tiles):
        al, sh, gl, pad, adv, lh = tl
        e = seg(t, ti, ti + 0.22)
        if e > 0 and ch.strip():
            dy = (1 - ease_out(e)) * rise
            top = y - lh / 2 - pad + dy
            rgb = np.array(c, np.float32) / 255
            blit(out, sh, None, cx - pad + 2 * SS, top + 3 * SS, 0.7 * e * fo, "shadow")
            if glow:
                blit(out, gl, rgb, cx - pad, top, glow * e * fo, "add")
            blit(out, al, rgb, cx - pad, top, e * fo)
        cx += adv + tracking


_TAGS = {}


def tag(out, t, letter, label, x, y, t0, t_out=None, align="c"):
    k = (letter, label)
    if k not in _TAGS:
        fb = font("sans", 28 * SS)
        fl = font("sans", 28 * SS)
        lw = int(fl.getlength(label))
        bx = 44 * SS
        w, h = bx + 12 * SS + lw + 4 * SS, bx
        box = Image.new("L", (w, h), 0)
        ImageDraw.Draw(box).rounded_rectangle((0, 0, bx - 1, bx - 1), 9 * SS, fill=255)
        let = Image.new("L", (w, h), 0)
        ImageDraw.Draw(let).text((bx // 2, bx // 2), letter, font=fb, fill=255, anchor="mm")
        lab = Image.new("L", (w, h), 0)
        ImageDraw.Draw(lab).text((bx + 12 * SS, bx // 2), label, font=fl, fill=255, anchor="lm")
        _TAGS[k] = tuple(np.asarray(im, np.float32) / 255 for im in (box, let, lab))
    box, let, lab = _TAGS[k]
    e = ease_out(seg(t, t0, t0 + 0.25))
    fo = 1.0 if t_out is None else 1 - seg(t, t_out, t_out + 0.3)
    a = e * fo
    if a <= 0:
        return
    w = box.shape[1]
    x, y = x * SS, y * SS
    x0 = {"c": x - w / 2, "l": x, "r": x - w}[align] - (1 - e) * 20 * SS
    y0 = y - 22 * SS
    blit(out, box, np.array(CORAL) / 255, x0, y0, a)
    blit(out, let, np.array([1, 1, 1.0]), x0, y0, a)
    blit(out, lab, np.array(CREAM) / 255, x0, y0, a * 0.9)


# ---------------------------------------------------------------- backgrounds


def _radial(cx, cy, inner, outer, power=1.6):
    yy, xx = np.mgrid[0:OH, 0:OW].astype(np.float32)
    d = np.sqrt(((xx - cx * SS) / OW) ** 2 + ((yy - cy * SS) / OH) ** 2) / 0.75
    f = np.clip(d, 0, 1)[..., None] ** power
    return (np.array(inner, np.float32) * (1 - f) + np.array(outer, np.float32) * f) / 255


BG_COLD = _radial(960, 480, (16, 22, 40), (3, 4, 10))
BG_WARM = _radial(960, 480, (40, 16, 30), (7, 3, 8))
_yy, _xx = (np.mgrid[0:OH, 0:OW].astype(np.float32) / SS)  # in layout units
VIGNETTE = (1 - 0.55 * np.clip(np.sqrt(((_xx - W / 2) / (W * 0.62)) ** 2 + ((_yy - H / 2) / (H * 0.7)) ** 2) - 0.35, 0, 1) ** 1.5)[..., None]
_rng = np.random.default_rng(5)
STARS = np.stack([_rng.uniform(0, W, 260), _rng.uniform(0, H, 260), _rng.uniform(0, 6.28, 260),
                  _rng.uniform(0.6, 2.2, 260), _rng.uniform(0.6, 1.6, 260)], 1)
PARTS = np.stack([_rng.uniform(-60, W + 60, 520), _rng.uniform(-40, H + 40, 520),
                  _rng.uniform(0, 6.28, 520), _rng.integers(0, 3, 520).astype(float)], 1)


def draw_stars(L, t, tint, a=1.0):
    for x, y, ph, sp, r in STARS:
        tw = 0.35 + 0.3 * math.sin(t * sp + ph)
        px = (x - (CAM.cx - 960) * 0.15) % W
        py = (y - (CAM.cy - 540) * 0.15) % H
        cv2.circle(L, (int(px * 16 * SS), int(py * 16 * SS)), int(r * 16 * SS), col(tint, tw * a), -1, cv2.LINE_AA, shift=4)


# ---------------------------------------------------------------- scenes


C0 = np.array([960.0, 470.0])
RING_R = [260, 540, 860, 1250]


def spark_path(t):
    s = ease_out(seg(t, T["arrive"], T["arrive"] + 1.3))
    p = bez((-120, 640), (420, 780), (640, 360), C0, 2)
    pts = bez((-120, 640), (420, 780), (640, 360), C0, 200)
    return trim(pts, 0, max(1e-4, s))[-1] if s > 0 else np.array([-200.0, 640.0])


def warm_time(d):
    for k, R in enumerate(RING_R):
        if d < R:
            s = 1 - (1 - d / R) ** (1 / 3)
            return T["warm"] + k * B + s * 0.5
    return T["warm"] + 3 * B + 0.5


PART_TW = np.array([warm_time(math.hypot(x - C0[0], y - C0[1])) for x, y, _, _ in PARTS])


def scene_intro(L, out_texts, t):
    gl = seg(t, T["gather"], T["silence"] - 0.05)
    head = spark_path(t)
    for (x, y, ph, ci), tw in zip(PARTS, PART_TW):
        dl = 0.45 * (ph / 6.28)
        gather = smooth(clamp01((gl - dl) / (1 - dl))) ** 1.5
        w = seg(t, tw, tw + 0.3)
        p = np.array([x, y])
        if w > 0:
            p = p + np.array([1.5 * math.sin(t * 4 + ph), -abs(math.sin(t * 3.1 + ph)) * 7 * w])
        if gather > 0:
            rel = p - C0
            r0 = np.linalg.norm(rel) + 1e-6
            r = r0 * (1 - gather)
            ang = math.atan2(rel[1], rel[0]) + gather * (1.2 + 220 / (r + 60))
            p = C0 + r * np.array([math.cos(ang), math.sin(ang)])
        near = 0.0
        if T["arrive"] < t < T["warm"] + B:
            near = max(0, 1 - np.linalg.norm(p - head) / 140)
        c = mixc((150, 165, 198), WARMS[int(ci)], w)
        a = 0.55 + 0.45 * w + 0.6 * near
        dot(L, p, 2.0 + 1.0 * w + 1.5 * near, c, min(1, a))
    # spark + trail
    if t >= T["arrive"]:
        trail = np.array([spark_path(t - j * 0.016) for j in range(36)])
        for j in range(0, 35, 5):
            poly(L, trail[j:j + 6], GOLD, (1 - j / 36) * 0.9, 3.0 - j / 18)
        tremble = 0
        if t > T["gather"]:
            k = seg(t, T["gather"], T["silence"])
            tremble = 6 * k
        hp = head + tremble * np.array([math.sin(t * 77), math.cos(t * 61)])
        pulse = 0
        if t > T["warm"]:
            pulse = math.exp(-((t - T["warm"]) % B) * 6)
        dot(L, hp, 6 + 4 * pulse + 6 * seg(t, T["gather"], T["silence"]), CREAM)
        sparks(L, lambda te: spark_path(te), t, T["arrive"], T["silence"] - 0.05, rate=60,
               life=(0.2, 0.5), speed=(40, 160), g=200, seed=2.0, th=1.3)
    for k in range(4):
        ring(L, C0, t, T["warm"] + k * B, RING_R[k], 0.55, WARMS[k % 3], 0.9, 3.0)

    hi = T["warm"] + 0.05
    fo = T["gather"] + 0.9
    out_texts.append(lambda o: text_line(o, t, [("有一种人", CREAM, T0 + 0.1)], 960, 790, 46, t_out=fo))
    out_texts.append(lambda o: text_line(o, t, [("一出现，", CREAM, T["arrive"]), ("空气", CREAM, hi),
                                                ("就变热了", CORAL, hi + B)], 960, 856, 46, t_out=fo))


HERO_DROP = np.array([600.0, 975.0])


def scene_drop(L, out_texts, t):
    d = T["drop"]
    burst(L, (600, 470), t, d, n=56, speed=(700, 1700), life=1.2, seed=4.0, th=2.6, tail=0.1)
    burst(L, (600, 470), t, d + 0.05, n=36, speed=(250, 700), life=1.4, seed=9.0, th=1.8, g=380)
    rev = ease_out(seg(t, d + 0.08, d + 1.5)) * 1.0
    hero(L, t, HERO_DROP, 1.0, reveal=rev, seed=21.0)
    tx = 1420
    out_texts.append(lambda o: text_line(o, t, [("ENFP", CREAM, d + B)], tx, 400, 104, "latin",
                                         speed=B / 4, tracking=34, glow=0.35, rise=24))
    out_texts.append(lambda o: text_line(o, t, [("竞选者", CREAM, d + 2 * B)], tx, 540, 132, "serif",
                                         speed=B / 3, tracking=10, glow=0.3, rise=24))
    out_texts.append(lambda o: text_line(o, t, [("E 外向 · N 直觉 · F 情感 · P 感知", (255, 200, 185), d + 3 * B)],
                                         tx, 650, 26, "sans", speed=0.02, tracking=2, glow=0.0, rise=6))


CROWD_X = [330 + 350 * k for k in range(E_PEOPLE)]
GROUND_Y = 860


def run_x(t):
    return 330 + (t - T["e_light0"]) * 525


def scene_e(L, out_texts, t):
    x = run_x(t)
    poly(L, np.array([[-200, GROUND_Y], [2200, GROUND_Y]]), COLD, 0.45, 1.4, core=False)
    poly(L, np.array([[-200, GROUND_Y], [x, GROUND_Y]]), CORAL, 0.9, 2.2)
    for k, cx in enumerate(CROWD_X):
        tl = T["e_light0"] + k * B
        f = seg(t, tl, tl + 0.18)
        c = mixc(COLD, WARMS[k % 3], f)
        jump = 0.0
        if t > tl:
            s = seg(t, tl, tl + 0.45)
            jump = -46 * math.sin(math.pi * s) if s < 1 else 0
        kind = "cheer" if t > tl else "stand"
        pose = stick_pose(kind, ph=k * 1.7, t=t)
        info = stick(L, pose, (cx, GROUND_Y + jump), 1.15, c, 0.55 + 0.45 * f, flip=-1 if k % 2 else 1,
                     t=t, th=2.4, heart=f)
        if t > tl:
            ring(L, info["chest"], t, tl, 170, 0.5, WARMS[k % 3], 0.9, 2.6)
            burst(L, info["head"] + [0, -40], t, tl, n=18, speed=(160, 420), life=0.8, seed=30 + k, th=1.8, g=500)
            poly(L, arc((cx, GROUND_Y + 4), 70 * f, 0, 2 * np.pi, 40, ry=9 * f), WARMS[k % 3], 0.6 * f, 1.4, core=False)
    pose = stick_pose("run", ph=(t - T["e"]) / B)
    stick(L, pose, (x, GROUND_Y), 1.35, CORAL, 1.0, dress=True, hair=True, t=t, th=2.8,
          heart=1.0, sparkler=True, spark_seed=40.0, tsec=t)
    e0 = T["e"]
    out_texts.append(lambda o: tag(o, t, "E", "外向", 960, 170, e0 + 0.05, T["n"] - 0.2))
    out_texts.append(lambda o: text_line(o, t, [("走到哪", CREAM, e0 + 0.12)], 960, 240, 50, t_out=T["n"] - 0.2))
    out_texts.append(lambda o: text_line(o, t, [("哪就亮", GOLD, e0 + 2 * B)], 960, 310, 50, t_out=T["n"] - 0.2))


def _tree():
    rng = np.random.default_rng(12)
    br = []  # (level, start_offset, end_offset)
    tips = [(np.zeros(2), -1.95, 220.0)]  # angle from down: ~-1.95 => up-right-ish (pointing to +x and up)
    tips = [(np.zeros(2), 1.72, 190.0)]
    for lvl in range(6):
        new = []
        for p, a, ln in tips:
            q = p + ln * adir(a)
            br.append((lvl, p, q))
            spread = [0.5, 0.42, 0.36, 0.32, 0.28, 0.24][lvl]
            for sgn in (-1, 1):
                new.append((q, a + sgn * spread + rng.normal(0, 0.06), ln * 0.74 * (1 + rng.normal(0, 0.05))))
        tips = new
    return br


TREE = _tree()
HERO_N = np.array([420.0, 1010.0])


def scene_n(L, out_texts, t):
    n0 = T["n"]
    tip, _ = hero(L, t, HERO_N, 0.74, seed=51.0)
    for i, (lvl, p, q) in enumerate(TREE):
        tg = n0 + lvl * N_STEP
        f = ease_out(seg(t, tg, tg + 0.22))
        if f <= 0:
            continue
        a, b = tip + p, tip + p + (q - p) * f
        c = WARMS[(lvl + i) % 3]
        poly(L, np.array([a, b]), c, 0.95, 2.8 - lvl * 0.25)
        if f >= 1:
            fl = math.exp(-(t - tg - 0.22) * 5)
            dot(L, tip + q, 3.2 + 4 * fl, mixc(c, CREAM, 0.5))
            if lvl == 5:
                tw = 0.6 + 0.4 * math.sin(t * 7 + i)
                dot(L, tip + q, 3.5, GOLD, tw)
    out_texts.append(lambda o: tag(o, t, "N", "直觉", 1500, 790, n0 + 0.05, T["f"] - 0.2))
    out_texts.append(lambda o: text_line(o, t, [("一个点子", CREAM, n0 + 0.12)], 1500, 860, 50, t_out=T["f"] - 0.2))
    out_texts.append(lambda o: text_line(o, t, [("能长出", CREAM, n0 + 2 * B), ("一百个", GOLD, n0 + 2 * B + 0.17)],
                                         1500, 930, 50, t_out=T["f"] - 0.2))


SAD = np.array([1250.0, 880.0])
RAIN = np.stack([_rng.uniform(980, 1520, 80), _rng.uniform(0, 1, 80), _rng.uniform(0, 6.28, 80)], 1)
F_RINGS = [200, 380, 620, 1000]


def scene_f(L, out_texts, t):
    f0, tt = T["f"], T["f_touch"]
    warmR = 0.0
    for k, R in enumerate(F_RINGS):
        warmR = max(warmR, R * ease_out(seg(t, tt + k * B, tt + k * B + 0.5)))
    poly(L, np.array([[-200, SAD[1]], [2200, SAD[1]]]), COLD, 0.35, 1.2, core=False)
    heart_c = SAD + np.array([8, -52]) * 1.6
    for x, y0, ph in RAIN:
        y = 180 + ((y0 + t * 0.9) % 1) * 700
        d = math.hypot(x - heart_c[0], y - heart_c[1])
        if d < warmR:
            # rain turned into rising embers
            yy = 180 + ((y0 - (t - tt) * 0.25) % 1) * 700
            dot(L, (x + 6 * math.sin(t * 3 + ph), yy), 2.4, WARMS[int(ph * 3) % 3], 0.85)
        else:
            line(L, (x, y), (x - 4, y + 34), ICE, 0.55, 1.4)
    warmth = seg(t, tt, tt + 3 * B)
    sad_c = mixc(ICE, CORAL, warmth)
    info = crouch(L, SAD, 1.6, sad_c, 0.9, flip=-1, lift=smooth(seg(t, tt + 2 * B, tt + 3.5 * B)),
                  heart=seg(t, tt, tt + 0.2))
    for k in range(4):
        ring(L, info["chest"], t, tt + k * B, F_RINGS[k], 0.55, WARMS[k % 3], 0.85, 3.0)
    if t > tt:
        burst(L, info["chest"], t, tt, n=22, speed=(150, 420), life=0.9, seed=60.0, th=1.8, g=200)
    # she walks in, then reaches out
    wx = 760 + 300 * smooth(seg(t, f0, tt - 0.1))
    if t < tt - 0.1:
        pose_h = stick_pose("walk", ph=(t - f0) / B * 0.5)
    else:
        pose_h = blend_pose(stick_pose("stand", t=t), stick_pose("reach"), smooth(seg(t, tt - 0.35, tt)))
    stick(L, pose_h, (wx, SAD[1]), 1.5, CORAL, 1.0, dress=True, hair=True, t=t, th=2.8, heart=1.0)
    out_texts.append(lambda o: tag(o, t, "F", "情感", 420, 200, f0 + 0.05, T["p"] - 0.2))
    out_texts.append(lambda o: text_line(o, t, [("别人的情绪", CREAM, f0 + 0.12)], 420, 270, 50, t_out=T["p"] - 0.2))
    out_texts.append(lambda o: text_line(o, t, [("她都", CREAM, tt), ("接得住", CORAL, tt + 0.12)], 420, 340, 50,
                                         t_out=T["p"] - 0.2))
    return warmth


def shape_pts(kind):
    s = np.linspace(0, 1, 140)
    if kind == "star":
        idx = [0, 2, 4, 1, 3, 0]
        v = np.array([[math.sin(i * 2 * math.pi / 5), -math.cos(i * 2 * math.pi / 5)] for i in idx])
        return v
    if kind == "heart":
        return heart_pts((0, 0), 1.0, 120)
    if kind == "bird":
        return np.vstack([bez((-1.1, -0.1), (-0.8, -0.6), (-0.3, -0.5), (0, 0.05), 30),
                          bez((0, 0.05), (0.3, -0.5), (0.8, -0.6), (1.1, -0.1), 30)])
    if kind == "spiral":
        a = s * 4.2 * np.pi
        r = 0.05 + 0.95 * s
        return np.stack([r * np.cos(a), r * np.sin(a)], 1)
    if kind == "flower":
        a = s * np.pi
        r = np.cos(5 * a)
        return np.stack([r * np.cos(a), r * np.sin(a)], 1)
    if kind == "planet":
        a = np.linspace(0, 2 * np.pi, 80)
        circ = np.stack([0.55 * np.cos(a), 0.55 * np.sin(a)], 1)
        rot = -0.3
        e = np.stack([1.05 * np.cos(a), 0.28 * np.sin(a)], 1)
        e = e @ np.array([[math.cos(rot), math.sin(rot)], [-math.sin(rot), math.cos(rot)]])
        return np.vstack([circ, e])
    raise ValueError(kind)


SHAPES = [("star", (640, 270), 105), ("heart", (960, 220), 7.0), ("bird", (1290, 300), 120),
          ("spiral", (1620, 250), 110), ("flower", (1080, 520), 120), ("planet", (1500, 540), 120)]
HERO_P = np.array([270.0, 1015.0])


def scene_p(L, out_texts, t):
    p0 = T["p"]
    tip, _ = hero(L, t, HERO_P, 0.6, seed=71.0)
    for k, (kind, c, sc) in enumerate(SHAPES):
        ts = p0 + k * P_STEP
        f = seg(t, ts, ts + 0.28)
        if f <= 0:
            continue
        pts = shape_pts(kind)
        if kind == "heart":
            pts = pts / 16 * 16  # already unit-ish (heart_pts uses s=1 -> ~1 unit)
            pts = pts * 14
        pts = np.asarray(c) + pts * sc
        colr = WARMS[k % 3]
        fade = 1 - 0.4 * seg(t, ts + 0.5, ts + 2.0)
        sub = trim(pts, 0, ease_out(f)) if f < 1 else pts
        poly(L, sub, colr, fade, 3.0, closed=(kind in ("star",)) and f >= 1)
        if f < 1:
            head = sub[-1]
            dot(L, head, 5, CREAM)
            sparks(L, lambda te, pts=pts, ts=ts: trim(pts, 0, max(1e-3, ease_out(seg(te, ts, ts + 0.28))))[-1],
                   t, ts, ts + 0.28, rate=160, life=(0.15, 0.45), speed=(60, 220), g=380, seed=80 + k, th=1.4)
        else:
            burst(L, pts[-1], t, ts + 0.28, n=14, speed=(100, 260), life=0.6, seed=90 + k, th=1.5, g=300)
        # thin light thread from the sparkler to the drawing head
        if 0 < f < 1:
            line(L, tip, sub[-1], GOLD, 0.25, 1.0)
    out_texts.append(lambda o: tag(o, t, "P", "感知", 1300, 760, p0 + 0.05, T["end"] - 0.2))
    out_texts.append(lambda o: text_line(o, t, [("三分钟热度？", CREAM, p0 + 0.12)], 1300, 830, 50, t_out=T["end"] - 0.2))
    out_texts.append(lambda o: text_line(o, t, [("是每三分钟", CREAM, p0 + 2 * B), ("一次心动", PINK, p0 + 2 * B + 0.3)],
                                         1300, 900, 50, t_out=T["end"] - 0.2))


LONE = np.array([1150.0, 780.0])
POP = np.array([1078.0, 600.0])


def scene_end(L, out_texts, t):
    e0, pop = T["end"], T["pop"]
    wf = seg(t, pop, pop + 0.8)
    poly(L, np.array([[-200, LONE[1]], [2200, LONE[1]]]), mixc(COLD, CORAL, wf), 0.4 + 0.3 * wf, 1.3, core=False)
    lone_c = mixc(ICE, GOLD, ease_out(wf))
    stick(L, stick_pose("sit"), LONE, 1.05, lone_c, 0.85, flip=-1, t=t, th=2.4, heart=wf)
    walk = seg(t, e0, e0 + 2 * B)
    x = 520 + (1010 - 520) * smooth(walk)
    if walk < 1:
        pose = stick_pose("walk", ph=(t - e0) / B * 0.5)
    else:
        pose = blend_pose(stick_pose("stand", t=t), stick_pose("sit"), smooth(seg(t, e0 + 2 * B, e0 + 2.75 * B)))
    stick(L, pose, (x, LONE[1]), 1.05, CORAL, 1.0, dress=True, hair=True, t=t, th=2.6, heart=1.0)
    if t > pop - 0.25:
        k = seg(t, pop - 0.25, pop)
        if k < 1:
            line(L, (POP[0], LONE[1] - 20), (POP[0], LONE[1] - 20 - (LONE[1] - 20 - POP[1]) * ease_out(k)), GOLD, 0.9, 2.0)
    burst(L, POP, t, pop, n=40, speed=(260, 620), life=1.5, seed=101.0, th=2.2, g=120)
    burst(L, POP, t, pop + 0.12, n=26, speed=(120, 300), life=1.4, seed=102.0, th=1.6, g=160)
    hi = e0 + 0.1
    out_texts.append(lambda o: text_line(o, t, [("别人嫌她太吵", CREAM, hi)], 960, 200, 48, t_out=T["outro"] - 0.2, speed=0.07))
    out_texts.append(lambda o: text_line(o, t, [("其实她只是", CREAM, bt(36))], 960, 268, 48, t_out=T["outro"] - 0.2, speed=0.07))
    out_texts.append(lambda o: text_line(o, t, [("怕你太冷", CORAL, pop + 0.05)], 960, 352, 64, t_out=T["outro"] - 0.2,
                                         speed=0.1, glow=0.45))
    return wf


def scene_outro(L, out_texts, t):
    o0 = T["outro"]
    k = seg(t, o0, o0 + 0.5)
    c = np.array([960.0, 430.0])
    r = 8 + 4 * math.sin(t * 6) * seg(t, o0 + 0.5, o0 + 0.8)
    dot(L, c, r, CREAM)
    if k < 1:
        for j in range(3):
            poly(L, arc(c, 900 * (1 - ease_in(k)) * (1 - j * 0.25) + 10, 0, 2 * np.pi, 120), WARMS[j], 0.7, 2.0)
    ring(L, c, t, o0 + 0.5, 160, 0.9, CORAL, 0.9, 2.0)
    poly(L, trim(arc(c, 60, -np.pi / 2, 1.5 * np.pi, 90), 0, ease_out(seg(t, o0 + 0.5, o0 + 1.0))), CORAL, 0.9, 1.6)
    sparks(L, lambda te: c, t, o0 + 0.5, DUR, rate=40, life=(0.3, 0.8), speed=(40, 140), g=60, seed=120.0, th=1.2)
    out_texts.append(lambda o: text_line(o, t, [("ENFP", CREAM, o0 + 0.45)], 960, 580, 64, "latin", tracking=26, speed=0.08, glow=0.3))
    out_texts.append(lambda o: text_line(o, t, [("竞选者", CREAM, o0 + 0.75)], 960, 670, 60, "serif", tracking=12, speed=0.1))
    out_texts.append(lambda o: text_line(o, t, [("MBTI 系列  ·  @小纸人讲道理", (230, 190, 180), o0 + 1.05)], 960, 745, 24, "sans",
                                         tracking=3, speed=0.02, glow=0.0, rise=4))


# ---------------------------------------------------------------- frame


def shake_amp(t):
    kicks = [(T["drop"], 26), (T["e"], 7), (T["n"], 7), (T["f"], 7), (T["p"], 7), (T["pop"], 8)]
    kicks += [(T["e_light0"] + k * B, 5) for k in range(E_PEOPLE)]
    kicks += [(T["n"] + 2 * B, 5), (T["p"] + 2 * B, 5), (T["end"], 6)]
    kicks += [(T["f_touch"] + k * B, 4) for k in range(4)]
    sx = sy = 0.0
    for tb, a in kicks:
        if t >= tb:
            e = a * math.exp(-(t - tb) * 9)
            sx += e * math.sin((t - tb) * 95 + tb)
            sy += e * math.cos((t - tb) * 71 + tb * 2)
    return sx, sy


def punch(t):
    z = 1.0
    for tb in (T["e"], T["n"], T["f"], T["p"]):
        if t >= tb:
            z += 0.05 * math.exp(-(t - tb) * 7)
    return z


def render(i):
    t = i / FPS
    L = np.zeros((OH, OW, 3), np.uint8)
    texts = []
    CAM.cx, CAM.cy, CAM.zoom = 960.0, 540.0, 1.0
    CAM.sx, CAM.sy = shake_amp(t)
    warmth = 0.0
    flash = 0.0
    for tb in (T["e"], T["n"], T["f"], T["p"]):
        if t >= tb:
            flash = max(flash, 0.22 * math.exp(-(t - tb) * 14))

    if t < T["silence"]:
        warmth = 0.45 * seg(t, T["warm"], T["gather"]) * (1 - seg(t, T["gather"] + 1.5, T["silence"]))
        draw_stars(L, t, mixc(ICE, CREAM, warmth), 0.8)
        scene_intro(L, texts, t)
    elif t < T["drop"]:
        out = np.zeros((OH, OW, 3), np.uint8)
        return out.tobytes()
    elif t < T["e"]:
        warmth = 0.7
        CAM.zoom = 1.0 + 0.08 * (1 - ease_out(seg(t, T["drop"], T["drop"] + 1.2)))
        CAM.cx = 960 - 40 * (1 - ease_out(seg(t, T["drop"], T["drop"] + 2)))
        draw_stars(L, t, CREAM, 1.0)
        scene_drop(L, texts, t)
        flash = max(flash, 0.75 * math.exp(-(t - T["drop"]) * 16))
    elif t < T["n"]:
        warmth = 0.55
        CAM.zoom = punch(t)
        CAM.cx = 960 + (run_x(t) - 960) * 0.08
        draw_stars(L, t, CREAM, 0.8)
        scene_e(L, texts, t)
    elif t < T["f"]:
        warmth = 0.7
        CAM.zoom = punch(t) * (1.0 + 0.05 * seg(t, T["n"], T["f"]))
        CAM.cx, CAM.cy = 930 + 40 * seg(t, T["n"], T["f"]), 520
        draw_stars(L, t, CREAM, 0.9)
        scene_n(L, texts, t)
    elif t < T["p"]:
        CAM.zoom = punch(t)
        draw_stars(L, t, ICE, 0.7)
        w = scene_f(L, texts, t)
        warmth = 0.1 + 0.7 * w
    elif t < T["end"]:
        warmth = 0.75
        CAM.zoom = punch(t) * (1.02 - 0.02 * seg(t, T["p"], T["end"]))
        draw_stars(L, t, CREAM, 0.9)
        scene_p(L, texts, t)
    elif t < T["outro"]:
        CAM.zoom = 1.0 + 0.03 * seg(t, T["end"], T["outro"])
        CAM.cy = 540 - 10 * seg(t, T["end"], T["outro"])
        draw_stars(L, t, ICE, 0.6)
        wf = scene_end(L, texts, t)
        warmth = 0.05 + 0.85 * wf
    else:
        warmth = 0.9 * (1 - seg(t, T["outro"], T["outro"] + 0.5)) + 0.35
        draw_stars(L, t, CREAM, 0.5)
        scene_outro(L, texts, t)

    # HUD (series label) during main body
    if T["e"] <= t < T["outro"]:
        texts.append(lambda o: text_line(o, t, [("MBTI · ENFP 竞选者", (200, 170, 170), T["e"])], 64, 56, 20, "sans",
                                         align="l", speed=0.0, glow=0.0, rise=0, t_out=T["outro"] - 0.4))

    bg = BG_COLD * (1 - warmth) + BG_WARM * warmth
    Lf = L.astype(np.float32) * (1 / 255)
    sm = cv2.resize(Lf, (W // 4, H // 4), interpolation=cv2.INTER_AREA)
    g = cv2.GaussianBlur(sm, (0, 0), 2.2) * 1.35 + cv2.GaussianBlur(sm, (0, 0), 9) * 1.5
    g = cv2.resize(g, (OW, OH), interpolation=cv2.INTER_LINEAR)
    out = bg + Lf + g

    # warm flood at the end
    if T["pop"] <= t < T["outro"] + 0.8:
        k = ease_out(seg(t, T["pop"], T["pop"] + 1.1))
        fade = 1 - seg(t, T["outro"], T["outro"] + 0.7)
        d = np.sqrt((_xx - POP[0]) ** 2 + (_yy - POP[1]) ** 2)
        R = 80 + 2200 * k
        fl = np.clip(1 - d / R, 0, 1) ** 1.6 * 0.55 * fade
        out += fl[..., None] * (np.array(CORAL, np.float32) / 255)

    out *= VIGNETTE
    for fn in texts:
        fn(out)
    if flash > 0:
        out += flash * np.array([1.0, 0.92, 0.88], np.float32)
    # fade from / to black
    fade = seg(t, 0, 0.4) * (1 - seg(t, DUR - 0.6, DUR))
    out *= fade
    # soft shoulder tone-map
    knee = 0.82
    hi = out > knee
    out[hi] = knee + (1 - knee) * (1 - np.exp(-(out[hi] - knee) / (1 - knee)))
    return (np.clip(out, 0, 1) * 255 + 0.5).astype(np.uint8).tobytes()


def main():
    mode = sys.argv[1]
    if mode == "stills":
        outdir = sys.argv[2]
        os.makedirs(outdir, exist_ok=True)
        for ts in sys.argv[3:]:
            i = int(round(float(ts) * FPS))
            img = np.frombuffer(render(i), np.uint8).reshape(OH, OW, 3)
            Image.fromarray(img).save(os.path.join(outdir, f"t{float(ts):05.2f}.png"))
        return
    out = sys.argv[2]
    here = os.path.dirname(os.path.abspath(__file__))
    tmp_v = out + ".video.mp4"
    tmp_a = out + ".audio.wav"
    bgm = os.environ.get("BGM")
    if bgm:
        # BGM_START = where the BGM's timeline starts in that file (its beat 0 sits T0 after it)
        start = float(os.environ.get("BGM_START", "0"))
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-ss", f"{start:.3f}", "-t", f"{DUR:.3f}", "-i", bgm,
                        "-af", f"loudnorm=I=-15:TP=-1.5:LRA=11,afade=t=out:st={DUR - 0.6:.2f}:d=0.6",
                        "-ac", "2", "-ar", "48000", tmp_a], check=True)
    else:
        sys.path.insert(0, here)
        import audio
        audio.build(tmp_a)
    ff = subprocess.Popen(["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24",
                           "-s", f"{OW}x{OH}", "-r", str(FPS), "-i", "-", "-c:v", "libx264", "-preset", "slow",
                           "-crf", "16", "-tune", "animation", "-pix_fmt", "yuv420p", tmp_v],
                          stdin=subprocess.PIPE)
    with Pool(int(os.environ.get("JOBS", os.cpu_count() or 2))) as pool:
        for k, buf in enumerate(pool.imap(render, range(NFRAMES), chunksize=4)):
            ff.stdin.write(buf)
            if k % 60 == 0:
                print(f"frame {k}/{NFRAMES}", flush=True)
    ff.stdin.close()
    ff.wait()
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", tmp_v, "-i", tmp_a, "-c:v", "copy", "-c:a", "aac",
                    "-b:a", "192k", "-shortest", "-movflags", "+faststart", out], check=True)
    os.remove(tmp_v)
    os.remove(tmp_a)
    print("wrote", out)


if __name__ == "__main__":
    main()
