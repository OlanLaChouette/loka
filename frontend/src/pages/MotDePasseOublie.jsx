// Mot de passe oublié : code envoyé à l'adresse e-mail du compte, puis nouveau mot de passe.
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSession } from '../lib/session';
import { api, messageErreur } from '../lib/api';
import { Champ, Erreur } from '../composants/Ui';
import { EcranAccueil, SaisieCode, accueilDe } from './Connexion';

export default function MotDePasseOublie() {
  const { ouvrir } = useSession();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [demande, setDemande] = useState(null);
  const [code, setCode] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [erreur, setErreur] = useState('');
  const [envoi, setEnvoi] = useState(false);

  async function soumettre() {
    setErreur(''); setEnvoi(true);
    try {
      if (!demande) {
        setDemande((await api.post('/comptes/mot-de-passe/oubli', { email })).data);
      } else {
        const { data } = await api.post('/comptes/mot-de-passe/reinitialiser', { id: demande.id, code, mot_de_passe: motDePasse });
        ouvrir(data);
        nav(accueilDe(data), { replace: true });
      }
    } catch (e) { setErreur(messageErreur(e)); } finally { setEnvoi(false); }
  }

  return (
    <EcranAccueil onSubmit={soumettre}>
      <div>
        <h1 style={{ fontSize: 24 }}>Mot de passe oublié</h1>
        <p className="muet" style={{ marginTop: 6 }}>{demande ? 'Saisissez le code, puis choisissez un nouveau mot de passe.' : 'Indiquez l’adresse e-mail de votre compte Loka.'}</p>
      </div>
      <Erreur message={erreur} />
      {!demande ? (
        <>
          <Champ label="E-mail"><input type="email" value={email} onChange={e => setEmail(e.target.value)} inputMode="email" autoComplete="email" autoFocus /></Champ>
          <button className="bouton principal" type="submit" disabled={envoi || !email} style={{ minHeight: 48 }}>{envoi ? 'Envoi…' : 'Recevoir un code'}</button>
          <div className="info petit">Pas d’e-mail sur votre compte (gérant) ? Demandez un nouveau mot de passe au propriétaire de l’espace.</div>
        </>
      ) : (
        <>
          <SaisieCode demande={demande} code={code} setCode={setCode} onModifier={() => { setDemande(null); setCode(''); setErreur(''); }} />
          <Champ label="Nouveau mot de passe"><input type="password" value={motDePasse} onChange={e => setMotDePasse(e.target.value)} autoComplete="new-password" placeholder="8 caractères minimum" /></Champ>
          <button className="bouton principal" type="submit" disabled={envoi || code.length !== 6 || motDePasse.length < 8} style={{ minHeight: 48 }}>{envoi ? 'Enregistrement…' : 'Changer et me connecter'}</button>
        </>
      )}
      <p className="petit muet" style={{ margin: 0, textAlign: 'center' }}><Link className="lien" to="/connexion">Retour à la connexion</Link></p>
    </EcranAccueil>
  );
}
