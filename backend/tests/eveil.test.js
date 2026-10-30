const test = require('node:test');
const assert = require('node:assert/strict');
const { enJournee, demarrerEveil } = require('../src/services/eveil');

test('l’API reste éveillée de 6 h à 23 h, heure de Ouagadougou', () => {
  const a = (heure) => new Date(`2026-11-02T${heure}:00Z`);
  assert.equal(enJournee(a('05:59')), false);
  assert.equal(enJournee(a('06:00')), true);
  assert.equal(enJournee(a('22:59')), true);
  assert.equal(enJournee(a('23:00')), false);
});

test('sans adresse publique (en local), rien ne tourne', () => {
  assert.equal(demarrerEveil(''), null);
});
