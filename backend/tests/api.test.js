// Tests de bout en bout de l'API sur les données de démonstration (base de développement requise : npm run db:dev).
process.env.NODE_ENV = 'test';
require('dotenv').config();
const test = require('node:test');
const assert = require('node:assert/strict');
const app = require('../server');
const path = require('path');
const { execFileSync } = require('child_process');
const { sequelize } = require('../src/models');
const { MOT_DE_PASSE } = require('../src/scripts/comptes-demo');

let serveur, base;
const appel = async (methode, chemin, { jeton, espace, corps } = {}) => {
  const r = await fetch(base + chemin, {
    method: methode,
    headers: { 'Content-Type': 'application/json', ...(jeton && { Authorization: 'Bearer ' + jeton }), ...(espace && { 'X-Espace': espace }) },
    body: corps ? JSON.stringify(corps) : undefined,
  });
  return { statut: r.status, corps: await r.json().catch(() => null) };
};
const connecter = async (tel) => (await appel('POST', '/api/auth/connexion', { corps: { identifiant: tel, mot_de_passe: MOT_DE_PASSE } })).corps;

test.before(async () => {
  // Base recréée par le compte propriétaire ; l'API, elle, tourne avec le compte limité.
  execFileSync(process.execPath, [path.join(__dirname, '..', 'src', 'scripts', 'creer-base.js'), '--demo'], { stdio: 'ignore', env: { ...process.env, NODE_ENV: 'development' } });
  serveur = app.listen(0);
  base = 'http://localhost:' + serveur.address().port;
});
test.after(async () => { serveur.close(); await sequelize.close(); });

test('connexion et espaces d’une personne qui travaille pour deux bailleurs', async () => {
  const mariam = await connecter('70333333');
  assert.ok(mariam.jeton);
  assert.deepEqual(mariam.espaces.map(e => e.nom).sort(), ['Résidences Kaboré', 'SCI Wendpanga']);
  assert.equal((await appel('POST', '/api/auth/connexion', { corps: { identifiant: '70333333', mot_de_passe: 'faux' } })).statut, 401);
});

test('un bailleur ne voit jamais les biens d’un autre', async () => {
  const paul = await connecter('70555555');
  const issa = await connecter('70111111');
  const wend = paul.espaces[0].id, kabore = issa.espaces[0].id;
  const biensPaul = await appel('GET', '/api/biens', { jeton: paul.jeton, espace: wend });
  assert.deepEqual(biensPaul.corps.map(b => b.reference), ['W1']);
  // Paul tente d'ouvrir l'espace Kaboré : refusé.
  assert.equal((await appel('GET', '/api/biens', { jeton: paul.jeton, espace: kabore })).statut, 403);
  // Et ne peut pas modifier un bien de Kaboré en passant par son propre espace.
  const unBienKabore = (await appel('GET', '/api/biens', { jeton: issa.jeton, espace: kabore })).corps[0];
  assert.equal((await appel('PATCH', '/api/biens/' + unBienKabore.id, { jeton: paul.jeton, espace: wend, corps: { prix_nuit: 1 } })).statut, 404);
});

test('le gérant ne voit que ses sites et ne change pas les prix', async () => {
  const ali = await connecter('70222222');
  const esp = ali.espaces[0].id;
  const biens = (await appel('GET', '/api/biens', { jeton: ali.jeton, espace: esp })).corps;
  assert.ok(biens.length > 0 && biens.every(b => b.Site.nom === 'Ouaga 2000'));
  const b2 = biens.find(b => b.reference === 'B2');
  await appel('PATCH', '/api/biens/' + b2.id, { jeton: ali.jeton, espace: esp, corps: { prix_nuit: 1000 } });
  const apres = (await appel('GET', '/api/biens', { jeton: ali.jeton, espace: esp })).corps.find(b => b.reference === 'B2');
  assert.equal(apres.prix_nuit, 30000);
});

test('réservation : réduction hors limite à valider, double réservation refusée, reçu numéroté', async () => {
  const ali = await connecter('70222222');
  const issa = await connecter('70111111');
  const esp = ali.espaces[0].id;
  const c2 = (await appel('GET', '/api/biens', { jeton: ali.jeton, espace: esp })).corps.find(b => b.reference === 'A2');
  const debut = new Date(Date.now() + 40 * 864e5).toISOString().slice(0, 10);
  const fin = new Date(Date.now() + 42 * 864e5).toISOString().slice(0, 10);
  const r = await appel('POST', '/api/reservations', { jeton: ali.jeton, espace: esp, corps: { bien_id: c2.id, client: { nom: 'Test Client' }, arrivee: debut, depart: fin, reduction: { pourcent: 30 }, reduction_motif: 'Essai' } });
  assert.equal(r.statut, 201);
  assert.equal(r.corps.statut, 'attente_validation');
  assert.equal(r.corps.total, 35000);
  // Pas d'encaissement tant que le propriétaire n'a pas validé.
  assert.equal((await appel('POST', '/api/paiements', { jeton: ali.jeton, espace: esp, corps: { reservation_id: r.corps.id, montant: 35000, moyen: 'especes' } })).statut, 409);
  const doublon = await appel('POST', '/api/reservations', { jeton: ali.jeton, espace: esp, corps: { bien_id: c2.id, client: { nom: 'Autre' }, arrivee: debut, depart: fin } });
  assert.equal(doublon.statut, 409);
  assert.equal((await appel('POST', `/api/reservations/${r.corps.id}/valider`, { jeton: ali.jeton, espace: esp })).statut, 403);
  assert.equal((await appel('POST', `/api/reservations/${r.corps.id}/valider`, { jeton: issa.jeton, espace: esp })).statut, 200);
  const p = await appel('POST', '/api/paiements', { jeton: ali.jeton, espace: esp, corps: { reservation_id: r.corps.id, montant: 35000, moyen: 'mobile_money' } });
  assert.equal(p.statut, 201);
  assert.match(p.corps.numero_recu, /^R-\d{5}$/);
  assert.equal((await appel('POST', '/api/paiements', { jeton: ali.jeton, espace: esp, corps: { reservation_id: r.corps.id, montant: 1, moyen: 'especes' } })).statut, 400);
});

test('le comptable consulte mais ne modifie pas', async () => {
  const awa = await connecter('70444444');
  const esp = awa.espaces[0].id;
  assert.equal((await appel('GET', '/api/tableau-de-bord', { jeton: awa.jeton, espace: esp })).statut, 200);
  assert.equal((await appel('POST', '/api/clients', { jeton: awa.jeton, espace: esp, corps: { nom: 'X' } })).statut, 403);
});

test('tableau de bord cohérent', async () => {
  const issa = await connecter('70111111');
  const t = (await appel('GET', '/api/tableau-de-bord', { jeton: issa.jeton, espace: issa.espaces[0].id })).corps;
  assert.ok(t.encaisse > 0);
  assert.equal(t.benefice, t.encaisse - t.depenses - t.charges);
  assert.equal(t.charges, 45000 + 60000 + 90000 + 20000);
  assert.equal(t.a_traiter.depenses, 1);
  assert.equal(t.evolution.length, 12);
});

test('administration Loka : biens enregistrés et abonnement', async () => {
  const admin = await connecter('70000000');
  const liste = (await appel('GET', '/api/plateforme/bailleurs', { jeton: admin.jeton })).corps;
  const kabore = liste.find(b => b.nom === 'Résidences Kaboré');
  assert.equal(kabore.biens_enregistres, 15);
  // 11 biens à la nuit × 2 500 + 4 au mois × 1 000
  assert.equal(kabore.abonnement_mensuel, 31500);
  const issa = await connecter('70111111');
  assert.equal((await appel('GET', '/api/plateforme/bailleurs', { jeton: issa.jeton })).statut, 403);
});

test('la base elle-même refuse de montrer les données d’un autre bailleur', async () => {
  assert.equal(sequelize.modeProprietaire, false);
  const issa = await connecter('70111111');
  const paul = await connecter('70555555');
  const idKabore = issa.espaces[0].id, idWend = paul.espaces[0].id;
  const compter = (espace) => sequelize.transaction(async () => {
    if (espace) await sequelize.query("SELECT set_config('app.bailleur_id', :e, true)", { replacements: { e: espace } });
    const [r] = await sequelize.query('SELECT count(*)::int AS n FROM biens WHERE bailleur_id = :k', { replacements: { k: idKabore } });
    return r[0].n;
  });
  // Sans espace déclaré, aucune ligne ; dans l'espace d'un autre bailleur, aucune ligne non plus.
  assert.equal(await compter(null), 0);
  assert.equal(await compter(idWend), 0);
  assert.equal(await compter(idKabore), 15);
  // Une écriture vers un autre bailleur est rejetée par PostgreSQL.
  await assert.rejects(sequelize.transaction(async () => {
    await sequelize.query("SELECT set_config('app.bailleur_id', :e, true)", { replacements: { e: idWend } });
    await sequelize.query("INSERT INTO sites (id, bailleur_id, nom, cree_le, modifie_le) VALUES (gen_random_uuid(), :k, 'intrus', now(), now())", { replacements: { k: idKabore } });
  }));
});

test('reçu et contrat en PDF, uniquement dans son espace', async () => {
  const issa = await connecter('70111111');
  const paul = await connecter('70555555');
  const esp = issa.espaces[0].id;
  const p = (await appel('GET', '/api/paiements', { jeton: issa.jeton, espace: esp })).corps[0];
  const brut = async (chemin, qui, espace) => fetch(base + chemin, { headers: { Authorization: 'Bearer ' + qui.jeton, 'X-Espace': espace } });
  const r = await brut(`/api/paiements/${p.id}/recu.pdf`, issa, esp);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), 'application/pdf');
  assert.equal(Buffer.from(await r.arrayBuffer()).subarray(0, 4).toString(), '%PDF');
  assert.equal((await brut(`/api/paiements/${p.id}/recu.pdf`, paul, paul.espaces[0].id)).status, 404);
  const bail = (await appel('GET', '/api/baux', { jeton: issa.jeton, espace: esp })).corps[0];
  const c = await brut(`/api/baux/${bail.id}/contrat.pdf`, issa, esp);
  assert.equal(c.status, 200);
  assert.ok((await c.arrayBuffer()).byteLength > 2000);
});

test('un encaissement renvoyé après une coupure n’est enregistré qu’une fois', async () => {
  const ali = await connecter('70222222');
  const esp = ali.espaces[0].id;
  const resas = (await appel('GET', '/api/reservations', { jeton: ali.jeton, espace: esp })).corps;
  const r = resas.find(x => x.statut === 'confirmee' && x.total - x.paye >= 2000);
  const corps = { reservation_id: r.id, montant: 1000, moyen: 'especes', cle_client: 'test-' + Date.now() };
  const a = await appel('POST', '/api/paiements', { jeton: ali.jeton, espace: esp, corps });
  const b = await appel('POST', '/api/paiements', { jeton: ali.jeton, espace: esp, corps });
  assert.equal(a.statut, 201);
  assert.equal(b.statut, 200);
  assert.equal(a.corps.id, b.corps.id);
});

test('logo et justificatif stockés dans la base, protégés par espace', async () => {
  const issa = await connecter('70111111');
  const ali = await connecter('70222222');
  const paul = await connecter('70555555');
  const esp = issa.espaces[0].id;
  // Plus petite image PNG valide (1 × 1 pixel).
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  const envoi = async (chemin, champ, qui, autres = {}) => {
    const f = new FormData();
    f.append(champ, new Blob([png], { type: 'image/png' }), 'image.png');
    for (const [k, v] of Object.entries(autres)) f.append(k, v);
    return fetch(base + chemin, { method: 'POST', headers: { Authorization: 'Bearer ' + qui.jeton, 'X-Espace': esp }, body: f });
  };
  const logo = await envoi('/api/profil/logo', 'logo', issa);
  assert.equal(logo.status, 200);
  const l = await fetch(base + (await logo.json()).logo);
  assert.equal(l.headers.get('content-type'), 'image/png');
  assert.equal(Buffer.from(await l.arrayBuffer()).length, png.length);

  const b2 = (await appel('GET', '/api/biens', { jeton: ali.jeton, espace: esp })).corps.find(b => b.reference === 'B2');
  const dep = await envoi('/api/depenses', 'justificatif', ali, { bien_id: b2.id, categorie: 'Ménage', montant: '2500' });
  assert.equal(dep.status, 201);
  const id = (await dep.json()).id;
  const lire = (qui, espace) => fetch(`${base}/api/fichiers/justificatif/${id}`, { headers: { Authorization: 'Bearer ' + qui.jeton, 'X-Espace': espace } });
  assert.equal((await lire(issa, esp)).status, 200);
  assert.equal((await lire(paul, paul.espaces[0].id)).status, 404);
  // Le reçu PDF intègre le logo sans erreur.
  const p = (await appel('GET', '/api/paiements', { jeton: issa.jeton, espace: esp })).corps[0];
  const pdf = await fetch(`${base}/api/paiements/${p.id}/recu.pdf`, { headers: { Authorization: 'Bearer ' + issa.jeton, 'X-Espace': esp } });
  assert.equal(pdf.status, 200);
});

test('mise en route d\u2019un espace vide : site, lot de biens, gérant, mot de passe', async () => {
  const admin = await connecter('70000000');
  const cree = await appel('POST', '/api/plateforme/bailleurs', { jeton: admin.jeton, corps: { bailleur: { nom: 'Résidence Test' }, proprietaire: { nom: 'Test Proprio', telephone: '70999999', mot_de_passe: 'provisoire1' } } });
  assert.equal(cree.statut, 201);
  assert.equal(cree.corps.essai_fin, new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10));
  const proprio = (await appel('POST', '/api/auth/connexion', { corps: { identifiant: '70999999', mot_de_passe: 'provisoire1' } })).corps;
  const esp = proprio.espaces[0].id;
  const o = { jeton: proprio.jeton, espace: esp };
  let etat = (await appel('GET', '/api/mise-en-route', o)).corps;
  assert.equal(etat.pret, false);
  const site = (await appel('POST', '/api/sites', { ...o, corps: { nom: 'Site A' } })).corps;
  const lot = await appel('POST', '/api/biens/lot', { ...o, corps: { site_id: site.id, prefixe: 'V', debut: 1, fin: 5, prix: 25000 } });
  assert.deepEqual(lot.corps, { crees: 5, ignores: 0 });
  assert.equal((await appel('POST', '/api/biens/lot', { ...o, corps: { site_id: site.id, prefixe: 'V', debut: 4, fin: 6, prix: 25000 } })).corps.crees, 1);
  etat = (await appel('GET', '/api/mise-en-route', o)).corps;
  assert.equal(etat.pret, true);
  assert.equal(etat.compte.biens, 6);
  // Un site qui contient des biens ne se supprime pas ; un bien sans historique, si.
  assert.equal((await appel('DELETE', '/api/sites/' + site.id, o)).statut, 409);
  const v6 = (await appel('GET', '/api/biens', o)).corps.find(b => b.reference === 'V6');
  assert.equal((await appel('DELETE', '/api/biens/' + v6.id, o)).statut, 200);
  // Gérant ajouté puis mot de passe réinitialisé par le propriétaire.
  const m = (await appel('POST', '/api/membres', { ...o, corps: { nom: 'Gérant Test', telephone: '70888888', mot_de_passe: 'motdepasse1', role: 'gerant' } })).corps;
  assert.equal((await appel('POST', `/api/membres/${m.id}/mot-de-passe`, { ...o, corps: { mot_de_passe: 'nouveau-mdp' } })).statut, 200);
  assert.ok((await appel('POST', '/api/auth/connexion', { corps: { identifiant: '70888888', mot_de_passe: 'nouveau-mdp' } })).corps.jeton);
  // Mariam travaille pour deux bailleurs : seul elle-même peut changer son mot de passe.
  const issa = await connecter('70111111');
  const membres = (await appel('GET', '/api/membres', { jeton: issa.jeton, espace: issa.espaces[0].id })).corps;
  const mariam = membres.find(x => x.Utilisateur.telephone === '70333333');
  assert.equal((await appel('POST', `/api/membres/${mariam.id}/mot-de-passe`, { jeton: issa.jeton, espace: issa.espaces[0].id, corps: { mot_de_passe: 'piratage1' } })).statut, 409);
  // L'administration Loka redonne un mot de passe au propriétaire.
  assert.equal((await appel('POST', `/api/plateforme/bailleurs/${esp}/mot-de-passe`, { jeton: admin.jeton, corps: { mot_de_passe: 'retrouve-1' } })).statut, 200);
  assert.ok((await appel('POST', '/api/auth/connexion', { corps: { identifiant: '70999999', mot_de_passe: 'retrouve-1' } })).corps.jeton);
});

test('un bailleur crée lui-même son espace après vérification de son e-mail', async () => {
  const { envoyes } = require('../src/services/courriel');
  const dernierCode = () => envoyes.at(-1).texte.match(/\b(\d{6})\b/)[1];
  const formulaire = { nom: 'Aïcha Test', entreprise: 'Villas du Lac', ville: 'Koudougou', telephone: '70 77 77 77', email: 'Aicha@Exemple.test', mot_de_passe: 'mon-mot-de-passe' };
  // Numéro ou adresse déjà utilisés : refus, rien n'est envoyé.
  assert.equal((await appel('POST', '/api/comptes/inscription', { corps: { ...formulaire, telephone: '70111111' } })).statut, 409);
  const demande = await appel('POST', '/api/comptes/inscription', { corps: formulaire });
  assert.equal(demande.statut, 201);
  assert.equal(envoyes.at(-1).a, 'aicha@exemple.test');
  assert.match(envoyes.at(-1).sujet, /^Loka · /);
  const code = dernierCode();
  // Tant que le code n'est pas saisi, aucun compte n'existe.
  assert.equal((await appel('POST', '/api/auth/connexion', { corps: { identifiant: '70777777', mot_de_passe: formulaire.mot_de_passe } })).statut, 401);
  // Les essais ratés sont comptés, même si la requête échoue.
  const faux = code === '000000' ? '111111' : '000000';
  assert.match((await appel('POST', '/api/comptes/inscription/verifier', { corps: { id: demande.corps.id, code: faux } })).corps.message, /Encore 4 essais/);
  assert.match((await appel('POST', '/api/comptes/inscription/verifier', { corps: { id: demande.corps.id, code: faux } })).corps.message, /Encore 3 essais/);
  const ok = await appel('POST', '/api/comptes/inscription/verifier', { corps: { id: demande.corps.id, code } });
  assert.equal(ok.statut, 201);
  assert.ok(ok.corps.jeton);
  assert.equal(ok.corps.espaces.length, 1);
  assert.equal(ok.corps.espaces[0].role, 'proprietaire');
  assert.equal(ok.corps.espaces[0].statut, 'essai');
  assert.match(envoyes.at(-1).sujet, /Nouvel espace : Villas du Lac/);
  // Le code ne sert qu'une fois ; l'espace reste en essai et l'administration le voit.
  assert.equal((await appel('POST', '/api/comptes/inscription/verifier', { corps: { id: demande.corps.id, code } })).statut, 400);
  const admin = await connecter('70000000');
  const b = (await appel('GET', '/api/plateforme/bailleurs', { jeton: admin.jeton })).corps.find(x => x.nom === 'Villas du Lac');
  assert.equal(b.origine, 'inscription');
  assert.equal(b.essai_fin, new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10));
  assert.equal(b.proprietaire.telephone, '70777777');
  // Il est seul dans son espace : il ne voit aucun bien d'un autre bailleur.
  const o = { jeton: ok.corps.jeton, espace: ok.corps.espaces[0].id };
  assert.deepEqual((await appel('GET', '/api/biens', o)).corps, []);
  // Une seconde inscription avec la même adresse est refusée.
  assert.equal((await appel('POST', '/api/comptes/inscription', { corps: { ...formulaire, telephone: '70666666' } })).statut, 409);
});

test('mot de passe oublié : code par e-mail, sans révéler si l’adresse existe', async () => {
  const { envoyes } = require('../src/services/courriel');
  const avant = envoyes.length;
  const inconnu = await appel('POST', '/api/comptes/mot-de-passe/oubli', { corps: { email: 'personne@exemple.test' } });
  assert.equal(inconnu.statut, 200);
  assert.ok(inconnu.corps.id);
  assert.equal(envoyes.length, avant);
  const demande = await appel('POST', '/api/comptes/mot-de-passe/oubli', { corps: { email: 'issa@kabore.test' } });
  assert.equal(envoyes.length, avant + 1);
  assert.equal((await appel('POST', '/api/comptes/verification/renvoyer', { corps: { id: demande.corps.id } })).statut, 200);
  const code = envoyes.at(-1).texte.match(/\b(\d{6})\b/)[1];
  assert.equal((await appel('POST', '/api/comptes/mot-de-passe/reinitialiser', { corps: { id: demande.corps.id, code, mot_de_passe: 'court' } })).statut, 400);
  const ok = await appel('POST', '/api/comptes/mot-de-passe/reinitialiser', { corps: { id: demande.corps.id, code, mot_de_passe: 'nouveau-secret' } });
  assert.equal(ok.statut, 200);
  const issa = (await appel('POST', '/api/auth/connexion', { corps: { identifiant: '70111111', mot_de_passe: 'nouveau-secret' } })).corps;
  assert.ok(issa.jeton);
  // On remet le mot de passe de démonstration pour les tests suivants.
  assert.equal((await appel('PATCH', '/api/auth/moi/mot-de-passe', { jeton: issa.jeton, corps: { actuel: 'nouveau-secret', nouveau: MOT_DE_PASSE } })).statut, 200);
});

test('photos d’un bien : gérant du site, 6 au plus, protégées par espace et par site', async () => {
  const issa = await connecter('70111111');
  const ali = await connecter('70222222');
  const mariam = await connecter('70333333');
  const paul = await connecter('70555555');
  const esp = issa.espaces[0].id;
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  const b2 = (await appel('GET', '/api/biens', { jeton: ali.jeton, espace: esp })).corps.find(b => b.reference === 'B2');
  assert.deepEqual(b2.photos, []);
  const ajouter = (qui, espace = esp) => {
    const f = new FormData();
    f.append('photo', new Blob([png], { type: 'image/png' }), 'villa.png');
    return fetch(`${base}/api/biens/${b2.id}/photos`, { method: 'POST', headers: { Authorization: 'Bearer ' + qui.jeton, 'X-Espace': espace }, body: f });
  };
  const lire = (qui, photo, espace = esp) => fetch(`${base}/api/fichiers/photo/${b2.id}/${photo}`, { headers: { Authorization: 'Bearer ' + qui.jeton, 'X-Espace': espace } });
  for (let i = 0; i < 6; i++) assert.equal((await ajouter(ali)).status, 201);
  assert.equal((await ajouter(ali)).status, 409);
  const photos = (await appel('GET', '/api/biens', { jeton: issa.jeton, espace: esp })).corps.find(b => b.id === b2.id).photos;
  assert.equal(photos.length, 6);
  assert.equal((await lire(issa, photos[0])).headers.get('content-type'), 'image/png');
  // Mariam gère d'autres sites de ce bailleur, Paul est un autre bailleur : ni l'un ni l'autre ne voit ces photos.
  assert.equal((await lire(mariam, photos[0], mariam.espaces.find(e => e.id === esp).id)).status, 404);
  assert.equal((await ajouter(mariam)).status, 404);
  assert.equal((await lire(paul, photos[0], paul.espaces[0].id)).status, 404);
  // Couverture et suppression.
  const c = await appel('POST', `/api/biens/${b2.id}/photos/${photos[3]}/couverture`, { jeton: issa.jeton, espace: esp });
  assert.equal(c.corps.photos[0], photos[3]);
  const s = await appel('DELETE', `/api/biens/${b2.id}/photos/${photos[3]}`, { jeton: ali.jeton, espace: esp });
  assert.equal(s.corps.photos.length, 5);
  assert.equal((await lire(issa, photos[3])).status, 404);
});

test('fichier clients : reconnaissance par numéro, bilan, signalement réservé au propriétaire', async () => {
  const issa = await connecter('70111111');
  const ali = await connecter('70222222');
  const paul = await connecter('70555555');
  const esp = issa.espaces[0].id;
  const o = { jeton: ali.jeton, espace: esp };
  // Liste avec bilan : la démo contient des clients ayant séjourné.
  const liste = (await appel('GET', '/api/clients', { jeton: issa.jeton, espace: esp })).corps;
  assert.ok(liste.length >= 5);
  assert.ok(liste.every(c => c.bilan && typeof c.bilan.paye === 'number'));
  // Un client ressaisi avec le même numéro (écrit autrement) n'est pas dupliqué.
  const biens = (await appel('GET', '/api/biens', o)).corps;
  const b1 = biens.find(b => b.reference === 'B1');
  const loin = (j) => new Date(Date.now() + j * 864e5).toISOString().slice(0, 10);
  const r1 = await appel('POST', '/api/reservations', { ...o, corps: { bien_id: b1.id, client: { nom: 'Yacouba Test', telephone: '70 12 34 56' }, arrivee: loin(60), depart: loin(62) } });
  assert.equal(r1.statut, 201);
  const r2 = await appel('POST', '/api/reservations', { ...o, corps: { bien_id: b1.id, client: { nom: 'Yacouba T.', telephone: '+226 70123456' }, arrivee: loin(70), depart: loin(71) } });
  assert.equal(r2.statut, 201);
  assert.equal(r1.corps.client_id, r2.corps.client_id);
  const connu = (await appel('GET', '/api/clients/recherche?telephone=70123456', o)).corps;
  assert.equal(connu.nom, 'Yacouba Test');
  assert.equal(connu.bilan.a_venir, 2);
  assert.equal((await appel('GET', '/api/clients/recherche?telephone=79999999', o)).corps, null);
  // Fiche complète.
  const fiche = (await appel('GET', '/api/clients/' + connu.id, o)).corps;
  assert.equal(fiche.Reservations.length, 2);
  assert.ok(fiche.Reservations[0].Bien.reference);
  // Le gérant ne peut pas signaler ; le propriétaire si, et le gérant le voit.
  assert.equal((await appel('PATCH', '/api/clients/' + connu.id, { ...o, corps: { statut: 'a_eviter' } })).statut, 403);
  assert.equal((await appel('PATCH', '/api/clients/' + connu.id, { ...o, corps: { notes: 'Arrive tard le soir' } })).statut, 200);
  assert.equal((await appel('PATCH', '/api/clients/' + connu.id, { jeton: issa.jeton, espace: esp, corps: { statut: 'a_eviter', motif_alerte: 'Chèque sans provision' } })).statut, 200);
  const vu = (await appel('GET', '/api/clients/recherche?telephone=70123456', o)).corps;
  assert.equal(vu.statut, 'a_eviter');
  assert.equal(vu.notes, 'Arrive tard le soir');
  // Un autre bailleur ne voit pas ce client.
  assert.equal((await appel('GET', '/api/clients/' + connu.id, { jeton: paul.jeton, espace: paul.espaces[0].id })).statut, 404);
  assert.equal((await appel('GET', '/api/clients/recherche?telephone=70123456', { jeton: paul.jeton, espace: paul.espaces[0].id })).corps, null);
});

test('place de marché : recherche publique tous bailleurs, disponibilité réelle, demande puis acceptation', async () => {
  const pub = (chemin, corps) => appel(corps ? 'POST' : 'GET', '/api/public' + chemin, corps ? { corps } : {});
  // Deux bailleurs publient : la recherche les mélange, sans compte.
  const lieux = (await pub('/lieux')).corps;
  assert.deepEqual(lieux.map(l => l.ville).sort(), ['Bobo-Dioulasso', 'Ouagadougou']);
  const tous = (await pub('/recherche')).corps;
  assert.ok(tous.some(v => v.lieu.ville === 'Bobo-Dioulasso') && tous.some(v => v.lieu.ville === 'Ouagadougou'));
  assert.ok(!tous.some(v => v.lieu.site === 'Ouaga 2000' && v.prix_nuit === 25000 && v.equipements.length === 0), 'les villas non publiées restent cachées');
  // Aucune donnée interne exposée.
  assert.ok(tous.every(v => !('compteur_electrique' in v) && !('reference' in v) && !('bailleur_id' in v)));
  // Critères du client : piscine et 6 personnes → C1 seulement ; autour de Ouaga 2000 → pas de Bobo.
  const piscine = (await pub('/recherche?equipements=piscine&personnes=6')).corps;
  assert.equal(piscine.length, 1);
  assert.equal(piscine[0].chambres, 4);
  const proches = (await pub('/recherche?lat=12.32&lng=-1.51&rayon=10')).corps;
  assert.ok(proches.length && proches.every(v => v.lieu.ville === 'Ouagadougou' && v.distance_km <= 10));
  assert.ok(proches[0].distance_km <= proches.at(-1).distance_km);
  // Disponibilité : une villa déjà réservée sur ces dates disparaît des résultats.
  const jour = (j) => new Date(Date.now() + j * 864e5).toISOString().slice(0, 10);
  const c1 = piscine[0];
  assert.ok((await pub(`/recherche?equipements=piscine&arrivee=${jour(40)}&depart=${jour(43)}`)).corps.some(v => v.id === c1.id));
  // Le client demande C1 ; la demande arrive chez le bailleur, en attente.
  const demande = await pub('/demandes', { bien_id: c1.id, arrivee: jour(40), depart: jour(43), nom: 'Client Place', telephone: '+226 76 54 32 10', message: 'Arrivée vers 18 h' });
  assert.equal(demande.statut, 201);
  assert.equal(demande.corps.total, 3 * 45000);
  let suivi = (await pub('/demandes/' + demande.corps.code)).corps;
  assert.equal(suivi.statut, 'en_attente');
  assert.equal(suivi.contact, null);
  const issa = await connecter('70111111');
  const paul = await connecter('70555555');
  const o = { jeton: issa.jeton, espace: issa.espaces[0].id };
  const attente = (await appel('GET', '/api/demandes?statut=en_attente', o)).corps;
  const d = attente.find(x => x.code === demande.corps.code);
  assert.ok(d);
  assert.equal((await appel('GET', '/api/demandes', { jeton: paul.jeton, espace: paul.espaces[0].id })).corps.length, 0);
  // Acceptée : réservation confirmée, d'origine « place de marché » ; le client voit le contact.
  const acc = await appel('POST', `/api/demandes/${d.id}/accepter`, o);
  assert.equal(acc.statut, 200);
  assert.equal(acc.corps.reservation.source, 'place_de_marche');
  assert.equal((await appel('POST', `/api/demandes/${d.id}/accepter`, o)).statut, 409);
  suivi = (await pub('/demandes/' + demande.corps.code)).corps;
  assert.equal(suivi.statut, 'acceptee');
  assert.ok(suivi.contact.telephone);
  // Les dates sont maintenant prises : C1 n'apparaît plus, et une nouvelle demande est refusée d'emblée.
  assert.ok(!(await pub(`/recherche?equipements=piscine&arrivee=${jour(41)}&depart=${jour(42)}`)).corps.some(v => v.id === c1.id));
  assert.equal((await pub('/demandes', { bien_id: c1.id, arrivee: jour(41), depart: jour(42), nom: 'Autre', telephone: '70000001' })).statut, 409);
  // Le client devient un client connu du bailleur.
  assert.equal((await appel('GET', '/api/clients/recherche?telephone=76543210', o)).corps.nom, 'Client Place');
});
