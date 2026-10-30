// Libère les réservations de la place de marché dont l'acompte n'a pas été payé à temps (2 h après acceptation).
// Tourne au-dessus de tous les bailleurs (mode plateforme), dans sa propre transaction.
const { Op } = require('sequelize');
const { sequelize, Reservation, Paiement, Demande } = require('../models');

async function expirerReservations(maintenant = new Date()) {
  return sequelize.transaction(async (t) => {
    await sequelize.query("SELECT set_config('app.plateforme', 'on', true)", { transaction: t });
    const echues = await Reservation.findAll({ where: { statut: 'confirmee', expire_le: { [Op.lt]: maintenant } }, include: [Paiement], transaction: t });
    let n = 0;
    for (const r of echues) {
      if (r.Paiements.length) { await r.update({ expire_le: null }, { transaction: t }); continue; }
      await r.update({ statut: 'annulee', annule_le: maintenant, annule_par: 'expiration', motif_annulation: 'Acompte non reçu dans le délai', expire_le: null }, { transaction: t });
      if (r.demande_id) await Demande.update({ statut: 'expiree' }, { where: { id: r.demande_id }, transaction: t });
      n++;
    }
    return n;
  });
}

// Lancement périodique (toutes les 30 minutes) par le serveur. Pas plus souvent : Neon ne se met en veille
// qu'après 5 minutes sans requête, et une base qui ne dort jamais épuise son quota gratuit.
function demarrerExpirations() {
  const tourner = () => expirerReservations().then(n => { if (n) console.log(`${n} réservation(s) libérée(s) faute d’acompte`); }).catch(e => console.error('Expirations :', e.message));
  setTimeout(tourner, 10000);
  return setInterval(tourner, 30 * 60 * 1000);
}

module.exports = { expirerReservations, demarrerExpirations };
