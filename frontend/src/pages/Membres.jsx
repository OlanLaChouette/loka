import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, messageErreur } from '../lib/api';
import { ROLES } from '../lib/format';
import { Avatar, Chargement, Champ, Erreur, Modale, NouveauMotDePasse, Puce } from '../composants/Ui';
import { useSites } from '../composants/Formulaires';

function FormulaireMembre({ membre, sites, onFermer }) {
  const client = useQueryClient();
  const [f, setF] = useState(membre
    ? { role: membre.role, sites: membre.sites || [], limite_reduction: membre.limite_reduction ?? '' }
    : { nom: '', telephone: '', mot_de_passe: '', role: 'gerant', sites: [], limite_reduction: '' });
  const basculerSite = (id) => setF({ ...f, sites: f.sites.includes(id) ? f.sites.filter(s => s !== id) : [...f.sites, id] });
  const envoi = useMutation({
    mutationFn: () => {
      const corps = { ...f, limite_reduction: f.limite_reduction === '' ? null : Number(f.limite_reduction) };
      return membre ? api.patch('/membres/' + membre.id, corps) : api.post('/membres', corps);
    },
    onSuccess: () => { client.invalidateQueries(); onFermer(); },
  });
  return (
    <Modale titre={membre ? membre.Utilisateur.nom : 'Ajouter un membre'} onFermer={onFermer} actions={<>
      <button className="bouton" onClick={onFermer}>Annuler</button>
      <button className="bouton principal" disabled={envoi.isPending || (!membre && (!f.nom || !f.telephone))} onClick={() => envoi.mutate()}>Enregistrer</button>
    </>}>
      <Erreur message={envoi.error && messageErreur(envoi.error)} />
      <div className="grille-form">
        {!membre && <>
          <Champ label="Nom" plein><input value={f.nom} onChange={e => setF({ ...f, nom: e.target.value })} /></Champ>
          <Champ label="Téléphone (identifiant)"><input value={f.telephone} onChange={e => setF({ ...f, telephone: e.target.value.replace(/\s/g, '') })} inputMode="tel" /></Champ>
          <Champ label="Mot de passe provisoire"><input value={f.mot_de_passe} onChange={e => setF({ ...f, mot_de_passe: e.target.value })} placeholder="8 caractères minimum" /></Champ>
        </>}
        <Champ label="Rôle"><select value={f.role} onChange={e => setF({ ...f, role: e.target.value })}><option value="gerant">Gérant</option><option value="comptable">Comptable (consultation)</option></select></Champ>
        {f.role === 'gerant' && <Champ label="Limite de réduction (%)"><input value={f.limite_reduction} onChange={e => setF({ ...f, limite_reduction: e.target.value.replace(/\D/g, '') })} placeholder="Celle de l’entreprise" inputMode="numeric" /></Champ>}
        {f.role === 'gerant' && (
          <fieldset className="plein" style={{ border: '1px solid var(--bord)', borderRadius: 12, padding: 12 }}>
            <legend className="petit muet" style={{ fontWeight: 600, padding: '0 6px' }}>Sites confiés (aucun coché = tous)</legend>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {sites.map(s => <label key={s.id} className="bouton" style={{ cursor: 'pointer' }}><input type="checkbox" checked={f.sites.includes(s.id)} onChange={() => basculerSite(s.id)} />{s.nom}</label>)}
            </div>
          </fieldset>
        )}
      </div>
      {!membre && <p className="petit muet" style={{ margin: 0 }}>Si ce numéro a déjà un compte Loka (il travaille pour un autre bailleur), il retrouvera votre espace avec son mot de passe habituel.</p>}
    </Modale>
  );
}

export default function Membres() {
  const client = useQueryClient();
  const { data: membres, isLoading } = useQuery({ queryKey: ['membres'], queryFn: () => api.get('/membres').then(r => r.data) });
  const { data: sites = [] } = useSites();
  const [edition, setEdition] = useState(null);
  const [motDePasse, setMotDePasse] = useState(null);
  const [params, setParams] = useSearchParams();
  useEffect(() => { if (params.get('action') === 'nouveau') { setEdition('nouveau'); setParams({}, { replace: true }); } }, [params, setParams]);
  const actif = useMutation({ mutationFn: (m) => api.patch('/membres/' + m.id, { actif: !m.actif }), onSuccess: () => client.invalidateQueries() });
  if (isLoading) return <Chargement />;
  const nomsSites = (ids) => (ids?.length ? ids.map(id => sites.find(s => s.id === id)?.nom).filter(Boolean).join(', ') : 'Tous les sites');
  return (
    <main className="page">
      <div className="tete-page">
        <div><div className="sur-titre">Qui fait quoi dans votre espace</div><h1 className="titre-page">Gérants et accès</h1></div>
        <button className="bouton principal" onClick={() => setEdition('nouveau')}>+ Ajouter un membre</button>
      </div>
      <section className="carte">
        <div className="liste-lignes">
          {membres.map(m => (
            <div key={m.id} style={{ opacity: m.actif ? 1 : .55, flexWrap: 'wrap' }}>
              <Avatar nom={m.Utilisateur.nom} taille={40} />
              <span style={{ flex: 1, minWidth: 200 }}><b>{m.Utilisateur.nom}</b><div className="petit muet">{m.Utilisateur.telephone} · {m.role === 'gerant' ? nomsSites(m.sites) : ROLES[m.role]}{m.role === 'gerant' && m.limite_reduction != null ? ` · réduction max ${m.limite_reduction} %` : ''}</div></span>
              <Puce ton={m.role === 'proprietaire' ? 'violet' : ''}>{ROLES[m.role]}</Puce>
              {!m.actif && <Puce ton="negatif">Désactivé</Puce>}
              {m.role !== 'proprietaire' && <>
                <button className="bouton discret" onClick={() => setEdition(m)}>Modifier</button>
                <button className="bouton discret" onClick={() => setMotDePasse(m)}>Mot de passe</button>
                <button className="bouton discret" onClick={() => actif.mutate(m)}>{m.actif ? 'Désactiver' : 'Réactiver'}</button>
              </>}
            </div>
          ))}
        </div>
      </section>
      {motDePasse && <NouveauMotDePasse titre={`Nouveau mot de passe · ${motDePasse.Utilisateur.nom}`} onFermer={() => setMotDePasse(null)}
        texte="Choisissez un mot de passe provisoire et transmettez-le à la personne. Elle pourra le changer depuis son menu."
        envoyer={(mdp) => api.post(`/membres/${motDePasse.id}/mot-de-passe`, { mot_de_passe: mdp })} />}
      {edition && <FormulaireMembre membre={edition === 'nouveau' ? null : edition} sites={sites} onFermer={() => setEdition(null)} />}
    </main>
  );
}
