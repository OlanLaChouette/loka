"""Série d'affiches Loka pour les réseaux : 8 thèmes × 3 formats (statut 9:16, fil 4:5, carré 1:1) + carrousel de 7 images.
Chaque affiche montre de vraies captures de l'application (guide/captures, tutos/*/ecrans).
Usage : python affiches/serie/generer.py   puis   node affiches/serie/rendre.mjs"""
import json, os

ICI = os.path.dirname(os.path.abspath(__file__))
SORTIE = os.path.join(ICI, 'html')
os.makedirs(SORTIE, exist_ok=True)
CAP = '../../../guide/captures/'
TUTO = '../../../tutos/'

ICONES = {
    'calendrier': '<path d="M4 5h16v16H4zM4 10h16M8 3v4M16 3v4"/><path d="m9 15 2 2 4-4"/>',
    'portefeuille': '<path d="M3 7h15a3 3 0 0 1 3 3v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M3 7l12-4v4M16 13.5h2"/>',
    'photo': '<path d="M3 8a2 2 0 0 1 2-2h2l2-2h6l2 2h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><circle cx="12" cy="13" r="3.5"/>',
    'recu': '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
    'graphe': '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    'equipe': '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="17.5" cy="9" r="2.6"/><path d="M15.5 14.2A5 5 0 0 1 21.5 19"/>',
    'whatsapp': '<path d="M12 3C7 3 3 6.6 3 11c0 2.2 1 4.2 2.7 5.6L5 21l4.2-2.1c.9.2 1.8.3 2.8.3 5 0 9-3.6 9-8.1S17 3 12 3z"/>',
    'contrat': '<path d="M14 3H6v18h12V7z"/><path d="M14 3v4h4M9 12h6M9 16h4"/>',
    'cle': '<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M17 6l3 3"/>',
    'eclair': '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
    'coche': '<path d="m5 12 5 5 9-10"/>',
    'croix': '<path d="M6 6l12 12M18 6 6 18"/>',
    'bouclier': '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/><path d="m9 12 2 2 4-4"/>',
}
def icone(nom, couleur='#6D5DF5', taille=None, epaisseur=2.1):
    t = f' width="{taille}" height="{taille}"' if taille else ''
    return f'<svg{t} viewBox="0 0 24 24" fill="none" stroke="{couleur}" stroke-width="{epaisseur}" stroke-linecap="round" stroke-linejoin="round">{ICONES[nom]}</svg>'

LOGO = '<svg width="{t}" height="{t}" viewBox="0 0 48 48"><rect width="48" height="48" rx="12" fill="{f}"/><path d="M16.5 36 V22.5 a7.5 7.5 0 0 1 15 0 V36 Z" fill="{p}"/><circle cx="27.6" cy="29.5" r="1.7" fill="{f}"/></svg>'

# ---------- Thèmes ----------
THEMES = [
    dict(id='01-photos', fond='violet', surtitre='Nouveau · Photos', titre='Montrez la villa <em>avant</em> de louer.',
         texte='6 photos par villa, envoyées au client sur WhatsApp avec le prix, en un seul geste.',
         ecran=CAP + '21-photos.png', carte=TUTO + '06-reserver/ecrans/03.png', carte_tel=True,
         tuiles=['photo', 'whatsapp'], puces=['6 photos par villa', 'Envoi WhatsApp']),
    dict(id='02-recus', fond='nuit', surtitre='Encaissements', titre='Le reçu part <em>tout seul.</em>',
         texte='Espèces ou Mobile Money : chaque paiement a son reçu numéroté, à votre logo, envoyé par WhatsApp.',
         ecran=CAP + '18-encaisser.png', carte=CAP + 'recu.png', tuiles=['recu', 'whatsapp'], puces=['Reçu numéroté', 'Montant en lettres']),
    dict(id='03-depenses', fond='clair', surtitre='Dépenses', titre='Chaque franc dépensé a <em>sa preuve.</em>',
         texte='Vos gérants photographient le reçu du fournisseur. Vous acceptez ou refusez, d’un geste.',
         ecran=CAP + '09-depenses.png', carte='../../../tutos/assets/recu-fournisseur.jpg', tuiles=['photo', 'coche'], puces=['Photo du reçu', 'Validation en 1 geste']),
    dict(id='04-loyers', fond='violet', surtitre='Location au mois', titre='Plus jamais un loyer <em>oublié.</em>',
         texte='Contrats PDF, retards signalés, relance WhatsApp prête à envoyer.',
         ecran=CAP + '11-baux.png', carte=None, tuiles=['contrat', 'whatsapp'], puces=['Contrat PDF', 'Relance WhatsApp']),
    dict(id='05-benefice', fond='nuit', surtitre='Tableau de bord', titre='Votre vrai bénéfice, <em>en direct.</em>',
         texte='Encaissé, occupation, charges et dépenses, site par site. Sans cahier ni calculatrice.',
         ecran=CAP + '02-apercu.png', carte=None, tuiles=['graphe', 'eclair'], puces=['Site par site', 'Mis à jour en direct']),
    dict(id='06-gerants', fond='clair', surtitre='Vos équipes', titre='Vos gérants agissent. <em>Vous décidez.</em>',
         texte='Chacun ne voit que ses sites. Les réductions hors limite attendent votre accord.',
         ecran=CAP + '15-terrain.png', carte=None, tuiles=['equipe', 'bouclier'], puces=['Accès par site', 'Réductions encadrées']),
    dict(id='07-planning', fond='violet', surtitre='Réservations', titre='Zéro <em>double</em> réservation.',
         texte='Un planning par site : Loka refuse de louer deux fois la même nuit.',
         ecran=CAP + '06-planning.png', carte=None, tuiles=['calendrier', 'coche'], puces=['Planning par site', 'Doublons bloqués']),
    dict(id='08-essai', fond='nuit', surtitre='14 jours gratuits', titre='Votre espace en <em>2 minutes.</em>',
         texte='Créez-le vous-même sur loka.eyamtech.com. Sans engagement, puis dès 25 000 F par mois.',
         ecran=CAP + '20-mise-en-route.png', carte=None, tuiles=['cle', 'coche'], puces=['Sans engagement', 'Android et web'], qr_grand=True),
]

FORMATS = {'statut': (1080, 1920), 'fil': (1080, 1350), 'carre': (1080, 1080)}

CSS = open(os.path.join(ICI, 'style.css'), encoding='utf-8').read()


def page(largeur, hauteur, classe, corps):
    return f'''<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Loka</title>
<link href="https://fonts.googleapis.com/css2?family=Sora:wght@600;700;800&family=Inter:wght@500;600;700;800&display=swap" rel="stylesheet">
<style>{CSS}</style></head><body><div class="affiche {classe}" style="width:{largeur}px;height:{hauteur}px">{corps}<div class="grain"></div></div>
<script>window.TAILLE = {{ largeur: {largeur}, hauteur: {hauteur} }};</script></body></html>'''


def tel(src, classe=''):
    return f'<div class="tel {classe}"><div class="bezel"><div class="ecran"><img src="{src}"><div class="ile"></div></div></div></div>'


def couleurs(fond):
    return {'violet': ('#fff', '#6D5DF5'), 'nuit': ('#6D5DF5', '#fff'), 'clair': ('#6D5DF5', '#fff')}[fond]


def entete(t):
    f, p = couleurs(t['fond'])
    return f'''<div class="entete"><div class="marque">{LOGO.format(t=58, f=f, p=p)}Loka</div><div class="surtitre">{t['surtitre']}</div></div>'''


def bande(t, qr=True):
    q = '<img class="qr" src="../../qr-loka.svg">' if qr else ''
    return f'''<div class="bande"><div class="bande-texte"><b>Essai gratuit 14 jours</b><span>loka.eyamtech.com · +226 62 82 67 02</span></div>{q}</div>'''


def tuiles(t):
    return ''.join(f'<div class="tuile t{i}">{icone(n)}</div>' for i, n in enumerate(t['tuiles']))


def puces(t):
    return '<div class="puces">' + ''.join(f'<span>{icone("coche", "currentColor", 26, 3)}{p}</span>' for p in t['puces']) + '</div>'


def carte(t):
    if not t.get('carte'): return ''
    if t.get('carte_tel'): return tel(t['carte'], 'second')
    return f'<div class="carte-image"><img src="{t["carte"]}"></div>'


def affiche(t, nom_format):
    l, h = FORMATS[nom_format]
    qr_grand = t.get('qr_grand')
    corps = f'''<div class="deco d1"></div><div class="deco d2"></div>
{entete(t)}
<div class="haut"><h1>{t['titre']}</h1><p>{t['texte']}</p>{puces(t)}</div>
<div class="scene">{carte(t)}{tel(t['ecran'], 'principal')}{tuiles(t)}{'<div class="qr-grand"><img src="../../qr-loka.svg"><span>Scannez pour essayer</span></div>' if qr_grand else ''}</div>
{bande(t, qr=not qr_grand)}'''
    return page(l, h, f'{nom_format} fond-{t["fond"]}{" avec-carte" if t.get("carte") else ""}', corps)


# ---------- Carrousel (4:5, 7 images) ----------
def diapo(n, contenu, fond, fin=False):
    suite = '' if fin else '<div class="glissez">Glissez <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg></div>'
    points = '<div class="points">' + ''.join(f'<i class="{"actif" if i == n else ""}"></i>' for i in range(1, 8)) + '</div>'
    return page(1080, 1350, f'fil carrousel fond-{fond}', contenu + points + suite)


def carrousel():
    d = []
    douleurs = [('Cahier de réservations illisible', 'calendrier'), ('Reçus perdus, clients qui contestent', 'recu'),
                ('Dépenses du gérant sans preuve', 'photo'), ('Loyers oubliés, bénéfice inconnu', 'graphe')]
    f, p = couleurs('nuit')
    d.append(diapo(1, f'''<div class="deco d1"></div><div class="deco d2"></div>
<div class="entete"><div class="marque">{LOGO.format(t=58, f=f, p=p)}Loka</div><div class="surtitre">1 / 7</div></div>
<div class="haut accroche"><h1>Vous louez des <em>villas meublées</em>&nbsp;?</h1><p>Si l’une de ces situations vous parle, la suite est pour vous.</p></div>
<div class="douleurs">{''.join(f'<div class="douleur"><span class="ic">{icone(i, "#FF8A9A", 34)}</span>{t}<span class="x">{icone("croix", "#FF8A9A", 30, 3)}</span></div>' for t, i in douleurs)}</div>''', 'nuit'))
    for n, tid in zip(range(2, 7), ['07-planning', '02-recus', '03-depenses', '01-photos', '05-benefice']):
        t = dict(next(x for x in THEMES if x['id'] == tid)); t['surtitre'] = f'{n} / 7'
        d.append(diapo(n, f'''<div class="deco d1"></div><div class="deco d2"></div>{entete(t)}
<div class="haut"><h1>{t['titre']}</h1><p>{t['texte']}</p></div>
<div class="scene">{carte(t)}{tel(t['ecran'], 'principal')}{tuiles(t)}</div>''', t['fond']))
    f, p = couleurs('violet')
    d.append(diapo(7, f'''<div class="deco d1"></div><div class="deco d2"></div>
<div class="entete"><div class="marque">{LOGO.format(t=58, f=f, p=p)}Loka</div><div class="surtitre">7 / 7</div></div>
<div class="final"><div class="gros">14 jours</div><div class="gratuits">GRATUITS</div>
<p>Créez votre espace en 2 minutes, sans engagement.<br>Puis dès 25 000 F par mois.</p>
<div class="qr-final"><img src="../../qr-loka.svg"></div><div class="lien">loka.eyamtech.com</div><div class="tel-contact">WhatsApp : +226 62 82 67 02</div></div>''', 'violet', fin=True))
    return d


fichiers = []
for t in THEMES:
    for nf in FORMATS:
        nom = f'{t["id"]}-{nf}.html'
        open(os.path.join(SORTIE, nom), 'w', encoding='utf-8').write(affiche(t, nf)); fichiers.append(nom)
for i, html in enumerate(carrousel(), start=1):
    nom = f'carrousel-{i}.html'
    open(os.path.join(SORTIE, nom), 'w', encoding='utf-8').write(html); fichiers.append(nom)
json.dump(fichiers, open(os.path.join(SORTIE, 'liste.json'), 'w'))
print(len(fichiers), 'affiches générées')
