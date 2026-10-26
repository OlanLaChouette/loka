import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import './styles/app.css';
import { SessionProvider, useSession } from './lib/session';
import Cadre from './composants/Cadre';
import { Chargement } from './composants/Ui';
import { Capacitor } from '@capacitor/core';
import Connexion from './pages/Connexion';
import Vitrine from './pages/Vitrine';
import Inscription from './pages/Inscription';
import MotDePasseOublie from './pages/MotDePasseOublie';
import Apercu from './pages/Apercu';
import Terrain from './pages/Terrain';
import Biens from './pages/Biens';
import Reservations from './pages/Reservations';
import Baux from './pages/Baux';
import Argent from './pages/Argent';
import Membres from './pages/Membres';
import Parametres from './pages/Parametres';
import Plateforme from './pages/Plateforme';

// Les dernières données consultées restent lisibles sans réseau (7 jours).
const SEPT_JOURS = 7 * 86400000;
const client = new QueryClient({ defaultOptions: { queries: { staleTime: 20000, gcTime: SEPT_JOURS, retry: 1, refetchOnWindowFocus: true, networkMode: 'offlineFirst' } } });
const persistance = createSyncStoragePersister({ storage: window.localStorage, key: 'loka-cache' });

function Garde({ children, roles }) {
  const { pret, utilisateur, role, espace } = useSession();
  if (!pret) return <Chargement />;
  // Sur le site, un visiteur arrive sur la présentation de Loka ; dans l'application Android, directement à la connexion.
  if (!utilisateur) return <Navigate to={Capacitor.isNativePlatform() ? '/connexion' : '/bienvenue'} replace />;
  if (!espace && !utilisateur.est_admin_plateforme) return <div className="page"><div className="info">Votre compte n’est rattaché à aucun espace bailleur pour l’instant.</div></div>;
  if (!espace) return <Navigate to="/plateforme" replace />;
  if (roles && !roles.includes(role)) return <Navigate to={role === 'gerant' ? '/terrain' : '/'} replace />;
  return children;
}

function Accueil() {
  const { role } = useSession();
  return role === 'gerant' ? <Navigate to="/terrain" replace /> : <Apercu />;
}

function Application() {
  const { pret, utilisateur } = useSession();
  return (
    <Routes>
      <Route path="/connexion" element={pret && utilisateur ? <Navigate to="/" replace /> : <Connexion />} />
      <Route path="/bienvenue" element={<Vitrine />} />
      <Route path="/inscription" element={pret && utilisateur ? <Navigate to="/" replace /> : <Inscription />} />
      <Route path="/mot-de-passe-oublie" element={pret && utilisateur ? <Navigate to="/" replace /> : <MotDePasseOublie />} />
      <Route element={<Cadre />}>
        <Route path="/" element={<Garde><Accueil /></Garde>} />
        <Route path="/terrain" element={<Garde><Terrain /></Garde>} />
        <Route path="/biens" element={<Garde><Biens /></Garde>} />
        <Route path="/reservations" element={<Garde><Reservations /></Garde>} />
        <Route path="/baux" element={<Garde><Baux /></Garde>} />
        <Route path="/argent" element={<Garde><Argent /></Garde>} />
        <Route path="/membres" element={<Garde roles={['proprietaire']}><Membres /></Garde>} />
        <Route path="/parametres" element={<Garde roles={['proprietaire']}><Parametres /></Garde>} />
        <Route path="/plateforme" element={pret && utilisateur?.est_admin_plateforme ? <Plateforme /> : <Navigate to="/" replace />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

ReactDOM.createRoot(document.getElementById('racine')).render(
  <React.StrictMode>
    <PersistQueryClientProvider client={client} persistOptions={{ persister: persistance, maxAge: SEPT_JOURS, buster: 'v1' }}>
      <BrowserRouter>
        <SessionProvider><Application /></SessionProvider>
      </BrowserRouter>
    </PersistQueryClientProvider>
  </React.StrictMode>
);
