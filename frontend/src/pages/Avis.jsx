// Avis d'un client après son séjour (lien envoyé par le gérant au départ) : une note de 1 à 5 et un commentaire.
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import { api, messageErreur } from '../lib/api';
import { dateCourte } from '../lib/format';
import { EnteteMarche, titreVilla } from './Villas';
import '../styles/marche.css';

const MOTS = ['', 'Très déçu', 'Déçu', 'Correct', 'Bien', 'Excellent'];

export default function Avis() {
  const { code } = useParams();
  const { data: s, isPending: isLoading, error } = useQuery({ queryKey: ['public', 'avis', code], queryFn: () => api.get('/public/avis/' + code).then(r => r.data) });
  const [f, setF] = useState({ note: 0, commentaire: '', auteur: '' });
  const envoi = useMutation({ mutationFn: () => api.post('/public/avis/' + code, f) });
  return (
    <div className="marche"><EnteteMarche />
      <main className="mc-resultats mc-etroit">
        {isLoading && <p className="mc-note">Chargement…</p>}
        {error && <div className="mc-alerte">{messageErreur(error)}</div>}
        {s && (envoi.isSuccess || s.deja ? (
          <div className="mc-succes"><span className="mc-coche"><Check size={34} /></span><h1>Merci pour votre avis !</h1><p>Il aide les autres clients à bien choisir.</p><Link to="/villas" className="mc-bouton clair">Voir d’autres villas</Link></div>
        ) : (
          <form className="mc-suivi" onSubmit={(e) => { e.preventDefault(); envoi.mutate(); }}>
            <h1>Votre séjour chez {s.bailleur}</h1>
            <p className="mc-lieu" style={{ justifyContent: 'center' }}>{titreVilla(s.villa)} · du {dateCourte(s.arrivee)} au {dateCourte(s.depart)}</p>
            <div className="mc-note-etoiles" role="radiogroup" aria-label="Votre note">
              {[1, 2, 3, 4, 5].map(n => <button key={n} type="button" role="radio" aria-checked={f.note === n} aria-label={`${n} étoile${n > 1 ? 's' : ''}`} className={n <= f.note ? 'actif' : ''} onClick={() => setF({ ...f, note: n })}>★</button>)}
            </div>
            <b>{MOTS[f.note] || 'Touchez les étoiles'}</b>
            <label><span>Votre commentaire (facultatif)</span><textarea rows={3} value={f.commentaire} onChange={e => setF({ ...f, commentaire: e.target.value })} placeholder="Propreté, accueil, confort…" /></label>
            <label><span>Votre prénom (facultatif)</span><input value={f.auteur} onChange={e => setF({ ...f, auteur: e.target.value })} /></label>
            {envoi.error && <div className="mc-alerte">{messageErreur(envoi.error)}</div>}
            <button type="submit" className="mc-bouton" disabled={!f.note || envoi.isPending}>Envoyer mon avis</button>
            <p className="mc-note">Seuls les clients ayant réellement séjourné peuvent noter : les avis sont vérifiés.</p>
          </form>
        ))}
      </main>
    </div>
  );
}
