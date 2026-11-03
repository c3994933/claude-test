"""Synthesize a 90 BPM placeholder beat track for the ENFP storyboard.

The track only exists so the draft animation can be checked for beat sync;
swap in real music at the same BPM (the drop lands on 0:10.67).
"""
import sys
import wave

import numpy as np

from timeline import B, BAR, DUR, T

SR = 44100
rng = np.random.default_rng(7)


def note(name):
    names = {"C": 0, "C#": 1, "D": 2, "D#": 3, "E": 4, "F": 5, "F#": 6,
             "G": 7, "G#": 8, "A": 9, "A#": 10, "B": 11}
    pitch, octave = name[:-1], int(name[-1])
    midi = 12 * (octave + 1) + names[pitch]
    return 440.0 * 2 ** ((midi - 69) / 12)


# C - G - Am - F, one chord per bar
CHORDS = [["C3", "E3", "G3", "B3"], ["G2", "D3", "G3", "B3"],
          ["A2", "E3", "A3", "C4"], ["F2", "C3", "F3", "A3"]]
ROOTS = ["C2", "G1", "A1", "F1"]
ARP = [["C5", "E5", "G5", "B5"], ["B4", "D5", "G5", "D5"],
       ["A4", "C5", "E5", "C5"], ["A4", "C5", "F5", "C5"]]


class Mix:
    def __init__(self, dur):
        self.n = int(dur * SR)
        self.buf = np.zeros((self.n, 2))

    def add(self, t0, sig, gain=1.0, pan=0.0):
        i0 = int(t0 * SR)
        if i0 >= self.n:
            return
        sig = sig[: self.n - i0]
        left = np.cos((pan + 1) * np.pi / 4) * gain
        right = np.sin((pan + 1) * np.pi / 4) * gain
        self.buf[i0:i0 + len(sig), 0] += sig * left
        self.buf[i0:i0 + len(sig), 1] += sig * right


def tvec(d):
    return np.arange(int(d * SR)) / SR


def kick(big=False):
    t = tvec(0.9 if big else 0.45)
    f = 45 + 130 * np.exp(-t * 28)
    ph = 2 * np.pi * np.cumsum(f) / SR
    env = np.exp(-t * (3.5 if big else 7))
    s = np.sin(ph) * env
    click = rng.standard_normal(len(t)) * np.exp(-t * 300) * 0.3
    return np.tanh((s + click) * 1.6)


def clap():
    t = tvec(0.35)
    n = np.diff(rng.standard_normal(len(t) + 1))
    env = np.exp(-t * 16)
    # three quick re-triggers make it read as a clap
    for d in (0.008, 0.017):
        env += np.exp(-np.maximum(t - d, 0) * 40) * (t > d) * 0.6
    tone = np.sin(2 * np.pi * 190 * t) * np.exp(-t * 25) * 0.4
    return (n * env * 0.35 + tone)


def hat(open_=False):
    t = tvec(0.25 if open_ else 0.06)
    n = np.diff(np.diff(rng.standard_normal(len(t) + 2)))
    return n * np.exp(-t * (14 if open_ else 70)) * 0.12


def bell(f, d=1.6, decay=3.0):
    t = tvec(d)
    s = (np.sin(2 * np.pi * f * t) + 0.35 * np.sin(2 * np.pi * f * 2.76 * t) * np.exp(-t * 4)
         + 0.2 * np.sin(2 * np.pi * f * 5.4 * t) * np.exp(-t * 9))
    return s * np.exp(-t * decay) * np.minimum(t * 400, 1)


def pluck(f, d=0.8):
    t = tvec(d)
    s = np.sin(2 * np.pi * f * t) + 0.4 * np.sin(4 * np.pi * f * t) * np.exp(-t * 8)
    return s * np.exp(-t * 5) * np.minimum(t * 300, 1)


def pad(freqs, d, attack=0.6, release=0.8):
    t = tvec(d)
    s = np.zeros_like(t)
    for f in freqs:
        for det in (-0.25, 0.0, 0.25):
            ff = f * 2 ** (det / 12 / 4)
            s += np.sin(2 * np.pi * ff * t) + 0.3 * np.sin(4 * np.pi * ff * t) + 0.12 * np.sin(6 * np.pi * ff * t)
    env = np.minimum(t / attack, 1) * np.minimum((d - t) / release, 1)
    return s * np.clip(env, 0, 1) / (len(freqs) * 3)


def bass(f, d):
    t = tvec(d)
    s = np.tanh(1.8 * np.sin(2 * np.pi * f * t)) * np.exp(-t * 3) * np.minimum(t * 200, 1)
    return s


def noise_riser(d):
    t = tvec(d)
    n = np.diff(rng.standard_normal(len(t) + 1))
    sweep = np.sin(2 * np.pi * np.cumsum(200 + 1800 * (t / d) ** 2) / SR)
    ramp = (t / d) ** 2.2
    return (n * 0.25 + sweep * 0.25) * ramp


def crash(d=2.5):
    t = tvec(d)
    n = np.diff(rng.standard_normal(len(t) + 1))
    return n * np.exp(-t * 2.2) * 0.35


def sub_drop(d=1.6):
    t = tvec(d)
    f = 30 + 60 * np.exp(-t * 3)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 2)


def chord_at(t):
    return int(t // BAR) % 4


def build(path):
    m = Mix(DUR + 0.5)

    # ---------- intro (cold, sparse) ----------
    for b in range(4):
        t0 = b * BAR
        d = BAR + 0.4 if b < 3 else (T["silence"] - t0)
        m.add(t0, pad([note(n) for n in CHORDS[b]], d, attack=0.8, release=0.3), 0.32)
    # bar 2: the spark arrives -> soft plucks on each beat
    for k in range(4):
        m.add(BAR + k * B, pluck(note(["E5", "G5", "C6", "G5"][k])), 0.16, pan=-0.3 + 0.2 * k)
    # bar 3: each warming ring rings a bell, rising
    for k in range(4):
        m.add(2 * BAR + k * B, bell(note(["C5", "E5", "G5", "C6"][k]), 2.0), 0.22, pan=0.2 * (k - 1.5))
    # bar 4: riser into a half-beat of silence
    m.add(3 * BAR, noise_riser(T["silence"] - 3 * BAR), 0.5)

    # ---------- drop ----------
    drop = T["drop"]
    m.add(drop, kick(big=True), 0.9)
    m.add(drop, crash(), 0.6)
    m.add(drop, sub_drop(), 0.6)
    m.add(drop, bell(note("C6"), 3.0, 1.4), 0.25)

    # ---------- main groove: drop .. ending ----------
    end_groove = T["end"]
    nbeats = int(round((end_groove - drop) / B))
    for i in range(nbeats):
        tb = drop + i * B
        beat_in_bar = i % 4
        if beat_in_bar in (0, 2) and i > 0:
            m.add(tb, kick(), 0.75)
        if beat_in_bar == 1:
            m.add(tb + B / 2, kick(), 0.45)  # syncopated push
        if beat_in_bar in (1, 3):
            m.add(tb, clap(), 0.55)
        for h in range(2):
            m.add(tb + h * B / 2, hat(open_=(h == 1 and beat_in_bar == 3)), 0.9, pan=0.35)
        c = chord_at(tb)
        for h in range(2):
            m.add(tb + h * B / 2, bass(note(ROOTS[c]) * 2, B / 2), 0.32)
        if beat_in_bar == 0:
            m.add(tb, pad([note(n) for n in CHORDS[c]], BAR + 0.2, attack=0.05, release=0.4), 0.26)
        for h in range(2):
            m.add(tb + h * B / 2, pluck(note(ARP[c][(2 * beat_in_bar + h) % 4]), 0.4), 0.07, pan=-0.4)

    # E: a chime every time someone lights up
    for k in range(5):
        m.add(T["e_light0"] + k * B, bell(note(["C6", "D6", "E6", "G6", "A6"][k]), 1.2), 0.2, pan=-0.6 + 0.3 * k)
    # N: one tone per branching level, climbing
    for k in range(6):
        m.add(T["n"] + k * B, bell(note(["G5", "A5", "C6", "D6", "E6", "G6"][k]), 1.0, 4.0), 0.15, pan=0.3)
    # F: warm swells on each ring
    for k in range(4):
        m.add(T["f_touch"] + k * B, bell(note(["E5", "G5", "C6", "E6"][k]), 2.2, 1.8), 0.18)
    # P: sparkler scribble per shape
    for k in range(6):
        m.add(T["p"] + k * B, bell(note(["C6", "E6", "G6", "B6", "A6", "E6"][k]), 0.8, 6.0), 0.15, pan=-0.5 + 0.2 * k)

    # ---------- ending (quiet) ----------
    e0 = T["end"]
    m.add(e0, pad([note(n) for n in ["F2", "C3", "F3", "A3"]], T["outro"] - e0 + 0.3, attack=0.3, release=0.4), 0.3)
    for k, n in enumerate(["A4", "C5", "F5", "E5"]):
        m.add(e0 + 0.15 + k * B, pluck(note(n), 1.6), 0.18)
    pop = T["pop"]
    m.add(pop, kick(), 0.35)
    m.add(pop, crash(1.5), 0.25)
    for k, n in enumerate(["C6", "E6", "G6", "C7"]):
        m.add(pop + 0.04 * k, bell(note(n), 2.0, 2.0), 0.13, pan=-0.3 + 0.2 * k)
    m.add(pop + 0.1, pad([note(n) for n in ["C3", "G3", "C4", "E4", "G4"]], DUR - pop, attack=0.5, release=2.0), 0.36)
    m.add(T["outro"], bell(note("C5"), 2.8, 1.2), 0.2)
    m.add(T["outro"] + B * 2, bell(note("G5"), 2.4, 1.4), 0.12)

    x = m.buf
    x = np.tanh(x * 1.2) * 0.85
    x /= max(1e-9, np.abs(x).max()) / 0.89
    pcm = (x * 32767).astype("<i2")
    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


if __name__ == "__main__":
    build(sys.argv[1])
