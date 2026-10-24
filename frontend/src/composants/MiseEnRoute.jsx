// Parcours de démarrage d'un espace : ce qu'il faut faire avant de travailler, dans l'ordre, avec un bouton par étape.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import { api } from '../lib/api';
import { useSession } from '../lib/session';

const ETAPES = {
  entreprise: { titre: 'Compléter les informations de l’entreprise', texte: 'Adresse, téléphone, RCCM : elles figurent sur les reçus et les contrats.', lien: '/parametres', action: 'Compléter' },
  logo: { titre: 'Ajouter votre logo', texte: 'Il apparaît dans l’application et sur les documents.', lien: '/parametres', action: 'Ajouter', facultatif: true },
  site: { titre: 'Créer votre premier site', texte: 'Un site regroupe des biens au même endroit (une résidence, un immeuble).', lien: '/biens?action=site', action: 'Créer un site' },
  biens: { titre: 'Ajouter vos biens', texte: 'Villas, appartements… Vous pouvez en ajouter plusieurs d’un coup (A1 à A10).', lien: '/biens?action=lot', action: 'Ajouter des biens' },
  gerant: { titre: 'Inviter un gérant', texte: 'Il réservera et encaissera sur le terrain avec son téléphone.', lien: '/membres?action=nouveau', action: 'Inviter', facultatif: true },
  charges: { titre: 'Déclarer vos charges fixes', texte: 'Gaz, Wi-Fi, gardiennage… pour connaître votre vrai bénéfice.', lien: '/argent?onglet=charges', action: 'Déclarer', facultatif: true },
};

export const useMiseEnRoute = () => useQuery({ queryKey: ['mise-en-route'], queryFn: () => api.get('/mise-en-route').then(r => r.data) });

export default function MiseEnRoute() {
  const { espace, role } = useSession();
  const { data } = useMiseEnRoute();
  const cle = 'loka-mise-en-route-masquee-' + espace?.id;
  const [masquee, setMasquee] = useState(() => { try { return localStorage.getItem(cle) === '1'; } catch { return false; } });
  if (!data || role !== 'proprietaire') return null;
  const faites = data.etapes.filter(e => e.fait).length;
  if (faites === data.etapes.length || (masquee && data.pret)) return null;
  const prochaine = data.etapes.find(e => !e.fait);

  return (
    <section className="carte mise-en-route" aria-labelledby="titre-mise-en-route">
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <h2 id="titre-mise-en-route" style={{ fontSize: 17 }}>{data.pret ? 'Votre espace est prêt' : 'Mettons votre espace en route'}</h2>
          <p className="petit muet" style={{ margin: '4px 0 0' }}>{data.pret ? 'Vous pouvez déjà réserver et encaisser. Il reste quelques réglages utiles.' : 'Quelques minutes suffisent. Les deux étapes essentielles : un site et ses biens.'}</p>
        </div>
        <span className="petit muet">{faites} / {data.etapes.length}</span>
        {data.pret && <button type="button" className="bouton discret petit" onClick={() => { try { localStorage.setItem(cle, '1'); } catch { /* ignoré */ } setMasquee(true); }}>Masquer</button>}
      </div>
      <div className="jauge" style={{ margin: '12px 0 4px' }}><span style={{ width: `${faites / data.etapes.length * 100}%` }} /></div>
      <ol className="etapes">
        {data.etapes.map(e => {
          const d = ETAPES[e.cle];
          const courante = e === prochaine;
          return (
            <li key={e.cle} className={'etape' + (e.fait ? ' faite' : '') + (courante ? ' courante' : '')}>
              <span className="etape-puce" aria-hidden="true">{e.fait ? <Check size={14} /> : null}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <b>{d.titre}</b>{d.facultatif && !e.fait && <span className="petit muet"> · conseillé</span>}
                {!e.fait && <span className="petit muet" style={{ display: 'block' }}>{d.texte}</span>}
                {e.fait && <span className="visuellement-cache"> (fait)</span>}
              </span>
              {!e.fait && <Link className={'bouton' + (courante ? ' principal' : '')} to={d.lien}>{d.action}</Link>}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
