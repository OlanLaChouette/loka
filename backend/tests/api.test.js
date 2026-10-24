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
  assert.equal(kabore.abonnement_mensuel, 45000);
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
