// Documents PDF au nom du bailleur : reçu de paiement (A5) et contrat de bail (A4).
const path = require('path');
const fs = require('fs');
const PDFDocument = require('pdfkit');
const { enLettres } = require('./lettres');

const DOSSIER = process.env.UPLOADS_DIR || path.join(__dirname, '..', '..', 'uploads');
const ENCRE = '#16161D', GRIS = '#62627A', TRAIT = '#E4E4EC', ACCENT = '#6D5DF5';
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const MOYENS = { especes: 'Espèces', mobile_money: 'Mobile Money', virement: 'Virement', autre: 'Autre' };

const montant = (n) => String(Math.round(n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const dateLongue = (s) => { const d = new Date(s + 'T00:00:00Z'); return `${d.getUTCDate() === 1 ? "1er" : d.getUTCDate()} ${MOIS[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
const moisLong = (p) => `${MOIS[+p.slice(5, 7) - 1]} ${p.slice(0, 4)}`;

function logo(bailleur) {
  if (!bailleur.logo_chemin) return null;
  const f = path.join(DOSSIER, bailleur.logo_chemin);
  // pdfkit lit le PNG et le JPEG seulement.
  return fs.existsSync(f) && /\.(png|jpe?g)$/i.test(f) ? f : null;
}

function entete(doc, bailleur, titre, sousTitre) {
  const m = doc.page.margins.left, largeur = doc.page.width - m * 2, haut = doc.y;
  const image = logo(bailleur);
  if (image) { try { doc.image(image, m, haut, { fit: [70, 50] }); } catch { /* image illisible : on l'ignore */ } }
  const x = image ? m + 82 : m;
  doc.fillColor(ENCRE).font('Helvetica-Bold').fontSize(13).text(bailleur.nom, x, haut, { width: largeur - (x - m) });
  const lignes = [
    [bailleur.forme_juridique, bailleur.rccm && 'RCCM ' + bailleur.rccm, bailleur.ifu && 'IFU ' + bailleur.ifu].filter(Boolean).join(' · '),
    [bailleur.adresse, bailleur.ville].filter(Boolean).join(', '),
    [bailleur.telephone, bailleur.email].filter(Boolean).join(' · '),
  ].filter(Boolean);
  doc.font('Helvetica').fontSize(8.5).fillColor(GRIS);
  for (const l of lignes) doc.text(l, x, doc.y, { width: largeur - (x - m) });
  const bas = Math.max(doc.y, haut + 52) + 14;
  doc.moveTo(m, bas).lineTo(m + largeur, bas).lineWidth(2).strokeColor(ACCENT).stroke();
  doc.y = bas + 16;
  doc.fillColor(ENCRE).font('Helvetica-Bold').fontSize(17).text(titre, m, doc.y, { width: largeur });
  if (sousTitre) doc.font('Helvetica').fontSize(9.5).fillColor(GRIS).text(sousTitre, { width: largeur });
  doc.moveDown(0.9);
}

function ligne(doc, libelle, valeur, gras = false) {
  const m = doc.page.margins.left, largeur = doc.page.width - m * 2, y = doc.y;
  doc.font('Helvetica').fontSize(10).fillColor(GRIS).text(libelle, m, y, { width: largeur * 0.55 });
  const hauteurGauche = doc.y;
  doc.font(gras ? 'Helvetica-Bold' : 'Helvetica').fillColor(ENCRE).text(valeur, m + largeur * 0.55, y, { width: largeur * 0.45, align: 'right' });
  doc.y = Math.max(doc.y, hauteurGauche) + 5;
}

function pied(doc, texte) {
  const m = doc.page.margins.left, largeur = doc.page.width - m * 2;
  doc.font('Helvetica').fontSize(7.5).fillColor(GRIS).text(texte, m, doc.page.height - doc.page.margins.bottom - 12, { width: largeur, align: 'center', lineBreak: false });
}

// ---------- Reçu ----------
function recu(sortie, { paiement, bailleur, reservation, bail, bien, client, encaissePar, dejaPaye }) {
  const doc = new PDFDocument({ size: 'A5', margins: { top: 36, bottom: 32, left: 36, right: 36 }, info: { Title: `Reçu ${paiement.numero_recu}`, Author: bailleur.nom } });
  doc.pipe(sortie);
  entete(doc, bailleur, `Reçu n° ${paiement.numero_recu}`, `Le ${dateLongue(paiement.date_paiement)}`);
  const m = doc.page.margins.left, largeur = doc.page.width - m * 2;

  doc.font('Helvetica').fontSize(10.5).fillColor(ENCRE)
    .text('Reçu de ', { continued: true }).font('Helvetica-Bold').text(client?.nom || '—', { continued: !!client?.telephone })
    .font('Helvetica').fillColor(GRIS).text(client?.telephone ? `  (${client.telephone})` : '');
  doc.moveDown(0.4);
  doc.font('Helvetica').fillColor(ENCRE).text('la somme de ', { continued: true })
    .font('Helvetica-Bold').text(`${enLettres(paiement.montant)} francs CFA`);
  doc.moveDown(0.4);
  const objet = reservation
    ? `Séjour du ${dateLongue(reservation.arrivee)} au ${dateLongue(reservation.depart)} (${reservation.nuits} nuit${reservation.nuits > 1 ? 's' : ''}) · ${bien?.reference || ''}`
    : `Loyer de ${moisLong(paiement.periode)} · ${bien?.reference || ''}`;
  doc.font('Helvetica').text('pour : ', { continued: true }).font('Helvetica-Bold').text(objet);
  doc.moveDown(1);

  // Montant encadré
  const y = doc.y;
  doc.roundedRect(m, y, largeur, 46, 8).fillColor('#F3F1FF').fill();
  doc.fillColor(GRIS).font('Helvetica').fontSize(9).text('MONTANT REÇU', m + 14, y + 9);
  doc.fillColor(ENCRE).font('Helvetica-Bold').fontSize(18).text(`${montant(paiement.montant)} FCFA`, m + 14, y + 21);
  doc.fillColor(GRIS).font('Helvetica').fontSize(9).text(MOYENS[paiement.moyen] + (paiement.reference ? `\nRéf. ${paiement.reference}` : ''), m + largeur / 2, y + 14, { width: largeur / 2 - 14, align: 'right' });
  doc.y = y + 60;

  if (reservation) {
    ligne(doc, `Prix normal (${reservation.nuits} × ${montant(reservation.prix_nuit)})`, montant(reservation.prix_normal));
    if (reservation.reduction) ligne(doc, `Réduction${reservation.reduction_motif ? ' · ' + reservation.reduction_motif : ''}`, '- ' + montant(reservation.reduction));
    ligne(doc, 'Total du séjour', montant(reservation.total) + ' FCFA', true);
    const reste = reservation.total - dejaPaye;
    ligne(doc, 'Total payé à ce jour', montant(dejaPaye) + ' FCFA');
    ligne(doc, 'Reste à payer', reste > 0 ? montant(reste) + ' FCFA' : 'Soldé', true);
  } else if (bail) {
    ligne(doc, 'Loyer mensuel', montant(bail.loyer) + ' FCFA');
    const reste = bail.loyer - dejaPaye;
    ligne(doc, `Payé pour ${moisLong(paiement.periode)}`, montant(dejaPaye) + ' FCFA');
    ligne(doc, 'Reste à payer pour ce mois', reste > 0 ? montant(reste) + ' FCFA' : 'Soldé', true);
  }

  doc.moveDown(1.2);
  doc.font('Helvetica').fontSize(9.5).fillColor(GRIS).text(`Encaissé par ${encaissePar || '—'}`, m, doc.y, { width: largeur / 2 });
  doc.text('Signature et cachet', m + largeur / 2, doc.y - 12, { width: largeur / 2, align: 'right' });
  pied(doc, `${bailleur.nom} · reçu généré avec Loka`);
  doc.end();
}

// ---------- Contrat de bail ----------
function contrat(sortie, { bail, bailleur, bien, site, client, representant }) {
  const doc = new PDFDocument({ size: 'A4', margins: { top: 48, bottom: 48, left: 56, right: 56 }, info: { Title: `Contrat de bail · ${bien.reference}`, Author: bailleur.nom } });
  doc.pipe(sortie);
  entete(doc, bailleur, 'Contrat de bail à usage d’habitation', `${site?.nom || ''} · ${bien.reference}`);
  const m = doc.page.margins.left, largeur = doc.page.width - m * 2;
  const article = (titre, texte) => {
    doc.moveDown(0.6).font('Helvetica-Bold').fontSize(11).fillColor(ENCRE).text(titre, m, doc.y, { width: largeur });
    doc.moveDown(0.2).font('Helvetica').fontSize(10).fillColor(ENCRE).text(texte, { width: largeur, align: 'justify', lineGap: 2 });
  };
  article('Entre les soussignés', `${bailleur.nom}${bailleur.forme_juridique ? ', ' + bailleur.forme_juridique : ''}${bailleur.rccm ? ', RCCM ' + bailleur.rccm : ''}, dont le siège est situé ${[bailleur.adresse, bailleur.ville].filter(Boolean).join(', ') || '[ADRESSE]'}, représenté par ${representant || '[REPRÉSENTANT]'}, ci-après « le bailleur »,\n\net ${client.nom}${client.piece_numero ? ', pièce d’identité n° ' + client.piece_numero : ''}${client.telephone ? ', téléphone ' + client.telephone : ''}, ci-après « le locataire ».`);
  article('Article 1 · Objet', `Le bailleur donne en location au locataire le bien ${bien.reference} (${bien.type}${bien.pieces ? ', ' + bien.pieces + ' chambre(s)' : ''}${bien.standing ? ', ' + bien.standing : ''}), situé sur le site ${site?.nom || ''}${site?.adresse ? ', ' + site.adresse : ''}${site?.ville ? ', ' + site.ville : ''}.`);
  article('Article 2 · Durée', `Le bail prend effet le ${dateLongue(bail.debut)}${bail.fin ? ' et prend fin le ' + dateLongue(bail.fin) : ' pour une durée d’un an, renouvelable par tacite reconduction'}. Chaque partie peut y mettre fin avec un préavis d’un mois, notifié par écrit.`);
  article('Article 3 · Loyer', `Le loyer mensuel est fixé à ${enLettres(bail.loyer)} francs CFA (${montant(bail.loyer)} FCFA), payable d’avance au plus tard le ${bail.jour_echeance} de chaque mois. Chaque paiement donne lieu à un reçu.`);
  article('Article 4 · Caution', bail.caution ? `Le locataire verse une caution de ${enLettres(bail.caution)} francs CFA (${montant(bail.caution)} FCFA), restituée en fin de bail après l’état des lieux de sortie, déduction faite des sommes éventuellement dues.` : 'Aucune caution n’est demandée.');
  article('Article 5 · Charges', 'L’électricité est à la charge du locataire (compteur prépayé). Les autres charges sont réparties selon ce qui est convenu entre les parties et précisé en annexe le cas échéant.');
  article('Article 6 · Obligations du locataire', 'Le locataire s’engage à payer le loyer aux échéances convenues, à user paisiblement des lieux, à les entretenir et à les restituer en bon état, à ne pas sous-louer sans accord écrit du bailleur et à permettre les visites nécessaires à l’entretien.');
  article('Article 7 · État des lieux', 'Un état des lieux contradictoire est établi à l’entrée et à la sortie du locataire.');
  doc.moveDown(1.5);
  const y = doc.y;
  doc.font('Helvetica').fontSize(10).fillColor(ENCRE).text(`Fait à ${bailleur.ville || '[VILLE]'}, le ${dateLongue(new Date().toISOString().slice(0, 10))}, en deux exemplaires.`, m, y, { width: largeur });
  doc.moveDown(2);
  const y2 = doc.y;
  doc.font('Helvetica-Bold').text('Le bailleur', m, y2, { width: largeur / 2 });
  doc.text('Le locataire', m + largeur / 2, y2, { width: largeur / 2, align: 'right' });
  doc.font('Helvetica').fontSize(8.5).fillColor(GRIS).text('Lu et approuvé', m + largeur / 2, doc.y, { width: largeur / 2, align: 'right' });
  pied(doc, `Modèle de contrat généré avec Loka · à faire relire par un conseiller juridique avant usage`);
  doc.end();
}

module.exports = { recu, contrat };
