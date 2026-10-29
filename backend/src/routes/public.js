// Place de marché : recherche publique de villas (tous bailleurs), fiche, photos, demande de réservation et suivi.
// Lecture seule en mode plateforme, limitée aux biens publiés par des espaces non suspendus.
// Une demande est écrite sous l'identité du bailleur concerné, comme toute autre donnée de son espace.
const router = require('express').Router();
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { Op } = require('sequelize');
const { fn, col } = require('sequelize');
const { sequelize } = require('../models');
const { Bien, Site, Bailleur, Reservation, Demande, Fichier, Avis, Paiement } = require('../models');
const { Erreur, route } = require('../utils/erreurs');
const { definir } = require('../middleware/contexte');
const { nuitsEntre, versTexte, acompteMinimum, annulation, noteClassement } = require('../services/calculs');
const { expirerReservations } = require('../services/expirations');
const { envoyer } = require('../utils/fichiers');
const { envoyer: envoyerCourriel, courrielDemande } = require('../services/courriel');

const EQUIPEMENTS = ['piscine', 'clim', 'wifi', 'parking', 'cuisine', 'groupe', 'gardien', 'eau_chaude', 'tv', 'jardin'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const limiteur = rateLimit({ windowMs: 15 * 60 * 1000, limit: 8, skip: () => process.env.NODE_ENV === 'test', message: { message: 'Trop de demandes, réessayez dans 15 minutes' } });
const aujourdhui = () => versTexte(new Date());

const plateforme = () => definir('app.plateforme', 'on');
const visibles = { publie: true, mode: 'nuit', etat: 'disponible' };
const avecSiteEtBailleur = [
  { model: Site, attributes: ['id', 'nom', 'ville', 'quartier', 'latitude', 'longitude'] },
  { model: Bailleur, attributes: ['id', 'nom', 'telephone', 'logo_id', 'heure_arrivee', 'heure_depart', 'acompte_pourcent', 'delai_annulation_heures', 'penalite_nuits', 'numero_paiement', 'titulaire_paiement'], where: { statut: { [Op.in]: ['essai', 'actif'] } } },
];

// Distance à vol d'oiseau en km.
function distance(a, b) {
  const r = (x) => (x * Math.PI) / 180;
  const dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

// Réputation d'un ou plusieurs bailleurs : note moyenne, nombre d'avis, fiabilité, note de classement.
async function reputations(ids) {
  const uniques = [...new Set(ids)];
  if (!uniques.length) return {};
  const depuis = new Date(Date.now() - 180 * 864e5);
  const [avis, resas, annulees] = await Promise.all([
    Avis.findAll({ attributes: ['bailleur_id', [fn('COUNT', col('id')), 'n'], [fn('SUM', col('note')), 'somme']], where: { bailleur_id: uniques }, group: ['bailleur_id'], raw: true }),
    Reservation.findAll({ attributes: ['bailleur_id', [fn('COUNT', col('id')), 'n']], where: { bailleur_id: uniques, source: 'place_de_marche', cree_le: { [Op.gte]: depuis } }, group: ['bailleur_id'], raw: true }),
    Reservation.findAll({ attributes: ['bailleur_id', [fn('COUNT', col('id')), 'n']], where: { bailleur_id: uniques, source: 'place_de_marche', annule_par: 'bailleur', cree_le: { [Op.gte]: depuis } }, group: ['bailleur_id'], raw: true }),
  ]);
  const parId = (l) => Object.fromEntries(l.map(x => [x.bailleur_id, x]));
  const A = parId(avis), R = parId(resas), X = parId(annulees);
  return Object.fromEntries(uniques.map(id => {
    const nombre = Number(A[id]?.n || 0), somme = Number(A[id]?.somme || 0);
    const total = Number(R[id]?.n || 0), annul = Number(X[id]?.n || 0);
    const fiabilite = total ? 1 - annul / total : 1;
    return [id, { note: nombre ? Math.round((somme / nombre) * 10) / 10 : null, avis: nombre, fiabilite: Math.round(fiabilite * 100), classement: noteClassement({ somme, nombre, fiabilite }) }];
  }));
}
const reglesPubliques = (b) => ({ heure_arrivee: b.heure_arrivee, heure_depart: b.heure_depart, acompte_pourcent: b.acompte_pourcent, delai_annulation_heures: b.delai_annulation_heures, penalite_nuits: b.penalite_nuits });

// Ce que voit un client : jamais le numéro de compteur, les notes internes, ni la position exacte (arrondie à ~1 km).
function fiche(b, extra = {}) {
  const s = b.Site;
  return {
    id: b.id, type: b.type, standing: b.standing, chambres: b.pieces, capacite: b.capacite, prix_nuit: b.prix_nuit,
    description: b.description, equipements: b.equipements,
    photos: b.photos.map(p => `/api/public/biens/${b.id}/photos/${p}`),
    lieu: { site: s.nom, ville: s.ville, quartier: s.quartier, lat: s.latitude != null ? Math.round(s.latitude * 100) / 100 : null, lng: s.longitude != null ? Math.round(s.longitude * 100) / 100 : null },
    bailleur: { nom: b.Bailleur.nom, logo: b.Bailleur.logo_id ? `/api/fichiers/logo/${b.Bailleur.id}` : null, ...(extra.reputation || {}) },
    ...extra, reputation: undefined,
  };
}

const occupe = (bienIds, arrivee, depart) => Reservation.findAll({
  attributes: ['bien_id'], where: { bien_id: bienIds, statut: { [Op.ne]: 'annulee' }, arrivee: { [Op.lt]: depart }, depart: { [Op.gt]: arrivee } },
});

// Villes et quartiers où des villas sont publiées (pour proposer des choix au client).
router.get('/lieux', route(async (req, res) => {
  await plateforme();
  const biens = await Bien.findAll({ where: visibles, attributes: ['id'], include: avecSiteEtBailleur });
  const lieux = {};
  for (const b of biens) {
    const v = b.Site.ville || 'Autre';
    lieux[v] = lieux[v] || new Set();
    if (b.Site.quartier) lieux[v].add(b.Site.quartier);
  }
  res.json(Object.entries(lieux).map(([ville, q]) => ({ ville, quartiers: [...q].sort() })).sort((a, b) => a.ville.localeCompare(b.ville)));
}));

router.get('/recherche', route(async (req, res) => {
  const { ville, quartier, arrivee, depart, budget, chambres, personnes, lat, lng, rayon } = req.query;
  const equipements = String(req.query.equipements || '').split(',').filter(e => EQUIPEMENTS.includes(e));
  await plateforme();
  const where = { ...visibles };
  if (budget) where.prix_nuit = { [Op.lte]: Number(budget) };
  if (chambres) where.pieces = { [Op.gte]: Number(chambres) };
  if (personnes) where.capacite = { [Op.gte]: Number(personnes) };
  if (equipements.length) where.equipements = { [Op.contains]: equipements };
  const include = avecSiteEtBailleur.map(i => ({ ...i }));
  const filtreSite = {};
  if (ville) filtreSite.ville = { [Op.iLike]: ville };
  if (quartier) filtreSite.quartier = { [Op.iLike]: quartier };
  if (Object.keys(filtreSite).length) include[0].where = filtreSite;
  await expirerReservations().catch(() => {});
  let biens = await Bien.findAll({ where, include, order: [['prix_nuit', 'ASC']], limit: 300 });
  // Disponibilité réelle : les plannings des gérants font foi.
  let nuits = null;
  if (arrivee && depart) {
    try { nuits = nuitsEntre(arrivee, depart); } catch (e) { throw new Erreur(400, e.message); }
    if (arrivee < aujourdhui()) throw new Erreur(400, 'La date d’arrivée est passée');
    const pris = new Set((await occupe(biens.map(b => b.id), arrivee, depart)).map(r => r.bien_id));
    biens = biens.filter(b => !pris.has(b.id));
  }
  // Classement : réputation du bailleur (avis et fiabilité), puis villas avec photos, puis prix.
  const rep = await reputations(biens.map(b => b.bailleur_id));
  biens.sort((a, b) => rep[b.bailleur_id].classement - rep[a.bailleur_id].classement || (b.photos.length > 0) - (a.photos.length > 0) || a.prix_nuit - b.prix_nuit);
  const extra = (b) => ({ reputation: rep[b.bailleur_id], ...(nuits ? { nuits, total: nuits * b.prix_nuit } : {}) });
  let resultats = biens.map(b => fiche(b, extra(b)));
  if (lat && lng) {
    const ici = { lat: Number(lat), lng: Number(lng) };
    const max = Number(rayon) || 15;
    resultats = biens.filter(b => b.Site.latitude != null).map(b => ({ b, d: distance(ici, { lat: Number(b.Site.latitude), lng: Number(b.Site.longitude) }) }))
      .filter(x => x.d <= max).sort((x, y) => x.d - y.d)
      .map(({ b, d }) => fiche(b, { distance_km: Math.round(d * 10) / 10, ...extra(b) }));
  }
  res.json(resultats);
}));

router.get('/biens/:id', route(async (req, res) => {
  if (!UUID.test(req.params.id)) throw new Erreur(404, 'Villa introuvable');
  await plateforme();
  const b = await Bien.findOne({ where: { ...visibles, id: req.params.id }, include: avecSiteEtBailleur });
  if (!b) throw new Erreur(404, 'Villa introuvable ou plus proposée');
  // Nuits déjà prises dans les quatre prochains mois (sans dire par qui).
  const fin = versTexte(new Date(Date.now() + 120 * 864e5));
  const prises = await Reservation.findAll({ attributes: ['arrivee', 'depart'], where: { bien_id: b.id, statut: { [Op.ne]: 'annulee' }, depart: { [Op.gt]: aujourdhui() }, arrivee: { [Op.lt]: fin } }, order: [['arrivee', 'ASC']] });
  const rep = await reputations([b.bailleur_id]);
  const avis = await Avis.findAll({ where: { bailleur_id: b.bailleur_id }, attributes: ['note', 'commentaire', 'auteur', 'cree_le'], order: [['cree_le', 'DESC']], limit: 10 });
  res.json(fiche(b, { indisponible: prises.map(r => ({ du: r.arrivee, au: r.depart })), regles: reglesPubliques(b.Bailleur), reputation: rep[b.bailleur_id], avis }));
}));

router.get('/biens/:id/photos/:photo', route(async (req, res) => {
  if (!UUID.test(req.params.id) || !UUID.test(req.params.photo)) throw new Erreur(404, 'Photo introuvable');
  await plateforme();
  const b = await Bien.findOne({ where: { ...visibles, id: req.params.id }, attributes: ['id', 'bailleur_id', 'photos'] });
  const f = b?.photos.includes(req.params.photo) && await Fichier.findOne({ where: { id: req.params.photo, bailleur_id: b.bailleur_id } });
  if (!f) throw new Erreur(404, 'Photo introuvable');
  envoyer(res, f);
}));

router.post('/demandes', limiteur, route(async (req, res) => {
  const { bien_id, arrivee, depart, message } = req.body || {};
  const nom = String(req.body?.nom || '').trim();
  const telephone = String(req.body?.telephone || '').replace(/[^\d+]/g, '');
  if (!nom) throw new Erreur(400, 'Votre nom est requis');
  if (telephone.replace(/\D/g, '').length < 8) throw new Erreur(400, 'Numéro de téléphone invalide');
  let nuits;
  try { nuits = nuitsEntre(arrivee, depart); } catch (e) { throw new Erreur(400, e.message); }
  if (arrivee < aujourdhui()) throw new Erreur(400, 'La date d’arrivée est passée');
  if (!UUID.test(bien_id || '')) throw new Erreur(404, 'Villa introuvable');
  await plateforme();
  const b = await Bien.findOne({ where: { ...visibles, id: bien_id }, include: avecSiteEtBailleur });
  if (!b) throw new Erreur(404, 'Villa introuvable ou plus proposée');
  if ((await occupe([b.id], arrivee, depart)).length) throw new Erreur(409, 'Ces dates ne sont plus libres pour cette villa. Essayez d’autres dates.');
  // Le même client (même numéro) a peut-être déjà une demande en cours sur ces dates, ailleurs : on le prévient
  // (il peut confirmer s'il veut vraiment deux villas). Seules les dates et le lieu sont rappelés, jamais d'autre détail.
  if (!req.body?.confirmer) {
    const huit = telephone.replace(/\D/g, '').slice(-8);
    const memes = await Demande.findAll({
      where: {
        statut: { [Op.in]: ['en_attente', 'acceptee'] }, arrivee: { [Op.lt]: depart }, depart: { [Op.gt]: arrivee },
        [Op.and]: sequelize.where(fn('right', fn('regexp_replace', col('Demande.telephone'), '\\D', '', 'g'), 8), huit),
      },
      include: [{ model: Bien, attributes: ['type', 'standing'], include: [{ model: Site, attributes: ['quartier', 'ville'] }] }, { model: Reservation, attributes: ['statut'] }],
    });
    const actives = memes.filter(d => !d.Reservation || d.Reservation.statut !== 'annulee');
    if (actives.length) {
      throw new Erreur(409, 'Vous avez déjà une demande en cours sur ces dates.', {
        code: 'chevauchement',
        demandes: actives.map(d => ({ arrivee: d.arrivee, depart: d.depart, statut: d.statut, type: d.Bien?.type, standing: d.Bien?.standing, lieu: [d.Bien?.Site?.quartier, d.Bien?.Site?.ville].filter(Boolean).join(', ') })),
      });
    }
  }
  // Écriture dans l'espace du bailleur seulement : on quitte le mode plateforme.
  await definir('app.plateforme', '');
  await definir('app.bailleur_id', b.bailleur_id);
  const demande = await Demande.create({
    bailleur_id: b.bailleur_id, site_id: b.site_id, bien_id: b.id, arrivee, depart, nuits, prix_nuit: b.prix_nuit, total: nuits * b.prix_nuit,
    nom: nom.slice(0, 160), telephone, message: message ? String(message).slice(0, 500) : null, code: crypto.randomBytes(5).toString('hex').toUpperCase(),
  });
  // Avis par e-mail au bailleur (s'il a une adresse) ; ne bloque jamais la demande.
  const bailleur = await Bailleur.findByPk(b.bailleur_id, { attributes: ['nom', 'email'] }).catch(() => null);
  if (bailleur?.email) envoyerCourriel(courrielDemande({ a: bailleur.email, bailleur: bailleur.nom, demande, bien: b })).catch(e => console.error('Avis de demande non envoyé :', e.message));
  res.status(201).json({ code: demande.code, total: demande.total, nuits });
}));

// Page publique d'une résidence (un bailleur) : ses villas publiées, à partager sur Facebook et WhatsApp.
router.get('/residences/:page', route(async (req, res) => {
  await plateforme();
  const bailleur = await Bailleur.findOne({ where: { page: String(req.params.page).slice(0, 80), statut: { [Op.in]: ['essai', 'actif'] } }, attributes: ['id', 'nom', 'ville', 'logo_id'] });
  if (!bailleur) throw new Erreur(404, 'Cette page n’existe pas ou n’est plus disponible');
  const biens = await Bien.findAll({ where: { ...visibles, bailleur_id: bailleur.id }, include: avecSiteEtBailleur });
  biens.sort((a, b) => (b.photos.length > 0) - (a.photos.length > 0) || a.prix_nuit - b.prix_nuit);
  const rep = await reputations([bailleur.id]);
  res.json({ nom: bailleur.nom, ville: bailleur.ville, logo: bailleur.logo_id ? `/api/fichiers/logo/${bailleur.id}` : null, ...rep[bailleur.id], villas: biens.map(b => fiche(b, { reputation: rep[bailleur.id] })) });
}));

// ---------- Suivi par le client, avec le code reçu (sans compte) ----------
const demandeParCode = async (code) => {
  await plateforme();
  await expirerReservations().catch(() => {});
  const d = await Demande.findOne({ where: { code: String(code).toUpperCase().slice(0, 12) }, include: [{ model: Bien, include: avecSiteEtBailleur }, { model: Reservation, include: [Paiement] }] });
  if (!d) throw new Erreur(404, 'Demande introuvable');
  return d;
};

router.get('/demandes/:code', route(async (req, res) => {
  const d = await demandeParCode(req.params.code);
  const r = d.Reservation;
  const B = d.Bien.Bailleur;
  const paye = r ? r.Paiements.reduce((s, p) => s + p.montant, 0) : 0;
  const acompte = r ? acompteMinimum(r.total, B.acompte_pourcent) : acompteMinimum(d.total, B.acompte_pourcent);
  res.json({
    code: d.code, statut: d.statut, motif_refus: d.motif_refus, arrivee: d.arrivee, depart: d.depart, nuits: d.nuits, total: r ? r.total : d.total, nom: d.nom,
    villa: { id: d.Bien.id, type: d.Bien.type, standing: d.Bien.standing, lieu: { site: d.Bien.Site.nom, ville: d.Bien.Site.ville, quartier: d.Bien.Site.quartier } },
    regles: reglesPubliques(B),
    // Après acceptation : acompte à envoyer (numéro Mobile Money du bailleur) avant l'heure limite, puis contact.
    contact: d.statut === 'acceptee' ? { nom: B.nom, telephone: B.telephone } : null,
    paiement: d.statut === 'acceptee' && r ? {
      acompte, paye, reste: r.total - paye, expire_le: r.expire_le, numero: r.expire_le || paye < acompte ? (B.numero_paiement || B.telephone) : null, titulaire: B.titulaire_paiement || B.nom,
      declare: d.acompte_reference ? { reference: d.acompte_reference, montant: d.acompte_montant, le: d.acompte_declare_le } : null,
    } : null,
    sejour: r ? { statut: r.statut, annule_par: r.annule_par, penalite: r.penalite, a_rembourser: r.a_rembourser, rembourse: !!r.rembourse_le, cles: !!r.cles_remises_le, parti: !!r.parti_le, avis: r.parti_le ? r.code_avis : null } : null,
  });
}));

// Le client déclare avoir envoyé l'acompte (référence de la transaction) ; le gérant le vérifie dans Loka.
router.post('/demandes/:code/acompte', limiteur, route(async (req, res) => {
  const reference = String(req.body?.reference || '').trim().slice(0, 80);
  if (reference.length < 4) throw new Erreur(400, 'Indiquez la référence de la transaction Mobile Money');
  const d = await demandeParCode(req.params.code);
  if (d.statut !== 'acceptee' || !d.Reservation || d.Reservation.statut !== 'confirmee') throw new Erreur(409, 'Cette demande n’attend plus d’acompte');
  await definir('app.plateforme', '');
  await definir('app.bailleur_id', d.bailleur_id);
  const montant = Number(req.body?.montant) || acompteMinimum(d.Reservation.total, d.Bien.Bailleur.acompte_pourcent);
  await Demande.update({ acompte_reference: reference, acompte_montant: montant, acompte_declare_le: new Date() }, { where: { id: d.id } });
  res.json({ ok: true });
}));

// Annulation par le client lui-même, selon les règles du bailleur (pénalité calculée et annoncée avant).
router.post('/demandes/:code/annuler', limiteur, route(async (req, res) => {
  const d = await demandeParCode(req.params.code);
  const r = d.Reservation;
  if (d.statut === 'en_attente') {
    if (req.body?.simulation) return res.json({ type: 'gratuite', penalite: 0, a_rembourser: 0 });
    await definir('app.plateforme', ''); await definir('app.bailleur_id', d.bailleur_id);
    await Demande.update({ statut: 'annulee' }, { where: { id: d.id } });
    return res.json({ statut: 'annulee' });
  }
  if (d.statut !== 'acceptee' || !r || r.statut !== 'confirmee') throw new Erreur(409, 'Cette demande ne peut plus être annulée');
  if (r.cles_remises_le) throw new Erreur(409, 'Votre séjour a commencé');
  const B = d.Bien.Bailleur;
  const calcul = annulation({ par: 'client', arrivee: r.arrivee, prixNuit: r.prix_nuit, total: r.total, regles: B });
  const paye = r.Paiements.reduce((s, p) => s + p.montant, 0);
  const resultat = { type: calcul.type, penalite: calcul.penalite, paye, a_rembourser: Math.max(0, paye - calcul.penalite) };
  if (req.body?.simulation) return res.json(resultat);
  await definir('app.plateforme', ''); await definir('app.bailleur_id', d.bailleur_id);
  await Reservation.update({ statut: 'annulee', annule_le: new Date(), annule_par: calcul.type === 'absence' ? 'absence' : 'client', motif_annulation: 'Annulée par le client', penalite: calcul.penalite, a_rembourser: resultat.a_rembourser, expire_le: null }, { where: { id: r.id } });
  await Demande.update({ statut: 'annulee' }, { where: { id: d.id } });
  res.json(resultat);
}));

// ---------- Avis : uniquement après un séjour réel (code remis au départ) ----------
const sejourParCodeAvis = async (code) => {
  await plateforme();
  const r = await Reservation.findOne({ where: { code_avis: String(code).toUpperCase().slice(0, 12) }, include: [{ model: Bien, include: avecSiteEtBailleur }] });
  if (!r || !r.parti_le) throw new Erreur(404, 'Lien d’avis introuvable');
  return r;
};
router.get('/avis/:code', route(async (req, res) => {
  const r = await sejourParCodeAvis(req.params.code);
  const deja = await Avis.findOne({ where: { reservation_id: r.id }, attributes: ['note', 'commentaire'] });
  res.json({ villa: { type: r.Bien.type, standing: r.Bien.standing, chambres: r.Bien.pieces, lieu: { site: r.Bien.Site.nom, ville: r.Bien.Site.ville, quartier: r.Bien.Site.quartier } }, bailleur: r.Bien.Bailleur.nom, arrivee: r.arrivee, depart: r.depart, deja });
}));
router.post('/avis/:code', limiteur, route(async (req, res) => {
  const note = Number(req.body?.note);
  if (!(note >= 1 && note <= 5) || !Number.isInteger(note)) throw new Erreur(400, 'Choisissez une note de 1 à 5 étoiles');
  const r = await sejourParCodeAvis(req.params.code);
  if (await Avis.findOne({ where: { reservation_id: r.id } })) throw new Erreur(409, 'Vous avez déjà donné votre avis sur ce séjour. Merci !');
  await definir('app.plateforme', ''); await definir('app.bailleur_id', r.bailleur_id);
  const auteur = String(req.body?.auteur || '').trim().split(/\s+/)[0]?.slice(0, 30) || null;
  await Avis.create({ bailleur_id: r.bailleur_id, reservation_id: r.id, bien_id: r.bien_id, note, commentaire: req.body?.commentaire ? String(req.body.commentaire).slice(0, 600) : null, auteur });
  res.status(201).json({ ok: true });
}));

module.exports = { router, EQUIPEMENTS };
