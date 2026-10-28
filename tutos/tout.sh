#!/usr/bin/env bash
# Chaîne complète : captures, voix (avec pause entre les appels, quota gratuit), puis vidéos.
# Usage : bash tutos/tout.sh            (journal dans tutos/tout.log)
cd "$(dirname "$0")/.."
set -o pipefail
node tutos/capture.cjs || exit 1
IDS=$(ls -d tutos/[0-9][0-9]-*/ | xargs -n1 basename)
for ID in $IDS; do
  for essai in 1 2 3; do
    python tutos/voix.py "$ID" && break
    echo "voix $ID : nouvel essai dans 40 s"; sleep 40
  done
  sleep 25
done
bash tutos/fabriquer.sh $IDS
