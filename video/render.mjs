// Rendu de scene.html image par image avec Edge, puis assemblage en MP4 avec ffmpeg.
// Usage : node render.mjs            -> out/loka_muet.mp4
//         node render.mjs 1.2 7.5    -> out/apercu_<t>.png pour chaque instant donné
import puppeteer from 'puppeteer-core';
import { spawn, execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ici = path.dirname(fileURLToPath(import.meta.url));
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const FFMPEG = execFileSync('python', ['-c', 'import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())']).toString().trim();
const FPS = 30;

const navigateur = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ['--hide-scrollbars', '--force-color-profile=srgb'] });
const page = await navigateur.newPage();
await page.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 });
await page.goto(pathToFileURL(path.join(ici, 'scene.html')).href, { waitUntil: 'networkidle0' });
await page.evaluate(() => window.pret);
await new Promise(r => setTimeout(r, 500));

const instants = process.argv.slice(2).map(Number);
if (instants.length) {
  for (const t of instants) {
    await page.evaluate(t => window.seek(t), t);
    await page.screenshot({ path: path.join(ici, 'out', `apercu_${t}.png`) });
    console.log('aperçu', t);
  }
} else {
  const duree = await page.evaluate(() => window.DUREE);
  const total = Math.round(duree * FPS);
  const ff = spawn(FFMPEG, ['-y', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
    path.join(ici, 'out', 'loka_muet.mp4')], { stdio: ['pipe', 'ignore', 'inherit'] });
  for (let i = 0; i < total; i++) {
    await page.evaluate(t => window.seek(t), i / FPS);
    const img = await page.screenshot({ type: 'jpeg', quality: 95 });
    if (!ff.stdin.write(img)) await new Promise(r => ff.stdin.once('drain', r));
    if (i % 60 === 0) console.log(`image ${i}/${total}`);
  }
  ff.stdin.end();
  await new Promise(r => ff.on('close', r));
  console.log('vidéo muette prête');
}
await navigateur.close();
