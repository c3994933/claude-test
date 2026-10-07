# 思想的火种 · 第二版（两集连贯版）

The faster, more connected re-cut of both films. The first versions are untouched, in
`../ai-history-film` and `../claude-intro-film`.

| | Episode 1 ·《思想的火种》 | Episode 2 ·《我，Claude》 |
|---|---|---|
| Length | about 1:54 | about 1:43 |
| Output | `out/ep1-v2.mp4` | `out/ep2-v2.mp4` |

## What changed from version one

- **Pacing:** every cut lands on a beat grid of 84 BPM (one bar ≈ 2.86 s). A chapter is 2–3 shots, about 5.7 s, with one short typed subtitle line instead of two long ones.
- **More shots:** wide → close-up → reveal inside every chapter, with punch-in zooms on the cut and a camera shake on impacts.
- **Transitions:** flash, whip-pan, zoom-through, ink bloom, film burn, and a time-tunnel warp with a rolling year counter between eras.
- **Openings:** each episode opens with a one-beat-per-shot montage, then a title slam with a light burst.
- **Continuity:**
  - Episode 1 opens and closes on the oil-painted campfire and ends with "下一集 ·《我，Claude》".
  - Episode 2 opens on the same fire ("上一集，故事停在这堆火旁"), pushes into the spark and lands on its title.
  - It ends with a figure of light sitting down by that same fire.
- **Two editions:** a silent cut for adding your own music (`ep*-v2.mp4`), and a narrated edition with an original beat-synced score (`ep*-v2-voice.mp4`).

## Narration and score (the voiced edition)

- `score.py` writes an original soundtrack straight from the shot list:
  - hits on every montage shot, a slam on the title
  - risers into the time warps, quiet bridges, a full chorus
  - a transition sound per cut, plus rain, sea, wind and fire beds
- `narrate.py` voices every subtitle with an offline neural TTS: [sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx) with Kokoro v1.1-zh.
  - Episode one uses a deep male narrator (voice 60); episode two uses a warm first-person voice (voice 10).
  - Each line is fitted to its chapter, by removing inner pauses first and speeding up at most ×1.12.
  - The score ducks under the voice.
- Intelligibility was checked with an offline Chinese speech recogniser (Paraformer) on the final mix.

```bash
pip install sherpa-onnx
# models: kokoro-multi-lang-v1_1 (tts-models release) from github.com/k2-fsa/sherpa-onnx/releases
EP=1 node render.mjs timeline out/ep1.json
python3 score.py out/ep1.json 1 out/ep1-music.wav
python3 narrate.py out/ep1.json 1 out/ep1-music.wav out/ep1-mix.wav --model kokoro-multi-lang-v1_1 --voice 60
ffmpeg -i out/ep1-v2.mp4 -i out/ep1-mix.wav -map 0:v -map 1:a -c:v copy -c:a aac -b:a 192k -shortest out/ep1-v2-voice.mp4
```

## Adding your own music

```bash
# put the song next to the video, then (fades the music out over the last 3 s):
D=$(ffprobe -v error -show_entries format=duration -of csv=p=0 out/ep1-v2.mp4)
ffmpeg -i out/ep1-v2.mp4 -i song.mp3 -map 0:v -map 1:a -c:v copy -c:a aac -b:a 192k \
       -af "afade=t=out:st=$(echo "$D-3" | bc):d=3" -shortest out/ep1-v2-music.mp4
```

Any phone or desktop editor works too (剪映 / CapCut, iMovie, Premiere): drop the video and the song on the timeline.

## Build

```bash
./prep.sh                      # pulls both films' scene code in as S1.* / S2.*, links episode two's plates
EP=1 node render.mjs video out/build1 4    # then concat out/build1/segs.txt with ffmpeg
EP=2 node render.mjs video out/build2 4
```

The shot lists live in `series.js` (`EPISODES`). Each shot has its length in beats, the scene,
the scene time to start from, a zoom and focus point, and the transition into it.
