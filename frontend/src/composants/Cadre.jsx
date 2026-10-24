import { useEffect, useRef, useState } from 'react';
import { Navigate, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Bell, Check, ChevronDown, LayoutGrid, LogOut, Moon, Receipt, CalendarDays, Sun, Wallet, Shield, RefreshCw, WifiOff } from 'lucide-react';
import { useSession } from '../lib/session';
import { api } from '../lib/api';
import { Avatar, Chargement, Modale } from './Ui';
import { abandonner, suivre, synchroniser } from '../lib/horsLigne';
import { ROLES } from '../lib/format';

const ONGLETS = [
  { a: '/', label: 'Aperçu', roles: ['proprietaire', 'comptable'] },
  { a: '/terrain', label: 'Aujourd’hui', roles: ['gerant'] },
  { a: '/biens', label: 'Biens' },
  { a: '/reservations', label: 'Réservations' },
  { a: '/baux', label: 'Baux' },
  { a: '/argent', label: 'Argent' },
  { a: '/membres', label: 'Gérants', roles: ['proprietaire'] },
  { a: '/parametres', label: 'Entreprise', roles: ['proprietaire'] },
];

function useClicDehors(ref, fermer) {
  useEffect(() => {
    const f = (e) => { if (ref.current && !ref.current.contains(e.target)) fermer(); };
    document.addEventListener('mousedown', f);
    return () => document.removeEventListener('mousedown', f);
  }, [ref, fermer]);
}

function SelecteurEspace() {
  const { espace, espaces, changerEspace } = useSession();
  const [ouvert, setOuvert] = useState(false);
  const ref = useRef(null);
  const nav = useNavigate();
  useClicDehors(ref, () => setOuvert(false));
  if (!espace) return null;
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button type="button" className="bouton" style={{ borderRadius: 30, padding: '4px 12px 4px 4px', background: 'var(--champ)' }} onClick={() => setOuvert(o => !o)} aria-expanded={ouvert} aria-haspopup="listbox">
        <Avatar nom={espace.nom} logo={espace.logo} taille={28} />
        <span style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{espace.nom}</span>
        <ChevronDown size={14} className="muet" />
      </button>
      {ouvert && (
        <div className="menu" role="listbox" aria-label="Changer d’espace">
          <div className="petit muet" style={{ padding: '6px 10px', fontWeight: 600 }}>Vos espaces</div>
          {espaces.map(e => (
            <button key={e.id} type="button" role="option" aria-selected={e.id === espace.id} onClick={() => { changerEspace(e.id); setOuvert(false); nav(e.role === 'gerant' ? '/terrain' : '/'); }}>
              <Avatar nom={e.nom} logo={e.logo} taille={30} />
              <span style={{ flex: 1 }}><b style={{ display: 'block', fontWeight: 600 }}>{e.nom}</b><span className="petit muet">{ROLES[e.role]}</span></span>
              {e.id === espace.id && <Check size={16} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function MenuCompte() {
  const { utilisateur, deconnecter, role } = useSession();
  const [ouvert, setOuvert] = useState(false);
  const ref = useRef(null);
  useClicDehors(ref, () => setOuvert(false));
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button type="button" className="bouton-rond" style={{ border: 0, padding: 0 }} onClick={() => setOuvert(o => !o)} aria-label="Mon compte" aria-expanded={ouvert}>
        <Avatar nom={utilisateur.nom} taille={38} />
      </button>
      {ouvert && (
        <div className="menu" style={{ right: 0 }}>
          <div style={{ padding: '8px 10px' }}><b>{utilisateur.nom}</b><div className="petit muet">{ROLES[role] || ''} · {utilisateur.telephone}</div></div>
          {utilisateur.est_admin_plateforme && <NavLink to="/plateforme" onClick={() => setOuvert(false)}><Shield size={16} />Administration Loka</NavLink>}
          <button type="button" onClick={deconnecter}><LogOut size={16} />Se déconnecter</button>
        </div>
      )}
    </div>
  );
}

// Envois gardés sur l'appareil faute de réseau.
function FileAttente() {
  const [liste, setListe] = useState([]);
  const [ouvert, setOuvert] = useState(false);
  const [enLigne, setEnLigne] = useState(navigator.onLine);
  useEffect(() => suivre(setListe), []);
  useEffect(() => {
    const maj = () => setEnLigne(navigator.onLine);
    window.addEventListener('online', maj); window.addEventListener('offline', maj);
    return () => { window.removeEventListener('online', maj); window.removeEventListener('offline', maj); };
  }, []);
  if (!liste.length && enLigne) return null;
  return (
    <>
      <button type="button" className={'puce ' + (liste.some(e => e.erreur) ? 'negatif' : 'alerte')} style={{ border: 0, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => setOuvert(true)}>
        {enLigne ? <RefreshCw size={13} /> : <WifiOff size={13} />}
        {!enLigne && !liste.length ? 'Hors connexion' : `${liste.length} en attente d’envoi`}
      </button>
      {ouvert && (
        <Modale titre="Envois en attente" onFermer={() => setOuvert(false)} actions={<button className="bouton principal" disabled={!enLigne} onClick={synchroniser}>Envoyer maintenant</button>}>
          {!enLigne && <div className="info">Pas de réseau pour l’instant. Tout partira automatiquement au retour de la connexion.</div>}
          <div className="liste-lignes">
            {liste.map(e => (
              <div key={e.cle} style={{ flexWrap: 'wrap' }}>
                <span style={{ flex: 1 }}><b>{e.libelle}</b><div className="petit muet">{new Date(e.cree_le).toLocaleString('fr-FR')}</div>{e.erreur && <div className="petit" style={{ color: 'var(--negatif)' }}>{e.erreur}</div>}</span>
                {e.erreur && <button className="bouton discret danger" onClick={() => abandonner(e.cle)}>Abandonner</button>}
              </div>
            ))}
            {!liste.length && <span className="muet">Rien en attente.</span>}
          </div>
        </Modale>
      )}
    </>
  );
}

export default function Cadre() {
  const { pret, role, utilisateur, basculerTheme, espace } = useSession();
  const sombre = utilisateur?.theme === 'sombre';
  const { data: tableau } = useQuery({ queryKey: ['tableau', 'alertes'], queryFn: () => api.get('/tableau-de-bord').then(r => r.data), enabled: role === 'proprietaire', refetchInterval: 60000 });
  const aTraiter = tableau ? tableau.a_traiter.depenses + tableau.a_traiter.reductions : 0;
  const nav = useNavigate();
  const onglets = ONGLETS.filter(o => !o.roles || o.roles.includes(role));
  if (!pret) return <Chargement />;
  if (!utilisateur) return <Navigate to="/connexion" replace />;

  return (
    <>
      <header className="entete">
        <NavLink to={role === 'gerant' ? '/terrain' : '/'} className="marque"><img src="/logo.svg" width="28" height="28" alt="" />Loka</NavLink>
        <SelecteurEspace />
        <nav className="onglets" aria-label="Navigation principale">
          {espace && onglets.map(o => <NavLink key={o.a} to={o.a} end={o.a === '/'} className={({ isActive }) => 'onglet' + (isActive ? ' actif' : '')}>{o.label}</NavLink>)}
        </nav>
        <FileAttente />
        <button type="button" className="bouton-rond" onClick={basculerTheme} aria-label={sombre ? 'Passer en mode clair' : 'Passer en mode sombre'} title={sombre ? 'Mode clair' : 'Mode sombre'}>
          {sombre ? <Sun size={18} /> : <Moon size={18} />}
        </button>
        {role === 'proprietaire' && (
          <button type="button" className="bouton-rond" aria-label={`${aTraiter} élément(s) à traiter`} onClick={() => nav('/argent?onglet=depenses')}>
            <Bell size={18} />{aTraiter > 0 && <span className="pastille-alerte">{aTraiter}</span>}
          </button>
        )}
        <MenuCompte />
      </header>
      {espace?.statut === 'suspendu' && <div className="erreur" style={{ borderRadius: 0, textAlign: 'center' }}>Cet espace est suspendu : consultation seulement. Contactez Loka pour régulariser.</div>}
      <Outlet />
      {espace && (
        <nav className="barre-bas" aria-label="Navigation mobile">
          <NavLink to={role === 'gerant' ? '/terrain' : '/'} end className={({ isActive }) => isActive ? 'actif' : ''}><LayoutGrid size={22} />Accueil</NavLink>
          <NavLink to="/reservations" className={({ isActive }) => isActive ? 'actif' : ''}><CalendarDays size={22} />Planning</NavLink>
          <NavLink to="/argent" className={({ isActive }) => isActive ? 'actif' : ''}><Wallet size={22} />Caisse</NavLink>
          <NavLink to="/argent?onglet=depenses" className={({ isActive }) => isActive ? 'actif' : ''}><Receipt size={22} />Dépenses</NavLink>
        </nav>
      )}
    </>
  );
}
