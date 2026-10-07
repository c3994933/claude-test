"""score.py — synthesize the film's soundtrack from timeline.json.

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


PLAN = {  # scene: (chord for line 1, chord for line 2, intensity)
    "prologue": ("Dm", "Bb", 0.35), "talos": ("Dm", "Bb", 0.45), "ada": ("F", "C", 0.45), "turing": ("Gm", "Dm", 0.4),
    "dartmouth": ("Bbmaj7", "F", 0.55), "perceptron": ("F", "C", 0.55), "winter": ("Dm", "Am", 0.25),
    "backprop": ("Dm", "Bb", 0.5), "deepblue": ("Gm", "Dm", 0.6), "alexnet": ("Eb", "Bb", 0.7),
    "alphago": ("Dsus", "Dm", 0.5), "attention": ("Bb", "F", 0.75), "chat": ("Gm", "Eb", 0.88),
    "today": ("Bb", "C", 1.0), "epilogue": ("F", "Dm", 0.5),
}

for sid, (c1, c2, inten) in PLAN.items():
    s0, s1, l1, l2 = at(sid, 0.2), end(sid), line(sid, 0), line(sid, 1)
    chord(c1, s0, l2 + 0.6, inten)
    chord(c2, l2 - 0.4, s1 - 0.4, inten * 1.05)
    if sid != "prologue":
        add(whoosh(2.6, 0.8 + inten), at(sid, -1.4), pan=0, send=0.4)
        add(piano(CH[c1][1], 7, 0.7), at(sid, 0.3), pan=-0.1, gain=0.6, send=0.5)
    if sid not in ("winter", "alphago", "today"):
        motif(c1, l1 + 0.1, 0.5 + inten * 0.3)
        motif(c2, l2 + 0.1, 0.45 + inten * 0.3, up=False)

# --- prologue: drone, ember, title impact
add(pad(26, 22, 0.15, 6, 4), 0.5, 0, 0.1, 0.3)
add(pad(33, 20, 0.2, 7, 4), 2.0, 0.2, 0.06, 0.4)
crackle(1.0, at("prologue", S["prologue"]["dur"]), 0.5)
ta = at("prologue", S["prologue"]["titleAt"])
add(riser(3.2, 1.0), ta - 3.0, 0, 1, 0.5)
add(boom(1.0), ta, 0, 1.0, 0.35)
add(gong(73.4, 9, 0.8), ta, 0, 1, 0.5)
chord("Dm", ta, at("prologue", S["prologue"]["dur"]) + 1, 0.8, att=0.6)

# --- talos: war drums of bronze
for k in range(12):
    t = at("talos", 1.2 + k * 1.15)
    add(heartbeat(0.55), t, 0, 1, 0.3)
add(gong(55, 8, 0.6), line("talos", 1), -0.2, 1, 0.5)

# --- ada: the music box she imagined
mel = [69, 72, 77, 76, 72, 69, 67, 65, 69, 72, 74, 72]
for i, m in enumerate(mel):
    add(musicbox(m + 12, 0.8 if i % 4 == 0 else 0.6), line("ada", 1) + 0.2 + i * 0.36, pan=0.25, gain=1, send=0.45)
for k in range(int(S["ada"]["dur"] / 0.5)):  # clockwork ticks
    add(click(0.25 + 0.15 * (k % 2)), at("ada", 0.4 + k * 0.5), pan=0.5, gain=0.5, send=0.2)

# --- turing: typewriter
qa = line("turing", 1) - 0.2
for i, ch in enumerate("Can machines think?"):
    if ch != " ":
        add(click(0.9 + 0.2 * R.random()), qa + 1.6 * i / 19 + 0.012 * R.standard_normal(), pan=0.1, send=0.15)
add(bell(96, 0.6), qa + 1.75, 0.3, 1, 0.5)

# --- dartmouth: celesta sweep as the name is written
na = line("dartmouth", 1) + 0.8
for i, m in enumerate([70, 74, 77, 81, 82, 86, 89, 93]):
    add(bell(m, 0.5), na + i * 0.12, pan=-0.6 + i * 0.17, gain=1, send=0.6)
add(boom(0.45), na, 0, 1, 0.4)

# --- perceptron: machine pulse that learns a rhythm
for k in range(int((S["perceptron"]["dur"] - 3) / 0.25)):
    t = at("perceptron", 1.5 + k * 0.25)
    if R.random() < 0.35 + 0.5 * (k / 60):
        add(pluck([65, 69, 72, 77][k % 4] + 12, 0.25, decay=9, bright=0.3), t, pan=0.4 * np.sin(k), gain=0.6, send=0.3)

# --- winter: wind, cold sparse piano
wind(at("winter", -1.5), end("winter") + 1, 1.3)
for k, m in enumerate([86, 81, 77, 74, 81, 76]):
    add(piano(m, 6, 0.35), at("winter", 1.5 + k * 2.2), pan=0.4 - k * 0.15, gain=0.7, send=0.7)

# --- backprop: the fire, and warmth returning
crackle(at("backprop", 0), end("backprop"), 1.0)
wind(at("backprop", 0), at("backprop", 7), 0.5)
add(boom(0.4), line("backprop", 1), 0, 1, 0.4)

# --- deep blue: heartbeat, then the king falls
hb_end = line("deepblue", 1) - 0.4
t = at("deepblue", 0.8)
while t < hb_end:
    add(heartbeat(0.9), t, 0, 1, 0.2)
    t += 0.86
add(riser(2.0, 0.7), hb_end - 1.6, 0, 1, 0.4)
add(boom(1.0), hb_end + 1.1, 0, 1, 0.4)
add(click(1.2), hb_end + 1.1, 0.1, 1, 0.3)
add(gong(49, 8, 0.6), hb_end + 1.12, 0, 1, 0.5)

# --- alexnet: arpeggios gathering speed
arp = [63, 67, 70, 74, 75, 74, 70, 67]
t, k = at("alexnet", 1.0), 0
while t < end("alexnet") - 1.0:
    prog = (t - at("alexnet")) / S["alexnet"]["dur"]
    root = 0 if t < line("alexnet", 1) else -5
    add(pluck(arp[k % 8] + 12 + root, 0.35 + 0.4 * prog, decay=6, bright=0.5 + 0.4 * prog), t, pan=0.5 * np.sin(k * 0.7), gain=0.7, send=0.35)
    t += 0.2272
    k += 1
add(boom(0.6), line("alexnet", 1), 0, 1, 0.4)

# --- alphago: guzheng-like plucks in D minor pentatonic, a temple gong for move 37
pent = [62, 65, 67, 69, 72, 74, 77, 79, 81]
t = at("alphago", 1.0)
while t < end("alphago") - 1:
    add(pluck(pent[R.integers(0, len(pent))], 0.6, bend=0.02, decay=1.8, bright=0.7), t, pan=R.uniform(-0.5, 0.5), gain=0.8, send=0.5)
    t += R.choice([0.45, 0.7, 0.9, 1.3])
m37 = line("alphago", 1) - 0.3
add(click(1.4), m37, 0, 1, 0.5)
add(gong(62, 10, 1.0), m37 + 0.05, 0, 1, 0.6)
add(boom(0.6), m37 + 0.05, 0, 1, 0.4)

# --- attention: shimmering glints, one per attention arc
t = at("attention", 0.8)
while t < end("attention") - 1:
    pool = CH["Bb" if t < line("attention", 1) else "F"][2:]
    add(musicbox(int(R.choice(pool)) + 24, 0.3 + 0.3 * R.random()), t, pan=R.uniform(-0.8, 0.8), gain=0.7, send=0.7)
    t += 0.17 if t > line("attention", 1) else 0.32

# --- chat → today: the great swell
add(riser(4.0, 1.0), at("today", -3.6), 0, 1, 0.5)
add(boom(1.0), at("today", 0.3), 0, 1, 0.4)
add(gong(73.4, 10, 0.7), at("today", 0.3), 0, 1, 0.6)
for k in range(24):  # timpani-like pulse under the counter
    add(heartbeat(0.3 + 0.03 * k), line("chat", 1) + k * 0.22, 0, 1, 0.3)
add(boom(0.7), line("today", 1), 0, 1, 0.4)
chord("Dm", line("today", 1) + 2.5, end("today"), 1.0)

# --- epilogue: back to the fire, a last motif, D major at the very end
crackle(at("epilogue", 0), TOTAL, 1.0)
for i, m in enumerate([74, 72, 69, 67, 69, 65, 62]):
    add(piano(m, 6, 0.45), at("epilogue", 1.0) + i * 0.9, pan=-0.1, gain=0.7, send=0.6)
ea = at("epilogue", S["epilogue"]["endAt"])
add(boom(0.9), ea, 0, 1, 0.45)
chord("D", ea, TOTAL - 1.5, 0.7, att=1.0)
for i, m in enumerate([62, 66, 69, 74]):
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
