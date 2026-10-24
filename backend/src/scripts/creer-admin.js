// Crée (ou réactive) un compte d'administration de la plateforme Loka.
// Usage : npm run admin:creer -- "Nom Prénom" 70000000 "mot de passe"
process.env.DB_MODE = 'proprietaire';
require('dotenv').config();
const bcrypt = require('bcryptjs');

(async () => {
  const [nom, telephone, motDePasse] = process.argv.slice(2);
  if (!nom || !telephone || !motDePasse || motDePasse.length < 10) {
    console.error('Usage : npm run admin:creer -- "Nom Prénom" TELEPHONE "MOT_DE_PASSE (10 caractères minimum)"');
    process.exit(1);
  }
  const { sequelize, Utilisateur } = require('../models');
  const hash = await bcrypt.hash(motDePasse, 10);
  const existant = await Utilisateur.findOne({ where: { telephone } });
  if (existant) await existant.update({ nom, mot_de_passe_hash: hash, est_admin_plateforme: true, actif: true });
  else await Utilisateur.create({ nom, telephone, mot_de_passe_hash: hash, est_admin_plateforme: true });
  console.log(`Compte d'administration prêt pour ${nom} (${telephone}).`);
  await sequelize.close();
})().catch((e) => { console.error('Échec :', e.message); process.exit(1); });
