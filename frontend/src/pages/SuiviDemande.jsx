// Suivi d'une demande par le client, avec son code (sans compte).
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { MessageCircle, Phone } from 'lucide-react';
import { api, messageErreur } from '../lib/api';
import { dateCourte, fcfa } from '../lib/format';
import { ouvrirWhatsApp } from '../lib/partage';
import { EnteteMarche, titreVilla } from './Villas';
import '../styles/marche.css';

const ETATS = {
  en_attente: ['En attente', 'Le gérant n’a pas encore répondu. Revenez un peu plus tard.'],
  acceptee: ['Confirmée', 'Votre séjour est confirmé. Contactez le gérant pour organiser votre arrivée ; le paiement se fait sur place.'],
  refusee: ['Non disponible', 'Le gérant n’a pas pu accepter votre demande.'],
  annulee: ['Annulée', 'Cette demande a été annulée.'],
};

export default function SuiviDemande() {
  const { code } = useParams();
  const { data: d, isLoading, error } = useQuery({ queryKey: ['public', 'demande', code], queryFn: () => api.get('/public/demandes/' + code).then(r => r.data), refetchInterval: 30000 });
  return (
    <div className="marche"><EnteteMarche />
      <main className="mc-resultats mc-etroit">
        {isLoading && <p className="mc-note">Chargement…</p>}
        {error && <div className="mc-alerte">{messageErreur(error)}</div>}
        {d && (
          <div className="mc-suivi">
            <span className={'mc-statut ' + d.statut}>{ETATS[d.statut][0]}</span>
            <h1>{titreVilla(d.villa)}</h1>
            <p className="mc-lieu">{[d.villa.lieu.quartier, d.villa.lieu.ville].filter(Boolean).join(', ')}</p>
            <div className="mc-total"><span>Du {dateCourte(d.arrivee)} au {dateCourte(d.depart)} · {d.nuits} nuit{d.nuits > 1 ? 's' : ''}</span><b>{fcfa(d.total)}</b></div>
            <p>{ETATS[d.statut][1]}{d.motif_refus ? ` Motif : ${d.motif_refus}.` : ''}</p>
            {d.contact && (
              <div className="mc-contact"><b>{d.contact.nom}</b>
                {d.contact.telephone && <div className="mc-actions">
                  <a className="mc-bouton" href={`tel:${d.contact.telephone.replace(/\s/g, '')}`}><Phone size={18} />Appeler</a>
                  <button type="button" className="mc-bouton clair" onClick={() => ouvrirWhatsApp(d.contact.telephone, `Bonjour, c’est ${d.nom}. Ma réservation ${d.code} du ${dateCourte(d.arrivee)} est confirmée : je vous écris pour organiser mon arrivée.`)}><MessageCircle size={18} />WhatsApp</button>
                </div>}
              </div>
            )}
            <p className="mc-note">Code de suivi : <b>{d.code}</b></p>
            {d.statut === 'refusee' && <Link to="/villas" className="mc-bouton clair">Chercher une autre villa</Link>}
          </div>
        )}
      </main>
    </div>
  );
}
