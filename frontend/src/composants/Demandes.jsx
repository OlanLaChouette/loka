// Demandes venues de la place de marché : le gérant (ou le propriétaire) les accepte ou les refuse.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageCircle } from 'lucide-react';
import { api, messageErreur } from '../lib/api';
import { useSession } from '../lib/session';
import { dateCourte, fcfa } from '../lib/format';
import { ouvrirWhatsApp, SITE_PUBLIC } from '../lib/partage';
import { useRegles } from './Sejour';
import { Erreur } from './Ui';

export const useDemandesEnAttente = () => useQuery({ queryKey: ['demandes', 'en_attente'], queryFn: () => api.get('/demandes', { params: { statut: 'en_attente' } }).then(r => r.data), refetchInterval: 60000 });
const useAcomptesAttendus = () => useQuery({ queryKey: ['demandes', 'acceptee'], queryFn: () => api.get('/demandes', { params: { statut: 'acceptee' } }).then(r => r.data.filter(d => d.Reservation?.expire_le && d.Reservation.statut === 'confirmee')), refetchInterval: 60000 });
const heure = (d) => new Date(d).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

export function DemandesEnAttente() {
  const { role, espace } = useSession();
  const client = useQueryClient();
  const { data = [] } = useDemandesEnAttente();
  const { data: acomptes = [] } = useAcomptesAttendus();
  const { data: profil } = useRegles();
  const valider = useMutation({ mutationFn: (d) => api.post(`/demandes/${d.id}/acompte`), onSuccess: () => client.invalidateQueries() });
  const action = useMutation({
    mutationFn: ({ d, quoi, motif }) => api.post(`/demandes/${d.id}/${quoi}`, { motif }).then(r => ({ d, quoi, r: r.data })),
    onSuccess: ({ d, quoi }) => {
      client.invalidateQueries();
      // On prévient le client tout de suite sur WhatsApp.
      const msg = quoi === 'accepter'
        ? `Bonjour ${d.nom}, votre demande ${d.code} est acceptée : villa ${d.Bien?.reference}, du ${dateCourte(d.arrivee)} au ${dateCourte(d.depart)} (${fcfa(d.total)}). Pour la garantir, envoyez l’acompte de ${fcfa(Math.ceil(d.total * (profil?.acompte_pourcent ?? 50) / 100))} par Mobile Money au ${profil?.numero_paiement || profil?.telephone || ''} dans les 2 heures, puis indiquez la référence ici : ${SITE_PUBLIC}/demande/${d.code} — ${espace?.nom || ''}`
        : `Bonjour ${d.nom}, désolé, nous ne pouvons pas accepter votre demande ${d.code} du ${dateCourte(d.arrivee)} au ${dateCourte(d.depart)}. ${espace?.nom || ''}`;
      if (window.confirm('Prévenir le client sur WhatsApp maintenant ?')) ouvrirWhatsApp(d.telephone, msg.trim());
    },
  });
  if ((!data.length && !acomptes.length) || role === 'comptable') return null;
  return (
    <section className="carte" style={{ borderColor: 'var(--violet)' }}>
      <h2>Demandes de la place de marché <span className="puce violet">{data.length + acomptes.length}</span></h2>
      <p className="petit muet" style={{ margin: '4px 0 8px' }}>Des clients ont trouvé vos villas sur Loka. Le paiement se fait sur place.</p>
      <Erreur message={(action.error || valider.error) && messageErreur(action.error || valider.error)} />
      {acomptes.length > 0 && (
        <div className="liste-lignes" style={{ marginBottom: 8 }}>
          {acomptes.map(d => (
            <div key={d.id} style={{ flexWrap: 'wrap' }}>
              <span className="avatar" style={{ borderRadius: 10, width: 44, height: 44 }}>{d.Bien?.reference}</span>
              <span style={{ flex: 1, minWidth: 180 }}><b>{d.nom}</b> · acceptée, acompte attendu avant {heure(d.Reservation.expire_le)}
                <div className="petit muet">{d.acompte_reference ? `Le client a envoyé ${fcfa(d.acompte_montant)} · réf. ${d.acompte_reference} : vérifiez la réception, puis validez.` : 'Le client n’a pas encore déclaré son paiement.'}</div></span>
              {d.acompte_reference && <button type="button" className="bouton principal" disabled={valider.isPending} onClick={() => valider.mutate(d)}>Acompte reçu</button>}
            </div>
          ))}
        </div>
      )}
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
