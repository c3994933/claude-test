"""narrate.py — synthesize the Chinese voice-over with an offline neural TTS (sherpa-onnx + Kokoro v1.1-zh),
fit each line to its chapter, and mix it over the score with ducking.

    python3 narrate.py out/ep1.json 1 out/ep1-music.wav out/ep1-mix.wav --model DIR --voice 60
"""
import argparse
import json
import re
import subprocess
import tempfile
import wave

import numpy as np
import sherpa_onnx

ap = argparse.ArgumentParser()
ap.add_argument('timeline'); ap.add_argument('ep', type=int); ap.add_argument('music'); ap.add_argument('out')
ap.add_argument('--voice-out'); ap.add_argument('--model', required=True); ap.add_argument('--voice', type=int, default=60)
a = ap.parse_args()
M = a.model.rstrip('/') + '/'
tts = sherpa_onnx.OfflineTts(sherpa_onnx.OfflineTtsConfig(model=sherpa_onnx.OfflineTtsModelConfig(
    kokoro=sherpa_onnx.OfflineTtsKokoroModelConfig(model=M + 'model.onnx', voices=M + 'voices.bin', tokens=M + 'tokens.txt',
        lexicon=M + 'lexicon-us-en.txt,' + M + 'lexicon-zh.txt', data_dir=M + 'espeak-ng-data', dict_dir=M + 'dict'), num_threads=4),
    rule_fsts=M + 'date-zh.fst,' + M + 'phone-zh.fst,' + M + 'number-zh.fst', max_num_sentences=1))

DIG = '零一二三四五六七八九'
def speakable(s):
    s = re.sub(r'(\d{4})\s*年', lambda m: ''.join(DIG[int(c)] for c in m.group(1)) + '年', s)   # 1950 年 → 一九五零年
    s = s.replace('第 37 手', '第三十七手')
    s = re.sub(r'[《》“”"]', '', s).replace('——', '，').replace('·', '').replace('？', '?').replace('：', '，')
    return re.sub(r'\s+', ' ', s).strip()

def say(text, fit):
    """Fit a line into its slot: first drop the inner pauses, only then speed up (gently)."""
    tight = re.sub(r'[，：、](?=.)', ' ', speakable(text))
    best = None
    for variant in (speakable(text), tight):
        for sp in (1.0, 1.06, 1.12):
            g = tts.generate(variant, sid=a.voice, speed=sp)
            y = np.asarray(g.samples, dtype=np.float64); sr = g.sample_rate
            nz = np.where(np.abs(y) > .01)[0]; y = y[max(0, nz[0] - 200):nz[-1] + 2400] if len(nz) else y
            dur = len(y) / sr
            if best is None or dur < best[2]: best = (y, sr, dur, sp)
            if dur <= fit: return y, sr, dur, sp
    return best

d = json.load(open(a.timeline)); sc = d['scenes']; TOTAL = d['total']
events = []
for c in sc['chapters']:
    for L in c['lines']: events.append((L['at'] + .35, L['cn'], L['out'] - L['at'] - .3))
for s in sc['shots']:
    if s.get('title') and not s.get('card'):
        events.append((s['start'] + .45, s['title'][0] + '。', 2.6))
    if s.get('card'):
        txt = '下一集，我，Claude。' if a.ep == 1 else '我是 Claude，很高兴认识你。'
        events.append((s['start'] + 1.1, txt, s['dur'] - 1.6))
events.sort()

SR = 44100; N = int((TOTAL + 1) * SR); voice = np.zeros(N)
for t0, text, fit in events:
    y, sr, dur, sp = say(text, fit)
    with tempfile.NamedTemporaryFile(suffix='.wav') as fi, tempfile.NamedTemporaryFile(suffix='.raw') as fo:
        w = wave.open(fi.name, 'wb'); w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr); w.writeframes((np.clip(y, -1, 1) * 32767).astype('<i2').tobytes()); w.close()
        subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', fi.name, '-af', 'highpass=f=80,equalizer=f=180:t=q:w=1:g=2,equalizer=f=3500:t=q:w=1.2:g=2.5,acompressor=threshold=-20dB:ratio=3:attack=5:release=80',
                        '-ar', str(SR), '-f', 's16le', '-ac', '1', fo.name], check=True)
        z = np.frombuffer(open(fo.name, 'rb').read(), '<i2') / 32768
    z = z / (np.sqrt(np.mean(z[np.abs(z) > .02] ** 2)) + 1e-9) * .2
    i0 = int(t0 * SR); n = min(len(z), N - i0); voice[i0:i0 + n] += z[:n]
    print(f'{t0:7.2f}s  {dur:4.2f}s/{fit:4.2f}s  x{sp:.2f}  {text}')

# a little room around the voice
irn = int(.5 * SR); ir = np.random.default_rng(1).standard_normal(irn) * np.exp(-np.arange(irn) / SR / .12); ir[:int(.012 * SR)] = 0; ir /= np.sqrt(np.sum(ir ** 2))
L = 1 << int(np.ceil(np.log2(N + irn)))
voice = voice + .12 * np.fft.irfft(np.fft.rfft(voice, L) * np.fft.rfft(ir, L), L)[:N]

if a.voice_out:
    vv = np.clip(voice / max(1e-9, np.abs(voice).max()) * .9, -1, 1)
    w = wave.open(a.voice_out, 'wb'); w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((np.repeat(vv[:, None], 2, 1) * 32767).astype('<i2').tobytes()); w.close()
w = wave.open(a.music); mus = np.frombuffer(w.readframes(w.getnframes()), '<i2').reshape(-1, 2).T / 32768; w.close()
M2 = np.zeros((2, N)); n = min(N, mus.shape[1]); M2[:, :n] = mus[:, :n]
# duck the score under the voice
env = np.abs(voice); k = int(.15 * SR); env = np.convolve(env, np.ones(k) / k, 'same'); env = np.clip(env / .04, 0, 1)
k2 = int(.3 * SR); env = np.convolve(env, np.ones(k2) / k2, 'same'); env = np.clip(env * 1.4, 0, 1)
mix = M2 * (1 - .68 * env) + voice[None, :] * 1.0
mix /= max(1e-9, np.percentile(np.abs(mix), 99.97)); mix = np.tanh(mix * .95) / np.tanh(.95) * .9
w = wave.open(a.out, 'wb'); w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((np.clip(mix.T, -1, 1) * 32767).astype('<i2').tobytes()); w.close()
print('wrote', a.out)
