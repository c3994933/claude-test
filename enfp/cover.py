"""Video covers for the ENFP piece, drawn with the same renderer as the video.

  python cover.py OUTDIR      -> cover_3x4.png (2160x2880) and cover_16x9.png (3840x2160)
"""
import math
import os
import sys

import numpy as np
from PIL import Image

import render as R

ACCOUNT = "@小纸人讲道理"
T_FREEZE = 12.4  # moment used for animated bits (hair wiggle, sparkler sparks)


def set_canvas(w, h):
    """Re-point the renderer's layout/canvas globals at a new frame size."""
    R.W, R.H = w, h
    R.OW, R.OH = w * R.SS, h * R.SS
    R.BG_COLD = R._radial(w / 2, h * 0.42, (16, 22, 40), (3, 4, 10))
    R.BG_WARM = R._radial(w / 2, h * 0.42, (46, 18, 34), (8, 3, 9))
    yy, xx = np.mgrid[0:R.OH, 0:R.OW].astype(np.float32) / R.SS
    R._yy, R._xx = yy, xx
    R.VIGNETTE = (1 - 0.55 * np.clip(np.sqrt(((xx - w / 2) / (w * 0.62)) ** 2 + ((yy - h / 2) / (h * 0.7)) ** 2)
                                     - 0.35, 0, 1) ** 1.5)[..., None]
    rng = np.random.default_rng(9)
    n = int(260 * w * h / (1920 * 1080))
    R.STARS = np.stack([rng.uniform(0, w, n), rng.uniform(0, h, n), rng.uniform(0, 6.28, n),
                        rng.uniform(0.6, 2.2, n), rng.uniform(0.6, 1.6, n)], 1)
    R.CAM.cx, R.CAM.cy, R.CAM.zoom, R.CAM.sx, R.CAM.sy = w / 2, h / 2, 1.0, 0.0, 0.0


def finish(L, texts, warmth=0.8, glow_pool=None):
    bg = R.BG_COLD * (1 - warmth) + R.BG_WARM * warmth
    Lf = L.astype(np.float32) / 255
    sm = R.cv2.resize(Lf, (R.W // 4, R.H // 4), interpolation=R.cv2.INTER_AREA)
    g = R.cv2.GaussianBlur(sm, (0, 0), 2.2) * 1.35 + R.cv2.GaussianBlur(sm, (0, 0), 9) * 1.5
    g = R.cv2.resize(g, (R.OW, R.OH), interpolation=R.cv2.INTER_LINEAR)
    out = bg + Lf + g
    if glow_pool is not None:
        (cx, cy), rad, strength = glow_pool
        d = np.sqrt((R._xx - cx) ** 2 + (R._yy - cy) ** 2)
        out += (np.clip(1 - d / rad, 0, 1) ** 2 * strength)[..., None] * (np.array(R.CORAL, np.float32) / 255)
    out *= R.VIGNETTE
    for fn in texts:
        fn(out)
    knee = 0.82
    hi = out > knee
    out[hi] = knee + (1 - knee) * (1 - np.exp(-(out[hi] - knee) / (1 - knee)))
    return Image.fromarray((np.clip(out, 0, 1) * 255 + 0.5).astype(np.uint8))


def fireworks(L, centers, t=T_FREEZE):
    """Frozen firework bursts (each drawn at a fixed age)."""
    for k, (c, age, n, sp) in enumerate(centers):
        R.burst(L, c, t, t - age, n=n, speed=(sp * 0.5, sp), life=1.4, seed=200 + k * 7, th=2.0, g=90, tail=0.12)


def cover_portrait(outdir):
    w, h = 1080, 1440
    set_canvas(w, h)
    L = np.zeros((R.OH, R.OW, 3), np.uint8)
    t = T_FREEZE
    texts = []
    R.draw_stars(L, t, R.CREAM, 0.9)
    fireworks(L, [((190, 560), 0.45, 34, 420), ((905, 470), 0.5, 30, 380), ((150, 1010), 0.6, 22, 300),
                  ((950, 930), 0.4, 26, 330)])
    # heroine, centred, a bit larger than in the video
    origin = (w / 2 - 20, 1290)
    R.hero(L, t, origin, 1.08, seed=31.0)
    # floating warm motes
    rng = np.random.default_rng(4)
    for _ in range(70):
        p = (rng.uniform(40, w - 40), rng.uniform(420, 1330))
        R.dot(L, p, rng.uniform(1.6, 3.4), R.WARMS[rng.integers(0, 3)], rng.uniform(0.35, 0.9))

    texts.append(lambda o: R.text_line(o, t, [("MBTI 系列", (225, 190, 180), 0)], 60, 62, 24, "sans",
                                       align="l", speed=0, glow=0, rise=0, tracking=4))
    texts.append(lambda o: R.text_line(o, t, [(ACCOUNT, (225, 190, 180), 0)], w - 60, 62, 24, "sans",
                                       align="r", speed=0, glow=0, rise=0, tracking=2))
    texts.append(lambda o: R.text_line(o, t, [("ENFP", R.CREAM, 0)], w / 2, 210, 190, "latin",
                                       speed=0, tracking=40, glow=0.45, rise=0))
    texts.append(lambda o: R.text_line(o, t, [("竞 选 者", R.CREAM, 0)], w / 2, 360, 92, "serif",
                                       speed=0, tracking=6, glow=0.3, rise=0))
    texts.append(lambda o: R.text_line(o, t, [("E 外向 · N 直觉 · F 情感 · P 感知", (255, 200, 185), 0)], w / 2, 445, 26,
                                       "sans", speed=0, tracking=3, glow=0, rise=0))
    texts.append(lambda o: R.text_line(o, t, [("别人嫌她太吵，其实她只是", R.CREAM, 0), ("怕你太冷", R.CORAL, 0)],
                                       w / 2, 1392, 34, "serif6", speed=0, tracking=2, glow=0.25, rise=0))
    img = finish(L, texts, 0.85, ((w / 2 - 20, 700), 620, 0.22))
    img.save(os.path.join(outdir, "cover_3x4.png"))


def cover_landscape(outdir):
    w, h = 1920, 1080
    set_canvas(w, h)
    L = np.zeros((R.OH, R.OW, 3), np.uint8)
    t = T_FREEZE
    texts = []
    R.draw_stars(L, t, R.CREAM, 0.9)
    fireworks(L, [((1180, 230), 0.45, 34, 430), ((1760, 330), 0.55, 28, 360), ((180, 300), 0.6, 24, 300)])
    R.hero(L, t, (600, 1000), 1.04, seed=31.0)
    rng = np.random.default_rng(6)
    for _ in range(60):
        p = (rng.uniform(40, w - 40), rng.uniform(80, 1040))
        R.dot(L, p, rng.uniform(1.6, 3.2), R.WARMS[rng.integers(0, 3)], rng.uniform(0.3, 0.8))
    tx = 1400
    texts.append(lambda o: R.text_line(o, t, [("MBTI 系列", (225, 190, 180), 0)], 64, 60, 22, "sans",
                                       align="l", speed=0, glow=0, rise=0, tracking=4))
    texts.append(lambda o: R.text_line(o, t, [("ENFP", R.CREAM, 0)], tx, 400, 150, "latin",
                                       speed=0, tracking=40, glow=0.45, rise=0))
    texts.append(lambda o: R.text_line(o, t, [("竞选者", R.CREAM, 0)], tx, 565, 150, "serif",
                                       speed=0, tracking=14, glow=0.3, rise=0))
    texts.append(lambda o: R.text_line(o, t, [("其实她只是", R.CREAM, 0), ("怕你太冷", R.CORAL, 0)], tx, 720, 46,
                                       "serif6", speed=0, tracking=3, glow=0.25, rise=0))
    texts.append(lambda o: R.text_line(o, t, [(ACCOUNT, (225, 190, 180), 0)], tx, 800, 28, "sans",
                                       speed=0, tracking=3, glow=0, rise=0))
    img = finish(L, texts, 0.85, ((600, 520), 700, 0.2))
    img.save(os.path.join(outdir, "cover_16x9.png"))


if __name__ == "__main__":
    outdir = sys.argv[1]
    os.makedirs(outdir, exist_ok=True)
    cover_portrait(outdir)
    cover_landscape(outdir)
    print("wrote covers to", outdir)
