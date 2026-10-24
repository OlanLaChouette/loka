// Montant en toutes lettres (orthographe traditionnelle, avec tirets), pour les reçus.
const UNITES = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf'];
const DIZAINES = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante', 'soixante', 'quatre-vingt', 'quatre-vingt'];

function moinsDeCent(n) {
  if (n < 20) return UNITES[n];
  const d = Math.floor(n / 10), u = n % 10;
  if (d === 7 || d === 9) return DIZAINES[d] + (u === 1 && d === 7 ? '-et-' : '-') + UNITES[10 + u];
  if (u === 0) return d === 8 ? 'quatre-vingts' : DIZAINES[d];
  if (u === 1 && d !== 8) return DIZAINES[d] + '-et-un';
  return DIZAINES[d] + '-' + UNITES[u];
}

function moinsDeMille(n, final) {
  const c = Math.floor(n / 100), r = n % 100;
  let s = '';
  if (c > 1) s = UNITES[c] + ' cent' + (r === 0 && final ? 's' : '');
  else if (c === 1) s = 'cent';
  if (r) s += (s ? ' ' : '') + moinsDeCent(r);
  return s;
}

function enLettres(n) {
  n = Math.round(Math.abs(n));
  if (n === 0) return 'zéro';
  const parties = [];
  const milliards = Math.floor(n / 1e9), millions = Math.floor((n % 1e9) / 1e6), milliers = Math.floor((n % 1e6) / 1000), reste = n % 1000;
  if (milliards) parties.push(moinsDeMille(milliards, true) + ' milliard' + (milliards > 1 ? 's' : ''));
  if (millions) parties.push(moinsDeMille(millions, true) + ' million' + (millions > 1 ? 's' : ''));
  if (milliers) parties.push(milliers === 1 ? 'mille' : moinsDeMille(milliers, false) + ' mille');
  if (reste) parties.push(moinsDeMille(reste, true));
  return parties.join(' ');
}

module.exports = { enLettres };
