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

module.exports = { nuitsEntre, prixSejour, besoinValidation, nuitsDansMois, joursDuMois, chargeMensuelle, abonnementMensuel, numeroRecu, versTexte };
