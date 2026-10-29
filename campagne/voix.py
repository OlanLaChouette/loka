"""Voix off d'une vidéo de campagne : une prise Gemini pour toutes les répliques, découpée aux silences
(programmation dynamique sur la longueur attendue de chaque réplique, comme pour les tutos).
Usage : python campagne/voix.py <dossier>   (lit <dossier>/repliques.json : {"voix": "Aoede", "lignes": [...]})
Sortie : <dossier>/voix/NN.wav et <dossier>/voix.json (durées)."""
import json, os, sys, wave
import numpy as np
RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(RACINE, 'video2', 'tools'))
sys.path.insert(0, os.path.join(RACINE, 'tutos'))
from gemini import voix

D = os.path.join(RACINE, 'campagne', [a for a in sys.argv[1:] if not a.startswith('--')][0])
cfg = json.load(open(os.path.join(D, 'repliques.json'), encoding='utf-8'))
lignes = cfg['lignes']
os.makedirs(os.path.join(D, 'voix'), exist_ok=True)

# Fonctions de découpage partagées avec les tutos (même module, sans relancer sa génération).
src = open(os.path.join(RACINE, 'tutos', 'voix.py'), encoding='utf-8').read()
src = src[src.index('def lire('):src.index("prise = os.path.join")]
outils = {'np': np, 'wave': wave, 'os': os}
exec(src, outils)
lire, ecrire, segments, couper = outils['lire'], outils['ecrire'], outils['segments'], outils['couper']
# Écriture phonétique pour la synthèse : « iyamtek », et « Loka Villa » (le s final se lisait « Villasses »).
dire = lambda t: t.replace('loka.eyamtech.com', 'loka point iyamtek point com').replace('Loka Villas', 'Loka Villa').replace('«', '').replace('»', '')

prise = os.path.join(D, 'voix', 'prise.wav')
if '--reprendre' not in sys.argv or not os.path.exists(prise):
    for i, m in enumerate(['gemini-3.1-flash-tts-preview', 'gemini-2.5-flash-preview-tts', 'gemini-3.8-flash-tts']):
        try:
            voix('\n\n'.join(dire(l) for l in lignes), prise, voix=cfg.get('voix', 'Aoede'), modele=m)
            print('voix :', m)
            break
        except SystemExit as e:
            if '429' not in str(e) or i == 2: raise
            print(m, ': quota épuisé')
x, sr = lire(prise)
segs = segments(x, sr, [len(dire(l)) for l in lignes])
if not segs: sys.exit('Découpage impossible : relancer')
total = sum(b - a for a, b in segs); car = sum(len(dire(l)) for l in lignes)
if not all(0.5 < ((b - a) / total) / (len(dire(l)) / car) < 1.9 for (a, b), l in zip(segs, lignes)):
    sys.exit('Découpage douteux : ' + str([round((b - a) / sr, 1) for a, b in segs]))
durees = []
for i, (a, b) in enumerate(segs):
    m = couper(x, sr, a, b)
    ecrire(os.path.join(D, 'voix', f'{i:02d}.wav'), m, sr)
    durees.append(round(len(m) / sr, 3))
json.dump({'durees': durees, 'lignes': lignes}, open(os.path.join(D, 'voix.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('durées', durees)
