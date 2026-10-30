// Captures d'écran du guide : l'application locale (données de démonstration), format téléphone.
// Usage : node guide/captures.mjs   (API sur 4100, site sur 5174, base remplie par « npm run db:seed »)
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const ici = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(ici, '../video/package.json'));
const puppeteer = require('puppeteer-core');
const { MOT_DE_PASSE } = require('../backend/src/scripts/comptes-demo.js');

const SITE = process.env.SITE || 'http://localhost:5174';
const SORTIE = path.join(ici, 'captures');
fs.mkdirSync(SORTIE, { recursive: true });
const CHROME = path.join(ici, '../video/.navigateurs/chrome-headless-shell/win64-131.0.6778.204/chrome-headless-shell-win64/chrome-headless-shell.exe');

const navigateur = await puppeteer.launch({ executablePath: CHROME, headless: 'shell', userDataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'loka-guide-')) });
const pause = (ms) => new Promise(r => setTimeout(r, ms));

async function session(telephone) {
  const page = await navigateur.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.goto(SITE + '/connexion', { waitUntil: 'networkidle0' });
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('loka-theme', 'clair'); });
  await page.goto(SITE + '/connexion', { waitUntil: 'networkidle0' });
  return page;
}
async function connecter(page, telephone) {
  const champs = await page.$$('input');
  await champs[0].type(telephone);
  await champs[1].type(MOT_DE_PASSE);
  await page.keyboard.press('Enter');
  await page.waitForNavigation({ waitUntil: 'networkidle0' }).catch(() => {});
  await pause(800);
}
async function aller(page, chemin) { await page.goto(SITE + chemin, { waitUntil: 'networkidle0' }); await pause(700); }
async function cliquer(page, texte) {
  const ok = await page.evaluate((t) => {
    const el = [...document.querySelectorAll('button, a, label')].find(b => b.textContent.trim().startsWith(t) && b.offsetParent !== null);
    if (el) el.click(); return !!el;
  }, texte);
  if (!ok) console.warn('introuvable :', texte);
  await pause(700);
}
async function capture(page, nom, pleine = false) {
  await page.screenshot({ path: path.join(SORTIE, nom + '.png'), fullPage: pleine });
  console.log('✓', nom);
}

const nouvelleSession = async (telephone) => { const page = await session(); await connecter(page, telephone); return page; };

// Propriétaire
let p = await session();
await capture(p, '01-connexion');
await connecter(p, '70111111');
await capture(p, '02a-apercu-demarrage');
await cliquer(p, 'Masquer');
await capture(p, '02-apercu');
await p.evaluate(() => window.scrollTo(0, 760)); await pause(400);
await capture(p, '02b-apercu-bas');
await p.evaluate(() => window.scrollTo(0, 99999)); await pause(400);
await capture(p, '02c-apercu-fil');
await p.click('.bouton-menu'); await pause(600);
await capture(p, '03-menu');
await aller(p, '/biens'); await capture(p, '04-biens');
await cliquer(p, 'Plusieurs biens'); await capture(p, '05-lot');
await aller(p, '/reservations'); await capture(p, '06-planning');
await cliquer(p, '+ Nouvelle réservation'); await capture(p, '07-nouvelle-resa');
await aller(p, '/argent'); await capture(p, '08-encaissements');
await aller(p, '/argent?onglet=depenses'); await capture(p, '09-depenses');
await aller(p, '/argent?onglet=charges'); await capture(p, '10-charges');
await aller(p, '/baux'); await capture(p, '11-baux');
await aller(p, '/membres'); await capture(p, '12-membres');
await cliquer(p, '+ Ajouter un membre'); await capture(p, '13-ajout-membre');
await aller(p, '/parametres'); await capture(p, '14-entreprise');
await p.close();

// Photos d'exemple sur la villa A2 (galerie et envoi au client)
{
  const API = 'http://localhost:4100/api';
  const s = await (await fetch(API + '/auth/connexion', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifiant: '70111111', mot_de_passe: MOT_DE_PASSE }) })).json();
  const h = { Authorization: 'Bearer ' + s.jeton, 'X-Espace': s.espaces[0].id };
  const a2 = (await (await fetch(API + '/biens', { headers: h })).json()).find(b => b.reference === 'A2');
  for (const n of a2.photos.length ? [] : ['facade', 'salon', 'chambre', 'piscine']) {
    const f = new FormData();
    f.append('photo', new Blob([fs.readFileSync(path.join(ici, '../tutos/assets/villas', n + '.jpg'))], { type: 'image/jpeg' }), n + '.jpg');
    await fetch(`${API}/biens/${a2.id}/photos`, { method: 'POST', headers: h, body: f });
  }
}

// Gérant
p = await session();
await connecter(p, '70222222');
await capture(p, '15-terrain');
await p.click('[aria-label="Photos de A2"]'); await pause(1500); await capture(p, '21-photos');
await p.keyboard.press('Escape'); await pause(500);
await cliquer(p, 'Réserver'); await capture(p, '16-gerant-resa');
await aller(p, '/terrain');
await cliquer(p, 'Encaisser'); await capture(p, '17-choix-encaisser');
const bouton = await p.$('.modale .liste-lignes button');
if (bouton) { await bouton.click(); await pause(700); await capture(p, '18-encaisser'); }
await aller(p, '/terrain');
await p.click('[aria-label="Noter une dépense"]'); await pause(700);
await capture(p, '19-depense');
await p.close();

// Nouveau bailleur (espace en essai, mise en route)
p = await session();
await connecter(p, '70555555');
await capture(p, '20-mise-en-route');
await p.close();

// Règles de séjour et place de marché : séjours et demande préparés par l'API de démonstration.
{
  const API = 'http://localhost:4100/api';
  const jour = (d) => new Date(Date.now() + d * 864e5).toISOString().slice(0, 10);
  const session = await (await fetch(API + '/auth/connexion', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifiant: '70111111', mot_de_passe: MOT_DE_PASSE }) })).json();
  const h = { Authorization: 'Bearer ' + session.jeton, 'X-Espace': session.espaces[0].id, 'Content-Type': 'application/json' };
  const post = async (c, corps, entetes = h) => (await fetch(API + c, { method: 'POST', headers: entetes, body: JSON.stringify(corps || {}) })).json();
  const biens = await (await fetch(API + '/biens', { headers: h })).json();
  const id = (ref) => biens.find(b => b.reference === ref).id;
  const parti = await post('/reservations', { bien_id: id('B1'), arrivee: jour(-3), depart: jour(-1), client: { nom: 'Salif Zoungrana', telephone: '70551122' } });
  await post('/paiements', { reservation_id: parti.id, montant: parti.total, moyen: 'especes' });
  await post(`/reservations/${parti.id}/cles`);
  await post('/reservations', { bien_id: id('B1'), arrivee: jour(-1), depart: jour(1), client: { nom: 'Moussa Diallo', telephone: '70551133' } });
  const arrivee = jour(new Date().getUTCHours() >= 15 ? 1 : 0);
  const tardive = await post('/reservations', { bien_id: id('K3'), arrivee, depart: new Date(new Date(arrivee).getTime() + 3 * 864e5).toISOString().slice(0, 10), client: { nom: 'Fatim Ouédraogo', telephone: '70551144' } });
  await post('/paiements', { reservation_id: tardive.id, montant: 30000, moyen: 'mobile_money', reference: 'OM-3010-7712' });
  const json = { 'Content-Type': 'application/json' };
  const { code } = await post('/public/demandes', { bien_id: id('A2'), arrivee: jour(20), depart: jour(22), nom: 'Rokia Sanou', telephone: '70667788', message: 'Arrivée vers 17 h, deux personnes.' }, json);
  const ouvrirSejour = async (page, nom) => { await page.evaluate((n) => [...document.querySelectorAll('.sejour')].find(b => b.textContent.includes(n)).click(), nom); await pause(1000); };
  const defilerVers = async (page, css) => { await page.evaluate((c) => document.querySelector(c).scrollIntoView({ block: 'center' }), css); await pause(500); };

  p = await nouvelleSession('70111111');
  await aller(p, '/parametres');
  await p.evaluate(() => [...document.querySelectorAll('h2')].find(t => t.textContent.includes('Règles de séjour')).scrollIntoView({ block: 'start' })); await pause(500);
  await capture(p, '22-regles');
  await aller(p, '/biens');
  await p.evaluate(() => [...document.querySelectorAll('tr')].find(l => l.querySelector('td')?.textContent === 'A2').querySelector('button:nth-last-child(1)').click()); await pause(800);
  await defilerVers(p, '.publication');
  await capture(p, '23-publication');
  await aller(p, '/reservations');
  await ouvrirSejour(p, 'Moussa Diallo'); await capture(p, '24-cles');
  await aller(p, '/reservations');
  await ouvrirSejour(p, 'Salif Zoungrana'); await capture(p, '25-depart');
  await aller(p, '/reservations');
  await ouvrirSejour(p, 'Fatim Ouédraogo');
  await cliquer(p, 'Annuler…'); await pause(800); await capture(p, '26-annulation');
  await cliquer(p, 'Nous annulons'); await pause(800); await capture(p, '27-nous-annulons');
  await p.close();

  p = await nouvelleSession('70222222');
  await aller(p, '/terrain'); await capture(p, '28-demande');
  p.once('dialog', d => d.dismiss());
  await cliquer(p, 'Accepter'); await pause(800);
  await aller(p, `/demande/${code}`);
  await defilerVers(p, '.mc-paiement'); await capture(p, '29-suivi');
  await aller(p, '/villas'); await capture(p, '31-villas');
  await aller(p, `/villas/${id('A2')}`);
  await defilerVers(p, '.mc-regles'); await capture(p, '32-fiche');
  await p.close();

  // Avis : le lien n'existe qu'après le départ enregistré.
  const avis = await post(`/reservations/${parti.id}/depart`);
  p = await nouvelleSession('70111111');
  await aller(p, '/avis/' + avis.code_avis);
  await p.click('[aria-label="5 étoiles"]'); await pause(400);
  await capture(p, '33-avis');
  await p.close();
}

await navigateur.close();
