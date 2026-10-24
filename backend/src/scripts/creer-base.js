// Prépare la base Loka sur le serveur PostgreSQL configuré dans .env :
//  1. crée la base DB_NAME si elle n'existe pas ;
//  2. crée le compte limité DB_APP_USER utilisé par l'application ;
//  3. crée ou met à jour les tables ;
//  4. active la séparation des bailleurs dans la base elle-même (Row Level Security).
// Usage : npm run db:creer            (ajouter -- --demo pour charger les données de démonstration)
process.env.DB_MODE = 'proprietaire';
require('dotenv').config();
const { Client } = require('pg');

const TABLES_BAILLEUR = ['membres', 'sites', 'biens', 'clients', 'reservations', 'baux', 'paiements', 'charges_fixes', 'depenses', 'journal'];
const ident = (s) => '"' + String(s).replace(/"/g, '""') + '"';
const litteral = (s) => "'" + String(s).replace(/'/g, "''") + "'";

async function creerBaseSiAbsente() {
  if (process.env.DATABASE_URL) return; // base hébergée : déjà créée chez le fournisseur
  const c = new Client({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT), user: process.env.DB_USER, password: process.env.DB_PASSWORD || '', database: 'postgres' });
  await c.connect();
  const r = await c.query('SELECT 1 FROM pg_database WHERE datname = $1', [process.env.DB_NAME]);
  if (!r.rowCount) { await c.query('CREATE DATABASE ' + ident(process.env.DB_NAME)); console.log('Base créée :', process.env.DB_NAME); }
  await c.end();
}

async function preparer({ demo = false, silencieux = false } = {}) {
  const log = (...a) => { if (!silencieux) console.log(...a); };
  await creerBaseSiAbsente();
  const { sequelize } = require('../models');
  const q = (sql) => sequelize.query(sql);
  const app = process.env.DB_APP_USER;

  if (app) {
    const existe = await sequelize.query('SELECT 1 FROM pg_roles WHERE rolname = :r', { replacements: { r: app }, type: 'SELECT' });
    if (!existe.length) { await q(`CREATE ROLE ${ident(app)} LOGIN PASSWORD ${litteral(process.env.DB_APP_PASSWORD)} NOSUPERUSER NOBYPASSRLS`); log('Compte applicatif créé :', app); }
    else await q(`ALTER ROLE ${ident(app)} PASSWORD ${litteral(process.env.DB_APP_PASSWORD)} NOSUPERUSER NOBYPASSRLS`);
  }

  if (demo) { const { semer } = require('./seed'); await semer({ silencieux, garderConnexion: true }); }
  else await sequelize.sync({ alter: true });

  // Règle commune : on ne voit que les lignes de l'espace courant, sauf en mode plateforme.
  await q(`CREATE OR REPLACE FUNCTION loka_espace() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.bailleur_id', true), '')::uuid $$`);
  await q(`CREATE OR REPLACE FUNCTION loka_utilisateur() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.utilisateur_id', true), '')::uuid $$`);
  await q(`CREATE OR REPLACE FUNCTION loka_plateforme() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT coalesce(current_setting('app.plateforme', true), '') = 'on' $$`);

  for (const t of TABLES_BAILLEUR) {
    await q(`ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY`);
    await q(`ALTER TABLE ${t} FORCE ROW LEVEL SECURITY`);
    await q(`DROP POLICY IF EXISTS loka_separation ON ${t}`);
    // Une personne voit aussi ses propres appartenances, pour choisir parmi ses espaces.
    const lecture = t === 'membres' ? ' OR utilisateur_id = loka_utilisateur()' : '';
    await q(`CREATE POLICY loka_separation ON ${t} USING (loka_plateforme() OR bailleur_id = loka_espace()${lecture}) WITH CHECK (loka_plateforme() OR bailleur_id = loka_espace())`);
  }
  await q('ALTER TABLE bailleurs ENABLE ROW LEVEL SECURITY');
  await q('ALTER TABLE bailleurs FORCE ROW LEVEL SECURITY');
  await q('DROP POLICY IF EXISTS loka_separation ON bailleurs');
  await q(`CREATE POLICY loka_separation ON bailleurs USING (loka_plateforme() OR id = loka_espace() OR id IN (SELECT bailleur_id FROM membres WHERE utilisateur_id = loka_utilisateur())) WITH CHECK (loka_plateforme() OR id = loka_espace())`);

  if (app) {
    await q(`GRANT USAGE ON SCHEMA public TO ${ident(app)}`);
    await q(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${ident(app)}`);
    await q(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${ident(app)}`);
  }
  log('Base prête, séparation des bailleurs active dans PostgreSQL.');
  return sequelize;
}

if (require.main === module) {
  preparer({ demo: process.argv.includes('--demo') })
    .then((s) => s.close())
    .catch((e) => { console.error('Échec :', e.message); process.exit(1); });
}
module.exports = { preparer, TABLES_BAILLEUR };
