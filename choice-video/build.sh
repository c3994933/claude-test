#!/usr/bin/env bash
# Build 选择 · Choice end to end: frames -> score -> choice.mp4
set -euo pipefail
cd "$(dirname "$0")"
rm -rf frames
node render.js frames "${WORKERS:-4}"
python3 music.py meta.json score.wav
ffmpeg -y -hide_banner -loglevel warning \
  -framerate 30 -i frames/f%05d.png -i score.wav \
  -c:v libx264 -preset slow -crf 16 -tune grain -pix_fmt yuv420p -profile:v high \
  -c:a aac -b:a 256k -af "loudnorm=I=-15:TP=-1.5:LRA=9" \
  -movflags +faststart -shortest choice.mp4
rm -rf frames score.wav
echo "done -> choice.mp4"
