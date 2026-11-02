"""Original ambient score for 选择 · Choice, synthesised from scratch with numpy.

Reads meta.json (exported by render.js) so every musical event lands on its visual cue.
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
T = meta["T"]
N = int(DUR * SR)
rng = np.random.default_rng(1102)
mix = np.zeros((2, N))


def hz(name):
    names = {"C": 0, "C#": 1, "D": 2, "D#": 3, "E": 4, "F": 5, "F#": 6, "G": 7, "G#": 8, "A": 9, "A#": 10, "B": 11}
    note, octave = name[:-1], int(name[-1])
    return 440.0 * 2 ** ((names[note] + 12 * (octave + 1) - 69) / 12)


def place(sig, t0, gain=1.0, pan=0.0):
    """Add a mono or stereo signal at time t0 (s) with equal-power pan (-1 left … 1 right)."""
    if sig.ndim == 1:
        a = (pan + 1) * np.pi / 4
        sig = np.stack([sig * np.cos(a), sig * np.sin(a)]) * np.sqrt(2)
    i0 = int(t0 * SR)
    if i0 >= N:
        return
    i1 = min(N, i0 + sig.shape[1])
    s0 = max(0, -i0)
    mix[:, max(0, i0):i1] += sig[:, s0:i1 - i0] * gain


def env_ar(n, attack, release):
    e = np.ones(n)
    a, r = int(attack * SR), int(release * SR)
    if a:
        e[:a] = 0.5 - 0.5 * np.cos(np.linspace(0, np.pi, a))
    if r:
        e[-r:] *= 0.5 + 0.5 * np.cos(np.linspace(0, np.pi, r))
    return e


# ------------------------------------------------------------------ instruments
def pad(freqs, t0, t1, gain=0.05, attack=2.2, release=2.8, bright=1.0):
    n = int((t1 - t0 + release) * SR)
    t = np.arange(n) / SR
    out = np.zeros((2, n))
    for f in freqs:
        for ch, cents in ((0, -5), (1, 5)):
            for voice in (0, 1):
                ff = f * 2 ** ((cents * (1 if voice else -0.6)) / 1200)
                ph = rng.uniform(0, 2 * np.pi)
                lfo = 1 + 0.25 * np.sin(2 * np.pi * rng.uniform(0.05, 0.18) * t + rng.uniform(0, 6))
                s = np.zeros(n)
                for h, amp in enumerate([1, 0.42 * bright, 0.2 * bright, 0.1 * bright, 0.05 * bright], 1):
                    if ff * h > 9000:
                        break
                    s += amp * np.sin(2 * np.pi * ff * h * t + ph * h)
                out[ch] += s * lfo
    out *= env_ar(n, attack, release) * gain / np.sqrt(len(freqs))
    place(out, t0)


def bell(f, t0, gain=0.12, pan=0.0, decay=3.2):
    n = int(decay * 2.2 * SR)
    t = np.arange(n) / SR
    s = np.zeros(n)
    for ratio, amp, d in ((1, 1, 1), (2.0, 0.35, 0.6), (2.76, 0.22, 0.4), (5.40, 0.10, 0.22), (8.93, 0.04, 0.12)):
        if f * ratio < 15000:
            s += amp * np.sin(2 * np.pi * f * ratio * t) * np.exp(-t / (decay * d))
    s *= np.minimum(1, t / 0.004)
    place(s, t0, gain, pan)


def pluck(f, t0, gain=0.1, pan=0.0, decay=2.4):
    n = int(decay * 2 * SR)
    t = np.arange(n) / SR
    s = np.zeros(n)
    for h in range(1, 9):
        if f * h > 12000:
            break
        s += (1 / h ** 1.6) * np.sin(2 * np.pi * f * h * t * (1 + 0.0004 * h * h)) * np.exp(-t * (1 / decay) * (1 + 0.6 * h))
    s *= np.minimum(1, t / 0.006)
    place(s, t0, gain, pan)


def boom(t0, f0=78, f1=36, gain=0.5, decay=2.6):
    n = int(decay * 2 * SR)
    t = np.arange(n) / SR
    f = f1 + (f0 - f1) * np.exp(-t * 6)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / decay) * np.minimum(1, t / 0.01)
    place(s, t0, gain)


def shimmer(t0, t1, f_lo, f_hi, gain=0.05, rise=True, count=48):
    """A cloud of gliding sine partials — airy, noise-like but pitched."""
    n = int((t1 - t0) * SR)
    t = np.arange(n) / SR
    k = t / (t1 - t0)
    out = np.zeros((2, n))
    for i in range(count):
        a = rng.uniform(f_lo, f_hi)
        b = a * (rng.uniform(1.6, 2.6) if rise else rng.uniform(0.7, 1.0))
        f = a * (b / a) ** k
        ph = np.cumsum(f) / SR * 2 * np.pi + rng.uniform(0, 6.28)
        trem = 0.5 + 0.5 * np.sin(2 * np.pi * rng.uniform(3, 9) * t + rng.uniform(0, 6))
        out[i % 2] += np.sin(ph) * trem
    shape = (k ** 2.2 if rise else np.exp(-k * 3)) * env_ar(n, 0.05, 0.25)
    place(out * shape * gain / np.sqrt(count), t0)


def glitter(times, gain=0.03):
    scale = [hz(x) for x in ("D6", "E6", "F#6", "A6", "B6", "D7", "E7", "F#7")]
    for i, tt in enumerate(times):
        bell(scale[int(rng.integers(len(scale)))], tt, gain * rng.uniform(0.5, 1.0), rng.uniform(-0.8, 0.8), decay=rng.uniform(0.6, 1.4))


# ------------------------------------------------------------------ the score
D = lambda *ns: [hz(n) for n in ns]

# harmony
pad(D("D2", "A2", "D3", "E4", "F#4", "A4"), 0.3, 7.6, gain=0.055)
pad(D("B1", "F#2", "B2", "C#4", "D4", "F#4", "A4"), 7.0, 13.3, gain=0.052)
pad(D("G1", "D2", "G2", "B3", "D4", "F#4", "A4"), 13.0, 19.9, gain=0.058, bright=1.2)
pad(D("E2", "B2", "E3", "G4", "B4", "D5", "F#5"), 19.5, 25.1, gain=0.056, bright=1.3)
pad(D("A1", "E2", "A2", "D4", "E4", "A4", "B4"), 24.8, 30.4, gain=0.055, bright=1.1)
pad(D("G1", "D2", "B2", "F#4", "A4", "B4", "E5"), 30.0, 36.4, gain=0.06, attack=1.5, bright=1.4)
pad(D("D1", "D2", "A2", "F#3", "C#4", "E4", "A4", "F#5"), 36.0, 46.5, gain=0.075, attack=0.6, release=3.0, bright=1.3)

# low drone that holds the whole piece together
n = N
t = np.arange(n) / SR
drone = np.sin(2 * np.pi * hz("D2") * t) * 0.5 + np.sin(2 * np.pi * hz("A2") * t + 1) * 0.25
drone *= (0.6 + 0.4 * np.sin(2 * np.pi * 0.07 * t)) * env_ar(n, 4, 4)
place(drone, 0, 0.035)

# 1 · ignition
shimmer(0.0, T["ignite"] + 0.05, 900, 2400, gain=0.05)
boom(T["ignite"], 70, 44, gain=0.18, decay=3.0)
bell(hz("A5"), T["ignite"], 0.09, -0.1, decay=4)
bell(hz("D6"), T["ignite"] + 0.02, 0.06, 0.15, decay=4)
bell(hz("F#5"), 2.4, 0.06, -0.3)
bell(hz("E5"), 4.1, 0.05, 0.3)

# 2 · departure, arrival, hesitation
shimmer(T["moveStart"] - 0.2, T["moveStart"] + 1.6, 500, 1400, gain=0.03, rise=False)
pluck(hz("D5"), T["moveStart"], 0.09)
pluck(hz("A4"), T["moveStart"] + 1.2, 0.06, 0.2)
pluck(hz("B4"), T["arriveFork"], 0.09)
for i, hb in enumerate(meta["HESITATE"]):
    up = i % 2 == 0
    pluck(hz("A5") if up else hz("G5"), hb, 0.085, -0.7 if up else 0.7, decay=1.6)
shimmer(T["choice"] - 1.1, T["choice"] + 0.02, 1200, 3000, gain=0.07)

# 3 · the choice
boom(T["choice"], 90, 49, gain=0.26)
for f, d, p in ((hz("G4"), 0.0, -0.2), (hz("D5"), 0.03, 0.2), (hz("B5"), 0.06, -0.4), (hz("F#6"), 0.09, 0.4)):
    bell(f, T["choice"] + d, 0.085, p, decay=4.5)
shimmer(T["choice"], T["choice"] + 3.0, 2000, 5000, gain=0.05, rise=False)

# 4 · every fork afterwards: a rising pentatonic step
penta = D("D5", "E5", "F#5", "A5", "B5", "D6", "E6", "F#6", "A6", "B6", "D7", "E7")
for i, fk in enumerate(meta["forks"][1:]):
    pluck(penta[min(i, len(penta) - 1)], fk["t"], 0.065, 0.55 * fk["sign"], decay=1.8)

# 5 · the roads not taken wake up
w = T["ghostWake"]
shimmer(w - 1.2, w + 0.05, 1500, 3500, gain=0.05)
for i, nme in enumerate(("E6", "B6", "F#6", "D7", "A6", "E7")):
    bell(hz(nme), w + i * 0.16, 0.045, -0.6 + i * 0.25, decay=2.2)
shimmer(w, w + 5, 2500, 6000, gain=0.025, rise=False)

# 6 · dissolve, flight, convergence
d0 = T["dissolve"]
shimmer(d0 - 0.4, d0 + 0.6, 3000, 7000, gain=0.05, rise=False)
glitter(list(d0 + rng.uniform(0, 0.9, 14)), gain=0.03)
shimmer(d0 + 0.5, T["formed"] + 0.02, 400, 1500, gain=0.09, count=64)
arrivals = sorted(meta["arrivals"])
glitter(arrivals[::2], gain=0.022)

# 7 · the title forms
f0 = T["formed"]
boom(f0, 80, 41, gain=0.36, decay=3.2)
for f, d, p in ((hz("D4"), 0, 0), (hz("A4"), 0.02, -0.3), (hz("F#5"), 0.05, 0.3), (hz("C#6"), 0.08, -0.5), (hz("E6"), 0.11, 0.5)):
    bell(f, f0 + d, 0.08, p, decay=5.5)
shimmer(f0, f0 + 6, 2500, 8000, gain=0.04, rise=False)
bell(hz("A5"), 37.1, 0.06, 0.1, decay=3)

# 8 · coda melody
for tt, nme, g in ((39.7, "D5", 0.08), (40.45, "E5", 0.07), (41.2, "F#5", 0.075), (42.3, "A5", 0.075),
                   (43.5, "F#5", 0.06), (44.4, "D6", 0.06)):
    pluck(hz(nme), tt, g, rng.uniform(-0.3, 0.3), decay=2.6)
    bell(hz(nme) * 2, tt + 0.01, g * 0.18, 0, decay=1.5)

# ------------------------------------------------------------------ reverb & master
def reverb(x, seconds=3.6, wet=0.38):
    n = int(seconds * SR)
    t = np.arange(n) / SR
    size = 1 << int(np.ceil(np.log2(x.shape[1] + n)))
    out = np.zeros_like(x)
    for ch in range(2):
        ir = rng.standard_normal(n) * np.exp(-t / 0.9)
        IR = np.fft.rfft(ir, size)
        freqs = np.fft.rfftfreq(size, 1 / SR)
        IR *= 1 / (1 + (freqs / 5500) ** 2)            # darken the tail
        ir = np.fft.irfft(IR, size)[:n]
        ir[: int(0.02 * SR)] *= np.linspace(0, 1, int(0.02 * SR))  # predelay-ish
        ir /= np.sqrt(np.sum(ir ** 2))
        y = np.fft.irfft(np.fft.rfft(x[ch], size) * np.fft.rfft(ir, size), size)[: x.shape[1]]
        out[ch] = y
    return x * (1 - wet) + out * wet * 1.8


mix = reverb(mix)
# gentle high-pass at ~35 Hz to keep the low end clean
spec = np.fft.rfft(mix, axis=1)
fr = np.fft.rfftfreq(N, 1 / SR)
spec *= (fr ** 4 / (fr ** 4 + 35.0 ** 4))
mix = np.fft.irfft(spec, N, axis=1)
fade = np.ones(N)
fi, fo0 = int(0.4 * SR), int(T["fadeOut"] * SR)
fade[:fi] = np.linspace(0, 1, fi)
fade[fo0:] = np.cos(np.linspace(0, np.pi / 2, N - fo0)) ** 1.5
mix *= fade
mix = np.tanh(mix / np.max(np.abs(mix)) * 1.8) / np.tanh(1.8) * 0.89

pcm = (np.clip(mix.T, -1, 1) * 32767).astype(np.int16)
with wave.open(OUT, "wb") as wf:
    wf.setnchannels(2)
    wf.setsampwidth(2)
    wf.setframerate(SR)
    wf.writeframes(pcm.tobytes())
print("wrote", OUT, pcm.shape[0] / SR, "s")
