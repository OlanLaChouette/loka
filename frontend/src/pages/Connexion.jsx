import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../lib/session';
import { messageErreur } from '../lib/api';
import { Champ, Erreur } from '../composants/Ui';

export default function Connexion() {
  const { connecter } = useSession();
  const nav = useNavigate();
  const [identifiant, setIdentifiant] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [erreur, setErreur] = useState('');
  const [envoi, setEnvoi] = useState(false);

  async function soumettre(e) {
    e.preventDefault();
    setErreur(''); setEnvoi(true);
    try {
      const data = await connecter(identifiant, motDePasse);
      const premier = data.espaces[0];
      nav(!premier ? (data.utilisateur.est_admin_plateforme ? '/plateforme' : '/') : premier.role === 'gerant' ? '/terrain' : '/', { replace: true });
    } catch (e) { setErreur(messageErreur(e)); } finally { setEnvoi(false); }
  }

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
      <form onSubmit={soumettre} noValidate>
        <div className="marque marque-connexion"><img src="/logo.svg" width="30" height="30" alt="" />Loka</div>
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
        <button className="bouton principal" type="submit" disabled={envoi || !identifiant || !motDePasse} style={{ minHeight: 48 }}>{envoi ? 'Connexion…' : 'Se connecter'}</button>
      </form>
    </div>
  );
}
