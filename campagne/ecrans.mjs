// Écrans de l'application pour la campagne : données de démonstration habillées (vraies photos, avis, logo),
// puis captures en très haute définition (téléphone 390 × 844, densité 3) dans campagne/ecrans/.
// Usage : node campagne/ecrans.mjs   (site 5174, API 4100, base « npm run db:seed » fraîche)
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ici = path.dirname(fileURLToPath(import.meta.url));
const racine = path.join(ici, '..');
const require = createRequire(path.join(racine, 'video/package.json'));
const puppeteer = require('puppeteer-core');
const { MOT_DE_PASSE } = require(path.join(racine, 'backend/src/scripts/comptes-demo.js'));
const API = 'http://localhost:4100/api';
const SITE = 'http://localhost:5174';
const SORTIE = path.join(ici, 'ecrans');
fs.mkdirSync(SORTIE, { recursive: true });
const pause = (ms) => new Promise(r => setTimeout(r, ms));
const jour = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const json = (r) => r.json();

async function session(tel) {
  const s = await json(await fetch(API + '/auth/connexion', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifiant: tel, mot_de_passe: MOT_DE_PASSE }) }));
  const h = { Authorization: 'Bearer ' + s.jeton, 'X-Espace': s.espaces[0].id };
  return { h, H: { ...h, 'Content-Type': 'application/json' } };
}
const envoyerFichier = (url, h, champ, fichier) => {
  const f = new FormData();
  f.append(champ, new Blob([fs.readFileSync(fichier)], { type: fichier.endsWith('png') ? 'image/png' : 'image/jpeg' }), path.basename(fichier));
  return fetch(url, { method: 'POST', headers: h, body: f });
};

// ---------- Habillage des données ----------
const issa = await session('70111111');
const paul = await session('70555555');
await envoyerFichier(API + '/profil/logo', issa.h, 'logo', path.join(ici, 'photos/logo-residence-demo.png'));
await fetch(API + '/profil', { method: 'PATCH', headers: issa.H, body: JSON.stringify({ numero_paiement: '+226 70 11 22 33', titulaire_paiement: 'Issa Kaboré' }) });
const PHOTOS = {
  C1: ['01-facade', '02-salon', '10-chambre', '12-cuisine'], B2: ['03-villa-palmiers', '11-chambre-chaude', '02-salon'], A1: ['05-villa-crepuscule', '10-chambre'],
  A2: ['09-villa-piscine-jour', '11-chambre-chaude'], B1: ['04-villa-blanche-piscine', '12-cuisine'], C3: ['06-villa-tropicale-soir', '10-chambre'], K1: ['07-villa-nuit', '11-chambre-chaude'], K2: ['08-piscine-nuit'],
};
const biens = await json(await fetch(API + '/biens', { headers: issa.h }));
for (const [ref, liste] of Object.entries(PHOTOS)) {
  const b = biens.find(x => x.reference === ref);
  if (!b || b.photos.length) continue;
  for (const n of liste) await envoyerFichier(`${API}/biens/${b.id}/photos`, issa.h, 'photo', path.join(ici, 'televersement', n + '.jpg'));
}
const w1 = (await json(await fetch(API + '/biens', { headers: paul.h }))).find(x => x.reference === 'W1');
if (w1 && !w1.photos.length) await envoyerFichier(`${API}/biens/${w1.id}/photos`, paul.h, 'photo', path.join(ici, 'televersement', '08-piscine-nuit.jpg'));

// Séjours passés et avis vérifiés (5, 5, 4, 5).
await fetch(API + '/profil', { method: 'PATCH', headers: issa.H, body: JSON.stringify({ heure_arrivee: '00:00', heure_depart: '23:59' }) });
const AVIS = [[5, 'Villa impeccable, accueil chaleureux et climatisation parfaite. Nous reviendrons !', 'Aïcha'], [5, 'Réservé en deux minutes, confirmé sur WhatsApp. Très pro.', 'Moussa'], [4, 'Très bon séjour, quartier calme. Wi-Fi un peu lent le soir.', 'Jean'], [5, 'La piscine le soir, un vrai bonheur. Gérant très disponible.', 'Fatim']];
const k3 = biens.find(x => x.reference === 'K3');
for (const [i, [note, texte, auteur]] of AVIS.entries()) {
  const r = await json(await fetch(API + '/reservations', { method: 'POST', headers: issa.H, body: JSON.stringify({ bien_id: k3.id, client: { nom: auteur + ' Client', telephone: '7650000' + i }, arrivee: jour(-40 - i * 3), depart: jour(-39 - i * 3) }) }));
  if (!r.id) continue;
  await fetch(API + '/paiements', { method: 'POST', headers: issa.H, body: JSON.stringify({ reservation_id: r.id, montant: r.total, moyen: 'mobile_money', reference: 'OM-' + i }) });
  await fetch(`${API}/reservations/${r.id}/cles`, { method: 'POST', headers: issa.H });
  const parti = await json(await fetch(`${API}/reservations/${r.id}/depart`, { method: 'POST', headers: issa.H }));
  await fetch(`${API}/public/avis/${parti.code_avis}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ note, commentaire: texte, auteur }) });
}
await fetch(API + '/profil', { method: 'PATCH', headers: issa.H, body: JSON.stringify({ heure_arrivee: '15:00', heure_depart: '12:00' }) });
const page = (await json(await fetch(API + '/profil', { headers: issa.h }))).page;
const c1 = biens.find(x => x.reference === 'C1');

// ---------- Captures ----------
const navigateur = await puppeteer.launch({ executablePath: path.join(racine, 'video/.navigateurs/chrome-headless-shell/win64-131.0.6778.204/chrome-headless-shell-win64/chrome-headless-shell.exe'), headless: 'shell', args: ['--lang=fr-FR'] });
async function telephone(connexion) {
  const p = await (await navigateur.createBrowserContext()).newPage();
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  p.on('pageerror', e => console.log('ERREUR', e.message));
  await p.setExtraHTTPHeaders({ 'Accept-Language': 'fr-FR,fr;q=0.9' });
  if (connexion) {
    await p.goto(SITE + '/connexion', { waitUntil: 'networkidle0' });
    const ins = await p.$$('input'); await ins[0].type(connexion); await ins[1].type(MOT_DE_PASSE);
    await p.keyboard.press('Enter'); await p.waitForNavigation({ waitUntil: 'networkidle0' }).catch(() => {}); await pause(800);
    await p.evaluate(() => { try { localStorage.setItem('loka-mise-en-route-masquee-' + localStorage.getItem('loka-espace'), '1'); } catch { /* ignoré */ } });
  }
  return p;
}
const capture = async (p, nom) => { await pause(500); await p.screenshot({ path: path.join(SORTIE, nom + '.png') }); console.log('✓', nom); };
const defilerVers = (p, sel, bloc = 'start') => p.evaluate((s, b) => document.querySelector(s)?.scrollIntoView({ block: b }), sel, bloc);

// Client
const client = await telephone();
const recherche = `${SITE}/villas?ville=Ouagadougou&arrivee=${jour(9)}&depart=${jour(11)}`;
await client.goto(SITE + '/villas', { waitUntil: 'networkidle0' }); await pause(1200);
await capture(client, 'client-accueil');
await client.goto(recherche, { waitUntil: 'networkidle0' }); await pause(1500);
await defilerVers(client, '.mc-compte'); await client.evaluate(() => window.scrollBy(0, -12));
await capture(client, 'client-resultats');
await client.evaluate(() => window.scrollBy(0, 420)); await capture(client, 'client-resultats-2');
await client.goto(`${SITE}/villas/${c1.id}?arrivee=${jour(9)}&depart=${jour(11)}`, { waitUntil: 'networkidle0' }); await pause(1500);
await capture(client, 'client-villa');
await defilerVers(client, '.mc-liste-eq', 'center'); await capture(client, 'client-villa-details');
await defilerVers(client, '.mc-avis'); await capture(client, 'client-villa-avis');
const champ = (lib) => client.evaluateHandle((l) => [...document.querySelectorAll('.mc-demande label')].find(x => x.textContent.startsWith(l)).querySelector('input, textarea'), lib);
await (await champ('Votre nom')).type('Rasmata Ouédraogo');
await (await champ('Votre téléphone')).type('76 21 43 65');
await (await champ('Message')).type('Nous serons 6, arrivée vers 18 h.');
await defilerVers(client, '.mc-demande'); await capture(client, 'client-demande');
await client.evaluate(() => document.querySelector('.mc-demande button[type=submit]').click()); await pause(1500);
await capture(client, 'client-envoyee');
const code = await client.evaluate(() => document.querySelector('.mc-code b')?.textContent);
// Le gérant accepte ; le client voit l'acompte à envoyer
const ali = await telephone('70222222');
await ali.goto(SITE + '/terrain', { waitUntil: 'networkidle0' }); await pause(1200);
await capture(ali, 'gerant-demande');
await ali.evaluate(() => { window.confirm = () => false; [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Accepter').click(); }); await pause(1500);
await client.goto(`${SITE}/demande/${code}`, { waitUntil: 'networkidle0' }); await pause(1200);
await capture(client, 'client-acompte');
await client.type('.mc-paiement input', 'PP241105.1532.C12345'); await client.click('.mc-paiement button[type=submit]'); await pause(1200);
await ali.goto(SITE + '/terrain', { waitUntil: 'networkidle0' }); await pause(1000);
await capture(ali, 'gerant-acompte');
await ali.evaluate(() => [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Acompte reçu')?.click()); await pause(1500);
await client.goto(`${SITE}/demande/${code}`, { waitUntil: 'networkidle0' }); await pause(1500);
await capture(client, 'client-confirme');
await client.goto(`${SITE}/r/${page}`, { waitUntil: 'networkidle0' }); await pause(1500);
await capture(client, 'residence');
// Bailleur
const prop = await telephone('70111111');
await prop.goto(SITE + '/', { waitUntil: 'networkidle0' }); await pause(1500);
await capture(prop, 'bailleur-apercu');
await prop.evaluate(() => window.scrollTo(0, 760)); await capture(prop, 'bailleur-apercu-2');
await prop.goto(SITE + '/reservations', { waitUntil: 'networkidle0' }); await pause(1200);
await capture(prop, 'bailleur-reservations');
await prop.evaluate(() => [...document.querySelectorAll('.sejour')].find(x => x.textContent.includes('Rasmata'))?.click()); await pause(1200);
await capture(prop, 'bailleur-sejour');
await prop.goto(SITE + '/biens', { waitUntil: 'networkidle0' }); await pause(800);
await prop.evaluate(() => document.querySelector('[aria-label="Photos de C1"]')?.click()); await pause(2500);
await capture(prop, 'bailleur-photos');
await prop.goto(SITE + '/clients', { waitUntil: 'networkidle0' }); await pause(1000);
await capture(prop, 'bailleur-clients');
await ali.goto(SITE + '/terrain', { waitUntil: 'networkidle0' }); await pause(1000);
await capture(ali, 'gerant-terrain');
await navigateur.close();
console.log('page', page, 'code', code);
