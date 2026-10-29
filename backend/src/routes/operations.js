// Le quotidien : clients, réservations, baux, encaissements, dépenses.
const router = require('express').Router();
const { Op } = require('sequelize');
const crypto = require('crypto');
const { sequelize, Bien, Site, Client, Reservation, Bail, Paiement, Depense, Utilisateur, Fichier, Demande, Avis } = require('../models');
const { authentifier, espace, autoriser, ecriture, portee, verifierSite } = require('../middleware/auth');
const { Erreur, route } = require('../utils/erreurs');
const { transaction, lier, definir } = require('../middleware/contexte');
const { noter } = require('../utils/journal');
const { nuitsEntre, prixSejour, besoinValidation, numeroRecu, versTexte, instant, acompteMinimum, annulation, departTardif, penaliteBailleur } = require('../services/calculs');
const { recevoirJustificatif, enregistrer } = require('../utils/fichiers');

router.use(authentifier, espace);
const aujourdhui = () => versTexte(new Date());

async function bienAccessible(req, bienId, transaction) {
  const bien = await Bien.findOne({ where: portee(req, { id: bienId || null }), transaction });
  if (!bien) throw new Erreur(404, 'Bien introuvable');
  return bien;
}

// ---------- Clients ----------
// Un client est reconnu à son numéro (8 derniers chiffres) : pas de doublon quand on le ressaisit.
const chiffres = (t) => String(t || '').replace(/\D/g, '').slice(-8);
const parTelephone = (req, telephone, transaction) => {
  const c = chiffres(telephone);
  if (c.length < 8) return null;
  const huitDerniers = sequelize.fn('right', sequelize.fn('regexp_replace', sequelize.col('telephone'), '\\D', '', 'g'), 8);
  return Client.findOne({ where: { bailleur_id: req.espace.id, [Op.and]: sequelize.where(huitDerniers, c) }, transaction });
};
async function clientPour(req, { client_id, client }, transaction) {
  if (client_id) {
    const c = await Client.findOne({ where: { id: client_id, bailleur_id: req.espace.id }, transaction });
    if (!c) throw new Erreur(404, 'Client introuvable');
    return c.id;
  }
  if (!client?.nom) throw new Erreur(400, 'Client requis');
  const connu = await parTelephone(req, client.telephone, transaction);
  if (connu) {
    if (client.piece_numero && !connu.piece_numero) await connu.update({ piece_type: client.piece_type, piece_numero: client.piece_numero }, { transaction });
    return connu.id;
  }
  const { nom, telephone, piece_type, piece_numero, notes } = client;
  return (await Client.create({ nom, telephone, piece_type, piece_numero, notes, bailleur_id: req.espace.id }, { transaction })).id;
}

// Chiffres d'un client : séjours, baux, payé, reste dû, fidélité (le gérant ne voit que ses sites).
const SEJOURS_FIDELE = 3;
function bilan(c) {
  const auj = aujourdhui();
  const somme = (paiements) => (paiements || []).reduce((x, p) => x + p.montant, 0);
  const sejours = (c.Reservations || []).filter(r => r.statut !== 'annulee');
  const passes = sejours.filter(r => r.statut === 'confirmee' && r.arrivee <= auj);
  const baux = c.Bails || [];
  return {
    sejours: passes.length,
    a_venir: sejours.filter(r => r.arrivee > auj).length,
    baux: baux.filter(b => b.statut === 'actif').length,
    nuits: passes.reduce((s, r) => s + r.nuits, 0),
    paye: sejours.reduce((s, r) => s + somme(r.Paiements), 0) + baux.reduce((s, b) => s + somme(b.Paiements), 0),
    reste: passes.reduce((s, r) => s + Math.max(0, r.total - somme(r.Paiements)), 0),
    dernier: passes.map(r => r.arrivee).sort().at(-1) || null,
    fidele: passes.length >= SEJOURS_FIDELE || baux.some(b => b.statut === 'actif'),
  };
}
const historique = (req, avecBien = false) => [
  { model: Reservation, where: portee(req, {}), required: false, include: avecBien ? [Paiement, Bien] : [Paiement] },
  { model: Bail, where: portee(req, {}), required: false, include: avecBien ? [Paiement, Bien] : [Paiement] },
];
const resume = (c) => { const { Reservations, Bails, ...reste } = c.toJSON(); return { ...reste, bilan: bilan(c) }; };

router.get('/clients', route(async (req, res) => {
  const where = { bailleur_id: req.espace.id };
  if (req.query.q) where[Op.or] = [{ nom: { [Op.iLike]: `%${req.query.q}%` } }, { telephone: { [Op.iLike]: `%${req.query.q}%` } }];
  const liste = await Client.findAll({ where, include: historique(req), order: [['nom', 'ASC']], limit: 300 });
  res.json(liste.map(resume));
}));
// Reconnaissance du client pendant la saisie d'une réservation ou d'un bail.
router.get('/clients/recherche', route(async (req, res) => {
  const c = await parTelephone(req, req.query.telephone);
  if (!c) return res.json(null);
  res.json(resume(await Client.findByPk(c.id, { include: historique(req) })));
}));
router.get('/clients/:id', route(async (req, res) => {
  const c = await Client.findOne({ where: { id: req.params.id, bailleur_id: req.espace.id }, include: historique(req, true) });
  if (!c) throw new Erreur(404, 'Client introuvable');
  const j = c.toJSON();
  j.Reservations.sort((a, b) => (a.arrivee < b.arrivee ? 1 : -1));
  res.json({ ...j, bilan: bilan(c) });
}));
router.post('/clients', ecriture, route(async (req, res) => {
  const { nom, telephone, piece_type, piece_numero, notes } = req.body || {};
  if (!nom) throw new Erreur(400, 'Nom requis');
  if (await parTelephone(req, telephone)) throw new Erreur(409, 'Un client a déjà ce numéro');
  res.status(201).json(await Client.create({ nom, telephone, piece_type, piece_numero, notes, bailleur_id: req.espace.id }));
}));
router.patch('/clients/:id', ecriture, route(async (req, res) => {
  const c = await Client.findOne({ where: { id: req.params.id, bailleur_id: req.espace.id } });
  if (!c) throw new Erreur(404, 'Client introuvable');
  const champs = ['nom', 'telephone', 'piece_type', 'piece_numero', 'notes'];
  // Seul le propriétaire signale un client « à éviter ».
  if (req.role === 'proprietaire') champs.push('statut', 'motif_alerte');
  else if (req.body.statut !== undefined) throw new Erreur(403, 'Seul le propriétaire peut signaler un client');
  const avant = c.statut;
  await c.update(Object.fromEntries(champs.filter(k => req.body[k] !== undefined).map(k => [k, req.body[k]])));
  if (avant !== c.statut) await noter(req, c.statut === 'a_eviter' ? 'client_signale' : 'client_retabli', 'client', c.id, { nom: c.nom, motif: c.motif_alerte });
  res.json(c);
}));

// ---------- Demandes venues de la place de marché ----------
const DELAI_ACOMPTE_MS = 2 * 3600e3;                 // 2 h pour envoyer l'acompte après acceptation
router.get('/demandes', route(async (req, res) => {
  const filtre = req.query.statut ? { statut: req.query.statut } : {};
  res.json(await Demande.findAll({ where: portee(req, filtre), include: [{ model: Bien, attributes: ['id', 'reference', 'standing', 'pieces'] }, { model: Site, attributes: ['id', 'nom'] }, { model: Reservation, include: [Paiement] }], order: [['cree_le', 'DESC']], limit: 100 }));
}));
// Accepter : la demande devient une réservation confirmée (si les dates sont toujours libres).
router.post('/demandes/:id/accepter', ecriture, route(async (req, res) => {
  const resultat = await transaction(async (t) => {
    const d = await Demande.findOne({ where: portee(req, { id: req.params.id }), transaction: t, lock: t.LOCK.UPDATE });
    if (!d) throw new Erreur(404, 'Demande introuvable');
    if (d.statut !== 'en_attente') throw new Erreur(409, 'Cette demande a déjà été traitée');
    const conflit = await Reservation.findOne({ where: { bien_id: d.bien_id, statut: { [Op.ne]: 'annulee' }, arrivee: { [Op.lt]: d.depart }, depart: { [Op.gt]: d.arrivee } }, transaction: t, lock: t.LOCK.UPDATE });
    if (conflit) throw new Erreur(409, `Ces dates ne sont plus libres (réservé du ${conflit.arrivee} au ${conflit.depart}) : refusez la demande ou proposez une autre villa au client.`);
    const idClient = await clientPour(req, { client: { nom: d.nom, telephone: d.telephone } }, t);
    const resa = await Reservation.create({
      bailleur_id: req.espace.id, site_id: d.site_id, bien_id: d.bien_id, client_id: idClient, arrivee: d.arrivee, depart: d.depart, nuits: d.nuits,
      prix_nuit: d.prix_nuit, prix_normal: d.total, reduction: 0, total: d.total, statut: 'confirmee', cree_par: req.utilisateur.id,
      source: 'place_de_marche', demande_id: d.id, expire_le: new Date(Date.now() + DELAI_ACOMPTE_MS),
    }, { transaction: t });
    await d.update({ statut: 'acceptee', reservation_id: resa.id, traitee_par: req.utilisateur.id, traitee_le: new Date() }, { transaction: t });
    return { demande: d, reservation: resa };
  });
  await noter(req, 'demande_acceptee', 'reservation', resultat.reservation.id, { total: resultat.reservation.total });
  res.json(resultat);
}));
// Acompte envoyé par le client (référence Mobile Money déclarée sur sa page de suivi) : le gérant vérifie et valide.
router.post('/demandes/:id/acompte', ecriture, route(async (req, res) => {
  const paiement = await transaction(async (t) => {
    const d = await Demande.findOne({ where: portee(req, { id: req.params.id }), transaction: t, lock: t.LOCK.UPDATE });
    if (!d || !d.reservation_id) throw new Erreur(404, 'Demande introuvable');
    const r = await Reservation.findOne({ where: { id: d.reservation_id, bailleur_id: req.espace.id }, include: [Paiement], transaction: t });
    if (!r || r.statut !== 'confirmee') throw new Erreur(409, 'Cette réservation n’est plus active');
    const montant = Number(req.body?.montant || d.acompte_montant || acompteMinimum(r.total, req.espace.acompte_pourcent));
    const reste = r.total - r.Paiements.reduce((s, p) => s + p.montant, 0);
    if (!(montant > 0) || montant > reste) throw new Erreur(400, `Montant invalide (reste à payer : ${reste} FCFA)`);
    const p = await creerPaiement(req, { site_id: r.site_id, reservation_id: r.id, montant, moyen: 'mobile_money', reference: req.body?.reference || d.acompte_reference }, t);
    await r.update({ expire_le: null }, { transaction: t });
    return p;
  });
  await noter(req, 'acompte_valide', 'paiement', paiement.id, { montant: paiement.montant });
  res.status(201).json(paiement);
}));
router.post('/demandes/:id/refuser', ecriture, route(async (req, res) => {
  const d = await Demande.findOne({ where: portee(req, { id: req.params.id }) });
  if (!d) throw new Erreur(404, 'Demande introuvable');
  if (d.statut !== 'en_attente') throw new Erreur(409, 'Cette demande a déjà été traitée');
  await d.update({ statut: 'refusee', motif_refus: req.body?.motif ? String(req.body.motif).slice(0, 255) : null, traitee_par: req.utilisateur.id, traitee_le: new Date() });
  await noter(req, 'demande_refusee', 'demande', d.id, { motif: d.motif_refus });
  res.json(d);
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
    const idClient = await clientPour(req, { client_id, client }, t);
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
// ---------- Déroulé du séjour : clés, départ, annulation, remboursement ----------
const regles = (espace) => ({
  heure_arrivee: espace.heure_arrivee, heure_depart: espace.heure_depart, acompte_pourcent: espace.acompte_pourcent,
  delai_annulation_heures: espace.delai_annulation_heures, penalite_nuits: espace.penalite_nuits, tolerance_depart_minutes: espace.tolerance_depart_minutes,
});
const totalPaye = (r) => (r.Paiements || []).reduce((s, p) => s + p.montant, 0);
const sejourDe = (req, id, transaction) => Reservation.findOne({ where: portee(req, { id }), include: [Paiement, Bien, Client], transaction, lock: transaction ? transaction.LOCK.UPDATE : undefined });

// Remise des clés : à partir de l'heure d'arrivée, et seulement si l'acompte minimum est payé.
router.post('/reservations/:id/cles', ecriture, route(async (req, res) => {
  const r = await sejourDe(req, req.params.id);
  if (!r) throw new Erreur(404, 'Réservation introuvable');
  if (r.statut !== 'confirmee') throw new Erreur(409, r.statut === 'annulee' ? 'Réservation annulée' : 'Réduction en attente de validation');
  if (r.cles_remises_le) throw new Erreur(409, 'Les clés ont déjà été remises');
  const R = regles(req.espace);
  const maintenant = new Date();
  if (maintenant < instant(r.arrivee)) throw new Erreur(409, `L’arrivée est prévue le ${r.arrivee}`);
  if (maintenant < instant(r.arrivee, R.heure_arrivee) && !(req.body?.forcer && req.role === 'proprietaire')) throw new Erreur(409, `Les entrées se font à partir de ${R.heure_arrivee}`);
  const minimum = acompteMinimum(r.total, R.acompte_pourcent);
  const paye = totalPaye(r);
  if (paye < minimum) throw new Erreur(409, `Acompte insuffisant : ${minimum} FCFA à payer avant la remise des clés (déjà payé : ${paye} FCFA)`);
  await r.update({ cles_remises_le: maintenant, expire_le: null });
  await noter(req, 'cles_remises', 'reservation', r.id, { reference: r.Bien?.reference });
  res.json(r);
}));

// Départ : après l'heure (et la tolérance), une nuit supplémentaire s'ajoute au séjour. Simulation possible.
router.post('/reservations/:id/depart', ecriture, route(async (req, res) => {
  const r = await sejourDe(req, req.params.id);
  if (!r) throw new Erreur(404, 'Réservation introuvable');
  if (!r.cles_remises_le) throw new Erreur(409, 'Les clés n’ont pas été remises');
  if (r.parti_le) throw new Erreur(409, 'Départ déjà enregistré');
  const R = regles(req.espace);
  const tardif = departTardif({ depart: r.depart, regles: R });
  const supplement = tardif ? R.penalite_nuits * r.prix_nuit : 0;
  const total = r.total + supplement;
  const reste = total - totalPaye(r);
  if (req.body?.simulation) return res.json({ tardif, supplement, total, reste, heure_depart: R.heure_depart });
  await r.update({ parti_le: new Date(), supplement: r.supplement + supplement, total, code_avis: crypto.randomBytes(5).toString('hex').toUpperCase() });
  await noter(req, 'depart_enregistre', 'reservation', r.id, { supplement });
  res.json({ ...r.toJSON(), reste, tardif, supplement });
}));

// Annulation selon les règles ; « simulation » renvoie la pénalité et le remboursement sans rien changer.
router.post('/reservations/:id/annuler', ecriture, route(async (req, res) => {
  const par = req.body?.par === 'bailleur' ? 'bailleur' : 'client';
  const r = await sejourDe(req, req.params.id);
  if (!r) throw new Erreur(404, 'Réservation introuvable');
  if (r.statut === 'annulee') throw new Erreur(409, 'Réservation déjà annulée');
  if (r.cles_remises_le) throw new Erreur(409, 'Le séjour a commencé : enregistrez plutôt le départ');
  const paye = totalPaye(r);
  if (paye && req.role !== 'proprietaire' && !req.body?.simulation) throw new Erreur(403, 'Réservation déjà payée : seul le propriétaire peut l’annuler');
  const calcul = annulation({ par, arrivee: r.arrivee, prixNuit: r.prix_nuit, total: r.total, regles: regles(req.espace) });
  const resultat = {
    type: calcul.type, penalite: calcul.penalite, paye,
    a_rembourser: Math.max(0, paye - calcul.penalite),
    reste_du: Math.max(0, calcul.penalite - paye),
    penalite_bailleur: par === 'bailleur' && r.source === 'place_de_marche' ? penaliteBailleur(r.total) : 0,
  };
  if (req.body?.simulation) return res.json(resultat);
  await r.update({
    statut: 'annulee', annule_le: new Date(), annule_par: calcul.type === 'absence' ? 'absence' : par, motif_annulation: req.body?.motif || null,
    penalite: calcul.penalite, a_rembourser: resultat.a_rembourser, penalite_bailleur: resultat.penalite_bailleur, expire_le: null,
  });
  if (r.demande_id) await Demande.update({ statut: 'annulee' }, { where: { id: r.demande_id, bailleur_id: req.espace.id } });
  await noter(req, 'reservation_annulee', 'reservation', r.id, { par, type: calcul.type, penalite: calcul.penalite, a_rembourser: resultat.a_rembourser });
  res.json({ ...r.toJSON(), ...resultat });
}));

// Le remboursement dû au client a été fait (Mobile Money, espèces…).
router.post('/reservations/:id/remboursement', ecriture, route(async (req, res) => {
  const r = await sejourDe(req, req.params.id);
  if (!r) throw new Erreur(404, 'Réservation introuvable');
  if (!r.a_rembourser || r.rembourse_le) throw new Erreur(409, 'Aucun remboursement en attente');
  await r.update({ rembourse_le: new Date(), rembourse_moyen: req.body?.moyen || 'mobile_money', rembourse_ref: req.body?.reference || null });
  await noter(req, 'remboursement_effectue', 'reservation', r.id, { montant: r.a_rembourser });
  res.json(r);
}));

// Villas libres sur les mêmes dates, à proposer au client quand le bailleur doit annuler.
router.get('/reservations/:id/alternatives', route(async (req, res) => {
  const r = await sejourDe(req, req.params.id);
  if (!r) throw new Erreur(404, 'Réservation introuvable');
  const biens = await Bien.findAll({ where: { bailleur_id: req.espace.id, mode: 'nuit', etat: 'disponible', id: { [Op.ne]: r.bien_id } }, include: [Site] });
  const pris = new Set((await Reservation.findAll({ attributes: ['bien_id'], where: { bailleur_id: req.espace.id, statut: { [Op.ne]: 'annulee' }, arrivee: { [Op.lt]: r.depart }, depart: { [Op.gt]: r.arrivee } } })).map(x => x.bien_id));
  const libres = biens.filter(b => !pris.has(b.id)).sort((a, b) => Math.abs(a.prix_nuit - r.prix_nuit) - Math.abs(b.prix_nuit - r.prix_nuit));
  res.json({ villas: libres.slice(0, 6), recherche: `/villas?arrivee=${r.arrivee}&depart=${r.depart}${r.Bien?.capacite ? '&personnes=' + r.Bien.capacite : ''}` });
}));

// Avis reçus par l'espace.
router.get('/avis', route(async (req, res) => {
  res.json(await Avis.findAll({ where: { bailleur_id: req.espace.id }, include: [{ model: Bien, attributes: ['reference'] }], order: [['cree_le', 'DESC']], limit: 100 }));
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
    const idClient = await clientPour(req, { client_id, client }, t);
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

// Paiement avec reçu numéroté propre à chaque bailleur, sans doublon.
async function creerPaiement(req, p, t) {
  await req.espace.reload({ transaction: t, lock: t.LOCK.UPDATE });
  const n = req.espace.dernier_numero_recu + 1;
  await req.espace.update({ dernier_numero_recu: n }, { transaction: t });
  return Paiement.create({
    bailleur_id: req.espace.id, site_id: p.site_id, reservation_id: p.reservation_id || null, bail_id: p.bail_id || null, periode: p.periode || null,
    montant: p.montant, moyen: p.moyen, reference: p.reference, date_paiement: p.date_paiement || aujourdhui(), numero_recu: numeroRecu(n), encaisse_par: req.utilisateur.id,
    cle_client: p.cle_client || null,
  }, { transaction: t });
}
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
    return creerPaiement(req, { site_id: siteId, reservation_id, bail_id, periode, montant, moyen, reference, date_paiement, cle_client }, t);
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
