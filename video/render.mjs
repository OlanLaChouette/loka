// Rendu d'une scène HTML animée image par image avec Edge, puis assemblage en MP4 avec ffmpeg.
// Usage : node render.mjs                         -> scene.html vers out/loka_muet.mp4
//         node render.mjs 1.2 7.5                 -> out/apercu_<t>.png pour chaque instant donné
// Variables : SCENE (chemin de la page, défaut scene.html), SORTIE (dossier de sortie, défaut out),
//             NOM (nom de la vidéo, défaut loka_muet.mp4). La taille vient de window.TAILLE (défaut 1080 × 1920).
import puppeteer from 'puppeteer-core';
import { spawn, execFileSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ici = path.dirname(fileURLToPath(import.meta.url));
const scene = path.resolve(ici, process.env.SCENE || 'scene.html');
const sortie = path.resolve(ici, process.env.SORTIE || 'out');
fs.mkdirSync(sortie, { recursive: true });
// Navigateur de rendu : Chrome Headless Shell installé dans le projet (npx @puppeteer/browsers install
// chrome-headless-shell@131.0.6778.204 --path .navigateurs), sinon Edge.
const LOCAL = path.join(ici, '.navigateurs', 'chrome-headless-shell', 'win64-131.0.6778.204', 'chrome-headless-shell-win64', 'chrome-headless-shell.exe');
const EDGE = fs.existsSync(LOCAL) ? LOCAL : 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const FFMPEG = execFileSync('python', ['-c', 'import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())']).toString().trim();
const FPS = 30;

const navigateur = await puppeteer.launch({ executablePath: EDGE, headless: 'shell', protocolTimeout: 120000, userDataDir: path.join(process.env.TEMP || ici, 'loka-rendu-' + process.pid), args: ['--hide-scrollbars', '--force-color-profile=srgb', '--allow-file-access-from-files'] });
const page = await navigateur.newPage();
await page.goto(pathToFileURL(scene).href, { waitUntil: 'load' });
const taille = await page.evaluate(() => window.TAILLE || { largeur: 1080, hauteur: 1920 });
await page.setViewport({ width: taille.largeur, height: taille.hauteur, deviceScaleFactor: Number(process.env.ECHELLE || 1) });
await page.evaluate(() => document.fonts.ready.then(() => true));
await new Promise(r => setTimeout(r, 500));

const instants = process.argv.slice(2).map(Number);
if (instants.length) {
  for (const t of instants) {
    await page.evaluate(t => window.seek(t), t);
    await page.screenshot({ path: path.join(sortie, `apercu_${t}.png`) });
    console.log('aperçu', t);
  }
} else {
  const duree = await page.evaluate(() => window.DUREE);
  const total = Math.round(duree * FPS);
  const ff = spawn(FFMPEG, ['-y', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
    path.join(sortie, process.env.NOM || 'loka_muet.mp4')], { stdio: ['pipe', 'ignore', 'inherit'] });
  for (let i = 0; i < total; i++) {
    await page.evaluate(t => window.seek(t), i / FPS);
    const img = await page.screenshot({ type: 'jpeg', quality: 95 });
    if (!ff.stdin.write(img)) await new Promise(r => ff.stdin.once('drain', r));
    if (i % 90 === 0) console.log(`image ${i}/${total}`);
  }
  ff.stdin.end();
  await new Promise(r => ff.on('close', r));
  console.log('vidéo muette prête');
}
await navigateur.close();
