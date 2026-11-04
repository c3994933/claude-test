"""Original 120 BPM score for 一束光的旅行, synthesised from scratch with numpy.

Every hit lands on a visual cue: the beam striking the eye, every collision inside
the Sun, each history card, the breakout, the sky, the retina and the title.
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
WALK = meta["WALK"]
EVENTS = meta["EVENTS"]
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


# 0–3 · the beam hits the eye
riser(0.0, 0.25, 0.12)
boom(0.25, 0.95, 120, 36)
crash(0.25, 0.32)
stab(chord_notes("C", 1), 0.25, 0.2)
pad(chord_notes("C"), 0.25, 2.1, 0.09, 2000)
for tl, n in ((0.5, "E5"), (0.9, "G5"), (1.2, "C6")):
    piano(hz(n), tl, 0.12)
boom(1.2, 0.5, 110, 45, 1.5)
stab(chord_notes("C", 1), 1.2, 0.14)
kick(1.5, 0.6)
kick(2.0, 0.7)
zip_down(2.3, 0.62, 0.14)
revcrash(2.92, 0.6, 0.16)

# 3–15 · trapped inside the Sun
boom(3.25, 0.8, 90, 34, 3.0)
crash(3.25, 0.22)
prog = [(3.0, "Am"), (5.0, "F"), (7.0, "C"), (9.0, "G"), (11.0, "Am"), (13.0, "G")]
for bar, ch in prog:
    pad(chord_notes(ch), bar, 2.0 if bar < 13 else 1.85, 0.08 + 0.01 * (bar - 3) / 2, 1200 + 180 * (bar - 3))
    for b in range(4):
        tb = bar + b * BEAT
        if tb < 3.25 or tb >= 14.85:
            continue
        bass(root(ch), tb, BEAT * 0.45, 0.2)
        bass(root(ch), tb + BEAT / 2, BEAT * 0.45, 0.14)
        if tb >= 5.0:
            kick(tb, 0.55 + 0.3 * (tb - 5) / 10)
        if tb >= 7.0:
            hat(tb + BEAT / 2, 0.09)
        if tb >= 9.0 and b % 2 == 1:
            clap(tb, 0.3)
for i, tw in enumerate(WALK[1:]):
    if tw < 14.85:
        tick(tw, 0.045, 1400 + 1800 * ((i * 2654435761) % 1000) / 1000)
EV_NOTES = ["A4", "C5", "E5", "G5", "A5", "C6", "E6", "G6"]
for i, te in enumerate(EVENTS):
    bell(hz(EV_NOTES[i]), te, 0.08, -0.3 + 0.08 * i, 1.4)
    whoosh(te, 0.3, 0.06)
t_ = 12.6
step = BEAT / 2
while t_ < 14.8:
    snare(t_, 0.08 + 0.2 * (t_ - 12.6) / 2.2)
    t_ += step
    if t_ > 13.6:
        step = BEAT / 4
    if t_ > 14.3:
        step = BEAT / 8
riser(12.4, 14.85, 0.24)

# 15–25 · breakout and the 8 min 20 s flight
boom(15.0, 1.0, 140, 34, 3.5)
crash(15.0, 0.42, 3.0)
for i, ch in enumerate(["C", "G", "Am", "F", "C"]):
    bar = 15.0 + i * 2
    groove_bar(bar, ch, arp=True, open_hat=True)
    supersaw(chord_notes(ch), bar, 2.0, g=0.17, cutoff=5000, attack=0.005, release=0.15)
lead = [("E5", 15.0), ("G5", 15.75), ("C6", 16.25), ("G5", 16.5), ("D5", 17.0), ("G5", 17.75), ("B5", 18.25), ("D6", 18.5),
        ("C6", 19.0), ("A5", 19.75), ("E5", 20.25), ("A5", 20.5), ("C6", 21.0), ("A5", 21.75), ("F5", 22.25), ("C6", 22.5),
        ("E6", 23.0), ("D6", 23.5), ("C6", 24.0), ("G6", 24.5)]
for n, tl in lead:
    pluck(hz(n), tl, 0.11, 0.0, decay=0.5, bright=1.2)
    supersaw([hz(n)], tl, 0.3, g=0.035, cutoff=6000, attack=0.005, release=0.15, voices=5, bus=fx)
whoosh(18.0, 0.7, 0.18)
whoosh(20.3, 0.8, 0.2, up=False)
riser(22.6, 24.98, 0.24)
revcrash(25.0, 1.0, 0.18)

# 25–35 · why the sky is blue
boom(25.0, 0.7, 110, 40, 2.5)
crash(25.0, 0.28)
for bar, ch in ((25.0, "F"), (27.0, "C"), (29.0, "G"), (31.0, "Am"), (33.0, "F")):
    pad(chord_notes(ch, 0), bar, 2.0, 0.13, 2600)
    for b in range(4):
        tb = bar + b * BEAT
        if b % 2 == 0 or bar >= 29.0:
            kick(tb, 0.6 if bar < 29 else 0.75)
        if bar >= 29.0 and b % 2 == 1:
            clap(tb, 0.25)
        hat(tb + BEAT / 2, 0.1, pan=0.3)
        hat(tb + BEAT / 4, 0.04, pan=-0.3)
        bass(root(ch), tb, BEAT * 0.9, 0.2)
    pat = [0, 2, 1, 3, 2, 1, 3, 2]
    for i in range(8):
        pluck(hz(ARP[ch][pat[i]]) * 2, bar + i * BEAT / 2, 0.05, 0.6 * np.sin(i * 1.3), decay=0.3)
sky_rng = np.random.default_rng(7)
for k in range(70):  # the scattered blue light, as a cloud of tiny bells
    bell(hz(["E6", "G6", "A6", "B6", "D7", "E7"][k % 6]), 25.9 + sky_rng.uniform(0, 5.4), 0.025, sky_rng.uniform(-0.9, 0.9), 0.8)
boom(29.4, 0.45, 120, 45, 1.5)
stab(chord_notes("G", 1), 29.4, 0.14)
for c in (31.3, 31.7, 32.1):
    whoosh(c, 0.5, 0.1)
riser(33.0, 34.98, 0.2)

# 35–41 · into your eye
boom(35.0, 0.5, 90, 40, 2.0)
pad(chord_notes("F"), 35.0, 2.4, 0.1, 1600)
piano(hz("A4"), 35.0, 0.12)
piano(hz("C5"), 35.4, 0.12)
bell(hz("F6"), 35.8, 0.1, 0, 2.2)
boom(35.8, 0.35, 110, 50, 1.2)
whoosh(37.45, 0.5, 0.16)
boom(37.9, 0.8, 120, 36, 3.0)
crash(37.9, 0.25)
pad(chord_notes("G"), 37.5, 3.5, 0.11, 2200)
for i in range(20):  # the signal racing to the brain
    pluck(hz(["G5", "B5", "D6", "G6", "B6", "D7"][i % 6]), 37.95 + i * 0.07, 0.05 + 0.002 * i, 0.7 * np.sin(i), decay=0.25, bright=1.4)
riser(38.2, 39.4, 0.16)
boom(39.4, 0.7, 130, 40, 2.0)
crash(39.4, 0.3)
stab(chord_notes("G", 1), 39.4, 0.18)
for b in range(3):
    kick(39.4 + b * BEAT, 0.7)
riser(39.8, 40.98, 0.22)

# 41–45 · the title
boom(41.0, 1.0, 140, 34, 4.0)
crash(41.0, 0.42, 3.5)
supersaw(chord_notes("C"), 41.0, 3.4, g=0.15, cutoff=3500, attack=0.01, release=1.0)
pad(chord_notes("C", 1), 41.0, 3.6, 0.07, 3000)
bass(root("C"), 41.0, 3.2, 0.3)
for tl, n in ((41.0, "C6"), (41.5, "G5"), (42.0, "E5"), (42.6, "G5"), (43.2, "C6"), (43.8, "E6")):
    piano(hz(n), tl, 0.14)
for n in ("C4", "G4", "C5", "E5"):
    piano(hz(n), 41.0, 0.08)

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
