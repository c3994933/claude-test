"""《有用的无用》竖屏短视频渲染脚本。

纯 Python（Pillow + numpy）逐帧绘制画面，numpy 合成背景音乐与音效，ffmpeg 合成 mp4。
运行：python3 render.py  -> 输出 out/有用的无用.mp4 与 out/有用的无用.srt
"""
import math
import os
import random
import subprocess
import wave

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H, FPS = 1080, 1920, 30
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

# ---------------------------------------------------------------- 时间轴
# 场景: (开始, 结束, 函数名)
SCENES = []
# 字幕: (开始, 结束, 文本)
SUBS = [
    (0.3, 4.8, "今天聊一个，有点味道的哲学问题"),
    (5.0, 8.8, "擦屁股的时候，真正用到的\n只有纸中间那一小块"),
    (8.9, 12.0, "周围这一圈，几乎全程摸鱼"),
    (12.2, 18.8, "那把它们裁掉，只留中间\n岂不是又省又环保？"),
    (19.0, 21.8, "结果……你懂的"),
    (21.9, 25.8, "纸太小，手指一戳就穿"),
    (26.0, 30.2, "原来周围那一圈不是没用\n它在兜底"),
    (30.3, 34.8, "它不直接干活\n但它让干活的部分，敢放心干活"),
    (35.0, 37.6, "两千多年前，庄子就说过"),
    (37.7, 41.8, "人人都知道有用的用处\n却不知道无用的用处"),
    (42.0, 45.8, "杯子能装水，靠的是中间的“空”"),
    (46.0, 49.8, "车轮只压两道印\n路却得修这么宽"),
    (50.0, 53.8, "电量从不用到 0%\n但最后那 20% 让你不慌"),
    (54.0, 57.8, "日程里的空白\n让你接得住意外"),
    (58.0, 62.0, "所以，别急着裁掉\n生活里“没用”的那一圈"),
    (62.1, 67.0, "它们没在干活\n它们在兜底"),
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
    a = layer.getchannel("A").point(lambda v: int(v * alpha))
    layer.putalpha(a)
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
    s = -phase % (dash + gap)
    s -= dash + gap
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
    l, t, r, b = f.getbbox(s)
    w, h = r - l + pad[0] * 2, size + pad[1] * 2

    def fn(d, _):
        rrect(d, (cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2), h / 2, fill=bg)
    overlay(img, fn, alpha)
    text(img, (cx, cy), s, size, fg, alpha=alpha)


# ---------------------------------------------------------------- 背景
def make_background():
    bg = Image.new("RGBA", (W, H), BG + (255,))
    d = ImageDraw.Draw(bg)
    for x in range(0, W + 1, 60):
        d.line([(x, 0), (x, H)], fill=(28, 34, 52), width=2)
    for y in range(0, H + 1, 60):
        d.line([(0, y), (W, y)], fill=(28, 34, 52), width=2)
    # 暗角
    yy, xx = np.mgrid[0:H, 0:W]
    r = np.sqrt(((xx - W / 2) / (W * 0.75)) ** 2 + ((yy - H / 2) / (H * 0.62)) ** 2)
    v = np.clip(r - 0.35, 0, 1) * 0.75
    arr = np.array(bg).astype(np.float32)
    arr[..., :3] *= (1 - v)[..., None]
    return Image.fromarray(arr.astype(np.uint8), "RGBA")


# ---------------------------------------------------------------- 元素：卫生纸
def draw_paper(img, cx, cy, w, h, alpha=1.0, tint=None, emboss=True, rot_tear=0.0):
    def fn(d, layer):
        # 阴影
        rrect(d, (cx - w / 2 + 14, cy - h / 2 + 22, cx + w / 2 + 14, cy + h / 2 + 22), 18, fill=(0, 0, 0, 110))
        rrect(d, (cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2), 18, fill=PAPER)
        if emboss and w > 120:
            step = 46
            nx = int(w // step)
            ny = int(h // step)
            ox = cx - (nx - 1) * step / 2
            oy = cy - (ny - 1) * step / 2
            for i in range(nx):
                for j in range(ny):
                    x, y = ox + i * step, oy + j * step
                    if (i + j) % 2 == 0:
                        d.ellipse((x - 7, y - 7, x + 7, y + 7), outline=(222, 214, 198), width=3)
                    else:
                        d.ellipse((x - 3, y - 3, x + 3, y + 3), fill=(226, 219, 204))
        if w > 120:
            for yy in (cy - h / 2 + 22, cy + h / 2 - 22):
                dashed(d, (cx - w / 2 + 20, yy), (cx + w / 2 - 20, yy), (205, 196, 178), width=4, dash=14, gap=10)
        if tint:
            rrect(d, (cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2), 18, fill=tint)
    overlay(img, fn, alpha)


def draw_finger(img, tipx, tipy, alpha=1.0, width=120, length=520):
    def fn(d, _):
        x0, x1 = tipx - width / 2, tipx + width / 2
        d.rounded_rectangle((x0 + 10, tipy - length + 20, x1 + 10, tipy + 20), radius=width / 2, fill=(0, 0, 0, 90))
        d.rounded_rectangle((x0, tipy - length, x1, tipy), radius=width / 2, fill=SKIN)
        # 指甲
        d.rounded_rectangle((tipx - width * 0.3, tipy - width * 0.95, tipx + width * 0.3, tipy - width * 0.2),
                            radius=width * 0.25, fill=(250, 220, 200), outline=(220, 170, 140), width=3)
        # 关节纹
        for k in (0.45, 0.72):
            y = tipy - length * k
            d.arc((tipx - width * 0.28, y - 12, tipx + width * 0.28, y + 12), 200, 340, fill=(205, 150, 115), width=4)
    overlay(img, fn, alpha)


# ---------------------------------------------------------------- 场景
def header(img, t):
    # 顶部栏目标识 + 进度条
    text(img, (W / 2, 150), "有用的无用 · 冷知识研究所", 34, GREY, bold=False)
    p = clamp(t / DURATION)
    d = ImageDraw.Draw(img)
    rrect(d, (90, 196, W - 90, 204), 4, fill=(40, 46, 66))
    if p > 0.005:
        rrect(d, (90, 196, 90 + (W - 180) * p, 204), 4, fill=YELLOW)


def scene_title(img, t):
    # 0 - 5s
    p = ease_back(prog(t, 0.1, 0.7))
    out = 1 - prog(t, 4.4, 5.0)
    s = 190 * p
    text(img, (W / 2, 760), "有用的", s, WHITE, stroke=10, stroke_fill=(0, 0, 0), alpha=out)
    p2 = ease_back(prog(t, 0.45, 1.05))
    text(img, (W / 2, 990), "无用", 260 * p2, YELLOW, stroke=12, stroke_fill=(0, 0, 0), alpha=out)
    # 小卷纸图标掉落
    p3 = ease_out(prog(t, 1.2, 1.9))
    if p3 > 0:
        y = lerp(300, 1190, p3)
        draw_paper(img, W / 2, y, 180, 120, alpha=out, emboss=False)
    a4 = prog(t, 1.9, 2.4) * out
    text(img, (W / 2, 1330), "—— 一个关于擦屁股的哲学问题 ——", 46, GREY, alpha=a4, bold=False)


def scene_paper(img, t):
    # 5 - 12s：纸 + 使用区 + 摸鱼区
    a = prog(t, 0.0, 0.5) * (1 - prog(t, 6.6, 7.0))
    sc = ease_back(prog(t, 0.0, 0.6))
    pw, ph = 700 * sc, 820 * sc
    cx, cy = W / 2, 820
    draw_paper(img, cx, cy, pw, ph, alpha=a)
    # 使用区高亮
    p = ease_out(prog(t, 1.0, 1.8))
    if p > 0:
        rx, ry = 190 * p, 230 * p
        pulse = 1 + 0.04 * math.sin(t * 6)

        def fn(d, _):
            d.ellipse((cx - rx * pulse, cy - ry * pulse, cx + rx * pulse, cy + ry * pulse),
                      fill=YELLOW + (90,), outline=YELLOW, width=8)
        overlay(img, fn, a)
        text(img, (cx, cy - 20), "真正干活", 58, (60, 40, 0), alpha=a * prog(t, 1.6, 2.0))
        text(img, (cx, cy + 50), "≈ 30%", 52, (60, 40, 0), alpha=a * prog(t, 1.8, 2.2))
    # 摸鱼区闪烁
    q = prog(t, 3.9, 4.3)
    if q > 0:
        blink = 0.55 + 0.45 * math.sin((t - 3.9) * 10)
        x0, y0, x1, y1 = cx - pw / 2, cy - ph / 2, cx + pw / 2, cy + ph / 2

        def fn2(d, _):
            for i in range(4):
                o = 6 + i * 2
                d.rounded_rectangle((x0 + o, y0 + o, x1 - o, y1 - o), radius=18, outline=RED + (int(200 * blink),), width=6)
        overlay(img, fn2, a * q)
        for (tx, ty) in ((cx - 250, cy - 330), (cx + 250, cy + 330), (cx + 255, cy - 300), (cx - 255, cy + 310)):
            tag(img, tx, ty, "摸鱼", 40, RED, WHITE, alpha=a * q)


def scene_cut(img, t):
    # 12 - 19s：剪掉摸鱼区
    cx, cy = W / 2, 820
    pw, ph = 700, 820
    sw, sh = 300, 340  # 剩下的小纸片
    a_in = prog(t, 0.0, 0.3)
    cut = prog(t, 0.8, 3.0)       # 剪刀沿虚线走
    fall = ease_in_out(prog(t, 3.2, 4.4))  # 边角飞走
    fade_out = 1 - prog(t, 6.6, 7.0)
    a = a_in * fade_out
    if fall < 1:
        # 四条边分别飞走
        offs = fall * 900
        parts = [
            (cx, cy - (ph + sh) / 4 - offs, pw, (ph - sh) / 2),          # 上
            (cx, cy + (ph + sh) / 4 + offs, pw, (ph - sh) / 2),          # 下
            (cx - (pw + sw) / 4 - offs, cy, (pw - sw) / 2, sh),          # 左
            (cx + (pw + sw) / 4 + offs, cy, (pw - sw) / 2, sh),          # 右
        ]
        for (x, y, w, h) in parts:
            draw_paper(img, x, y, w, h, alpha=a * (1 - fall), emboss=False)
    draw_paper(img, cx, cy, sw, sh, alpha=a, emboss=True)
    # 裁剪虚线与剪刀
    if fall < 0.2 and cut > 0:
        L = 2 * (sw + sh)
        prog_len = cut * L
        pts = [(cx - sw / 2, cy - sh / 2), (cx + sw / 2, cy - sh / 2), (cx + sw / 2, cy + sh / 2),
               (cx - sw / 2, cy + sh / 2), (cx - sw / 2, cy - sh / 2)]

        def fn(d, _):
            rem = prog_len
            head = pts[0]
            for i in range(4):
                p0, p1 = pts[i], pts[i + 1]
                seg = math.hypot(p1[0] - p0[0], p1[1] - p0[1])
                k = clamp(rem / seg)
                e = (lerp(p0[0], p1[0], k), lerp(p0[1], p1[1], k))
                dashed(d, p0, e, RED, width=6, dash=20, gap=12)
                if k > 0:
                    head = e
                rem -= seg
                if rem <= 0:
                    break
            # 剪刀
            hx, hy = head
            ang = math.sin(t * 30) * 0.35
            for s in (-1, 1):
                a2 = ang * s
                d.line([(hx, hy), (hx - 90 * math.cos(a2 + 0.3 * s), hy - 90 * math.sin(a2 + 0.3 * s))], fill=WHITE, width=10)
                ex, ey = hx - 120 * math.cos(a2 + 0.4 * s), hy - 120 * math.sin(a2 + 0.4 * s)
                d.ellipse((ex - 26, ey - 26, ex + 26, ey + 26), outline=CYAN, width=9)
        overlay(img, fn, a * (1 - fall * 5))
    # 文字
    tp = ease_back(prog(t, 4.5, 5.0))
    text(img, (cx, 1160), "又省又环保", 80 * tp, GREEN, stroke=6, alpha=fade_out)
    text(img, (cx, 470), "√ 节省 70%", 54, GREEN, alpha=fade_out * prog(t, 5.0, 5.4))


def scene_fail(img, t):
    # 19 - 26s：手指戳穿
    cx, cy = W / 2, 820
    sw, sh = 300, 340
    a = prog(t, 0, 0.2) * (1 - prog(t, 6.6, 7.0))
    poke = ease_in_out(prog(t, 0.6, 1.6))
    torn = t > 1.6
    draw_paper(img, cx, cy, sw, sh, alpha=a)
    if torn:
        # 破洞
        def fn(d, _):
            r = 70
            pts = []
            rnd = random.Random(7)
            for i in range(14):
                ang = i / 14 * math.tau
                rr = r * (0.7 + 0.5 * rnd.random())
                pts.append((cx + rr * math.cos(ang), cy + 40 + rr * math.sin(ang)))
            d.polygon(pts, fill=BG)
            d.line(pts + [pts[0]], fill=(200, 190, 170), width=4)
        overlay(img, fn, a)
    tipy = lerp(260, cy + 110, poke)
    draw_finger(img, cx, tipy, alpha=a)
    if torn:
        # 红色警报 + 大字
        k = prog(t, 1.6, 1.9)
        flash = max(0.0, 1 - (t - 1.6) * 2.5)

        def fn2(d, _):
            d.rectangle((0, 0, W, H), fill=RED + (int(120 * flash),))
        overlay(img, fn2, 1)
        s = ease_back(k)
        text(img, (cx, 1180), "翻 车 了", 150 * s, RED, stroke=10, stroke_fill=WHITE, alpha=a)
        text(img, (cx, 430), "⚠ 穿透警告 ⚠" if False else "! 穿透警告 !", 62, YELLOW, alpha=a * prog(t, 2.2, 2.5))


def scene_reveal(img, t):
    # 26 - 35s：周围那圈 = 有用的无用
    cx, cy = W / 2, 800
    a = prog(t, 0, 0.4) * (1 - prog(t, 8.6, 9.0))
    grow = ease_back(prog(t, 0.0, 0.8))
    pw, ph = lerp(300, 700, grow), lerp(340, 820, grow)
    draw_paper(img, cx, cy, pw, ph, alpha=a)
    # 外圈青色
    q = ease_out(prog(t, 1.0, 1.6))

    def ring(d, _):
        x0, y0, x1, y1 = cx - pw / 2, cy - ph / 2, cx + pw / 2, cy + ph / 2
        d.rounded_rectangle((x0, y0, x1, y1), radius=18, fill=CYAN + (70,))
        d.ellipse((cx - 190, cy - 230, cx + 190, cy + 230), fill=PAPER)
        d.ellipse((cx - 190, cy - 230, cx + 190, cy + 230), fill=YELLOW + (110,), outline=YELLOW, width=8)
        d.rounded_rectangle((x0, y0, x1, y1), radius=18, outline=CYAN, width=8)
    overlay(img, ring, a * q)
    text(img, (cx, cy), "有用", 84, (70, 50, 0), alpha=a * q)
    # 标签
    r = prog(t, 1.6, 2.0)
    tag(img, cx, cy - ph / 2 - 70, "有用的无用", 52, CYAN, (10, 30, 40), alpha=a * r)
    labels = ["缓冲", "容错", "安全感"]
    for i, s in enumerate(labels):
        k = ease_back(prog(t, 4.3 + i * 0.4, 4.8 + i * 0.4))
        x = cx + (i - 1) * 290
        text(img, (x, 1330), s, 72 * k, CYAN, stroke=5, alpha=a)
    def arrows(d, _):
        for i in range(3):
            x = cx + (i - 1) * 290
            arrow(d, (x, 1280), (lerp(x, cx + (i - 1) * 240, 1), cy + ph / 2 - 10), CYAN + (200,), width=5)
    overlay(img, arrows, a * prog(t, 5.6, 6.0))


def scene_quote(img, t):
    # 35 - 42s：庄子
    a = prog(t, 0, 0.4) * (1 - prog(t, 6.6, 7.0))
    s = ease_back(prog(t, 0.0, 0.6))
    text(img, (W / 2, 520), "庄子", 120 * s, YELLOW, stroke=8, alpha=a)
    text(img, (W / 2, 640), "《人间世》", 46, GREY, alpha=a * prog(t, 0.5, 0.9), bold=False)
    full1 = "人皆知有用之用，"
    full2 = "而莫知无用之用也。"
    n = int(prog(t, 1.2, 4.0) * (len(full1) + len(full2)))
    l1 = full1[:n]
    l2 = full2[:max(0, n - len(full1))]
    text(img, (W / 2, 860), l1, 76, WHITE, alpha=a)
    text(img, (W / 2, 980), l2, 76, WHITE, alpha=a)
    # 下划线强调“无用之用”
    if n >= len(full1) + len(full2):
        k = ease_out(prog(t, 4.2, 4.8))
        f = font(76)
        wtot = f.getlength(full2)
        x0 = W / 2 - wtot / 2 + f.getlength("而莫知")
        x1 = x0 + f.getlength("无用之用")

        def fn(d, _):
            d.line([(x0, 1035), (lerp(x0, x1, k), 1035)], fill=YELLOW, width=10)
        overlay(img, fn, a)
    # 引号装饰
    text(img, (150, 760), "“", 200, (60, 68, 96), alpha=a)
    text(img, (930, 1090), "”", 200, (60, 68, 96), alpha=a)


def card_frame(img, t, title, idx, a):
    s = ease_back(prog(t, 0, 0.5))
    text(img, (W / 2, 380), f"No.{idx}", 46, GREY, alpha=a, bold=False)
    text(img, (W / 2, 470), title, 92 * s, WHITE, stroke=6, alpha=a)


def scene_cup(img, t):
    a = prog(t, 0, 0.3) * (1 - prog(t, 3.7, 4.0))
    card_frame(img, t, "杯子", 1, a)
    cx, top, bot = W / 2, 640, 1180
    lvl = ease_out(prog(t, 0.6, 2.4))

    def fn(d, _):
        # 水
        wy = lerp(bot - 20, top + 90, lvl)
        k0 = (wy - top) / (bot - top)
        wl = lerp(260, 190, k0)
        d.polygon([(cx - wl, wy), (cx + wl, wy), (cx + 190, bot - 20), (cx - 190, bot - 20)], fill=CYAN + (170,))
        # 杯身
        d.line([(cx - 260, top), (cx - 190, bot), (cx + 190, bot), (cx + 260, top)], fill=WHITE, width=14, joint="curve")
        d.arc((cx + 220, top + 120, cx + 380, top + 340), 270, 90, fill=WHITE, width=14)
    overlay(img, fn, a)
    q = prog(t, 2.4, 2.8)
    tag(img, cx, 900, "空", 70, YELLOW, (40, 30, 0), alpha=a * q)
    text(img, (cx, 1310), "当其无，有器之用 —— 老子", 44, GREY, alpha=a * prog(t, 2.6, 3.0), bold=False)


def scene_road(img, t):
    a = prog(t, 0, 0.3) * (1 - prog(t, 3.7, 4.0))
    card_frame(img, t, "马路", 2, a)
    cx, top, bot = W / 2, 620, 1220
    p = ease_out(prog(t, 0.4, 1.0))

    def fn(d, _):
        d.polygon([(cx - 120, top), (cx + 120, top), (cx + 440, bot), (cx - 440, bot)], fill=(70, 76, 96))
        dashed(d, (cx, top), (cx, bot), WHITE, width=8, dash=40, gap=30, phase=t * 160)
        d.line([(cx - 120, top), (cx - 440, bot)], fill=WHITE, width=6)
        d.line([(cx + 120, top), (cx + 440, bot)], fill=WHITE, width=6)
        # 车辙
        for off0, off1 in ((-55, -210), (-15, -70)):
            d.line([(cx + off0, top), (lerp(cx + off0, cx + off1, 1), lerp(top, bot, p))], fill=YELLOW, width=16)
    overlay(img, fn, a)
    q = prog(t, 1.5, 1.9)
    tag(img, cx - 140, 1270, "压到的", 40, YELLOW, (40, 30, 0), alpha=a * q)
    tag(img, cx + 230, 1000, "没压到的", 40, CYAN, (10, 30, 40), alpha=a * q)


def scene_battery(img, t):
    a = prog(t, 0, 0.3) * (1 - prog(t, 3.7, 4.0))
    card_frame(img, t, "电量", 3, a)
    cx, cy = W / 2, 880
    bw, bh = 640, 300
    lvl = lerp(1.0, 0.2, ease_in_out(prog(t, 0.4, 2.0)))
    col = GREEN if lvl > 0.21 else (GREEN if int(t * 4) % 2 else (60, 160, 90))

    def fn(d, _):
        d.rounded_rectangle((cx - bw / 2, cy - bh / 2, cx + bw / 2, cy + bh / 2), radius=36, outline=WHITE, width=14)
        d.rounded_rectangle((cx + bw / 2 + 6, cy - 60, cx + bw / 2 + 46, cy + 60), radius=12, fill=WHITE)
        iw = bw - 60
        d.rounded_rectangle((cx - iw / 2, cy - bh / 2 + 30, cx - iw / 2 + iw * lvl, cy + bh / 2 - 30), radius=16, fill=col)
    overlay(img, fn, a)
    text(img, (cx, cy + bh / 2 + 90), f"{int(round(lvl * 100))}%", 90, WHITE, alpha=a)
    q = prog(t, 2.1, 2.5)
    tag(img, cx, cy - bh / 2 - 90, "这 20% = 安全感", 46, GREEN, (10, 40, 20), alpha=a * q)


def scene_calendar(img, t):
    a = prog(t, 0, 0.3) * (1 - prog(t, 3.7, 4.0))
    card_frame(img, t, "日程", 4, a)
    x0, y0, cw, ch, gap = 150, 640, 180, 120, 20
    filled = {(0, 0), (1, 0), (3, 0), (0, 1), (2, 1), (3, 1), (1, 2), (2, 2), (0, 3), (3, 3), (2, 3)}
    colors = [(118, 132, 255), (255, 150, 90), (200, 120, 230)]
    fly = ease_out(prog(t, 1.2, 2.2))

    def fn(d, _):
        for r in range(4):
            for c in range(4):
                bx, by = x0 + c * (cw + gap), y0 + r * (ch + gap)
                if (c, r) in filled:
                    d.rounded_rectangle((bx, by, bx + cw, by + ch), radius=18, fill=colors[(r + c) % 3])
                else:
                    d.rounded_rectangle((bx, by, bx + cw, by + ch), radius=18, outline=GREY, width=4)
        # 意外块飞入空格 (1,1)
        tx, ty = x0 + 1 * (cw + gap), y0 + 1 * (ch + gap)
        fx, fy = lerp(W + 50, tx, fly), lerp(300, ty, fly)
        d.rounded_rectangle((fx, fy, fx + cw, fy + ch), radius=18, fill=RED)
    overlay(img, fn, a)
    tx, ty = x0 + 1 * (cw + gap) + cw / 2, y0 + 1 * (ch + gap) + ch / 2
    text(img, (lerp(W + 140, tx, fly), lerp(360, ty, fly)), "意外", 46, WHITE, alpha=a)
    q = prog(t, 2.3, 2.7)
    text(img, (W / 2, 1270), "空白，是留给意外的座位", 52, CYAN, alpha=a * q)


def scene_end(img, t):
    # 58 - 68s
    a = prog(t, 0, 0.4)
    # 完整纸巾 + 外圈
    s = ease_back(prog(t, 0, 0.7))
    cx, cy = W / 2, 760
    pw, ph = 420 * s, 500 * s
    draw_paper(img, cx, cy, pw, ph, alpha=a * (1 - prog(t, 4.0, 4.6)))

    def ring(d, _):
        d.rounded_rectangle((cx - pw / 2, cy - ph / 2, cx + pw / 2, cy + ph / 2), radius=18, outline=CYAN, width=8)
        d.ellipse((cx - 110 * s, cy - 140 * s, cx + 110 * s, cy + 140 * s), outline=YELLOW, width=8)
    overlay(img, ring, a * (1 - prog(t, 4.0, 4.6)))
    # 结尾大字
    k = ease_back(prog(t, 4.4, 5.0))
    text(img, (W / 2, 700), "有用的", 170 * k, WHITE, stroke=10)
    k2 = ease_back(prog(t, 4.7, 5.3))
    text(img, (W / 2, 920), "无用", 240 * k2, YELLOW, stroke=12)
    q = prog(t, 6.0, 6.5)
    tag(img, W / 2, 1180, "你身边还有哪些“有用的无用”？", 46, CYAN, (10, 30, 40), alpha=q)
    text(img, (W / 2, 1270), "评论区见", 46, GREY, alpha=prog(t, 6.4, 6.9), bold=False)


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
            f = font(56)
            lines = s.split("\n")
            wmax = max(f.getlength(l) for l in lines)
            h = len(lines) * 72 + 30
            cy = 1500

            def fn(d, _):
                d.rounded_rectangle((W / 2 - wmax / 2 - 36, cy - h / 2, W / 2 + wmax / 2 + 36, cy + h / 2),
                                    radius=24, fill=(0, 0, 0, 150))
            overlay(img, fn, al)
            text(img, (W / 2, cy), s, 56, WHITE, alpha=al, spacing=16)
            break


def render_frame(bg, t):
    img = bg.copy()
    for a, b, fn in TIMELINE:
        if a <= t < b:
            fn(img, t - a)
    header(img, t)
    subtitle(img, t)
    # 翻车时屏幕抖动
    if 20.6 <= t < 21.4:
        k = 1 - (t - 20.6) / 0.8
        dx, dy = int(math.sin(t * 90) * 22 * k), int(math.cos(t * 77) * 18 * k)
        shaken = Image.new("RGBA", (W, H), BG + (255,))
        shaken.paste(img, (dx, dy))
        img = shaken
    return img.convert("RGB")


# ---------------------------------------------------------------- 音频
SR = 44100


def synth_audio(path):
    n = int(DURATION * SR)
    mix = np.zeros(n, dtype=np.float64)
    bpm = 96
    beat = 60 / bpm
    tt = np.arange(n) / SR

    def add(sig, start, gain=1.0):
        i = int(start * SR)
        if i >= n:
            return
        j = min(n, i + len(sig))
        mix[i:j] += sig[: j - i] * gain

    def env(L, a=0.005, r=0.2):
        x = np.arange(int(L * SR)) / SR
        e = np.minimum(1, x / a) * np.exp(-x / r)
        return e

    def note(freq, L, wave_="tri", a=0.02, r=0.6):
        x = np.arange(int(L * SR)) / SR
        if wave_ == "tri":
            s = 2 / np.pi * np.arcsin(np.sin(2 * np.pi * freq * x))
        else:
            s = np.sin(2 * np.pi * freq * x)
        return s * env(L, a, r)

    def kick():
        L = 0.35
        x = np.arange(int(L * SR)) / SR
        f = 120 * np.exp(-x * 18) + 45
        ph = 2 * np.pi * np.cumsum(f) / SR
        return np.sin(ph) * np.exp(-x * 9)

    rng = np.random.default_rng(1)

    def noise(L, r, hp=True):
        s = rng.standard_normal(int(L * SR))
        if hp:
            s = np.diff(s, prepend=0)
        return s * env(L, 0.001, r)

    def hz(m):
        return 440 * 2 ** ((m - 69) / 12)

    # 和弦：Cmaj7 Am7 Fmaj7 G6
    chords = [[60, 64, 67, 71], [57, 60, 64, 67], [53, 57, 60, 64], [55, 59, 62, 64]]
    basses = [36, 33, 29, 31]
    bar = beat * 4
    nbars = int(DURATION / bar) + 1
    drop = (20.4, 22.0)  # 翻车时音乐静音
    for b in range(nbars):
        t0 = b * bar
        ch = chords[b % 4]
        for m in ch:
            add(note(hz(m), bar * 1.05, "sin", a=0.08, r=1.6), t0, 0.05)
        add(note(hz(basses[b % 4]), bar * 0.9, "tri", a=0.01, r=0.8), t0, 0.16)
        add(note(hz(basses[b % 4]), beat * 1.2, "tri", a=0.01, r=0.3), t0 + beat * 2.5, 0.10)
        # 简单旋律琶音
        arp = [ch[0] + 12, ch[2] + 12, ch[1] + 12, ch[3] + 12]
        for k in range(8):
            if (k + b) % 3 == 0:
                continue
            add(note(hz(arp[k % 4]), 0.4, "tri", a=0.005, r=0.18), t0 + k * beat / 2, 0.035)
        if b >= 1:
            for k in range(4):
                bt = t0 + k * beat
                if k in (0, 2):
                    add(kick(), bt, 0.55)
                else:
                    add(noise(0.2, 0.06, hp=False), bt, 0.10)
            for k in range(8):
                add(noise(0.05, 0.015), t0 + k * beat / 2, 0.05 if k % 2 else 0.08)
    # 翻车段落：音乐停 + 低频 boom
    m0, m1 = int(drop[0] * SR), int(drop[1] * SR)
    fade = np.ones(n)
    fade[m0:m1] = 0.0
    ramp = int(0.4 * SR)
    fade[m1:m1 + ramp] = np.linspace(0, 1, ramp)
    mix *= fade
    # 结尾淡出
    fo = int(2.0 * SR)
    mix[-fo:] *= np.linspace(1, 0, fo)

    # ---- 音效
    def whoosh(L=0.45):
        s = rng.standard_normal(int(L * SR))
        x = np.arange(len(s)) / SR
        e = np.sin(np.pi * x / L) ** 2
        # 简单低通：滑动平均，窗口随时间变化效果近似
        k = 20
        s = np.convolve(s, np.ones(k) / k, mode="same")
        return s * e * 3

    def pop():
        L = 0.12
        x = np.arange(int(L * SR)) / SR
        f = 900 * np.exp(-x * 25) + 300
        return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-x * 30)

    def ding(f=1318.5):
        return note(f, 1.2, "sin", 0.002, 0.5) + 0.5 * note(f * 2, 1.2, "sin", 0.002, 0.3)

    def boom():
        L = 1.2
        x = np.arange(int(L * SR)) / SR
        f = 80 * np.exp(-x * 3) + 30
        return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-x * 2.5) + noise(L, 0.15, False) * 0.3

    def snip():
        return noise(0.06, 0.012) * 1.5

    def scratch():
        L = 0.5
        x = np.arange(int(L * SR)) / SR
        f = 600 * (1 - x / L) + 100
        return np.sign(np.sin(2 * np.pi * np.cumsum(f) / SR)) * np.exp(-x * 4) * 0.4

    for s in (5.0, 12.0, 26.0, 35.0, 42.0, 46.0, 50.0, 54.0, 58.0):
        add(whoosh(), s - 0.2, 0.18)
    for s in (0.15, 0.5, 6.1, 9.0, 16.6, 30.3, 30.7, 31.1, 35.05, 42.1, 46.1, 50.1, 54.1, 62.4, 62.7):
        add(pop(), s, 0.25)
    for k in range(18):
        add(snip(), 12.8 + k * 0.12, 0.35)
    add(scratch(), 20.35, 0.5)
    add(boom(), 20.6, 0.9)
    add(ding(), 27.0, 0.25)
    add(ding(1567.98), 39.2, 0.2)
    add(ding(1046.5), 44.4, 0.2)
    add(ding(1318.5), 52.1, 0.2)
    add(ding(1567.98), 56.3, 0.2)
    add(ding(2093.0), 64.0, 0.25)

    mix = np.tanh(mix * 1.2) * 0.85
    pcm = (mix * 32767).astype(np.int16)
    stereo = np.stack([pcm, pcm], axis=1)
    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(stereo.tobytes())


def write_srt(path):
    def ts(x):
        ms = int(round(x * 1000))
        h, ms = divmod(ms, 3600000)
        m, ms = divmod(ms, 60000)
        s, ms = divmod(ms, 1000)
        return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"
    with open(path, "w", encoding="utf-8") as f:
        for i, (a, b, s) in enumerate(SUBS, 1):
            f.write(f"{i}\n{ts(a)} --> {ts(b)}\n{s.replace(chr(10), '')}\n\n")


def main():
    import sys
    os.makedirs(OUT, exist_ok=True)
    if len(sys.argv) > 1 and sys.argv[1] == "preview":
        bg = make_background()
        for t in map(float, sys.argv[2:]):
            render_frame(bg, t).save(os.path.join(OUT, f"preview_{t:05.1f}.png"))
        return
    wav = os.path.join(OUT, "audio.wav")
    synth_audio(wav)
    write_srt(os.path.join(OUT, "有用的无用.srt"))
    bg = make_background()
    mp4 = os.path.join(OUT, "有用的无用.mp4")
    cmd = ["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}",
           "-r", str(FPS), "-i", "-", "-i", wav, "-c:v", "libx264", "-preset", "medium", "-crf", "20",
           "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", mp4]
    p = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    nf = int(DURATION * FPS)
    for i in range(nf):
        p.stdin.write(render_frame(bg, i / FPS).tobytes())
        if i % 150 == 0:
            print(f"frame {i}/{nf}", flush=True)
    p.stdin.close()
    p.wait()
    os.remove(wav)
    print("done:", mp4)


if __name__ == "__main__":
    main()
