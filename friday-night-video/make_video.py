"""生成短片《周五晚上，为什么比周六快乐》。

依赖：Python3 + Pillow + numpy + ffmpeg，以及文泉驿正黑字体。
用法：python3 make_video.py  →  输出 friday_night.mp4
"""
import math
import random
import subprocess
import wave
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H, FPS = 1280, 720, 30
TOTAL = 108.0
FONT_PATH = "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc"
OUT_DIR = Path(__file__).resolve().parent
_fonts = {}


def font(size):
    if size not in _fonts:
        _fonts[size] = ImageFont.truetype(FONT_PATH, size)
    return _fonts[size]


# ---------------------------------------------------------------- 工具函数
def clamp(x, a=0.0, b=1.0):
    return max(a, min(b, x))


def ease(x):
    x = clamp(x)
    return x * x * (3 - 2 * x)


def lerp(a, b, t):
    return a + (b - a) * t


def lerp_col(c1, c2, t):
    return tuple(int(lerp(a, b, t)) for a, b in zip(c1, c2))


def fade(t, start, end, fin=0.8, fout=0.8):
    """在 [start, end] 区间内淡入淡出，返回 0~1。"""
    if t < start or t > end:
        return 0.0
    return ease((t - start) / fin) * ease((end - t) / fout)


def text_block(draw, text, cx, cy, size, color, alpha, spacing=1.45, anchor="mm"):
    if alpha <= 0.01:
        return
    lines = text.split("\n")
    lh = size * spacing
    y0 = cy - lh * (len(lines) - 1) / 2
    for i, line in enumerate(lines):
        draw.text((cx, y0 + i * lh), line, font=font(size),
                  fill=color + (int(255 * alpha),), anchor=anchor)


def caption(draw, t, start, end, text, y=600, size=38, color=(245, 240, 230), band=False):
    a = fade(t, start, end)
    if band and a > 0:
        n = text.count("\n") + 1
        hh = size * 1.45 * n / 2 + 22
        draw.rectangle((0, y - hh, W, y + hh), fill=(5, 5, 12, int(150 * a)))
    # 字幕轻微上浮
    dy = (1 - ease((t - start) / 0.8)) * 12 if t >= start else 0
    text_block(draw, text, W / 2, y + dy, size, color, a)


# ---------------------------------------------------------------- 背景
# (时间, 顶部颜色, 底部颜色)
BG_KEYS = [
    (0, (8, 8, 14), (8, 8, 14)),
    (6.5, (8, 8, 14), (8, 8, 14)),
    (8.5, (14, 18, 52), (70, 38, 72)),      # 周五夜：深蓝紫 + 暖色天际
    (19, (14, 18, 52), (70, 38, 72)),
    (22, (150, 190, 225), (235, 225, 200)),  # 周六上午：明亮但有点发白
    (33, (150, 190, 225), (235, 225, 200)),
    (36, (60, 70, 92), (120, 100, 100)),     # 周六夜：灰蓝
    (45, (60, 70, 92), (120, 100, 100)),
    (46.5, (18, 20, 28), (28, 30, 40)),      # 曲线图
    (66, (18, 20, 28), (28, 30, 40)),
    (67.5, (6, 6, 10), (12, 10, 18)),        # 思考
    (96, (6, 6, 10), (12, 10, 18)),
    (98, (20, 22, 58), (90, 50, 70)),        # 结尾回到周五夜的颜色
    (105.5, (20, 22, 58), (90, 50, 70)),
    (108, (0, 0, 0), (0, 0, 0)),
]
_grad = np.linspace(0, 1, H, dtype=np.float32)[:, None, None]


def background(t):
    for (t0, a0, b0), (t1, a1, b1) in zip(BG_KEYS, BG_KEYS[1:]):
        if t0 <= t <= t1:
            k = ease((t - t0) / (t1 - t0)) if t1 > t0 else 1
            top = np.array(lerp_col(a0, a1, k), np.float32)
            bot = np.array(lerp_col(b0, b1, k), np.float32)
            break
    else:
        top = bot = np.zeros(3, np.float32)
    arr = top * (1 - _grad) + bot * _grad
    arr = np.broadcast_to(arr, (H, W, 3)).astype(np.uint8)
    return Image.fromarray(arr, "RGB").convert("RGBA")


# ---------------------------------------------------------------- 元素
rng = random.Random(7)
STARS = [(rng.random() * W, rng.random() * H * 0.7, rng.random() * 1.8 + 0.6,
          rng.random() * 6.28) for _ in range(140)]

# 城市窗口灯光（周五夜）
WINDOWS = []
x = 0
while x < W:
    bw = rng.randint(60, 130)
    bh = rng.randint(60, 150)
    WINDOWS.append((x, bw, bh, [(rng.random() < 0.45) for _ in range(40)]))
    x += bw + rng.randint(4, 14)

POSSIBILITIES = ["睡到自然醒", "看一场电影", "约老朋友吃火锅", "去海边", "读完那本书",
                 "打一整天游戏", "学会做一道菜", "骑车去没去过的街", "大扫除",
                 "写点东西", "去爬山", "什么都不做"]
CHOSEN = 0  # “睡到自然醒”
DOT_POS = []
for i, _ in enumerate(POSSIBILITIES):
    ang = i / len(POSSIBILITIES) * math.tau + 0.3
    r = 200 + (i % 3) * 40
    DOT_POS.append((W / 2 + math.cos(ang) * r * 1.5, 300 + math.sin(ang) * r * 0.55,
                    rng.random() * 6.28))


def draw_stars(draw, t, alpha):
    for sx, sy, r, ph in STARS:
        a = alpha * (0.45 + 0.55 * math.sin(t * 1.3 + ph) ** 2)
        draw.ellipse((sx - r, sy - r, sx + r, sy + r), fill=(255, 245, 225, int(200 * a)))


def draw_city(draw, alpha, lit=1.0):
    if alpha <= 0.01:
        return
    for x0, bw, bh, wins in WINDOWS:
        top = H - bh - 40
        draw.rectangle((x0, top, x0 + bw, H), fill=(10, 10, 22, int(235 * alpha)))
        k = 0
        for wy in range(top + 12, H - 50, 22):
            for wx in range(x0 + 10, x0 + bw - 14, 20):
                if wins[k % len(wins)] and (k * 37 % 100) / 100 < lit:
                    draw.rectangle((wx, wy, wx + 8, wy + 11),
                                   fill=(255, 196, 110, int(200 * alpha)))
                k += 1


def draw_clock(draw, text, alpha, dark=False):
    col = (40, 40, 50) if dark else (240, 235, 225)
    text_block(draw, text, 60, 60, 34, col, alpha, anchor="lm")


def draw_bar(draw, frac, alpha, dark=False):
    """“周末余额”进度条。"""
    if alpha <= 0.01:
        return
    x0, y0, bw, bh = 60, 110, 300, 14
    col_txt = (40, 40, 50) if dark else (225, 220, 210)
    draw.rounded_rectangle((x0, y0, x0 + bw, y0 + bh), 7,
                           outline=col_txt + (int(160 * alpha),), width=2)
    fill_col = lerp_col((235, 90, 80), (255, 190, 90), frac)
    if frac > 0.02:
        draw.rounded_rectangle((x0 + 3, y0 + 3, x0 + 3 + (bw - 6) * frac, y0 + bh - 3), 4,
                               fill=fill_col + (int(255 * alpha),))
    draw.text((x0 + bw + 16, y0 + bh / 2), f"周末余额 {int(round(frac * 100))}%",
              font=font(22), fill=col_txt + (int(230 * alpha),), anchor="lm")


def glow_dot(layer, x, y, r, color, alpha):
    if alpha <= 0.01 or r <= 0.5:
        return
    d = ImageDraw.Draw(layer)
    for k, s in ((3.2, 0.10), (2.0, 0.22), (1.0, 1.0)):
        rr = r * k
        d.ellipse((x - rr, y - rr, x + rr, y + rr), fill=color + (int(255 * alpha * s),))


# ---------------------------------------------------------------- 快乐曲线
def happiness(x):
    """x: 0=周五18:00, 1=周日22:00（示意曲线，非真实数据）。"""
    peak = 0.45 * math.exp(-((x - 0.07) / 0.09) ** 2)
    plateau = 0.62 - 0.25 * x
    sunday_drop = -0.38 / (1 + math.exp(-(x - 0.82) / 0.045))
    base = 0.25 + 0.45 * (1 - math.exp(-x / 0.03))
    return clamp(max(base, plateau) + peak * 0.55 + sunday_drop, 0.05, 1.0)


def draw_graph(layer, t, alpha):
    d = ImageDraw.Draw(layer)
    gx0, gy0, gx1, gy1 = 170, 150, 1110, 480
    a = int(255 * alpha)
    text_block(d, "一个周末的「快乐曲线」（示意）", W / 2, 80, 32, (235, 230, 220), alpha)
    d.line((gx0, gy1, gx1, gy1), fill=(160, 160, 170, a), width=2)
    d.line((gx0, gy0, gx0, gy1), fill=(160, 160, 170, a), width=2)
    d.text((gx0 - 18, gy0), "快乐", font=font(22), fill=(190, 190, 200, a), anchor="rm")
    for x, lab in ((0.0, "周五晚"), (0.27, "周六"), (0.63, "周日"), (1.0, "周日晚")):
        px = gx0 + (gx1 - gx0) * x
        d.line((px, gy1, px, gy1 + 8), fill=(160, 160, 170, a), width=2)
        d.text((px, gy1 + 26), lab, font=font(22), fill=(190, 190, 200, a), anchor="mm")

    prog = ease((t - 46.5) / 5.0)
    n = int(200 * prog)
    pts = []
    for i in range(n + 1):
        x = i / 200
        pts.append((gx0 + (gx1 - gx0) * x, gy1 - (gy1 - gy0) * happiness(x)))
    if len(pts) > 1:
        # 期待部分（暖色）与体验部分（冷色）
        warm = [p for p in pts if p[0] < gx0 + (gx1 - gx0) * 0.16]
        cold = [p for p in pts if p[0] >= gx0 + (gx1 - gx0) * 0.16 - 5]
        if len(warm) > 1:
            d.line(warm, fill=(255, 185, 95, a), width=5, joint="curve")
        if len(cold) > 1:
            d.line(cold, fill=(130, 170, 230, a), width=5, joint="curve")

    # 标注
    ka = fade(t, 51.5, 66, 0.8, 0.8) * alpha
    if ka > 0:
        px = gx0 + (gx1 - gx0) * 0.07
        py = gy1 - (gy1 - gy0) * happiness(0.07)
        glow_dot(layer, px, py, 7, (255, 200, 120), ka)
        text_block(d, "峰值：什么都还没发生", px + 40, py - 26, 24,
                   (255, 205, 140), ka, anchor="lm")
    kb = fade(t, 53, 66, 0.8, 0.8) * alpha
    if kb > 0:
        px = gx0 + (gx1 - gx0) * 0.9
        py = gy1 - (gy1 - gy0) * happiness(0.9)
        text_block(d, "「周一的影子」", px - 10, py - 46, 22, (150, 180, 230), kb, anchor="mm")


# ---------------------------------------------------------------- 主渲染
def render(t):
    img = background(t)
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)

    # ---- S1 片头 0–7
    text_block(d, "一个很小的问题", W / 2, 300, 30, (170, 170, 180), fade(t, 0.5, 3.6))
    text_block(d, "为什么周五晚上\n比周六更快乐？", W / 2, 360, 64, (250, 240, 225),
               fade(t, 3.0, 7.0, 1.0, 0.9))

    # ---- S2 周五夜 7–19
    night = fade(t, 7.2, 20.5, 1.5, 2.0)
    draw_stars(d, t, night)
    draw_city(d, night)
    draw_clock(d, "周五 18:47", fade(t, 8, 19.2))
    draw_bar(d, 1.0, fade(t, 8, 19.2))

    # 可能性的光点：周五出现，周六坍缩
    if 9 < t < 34:
        for i, (label, (px, py, ph)) in enumerate(zip(POSSIBILITIES, DOT_POS)):
            appear = ease((t - 9 - i * 0.28) / 0.8)
            collapse = ease((t - 20.5 - (i % 5) * 0.35) / 2.2)
            fx = px + math.sin(t * 0.8 + ph) * 8
            fy = py + math.cos(t * 0.6 + ph) * 6
            if i == CHOSEN:
                fx = lerp(fx, W / 2, collapse)
                fy = lerp(fy, 330, collapse)
                a = appear * (1 - ease((t - 31.8) / 1.5))
                r = lerp(9, 18, collapse)
                col = lerp_col((255, 210, 140), (255, 170, 90), collapse)
                lab_col = lerp_col((250, 235, 210), (60, 50, 50), ease((t - 20) / 2.5))
            else:
                a = appear * (1 - collapse)
                r = 9 * (1 - collapse * 0.7)
                col = (255, 210, 140)
                lab_col = lerp_col((250, 235, 210), (90, 90, 100), ease((t - 20) / 2.5))
            glow_dot(layer, fx, fy, r, col, a)
            text_block(d, label, fx, fy + r + 22, 24 if i != CHOSEN else int(lerp(24, 30, collapse)),
                       lab_col, a)

    caption(d, t, 9.5, 13.2, "下班了。周末，还一分钟都没用掉。", y=652, size=32, band=True)
    caption(d, t, 13.6, 19.0, "这一刻，你什么都还没做——\n却同时拥有全部的可能。", y=652, size=32, band=True)

    # ---- S3 周六上午 19–33
    day_a = fade(t, 21, 33, 1.2, 0.8)
    if day_a > 0:
        sun_y = 150
        glow_dot(layer, 1080, sun_y, 34, (255, 235, 180), day_a * 0.9)
    draw_clock(d, "周六 11:20", fade(t, 21, 33), dark=True)
    draw_bar(d, lerp(1.0, 0.72, ease((t - 22) / 8)), fade(t, 21, 33), dark=True)
    dark_txt = (45, 40, 45)
    caption(d, t, 21.5, 26.6, "到了周六，可能性开始坍缩成现实。", color=dark_txt)
    caption(d, t, 27.0, 32.8, "选择做一件事，\n就意味着放弃了其余所有。", color=dark_txt)

    # ---- S4 周六夜 33–45
    eve = fade(t, 33.8, 45.2, 1.2, 1.0)
    draw_city(d, eve * 0.8, lit=lerp(0.9, 0.3, ease((t - 36) / 8)))
    draw_clock(d, "周六 21:05", fade(t, 34, 45))
    draw_bar(d, lerp(0.72, 0.45, ease((t - 34.5) / 9)), fade(t, 34, 45))
    if eve > 0:
        # 周一的阴影从右侧逼近
        reach = ease((t - 37) / 8)
        sw = int(lerp(0, 520, reach))
        if sw > 2:
            sh = np.zeros((H, sw, 4), np.uint8)
            ramp = np.linspace(0, 1, sw, dtype=np.float32) ** 1.6
            sh[:, :, 3] = (ramp * 230 * eve)[None, :].astype(np.uint8)
            sh[:, :, :3] = (6, 6, 12)
            layer.alpha_composite(Image.fromarray(sh, "RGBA"), (W - sw, 0))
            text_block(d, "周一", W - 90, 330, 44, (120, 120, 140), eve * reach * 0.8)
    caption(d, t, 35.0, 39.6, "而且，你开始看得见终点了。", y=652, size=32, band=True)
    caption(d, t, 40.0, 44.8, "倒计时一旦开始，\n快乐就被一点一点稀释。", y=652, size=32, band=True)

    # ---- S5 曲线 45–66
    ga = fade(t, 46.0, 66.2, 1.0, 1.0)
    if ga > 0:
        draw_graph(layer, t, ga)
        d = ImageDraw.Draw(layer)
    caption(d, t, 52.0, 56.6, "快乐 = 期待 + 体验", y=610, size=40)
    caption(d, t, 57.0, 61.2, "而「期待」，是一种提前支取的快乐。", y=610)
    caption(d, t, 61.5, 66.0, "有研究发现：度假带来的幸福感，\n最明显的那一段，出现在出发之前。",
            y=605, size=32)

    # ---- S6 思考 66–82
    think = fade(t, 67, 82.2, 1.2, 1.0)
    if think > 0:
        pulse = 1 + 0.15 * math.sin(t * 2.0)
        glow_dot(layer, W / 2, 250, 14 * pulse, (255, 200, 120), think)
    caption(d, t, 68.0, 72.6, "所以，我们真正热爱的，\n也许不是周末本身——", y=430, size=42)
    caption(d, t, 73.0, 77.4, "而是「还有周末」。", y=430, size=52, color=(255, 210, 150))
    caption(d, t, 77.8, 82.2, "可能性，总是比现实更甜；\n但只有现实，才能被真正活过。", y=430, size=40)

    # ---- S7 方法 82–96
    text_block(d, "那么，怎样把周六过成周五晚上？", W / 2, 170, 40, (255, 215, 160),
               fade(t, 82.6, 96, 0.9, 1.0))
    tips = ["一、给明天，留一件小小的期待",
            "二、别让周日的焦虑，提前偷走周六",
            "三、选定了一件事，就全心投入这一件"]
    for i, tip in enumerate(tips):
        st = 84.5 + i * 2.6
        a = fade(t, st, 96, 0.9, 1.0)
        dx = (1 - ease((t - st) / 0.9)) * 30
        text_block(d, tip, 330 + dx, 300 + i * 85, 34, (235, 232, 225), a, anchor="lm")

    # ---- S8 结尾 96–108
    end_a = fade(t, 97, 108, 1.5, 2.0)
    draw_stars(d, t, end_a)
    caption(d, t, 97.5, 101.8, "周五晚上之所以快乐，\n是因为未来还很长。", y=340, size=46)
    caption(d, t, 102.2, 107.0, "愿你的每一天，\n都有一个在等你的周末。", y=340, size=46,
            color=(255, 215, 160))

    img.alpha_composite(layer)
    return img.convert("RGB")


# ---------------------------------------------------------------- 配乐（纯合成）
def note(n):  # MIDI → Hz
    return 440.0 * 2 ** ((n - 69) / 12)


def make_audio(path, sr=44100):
    n = int(TOTAL * sr)
    out = np.zeros(n, np.float32)
    # (开始时间, 时长, 和弦 MIDI 音)
    warm = [[48, 55, 64, 71], [45, 52, 60, 67], [41, 48, 57, 64], [43, 50, 59, 62]]  # Cmaj7 Am7 Fmaj7 G
    blue = [[45, 52, 60, 64], [41, 48, 57, 60], [40, 47, 55, 59], [43, 50, 55, 62]]  # Am F Em G
    plan = []
    t = 0.0
    while t < TOTAL:
        seq = blue if 33 <= t < 82 else warm
        plan.append((t, seq[int(t / 4) % 4]))
        t += 4.0
    for st, chord in plan:
        dur = 5.5
        i0 = int(st * sr)
        m = min(int(dur * sr), n - i0)
        tt = np.arange(m) / sr
        env = np.minimum(tt / 1.6, 1.0) * np.clip((dur - tt) / 2.5, 0, 1)
        for k, mn in enumerate(chord):
            f = note(mn)
            v = 0.08 if k == 0 else 0.05
            s = np.sin(2 * np.pi * f * tt) + 0.25 * np.sin(2 * np.pi * 2 * f * tt + 0.3)
            s *= 1 + 0.003 * np.sin(2 * np.pi * 0.3 * tt)  # 轻微起伏
            out[i0:i0 + m] += (v * env * s).astype(np.float32)
    # 周六夜的钟表滴答声（倒计时）
    for sec in np.arange(37.0, 45.0, 1.0):
        i0 = int(sec * sr)
        m = int(0.05 * sr)
        tt = np.arange(m) / sr
        out[i0:i0 + m] += (0.12 * np.exp(-tt * 120) * np.sin(2 * np.pi * 2200 * tt)).astype(np.float32)
    # 首尾淡入淡出
    fi, fo = int(2 * sr), int(3 * sr)
    out[:fi] *= np.linspace(0, 1, fi)
    out[-fo:] *= np.linspace(1, 0, fo)
    out = out / (np.abs(out).max() + 1e-6) * 0.7
    pcm = (out * 32767).astype(np.int16)
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(pcm.tobytes())


def main():
    audio = OUT_DIR / "_music.wav"
    make_audio(audio)
    out = OUT_DIR / "friday_night.mp4"
    cmd = ["ffmpeg", "-y", "-loglevel", "error",
           "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
           "-i", str(audio),
           "-c:v", "libx264", "-preset", "medium", "-crf", "22", "-pix_fmt", "yuv420p",
           "-c:a", "aac", "-b:a", "128k", "-shortest", "-movflags", "+faststart", str(out)]
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
    import sys
    if len(sys.argv) > 1 and sys.argv[1] == "preview":
        for ts in sys.argv[2:]:
            render(float(ts)).save(OUT_DIR / f"_preview_{ts}.png")
    else:
        main()
