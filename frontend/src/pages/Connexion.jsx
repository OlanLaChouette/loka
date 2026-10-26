import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSession } from '../lib/session';
import { api, messageErreur } from '../lib/api';
import { Champ, Erreur } from '../composants/Ui';

// Page d'accueil commune à la connexion, à l'inscription et au mot de passe oublié.
export function EcranAccueil({ onSubmit, children }) {
  return (
    <div className="ecran-connexion">
      <div className="cote">
        <div className="marque" style={{ color: '#fff' }}><img src="/logo-blanc.svg" width="32" height="32" alt="" />Loka</div>
        <div>
          <h1 style={{ fontSize: 36, lineHeight: 1.1, fontWeight: 700 }}>Vos biens, vos loyers, vos chiffres.</h1>
          <p style={{ fontSize: 17, opacity: .85, maxWidth: 440, marginTop: 14 }}>Réservations, encaissements, charges et dépenses de tous vos sites, au même endroit.</p>
        </div>
        <div style={{ opacity: .75, fontSize: 14 }}>par eYamTech</div>
      </div>
      <form onSubmit={(e) => { e.preventDefault(); onSubmit(); }} noValidate>
        <div className="marque marque-connexion"><img src="/logo.svg" width="30" height="30" alt="" />Loka</div>
        {children}
      </form>
    </div>
  );
}

// Après connexion : le gérant va sur le terrain, les autres sur l'aperçu.
export const accueilDe = (data) => {
  const premier = data.espaces[0];
  return !premier ? (data.utilisateur.est_admin_plateforme ? '/plateforme' : '/') : premier.role === 'gerant' ? '/terrain' : '/';
};

// Saisie du code reçu par e-mail, avec renvoi.
export function SaisieCode({ demande, code, setCode, onModifier }) {
  const [renvoi, setRenvoi] = useState('');
  async function renvoyer() {
    setRenvoi('envoi');
    try { await api.post('/comptes/verification/renvoyer', { id: demande.id }); setRenvoi('Nouveau code envoyé.'); } catch (e) { setRenvoi(messageErreur(e)); }
  }
  return (
    <>
      <p className="muet" style={{ margin: 0 }}>Nous avons envoyé un code à 6 chiffres à <b style={{ color: 'var(--texte)' }}>{demande.email}</b>. Pensez à regarder dans les courriers indésirables.</p>
      <Champ label="Code reçu par e-mail">
        <input value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="123456"
          style={{ fontSize: 24, letterSpacing: '.4em', textAlign: 'center', fontWeight: 700 }} autoFocus />
      </Champ>
      <div className="petit" style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <button type="button" className="lien" onClick={renvoyer} disabled={renvoi === 'envoi'}>Renvoyer le code</button>
        <button type="button" className="lien" onClick={onModifier}>Modifier l’adresse</button>
      </div>
      {renvoi && renvoi !== 'envoi' && <div className="petit muet" role="status">{renvoi}</div>}
    </>
  );
}

export default function Connexion() {
  const { connecter } = useSession();
  const nav = useNavigate();
  const [identifiant, setIdentifiant] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [erreur, setErreur] = useState('');
  const [envoi, setEnvoi] = useState(false);

  async function soumettre() {
    setErreur(''); setEnvoi(true);
    try {
      const data = await connecter(identifiant, motDePasse);
      nav(accueilDe(data), { replace: true });
    } catch (e) { setErreur(messageErreur(e)); } finally { setEnvoi(false); }
  }

  return (
    <EcranAccueil onSubmit={soumettre}>
      <div>
        <h1 style={{ fontSize: 24 }}>Connexion</h1>
        <p className="muet" style={{ marginTop: 6 }}>Avec votre numéro de téléphone ou votre e-mail.</p>
      </div>
      <Erreur message={erreur} />
      <Champ label="Téléphone ou e-mail">
        <input value={identifiant} onChange={e => setIdentifiant(e.target.value)} autoComplete="username" inputMode="email" required />
      </Champ>
      <Champ label="Mot de passe">
        <input type="password" value={motDePasse} onChange={e => setMotDePasse(e.target.value)} autoComplete="current-password" required />
      </Champ>
      <div className="petit" style={{ textAlign: 'right', marginTop: -6 }}><Link className="lien" to="/mot-de-passe-oublie">Mot de passe oublié ?</Link></div>
      <button className="bouton principal" type="submit" disabled={envoi || !identifiant || !motDePasse} style={{ minHeight: 48 }}>{envoi ? 'Connexion…' : 'Se connecter'}</button>
      <div className="appel-inscription">
        <span>Vous louez des biens et n’avez pas encore de compte ?</span>
        <Link className="bouton" to="/inscription">Créer mon espace · 14 jours gratuits</Link>
      </div>
    </EcranAccueil>
  );
}
