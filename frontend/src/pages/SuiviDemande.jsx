// Suivi d'une demande par le client, avec son code (sans compte) : réponse du gérant, acompte Mobile Money à envoyer
// dans le délai (puis saisie de la référence), annulation selon les règles, et avis après le séjour.
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageCircle, Phone, Star } from 'lucide-react';
import { api, messageErreur } from '../lib/api';
import { dateCourte, fcfa } from '../lib/format';
import { ouvrirWhatsApp } from '../lib/partage';
import { EnteteMarche, titreVilla } from './Villas';
import '../styles/marche.css';

const ETATS = {
  en_attente: ['En attente', 'Le gérant n’a pas encore répondu. Revenez un peu plus tard.'],
  acceptee: ['Acceptée', ''],
  refusee: ['Non disponible', 'Le gérant n’a pas pu accepter votre demande.'],
  annulee: ['Annulée', 'Cette demande a été annulée.'],
  expiree: ['Expirée', 'L’acompte n’a pas été reçu dans le délai : les dates ont été libérées.'],
};
const TYPES = { gratuite: 'Annulation gratuite : tout ce que vous avez payé vous sera remboursé.', tardive: 'Annulation tardive', absence: 'Après l’heure d’arrivée' };
const heure = (d) => new Date(d).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

export default function SuiviDemande() {
  const { code } = useParams();
  const client = useQueryClient();
  const { data: d, isPending: isLoading, error } = useQuery({ queryKey: ['public', 'demande', code], queryFn: () => api.get('/public/demandes/' + code).then(r => r.data), refetchInterval: 30000 });
  const [reference, setReference] = useState('');
  const [annuler, setAnnuler] = useState(false);
  const recharger = () => client.invalidateQueries({ queryKey: ['public', 'demande', code] });
  const declarer = useMutation({ mutationFn: () => api.post(`/public/demandes/${code}/acompte`, { reference }), onSuccess: recharger });
  const { data: sim } = useQuery({ queryKey: ['public', 'annulation', code], queryFn: () => api.post(`/public/demandes/${code}/annuler`, { simulation: true }).then(r => r.data), enabled: annuler });
  const confirmerAnnulation = useMutation({ mutationFn: () => api.post(`/public/demandes/${code}/annuler`), onSuccess: () => { setAnnuler(false); recharger(); } });

  const p = d?.paiement;
  const s = d?.sejour;
  const actif = d && (d.statut === 'en_attente' || (d.statut === 'acceptee' && s?.statut === 'confirmee' && !s.cles));
  return (
    <div className="marche"><EnteteMarche />
      <main className="mc-resultats mc-etroit">
        {isLoading && <p className="mc-note">Chargement…</p>}
        {error && <div className="mc-alerte">{messageErreur(error)}</div>}
        {d && (
          <div className="mc-suivi">
            <span className={'mc-statut ' + (s?.statut === 'annulee' ? 'refusee' : d.statut)}>{s?.statut === 'annulee' && d.statut === 'annulee' ? 'Annulée' : ETATS[d.statut][0]}</span>
            <h1>{titreVilla(d.villa)}</h1>
            <p className="mc-lieu" style={{ justifyContent: 'center' }}>{[d.villa.lieu.quartier, d.villa.lieu.ville].filter(Boolean).join(', ')}</p>
            <div className="mc-total"><span>Du {dateCourte(d.arrivee)} au {dateCourte(d.depart)} · {d.nuits} nuit{d.nuits > 1 ? 's' : ''}</span><b>{fcfa(d.total)}</b></div>
            {ETATS[d.statut][1] && <p>{ETATS[d.statut][1]}{d.motif_refus ? ` Motif : ${d.motif_refus}.` : ''}</p>}

            {p && p.expire_le && (
              <div className="mc-paiement">
                <b>Garantissez votre séjour : envoyez l’acompte avant {heure(p.expire_le)}</b>
                <span>Montant : <b>{fcfa(p.acompte)}</b> ({d.regles.acompte_pourcent} %) · le reste ({fcfa(d.total - p.acompte)}) se paie à l’arrivée.</span>
                <span>Par Orange Money ou Moov Money au numéro :</span>
                <span className="mc-numero">{p.numero}</span>
                <span className="mc-note">Au nom de {p.titulaire}. Sans acompte à {heure(p.expire_le)}, les dates sont libérées pour d’autres clients.</span>
                {p.declare ? (
                  <div className="mc-alerte" style={{ background: '#E3F7EC', color: '#157A4A' }}>Référence {p.declare.reference} envoyée : le gérant vérifie la réception.</div>
                ) : (
                  <form onSubmit={(e) => { e.preventDefault(); declarer.mutate(); }} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {declarer.error && <div className="mc-alerte">{messageErreur(declarer.error)}</div>}
                    <label><span>Après l’envoi, la référence de la transaction (SMS de confirmation)</span><input value={reference} onChange={e => setReference(e.target.value)} placeholder="Ex. : PP241028.1532.C12345" /></label>
                    <button type="submit" className="mc-bouton" disabled={reference.trim().length < 4 || declarer.isPending}>J’ai envoyé l’acompte</button>
                  </form>
                )}
              </div>
            )}
            {p && !p.expire_le && p.paye > 0 && s?.statut === 'confirmee' && <div className="mc-alerte" style={{ background: '#E3F7EC', color: '#157A4A' }}>Acompte de {fcfa(p.paye)} reçu : votre séjour est garanti. Reste à payer à l’arrivée : {fcfa(p.reste)}.</div>}

            {s?.statut === 'annulee' && (
              <p>{s.annule_par === 'bailleur' ? 'Le bailleur a dû annuler : tout ce que vous avez payé vous est remboursé.' : s.annule_par === 'expiration' ? ETATS.expiree[1] : `Séjour annulé.${s.penalite ? ` Retenu : ${fcfa(s.penalite)}.` : ''}`}{s.a_rembourser ? ` Remboursement : ${fcfa(s.a_rembourser)}${s.rembourse ? ' (effectué).' : ' (en cours).'}` : ''}</p>
            )}

            {d.contact && s?.statut !== 'annulee' && (
              <div className="mc-contact"><b>{d.contact.nom}</b>
                <span className="mc-note">Arrivée à partir de {d.regles.heure_arrivee}, départ avant {d.regles.heure_depart}.</span>
                {d.contact.telephone && <div className="mc-actions">
                  <a className="mc-bouton" href={`tel:${d.contact.telephone.replace(/\s/g, '')}`}><Phone size={18} />Appeler</a>
                  <button type="button" className="mc-bouton clair" onClick={() => ouvrirWhatsApp(d.contact.telephone, `Bonjour, c’est ${d.nom}. Ma réservation ${d.code} du ${dateCourte(d.arrivee)} : je vous écris pour organiser mon arrivée.`)}><MessageCircle size={18} />WhatsApp</button>
                </div>}
              </div>
            )}

            {s?.avis && <Link to={`/avis/${s.avis}`} className="mc-bouton"><Star size={18} />Donner mon avis sur ce séjour</Link>}

            {actif && !annuler && <button type="button" className="mc-bouton discret" onClick={() => setAnnuler(true)}>Annuler ma demande</button>}
            {annuler && (
              <div className="mc-paiement" style={{ background: '#FFF1F3', borderColor: '#F2C2CB' }}>
                <b>Annuler ?</b>
                {sim ? <>
                  <span>{TYPES[sim.type]}</span>
                  {sim.penalite > 0 && <span>Retenu : <b>{fcfa(sim.penalite)}</b> ({d.regles.penalite_nuits} nuit). Remboursé : <b>{fcfa(sim.a_rembourser)}</b>.</span>}
                  {confirmerAnnulation.error && <div className="mc-alerte">{messageErreur(confirmerAnnulation.error)}</div>}
                  <div className="mc-actions"><button type="button" className="mc-bouton clair" onClick={() => setAnnuler(false)}>Garder ma réservation</button><button type="button" className="mc-bouton" style={{ background: '#C0392B' }} disabled={confirmerAnnulation.isPending} onClick={() => confirmerAnnulation.mutate()}>Confirmer l’annulation</button></div>
                </> : <span className="mc-note">Calcul…</span>}
              </div>
            )}

            <p className="mc-note">Code de suivi : <b>{d.code}</b></p>
            {['refusee', 'expiree', 'annulee'].includes(d.statut) && <Link to="/villas" className="mc-bouton clair">Chercher une autre villa</Link>}
          </div>
        )}
      </main>
    </div>
  );
}
