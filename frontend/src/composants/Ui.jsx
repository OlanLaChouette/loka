import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { urlFichier } from '../lib/api';
import { initiales } from '../lib/format';

export function Modale({ titre, onFermer, children, actions }) {
  const ref = useRef(null);
  // onFermer change à chaque rendu du parent : on le lit par référence, sinon l'effet se relancerait
  // à chaque frappe et remettrait le curseur dans le premier champ.
  const fermer = useRef(onFermer);
  fermer.current = onFermer;
  useEffect(() => {
    const precedent = document.activeElement;
    ref.current?.querySelector('input, select, textarea, button')?.focus();
    const touche = (e) => { if (e.key === 'Escape') fermer.current(); };
    document.addEventListener('keydown', touche);
    return () => { document.removeEventListener('keydown', touche); precedent?.focus?.(); };
  }, []);
  return (
    <div className="voile" onMouseDown={(e) => e.target === e.currentTarget && onFermer()}>
      <div className="modale" role="dialog" aria-modal="true" aria-label={titre} ref={ref}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h2 style={{ flex: 1, fontSize: 20 }}>{titre}</h2>
          <button type="button" className="bouton-rond" onClick={onFermer} aria-label="Fermer"><X size={18} /></button>
        </div>
        {children}
        {actions && <div className="actions">{actions}</div>}
      </div>
    </div>
  );
}

export function Champ({ label, plein, children }) {
  return <label className={'champ' + (plein ? ' plein' : '')}>{label}{children}</label>;
}

export function Avatar({ nom, logo, taille = 32 }) {
  return (
    <span className="avatar" style={{ width: taille, height: taille, borderRadius: logo ? 8 : '50%' }}>
      {logo ? <img src={urlFichier(logo)} alt="" /> : initiales(nom)}
    </span>
  );
}

// Saisie d'un nouveau mot de passe (deux fois), avec envoi au serveur par `envoyer(motDePasse)`.
export function NouveauMotDePasse({ titre, texte, avecActuel, envoyer, onFermer }) {
  const [actuel, setActuel] = useState('');
  const [mdp, setMdp] = useState('');
  const [confirme, setConfirme] = useState('');
  const [etat, setEtat] = useState({ envoi: false, erreur: '', fait: false });
  const valide = mdp.length >= 8 && mdp === confirme && (!avecActuel || actuel);
  async function valider() {
    setEtat({ envoi: true, erreur: '', fait: false });
    try { await envoyer(mdp, actuel); setEtat({ envoi: false, erreur: '', fait: true }); }
    catch (e) { setEtat({ envoi: false, erreur: e?.response?.data?.message || 'Échec de l’enregistrement', fait: false }); }
  }
  if (etat.fait) return <Modale titre={titre} onFermer={onFermer} actions={<button className="bouton principal" onClick={onFermer}>Terminé</button>}><div className="info">Mot de passe enregistré.</div></Modale>;
  return (
    <Modale titre={titre} onFermer={onFermer} actions={<><button className="bouton" onClick={onFermer}>Annuler</button><button className="bouton principal" disabled={!valide || etat.envoi} onClick={valider}>Enregistrer</button></>}>
      {texte && <p className="petit muet" style={{ margin: 0 }}>{texte}</p>}
      <Erreur message={etat.erreur} />
      <div className="grille-form">
        {avecActuel && <Champ label="Mot de passe actuel" plein><input type="password" value={actuel} onChange={e => setActuel(e.target.value)} autoComplete="current-password" /></Champ>}
        <Champ label="Nouveau mot de passe"><input type="password" value={mdp} onChange={e => setMdp(e.target.value)} autoComplete="new-password" /></Champ>
        <Champ label="Confirmer"><input type="password" value={confirme} onChange={e => setConfirme(e.target.value)} autoComplete="new-password" /></Champ>
      </div>
      <p className="petit muet" style={{ margin: 0 }}>{mdp && mdp.length < 8 ? '8 caractères minimum.' : confirme && mdp !== confirme ? 'Les deux saisies sont différentes.' : '8 caractères minimum.'}</p>
    </Modale>
  );
}

export const Erreur = ({ message }) => (message ? <div className="erreur" role="alert">{message}</div> : null);
export const Chargement = () => <div className="chargement">Chargement…</div>;
export const Vide = ({ children }) => <div className="vide">{children}</div>;

const PUCES = {
  disponible: ['Disponible', 'violet'], travaux: ['Travaux', 'alerte'], retire: ['Retiré', ''],
  confirmee: ['Confirmée', 'violet'], attente_validation: ['À valider', 'alerte'], annulee: ['Annulée', ''],
  en_attente: ['En attente', 'alerte'], acceptee: ['Acceptée', 'positif'], refusee: ['Refusée', 'negatif'],
  actif: ['En cours', 'violet'], termine: ['Terminé', ''], essai: ['Essai', 'alerte'], suspendu: ['Suspendu', 'negatif'],
};
export function Puce({ statut, children, ton }) {
  const [texte, couleur] = PUCES[statut] || [children, ton || ''];
  return <span className={'puce ' + couleur}>{children || texte}</span>;
}
