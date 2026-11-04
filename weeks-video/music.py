"""Original 120 BPM score for 人生只有 4000 周, synthesised from scratch with numpy.

Every hit lands on a visual cue: the count-up, the seven days, the weeks turning grey,
each slice of time, the 125 days with your parents and the final burst of colour.
Usage: python3 music.py meta.json out.wav
"""
import json
import sys
import wave

import numpy as np

SR = 48000
meta = json.load(open(sys.argv[1]))
OUT = sys.argv[2]
DUR = meta["DURATION"]
N = int(DUR * SR)
rng = np.random.default_rng(2026)
BEAT = 0.5

drums = np.zeros((2, N))
music = np.zeros((2, N))   # side-chained
fx = np.zeros((2, N))
KICKS = []


def hz(name):
    names = {"C": 0, "C#": 1, "D": 2, "D#": 3, "E": 4, "F": 5, "F#": 6, "G": 7, "G#": 8, "A": 9, "A#": 10, "B": 11}
    return 440.0 * 2 ** ((names[name[:-1]] + 12 * (int(name[-1]) + 1) - 69) / 12)


def place(bus, sig, t0, gain=1.0, pan=0.0):
    if sig.ndim == 1:
        a = (pan + 1) * np.pi / 4
        sig = np.stack([sig * np.cos(a), sig * np.sin(a)]) * np.sqrt(2)
    i0 = int(round(t0 * SR))
    if i0 >= N or i0 + sig.shape[1] <= 0:
        return
    s0 = max(0, -i0)
    i1 = min(N, i0 + sig.shape[1])
    bus[:, max(0, i0):i1] += sig[:, s0:s0 + i1 - max(0, i0)] * gain


def tt(sec):
    return np.arange(int(sec * SR)) / SR


def lowpass(x, cutoff, order=2):
    X = np.fft.rfft(x, axis=-1)
    f = np.fft.rfftfreq(x.shape[-1], 1 / SR)
    X *= 1 / np.sqrt(1 + (f / cutoff) ** (2 * order))
    return np.fft.irfft(X, x.shape[-1], axis=-1)


def band(x, lo, hi):
    X = np.fft.rfft(x, axis=-1)
    f = np.fft.rfftfreq(x.shape[-1], 1 / SR)
    X *= (1 / np.sqrt(1 + (lo / np.maximum(f, 1)) ** 4)) * (1 / np.sqrt(1 + (f / hi) ** 4))
    return np.fft.irfft(X, x.shape[-1], axis=-1)


def env(n, a, r, hold=None):
    e = np.ones(n)
    ia, ir = int(a * SR), int(r * SR)
    if ia:
        e[:ia] = np.linspace(0, 1, ia)
    if ir:
        e[-ir:] *= np.linspace(1, 0, ir) ** 2
    return e


# ------------------------------------------------------------------ drums
def kick(t0, g=1.0):
    t = tt(0.5)
    f = 48 + 140 * np.exp(-t * 32)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 7.5)
    s += 0.35 * band(rng.standard_normal(len(t)), 1500, 8000) * np.exp(-t * 180)
    place(drums, np.tanh(s * 1.6) * 0.9, t0, g)
    KICKS.append(t0)


def clap(t0, g=0.5):
    t = tt(0.4)
    n = band(rng.standard_normal(len(t)), 900, 7000)
    e = np.zeros(len(t))
    for d in (0, 0.011, 0.022):
        e += np.exp(-np.maximum(0, t - d) * 140) * (t >= d)
    e += 0.6 * np.exp(-t * 14) * (t >= 0.022)
    s = n * e
    place(drums, np.stack([s, np.roll(s, 90)]), t0, g)


def snare(t0, g=0.4):
    t = tt(0.3)
    s = band(rng.standard_normal(len(t)), 1200, 9000) * np.exp(-t * 22) + 0.5 * np.sin(2 * np.pi * 190 * t) * np.exp(-t * 30)
    place(drums, s, t0, g)


def hat(t0, g=0.16, open_=False, pan=0.2):
    t = tt(0.35 if open_ else 0.08)
    s = band(rng.standard_normal(len(t)), 7000, 16000) * np.exp(-t * (11 if open_ else 70))
    place(drums, s, t0, g, pan)


def crash(t0, g=0.32, dur=2.5):
    t = tt(dur)
    s = band(rng.standard_normal((2, len(t))), 3500, 15000) * np.exp(-t * 2.2) * np.minimum(1, t / 0.003)
    place(fx, s, t0, g)


def revcrash(t_end, dur=1.5, g=0.25):
    t = tt(dur)
    s = band(rng.standard_normal((2, len(t))), 3000, 14000) * (t / dur) ** 3
    place(fx, s, t_end - dur, g)


def boom(t0, g=0.8, f0=95, f1=34, dur=3.0):
    t = tt(dur)
    f = f1 + (f0 - f1) * np.exp(-t * 5)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 1.4) * np.minimum(1, t / 0.004)
    s += 0.25 * lowpass(rng.standard_normal(len(t)), 300) * np.exp(-t * 6)
    place(drums, np.tanh(s * 1.4), t0, g)


def whoosh(t0, dur=0.45, g=0.18, up=True):
    t = tt(dur)
    x = rng.standard_normal((2, len(t)))
    out = np.zeros_like(x)
    # time-varying band via 8 overlapping slices
    k = 8
    L = len(t) // k
    for i in range(k):
        c = (600 * (12 ** (i / (k - 1)))) if up else (7000 / (12 ** (i / (k - 1))))
        seg = band(x[:, i * L:(i + 1) * L + L // 2], c * 0.6, c * 1.6)
        w = np.hanning(seg.shape[1])
        out[:, i * L:i * L + seg.shape[1]] += seg * w
    out *= np.sin(np.pi * np.linspace(0, 1, len(t))) ** 1.5
    place(fx, out, t0 - dur * 0.6, g)


def riser(t0, t1, g=0.22):
    dur = t1 - t0
    t = tt(dur)
    k = t / dur
    x = rng.standard_normal((2, len(t)))
    out = np.zeros_like(x)
    slices = 24
    L = len(t) // slices
    for i in range(slices):
        c = 400 * (25 ** (i / (slices - 1)))
        seg = band(x[:, i * L:min(len(t), (i + 1) * L + L)], c * 0.5, c * 2.0)
        w = np.hanning(seg.shape[1])
        out[:, i * L:i * L + seg.shape[1]] += seg * w
    f = 180 * 2 ** (k * 3)
    tone = np.sin(2 * np.pi * np.cumsum(f) / SR) + 0.5 * np.sin(2 * np.pi * np.cumsum(f * 1.5) / SR)
    out += 0.25 * tone
    out *= k ** 2.4
    place(fx, out, t0, g)


def tick(t0, g=0.12, f=2400):
    t = tt(0.05)
    place(drums, np.sin(2 * np.pi * f * t) * np.exp(-t * 120), t0, g, rng.uniform(-0.4, 0.4))


# ------------------------------------------------------------------ instruments
def saw(f, t, phase=0.0):
    return 2 * ((f * t + phase) % 1.0) - 1


def supersaw(notes, t0, dur, g=0.12, cutoff=3500, attack=0.01, release=0.25, voices=7, detune=0.18, bus=None):
    t = tt(dur + release)
    out = np.zeros((2, len(t)))
    for f in notes:
        for v in range(voices):
            d = (v - (voices - 1) / 2) / ((voices - 1) / 2) * detune
            ff = f * 2 ** (d / 12)
            out[v % 2] += saw(ff, t, rng.uniform())
        out[0] += 0.5 * saw(f / 2, t, 0.1)
        out[1] += 0.5 * saw(f / 2, t, 0.6)
    out = lowpass(out, cutoff, order=2)
    e = env(len(t), attack, release)
    if dur + release > len(t) / SR - 1e-6:
        pass
    out *= e / (len(notes) * voices) ** 0.5
    place(bus if bus is not None else music, out, t0, g)


def stab(notes, t0, g=0.14):
    t = tt(0.32)
    out = np.zeros((2, len(t)))
    for f in notes:
        for v in range(5):
            ff = f * 2 ** ((v - 2) * 0.09 / 12)
            out[v % 2] += saw(ff, t, rng.uniform())
    cut = 1200 + 5000 * np.exp(-t * 18)
    out = lowpass(out, 5200) * np.exp(-t * 9)
    # brighten the attack
    out += 0.3 * band(out, 2500, 9000)
    place(fx, out / (len(notes) * 5) ** 0.5, t0, g)


def bass(f, t0, dur, g=0.35):
    t = tt(dur)
    s = np.sin(2 * np.pi * f * t) * 0.9 + 0.35 * lowpass(saw(f * 2, t), 900)
    s *= env(len(t), 0.004, min(0.08, dur * 0.5))
    place(music, s, t0, g)


def pluck(f, t0, g=0.08, pan=0.0, decay=0.35, bright=1.0):
    t = tt(decay * 4)
    s = np.zeros(len(t))
    for h in range(1, 10):
        if f * h > 14000:
            break
        s += (1 / h ** (1.3 / bright)) * np.sin(2 * np.pi * f * h * t) * np.exp(-t * (1 / decay) * (1 + 0.35 * h))
    s *= np.minimum(1, t / 0.003)
    place(fx, s, t0, g, pan)


def piano(f, t0, g=0.14, pan=0.0):
    t = tt(3.0)
    s = np.zeros(len(t))
    for h, a in enumerate([1, 0.55, 0.32, 0.2, 0.12, 0.07, 0.04], 1):
        s += a * np.sin(2 * np.pi * f * h * t * (1 + 0.0003 * h * h)) * np.exp(-t * (0.9 + 0.7 * h))
    s *= np.minimum(1, t / 0.004)
    place(fx, s, t0, g, pan)


def pad(notes, t0, dur, g=0.1, cutoff=1800):
    supersaw(notes, t0, dur, g=g, cutoff=cutoff, attack=0.35, release=0.9, voices=5, detune=0.12)


CH = {
    "Am": (["A3", "C4", "E4", "A4"], "A1"),
    "F": (["F3", "A3", "C4", "F4"], "F1"),
    "C": (["G3", "C4", "E4", "G4"], "C2"),
    "G": (["G3", "B3", "D4", "G4"], "G1"),
}
ARP = {"Am": ["A4", "C5", "E5", "A5"], "F": ["F4", "A4", "C5", "F5"], "C": ["E4", "G4", "C5", "E5"], "G": ["D4", "G4", "B4", "D5"]}
chord_notes = lambda c, up=0: [hz(n) * 2 ** up for n in CH[c][0]]
root = lambda c: hz(CH[c][1])


def groove_bar(t0, chord, kick_on=True, clap_on=True, hats=True, bass_on=True, arp=False, open_hat=False):
    for b in range(4):
        tb = t0 + b * BEAT
        if kick_on:
            kick(tb)
        if clap_on and b % 2 == 1:
            clap(tb)
        if hats:
            hat(tb + BEAT / 2, 0.15 if not open_hat else 0.11, open_=open_hat, pan=0.25)
            hat(tb + BEAT / 4, 0.06, pan=-0.3)
            hat(tb + 3 * BEAT / 4, 0.06, pan=-0.3)
        if bass_on:
            bass(root(chord) * 2, tb + BEAT / 2, BEAT / 2 * 0.9)
            bass(root(chord), tb, BEAT / 2 * 0.7, g=0.25)
    if arp:
        pat = [0, 1, 2, 3, 2, 1, 2, 3, 0, 1, 2, 3, 3, 2, 1, 2]
        for i in range(16):
            pluck(hz(ARP[chord][pat[i]]) * 2, t0 + i * BEAT / 4, 0.045, 0.5 * np.sin(i), decay=0.18)


# ================================================================== the score
def zip_down(t0, dur=0.6, g=0.12):
    t = tt(dur)
    f = 2400 * (0.08 ** (t / dur))
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * (0.6 + 0.4 * np.sign(np.sin(2 * np.pi * 38 * t)))
    place(fx, lowpass(s, 5000) * np.sin(np.pi * t / dur), t0, g)


def bell(f, t0, g=0.08, pan=0.0, decay=1.8):
    t = tt(decay * 2)
    s = np.zeros(len(t))
    for ratio, amp, d in ((1, 1, 1), (2.0, 0.35, 0.6), (2.76, 0.22, 0.4), (5.4, 0.1, 0.22)):
        if f * ratio < 15000:
            s += amp * np.sin(2 * np.pi * f * ratio * t) * np.exp(-t / (decay * d))
    place(fx, s * np.minimum(1, t / 0.003), t0, g, pan)


CH["Em"] = (["E3", "G3", "B3", "E4"], "E1")
ARP["Em"] = ["E4", "G4", "B4", "E5"]

# 0–3 · 4,160 weeks
boom(0.0, 0.9, 120, 36)
crash(0.0, 0.3)
stab(chord_notes("Am", 1), 0.0, 0.18)
riser(0.0, 1.58, 0.14)
prev = -1
for k in range(400):
    tq = k / 400 * 1.5
    v = int(4160 * (1 - (1 - min(1, (tq + 0.35) / 1.85)) ** 2.6)) // 160
    if v != prev:
        tick(tq, 0.08, 1500 + v * 45)
        prev = v
boom(1.6, 0.85, 120, 38)
crash(1.6, 0.3)
stab(chord_notes("Am", 1), 1.6, 0.2)
supersaw(chord_notes("Am"), 1.6, 1.5, g=0.12, cutoff=3200, release=0.4)
kick(1.6)
kick(2.1, 0.7)
kick(2.6, 0.7)
whoosh(3.2, 0.6, 0.12)

# 3–13 · one square is one week, one row is one year
for bar, ch in ((3.0, "Am"), (5.0, "F"), (7.0, "C"), (9.0, "G"), (11.0, "Am")):
    pad(chord_notes(ch), bar, 2.0, 0.09, 1600 + 150 * (bar - 3))
    for b in range(4):
        tb = bar + b * BEAT
        if tb < 3.2:
            continue
        bass(root(ch), tb, BEAT * 0.45, 0.18)
        if tb >= 5.0:
            kick(tb, 0.55)
        if tb >= 7.0:
            hat(tb + BEAT / 2, 0.08)
        if tb >= 9.0 and b % 2 == 1:
            clap(tb, 0.28)
whoosh(3.3, 0.7, 0.12)
for k, n in enumerate(["C5", "D5", "E5", "F5", "G5", "A5", "C6"]):     # Mon … Sun
    pluck(hz(n), 4.0 + k * 0.06, 0.09, -0.6 + 0.2 * k, decay=0.35, bright=1.3)
for k, n in enumerate(["A4", "C5", "E5", "G5", "A5", "C6", "E6", "G6"]):  # one row = one year
    pluck(hz(n), 5.8 + k * 0.06, 0.06, -0.7 + 0.2 * k, decay=0.3)
riser(7.5, 8.95, 0.12)
boom(9.0, 0.6, 110, 42, 1.6)
stab(chord_notes("G", 1), 9.0, 0.15)
for r in range(25):                                                       # the weeks already lived
    tick(9.45 + r / 25 * 1.6, 0.1, 2400 - r * 40)
pluck(hz("E6"), 11.3, 0.07, 0.3, decay=0.6, bright=1.4)
riser(12.6, 14.95, 0.24)
t_ = 13.0
step = BEAT / 2
while t_ < 14.9:
    snare(t_, 0.08 + 0.2 * (t_ - 13) / 1.9)
    t_ += step
    if t_ > 14.0:
        step = BEAT / 4
    if t_ > 14.5:
        step = BEAT / 8

# 15–26 · where the time goes
boom(15.0, 1.0, 140, 34, 3.0)
crash(15.0, 0.4, 3.0)
for i, ch in enumerate(["Am", "F", "C", "G", "Am"]):
    bar = 15.0 + i * 2
    groove_bar(bar, ch, arp=True, open_hat=True)
    supersaw(chord_notes(ch), bar, 2.0, g=0.16, cutoff=4800, attack=0.005, release=0.15)
for th in (17.5, 20.0, 22.3):
    boom(th, 0.45, 130, 50, 1.2)
    crash(th, 0.2)
    stab(chord_notes("C", 1), th, 0.12)
for k, tl in enumerate(np.arange(15.0, 24.0, 0.25)):
    if k % 4 != 3:
        tick(tl, 0.03, 3000)
boom(24.0, 0.6, 120, 40, 2.0)
boom(24.35, 0.9, 140, 36, 2.5)
crash(24.35, 0.35, 2.5)
supersaw(chord_notes("F"), 24.0, 2.3, g=0.16, cutoff=4000, attack=0.005, release=0.6)
stab(chord_notes("F", 1), 24.35, 0.2)

# 26.6–35 · the days with your parents — drums out, only piano
for bar, ch in ((26.6, "F"), (28.6, "G"), (30.6, "Em"), (32.6, "Am")):
    pad(chord_notes(ch), bar, 2.0, 0.09, 1400)
mel = [(26.6, "C5"), (27.1, "A4"), (27.6, "F4"), (28.6, "D5"), (29.1, "B4"), (29.6, "G4"),
       (30.6, "E5"), (31.0, "G5"), (31.8, "B5"), (32.6, "C6"), (33.2, "A5"), (33.8, "E5")]
for tl, n in mel:
    piano(hz(n), tl, 0.14)
for n in ("A3", "E4", "A4", "C5"):
    piano(hz(n), 26.6, 0.06)
kick(28.0, 0.35)
kick(28.25, 0.25)
boom(31.0, 0.35, 90, 40, 2.0)
for n, d in (("E5", 0), ("G5", 0.03), ("B5", 0.06), ("E6", 0.09)):
    bell(hz(n), 31.8 + d, 0.07, 0, 2.5)
boom(31.8, 0.45, 100, 38, 2.5)

# 35–41 · the squares keep turning grey — but the rest are yours
for k in range(20):
    tick(35.6 + k * 0.09, 0.09, 2000)
for bar, ch in ((35.0, "F"), (37.0, "G"), (39.0, "Am")):
    pad(chord_notes(ch), bar, 2.0, 0.1, 1800 + 400 * (bar - 35))
for b in range(8):
    kick(37.5 + b * BEAT / 2 if b > 3 else 37.5 + b * BEAT, 0.6 + 0.04 * b)
riser(37.4, 39.38, 0.24)
boom(39.4, 0.9, 140, 36, 2.5)
crash(39.4, 0.35)
stab(chord_notes("Am", 1), 39.4, 0.2)
glit = np.random.default_rng(9)
for k in range(60):                                                       # every empty week bursts into colour
    bell(hz(["C6", "D6", "E6", "G6", "A6", "C7", "E7"][k % 7]), 39.4 + glit.uniform(0, 1.5), 0.035, glit.uniform(-0.9, 0.9), 0.9)
groove_bar(39.4, "Am", arp=True)
supersaw(chord_notes("G"), 40.4, 0.85, g=0.12, cutoff=4000, attack=0.005, release=0.1)

# 41–45 · the title
boom(41.25, 1.0, 140, 34, 4.0)
crash(41.25, 0.42, 3.5)
supersaw(chord_notes("C"), 41.25, 3.2, g=0.15, cutoff=3500, attack=0.01, release=1.0)
pad(chord_notes("C", 1), 41.25, 3.4, 0.07, 3000)
bass(root("C"), 41.25, 3.0, 0.3)
for tl, n in ((41.25, "E5"), (41.75, "G5"), (42.25, "C6"), (42.9, "D6"), (43.5, "E6")):
    piano(hz(n), tl, 0.14)
for n in ("C4", "G4", "C5", "E5"):
    piano(hz(n), 41.25, 0.08)

# ------------------------------------------------------------------ mix
# side-chain the music bus to the kicks
sc = np.ones(N)
for k in KICKS:
    i0 = int(k * SR)
    L = int(0.32 * SR)
    if i0 >= N:
        continue
    seg = 1 - 0.75 * np.exp(-np.arange(min(L, N - i0)) / SR / 0.09)
    sc[i0:i0 + len(seg)] = np.minimum(sc[i0:i0 + len(seg)], seg)
music *= sc


def reverb(x, seconds=2.4, decay=0.55):
    n = int(seconds * SR)
    t = np.arange(n) / SR
    size = 1 << int(np.ceil(np.log2(x.shape[1] + n)))
    out = np.zeros_like(x)
    for ch in range(2):
        ir = lowpass(rng.standard_normal(n), 6000) * np.exp(-t / decay)
        ir /= np.sqrt(np.sum(ir ** 2))
        out[ch] = np.fft.irfft(np.fft.rfft(x[ch], size) * np.fft.rfft(ir, size), size)[: x.shape[1]]
    return out


wet = reverb(music * 0.5 + fx * 0.8)
mix = drums + music + fx + 0.55 * wet
# high-pass 30 Hz
X = np.fft.rfft(mix, axis=1)
f = np.fft.rfftfreq(N, 1 / SR)
X *= f ** 4 / (f ** 4 + 30.0 ** 4)
mix = np.fft.irfft(X, N, axis=1)
fade = np.ones(N)
fo = int(44.0 * SR)
fade[fo:] = np.cos(np.linspace(0, np.pi / 2, N - fo)) ** 2
mix *= fade
peak = np.max(np.abs(mix))
mix = np.tanh(mix / peak * 2.2) / np.tanh(2.2) * 0.9

pcm = (np.clip(mix.T, -1, 1) * 32767).astype(np.int16)
with wave.open(OUT, "wb") as wf:
    wf.setnchannels(2)
    wf.setsampwidth(2)
    wf.setframerate(SR)
    wf.writeframes(pcm.tobytes())
print("wrote", OUT, pcm.shape[0] / SR, "s")
