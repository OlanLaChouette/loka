const jwt = require('jsonwebtoken');
const { Utilisateur, Membre, Bailleur } = require('../models');
const { Erreur } = require('../utils/erreurs');
const { definir } = require('./contexte');

// Vérifie le jeton et charge l'utilisateur.
async function authentifier(req, res, next) {
  try {
    const entete = req.headers.authorization || '';
    const jeton = entete.startsWith('Bearer ') ? entete.slice(7) : null;
    if (!jeton) throw new Erreur(401, 'Connexion requise');
    let charge;
    try { charge = jwt.verify(jeton, process.env.JWT_SECRET); } catch { throw new Erreur(401, 'Session expirée, reconnectez-vous'); }
    const utilisateur = await Utilisateur.findByPk(charge.id);
    if (!utilisateur || !utilisateur.actif) throw new Erreur(401, 'Compte désactivé');
    await definir('app.utilisateur_id', utilisateur.id);
    req.utilisateur = utilisateur;
    next();
  } catch (e) { next(e); }
}

// Résout l'espace bailleur demandé (en-tête X-Espace) et le rôle de l'utilisateur dans cet espace.
// Après ce middleware : req.espace (le bailleur), req.membre, req.role, req.sitesAutorises (null = tous).
async function espace(req, res, next) {
  try {
    const bailleurId = req.headers['x-espace'];
    if (!bailleurId) throw new Erreur(400, 'Espace bailleur non précisé');
    if (!/^[0-9a-f-]{36}$/i.test(bailleurId)) throw new Erreur(400, 'Espace bailleur invalide');
    await definir('app.bailleur_id', bailleurId);
    const membre = await Membre.findOne({
      where: { bailleur_id: bailleurId, utilisateur_id: req.utilisateur.id, actif: true },
      include: [Bailleur],
    });
    if (!membre) throw new Erreur(403, 'Vous n’avez pas accès à cet espace');
    if (membre.Bailleur.statut === 'suspendu' && req.method !== 'GET') {
      throw new Erreur(402, 'Espace suspendu : seule la consultation est possible. Contactez Loka pour régulariser.');
    }
    req.espace = membre.Bailleur;
    req.membre = membre;
    req.role = membre.role;
    req.sitesAutorises = membre.role === 'gerant' && membre.sites && membre.sites.length ? membre.sites : null;
    next();
  } catch (e) { next(e); }
}

// Limite une route à certains rôles.
const autoriser = (...roles) => (req, res, next) =>
  roles.includes(req.role) ? next() : next(new Erreur(403, 'Action réservée : ' + roles.join(', ')));

// Le comptable ne fait que consulter.
const ecriture = (req, res, next) =>
  req.role === 'comptable' ? next(new Erreur(403, 'Le comptable a un accès en consultation seulement')) : next();

async function adminPlateforme(req, res, next) {
  try {
    if (!req.utilisateur.est_admin_plateforme) throw new Erreur(403, 'Réservé à l’administration Loka');
    await definir('app.plateforme', 'on');
    next();
  } catch (e) { next(e); }
}

// Filtre commun à toute requête métier : toujours l'espace courant, et les sites du gérant.
function portee(req, extra = {}) {
  const { Op } = require('sequelize');
  const filtre = { bailleur_id: req.espace.id, ...extra };
  if (req.sitesAutorises) filtre.site_id = extra.site_id
    ? (req.sitesAutorises.includes(extra.site_id) ? extra.site_id : '00000000-0000-0000-0000-000000000000')
    : { [Op.in]: req.sitesAutorises };
  return filtre;
}

function verifierSite(req, siteId) {
  if (req.sitesAutorises && !req.sitesAutorises.includes(siteId)) throw new Erreur(403, 'Ce site ne fait pas partie des vôtres');
}

module.exports = { authentifier, espace, autoriser, ecriture, adminPlateforme, portee, verifierSite };
