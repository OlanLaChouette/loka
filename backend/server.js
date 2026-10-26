require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { sequelize } = require('./src/models');
const { gestionnaireErreurs } = require('./src/utils/erreurs');
const { contexteRequete } = require('./src/middleware/contexte');

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  console.error('JWT_SECRET manquant ou trop court dans .env');
  process.exit(1);
}

const app = express();
app.set('trust proxy', 1); // derrière l'hébergeur (adresse IP réelle pour la limite de tentatives)
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: (process.env.FRONTEND_URL || '').split(',').concat(['https://localhost', 'capacitor://localhost', 'http://localhost']), credentials: true }));
app.use(express.json({ limit: '1mb' }));
if (process.env.NODE_ENV !== 'test') app.use(morgan('dev'));

app.get('/api/sante', (req, res) => res.json({ ok: true }));
app.use('/api', contexteRequete);
app.use('/api/auth', require('./src/routes/auth').router);
app.use('/api/comptes', require('./src/routes/inscription'));
app.use('/api/plateforme', require('./src/routes/plateforme'));
app.use('/api', require('./src/routes/tableau'));
app.use('/api', require('./src/routes/espace').router);
app.use('/api', require('./src/routes/operations'));
app.use('/api', (req, res) => res.status(404).json({ message: 'Route inconnue' }));
app.use(gestionnaireErreurs);

const PORT = Number(process.env.PORT || 4100);
if (require.main === module) {
  sequelize.authenticate()
    .then(() => app.listen(PORT, () => console.log(`API Loka sur http://localhost:${PORT}`)))
    .catch((e) => { console.error('Base de données inaccessible :', e.message, '\n→ Vérifiez .env puis lancez : npm run db:creer'); process.exit(1); });
}

module.exports = app;
