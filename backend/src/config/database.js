// Deux façons de se connecter :
//  - « application » (par défaut) : compte limité DB_APP_USER, soumis aux règles de séparation des bailleurs (RLS) ;
//  - « propriétaire » (DB_MODE=proprietaire) : compte DB_USER, pour créer les tables et les données de démonstration.
const { Sequelize } = require('sequelize');
const cls = require('cls-hooked');
require('dotenv').config();

const contexte = cls.createNamespace('loka');
Sequelize.useCLS(contexte);

const proprietaire = process.env.DB_MODE === 'proprietaire' || !process.env.DB_APP_USER;
const options = {
  dialect: 'postgres',
  logging: false,
  define: { underscored: true, timestamps: true, createdAt: 'cree_le', updatedAt: 'modifie_le' },
  pool: { max: 10, idle: 10000 },
  hooks: proprietaire ? {
    // Les scripts d'administration voient toutes les lignes.
    afterConnect: (connexion) => connexion.query("SET app.plateforme = 'on'"),
  } : {},
};

function urlAvecUtilisateur(url, utilisateur, motDePasse) {
  const u = new URL(url);
  u.username = utilisateur; u.password = motDePasse;
  return u.toString();
}

let sequelize;
if (process.env.DATABASE_URL) {
  const url = proprietaire ? process.env.DATABASE_URL : urlAvecUtilisateur(process.env.DATABASE_URL, process.env.DB_APP_USER, process.env.DB_APP_PASSWORD);
  sequelize = new Sequelize(url, { ...options, dialectOptions: { ssl: { require: true, rejectUnauthorized: false } } });
} else {
  sequelize = new Sequelize(
    process.env.DB_NAME,
    proprietaire ? process.env.DB_USER : process.env.DB_APP_USER,
    proprietaire ? process.env.DB_PASSWORD : process.env.DB_APP_PASSWORD,
    { ...options, host: process.env.DB_HOST || 'localhost', port: Number(process.env.DB_PORT || 5432) },
  );
}

sequelize.contexte = contexte;
sequelize.modeProprietaire = proprietaire;
module.exports = sequelize;
