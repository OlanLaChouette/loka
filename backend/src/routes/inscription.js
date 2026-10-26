// Comptes en libre-service : un bailleur crée lui-même son espace (vérification par code e-mail),
// et toute personne ayant une adresse e-mail peut réinitialiser son mot de passe.
// L'espace créé reste en essai de 14 jours : c'est l'administration Loka qui l'active.
const router = require('express').Router();
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { Op } = require('sequelize');
const { Utilisateur, Bailleur, Membre, Verification } = require('../models');
const { Erreur, route } = require('../utils/erreurs');
const { definir } = require('../middleware/contexte');
const { sessionDe } = require('./auth');
const { finEssai } = require('../services/calculs');
const { envoyer, courrielCode, courrielNouvelEspace } = require('../services/courriel');

const VALIDITE = 30 * 60 * 1000;
const ESSAIS_MAX = 5;
const ENVOIS_MAX = 5;
const limiteur = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, skip: () => process.env.NODE_ENV === 'test', message: { message: 'Trop de demandes, réessayez dans 15 minutes' } });

const nouveauCode = () => String(crypto.randomInt(0, 1000000)).padStart(6, '0');
const empreinte = (code) => crypto.createHmac('sha256', process.env.JWT_SECRET).update(String(code)).digest('hex');
const normaliserEmail = (e) => String(e || '').trim().toLowerCase();
const normaliserTelephone = (t) => String(t || '').replace(/[\s.-]/g, '');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function dejaInscrit(telephone, email) {
  const u = await Utilisateur.findOne({ where: { [Op.or]: [{ telephone }, { email }] } });
  if (!u) return;
  if (u.email === email) throw new Erreur(409, 'Cette adresse e-mail a déjà un compte Loka. Connectez-vous, ou utilisez « Mot de passe oublié ».');
  throw new Erreur(409, 'Ce numéro a déjà un compte Loka. Connectez-vous avec lui, ou contactez eYamTech pour ouvrir un autre espace.');
}

// Vérifie un code. Les essais ratés sont comptés hors de la transaction de la requête,
// sinon l'annulation qui suit l'erreur les effacerait.
async function controler(id, code, objet) {
  const v = UUID.test(id || '') ? await Verification.findByPk(id) : null;
  if (!v || v.objet !== objet || v.expire_le < new Date()) throw new Erreur(400, 'Ce code a expiré. Demandez-en un nouveau.');
  if (v.tentatives >= ESSAIS_MAX) throw new Erreur(429, 'Trop d’essais. Demandez un nouveau code.');
  const attendu = Buffer.from(v.code_hash, 'hex');
  const recu = Buffer.from(empreinte(String(code || '').trim()), 'hex');
  if (!crypto.timingSafeEqual(attendu, recu)) {
    await Verification.increment('tentatives', { where: { id: v.id }, transaction: null });
    const reste = ESSAIS_MAX - v.tentatives - 1;
    throw new Erreur(400, reste > 0 ? `Code incorrect. Encore ${reste} essai${reste > 1 ? 's' : ''}.` : 'Code incorrect. Demandez un nouveau code.');
  }
  return v;
}

// 1. Le bailleur remplit le formulaire : rien n'est créé, on lui envoie un code.
router.post('/inscription', limiteur, route(async (req, res) => {
  const { nom, entreprise, ville, mot_de_passe } = req.body || {};
  const telephone = normaliserTelephone(req.body?.telephone);
  const email = normaliserEmail(req.body?.email);
  if (!String(nom || '').trim() || !String(entreprise || '').trim()) throw new Erreur(400, 'Votre nom et celui de votre entreprise sont requis');
  if (!/^\+?\d{8,15}$/.test(telephone)) throw new Erreur(400, 'Numéro de téléphone invalide');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Erreur(400, 'Adresse e-mail invalide');
  if (!mot_de_passe || mot_de_passe.length < 8) throw new Erreur(400, 'Le mot de passe doit faire au moins 8 caractères');
  await dejaInscrit(telephone, email);

  // Ménage : demandes expirées depuis un jour, et demande précédente pour la même adresse.
  await Verification.destroy({ where: { [Op.or]: [{ expire_le: { [Op.lt]: new Date(Date.now() - 86400000) } }, { objet: 'inscription', email }] } });
  const code = nouveauCode();
  const v = await Verification.create({
    objet: 'inscription', email, code_hash: empreinte(code), expire_le: new Date(Date.now() + VALIDITE),
    donnees: { nom: nom.trim(), entreprise: entreprise.trim(), ville: String(ville || '').trim() || null, telephone, mot_de_passe_hash: await bcrypt.hash(mot_de_passe, 10) },
  });
  await envoyer(courrielCode({ a: email, nom: nom.trim(), code, objet: 'inscription' }));
  res.status(201).json({ id: v.id, email });
}));

// 2. Le bon code crée le compte, l'espace en essai, et ouvre la session.
router.post('/inscription/verifier', limiteur, route(async (req, res) => {
  const v = await controler(req.body?.id, req.body?.code, 'inscription');
  const d = v.donnees;
  await dejaInscrit(d.telephone, v.email);

  // L'espace est créé sous sa propre identité : les règles de séparation s'appliquent dès la première ligne.
  const bailleurId = crypto.randomUUID();
  await definir('app.bailleur_id', bailleurId);
  const u = await Utilisateur.create({ nom: d.nom, telephone: d.telephone, email: v.email, mot_de_passe_hash: d.mot_de_passe_hash });
  await definir('app.utilisateur_id', u.id);
  const essaiFin = finEssai();
  const b = await Bailleur.create({ id: bailleurId, nom: d.entreprise, ville: d.ville, telephone: d.telephone, email: v.email, statut: 'essai', essai_fin: essaiFin, origine: 'inscription' });
  await Membre.create({ bailleur_id: b.id, utilisateur_id: u.id, role: 'proprietaire' });
  await v.destroy();

  // L'avis à l'administration ne doit jamais bloquer l'inscription.
  envoyer(courrielNouvelEspace({ bailleur: b, proprietaire: { nom: d.nom, telephone: d.telephone, email: v.email }, essaiFin }))
    .catch(e => console.error('Avis de nouvel espace non envoyé :', e.message));
  res.status(201).json(await sessionDe(u));
}));

// Renvoie un nouveau code pour une demande en cours (e-mail perdu, code expiré).
router.post('/verification/renvoyer', limiteur, route(async (req, res) => {
  const v = UUID.test(req.body?.id || '') ? await Verification.findByPk(req.body.id) : null;
  if (!v) return res.json({ ok: true }); // demande inconnue (adresse sans compte) : même réponse
  if (v.envois >= ENVOIS_MAX) throw new Erreur(429, 'Trop d’envois pour cette demande. Recommencez depuis le début.');
  const code = nouveauCode();
  await v.update({ code_hash: empreinte(code), expire_le: new Date(Date.now() + VALIDITE), tentatives: 0, envois: v.envois + 1 });
  const nom = v.objet === 'inscription' ? v.donnees.nom : (await Utilisateur.findOne({ where: { email: v.email } }))?.nom;
  await envoyer(courrielCode({ a: v.email, nom, code, objet: v.objet }));
  res.json({ ok: true });
}));

// Mot de passe oublié : la réponse est la même que l'adresse ait un compte ou non.
router.post('/mot-de-passe/oubli', limiteur, route(async (req, res) => {
  const email = normaliserEmail(req.body?.email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Erreur(400, 'Adresse e-mail invalide');
  const u = await Utilisateur.findOne({ where: { email } });
  if (!u || !u.actif) return res.json({ id: crypto.randomUUID(), email });
  await Verification.destroy({ where: { objet: 'mot_de_passe', email } });
  const code = nouveauCode();
  const v = await Verification.create({ objet: 'mot_de_passe', email, code_hash: empreinte(code), expire_le: new Date(Date.now() + VALIDITE) });
  await envoyer(courrielCode({ a: email, nom: u.nom, code, objet: 'mot_de_passe' }));
  res.json({ id: v.id, email });
}));

router.post('/mot-de-passe/reinitialiser', limiteur, route(async (req, res) => {
  const { mot_de_passe } = req.body || {};
  if (!mot_de_passe || mot_de_passe.length < 8) throw new Erreur(400, 'Le mot de passe doit faire au moins 8 caractères');
  const v = await controler(req.body?.id, req.body?.code, 'mot_de_passe');
  const u = await Utilisateur.scope('avecSecret').findOne({ where: { email: v.email } });
  if (!u || !u.actif) throw new Erreur(400, 'Ce code a expiré. Demandez-en un nouveau.');
  await u.update({ mot_de_passe_hash: await bcrypt.hash(mot_de_passe, 10) });
  await v.destroy();
  res.json(await sessionDe(u));
}));

module.exports = router;
