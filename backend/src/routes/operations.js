// Le quotidien : clients, réservations, baux, encaissements, dépenses.
const router = require('express').Router();
const { Op } = require('sequelize');
const { sequelize, Bien, Site, Client, Reservation, Bail, Paiement, Depense, Utilisateur, Fichier } = require('../models');
const { authentifier, espace, autoriser, ecriture, portee, verifierSite } = require('../middleware/auth');
const { Erreur, route } = require('../utils/erreurs');
const { transaction, lier, definir } = require('../middleware/contexte');
const { noter } = require('../utils/journal');
const { nuitsEntre, prixSejour, besoinValidation, numeroRecu, versTexte } = require('../services/calculs');
const { recevoirJustificatif, enregistrer } = require('../utils/fichiers');

router.use(authentifier, espace);
const aujourdhui = () => versTexte(new Date());

async function bienAccessible(req, bienId, transaction) {
  const bien = await Bien.findOne({ where: portee(req, { id: bienId || null }), transaction });
  if (!bien) throw new Erreur(404, 'Bien introuvable');
  return bien;
}

// ---------- Clients ----------
router.get('/clients', route(async (req, res) => {
  const where = { bailleur_id: req.espace.id };
  if (req.query.q) where[Op.or] = [{ nom: { [Op.iLike]: `%${req.query.q}%` } }, { telephone: { [Op.iLike]: `%${req.query.q}%` } }];
  res.json(await Client.findAll({ where, order: [['nom', 'ASC']], limit: 50 }));
}));
router.post('/clients', ecriture, route(async (req, res) => {
  const { nom, telephone, piece_type, piece_numero, notes } = req.body || {};
  res.status(201).json(await Client.create({ nom, telephone, piece_type, piece_numero, notes, bailleur_id: req.espace.id }));
}));

// ---------- Réservations (location à la nuit) ----------
router.get('/reservations', route(async (req, res) => {
  const extra = {};
  if (req.query.du && req.query.au) { extra.depart = { [Op.gt]: req.query.du }; extra.arrivee = { [Op.lt]: req.query.au }; }
  if (req.query.statut) extra.statut = req.query.statut;
  const liste = await Reservation.findAll({ where: portee(req, extra), include: [Bien, Client, Paiement], order: [['arrivee', 'ASC']] });
  res.json(liste.map(r => ({ ...r.toJSON(), paye: r.Paiements.reduce((s, p) => s + p.montant, 0) })));
}));

router.post('/reservations', ecriture, route(async (req, res) => {
  const { bien_id, client_id, client, arrivee, depart, reduction, reduction_motif } = req.body || {};
  const resa = await transaction(async (t) => {
    const bien = await bienAccessible(req, bien_id, t);
    if (bien.mode !== 'nuit') throw new Erreur(400, 'Ce bien se loue au mois : créez un bail');
    if (bien.etat !== 'disponible') throw new Erreur(409, 'Ce bien n’est pas disponible (travaux ou retiré)');
    let nuits;
    try { nuits = nuitsEntre(arrivee, depart); } catch (e) { throw new Erreur(400, e.message); }
    // Une même nuit ne peut pas être vendue deux fois.
    const conflit = await Reservation.findOne({ where: { bien_id: bien.id, statut: { [Op.ne]: 'annulee' }, arrivee: { [Op.lt]: depart }, depart: { [Op.gt]: arrivee } }, transaction: t, lock: t.LOCK.UPDATE });
    if (conflit) throw new Erreur(409, `Déjà réservé du ${conflit.arrivee} au ${conflit.depart}`);
    let prix;
    try { prix = prixSejour({ prixNuit: bien.prix_nuit || 0, nuits, reduction }); } catch (e) { throw new Erreur(400, e.message); }
    if (prix.reduction > 0 && !reduction_motif) throw new Erreur(400, 'Indiquez la raison de la réduction');
    const limite = req.membre.limite_reduction ?? req.espace.limite_reduction_defaut;
    const aValider = besoinValidation({ role: req.role, pourcent: prix.pourcent, limite });
    let idClient = client_id;
    if (!idClient) {
      if (!client?.nom) throw new Erreur(400, 'Client requis');
      idClient = (await Client.create({ ...client, bailleur_id: req.espace.id }, { transaction: t })).id;
    } else if (!(await Client.findOne({ where: { id: idClient, bailleur_id: req.espace.id }, transaction: t }))) throw new Erreur(404, 'Client introuvable');
    return Reservation.create({
      bailleur_id: req.espace.id, site_id: bien.site_id, bien_id: bien.id, client_id: idClient, arrivee, depart, nuits,
      prix_nuit: bien.prix_nuit, prix_normal: prix.prixNormal, reduction: prix.reduction, reduction_motif: reduction_motif || null,
      total: prix.total, statut: aValider ? 'attente_validation' : 'confirmee', cree_par: req.utilisateur.id,
    }, { transaction: t });
  });
  await noter(req, resa.statut === 'attente_validation' ? 'reduction_a_valider' : 'reservation_creee', 'reservation', resa.id, { total: resa.total, reduction: resa.reduction });
  res.status(201).json(resa);
}));

router.post('/reservations/:id/valider', autoriser('proprietaire'), route(async (req, res) => {
  const r = await Reservation.findOne({ where: { id: req.params.id, bailleur_id: req.espace.id, statut: 'attente_validation' } });
  if (!r) throw new Erreur(404, 'Aucune réduction en attente pour cette réservation');
  await r.update({ statut: 'confirmee', validee_par: req.utilisateur.id });
  await noter(req, 'reduction_validee', 'reservation', r.id, { reduction: r.reduction });
  res.json(r);
}));
router.post('/reservations/:id/annuler', ecriture, route(async (req, res) => {
  const r = await Reservation.findOne({ where: portee(req, { id: req.params.id }), include: [Paiement] });
  if (!r) throw new Erreur(404, 'Réservation introuvable');
  if (r.Paiements.length && req.role !== 'proprietaire') throw new Erreur(403, 'Réservation déjà payée : seul le propriétaire peut l’annuler');
  await r.update({ statut: 'annulee' });
  await noter(req, 'reservation_annulee', 'reservation', r.id, { motif: req.body?.motif });
  res.json(r);
}));

// ---------- Baux (location au mois) ----------
router.get('/baux', route(async (req, res) => {
  res.json(await Bail.findAll({ where: portee(req, req.query.statut ? { statut: req.query.statut } : {}), include: [Bien, Client, Paiement], order: [['debut', 'DESC']] }));
}));
router.post('/baux', autoriser('proprietaire', 'gerant'), route(async (req, res) => {
  const { bien_id, client_id, client, debut, fin, loyer, jour_echeance, caution } = req.body || {};
  const bail = await transaction(async (t) => {
    const bien = await bienAccessible(req, bien_id, t);
    if (bien.mode !== 'mois') throw new Erreur(400, 'Ce bien se loue à la nuit : créez une réservation');
    if (await Bail.findOne({ where: { bien_id: bien.id, statut: 'actif' }, transaction: t })) throw new Erreur(409, 'Ce bien a déjà un bail en cours');
    let idClient = client_id;
    if (!idClient) idClient = (await Client.create({ ...client, bailleur_id: req.espace.id }, { transaction: t })).id;
    return Bail.create({ bailleur_id: req.espace.id, site_id: bien.site_id, bien_id: bien.id, client_id: idClient, debut, fin: fin || null, loyer: loyer ?? bien.prix_mois, jour_echeance, caution }, { transaction: t });
  });
  await noter(req, 'bail_cree', 'bail', bail.id, { loyer: bail.loyer });
  res.status(201).json(bail);
}));
router.post('/baux/:id/terminer', autoriser('proprietaire', 'gerant'), route(async (req, res) => {
  const b = await Bail.findOne({ where: portee(req, { id: req.params.id, statut: 'actif' }) });
  if (!b) throw new Erreur(404, 'Bail introuvable');
  await b.update({ statut: 'termine', fin: req.body?.fin || aujourdhui() });
  await noter(req, 'bail_termine', 'bail', b.id);
  res.json(b);
}));

// ---------- Encaissements (avec numéro de reçu) ----------
router.get('/paiements', route(async (req, res) => {
  const extra = {};
  if (req.query.du && req.query.au) extra.date_paiement = { [Op.between]: [req.query.du, req.query.au] };
  res.json(await Paiement.findAll({ where: portee(req, extra), include: [{ model: Reservation, include: [Bien, Client] }, { model: Bail, include: [Bien, Client] }], order: [['date_paiement', 'DESC'], ['cree_le', 'DESC']], limit: 200 }));
}));

router.post('/paiements', ecriture, route(async (req, res) => {
  const { reservation_id, bail_id, periode, montant, moyen, reference, date_paiement, cle_client } = req.body || {};
  if (cle_client) {
    const deja = await Paiement.findOne({ where: { bailleur_id: req.espace.id, cle_client } });
    if (deja) return res.status(200).json(deja);
  }
  if (!reservation_id === !bail_id) throw new Erreur(400, 'Un paiement concerne soit une réservation, soit un bail');
  const paiement = await transaction(async (t) => {
    let siteId;
    if (reservation_id) {
      const r = await Reservation.findOne({ where: portee(req, { id: reservation_id }), include: [Paiement], transaction: t });
      if (!r) throw new Erreur(404, 'Réservation introuvable');
      if (r.statut !== 'confirmee') throw new Erreur(409, r.statut === 'annulee' ? 'Réservation annulée' : 'Réduction en attente de validation du propriétaire');
      const reste = r.total - r.Paiements.reduce((s, p) => s + p.montant, 0);
      if (montant > reste) throw new Erreur(400, `Le reste à payer est de ${reste} FCFA`);
      siteId = r.site_id;
    } else {
      const b = await Bail.findOne({ where: portee(req, { id: bail_id }), transaction: t });
      if (!b) throw new Erreur(404, 'Bail introuvable');
      if (!/^\d{4}-\d{2}$/.test(periode || '')) throw new Erreur(400, 'Mois du loyer requis (AAAA-MM)');
      siteId = b.site_id;
    }
    // Numéro de reçu propre à chaque bailleur, sans doublon.
    await req.espace.reload({ transaction: t, lock: t.LOCK.UPDATE });
    const n = req.espace.dernier_numero_recu + 1;
    await req.espace.update({ dernier_numero_recu: n }, { transaction: t });
    return Paiement.create({
      bailleur_id: req.espace.id, site_id: siteId, reservation_id: reservation_id || null, bail_id: bail_id || null, periode: periode || null,
      montant, moyen, reference, date_paiement: date_paiement || aujourdhui(), numero_recu: numeroRecu(n), encaisse_par: req.utilisateur.id,
      cle_client: cle_client || null,
    }, { transaction: t });
  });
  await noter(req, 'paiement_encaisse', 'paiement', paiement.id, { montant: paiement.montant, moyen: paiement.moyen, recu: paiement.numero_recu });
  res.status(201).json(paiement);
}));

// ---------- Dépenses (saisies par les gérants, acceptées par le propriétaire) ----------

router.get('/depenses', route(async (req, res) => {
  const extra = req.query.statut ? { statut: req.query.statut } : {};
  const liste = await Depense.findAll({ where: portee(req, extra), include: [Bien, Site, { model: Utilisateur, as: 'auteur', attributes: ['id', 'nom'] }], order: [['date_depense', 'DESC'], ['cree_le', 'DESC']], limit: 200 });
  res.json(liste.map(d => ({ ...d.toJSON(), justificatif: d.justificatif_id ? `/api/fichiers/justificatif/${d.id}` : null })));
}));
router.post('/depenses', ecriture, lier(recevoirJustificatif), route(async (req, res) => {
  const { site_id, bien_id, categorie, montant, date_depense, note, cle_client } = req.body || {};
  if (cle_client) {
    const deja = await Depense.findOne({ where: { bailleur_id: req.espace.id, cle_client } });
    if (deja) return res.status(200).json(deja);
  }
  let site = site_id;
  if (bien_id) site = (await bienAccessible(req, bien_id)).site_id;
  if (!site) throw new Erreur(400, 'Site ou bien requis');
  verifierSite(req, site);
  if (!(await Site.findOne({ where: { id: site, bailleur_id: req.espace.id } }))) throw new Erreur(404, 'Site introuvable');
  const d = await Depense.create({
    bailleur_id: req.espace.id, site_id: site, bien_id: bien_id || null, categorie, montant: Number(montant), date_depense: date_depense || aujourdhui(), note,
    justificatif_id: await enregistrer(req.file, req.espace.id),
    // Le propriétaire n'a pas à valider ses propres dépenses.
    statut: req.role === 'proprietaire' ? 'acceptee' : 'en_attente', saisie_par: req.utilisateur.id,
    traitee_par: req.role === 'proprietaire' ? req.utilisateur.id : null,
    cle_client: cle_client || null,
  });
  await noter(req, 'depense_saisie', 'depense', d.id, { montant: d.montant, categorie: d.categorie });
  res.status(201).json(d);
}));
router.post('/depenses/:id/:decision(accepter|refuser)', autoriser('proprietaire'), route(async (req, res) => {
  const d = await Depense.findOne({ where: { id: req.params.id, bailleur_id: req.espace.id, statut: 'en_attente' } });
  if (!d) throw new Erreur(404, 'Aucune dépense en attente');
  const acceptee = req.params.decision === 'accepter';
  await d.update({ statut: acceptee ? 'acceptee' : 'refusee', traitee_par: req.utilisateur.id, motif_refus: acceptee ? null : (req.body?.motif || null) });
  await noter(req, acceptee ? 'depense_acceptee' : 'depense_refusee', 'depense', d.id, { montant: d.montant });
  res.json(d);
}));

// ---------- Documents PDF ----------
const documents = require('../services/documents');
// pdfkit lit le PNG et le JPEG seulement.
async function logoPdf(bailleur) {
  if (!bailleur.logo_id) return null;
  const f = await Fichier.findByPk(bailleur.logo_id);
  return f && ['image/png', 'image/jpeg'].includes(f.type) ? f.donnees : null;
}

router.get('/paiements/:id/recu.pdf', route(async (req, res) => {
  const p = await Paiement.findOne({ where: portee(req, { id: req.params.id }) });
  if (!p) throw new Erreur(404, 'Paiement introuvable');
  const reservation = p.reservation_id ? await Reservation.findByPk(p.reservation_id, { include: [Bien, Client] }) : null;
  const bail = p.bail_id ? await Bail.findByPk(p.bail_id, { include: [Bien, Client] }) : null;
  const cible = reservation || bail;
  // Total payé à la date de ce reçu (ce reçu compris), pour afficher le reste exact.
  const autres = await Paiement.findAll({ where: reservation ? { reservation_id: reservation.id } : { bail_id: bail.id, periode: p.periode } });
  const dejaPaye = autres.filter(a => a.numero_recu <= p.numero_recu).reduce((s, a) => s + a.montant, 0);
  const encaissePar = p.encaisse_par ? (await Utilisateur.findByPk(p.encaisse_par))?.nom : null;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="recu-${p.numero_recu}.pdf"`);
  documents.recu(res, { logo: await logoPdf(req.espace), paiement: p, bailleur: req.espace, reservation, bail, bien: cible.Bien, client: cible.Client, encaissePar, dejaPaye });
}));

router.get('/baux/:id/contrat.pdf', route(async (req, res) => {
  const b = await Bail.findOne({ where: portee(req, { id: req.params.id }), include: [{ model: Bien, include: [Site] }, Client] });
  if (!b) throw new Erreur(404, 'Bail introuvable');
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="contrat-${b.Bien.reference}.pdf"`);
  documents.contrat(res, { logo: await logoPdf(req.espace), bail: b, bailleur: req.espace, bien: b.Bien, site: b.Bien.Site, client: b.Client, representant: req.role === 'proprietaire' ? req.utilisateur.nom : null });
}));

module.exports = router;
