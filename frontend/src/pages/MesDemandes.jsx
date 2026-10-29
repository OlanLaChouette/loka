// « Mes demandes » : les demandes faites depuis ce téléphone, avec leur état à jour, et la recherche par code.
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQueries } from '@tanstack/react-query';
import { api } from '../lib/api';
import { dateCourte, fcfa } from '../lib/format';
import { mesDemandes, oublierDemande } from '../lib/mesDemandes';
import { EnteteMarche } from './Villas';
import '../styles/marche.css';

const LIBELLES = { en_attente: 'En attente', acceptee: 'Acceptée', refusee: 'Non disponible', annulee: 'Annulée', expiree: 'Expirée' };

export default function MesDemandes() {
  const nav = useNavigate();
  const [liste, setListe] = useState(mesDemandes);
  const [code, setCode] = useState('');
  const etats = useQueries({ queries: liste.map(d => ({ queryKey: ['public', 'demande', d.code], queryFn: () => api.get('/public/demandes/' + d.code).then(r => r.data), retry: false })) });
  return (
    <div className="marche"><EnteteMarche />
      <main className="mc-resultats mc-etroit">
        <h1 className="mc-titre" style={{ marginBottom: 12 }}>Mes demandes</h1>
        {liste.length ? (
          <div className="mc-liste-demandes">
            {liste.map((d, i) => {
              const e = etats[i]?.data;
              const statut = e ? (e.sejour?.statut === 'annulee' ? 'annulee' : e.statut) : null;
              const attenteAcompte = e?.paiement?.expire_le;
              return (
                <div key={d.code} className="mc-demande-ligne">
                  <Link to={`/demande/${d.code}`} className="mc-demande-lien">
                    <b>{d.titre}</b>
                    <span className="mc-lieu">{d.lieu}</span>
                    <span>Du {dateCourte(d.arrivee)} au {dateCourte(d.depart)}{e ? ` · ${fcfa(e.total)}` : ''}</span>
                    {statut && <span className={'mc-statut petit ' + (statut === 'annulee' || statut === 'expiree' ? 'refusee' : statut)}>{attenteAcompte ? 'Acceptée · acompte à envoyer' : LIBELLES[statut]}</span>}
                    {etats[i]?.isError && <span className="mc-note">Introuvable</span>}
                  </Link>
                  {(['refusee', 'annulee', 'expiree'].includes(statut) || etats[i]?.isError) && <button type="button" className="mc-bouton discret" onClick={() => { oublierDemande(d.code); setListe(mesDemandes()); }}>Retirer</button>}
                </div>
              );
            })}
          </div>
        ) : <div className="mc-vide">Aucune demande sur ce téléphone pour l’instant.</div>}
        <form className="mc-demande" onSubmit={(e) => { e.preventDefault(); if (code.trim()) nav('/demande/' + code.trim().toUpperCase()); }}>
          <h2>Vous avez un code de suivi ?</h2>
          <label><span>Code reçu après votre demande</span><input value={code} onChange={e => setCode(e.target.value)} placeholder="Ex. : E7ECF2BBF7" autoCapitalize="characters" /></label>
          <button type="submit" className="mc-bouton" disabled={code.trim().length < 6}>Retrouver ma demande</button>
        </form>
        <Link to="/villas" className="mc-bouton clair" style={{ marginTop: 14 }}>Chercher une villa</Link>
      </main>
    </div>
  );
}
