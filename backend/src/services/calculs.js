// Règles de calcul de Loka, sans accès à la base : faciles à tester.

const JOUR = 86400000;
const versDate = (s) => new Date(s + 'T00:00:00Z');
const versTexte = (d) => d.toISOString().slice(0, 10);

function nuitsEntre(arrivee, depart) {
  const n = Math.round((versDate(depart) - versDate(arrivee)) / JOUR);
  if (!Number.isInteger(n) || n < 1) throw new Error('Le départ doit être au moins un jour après l’arrivée');
  return n;
}

// Prix d'un séjour. `reduction` peut être un montant ({montant}) ou un pourcentage ({pourcent}).
function prixSejour({ prixNuit, nuits, reduction }) {
  const prixNormal = prixNuit * nuits;
  let montantReduction = 0;
  if (reduction && reduction.pourcent) montantReduction = Math.round(prixNormal * reduction.pourcent / 100);
  else if (reduction && reduction.montant) montantReduction = Math.round(reduction.montant);
  if (montantReduction < 0 || montantReduction > prixNormal) throw new Error('Réduction invalide');
  const pourcent = prixNormal ? (montantReduction / prixNormal) * 100 : 0;
  return { prixNormal, reduction: montantReduction, total: prixNormal - montantReduction, pourcent };
}

// Le gérant peut accorder jusqu'à sa limite ; au-delà, le propriétaire doit valider.
function besoinValidation({ role, pourcent, limite }) {
  return role === 'gerant' && pourcent > limite + 1e-9;
}

// Nombre de nuits d'un séjour comprises dans un mois donné (AAAA-MM).
function nuitsDansMois(arrivee, depart, mois) {
  const debutMois = versDate(mois + '-01');
  const finMois = new Date(Date.UTC(debutMois.getUTCFullYear(), debutMois.getUTCMonth() + 1, 1));
  const debut = Math.max(versDate(arrivee), debutMois);
  const fin = Math.min(versDate(depart), finMois);
  return Math.max(0, Math.round((fin - debut) / JOUR));
}

function joursDuMois(mois) {
  const d = versDate(mois + '-01');
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
}

// Ramène une charge fixe à son montant mensuel.
function chargeMensuelle({ montant, periodicite }) {
  return Math.round(montant / ({ mensuelle: 1, trimestrielle: 3, annuelle: 12 }[periodicite] || 1));
}

// Abonnement Loka : 2 500 FCFA par bien loué à la nuit, 1 000 par bien loué au mois, minimum 25 000 par mois.
function abonnementMensuel({ nuit = 0, mois = 0 } = {}, { parNuit = 2500, parMois = 1000, minimum = 25000 } = {}) {
  return Math.max(minimum, nuit * parNuit + mois * parMois);
}

const numeroRecu = (n) => 'R-' + String(n).padStart(5, '0');

// Essai gratuit d'un nouvel espace : 14 jours, puis l'administration Loka active l'abonnement.
const JOURS_ESSAI = 14;
const finEssai = (depuis = new Date()) => new Date(depuis.getTime() + JOURS_ESSAI * 86400000).toISOString().slice(0, 10);

// Le loyer d'un mois n'est dû que si son échéance tombe après le début du bail :
// un bail signé le 28 avec une échéance le 5 paie son premier loyer le 5 du mois suivant.
const echeanceDuMois = (bail, mois) => `${mois}-${String(bail.jour_echeance).padStart(2, '0')}`;
const loyerDu = (bail, mois) => bail.debut <= echeanceDuMois(bail, mois);

// ---------- Règles de séjour (arrivée, départ, annulation) ----------
// Ouagadougou est à UTC+0 : une date et une heure locales se lisent directement en UTC.
const instant = (jour, heure = '00:00') => new Date(`${jour}T${heure}:00Z`);
const acompteMinimum = (total, pourcent) => Math.ceil((total * pourcent) / 100);

// Annulation par le client : gratuite avant le délai, une pénalité (en nuits) ensuite ;
// après l'heure d'arrivée, c'est une non-présentation (même pénalité). Par le bailleur : rien n'est retenu au client.
function annulation({ par, arrivee, prixNuit, total, regles, maintenant = new Date() }) {
  if (par === 'bailleur') return { type: 'bailleur', penalite: 0 };
  const debut = instant(arrivee, regles.heure_arrivee);
  const penalite = Math.min(total, regles.penalite_nuits * prixNuit);
  if (maintenant >= debut) return { type: 'absence', penalite };
  if (debut - maintenant > regles.delai_annulation_heures * 3600e3) return { type: 'gratuite', penalite: 0 };
  return { type: 'tardive', penalite };
}

// Départ après l'heure prévue (au-delà de la tolérance) : une nuit de plus est due.
const departTardif = ({ depart, regles, maintenant = new Date() }) =>
  maintenant.getTime() > instant(depart, regles.heure_depart).getTime() + regles.tolerance_depart_minutes * 60e3;

// Pénalité d'un bailleur qui annule une réservation de la place de marché : 10 % du séjour, 5 000 F au moins.
const penaliteBailleur = (total) => Math.max(Math.round(total * 0.1), 5000);

// Note de classement d'un bailleur sur la place de marché (0 à 1) : moyenne des avis lissée
// (un nouveau bailleur part de 4/5), multipliée par le carré de sa fiabilité (annuler fait vite reculer).
function noteClassement({ somme = 0, nombre = 0, fiabilite = 1 }) {
  const lissee = (3 * 4 + somme) / (3 + nombre);
  return Math.round((lissee / 5) * fiabilite ** 2 * 1000) / 1000;
}

module.exports = { instant, acompteMinimum, annulation, departTardif, penaliteBailleur, noteClassement, loyerDu, JOURS_ESSAI, finEssai, nuitsEntre, prixSejour, besoinValidation, nuitsDansMois, joursDuMois, chargeMensuelle, abonnementMensuel, numeroRecu, versTexte };
