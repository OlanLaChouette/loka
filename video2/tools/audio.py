"""Musique (afro-pop/house, 124 BPM), bruitages calés sur l'animation, voix off et mixage de la pub Loka n°2.
Sortie : assets/mix.wav (stéréo 44,1 kHz). Les instants suivent la timeline de scene.html."""
import os, wave
import numpy as np
from scipy.signal import butter, sosfilt, resample_poly

SR = 44100
DUREE = 30.0
N = int(SR * DUREE)
rng = np.random.default_rng(11)
ici = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
A = lambda *p: os.path.join(ici, 'assets', *p)

filtre = lambda x, f, t='low', o=2: sosfilt(butter(o, f, btype=t, fs=SR, output='sos'), x)
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

# ---------- Instruments ----------
def kick():
    n = int(.45 * SR); t = np.arange(n) / SR
    return np.tanh(1.8 * np.sin(2 * np.pi * np.cumsum(48 + 120 * np.exp(-t / .03)) / SR) * env(n, .002, .17))
def clap():
    n = int(.25 * SR); s = np.zeros(n)
    for k, d in enumerate([0, .012, .024]):
        b = rng.standard_normal(n) * env(n, .0005, .012 if k < 2 else .1); s[int(d * SR):] += b[:n - int(d * SR)]
    return filtre(filtre(s, 1000, 'high'), 7500) * .7
def hat(ouvert=False):
    n = int((.2 if ouvert else .05) * SR)
    return filtre(rng.standard_normal(n), 7500, 'high', 4) * env(n, .001, .06 if ouvert else .013)
def shaker():
    n = int(.07 * SR); return filtre(filtre(rng.standard_normal(n), 4500, 'high'), 11000) * env(n, .005, .02)
def basse(f, dur=.3):
    n = int(dur * SR); t = np.arange(n) / SR
    s = np.sin(2 * np.pi * np.cumsum(f * (1 + .7 * np.exp(-t / .015))) / SR)
    return np.tanh(2 * s * env(n, .002, .14)) * .85
def pluck(fs, dur=.35):
    n = int(dur * SR); t = np.arange(n) / SR; s = np.zeros(n)
    for f in fs:
        for h, g in [(1, 1), (2, .5), (3, .25), (4, .12)]: s += g * np.sin(2 * np.pi * f * h * t + rng.uniform(0, 6))
    return filtre(s * env(n, .003, .12), 4500) / len(fs)
def pad(fs, dur):
    n = int(dur * SR); t = np.arange(n) / SR; s = np.zeros(n)
    for f in fs:
        for d in (-.15, 0, .15):
            ph = 2 * np.pi * f * (1 + d / 100) * t; s += np.sin(ph) + .3 * np.sin(2 * ph) + .12 * np.sin(3 * ph)
    return filtre(s * np.minimum(1, t / .3) * np.minimum(1, (dur - t) / .3), 1800) / (3 * len(fs))
def impact():
    n = int(1.3 * SR); k = np.pad(kick(), (0, n - len(kick())))
    return filtre(rng.standard_normal(n), 2500) * env(n, .001, .3) * .55 + k
def montee(d):
    n = int(d * SR); t = np.arange(n) / SR
    return filtre(rng.standard_normal(n), 1800, 'high') * (t / d) ** 2.4 * .4

# ---------- Musique ----------
m = np.zeros(N)
B = 60 / 124
DROP = 4.0
ACC = [['A3', 'C#4', 'E4', 'G#4'], ['F#3', 'A3', 'C#4', 'E4'], ['D4', 'F#4', 'A4', 'C#5'], ['E4', 'G#4', 'B4', 'D#5']]  # La majeur, lumineux
BAS = ['A1', 'F#1', 'D2', 'E2']

# Intro : pad et claps sur les titres
placer(m, filtre(pad([note(x) for x in ACC[0]], DROP), 900) * 1.4, 0)
for t in (.45, 1.45, 2.35): placer(m, impact() * .7, t)
t = 0.0
while t < DROP - .1: placer(m, hat() * .3, t); t += B / 2
placer(m, montee(1.0), DROP - 1.0)
placer(m, impact(), DROP)

pas = B / 4
mesures = int((DUREE - DROP) / (4 * B)) + 1
for mm in range(mesures):
    t0 = DROP + mm * 4 * B
    acc = ACC[(mm // 2) % 4]; fb = note(BAS[(mm // 2) % 4])
    pause = 16.6 <= t0 < 17.4          # respiration sur « Et ce n'est pas tout »
    fin = t0 >= 24.8
    placer(m, pad([note(x) for x in acc], 4 * B + .3), t0, .45)
    for s in range(16):
        ts = t0 + s * pas + (.01 if s % 2 else 0)
        if ts >= DUREE - .7 or (16.7 <= ts < 17.15): continue
        if s % 4 == 0: placer(m, kick(), ts, .9 if not fin else .65)
        if s in (4, 12): placer(m, clap(), ts, .5)
        if s % 4 == 2: placer(m, hat(True), ts, .24)
        placer(m, shaker(), ts, .15 if s % 2 else .09)
        if s in (0, 3, 6, 8, 11, 14) and not fin: placer(m, basse(fb * (1.5 if s == 11 else 1)), ts, .8)
        if s in (2, 5, 7, 10, 13) and not fin and not pause: placer(m, pluck([note(x) * 2 for x in acc[1:]]), ts, .3)
for t in (7.0, 16.8, 20.85, 24.85): placer(m, impact(), t, .85)
placer(m, montee(.8), 16.0); placer(m, montee(.9), 19.95); placer(m, montee(.7), 24.15)
placer(m, impact(), 29.2)
fade = np.ones(N); i = int(29.3 * SR); fade[i:] = np.linspace(1, 0, N - i) ** 1.6
m *= fade

# ---------- Bruitages ----------
x = np.zeros(N)
def pop(f=900):
    n = int(.12 * SR); t = np.arange(n) / SR
    return np.sin(2 * np.pi * np.cumsum(f * (1 + 1.5 * np.exp(-t / .01))) / SR) * env(n, .001, .03) * .5
def whoosh(d=.45):
    n = int(d * SR); t = np.arange(n) / SR; b = rng.standard_normal(n); o = np.zeros(n); k = n // 8
    for j in range(8):
        seg = filtre(b, 400 + 600 * j)[j * k:(j + 1) * k]; o[j * k:j * k + len(seg)] = seg
    return o * np.sin(np.pi * t / d) ** 2 * .7
def chime():
    s = np.zeros(int(.9 * SR))
    for k, nm in enumerate(['A5', 'C#6', 'E6', 'A6']):
        n = int(.7 * SR); t = np.arange(n) / SR
        p = (np.sin(2 * np.pi * note(nm) * t) + .2 * np.sin(4 * np.pi * note(nm) * t)) * env(n, .002, .18)
        i = int(k * .055 * SR); s[i:i + n] += p[:len(s) - i]
    return s * .22
def balayage(d=1.4):
    n = int(d * SR); t = np.arange(n) / SR
    s = np.sin(2 * np.pi * np.cumsum(500 + 1700 * (t / d)) / SR) * .15 + filtre(rng.standard_normal(n), 3000, 'high') * .1
    return s * np.sin(np.pi * t / d)

for i in range(4): placer(x, pop(700 + 120 * i), .05 + i * .12)
placer(x, whoosh(), 3.55); placer(x, chime(), 4.05)
placer(x, whoosh(.6), 7.1)
for i, t in enumerate((7.7, 8.4, 9.1, 9.8)): placer(x, pop(800 + 90 * i), t)
placer(x, whoosh(), 11.7)
for i in range(5): placer(x, whoosh(.38), 12.4 + i * .5, .8); placer(x, pop(950), 12.7 + i * .5, .8)
placer(x, whoosh(), 16.15)
placer(x, balayage(), 18.1)
for t in (18.1, 18.6, 19.2, 19.35): placer(x, pop(1000), t)
placer(x, whoosh(), 20.4); placer(x, pop(600), 21.6, 1.2); placer(x, chime(), 23.0)
placer(x, whoosh(), 24.4); placer(x, chime(), 25.65)

# ---------- Voix ----------
with wave.open(A('voix.wav')) as w:
    vsr = w.getframerate(); v = np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(float) / 32768
v = resample_poly(v, SR, vsr)
REPLIQUES = [(0.00, 2.60, 0.40), (2.95, 5.58, 4.30), (6.42, 10.95, 7.30), (11.36, 14.66, 16.75), (15.30, 17.45, 20.85), (17.82, 18.40, 25.60)]
voix = np.zeros(N)
for a, b, t in REPLIQUES:
    seg = v[int(a * SR):int(b * SR)].copy(); f = int(.02 * SR); seg[:f] *= np.linspace(0, 1, f); seg[-f:] *= np.linspace(1, 0, f)
    placer(voix, seg, t)
voix = filtre(voix, 90, 'high'); voix *= .9 / (np.max(np.abs(voix)) + 1e-9)

moy = lambda s, k: np.convolve(np.pad(np.cumsum(np.insert(s, 0, 0))[k:] - np.cumsum(np.insert(s, 0, 0))[:-k], (k // 2, k - 1 - k // 2), mode='edge') / k, [1], mode='same')
act = moy(np.abs(voix), int(.08 * SR)); act = np.clip(act / (act.max() * .15), 0, 1); act = moy(act, int(.25 * SR))
duck = 1 - .5 * np.clip(act, 0, 1)
m *= .6 / (np.max(np.abs(m)) + 1e-9)
g = m * duck
mix = g + x * .6 + voix
st = np.stack([mix + .07 * np.roll(g, int(.012 * SR)), mix - .07 * np.roll(g, int(.012 * SR))], 1)
st *= .89 / np.max(np.abs(st))
with wave.open(A('mix.wav'), 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((st * 32767).astype(np.int16).tobytes())
print('mix prêt', len(st) / SR, 's')
