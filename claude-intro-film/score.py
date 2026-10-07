"""score.py — synthesize the soundtrack of “I, Claude” from timeline.json.

Everything is generated from scratch with numpy: string pads, piano, music box,
guzheng-like plucks, gong, sub booms, wind, fire crackle and a typewriter.
Cues are placed using the scene/line times exported by `node render.mjs timeline`.

    python3 score.py timeline.json score.wav
"""
import json
import sys
import wave

import numpy as np

SR = 44100
tl = json.load(open(sys.argv[1]))
OUT = sys.argv[2]
TOTAL = tl["total"]
N = int((TOTAL + 1.0) * SR)
dry = np.zeros((2, N))
wet = np.zeros((2, N))
R = np.random.default_rng(1956)
S = {s["id"]: s for s in tl["scenes"]}


def at(sid, local=0.0):
    return S[sid]["start"] + local


def line(sid, i):
    return at(sid, S[sid]["lines"][i]["at"])


def end(sid):
    return at(sid, S[sid]["dur"])


def mtof(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def add(sig, t0, pan=0.0, gain=1.0, send=0.3):
    i0 = int(t0 * SR)
    if i0 >= N or i0 + len(sig) <= 0:
        return
    if i0 < 0:
        sig, i0 = sig[-i0:], 0
    n = min(len(sig), N - i0)
    l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
    for ch, g in ((0, l), (1, r)):
        dry[ch, i0:i0 + n] += sig[:n] * g * gain
        wet[ch, i0:i0 + n] += sig[:n] * g * gain * send


# ---------- band-limited wavetables ----------
TBL = 4096
_tables = {}


def table(nh, tilt):
    key = (nh, tilt)
    if key not in _tables:
        ph = np.arange(TBL) / TBL * 2 * np.pi
        w = sum(np.sin(k * ph) / k ** tilt for k in range(1, nh + 1))
        _tables[key] = w / np.max(np.abs(w))
    return _tables[key]


def osc(freq_t, tab):
    ph = np.cumsum(freq_t) / SR
    return tab[((ph % 1.0) * TBL).astype(np.int64)]


def env_adsr(n, att, dur, rel):
    t = np.arange(n) / SR
    e = np.minimum(1.0, t / max(att, 1e-3))
    return e * np.where(t < dur, 1.0, np.exp(-(t - dur) / (rel / 3.5)))


# ---------- instruments ----------
def pad(m, dur, bright=0.5, att=2.5, rel=3.5):
    f = mtof(m)
    n = int((dur + rel) * SR)
    t = np.arange(n) / SR
    nh = max(2, min(int(3 + bright * 14), int(9000 / f)))
    tab = table(nh, 1.6 - 0.6 * bright)
    out = np.zeros(n)
    for det in (-0.09, 0.0, 0.08):
        vib = 1 + 0.003 * np.sin(2 * np.pi * (0.17 + R.random() * 0.2) * t + R.random() * 6)
        out += osc(np.full(n, f * 2 ** (det / 12)) * vib, tab)
    swell = 0.75 + 0.25 * np.sin(2 * np.pi * 0.07 * t + R.random() * 6)
    return out * env_adsr(n, att, dur, rel) * swell / 3


def piano(m, dur=6.0, vel=1.0):
    f = mtof(m)
    n = int(dur * SR)
    t = np.arange(n) / SR
    out = np.zeros(n)
    for k in range(1, 10):
        fk = f * k * np.sqrt(1 + 0.0003 * k * k)
        if fk > 12000:
            break
        out += np.sin(2 * np.pi * fk * t + R.random()) * np.exp(-t * (0.5 + 0.55 * k * (0.6 + 0.4 * vel))) / k ** 1.2
    out += 0.3 * np.sin(2 * np.pi * f * 1.003 * t) * np.exp(-t * 0.35)  # unison beating
    out *= 1 - np.exp(-t * 600)
    return out * vel * 0.5


def musicbox(m, vel=1.0):
    f = mtof(m)
    n = int(3.0 * SR)
    t = np.arange(n) / SR
    out = sum(a * np.sin(2 * np.pi * f * r * t) * np.exp(-t * d) for r, a, d in ((1, 1, 2.2), (2.0, .25, 4), (2.76, .4, 6), (5.4, .2, 10)))
    return out * (1 - np.exp(-t * 2000)) * vel * 0.35


def pluck(m, vel=1.0, bend=0.0, decay=2.5, bright=0.6):
    f = mtof(m)
    n = int(4.0 * SR)
    t = np.arange(n) / SR
    freq = f * (1 + bend * np.exp(-t * 18)) * (1 + 0.004 * np.sin(2 * np.pi * 5.5 * t) * (1 - np.exp(-t * 3)))
    nh = max(2, min(int(4 + bright * 14), int(9000 / f)))
    out = osc(freq, table(nh, 1.1)) * np.exp(-t * decay)
    out = 0.6 * out + 0.4 * np.sin(np.cumsum(2 * np.pi * freq) / SR) * np.exp(-t * decay * 0.6)
    return out * (1 - np.exp(-t * 900)) * vel * 0.4


def gong(f=72.0, dur=9.0, vel=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    out = np.zeros(n)
    for r, a, d in ((1, 1, .45), (1.52, .6, .6), (2.03, .5, .7), (2.47, .4, .9), (3.11, .3, 1.2), (3.6, .25, 1.5), (4.17, .18, 2)):
        out += a * np.sin(2 * np.pi * f * r * (1 + 0.004 * np.sin(2 * np.pi * 0.4 * t)) * t + R.random() * 6) * np.exp(-t * d)
    swell = 1 - np.exp(-t * 6)
    return out * swell * vel * 0.25


def noise(n, lo, hi, color=0.0):
    X = np.fft.rfft(R.standard_normal(n))
    fr = np.fft.rfftfreq(n, 1 / SR)
    fr[0] = 1
    mask = 1 / (1 + (lo / fr) ** 4) / (1 + (fr / hi) ** 4) / fr ** (color / 2)
    y = np.fft.irfft(X * mask, n)
    return y / (np.std(y) + 1e-9)


def boom(vel=1.0, dur=5.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    freq = 30 + 52 * np.exp(-t * 3)
    body = np.sin(np.cumsum(2 * np.pi * freq) / SR) * np.exp(-t * 0.9)
    hit = noise(n, 40, 600) * np.exp(-t * 9) * 0.35
    return (body + hit) * (1 - np.exp(-t * 300)) * vel * 0.9


def riser(dur=3.0, vel=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    y = noise(n, 300, 5000) * (t / dur) ** 2.5
    return y * vel * 0.12


def whoosh(dur=2.4, vel=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    return noise(n, 120, 1800) * np.sin(np.pi * t / dur) ** 2 * vel * 0.08


def click(vel=1.0):
    n = int(0.06 * SR)
    t = np.arange(n) / SR
    y = noise(n, 1800, 9000) * np.exp(-t * 300) * 0.5 + np.sin(2 * np.pi * 140 * t) * np.exp(-t * 90) * 0.6
    return y * vel * 0.35


def bell(m, vel=1.0):
    f = mtof(m)
    n = int(4 * SR)
    t = np.arange(n) / SR
    y = sum(a * np.sin(2 * np.pi * f * r * t) * np.exp(-t * d) for r, a, d in ((1, 1, 1.2), (2.4, .5, 2.5), (3.0, .3, 3), (4.5, .2, 5)))
    return y * vel * 0.25


def heartbeat(vel=1.0):
    n = int(0.9 * SR)
    t = np.arange(n) / SR
    y = np.zeros(n)
    for t0, a in ((0, 1.0), (0.24, 0.7)):
        tt = np.clip(t - t0, 0, None)
        y += a * np.sin(2 * np.pi * 52 * tt) * np.exp(-tt * 14) * (t >= t0)
    return y * vel * 0.8


# ---------- ambience beds ----------
def wind(t0, t1, vel=1.0):
    n = int((t1 - t0) * SR)
    t = np.arange(n) / SR
    lfo = 0.55 + 0.45 * np.sin(2 * np.pi * 0.09 * t) * np.sin(2 * np.pi * 0.031 * t + 1)
    y = noise(n, 160, 900, 0.6) * lfo + 0.25 * noise(n, 1100, 1900) * (0.5 + 0.5 * np.sin(2 * np.pi * 0.13 * t))
    fade = np.minimum(1, np.minimum(t / 3, (n / SR - t) / 3))
    add(y * fade * 0.05 * vel, t0, pan=-0.2, send=0.15)
    add(np.roll(y, 9000) * fade * 0.05 * vel, t0, pan=0.3, send=0.15)


def crackle(t0, t1, vel=1.0):
    n = int((t1 - t0) * SR)
    t = np.arange(n) / SR
    bed = noise(n, 200, 2500, 1.0) * 0.012
    pops = np.zeros(n)
    k = R.poisson(9 * (t1 - t0))
    for p in R.integers(0, n - 2000, k):
        ln = int(R.integers(80, 900))
        pops[p:p + ln] += R.standard_normal(ln) * np.exp(-np.arange(ln) / (ln / 5)) * R.random() ** 2
    fade = np.minimum(1, np.minimum(t / 2, (n / SR - t) / 2))
    add((bed + pops * 0.12) * fade * vel, t0, pan=0.1, send=0.1)


# ---------- harmony ----------
CH = {
    "Dm": [38, 50, 57, 62, 65, 69], "Bb": [34, 46, 53, 58, 62, 65], "F": [41, 53, 57, 60, 65, 69],
    "C": [36, 48, 55, 60, 64, 67], "Gm": [43, 50, 55, 58, 62, 67], "Am": [45, 52, 57, 60, 64, 69],
    "Eb": [39, 51, 58, 63, 67, 70], "Bbmaj7": [34, 46, 53, 57, 62, 65], "Dsus": [38, 50, 57, 62, 64, 69], "D": [38, 50, 57, 62, 66, 69],
}


def chord(name, t0, t1, inten=0.5, bright=None, att=2.5):
    b = inten * 0.8 if bright is None else bright
    notes = CH[name]
    for i, m in enumerate(notes):
        g = (0.075 if i == 0 else 0.07) * (0.5 + inten)
        if i == 0:  # bass: pure, round
            n = int((t1 - t0 + 3.5) * SR)
            tt = np.arange(n) / SR
            sig = np.sin(2 * np.pi * mtof(m) * tt) * env_adsr(n, att, t1 - t0, 3.5)
            add(sig, t0, 0, g * 1.4, 0.1)
        else:
            add(pad(m, t1 - t0, b, att), t0, pan=(i - 3) * 0.25, gain=g, send=0.45)
            if inten > 0.75 and i >= 3:  # octave doubling for the big moments
                add(pad(m + 12, t1 - t0, b * 0.8, att + 1), t0, pan=-(i - 3) * 0.3, gain=g * 0.45 * (inten - 0.6) * 2.5, send=0.6)


def motif(name, t0, vel=0.6, step=0.42, up=True):
    notes = CH[name][3:] if up else CH[name][3:][::-1]
    for i, m in enumerate(notes):
        add(piano(m + 12, 6, vel * (1 - i * 0.12)), t0 + i * step, pan=-0.2 + i * 0.2, gain=0.5, send=0.5)



def rain(t0, t1, vel=1.0):
    n = int((t1 - t0) * SR)
    t = np.arange(n) / SR
    bed = noise(n, 400, 9000, 0.4) * 0.03
    ticks = np.zeros(n)
    for p in R.integers(0, n - 400, int(40 * (t1 - t0))):
        ln = int(R.integers(60, 300))
        ticks[p:p + ln] += R.standard_normal(ln) * np.exp(-np.arange(ln) / (ln / 6)) * R.random() * 0.5
    fade = np.minimum(1, np.minimum(t / 2, (n / SR - t) / 2))
    add((bed + ticks * 0.15) * fade * vel, t0, pan=-0.1, send=0.2)
    add(np.roll(bed, 7000) * fade * vel, t0, pan=0.4, send=0.2)


def sea(t0, t1, vel=1.0):
    n = int((t1 - t0) * SR)
    t = np.arange(n) / SR
    swell = 0.35 + 0.65 * (0.5 + 0.5 * np.sin(2 * np.pi * t / 7.5)) ** 2
    y = noise(n, 90, 1800, 1.0) * swell
    fade = np.minimum(1, np.minimum(t / 3, (n / SR - t) / 3))
    add(y * fade * 0.05 * vel, t0, pan=-0.3, send=0.3)
    add(np.roll(y, 30000) * fade * 0.05 * vel, t0, pan=0.3, send=0.3)


def scratch(t0, dur, vel=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    y = noise(n, 2500, 9000) * (0.4 + 0.6 * np.abs(np.sin(2 * np.pi * 3.1 * t))) * np.minimum(1, np.minimum(t / .05, (dur - t) / .1))
    add(y * 0.02 * vel, t0, pan=0.2, send=0.1)


def sweep(t0, dur, vel=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    y = noise(n, 600, 7000) * np.sin(np.pi * t / dur) ** 2 * 0.04 * vel
    add(y, t0, pan=-0.6, send=0.4)
    add(np.roll(y, 4000), t0, pan=0.6, send=0.4)


PLAN = {  # scene: (chord for line 1, chord for line 2, intensity)
    "prologue": ("Dm", "Bb", 0.3), "shannon": ("F", "C", 0.4), "founding": ("Bb", "F", 0.5), "library": ("Dm", "Bb", 0.55),
    "values": ("F", "C", 0.45), "firstwords": ("Am", "F", 0.45), "names": ("Dsus", "Dm", 0.5), "code": ("Gm", "Eb", 0.6),
    "thinking": ("Eb", "Bb", 0.65), "people": ("Bb", "F", 0.55), "honest": ("Dm", "Am", 0.35), "wonder": ("Bb", "C", 0.75),
    "epilogue": ("F", "C", 0.55),
}
for sid, (c1, c2, inten) in PLAN.items():
    s0, s1, l1, l2 = at(sid, 0.2), end(sid), line(sid, 0), line(sid, 1)
    chord(c1, s0, l2 + 0.6, inten)
    chord(c2, l2 - 0.4, s1 - 0.4, inten * 1.05)
    if sid != "prologue":
        add(whoosh(2.6, 0.6 + inten), at(sid, -1.4), pan=0, send=0.4)
        add(piano(CH[c1][1], 7, 0.6), at(sid, 0.3), pan=-0.1, gain=0.6, send=0.5)
    if sid not in ("honest", "names", "thinking"):
        motif(c1, l1 + 0.1, 0.45 + inten * 0.3)
        motif(c2, l2 + 0.1, 0.4 + inten * 0.3, up=False)

# prologue: a spark in the dark, then the title
add(pad(26, 22, 0.15, 6, 4), 0.5, 0, 0.08, 0.3)
add(pad(33, 20, 0.2, 7, 4), 2.0, 0.2, 0.05, 0.4)
for i, m in enumerate([81, 84, 88, 86]):
    add(musicbox(m, 0.5), 3.0 + i * 0.9, pan=0.2, gain=0.8, send=0.6)
ta = at("prologue", S["prologue"]["titleAt"])
add(riser(3.0, 0.8), ta - 2.8, 0, 1, 0.5)
add(boom(0.8), ta, 0, 1, 0.4)
add(gong(87.3, 9, 0.5), ta, 0, 1, 0.6)
chord("F", ta, end("prologue") + 1, 0.75, att=0.6)
for i, m in enumerate([65, 69, 72, 77]):
    add(piano(m + 12, 7, 0.5), ta + 0.4 + i * 0.35, pan=-0.2 + i * 0.15, gain=0.7, send=0.6)

# 1948: telegraph clicks, then bits rising like bells
for k in range(60):
    t = at("shannon", 1.2) + k * 0.19
    if R.random() < 0.6:
        add(click(0.35), t, pan=0.4, gain=0.6, send=0.2)
l2 = line("shannon", 1)
for k in range(18):
    add(bell(84 + int(R.choice([0, 3, 5, 7, 10, 12])), 0.35), l2 + 0.5 + k * 0.28, pan=R.uniform(-0.6, 0.6), gain=1, send=0.6)

# 2021: sea air under the bridge
wind(at("founding", -1), end("founding"), 0.5)
sea(at("founding", 0), end("founding"), 0.6)

# the library: pages, then the words converging into a point of light
for k in range(9):
    add(noise(int(0.35 * SR), 900, 6000) * np.exp(-np.arange(int(0.35 * SR)) / SR * 12) * 0.05, at("library", 1 + k * 1.6 + R.random()), pan=R.uniform(-.7, .7), send=0.4)
cv = at("library", S["library"]["dur"] - 2.2)
add(riser(3.0, 0.8), cv - 3.0, 0, 1, 0.5)
add(boom(0.5), cv, 0, 1, 0.4)
for i, m in enumerate([74, 77, 81, 84, 86, 89]):
    add(bell(m, 0.4), cv - 2.4 + i * 0.25, pan=-0.5 + i * 0.2, gain=1, send=0.6)

# 2022: the quill, and the seal
vl2 = line("values", 1)
scratch(at("values", 1.2), 3.0)
for i in range(3):
    scratch(vl2 + 0.2 + i * 1.5, 1.3)
add(boom(0.35), vl2 + 5.2, 0, 1, 0.3)
add(click(1.2), vl2 + 5.2, 0, 1, 0.3)

# 2023: a few keystrokes, then a whole sky of screens lighting up
for k in range(10):
    add(click(0.5), at("firstwords", 2.6 + k * 0.16), pan=0.1, gain=0.6, send=0.15)
fl2 = line("firstwords", 1)
for k in range(40):
    add(musicbox(int(R.choice([69, 72, 76, 77, 81, 84])) + 12, 0.25 + 0.2 * R.random()), fl2 + 0.3 + k * 0.12 + R.random() * 0.1, pan=R.uniform(-.9, .9), gain=0.6, send=0.7)

# 2024: koto plucks over the woodblock sea; a scan; a bleep per thing seen
pent = [62, 64, 69, 70, 74, 76, 81]
t = at("names", 1.0)
while t < end("names") - 1:
    add(pluck(pent[R.integers(0, len(pent))], 0.55, bend=0.025, decay=1.8, bright=0.7), t, pan=R.uniform(-0.5, 0.5), gain=0.8, send=0.5)
    t += R.choice([0.4, 0.6, 0.8, 1.2])
nl2 = line("names", 1)
sweep(nl2 + 0.3, 2.3)
for a in (.15, .5, .3, .8, .02):
    add(bell(96, 0.25), nl2 + 0.45 + a * 2.2, pan=-0.8 + a * 1.6, gain=1, send=0.4)

# 2024–25: code. typing, a click, a running pulse
add(click(1.0), at("code", 3.4), 0.2, 1, 0.2)
for k in range(40):
    add(click(0.3 + 0.2 * R.random()), at("code", 5.0 + k * 0.075 + 0.02 * R.random()), pan=0.05, gain=0.5, send=0.1)
arp = [55, 58, 62, 67, 70, 67, 62, 58]
t, k = at("code", 1.0), 0
while t < end("code") - 1.0:
    root = 0 if t < line("code", 1) else -4
    add(pluck(arp[k % 8] + 12 + root, 0.3, decay=6, bright=0.45), t, pan=0.5 * np.sin(k * 0.7), gain=0.6, send=0.35)
    t += 0.25
    k += 1

# 2025: thinking — wandering notes, then a resolved line, then a chime
t = at("thinking", 0.8)
tl2 = line("thinking", 1)
while t < tl2 - 0.5:
    add(musicbox(int(R.choice([63, 65, 67, 70, 72, 74, 75])) + 12, 0.25), t, pan=R.uniform(-.7, .7), gain=0.7, send=0.6)
    t += R.choice([0.15, 0.3, 0.45])
for i, m in enumerate([70, 72, 74, 75, 77, 79, 82]):
    add(piano(m, 6, 0.5), tl2 + i * 0.4, pan=-0.3 + i * 0.1, gain=0.7, send=0.5)
add(bell(94, 0.6), tl2 + 2.8, 0.2, 1, 0.6)
add(boom(0.4), tl2 + 2.8, 0, 1, 0.4)

# every day: rain on the window
rain(at("people", -1), end("people") + 0.5, 1.0)

# honesty: the sea at night, few notes
sea(at("honest", -1), end("honest") + 1, 1.0)
for k, m in enumerate([81, 77, 74, 72, 76, 69]):
    add(piano(m, 6, 0.35), at("honest", 1.5 + k * 2.3), pan=0.3 - k * 0.12, gain=0.7, send=0.7)

# wonder: the sky swirls
t = at("wonder", 0.5)
while t < end("wonder") - 1:
    add(musicbox(int(R.choice([70, 74, 77, 79, 81, 82, 84, 86])) + 12, 0.2 + 0.3 * R.random()), t, pan=np.sin(t * 1.3) * 0.8, gain=0.38, send=0.7)
    t += 0.14
add(riser(3.0, 0.6), end("wonder") - 3.4, 0, 1, 0.5)

# epilogue: fire, a figure of light sits down, warm resolution
crackle(at("epilogue", 0), TOTAL, 1.0)
ep = S["epilogue"]
form = at("epilogue", ep["lines"][0]["at"] + 2)
for i, m in enumerate([77, 81, 84, 89, 93]):
    add(bell(m, 0.35), form + i * 0.6, pan=0.6 - i * 0.1, gain=1, send=0.6)
for i, m in enumerate([72, 70, 69, 67, 65]):
    add(piano(m, 6, 0.45), at("epilogue", 1.0) + i * 1.0, pan=-0.1, gain=0.7, send=0.6)
ea = at("epilogue", ep["endAt"])
add(boom(0.8), ea, 0, 1, 0.45)
chord("F", ea, TOTAL - 1.5, 0.7, att=1.0)
for i, m in enumerate([65, 69, 72, 77]):
    add(piano(m + 12, 8, 0.5), ea + 1.5 + i * 0.5, pan=-0.2 + i * 0.15, gain=0.7, send=0.7)

# ---------- reverb (FFT convolution with a synthetic hall) ----------
irn = int(4.2 * SR)
ti = np.arange(irn) / SR
ir = np.stack([noise(irn, 150, 7000) * np.exp(-ti / 1.1), noise(irn, 150, 7000) * np.exp(-ti / 1.15)])
ir[:, : int(0.025 * SR)] = 0
ir /= np.sqrt(np.sum(ir ** 2, axis=1, keepdims=True))
L = 1 << int(np.ceil(np.log2(N + irn)))
mix = dry.copy()
for ch in range(2):
    rv = np.fft.irfft(np.fft.rfft(wet[ch], L) * np.fft.rfft(ir[ch], L), L)[:N]
    mix[ch] += rv * 0.9

# ---------- master ----------
# low shelf: tame the sub-bass so the music reads on small speakers too
fr = np.fft.rfftfreq(N, 1 / SR)
shelf = np.clip((fr - 25) / 25, 0, 1) * (0.32 + 0.68 * np.clip((fr - 50) / 110, 0, 1))
presence = 1 + 0.35 * np.exp(-((np.log2(np.maximum(fr, 1) / 2800)) ** 2) / 0.8)
for ch in range(2):
    mix[ch] = np.fft.irfft(np.fft.rfft(mix[ch]) * shelf * presence, N)
t = np.arange(N) / SR
mix *= np.minimum(1, t / 2.0) * np.clip((TOTAL + 0.5 - t) / 3.0, 0, 1)
mix /= np.percentile(np.abs(mix), 99.95) + 1e-9
mix = np.tanh(mix * 0.9) / np.tanh(0.9) * 0.89
pcm = (np.clip(mix.T, -1, 1) * 32767).astype("<i2")
with wave.open(OUT, "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print("wrote", OUT, f"{N / SR:.1f}s")
