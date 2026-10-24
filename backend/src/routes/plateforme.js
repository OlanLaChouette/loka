// Administration Loka : au-dessus de tous les bailleurs (création d'espaces, suivi des biens facturés, suspension).
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { fn, col } = require('sequelize');
const { sequelize, Bailleur, Utilisateur, Membre, Bien, Site } = require('../models');
const { authentifier, adminPlateforme } = require('../middleware/auth');
const { Erreur, route } = require('../utils/erreurs');
const { transaction, lier, definir } = require('../middleware/contexte');
const { abonnementMensuel } = require('../services/calculs');

router.use(authentifier, adminPlateforme);

router.get('/bailleurs', route(async (req, res) => {
  const bailleurs = await Bailleur.findAll({ order: [['cree_le', 'DESC']] });
  const biens = await Bien.findAll({ attributes: ['bailleur_id', [fn('COUNT', col('id')), 'n']], where: { etat: ['disponible', 'travaux'] }, group: ['bailleur_id'], raw: true });
  const sites = await Site.findAll({ attributes: ['bailleur_id', [fn('COUNT', col('id')), 'n']], group: ['bailleur_id'], raw: true });
  const parId = (l) => Object.fromEntries(l.map(x => [x.bailleur_id, Number(x.n)]));
  const nb = parId(biens), ns = parId(sites);
  res.json(bailleurs.map(b => ({
    ...b.toJSON(), biens_enregistres: nb[b.id] || 0, sites: ns[b.id] || 0,
    abonnement_mensuel: abonnementMensuel(nb[b.id] || 0),
  })));
}));

// Crée un espace bailleur et son propriétaire en une fois.
router.post('/bailleurs', route(async (req, res) => {
  const { bailleur = {}, proprietaire = {} } = req.body || {};
  if (!bailleur.nom) throw new Erreur(400, 'Nom du bailleur requis');
  if (!proprietaire.nom || !proprietaire.telephone || !proprietaire.mot_de_passe) throw new Erreur(400, 'Nom, téléphone et mot de passe du propriétaire requis');
  const resultat = await transaction(async (t) => {
    const essaiFin = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    const b = await Bailleur.create({ ...bailleur, statut: 'essai', essai_fin: essaiFin }, { transaction: t });
    let u = await Utilisateur.findOne({ where: { telephone: proprietaire.telephone }, transaction: t });
    if (!u) u = await Utilisateur.create({
      nom: proprietaire.nom, telephone: proprietaire.telephone, email: proprietaire.email || null,
      mot_de_passe_hash: await bcrypt.hash(proprietaire.mot_de_passe, 10),
    }, { transaction: t });
    await Membre.create({ bailleur_id: b.id, utilisateur_id: u.id, role: 'proprietaire' }, { transaction: t });
    return b;
  });
  res.status(201).json(resultat);
}));

router.patch('/bailleurs/:id/statut', route(async (req, res) => {
  const b = await Bailleur.findByPk(req.params.id);
  if (!b) throw new Erreur(404, 'Bailleur introuvable');
  if (!['essai', 'actif', 'suspendu'].includes(req.body.statut)) throw new Erreur(400, 'Statut inconnu');
  await b.update({ statut: req.body.statut });
  res.json(b);
}));

module.exports = router;
