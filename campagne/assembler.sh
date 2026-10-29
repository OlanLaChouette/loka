#!/bin/sh
# Assemble la vidéo muette et le mix d'une vidéo de campagne (son normalisé à -14 LUFS pour les réseaux).
# Usage : sh campagne/assembler.sh <dossier> <nom de sortie>
cd "$(dirname "$0")"
FF=$(python -c "import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())")
"$FF" -y -loglevel error -i "$1/muet.mp4" -i "$1/mix.wav" -map 0:v -map 1:a -c:v copy -c:a aac -b:a 192k -ar 48000 -af loudnorm=I=-14:TP=-1.5:LRA=11 -shortest -movflags +faststart "sorties/$2.mp4"
echo "sorties/$2.mp4"
