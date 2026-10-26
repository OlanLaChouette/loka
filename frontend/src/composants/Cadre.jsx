import { useEffect, useRef, useState } from 'react';
import { Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Capacitor } from '@capacitor/core';
import { Bell, Check, ChevronDown, KeyRound, LayoutGrid, LogOut, Menu, Moon, Receipt, CalendarDays, Sun, Wallet, Shield, RefreshCw, WifiOff, X, ChevronRight } from 'lucide-react';
import { useSession } from '../lib/session';
import { api } from '../lib/api';
import { Avatar, Chargement, Modale, NouveauMotDePasse } from './Ui';
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
  const plusieurs = espaces.length > 1;
  return (
    <div ref={ref} style={{ position: 'relative', minWidth: 0 }}>
      <button type="button" className="selecteur-espace" onClick={() => plusieurs && setOuvert(o => !o)} aria-expanded={ouvert} aria-haspopup={plusieurs ? 'listbox' : undefined} disabled={!plusieurs}>
        <Avatar nom={espace.nom} logo={espace.logo} taille={24} />
        <span className="nom-espace">{espace.nom}</span>
        {plusieurs && <ChevronDown size={14} className="muet" />}
      </button>
      {ouvert && (
        <div className="menu" role="listbox" aria-label="Changer d’espace">
          <div className="petit muet" style={{ padding: '6px 10px', fontWeight: 600 }}>Vos espaces</div>
          {espaces.map(e => (
            <button key={e.id} type="button" role="option" aria-selected={e.id === espace.id} onClick={() => { changerEspace(e.id); setOuvert(false); nav(e.role === 'gerant' ? '/terrain' : '/'); }}>
              <Avatar nom={e.nom} logo={e.logo} taille={28} />
              <span style={{ flex: 1 }}><b style={{ display: 'block', fontWeight: 600 }}>{e.nom}</b><span className="petit muet">{ROLES[e.role]}</span></span>
              {e.id === espace.id && <Check size={16} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Volet latéral : compte, espaces, toutes les pages, administration, thème, déconnexion.
function Volet({ onFermer, onglets, aTraiter }) {
  const { utilisateur, role, espace, espaces, changerEspace, deconnecter, basculerTheme } = useSession();
  const nav = useNavigate();
  const sombre = utilisateur.theme === 'sombre';
  const ref = useRef(null);
  const [motDePasse, setMotDePasse] = useState(false);
  useEffect(() => {
    ref.current?.querySelector('button, a')?.focus();
    const touche = (e) => { if (e.key === 'Escape') onFermer(); };
    document.addEventListener('keydown', touche);
    return () => document.removeEventListener('keydown', touche);
  }, [onFermer]);
  const lien = ({ isActive }) => 'volet-lien' + (isActive ? ' actif' : '');
  return (
    <div className="volet-voile" onMouseDown={(e) => e.target === e.currentTarget && onFermer()}>
      <aside className="volet" role="dialog" aria-modal="true" aria-label="Menu" ref={ref}>
        <div className="volet-tete">
          <Avatar nom={utilisateur.nom} taille={40} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <b style={{ display: 'block' }}>{utilisateur.nom}</b>
            <span className="petit muet">{[ROLES[role], espace?.nom].filter(Boolean).join(' · ') || 'Administration Loka'}</span>
          </div>
          <button type="button" className="bouton-rond" onClick={onFermer} aria-label="Fermer le menu"><X size={18} /></button>
        </div>

        {espaces.length > 1 && (
          <div className="volet-section">
            <div className="volet-titre">Changer d’espace</div>
            {espaces.map(e => (
              <button key={e.id} type="button" className={'volet-lien' + (e.id === espace?.id ? ' actif' : '')} onClick={() => { changerEspace(e.id); onFermer(); nav(e.role === 'gerant' ? '/terrain' : '/'); }}>
                <Avatar nom={e.nom} logo={e.logo} taille={24} /><span style={{ flex: 1 }}>{e.nom}<span className="petit muet"> · {ROLES[e.role]}</span></span>
                {e.id === espace?.id && <Check size={16} />}
              </button>
            ))}
          </div>
        )}

        {espace && (
          <nav className="volet-section" aria-label="Pages">
            <div className="volet-titre">Pages</div>
            {onglets.map(o => <NavLink key={o.a} to={o.a} end={o.a === '/'} className={lien} onClick={onFermer}><span style={{ flex: 1 }}>{o.label}</span><ChevronRight size={16} className="muet" /></NavLink>)}
          </nav>
        )}

        <div className="volet-section">
          {role === 'proprietaire' && aTraiter > 0 && (
            <NavLink to="/argent?onglet=depenses" className="volet-lien" onClick={onFermer}><Bell size={18} /><span style={{ flex: 1 }}>À traiter</span><span className="puce alerte">{aTraiter}</span></NavLink>
          )}
          {utilisateur.est_admin_plateforme && (
            <NavLink to="/plateforme" className={lien} onClick={onFermer}><Shield size={18} /><span style={{ flex: 1 }}>Administration Loka</span><ChevronRight size={16} className="muet" /></NavLink>
          )}
          <button type="button" className="volet-lien" onClick={() => setMotDePasse(true)}><KeyRound size={18} /><span style={{ flex: 1 }}>Changer mon mot de passe</span></button>
          <button type="button" className="volet-lien" onClick={basculerTheme}>
            {sombre ? <Sun size={18} /> : <Moon size={18} />}<span style={{ flex: 1 }}>{sombre ? 'Mode clair' : 'Mode sombre'}</span>
          </button>
        </div>

        <div className="volet-section" style={{ marginTop: 'auto', borderBottom: 0 }}>
          <button type="button" className="volet-lien danger" onClick={() => { onFermer(); deconnecter(); }}><LogOut size={18} /><span style={{ flex: 1 }}>Se déconnecter</span></button>
        </div>
      </aside>
      {motDePasse && <NouveauMotDePasse titre="Changer mon mot de passe" avecActuel onFermer={() => setMotDePasse(false)}
        envoyer={(nouveau, actuel) => api.patch('/auth/moi/mot-de-passe', { actuel, nouveau })} />}
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
      <button type="button" className={'puce ' + (liste.some(e => e.erreur) ? 'negatif' : 'alerte')} style={{ border: 0, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, flex: '0 0 auto' }} onClick={() => setOuvert(true)}>
        {enLigne ? <RefreshCw size={13} /> : <WifiOff size={13} />}
        {!enLigne && !liste.length ? 'Hors ligne' : liste.length}
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
  const [volet, setVolet] = useState(false);
  const lieu = useLocation();
  const sombre = utilisateur?.theme === 'sombre';
  const { data: tableau } = useQuery({ queryKey: ['tableau', 'alertes'], queryFn: () => api.get('/tableau-de-bord').then(r => r.data), enabled: role === 'proprietaire', refetchInterval: 60000 });
  const aTraiter = tableau ? tableau.a_traiter.depenses + tableau.a_traiter.reductions : 0;
  const nav = useNavigate();
  useEffect(() => { setVolet(false); }, [lieu.pathname]);
  if (!pret) return <Chargement />;
  if (!utilisateur) return <Navigate to={Capacitor.isNativePlatform() ? '/connexion' : '/bienvenue'} replace />;
  const onglets = espace ? ONGLETS.filter(o => !o.roles || o.roles.includes(role)) : [];
  const ongletsHaut = utilisateur.est_admin_plateforme ? [...onglets, { a: '/plateforme', label: 'Administration' }] : onglets;

  return (
    <>
      <header className="entete">
        <NavLink to={!espace ? '/plateforme' : role === 'gerant' ? '/terrain' : '/'} className="marque" aria-label="Loka, accueil"><img src="/logo.svg" width="26" height="26" alt="" /><span className="marque-texte">Loka</span></NavLink>
        <SelecteurEspace />
        <nav className="onglets" aria-label="Navigation principale">
          {ongletsHaut.map(o => <NavLink key={o.a} to={o.a} end={o.a === '/'} className={({ isActive }) => 'onglet' + (isActive ? ' actif' : '')}>{o.label}</NavLink>)}
        </nav>
        <FileAttente />
        <button type="button" className="bouton-rond masquer-mobile" onClick={basculerTheme} aria-label={sombre ? 'Passer en mode clair' : 'Passer en mode sombre'} title={sombre ? 'Mode clair' : 'Mode sombre'}>
          {sombre ? <Sun size={17} /> : <Moon size={17} />}
        </button>
        {role === 'proprietaire' && (
          <button type="button" className="bouton-rond" aria-label={`${aTraiter} élément(s) à traiter`} onClick={() => nav('/argent?onglet=depenses')}>
            <Bell size={17} />{aTraiter > 0 && <span className="pastille-alerte">{aTraiter}</span>}
          </button>
        )}
        <button type="button" className="bouton-menu" onClick={() => setVolet(true)} aria-label="Ouvrir le menu" aria-expanded={volet}>
          <Avatar nom={utilisateur.nom} taille={26} />
          <span className="masquer-mobile">Menu</span>
          <Menu size={18} />
        </button>
      </header>
      {espace?.statut === 'suspendu' && <div className="erreur" style={{ borderRadius: 0, textAlign: 'center' }}>Cet espace est suspendu : consultation seulement. Contactez Loka pour régulariser.</div>}
      <Outlet />
      {espace && (
        <nav className="barre-bas" aria-label="Navigation mobile">
          <NavLink to={role === 'gerant' ? '/terrain' : '/'} end className={({ isActive }) => isActive ? 'actif' : ''}><LayoutGrid size={20} />Accueil</NavLink>
          <NavLink to="/reservations" className={({ isActive }) => isActive ? 'actif' : ''}><CalendarDays size={20} />Planning</NavLink>
          <NavLink to="/argent" className={({ isActive }) => isActive ? 'actif' : ''}><Wallet size={20} />Caisse</NavLink>
          <NavLink to="/argent?onglet=depenses" className={({ isActive }) => isActive ? 'actif' : ''}><Receipt size={20} />Dépenses</NavLink>
        </nav>
      )}
      {volet && <Volet onFermer={() => setVolet(false)} onglets={onglets} aTraiter={aTraiter} />}
    </>
  );
}
