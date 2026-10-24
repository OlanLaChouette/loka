class Erreur extends Error {
  constructor(statut, message, details) {
    super(message);
    this.statut = statut;
    this.details = details;
  }
}

// Enveloppe une route async pour transmettre ses erreurs à Express.
const route = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function gestionnaireErreurs(err, req, res, next) { // eslint-disable-line no-unused-vars
  if (err.name === 'SequelizeValidationError' || err.name === 'SequelizeUniqueConstraintError') {
    const champs = (err.errors || []).map(e => e.path);
    const message = err.name === 'SequelizeUniqueConstraintError' ? 'Cette valeur existe déjà' : 'Données invalides';
    return res.status(400).json({ message, champs });
  }
  if (err instanceof Erreur) return res.status(err.statut).json({ message: err.message, details: err.details });
  console.error(err);
  res.status(500).json({ message: 'Erreur interne du serveur' });
}

module.exports = { Erreur, route, gestionnaireErreurs };
