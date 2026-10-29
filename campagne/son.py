"""Bande-son d'une vidéo de campagne : musique entraînante (112 BPM), voix off posée sur timeline.json,
souffles aux changements de scène, appuis (« pops ») et carillon final ; la musique s'efface sous la voix.
Usage : python campagne/son.py <dossier> [douce]  → <dossier>/mix.wav (stéréo 44,1 kHz)."""
import json, os, sys, wave
import numpy as np

D = os.path.join(os.path.dirname(os.path.abspath(__file__)), sys.argv[1])
T = json.load(open(os.path.join(D, 'timeline.json'), encoding='utf-8'))
DOUCE = 'douce' in sys.argv
SR = 44100
DUREE = T['duree']
N = int(SR * DUREE) + SR
rng = np.random.default_rng(11)

# Mêmes outils que tutos/son.py : filtres en numpy seul (scipy est bloqué sur ce poste).
def filtre(x, f, t='low', o=2):
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
def moyenne(s, k):
    c = np.cumsum(np.insert(s, 0, 0)); r = (c[k:] - c[:-k]) / k
    return np.pad(r, (k // 2, k - 1 - k // 2), mode='edge')

# ---------- Musique : nappe de synthé, arpège pincé, basse syncopée, batterie légère ----------
def nappe(fs, dur):
    n = int(dur * SR); t = np.arange(n) / SR; s = np.zeros(n)
    for f in fs:
        for dt in (-.004, .004):
            ph = 2 * np.pi * f * (1 + dt) * t
            s += 2 * ((ph / (2 * np.pi)) % 1) - 1
    s = filtre(s, 1400) / (2 * len(fs))
    e = np.minimum(1, t / .25) * np.minimum(1, (dur - t) / .3)
    return s * np.clip(e, 0, 1)
def pince(f, dur=.32):
    n = int(dur * SR); t = np.arange(n) / SR
    return (np.sin(2 * np.pi * f * t) + .35 * np.sin(4 * np.pi * f * t) + .1 * np.sin(6 * np.pi * f * t)) * env(n, .002, .12)
def basse(f, dur=.3):
    n = int(dur * SR); t = np.arange(n) / SR
    return np.tanh(1.6 * np.sin(2 * np.pi * f * t)) * env(n, .004, .16)
def kick():
    n = int(.3 * SR); t = np.arange(n) / SR
    return np.sin(2 * np.pi * np.cumsum(48 + 110 * np.exp(-t / .03)) / SR) * env(n, .002, .14)
def claque():
    n = int(.2 * SR); return filtre(filtre(rng.standard_normal(n), 1200, 'high'), 7000) * env(n, .002, .06)
def charleston(d=.03):
    n = int(.08 * SR); return filtre(rng.standard_normal(n), 7000, 'high') * env(n, .001, d)

m = np.zeros(N)
B = 60 / (96 if DOUCE else 112)
ACC = [['A3', 'C4', 'E4', 'G4'], ['F3', 'A3', 'C4', 'E4'], ['C3', 'E3', 'G3', 'B3'], ['G3', 'B3', 'D4', 'F#4']]
BAS = ['A1', 'F1', 'C2', 'G1']
mesure, t0 = 0, 0.0
while t0 < DUREE:
    acc = ACC[mesure % 4]; fb = note(BAS[mesure % 4]); fs = [note(x) for x in acc]
    placer(m, nappe(fs, 4 * B + .2), t0, .35)
    for k in range(8):
        placer(m, pince(fs[[0, 2, 1, 3, 2, 1, 3, 2][k]] * 2), t0 + k * B / 2, .16 if k % 2 else .2)
    plein = t0 > 1.5 and t0 < DUREE - 3
    for k in range(4):
        tb = t0 + k * B
        placer(m, kick(), tb, .7 if (k in (0, 2) or (plein and not DOUCE)) else 0)
        if plein and k in (1, 3): placer(m, claque(), tb, .32)
        for h in range(2): placer(m, charleston(.05 if h else .02), tb + h * B / 2, .12 if h else .07)
        placer(m, basse(fb), tb + (B * .75 if k == 1 else 0), .42)
        if k == 3: placer(m, basse(fb * 1.5), tb + B * .5, .3)
    t0 += 4 * B; mesure += 1
fondu = np.ones(N); i = int((DUREE - 1.4) * SR); fondu[i:] = np.linspace(1, 0, N - i) ** 1.5
fondu[:int(.3 * SR)] = np.linspace(0, 1, int(.3 * SR))
m *= fondu

# ---------- Bruitages ----------
def pop(f=900):
    n = int(.1 * SR); t = np.arange(n) / SR
    return np.sin(2 * np.pi * np.cumsum(f * (1 + 1.2 * np.exp(-t / .008))) / SR) * env(n, .001, .03) * .55
def souffle(d=.5):
    n = int(d * SR); t = np.arange(n) / SR
    b = filtre(filtre(rng.standard_normal(n), 2500, 'low'), 300, 'high')
    return b * (t / d) ** 2 * np.exp(-((t / d) ** 8)) * .5
def carillon():
    s = np.zeros(int(1.4 * SR))
    for k, nm in enumerate(['A5', 'C6', 'E6', 'A6']):
        n = int(1 * SR); t = np.arange(n) / SR
        p = (np.sin(2 * np.pi * note(nm) * t) + .2 * np.sin(4 * np.pi * note(nm) * t)) * env(n, .002, .3)
        i = int(k * .07 * SR); s[i:i + n] += p[:len(s) - i]
    return s * .22

x = np.zeros(N)
for k, sc in enumerate(T['scenes'][1:], start=1):
    placer(x, souffle(.5), sc['debut'] - .45, .8)
for k, liste in T.get('pops', {}).items():
    for r in liste: placer(x, pop(), T['scenes'][int(k)]['debut'] + r, 1)
placer(x, carillon(), T['scenes'][-1]['debut'] + .1)

# ---------- Voix et mixage ----------
voix = np.zeros(N)
for k, sc in enumerate(T['scenes']):
    placer(voix, lire(os.path.join(D, 'voix', f'{k:02d}.wav')), sc['voix'])
voix = filtre(voix, 80, 'high'); voix *= .92 / (np.max(np.abs(voix)) + 1e-9)
act = moyenne(np.abs(voix), int(.1 * SR)); act = np.clip(act / (act.max() * .12), 0, 1); act = moyenne(act, int(.3 * SR))
m *= .55 / (np.max(np.abs(m)) + 1e-9)
musique = m * (1 - .55 * act)
mix = musique * .85 + x * .55 + voix
retard = int(.012 * SR)
st = np.stack([mix + .07 * np.roll(musique, retard), mix - .07 * np.roll(musique, retard)], 1)[:int(DUREE * SR)]
st *= .89 / np.max(np.abs(st))
with wave.open(os.path.join(D, 'mix.wav'), 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((st * 32767).astype(np.int16).tobytes())
print('mix prêt', round(len(st) / SR, 2), 's')
