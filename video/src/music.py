"""Synthesize the soundtrack: a bouncy 120 BPM loop + sound effects synced to index.html."""
import sys
import wave
import numpy as np

SR = 44100
T_END = 38.5
N = int(SR * T_END)
rng = np.random.default_rng(7)
L = np.zeros(N)
R = np.zeros(N)


def add(sig, t, gain=1.0, pan=0.0):
    i = int(t * SR)
    if i >= N:
        return
    sig = sig[: N - i] * gain
    L[i:i + len(sig)] += sig * (1 - max(0, pan))
    R[i:i + len(sig)] += sig * (1 + min(0, pan))


def tt(d):
    return np.arange(int(d * SR)) / SR


def hz(m):
    return 440 * 2 ** ((m - 69) / 12)


# ---- instruments ----
def marimba(m, d=0.45):
    t, f = tt(d), hz(m)
    s = np.sin(2 * np.pi * f * t) * np.exp(-t * 7) + 0.35 * np.sin(2 * np.pi * 4 * f * t) * np.exp(-t * 26)
    return s * np.minimum(1, t * 400)


def bass(m, d=0.24):
    t, f = tt(d), hz(m)
    s = np.sin(2 * np.pi * f * t) + 0.35 * np.sin(4 * np.pi * f * t) + 0.12 * np.sin(6 * np.pi * f * t)
    return s * np.minimum(1, t * 300) * np.exp(-t * 5) * np.minimum(1, (d - t) * 60)


def pad(ms, d=2.0):
    t = tt(d)
    s = sum(np.sin(2 * np.pi * hz(m) * t * (1 + det)) for m in ms for det in (-0.003, 0.003))
    return s * np.minimum(1, t * 3) * np.minimum(1, (d - t) * 3) / (2 * len(ms))


def kick():
    t = tt(0.3)
    ph = 2 * np.pi * np.cumsum(45 + 110 * np.exp(-t * 30)) / SR
    return np.sin(ph) * np.exp(-t * 9)


def clap():
    t = tt(0.2)
    n = rng.standard_normal(len(t))
    n = np.diff(n, prepend=0)
    return n * np.exp(-t * 22) * 0.5


def hat():
    t = tt(0.05)
    n = np.diff(rng.standard_normal(len(t)), prepend=0)
    return n * np.exp(-t * 90) * 0.25


# ---- sfx ----
def pop(f0=500, f1=1300):
    t = tt(0.12)
    ph = 2 * np.pi * np.cumsum(f0 + (f1 - f0) * (t / t[-1]) ** .5) / SR
    return np.sin(ph) * np.exp(-t * 30)


def whoosh(d=0.5):
    t = tt(d)
    n = rng.standard_normal(len(t))
    k = 30
    n = np.convolve(n, np.ones(k) / k, mode='same')  # soften
    env = np.sin(np.pi * t / d) ** 2
    return n * env * 3.0


def ding(f=1568):
    t = tt(1.2)
    return (np.sin(2 * np.pi * f * t) + 0.5 * np.sin(2 * np.pi * f * 1.5 * t) + 0.25 * np.sin(2 * np.pi * f * 2.0 * t)) * np.exp(-t * 4) * 0.5


def thump():
    t = tt(0.4)
    ph = 2 * np.pi * np.cumsum(60 + 160 * np.exp(-t * 25)) / SR
    return np.sin(ph) * np.exp(-t * 7)


# ---- music ----
BEAT = 0.5
CHORDS = [(48, [60, 64, 67]), (43, [59, 62, 67]), (45, [60, 64, 69]), (41, [60, 65, 69])]  # C G Am F
ARP = [0, 1, 2, 3, 2, 1, 2, 3]
bars = int(np.ceil(T_END / 2))
for b in range(bars):
    t0 = b * 2.0
    root, tones = CHORDS[b % 4]
    notes = tones + [tones[0] + 12]
    drums = 4.0 <= t0 < 36.0
    add(pad(tones), t0, 0.22)
    for i, a in enumerate(ARP):
        add(marimba(notes[a] + 12), t0 + i * 0.25, 0.32 if drums else 0.24, pan=0.25 if i % 2 else -0.25)
    if t0 >= 2.0:
        for i in range(8):
            add(bass(root + (12 if i % 2 else 0)), t0 + i * 0.25, 0.42)
    if drums:
        for beat in range(4):
            bt = t0 + beat * BEAT
            if beat in (0, 2):
                add(kick(), bt, 0.9)
            else:
                add(clap(), bt, 0.55)
            add(hat(), bt + 0.25, 0.8, pan=0.3)
            add(hat(), bt, 0.5, pan=-0.3)
    if t0 == 2.0:  # snare roll into the drop
        for i in range(8):
            add(clap(), 3.0 + i * 0.125, 0.15 + 0.06 * i)
# final chord
add(pad([60, 64, 67, 72], 2.5), 36.0, 0.35)
add(marimba(84, 1.5), 36.0, 0.4)

# ---- sfx timeline (mirrors index.html) ----
for i in range(5):
    add(pop(500 + 80 * i, 1200 + 120 * i), 0.35 + i * 0.12, 0.35)
add(pop(300, 900), 0.1, 0.4)
add(thump(), 1.6, 0.9)
add(pop(), 1.9, 0.35)
for s in (4, 10, 16, 22, 28, 34):
    add(whoosh(), s - 0.12, 0.35)
    add(pop(400, 1100), s + 0.3, 0.45)
    if s < 34:
        add(ding(2093), s + 1.05, 0.18)  # headline appears
        add(pop(250, 600), s + 1.9, 0.3)  # card slides up
# No.1 hearts
for i in range(3):
    add(pop(700 + 150 * i, 1500 + 200 * i), 4 + 0.9 + i * 0.32, 0.45)
# No.2 crown lands
add(ding(1568), 10 + 2.45 + 0.6 * 0.36, 0.45)
add(ding(2349), 10 + 2.8, 0.25)
# No.3 heart
add(pop(800, 1700), 16 + 1.0, 0.45)
# No.4 shrimp gulps + reveal
for i in range(6):
    add(pop(900 - 60 * i, 300), 22 + 0.85 + i * 0.28 + 0.5, 0.45)
add(ding(1760), 22 + 0.85 + 5 * 0.28 + 0.6, 0.45)
# No.5 timer done
add(ding(1976), 28 + 2.8, 0.45)
add(ding(2637), 28 + 2.9, 0.3)
# outro buttons
for i in range(5):
    add(pop(600 + 90 * i, 1400), 34 + 0.9 + i * 0.1, 0.3)
for i in range(3):
    add(pop(500, 1200), 34 + 1.6 + i * 0.2, 0.35)

# ---- master ----
mix = np.stack([L, R], axis=1)
mix /= np.max(np.abs(mix)) + 1e-9
mix = np.tanh(mix * 1.6) / np.tanh(1.6) * 0.89
fade = np.ones(N)
fn = int(1.2 * SR)
fade[-fn:] = np.linspace(1, 0, fn)
fade[: int(0.02 * SR)] = np.linspace(0, 1, int(0.02 * SR))
mix *= fade[:, None]
out = sys.argv[1] if len(sys.argv) > 1 else 'audio.wav'
with wave.open(out, 'wb') as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((mix * 32767).astype('<i2').tobytes())
print('wrote', out)
