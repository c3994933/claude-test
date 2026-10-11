"""生成短片《周五晚上，为什么比周六快乐》。

依赖：Python3 + Pillow + numpy + ffmpeg，以及 Noto CJK 中文字体
（Ubuntu: apt install fonts-noto-cjk）。
用法：
    python3 make_video.py                # 输出 friday_night.mp4
    python3 make_video.py preview 16 42  # 导出指定秒数的单帧 PNG，便于检查
"""
import math
import random
import subprocess
import sys
import wave
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

W, H, FPS = 1280, 720, 30
TOTAL = 110.0
OUT_DIR = Path(__file__).resolve().parent

NOTO = Path("/usr/share/fonts/opentype/noto")
SERIF = (NOTO / "NotoSerifCJK-Regular.ttc", 2)   # 索引 2 = 简体中文 SC
SERIF_B = (NOTO / "NotoSerifCJK-Bold.ttc", 2)
SANS = (NOTO / "NotoSansCJK-Regular.ttc", 2)
_fonts = {}


def font(size, face=SERIF):
    key = (face, size)
    if key not in _fonts:
        path, idx = face
        _fonts[key] = ImageFont.truetype(str(path), size, index=idx)
    return _fonts[key]


# ---------------------------------------------------------------- 工具函数
def clamp(x, a=0.0, b=1.0):
    return max(a, min(b, x))


def ease(x):
    x = clamp(x)
    return x * x * (3 - 2 * x)


def lerp(a, b, t):
    return a + (b - a) * t


def lerp_col(c1, c2, t):
    return tuple(int(round(lerp(a, b, t))) for a, b in zip(c1, c2))


def fade(t, start, end, fin=0.8, fout=0.8):
    """在 [start, end] 区间内淡入淡出，返回 0~1。"""
    if t < start or t > end:
        return 0.0
    return ease((t - start) / fin) * ease((end - t) / fout)


def text_block(d, text, cx, cy, size, color, alpha, face=SERIF, spacing=1.6, anchor="mm"):
    if alpha <= 0.01:
        return
    lines = text.split("\n")
    lh = size * spacing
    y0 = cy - lh * (len(lines) - 1) / 2
    for i, line in enumerate(lines):
        d.text((cx, y0 + i * lh), line, font=font(size, face),
               fill=tuple(color) + (int(255 * alpha),), anchor=anchor)


def caption(d, t, start, end, text, y=630, size=36, color=(246, 240, 228), face=SERIF):
    a = fade(t, start, end)
    if a <= 0:
        return
    dy = (1 - ease((t - start) / 0.8)) * 10   # 字幕出现时轻微上浮
    text_block(d, text, W / 2, y + dy, size, color, a, face=face)


# ---------------------------------------------------------------- 背景
# (时间, 顶部颜色, 底部颜色)
BG_KEYS = [
    (0, (8, 8, 14), (8, 8, 14)),
    (7.0, (8, 8, 14), (8, 8, 14)),
    (9.0, (14, 18, 52), (70, 38, 72)),         # 周五夜：深蓝紫 + 暖色天际
    (20, (14, 18, 52), (70, 38, 72)),
    (22.5, (150, 190, 225), (235, 225, 200)),  # 周六上午：明亮但发白
    (34, (150, 190, 225), (235, 225, 200)),
    (36.5, (60, 70, 92), (120, 100, 100)),     # 周六夜：灰蓝
    (46, (60, 70, 92), (120, 100, 100)),
    (47.5, (18, 20, 28), (28, 30, 40)),        # 快乐曲线
    (67, (18, 20, 28), (28, 30, 40)),
    (68.5, (6, 6, 10), (12, 10, 18)),          # 思考
    (97, (6, 6, 10), (12, 10, 18)),
    (99, (20, 22, 58), (90, 50, 70)),          # 结尾回到周五夜
    (107.5, (20, 22, 58), (90, 50, 70)),
    (110, (0, 0, 0), (0, 0, 0)),
]
_grad = np.linspace(0, 1, H, dtype=np.float32)[:, None, None]

# 夜景字幕区的底部暗角，保证字幕压在城市剪影上也清晰
_vig = np.zeros((H, W, 4), np.uint8)
_ramp = np.clip((np.arange(H) - 470) / 170, 0, 1) ** 1.3
_vig[:, :, 3] = (_ramp * 235)[:, None].astype(np.uint8)
_vig[:, :, :3] = (6, 5, 14)
VIGNETTE = Image.fromarray(_vig, "RGBA")


def background(t):
    top = bot = np.zeros(3, np.float32)
    for (t0, a0, b0), (t1, a1, b1) in zip(BG_KEYS, BG_KEYS[1:]):
        if t0 <= t <= t1:
            k = ease((t - t0) / (t1 - t0))
            top = np.array(lerp_col(a0, a1, k), np.float32)
            bot = np.array(lerp_col(b0, b1, k), np.float32)
            break
    arr = top * (1 - _grad) + bot * _grad
    arr = np.broadcast_to(arr, (H, W, 3)).astype(np.uint8)
    return Image.fromarray(arr, "RGB")


# ---------------------------------------------------------------- 场景元素
rng = random.Random(7)
STARS = [(rng.random() * W, rng.random() * H * 0.62, rng.random() * 1.6 + 0.6,
          rng.random() * 6.28) for _ in range(180)]

BUILDINGS = []
_x = 0
while _x < W:
    bw = rng.randint(60, 130)
    bh = rng.randint(70, 160)
    BUILDINGS.append((_x, bw, bh, [rng.random() for _ in range(60)]))
    _x += bw + rng.randint(4, 14)

# 周五夜的 12 个“可能性”。手工排成 3 行 4 列并错位，保证标签互不重叠。
POSSIBILITIES = [
    ("看一场电影", 200, 200), ("睡到自然醒", 490, 175), ("约老朋友吃火锅", 790, 205), ("去海边", 1075, 180),
    ("读完那本书", 245, 320), ("打一整天游戏", 535, 300), ("骑车去没去过的地方", 830, 325), ("去爬山", 1095, 300),
    ("学会做一道菜", 195, 440), ("大扫除", 480, 420), ("写点东西", 760, 445), ("什么都不做", 1050, 425),
]
CHOSEN = 1  # 周六最终只剩下“睡到自然醒”

_TEXT_ZONES = [(30, 30, 560, 140)]  # 时钟 + 余额条
for _lab, _bx, _by in POSSIBILITIES:
    _hw = len(_lab) * 13 + 24
    _TEXT_ZONES.append((_bx - _hw, _by - 32, _bx + _hw, _by + 62))
STARS = [s for s in STARS
         if not any(x0 <= s[0] <= x1 and y0 <= s[1] <= y1 for x0, y0, x1, y1 in _TEXT_ZONES)]


def draw_stars(d, t, alpha, avoid=None):
    if alpha <= 0.01:
        return
    for sx, sy, r, ph in STARS:
        if avoid and avoid[0] <= sx <= avoid[2] and avoid[1] <= sy <= avoid[3]:
            continue
        a = alpha * (0.4 + 0.6 * math.sin(t * 1.2 + ph) ** 2)
        d.ellipse((sx - r, sy - r, sx + r, sy + r), fill=(255, 245, 225, int(190 * a)))


def draw_city(d, alpha, lit=1.0):
    if alpha <= 0.01:
        return
    for x0, bw, bh, rnd in BUILDINGS:
        top = H - bh
        d.rectangle((x0, top, x0 + bw, H), fill=(10, 10, 22, int(240 * alpha)))
        k = 0
        for wy in range(top + 14, H - 10, 22):
            for wx in range(x0 + 10, x0 + bw - 14, 20):
                if rnd[k % len(rnd)] < 0.45 * lit:
                    d.rectangle((wx, wy, wx + 8, wy + 11), fill=(255, 196, 110, int(190 * alpha)))
                k += 1


# 周末 = 周五 18:00 到 周一 00:00，共 54 小时。时间以“周一 0 点 = 第 0 小时”计。
WEEKEND_START = 4 * 24 + 18
WEEKEND_HOURS = 54
DAY_NAMES = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"]


def draw_clock_and_bar(d, hour_of_week, alpha, dark=False):
    """左上角的时钟 + “周末余额”进度条，两者由同一个时间算出，保证对得上。"""
    if alpha <= 0.01:
        return
    minutes = int(round(hour_of_week * 60))
    day, hh, mm = minutes // 1440, minutes // 60 % 24, minutes % 60
    col = (40, 40, 50) if dark else (240, 235, 225)
    a = int(255 * alpha)
    d.text((60, 62), f"{DAY_NAMES[day]}  {hh:02d}:{mm:02d}", font=font(34, SANS), fill=col + (a,), anchor="lm")

    remain = clamp(1 - (minutes / 60 - WEEKEND_START) / WEEKEND_HOURS)
    x0, y0, bw, bh = 60, 108, 300, 14
    d.rounded_rectangle((x0, y0, x0 + bw, y0 + bh), 7, outline=col + (int(150 * alpha),), width=2)
    if remain > 0.02:
        fill = lerp_col((232, 92, 80), (255, 190, 90), remain)
        d.rounded_rectangle((x0 + 3, y0 + 3, x0 + 3 + (bw - 6) * remain, y0 + bh - 3), 4, fill=fill + (a,))
    d.text((x0 + bw + 16, y0 + bh / 2), f"周末余额 {round(remain * 100)}%",
           font=font(22, SANS), fill=col + (int(220 * alpha),), anchor="lm")


def glow_dot(d, x, y, r, color, alpha):
    if alpha <= 0.01 or r <= 0.5:
        return
    for k, s in ((3.0, 0.08), (2.0, 0.18), (1.0, 1.0)):
        rr = r * k
        d.ellipse((x - rr, y - rr, x + rr, y + rr), fill=tuple(color) + (int(255 * alpha * s),))


# ---------------------------------------------------------------- 快乐曲线
def happiness(h):
    """h: 从周五 18:00 起经过的小时数（0~52，到周日 22:00）。示意曲线，非真实数据。"""
    x = h / 52
    anticipation = 0.30 * math.exp(-((x - 0.07) / 0.08) ** 2)
    base = 0.30 + 0.32 * (1 - math.exp(-x / 0.03)) - 0.12 * x
    sunday_drop = -0.30 / (1 + math.exp(-(x - 0.85) / 0.04))
    return clamp(base + anticipation + sunday_drop, 0.05, 0.95)


def draw_graph(d, t, alpha):
    gx0, gy0, gx1, gy1 = 190, 150, 1100, 480
    a = int(255 * alpha)
    axis = (150, 150, 162, a)
    text_block(d, "一个周末的「快乐曲线」", W / 2, 72, 32, (236, 230, 220), alpha)
    text_block(d, "（示意图，非真实数据）", W / 2, 112, 18, (140, 140, 150), alpha, face=SANS)
    d.line((gx0, gy1, gx1, gy1), fill=axis, width=2)
    d.line((gx0, gy0, gx0, gy1), fill=axis, width=2)
    d.text((gx0 - 16, gy0 + 10), "快乐", font=font(22, SANS), fill=(190, 190, 200, a), anchor="rm")

    def px(h):
        return gx0 + (gx1 - gx0) * h / 52

    def py(v):
        return gy1 - (gy1 - gy0) * v

    for h in (6, 30):  # 周六 0 点、周日 0 点
        d.line((px(h), gy1, px(h), gy1 + 10), fill=axis, width=2)
    for h0, h1, lab in ((0, 6, "周五晚"), (6, 30, "周六"), (30, 52, "周日")):
        d.text((px((h0 + h1) / 2), gy1 + 30), lab, font=font(22, SANS), fill=(190, 190, 200, a), anchor="mm")

    prog = ease((t - 48.0) / 5.0)
    n = int(260 * prog)
    pts = [(px(52 * i / 260), py(happiness(52 * i / 260))) for i in range(n + 1)]
    split = px(7.5)  # 暖色 = 还在期待；冷色 = 正在度过
    warm = [p for p in pts if p[0] <= split]
    cold = [p for p in pts if p[0] >= split - 4]
    if len(warm) > 1:
        d.line(warm, fill=(255, 185, 95, a), width=5, joint="curve")
    if len(cold) > 1:
        d.line(cold, fill=(130, 170, 230, a), width=5, joint="curve")

    ka = fade(t, 53.0, 67.5) * alpha
    if ka > 0:
        hx = 0.07 * 52
        glow_dot(d, px(hx), py(happiness(hx)), 7, (255, 200, 120), ka)
        text_block(d, "峰值：什么都还没发生", px(hx) + 24, py(happiness(hx)) - 30, 24,
                   (255, 205, 140), ka, anchor="lm")
    kb = fade(t, 54.5, 67.5) * alpha
    if kb > 0:
        hx = 46.0
        text_block(d, "周一的影子", px(hx) + 20, py(happiness(hx)) - 60, 22, (150, 180, 230), kb, anchor="mm")


# ---------------------------------------------------------------- 主渲染
def render(t):
    img = background(t)
    d = ImageDraw.Draw(img, "RGBA")  # 底图为 RGB + RGBA 画笔：半透明图形与下层正确混合
    night1 = fade(t, 7.5, 21.0, 1.5, 2.0)
    night2 = fade(t, 34.2, 46.2, 1.2, 1.0)

    # ---- S1 片头 0–7.5
    text_block(d, "一个很小的问题", W / 2, 285, 28, (165, 165, 178), fade(t, 0.6, 3.8))
    text_block(d, "为什么周五晚上，\n比周六更快乐？", W / 2, 360, 60, (250, 240, 225),
               fade(t, 3.2, 7.4, 1.0, 0.9), face=SERIF_B)

    # ---- S2 周五夜 7.5–21：18:00 → 19:10
    draw_stars(d, t, night1)
    draw_city(d, night1)
    draw_clock_and_bar(d, WEEKEND_START + lerp(0, 70 / 60, clamp((t - 8.5) / 12)), fade(t, 8.5, 20.5))

    # 周六夜的城市（在暗角之前绘制）
    draw_city(d, night2 * 0.85, lit=lerp(0.9, 0.25, ease((t - 37) / 8)))

    # 夜景字幕区暗角
    vig_a = max(fade(t, 9.5, 20.3), fade(t, 35.5, 45.8))
    if vig_a > 0:
        v = VIGNETTE.copy()
        v.putalpha(v.getchannel("A").point(lambda p: int(p * vig_a)))
        img.paste(v, (0, 0), v)

    # 可能性的光点：周五逐个亮起，周六只剩一个
    if 9.5 < t < 35:
        for i, (label, bx, by) in enumerate(POSSIBILITIES):
            appear = ease((t - 9.6 - i * 0.3) / 0.8)
            fx = bx + math.sin(t * 0.8 + i) * 6
            fy = by + math.cos(t * 0.6 + i * 1.7) * 5
            if i == CHOSEN:
                k = ease((t - 22.0) / 3.0)
                fx, fy = lerp(fx, W / 2, k), lerp(fy, 330, k)
                a = appear * (1 - ease((t - 32.8) / 1.4))
                r = lerp(8, 16, k)
                dot_col = lerp_col((255, 212, 140), (255, 160, 80), k)
                lab_col = lerp_col((248, 236, 214), (55, 45, 45), ease((t - 20.5) / 2.0))
                size = int(round(lerp(24, 32, k)))
            else:
                k = ease((t - 21.0 - (i % 6) * 0.3) / 2.0)   # 其余可能逐个熄灭、下沉
                fy += k * 40
                a = appear * (1 - k)
                r = 8
                dot_col = (255, 212, 140)
                lab_col = (248, 236, 214)
                size = 24
            glow_dot(d, fx, fy, r, dot_col, a)
            text_block(d, label, fx, fy + r + 22, size, lab_col, a)

    caption(d, t, 10.0, 14.2, "下班了。周末，还一分钟都没有用掉。")
    caption(d, t, 14.6, 20.2, "这一刻，你什么都还没做，\n却同时拥有全部的可能。")

    # ---- S3 周六上午 21–34：11:05 → 11:40
    glow_dot(d, 1080, 150, 34, (255, 236, 182), fade(t, 24.5, 34.0, 1.5, 0.8) * 0.9)  # 等其余光点熄灭后再出现
    draw_clock_and_bar(d, WEEKEND_START + 17 + lerp(5 / 60, 40 / 60, clamp((t - 22) / 12)),
                       fade(t, 22.0, 33.8), dark=True)
    ink = (45, 40, 45)
    caption(d, t, 22.5, 27.6, "到了周六，无数种可能，\n开始收缩成一种现实。", color=ink)
    caption(d, t, 28.0, 33.7, "选择了一件事，\n就意味着放弃了其余的一切。", color=ink)

    # ---- S4 周六夜 34–46：20:30 → 21:30
    draw_clock_and_bar(d, WEEKEND_START + 26 + lerp(30 / 60, 90 / 60, clamp((t - 35) / 11)),
                       fade(t, 35.0, 45.8))
    if night2 > 0:
        reach = ease((t - 38) / 7.5)   # “周一”的阴影从右侧逼近
        sw = int(lerp(0, 520, reach))
        if sw > 2:
            sh = np.zeros((H, sw, 4), np.uint8)
            ramp = np.linspace(0, 1, sw, dtype=np.float32) ** 1.6
            sh[:, :, 3] = (ramp * 235 * night2)[None, :].astype(np.uint8)
            sh[:, :, :3] = (6, 6, 12)
            shadow = Image.fromarray(sh, "RGBA")
            img.paste(shadow, (W - sw, 0), shadow)
            d = ImageDraw.Draw(img, "RGBA")
            text_block(d, "周一", W - 95, 330, 44, (125, 125, 145), night2 * reach * 0.85, face=SERIF_B)
    caption(d, t, 36.0, 40.6, "而且，你开始看得见终点了。")
    caption(d, t, 41.0, 45.8, "倒计时一旦开始，\n快乐就会被一点一点稀释。")

    # ---- S5 快乐曲线 46–67.5
    ga = fade(t, 47.0, 67.5, 1.0, 1.0)
    if ga > 0:
        draw_graph(d, t, ga)
    caption(d, t, 53.5, 57.8, "快乐 = 期待 + 体验", y=610, size=40)
    caption(d, t, 58.2, 62.4, "而期待，是一种提前支取的快乐。", y=610)
    caption(d, t, 62.8, 67.4, "一项研究发现：度假的人在出发之前，就已经比别人更快乐；\n而假期一结束，这份快乐很快就回到了原点。",
            y=612, size=30)

    # ---- S6 思考 68–84
    think = fade(t, 68.5, 84.2, 1.2, 1.0)
    glow_dot(d, W / 2, 245, 13 * (1 + 0.15 * math.sin(t * 2.0)), (255, 200, 120), think)
    caption(d, t, 69.5, 74.4, "所以，我们真正热爱的，\n也许不是周末本身，", y=420, size=42)
    caption(d, t, 74.8, 79.2, "而是「还有周末」。", y=420, size=54, color=(255, 210, 150), face=SERIF_B)
    caption(d, t, 79.6, 84.2, "可能性总是比现实更甜，\n但只有现实，才能被真正活过。", y=420, size=40)

    # ---- S7 方法 84.5–98
    text_block(d, "那么，怎样把周六也过成周五晚上？", W / 2, 175, 40, (255, 215, 160),
               fade(t, 84.8, 98.0, 0.9, 1.0), face=SERIF_B)
    tips = ["一、给明天留一件小小的期待",
            "二、别让周日的焦虑，提前偷走周六",
            "三、选定一件事，就全心投入这一件"]
    for i, tip in enumerate(tips):
        st = 86.6 + i * 2.6
        a = fade(t, st, 98.0, 0.9, 1.0)
        dx = (1 - ease((t - st) / 0.9)) * 30
        text_block(d, tip, 345 + dx, 305 + i * 88, 34, (236, 232, 224), a, anchor="lm")

    # ---- S8 结尾 98–110
    draw_stars(d, t, fade(t, 98.5, 110, 1.5, 2.0), avoid=(330, 240, 950, 450))
    caption(d, t, 99.2, 103.6, "周五晚上之所以快乐，\n是因为未来还很长。", y=345, size=46)
    caption(d, t, 104.0, 109.2, "愿你的每一天，\n都有一个在等你的周末。", y=345, size=46,
            color=(255, 215, 160))

    return img


# ---------------------------------------------------------------- 配乐（纯合成）
def note(n):  # MIDI → Hz
    return 440.0 * 2 ** ((n - 69) / 12)


def make_audio(path, sr=44100):
    n = int(TOTAL * sr)
    out = np.zeros(n, np.float32)
    warm = [[48, 55, 64, 71], [45, 52, 60, 67], [41, 48, 57, 64], [43, 50, 59, 62]]  # Cmaj7 Am7 Fmaj7 G
    blue = [[45, 52, 60, 64], [41, 48, 57, 60], [40, 47, 55, 59], [43, 50, 55, 62]]  # Am F Em G
    st = 0.0
    while st < TOTAL:
        chord = (blue if 34 <= st < 84 else warm)[int(st / 4) % 4]
        dur = 5.5
        i0 = int(st * sr)
        m = min(int(dur * sr), n - i0)
        tt = np.arange(m) / sr
        env = np.minimum(tt / 1.6, 1.0) * np.clip((dur - tt) / 2.5, 0, 1)
        for k, mn in enumerate(chord):
            f = note(mn)
            v = 0.08 if k == 0 else 0.05
            s = np.sin(2 * np.pi * f * tt) + 0.25 * np.sin(2 * np.pi * 2 * f * tt + 0.3)
            out[i0:i0 + m] += (v * env * s).astype(np.float32)
        st += 4.0
    # 周六夜的钟表滴答声（倒计时）
    for sec in np.arange(38.0, 46.0, 1.0):
        i0 = int(sec * sr)
        m = int(0.05 * sr)
        tt = np.arange(m) / sr
        out[i0:i0 + m] += (0.12 * np.exp(-tt * 120) * np.sin(2 * np.pi * 2200 * tt)).astype(np.float32)
    fi, fo = int(2 * sr), int(3 * sr)
    out[:fi] *= np.linspace(0, 1, fi)
    out[-fo:] *= np.linspace(1, 0, fo)
    out = out / (np.abs(out).max() + 1e-6) * 0.7
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes((out * 32767).astype(np.int16).tobytes())


def main():
    audio = OUT_DIR / "_music.wav"
    make_audio(audio)
    out = OUT_DIR / "friday_night.mp4"
    cmd = ["ffmpeg", "-y", "-loglevel", "error",
           "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
           "-i", str(audio),
           "-c:v", "libx264", "-preset", "slow", "-crf", "20", "-pix_fmt", "yuv420p",
           "-c:a", "aac", "-b:a", "160k", "-shortest", "-movflags", "+faststart", str(out)]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    frames = int(TOTAL * FPS)
    for i in range(frames):
        proc.stdin.write(render(i / FPS).tobytes())
        if i % 300 == 0:
            print(f"{i}/{frames}", flush=True)
    proc.stdin.close()
    proc.wait()
    audio.unlink()
    print("done:", out)


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "preview":
        for ts in sys.argv[2:]:
            render(float(ts)).save(OUT_DIR / f"_preview_{ts}.png")
    else:
        main()
