// Fiche publique d'une villa : photos, équipements, nuits déjà prises, et demande de réservation.
import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowLeft, BedDouble, Check, MapPin, Users } from 'lucide-react';
import { api, messageErreur, urlFichier } from '../lib/api';
import { ajouterJours, aujourdhui, dateCourte, EQUIPEMENTS, fcfa } from '../lib/format';
import { EnteteMarche, Etoiles, lieuVilla, titreVilla } from './Villas';
import '../styles/marche.css';

export default function VillaDetail() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const { data: v, isPending: isLoading, error } = useQuery({ queryKey: ['public', 'villa', id], queryFn: () => api.get('/public/biens/' + id).then(r => r.data) });
  const [f, setF] = useState({ arrivee: params.get('arrivee') || '', depart: params.get('depart') || '', nom: '', telephone: '', message: '' });
  const [envoye, setEnvoye] = useState(null);
  const demande = useMutation({ mutationFn: () => api.post('/public/demandes', { bien_id: id, ...f }).then(r => r.data), onSuccess: setEnvoye });
  const maj = (k) => (e) => setF({ ...f, [k]: e.target.value });

  if (isLoading) return <div className="marche"><EnteteMarche /><p className="mc-note" style={{ padding: 24 }}>Chargement…</p></div>;
  if (error) return <div className="marche"><EnteteMarche /><div className="mc-resultats"><div className="mc-alerte">{messageErreur(error)}</div><Link to="/villas" className="mc-bouton clair">Voir les autres villas</Link></div></div>;

  const nuits = f.arrivee && f.depart ? Math.max(0, Math.round((new Date(f.depart) - new Date(f.arrivee)) / 864e5)) : 0;
  const chevauche = nuits > 0 && v.indisponible.some(p => p.du < f.depart && p.au > f.arrivee);

  if (envoye) return (
    <div className="marche"><EnteteMarche />
      <main className="mc-resultats mc-etroit">
        <div className="mc-succes">
          <span className="mc-coche"><Check size={34} /></span>
          <h1>Demande envoyée !</h1>
          <p>Le gérant de <b>{v.bailleur.nom}</b> va vous répondre. Une fois la demande acceptée, vous aurez <b>2 heures</b> pour envoyer l’acompte ({v.regles?.acompte_pourcent ?? 50} %) par Mobile Money ; le reste se paie à l’arrivée.</p>
          <div className="mc-code">Votre code de suivi<b>{envoye.code}</b></div>
          <Link to={`/demande/${envoye.code}`} className="mc-bouton">Suivre ma demande</Link>
          <p className="mc-note">Gardez ce code (une capture d’écran suffit) pour revenir voir la réponse.</p>
        </div>
      </main>
    </div>
  );

  return (
    <div className="marche"><EnteteMarche />
      <main className="mc-resultats mc-etroit">
        <Link to={-1} className="mc-retour" onClick={(e) => { e.preventDefault(); window.history.length > 1 ? window.history.back() : (window.location.href = '/villas'); }}><ArrowLeft size={18} />Retour aux résultats</Link>
        <div className="mc-galerie">
          {v.photos.length ? v.photos.map((p, i) => <img key={p} src={urlFichier(p)} alt={`Photo ${i + 1}`} />) : <div className="mc-sans-photo grande">Photos bientôt disponibles</div>}
        </div>
        <h1 className="mc-titre">{titreVilla(v)}</h1>
        <p className="mc-lieu"><MapPin size={16} />{lieuVilla(v)} · proposée par <b>{v.bailleur.nom}</b></p>
        <p style={{ margin: '4px 0' }}><Etoiles b={v.bailleur} grand /></p>
        <p className="mc-details grand">{v.capacite ? <><Users size={16} />{v.capacite} personnes</> : null}{v.chambres ? <><BedDouble size={16} />{v.chambres} chambres</> : null}</p>
        <p className="mc-prix grand"><b>{fcfa(v.prix_nuit)}</b> / nuit</p>
        {v.description && <p className="mc-description">{v.description}</p>}
        {v.equipements.length > 0 && <ul className="mc-liste-eq">{v.equipements.map(e => <li key={e}><Check size={16} />{EQUIPEMENTS[e]}</li>)}</ul>}
        {v.regles && (
          <div className="mc-regles">
            <b>Conditions de séjour</b>
            <span>Arrivée à partir de <b>{v.regles.heure_arrivee}</b> · départ avant <b>{v.regles.heure_depart}</b> (au-delà, une nuit de plus est due)</span>
            <span>Acompte de <b>{v.regles.acompte_pourcent} %</b> avant la remise des clés, par Mobile Money ou sur place</span>
            <span>Annulation gratuite jusqu’à <b>{v.regles.delai_annulation_heures} h</b> avant l’arrivée ; ensuite, {v.regles.penalite_nuits} nuit{v.regles.penalite_nuits > 1 ? 's' : ''} retenue{v.regles.penalite_nuits > 1 ? 's' : ''}, le reste est remboursé</span>
          </div>
        )}
        {v.avis?.length > 0 && (
          <div className="mc-avis">
            <b>Avis des clients sur {v.bailleur.nom}</b>
            {v.avis.map((a, i) => <div key={i} className="mc-un-avis"><span className="mc-etoiles">{'★'.repeat(a.note)}<span style={{ opacity: .25 }}>{'★'.repeat(5 - a.note)}</span></span>{a.commentaire && <p>« {a.commentaire} »</p>}<span className="mc-note">{a.auteur || 'Client'} · {dateCourte(a.cree_le.slice(0, 10))}</span></div>)}
          </div>
        )}
        {v.indisponible.length > 0 && (
          <div className="mc-indispo"><b>Déjà réservée</b>{v.indisponible.map(p => <span key={p.du}>{dateCourte(p.du)} → {dateCourte(p.au)}</span>)}</div>
        )}

        <form className="mc-demande" onSubmit={(e) => { e.preventDefault(); demande.mutate(); }}>
          <h2>Demander cette villa</h2>
          {demande.error && <div className="mc-alerte">{messageErreur(demande.error)}</div>}
          <div className="mc-dates">
            <label><span>Arrivée</span><input type="date" min={aujourdhui()} value={f.arrivee} onChange={e => setF({ ...f, arrivee: e.target.value, depart: f.depart && f.depart > e.target.value ? f.depart : ajouterJours(e.target.value, 1) })} required /></label>
            <label><span>Départ</span><input type="date" min={f.arrivee ? ajouterJours(f.arrivee, 1) : aujourdhui()} value={f.depart} onChange={maj('depart')} required /></label>
          </div>
          {chevauche && <div className="mc-alerte">Ces dates chevauchent une réservation existante : choisissez d’autres dates.</div>}
          <label><span>Votre nom</span><input value={f.nom} onChange={maj('nom')} autoComplete="name" required /></label>
          <label><span>Votre téléphone (WhatsApp)</span><input value={f.telephone} onChange={maj('telephone')} inputMode="tel" autoComplete="tel" required /></label>
          <label><span>Message (facultatif)</span><textarea rows={2} value={f.message} onChange={maj('message')} placeholder="Heure d’arrivée, nombre de personnes…" /></label>
          {nuits > 0 && <div className="mc-total"><span>{nuits} nuit{nuits > 1 ? 's' : ''} × {fcfa(v.prix_nuit)}</span><b>{fcfa(nuits * v.prix_nuit)}</b></div>}
          <button type="submit" className="mc-bouton" disabled={!nuits || chevauche || !f.nom || !f.telephone || demande.isPending}>{demande.isPending ? 'Envoi…' : 'Envoyer ma demande'}</button>
          <p className="mc-note">Sans engagement : rien à payer tant que le gérant n’a pas accepté. Ensuite, acompte de {v.regles?.acompte_pourcent ?? 50} % par Mobile Money dans les 2 heures.</p>
        </form>
      </main>
    </div>
  );
}
