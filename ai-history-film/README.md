# 思想的火种 · The Spark of Thought

A 4-minute cinematic short about the history of artificial intelligence, told like
an epic: from the bronze giant Talos to machines that talk. Every frame is drawn
procedurally on a `<canvas>`, and every sound is synthesized with numpy. There are
no stock images, video or audio.

**Output:** `out/spark-of-thought.mp4` (1920×1080, 30 fps, about 4:00, stereo AAC)

## Chapters

| # | Time | Scene | Look |
|---|------|-------|------|
| 序 | — | An ember in the dark → title | Night sky, embers |
| 铜 | c. 700 BCE | Talos, the bronze giant | Greek black-figure vase |
| 算 | 1843 | Ada Lovelace, Note G | Brass gears, candlelight |
| 问 | 1950 | Turing: “Can machines think?” | Chalk on slate |
| 名 | 1956 | Dartmouth names the dream | Summer night, constellation of founders |
| 学 | 1958 | Rosenblatt’s Perceptron | Amber circuit + 1958 newspaper |
| 冬 | 1974–80 | The first AI winter | Frozen etched mountains, snow |
| 火 | 1986 | Backpropagation | Keepers of the fire in the snow |
| 棋 | 1997 | Deep Blue vs Kasparov | Spot-lit chessboard, the king falls |
| 看 | 2012 | AlexNet learns to see | Glowing layer diagram, ImageNet wall |
| 弈 | 2016 | AlphaGo, move 37 | Chinese ink-wash painting |
| 意 | 2017 | Attention Is All You Need | Attention arcs between words |
| 话 | 2022 | 100M people in two months | Earth at night lighting up |
| 今 | Today | A mind made of light | Galaxy of particles |
| 终 | — | Back to the fire → “to be continued” | Savanna campfire under the Milky Way |

## Files

- `index.html`: the player. Open it in a browser to watch live, with a scrubber. It plays `score.wav` if that file is in the same folder.
- `core.js`: noise, textures, film post-processing (aged paper, grain, vignette, flicker, scratches), subtitles, date header and timeline.
- `scenes1.js`, `scenes2.js`: the 15 scenes.
- `main.js`: the screenplay (Chinese and English lines) and the automatic timing layout.
- `render.mjs`: headless Chromium renders each frame and pipes it to ffmpeg.
- `score.py`: the soundtrack (pads, piano, music box, guzheng-style plucks, gong, booms, wind, fire, typewriter), cued from the timeline.

## Build

```bash
# Fonts: Noto Serif SC, Cormorant Garamond, Cinzel, Ma Shan Zheng (Google Fonts) installed locally
node render.mjs timeline out/timeline.json
node render.mjs video out/build 4                 # silent segments
python3 score.py out/timeline.json out/score.wav  # soundtrack
ffmpeg -f concat -safe 0 -i out/build/segs.txt -i out/score.wav \
       -c:v copy -c:a aac -b:a 192k -shortest out/spark-of-thought.mp4
```

Render a few stills to review a scene: `node render.mjs stills 32.5,61.7 out/stills`.
