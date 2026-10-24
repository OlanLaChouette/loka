const { Journal } = require('../models');

// Enregistre une action dans le journal de l'espace. Ne bloque jamais l'action principale.
async function noter(req, action, entite, entiteId, details = {}, transaction) {
  try {
    await Journal.create({
      bailleur_id: req.espace.id, utilisateur_id: req.utilisateur.id,
      action, entite, entite_id: entiteId, details,
    }, { transaction });
  } catch (e) {
    console.error('Journal :', e.message);
  }
}

module.exports = { noter };
