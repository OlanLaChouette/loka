import { Capacitor } from '@capacitor/core';
import { api } from './api';
import { fcfa, nomMois } from './format';

const natif = () => Capacitor.isNativePlatform();

// Dans l'application Android : le PDF est écrit dans le cache puis confié au partage du téléphone
// (WhatsApp, impression, enregistrement…), car la vue web intégrée n'ouvre pas les PDF elle-même.
async function partagerNatif(blob, nom, texte) {
  const [{ Filesystem, Directory }, { Share }] = await Promise.all([import('@capacitor/filesystem'), import('@capacitor/share')]);
  const base64 = await new Promise((ok, ko) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1]); r.onerror = ko; r.readAsDataURL(blob); });
  const { uri } = await Filesystem.writeFile({ path: nom, data: base64, directory: Directory.Cache });
  await Share.share({ title: nom, text: texte, files: [uri], dialogTitle: 'Envoyer le document' });
}

// Numéro au format international pour WhatsApp (Burkina par défaut si 8 chiffres).
export function numeroWhatsApp(telephone, indicatif = '226') {
  const chiffres = String(telephone || '').replace(/\D/g, '').replace(/^00/, '');
  if (!chiffres) return '';
  return chiffres.length === 8 ? indicatif + chiffres : chiffres;
}

export function ouvrirWhatsApp(telephone, message) {
  const numero = numeroWhatsApp(telephone);
  const url = `https://wa.me/${numero}?text=${encodeURIComponent(message)}`;
  if (natif()) window.location.href = url; else window.open(url, '_blank', 'noopener');
}

export async function telechargerPdf(chemin) {
  const r = await api.get(chemin.replace(/^\/api/, ''), { responseType: 'blob' });
  return r.data;
}

export async function ouvrirPdf(chemin) {
  const blob = await telechargerPdf(chemin);
  if (natif()) return partagerNatif(blob, chemin.split('/').pop().replace(/[^\w.-]/g, '') || 'document.pdf');
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

// Sur téléphone, le partage natif permet d'envoyer le PDF lui-même dans WhatsApp.
// Ailleurs : on ouvre le PDF et WhatsApp avec un message prêt ; la personne joint le fichier.
export async function partagerRecu({ paiementId, numero, telephone, message }) {
  const blob = await telechargerPdf(`/paiements/${paiementId}/recu.pdf`);
  if (natif()) { await partagerNatif(blob, `recu-${numero}.pdf`, message); return 'partage'; }
  const fichier = new File([blob], `recu-${numero}.pdf`, { type: 'application/pdf' });
  if (navigator.canShare?.({ files: [fichier] })) {
    try { await navigator.share({ files: [fichier], text: message }); return 'partage'; } catch (e) { if (e.name === 'AbortError') return 'annule'; }
  }
  const url = URL.createObjectURL(blob);
  const lien = document.createElement('a');
  lien.href = url; lien.download = fichier.name; lien.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  if (telephone) ouvrirWhatsApp(telephone, message);
  return 'telecharge';
}

export const messages = {
  recu: ({ client, montant, numero, bailleur }) =>
    `Bonjour ${client || ''}, voici votre reçu ${numero} de ${fcfa(montant)}. Merci pour votre confiance. ${bailleur || ''}`.trim(),
  relanceLoyer: ({ client, montant, mois, bailleur }) =>
    `Bonjour ${client || ''}, sauf erreur de notre part, le loyer de ${nomMois(mois)} (${fcfa(montant)}) n’est pas encore réglé. Merci de faire le nécessaire ou de nous contacter. ${bailleur || ''}`.trim(),
  relanceSejour: ({ client, montant, bien, bailleur }) =>
    `Bonjour ${client || ''}, il reste ${fcfa(montant)} à régler pour votre séjour (${bien}). Vous pouvez payer en espèces ou par Mobile Money. Merci ! ${bailleur || ''}`.trim(),
};
