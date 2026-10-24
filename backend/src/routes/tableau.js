// Chiffres du tableau de bord d'un espace, pour un mois donné (AAAA-MM).
const router = require('express').Router();
const path = require('path');
const fs = require('fs');
const { Op, fn, col, literal } = require('sequelize');
const { Bien, Site, Reservation, Bail, Paiement, Depense, ChargeFixe, Journal, Utilisateur, Bailleur, Client } = require('../models');
const { authentifier, espace, portee } = require('../middleware/auth');
const { Erreur, route } = require('../utils/erreurs');
const { transaction, lier, definir } = require('../middleware/contexte');
const { nuitsDansMois, joursDuMois, chargeMensuelle, versTexte } = require('../services/calculs');
const { DOSSIER } = require('./espace');

const LIBELLES = {
  reservation_creee: 'a enregistré une réservation', reduction_a_valider: 'demande une réduction hors limite', reduction_validee: 'a validé une réduction',
  reservation_annulee: 'a annulé une réservation', paiement_encaisse: 'a encaissé un paiement', depense_saisie: 'a noté une dépense',
  depense_acceptee: 'a accepté une dépense', depense_refusee: 'a refusé une dépense', bail_cree: 'a créé un bail', bail_termine: 'a terminé un bail',
  prix_modifie: 'a modifié un prix', etat_modifie: 'a changé l’état d’un bien', bien_ajoute: 'a ajouté un bien', charge_ajoutee: 'a ajouté une charge fixe',
  charge_modifiee: 'a modifié une charge fixe', charge_retiree: 'a retiré une charge fixe', membre_ajoute: 'a ajouté un membre', membre_modifie: 'a modifié un membre', profil_modifie: 'a modifié l’entreprise',
};

router.get('/tableau-de-bord', authentifier, espace, route(async (req, res) => {
  const mois = /^\d{4}-\d{2}$/.test(req.query.mois || '') ? req.query.mois : versTexte(new Date()).slice(0, 7);
  const debut = mois + '-01';
  const jours = joursDuMois(mois);
  const fin = mois + '-' + String(jours).padStart(2, '0');
  const lendemain = versTexte(new Date(Date.UTC(+mois.slice(0, 4), +mois.slice(5, 7), 1)));
  const aujourdhui = versTexte(new Date());

  const [biens, sites, resas, baux, paiementsMois, depensesMois, charges] = await Promise.all([
    Bien.findAll({ where: portee(req, { etat: { [Op.ne]: 'retire' } }) }),
    Site.findAll({ where: req.sitesAutorises ? { bailleur_id: req.espace.id, id: req.sitesAutorises } : { bailleur_id: req.espace.id }, order: [['nom', 'ASC']] }),
    Reservation.findAll({ where: portee(req, { statut: { [Op.ne]: 'annulee' }, arrivee: { [Op.lt]: lendemain }, depart: { [Op.gt]: debut } }), include: [Paiement, Client, Bien] }),
    Bail.findAll({ where: portee(req, { statut: 'actif' }), include: [Paiement, Bien, Client] }),
    Paiement.findAll({ where: portee(req, { date_paiement: { [Op.between]: [debut, fin] } }) }),
    Depense.findAll({ where: portee(req, { date_depense: { [Op.between]: [debut, fin] } }) }),
    ChargeFixe.findAll({ where: { bailleur_id: req.espace.id, actif: true } }),
  ]);

  const confirmees = resas.filter(r => r.statut === 'confirmee');
  const nuitsVendues = confirmees.reduce((s, r) => s + nuitsDansMois(r.arrivee, r.depart, mois), 0);
  const biensNuit = biens.filter(b => b.mode === 'nuit' && b.etat === 'disponible');
  const capacite = biensNuit.length * jours;
  const encaisse = paiementsMois.reduce((s, p) => s + p.montant, 0);
  const reductions = confirmees.filter(r => r.arrivee >= debut).reduce((s, r) => s + r.reduction, 0);
  const depenses = depensesMois.filter(d => d.statut === 'acceptee').reduce((s, d) => s + d.montant, 0);
  const chargesMois = charges.reduce((s, c) => s + chargeMensuelle(c), 0);

  // Reste à encaisser : séjours commencés non soldés + loyers échus du mois non payés.
  const impayes = [];
  for (const r of confirmees) {
    const reste = r.total - r.Paiements.reduce((s, p) => s + p.montant, 0);
    if (reste > 0 && r.arrivee <= aujourdhui) impayes.push({ type: 'sejour', id: r.id, bien_id: r.bien_id, reference: r.Bien?.reference, client: r.Client?.nom, telephone: r.Client?.telephone, montant: reste });
  }
  const jourCourant = aujourdhui.slice(0, 7) === mois ? Number(aujourdhui.slice(8)) : (mois < aujourdhui.slice(0, 7) ? 31 : 0);
  let loyersPayes = 0;
  for (const b of baux) {
    const paye = b.Paiements.filter(p => p.periode === mois).reduce((s, p) => s + p.montant, 0);
    if (paye >= b.loyer) loyersPayes++;
    else if (jourCourant >= b.jour_echeance && b.debut <= fin) impayes.push({ type: 'loyer', id: b.id, bien_id: b.bien_id, reference: b.Bien?.reference, client: b.Client?.nom, telephone: b.Client?.telephone, mois, echeance: b.jour_echeance, montant: b.loyer - paye });
  }

  const parSite = sites.map(s => {
    const bs = biensNuit.filter(b => b.site_id === s.id);
    const n = confirmees.filter(r => r.site_id === s.id).reduce((a, r) => a + nuitsDansMois(r.arrivee, r.depart, mois), 0);
    const nbMois = biens.filter(b => b.site_id === s.id && b.mode === 'mois').length;
    const bauxSite = baux.filter(b => b.site_id === s.id);
    return {
      id: s.id, nom: s.nom, biens_nuit: bs.length, biens_mois: nbMois,
      occupation: bs.length ? Math.round(n / (bs.length * jours) * 100) : null,
      loyers_payes: bauxSite.filter(b => b.Paiements.filter(p => p.periode === mois).reduce((a, p) => a + p.montant, 0) >= b.loyer).length,
      baux_actifs: bauxSite.length,
    };
  });

  // Encaissements des 12 derniers mois.
  const il_y_a_un_an = versTexte(new Date(Date.UTC(+mois.slice(0, 4) - 1, +mois.slice(5, 7), 1)));
  const historique = await Paiement.findAll({
    attributes: [[fn('to_char', col('date_paiement'), 'YYYY-MM'), 'mois'], [fn('SUM', col('montant')), 'total']],
    where: portee(req, { date_paiement: { [Op.gte]: il_y_a_un_an, [Op.lt]: lendemain } }), group: [literal('1')], raw: true,
  });
  const evolution = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(+mois.slice(0, 4), +mois.slice(5, 7) - 1 - i, 1));
    const m = versTexte(d).slice(0, 7);
    evolution.push({ mois: m, total: Number(historique.find(h => h.mois === m)?.total || 0) });
  }

  const fil = await Journal.findAll({ where: { bailleur_id: req.espace.id }, include: [{ model: Utilisateur, attributes: ['nom'] }], order: [['cree_le', 'DESC']], limit: 8 });

  res.json({
    mois,
    encaisse, nuits_vendues: nuitsVendues, capacite_nuits: capacite,
    occupation: capacite ? Math.round(nuitsVendues / capacite * 100) : null,
    reductions, depenses, charges: chargesMois, benefice: encaisse - depenses - chargesMois,
    reste_a_encaisser: impayes.reduce((s, i) => s + i.montant, 0), impayes,
    baux: { actifs: baux.length, payes: loyersPayes },
    a_traiter: {
      depenses: await Depense.count({ where: portee(req, { statut: 'en_attente' }) }),
      reductions: await Reservation.count({ where: portee(req, { statut: 'attente_validation' }) }),
    },
    biens: { total: biens.length, libres_ce_soir: biensNuit.filter(b => !confirmees.some(r => r.bien_id === b.id && r.arrivee <= aujourdhui && r.depart > aujourdhui)).length },
    sites: parSite, evolution,
    fil: fil.map(j => ({ quand: j.cree_le, qui: j.Utilisateur?.nom, texte: LIBELLES[j.action] || j.action, details: j.details })),
  });
}));

// ---------- Fichiers protégés ----------
router.get('/fichiers/logo/:bailleurId', route(async (req, res) => {
  // Le logo est public (il figure sur les reçus) : lecture du seul chemin, en mode plateforme.
  if (!/^[0-9a-f-]{36}$/i.test(req.params.bailleurId)) throw new Erreur(404, 'Pas de logo');
  await definir('app.plateforme', 'on');
  const b = await Bailleur.findByPk(req.params.bailleurId, { attributes: ['logo_chemin'] });
  if (!b?.logo_chemin) throw new Erreur(404, 'Pas de logo');
  res.sendFile(path.join(DOSSIER, b.logo_chemin));
}));
router.get('/fichiers/justificatif/:id', authentifier, espace, route(async (req, res) => {
  const d = await Depense.findOne({ where: portee(req, { id: req.params.id }) });
  if (!d?.justificatif_chemin) throw new Erreur(404, 'Pas de justificatif');
  const fichier = path.join(DOSSIER, d.justificatif_chemin);
  if (!fichier.startsWith(DOSSIER) || !fs.existsSync(fichier)) throw new Erreur(404, 'Fichier introuvable');
  res.sendFile(fichier);
}));

module.exports = router;
