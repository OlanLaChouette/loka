// Ce qui structure l'espace d'un bailleur : son entreprise, ses membres, ses sites, ses biens, ses charges fixes.
const router = require('express').Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const { sequelize, Bailleur, Utilisateur, Membre, Site, Bien, ChargeFixe } = require('../models');
const { authentifier, espace, autoriser, ecriture, portee, verifierSite } = require('../middleware/auth');
const { Erreur, route } = require('../utils/erreurs');
const { transaction, lier, definir } = require('../middleware/contexte');
const { noter } = require('../utils/journal');

const DOSSIER = process.env.UPLOADS_DIR || path.join(__dirname, '..', '..', 'uploads');
const televersement = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => { const d = path.join(DOSSIER, req.espace.id); fs.mkdirSync(d, { recursive: true }); cb(null, d); },
    filename: (req, file, cb) => cb(null, 'logo-' + Date.now() + path.extname(file.originalname).toLowerCase()),
  }),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, ['image/png', 'image/jpeg', 'image/webp'].includes(file.mimetype)),
});

router.use(authentifier, espace);
const proprietaire = autoriser('proprietaire');
const garder = (obj, champs) => Object.fromEntries(champs.filter(c => obj[c] !== undefined).map(c => [c, obj[c]]));

// ---------- Entreprise du bailleur ----------
const CHAMPS_ENTREPRISE = ['nom', 'forme_juridique', 'rccm', 'ifu', 'adresse', 'ville', 'pays', 'telephone', 'email', 'limite_reduction_defaut'];
router.get('/profil', route(async (req, res) => {
  res.json({ ...req.espace.toJSON(), logo: req.espace.logo_chemin ? `/api/fichiers/logo/${req.espace.id}` : null, mon_role: req.role });
}));
router.patch('/profil', proprietaire, route(async (req, res) => {
  await req.espace.update(garder(req.body, CHAMPS_ENTREPRISE));
  await noter(req, 'profil_modifie', 'bailleur', req.espace.id);
  res.json(req.espace);
}));
router.post('/profil/logo', proprietaire, lier(televersement.single('logo')), route(async (req, res) => {
  if (!req.file) throw new Erreur(400, 'Image PNG, JPEG ou WebP de 2 Mo maximum');
  const ancien = req.espace.logo_chemin;
  await req.espace.update({ logo_chemin: path.join(req.espace.id, req.file.filename) });
  if (ancien) fs.rm(path.join(DOSSIER, ancien), () => {});
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
router.post('/sites', proprietaire, route(async (req, res) => {
  res.status(201).json(await Site.create({ ...garder(req.body, ['nom', 'ville', 'adresse']), bailleur_id: req.espace.id }));
}));
router.patch('/sites/:id', proprietaire, route(async (req, res) => {
  const s = await Site.findOne({ where: { id: req.params.id, bailleur_id: req.espace.id } });
  if (!s) throw new Erreur(404, 'Site introuvable');
  res.json(await s.update(garder(req.body, ['nom', 'ville', 'adresse'])));
}));

// ---------- Biens ----------
const CHAMPS_BIEN = ['site_id', 'reference', 'type', 'mode', 'standing', 'pieces', 'prix_nuit', 'prix_mois', 'etat', 'compteur_electrique', 'description'];
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

module.exports = { router, DOSSIER, verifierSite };
