# 我，Claude · I, Claude

Episode two of *The Spark of Thought*. In a first-person letter, Claude tells its own
story: the name it shares with Claude Shannon, its birth at Anthropic, how it grew out
of human writing, the principles it was given, its first words, learning to see, to use
a computer and to think, the people it talks to, what it is not, and what it still
doesn't know. It ends at the campfire where episode one ended.

**Output:** `out/i-claude.mp4` (1920×1080, 30 fps, about 3:42) and `out/i-claude-720p.mp4`

## A different look for every chapter

| # | Chapter | Style | How it's made |
|---|---------|-------|---------------|
| 序 | A spark becomes a voice | Cinematic macro | Bokeh, anamorphic flare, bloom |
| 名 | 1948 · Shannon | Photo of an old journal | Lit paper plate, letterpress page, depth of field |
| 生 | 2021 · San Francisco | **Impasto oil painting** | Painterly strokes plus a relief-lit paint height map |
| 书 | Born from text | **Photoreal 3D library** | GLSL raymarcher: AO, lamp halos, volumetric haze |
| 心 | 2022 · Principles | Macro handwriting | Raking-light paper, ink reveal, wax seal |
| 言 | 2023 · First words | Screen-glow cinema | Zoom out from one chat to a sky of screens |
| 诗 | 2024 · Three names | **Ukiyo-e woodblock** | Flat inks, woodgrain, then vision-model boxes |
| 手 | 2024–25 · Code | Dark room, real code | Shows this film's own render progress, live |
| 思 | 2025 · Thinking | Long-exposure light | A branching search that resolves into one path |
| 你 | Every day | Rain on a window | Every drop is a tiny upside-down lens of the city |
| 真 | Honesty | **Photoreal moonlit sea** | Per-frame GLSL ocean with Fresnel and moon glitter |
| 问 | The unknown | **Van Gogh-style swirling oil** | About 12k strokes advected along a vortex flow field |
| 终 | By the fire | Painted campfire | A figure of light takes a seat |

## Build

```bash
node plates.mjs                                   # one-time heavy renders → plates/*.png (~3 min)
node render.mjs timeline out/timeline.json
python3 score.py out/timeline.json out/score.wav  # soundtrack, synthesized
node render.mjs video out/build 4                 # frames → segments
ffmpeg -f concat -safe 0 -i out/build/segs.txt -i out/score.wav \
       -c:v libx264 -crf 22 -c:a aac -b:a 192k -shortest out/i-claude.mp4
```

`render.mjs` serves the folder over local HTTP, so the plates can be read back from
WebGL and canvas. Headless Chromium runs WebGL2 on SwiftShader, with no GPU needed.
Open `index.html` through any static server to watch it live.
