"""Original 120 BPM score for 选择 · CHOICE, synthesised from scratch with numpy.

Every hit is placed on a visual cue (cuts, forks, title slam). Key: C major / A minor,
progression vi–IV–I–V.   Usage: python3 music.py meta.json out.wav
"""
import json
import sys
import wave

import numpy as np

SR = 48000
meta = json.load(open(sys.argv[1]))
OUT = sys.argv[2]
DUR = meta["DURATION"]
FORK_T = meta["FORK_T"]
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
# 0–4 · hook
boom(0.0, 0.9, 120, 36)
crash(0.0, 0.35)
supersaw(chord_notes("Am"), 0.0, 1.9, g=0.11, cutoff=2500, attack=0.005, release=0.3, bus=fx)
riser(0.05, 1.98, 0.16)
val_prev = 0
for i in range(1, 600):
    t = i / 600 * 1.95
    v = int(35000 * (1 - (1 - t / 1.95) ** 2.4)) // 1000
    if v != val_prev:
        tick(t, 0.1, 1800 + v * 40)
        val_prev = v
boom(2.0, 0.8, 110, 40)
crash(2.0, 0.3)
stab(chord_notes("Am", 1), 2.0, 0.22)
supersaw(chord_notes("Am"), 2.0, 1.9, g=0.12, cutoff=3000, release=0.4)
kick(2.0)
kick(3.0)
for i in range(8):
    snare(3.0 + i * BEAT / 4, 0.12 + i * 0.03)
riser(2.6, 4.0, 0.14)
revcrash(4.0, 1.2, 0.2)

# 4–10 · montage
for bar, ch in ((4.0, "Am"), (6.0, "F")):
    groove_bar(bar, ch, arp=True)
    supersaw(chord_notes(ch), bar, 2.0, g=0.08, cutoff=2400, attack=0.02, release=0.2)
cuts = [4.0, 4.5, 5.0, 5.5, 6.0, 6.5, 7.0, 8.0]
for i, c in enumerate(cuts):
    stab(chord_notes("Am" if c < 6 else ("F" if c < 8 else "G"), 1), c, 0.13)
    whoosh(c, 0.3, 0.09)
dings = ["E6", "G6", "A6", "C7", "D7", "E7", "G7"]
for i, c in enumerate(cuts[:-1]):
    pluck(hz(dings[i]), c + 0.2 if c < 7 else c + 0.4, 0.09, 0.3 if i % 2 else -0.3, decay=0.25, bright=1.4)
# 8–10 · hesitation
for b in range(2):
    kick(8.0 + b * BEAT)
hat(8.25, 0.08)
hat(8.75, 0.08)
supersaw(chord_notes("G"), 8.0, 1.75, g=0.08, cutoff=1500, attack=0.05, release=0.05)
for i in range(4):
    pluck(hz("D5") if i % 2 == 0 else hz("B4"), 8.0 + i * 0.4, 0.07, -0.6 if i % 2 == 0 else 0.6, decay=0.3)
for i in range(12):  # glitch stutter
    stab(chord_notes("G", 1), 9.2 + i * (0.55 / 12), 0.06 + 0.005 * i)
riser(8.5, 9.78, 0.12)
boom(10.0, 0.6, 70, 32, 3.0)

# 10–14 · breakdown
pad(chord_notes("C"), 10.0, 2.0, 0.07, 1400)
pad(chord_notes("G"), 12.0, 2.2, 0.08, 1600)
for tt_, n in ((10.15, "E5"), (10.9, "G5"), (11.4, "C6")):
    piano(hz(n), tt_, 0.11)
boom(12.0, 0.75, 100, 36)
crash(12.0, 0.25)
for n in ("G3", "D4", "B4", "D5", "G5"):
    piano(hz(n), 12.0, 0.08)
kick(13.0, 0.6)
kick(13.25, 0.4)

# 14–20 · the approach
for bar, ch in ((14.0, "Am"), (16.0, "F"), (18.0, "G")):
    pad(chord_notes(ch), bar, 2.0 if bar < 18 else 1.5, 0.09, 1500 + (bar - 14) * 500)
    for b in range(4):
        if bar + b * BEAT < 19.5:
            kick(bar + b * BEAT, 0.8)
            if bar >= 16:
                hat(bar + b * BEAT + BEAT / 2, 0.1)
            bass(root(ch), bar + b * BEAT, BEAT * 0.9, 0.22)
boom(15.5, 0.4, 140, 60, 1.2)
whoosh(15.5, 0.5, 0.15)
boom(16.5, 0.4, 140, 60, 1.2)
whoosh(16.5, 0.5, 0.15, up=False)
for i in range(6):
    tick(17.5 + i * 0.125, 0.16, 1500 + 200 * i)
    stab(chord_notes("G", 1), 17.5 + i * 0.125, 0.05)
# accelerating snare roll
t = 18.0
step = BEAT / 2
while t < 19.45:
    snare(t, 0.08 + 0.22 * (t - 18) / 1.45)
    t += step
    if t > 18.5:
        step = BEAT / 4
    if t > 19.0:
        step = BEAT / 8
riser(16.0, 19.48, 0.24)
revcrash(20.0, 0.5, 0.18)   # the silence before the choice is broken by a reverse swell

# 20–28 · DROP
d0 = FORK_T[0]
boom(d0, 1.0, 130, 36, 3.5)
crash(d0, 0.42, 3.0)
for i, ch in enumerate(["Am", "F", "C", "G"]):
    bar = 20.0 + i * 2
    groove_bar(bar, ch, arp=True, open_hat=True)
    supersaw(chord_notes(ch), bar, 2.0, g=0.19, cutoff=5200, attack=0.005, release=0.15)
    supersaw([hz(ARP[ch][3]) * 2], bar, 2.0, g=0.05, cutoff=7000, attack=0.005, release=0.1)
for ft in FORK_T[1:4]:
    crash(ft, 0.28)
    whoosh(ft, 0.55, 0.16)
    boom(ft, 0.35, 140, 50, 1.0)
lead = [("E5", 20.0), ("D5", 20.75), ("C5", 21.25), ("A4", 21.5), ("C5", 22.0), ("A4", 22.75), ("F4", 23.25), ("A4", 23.5),
        ("G4", 24.0), ("C5", 24.5), ("E5", 25.0), ("G5", 25.5), ("D5", 26.0), ("B4", 26.75), ("G5", 27.0), ("D6", 27.5)]
for n, tl in lead:
    pluck(hz(n), tl, 0.12, 0.0, decay=0.5, bright=1.2)
    supersaw([hz(n)], tl, 0.3, g=0.04, cutoff=6000, attack=0.005, release=0.15, voices=5, bus=fx)

# 28–36 · lift and convergence
crash(28.0, 0.3)
for bar, ch in ((28.0, "F"), (30.0, "G"), (32.0, "Am"), (34.0, "F")):
    pad(chord_notes(ch), bar, 2.0, 0.12, 2200)
    for b in range(4):
        if b % 2 == 0 or bar >= 32:
            kick(bar + b * BEAT, 0.75)
        hat(bar + b * BEAT + BEAT / 2, 0.09, pan=0.3)
        bass(root(ch), bar + b * BEAT, BEAT * 0.9, 0.24)
for tl, n in ((28.0, "C5"), (28.75, "A4"), (29.5, "C5"), (30.0, "D5"), (30.75, "B4"), (31.5, "D5"),
              (32.0, "E5"), (32.75, "C5"), (33.5, "E5"), (34.0, "F5"), (34.5, "A5"), (35.0, "C6"), (35.5, "F6")):
    piano(hz(n), tl, 0.13)
boom(32.2, 0.45, 120, 45, 1.5)
crash(32.2, 0.2)
t = 34.0
while t < 35.95:
    snare(t, 0.08 + 0.25 * (t - 34) / 2)
    t += BEAT / 4 if t < 35 else BEAT / 8
riser(33.8, 35.98, 0.3)

# 36–45 · the title
boom(36.0, 1.0, 140, 34, 4.0)
crash(36.0, 0.45, 3.5)
stab(chord_notes("F", 1), 36.0, 0.2)
for i, ch in enumerate(["F", "G"]):
    bar = 36.0 + i * 2
    groove_bar(bar, ch, arp=True, open_hat=True)
    supersaw(chord_notes(ch), bar, 2.0, g=0.17, cutoff=4800, attack=0.005, release=0.2)
supersaw(chord_notes("C"), 40.0, 4.2, g=0.13, cutoff=3000, attack=0.02, release=1.2)
bass(root("C"), 40.0, 3.5, 0.3)
crash(40.0, 0.25)
kick(40.0)
for tl, n in ((40.0, "E5"), (40.5, "D5"), (41.3, "C5"), (42.0, "G5"), (42.75, "E5"), (43.5, "C6")):
    piano(hz(n), tl, 0.15)
boom(41.3, 0.5, 120, 40, 2.0)
stab(chord_notes("C", 1), 41.3, 0.16)
crash(41.3, 0.22)
for n in ("C4", "G4", "C5", "E5", "G5"):
    piano(hz(n), 43.5, 0.07)

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
fo = int(44.2 * SR)
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
