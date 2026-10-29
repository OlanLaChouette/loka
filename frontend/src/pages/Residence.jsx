// Page publique d'une résidence (loka.eyamtech.com/r/<page>) : la vitrine que le bailleur partage sur Facebook et WhatsApp.
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, messageErreur, urlFichier } from '../lib/api';
import { CarteVilla, EnteteMarche, Etoiles } from './Villas';
import '../styles/marche.css';

export default function Residence() {
  const { page } = useParams();
  const { data: r, isPending: isLoading, error } = useQuery({ queryKey: ['public', 'residence', page], queryFn: () => api.get('/public/residences/' + page).then(x => x.data) });
  return (
    <div className="marche">
      <EnteteMarche />
      {isLoading && <p className="mc-note" style={{ padding: 24 }}>Chargement…</p>}
      {error && <main className="mc-resultats"><div className="mc-alerte">{messageErreur(error)}</div><Link to="/villas" className="mc-bouton clair">Voir toutes les villas</Link></main>}
      {r && <>
        <section className="mc-heros mc-residence">
          {r.logo && <img className="mc-logo-residence" src={urlFichier(r.logo)} alt="" />}
          <h1>{r.nom}</h1>
          <p className="mc-etoiles-heros"><Etoiles b={r} grand /></p>
          <p>{[r.ville, `${r.villas.length} villa${r.villas.length > 1 ? 's' : ''} à louer`].filter(Boolean).join(' · ')} · réservation confirmée par le gérant, paiement sur place.</p>
        </section>
        <main className="mc-resultats">
          <div className="mc-grille">{r.villas.map(v => <CarteVilla key={v.id} v={v} criteres={{}} />)}</div>
          {!r.villas.length && <div className="mc-vide">Aucune villa n’est proposée pour le moment.</div>}
        </main>
      </>}
      <footer className="mc-pied">Page propulsée par <Link to="/villas">Loka Villas</Link> · trouvez d’autres villas libres près de chez vous</footer>
    </div>
  );
}
