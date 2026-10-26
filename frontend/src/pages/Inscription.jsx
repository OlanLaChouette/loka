// Un bailleur crée lui-même son espace : formulaire, puis code reçu par e-mail. L'espace démarre en essai de 14 jours.
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSession } from '../lib/session';
import { api, messageErreur } from '../lib/api';
import { Champ, Erreur } from '../composants/Ui';
import { EcranAccueil, SaisieCode } from './Connexion';

export default function Inscription() {
  const { ouvrir } = useSession();
  const nav = useNavigate();
  const [f, setF] = useState({ nom: '', entreprise: '', ville: '', telephone: '', email: '', mot_de_passe: '' });
  const [demande, setDemande] = useState(null);
  const [code, setCode] = useState('');
  const [erreur, setErreur] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const maj = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const complet = f.nom && f.entreprise && f.telephone && f.email && f.mot_de_passe.length >= 8;

  async function soumettre() {
    setErreur(''); setEnvoi(true);
    try {
      if (!demande) {
        setDemande((await api.post('/comptes/inscription', f)).data);
      } else {
        const { data } = await api.post('/comptes/inscription/verifier', { id: demande.id, code });
        ouvrir(data);
        nav('/', { replace: true });
      }
    } catch (e) { setErreur(messageErreur(e)); } finally { setEnvoi(false); }
  }

  if (demande) return (
    <EcranAccueil onSubmit={soumettre}>
      <div>
        <h1 style={{ fontSize: 24 }}>Vérifiez votre e-mail</h1>
        <p className="muet" style={{ marginTop: 6 }}>Dernière étape avant d’ouvrir votre espace.</p>
      </div>
      <Erreur message={erreur} />
      <SaisieCode demande={demande} code={code} setCode={setCode} onModifier={() => { setDemande(null); setCode(''); setErreur(''); }} />
      <button className="bouton principal" type="submit" disabled={envoi || code.length !== 6} style={{ minHeight: 48 }}>{envoi ? 'Vérification…' : 'Ouvrir mon espace'}</button>
    </EcranAccueil>
  );

  return (
    <EcranAccueil onSubmit={soumettre}>
      <div>
        <h1 style={{ fontSize: 24 }}>Créer mon espace</h1>
        <p className="muet" style={{ marginTop: 6 }}>14 jours d’essai gratuit, sans engagement.</p>
      </div>
      <Erreur message={erreur} />
      <Champ label="Votre nom"><input value={f.nom} onChange={maj('nom')} autoComplete="name" /></Champ>
      <Champ label="Nom de votre entreprise ou résidence"><input value={f.entreprise} onChange={maj('entreprise')} autoComplete="organization" placeholder="Résidence Les Palmiers" /></Champ>
      <Champ label="Ville"><input value={f.ville} onChange={maj('ville')} autoComplete="address-level2" /></Champ>
      <Champ label="Téléphone (pour vous connecter)"><input value={f.telephone} onChange={maj('telephone')} inputMode="tel" autoComplete="tel" placeholder="70 00 00 00" /></Champ>
      <Champ label="E-mail (pour recevoir le code)"><input type="email" value={f.email} onChange={maj('email')} inputMode="email" autoComplete="email" /></Champ>
      <Champ label="Mot de passe"><input type="password" value={f.mot_de_passe} onChange={maj('mot_de_passe')} autoComplete="new-password" placeholder="8 caractères minimum" /></Champ>
      <button className="bouton principal" type="submit" disabled={envoi || !complet} style={{ minHeight: 48 }}>{envoi ? 'Envoi du code…' : 'Recevoir mon code'}</button>
      <p className="petit muet" style={{ margin: 0, textAlign: 'center' }}>Déjà un compte ? <Link className="lien" to="/connexion">Se connecter</Link></p>
    </EcranAccueil>
  );
}
