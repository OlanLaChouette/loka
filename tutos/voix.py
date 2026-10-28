"""Voix off d'un tuto : une seule prise Gemini pour toutes les phrases (quota gratuit), découpée aux silences.
Si le découpage ne tombe pas juste, chaque phrase est refaite séparément.
Usage : python tutos/voix.py 01-creer-son-espace   → tutos/<id>/voix/NN.wav et voix.json (durées)."""
import json, os, re, sys, time, wave
import numpy as np
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'video2', 'tools'))
from gemini import voix

ID = [a for a in sys.argv[1:] if not a.startswith('--')][0]
ICI = os.path.join(os.path.dirname(os.path.abspath(__file__)), ID)
plan = json.load(open(os.path.join(ICI, 'plan.json'), encoding='utf-8'))
VOIX = 'Puck'
# Aucune consigne dans le texte : ce modèle de voix lit tout ce qu'on lui envoie, consignes comprises.
CONSIGNE = ''


def dire(t):
    t = t.replace('loka.eyamtech.com', 'loka point é-yam-tèk point com').replace('«', '').replace('»', '').replace('’', "'")
    return re.sub(r'\s+', ' ', t).strip()


lignes = [f"Tuto Loka, numéro {plan['numero']} : {plan['titre']}."] + [e['texte'] for e in plan['etapes']]
os.makedirs(os.path.join(ICI, 'voix'), exist_ok=True)


def lire(f):
    with wave.open(f) as w:
        return np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(np.float32) / 32768, w.getframerate()


def ecrire(f, x, sr):
    with wave.open(f, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr); w.writeframes((np.clip(x, -1, 1) * 32767).astype(np.int16).tobytes())


def silences(x, sr):
    """Plages calmes (début, fin) en échantillons, et zones parlées de la prise."""
    pas = int(sr * 0.02)
    rms = np.sqrt(np.convolve(x ** 2, np.ones(pas) / pas, mode='same'))[::pas]
    actif = rms > max(rms.max() * 0.03, 1e-4)
    # Écarte les bruits brefs isolés (clic de fin de prise, souffle) : moins de 0,25 s de son.
    i = 0
    while i < len(actif):
        if actif[i]:
            j = i
            while j < len(actif) and actif[j]: j += 1
            if (j - i) * 0.02 < 0.25 and (i == 0 or not actif[max(0, i - 15):i].any()) and not actif[j:j + 15].any(): actif[i:j] = False
            i = j
        else: i += 1
    idx = np.flatnonzero(actif)
    if not len(idx): return [], (0, len(x))
    calmes, i = [], idx[0]
    while i < idx[-1]:
        if not actif[i]:
            j = i
            while not actif[j]: j += 1
            calmes.append((i * pas, j * pas)); i = j
        else: i += 1
    return calmes, (idx[0] * pas, (idx[-1] + 1) * pas)


def segments(x, sr, longueurs):
    """Découpe en len(longueurs) morceaux : chaque coupe tombe dans un silence, et la durée de chaque morceau
    doit rester proche de celle attendue d'après la longueur de sa phrase (programmation dynamique)."""
    n = len(longueurs)
    calmes, (debut, fin) = silences(x, sr)
    calmes = [c for c in calmes if (c[1] - c[0]) / sr >= 0.15]
    if len(calmes) < n - 1: return None
    parle = (fin - debut) / sr - sum((c[1] - c[0]) / sr for c in calmes)
    attendu = [parle * l / sum(longueurs) for l in longueurs]
    # bornes possibles : début, chaque silence (fin du morceau précédent = début du silence), fin
    G = len(calmes)
    def cout(k, a, b):  # morceau k parlé de l'échantillon a à b
        d = (b - a) / sr
        return (d - attendu[k]) ** 2 / max(attendu[k], 0.5)
    INF = float('inf')
    # meilleur[k][g] : coût minimal quand le morceau k se termine au silence g
    meilleur = [[INF] * G for _ in range(n)]; prec = [[-1] * G for _ in range(n)]
    for g in range(G):
        meilleur[0][g] = cout(0, debut, calmes[g][0]) - 1.5 * (calmes[g][1] - calmes[g][0]) / sr
    for k in range(1, n - 1):
        for g in range(k, G):
            for h in range(k - 1, g):
                v = meilleur[k - 1][h] + cout(k, calmes[h][1], calmes[g][0]) - 1.5 * (calmes[g][1] - calmes[g][0]) / sr
                if v < meilleur[k][g]: meilleur[k][g], prec[k][g] = v, h
    if n == 1: return [(debut, fin)]
    total, g = min((meilleur[n - 2][h] + cout(n - 1, calmes[h][1], fin), h) for h in range(n - 2, G))
    coupes = [g]
    for k in range(n - 2, 0, -1):
        g = prec[k][g]; coupes.append(g)
    coupes = [calmes[g] for g in reversed(coupes)]
    bornes = [debut] + [v for c in coupes for v in c] + [fin]
    return [(bornes[2 * i], bornes[2 * i + 1]) for i in range(n)]


def couper(x, sr, a, b):
    a = max(0, a - int(0.06 * sr)); b = min(len(x), b + int(0.12 * sr))
    s = x[a:b].copy(); f = int(0.015 * sr); s[:f] *= np.linspace(0, 1, f); s[-f:] *= np.linspace(1, 0, f)
    return s


prise = os.path.join(ICI, 'voix', 'prise.wav')
# Modèles de voix essayés dans l'ordre : chacun a son propre quota gratuit journalier.
MODELES = os.environ.get('MODELES_VOIX', 'gemini-3.1-flash-tts-preview,gemini-2.5-flash-preview-tts,gemini-3.8-flash-tts').split(',')
if '--reprendre' not in sys.argv or not os.path.exists(prise):
    for i, m in enumerate(MODELES):
        try:
            voix(CONSIGNE + '\n\n'.join(dire(l) for l in lignes), prise, voix=VOIX, modele=m)
            print('voix :', m)
            break
        except SystemExit as e:
            if '429' not in str(e) or i == len(MODELES) - 1: raise
            print(f'{m} : quota épuisé, modèle suivant')
x, sr = lire(prise)
segs = segments(x, sr, [len(dire(l)) for l in lignes])
# Contrôle : chaque morceau garde une durée proche de la part de sa phrase dans le texte.
if segs:
    total = sum(b - a for a, b in segs); car = sum(len(dire(l)) for l in lignes)
ok = segs and all(0.5 < ((b - a) / total) / (len(dire(l)) / car) < 1.9 for (a, b), l in zip(segs, lignes))
if not ok:
    sys.exit('Découpage douteux : ' + str([round((b - a) / sr, 1) for a, b in segs] if segs else 'aucun') + ' — relancer.')
morceaux = [couper(x, sr, a, b) for a, b in segs]
print('prise découpée en', len(morceaux))
durees = []
for i, m in enumerate(morceaux):
    ecrire(os.path.join(ICI, 'voix', f'{i:02d}.wav'), m, sr)
    durees.append(round(len(m) / sr, 3))
json.dump({'taux': sr, 'durees': durees, 'lignes': lignes}, open(os.path.join(ICI, 'voix.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('durées', durees)
