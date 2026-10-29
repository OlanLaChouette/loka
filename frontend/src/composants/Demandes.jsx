// Demandes venues de la place de marché : le gérant (ou le propriétaire) les accepte ou les refuse.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageCircle } from 'lucide-react';
import { api, messageErreur } from '../lib/api';
import { useSession } from '../lib/session';
import { dateCourte, fcfa } from '../lib/format';
import { ouvrirWhatsApp } from '../lib/partage';
import { Erreur } from './Ui';

export const useDemandesEnAttente = () => useQuery({ queryKey: ['demandes', 'en_attente'], queryFn: () => api.get('/demandes', { params: { statut: 'en_attente' } }).then(r => r.data), refetchInterval: 60000 });

export function DemandesEnAttente() {
  const { role, espace } = useSession();
  const client = useQueryClient();
  const { data = [] } = useDemandesEnAttente();
  const action = useMutation({
    mutationFn: ({ d, quoi, motif }) => api.post(`/demandes/${d.id}/${quoi}`, { motif }).then(r => ({ d, quoi, r: r.data })),
    onSuccess: ({ d, quoi }) => {
      client.invalidateQueries();
      // On prévient le client tout de suite sur WhatsApp.
      const msg = quoi === 'accepter'
        ? `Bonjour ${d.nom}, votre demande ${d.code} est confirmée : ${d.Bien?.reference}, du ${dateCourte(d.arrivee)} au ${dateCourte(d.depart)} (${fcfa(d.total)}, paiement sur place). À bientôt ! ${espace?.nom || ''}`
        : `Bonjour ${d.nom}, désolé, nous ne pouvons pas accepter votre demande ${d.code} du ${dateCourte(d.arrivee)} au ${dateCourte(d.depart)}. ${espace?.nom || ''}`;
      if (window.confirm('Prévenir le client sur WhatsApp maintenant ?')) ouvrirWhatsApp(d.telephone, msg.trim());
    },
  });
  if (!data.length || role === 'comptable') return null;
  return (
    <section className="carte" style={{ borderColor: 'var(--violet)' }}>
      <h2>Demandes de la place de marché <span className="puce violet">{data.length}</span></h2>
      <p className="petit muet" style={{ margin: '4px 0 8px' }}>Des clients ont trouvé vos villas sur Loka. Le paiement se fait sur place.</p>
      <Erreur message={action.error && messageErreur(action.error)} />
      <div className="liste-lignes">
        {data.map(d => (
          <div key={d.id} style={{ flexWrap: 'wrap' }}>
            <span className="avatar" style={{ borderRadius: 10, width: 44, height: 44 }}>{d.Bien?.reference}</span>
            <span style={{ flex: 1, minWidth: 180 }}>
              <b>{d.nom}</b> · {d.telephone}
              <div className="petit muet">{dateCourte(d.arrivee)} → {dateCourte(d.depart)} · {d.nuits} nuit{d.nuits > 1 ? 's' : ''} · {fcfa(d.total)}</div>
              {d.message && <div className="petit">« {d.message} »</div>}
            </span>
            <span style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
              <button type="button" className="bouton-rond" onClick={() => ouvrirWhatsApp(d.telephone, `Bonjour ${d.nom}, `)} aria-label={`Écrire à ${d.nom}`}><MessageCircle size={16} /></button>
              <button type="button" className="bouton" disabled={action.isPending} onClick={() => { const motif = window.prompt('Motif du refus (facultatif) ?'); if (motif !== null) action.mutate({ d, quoi: 'refuser', motif }); }}>Refuser</button>
              <button type="button" className="bouton principal" disabled={action.isPending} onClick={() => action.mutate({ d, quoi: 'accepter' })}>Accepter</button>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
