// Place de marché : recherche publique de villas (tous bailleurs), fiche, photos, demande de réservation et suivi.
// Lecture seule en mode plateforme, limitée aux biens publiés par des espaces non suspendus.
// Une demande est écrite sous l'identité du bailleur concerné, comme toute autre donnée de son espace.
const router = require('express').Router();
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { Op } = require('sequelize');
const { Bien, Site, Bailleur, Reservation, Demande, Fichier } = require('../models');
const { Erreur, route } = require('../utils/erreurs');
const { definir } = require('../middleware/contexte');
const { nuitsEntre, versTexte } = require('../services/calculs');
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
  { model: Bailleur, attributes: ['id', 'nom', 'telephone', 'logo_id'], where: { statut: { [Op.in]: ['essai', 'actif'] } } },
];

// Distance à vol d'oiseau en km.
function distance(a, b) {
  const r = (x) => (x * Math.PI) / 180;
  const dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

// Ce que voit un client : jamais le numéro de compteur, les notes internes, ni la position exacte (arrondie à ~1 km).
function fiche(b, extra = {}) {
  const s = b.Site;
  return {
    id: b.id, type: b.type, standing: b.standing, chambres: b.pieces, capacite: b.capacite, prix_nuit: b.prix_nuit,
    description: b.description, equipements: b.equipements,
    photos: b.photos.map(p => `/api/public/biens/${b.id}/photos/${p}`),
    lieu: { site: s.nom, ville: s.ville, quartier: s.quartier, lat: s.latitude != null ? Math.round(s.latitude * 100) / 100 : null, lng: s.longitude != null ? Math.round(s.longitude * 100) / 100 : null },
    bailleur: { nom: b.Bailleur.nom, logo: b.Bailleur.logo_id ? `/api/fichiers/logo/${b.Bailleur.id}` : null },
    ...extra,
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
  let biens = await Bien.findAll({ where, include, order: [['prix_nuit', 'ASC']], limit: 300 });
  // Disponibilité réelle : les plannings des gérants font foi.
  let nuits = null;
  if (arrivee && depart) {
    try { nuits = nuitsEntre(arrivee, depart); } catch (e) { throw new Erreur(400, e.message); }
    if (arrivee < aujourdhui()) throw new Erreur(400, 'La date d’arrivée est passée');
    const pris = new Set((await occupe(biens.map(b => b.id), arrivee, depart)).map(r => r.bien_id));
    biens = biens.filter(b => !pris.has(b.id));
  }
  // Les villas avec photos d'abord (les clients les choisissent), puis du moins cher au plus cher.
  biens.sort((a, b) => (b.photos.length > 0) - (a.photos.length > 0) || a.prix_nuit - b.prix_nuit);
  let resultats = biens.map(b => fiche(b, nuits ? { nuits, total: nuits * b.prix_nuit } : {}));
  if (lat && lng) {
    const ici = { lat: Number(lat), lng: Number(lng) };
    const max = Number(rayon) || 15;
    resultats = biens.filter(b => b.Site.latitude != null).map(b => ({ b, d: distance(ici, { lat: Number(b.Site.latitude), lng: Number(b.Site.longitude) }) }))
      .filter(x => x.d <= max).sort((x, y) => x.d - y.d)
      .map(({ b, d }) => fiche(b, { distance_km: Math.round(d * 10) / 10, ...(nuits ? { nuits, total: nuits * b.prix_nuit } : {}) }));
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
  res.json(fiche(b, { indisponible: prises.map(r => ({ du: r.arrivee, au: r.depart })) }));
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
  res.json({ nom: bailleur.nom, ville: bailleur.ville, logo: bailleur.logo_id ? `/api/fichiers/logo/${bailleur.id}` : null, villas: biens.map(b => fiche(b)) });
}));

// Suivi par le client, avec le code reçu (sans compte).
router.get('/demandes/:code', route(async (req, res) => {
  await plateforme();
  const d = await Demande.findOne({ where: { code: String(req.params.code).toUpperCase().slice(0, 12) }, include: [{ model: Bien, include: avecSiteEtBailleur }] });
  if (!d) throw new Erreur(404, 'Demande introuvable');
  res.json({
    code: d.code, statut: d.statut, motif_refus: d.motif_refus, arrivee: d.arrivee, depart: d.depart, nuits: d.nuits, total: d.total, nom: d.nom,
    villa: { id: d.Bien.id, type: d.Bien.type, standing: d.Bien.standing, lieu: { site: d.Bien.Site.nom, ville: d.Bien.Site.ville, quartier: d.Bien.Site.quartier } },
    // Le contact du bailleur n'est donné qu'une fois la demande acceptée.
    contact: d.statut === 'acceptee' ? { nom: d.Bien.Bailleur.nom, telephone: d.Bien.Bailleur.telephone } : null,
  });
}));

module.exports = { router, EQUIPEMENTS };
