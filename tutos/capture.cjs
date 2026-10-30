// Capture des tutos : pilote la vraie application (données de démonstration) au format téléphone,
// photographie chaque écran et note l'élément où le doigt doit appuyer.
// Sortie : tutos/<id>/ecrans/NN.png et tutos/<id>/plan.json.
// Usage : node tutos/capture.cjs [id…]   (site Vite sur 5174 ; l'API est lancée ici, port 4100 libre)
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFileSync } = require('child_process');

const RACINE = path.join(__dirname, '..');
process.chdir(path.join(RACINE, 'backend'));
process.env.NODE_ENV = 'test'; // pas de limite de tentatives ; les e-mails restent en mémoire
require(path.join(RACINE, 'backend/node_modules/dotenv')).config();
const puppeteer = require(path.join(RACINE, 'video/node_modules/puppeteer-core'));
const { MOT_DE_PASSE } = require(path.join(RACINE, 'backend/src/scripts/comptes-demo'));
const { courrielCode } = require(path.join(RACINE, 'backend/src/services/courriel'));

const SITE = process.env.SITE || 'http://localhost:5174';
const CHROME = path.join(RACINE, 'video/.navigateurs/chrome-headless-shell/win64-131.0.6778.204/chrome-headless-shell-win64/chrome-headless-shell.exe');
const pause = (ms) => new Promise(r => setTimeout(r, ms));

class Tuto {
  constructor(navigateur, id) {
    this.navigateur = navigateur; this.id = id; this.etapes = [];
    this.dossier = path.join(__dirname, id, 'ecrans');
    fs.rmSync(this.dossier, { recursive: true, force: true });
    fs.mkdirSync(this.dossier, { recursive: true });
  }
  async ouvrir() {
    this.page = await this.navigateur.newPage();
    await this.page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    // Pas de défilement horizontal de la page entière (scrollIntoView le provoque parfois).
    await this.page.evaluateOnNewDocument(() => document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = 'html,body{overflow-x:clip}'; document.head.appendChild(st); }));
    this.page.on('pageerror', e => console.log(`  [${this.id}] erreur page :`, e.message));
    this.page.on('response', r => { if (r.status() >= 400 && r.url().includes('/api/')) console.log(`  [${this.id}] ${r.status()} ${r.request().method()} ${r.url().replace(SITE, '')}`); });
    await this.page.goto(SITE + '/connexion', { waitUntil: 'networkidle0' });
    await this.page.evaluate(() => { localStorage.clear(); localStorage.setItem('loka-theme', 'clair'); });
  }
  async aller(chemin) { await this.page.goto(SITE + chemin, { waitUntil: 'networkidle0' }); await pause(600); }
  async connecter(telephone) {
    await this.aller('/connexion');
    await this.saisir('Téléphone ou e-mail', telephone);
    await this.saisir('Mot de passe', MOT_DE_PASSE);
    await this.page.keyboard.press('Enter');
    await this.page.waitForNavigation({ waitUntil: 'networkidle0' }).catch(() => {});
    await pause(900);
  }

  // Trouve un élément : texte visible d'un bouton/lien, { css }, ou { champ: libellé }.
  async element(cible) {
    const h = await this.page.evaluateHandle((c) => {
      const visible = (e) => e && e.offsetParent !== null && getComputedStyle(e).visibility !== 'hidden';
      const modales = [...document.querySelectorAll('.modale, .volet')].filter(visible);
      const racine = modales.at(-1) || document;
      const dans = (sel) => [...racine.querySelectorAll(sel)].filter(visible);
      if (c.css) return dans(c.css)[c.n || 0] || [...document.querySelectorAll(c.css)].filter(visible)[c.n || 0] || null;
      if (c.champ) {
        const l = dans('label.champ').find(x => x.textContent.trim().startsWith(c.champ));
        return l && l.querySelector('input, select, textarea');
      }
      const net = (e) => e.textContent.replace(/\s+/g, ' ').trim();
      const tous = dans('button, a, label, [role=tab], [role=radio]');
      const t = c.texte;
      return tous.filter(e => net(e) === t)[c.n || 0] || tous.filter(e => net(e).startsWith(t))[c.n || 0] || null;
    }, typeof cible === 'string' ? { texte: cible } : cible);
    const e = h.asElement();
    if (!e) {
      await this.page.screenshot({ path: path.join(__dirname, 'echec.png') });
      const libelles = await this.page.evaluate(() => [...document.querySelectorAll('label.champ, button')].map(x => x.textContent.trim().slice(0, 30)).join(' | '));
      throw new Error(`[${this.id}] élément introuvable : ${JSON.stringify(cible)} (écran : tutos/echec.png ; présents : ${libelles.slice(0, 600)})`);
    }
    return e;
  }

  async saisir(champ, valeur) {
    const e = await this.element({ champ });
    await e.evaluate(x => x.scrollIntoView({ block: 'center' }));
    await pause(150);
    const tag = await e.evaluate(x => x.tagName);
    if (tag === 'SELECT') {
      await e.evaluate((x, v) => {
        const o = [...x.options].find(o => o.textContent.includes(v) || o.value === v);
        const fixer = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
        fixer.call(x, o.value); x.dispatchEvent(new Event('change', { bubbles: true }));
      }, valeur);
    } else if (['date', 'month'].includes(await e.evaluate(x => x.type))) {
      await e.evaluate((x, v) => {
        const fixer = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        fixer.call(x, v); x.dispatchEvent(new Event('input', { bubbles: true })); x.dispatchEvent(new Event('change', { bubbles: true }));
      }, valeur);
    } else {
      await e.click({ clickCount: 3 });
      await e.type(String(valeur), { delay: 5 });
    }
    await pause(150);
  }

  async fichier(cible, chemin) {
    const e = await this.element(cible);
    await e.evaluate(x => x.scrollIntoView({ block: 'center' }));
    const [choix] = await Promise.all([this.page.waitForFileChooser(), e.click()]);
    await choix.accept([chemin]);
    await pause(1500);
  }

  async defiler(y) { await this.page.evaluate((v) => { const m = [...document.querySelectorAll('.modale')].at(-1); (m || document.scrollingElement).scrollTo(0, v); }, y); await pause(400); }

  // Photographie l'écran ; si une cible est donnée, note sa position puis appuie dessus.
  async ecran(texte, cible, { cliquer = true, apres = 900 } = {}) {
    let tap = null, e = null;
    if (cible) {
      e = await this.element(cible);
      await e.evaluate(x => x.scrollIntoView({ block: 'center', inline: 'nearest' }));
      await pause(350);
      const r = await e.boundingBox();
      tap = { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height };
    }
    const image = String(this.etapes.length + 1).padStart(2, '0') + '.png';
    await this.page.screenshot({ path: path.join(this.dossier, image) });
    this.etapes.push({ image, texte, tap });
    if (e && cliquer) { await e.click(); await pause(apres); }
  }

  // Écran fabriqué (e-mail, WhatsApp, PDF) : une page HTML au format téléphone.
  async ecranHtml(texte, html) {
    const p = await this.navigateur.newPage();
    await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
    await p.setContent(html, { waitUntil: 'networkidle0' });
    const image = String(this.etapes.length + 1).padStart(2, '0') + '.png';
    await p.screenshot({ path: path.join(this.dossier, image) });
    await p.close();
    this.etapes.push({ image, texte, tap: null });
  }

  enregistrer(titre, numero) {
    fs.writeFileSync(path.join(__dirname, this.id, 'plan.json'), JSON.stringify({ id: this.id, numero, titre, etapes: this.etapes }, null, 2));
    console.log(`✓ ${this.id} : ${this.etapes.length} écrans`);
  }
}

// Écrans fabriqués
const STYLE = `<style>*{box-sizing:border-box;margin:0}body{font-family:'Segoe UI',Arial,sans-serif;background:#fff;width:390px;height:844px;overflow:hidden}</style>`;
const ecranMail = ({ sujet, html }) => `${STYLE}<div style="padding:54px 18px 12px;border-bottom:1px solid #e5e5ea">
  <div style="font-size:13px;color:#8a8a8e">Boîte de réception</div>
  <div style="font-size:19px;font-weight:700;margin-top:6px">${sujet}</div>
  <div style="display:flex;gap:10px;align-items:center;margin-top:12px"><span style="width:36px;height:36px;border-radius:50%;background:#6D5DF5;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700">L</span>
  <div><div style="font-weight:600;font-size:14px">Loka · eYamTech</div><div style="font-size:12px;color:#8a8a8e">à moi · maintenant</div></div></div></div>
  <div style="transform:scale(.74);transform-origin:top left;width:527px">${html.replace(/^[\s\S]*<body[^>]*>|<\/body>[\s\S]*$/g, '')}</div>`;
const ecranWhatsApp = ({ client, message, fichier }) => `${STYLE}<div style="background:#075E54;color:#fff;padding:52px 14px 12px;display:flex;gap:12px;align-items:center">
  <span style="font-size:22px">‹</span><span style="width:38px;height:38px;border-radius:50%;background:#cfd8dc;color:#455a64;display:flex;align-items:center;justify-content:center;font-weight:700">${client[0]}</span>
  <div><div style="font-weight:600">${client}</div><div style="font-size:12px;opacity:.8">en ligne</div></div></div>
  <div style="background:#ECE5DD;height:760px;padding:16px 12px;display:flex;flex-direction:column;align-items:flex-end;gap:8px">
  <div style="background:#DCF8C6;border-radius:10px;padding:6px;max-width:270px;box-shadow:0 1px 1px rgba(0,0,0,.1)">
    <div style="background:#fff;border-radius:8px;padding:10px;display:flex;gap:10px;align-items:center"><span style="background:#E53935;color:#fff;font-size:11px;font-weight:700;padding:8px 6px;border-radius:4px">PDF</span><div><div style="font-size:14px;font-weight:600">${fichier}</div><div style="font-size:12px;color:#8a8a8e">1 page · PDF</div></div></div>
    <div style="font-size:14.5px;padding:8px 4px 2px;line-height:1.35">${message}</div>
    <div style="font-size:11px;color:#6b8f71;text-align:right">maintenant ✓✓</div></div></div>`;
const ecranImage = (fichier, fond = '#3a3a40') => `${STYLE}<div style="height:844px;background:${fond};display:flex;align-items:center;justify-content:center;padding:18px">
  <img src="data:image/png;base64,${fs.readFileSync(fichier).toString('base64')}" style="max-width:100%;max-height:100%;border-radius:6px;box-shadow:0 10px 30px rgba(0,0,0,.4)"></div>`;

async function pdfEnImage(chemin, sortie) {
  const pdf = path.join(os.tmpdir(), 'loka-tuto.pdf');
  fs.writeFileSync(pdf, chemin);
  execFileSync('python', ['-W', 'ignore', '-c', `import pymupdf;d=pymupdf.open(r'${pdf}');d[0].get_pixmap(dpi=150).save(r'${sortie}')`]);
  return sortie;
}

async function apiPdf(telephone, chemin) {
  const r = await fetch('http://localhost:4100/api/auth/connexion', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifiant: telephone, mot_de_passe: MOT_DE_PASSE }) });
  const s = await r.json();
  const liste = await (await fetch('http://localhost:4100/api' + chemin.liste, { headers: { Authorization: 'Bearer ' + s.jeton, 'X-Espace': s.espaces[0].id } })).json();
  const id = chemin.choisir(liste).id;
  return Buffer.from(await (await fetch('http://localhost:4100/api' + chemin.pdf(id), { headers: { Authorization: 'Bearer ' + s.jeton, 'X-Espace': s.espaces[0].id } })).arrayBuffer());
}

module.exports = { Tuto, pause, ecranMail, ecranWhatsApp, ecranImage, pdfEnImage, apiPdf, courrielCode, RACINE };

if (require.main === module) {
  (async () => {
    execFileSync(process.execPath, [path.join(RACINE, 'backend/src/scripts/creer-base.js'), '--demo'], { stdio: 'ignore', env: { ...process.env, NODE_ENV: 'development' } });
    const app = require(path.join(RACINE, 'backend/server'));
    const serveur = app.listen(4100);
    const navigateur = await puppeteer.launch({ executablePath: CHROME, headless: 'shell', userDataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'loka-tutos-')) });
    const { SCENARIOS } = require('./scenarios.cjs');
    const voulus = process.argv.slice(2);
    try {
      const dernier = voulus.length ? Math.max(...SCENARIOS.map((s, i) => (voulus.some(v => s.id.startsWith(v)) ? i : -1))) : SCENARIOS.length - 1;
      for (const s of SCENARIOS.slice(0, dernier + 1)) {
        // Les tutos s'enchaînent (le compte créé au n°1 sert aux suivants) : on les joue tous, on ne garde que les demandés.
        const t = new Tuto(navigateur, voulus.length && !voulus.some(v => s.id.startsWith(v)) ? '_brouillon' : s.id);
        await t.ouvrir();
        await s.jouer(t);
        if (t.id !== '_brouillon') t.enregistrer(s.titre, s.numero);
        await t.page.close();
      }
    } catch (e) {
      console.error('ÉCHEC :', e.message);
      process.exitCode = 1;
    } finally {
      await navigateur.close();
      serveur.close();
      process.exit(process.exitCode || 0);
    }
  })().catch(e => { console.error(e); process.exit(1); });
}
