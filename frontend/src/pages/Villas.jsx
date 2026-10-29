// Place de marché : un client cherche une villa selon SES critères (lieu, dates, budget, équipements),
// parmi tous les bailleurs qui publient sur Loka. Disponibilités réelles, tirées des plannings.
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { BedDouble, LocateFixed, MapPin, Search, SlidersHorizontal, Star, Users } from 'lucide-react';
import { api, messageErreur, urlFichier } from '../lib/api';
import { ajouterJours, aujourdhui, dateCourte, EQUIPEMENTS, fcfa, TYPES_BIEN } from '../lib/format';
import '../styles/marche.css';

export function EnteteMarche() {
  return (
    <header className="mc-entete">
      <Link to="/villas" className="mc-marque"><img src="/logo.svg" width="30" height="30" alt="" />Loka <span>Villas</span></Link>
      <Link to="/bienvenue" className="mc-lien-bailleur">Vous êtes bailleur ?</Link>
    </header>
  );
}

// Note du bailleur : étoiles et nombre d'avis (« Nouveau » tant qu'il n'a pas d'avis).
export function Etoiles({ b, grand }) {
  if (!b) return null;
  if (!b.avis) return <span className={'mc-etoiles' + (grand ? ' grand' : '')}><Star size={grand ? 16 : 13} />Nouveau sur Loka</span>;
  return <span className={'mc-etoiles' + (grand ? ' grand' : '')} aria-label={`${b.note} sur 5, ${b.avis} avis`}><Star size={grand ? 16 : 13} fill="currentColor" /><b>{String(b.note).replace('.', ',')}</b> ({b.avis} avis){b.fiabilite < 100 ? ` · fiabilité ${b.fiabilite} %` : ''}</span>;
}

export const titreVilla = (v) => [TYPES_BIEN[v.type] || 'Villa', v.standing, v.chambres ? `${v.chambres} ch.` : ''].filter(Boolean).join(' · ');
export const lieuVilla = (v) => [v.lieu.quartier, v.lieu.ville].filter(Boolean).join(', ');

export function CarteVilla({ v, criteres }) {
  const nav = useNavigate();
  const suite = new URLSearchParams(Object.entries(criteres).filter(([k, x]) => x && ['arrivee', 'depart', 'personnes'].includes(k))).toString();
  return (
    <button type="button" className="mc-carte" onClick={() => nav(`/villas/${v.id}${suite ? '?' + suite : ''}`)}>
      <div className="mc-photo">
        {v.photos[0] ? <img src={urlFichier(v.photos[0])} alt="" loading="lazy" /> : <span className="mc-sans-photo">Photos bientôt</span>}
        {v.distance_km != null && <span className="mc-distance"><MapPin size={13} />{String(v.distance_km).replace('.', ',')} km</span>}
      </div>
      <div className="mc-corps">
        <b>{titreVilla(v)}</b>
        <span className="mc-lieu">{lieuVilla(v)}</span>
        <span className="mc-bailleur">{v.bailleur.nom} · <Etoiles b={v.bailleur} /></span>
        <span className="mc-details">{v.capacite ? <><Users size={14} />{v.capacite} pers.</> : null}{v.chambres ? <><BedDouble size={14} />{v.chambres} ch.</> : null}{v.equipements.slice(0, 3).map(e => <i key={e}>{EQUIPEMENTS[e]}</i>)}</span>
        <span className="mc-prix"><b>{fcfa(v.prix_nuit)}</b> / nuit{v.total ? <em> · {fcfa(v.total)} pour {v.nuits} nuit{v.nuits > 1 ? 's' : ''}</em> : null}</span>
      </div>
    </button>
  );
}

export default function Villas() {
  const [params, setParams] = useSearchParams();
  const lire = (k, d = '') => params.get(k) || d;
  const [f, setF] = useState({ ville: lire('ville'), quartier: lire('quartier'), arrivee: lire('arrivee'), depart: lire('depart'), personnes: lire('personnes'), budget: lire('budget'), equipements: lire('equipements') ? lire('equipements').split(',') : [], lat: lire('lat'), lng: lire('lng') });
  const [filtres, setFiltres] = useState(false);
  const [position, setPosition] = useState('');
  const criteres = Object.fromEntries([...params.entries()]);
  const { data: lieux = [] } = useQuery({ queryKey: ['public', 'lieux'], queryFn: () => api.get('/public/lieux').then(r => r.data), staleTime: 300000 });
  const { data: villas, isPending: isLoading, error } = useQuery({ queryKey: ['public', 'recherche', criteres], queryFn: () => api.get('/public/recherche', { params: criteres }).then(r => r.data) });
  const quartiers = lieux.find(l => l.ville === f.ville)?.quartiers || [];
  const maj = (k) => (e) => setF({ ...f, [k]: e.target.value });

  function chercher(extra = {}) {
    const v = { ...f, ...extra };
    const p = Object.fromEntries(Object.entries({ ...v, equipements: v.equipements.join(',') }).filter(([, x]) => x));
    setParams(p);
    setFiltres(false);
  }
  function autourDeMoi() {
    if (!navigator.geolocation) return setPosition('Position indisponible sur cet appareil.');
    setPosition('Recherche de votre position…');
    navigator.geolocation.getCurrentPosition(
      (p) => { setPosition(''); const coords = { lat: p.coords.latitude.toFixed(4), lng: p.coords.longitude.toFixed(4), ville: '', quartier: '' }; setF({ ...f, ...coords }); chercher(coords); },
      () => setPosition('Position refusée : choisissez plutôt une ville.'),
      { enableHighAccuracy: false, timeout: 10000 },
    );
  }
  const basculer = (e) => setF({ ...f, equipements: f.equipements.includes(e) ? f.equipements.filter(x => x !== e) : [...f.equipements, e] });

  return (
    <div className="marche">
      <EnteteMarche />
      <section className="mc-heros">
        <h1>Trouvez la villa <em>libre</em> qu’il vous faut.</h1>
        <p>Villas meublées de plusieurs propriétaires, avec leurs vraies disponibilités. Réservation confirmée par le gérant, paiement sur place.</p>
        <form className="mc-recherche" onSubmit={(e) => { e.preventDefault(); chercher({ lat: '', lng: '' }); }}>
          <label><span>Ville</span>
            <select value={f.ville} onChange={e => setF({ ...f, ville: e.target.value, quartier: '' })}>
              <option value="">Toutes les villes</option>
              {lieux.map(l => <option key={l.ville}>{l.ville}</option>)}
            </select>
          </label>
          {quartiers.length > 0 && <label><span>Quartier</span>
            <select value={f.quartier} onChange={maj('quartier')}><option value="">Tous</option>{quartiers.map(q => <option key={q}>{q}</option>)}</select>
          </label>}
          <div className="mc-dates">
            <label><span>Arrivée</span><input type="date" min={aujourdhui()} value={f.arrivee} onChange={e => setF({ ...f, arrivee: e.target.value, depart: f.depart && f.depart > e.target.value ? f.depart : ajouterJours(e.target.value, 1) })} /></label>
            <label><span>Départ</span><input type="date" min={f.arrivee ? ajouterJours(f.arrivee, 1) : aujourdhui()} value={f.depart} onChange={maj('depart')} /></label>
          </div>
          {filtres && <>
            <div className="mc-dates">
              <label><span>Personnes</span><input inputMode="numeric" value={f.personnes} onChange={e => setF({ ...f, personnes: e.target.value.replace(/\D/g, '') })} placeholder="2" /></label>
              <label><span>Budget max / nuit</span><input inputMode="numeric" value={f.budget} onChange={e => setF({ ...f, budget: e.target.value.replace(/\D/g, '') })} placeholder="30000" /></label>
            </div>
            <div className="mc-equipements">{Object.entries(EQUIPEMENTS).map(([k, v]) => <button key={k} type="button" className={f.equipements.includes(k) ? 'actif' : ''} onClick={() => basculer(k)}>{v}</button>)}</div>
          </>}
          <div className="mc-actions">
            <button type="submit" className="mc-bouton"><Search size={18} />Rechercher</button>
            <button type="button" className="mc-bouton clair" onClick={autourDeMoi}><LocateFixed size={18} />Autour de moi</button>
            <button type="button" className="mc-bouton discret" onClick={() => setFiltres(!filtres)} aria-expanded={filtres}><SlidersHorizontal size={18} />{filtres ? 'Moins de critères' : 'Plus de critères'}</button>
          </div>
          {position && <p className="mc-note">{position}</p>}
        </form>
      </section>

      <main className="mc-resultats">
        {error && <div className="mc-alerte">{messageErreur(error)}</div>}
        {isLoading ? <p className="mc-note">Recherche des villas libres…</p> : villas && (
          <>
            <p className="mc-compte">{villas.length} villa{villas.length > 1 ? 's' : ''}{criteres.arrivee && criteres.depart ? ` libre${villas.length > 1 ? 's' : ''} du ${dateCourte(criteres.arrivee)} au ${dateCourte(criteres.depart)}` : ''}{criteres.lat ? ' autour de vous' : criteres.ville ? ` à ${criteres.quartier ? criteres.quartier + ', ' : ''}${criteres.ville}` : ''}</p>
            <div className="mc-grille">{villas.map(v => <CarteVilla key={v.id} v={v} criteres={criteres} />)}</div>
            {!villas.length && <div className="mc-vide">Aucune villa ne correspond. Essayez d’autres dates, un autre quartier ou moins de critères.</div>}
          </>
        )}
      </main>
      <footer className="mc-pied">Loka · par eYamTech · <Link to="/bienvenue">Vous louez des villas ? Gérez-les avec Loka</Link></footer>
    </div>
  );
}
