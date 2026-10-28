"""Minutage d'un tuto à partir des durées de voix : écrit tutos/<id>/donnees.js (pour la scène) et timeline.json (pour le son).
Usage : python tutos/preparer.py 01-creer-son-espace"""
import json, os, shutil, sys

ID = sys.argv[1]
ICI = os.path.dirname(os.path.abspath(__file__))
D = os.path.join(ICI, ID)
plan = json.load(open(os.path.join(D, 'plan.json'), encoding='utf-8'))
voix = json.load(open(os.path.join(D, 'voix.json'), encoding='utf-8'))
durees = voix['durees']
sys.path.insert(0, ICI)
from scenarios_titres import TITRES
suivant = TITRES.get(plan['numero'] + 1)

INTRO = round(durees[0] + 1.3, 2)
t = INTRO
etapes = []
for e, d in zip(plan['etapes'], durees[1:]):
    duree = round(max(d + (1.35 if e['tap'] else 0.8), 2.6), 2)
    etapes.append({**e, 'debut': round(t, 2), 'duree': duree, 'voix': round(t + 0.4, 2), 'dureeVoix': d,
                   'zoom': 1.14 if e['tap'] and e['tap']['h'] < 70 else 1.0})
    t += duree
FIN = 3.6
total = round(t + FIN, 2)
donnees = {'id': ID, 'numero': plan['numero'], 'titre': plan['titre'], 'total_serie': len(TITRES), 'suivant': suivant,
           'intro': INTRO, 'etapes': etapes, 'fin': round(t, 2), 'duree': total, 'voixIntro': 0.45}
open(os.path.join(D, 'donnees.js'), 'w', encoding='utf-8').write('window.DONNEES = ' + json.dumps(donnees, ensure_ascii=False, indent=1) + ';\n')
json.dump(donnees, open(os.path.join(D, 'timeline.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
shutil.copy(os.path.join(ICI, 'scene.html'), os.path.join(D, 'scene.html'))
print(f'{ID} : {len(etapes)} étapes, {total} s')
