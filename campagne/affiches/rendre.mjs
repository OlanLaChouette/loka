// Rend les affiches de campagne : clients et bailleurs × statut, fil, carré (PNG réseaux) et A3 (PNG 300 dpi + PDF).
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
const sortie = path.join(ici, 'png');
fs.mkdirSync(sortie, { recursive: true });
const NOMS = { statut: 'statut-9x16', fil: 'fil-4x5', carre: 'carre-1x1', a3: 'A3' };

const b = await puppeteer.launch({ executablePath: CHROME, headless: 'shell', userDataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'loka-aff-')), args: ['--allow-file-access-from-files'] });
const p = await b.newPage();
for (const c of ['clients', 'bailleurs']) for (const f of Object.keys(NOMS)) {
  const nom = `Loka-${c}-${NOMS[f]}`;
  if (process.argv[2] && !nom.includes(process.argv[2])) continue;
  await p.goto(pathToFileURL(path.join(ici, 'affiche.html')).href + `?${c}-${f}`, { waitUntil: 'networkidle0' });
  const t = await p.evaluate(() => window.TAILLE);
  // A3 à 300 dpi : 3508 px de large pour une mise en page de 1080 px.
  await p.setViewport({ width: t.largeur, height: t.hauteur, deviceScaleFactor: f === 'a3' ? 3508 / 1080 : 1 });
  await p.evaluate(() => document.fonts.ready.then(() => true));
  await new Promise(r => setTimeout(r, 300));
  await p.screenshot({ path: path.join(sortie, nom + '.png') });
  if (f === 'a3') await p.pdf({ path: path.join(sortie, nom + '.pdf'), width: '1080px', height: t.hauteur + 'px', printBackground: true, pageRanges: '1' });
  console.log('✓', nom);
}
await b.close();
