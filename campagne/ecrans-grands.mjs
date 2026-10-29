// Écrans tablette (820 × 1180) et ordinateur (1440 × 900) pour varier les appareils de la campagne.
// À lancer après campagne/ecrans.mjs (données habillées). Sortie : campagne/ecrans/tablette-*.png, ordi-*.png
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ici = path.dirname(fileURLToPath(import.meta.url));
const racine = path.join(ici, '..');
const require = createRequire(path.join(racine, 'video/package.json'));
const puppeteer = require('puppeteer-core');
const { MOT_DE_PASSE } = require(path.join(racine, 'backend/src/scripts/comptes-demo.js'));
const API = 'http://localhost:4100/api';
const SITE = 'http://localhost:5174';
const pause = (ms) => new Promise(r => setTimeout(r, ms));
const jour = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

const s = await (await fetch(API + '/auth/connexion', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifiant: '70111111', mot_de_passe: MOT_DE_PASSE }) })).json();
const h = { Authorization: 'Bearer ' + s.jeton, 'X-Espace': s.espaces[0].id };
const c1 = (await (await fetch(API + '/biens', { headers: h })).json()).find(b => b.reference === 'C1');
const page = (await (await fetch(API + '/profil', { headers: h })).json()).page;

const navigateur = await puppeteer.launch({ executablePath: path.join(racine, 'video/.navigateurs/chrome-headless-shell/win64-131.0.6778.204/chrome-headless-shell-win64/chrome-headless-shell.exe'), headless: 'shell', args: ['--lang=fr-FR'] });
async function appareil(largeur, hauteur, connexion) {
  const p = await (await navigateur.createBrowserContext()).newPage();
  const tactile = largeur < 1000;
  await p.setViewport({ width: largeur, height: hauteur, deviceScaleFactor: 2, isMobile: tactile, hasTouch: tactile });
  p.on('pageerror', e => console.log('ERREUR', e.message));
  if (connexion) {
    await p.goto(SITE + '/connexion', { waitUntil: 'networkidle0' });
    const ins = await p.$$('input'); await ins[0].type(connexion); await ins[1].type(MOT_DE_PASSE);
    await p.keyboard.press('Enter'); await p.waitForNavigation({ waitUntil: 'networkidle0' }).catch(() => {}); await pause(800);
    await p.evaluate(() => { try { localStorage.setItem('loka-mise-en-route-masquee-' + localStorage.getItem('loka-espace'), '1'); } catch { /* ignoré */ } });
  }
  return p;
}
const capture = async (p, url, nom, defile = 0) => {
  await p.goto(SITE + url, { waitUntil: 'networkidle0' }); await pause(1500);
  if (defile) { await p.evaluate((y) => window.scrollTo(0, y), defile); await pause(500); }
  await p.screenshot({ path: path.join(ici, 'ecrans', nom + '.png') }); console.log('✓', nom);
};

const recherche = `/villas?ville=Ouagadougou&arrivee=${jour(9)}&depart=${jour(11)}`;
const ordiClient = await appareil(1440, 900);
await capture(ordiClient, recherche, 'ordi-villas');
await capture(ordiClient, `/villas/${c1.id}?arrivee=${jour(9)}&depart=${jour(11)}`, 'ordi-villa');
const ordiBailleur = await appareil(1440, 900, '70111111');
await capture(ordiBailleur, '/', 'ordi-apercu');
await capture(ordiBailleur, '/reservations', 'ordi-reservations');
const tabClient = await appareil(820, 1180);
await capture(tabClient, `/villas/${c1.id}?arrivee=${jour(9)}&depart=${jour(11)}`, 'tablette-villa');
await capture(tabClient, `/r/${page}`, 'tablette-residence');
const tabBailleur = await appareil(820, 1180, '70111111');
await capture(tabBailleur, '/', 'tablette-apercu');
await capture(tabBailleur, '/reservations', 'tablette-reservations');
await navigateur.close();
