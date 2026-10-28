// Modèle de données de Loka.
// Toute donnée métier porte `bailleur_id` : un bailleur ne voit jamais les données d'un autre.
// Les montants sont en FCFA entiers (pas de centimes).
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const id = { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true };
const montant = (requis = true) => ({ type: DataTypes.INTEGER, allowNull: !requis, defaultValue: requis ? 0 : null, validate: { min: 0 } });
const lieAuBailleur = { bailleur_id: { type: DataTypes.UUID, allowNull: false } };

// ---------- Comptes et espaces ----------
const Utilisateur = sequelize.define('Utilisateur', {
  id,
  nom: { type: DataTypes.STRING(120), allowNull: false },
  telephone: { type: DataTypes.STRING(30), allowNull: false, unique: true },
  email: { type: DataTypes.STRING(160), unique: true, validate: { isEmail: true } },
  mot_de_passe_hash: { type: DataTypes.STRING, allowNull: false },
  est_admin_plateforme: { type: DataTypes.BOOLEAN, defaultValue: false },
  actif: { type: DataTypes.BOOLEAN, defaultValue: true },
  theme: { type: DataTypes.ENUM('clair', 'sombre'), defaultValue: 'clair' },
}, { tableName: 'utilisateurs', defaultScope: { attributes: { exclude: ['mot_de_passe_hash'] } }, scopes: { avecSecret: {} } });

// Un bailleur = une entreprise cliente de Loka, avec son logo et ses informations légales.
const Bailleur = sequelize.define('Bailleur', {
  id,
  nom: { type: DataTypes.STRING(160), allowNull: false },
  forme_juridique: DataTypes.STRING(60),
  rccm: DataTypes.STRING(60),
  ifu: DataTypes.STRING(60),
  adresse: DataTypes.STRING(255),
  ville: DataTypes.STRING(80),
  pays: { type: DataTypes.STRING(80), defaultValue: 'Burkina Faso' },
  telephone: DataTypes.STRING(30),
  email: DataTypes.STRING(160),
  logo_id: DataTypes.UUID,
  statut: { type: DataTypes.ENUM('essai', 'actif', 'suspendu'), defaultValue: 'essai' },
  essai_fin: DataTypes.DATEONLY,
  limite_reduction_defaut: { type: DataTypes.INTEGER, defaultValue: 10, validate: { min: 0, max: 100 } },
  dernier_numero_recu: { type: DataTypes.INTEGER, defaultValue: 0 },
  origine: { type: DataTypes.ENUM('plateforme', 'inscription'), defaultValue: 'plateforme' },
}, { tableName: 'bailleurs' });

// Codes envoyés par e-mail : création d'un espace par le bailleur lui-même, mot de passe oublié.
// Pour une inscription, le compte n'est créé qu'une fois le code saisi : `donnees` le garde en attendant.
const Verification = sequelize.define('Verification', {
  id,
  objet: { type: DataTypes.ENUM('inscription', 'mot_de_passe'), allowNull: false },
  email: { type: DataTypes.STRING(160), allowNull: false },
  code_hash: { type: DataTypes.STRING(64), allowNull: false },
  donnees: { type: DataTypes.JSONB, defaultValue: {} },
  expire_le: { type: DataTypes.DATE, allowNull: false },
  tentatives: { type: DataTypes.INTEGER, defaultValue: 0 },
  envois: { type: DataTypes.INTEGER, defaultValue: 1 },
}, { tableName: 'verifications' });

// Lien entre une personne et un espace bailleur. Une personne peut appartenir à plusieurs espaces.
const Membre = sequelize.define('Membre', {
  id, ...lieAuBailleur,
  utilisateur_id: { type: DataTypes.UUID, allowNull: false },
  role: { type: DataTypes.ENUM('proprietaire', 'gerant', 'comptable'), allowNull: false },
  sites: { type: DataTypes.ARRAY(DataTypes.UUID) },          // null = tous les sites
  limite_reduction: { type: DataTypes.INTEGER, validate: { min: 0, max: 100 } }, // null = limite du bailleur
  actif: { type: DataTypes.BOOLEAN, defaultValue: true },
}, { tableName: 'membres', indexes: [{ unique: true, fields: ['bailleur_id', 'utilisateur_id'] }] });

// ---------- Patrimoine ----------
const Site = sequelize.define('Site', {
  id, ...lieAuBailleur,
  nom: { type: DataTypes.STRING(120), allowNull: false },
  ville: DataTypes.STRING(80),
  adresse: DataTypes.STRING(255),
}, { tableName: 'sites' });

const Bien = sequelize.define('Bien', {
  id, ...lieAuBailleur,
  site_id: { type: DataTypes.UUID, allowNull: false },
  reference: { type: DataTypes.STRING(40), allowNull: false },
  type: { type: DataTypes.ENUM('villa', 'appartement', 'studio', 'chambre', 'magasin', 'bureau', 'autre'), defaultValue: 'villa' },
  mode: { type: DataTypes.ENUM('nuit', 'mois'), allowNull: false, defaultValue: 'nuit' },
  standing: DataTypes.STRING(60),
  pieces: DataTypes.INTEGER,
  prix_nuit: montant(false),
  prix_mois: montant(false),
  etat: { type: DataTypes.ENUM('disponible', 'travaux', 'retire'), defaultValue: 'disponible' },
  compteur_electrique: DataTypes.STRING(60),
  description: DataTypes.TEXT,
  // Photos du bien (identifiants de Fichier, dans l'ordre d'affichage ; la première sert de couverture).
  photos: { type: DataTypes.ARRAY(DataTypes.UUID), allowNull: false, defaultValue: [] },
}, { tableName: 'biens', indexes: [{ unique: true, fields: ['bailleur_id', 'site_id', 'reference'] }] });

// ---------- Clients, séjours et baux ----------
const Client = sequelize.define('Client', {
  id, ...lieAuBailleur,
  nom: { type: DataTypes.STRING(160), allowNull: false },
  telephone: DataTypes.STRING(30),
  piece_type: DataTypes.STRING(40),
  piece_numero: DataTypes.STRING(60),
  notes: DataTypes.TEXT,
}, { tableName: 'clients' });

const Reservation = sequelize.define('Reservation', {
  id, ...lieAuBailleur,
  site_id: { type: DataTypes.UUID, allowNull: false },
  bien_id: { type: DataTypes.UUID, allowNull: false },
  client_id: { type: DataTypes.UUID, allowNull: false },
  arrivee: { type: DataTypes.DATEONLY, allowNull: false },
  depart: { type: DataTypes.DATEONLY, allowNull: false },
  nuits: { type: DataTypes.INTEGER, allowNull: false },
  prix_nuit: montant(),
  prix_normal: montant(),
  reduction: montant(),
  reduction_motif: DataTypes.STRING(160),
  total: montant(),
  statut: { type: DataTypes.ENUM('attente_validation', 'confirmee', 'annulee'), defaultValue: 'confirmee' },
  cree_par: DataTypes.UUID,
  validee_par: DataTypes.UUID,
}, { tableName: 'reservations' });

const Bail = sequelize.define('Bail', {
  id, ...lieAuBailleur,
  site_id: { type: DataTypes.UUID, allowNull: false },
  bien_id: { type: DataTypes.UUID, allowNull: false },
  client_id: { type: DataTypes.UUID, allowNull: false },
  debut: { type: DataTypes.DATEONLY, allowNull: false },
  fin: DataTypes.DATEONLY,
  loyer: montant(),
  jour_echeance: { type: DataTypes.INTEGER, defaultValue: 5, validate: { min: 1, max: 28 } },
  caution: montant(),
  statut: { type: DataTypes.ENUM('actif', 'termine'), defaultValue: 'actif' },
}, { tableName: 'baux' });

// ---------- Argent ----------
const Paiement = sequelize.define('Paiement', {
  id, ...lieAuBailleur,
  site_id: { type: DataTypes.UUID, allowNull: false },
  reservation_id: DataTypes.UUID,
  bail_id: DataTypes.UUID,
  periode: DataTypes.STRING(7),                      // AAAA-MM, pour un loyer
  montant: { type: DataTypes.INTEGER, allowNull: false, validate: { min: 1 } },
  moyen: { type: DataTypes.ENUM('especes', 'mobile_money', 'virement', 'autre'), allowNull: false },
  reference: DataTypes.STRING(80),
  date_paiement: { type: DataTypes.DATEONLY, allowNull: false },
  numero_recu: { type: DataTypes.STRING(30), allowNull: false },
  encaisse_par: DataTypes.UUID,
  cle_client: DataTypes.STRING(64),                 // identifiant créé par le téléphone : un renvoi n'enregistre pas deux fois
}, { tableName: 'paiements', indexes: [{ unique: true, fields: ['bailleur_id', 'cle_client'] }] });

const ChargeFixe = sequelize.define('ChargeFixe', {
  id, ...lieAuBailleur,
  nom: { type: DataTypes.STRING(120), allowNull: false },
  montant: montant(),
  periodicite: { type: DataTypes.ENUM('mensuelle', 'trimestrielle', 'annuelle'), defaultValue: 'mensuelle' },
  portee: { type: DataTypes.ENUM('tous', 'site', 'bien'), defaultValue: 'tous' },
  site_id: DataTypes.UUID,
  bien_id: DataTypes.UUID,
  actif: { type: DataTypes.BOOLEAN, defaultValue: true },
}, { tableName: 'charges_fixes' });

const Depense = sequelize.define('Depense', {
  id, ...lieAuBailleur,
  site_id: { type: DataTypes.UUID, allowNull: false },
  bien_id: DataTypes.UUID,
  categorie: { type: DataTypes.STRING(80), allowNull: false },
  montant: { type: DataTypes.INTEGER, allowNull: false, validate: { min: 1 } },
  date_depense: { type: DataTypes.DATEONLY, allowNull: false },
  note: DataTypes.TEXT,
  justificatif_id: DataTypes.UUID,
  statut: { type: DataTypes.ENUM('en_attente', 'acceptee', 'refusee'), defaultValue: 'en_attente' },
  motif_refus: DataTypes.STRING(255),
  saisie_par: DataTypes.UUID,
  traitee_par: DataTypes.UUID,
  cle_client: DataTypes.STRING(64),
}, { tableName: 'depenses', indexes: [{ unique: true, fields: ['bailleur_id', 'cle_client'] }] });

// Fichiers (logos, photos de justificatifs) stockés dans la base.
const Fichier = sequelize.define('Fichier', {
  id, ...lieAuBailleur,
  type: { type: DataTypes.STRING(60), allowNull: false },
  nom: DataTypes.STRING(120),
  taille: { type: DataTypes.INTEGER, allowNull: false },
  donnees: { type: DataTypes.BLOB, allowNull: false },
}, { tableName: 'fichiers', updatedAt: false });

// Journal des actions sensibles : qui, quand, quoi.
const Journal = sequelize.define('Journal', {
  id, ...lieAuBailleur,
  utilisateur_id: DataTypes.UUID,
  action: { type: DataTypes.STRING(60), allowNull: false },
  entite: DataTypes.STRING(40),
  entite_id: DataTypes.UUID,
  details: DataTypes.JSONB,
}, { tableName: 'journal', updatedAt: false });

// ---------- Associations ----------
Utilisateur.hasMany(Membre, { foreignKey: 'utilisateur_id' });
Membre.belongsTo(Utilisateur, { foreignKey: 'utilisateur_id' });
Bailleur.hasMany(Membre, { foreignKey: 'bailleur_id' });
Membre.belongsTo(Bailleur, { foreignKey: 'bailleur_id' });
Bailleur.hasMany(Site, { foreignKey: 'bailleur_id' });
Site.hasMany(Bien, { foreignKey: 'site_id' });
Bien.belongsTo(Site, { foreignKey: 'site_id' });
Reservation.belongsTo(Bien, { foreignKey: 'bien_id' });
Reservation.belongsTo(Client, { foreignKey: 'client_id' });
Reservation.hasMany(Paiement, { foreignKey: 'reservation_id' });
Bail.belongsTo(Bien, { foreignKey: 'bien_id' });
Bail.belongsTo(Client, { foreignKey: 'client_id' });
Bail.hasMany(Paiement, { foreignKey: 'bail_id' });
Paiement.belongsTo(Reservation, { foreignKey: 'reservation_id' });
Paiement.belongsTo(Bail, { foreignKey: 'bail_id' });
Depense.belongsTo(Bien, { foreignKey: 'bien_id' });
Depense.belongsTo(Site, { foreignKey: 'site_id' });
Depense.belongsTo(Utilisateur, { foreignKey: 'saisie_par', as: 'auteur' });
Journal.belongsTo(Utilisateur, { foreignKey: 'utilisateur_id' });

module.exports = { sequelize, Utilisateur, Bailleur, Verification, Membre, Site, Bien, Client, Reservation, Bail, Paiement, ChargeFixe, Depense, Journal, Fichier };
