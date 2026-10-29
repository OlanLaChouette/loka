// Administration Loka : au-dessus de tous les bailleurs (création d'espaces, suivi des biens facturés, suspension).
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { fn, col } = require('sequelize');
const { Op } = require('sequelize');
const { sequelize, Bailleur, Utilisateur, Membre, Bien, Site, Reservation, Avis } = require('../models');
const { authentifier, adminPlateforme } = require('../middleware/auth');
const { Erreur, route } = require('../utils/erreurs');
const { transaction, lier, definir } = require('../middleware/contexte');
const { abonnementMensuel, finEssai } = require('../services/calculs');

router.use(authentifier, adminPlateforme);

router.get('/bailleurs', route(async (req, res) => {
  const bailleurs = await Bailleur.findAll({ order: [['cree_le', 'DESC']] });
  const proprietaires = await Membre.findAll({ where: { role: 'proprietaire' }, include: [{ model: Utilisateur, attributes: ['nom', 'telephone', 'email'] }] });
  const proprioDe = Object.fromEntries(proprietaires.map(m => [m.bailleur_id, m.Utilisateur]));
  const biens = await Bien.findAll({ attributes: ['bailleur_id', 'mode', [fn('COUNT', col('id')), 'n']], where: { etat: ['disponible', 'travaux'] }, group: ['bailleur_id', 'mode'], raw: true });
  const sites = await Site.findAll({ attributes: ['bailleur_id', [fn('COUNT', col('id')), 'n']], group: ['bailleur_id'], raw: true });
  const parId = (l) => Object.fromEntries(l.map(x => [x.bailleur_id, Number(x.n)]));
  const ns = parId(sites);
  // Place de marché : pénalités des bailleurs qui ont annulé ce mois-ci (à facturer avec l'abonnement), et avis reçus.
  const debutMois = new Date(); debutMois.setUTCDate(1); debutMois.setUTCHours(0, 0, 0, 0);
  const penalites = await Reservation.findAll({ attributes: ['bailleur_id', [fn('SUM', col('penalite_bailleur')), 'n'], [fn('COUNT', col('id')), 'nb']], where: { annule_par: 'bailleur', source: 'place_de_marche', annule_le: { [Op.gte]: debutMois } }, group: ['bailleur_id'], raw: true });
  const avis = await Avis.findAll({ attributes: ['bailleur_id', [fn('COUNT', col('id')), 'nb'], [fn('AVG', col('note')), 'moyenne']], group: ['bailleur_id'], raw: true });
  const P = Object.fromEntries(penalites.map(x => [x.bailleur_id, x])), A = Object.fromEntries(avis.map(x => [x.bailleur_id, x]));
  const parMode = {};
  for (const x of biens) { parMode[x.bailleur_id] = parMode[x.bailleur_id] || { nuit: 0, mois: 0 }; parMode[x.bailleur_id][x.mode] = Number(x.n); }
  const nb = Object.fromEntries(Object.entries(parMode).map(([k, v]) => [k, v.nuit + v.mois]));
  res.json(bailleurs.map(b => ({
    ...b.toJSON(), proprietaire: proprioDe[b.id] || null, biens_enregistres: nb[b.id] || 0, sites: ns[b.id] || 0,
    biens_nuit: parMode[b.id]?.nuit || 0, biens_mois: parMode[b.id]?.mois || 0,
    abonnement_mensuel: abonnementMensuel(parMode[b.id] || {}),
    penalites_mois: Number(P[b.id]?.n || 0), annulations_mois: Number(P[b.id]?.nb || 0),
    note: A[b.id] ? Math.round(Number(A[b.id].moyenne) * 10) / 10 : null, avis: Number(A[b.id]?.nb || 0),
  })));
}));

// Crée un espace bailleur et son propriétaire en une fois.
router.post('/bailleurs', route(async (req, res) => {
  const { bailleur = {}, proprietaire = {} } = req.body || {};
  if (!bailleur.nom) throw new Erreur(400, 'Nom du bailleur requis');
  if (!proprietaire.nom || !proprietaire.telephone || !proprietaire.mot_de_passe) throw new Erreur(400, 'Nom, téléphone et mot de passe du propriétaire requis');
  const resultat = await transaction(async (t) => {
    const b = await Bailleur.create({ ...bailleur, statut: 'essai', essai_fin: finEssai(), origine: 'plateforme' }, { transaction: t });
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

// Redonne un mot de passe provisoire au propriétaire d'un espace (oubli, premier envoi perdu…).
router.post('/bailleurs/:id/mot-de-passe', route(async (req, res) => {
  const { mot_de_passe } = req.body || {};
  if (!mot_de_passe || mot_de_passe.length < 8) throw new Erreur(400, 'Mot de passe de 8 caractères minimum');
  const m = await Membre.findOne({ where: { bailleur_id: req.params.id, role: 'proprietaire' } });
  if (!m) throw new Erreur(404, 'Propriétaire introuvable');
  await Utilisateur.update({ mot_de_passe_hash: await bcrypt.hash(mot_de_passe, 10) }, { where: { id: m.utilisateur_id } });
  res.json({ ok: true });
}));

// Propriétaire de chaque espace, pour l'afficher dans la liste.
router.get('/bailleurs/:id/proprietaire', route(async (req, res) => {
  const m = await Membre.findOne({ where: { bailleur_id: req.params.id, role: 'proprietaire' }, include: [{ model: Utilisateur, attributes: ['nom', 'telephone', 'email'] }] });
  if (!m) throw new Erreur(404, 'Propriétaire introuvable');
  res.json(m.Utilisateur);
}));

module.exports = router;
