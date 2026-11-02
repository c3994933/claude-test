"""《有用的无用》横屏短视频渲染脚本（1920×1080，无配音、无配乐，BGM 后期自己加）。

纯 Python（Pillow + numpy）逐帧绘制，ffmpeg 编码。
运行：
  python3 render.py               -> out/有用的无用_横屏.mp4（无音轨）、out/有用的无用.srt、out/音效_可选.wav
  python3 render.py preview 10 20 -> 只导出指定秒数的预览帧
"""
import math
import os
import random
import subprocess
import sys
import wave

import numpy as np
from PIL import Image, ImageDraw, ImageFont

W, H, FPS = 1920, 1080, 30
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out")
FONT_PATH = "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc"

BG = (18, 22, 36)
YELLOW = (255, 210, 63)
CYAN = (61, 219, 217)
RED = (255, 77, 77)
GREEN = (92, 224, 128)
WHITE = (255, 255, 255)
PAPER = (247, 243, 234)
GREY = (150, 158, 180)
SKIN = (242, 194, 155)

# 左侧插图中心 / 右侧文字中心
LX, RX, CY = 660, 1360, 490

SUBS = [
    (0.3, 4.8, "今天聊一个，有点味道的哲学问题"),
    (5.0, 8.8, "擦屁股的时候，真正用到的，只有纸中间那一小块"),
    (8.9, 12.0, "周围这一圈，几乎全程摸鱼"),
    (12.2, 18.8, "那把它们裁掉，只留中间，岂不是又省又环保？"),
    (19.0, 21.8, "结果……你懂的"),
    (21.9, 25.8, "纸太小，手指一戳就穿"),
    (26.0, 30.2, "原来周围那一圈不是没用，它在兜底"),
    (30.3, 34.8, "它不直接干活，但它让干活的部分，敢放心干活"),
    (35.0, 37.6, "两千多年前，庄子就说过"),
    (37.7, 41.8, "人人都知道有用的用处，却不知道无用的用处"),
    (42.0, 45.8, "杯子能装水，靠的是中间的“空”"),
    (46.0, 49.8, "车轮只压两道印，路却得修这么宽"),
    (50.0, 53.8, "电量从不用到 0%，但最后那 20% 让你不慌"),
    (54.0, 57.8, "日程里的空白，让你接得住意外"),
    (58.0, 62.0, "所以，别急着裁掉生活里“没用”的那一圈"),
    (62.1, 67.0, "它们没在干活，它们在兜底"),
]
DURATION = 68.0

# ---------------------------------------------------------------- 工具
_font_cache = {}


def font(size):
    size = max(8, int(size))
    if size not in _font_cache:
        _font_cache[size] = ImageFont.truetype(FONT_PATH, size)
    return _font_cache[size]


def clamp(x, a=0.0, b=1.0):
    return max(a, min(b, x))


def prog(t, a, b):
    return clamp((t - a) / (b - a)) if b > a else float(t >= a)


def ease_out(x):
    return 1 - (1 - x) ** 3


def ease_in_out(x):
    return 3 * x * x - 2 * x * x * x


def ease_back(x):
    c1, c3 = 1.70158, 2.70158
    return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2 if x > 0 else 0.0


def lerp(a, b, x):
    return a + (b - a) * x


def text(img, xy, s, size, fill=WHITE, stroke=0, stroke_fill=(0, 0, 0), alpha=1.0,
         bold=True, anchor="mm", spacing=14):
    """在 RGBA 图上绘制（可半透明的）文字。bold 用同色描边模拟粗体。"""
    if alpha <= 0.01 or size < 8:
        return
    f = font(size)
    sw = stroke if stroke else (max(1, int(size / 40)) if bold else 0)
    sf = stroke_fill if stroke else fill
    if alpha >= 0.99:
        d = ImageDraw.Draw(img)
        d.multiline_text(xy, s, font=f, fill=fill, anchor=anchor, align="center",
                         stroke_width=sw, stroke_fill=sf, spacing=spacing)
        if stroke and bold:
            d.multiline_text(xy, s, font=f, fill=fill, anchor=anchor, align="center",
                             stroke_width=max(1, int(size / 40)), stroke_fill=fill, spacing=spacing)
        return
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    text(layer, xy, s, size, fill, stroke, stroke_fill, 1.0, bold, anchor, spacing)
    layer.putalpha(layer.getchannel("A").point(lambda v: int(v * alpha)))
    img.alpha_composite(layer)


def overlay(img, draw_fn, alpha=1.0):
    """在独立图层上绘制再按 alpha 合成。"""
    if alpha <= 0.01:
        return
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    draw_fn(ImageDraw.Draw(layer), layer)
    if alpha < 0.99:
        layer.putalpha(layer.getchannel("A").point(lambda v: int(v * alpha)))
    img.alpha_composite(layer)


def rrect(d, box, r, fill=None, outline=None, width=1):
    x0, y0, x1, y1 = box
    if x1 - x0 < 2 or y1 - y0 < 2:
        return
    r = min(r, (x1 - x0) / 2, (y1 - y0) / 2)
    d.rounded_rectangle(box, radius=r, fill=fill, outline=outline, width=width)


def dashed(d, p0, p1, fill, width=4, dash=18, gap=12, phase=0.0):
    x0, y0 = p0
    x1, y1 = p1
    L = math.hypot(x1 - x0, y1 - y0)
    if L == 0:
        return
    ux, uy = (x1 - x0) / L, (y1 - y0) / L
    s = -phase % (dash + gap) - (dash + gap)
    while s < L:
        a, b = max(0, s), min(L, s + dash)
        if b > a:
            d.line([(x0 + ux * a, y0 + uy * a), (x0 + ux * b, y0 + uy * b)], fill=fill, width=width)
        s += dash + gap


def arrow(d, p0, p1, fill, width=6, head=24):
    d.line([p0, p1], fill=fill, width=width)
    ang = math.atan2(p1[1] - p0[1], p1[0] - p0[0])
    for s in (-1, 1):
        a = ang + math.pi + s * 0.45
        d.line([p1, (p1[0] + head * math.cos(a), p1[1] + head * math.sin(a))], fill=fill, width=width)


def tag(img, cx, cy, s, size, bg, fg=(20, 20, 20), alpha=1.0, pad=(26, 14)):
    f = font(size)
    l, _, r, _ = f.getbbox(s)
    w, h = r - l + pad[0] * 2, size + pad[1] * 2

    def fn(d, _):
        rrect(d, (cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2), h / 2, fill=bg)
    overlay(img, fn, alpha)
    text(img, (cx, cy), s, size, fg, alpha=alpha)


def big_title(img, t0_scale, t1_scale, y=470, alpha=1.0):
    """一行大标题：白色“有用的” + 黄色“无用”。"""
    s1, s2 = 190, 250
    f1, f2 = font(s1), font(s2)
    w1, w2 = f1.getlength("有用的"), f2.getlength("无用")
    x0 = W / 2 - (w1 + w2 + 20) / 2
    text(img, (x0 + w1 / 2, y), "有用的", s1 * t0_scale, WHITE, stroke=10, alpha=alpha)
    text(img, (x0 + w1 + 20 + w2 / 2, y - 6), "无用", s2 * t1_scale, YELLOW, stroke=12, alpha=alpha)


# ---------------------------------------------------------------- 背景
def make_background():
    bg = Image.new("RGBA", (W, H), BG + (255,))
    d = ImageDraw.Draw(bg)
    for x in range(0, W + 1, 60):
        d.line([(x, 0), (x, H)], fill=(28, 34, 52), width=2)
    for y in range(0, H + 1, 60):
        d.line([(0, y), (W, y)], fill=(28, 34, 52), width=2)
    yy, xx = np.mgrid[0:H, 0:W]
    r = np.sqrt(((xx - W / 2) / (W * 0.62)) ** 2 + ((yy - H / 2) / (H * 0.75)) ** 2)
    v = np.clip(r - 0.35, 0, 1) * 0.75
    arr = np.array(bg).astype(np.float32)
    arr[..., :3] *= (1 - v)[..., None]
    return Image.fromarray(arr.astype(np.uint8), "RGBA")


# ---------------------------------------------------------------- 元素
def draw_paper(img, cx, cy, w, h, alpha=1.0, emboss=True):
    def fn(d, _):
        rrect(d, (cx - w / 2 + 12, cy - h / 2 + 18, cx + w / 2 + 12, cy + h / 2 + 18), 16, fill=(0, 0, 0, 110))
        rrect(d, (cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2), 16, fill=PAPER)
        if emboss and w > 100:
            step = 36
            nx, ny = int(w // step), int(h // step)
            ox, oy = cx - (nx - 1) * step / 2, cy - (ny - 1) * step / 2
            for i in range(nx):
                for j in range(ny):
                    x, y = ox + i * step, oy + j * step
                    if (i + j) % 2 == 0:
                        d.ellipse((x - 6, y - 6, x + 6, y + 6), outline=(222, 214, 198), width=2)
                    else:
                        d.ellipse((x - 2.5, y - 2.5, x + 2.5, y + 2.5), fill=(226, 219, 204))
        if w > 100:
            for yy in (cy - h / 2 + 18, cy + h / 2 - 18):
                dashed(d, (cx - w / 2 + 16, yy), (cx + w / 2 - 16, yy), (205, 196, 178), width=3, dash=12, gap=9)
    overlay(img, fn, alpha)


def draw_finger(img, tipx, tipy, alpha=1.0, width=90, length=420):
    def fn(d, _):
        x0, x1 = tipx - width / 2, tipx + width / 2
        d.rounded_rectangle((x0 + 8, tipy - length + 16, x1 + 8, tipy + 16), radius=width / 2, fill=(0, 0, 0, 90))
        d.rounded_rectangle((x0, tipy - length, x1, tipy), radius=width / 2, fill=SKIN)
        d.rounded_rectangle((tipx - width * 0.3, tipy - width * 0.95, tipx + width * 0.3, tipy - width * 0.2),
                            radius=width * 0.25, fill=(250, 220, 200), outline=(220, 170, 140), width=3)
        for k in (0.45, 0.72):
            y = tipy - length * k
            d.arc((tipx - width * 0.28, y - 10, tipx + width * 0.28, y + 10), 200, 340, fill=(205, 150, 115), width=4)
    overlay(img, fn, alpha)


# ---------------------------------------------------------------- 场景
PW, PH = 440, 520      # 完整纸巾
SW, SH = 190, 220      # 裁剪后的小纸片
ERX, ERY = 120, 150    # 使用区椭圆


def header(img, t):
    text(img, (W / 2, 46), "有用的无用 · 冷知识研究所", 28, GREY, bold=False)
    p = clamp(t / DURATION)
    d = ImageDraw.Draw(img)
    rrect(d, (160, 78, W - 160, 84), 3, fill=(40, 46, 66))
    if p > 0.003:
        rrect(d, (160, 78, 160 + (W - 320) * p, 84), 3, fill=YELLOW)


def scene_title(img, t):
    out = 1 - prog(t, 4.4, 5.0)
    big_title(img, ease_back(prog(t, 0.1, 0.7)), ease_back(prog(t, 0.45, 1.05)), y=430, alpha=out)
    p3 = ease_out(prog(t, 1.2, 1.9))
    if p3 > 0:
        draw_paper(img, W / 2, lerp(-80, 700, p3), 150, 100, alpha=out, emboss=False)
    text(img, (W / 2, 830), "—— 一个关于擦屁股的哲学问题 ——", 42, GREY,
         alpha=prog(t, 1.9, 2.4) * out, bold=False)


def scene_paper(img, t):
    a = prog(t, 0.0, 0.5) * (1 - prog(t, 6.6, 7.0))
    sc = ease_back(prog(t, 0.0, 0.6))
    pw, ph = PW * sc, PH * sc
    cx, cy = LX, CY
    draw_paper(img, cx, cy, pw, ph, alpha=a)
    p = ease_out(prog(t, 1.0, 1.8))
    if p > 0:
        pulse = 1 + 0.04 * math.sin(t * 6)
        rx, ry = ERX * p * pulse, ERY * p * pulse

        def fn(d, _):
            d.ellipse((cx - rx, cy - ry, cx + rx, cy + ry), fill=YELLOW + (90,), outline=YELLOW, width=7)
        overlay(img, fn, a)
        text(img, (cx, cy), "干活区", 44, (60, 40, 0), alpha=a * prog(t, 1.6, 2.0))
    q = prog(t, 3.9, 4.3)
    if q > 0:
        blink = 0.55 + 0.45 * math.sin((t - 3.9) * 10)
        x0, y0, x1, y1 = cx - pw / 2, cy - ph / 2, cx + pw / 2, cy + ph / 2

        def fn2(d, _):
            for i in range(4):
                o = 5 + i * 2
                d.rounded_rectangle((x0 + o, y0 + o, x1 - o, y1 - o), radius=16, outline=RED + (int(200 * blink),), width=5)
        overlay(img, fn2, a * q)
        for tx, ty in ((cx - 150, cy - 205), (cx + 150, cy + 205), (cx + 155, cy - 190), (cx - 155, cy + 195)):
            tag(img, tx, ty, "摸鱼", 30, RED, WHITE, alpha=a * q)

    # 右侧：占比条形图
    def bar(y, label, pct, col, k, al):
        text(img, (RX - 300, y - 50), label, 46, col, alpha=al, anchor="lm")
        text(img, (RX + 300, y - 50), f"{int(pct * k)}%", 46, col, alpha=al, anchor="rm")

        def fn3(d, _):
            rrect(d, (RX - 300, y - 14, RX + 300, y + 14), 14, fill=(40, 46, 66))
            if k > 0.01:
                rrect(d, (RX - 300, y - 14, RX - 300 + 600 * pct / 100 * k, y + 14), 14, fill=col)
        overlay(img, fn3, al)
    bar(390, "真正干活", 30, YELLOW, ease_out(prog(t, 1.6, 2.6)), a * prog(t, 1.4, 1.8))
    bar(590, "全程摸鱼", 70, RED, ease_out(prog(t, 4.0, 5.0)), a * prog(t, 3.8, 4.2))


def scene_cut(img, t):
    cx, cy = LX, CY
    fall = ease_in_out(prog(t, 3.2, 4.4))
    fade_out = 1 - prog(t, 6.6, 7.0)
    a = prog(t, 0.0, 0.3) * fade_out
    if fall < 1:
        offs = fall * 700
        parts = [
            (cx, cy - (PH + SH) / 4 - offs, PW, (PH - SH) / 2),
            (cx, cy + (PH + SH) / 4 + offs, PW, (PH - SH) / 2),
            (cx - (PW + SW) / 4 - offs, cy, (PW - SW) / 2, SH),
            (cx + (PW + SW) / 4 + offs, cy, (PW - SW) / 2, SH),
        ]
        for x, y, w, h in parts:
            draw_paper(img, x, y, w, h, alpha=a * (1 - fall), emboss=False)
    draw_paper(img, cx, cy, SW, SH, alpha=a)
    cut = prog(t, 0.8, 3.0)
    if fall < 0.2 and cut > 0:
        pts = [(cx - SW / 2, cy - SH / 2), (cx + SW / 2, cy - SH / 2), (cx + SW / 2, cy + SH / 2),
               (cx - SW / 2, cy + SH / 2), (cx - SW / 2, cy - SH / 2)]

        def fn(d, _):
            rem = cut * 2 * (SW + SH)
            head = pts[0]
            for i in range(4):
                p0, p1 = pts[i], pts[i + 1]
                seg = math.hypot(p1[0] - p0[0], p1[1] - p0[1])
                k = clamp(rem / seg)
                e = (lerp(p0[0], p1[0], k), lerp(p0[1], p1[1], k))
                dashed(d, p0, e, RED, width=5, dash=16, gap=10)
                if k > 0:
                    head = e
                rem -= seg
                if rem <= 0:
                    break
            hx, hy = head
            ang = math.sin(t * 30) * 0.35
            for s in (-1, 1):
                a2 = ang * s
                d.line([(hx, hy), (hx - 75 * math.cos(a2 + 0.3 * s), hy - 75 * math.sin(a2 + 0.3 * s))], fill=WHITE, width=8)
                ex, ey = hx - 100 * math.cos(a2 + 0.4 * s), hy - 100 * math.sin(a2 + 0.4 * s)
                d.ellipse((ex - 22, ey - 22, ex + 22, ey + 22), outline=CYAN, width=8)
        overlay(img, fn, a * (1 - fall * 5))
    tp = ease_back(prog(t, 4.5, 5.0))
    text(img, (RX, 430), "又省又环保", 110 * tp, GREEN, stroke=6, alpha=fade_out)
    text(img, (RX, 580), "√ 节省 70% 纸巾", 52, GREEN, alpha=fade_out * prog(t, 5.0, 5.4))
    text(img, (RX, 200), "裁 掉 摸 鱼 区", 56, WHITE, alpha=fade_out * prog(t, 0.5, 0.9) * (1 - prog(t, 4.2, 4.5)))


def scene_fail(img, t):
    cx, cy = LX, CY
    a = prog(t, 0, 0.2) * (1 - prog(t, 6.6, 7.0))
    poke = ease_in_out(prog(t, 0.6, 1.6))
    torn = t > 1.6
    draw_paper(img, cx, cy, SW, SH, alpha=a)
    if torn:
        def fn(d, _):
            rnd = random.Random(7)
            pts = []
            for i in range(14):
                ang = i / 14 * math.tau
                rr = 48 * (0.7 + 0.5 * rnd.random())
                pts.append((cx + rr * math.cos(ang), cy + 30 + rr * math.sin(ang)))
            d.polygon(pts, fill=BG)
            d.line(pts + [pts[0]], fill=(200, 190, 170), width=4)
        overlay(img, fn, a)
    draw_finger(img, cx, lerp(110, cy + 80, poke), alpha=a)
    if torn:
        flash = max(0.0, 1 - (t - 1.6) * 2.5)
        if flash > 0:
            overlay(img, lambda d, _: d.rectangle((0, 0, W, H), fill=RED + (int(120 * flash),)), 1)
        text(img, (RX, 440), "翻 车 了", 170 * ease_back(prog(t, 1.6, 1.9)), RED, stroke=10, stroke_fill=WHITE, alpha=a)
        text(img, (RX, 620), "! 穿透警告 !", 56, YELLOW, alpha=a * prog(t, 2.2, 2.5))


def scene_reveal(img, t):
    cx, cy = LX, CY
    a = prog(t, 0, 0.4) * (1 - prog(t, 8.6, 9.0))
    grow = ease_back(prog(t, 0.0, 0.8))
    pw, ph = lerp(SW, PW, grow), lerp(SH, PH, grow)
    draw_paper(img, cx, cy, pw, ph, alpha=a)
    q = ease_out(prog(t, 1.0, 1.6))

    def ring(d, _):
        x0, y0, x1, y1 = cx - pw / 2, cy - ph / 2, cx + pw / 2, cy + ph / 2
        d.rounded_rectangle((x0, y0, x1, y1), radius=16, fill=CYAN + (70,))
        d.ellipse((cx - ERX, cy - ERY, cx + ERX, cy + ERY), fill=PAPER)
        d.ellipse((cx - ERX, cy - ERY, cx + ERX, cy + ERY), fill=YELLOW + (110,), outline=YELLOW, width=7)
        d.rounded_rectangle((x0, y0, x1, y1), radius=16, outline=CYAN, width=7)
    overlay(img, ring, a * q)
    text(img, (cx, cy), "有用", 70, (70, 50, 0), alpha=a * q)
    text(img, (cx, cy - ph / 2 + 44), "有用的无用", 36, (10, 70, 80), alpha=a * prog(t, 1.6, 2.0))
    # 右侧三个关键词 + 指向外圈的箭头
    for i, s in enumerate(["缓冲", "容错", "安全感"]):
        y = 300 + i * 190
        k = ease_back(prog(t, 4.3 + i * 0.4, 4.8 + i * 0.4))
        text(img, (RX + 60, y), s, 96 * k, CYAN, stroke=5, alpha=a)

        def arr(d, _, y=y, i=i):
            arrow(d, (RX - 120, y), (cx + pw / 2 + 20, cy + (i - 1) * 180), CYAN + (200,), width=5)
        overlay(img, arr, a * prog(t, 4.6 + i * 0.4, 5.0 + i * 0.4))
    text(img, (RX + 60, 160), "外 圈 在 干 嘛 ？", 44, GREY, alpha=a * prog(t, 2.0, 2.4) * (1 - prog(t, 4.0, 4.3)), bold=False)


def scene_quote(img, t):
    a = prog(t, 0, 0.4) * (1 - prog(t, 6.6, 7.0))
    text(img, (W / 2, 220), "庄子", 110 * ease_back(prog(t, 0.0, 0.6)), YELLOW, stroke=8, alpha=a)
    text(img, (W / 2, 320), "《人间世》", 42, GREY, alpha=a * prog(t, 0.5, 0.9), bold=False)
    full1, full2 = "人皆知有用之用，", "而莫知无用之用也。"
    n = int(prog(t, 1.2, 4.0) * (len(full1) + len(full2)))
    text(img, (W / 2, 500), full1[:n], 84, WHITE, alpha=a)
    text(img, (W / 2, 630), full2[:max(0, n - len(full1))], 84, WHITE, alpha=a)
    if n >= len(full1) + len(full2):
        k = ease_out(prog(t, 4.2, 4.8))
        f = font(84)
        x0 = W / 2 - f.getlength(full2) / 2 + f.getlength("而莫知")
        x1 = x0 + f.getlength("无用之用")
        overlay(img, lambda d, _: d.line([(x0, 690), (lerp(x0, x1, k), 690)], fill=YELLOW, width=10), a)
    text(img, (430, 430), "“", 220, (60, 68, 96), alpha=a)
    text(img, (1490, 700), "”", 220, (60, 68, 96), alpha=a)


def card_text(img, t, idx, title, line1, line2, a, col=WHITE):
    s = ease_back(prog(t, 0, 0.5))
    text(img, (RX, 250), f"No.{idx} / 4", 40, GREY, alpha=a, bold=False)
    text(img, (RX, 360), title, 120 * s, WHITE, stroke=6, alpha=a)
    text(img, (RX, 540), line1, 56, col, alpha=a * prog(t, 1.4, 1.8))
    text(img, (RX, 630), line2, 40, GREY, alpha=a * prog(t, 2.2, 2.6), bold=False)


def scene_cup(img, t):
    a = prog(t, 0, 0.3) * (1 - prog(t, 3.7, 4.0))
    card_text(img, t, 1, "杯子", "装水靠的是“空”", "当其无，有器之用 —— 老子", a, CYAN)
    cx, top, bot = LX, 250, 730
    lvl = ease_out(prog(t, 0.6, 2.4))

    def fn(d, _):
        wy = lerp(bot - 16, top + 70, lvl)
        k0 = (wy - top) / (bot - top)
        wl = lerp(210, 150, k0)
        d.polygon([(cx - wl, wy), (cx + wl, wy), (cx + 150, bot - 16), (cx - 150, bot - 16)], fill=CYAN + (170,))
        d.line([(cx - 210, top), (cx - 150, bot), (cx + 150, bot), (cx + 210, top)], fill=WHITE, width=12, joint="curve")
        d.arc((cx + 175, top + 100, cx + 310, top + 290), 270, 90, fill=WHITE, width=12)
    overlay(img, fn, a)
    tag(img, cx, 470, "空", 64, YELLOW, (40, 30, 0), alpha=a * prog(t, 2.4, 2.8))


def scene_road(img, t):
    a = prog(t, 0, 0.3) * (1 - prog(t, 3.7, 4.0))
    card_text(img, t, 2, "马路", "轮子只压两道印", "路却得修这么宽", a, YELLOW)
    cx, top, bot = LX, 200, 800
    p = ease_out(prog(t, 0.4, 1.0))

    def fn(d, _):
        d.polygon([(cx - 100, top), (cx + 100, top), (cx + 380, bot), (cx - 380, bot)], fill=(70, 76, 96))
        dashed(d, (cx, top), (cx, bot), WHITE, width=7, dash=36, gap=26, phase=t * 160)
        d.line([(cx - 100, top), (cx - 380, bot)], fill=WHITE, width=5)
        d.line([(cx + 100, top), (cx + 380, bot)], fill=WHITE, width=5)
        for o0, o1 in ((-48, -180), (-14, -60)):
            d.line([(cx + o0, top), (lerp(cx + o0, cx + o1, p), lerp(top, bot, p))], fill=YELLOW, width=14)
    overlay(img, fn, a)
    q = prog(t, 1.5, 1.9)
    tag(img, cx - 130, 840, "压到的", 34, YELLOW, (40, 30, 0), alpha=a * q)
    tag(img, cx + 200, 560, "没压到的", 34, CYAN, (10, 30, 40), alpha=a * q)


def scene_battery(img, t):
    a = prog(t, 0, 0.3) * (1 - prog(t, 3.7, 4.0))
    card_text(img, t, 3, "电量", "最后 20% = 安全感", "你从来不会真的用到 0%", a, GREEN)
    cx, cy, bw, bh = LX, 450, 520, 240
    lvl = lerp(1.0, 0.2, ease_in_out(prog(t, 0.4, 2.0)))
    col = GREEN if lvl > 0.21 or int(t * 4) % 2 else (60, 160, 90)

    def fn(d, _):
        d.rounded_rectangle((cx - bw / 2, cy - bh / 2, cx + bw / 2, cy + bh / 2), radius=30, outline=WHITE, width=12)
        d.rounded_rectangle((cx + bw / 2 + 6, cy - 50, cx + bw / 2 + 40, cy + 50), radius=10, fill=WHITE)
        iw = bw - 50
        d.rounded_rectangle((cx - iw / 2, cy - bh / 2 + 25, cx - iw / 2 + iw * lvl, cy + bh / 2 - 25), radius=14, fill=col)
    overlay(img, fn, a)
    text(img, (cx, cy + bh / 2 + 80), f"{int(round(lvl * 100))}%", 84, WHITE, alpha=a)


def scene_calendar(img, t):
    a = prog(t, 0, 0.3) * (1 - prog(t, 3.7, 4.0))
    card_text(img, t, 4, "日程", "空白，是留给意外的座位", "排满的日程，接不住任何变化", a, CYAN)
    cw, ch, gap = 140, 96, 16
    x0, y0 = LX - (4 * cw + 3 * gap) / 2, 250
    filled = {(0, 0), (1, 0), (3, 0), (0, 1), (2, 1), (3, 1), (1, 2), (2, 2), (0, 3), (3, 3), (2, 3)}
    colors = [(118, 132, 255), (255, 150, 90), (200, 120, 230)]
    fly = ease_out(prog(t, 1.2, 2.2))
    tx, ty = x0 + (cw + gap), y0 + (ch + gap)
    fx, fy = lerp(W / 2 + 200, tx, fly), lerp(120, ty, fly)

    def fn(d, _):
        for r in range(4):
            for c in range(4):
                bx, by = x0 + c * (cw + gap), y0 + r * (ch + gap)
                if (c, r) in filled:
                    d.rounded_rectangle((bx, by, bx + cw, by + ch), radius=16, fill=colors[(r + c) % 3])
                else:
                    d.rounded_rectangle((bx, by, bx + cw, by + ch), radius=16, outline=GREY, width=4)
        d.rounded_rectangle((fx, fy, fx + cw, fy + ch), radius=16, fill=RED)
    overlay(img, fn, a)
    text(img, (fx + cw / 2, fy + ch / 2), "意外", 40, WHITE, alpha=a)


def scene_end(img, t):
    a = prog(t, 0, 0.4)
    s = ease_back(prog(t, 0, 0.7))
    cx, cy = W / 2, CY
    pw, ph = PW * 0.8 * s, PH * 0.8 * s
    pa = a * (1 - prog(t, 4.0, 4.6))
    draw_paper(img, cx, cy, pw, ph, alpha=pa)

    def ring(d, _):
        d.rounded_rectangle((cx - pw / 2, cy - ph / 2, cx + pw / 2, cy + ph / 2), radius=16, outline=CYAN, width=7)
        d.ellipse((cx - ERX * 0.8 * s, cy - ERY * 0.8 * s, cx + ERX * 0.8 * s, cy + ERY * 0.8 * s), outline=YELLOW, width=7)
    overlay(img, ring, pa)
    big_title(img, ease_back(prog(t, 4.4, 5.0)), ease_back(prog(t, 4.7, 5.3)), y=400)
    tag(img, W / 2, 680, "你身边还有哪些“有用的无用”？", 46, CYAN, (10, 30, 40), alpha=prog(t, 6.0, 6.5))
    text(img, (W / 2, 780), "评论区见", 42, GREY, alpha=prog(t, 6.4, 6.9), bold=False)


TIMELINE = [
    (0.0, 5.0, scene_title),
    (5.0, 12.0, scene_paper),
    (12.0, 19.0, scene_cut),
    (19.0, 26.0, scene_fail),
    (26.0, 35.0, scene_reveal),
    (35.0, 42.0, scene_quote),
    (42.0, 46.0, scene_cup),
    (46.0, 50.0, scene_road),
    (50.0, 54.0, scene_battery),
    (54.0, 58.0, scene_calendar),
    (58.0, DURATION, scene_end),
]


def subtitle(img, t):
    for a, b, s in SUBS:
        if a <= t < b:
            al = prog(t, a, a + 0.15) * (1 - prog(t, b - 0.12, b))
            w = font(50).getlength(s)
            cy = 975

            def fn(d, _):
                d.rounded_rectangle((W / 2 - w / 2 - 36, cy - 44, W / 2 + w / 2 + 36, cy + 44),
                                    radius=22, fill=(0, 0, 0, 150))
            overlay(img, fn, al)
            text(img, (W / 2, cy), s, 50, WHITE, alpha=al)
            break


def render_frame(bg, t):
    img = bg.copy()
    for a, b, fn in TIMELINE:
        if a <= t < b:
            fn(img, t - a)
    header(img, t)
    subtitle(img, t)
    if 20.6 <= t < 21.4:  # 翻车时屏幕抖动
        k = 1 - (t - 20.6) / 0.8
        dx, dy = int(math.sin(t * 90) * 22 * k), int(math.cos(t * 77) * 18 * k)
        shaken = Image.new("RGBA", (W, H), BG + (255,))
        shaken.paste(img, (dx, dy))
        img = shaken
    return img.convert("RGB")


# ---------------------------------------------------------------- 可选音效轨（不含音乐）
SR = 44100


def synth_sfx(path):
    n = int(DURATION * SR)
    mix = np.zeros(n)
    rng = np.random.default_rng(1)

    def add(sig, start, gain=1.0):
        i = int(start * SR)
        j = min(n, i + len(sig))
        if i < n:
            mix[i:j] += sig[: j - i] * gain

    def xs(L):
        return np.arange(int(L * SR)) / SR

    def noise(L, r, hp=True):
        s = rng.standard_normal(int(L * SR))
        if hp:
            s = np.diff(s, prepend=0)
        x = xs(L)
        return s * np.minimum(1, x / 0.001) * np.exp(-x / r)

    def whoosh(L=0.45):
        s = np.convolve(rng.standard_normal(int(L * SR)), np.ones(20) / 20, mode="same")
        return s * np.sin(np.pi * xs(L) / L) ** 2 * 3

    def pop():
        x = xs(0.12)
        return np.sin(2 * np.pi * np.cumsum(900 * np.exp(-x * 25) + 300) / SR) * np.exp(-x * 30)

    def ding(f):
        x = xs(1.2)
        return (np.sin(2 * np.pi * f * x) + 0.5 * np.sin(4 * np.pi * f * x)) * np.minimum(1, x / 0.002) * np.exp(-x / 0.45)

    def boom():
        x = xs(1.2)
        return np.sin(2 * np.pi * np.cumsum(80 * np.exp(-x * 3) + 30) / SR) * np.exp(-x * 2.5) + noise(1.2, 0.15, False) * 0.3

    for s in (5.0, 12.0, 26.0, 35.0, 42.0, 46.0, 50.0, 54.0, 58.0):
        add(whoosh(), s - 0.2, 0.18)
    for s in (0.15, 0.5, 6.1, 9.0, 16.6, 30.3, 30.7, 31.1, 35.05, 42.1, 46.1, 50.1, 54.1, 62.4, 62.7):
        add(pop(), s, 0.25)
    for k in range(18):
        add(noise(0.06, 0.012) * 1.5, 12.8 + k * 0.12, 0.35)
    add(boom(), 20.6, 0.9)
    for s, f in ((27.0, 1318.5), (39.2, 1568.0), (44.4, 1046.5), (52.1, 1318.5), (56.3, 1568.0), (64.0, 2093.0)):
        add(ding(f), s, 0.22)
    pcm = (np.tanh(mix * 1.2) * 0.85 * 32767).astype(np.int16)
    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(np.stack([pcm, pcm], axis=1).tobytes())


def write_srt(path):
    def ts(x):
        ms = int(round(x * 1000))
        h, ms = divmod(ms, 3600000)
        m, ms = divmod(ms, 60000)
        s, ms = divmod(ms, 1000)
        return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"
    with open(path, "w", encoding="utf-8") as f:
        for i, (a, b, s) in enumerate(SUBS, 1):
            f.write(f"{i}\n{ts(a)} --> {ts(b)}\n{s}\n\n")


def main():
    os.makedirs(OUT, exist_ok=True)
    bg = make_background()
    if len(sys.argv) > 1 and sys.argv[1] == "preview":
        for t in map(float, sys.argv[2:]):
            render_frame(bg, t).save(os.path.join(OUT, f"preview_{t:05.1f}.png"))
        return
    wav = os.path.join(OUT, "sfx.wav")
    synth_sfx(wav)
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", wav, "-c:a", "aac", "-b:a", "160k",
                    os.path.join(OUT, "音效_可选.m4a")], check=True)
    os.remove(wav)
    write_srt(os.path.join(OUT, "有用的无用.srt"))
    mp4 = os.path.join(OUT, "有用的无用_横屏.mp4")
    cmd = ["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}",
           "-r", str(FPS), "-i", "-", "-c:v", "libx264", "-preset", "medium", "-crf", "20",
           "-pix_fmt", "yuv420p", "-movflags", "+faststart", mp4]
    p = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    nf = int(DURATION * FPS)
    for i in range(nf):
        p.stdin.write(render_frame(bg, i / FPS).tobytes())
        if i % 300 == 0:
            print(f"frame {i}/{nf}", flush=True)
    p.stdin.close()
    p.wait()
    print("done:", mp4)


if __name__ == "__main__":
    main()
