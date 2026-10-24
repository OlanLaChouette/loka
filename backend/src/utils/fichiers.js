// Fichiers (logos, justificatifs) rangés dans PostgreSQL : pas de disque à payer chez l'hébergeur,
// et la même séparation entre bailleurs que pour le reste des données.
const multer = require('multer');
const { Fichier } = require('../models');

const reception = (types, maxOctets) => multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: maxOctets },
  fileFilter: (req, file, cb) => cb(null, types.includes(file.mimetype)),
});

const IMAGES = ['image/png', 'image/jpeg', 'image/webp'];
const recevoirLogo = reception(IMAGES, 1024 * 1024).single('logo');
const recevoirJustificatif = reception([...IMAGES, 'application/pdf'], 3 * 1024 * 1024).single('justificatif');

async function enregistrer(file, bailleurId) {
  if (!file) return null;
  const f = await Fichier.create({ bailleur_id: bailleurId, type: file.mimetype, nom: file.originalname?.slice(0, 120), taille: file.size, donnees: file.buffer });
  return f.id;
}

function envoyer(res, fichier) {
  res.setHeader('Content-Type', fichier.type);
  res.setHeader('Content-Length', fichier.taille);
  res.setHeader('Cache-Control', 'private, max-age=86400');
  res.end(fichier.donnees);
}

module.exports = { recevoirLogo, recevoirJustificatif, enregistrer, envoyer };
