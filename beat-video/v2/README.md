# v2 — 一拍 = 视野放大 10 倍 (Canvas renderer)

Anti-aliased Canvas 2D version rendered in headless Chromium via Playwright.
Beats 0–35 step 10^-12 → 10^23 m (beat 12 = 10^0 m, "you", on the drop). The song is cut at
beat 36, where its next section starts; a synthesized coda (sub boom + pad) plays under a
smooth zoom to 10^26 m and the end card.

Needs `../grid.json`, `../in/src.mp4`, and fonts in `../fonts/` (Noto Sans SC 300/500/900,
Noto Serif SC 900, Space Grotesk 500/700 from Google Fonts; not committed).

```bash
node render.js preview 5.0,10.6,20.0 pv/f   # stills -> pv/f_00.jpg ...
python3 audio.py                            # -> mix.wav
node render.js full video_only.mp4
ffmpeg -i video_only.mp4 -i mix.wav -map 0:v -map 1:a -c:v copy -c:a aac -b:a 192k -ac 2 -shortest out.mp4
```

## Cover

`node cover.js` renders `cover_9x16.png` (1080×1920) and `cover_3x4.png` (1080×1440) from `cover.html`.
