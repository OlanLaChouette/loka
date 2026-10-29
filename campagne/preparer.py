"""Minutage d'une vidéo de campagne d'après les durées de voix : une scène par réplique.
Usage : python campagne/preparer.py <dossier>  → <dossier>/donnees.js (scène) et timeline.json (son).
repliques.json peut donner, par scène, un temps ajouté après la voix (« apres ») ; la dernière scène reçoit « fin ».
« pops » : {scène: [instants relatifs]} des appuis à l'écran, partagés par l'image et le son."""
import json, os, sys

D = os.path.join(os.path.dirname(os.path.abspath(__file__)), sys.argv[1])
cfg = json.load(open(os.path.join(D, 'repliques.json'), encoding='utf-8'))
v = json.load(open(os.path.join(D, 'voix.json'), encoding='utf-8'))
apres = cfg.get('apres', [0.55] * len(v['durees']))
t, scenes = 0.0, []
for i, d in enumerate(v['durees']):
    duree = round(d + 0.3 + apres[i] + (cfg.get('fin', 2.6) if i == len(v['durees']) - 1 else 0), 2)
    scenes.append({'debut': round(t, 2), 'duree': duree, 'voix': round(t + 0.3, 2), 'dureeVoix': d})
    t += duree
donnees = {'scenes': scenes, 'duree': round(t, 2), 'pops': cfg.get('pops', {})}
open(os.path.join(D, 'donnees.js'), 'w', encoding='utf-8').write('window.T = ' + json.dumps(donnees, indent=1) + ';\n')
json.dump(donnees, open(os.path.join(D, 'timeline.json'), 'w', encoding='utf-8'), indent=1)
print(sys.argv[1], ':', len(scenes), 'scènes,', donnees['duree'], 's')
