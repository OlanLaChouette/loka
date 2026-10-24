import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { urlFichier } from '../lib/api';
import { initiales } from '../lib/format';

export function Modale({ titre, onFermer, children, actions }) {
  const ref = useRef(null);
  useEffect(() => {
    const precedent = document.activeElement;
    ref.current?.querySelector('input, select, textarea, button')?.focus();
    const touche = (e) => { if (e.key === 'Escape') onFermer(); };
    document.addEventListener('keydown', touche);
    return () => { document.removeEventListener('keydown', touche); precedent?.focus?.(); };
  }, [onFermer]);
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
