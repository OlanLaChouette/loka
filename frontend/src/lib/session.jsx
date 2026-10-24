import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, stockage } from './api';

const Contexte = createContext(null);
const memoriser = (d) => { try { localStorage.setItem('loka-session', JSON.stringify({ utilisateur: d.utilisateur, espaces: d.espaces })); } catch { /* ignoré */ } };
const relire = () => { try { return JSON.parse(localStorage.getItem('loka-session')); } catch { return null; } };

function appliquerTheme(theme) {
  document.documentElement.dataset.theme = theme === 'sombre' ? 'sombre' : '';
  try { localStorage.setItem('loka-theme', theme); } catch { /* ignoré */ }
}

export function SessionProvider({ children }) {
  const client = useQueryClient();
  const [etat, setEtat] = useState({ pret: false, utilisateur: null, espaces: [] });
  const [espaceId, setEspaceId] = useState(stockage.espace());

  const charger = useCallback(async () => {
    if (!stockage.jeton()) return setEtat({ pret: true, utilisateur: null, espaces: [] });
    try {
      const { data } = await api.get('/auth/moi');
      memoriser(data);
      setEtat({ pret: true, utilisateur: data.utilisateur, espaces: data.espaces });
      appliquerTheme(data.utilisateur.theme);
      const valide = data.espaces.find(e => e.id === stockage.espace());
      if (!valide && data.espaces[0]) { stockage.definirEspace(data.espaces[0].id); setEspaceId(data.espaces[0].id); }
    } catch (e) {
      // Sans réseau, on reprend la dernière session connue plutôt que de déconnecter le gérant.
      const memo = !e.response && relire();
      setEtat(memo ? { pret: true, ...memo } : { pret: true, utilisateur: null, espaces: [] });
    }
  }, []);

  useEffect(() => { charger(); }, [charger]);

  const valeur = useMemo(() => {
    const espace = etat.espaces.find(e => e.id === espaceId) || null;
    return {
      ...etat, espace, role: espace?.role,
      async connecter(identifiant, mot_de_passe) {
        const { data } = await api.post('/auth/connexion', { identifiant, mot_de_passe });
        stockage.definirJeton(data.jeton);
        memoriser(data);
        const premier = data.espaces[0]?.id || null;
        stockage.definirEspace(premier); setEspaceId(premier);
        appliquerTheme(data.utilisateur.theme);
        setEtat({ pret: true, utilisateur: data.utilisateur, espaces: data.espaces });
        return data;
      },
      deconnecter() {
        stockage.definirJeton(null); stockage.definirEspace(null);
        try { localStorage.removeItem('loka-session'); localStorage.removeItem('loka-cache'); } catch { /* ignoré */ }
        client.clear();
        setEtat({ pret: true, utilisateur: null, espaces: [] });
      },
      changerEspace(id) {
        stockage.definirEspace(id); setEspaceId(id);
        client.clear();
      },
      async basculerTheme() {
        const theme = etat.utilisateur?.theme === 'sombre' ? 'clair' : 'sombre';
        appliquerTheme(theme);
        setEtat(e => ({ ...e, utilisateur: { ...e.utilisateur, theme } }));
        try { await api.patch('/auth/moi/theme', { theme }); } catch { /* le choix reste au moins sur cet appareil */ }
      },
      recharger: charger,
    };
  }, [etat, espaceId, client, charger]);

  return <Contexte.Provider value={valeur}>{children}</Contexte.Provider>;
}

export const useSession = () => useContext(Contexte);
