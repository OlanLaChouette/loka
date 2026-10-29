const test = require('node:test');
const assert = require('node:assert/strict');
const c = require('../src/services/calculs');

test('nombre de nuits', () => {
  assert.equal(c.nuitsEntre('2026-10-24', '2026-10-26'), 2);
  assert.throws(() => c.nuitsEntre('2026-10-24', '2026-10-24'));
});

test('prix d’un séjour avec réduction en pourcentage', () => {
  assert.deepEqual(c.prixSejour({ prixNuit: 30000, nuits: 2, reduction: { pourcent: 10 } }), { prixNormal: 60000, reduction: 6000, total: 54000, pourcent: 10 });
});

test('prix d’un séjour avec réduction en montant', () => {
  const p = c.prixSejour({ prixNuit: 25000, nuits: 7, reduction: { montant: 35000 } });
  assert.equal(p.total, 140000);
  assert.equal(p.pourcent, 20);
  assert.throws(() => c.prixSejour({ prixNuit: 1000, nuits: 1, reduction: { montant: 5000 } }));
});

test('un gérant au-delà de sa limite doit faire valider', () => {
  assert.equal(c.besoinValidation({ role: 'gerant', pourcent: 20, limite: 10 }), true);
  assert.equal(c.besoinValidation({ role: 'gerant', pourcent: 10, limite: 10 }), false);
  assert.equal(c.besoinValidation({ role: 'proprietaire', pourcent: 50, limite: 10 }), false);
});

test('nuits comptées dans un mois', () => {
  assert.equal(c.nuitsDansMois('2026-09-29', '2026-10-03', '2026-10'), 2);
  assert.equal(c.nuitsDansMois('2026-10-30', '2026-11-02', '2026-10'), 2);
  assert.equal(c.nuitsDansMois('2026-11-01', '2026-11-02', '2026-10'), 0);
});

test('charges ramenées au mois et abonnement Loka', () => {
  assert.equal(c.chargeMensuelle({ montant: 240000, periodicite: 'annuelle' }), 20000);
  assert.equal(c.abonnementMensuel({ nuit: 8 }), 25000);
  assert.equal(c.abonnementMensuel({ nuit: 20 }), 50000);
  assert.equal(c.abonnementMensuel({ nuit: 10, mois: 12 }), 37000);
});

test('montants en lettres', () => {
  const { enLettres } = require('../src/services/lettres');
  assert.equal(enLettres(54000), 'cinquante-quatre mille');
  assert.equal(enLettres(1), 'un');
  assert.equal(enLettres(71), 'soixante-et-onze');
  assert.equal(enLettres(80), 'quatre-vingts');
  assert.equal(enLettres(81), 'quatre-vingt-un');
  assert.equal(enLettres(200), 'deux cents');
  assert.equal(enLettres(250000), 'deux cent cinquante mille');
  assert.equal(enLettres(1000), 'mille');
  assert.equal(enLettres(6128000), 'six millions cent vingt-huit mille');
});

test('premier loyer dû à la première échéance après le début du bail', () => {
  const { loyerDu } = require('../src/services/calculs');
  assert.equal(loyerDu({ debut: '2026-10-28', jour_echeance: 5 }, '2026-10'), false);
  assert.equal(loyerDu({ debut: '2026-10-28', jour_echeance: 5 }, '2026-11'), true);
  assert.equal(loyerDu({ debut: '2026-10-03', jour_echeance: 5 }, '2026-10'), true);
  assert.equal(loyerDu({ debut: '2026-01-01', jour_echeance: 5 }, '2026-10'), true);
});

test('annulation par le client : gratuite, tardive, non-présentation ; par le bailleur', () => {
  const regles = { heure_arrivee: '15:00', delai_annulation_heures: 24, penalite_nuits: 1 };
  const base = { par: 'client', arrivee: '2026-11-10', prixNuit: 30000, total: 90000, regles };
  assert.deepEqual(c.annulation({ ...base, maintenant: new Date('2026-11-09T14:00:00Z') }), { type: 'gratuite', penalite: 0 });
  assert.deepEqual(c.annulation({ ...base, maintenant: new Date('2026-11-09T16:00:00Z') }), { type: 'tardive', penalite: 30000 });
  assert.deepEqual(c.annulation({ ...base, maintenant: new Date('2026-11-10T14:59:00Z') }), { type: 'tardive', penalite: 30000 });
  assert.deepEqual(c.annulation({ ...base, maintenant: new Date('2026-11-10T15:00:00Z') }), { type: 'absence', penalite: 30000 });
  assert.deepEqual(c.annulation({ ...base, par: 'bailleur', maintenant: new Date('2026-11-10T16:00:00Z') }), { type: 'bailleur', penalite: 0 });
  // La pénalité ne dépasse jamais le prix du séjour.
  assert.equal(c.annulation({ ...base, total: 20000, maintenant: new Date('2026-11-10T10:00:00Z') }).penalite, 20000);
});

test('départ tardif, acompte, pénalité bailleur et note de classement', () => {
  const regles = { heure_depart: '12:00', tolerance_depart_minutes: 30 };
  assert.equal(c.departTardif({ depart: '2026-11-12', regles, maintenant: new Date('2026-11-12T12:29:00Z') }), false);
  assert.equal(c.departTardif({ depart: '2026-11-12', regles, maintenant: new Date('2026-11-12T12:31:00Z') }), true);
  assert.equal(c.acompteMinimum(90000, 50), 45000);
  assert.equal(c.acompteMinimum(25001, 50), 12501);
  assert.equal(c.penaliteBailleur(30000), 5000);
  assert.equal(c.penaliteBailleur(200000), 20000);
  const nouveau = c.noteClassement({});
  const excellent = c.noteClassement({ somme: 50, nombre: 10 });
  const annule = c.noteClassement({ somme: 50, nombre: 10, fiabilite: 0.8 });
  assert.equal(nouveau, 0.8);
  assert.ok(excellent > nouveau && annule < nouveau, 'les bons avis font monter, les annulations font descendre');
});
