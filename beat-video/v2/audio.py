# song 2.0s -> cut at beat 36 (where the unwanted section starts), then a synthesized cosmic coda
import numpy as np, json, subprocess, wave
g = json.load(open('../grid.json')); P = 60 / g['bpm']; B0 = g['first']
SR = 48000; T0 = 2.0; CUT = B0 + 36 * P; END = CUT + 4.8
raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', '../in/src.mp4', '-vn', '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-'], capture_output=True).stdout
x = np.frombuffer(raw, np.float32)
song = x[int(T0 * SR):int(CUT * SR)].copy()
f = int(0.03 * SR); song[-f:] *= np.linspace(1, 0, f)
song[:int(0.15 * SR)] *= np.linspace(0, 1, int(0.15 * SR))
n = int((END - CUT) * SR); t = np.arange(n) / SR
# sub boom on the cut
boom = np.sin(2 * np.pi * (32 * t + (70 - 32) * 0.18 * (1 - np.exp(-t / 0.18)))) * np.exp(-t / 0.9) * 0.55
# airy pad: open fifths, slow swell, gentle detune
pad = np.zeros(n)
for fr, amp in [(110, .5), (164.81, .35), (220, .35), (329.63, .22), (493.88, .12), (659.26, .07)]:
    for d in (-0.6, 0.6):
        pad += amp * np.sin(2 * np.pi * (fr + d) * t + d)
env = np.minimum(1, t / 0.9) * np.clip((END - CUT - t) / 1.6, 0, 1)
pad *= env * 0.11 * (1 + 0.15 * np.sin(2 * np.pi * 0.7 * t))
# shimmer
sh = (np.sin(2 * np.pi * 1318.5 * t) + 0.6 * np.sin(2 * np.pi * 1975.5 * t)) * 0.02 * np.minimum(1, t / 1.5) * np.clip((END - CUT - t) / 1.6, 0, 1) * (0.5 + 0.5 * np.sin(2 * np.pi * 3 * t))
# soft noise whoosh following the zoom
rng = np.random.default_rng(1); nz = rng.standard_normal(n)
k = 400; nz = np.convolve(nz, np.ones(k) / k, 'same') * 6
whoosh = nz * np.exp(-((t - 1.2) / 0.7) ** 2) * 0.12
coda = boom + pad + sh + whoosh
peak = np.abs(song).max(); coda *= 0.8 * peak / max(1e-6, np.abs(coda).max())
y = np.concatenate([song, coda]).clip(-1, 1)
with wave.open('mix.wav', 'wb') as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes((y * 32767).astype(np.int16).tobytes())
print('audio sec', len(y) / SR, 'cut at video', CUT - T0)
