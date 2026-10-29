// Audit responsive : chaque page et chaque fenêtre de saisie, sur 4 largeurs d'écran.
// Signale tout débordement horizontal (hors tableaux défilants) et fait une capture de chaque écran.
// Usage : node outils/audit-responsive.mjs   (site sur 5174, API sur 4100, données de démonstration)
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ici = path.dirname(fileURLToPath(import.meta.url));
const racine = path.join(ici, '..');
const require = createRequire(path.join(racine, 'video/package.json'));
const puppeteer = require('puppeteer-core');
const { MOT_DE_PASSE } = require(path.join(racine, 'backend/src/scripts/comptes-demo.js'));
const SITE = 'http://localhost:5174';
const SORTIE = path.join(ici, 'audit');
fs.rmSync(SORTIE, { recursive: true, force: true }); fs.mkdirSync(SORTIE, { recursive: true });
const pause = (ms) => new Promise(r => setTimeout(r, ms));
const LARGEURS = [[360, 740], [390, 844], [768, 1024], [1280, 800]];

// Éléments qui dépassent à droite (en ignorant ce qui est dans une zone qui défile exprès).
const DEBORDEMENTS = () => {
  const L = document.documentElement.clientWidth;
  const res = [];
  if (document.scrollingElement.scrollWidth > L + 1) res.push(`page : largeur ${document.scrollingElement.scrollWidth} > ${L}`);
  for (const m of document.querySelectorAll('.modale')) if (m.scrollWidth > m.clientWidth + 1) res.push(`fenêtre « ${m.getAttribute('aria-label')} » : ${m.scrollWidth} > ${m.clientWidth}`);
  for (const e of document.querySelectorAll('body *')) {
    if (e.closest('.tableau-boite, .mc-galerie, .segment, .planning, .onglets, svg')) continue;
    const r = e.getBoundingClientRect();
    if (r.width && r.right > L + 1 && getComputedStyle(e).position !== 'fixed') {
      const nom = e.tagName.toLowerCase() + (e.className && typeof e.className === 'string' ? '.' + e.className.split(' ')[0] : '');
      res.push(`${nom} « ${(e.textContent || e.placeholder || '').trim().slice(0, 30)} » dépasse de ${Math.round(r.right - L)} px`);
    }
  }
  return [...new Set(res)].slice(0, 8);
};

const ECRANS_PUBLICS = (ids) => [
  ['vitrine', '/bienvenue'], ['connexion', '/connexion'], ['inscription', '/inscription'], ['oubli', '/mot-de-passe-oublie'],
  ['villas', '/villas?ville=Ouagadougou'], ['villa', '/villas/' + ids.villa], ['residence', '/r/' + ids.page],
  ['mes-demandes', '/mes-demandes'], ['suivi', '/demande/' + ids.demande], ['avis', '/avis/' + ids.avis],
];
const ECRANS_PROPRIO = [
  ['apercu', '/', null], ['biens', '/biens', null], ['biens-lot', '/biens', 'Plusieurs biens'], ['biens-site', '/biens', 'Site'] ,
  ['bien-modifier', '/biens', { css: 'td button.bouton.discret', texte: 'Modifier' }], ['reservations', '/reservations', null],
  ['resa-nouvelle', '/reservations', '+ Nouvelle réservation'], ['sejour', '/reservations', { css: '.sejour' }],
  ['baux', '/baux', null], ['bail-nouveau', '/baux', '+ Nouveau bail'], ['argent', '/argent', null],
  ['depenses', '/argent?onglet=depenses', null], ['charges', '/argent?onglet=charges', null], ['charge-nouvelle', '/argent?onglet=charges', '+ Ajouter une charge'],
  ['clients', '/clients', null], ['client-fiche', '/clients', { css: '.ligne-client' }], ['clients-message', '/clients', 'Écrire aux clients'],
  ['gerants', '/membres', null], ['gerant-nouveau', '/membres', '+ Ajouter un membre'], ['entreprise', '/parametres', null],
  ['menu', '/', { css: '.bouton-menu' }],
];
const ECRANS_GERANT = [['terrain', '/terrain', null], ['depense', '/terrain', { css: '[aria-label="Noter une dépense"]' }], ['photos', '/terrain', { css: '[aria-label^="Photos de"]' }], ['encaisser', '/terrain', { css: '.carte .liste-lignes .bouton.principal' }]];

async function preparer() {
  const API = 'http://localhost:4100/api';
  const s = await (await fetch(API + '/auth/connexion', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifiant: '70111111', mot_de_passe: MOT_DE_PASSE }) })).json();
  const h = { Authorization: 'Bearer ' + s.jeton, 'X-Espace': s.espaces[0].id, 'Content-Type': 'application/json' };
  const page = (await (await fetch(API + '/profil', { headers: h })).json()).page;
  const villa = (await (await fetch(API + '/public/recherche?equipements=piscine')).json())[0].id;
  const j = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
  const tel = '7' + String(Date.now()).slice(-7);
  const demande = (await (await fetch(API + '/public/demandes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bien_id: villa, arrivee: j(200), depart: j(202), nom: 'Audit Responsive', telephone: tel, message: 'Arrivée vers 18 h, nous serons quatre.' }) })).json()).code;
  const biens = await (await fetch(API + '/biens', { headers: h })).json();
  const k2 = biens.find(b => b.reference === 'K2');
  await fetch(API + '/profil', { method: 'PATCH', headers: h, body: JSON.stringify({ heure_arrivee: '00:00', heure_depart: '23:59' }) });
  const r = await (await fetch(API + '/reservations', { method: 'POST', headers: h, body: JSON.stringify({ bien_id: k2.id, client: { nom: 'Client Avis Audit', telephone: '7' + String(Date.now() + 1).slice(-7) }, arrivee: j(-30), depart: j(-29) }) })).json();
  await fetch(API + '/paiements', { method: 'POST', headers: h, body: JSON.stringify({ reservation_id: r.id, montant: r.total, moyen: 'especes' }) });
  await fetch(`${API}/reservations/${r.id}/cles`, { method: 'POST', headers: h });
  const avis = (await (await fetch(`${API}/reservations/${r.id}/depart`, { method: 'POST', headers: h })).json()).code_avis;
  await fetch(API + '/profil', { method: 'PATCH', headers: h, body: JSON.stringify({ heure_arrivee: '15:00', heure_depart: '12:00' }) });
  return { page, villa, demande, avis };
}

const navigateur = await puppeteer.launch({ executablePath: path.join(racine, 'video/.navigateurs/chrome-headless-shell/win64-131.0.6778.204/chrome-headless-shell-win64/chrome-headless-shell.exe'), headless: 'shell', protocolTimeout: 60000 });
const ids = await preparer();
const rapport = [];

async function contexte(largeur, hauteur, telephone) {
  const p = await (await navigateur.createBrowserContext()).newPage();
  await p.setViewport({ width: largeur, height: hauteur, deviceScaleFactor: 1, isMobile: largeur < 768, hasTouch: largeur < 768 });
  p.on('pageerror', e => rapport.push(`ERREUR JS (${largeur}) : ${e.message}`));
  p.on('dialog', d => d.dismiss().catch(() => {}));
  if (telephone) {
    await p.goto(SITE + '/connexion', { waitUntil: 'networkidle0' });
    const ins = await p.$$('input'); await ins[0].type(telephone); await ins[1].type(MOT_DE_PASSE);
    await p.keyboard.press('Enter'); await p.waitForNavigation({ waitUntil: 'networkidle0' }).catch(() => {}); await pause(600);
  }
  return p;
}
async function ouvrir(p, action) {
  if (!action) return;
  const ok = await p.evaluate((a) => {
    const vis = (e) => e && e.offsetParent !== null;
    let el;
    if (typeof a === 'string') el = [...document.querySelectorAll('button, a')].filter(vis).find(x => x.textContent.trim().startsWith(a));
    else el = [...document.querySelectorAll(a.css)].filter(vis).find(x => !a.texte || x.textContent.trim() === a.texte);
    if (el) el.click(); return !!el;
  }, action);
  if (!ok) rapport.push(`  (action introuvable : ${JSON.stringify(action)})`);
  await pause(900);
}

for (const [L, H] of LARGEURS) {
  const tag = String(L);
  const pub = await contexte(L, H);
  for (const [nom, chemin] of ECRANS_PUBLICS(ids)) {
    await pub.goto(SITE + chemin, { waitUntil: 'networkidle0' }); await pause(700);
    process.stdout.write(`${tag} ${nom} · `);
    const d = await pub.evaluate(DEBORDEMENTS);
    if (d.length) rapport.push(`[${tag}] ${nom} : ${d.join(' | ')}`);
    await pub.screenshot({ path: path.join(SORTIE, `${tag}-public-${nom}.png`), fullPage: L < 768 });
  }
  for (const [role, tel, ecrans] of [['proprio', '70111111', ECRANS_PROPRIO], ['gerant', '70222222', ECRANS_GERANT]]) {
    const p = await contexte(L, H, tel);
    for (const [nom, chemin, action] of ecrans) {
      await p.goto(SITE + chemin, { waitUntil: 'networkidle0' }); await pause(600);
      await ouvrir(p, action);
      process.stdout.write(`${tag} ${role}/${nom} · `);
      const d = await p.evaluate(DEBORDEMENTS);
      if (d.length) rapport.push(`[${tag}] ${role}/${nom} : ${d.join(' | ')}`);
      await p.screenshot({ path: path.join(SORTIE, `${tag}-${role}-${nom}.png`) });
    }
  }
}
await navigateur.close();
fs.writeFileSync(path.join(SORTIE, 'rapport.txt'), rapport.join('\n') || 'Aucun débordement détecté.');
console.log(rapport.join('\n') || 'Aucun débordement détecté.');
