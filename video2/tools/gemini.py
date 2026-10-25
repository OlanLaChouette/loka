"""Petits appels à l'API Gemini (voix, musique, images). La clé est lue dans gemini_API_KEY.txt, jamais affichée."""
import base64, json, os, sys, urllib.request, wave

RACINE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CLE = open(os.path.join(RACINE, 'gemini_API_KEY.txt'), encoding='utf-8').read().strip()
API = 'https://generativelanguage.googleapis.com/v1beta/models/'


def appeler(modele, corps, timeout=300):
    req = urllib.request.Request(API + modele + ':generateContent', data=json.dumps(corps).encode(),
                                 headers={'Content-Type': 'application/json', 'x-goog-api-key': CLE})
    try:
        return json.load(urllib.request.urlopen(req, timeout=timeout))
    except urllib.error.HTTPError as e:
        sys.exit(f'Erreur {e.code} : {e.read().decode()[:800]}')


def parties(rep):
    return rep['candidates'][0]['content']['parts']


def voix(texte, sortie, voix='Charon', consigne='', modele='gemini-3.8-flash-tts'):
    corps = {'contents': [{'parts': [{'text': (consigne + '\n' if consigne else '') + texte}]}],
             'generationConfig': {'responseModalities': ['AUDIO'],
                                  'speechConfig': {'voiceConfig': {'prebuiltVoiceConfig': {'voiceName': voix}}}}}
    rep = appeler(modele, corps)
    p = next(p for p in parties(rep) if 'inlineData' in p)
    pcm = base64.b64decode(p['inlineData']['data'])
    taux = 24000
    mime = p['inlineData'].get('mimeType', '')
    if 'rate=' in mime:
        taux = int(mime.split('rate=')[1].split(';')[0])
    with wave.open(sortie, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(taux); w.writeframes(pcm)
    return len(pcm) / 2 / taux


def media(modele, invite, sortie_base, extra=None):
    corps = {'contents': [{'parts': [{'text': invite}]}]}
    if extra:
        corps['generationConfig'] = extra
    rep = appeler(modele, corps, timeout=600)
    fichiers = []
    for i, p in enumerate(parties(rep)):
        if 'inlineData' in p:
            mime = p['inlineData']['mimeType']
            ext = {'audio/mpeg': '.mp3', 'audio/wav': '.wav', 'image/png': '.png', 'image/jpeg': '.jpg'}.get(mime, '.bin')
            nom = sortie_base + (f'_{i}' if i else '') + ext
            open(nom, 'wb').write(base64.b64decode(p['inlineData']['data']))
            fichiers.append((nom, mime))
        elif 'text' in p:
            print('texte :', p['text'][:300])
    return fichiers
