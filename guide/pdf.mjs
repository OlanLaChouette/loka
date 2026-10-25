// Imprime guide-Loka.html en PDF A4 (usage : node guide/pdf.mjs).
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ici = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(ici, '../video/package.json'));
const puppeteer = require('puppeteer-core');
const CHROME = path.join(ici, '../video/.navigateurs/chrome-headless-shell/win64-131.0.6778.204/chrome-headless-shell-win64/chrome-headless-shell.exe');

const navigateur = await puppeteer.launch({ executablePath: CHROME, headless: 'shell', userDataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'loka-pdf-')) });
const page = await navigateur.newPage();
await page.goto(pathToFileURL(path.join(ici, 'guide-Loka.html')).href, { waitUntil: 'networkidle0' });
await page.evaluate(() => document.fonts.ready);
await page.pdf({ path: path.join(ici, '../guide-Loka.pdf'), preferCSSPageSize: true, printBackground: true });
await navigateur.close();
console.log('guide-Loka.pdf prêt');
