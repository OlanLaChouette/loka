import axios from 'axios';

const BASE = import.meta.env.VITE_API_URL || '';
export const api = axios.create({ baseURL: BASE + '/api' });

const lire = (cle) => { try { return localStorage.getItem(cle); } catch { return null; } };
const ecrire = (cle, val) => { try { val == null ? localStorage.removeItem(cle) : localStorage.setItem(cle, val); } catch { /* stockage indisponible */ } };

export const stockage = {
  jeton: () => lire('loka-jeton'),
  espace: () => lire('loka-espace'),
  definirJeton: (v) => ecrire('loka-jeton', v),
  definirEspace: (v) => ecrire('loka-espace', v),
};

api.interceptors.request.use((config) => {
  const jeton = stockage.jeton();
  const espace = stockage.espace();
  if (jeton) config.headers.Authorization = 'Bearer ' + jeton;
  if (espace) config.headers['X-Espace'] = espace;
  return config;
});

api.interceptors.response.use((r) => r, (erreur) => {
  if (erreur.response?.status === 401 && stockage.jeton()) {
    stockage.definirJeton(null);
    window.location.assign('/connexion');
  }
  return Promise.reject(erreur);
});

export const messageErreur = (e) => {
  if (e?.isAxiosError && !e.response) return 'Pas de connexion internet. Les réservations demandent le réseau, pour ne jamais vendre deux fois la même nuit.';
  return e?.response?.data?.message || e?.message || 'Une erreur est survenue';
};
export const urlFichier = (chemin) => (chemin ? BASE + chemin : null);
