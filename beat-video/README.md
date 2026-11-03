# Beat-synced neon night-drive video

Procedural 9:16 video (PIL + numpy → ffmpeg) synced to a 90 BPM track.
Source music is not included; put it at `in/src.mp4` (any video/audio file ffmpeg reads).

```bash
mkdir -p in && ffmpeg -i in/src.mp4 -vn -ac 1 -ar 22050 in/audio.wav
python3 analyze.py      # onset envelope -> env.npz
python3 grid.py         # BPM + beat phase -> grid.json
python3 feats.py        # per-frame spectrum/flux -> vfeats.npz
python3 render.py 360 preview 5.3,10.6,13,22   # stills -> preview.png
python3 render.py 1080 full out.mp4            # final video
```

Timeline (audio seconds): intro 2.55–10.55 (title letters per beat, fuel fills, countdown),
drop at 10.55 (flash + GO!!), main 10.55–26.54 (palette per bar, car hops on backbeats,
exhaust flames on dembow off-beats, BOUNCE bar), outro 26.54–29.6 (out of fuel, fade).

## 一拍 = 视野放大 10 倍 (`scale.py`)

Science version: every beat zooms out ×10, from 10^-12 m (inside an atom) to 10^26 m
(observable universe). Beat 12 (the drop) lands on 10^0 m, "you". Each level has a
procedurally drawn object, a name, a one-line fact and a log-scale ruler.

```bash
python3 scale.py 270 preview 5.0,10.6,20.0 sheet.png   # stills
python3 scale.py 1080 full cosmic_zoom.mp4             # final video
```
