// Données de démonstration (développement uniquement). Efface et recrée toute la base.
// Comptes créés (mot de passe commun : MOT_DE_PASSE ci-dessous) :
//   Administration Loka ........ 70000000
//   Résidences Kaboré : propriétaire 70111111, gérant Ali 70222222 (site Ouaga 2000), gérante Mariam 70333333, comptable 70444444
//   SCI Wendpanga ............... propriétaire 70555555 (sert à vérifier qu'un bailleur ne voit pas l'autre)
process.env.DB_MODE = 'proprietaire';
require('dotenv').config();
const bcrypt = require('bcryptjs');
const m = require('../models');
const { versTexte, numeroRecu } = require('../services/calculs');

const { MOT_DE_PASSE } = require('./comptes-demo');
const jour = (decalage) => versTexte(new Date(Date.now() + decalage * 86400000));

async function semer({ silencieux = false } = {}) {
  if (process.env.NODE_ENV === 'production') throw new Error('Refusé en production');
  await m.sequelize.sync({ force: true });
  const hash = await bcrypt.hash(MOT_DE_PASSE, 10);
  const compte = (nom, telephone, extra = {}) => m.Utilisateur.create({ nom, telephone, mot_de_passe_hash: hash, ...extra });

  await compte('Administration Loka', '70000000', { est_admin_plateforme: true, email: 'admin@loka.test' });
  const issa = await compte('Issa Kaboré', '70111111', { email: 'issa@kabore.test' });
  const ali = await compte('Ali Sawadogo', '70222222');
  const mariam = await compte('Mariam Ouattara', '70333333');
  const awa = await compte('Awa Compaoré', '70444444');
  const paul = await compte('Paul Zongo', '70555555');

  const kabore = await m.Bailleur.create({ nom: 'Résidences Kaboré', forme_juridique: 'SARL', rccm: 'BF-OUA-2019-B-1234', ifu: '00012345A', adresse: 'Ouaga 2000, avenue Pascal Zagré', ville: 'Ouagadougou', telephone: '+226 70 11 11 11', email: 'contact@kabore.test', statut: 'actif', limite_reduction_defaut: 10 });
  const wend = await m.Bailleur.create({ nom: 'SCI Wendpanga', ville: 'Bobo-Dioulasso', statut: 'essai', essai_fin: jour(20) });

  const ouaga = await m.Site.create({ bailleur_id: kabore.id, nom: 'Ouaga 2000', ville: 'Ouagadougou' });
  const kossodo = await m.Site.create({ bailleur_id: kabore.id, nom: 'Kossodo', ville: 'Ouagadougou' });
  const zogona = await m.Site.create({ bailleur_id: kabore.id, nom: 'Immeuble Zogona', ville: 'Ouagadougou' });
  const siteWend = await m.Site.create({ bailleur_id: wend.id, nom: 'Bobo centre', ville: 'Bobo-Dioulasso' });

  await m.Membre.bulkCreate([
    { bailleur_id: kabore.id, utilisateur_id: issa.id, role: 'proprietaire' },
    { bailleur_id: kabore.id, utilisateur_id: ali.id, role: 'gerant', sites: [ouaga.id], limite_reduction: 10 },
    { bailleur_id: kabore.id, utilisateur_id: mariam.id, role: 'gerant', sites: [kossodo.id, zogona.id] },
    { bailleur_id: kabore.id, utilisateur_id: awa.id, role: 'comptable' },
    { bailleur_id: wend.id, utilisateur_id: paul.id, role: 'proprietaire' },
    // Mariam travaille aussi pour un deuxième bailleur : elle verra deux espaces.
    { bailleur_id: wend.id, utilisateur_id: mariam.id, role: 'gerant' },
  ]);

  const villa = (site, reference, prix, extra = {}) => m.Bien.create({ bailleur_id: kabore.id, site_id: site.id, reference, type: 'villa', mode: 'nuit', prix_nuit: prix, standing: 'Standing', pieces: 2, ...extra });
  const b = {};
  for (const [ref, prix, extra] of [['A1', 25000], ['A2', 25000], ['A3', 25000, { etat: 'travaux' }], ['B1', 25000], ['B2', 30000, { standing: 'Haut standing', pieces: 3 }], ['C1', 45000, { standing: 'Piscine', pieces: 4 }], ['C2', 25000], ['C3', 35000, { standing: 'Jardin', pieces: 3 }]]) b[ref] = await villa(ouaga, ref, prix, extra);
  for (const ref of ['K1', 'K2', 'K3']) b[ref] = await villa(kossodo, ref, 20000);
  const apparts = [];
  for (let i = 1; i <= 4; i++) apparts.push(await m.Bien.create({ bailleur_id: kabore.id, site_id: zogona.id, reference: 'Z' + i, type: 'appartement', mode: 'mois', prix_mois: i === 4 ? 150000 : 120000, pieces: 3 }));
  await m.Bien.create({ bailleur_id: wend.id, site_id: siteWend.id, reference: 'W1', type: 'villa', mode: 'nuit', prix_nuit: 22000 });

  const clients = await m.Client.bulkCreate(['Issa Kaboré', 'Aminata Traoré', 'Seydou Ouédraogo', 'Fatou Sanou', 'Rasmané Compaoré', 'Famille Yaméogo', 'Koffi Bambara', 'Mission ONG Santé', 'Théo Nikiéma', 'Pauline Ilboudo']
    .map((nom, i) => ({ bailleur_id: kabore.id, nom, telephone: '+226 7' + String(1000000 + i * 137).slice(0, 7) })));

  let recu = 0;
  const paiement = async (cible, montant, moyen, date, extra = {}) => m.Paiement.create({ bailleur_id: kabore.id, site_id: cible.site_id, montant, moyen, date_paiement: date, numero_recu: numeroRecu(++recu), encaisse_par: ali.id, ...extra });
  const sejour = async (bien, ci, debut, nuits, reductionPct = 0, payer = 1) => {
    const prixNormal = bien.prix_nuit * nuits, reduction = Math.round(prixNormal * reductionPct / 100);
    const r = await m.Reservation.create({ bailleur_id: kabore.id, site_id: bien.site_id, bien_id: bien.id, client_id: clients[ci].id, arrivee: jour(debut), depart: jour(debut + nuits), nuits, prix_nuit: bien.prix_nuit, prix_normal: prixNormal, reduction, reduction_motif: reduction ? 'Client fidèle' : null, total: prixNormal - reduction, statut: 'confirmee', cree_par: ali.id });
    if (payer) await paiement(r, Math.round(r.total * payer), recu % 2 ? 'mobile_money' : 'especes', jour(Math.min(debut, 0)), { reservation_id: r.id });
    return r;
  };
  await sejour(b.B2, 0, 0, 2, 10);
  await sejour(b.A1, 1, -3, 4);
  await sejour(b.A1, 2, 3, 4, 0, 0);
  await sejour(b.C1, 5, -1, 6);
  await sejour(b.C2, 6, -8, 10, 0, 0.5);
  await sejour(b.C3, 8, -4, 7);
  await sejour(b.B1, 4, -12, 4);
  await sejour(b.K1, 3, -6, 5, 5);
  await sejour(b.K2, 9, -2, 3);
  // Réduction de 20 % demandée par un gérant : en attente du propriétaire.
  await m.Reservation.create({ bailleur_id: kabore.id, site_id: ouaga.id, bien_id: b.A2.id, client_id: clients[7].id, arrivee: jour(5), depart: jour(12), nuits: 7, prix_nuit: 25000, prix_normal: 175000, reduction: 35000, reduction_motif: 'Mission de 7 nuits', total: 140000, statut: 'attente_validation', cree_par: ali.id });

  const moisCourant = jour(0).slice(0, 7);
  for (const [i, a] of apparts.entries()) {
    const bail = await m.Bail.create({ bailleur_id: kabore.id, site_id: zogona.id, bien_id: a.id, client_id: clients[i + 1].id, debut: '2026-01-01', loyer: a.prix_mois, jour_echeance: 5, caution: a.prix_mois * 2 });
    if (i < 3) await paiement(bail, a.prix_mois, 'virement', jour(-1), { bail_id: bail.id, periode: moisCourant });
  }
  await kabore.update({ dernier_numero_recu: recu });

  await m.ChargeFixe.bulkCreate([
    { bailleur_id: kabore.id, nom: 'Wi-Fi (tous les sites)', montant: 45000, periodicite: 'mensuelle', portee: 'tous' },
    { bailleur_id: kabore.id, nom: 'Gaz des villas', montant: 60000, periodicite: 'mensuelle', portee: 'site', site_id: ouaga.id },
    { bailleur_id: kabore.id, nom: 'Gardiennage', montant: 90000, periodicite: 'mensuelle', portee: 'tous' },
    { bailleur_id: kabore.id, nom: 'Assurance', montant: 240000, periodicite: 'annuelle', portee: 'tous' },
  ]);
  await m.Depense.bulkCreate([
    { bailleur_id: kabore.id, site_id: ouaga.id, bien_id: b.B2.id, categorie: 'Recharge gaz', montant: 7500, date_depense: jour(0), statut: 'en_attente', saisie_par: ali.id },
    { bailleur_id: kabore.id, site_id: ouaga.id, bien_id: b.A1.id, categorie: 'Ménage', montant: 3000, date_depense: jour(-1), statut: 'acceptee', saisie_par: ali.id, traitee_par: issa.id },
    { bailleur_id: kabore.id, site_id: kossodo.id, categorie: 'Plomberie', montant: 15000, date_depense: jour(-3), statut: 'acceptee', saisie_par: mariam.id, traitee_par: issa.id },
  ]);
  await m.Journal.bulkCreate([
    { bailleur_id: kabore.id, utilisateur_id: mariam.id, action: 'paiement_encaisse', entite: 'paiement', details: { montant: 120000 }, cree_le: new Date(Date.now() - 3 * 3600e3) },
    { bailleur_id: kabore.id, utilisateur_id: ali.id, action: 'depense_saisie', entite: 'depense', details: { montant: 7500, categorie: 'Recharge gaz' }, cree_le: new Date(Date.now() - 2 * 3600e3) },
    { bailleur_id: kabore.id, utilisateur_id: ali.id, action: 'reduction_a_valider', entite: 'reservation', details: { reduction: 35000 }, cree_le: new Date(Date.now() - 1.5 * 3600e3) },
    { bailleur_id: kabore.id, utilisateur_id: ali.id, action: 'paiement_encaisse', entite: 'paiement', details: { montant: 54000 }, cree_le: new Date(Date.now() - 3600e3) },
  ]);
  if (!silencieux) console.log('Données de démonstration prêtes. Mot de passe commun :', MOT_DE_PASSE);
}

// Lancé seul : recrée la base complète (tables, règles de séparation, données).
if (require.main === module) require('./creer-base').preparer({ demo: true }).then((s) => s.close()).catch((e) => { console.error(e); process.exit(1); });
module.exports = { semer, MOT_DE_PASSE };
