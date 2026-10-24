// File d'attente hors réseau : encaissements et dépenses saisis sans connexion sont gardés sur l'appareil
// (IndexedDB, photos comprises) puis envoyés au retour du réseau. Chaque envoi porte une clé unique :
// le serveur ne l'enregistre jamais deux fois, même s'il est renvoyé.
import { api } from './api';

const BASE = 'loka-hors-ligne', MAGASIN = 'envois';
const ecouteurs = new Set();

function ouvrir() {
  return new Promise((resoudre, rejeter) => {
    const r = indexedDB.open(BASE, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(MAGASIN, { keyPath: 'cle' });
    r.onsuccess = () => resoudre(r.result);
    r.onerror = () => rejeter(r.error);
  });
}
async function operation(mode, fn) {
  const db = await ouvrir();
  return new Promise((resoudre, rejeter) => {
    const t = db.transaction(MAGASIN, mode);
    const resultat = fn(t.objectStore(MAGASIN));
    t.oncomplete = () => resoudre(resultat?.result);
    t.onerror = () => rejeter(t.error);
  });
}
const tous = () => operation('readonly', (s) => s.getAll());
const ajouter = (e) => operation('readwrite', (s) => s.put(e));
const retirer = (cle) => operation('readwrite', (s) => s.delete(cle));

async function prevenir() {
  const liste = await tous().catch(() => []);
  ecouteurs.forEach((f) => f(liste));
}
export function suivre(fn) { ecouteurs.add(fn); prevenir(); return () => ecouteurs.delete(fn); }

const nouvelleCle = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(36).slice(2));
const erreurReseau = (e) => !e.response;

function requete(envoi) {
  const config = { headers: { 'X-Espace': envoi.espace } };
  if (envoi.type === 'paiement') return api.post('/paiements', { ...envoi.donnees, cle_client: envoi.cle }, config);
  const d = new FormData();
  for (const [k, v] of Object.entries(envoi.donnees)) if (v != null) d.append(k, v);
  d.append('cle_client', envoi.cle);
  if (envoi.fichier) d.append('justificatif', envoi.fichier, envoi.nomFichier || 'justificatif.jpg');
  return api.post('/depenses', d, config);
}

// Tente l'envoi ; sans réseau, le garde pour plus tard. Renvoie { enAttente, data }.
export async function envoyer({ type, donnees, fichier, espace, libelle }) {
  const envoi = { cle: nouvelleCle(), type, donnees, fichier: fichier || null, nomFichier: fichier?.name, espace, libelle, cree_le: new Date().toISOString() };
  try {
    const r = await requete(envoi);
    return { enAttente: false, data: r.data };
  } catch (e) {
    if (!erreurReseau(e)) throw e;
    await ajouter(envoi);
    prevenir();
    return { enAttente: true };
  }
}

let enCours = false;
export async function synchroniser() {
  if (enCours || !navigator.onLine) return;
  enCours = true;
  try {
    for (const envoi of await tous()) {
      try {
        await requete(envoi);
        await retirer(envoi.cle);
      } catch (e) {
        if (erreurReseau(e)) break;
        // Refus du serveur (réservation annulée, montant trop élevé…) : on garde l'envoi avec la raison.
        await ajouter({ ...envoi, erreur: e.response?.data?.message || 'Refusé par le serveur' });
      }
    }
  } finally {
    enCours = false;
    prevenir();
  }
}

export async function abandonner(cle) { await retirer(cle); prevenir(); }

if (typeof window !== 'undefined') {
  window.addEventListener('online', synchroniser);
  setInterval(synchroniser, 30000);
  setTimeout(synchroniser, 3000);
}
