#!/usr/bin/env bash
# prep.sh — pull the scene libraries of both episodes into this folder under distinct globals
# (episode one's scenes become S1.*, episode two's become S2.*), and share episode two's plates.
set -euo pipefail
cd "$(dirname "$0")"
cp ../claude-intro-film/core.js core.js
sed -i 's/const chars = \[...L.cn\], per = .085, Y = 862;/const chars = [...L.cn], per = window.SUB_PER || .085, Y = 862;/' core.js
cp ../claude-intro-film/gl.js gl.js
sed 's/\bSC\b/S1/g' ../ai-history-film/scenes1.js > ep1a.js
sed 's/\bSC\b/S1/g' ../ai-history-film/scenes2.js > ep1b.js
sed 's/\bSC\b/S2/g' ../claude-intro-film/scenesA.js > ep2a.js
sed 's/\bSC\b/S2/g' ../claude-intro-film/scenesB.js > ep2b.js
ln -sfn ../claude-intro-film/plates plates
ln -sfn /opt/node22/lib/node_modules node_modules 2>/dev/null || true
echo prepared
