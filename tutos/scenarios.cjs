// Scénarios des tutos : chaque écran porte la phrase dite par la voix off (et affichée en sous-titre).
// Ils s'enchaînent : l'espace « Résidence Les Palmiers » créé au n°1 sert aux tutos du propriétaire.
const path = require('path');
const { pause, ecranMail, ecranWhatsApp, ecranImage, pdfEnImage, apiPdf, courrielCode } = require('./capture.cjs');
const { envoyes } = require(path.join(__dirname, '../backend/src/services/courriel'));

const ASSETS = path.join(__dirname, 'assets');
const fs = require('fs');
const { MOT_DE_PASSE } = require(path.join(__dirname, '../backend/src/scripts/comptes-demo'));

// Photos d'exemple sur la villa A2 de la démo (pour le tuto « Réserver »).
async function photosDemo() {
  const s = await (await fetch('http://localhost:4100/api/auth/connexion', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifiant: '70111111', mot_de_passe: MOT_DE_PASSE }) })).json();
  const h = { Authorization: 'Bearer ' + s.jeton, 'X-Espace': s.espaces[0].id };
  const a2 = (await (await fetch('http://localhost:4100/api/biens', { headers: h })).json()).find(b => b.reference === 'A2');
  if (a2.photos.length) return;
  for (const n of ['facade', 'salon', 'chambre', 'piscine']) {
    const f = new FormData();
    f.append('photo', new Blob([fs.readFileSync(path.join(ASSETS, 'villas', n + '.jpg'))], { type: 'image/jpeg' }), n + '.jpg');
    await fetch(`http://localhost:4100/api/biens/${a2.id}/photos`, { method: 'POST', headers: h, body: f });
  }
}
// Un appartement au mois encore libre (pour montrer la création d'un bail).
async function bienAuMois() {
  const s = await (await fetch('http://localhost:4100/api/auth/connexion', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifiant: '70111111', mot_de_passe: MOT_DE_PASSE }) })).json();
  const h = { Authorization: 'Bearer ' + s.jeton, 'X-Espace': s.espaces[0].id, 'Content-Type': 'application/json' };
  const site = (await (await fetch('http://localhost:4100/api/sites', { headers: h })).json()).find(x => x.nom.includes('Zogona'));
  await fetch('http://localhost:4100/api/biens', { method: 'POST', headers: h, body: JSON.stringify({ site_id: site.id, reference: 'Z5', type: 'appartement', mode: 'mois', prix_mois: 100000, standing: 'Standing', pieces: 2 }) });
}
const img64 = (n) => 'data:image/jpeg;base64,' + fs.readFileSync(path.join(ASSETS, 'villas', n + '.jpg')).toString('base64');
const ecranPhotosWhatsApp = () => `<style>*{box-sizing:border-box;margin:0}body{font-family:'Segoe UI',Arial,sans-serif;width:390px;height:844px;overflow:hidden}</style>
<div style="background:#075E54;color:#fff;padding:52px 14px 12px;display:flex;gap:12px;align-items:center"><span style="font-size:22px">‹</span><span style="width:38px;height:38px;border-radius:50%;background:#cfd8dc;color:#455a64;display:flex;align-items:center;justify-content:center;font-weight:700">M</span><div><div style="font-weight:600">Moussa Traoré</div><div style="font-size:12px;opacity:.8">en ligne</div></div></div>
<div style="background:#ECE5DD;height:760px;padding:16px 12px;display:flex;flex-direction:column;align-items:flex-end;gap:8px">
<div style="background:#DCF8C6;border-radius:10px;padding:4px;width:270px;box-shadow:0 1px 1px rgba(0,0,0,.1)">
<div style="display:grid;grid-template-columns:1fr 1fr;gap:3px">${['facade', 'salon', 'chambre', 'piscine'].map(n => `<img src="${img64(n)}" style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:6px">`).join('')}</div>
<div style="font-size:14.5px;padding:8px 6px 2px;line-height:1.4">Ouaga 2000 · A2<br>Standing · 2 chambres<br>25 000 FCFA / nuit<br>Résidences Kaboré</div>
<div style="font-size:11px;color:#6b8f71;text-align:right;padding:0 6px 4px">maintenant ✓✓</div></div></div>`;
const NOUVEAU = { nom: 'Aminata Sawadogo', entreprise: 'Résidence Les Palmiers', ville: 'Ouagadougou', telephone: '70456789', email: 'aminata@palmiers.test', mdp: 'palmiers-2026' };

async function connecterNouveau(t) {
  await t.aller('/connexion');
  await t.saisir('Téléphone ou e-mail', NOUVEAU.telephone);
  await t.saisir('Mot de passe', NOUVEAU.mdp);
  await t.page.keyboard.press('Enter');
  await t.page.waitForNavigation({ waitUntil: 'networkidle0' }).catch(() => {});
  await pause(900);
}

const SCENARIOS = [
  {
    id: '01-creer-son-espace', numero: 1, titre: 'Créer son espace',
    async jouer(t) {
      await t.aller('/bienvenue');
      await t.ecran('Pour commencer, ouvrez loka.eyamtech.com sur votre téléphone, puis appuyez sur « Créer mon espace ».', 'Créer mon espace · 14 jours gratuits');
      await t.ecran('Indiquez votre nom, le nom de votre entreprise et votre ville.');
      await t.saisir('Votre nom', NOUVEAU.nom);
      await t.saisir('Nom de votre entreprise', NOUVEAU.entreprise);
      await t.saisir('Ville', NOUVEAU.ville);
      await t.saisir('Téléphone', '70 45 67 89');
      await t.saisir('E-mail', NOUVEAU.email);
      await t.saisir('Mot de passe', NOUVEAU.mdp);
      await t.ecran('Ajoutez votre numéro de téléphone, qui vous servira à vous connecter, votre e-mail et un mot de passe.', 'Recevoir mon code', { apres: 1500 });
      const code = envoyes.at(-1).texte.match(/\b(\d{6})\b/)[1];
      const mail = courrielCode({ a: NOUVEAU.email, nom: NOUVEAU.nom, code, objet: 'inscription' });
      await t.ecranHtml('Loka vous envoie aussitôt un code à six chiffres par e-mail.', ecranMail({ sujet: mail.sujet, html: mail.html }));
      await t.saisir('Code reçu', code);
      await t.ecran('Saisissez ce code, puis appuyez sur « Ouvrir mon espace ».', 'Ouvrir mon espace', { apres: 2000 });
      await t.ecran('Votre espace est prêt, avec quatorze jours d’essai gratuit. Il ne reste qu’à suivre les étapes, une par une.');
    },
  },
  {
    id: '02-entreprise-et-logo', numero: 2, titre: 'Votre entreprise et votre logo',
    async jouer(t) {
      await connecterNouveau(t);
      await t.ecran('Ouvrez le menu, en haut à droite.', { css: '.bouton-menu' }, { apres: 600 });
      await t.ecran('Puis choisissez « Entreprise ».', 'Entreprise');
      await t.ecran('Ajoutez d’abord votre logo : il apparaîtra sur vos reçus et vos contrats.', 'Ajouter un logo', { cliquer: false });
      await t.fichier('Ajouter un logo', path.join(ASSETS, 'logo-palmiers.png'));
      await t.saisir('Forme juridique', 'SARL');
      await t.saisir('RCCM', 'BF-OUA-2024-B-5678');
      await t.saisir('IFU', '00098765X');
      await t.saisir('Adresse', 'Ouaga 2000, rue 15.42');
      await t.ecran('Complétez ensuite la forme juridique, le RCCM, l’IFU et l’adresse.', { champ: 'RCCM' }, { cliquer: false });
      await t.saisir('Réduction maximale', '10');
      await t.ecran('Fixez enfin la réduction qu’un gérant peut accorder sans votre accord, puis enregistrez.', 'Enregistrer', { apres: 1200 });
      await t.defiler(0);
      await t.ecran('C’est enregistré : ces informations figurent désormais sur tous vos documents.');
    },
  },
  {
    id: '03-sites-et-biens', numero: 3, titre: 'Créer ses sites et ses biens',
    async jouer(t) {
      await connecterNouveau(t);
      await t.ecran('Créez maintenant votre premier site : une résidence, ou un immeuble.', 'Créer un site');
      await t.saisir('Nom du site', 'Les Palmiers');
      await t.saisir('Ville', 'Ouagadougou');
      await t.saisir('Adresse', 'Ouaga 2000');
      await t.ecran('Donnez-lui un nom et une ville, puis ajoutez-le.', 'Ajouter', { apres: 1200 });
      await t.ecran('Votre site est créé. Pour ajouter ses villas d’un coup, appuyez sur « Plusieurs biens ».', 'Plusieurs biens');
      await t.saisir('Lettre ou préfixe', 'V');
      await t.saisir('De', '1');
      await t.saisir('À', '8');
      await t.saisir('Prix par nuit', '30000');
      await t.saisir('Chambres', '2');
      await t.saisir('Standing', 'Villa meublée');
      await t.ecran('Choisissez une lettre, de un à huit par exemple, puis le prix par nuit et le nombre de chambres.', 'Ajouter 8 biens', { apres: 1300 });
      await t.ecran('Et voilà : huit villas créées en un seul geste.', 'Terminé');
      await t.ecran('Pour changer le prix ou l’état d’une villa, appuyez simplement sur « Modifier ».', 'Modifier');
      await t.ecran('Prix, standing, chambres, compteur électrique, ou mise en travaux : tout se règle ici.');
      await t.page.keyboard.press('Escape'); await pause(500);
      await t.ecran('Ajoutez enfin des photos : appuyez sur l’appareil photo de la villa.', { css: '[aria-label="Photos de V1"]' });
      await t.ecran('Jusqu’à six photos par villa, prises au téléphone ou choisies dans la galerie.', { css: '.photo-ajout' }, { cliquer: false });
      const [choix] = await Promise.all([t.page.waitForFileChooser(), t.page.click('.photo-ajout')]);
      await choix.accept(['facade', 'salon', 'chambre', 'piscine'].map(n => path.join(ASSETS, 'villas', n + '.jpg')));
      await pause(4000);
      await t.ecran('Elles sont réduites automatiquement, et la première sert de couverture.');
    },
  },
  {
    id: '04-inviter-un-gerant', numero: 4, titre: 'Inviter un gérant',
    async jouer(t) {
      await connecterNouveau(t);
      await t.ecran('Pour inviter un gérant, ouvrez le menu, en haut à droite.', { css: '.bouton-menu' }, { apres: 600 });
      await t.ecran('Puis choisissez « Gérants ».', 'Gérants');
      await t.ecran('Appuyez sur « Ajouter un membre ».', '+ Ajouter un membre');
      await t.saisir('Nom', 'Issouf Ouédraogo');
      await t.saisir('Téléphone', '76112233');
      await t.saisir('Mot de passe provisoire', 'bienvenue-2026');
      await t.ecran('Saisissez son nom, son numéro de téléphone, qui sera son identifiant, et un mot de passe provisoire.', { champ: 'Téléphone' }, { cliquer: false });
      await t.saisir('Limite de réduction', '10');
      await t.page.evaluate(() => { const c = [...document.querySelectorAll('.modale input[type=checkbox]')][0]; c && c.click(); });
      await pause(300);
      await t.ecran('Cochez les sites qu’il gère, puis enregistrez.', 'Enregistrer', { apres: 1200 });
      await t.ecran('Transmettez-lui son numéro et son mot de passe : depuis son téléphone, il arrive directement sur ses tâches du jour.');
    },
  },
  {
    id: '05-charges-fixes', numero: 5, titre: 'Déclarer ses charges fixes',
    async jouer(t) {
      await connecterNouveau(t);
      await t.ecran('Pour connaître votre vrai bénéfice, déclarez vos charges fixes. Appuyez sur « Caisse ».', { css: '.barre-bas a', n: 2 });
      await t.ecran('Puis sur l’onglet « Charges fixes ».', 'Charges fixes');
      await t.ecran('Appuyez sur « Ajouter une charge ».', '+ Ajouter une charge');
      await t.saisir('Nom', 'Wi-Fi');
      await t.saisir('Montant', '25000');
      await t.ecran('Donnez-lui un nom, un montant, une fréquence, et choisissez ce qu’elle concerne.', 'Enregistrer', { apres: 1000 });
      await t.ecran('Ajoutez de même le gaz, le gardiennage ou l’assurance.', '+ Ajouter une charge');
      await t.saisir('Nom', 'Gardiennage');
      await t.saisir('Montant', '60000');
      await t.page.click('.modale .actions .principal'); await pause(1000);
      await t.ecran('Loka les compte automatiquement chaque mois, dans le bénéfice de chaque site.');
    },
  },
  {
    id: '06-reserver', numero: 6, titre: 'Réserver un séjour',
    async jouer(t) {
      await photosDemo();
      await t.connecter('70222222');
      await t.ecran('Un client veut voir une villa libre ? Appuyez sur son appareil photo.', { css: '[aria-label="Photos de A2"]' });
      await t.ecran('Envoyez-lui toutes les photos sur WhatsApp, avec le prix, en un seul geste.', 'Envoyer au client', { cliquer: false });
      await t.ecranHtml('Il les reçoit aussitôt, avec la description et le prix de la villa.', ecranPhotosWhatsApp());
      await t.page.keyboard.press('Escape'); await pause(500);
      await t.ecran('Le client est d’accord ? Appuyez sur « Réserver ».', 'Réserver');
      const libre = await t.page.evaluate(() => [...document.querySelectorAll('.modale select option')].map(o => o.textContent).find(x => /A2|B1/.test(x)) || [...document.querySelectorAll('.modale select option')][1].textContent);
      await t.saisir('Bien', libre);
      await t.ecran('Choisissez la villa, puis les dates d’arrivée et de départ.', { champ: 'Départ' }, { cliquer: false });
      await t.saisir('Nom du client', 'Moussa Traoré');
      await t.saisir('Téléphone', '70998877');
      await t.ecran('Saisissez le nom et le téléphone du client.', { champ: 'Téléphone' }, { cliquer: false });
      await t.saisir('Réduction', '5');
      await t.saisir('Raison', 'Client fidèle');
      await t.ecran('Une réduction ? Indiquez-la avec sa raison : le total se calcule tout seul.', 'Réserver', { apres: 1300 });
      await t.ecran('C’est réservé ! Et Loka refuse toute autre réservation de cette villa sur les mêmes dates.');
    },
  },
  {
    id: '07-encaisser', numero: 7, titre: 'Encaisser et envoyer le reçu',
    async jouer(t) {
      await t.connecter('70222222');
      await t.ecran('Les séjours à encaisser sont listés en haut. Appuyez sur « Encaisser ».', { css: '.carte .liste-lignes .bouton.principal' });
      await t.ecran('Le montant restant est déjà rempli. Choisissez le moyen de paiement.', 'Mobile Money');
      await t.saisir('Référence', 'OM-2610-4581');
      await t.ecran('Pour Mobile Money, notez la référence de la transaction, puis validez.', { css: '.modale .actions .principal' }, { apres: 1400 });
      await t.ecran('Le reçu est prêt. Envoyez-le au client par WhatsApp, en un seul geste.', 'Envoyer par WhatsApp', { cliquer: false });
      const pdf = await apiPdf('70222222', { liste: '/paiements', choisir: l => l[0], pdf: id => `/paiements/${id}/recu.pdf` });
      const img = await pdfEnImage(pdf, path.join(require('os').tmpdir(), 'loka-recu.png'));
      await t.ecranHtml('Le client reçoit aussitôt son reçu numéroté…', ecranWhatsApp({ client: 'Koffi Bambara', fichier: 'Recu-R-00012.pdf', message: 'Bonjour Koffi Bambara, voici votre reçu. Merci pour votre confiance. Résidences Kaboré' }));
      await t.ecranHtml('…avec le logo et les informations de l’entreprise, le montant en lettres et ce qui reste à payer.', ecranImage(img));
    },
  },
  {
    id: '08-noter-une-depense', numero: 8, titre: 'Noter une dépense',
    async jouer(t) {
      await t.connecter('70222222');
      await t.ecran('Une dépense sur le terrain ? Appuyez sur l’icône de reçu.', { css: '[aria-label="Noter une dépense"]' });
      await t.saisir('Pour', 'B2');
      await t.saisir('Catégorie', 'Recharge gaz');
      await t.saisir('Montant', '7500');
      await t.ecran('Indiquez pour quel site ou quelle villa, la catégorie et le montant.', { champ: 'Montant' }, { cliquer: false });
      await t.page.evaluate(() => { const i = document.querySelector('.modale input[type=file]'); i.scrollIntoView({ block: 'center' }); });
      await t.ecran('Puis prenez en photo le reçu du fournisseur : c’est la preuve pour le propriétaire.', { css: '.modale input[type=file]' }, { cliquer: false });
      const [choix] = await Promise.all([t.page.waitForFileChooser(), t.page.click('.modale input[type=file]')]);
      await choix.accept([path.join(ASSETS, 'recu-fournisseur.jpg')]);
      await pause(1800);
      await t.ecran('Envoyez.', 'Envoyer', { apres: 1500 });
      t.etapes.pop();
      await t.ecran('C’est envoyé : le propriétaire la valide de son côté. Et sans réseau, elle partira toute seule au retour de la connexion.');
    },
  },
  {
    id: '09-valider', numero: 9, titre: 'Valider les dépenses et les réductions',
    async jouer(t) {
      await t.connecter('70111111');
      await t.page.evaluate(() => { try { localStorage.setItem('loka-mise-en-route-masquee-' + localStorage.getItem('loka-espace'), '1'); } catch {} });
      await t.aller('/');
      await t.ecran('La cloche, en haut, signale ce qui attend votre accord.', { css: '.bouton-rond[aria-label*="traiter"]' });
      await t.ecran('Voici la dépense de votre gérant. Regardez d’abord le justificatif.', 'Justificatif');
      await t.ecran('C’est bien la photo du reçu.', { css: '.modale .bouton-rond' });
      await t.ecran('Acceptez-la, ou refusez-la avec un motif. Seules les dépenses acceptées comptent dans le bénéfice.', 'Accepter', { apres: 1000 });
      await t.aller('/reservations');
      await t.ecran('Les réductions au-delà de la limite attendent aussi votre accord, dans « Réservations ».', 'Examiner');
      await t.ecran('Vérifiez le motif, puis validez la réduction, ou annulez le séjour.', 'Valider la réduction', { apres: 1000 });
      await t.ecran('C’est validé : votre gérant peut maintenant encaisser.');
    },
  },
  {
    id: '10-baux-et-loyers', numero: 10, titre: 'Baux et loyers au mois',
    async jouer(t) {
      await t.connecter('70111111');
      await t.aller('/baux');
      await t.ecran('Pour vos locations au mois, ouvrez « Baux » : chaque loyer du mois est payé, à venir, ou en retard.');
      await t.ecran('« Contrat » génère le contrat de bail en PDF, prêt à imprimer et à signer.', 'Contrat', { cliquer: false });
      const pdf = await apiPdf('70111111', { liste: '/baux', choisir: l => l[0], pdf: id => `/baux/${id}/contrat.pdf` });
      await t.ecranHtml('Il reprend le bien, le locataire, le loyer, l’échéance et la caution.', ecranImage(await pdfEnImage(pdf, path.join(require('os').tmpdir(), 'loka-contrat.png'))));
      await t.ecran('Pour un loyer reçu, appuyez sur « Encaisser » : le reçu suit, comme pour un séjour.', 'Encaisser');
      await t.page.click('.modale .bouton-rond'); await pause(500);
      await bienAuMois();
      await t.aller('/baux');
      await t.ecran('Pour un nouveau locataire, appuyez sur « Nouveau bail ».', '+ Nouveau bail');
      await t.saisir('Bien', 'Z5');
      await t.saisir('Locataire', 'Clarisse Ouédraogo');
      await t.saisir('Téléphone', '70223344');
      await t.ecran('Choisissez l’appartement et le locataire : le loyer et la caution se remplissent tout seuls. Ajustez le jour d’échéance si besoin.', 'Créer le bail', { apres: 1200 });
      await t.ecran('Le bail est créé. Loka suit maintenant chaque loyer du mois pour vous.');
    },
  },
  {
    id: '11-tableau-de-bord', numero: 11, titre: 'Lire son tableau de bord',
    async jouer(t) {
      await t.connecter('70111111');
      await t.page.evaluate(() => { try { localStorage.setItem('loka-mise-en-route-masquee-' + localStorage.getItem('loka-espace'), '1'); } catch {} });
      await t.aller('/');
      await t.ecran('Votre tableau de bord s’ouvre sur l’argent encaissé ce mois-ci, et son évolution sur douze mois.');
      await t.defiler(330);
      await t.ecran('Puis le taux d’occupation de vos villas, et ce qui reste à encaisser, avec un bouton pour relancer le client.');
      await t.page.evaluate(() => [...document.querySelectorAll('h2')].find(h => h.textContent.includes('Vos sites')).scrollIntoView({ block: 'start' }));
      await pause(400);
      await t.ecran('Chaque site a son occupation. En bas : charges, dépenses, et votre bénéfice réel du mois.');
      await t.page.evaluate(() => [...document.querySelectorAll('h2')].find(h => h.textContent.includes('En direct')).scrollIntoView({ block: 'start' }));
      await pause(400);
      await t.ecran('Et en direct, tout ce que font vos gérants : réservations, encaissements, dépenses.');
      await t.defiler(0);
      await t.ecran('Les flèches, en haut, permettent de revoir les mois passés.', { css: '.segment button', n: 0 }, { cliquer: false });
    },
  },
];

module.exports = { SCENARIOS };
