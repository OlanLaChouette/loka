"""Compose la musique (afro-house, 118 BPM), les bruitages, place la voix off et mixe le tout.
Sortie : assets/audio/mix.wav (stéréo 44,1 kHz). Les instants suivent la timeline de scene.html."""
import os, wave
import numpy as np
from scipy.signal import butter, sosfilt, resample_poly

SR = 44100
DUREE = 25.5
N = int(SR * DUREE)
rng = np.random.default_rng(7)
ici = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
A = lambda *p: os.path.join(ici, 'assets', 'audio', *p)


def filtre(x, f, type_='low', ordre=2):
    return sosfilt(butter(ordre, f, btype=type_, fs=SR, output='sos'), x)


def env(n, attaque, decroissance):
    t = np.arange(n) / SR
    e = np.exp(-t / decroissance)
    a = int(attaque * SR)
    if a > 0:
        e[:a] *= np.linspace(0, 1, a)
    return e


def placer(piste, son, t, gain=1.0):
    i = int(t * SR)
    if i >= len(piste):
        return
    fin = min(len(piste), i + len(son))
    piste[i:fin] += son[:fin - i] * gain


def note(nom):
    noms = {'C': -9, 'C#': -8, 'D': -7, 'D#': -6, 'E': -5, 'F': -4, 'F#': -3, 'G': -2, 'G#': -1, 'A': 0, 'A#': 1, 'B': 2}
    return 440 * 2 ** ((noms[nom[:-1]] + 12 * (int(nom[-1]) - 4)) / 12)


# ---------- Instruments ----------
def kick():
    n = int(0.42 * SR); t = np.arange(n) / SR
    f = 46 + 110 * np.exp(-t / 0.035)
    return np.tanh(1.6 * np.sin(2 * np.pi * np.cumsum(f) / SR) * env(n, 0.002, 0.16))


def clap():
    n = int(0.25 * SR); s = np.zeros(n)
    for k, d in enumerate([0, 0.011, 0.022]):
        b = rng.standard_normal(n) * env(n, 0.0005, 0.012 if k < 2 else 0.09)
        s[int(d * SR):] += b[:n - int(d * SR)]
    return filtre(filtre(s, 900, 'high'), 7000) * 0.7


def hat(ouvert=False):
    n = int((0.22 if ouvert else 0.05) * SR)
    return filtre(rng.standard_normal(n), 7000, 'high', 4) * env(n, 0.001, 0.07 if ouvert else 0.014)


def shaker():
    n = int(0.07 * SR)
    return filtre(filtre(rng.standard_normal(n), 4500, 'high'), 11000) * env(n, 0.006, 0.02)


def log_drum(f):
    n = int(0.38 * SR); t = np.arange(n) / SR
    fr = f * (1 + 0.9 * np.exp(-t / 0.018))
    s = np.sin(2 * np.pi * np.cumsum(fr) / SR) + 0.3 * np.sin(4 * np.pi * np.cumsum(fr) / SR)
    return np.tanh(1.8 * s * env(n, 0.002, 0.13)) * 0.8


def pluck(freqs, dur=0.32):
    n = int(dur * SR); t = np.arange(n) / SR; s = np.zeros(n)
    for f in freqs:
        for h, g in [(1, 1), (2, .45), (3, .22), (4, .12), (5, .06)]:
            s += g * np.sin(2 * np.pi * f * h * t + rng.uniform(0, 6))
    return filtre(s * env(n, 0.003, 0.11), 3800) / len(freqs)


def pad(freqs, dur):
    n = int(dur * SR); t = np.arange(n) / SR; s = np.zeros(n)
    for f in freqs:
        for det in (-0.12, 0.0, 0.12):
            ph = 2 * np.pi * f * (1 + det / 100) * t
            s += np.sin(ph) + 0.25 * np.sin(2 * ph) + 0.1 * np.sin(3 * ph)
    a = np.minimum(1, t / 0.35) * np.minimum(1, (dur - t) / 0.35)
    return filtre(s * a, 1600) / (3 * len(freqs))


# ---------- Musique ----------
musique = np.zeros(N)
BPM = 118; B = 60 / BPM
DROP = 4.85                       # apparition du logo
FIN_GROOVE = 20.35                 # carte de fin
ACCORDS = [['A3', 'C4', 'E4', 'G4'], ['F3', 'A3', 'C4', 'E4'], ['C4', 'E4', 'G4', 'B4'], ['G3', 'B3', 'D4', 'E4']]
BASSES = ['A1', 'F1', 'C2', 'G1']

# Intro tendue : pad filtré + tic-tac + montée
intro = pad([note(x) for x in ACCORDS[0]], DROP)
placer(musique, filtre(intro, 500) * 1.3, 0)
t = 0.0
while t < DROP - 0.05:
    placer(musique, hat() * 0.25, t); t += B / 2
mont_n = int(1.1 * SR); tt = np.arange(mont_n) / SR
montee = filtre(rng.standard_normal(mont_n), 1500, 'high') * (tt / tt[-1]) ** 2.2 * 0.35
placer(musique, montee, DROP - 1.1)
impact = filtre(rng.standard_normal(int(1.2 * SR)), 3000) * env(int(1.2 * SR), 0.001, 0.25) * 0.5 + np.pad(kick(), (0, int(1.2 * SR) - len(kick()))) * 0.9
placer(musique, impact, DROP)

# Groove principal
pas16 = B / 4
nb_mesures = int((DUREE - DROP) / (4 * B)) + 1
LOG = [0, 3, 6, 10, 12, 14]
for m in range(nb_mesures):
    t0 = DROP + m * 4 * B
    acc = ACCORDS[(m // 2) % 4]; basse = note(BASSES[(m // 2) % 4])
    calme = t0 >= FIN_GROOVE
    if t0 < DUREE:
        placer(musique, pad([note(x) for x in acc], 4 * B + 0.3), t0, 0.55 if not calme else 0.8)
    for s in range(16):
        ts = t0 + s * pas16 + (0.012 if s % 2 else 0)        # léger swing
        if ts >= DUREE - 0.6:
            continue
        if s % 4 == 0 and not (13.6 <= ts < 14.4):
            placer(musique, kick(), ts, 0.95 if not calme else 0.7)
        if s in (4, 12) and not calme:
            placer(musique, clap(), ts, 0.45)
        if s % 4 == 2:
            placer(musique, hat(True), ts, 0.22)
        placer(musique, shaker(), ts, 0.16 if s % 2 else 0.1)
        if s in LOG and not calme:
            f = basse * (1.5 if s == 10 else 1)
            placer(musique, log_drum(f), ts, 0.75)
        if s in (2, 7, 10) and not calme:
            placer(musique, pluck([note(x) * 2 for x in acc[1:]]), ts, 0.32)

# Petite montée avant la fin + impact final
placer(musique, filtre(rng.standard_normal(int(0.75 * SR)), 2000, 'high') * np.linspace(0, 0.3, int(0.75 * SR)) ** 1.5, FIN_GROOVE - 0.75)
placer(musique, impact * 0.9, FIN_GROOVE)
placer(musique, impact, 24.75)
placer(musique, pad([note(x) for x in ACCORDS[0]], 0.75) * 0.8, 24.75)
fondu = np.ones(N); i = int(24.9 * SR); fondu[i:] = np.linspace(1, 0, N - i) ** 1.5
musique *= fondu

# ---------- Bruitages ----------
sfx = np.zeros(N)
def ding():
    n = int(0.5 * SR); t = np.arange(n) / SR
    s = np.sin(2 * np.pi * 1318.5 * t) * env(n, 0.002, 0.09)
    s[int(0.07 * SR):] += (np.sin(2 * np.pi * 1760 * t) * env(n, 0.002, 0.16))[:n - int(0.07 * SR)]
    return s * 0.35
def whoosh(d=0.55):
    n = int(d * SR); t = np.arange(n) / SR
    b = rng.standard_normal(n); out = np.zeros(n); pas = n // 8
    for k in range(8):
        seg = filtre(b, 300 + 500 * k, 'low')[k * pas:(k + 1) * pas]; out[k * pas:k * pas + len(seg)] = seg
    return out * np.sin(np.pi * t / d) ** 2 * 0.8
def tap():
    n = int(0.04 * SR); t = np.arange(n) / SR
    return (filtre(rng.standard_normal(n), 3000, 'high') * 0.5 + np.sin(2 * np.pi * 1900 * t)) * env(n, 0.0005, 0.006) * 0.5
def chime():
    s = np.zeros(int(0.9 * SR))
    for k, nm in enumerate(['C6', 'E6', 'G6', 'C7']):
        n = int(0.7 * SR); t = np.arange(n) / SR
        p = (np.sin(2 * np.pi * note(nm) * t) + 0.2 * np.sin(4 * np.pi * note(nm) * t)) * env(n, 0.002, 0.18)
        i = int(k * 0.06 * SR); s[i:i + n] += p[:len(s) - i]
    return s * 0.22
def obturateur():
    n = int(0.12 * SR); s = np.zeros(n)
    for d in (0, 0.05):
        m = int(0.03 * SR); b = filtre(rng.standard_normal(m), 1500, 'high') * env(m, 0.0005, 0.006)
        s[int(d * SR):int(d * SR) + m] += b
    return s * 0.7

for t in (0.7, 1.4, 2.1, 10.15, 18.75):
    placer(sfx, ding(), t)
for t in (4.3, 13.6, 15.75, 20.1):
    placer(sfx, whoosh(), t, 0.55)
for t in (7.0, 8.55, 9.0, 12.75):
    placer(sfx, tap(), t)
for t in (9.3, 12.9, 15.05):
    placer(sfx, chime(), t)
placer(sfx, obturateur(), 11.88)

# ---------- Voix off ----------
with wave.open(A('voix_complete.wav')) as w:
    vsr = w.getframerate(); v = np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(float) / 32768
v = resample_poly(v, SR, vsr)
REPLIQUES = [(0.00, 3.00, 0.40), (3.70, 7.70, 6.05), (8.45, 10.35, 11.35), (11.10, 12.55, 13.90), (13.10, 15.55, 16.15), (16.05, 18.95, 20.55)]
voix = np.zeros(N)
for a, b, t in REPLIQUES:
    seg = v[int(a * SR):int(b * SR)].copy()
    f = int(0.02 * SR); seg[:f] *= np.linspace(0, 1, f); seg[-f:] *= np.linspace(1, 0, f)
    placer(voix, seg, t)
voix = filtre(voix, 90, 'high')
voix *= 0.9 / (np.max(np.abs(voix)) + 1e-9)

# Ducking : la musique baisse quand la voix parle
nv = np.abs(voix); fen = int(0.08 * SR)
moy = lambda x, k: np.convolve(np.pad(np.cumsum(np.insert(x, 0, 0))[k:] - np.cumsum(np.insert(x, 0, 0))[:-k], (k // 2, k - 1 - k // 2), mode='edge') / k, [1], mode='same')
lisse = moy(nv, fen)
act = np.clip(lisse / (lisse.max() * 0.15), 0, 1)
act = moy(act, int(0.25 * SR))
duck = 1 - 0.55 * np.clip(act, 0, 1)

musique *= 0.55 / (np.max(np.abs(musique)) + 1e-9)
mix = musique * duck + sfx * 0.6 + voix
# Stéréo : légère largeur sur la musique, voix au centre
g = musique * duck
gauche = mix + 0.06 * np.roll(g, int(0.011 * SR))
droite = mix - 0.06 * np.roll(g, int(0.011 * SR))
st = np.stack([gauche, droite], 1)
st *= 0.89 / np.max(np.abs(st))
with wave.open(A('mix.wav'), 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((st * 32767).astype(np.int16).tobytes())
print('mix prêt', round(len(st) / SR, 2), 's')
