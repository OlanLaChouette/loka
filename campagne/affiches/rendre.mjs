// Rend les affiches de campagne : clients, bailleurs et affiches d'information × statut, fil, carré (PNG réseaux) et A3 (PNG 300 dpi + PDF), rangées dans campagne/A publier.
// Usage : node campagne/affiches/rendre.mjs [filtre]
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ici = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(ici, '../../video/package.json'));
const puppeteer = require('puppeteer-core');
const CHROME = path.join(ici, '../../video/.navigateurs/chrome-headless-shell/win64-131.0.6778.204/chrome-headless-shell-win64/chrome-headless-shell.exe');
// Rangement direct dans « campagne/A publier » : affiches réseaux par campagne, A3 à part pour l'impression.
const PUBLIER = path.join(ici, '..', 'A publier');
const POUR_CLIENTS = ['clients', 'recherche', 'reservation'];
const dossier = (c, f) => path.join(PUBLIER, f === 'a3' ? '4 Impression A3' : POUR_CLIENTS.includes(c) ? '2 Affiches clients' : '3 Affiches bailleurs');
const NOMS = { statut: 'statut-9x16', fil: 'fil-4x5', carre: 'carre-1x1', a3: 'A3' };
const PAGES = { clients: 'affiche.html', bailleurs: 'affiche.html', groupes: 'affiche.html', fonctionnalites: 'infos.html', tarifs: 'infos.html', recherche: 'infos.html', reservation: 'infos.html' };

const b = await puppeteer.launch({ executablePath: CHROME, headless: 'shell', userDataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'loka-aff-')), args: ['--allow-file-access-from-files'] });
const p = await b.newPage();
for (const c of Object.keys(PAGES)) for (const f of Object.keys(NOMS)) {
  const nom = `Loka-${c}-${NOMS[f]}`;
  if (process.argv[2] && !nom.includes(process.argv[2])) continue;
  await p.goto(pathToFileURL(path.join(ici, PAGES[c])).href + `?${c}-${f}`, { waitUntil: 'networkidle0' });
  const t = await p.evaluate(() => window.TAILLE);
  // A3 à 300 dpi : 3508 px de large pour une mise en page de 1080 px.
  await p.setViewport({ width: t.largeur, height: t.hauteur, deviceScaleFactor: f === 'a3' ? 3508 / 1080 : 1 });
  await p.evaluate(() => document.fonts.ready.then(() => true));
  await new Promise(r => setTimeout(r, 300));
  const sortie = dossier(c, f); fs.mkdirSync(sortie, { recursive: true });
  await p.screenshot({ path: path.join(sortie, nom + '.png') });
  if (f === 'a3') await p.pdf({ path: path.join(sortie, nom + '.pdf'), width: '1080px', height: t.hauteur + 'px', printBackground: true, pageRanges: '1' });
  console.log('✓', nom);
}
await b.close();
