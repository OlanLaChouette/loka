// Fichier clients : reconnaissance d'un client à son numéro, bandeau d'information dans les formulaires,
// et fiche complète (historique, payé, reste dû, notes, signalement).
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, MessageCircle, Phone, Star } from 'lucide-react';
import { api, messageErreur } from '../lib/api';
import { useSession } from '../lib/session';
import { dateCourte, fcfa } from '../lib/format';
import { ouvrirWhatsApp } from '../lib/partage';
import { Avatar, Chargement, Champ, Erreur, Modale, Puce, Vide } from './Ui';

const huitChiffres = (t) => String(t || '').replace(/\D/g, '').slice(-8);

// Client déjà connu pour ce numéro (null sinon), dès que 8 chiffres sont saisis.
export function useClientConnu(telephone) {
  const c = huitChiffres(telephone);
  return useQuery({
    queryKey: ['client-connu', c], enabled: c.length === 8, staleTime: 60000,
    queryFn: () => api.get('/clients/recherche', { params: { telephone: c } }).then(r => r.data),
  }).data || null;
}

export function Badges({ client }) {
  const b = client.bilan || {};
  return <>
    {client.statut === 'a_eviter' && <Puce ton="negatif">À éviter</Puce>}
    {b.fidele && <Puce ton="violet"><Star size={11} style={{ verticalAlign: -1 }} /> Fidèle</Puce>}
    {b.reste > 0 && <Puce ton="negatif">Doit {fcfa(b.reste)}</Puce>}
  </>;
}

// Bandeau affiché dans « Nouvelle réservation » / « Nouveau bail » quand le numéro est reconnu.
export function BandeauClient({ client }) {
  if (!client) return null;
  const b = client.bilan;
  const resume = [b.sejours ? `${b.sejours} séjour${b.sejours > 1 ? 's' : ''}` : 'aucun séjour passé', b.baux ? `${b.baux} bail en cours` : '', b.paye ? `${fcfa(b.paye)} payés` : ''].filter(Boolean).join(' · ');
  return (
    <div className={client.statut === 'a_eviter' ? 'erreur' : 'info'} role="status" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {client.statut === 'a_eviter' && <AlertTriangle size={16} />}<b>Client connu : {client.nom}</b><Badges client={client} />
      </span>
      <span className="petit">{resume}{b.dernier ? ` · dernier séjour le ${dateCourte(b.dernier)}` : ''}</span>
      {client.statut === 'a_eviter' && <span className="petit"><b>Signalé par le propriétaire</b>{client.motif_alerte ? ` : ${client.motif_alerte}` : ''}</span>}
      {client.notes && <span className="petit">Note : {client.notes}</span>}
    </div>
  );
}

export function FicheClient({ clientId, onFermer }) {
  const { role } = useSession();
  const client = useQueryClient();
  const { data: c, isLoading } = useQuery({ queryKey: ['client', clientId], queryFn: () => api.get('/clients/' + clientId).then(r => r.data) });
  const [f, setF] = useState(null);
  useEffect(() => { if (c) setF({ nom: c.nom, telephone: c.telephone || '', piece_numero: c.piece_numero || '', notes: c.notes || '', statut: c.statut, motif_alerte: c.motif_alerte || '' }); }, [c]);
  const enregistrer = useMutation({
    mutationFn: () => api.patch('/clients/' + clientId, role === 'proprietaire' ? f : { nom: f.nom, telephone: f.telephone, piece_numero: f.piece_numero, notes: f.notes }),
    onSuccess: () => { client.invalidateQueries({ queryKey: ['clients'] }); client.invalidateQueries({ queryKey: ['client', clientId] }); client.invalidateQueries({ queryKey: ['client-connu'] }); onFermer(); },
  });
  if (isLoading || !f) return <Modale titre="Client" onFermer={onFermer}><Chargement /></Modale>;
  const b = c.bilan;
  const lecture = role === 'comptable';
  const maj = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <Modale titre={c.nom} onFermer={onFermer} actions={!lecture && <>
      <button className="bouton" onClick={onFermer}>Fermer</button>
      <button className="bouton principal" disabled={!f.nom || enregistrer.isPending} onClick={() => enregistrer.mutate()}>Enregistrer</button>
    </>}>
      <Erreur message={enregistrer.error && messageErreur(enregistrer.error)} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <Avatar nom={c.nom} taille={48} />
        <span style={{ flex: 1, minWidth: 140 }}><b>{c.telephone || 'Sans téléphone'}</b><div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}><Badges client={c} /></div></span>
        {c.telephone && <>
          <a className="bouton-rond" href={`tel:${c.telephone.replace(/\s/g, '')}`} aria-label={`Appeler ${c.nom}`}><Phone size={17} /></a>
          <button type="button" className="bouton-rond" onClick={() => ouvrirWhatsApp(c.telephone, `Bonjour ${c.nom}, `)} aria-label={`Écrire à ${c.nom} sur WhatsApp`}><MessageCircle size={17} /></button>
        </>}
      </div>
      <div className="chiffres-client">
        <div><span className="petit muet">Séjours</span><b>{b.sejours}</b></div>
        <div><span className="petit muet">Nuits</span><b>{b.nuits}</b></div>
        <div><span className="petit muet">Payé</span><b>{fcfa(b.paye)}</b></div>
        <div><span className="petit muet">Reste dû</span><b style={{ color: b.reste ? 'var(--negatif)' : undefined }}>{fcfa(b.reste)}</b></div>
      </div>
      <div className="grille-form">
        <Champ label="Nom"><input value={f.nom} onChange={maj('nom')} disabled={lecture} /></Champ>
        <Champ label="Téléphone"><input value={f.telephone} onChange={maj('telephone')} inputMode="tel" disabled={lecture} /></Champ>
        <Champ label="N° de pièce d’identité"><input value={f.piece_numero} onChange={maj('piece_numero')} disabled={lecture} /></Champ>
        <Champ label="Note (préférences, remarques)" plein><textarea rows={2} value={f.notes} onChange={maj('notes')} disabled={lecture} placeholder="Préfère la B2, arrive tard le soir…" /></Champ>
        {role === 'proprietaire' && (
          <div className="plein signalement">
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 600 }}>
              <input type="checkbox" checked={f.statut === 'a_eviter'} onChange={e => setF({ ...f, statut: e.target.checked ? 'a_eviter' : 'normal' })} />
              Signaler ce client « à éviter »
            </label>
            {f.statut === 'a_eviter' && <input value={f.motif_alerte} onChange={maj('motif_alerte')} placeholder="Motif : impayé, dégâts… (visible par vos gérants)" />}
          </div>
        )}
      </div>
      <div>
        <h3 style={{ fontSize: 15, marginBottom: 6 }}>Historique</h3>
        {c.Reservations.length || c.Bails.length ? (
          <div className="liste-lignes">
            {c.Bails.map(bail => (
              <div key={bail.id}><span className="avatar" style={{ borderRadius: 10, width: 40, height: 40 }}>{bail.Bien?.reference}</span>
                <span style={{ flex: 1 }}><b>Bail depuis le {dateCourte(bail.debut)}</b><div className="petit muet">{fcfa(bail.loyer)} / mois</div></span>
                <Puce ton={bail.statut === 'actif' ? 'violet' : ''}>{bail.statut === 'actif' ? 'En cours' : 'Terminé'}</Puce></div>
            ))}
            {c.Reservations.map(r => {
              const paye = r.Paiements.reduce((s, p) => s + p.montant, 0);
              return (
                <div key={r.id}><span className="avatar" style={{ borderRadius: 10, width: 40, height: 40 }}>{r.Bien?.reference}</span>
                  <span style={{ flex: 1 }}><b>{dateCourte(r.arrivee)} → {dateCourte(r.depart)}</b><div className="petit muet">{r.nuits} nuit{r.nuits > 1 ? 's' : ''} · {fcfa(r.total)}{r.reduction ? ` · réduction ${fcfa(r.reduction)}` : ''}</div></span>
                  {r.statut === 'annulee' ? <Puce>Annulé</Puce> : paye >= r.total ? <Puce ton="violet">Payé</Puce> : <Puce ton="negatif">Reste {fcfa(r.total - paye)}</Puce>}</div>
              );
            })}
          </div>
        ) : <Vide>Aucun séjour ni bail pour l’instant.</Vide>}
      </div>
    </Modale>
  );
}
