"""Original 120 BPM score for 1 秒钟, synthesised from scratch with numpy.

A ticking clock runs through it; each of the seven facts has its own sound (light swirling,
lightning cracks, music-box births, a single heartbeat), then a record-stop and real ticks.
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


SC = meta["SC"]
TWIST, TALLY, END = meta["TWIST"], meta["TALLY"], meta["END"]


def tock(t0, g=0.1, f=1800):
    t = tt(0.06)
    s = np.sin(2 * np.pi * f * t) * np.exp(-t * 90) + 0.5 * band(rng.standard_normal(len(t)), 2000, 9000) * np.exp(-t * 200)
    place(drums, s, t0, g, 0.15)


def crack(t0, g=0.12):
    t = tt(0.5)
    s = band(rng.standard_normal(len(t)), 800, 9000) * np.exp(-t * 14) * (1 + 0.6 * np.sign(np.sin(2 * np.pi * 47 * t)))
    place(fx, s, t0, g, rng.uniform(-0.7, 0.7))


def thump(t0, g=0.8):
    for d, gg in ((0, 1.0), (0.22, 0.7)):
        t = tt(0.35)
        f = 40 + 50 * np.exp(-t * 25)
        place(drums, np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 9), t0 + d, g * gg)


# 0–3 · the second sweeps by, then freezes
for k in range(10):
    tock(-0.25 + 0.15 * k if k else 0.0, 0.1, 1700 + (k % 2) * 300)
boom(0.0, 0.5, 110, 45, 1.2)
riser(0.0, 1.24, 0.12)
boom(1.25, 0.95, 140, 34, 2.5)
crash(1.25, 0.32)
stab(chord_notes("Am", 1), 1.25, 0.2)
revcrash(3.0, 1.2, 0.16)
pad(chord_notes("Am"), 1.25, 1.8, 0.07, 1500)

# 3–33.4 · the seven facts, each with its own sound
prog = ["Am", "F", "C", "G"]
bar, i = 3.0, 0
while bar < 33.3:
    ch = prog[i % 4]
    heart = SC[5][0] - 0.1 <= bar < SC[5][1]
    for b in range(4):
        tb = bar + b * BEAT
        if tb >= 33.35:
            break
        tock(tb + BEAT / 2, 0.05, 2200)
        if not heart:
            kick(tb, 0.6)
            if b % 2 == 1:
                clap(tb, 0.25)
            hat(tb + BEAT / 4, 0.05, pan=-0.3)
            bass(root(ch), tb, BEAT * 0.45, 0.18)
            bass(root(ch), tb + BEAT / 2, BEAT * 0.45, 0.12)
    pad(chord_notes(ch), bar, 2.0, 0.06 if heart else 0.08, 1800)
    if not heart and bar >= 7.0:
        supersaw(chord_notes(ch), bar, 2.0, g=0.06, cutoff=2600, attack=0.01, release=0.1)
    bar += 2.0
    i += 1
for a, b in SC:
    boom(a, 0.45, 130, 50, 1.0)
    whoosh(a, 0.45, 0.12)
    stab(chord_notes("C", 1), a, 0.1)
# light: a swirling arpeggio, one note per lap
a, b = SC[0]
for k in range(15):
    pluck(hz(["E5", "G5", "B5", "E6", "G6"][k % 5]), a + 0.6 + k * (b - 1.5 - a) / 15, 0.06, 0.8 * np.sin(k * 1.2), decay=0.3, bright=1.3)
# orbit: a long low whoosh past the Sun
whoosh(SC[1][0] + 1.6, 1.6, 0.18)
boom(SC[1][0] + 0.8, 0.3, 60, 30, 2.5)
# lightning: 44 cracks, front-loaded like the visuals
a, b = SC[2]
for k in range(44):
    born = a + 0.6 + (b - 1.5 - a) * (1 - (1 - (k + 0.5) / 44) ** (1 / 3))
    if k % 2 == 0:
        crack(born, 0.05 + 0.04 * (k < 10))
# births: four music-box notes, two soft low tones
a, b = SC[3]
for k, n in enumerate(["C6", "E6", "G6", "C7"]):
    bell(hz(n), a + 0.8 + k * 0.6, 0.09, -0.4 + 0.27 * k, 1.8)
for k in range(2):
    piano(hz(["A3", "E3"][k]), a + 2.0 + k * 0.5, 0.07)
# the Sun: a roar
a, b = SC[4]
riser(a, a + 2.0, 0.1)
boom(a + 0.6, 0.4, 70, 30, 3.0)
# the heart: drums drop out, one heartbeat
a, b = SC[5]
thump(a + 1.2, 0.9)
bell(hz("A5"), a + 1.25, 0.05, 0, 1.5)
# cells: glitter
a, b = SC[6]
for k in range(40):
    bell(hz(["E6", "G6", "A6", "B6", "D7", "E7"][k % 6]), a + 0.3 + rng.uniform(0, 3.8), 0.025, rng.uniform(-0.9, 0.9), 0.6)
riser(32.0, 33.35, 0.18)

# 33.4 · record stop — and now the clock is real
zip_down(TWIST - 0.05, 0.4, 0.2)
boom(TWIST + 0.1, 0.7, 120, 40, 1.5)
for s in range(34, 41):
    tock(float(s), 0.14, 1500)
    tock(s + 0.5, 0.08, 1900)
pad(chord_notes("F"), TWIST + 0.4, 2.0, 0.07, 1400)
pad(chord_notes("G"), TALLY, 2.6, 0.08, 1800)
pad(chord_notes("Am"), TALLY + 2.6, 2.4, 0.09, 2200)
for k in range(4):
    stab(chord_notes(["C", "G", "Am", "F"][k], 1), TALLY + 0.3 + k * 0.45, 0.12)
    boom(TALLY + 0.3 + k * 0.45, 0.25, 120, 50, 0.6)
for b in range(8):
    kick(TALLY + 1.6 + b * BEAT / 2 if b > 3 else TALLY + 1.6 + b * BEAT, 0.55 + 0.04 * b)
riser(TALLY + 1.8, END - 0.02, 0.24)

# 40.6–45 · every second
boom(END, 1.0, 140, 34, 4.0)
crash(END, 0.42, 3.5)
supersaw(chord_notes("C"), END, 3.6, g=0.15, cutoff=3500, attack=0.01, release=1.0)
pad(chord_notes("C", 1), END, 3.8, 0.07, 3000)
bass(root("C"), END, 3.4, 0.3)
for tl, n in ((END, "C6"), (END + 0.5, "G5"), (END + 1.0, "E6"), (END + 1.6, "G6"), (END + 2.3, "C7")):
    piano(hz(n), tl, 0.13)
for s in range(41, 45):
    tock(float(s), 0.07, 1500)

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
