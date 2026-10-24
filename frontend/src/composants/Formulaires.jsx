import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, messageErreur } from '../lib/api';
import { ajouterJours, aujourdhui, fcfa, MOYENS } from '../lib/format';
import { Champ, Erreur, Modale } from './Ui';
import { useSession } from '../lib/session';
import { messages, ouvrirPdf, partagerRecu } from '../lib/partage';
import { envoyer } from '../lib/horsLigne';
import { compresserImage } from '../lib/image';

export const useBiens = () => useQuery({ queryKey: ['biens'], queryFn: () => api.get('/biens').then(r => r.data) });
export const useSites = () => useQuery({ queryKey: ['sites'], queryFn: () => api.get('/sites').then(r => r.data) });

function useEnvoi(fn, onFait) {
  const client = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: (r) => { client.invalidateQueries(); onFait?.(r); } });
}

// ---------- Nouvelle réservation (location à la nuit) ----------
export function NouvelleReservation({ onFermer, bienInitial }) {
  const { data: biens = [] } = useBiens();
  const biensNuit = biens.filter(b => b.mode === 'nuit' && b.etat === 'disponible');
  const [f, setF] = useState({ bien_id: bienInitial || '', nom: '', telephone: '', piece_numero: '', arrivee: aujourdhui(), depart: ajouterJours(aujourdhui(), 1), type: 'pourcent', valeur: '', motif: '' });
  const maj = (cle) => (e) => setF({ ...f, [cle]: e.target.value });
  const bien = biensNuit.find(b => b.id === f.bien_id);
  const nuits = Math.max(0, Math.round((new Date(f.depart) - new Date(f.arrivee)) / 86400000));
  const prixNormal = (bien?.prix_nuit || 0) * nuits;
  const v = Number(f.valeur) || 0;
  const reduction = f.type === 'pourcent' ? Math.round(prixNormal * v / 100) : v;
  const [resultat, setResultat] = useState(null);
  const envoi = useEnvoi(() => api.post('/reservations', {
    bien_id: f.bien_id, client: { nom: f.nom, telephone: f.telephone, piece_type: f.piece_numero ? 'CNIB' : null, piece_numero: f.piece_numero },
    arrivee: f.arrivee, depart: f.depart, reduction: v ? (f.type === 'pourcent' ? { pourcent: v } : { montant: v }) : null, reduction_motif: f.motif || null,
  }).then(r => r.data), setResultat);

  if (resultat) return (
    <Modale titre="Réservation enregistrée" onFermer={onFermer} actions={<>
      <button className="bouton" onClick={onFermer}>Fermer</button>
      {resultat.statut === 'confirmee' && <EncaisserBouton reservation={resultat} client={{ nom: f.nom, telephone: f.telephone }} onFait={onFermer} />}
    </>}>
      {resultat.statut === 'attente_validation'
        ? <div className="info">La réduction dépasse votre limite : le propriétaire doit la valider avant l’encaissement.</div>
        : <div className="info">Séjour confirmé · {fcfa(resultat.total)} à encaisser.</div>}
    </Modale>
  );

  return (
    <Modale titre="Nouvelle réservation" onFermer={onFermer} actions={<>
      <button className="bouton" onClick={onFermer}>Annuler</button>
      <button className="bouton principal" disabled={!bien || !f.nom || nuits < 1 || envoi.isPending || (reduction > 0 && !f.motif)} onClick={() => envoi.mutate()}>{envoi.isPending ? 'Enregistrement…' : 'Réserver'}</button>
    </>}>
      <Erreur message={envoi.error && messageErreur(envoi.error)} />
      <div className="grille-form">
        <Champ label="Bien" plein>
          <select value={f.bien_id} onChange={maj('bien_id')}>
            <option value="">Choisir…</option>
            {biensNuit.map(b => <option key={b.id} value={b.id}>{b.Site?.nom} · {b.reference} · {fcfa(b.prix_nuit)} / nuit</option>)}
          </select>
        </Champ>
        <Champ label="Arrivée"><input type="date" value={f.arrivee} onChange={maj('arrivee')} /></Champ>
        <Champ label="Départ"><input type="date" value={f.depart} min={ajouterJours(f.arrivee, 1)} onChange={maj('depart')} /></Champ>
        <Champ label="Nom du client" plein><input value={f.nom} onChange={maj('nom')} autoComplete="off" /></Champ>
        <Champ label="Téléphone"><input value={f.telephone} onChange={maj('telephone')} inputMode="tel" /></Champ>
        <Champ label="N° de pièce d’identité"><input value={f.piece_numero} onChange={maj('piece_numero')} /></Champ>
        <Champ label="Réduction">
          <div style={{ display: 'flex', gap: 6 }}>
            <input value={f.valeur} onChange={maj('valeur')} inputMode="numeric" placeholder="0" style={{ flex: 1, minWidth: 0 }} />
            <select value={f.type} onChange={maj('type')} aria-label="Type de réduction"><option value="pourcent">%</option><option value="montant">FCFA</option></select>
          </div>
        </Champ>
        <Champ label="Raison de la réduction"><input value={f.motif} onChange={maj('motif')} placeholder={reduction ? 'Obligatoire' : 'Client fidèle, long séjour…'} /></Champ>
      </div>
      <div className="carte" style={{ background: 'var(--champ)', padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>{nuits} nuit{nuits > 1 ? 's' : ''} × {fcfa(bien?.prix_nuit || 0)}</span><b>{fcfa(prixNormal)}</b></div>
        {reduction > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}><span>Réduction</span><b style={{ color: 'var(--negatif)' }}>− {fcfa(reduction)}</b></div>}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, alignItems: 'baseline' }}><span style={{ fontWeight: 600 }}>À encaisser</span><span className="chiffre chiffre-m">{fcfa(Math.max(0, prixNormal - reduction))}</span></div>
      </div>
    </Modale>
  );
}

// ---------- Encaissement ----------
function RecuEncaisse({ recu, client, onFermer }) {
  const { espace } = useSession();
  const [etat, setEtat] = useState('');
  const envoyer = async () => {
    setEtat('Préparation du reçu…');
    try {
      const r = await partagerRecu({ paiementId: recu.id, numero: recu.numero_recu, telephone: client?.telephone, message: messages.recu({ client: client?.nom, montant: recu.montant, numero: recu.numero_recu, bailleur: espace?.nom }) });
      setEtat(r === 'telecharge' ? 'Reçu téléchargé : joignez-le dans la conversation WhatsApp qui vient de s’ouvrir.' : '');
    } catch (e) { setEtat(messageErreur(e)); }
  };
  return (
    <Modale titre="Paiement encaissé" onFermer={onFermer} actions={<>
      <button className="bouton" onClick={() => ouvrirPdf(`/paiements/${recu.id}/recu.pdf`)}>Voir le reçu</button>
      <button className="bouton principal" onClick={envoyer}>Envoyer par WhatsApp</button>
    </>}>
      <div style={{ textAlign: 'center', padding: '10px 0' }}>
        <div className="chiffre chiffre-l">{fcfa(recu.montant)}</div>
        <div className="muet" style={{ marginTop: 6 }}>Reçu {recu.numero_recu} · {MOYENS[recu.moyen]}{client?.nom ? ' · ' + client.nom : ''}</div>
      </div>
      {etat && <div className="info" role="status">{etat}</div>}
    </Modale>
  );
}

export function Encaisser({ reservation, bail, client, periode, reste, onFermer }) {
  const [f, setF] = useState({ montant: String(reste ?? reservation?.total ?? bail?.loyer ?? ''), moyen: 'especes', reference: '', periode: periode || aujourdhui().slice(0, 7) });
  const [recu, setRecu] = useState(null);
  const { espace } = useSession();
  const envoi = useEnvoi(() => envoyer({
    type: 'paiement', espace: espace.id,
    libelle: `Encaissement ${fcfa(Number(f.montant))}${client?.nom || reservation?.Client?.nom ? ' · ' + (client?.nom || reservation?.Client?.nom) : ''}`,
    donnees: {
      reservation_id: reservation?.id, bail_id: bail?.id, periode: bail ? f.periode : undefined,
      montant: Number(f.montant), moyen: f.moyen, reference: f.reference || null, date_paiement: aujourdhui(),
    },
  }), (r) => setRecu(r.enAttente ? { enAttente: true, montant: Number(f.montant) } : r.data));

  if (recu?.enAttente) return (
    <Modale titre="Encaissement gardé sur l’appareil" onFermer={onFermer} actions={<button className="bouton principal" onClick={onFermer}>Compris</button>}>
      <div className="info">Pas de réseau : l’encaissement de {fcfa(recu.montant)} partira automatiquement dès le retour de la connexion. Le reçu sera disponible à ce moment-là.</div>
    </Modale>
  );
  if (recu) return <RecuEncaisse recu={recu} client={client || reservation?.Client || bail?.Client} onFermer={onFermer} />;
  return (
    <Modale titre={bail ? 'Encaisser un loyer' : 'Encaisser un séjour'} onFermer={onFermer} actions={<>
      <button className="bouton" onClick={onFermer}>Annuler</button>
      <button className="bouton principal" disabled={!Number(f.montant) || envoi.isPending} onClick={() => envoi.mutate()}>{envoi.isPending ? 'Encaissement…' : 'Encaisser ' + fcfa(Number(f.montant) || 0)}</button>
    </>}>
      <Erreur message={envoi.error && messageErreur(envoi.error)} />
      <div className="grille-form">
        <Champ label="Montant (FCFA)" plein><input value={f.montant} onChange={e => setF({ ...f, montant: e.target.value.replace(/\D/g, '') })} inputMode="numeric" /></Champ>
        {bail && <Champ label="Loyer du mois" plein><input type="month" value={f.periode} onChange={e => setF({ ...f, periode: e.target.value })} /></Champ>}
        <div className="plein" role="radiogroup" aria-label="Moyen de paiement" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {['especes', 'mobile_money', 'virement'].map(m => (
            <button key={m} type="button" role="radio" aria-checked={f.moyen === m} className={'bouton' + (f.moyen === m ? ' principal' : '')} onClick={() => setF({ ...f, moyen: m })}>{MOYENS[m]}</button>
          ))}
        </div>
        {f.moyen !== 'especes' && <Champ label="Référence de la transaction" plein><input value={f.reference} onChange={e => setF({ ...f, reference: e.target.value })} /></Champ>}
      </div>
    </Modale>
  );
}

export function EncaisserBouton({ reservation, client, onFait }) {
  const [ouvert, setOuvert] = useState(false);
  return <>
    <button className="bouton principal" onClick={() => setOuvert(true)}>Encaisser</button>
    {ouvert && <Encaisser reservation={reservation} client={client} reste={reservation.total} onFermer={() => { setOuvert(false); onFait?.(); }} />}
  </>;
}

// ---------- Dépense avec justificatif ----------
const CATEGORIES = ['Recharge gaz', 'Ménage', 'Plomberie', 'Électricité', 'Réparation', 'Jardinage', 'Fournitures', 'Autre'];
export function NouvelleDepense({ onFermer }) {
  const { data: biens = [] } = useBiens();
  const { data: sites = [] } = useSites();
  const [f, setF] = useState({ cible: '', categorie: 'Recharge gaz', montant: '', date_depense: aujourdhui(), note: '' });
  const [fichier, setFichier] = useState(null);
  const apercu = useMemo(() => (fichier && fichier.type.startsWith('image/') ? URL.createObjectURL(fichier) : null), [fichier]);
  const { espace } = useSession();
  const [gardee, setGardee] = useState(false);
  const envoi = useEnvoi(() => {
    const [type, id] = f.cible.split(':');
    return envoyer({
      type: 'depense', espace: espace.id, fichier, libelle: `Dépense ${f.categorie} · ${fcfa(Number(f.montant))}`,
      donnees: { [type === 'bien' ? 'bien_id' : 'site_id']: id, categorie: f.categorie, montant: f.montant, date_depense: f.date_depense, note: f.note },
    });
  }, (r) => (r.enAttente ? setGardee(true) : onFermer()));
  if (gardee) return (
    <Modale titre="Dépense gardée sur l’appareil" onFermer={onFermer} actions={<button className="bouton principal" onClick={onFermer}>Compris</button>}>
      <div className="info">Pas de réseau : la dépense et sa photo partiront automatiquement dès le retour de la connexion.</div>
    </Modale>
  );
  return (
    <Modale titre="Noter une dépense" onFermer={onFermer} actions={<>
      <button className="bouton" onClick={onFermer}>Annuler</button>
      <button className="bouton principal" disabled={!f.cible || !Number(f.montant) || envoi.isPending} onClick={() => envoi.mutate()}>{envoi.isPending ? 'Envoi…' : 'Envoyer'}</button>
    </>}>
      <Erreur message={envoi.error && messageErreur(envoi.error)} />
      <div className="grille-form">
        <Champ label="Pour" plein>
          <select value={f.cible} onChange={e => setF({ ...f, cible: e.target.value })}>
            <option value="">Choisir…</option>
            <optgroup label="Tout un site">{sites.map(s => <option key={s.id} value={'site:' + s.id}>{s.nom}</option>)}</optgroup>
            <optgroup label="Un bien">{biens.map(b => <option key={b.id} value={'bien:' + b.id}>{b.Site?.nom} · {b.reference}</option>)}</optgroup>
          </select>
        </Champ>
        <Champ label="Catégorie"><select value={f.categorie} onChange={e => setF({ ...f, categorie: e.target.value })}>{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></Champ>
        <Champ label="Montant (FCFA)"><input value={f.montant} onChange={e => setF({ ...f, montant: e.target.value.replace(/\D/g, '') })} inputMode="numeric" /></Champ>
        <Champ label="Date"><input type="date" value={f.date_depense} onChange={e => setF({ ...f, date_depense: e.target.value })} /></Champ>
        <Champ label="Photo du reçu"><input type="file" accept="image/*,application/pdf" capture="environment" onChange={async e => setFichier(await compresserImage(e.target.files[0] || null))} /></Champ>
        {apercu && <img src={apercu} alt="Aperçu du justificatif" className="plein" style={{ maxHeight: 180, objectFit: 'contain', borderRadius: 12, background: 'var(--champ)' }} />}
        <Champ label="Note" plein><input value={f.note} onChange={e => setF({ ...f, note: e.target.value })} /></Champ>
      </div>
    </Modale>
  );
}
