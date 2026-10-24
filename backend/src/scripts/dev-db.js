// Lance une base PostgreSQL embarquée pour le développement (aucune installation nécessaire).
// Usage : npm run db:dev   (laisser tourner dans un terminal)
require('dotenv').config();
const path = require('path');
const fs = require('fs');
const EmbeddedPostgres = require('embedded-postgres').default;

const dossier = path.join(__dirname, '..', '..', '.pgdata');
const pg = new EmbeddedPostgres({
  databaseDir: dossier,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  port: Number(process.env.DB_PORT),
  persistent: true,
});

(async () => {
  if (!fs.existsSync(path.join(dossier, 'PG_VERSION'))) await pg.initialise();
  await pg.start();
  try { await pg.createDatabase(process.env.DB_NAME); } catch { /* existe déjà */ }
  console.log(`PostgreSQL de développement prêt sur le port ${process.env.DB_PORT}`);
  const arreter = async () => { await pg.stop(); process.exit(0); };
  process.on('SIGINT', arreter);
  process.on('SIGTERM', arreter);
})();
