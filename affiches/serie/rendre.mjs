// Rend chaque affiche de la série en PNG (taille réelle des réseaux). Usage : node affiches/serie/rendre.mjs [filtre]
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ici = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(ici, '../../video/package.json'));
const puppeteer = require('puppeteer-core');
const CHROME = path.join(ici, '../../video/.navigateurs/chrome-headless-shell/win64-131.0.6778.204/chrome-headless-shell-win64/chrome-headless-shell.exe');
const liste = JSON.parse(fs.readFileSync(path.join(ici, 'html/liste.json'), 'utf8')).filter(f => !process.argv[2] || f.includes(process.argv[2]));
const sortie = path.join(ici, 'png');
fs.mkdirSync(sortie, { recursive: true });

const b = await puppeteer.launch({ executablePath: CHROME, headless: 'shell', userDataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'loka-aff-')), args: ['--allow-file-access-from-files'] });
const p = await b.newPage();
for (const f of liste) {
  await p.goto(pathToFileURL(path.join(ici, 'html', f)).href, { waitUntil: 'networkidle0' });
  const t = await p.evaluate(() => window.TAILLE);
  await p.setViewport({ width: t.largeur, height: t.hauteur, deviceScaleFactor: 1 });
  await p.evaluate(() => document.fonts.ready.then(() => true));
  await new Promise(r => setTimeout(r, 250));
  await p.screenshot({ path: path.join(sortie, f.replace('.html', '.png')) });
}
await b.close();
console.log(liste.length, 'affiches rendues');
