const nf = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
// Espaces normales plutôt qu'insécables fines : plus lisibles sur les téléphones d'entrée de gamme.
export const montant = (n) => nf.format(Math.round(n || 0)).replace(/ | /g, ' ');
export const fcfa = (n) => montant(n) + ' FCFA';

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const enDate = (s) => (s instanceof Date ? s : new Date(String(s).length === 10 ? s + 'T00:00:00' : s));

const ABR = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
export const dateCourte = (s) => { const d = enDate(s); return `${d.getDate()} ${ABR[d.getMonth()]}`; };
export const dateLongue = (s) => { const d = enDate(s); const t = `${JOURS[d.getDay()]} ${d.getDate()} ${MOIS[d.getMonth()]}`; return t[0].toUpperCase() + t.slice(1); };
export const heure = (s) => { const d = enDate(s); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
export const nomMois = (aaaamm) => { const [a, m] = aaaamm.split('-'); return `${MOIS[+m - 1]} ${a}`; };
export const aujourdhui = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
export const ajouterJours = (s, n) => { const d = enDate(s); d.setDate(d.getDate() + n); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
export const initiales = (nom = '') => nom.split(/\s+/).filter(Boolean).slice(0, 2).map(m => m[0]).join('').toUpperCase();

export const MOYENS = { especes: 'Espèces', mobile_money: 'Mobile Money', virement: 'Virement', autre: 'Autre' };
export const ROLES = { proprietaire: 'Propriétaire', gerant: 'Gérant', comptable: 'Comptable' };
export const TYPES_BIEN = { villa: 'Villa', appartement: 'Appartement', studio: 'Studio', chambre: 'Chambre', magasin: 'Magasin', bureau: 'Bureau', autre: 'Autre' };
// Équipements proposés sur la place de marché (clés identiques côté serveur).
export const EQUIPEMENTS = { piscine: 'Piscine', clim: 'Climatisation', wifi: 'Wi-Fi', parking: 'Parking', cuisine: 'Cuisine équipée', groupe: 'Groupe électrogène', gardien: 'Gardiennage', eau_chaude: 'Eau chaude', tv: 'Télévision', jardin: 'Jardin' };
