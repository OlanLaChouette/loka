"""Génère toute la voix off en une seule prise (quota gratuit limité), puis la découpe aux silences."""
import json, os, subprocess, sys
sys.path.insert(0, os.path.dirname(__file__))
from gemini import voix

VOIX = sys.argv[1] if len(sys.argv) > 1 else 'Charon'
REPLIQUES = [
    "Vos villas rapportent… mais combien, exactement ?",
    "Avec Loka, votre gérant réserve et encaisse, directement sur place.",
    "Chaque dépense arrive avec sa preuve.",
    "À la nuit… ou au mois.",
    "Et vous, vous suivez tout, en temps réel.",
    "Loka, par eYamTech. Contactez-nous !",
]
INVITE = ("### DIRECTION (à ne pas lire)\n"
          "Publicité radio en français. Voix chaleureuse, assurée, souriante, débit dynamique. "
          "Marque une pause de deux secondes entre chaque phrase.\n"
          "### TEXTE À LIRE\n" + "\n\n".join(REPLIQUES))
d = voix(INVITE, 'assets/audio/voix_complete.wav', voix=VOIX, consigne='')
print('durée totale', round(d, 2), 's')
