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
// Appels à l'API de démonstration, pour préparer les séjours que montrent les tutos.
async function apiDemo(telephone) {
  const s = await (await fetch('http://localhost:4100/api/auth/connexion', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifiant: telephone, mot_de_passe: MOT_DE_PASSE }) })).json();
  const h = { Authorization: 'Bearer ' + s.jeton, 'X-Espace': s.espaces[0].id, 'Content-Type': 'application/json' };
  return {
    get: async (c) => (await fetch('http://localhost:4100/api' + c, { headers: h })).json(),
    post: async (c, corps) => (await fetch('http://localhost:4100/api' + c, { method: 'POST', headers: h, body: JSON.stringify(corps || {}) })).json(),
  };
}
const jourDemo = (decalage) => new Date(Date.now() + decalage * 864e5).toISOString().slice(0, 10);
// Séjours du tuto 13 : l'un à son arrivée, l'autre déjà dans les lieux et parti en retard, le dernier à moins de 24 h de l'arrivée.
async function sejoursDemo() {
  const a = await apiDemo('70111111');
  const biens = await a.get('/biens');
  const id = (ref) => biens.find(b => b.reference === ref).id;
  const parti = await a.post('/reservations', { bien_id: id('B1'), arrivee: jourDemo(-3), depart: jourDemo(-1), client: { nom: 'Salif Zoungrana', telephone: '70551122' } });
  await a.post('/paiements', { reservation_id: parti.id, montant: parti.total, moyen: 'especes' });
  await a.post(`/reservations/${parti.id}/cles`);
  await a.post('/reservations', { bien_id: id('B1'), arrivee: jourDemo(-1), depart: jourDemo(1), client: { nom: 'Moussa Diallo', telephone: '70551133' } });
  const arrivee = jourDemo(new Date().getUTCHours() >= 15 ? 1 : 0); // toujours moins de 24 h avant 15 h, et avant l'heure d'arrivée
  const tardive = await a.post('/reservations', { bien_id: id('K3'), arrivee, depart: new Date(new Date(arrivee).getTime() + 3 * 864e5).toISOString().slice(0, 10), client: { nom: 'Fatim Ouédraogo', telephone: '70551144' } });
  await a.post('/paiements', { reservation_id: tardive.id, montant: 30000, moyen: 'mobile_money', reference: 'OM-3010-7712' });
  return parti.id;
}
// Pages publiques : leurs champs ne sont pas des « label.champ ».
async function remplirPublic(t, libelle, valeur) {
  const h = await t.page.evaluateHandle((l) => [...document.querySelectorAll('label')].find(x => x.textContent.trim().startsWith(l))?.querySelector('input, textarea'), libelle);
  await h.asElement().type(String(valeur), { delay: 5 });
  await pause(150);
}
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
      await t.saisir('Numéro Mobile Money', '70456789');
      await t.saisir('Nom du titulaire', 'Aminata Sawadogo');
      await t.ecran('Vérifiez les règles de séjour : horaires, acompte, annulation. Et indiquez le numéro Mobile Money qui recevra les acomptes.', { champ: 'Numéro Mobile Money' }, { cliquer: false });
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
      await t.saisir('Quartier', 'Ouaga 2000');
      await t.saisir('Adresse', 'Rue 15.42');
      await t.ecran('Donnez-lui un nom, une ville et un quartier : c’est ainsi que les clients le trouveront. Puis ajoutez-le.', 'Ajouter', { apres: 1200 });
      await t.ecran('Votre site est créé. Pour ajouter ses villas d’un coup, appuyez sur « Plusieurs biens ».', 'Plusieurs biens');
      await t.saisir('Lettre ou préfixe', 'V');
      await t.saisir('De', '1');
      await t.saisir('À', '8');
      await t.saisir('Prix par nuit', '30000');
      await t.saisir('Chambres', '2');
      await t.saisir('Standing', 'Villa meublée');
      await t.ecran('Choisissez une lettre, de un à huit par exemple, puis le prix par nuit et le nombre de chambres.', { champ: 'Prix par nuit' }, { cliquer: false });
      await t.ecran('Ces villas seront publiées sur la place de marché : décochez la case pour les garder en interne.', { css: '.publication' }, { cliquer: false });
      await t.ecran('Ajoutez-les.', 'Ajouter 8 biens', { apres: 1300 });
      await t.ecran('Et voilà : huit villas créées en un seul geste.', 'Terminé');
      await t.ecran('Pour changer le prix ou l’état d’une villa, appuyez simplement sur « Modifier ».', { texte: 'Modifier', n: 1 });
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
      await t.ecran('Puis prenez en photo le reçu du fournisseur : c’est la preuve pour le propriétaire.', { css: '.modale .champ-fichier .bouton' }, { cliquer: false });
      const [choix] = await Promise.all([t.page.waitForFileChooser(), t.page.click('.modale .champ-fichier .bouton')]);
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
      await t.ecran('Elle mène d’abord aux réductions au-delà de la limite, dans « Réservations ».', 'Examiner');
      await t.ecran('Vérifiez le motif, puis validez la réduction, ou annulez le séjour.', 'Valider la réduction', { apres: 1000 });
      await t.ecran('C’est validé : votre gérant peut maintenant encaisser. Appuyez de nouveau sur la cloche.', { css: '.bouton-rond[aria-label*="traiter"]' });
      await t.ecran('Voici la dépense de votre gérant. Regardez d’abord le justificatif.', 'Justificatif');
      await t.ecran('C’est bien la photo du reçu.', { css: '.modale .bouton-rond' });
      await t.ecran('Acceptez-la, ou refusez-la avec un motif. Seules les dépenses acceptées comptent dans le bénéfice.', 'Accepter', { apres: 1000 });
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
  {
    id: '12-place-de-marche', numero: 12, titre: 'Recevoir des clients par la place de marché',
    async jouer(t) {
      await photosDemo();
      const arrivee = jourDemo(20), depart = jourDemo(22);
      await t.connecter('70111111');
      await t.aller('/biens');
      await t.page.evaluate(() => { [...document.querySelectorAll('tr')].find(l => l.querySelector('td')?.textContent === 'A2').querySelector('button:nth-last-child(1)').id = 'modifier-a2'; });
      await t.ecran('Pour proposer une villa aux clients de Loka, appuyez sur « Modifier ».', { css: '#modifier-a2' });
      await t.ecran('Cochez « Publier sur la place de marché », puis indiquez la capacité, la description et les équipements.', { css: '.publication' }, { cliquer: false });
      await t.page.keyboard.press('Escape'); await pause(500);
      await t.ecran('« Tout publier » met d’un coup en ligne toutes les villas d’un site.', 'Tout publier', { cliquer: false });
      await t.aller(`/villas?arrivee=${arrivee}&depart=${depart}`);
      await t.ecran('Les clients cherchent sur Loka Villas, sans compte, par ville, dates et budget. Seules les villas vraiment libres apparaissent.', { css: '.mc-carte' });
      await t.page.evaluate(() => document.querySelector('.mc-regles').scrollIntoView({ block: 'center' })); await pause(400);
      await t.ecran('La fiche montre les photos, les équipements, les avis et vos conditions de séjour.');
      await remplirPublic(t, 'Votre nom', 'Rokia Sanou');
      await remplirPublic(t, 'Votre téléphone', '70667788');
      await t.ecran('Le client envoie sa demande. Il n’a rien à payer tant que le gérant n’a pas accepté.', 'Envoyer ma demande', { apres: 1500 });
      const code = await t.page.evaluate(() => document.querySelector('.mc-code b').textContent);
      await t.ecran('Il reçoit un code pour suivre sa demande.');
      await t.page.evaluate(() => { localStorage.clear(); localStorage.setItem('loka-theme', 'clair'); }); // on change de compte
      await t.connecter('70222222');
      t.page.once('dialog', d => d.dismiss());
      await t.ecran('Côté gérant, la demande arrive en haut de l’écran Aujourd’hui. Acceptez-la, ou refusez-la. Loka propose de prévenir le client sur WhatsApp.', 'Accepter', { apres: 1500 });
      await t.aller(`/demande/${code}`);
      await remplirPublic(t, 'Après l’envoi', 'PP261030.1532.C12345');
      await t.ecran('Le client a alors deux heures pour envoyer l’acompte par Mobile Money, puis il indique la référence de la transaction.', 'J’ai envoyé l’acompte', { apres: 1200 });
      await t.page.evaluate(() => localStorage.removeItem('loka-cache')); // l'écran se rafraîchit seul chaque minute : on n'attend pas
      await t.aller('/terrain');
      await t.ecran('Vérifiez que l’argent est bien arrivé, puis appuyez sur « Acompte reçu » : le reçu est créé.', 'Acompte reçu', { apres: 1200 });
      await t.ecran('Le séjour est garanti. Sans acompte à temps, les dates sont libérées automatiquement.');
    },
  },
  {
    id: '13-cles-depart-annulation', numero: 13, titre: 'Clés, départ et annulation',
    async jouer(t) {
      const parti = await sejoursDemo();
      await t.connecter('70111111');
      await t.aller('/reservations');
      await t.ecran('Le jour de l’arrivée, ouvrez le séjour dans le planning.', 'Moussa Diallo');
      await t.ecran('Les clés se remettent après un acompte de cinquante pour cent : le bouton reste bloqué tant qu’il n’est pas payé. Appuyez sur « Encaisser ».', 'Encaisser');
      await t.saisir('Montant', '25000');
      await t.ecran('Saisissez l’acompte, puis validez.', { css: '.modale .actions .principal' }, { apres: 1400 });
      await t.page.keyboard.press('Escape'); await pause(500);
      await t.aller('/reservations');
      await t.page.evaluate(() => [...document.querySelectorAll('.sejour')].find(b => b.textContent.includes('Moussa Diallo')).click()); await pause(900);
      await t.ecran('L’acompte est payé : remettez les clés, à partir de quinze heures, l’heure d’arrivée.', 'Remettre les clés', { apres: 1200 });
      await t.ecran('Au départ, rouvrez le séjour.', 'Salif Zoungrana', { apres: 1300 });
      await t.ecran('Après l’heure de départ, Loka le signale et ajoute une nuit au séjour. Appuyez sur « Enregistrer le départ ».', 'Enregistrer le départ', { apres: 1200 });
      await t.page.evaluate(() => localStorage.removeItem('loka-cache'));
      await t.aller('/reservations');
      await t.ecran('Le client a séjourné : demandez-lui son avis.', 'Salif Zoungrana', { apres: 1200 });
      await t.ecran('Un lien part sur WhatsApp, en un seul geste.', 'Demander un avis', { cliquer: false });
      const a = await apiDemo('70111111');
      const r = (await a.get(`/reservations?du=${jourDemo(-4)}&au=${jourDemo(0)}`)).find(x => x.id === parti);
      await t.aller('/avis/' + r.code_avis);
      await t.ecran('Le client note son séjour. Seuls les vrais clients peuvent noter : ces avis comptent dans votre classement.', { css: '[aria-label="5 étoiles"]' });
      await t.aller('/reservations');
      await t.ecran('Un client annule ? Ouvrez son séjour.', 'Fatim Ouédraogo');
      await t.ecran('Appuyez sur « Annuler ».', 'Annuler…', { apres: 1200 });
      await t.ecran('Loka calcule tout : c’est gratuit jusqu’à vingt-quatre heures avant l’arrivée. Ensuite, une nuit est retenue, et le reste revient au client.');
      await t.ecran('Si c’est vous qui annulez, le client est remboursé en totalité, et Loka liste vos autres villas libres à lui proposer.', 'Nous annulons', { apres: 1200 });
      await t.ecran('Ici, c’est le client qui annule : revenez à son cas.', 'Le client annule', { apres: 900 });
      await t.ecran('Confirmez : l’annulation est enregistrée, avec le montant retenu et le montant à rendre.', 'Confirmer l’annulation', { apres: 1300 });
      await t.ecran('Les dates sont de nouveau libres.');
    },
  },
];

module.exports = { SCENARIOS };
