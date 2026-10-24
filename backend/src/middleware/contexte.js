// Chaque requête API s'exécute dans une transaction PostgreSQL où l'on inscrit qui agit et dans quel espace.
// Les règles de séparation (RLS) de la base s'appuient sur ces valeurs : même une requête mal filtrée
// dans le code ne peut pas lire ou modifier les données d'un autre bailleur.
// La transaction est validée juste avant l'envoi de la réponse (annulée si la réponse est une erreur).
const sequelize = require('../config/database');

function contexteRequete(req, res, next) {
  sequelize.contexte.run(() => {
    let terminer;
    const reponsePrete = new Promise((r) => { terminer = r; });
    const finOriginale = res.end;
    res.end = function retenir(...args) { res.end = finOriginale; terminer(args); return res; };

    sequelize.transaction(async () => {
      next();
      const args = await reponsePrete;
      if (res.statusCode >= 400) { const e = new Error('annulation'); e.annulation = true; e.args = args; throw e; }
      return args;
    })
      .then((args) => finOriginale.apply(res, args))
      .catch((e) => {
        if (e.annulation) return finOriginale.apply(res, e.args);
        console.error(e);
        if (!res.headersSent) { res.statusCode = 500; res.setHeader('Content-Type', 'application/json'); }
        finOriginale.call(res, JSON.stringify({ message: 'Erreur interne du serveur' }));
      });
  });
}

// Inscrit une valeur pour la transaction en cours (portée locale : disparaît à la fin de la requête).
const definir = (cle, valeur) => sequelize.query('SELECT set_config(:cle, :valeur, true)', { replacements: { cle, valeur: String(valeur) } });

// Transaction imbriquée (point de sauvegarde) dans celle de la requête.
const transaction = (fn) => sequelize.transaction({ transaction: sequelize.contexte.get('transaction') }, fn);

// Les bibliothèques à base de flux (envoi de fichiers) perdent le contexte : on le rattache.
const lier = (middleware) => (req, res, next) => middleware(req, res, sequelize.contexte.bind(next));

module.exports = { contexteRequete, definir, transaction, lier };
