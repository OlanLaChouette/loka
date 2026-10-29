// Fiche d'un séjour : encaisser, remettre les clés (acompte et heure d'arrivée), départ (nuit en plus après l'heure),
// annulation selon les règles (pénalité et remboursement calculés), remboursement, villas de remplacement, lien d'avis.
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, LogOut, MessageCircle, Star } from 'lucide-react';
import { api, messageErreur } from '../lib/api';
import { useSession } from '../lib/session';
import { dateCourte, fcfa } from '../lib/format';
import { ouvrirWhatsApp, partagerLien, SITE_PUBLIC } from '../lib/partage';
import { Champ, Erreur, Modale, Puce } from './Ui';
import { Encaisser } from './Formulaires';

export const useRegles = () => useQuery({ queryKey: ['profil'], queryFn: () => api.get('/profil').then(r => r.data), staleTime: 300000 });
const TYPES = { gratuite: 'Annulation gratuite', tardive: 'Annulation tardive', absence: 'Non-présentation', bailleur: 'Annulation par vous' };
const PAR = { client: 'le client', bailleur: 'vous (bailleur)', absence: 'non-présentation', expiration: 'acompte non reçu à temps' };

function Annulation({ r, onFermer }) {
  const { role } = useSession();
  const client = useQueryClient();
  const [par, setPar] = useState('client');
  const [motif, setMotif] = useState('');
  const { data: sim, error: erreurSim } = useQuery({ queryKey: ['simulation', r.id, par], queryFn: () => api.post(`/reservations/${r.id}/annuler`, { par, simulation: true }).then(x => x.data) });
  const { data: alt } = useQuery({ queryKey: ['alternatives', r.id], queryFn: () => api.get(`/reservations/${r.id}/alternatives`).then(x => x.data), enabled: par === 'bailleur' });
  const envoi = useMutation({ mutationFn: () => api.post(`/reservations/${r.id}/annuler`, { par, motif }), onSuccess: () => { client.invalidateQueries(); onFermer(); } });
  return (
    <Modale titre={`Annuler · ${r.Bien?.reference} · ${r.Client?.nom}`} onFermer={onFermer} actions={<>
      <button className="bouton" onClick={onFermer}>Retour</button>
      <button className="bouton danger" disabled={!sim || envoi.isPending} onClick={() => envoi.mutate()}>Confirmer l’annulation</button>
    </>}>
      <Erreur message={(envoi.error || erreurSim) && messageErreur(envoi.error || erreurSim)} />
      <div className="segment" role="radiogroup" aria-label="Qui annule ?">
        <button type="button" className={par === 'client' ? 'actif' : ''} onClick={() => setPar('client')}>Le client annule</button>
        {role === 'proprietaire' && <button type="button" className={par === 'bailleur' ? 'actif' : ''} onClick={() => setPar('bailleur')}>Nous annulons</button>}
      </div>
      {sim && (
        <div className="liste-lignes">
          <div><span className="muet" style={{ flex: 1 }}>Situation</span><b>{TYPES[sim.type]}</b></div>
          <div><span className="muet" style={{ flex: 1 }}>Déjà payé</span><b>{fcfa(sim.paye)}</b></div>
          <div><span className="muet" style={{ flex: 1 }}>Retenu (pénalité)</span><b>{fcfa(sim.penalite)}</b></div>
          <div><span className="muet" style={{ flex: 1 }}>À rembourser au client</span><b style={{ color: sim.a_rembourser ? 'var(--negatif)' : undefined }}>{fcfa(sim.a_rembourser)}</b></div>
          {sim.reste_du > 0 && <div><span className="muet" style={{ flex: 1 }}>Pénalité encore due par le client</span><b>{fcfa(sim.reste_du)}</b></div>}
          {sim.penalite_bailleur > 0 && <div><span className="muet" style={{ flex: 1 }}>Pénalité place de marché (facturée avec l’abonnement)</span><b style={{ color: 'var(--negatif)' }}>{fcfa(sim.penalite_bailleur)}</b></div>}
        </div>
      )}
      {par === 'bailleur' && <div className="info petit">Le client est remboursé intégralement. Annuler une réservation de la place de marché fait baisser votre fiabilité et votre place dans les résultats : proposez-lui plutôt une autre villa.</div>}
      {par === 'bailleur' && alt && (
        <div>
          <b className="petit">Villas libres aux mêmes dates</b>
          <div className="liste-lignes">
            {alt.villas.map(v => <div key={v.id}><span className="avatar" style={{ borderRadius: 10, width: 38, height: 38 }}>{v.reference}</span><span style={{ flex: 1 }}>{v.Site?.nom} · {v.standing || v.type}{v.pieces ? ` · ${v.pieces} ch.` : ''}</span><b>{fcfa(v.prix_nuit)}</b></div>)}
            {!alt.villas.length && <span className="petit muet">Aucune autre de vos villas n’est libre : proposez une recherche sur Loka Villas.</span>}
          </div>
          {r.Client?.telephone && <button type="button" className="bouton" style={{ marginTop: 8 }} onClick={() => ouvrirWhatsApp(r.Client.telephone, `Bonjour ${r.Client.nom}, nous sommes désolés : la villa ${r.Bien?.reference} n’est plus disponible du ${dateCourte(r.arrivee)} au ${dateCourte(r.depart)}. ${alt.villas.length ? `Nous pouvons vous proposer : ${alt.villas.slice(0, 3).map(v => `${v.reference} (${fcfa(v.prix_nuit)}/nuit)`).join(', ')}.` : ''} Autres villas libres : ${SITE_PUBLIC}${alt.recherche}`)}><MessageCircle size={15} />Proposer une autre villa au client</button>}
        </div>
      )}
      <Champ label="Motif (facultatif)"><input value={motif} onChange={e => setMotif(e.target.value)} placeholder="Changement de programme, panne…" /></Champ>
    </Modale>
  );
}

export function DetailSejour({ r, onFermer }) {
  const { role, espace } = useSession();
  const client = useQueryClient();
  const { data: profil } = useRegles();
  const [vue, setVue] = useState(null);
  const [remb, setRemb] = useState({ moyen: 'mobile_money', reference: '' });
  const fin = () => { client.invalidateQueries(); onFermer(); };
  const action = useMutation({ mutationFn: ({ quoi, corps }) => api.post(`/reservations/${r.id}/${quoi}`, corps).then(x => x.data), onSuccess: fin });
  const { data: simDepart } = useQuery({ queryKey: ['depart', r.id], queryFn: () => api.post(`/reservations/${r.id}/depart`, { simulation: true }).then(x => x.data), enabled: !!r.cles_remises_le && !r.parti_le });
  const reste = r.total - r.paye;
  const lecture = role === 'comptable';
  const acompte = profil ? Math.ceil((r.total * profil.acompte_pourcent) / 100) : 0;
  const manque = Math.max(0, acompte - r.paye);
  if (vue === 'encaisser') return <Encaisser reservation={r} reste={reste} onFermer={onFermer} />;
  if (vue === 'annuler') return <Annulation r={r} onFermer={onFermer} />;
  const etat = r.statut === 'annulee' ? <Puce ton="negatif">Annulé · {PAR[r.annule_par] || ''}</Puce>
    : r.parti_le ? <Puce>Parti</Puce> : r.cles_remises_le ? <Puce ton="violet">Dans les lieux</Puce> : <Puce statut={r.statut} />;
  return (
    <Modale titre={`${r.Bien?.reference} · ${r.Client?.nom}`} onFermer={onFermer} actions={!lecture && <>
      {r.statut !== 'annulee' && !r.cles_remises_le && <button className="bouton danger" onClick={() => setVue('annuler')}>Annuler…</button>}
      {r.statut === 'attente_validation' && role === 'proprietaire' && <button className="bouton principal" onClick={() => action.mutate({ quoi: 'valider' })}>Valider la réduction</button>}
      {r.statut === 'confirmee' && reste > 0 && <button className="bouton" onClick={() => setVue('encaisser')}>Encaisser {fcfa(reste)}</button>}
      {r.statut === 'confirmee' && !r.cles_remises_le && <button className="bouton principal" disabled={manque > 0} title={manque ? `Acompte manquant : ${fcfa(manque)}` : ''} onClick={() => action.mutate({ quoi: 'cles' })}><KeyRound size={16} />Remettre les clés</button>}
      {r.cles_remises_le && !r.parti_le && <button className="bouton principal" onClick={() => action.mutate({ quoi: 'depart' })}><LogOut size={16} />Enregistrer le départ</button>}
    </>}>
      <Erreur message={action.error && messageErreur(action.error)} />
      <div className="liste-lignes">
        <div><span className="muet" style={{ flex: 1 }}>Séjour</span><b>{dateCourte(r.arrivee)} → {dateCourte(r.depart)} · {r.nuits} nuit{r.nuits > 1 ? 's' : ''}</b></div>
        {profil && <div><span className="muet" style={{ flex: 1 }}>Horaires</span><b>arrivée dès {profil.heure_arrivee} · départ avant {profil.heure_depart}</b></div>}
        {r.reduction > 0 && <div><span className="muet" style={{ flex: 1 }}>Réduction · {r.reduction_motif}</span><b style={{ color: 'var(--negatif)' }}>− {fcfa(r.reduction)}</b></div>}
        {r.supplement > 0 && <div><span className="muet" style={{ flex: 1 }}>Départ après l’heure</span><b>+ {fcfa(r.supplement)}</b></div>}
        <div><span className="muet" style={{ flex: 1 }}>Total</span><b>{fcfa(r.total)}</b></div>
        <div><span className="muet" style={{ flex: 1 }}>Déjà payé</span><b>{fcfa(r.paye)}</b></div>
        {r.source === 'place_de_marche' && <div><span className="muet" style={{ flex: 1 }}>Origine</span><Puce ton="violet">Place de marché</Puce></div>}
        <div><span className="muet" style={{ flex: 1 }}>État</span>{etat}</div>
        {r.statut === 'annulee' && r.penalite > 0 && <div><span className="muet" style={{ flex: 1 }}>Pénalité retenue</span><b>{fcfa(r.penalite)}</b></div>}
      </div>
      {r.statut === 'confirmee' && !r.cles_remises_le && manque > 0 && profil && <div className="info petit">Clés après un acompte de {profil.acompte_pourcent} % : encore {fcfa(manque)} à encaisser.</div>}
      {r.expire_le && !r.paye && <div className="info petit">Place de marché : sans acompte avant {new Date(r.expire_le).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}, les dates seront libérées automatiquement.</div>}
      {simDepart?.tardif && <div className="erreur petit">Il est plus de {simDepart.heure_depart} : enregistrer le départ maintenant ajoute une nuit ({fcfa(simDepart.supplement)}). Reste à payer : {fcfa(simDepart.reste)}.</div>}
      {r.a_rembourser > 0 && !r.rembourse_le && !lecture && (
        <div className="carte" style={{ background: 'var(--champ)', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <b>À rembourser au client : {fcfa(r.a_rembourser)}</b>
          <div className="grille-form">
            <Champ label="Moyen"><select value={remb.moyen} onChange={e => setRemb({ ...remb, moyen: e.target.value })}><option value="mobile_money">Mobile Money</option><option value="especes">Espèces</option><option value="virement">Virement</option></select></Champ>
            <Champ label="Référence"><input value={remb.reference} onChange={e => setRemb({ ...remb, reference: e.target.value })} /></Champ>
          </div>
          <button className="bouton principal" onClick={() => action.mutate({ quoi: 'remboursement', corps: remb })}>Remboursement effectué</button>
        </div>
      )}
      {r.rembourse_le && <div className="info petit">Remboursé ({fcfa(r.a_rembourser)}) le {dateCourte(r.rembourse_le.slice(0, 10))}{r.rembourse_ref ? ` · réf. ${r.rembourse_ref}` : ''}.</div>}
      {r.parti_le && r.code_avis && r.Client?.telephone && !lecture && (
        <button type="button" className="bouton" onClick={() => ouvrirWhatsApp(r.Client.telephone, `Bonjour ${r.Client.nom}, merci pour votre séjour chez ${espace?.nom || 'nous'} ! Votre avis compte : ${SITE_PUBLIC}/avis/${r.code_avis}`)}><Star size={15} />Demander un avis au client (WhatsApp)</button>
      )}
      {r.parti_le && r.code_avis && !r.Client?.telephone && <button type="button" className="bouton" onClick={() => partagerLien(`/avis/${r.code_avis}`, 'Donnez votre avis sur votre séjour')}><Star size={15} />Partager le lien d’avis</button>}
    </Modale>
  );
}
