#!/usr/bin/env bash
# Build 一束光的旅行 end to end: frames -> score -> light.mp4
set -euo pipefail
cd "$(dirname "$0")"
rm -rf frames
node render.js frames "${WORKERS:-4}"
python3 music.py meta.json score.wav
ffmpeg -y -hide_banner -loglevel warning \
  -framerate 60 -i frames/f%05d.png -i score.wav \
  -c:v libx264 -preset slow -crf 16 -pix_fmt yuv420p -profile:v high \
  -c:a aac -b:a 320k -af "loudnorm=I=-14:TP=-1.2:LRA=8" -ar 48000 \
  -movflags +faststart -shortest light.mp4
rm -rf frames score.wav
echo "done -> light.mp4"
