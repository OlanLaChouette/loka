// E-mails de Loka, envoyés par l'API de Brevo (même compte et même adresse qu'eYamTech).
// Pour les distinguer de ceux d'eYamTech : l'expéditeur s'appelle « Loka · eYamTech », l'objet commence par « Loka · »
// et le message porte la charte violette de Loka.
// Sans BREVO_API_KEY (développement, tests), rien ne part : les messages sont gardés dans `envoyes` et affichés.
const { Erreur } = require('../utils/erreurs');

const envoyes = [];
const expediteur = () => ({ name: process.env.COURRIEL_NOM || 'Loka · eYamTech', email: process.env.COURRIEL_EXPEDITEUR || 'contact@eyamtech.com' });
const echapper = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

async function envoyer({ a, nom, sujet, html, texte }) {
  const cle = process.env.BREVO_API_KEY;
  if (!cle) {
    if (process.env.NODE_ENV === 'production') throw new Erreur(503, 'L’envoi d’e-mails n’est pas encore configuré. Contactez eYamTech au +226 62 82 67 02.');
    envoyes.push({ a, sujet, texte });
    if (process.env.NODE_ENV !== 'test') console.log(`\n[e-mail non envoyé] à ${a} : ${sujet}\n${texte}\n`);
    return;
  }
  let r;
  try {
    r = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': cle, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ sender: expediteur(), replyTo: expediteur(), to: [{ email: a, ...(nom && { name: nom }) }], subject: sujet, htmlContent: html, textContent: texte, tags: ['loka'] }),
      signal: AbortSignal.timeout(15000),
    });
  } catch (e) {
    console.error('Brevo injoignable :', e.message);
    throw new Erreur(502, 'L’e-mail n’a pas pu être envoyé. Réessayez dans un instant.');
  }
  if (!r.ok) {
    console.error('Brevo a refusé l’envoi :', r.status, await r.text().catch(() => ''));
    throw new Erreur(502, 'L’e-mail n’a pas pu être envoyé. Réessayez dans un instant.');
  }
}

// Gabarit commun : bandeau violet Loka, texte, éventuellement un code bien visible.
function gabarit({ titre, lignes, code, fin }) {
  const corps = lignes.map(l => `<p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:#16161D">${l}</p>`).join('');
  const bloc = code ? `<div style="margin:22px 0;padding:18px;border-radius:14px;background:#EEEBFF;text-align:center;font:800 34px/1 'Segoe UI',Arial,sans-serif;letter-spacing:10px;color:#4B3BC9">${code}</div>` : '';
  return `<!doctype html><html lang="fr"><body style="margin:0;background:#F3F3F7;font-family:'Segoe UI',Arial,sans-serif">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F3F3F7;padding:28px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background:#fff;border-radius:18px;overflow:hidden">
<tr><td style="background:#6D5DF5;padding:22px 28px;color:#fff;font:700 24px 'Segoe UI',Arial,sans-serif;letter-spacing:-0.5px">
<span style="display:inline-block;width:30px;height:30px;border-radius:8px;background:#fff;color:#6D5DF5;text-align:center;font-size:18px;line-height:30px;margin-right:10px;vertical-align:middle">&#8962;</span><span style="vertical-align:middle">Loka</span></td></tr>
<tr><td style="padding:28px">
<h1 style="margin:0 0 16px;font-size:20px;color:#16161D">${titre}</h1>${corps}${bloc}
${fin ? `<p style="margin:0;font-size:13px;line-height:1.5;color:#62627A">${fin}</p>` : ''}
</td></tr>
<tr><td style="padding:16px 28px;border-top:1px solid #E4E4EC;font-size:12px;color:#77778C"><a href="https://loka.eyamtech.com" style="color:#4F3FD6;font-weight:600;text-decoration:none">loka.eyamtech.com</a> · une application éditée par eYamTech<br>+226 62 82 67 02 · contact@eyamtech.com</td></tr>
</table></td></tr></table></body></html>`;
}

const courrielCode = ({ a, nom, code, objet }) => {
  const inscription = objet === 'inscription';
  const titre = inscription ? 'Confirmez votre adresse e-mail' : 'Réinitialisez votre mot de passe';
  const phrase = inscription
    ? 'Pour créer votre espace Loka, saisissez ce code dans l’application :'
    : 'Vous avez demandé un nouveau mot de passe Loka. Saisissez ce code dans l’application :';
  return {
    a, nom,
    sujet: `Loka · Votre code : ${code}`,
    html: gabarit({ titre, lignes: [`Bonjour ${echapper(nom || '')},`.replace(' ,', ','), phrase], code, fin: 'Ce code est valable 30 minutes. Si vous n’êtes pas à l’origine de cette demande, ignorez simplement cet e-mail.' }),
    texte: `${titre}\n\n${phrase}\n\n${code}\n\nCe code est valable 30 minutes. Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail.\n\nLoka · une application éditée par eYamTech`,
  };
};

// Prévient l'administration Loka qu'un bailleur vient d'ouvrir son espace.
const courrielNouvelEspace = ({ bailleur, proprietaire, essaiFin }) => {
  const lignes = [
    `<b>${echapper(bailleur.nom)}</b> vient de créer son espace Loka.`,
    `Propriétaire : ${echapper(proprietaire.nom)} · ${echapper(proprietaire.telephone)} · ${echapper(proprietaire.email)}${bailleur.ville ? ' · ' + echapper(bailleur.ville) : ''}`,
    `Essai gratuit jusqu’au ${essaiFin}. L’activation se fait depuis la page Administration de Loka.`,
  ];
  return {
    a: process.env.ADMIN_COURRIEL || expediteur().email,
    sujet: `Loka · Nouvel espace : ${bailleur.nom}`,
    html: gabarit({ titre: 'Nouvelle inscription', lignes }),
    texte: lignes.join('\n').replace(/<[^>]+>/g, ''),
  };
};

// Prévient le bailleur qu'un client demande une villa depuis la place de marché.
const courrielDemande = ({ a, bailleur, demande, bien }) => {
  const lignes = [
    `<b>${echapper(demande.nom)}</b> (${echapper(demande.telephone)}) demande la villa <b>${echapper(bien.reference)}</b> · ${echapper(bien.Site?.nom || '')}.`,
    `Du ${demande.arrivee} au ${demande.depart} · ${demande.nuits} nuit(s) · ${demande.total} FCFA.`,
    demande.message ? `Message : « ${echapper(demande.message)} »` : '',
    'Acceptez-la ou refusez-la dans Loka, page Réservations.',
  ].filter(Boolean);
  return { a, nom: bailleur, sujet: `Loka · Nouvelle demande : ${bien.reference}, ${demande.nuits} nuit(s)`, html: gabarit({ titre: 'Nouvelle demande de réservation', lignes }), texte: lignes.join('\n').replace(/<[^>]+>/g, '') };
};

module.exports = { envoyer, envoyes, courrielCode, courrielNouvelEspace, courrielDemande };
