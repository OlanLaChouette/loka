#!/usr/bin/env bash
# Fabrique un ou plusieurs tutos de bout en bout, à partir des écrans déjà capturés (node tutos/capture.cjs).
# Usage : bash tutos/fabriquer.sh 01-creer-son-espace [02-…]   (--voix pour refaire la voix off)
set -e
cd "$(dirname "$0")/.."
FF=$(python -c "import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())")
REFAIRE_VOIX=0
for a in "$@"; do [ "$a" = "--voix" ] && REFAIRE_VOIX=1; done
mkdir -p tutos/videos
for ID in "$@"; do
  [ "$ID" = "--voix" ] && continue
  if [ $REFAIRE_VOIX = 1 ] || [ ! -f "tutos/$ID/voix.json" ]; then python tutos/voix.py "$ID"; fi
  python tutos/preparer.py "$ID"
  python tutos/son.py "$ID"
  (cd video && SCENE="../tutos/$ID/scene.html" SORTIE="../tutos/$ID/rendu" NOM=muet.mp4 node render.mjs > "../tutos/$ID/rendu.log" 2>&1)
  "$FF" -y -loglevel error -i "tutos/$ID/rendu/muet.mp4" -i "tutos/$ID/mix.wav" -c:v copy -c:a aac -b:a 160k -af loudnorm=I=-16:TP=-1.5 -shortest "tutos/videos/Loka-tuto-$ID.mp4"
  echo "✓ tutos/videos/Loka-tuto-$ID.mp4"
done
