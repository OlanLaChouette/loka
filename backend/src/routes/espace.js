// Ce qui structure l'espace d'un bailleur : son entreprise, ses membres, ses sites, ses biens, ses charges fixes.
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { sequelize, Bailleur, Utilisateur, Membre, Site, Bien, ChargeFixe, Fichier, Reservation, Bail, Depense } = require('../models');
const { recevoirLogo, recevoirPhoto, enregistrer, envoyer } = require('../utils/fichiers');
const { authentifier, espace, autoriser, ecriture, portee, verifierSite } = require('../middleware/auth');
const { Erreur, route } = require('../utils/erreurs');
const { transaction, lier, definir } = require('../middleware/contexte');
const { noter } = require('../utils/journal');


router.use(authentifier, espace);
const proprietaire = autoriser('proprietaire');
const garder = (obj, champs) => Object.fromEntries(champs.filter(c => obj[c] !== undefined).map(c => [c, obj[c]]));

// ---------- Entreprise du bailleur ----------
const CHAMPS_ENTREPRISE = ['nom', 'forme_juridique', 'rccm', 'ifu', 'adresse', 'ville', 'pays', 'telephone', 'email', 'limite_reduction_defaut'];
// Adresse de la page publique : le nom, sans accents ni espaces, suivi du début de l'identifiant (donc unique).
const adressePage = (b) => `${b.nom.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'residence'}-${b.id.slice(0, 4)}`;
router.get('/profil', route(async (req, res) => {
  if (!req.espace.page && req.role === 'proprietaire') await req.espace.update({ page: adressePage(req.espace) });
  res.json({ ...req.espace.toJSON(), logo: req.espace.logo_id ? `/api/fichiers/logo/${req.espace.id}` : null, mon_role: req.role });
}));
router.patch('/profil', proprietaire, route(async (req, res) => {
  await req.espace.update(garder(req.body, CHAMPS_ENTREPRISE));
  await noter(req, 'profil_modifie', 'bailleur', req.espace.id);
  res.json(req.espace);
}));
router.post('/profil/logo', proprietaire, lier(recevoirLogo), route(async (req, res) => {
  if (!req.file) throw new Erreur(400, 'Image PNG, JPEG ou WebP de 1 Mo maximum');
  const ancien = req.espace.logo_id;
  await req.espace.update({ logo_id: await enregistrer(req.file, req.espace.id) });
  if (ancien) await Fichier.destroy({ where: { id: ancien, bailleur_id: req.espace.id } });
  res.json({ logo: `/api/fichiers/logo/${req.espace.id}` });
}));

// ---------- Membres (gérants, comptables) ----------
router.get('/membres', proprietaire, route(async (req, res) => {
  res.json(await Membre.findAll({ where: { bailleur_id: req.espace.id }, include: [Utilisateur], order: [['cree_le', 'ASC']] }));
}));
router.post('/membres', proprietaire, route(async (req, res) => {
  const { nom, telephone, email, mot_de_passe, role, sites, limite_reduction } = req.body || {};
  if (!nom || !telephone || !['gerant', 'comptable'].includes(role)) throw new Erreur(400, 'Nom, téléphone et rôle (gérant ou comptable) requis');
  const membre = await transaction(async (t) => {
    let u = await Utilisateur.findOne({ where: { telephone }, transaction: t });
    if (!u) {
      if (!mot_de_passe || mot_de_passe.length < 8) throw new Erreur(400, 'Mot de passe de 8 caractères minimum pour un nouveau compte');
      u = await Utilisateur.create({ nom, telephone, email: email || null, mot_de_passe_hash: await bcrypt.hash(mot_de_passe, 10) }, { transaction: t });
    }
    return Membre.create({ bailleur_id: req.espace.id, utilisateur_id: u.id, role, sites: sites?.length ? sites : null, limite_reduction: limite_reduction ?? null }, { transaction: t });
  });
  await noter(req, 'membre_ajoute', 'membre', membre.id, { role });
  res.status(201).json(membre);
}));
// Le propriétaire redonne un mot de passe provisoire à un gérant ou un comptable qui l'a oublié.
router.post('/membres/:id/mot-de-passe', proprietaire, route(async (req, res) => {
  const m = await Membre.findOne({ where: { id: req.params.id, bailleur_id: req.espace.id } });
  if (!m) throw new Erreur(404, 'Membre introuvable');
  if (m.role === 'proprietaire') throw new Erreur(400, 'Changez votre propre mot de passe depuis le menu');
  const { mot_de_passe } = req.body || {};
  if (!mot_de_passe || mot_de_passe.length < 8) throw new Erreur(400, 'Mot de passe de 8 caractères minimum');
  // Une personne qui travaille aussi pour d'autres bailleurs garde la main sur son compte.
  const [{ n }] = await sequelize.query('SELECT loka_nb_espaces(:u) AS n', { replacements: { u: m.utilisateur_id }, type: 'SELECT' });
  if (n > 1) throw new Erreur(409, 'Cette personne travaille aussi pour un autre bailleur : elle doit changer son mot de passe elle-même');
  await Utilisateur.update({ mot_de_passe_hash: await bcrypt.hash(mot_de_passe, 10) }, { where: { id: m.utilisateur_id } });
  await noter(req, 'mot_de_passe_reinitialise', 'membre', m.id);
  res.json({ ok: true });
}));

router.patch('/membres/:id', proprietaire, route(async (req, res) => {
  const m = await Membre.findOne({ where: { id: req.params.id, bailleur_id: req.espace.id } });
  if (!m) throw new Erreur(404, 'Membre introuvable');
  if (m.role === 'proprietaire') throw new Erreur(400, 'Le propriétaire ne se modifie pas ici');
  await m.update(garder(req.body, ['role', 'sites', 'limite_reduction', 'actif']));
  await noter(req, 'membre_modifie', 'membre', m.id, req.body);
  res.json(m);
}));

// ---------- Sites ----------
router.get('/sites', route(async (req, res) => {
  const filtre = { bailleur_id: req.espace.id };
  if (req.sitesAutorises) filtre.id = req.sitesAutorises;
  res.json(await Site.findAll({ where: filtre, order: [['nom', 'ASC']] }));
}));
const CHAMPS_SITE = ['nom', 'ville', 'adresse', 'quartier', 'latitude', 'longitude'];
router.post('/sites', proprietaire, route(async (req, res) => {
  res.status(201).json(await Site.create({ ...garder(req.body, CHAMPS_SITE), bailleur_id: req.espace.id }));
}));
router.patch('/sites/:id', proprietaire, route(async (req, res) => {
  const s = await Site.findOne({ where: { id: req.params.id, bailleur_id: req.espace.id } });
  if (!s) throw new Erreur(404, 'Site introuvable');
  res.json(await s.update(garder(req.body, CHAMPS_SITE)));
}));

router.delete('/sites/:id', proprietaire, route(async (req, res) => {
  const s = await Site.findOne({ where: { id: req.params.id, bailleur_id: req.espace.id } });
  if (!s) throw new Erreur(404, 'Site introuvable');
  if (await Bien.count({ where: { site_id: s.id } })) throw new Erreur(409, 'Ce site contient des biens : supprimez-les ou retirez-les d\u2019abord');
  await s.destroy();
  res.json({ ok: true });
}));

// ---------- Biens ----------
const CHAMPS_BIEN = ['site_id', 'reference', 'type', 'mode', 'standing', 'pieces', 'prix_nuit', 'prix_mois', 'etat', 'compteur_electrique', 'description', 'publie', 'equipements', 'capacite'];
router.get('/biens', route(async (req, res) => {
  const extra = req.query.site_id ? { site_id: req.query.site_id } : {};
  res.json(await Bien.findAll({ where: portee(req, extra), include: [Site], order: [['reference', 'ASC']] }));
}));
router.post('/biens', proprietaire, route(async (req, res) => {
  const donnees = garder(req.body, CHAMPS_BIEN);
  const site = await Site.findOne({ where: { id: donnees.site_id || null, bailleur_id: req.espace.id } });
  if (!site) throw new Erreur(400, 'Site inconnu');
  const bien = await Bien.create({ ...donnees, bailleur_id: req.espace.id });
  await noter(req, 'bien_ajoute', 'bien', bien.id, { reference: bien.reference });
  res.status(201).json(bien);
}));
// Ajout de plusieurs biens d'un coup : par exemple A1 à A10, même type et même prix.
router.post('/biens/lot', proprietaire, route(async (req, res) => {
  const { site_id, prefixe = '', debut = 1, fin, type = 'villa', mode = 'nuit', prix, standing, pieces } = req.body || {};
  const site = await Site.findOne({ where: { id: site_id || null, bailleur_id: req.espace.id } });
  if (!site) throw new Erreur(400, 'Site inconnu');
  const a = Number(debut), b = Number(fin);
  if (!Number.isInteger(a) || !Number.isInteger(b) || b < a || b - a > 99) throw new Erreur(400, 'Numéros invalides (100 biens maximum à la fois)');
  const existants = new Set((await Bien.findAll({ where: { site_id: site.id }, attributes: ['reference'] })).map(x => x.reference));
  const lignes = [];
  for (let n = a; n <= b; n++) {
    const reference = `${prefixe}${n}`;
    if (!existants.has(reference)) lignes.push({ bailleur_id: req.espace.id, site_id: site.id, reference, type, mode, standing: standing || null, pieces: pieces || null, prix_nuit: mode === 'nuit' ? Number(prix) || 0 : null, prix_mois: mode === 'mois' ? Number(prix) || 0 : null });
  }
  if (!lignes.length) throw new Erreur(409, 'Ces références existent déjà sur ce site');
  const crees = await Bien.bulkCreate(lignes, { validate: true });
  await noter(req, 'bien_ajoute', 'bien', null, { nombre: crees.length, de: lignes[0].reference, a: lignes[lignes.length - 1].reference });
  res.status(201).json({ crees: crees.length, ignores: b - a + 1 - crees.length });
}));

// Supprimer un bien n'est possible que s'il n'a encore rien enregistré ; sinon on le retire de la location.
router.delete('/biens/:id', proprietaire, route(async (req, res) => {
  const bien = await Bien.findOne({ where: { id: req.params.id, bailleur_id: req.espace.id } });
  if (!bien) throw new Erreur(404, 'Bien introuvable');
  const utilise = await Reservation.count({ where: { bien_id: bien.id } }) + await Bail.count({ where: { bien_id: bien.id } }) + await Depense.count({ where: { bien_id: bien.id } });
  if (utilise) throw new Erreur(409, 'Ce bien a déjà un historique : passez son état à « Retiré de la location »');
  await bien.destroy();
  if (bien.photos.length) await Fichier.destroy({ where: { id: bien.photos, bailleur_id: req.espace.id } });
  await noter(req, 'bien_supprime', 'bien', bien.id, { reference: bien.reference });
  res.json({ ok: true });
}));

// État de la mise en route d'un espace : ce qui reste à faire avant de travailler.
router.get('/mise-en-route', route(async (req, res) => {
  const b = req.espace;
  const [sites, biens, gerants, charges] = await Promise.all([
    Site.count({ where: { bailleur_id: b.id } }),
    Bien.count({ where: { bailleur_id: b.id } }),
    Membre.count({ where: { bailleur_id: b.id, role: 'gerant', actif: true } }),
    ChargeFixe.count({ where: { bailleur_id: b.id, actif: true } }),
  ]);
  const etapes = [
    { cle: 'entreprise', fait: !!(b.adresse || b.telephone || b.rccm) },
    { cle: 'logo', fait: !!b.logo_id },
    { cle: 'site', fait: sites > 0 },
    { cle: 'biens', fait: biens > 0 },
    { cle: 'gerant', fait: gerants > 0 },
    { cle: 'charges', fait: charges > 0 },
  ];
  res.json({ etapes, compte: { sites, biens, gerants, charges }, pret: sites > 0 && biens > 0 });
}));

router.patch('/biens/:id', ecriture, route(async (req, res) => {
  const bien = await Bien.findOne({ where: portee(req, { id: req.params.id }) });
  if (!bien) throw new Erreur(404, 'Bien introuvable');
  // Le gérant ne change que l'état (travaux, disponible) ; le prix reste au propriétaire.
  const champs = req.role === 'proprietaire' ? CHAMPS_BIEN : ['etat'];
  const avant = { prix_nuit: bien.prix_nuit, prix_mois: bien.prix_mois, etat: bien.etat };
  await bien.update(garder(req.body, champs.filter(c => c !== 'site_id')));
  if (avant.prix_nuit !== bien.prix_nuit || avant.prix_mois !== bien.prix_mois) await noter(req, 'prix_modifie', 'bien', bien.id, { avant, apres: { prix_nuit: bien.prix_nuit, prix_mois: bien.prix_mois } });
  if (avant.etat !== bien.etat) await noter(req, 'etat_modifie', 'bien', bien.id, { avant: avant.etat, apres: bien.etat });
  res.json(bien);
}));

// ---------- Photos d'un bien (propriétaire et gérants du site ; 6 au plus) ----------
const PHOTOS_MAX = 6;
const bienAccessible = async (req) => {
  const bien = await Bien.findOne({ where: portee(req, { id: req.params.id }) });
  if (!bien) throw new Erreur(404, 'Bien introuvable');
  return bien;
};
router.post('/biens/:id/photos', ecriture, lier(recevoirPhoto), route(async (req, res) => {
  const bien = await bienAccessible(req);
  if (!req.file) throw new Erreur(400, 'Photo manquante (PNG, JPEG ou WebP, 2 Mo au plus)');
  if (bien.photos.length >= PHOTOS_MAX) throw new Erreur(409, `${PHOTOS_MAX} photos au plus par bien : supprimez-en une d’abord`);
  const id = await enregistrer(req.file, req.espace.id);
  await bien.update({ photos: [...bien.photos, id] });
  await noter(req, 'photo_ajoutee', 'bien', bien.id, { reference: bien.reference });
  res.status(201).json(bien);
}));
// Met une photo en couverture (première position).
router.post('/biens/:id/photos/:photo/couverture', ecriture, route(async (req, res) => {
  const bien = await bienAccessible(req);
  if (!bien.photos.includes(req.params.photo)) throw new Erreur(404, 'Photo introuvable');
  await bien.update({ photos: [req.params.photo, ...bien.photos.filter(p => p !== req.params.photo)] });
  res.json(bien);
}));
router.delete('/biens/:id/photos/:photo', ecriture, route(async (req, res) => {
  const bien = await bienAccessible(req);
  if (!bien.photos.includes(req.params.photo)) throw new Erreur(404, 'Photo introuvable');
  await bien.update({ photos: bien.photos.filter(p => p !== req.params.photo) });
  await Fichier.destroy({ where: { id: req.params.photo, bailleur_id: req.espace.id } });
  res.json(bien);
}));
router.get('/fichiers/photo/:id/:photo', route(async (req, res) => {
  const bien = await bienAccessible(req);
  const f = bien.photos.includes(req.params.photo) && await Fichier.findOne({ where: { id: req.params.photo, bailleur_id: req.espace.id } });
  if (!f) throw new Erreur(404, 'Photo introuvable');
  envoyer(res, f);
}));

// ---------- Charges fixes (liste libre, modifiable par le propriétaire) ----------
router.get('/charges', route(async (req, res) => {
  res.json(await ChargeFixe.findAll({ where: { bailleur_id: req.espace.id }, order: [['actif', 'DESC'], ['nom', 'ASC']] }));
}));
router.post('/charges', proprietaire, route(async (req, res) => {
  const c = await ChargeFixe.create({ ...garder(req.body, ['nom', 'montant', 'periodicite', 'portee', 'site_id', 'bien_id']), bailleur_id: req.espace.id });
  await noter(req, 'charge_ajoutee', 'charge', c.id, { nom: c.nom, montant: c.montant });
  res.status(201).json(c);
}));
router.patch('/charges/:id', proprietaire, route(async (req, res) => {
  const c = await ChargeFixe.findOne({ where: { id: req.params.id, bailleur_id: req.espace.id } });
  if (!c) throw new Erreur(404, 'Charge introuvable');
  await c.update(garder(req.body, ['nom', 'montant', 'periodicite', 'portee', 'site_id', 'bien_id', 'actif']));
  await noter(req, 'charge_modifiee', 'charge', c.id, req.body);
  res.json(c);
}));
// « Supprimer » une charge la désactive : elle reste visible dans les mois passés.
router.delete('/charges/:id', proprietaire, route(async (req, res) => {
  const c = await ChargeFixe.findOne({ where: { id: req.params.id, bailleur_id: req.espace.id } });
  if (!c) throw new Erreur(404, 'Charge introuvable');
  await c.update({ actif: false });
  await noter(req, 'charge_retiree', 'charge', c.id, { nom: c.nom });
  res.json(c);
}));

module.exports = { router, verifierSite };
