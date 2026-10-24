const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { Op } = require('sequelize');
const { Utilisateur, Membre, Bailleur } = require('../models');
const { authentifier } = require('../middleware/auth');
const { Erreur, route } = require('../utils/erreurs');
const { transaction, lier, definir } = require('../middleware/contexte');

const limiteur = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, message: { message: 'Trop de tentatives, réessayez dans 15 minutes' } });

async function espacesDe(utilisateurId) {
  const membres = await Membre.findAll({ where: { utilisateur_id: utilisateurId, actif: true }, include: [Bailleur] });
  return membres.map(m => ({
    id: m.Bailleur.id, nom: m.Bailleur.nom, logo: m.Bailleur.logo_chemin ? `/api/fichiers/logo/${m.Bailleur.id}` : null,
    statut: m.Bailleur.statut, role: m.role,
  }));
}

// Connexion par téléphone ou e-mail.
router.post('/connexion', limiteur, route(async (req, res) => {
  const { identifiant, mot_de_passe } = req.body || {};
  if (!identifiant || !mot_de_passe) throw new Erreur(400, 'Identifiant et mot de passe requis');
  const ident = String(identifiant).trim().toLowerCase().replace(/\s+/g, '');
  const utilisateur = await Utilisateur.scope('avecSecret').findOne({ where: { [Op.or]: [{ telephone: ident }, { email: ident }] } });
  if (!utilisateur || !utilisateur.actif || !(await bcrypt.compare(mot_de_passe, utilisateur.mot_de_passe_hash))) {
    throw new Erreur(401, 'Identifiant ou mot de passe incorrect');
  }
  await definir('app.utilisateur_id', utilisateur.id);
  const jeton = jwt.sign({ id: utilisateur.id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });
  const { mot_de_passe_hash, ...profil } = utilisateur.toJSON();
  res.json({ jeton, utilisateur: profil, espaces: await espacesDe(utilisateur.id) });
}));

router.get('/moi', authentifier, route(async (req, res) => {
  res.json({ utilisateur: req.utilisateur, espaces: await espacesDe(req.utilisateur.id) });
}));

// Le mode clair ou sombre est retenu par compte.
router.patch('/moi/theme', authentifier, route(async (req, res) => {
  if (!['clair', 'sombre'].includes(req.body.theme)) throw new Erreur(400, 'Thème inconnu');
  await req.utilisateur.update({ theme: req.body.theme });
  res.json({ theme: req.utilisateur.theme });
}));

router.patch('/moi/mot-de-passe', authentifier, route(async (req, res) => {
  const { actuel, nouveau } = req.body || {};
  if (!nouveau || nouveau.length < 8) throw new Erreur(400, 'Le nouveau mot de passe doit faire au moins 8 caractères');
  const u = await Utilisateur.scope('avecSecret').findByPk(req.utilisateur.id);
  if (!(await bcrypt.compare(actuel || '', u.mot_de_passe_hash))) throw new Erreur(400, 'Mot de passe actuel incorrect');
  await u.update({ mot_de_passe_hash: await bcrypt.hash(nouveau, 10) });
  res.json({ ok: true });
}));

module.exports = { router, espacesDe };
