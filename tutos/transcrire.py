"""Transcrit un fichier audio avec Gemini, avec horodatage, pour vérifier une voix off.
Usage : python tutos/transcrire.py fichier.wav"""
import base64, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'video2', 'tools'))
from gemini import appeler, parties

donnees = base64.b64encode(open(sys.argv[1], 'rb').read()).decode()
corps = {'contents': [{'parts': [
    {'inlineData': {'mimeType': 'audio/wav', 'data': donnees}},
    {'text': "Transcris mot pour mot cet audio en français, avec l'horodatage (secondes) du début de chaque phrase. "
             "Signale aussi tout bruit, souffle ou artefact anormal."}]}]}
print(''.join(p.get('text', '') for p in parties(appeler(os.environ.get('MODELE', 'gemini-3.5-flash'), corps))))
