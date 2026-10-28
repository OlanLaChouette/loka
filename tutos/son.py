"""Bande-son d'un tuto : musique douce (100 BPM), voix off posée aux instants de timeline.json,
petits bruitages (appui, transition, carillon) et mixage. Sortie : tutos/<id>/mix.wav (stéréo 44,1 kHz).
Usage : python tutos/son.py 01-creer-son-espace"""
import json, os, sys, wave
import numpy as np

ID = sys.argv[1]
D = os.path.join(os.path.dirname(os.path.abspath(__file__)), ID)
T = json.load(open(os.path.join(D, 'timeline.json'), encoding='utf-8'))
SR = 44100
DUREE = T['duree']
N = int(SR * DUREE) + SR
rng = np.random.default_rng(7)

# Filtres et rééchantillonnage en numpy seul (scipy est bloqué par la stratégie de sécurité de ce poste).
def filtre(x, f, t='low', o=2):
    """Filtre de Butterworth appliqué dans le domaine fréquentiel (gain |H|, sans déphasage)."""
    X = np.fft.rfft(x); fr = np.fft.rfftfreq(len(x), 1 / SR)
    r = (fr / f) ** (2 * o) if t == 'low' else (f / np.maximum(fr, 1e-9)) ** (2 * o)
    return np.fft.irfft(X / np.sqrt(1 + r), len(x))
def reechantillonner(x, de, vers):
    n = int(round(len(x) * vers / de)); X = np.fft.rfft(x); Y = np.zeros(n // 2 + 1, complex)
    k = min(len(X), len(Y)); Y[:k] = X[:k]
    return np.fft.irfft(Y, n) * (n / len(x))
def env(n, a, d):
    t = np.arange(n) / SR; e = np.exp(-t / d); k = int(a * SR)
    if k: e[:k] *= np.linspace(0, 1, k)
    return e
def placer(piste, son, t, g=1.0):
    i = int(t * SR)
    if 0 <= i < len(piste):
        f = min(len(piste), i + len(son)); piste[i:f] += son[:f - i] * g
def note(nom):
    d = {'C': -9, 'C#': -8, 'D': -7, 'D#': -6, 'E': -5, 'F': -4, 'F#': -3, 'G': -2, 'G#': -1, 'A': 0, 'A#': 1, 'B': 2}
    return 440 * 2 ** ((d[nom[:-1]] + 12 * (int(nom[-1]) - 4)) / 12)
def lire(f):
    with wave.open(f) as w:
        x = np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(float) / 32768; sr = w.getframerate()
    return reechantillonner(x, sr, SR) if sr != SR else x

# ---------- Musique : accords façon piano électrique, basse ronde, rythmique légère ----------
def rhodes(fs, dur):
    n = int(dur * SR); t = np.arange(n) / SR; s = np.zeros(n)
    for f in fs:
        s += (np.sin(2 * np.pi * f * t + 0.8 * np.sin(2 * np.pi * f * t) * np.exp(-t / .4)) + .25 * np.sin(4 * np.pi * f * t)) * env(n, .004, .9)
    return filtre(s, 3200) / len(fs)
def basse(f, dur=.45):
    n = int(dur * SR); t = np.arange(n) / SR
    return np.sin(2 * np.pi * f * t) * env(n, .005, .25) * .9
def kick():
    n = int(.3 * SR); t = np.arange(n) / SR
    return np.sin(2 * np.pi * np.cumsum(50 + 90 * np.exp(-t / .025)) / SR) * env(n, .002, .12)
def shaker():
    n = int(.06 * SR); return filtre(filtre(rng.standard_normal(n), 5000, 'high'), 11000) * env(n, .004, .018)

m = np.zeros(N)
B = 60 / 100
ACC = [['F3', 'A3', 'C4', 'E4'], ['D3', 'F3', 'A3', 'C4'], ['A#2', 'D3', 'F3', 'A3'], ['C3', 'E3', 'G3', 'A#3']]
BAS = ['F1', 'D2', 'A#1', 'C2']
mesure = 0; t0 = 0.0
while t0 < DUREE:
    acc = ACC[mesure % 4]; fb = note(BAS[mesure % 4])
    placer(m, rhodes([note(x) for x in acc], 4 * B), t0, .5)
    placer(m, rhodes([note(x) * 2 for x in acc[1:3]], 2 * B), t0 + 2.5 * B, .18)
    for k in range(4):
        tb = t0 + k * B
        placer(m, kick(), tb, .55 if k in (0, 2) else .0)
        placer(m, basse(fb * (1.5 if k == 3 else 1)), tb + (0 if k != 1 else B * .5), .5)
        for h in range(2): placer(m, shaker(), tb + h * B / 2 + (.02 if h else 0), .22 if h else .12)
    t0 += 4 * B; mesure += 1
fondu = np.ones(N); i = int((DUREE - 1.6) * SR); fondu[i:] = np.linspace(1, 0, N - i) ** 1.5
fondu[:int(.8 * SR)] = np.linspace(0, 1, int(.8 * SR))
m *= fondu

# ---------- Bruitages ----------
def pop(f=880):
    n = int(.1 * SR); t = np.arange(n) / SR
    return np.sin(2 * np.pi * np.cumsum(f * (1 + 1.2 * np.exp(-t / .008))) / SR) * env(n, .001, .03) * .55
def souffle(d=.4):
    n = int(d * SR); t = np.arange(n) / SR
    return filtre(filtre(rng.standard_normal(n), 1800, 'low'), 250, 'high') * np.sin(np.pi * t / d) ** 2 * .35
def carillon():
    s = np.zeros(int(1.2 * SR))
    for k, nm in enumerate(['F5', 'A5', 'C6', 'F6']):
        n = int(.9 * SR); t = np.arange(n) / SR
        p = (np.sin(2 * np.pi * note(nm) * t) + .2 * np.sin(4 * np.pi * note(nm) * t)) * env(n, .002, .25)
        i = int(k * .07 * SR); s[i:i + n] += p[:len(s) - i]
    return s * .2

x = np.zeros(N)
placer(x, carillon(), 0.1)
placer(x, souffle(.6), T['intro'] - 0.5)
for e in T['etapes']:
    placer(x, souffle(.35), e['debut'] - 0.05, .6)
    if e['tap']: placer(x, pop(), e['debut'] + e['duree'] - 0.5, .9)
placer(x, souffle(.6), T['fin']); placer(x, carillon(), T['fin'] + .8)

# ---------- Voix ----------
voix = np.zeros(N)
placer(voix, lire(os.path.join(D, 'voix', '00.wav')), T['voixIntro'])
for k, e in enumerate(T['etapes'], start=1):
    placer(voix, lire(os.path.join(D, 'voix', f'{k:02d}.wav')), e['voix'])
voix = filtre(voix, 80, 'high'); voix *= .92 / (np.max(np.abs(voix)) + 1e-9)

def moyenne(s, k):
    c = np.cumsum(np.insert(s, 0, 0)); r = (c[k:] - c[:-k]) / k
    return np.pad(r, (k // 2, k - 1 - k // 2), mode='edge')
act = moyenne(np.abs(voix), int(.1 * SR)); act = np.clip(act / (act.max() * .12), 0, 1); act = moyenne(act, int(.35 * SR))
m *= .5 / (np.max(np.abs(m)) + 1e-9)
musique = m * (1 - .62 * act)
mix = musique * .8 + x * .5 + voix
retard = int(.011 * SR)
st = np.stack([mix + .06 * np.roll(musique, retard), mix - .06 * np.roll(musique, retard)], 1)[:int(DUREE * SR)]
st *= .89 / np.max(np.abs(st))
with wave.open(os.path.join(D, 'mix.wav'), 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((st * 32767).astype(np.int16).tobytes())
print('mix prêt', round(len(st) / SR, 2), 's')
