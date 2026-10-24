import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { api, messageErreur } from '../lib/api';
import { useSession } from '../lib/session';
import { fcfa, TYPES_BIEN } from '../lib/format';
import { Chargement, Champ, Erreur, Modale, Puce, Vide } from '../composants/Ui';
import { useBiens, useSites } from '../composants/Formulaires';

function FormulaireBien({ bien, sites, onFermer }) {
  const client = useQueryClient();
  const [f, setF] = useState(bien || { site_id: sites[0]?.id || '', reference: '', type: 'villa', mode: 'nuit', standing: '', pieces: '', prix_nuit: '', prix_mois: '', etat: 'disponible', compteur_electrique: '' });
  const maj = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const envoi = useMutation({
    mutationFn: () => {
      const corps = { ...f, pieces: f.pieces === '' ? null : Number(f.pieces), prix_nuit: f.prix_nuit === '' ? null : Number(f.prix_nuit), prix_mois: f.prix_mois === '' ? null : Number(f.prix_mois) };
      return bien ? api.patch('/biens/' + bien.id, corps) : api.post('/biens', corps);
    },
    onSuccess: () => { client.invalidateQueries(); onFermer(); },
  });
  return (
    <Modale titre={bien ? `Modifier ${bien.reference}` : 'Ajouter un bien'} onFermer={onFermer} actions={<>
      <button className="bouton" onClick={onFermer}>Annuler</button>
      <button className="bouton principal" disabled={!f.reference || !f.site_id || envoi.isPending} onClick={() => envoi.mutate()}>Enregistrer</button>
    </>}>
      <Erreur message={envoi.error && messageErreur(envoi.error)} />
      <div className="grille-form">
        {!bien && <Champ label="Site"><select value={f.site_id} onChange={maj('site_id')}>{sites.map(s => <option key={s.id} value={s.id}>{s.nom}</option>)}</select></Champ>}
        <Champ label="Référence"><input value={f.reference} onChange={maj('reference')} placeholder="B2" /></Champ>
        <Champ label="Type"><select value={f.type} onChange={maj('type')}>{Object.entries(TYPES_BIEN).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Champ>
        <Champ label="Se loue"><select value={f.mode} onChange={maj('mode')}><option value="nuit">À la nuit</option><option value="mois">Au mois</option></select></Champ>
        {f.mode === 'nuit'
          ? <Champ label="Prix par nuit (FCFA)"><input value={f.prix_nuit ?? ''} onChange={maj('prix_nuit')} inputMode="numeric" /></Champ>
          : <Champ label="Loyer mensuel (FCFA)"><input value={f.prix_mois ?? ''} onChange={maj('prix_mois')} inputMode="numeric" /></Champ>}
        <Champ label="Standing"><input value={f.standing || ''} onChange={maj('standing')} placeholder="Haut standing, piscine…" /></Champ>
        <Champ label="Chambres"><input value={f.pieces ?? ''} onChange={maj('pieces')} inputMode="numeric" /></Champ>
        <Champ label="N° de compteur électrique"><input value={f.compteur_electrique || ''} onChange={maj('compteur_electrique')} /></Champ>
        <Champ label="État"><select value={f.etat} onChange={maj('etat')}><option value="disponible">Disponible</option><option value="travaux">En travaux</option><option value="retire">Retiré de la location</option></select></Champ>
      </div>
      <p className="petit muet" style={{ margin: 0 }}>Le prix est libre : le standing et le nombre de chambres servent seulement à décrire le bien.</p>
    </Modale>
  );
}

function FormulaireSite({ onFermer }) {
  const client = useQueryClient();
  const [f, setF] = useState({ nom: '', ville: '', adresse: '' });
  const envoi = useMutation({ mutationFn: () => api.post('/sites', f), onSuccess: () => { client.invalidateQueries(); onFermer(); } });
  return (
    <Modale titre="Ajouter un site" onFermer={onFermer} actions={<><button className="bouton" onClick={onFermer}>Annuler</button><button className="bouton principal" disabled={!f.nom} onClick={() => envoi.mutate()}>Ajouter</button></>}>
      <Erreur message={envoi.error && messageErreur(envoi.error)} />
      <div className="grille-form">
        <Champ label="Nom du site" plein><input value={f.nom} onChange={e => setF({ ...f, nom: e.target.value })} /></Champ>
        <Champ label="Ville"><input value={f.ville} onChange={e => setF({ ...f, ville: e.target.value })} /></Champ>
        <Champ label="Adresse"><input value={f.adresse} onChange={e => setF({ ...f, adresse: e.target.value })} /></Champ>
      </div>
    </Modale>
  );
}

export default function Biens() {
  const { role } = useSession();
  const client = useQueryClient();
  const { data: biens, isLoading } = useBiens();
  const { data: sites = [] } = useSites();
  const [edition, setEdition] = useState(null);
  const [nouveauSite, setNouveauSite] = useState(false);
  const etat = useMutation({ mutationFn: ({ id, etat }) => api.patch('/biens/' + id, { etat }), onSuccess: () => client.invalidateQueries() });
  if (isLoading) return <Chargement />;
  const proprio = role === 'proprietaire';

  return (
    <main className="page">
      <div className="tete-page">
        <div><div className="sur-titre">{biens.length} biens · {sites.length} sites</div><h1 className="titre-page">Biens</h1></div>
        {proprio && <button className="bouton" onClick={() => setNouveauSite(true)}><Plus size={16} />Site</button>}
        {proprio && <button className="bouton principal" onClick={() => setEdition('nouveau')} disabled={!sites.length}><Plus size={16} />Bien</button>}
      </div>
      {!sites.length && <Vide>Commencez par ajouter un site, puis ses biens.</Vide>}
      {sites.map(s => {
        const liste = biens.filter(b => b.site_id === s.id);
        return (
          <section key={s.id} className="carte">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
              <h2>{s.nom}</h2><span className="petit muet">{s.ville} · {liste.length} biens</span>
            </div>
            {liste.length ? (
              <div className="tableau-boite">
                <table className="tableau">
                  <thead><tr><th>Bien</th><th>Description</th><th>Location</th><th className="nombre">Prix</th><th>État</th><th aria-label="Actions" /></tr></thead>
                  <tbody>
                    {liste.map(b => (
                      <tr key={b.id}>
                        <td><b className="chiffre">{b.reference}</b></td>
                        <td>{TYPES_BIEN[b.type]}{b.standing ? ' · ' + b.standing : ''}{b.pieces ? ` · ${b.pieces} ch.` : ''}</td>
                        <td>{b.mode === 'nuit' ? 'À la nuit' : 'Au mois'}</td>
                        <td className="nombre">{b.mode === 'nuit' ? fcfa(b.prix_nuit) + ' / nuit' : fcfa(b.prix_mois) + ' / mois'}</td>
                        <td><Puce statut={b.etat} /></td>
                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          {proprio && <button className="bouton discret" onClick={() => setEdition(b)}>Modifier</button>}
                          {role === 'gerant' && b.etat !== 'retire' && (
                            <button className="bouton discret" onClick={() => etat.mutate({ id: b.id, etat: b.etat === 'travaux' ? 'disponible' : 'travaux' })}>
                              {b.etat === 'travaux' ? 'Remettre en location' : 'Mettre en travaux'}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <Vide>Aucun bien sur ce site.</Vide>}
          </section>
        );
      })}
      {edition && <FormulaireBien bien={edition === 'nouveau' ? null : edition} sites={sites} onFermer={() => setEdition(null)} />}
      {nouveauSite && <FormulaireSite onFermer={() => setNouveauSite(false)} />}
    </main>
  );
}
