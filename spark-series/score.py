"""score.py — an original, beat-synced soundtrack for version two of both episodes.

Reads the shot list exported by `EP=n node render.mjs timeline out/epn.json` and writes a
stereo WAV whose bars line up with the 84 BPM cut: hits on every montage shot, a slam on
the title, risers into the time warps, quiet bridges, a full chorus and a resolving outro.

    python3 score.py out/ep1.json 1 out/ep1-music.wav
"""
import json
import sys
import wave

import numpy as np

SR = 44100
tl = json.load(open(sys.argv[1]))
EP = int(sys.argv[2])
OUT = sys.argv[3]
TOTAL = tl["total"]
N = int((TOTAL + 1.0) * SR)
dry = np.zeros((2, N))
wet = np.zeros((2, N))
R = np.random.default_rng(84 + EP)
BPM = tl["scenes"]["bpm"]
BEAT = 60 / BPM
BAR = 4 * BEAT
SHOTS = tl["scenes"]["shots"]


def mtof(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def add(sig, t0, pan=0.0, gain=1.0, send=0.3):
    i0 = int(round(t0 * SR))
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


# ---------- drums & extra sound design ----------
def kick(vel=1.0):
    n = int(.5 * SR); t = np.arange(n) / SR
    f = 46 + 110 * np.exp(-t * 28)
    return (np.sin(np.cumsum(2 * np.pi * f) / SR) * np.exp(-t * 7) + noise(n, 1500, 6000) * np.exp(-t * 120) * .15) * vel * .9


def snare(vel=1.0):
    n = int(.4 * SR); t = np.arange(n) / SR
    return (noise(n, 900, 9000) * np.exp(-t * 16) * .55 + np.sin(2 * np.pi * 190 * t) * np.exp(-t * 22) * .5) * vel * .55


def hat(vel=1.0):
    n = int(.08 * SR); t = np.arange(n) / SR
    return noise(n, 7000, 16000) * np.exp(-t * 60) * vel * .18


def crash(vel=1.0, dur=3.0):
    n = int(dur * SR); t = np.arange(n) / SR
    return noise(n, 3000, 15000, .3) * np.exp(-t * 1.6) * (1 - np.exp(-t * 400)) * vel * .22


def revcym(dur=1.2, vel=1.0):
    return crash(vel, dur)[::-1].copy()


def tom(m, vel=1.0):
    n = int(.6 * SR); t = np.arange(n) / SR
    f = mtof(m) * (1 + .5 * np.exp(-t * 30))
    return np.sin(np.cumsum(2 * np.pi * f) / SR) * np.exp(-t * 6) * vel * .6


def hit(vel=1.0):  # cinematic impact: sub boom plus a short crack
    y = boom(vel * .8, 2.5); n = int(.25 * SR)
    y[:n] += noise(n, 200, 5000) * np.exp(-np.arange(n) / SR * 18) * .4 * vel
    return y


def downlift(dur=1.5, vel=1.0):
    n = int(dur * SR); t = np.arange(n) / SR
    f = 900 * np.exp(-t * 3) + 60
    return np.sin(np.cumsum(2 * np.pi * f) / SR) * np.exp(-t * 1.5) * .15 * vel + noise(n, 200, 3000) * np.exp(-t * 3) * .05 * vel


def rain(t0, t1, vel=1.0):
    n = int((t1 - t0) * SR); t = np.arange(n) / SR
    bed = noise(n, 400, 9000, .4) * .03
    ticks = np.zeros(n)
    for p in R.integers(0, max(1, n - 400), int(40 * (t1 - t0))):
        ln = int(R.integers(60, 300)); ticks[p:p + ln] += R.standard_normal(ln) * np.exp(-np.arange(ln) / (ln / 6)) * R.random() * .5
    fade = np.minimum(1, np.minimum(t / 1, (n / SR - t) / 1))
    add((bed + ticks * .15) * fade * vel, t0, pan=-.1, send=.2); add(np.roll(bed, 7000) * fade * vel, t0, pan=.4, send=.2)


def sea(t0, t1, vel=1.0):
    n = int((t1 - t0) * SR); t = np.arange(n) / SR
    y = noise(n, 90, 1800, 1.0) * (.35 + .65 * (.5 + .5 * np.sin(2 * np.pi * t / 5.5)) ** 2)
    fade = np.minimum(1, np.minimum(t / 1.5, (n / SR - t) / 1.5))
    add(y * fade * .05 * vel, t0, pan=-.3, send=.3); add(np.roll(y, 30000) * fade * .05 * vel, t0, pan=.3, send=.3)


# ---------- harmony & theme (D minor) ----------
CH = {"Dm": [38, 50, 57, 62, 65, 69], "Bb": [34, 46, 53, 58, 62, 65], "F": [41, 53, 57, 60, 65, 69], "C": [36, 48, 55, 60, 64, 67],
      "Gm": [43, 50, 55, 58, 62, 67], "A": [45, 52, 57, 61, 64, 69], "D": [38, 50, 57, 62, 66, 69]}
PROG = ["Dm", "Bb", "F", "C"]
SAD = ["Dm", "Bb", "Gm", "A"]
# an original eight-bar melody: (beat offset, midi note, length in beats)
THEME = [(0, 74, 1.5), (1.5, 77, .5), (2, 81, 1), (3, 79, 1), (4, 77, 1.5), (5.5, 76, .5), (6, 74, 2),
         (8, 74, 1), (9, 77, 1), (10, 77, 1), (11, 81, 1), (12, 79, 3), (15, 77, 1),
         (16, 77, 1.5), (17.5, 79, .5), (18, 81, 1), (19, 84, 1), (20, 82, 1.5), (21.5, 81, .5), (22, 79, 2),
         (24, 77, 1), (25, 76, 1), (26, 74, 1), (27, 73, 1), (28, 74, 4)]


def bars_in(t0, t1):
    return range(int(round(t0 / BAR)), int(round(t1 / BAR)))


def chord_bar(name, b, inten, bright=None):
    t0 = b * BAR; notes = CH[name]
    n = int((BAR + 1.2) * SR); tt = np.arange(n) / SR
    add(np.sin(2 * np.pi * mtof(notes[0]) * tt) * env_adsr(n, .05, BAR, 1.2) * .7, t0, 0, .09 * (.5 + inten), .1)
    for i, m in enumerate(notes[1:]):
        add(pad(m, BAR + .1, bright if bright is not None else inten * .8, .25, 1.4), t0, pan=(i - 2) * .3, gain=.05 * (.5 + inten), send=.45)


def arp_bar(name, b, vel=.45, octave=12, pattern=(1, 3, 2, 4, 3, 2, 4, 3)):
    notes = CH[name]
    for k, idx in enumerate(pattern):
        add(piano(notes[idx] + octave, 3, vel * (1 if k % 2 == 0 else .8)), b * BAR + k * BEAT / 2, pan=-.3 + .08 * k, gain=.55, send=.4)


def melody(b0, nbars, lead=True, vel=.6, octave=0):
    for (bt, m, ln) in THEME:
        if bt >= nbars * 4: break
        t = b0 * BAR + bt * BEAT
        add(piano(m + octave, max(2.5, ln * BEAT + 1.5), vel), t, pan=.1, gain=.7, send=.5)
        if lead: add(bell(m + 12 + octave, .22), t, pan=-.15, gain=1, send=.6)


def drums_bar(b, full, vel=1.0):
    t0 = b * BAR
    if full:
        for bt in (0, 1.5, 2.5): add(kick(vel), t0 + bt * BEAT, 0, 1, .05)
        for bt in (1, 3): add(snare(vel), t0 + bt * BEAT, .05, 1, .25)
        for k in range(8): add(hat(.8 if k % 2 else .5), t0 + k * BEAT / 2, .3, 1, .1)
    else:
        for bt in (0, 2): add(kick(vel * .7), t0 + bt * BEAT, 0, 1, .05)
        for bt in (1, 3): add(click(.35 * vel), t0 + bt * BEAT, .2, .8, .2)


def build_bar(b, nb=1):
    t0 = b * BAR; L = nb * BAR; steps = int(nb * 16)
    for k in range(steps): add(snare(.25 + .6 * k / steps), t0 + k * BEAT / 4, .05, .9, .2)
    for k, m in enumerate([50, 47, 45, 43]): add(tom(m, .8), t0 + L - BEAT + k * BEAT / 4, -.3 + .2 * k, 1, .2)
    add(riser(L, .9), t0, 0, 1, .5)


# ---------- read the cut ----------
def kind(i, s):
    sc, d = s["sc"], s["dur"]
    if d < BEAT * 1.5: return "montage"
    if sc == "warp": return "warp"
    if EP == 1:
        if sc == "fire": return "intro" if i == 0 else ("end" if s.get("card") else "outro")
        if sc == "e1prologue": return "title"
        if sc in ("winter", "backprop"): return "bridge"
        if sc in ("talos", "ada", "turing", "dartmouth", "perceptron"): return "verse"
        return "chorus"
    if sc == "fire": return "intro"
    if sc == "spark": return "title" if s.get("title") else "intro"
    if sc == "fireme": return "end" if s.get("card") else "outro"
    if sc in ("people", "honest"): return "bridge"
    if sc == "wonder": return "build"
    if sc in ("shannon", "founding", "library", "values"): return "verse"
    return "chorus"


for i, s in enumerate(SHOTS): s["kind"] = kind(i, s)
SECT = []
for i, s in enumerate(SHOTS):
    k = s["kind"]
    if k == "warp" and i + 1 < len(SHOTS) and SHOTS[i + 1]["kind"] == "chorus": k = "warpbuild"
    if SECT and SECT[-1][0] == k: SECT[-1][2] = s["start"] + s["dur"]
    else: SECT.append([k, s["start"], s["start"] + s["dur"]])
print("sections:", [(k, round(a / BAR, 2), round(b / BAR, 2)) for k, a, b in SECT])

prog_i = 0
for k, a, b in SECT:
    bars = list(bars_in(a, b))
    if k == "intro":
        for bb in bars: chord_bar("Dm" if bb % 2 == 0 else "Bb", bb, .25, .15)
        melody(bars[0], len(bars), lead=False, vel=.4)
    elif k == "montage":
        add(riser(b - a, 1.0), a, 0, 1, .5)
        for s in SHOTS:
            if s["kind"] == "montage" and a - .01 <= s["start"] < b:
                add(hit(.55), s["start"], R.uniform(-.3, .3), 1, .35); add(kick(.9), s["start"], 0, 1, .05)
        for bb in bars:
            chord_bar("Dm", bb, .6, .5)
            for q in range(16): add(pluck(CH["Dm"][1 + q % 3] + 12, .35 + .3 * (q / 16), decay=10, bright=.6), bb * BAR + q * BEAT / 4, (-.4, .4)[q % 2], .7, .2)
    elif k == "title":
        add(hit(1.2), a, 0, 1, .4); add(crash(1.0, 4), a, 0, 1, .4); add(gong(73.4, 9, .9), a, 0, 1, .6)
        for j, bb in enumerate(bars): chord_bar(("Dm", "Bb", "F", "C")[j % 4], bb, .9, .7)
        for j, m in enumerate([62, 65, 69, 74]): add(piano(m + 12, 6, .6), a + .2 + j * BEAT / 2, -.2 + j * .15, .7, .6)
    elif k == "verse":
        for bb in bars:
            name = PROG[prog_i % 4]; prog_i += 1
            chord_bar(name, bb, .5); arp_bar(name, bb); drums_bar(bb, False, .8)
        for j in range(0, len(bars), 8): melody(bars[j], min(8, len(bars) - j), lead=False, vel=.45)
    elif k in ("warp", "warpbuild"):
        add(whoosh(b - a + .4, 1.6), a - .2, 0, 1, .5); add(riser(b - a, 1.0), a, 0, 1, .5)
        if k == "warpbuild": build_bar(bars[0], len(bars))
        else: add(downlift(1.8, 1.0), b - .3, 0, 1, .5)
        add(crash(.9, 3), b, 0, 1, .4); add(hit(.9), b, 0, 1, .4)
        for bb in bars: chord_bar("A", bb, .5, .5)
    elif k == "bridge":
        for j, bb in enumerate(bars): chord_bar(SAD[j % 4], bb, .35, .25)
        melody(bars[0], len(bars), lead=False, vel=.4, octave=-12)
    elif k == "build":
        for j, bb in enumerate(bars):
            chord_bar(("Bb", "C")[j % 2], bb, .6, .5); arp_bar(("Bb", "C")[j % 2], bb, .4)
            for q in range(16): add(musicbox(int(R.choice([74, 77, 81, 82, 84, 86])) + 12, .25), bb * BAR + q * BEAT / 4, np.sin(q) * .7, .4, .7)
        build_bar(bars[-1], 1)
    elif k == "chorus":
        add(crash(1.0, 4), a, 0, 1, .4)
        nq = int(BEAT / 2 * SR); qq = np.arange(nq) / SR
        for j, bb in enumerate(bars):
            name = PROG[j % 4]
            chord_bar(name, bb, .9, .75); arp_bar(name, bb, .5); drums_bar(bb, True, 1.0)
            for q in range(8): add(np.sin(2 * np.pi * mtof(CH[name][0] + 12) * qq) * np.exp(-qq * 6) * .5, bb * BAR + q * BEAT / 2, 0, .35, .05)
            if j % 4 == 0 and j: add(crash(.6, 2.5), bb * BAR, .3, 1, .3)
        for j in range(0, len(bars), 8): melody(bars[j], min(8, len(bars) - j), lead=True, vel=.65)
    elif k == "outro":
        for j, bb in enumerate(bars): chord_bar(PROG[j % 4], bb, .55, .45); arp_bar(PROG[j % 4], bb, .35)
        melody(bars[0], min(8, len(bars)), lead=True, vel=.5)
    elif k == "end":
        add(hit(.9), a, 0, 1, .45)
        for i2, m in enumerate(CH["D"][1:]): add(pad(m, b - a, .45, .3, 3.5), a, (i2 - 2) * .3, .06, .5)
        for i2, m in enumerate([62, 66, 69, 74, 78]): add(piano(m + 12, 8, .5), a + .8 + i2 * BEAT, -.2 + i2 * .1, .7, .7)

# transitions and on-screen moments
for i, s in enumerate(SHOTS):
    tr, t, sc = s["tr"], s["start"], s["sc"]
    if s["kind"] == "montage" or i == 0: continue
    if tr == "flash" and s["kind"] not in ("title", "warp", "warpbuild"): add(hit(.3), t, 0, 1, .3); add(crash(.25, 1.2), t, .2, 1, .25)
    elif tr == "whip": add(whoosh(.55, 1.4), t - .25, R.uniform(-.5, .5), 1, .3)
    elif tr == "zoom": add(whoosh(.7, 1.6), t - .35, 0, 1, .4); add(revcym(.6, .7), t - .6, 0, 1, .3)
    elif tr == "ink": add(gong(55, 6, .5), t, 0, 1, .6)
    elif tr == "burn": add(revcym(.9, .9), t - .7, 0, 1, .4)
    prev = SHOTS[i - 1]["sc"]
    if sc == "deepblue" and prev == "deepblue": add(hit(1.3), t + 1.6, 0, 1, .4); add(crash(.8, 3), t + 1.6, 0, 1, .4)
    if sc == "code":
        for q in range(int(s["dur"] / .09)):
            if R.random() < .6: add(click(.35), t + q * .09, .1, .5, .1)
    if sc == "turing" and prev == "turing":
        for q in range(15): add(click(.9), t + q * .1, .1, .8, .15)
    if sc == "chat" and prev == "chat":
        for q in range(20): add(bell(96, .12), t + q * .12, R.uniform(-.6, .6), 1, .4)


def runs(names):
    out = []
    for s in SHOTS:
        if s["sc"] in names:
            if out and abs(out[-1][1] - s["start"]) < .01: out[-1][1] = s["start"] + s["dur"]
            else: out.append([s["start"], s["start"] + s["dur"]])
    return out


for a, b in runs(("fire", "fireme", "backprop")): crackle(a, b, .9)
for a, b in runs(("winter",)): wind(a, b, 1.2)
for a, b in runs(("people",)): rain(a, b, 1.0)
for a, b in runs(("honest", "founding")): sea(a, b, .8)

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
