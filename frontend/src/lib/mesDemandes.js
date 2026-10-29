// Demandes de réservation faites depuis ce téléphone (place de marché, sans compte) : gardées sur l'appareil
// pour que le client les retrouve et les suive.
const CLE = 'loka-mes-demandes';

export function mesDemandes() {
  try { return JSON.parse(localStorage.getItem(CLE)) || []; } catch { return []; }
}

export function retenirDemande(d) {
  try {
    const liste = mesDemandes().filter(x => x.code !== d.code);
    localStorage.setItem(CLE, JSON.stringify([{ ...d, retenue_le: new Date().toISOString() }, ...liste].slice(0, 30)));
    window.dispatchEvent(new Event('loka-mes-demandes'));
  } catch { /* stockage indisponible : le code reste affiché au client */ }
}

export function oublierDemande(code) {
  try {
    localStorage.setItem(CLE, JSON.stringify(mesDemandes().filter(x => x.code !== code)));
    window.dispatchEvent(new Event('loka-mes-demandes'));
  } catch { /* ignoré */ }
}

// Demandes de cet appareil qui chevauchent des dates (hors annulées connues).
export const chevauchements = (arrivee, depart, sauf) =>
  mesDemandes().filter(d => d.code !== sauf && !d.terminee && d.arrivee < depart && d.depart > arrivee);

// Dernière recherche (critères), pour que « Revenir à la recherche » retrouve les mêmes résultats.
export const lienRecherche = () => { try { return '/villas' + (sessionStorage.getItem('loka-recherche') || ''); } catch { return '/villas'; } };
export const retenirRecherche = (q) => { try { sessionStorage.setItem('loka-recherche', q); } catch { /* ignoré */ } };
