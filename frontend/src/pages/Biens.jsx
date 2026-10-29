import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Camera, Plus, Trash2 } from 'lucide-react';
import { api, messageErreur } from '../lib/api';
import { useSession } from '../lib/session';
import { EQUIPEMENTS, fcfa, TYPES_BIEN } from '../lib/format';
import { Chargement, Champ, Erreur, Modale, Puce, Vide } from '../composants/Ui';
import { useBiens, useSites } from '../composants/Formulaires';
import { PhotosBien } from '../composants/Photos';

function FormulaireBien({ bien, sites, onFermer }) {
  const client = useQueryClient();
  const [f, setF] = useState({ equipements: [], publie: false, capacite: '', description: '', ...(bien || { site_id: sites[0]?.id || '', reference: '', type: 'villa', mode: 'nuit', standing: '', pieces: '', prix_nuit: '', prix_mois: '', etat: 'disponible', compteur_electrique: '' }) });
  const basculer = (e) => setF({ ...f, equipements: f.equipements.includes(e) ? f.equipements.filter(x => x !== e) : [...f.equipements, e] });
  const maj = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const envoi = useMutation({
    mutationFn: () => {
      const corps = { ...f, capacite: f.capacite === '' || f.capacite == null ? null : Number(f.capacite), pieces: f.pieces === '' ? null : Number(f.pieces), prix_nuit: f.prix_nuit === '' ? null : Number(f.prix_nuit), prix_mois: f.prix_mois === '' ? null : Number(f.prix_mois) };
      return bien ? api.patch('/biens/' + bien.id, corps) : api.post('/biens', corps);
    },
    onSuccess: () => { client.invalidateQueries(); onFermer(); },
  });
  const supprimer = useMutation({ mutationFn: () => api.delete('/biens/' + bien.id), onSuccess: () => { client.invalidateQueries(); onFermer(); } });
  return (
    <Modale titre={bien ? `Modifier ${bien.reference}` : 'Ajouter un bien'} onFermer={onFermer} actions={<>
      {bien && <button className="bouton danger" style={{ marginRight: 'auto' }} onClick={() => window.confirm(`Supprimer ${bien.reference} ?`) && supprimer.mutate()}><Trash2 size={15} />Supprimer</button>}
      <button className="bouton" onClick={onFermer}>Annuler</button>
      <button className="bouton principal" disabled={!f.reference || !f.site_id || envoi.isPending} onClick={() => envoi.mutate()}>Enregistrer</button>
    </>}>
      <Erreur message={(envoi.error || supprimer.error) && messageErreur(envoi.error || supprimer.error)} />
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
        {f.mode === 'nuit' && <>
          <div className="plein publication">
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 700, color: 'var(--texte)' }}>
              <input type="checkbox" checked={!!f.publie} onChange={e => setF({ ...f, publie: e.target.checked })} />
              Publier sur la place de marché Loka
            </label>
            <span className="petit muet">Les clients la trouvent sur loka.eyamtech.com/villas avec ses photos, son prix et ses dates libres, puis vous envoient une demande à accepter.</span>
          </div>
          <Champ label="Personnes (capacité)"><input value={f.capacite ?? ''} onChange={maj('capacite')} inputMode="numeric" placeholder="4" /></Champ>
          <Champ label="Description pour les clients" plein><textarea rows={2} value={f.description || ''} onChange={maj('description')} placeholder="Villa meublée, climatisée, à 5 min du centre…" /></Champ>
          <div className="plein"><span className="petit muet" style={{ fontWeight: 600 }}>Équipements</span>
            <div className="choix-equipements">{Object.entries(EQUIPEMENTS).map(([k, v]) => <button key={k} type="button" className={f.equipements.includes(k) ? 'actif' : ''} onClick={() => basculer(k)}>{v}</button>)}</div>
          </div>
        </>}
      </div>
      <p className="petit muet" style={{ margin: 0 }}>Le prix est libre : le standing et le nombre de chambres servent seulement à décrire le bien.</p>
    </Modale>
  );
}

function FormulaireLot({ sites, onFermer }) {
  const client = useQueryClient();
  const [f, setF] = useState({ site_id: sites[0]?.id || '', prefixe: 'V', debut: '1', fin: '10', type: 'villa', mode: 'nuit', prix: '', standing: '', pieces: '' });
  const maj = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const [fait, setFait] = useState(null);
  const n = Math.max(0, Number(f.fin) - Number(f.debut) + 1);
  const envoi = useMutation({
    mutationFn: () => api.post('/biens/lot', { ...f, debut: Number(f.debut), fin: Number(f.fin), prix: Number(f.prix) || 0, pieces: f.pieces ? Number(f.pieces) : null }).then(r => r.data),
    onSuccess: (r) => { client.invalidateQueries(); setFait(r); },
  });
  if (fait) return (
    <Modale titre="Biens ajoutés" onFermer={onFermer} actions={<button className="bouton principal" onClick={onFermer}>Terminé</button>}>
      <div className="info">{fait.crees} bien{fait.crees > 1 ? 's' : ''} ajouté{fait.crees > 1 ? 's' : ''}{fait.ignores ? ` · ${fait.ignores} déjà existant${fait.ignores > 1 ? 's' : ''}, ignoré${fait.ignores > 1 ? 's' : ''}` : ''}. Vous pouvez ensuite ajuster le prix de chacun avec « Modifier ».</div>
    </Modale>
  );
  return (
    <Modale titre="Ajouter plusieurs biens" onFermer={onFermer} actions={<>
      <button className="bouton" onClick={onFermer}>Annuler</button>
      <button className="bouton principal" disabled={!f.site_id || n < 1 || n > 100 || envoi.isPending} onClick={() => envoi.mutate()}>Ajouter {n} bien{n > 1 ? 's' : ''}</button>
    </>}>
      <Erreur message={envoi.error && messageErreur(envoi.error)} />
      <div className="grille-form">
        <Champ label="Site" plein><select value={f.site_id} onChange={maj('site_id')}>{sites.map(x => <option key={x.id} value={x.id}>{x.nom}</option>)}</select></Champ>
        <Champ label="Lettre ou préfixe"><input value={f.prefixe} onChange={maj('prefixe')} placeholder="V, A, Appt " /></Champ>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
          <Champ label="De"><input value={f.debut} onChange={maj('debut')} inputMode="numeric" /></Champ>
          <Champ label="À"><input value={f.fin} onChange={maj('fin')} inputMode="numeric" /></Champ>
        </div>
        <Champ label="Type"><select value={f.type} onChange={maj('type')}>{Object.entries(TYPES_BIEN).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Champ>
        <Champ label="Se loue"><select value={f.mode} onChange={maj('mode')}><option value="nuit">À la nuit</option><option value="mois">Au mois</option></select></Champ>
        <Champ label={f.mode === 'nuit' ? 'Prix par nuit (FCFA)' : 'Loyer mensuel (FCFA)'}><input value={f.prix} onChange={maj('prix')} inputMode="numeric" /></Champ>
        <Champ label="Chambres"><input value={f.pieces} onChange={maj('pieces')} inputMode="numeric" /></Champ>
        <Champ label="Standing" plein><input value={f.standing} onChange={maj('standing')} placeholder="Standing, haut standing…" /></Champ>
      </div>
      {n > 0 && n <= 100 && <p className="petit muet" style={{ margin: 0 }}>Seront créés : {f.prefixe}{f.debut}{n > 1 ? ` … ${f.prefixe}${f.fin}` : ''}. Les références déjà présentes sont ignorées.</p>}
    </Modale>
  );
}

function FormulaireSite({ site, onFermer }) {
  const client = useQueryClient();
  const [f, setF] = useState({ nom: site?.nom || '', ville: site?.ville || '', adresse: site?.adresse || '', quartier: site?.quartier || '', latitude: site?.latitude ?? '', longitude: site?.longitude ?? '' });
  const [position, setPosition] = useState('');
  const maj = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const envoi = useMutation({
    mutationFn: () => { const corps = { ...f, latitude: f.latitude === '' ? null : Number(f.latitude), longitude: f.longitude === '' ? null : Number(f.longitude) }; return site ? api.patch('/sites/' + site.id, corps) : api.post('/sites', corps); },
    onSuccess: () => { client.invalidateQueries(); onFermer(); },
  });
  // Position du téléphone, à prendre sur place : sert à la recherche « autour de moi » des clients.
  function ici() {
    if (!navigator.geolocation) return setPosition('Position indisponible sur cet appareil.');
    setPosition('Recherche de la position…');
    navigator.geolocation.getCurrentPosition((p) => { setF({ ...f, latitude: p.coords.latitude.toFixed(6), longitude: p.coords.longitude.toFixed(6) }); setPosition('Position enregistrée.'); }, () => setPosition('Position refusée par le téléphone.'), { enableHighAccuracy: true, timeout: 15000 });
  }
  return (
    <Modale titre={site ? `Modifier ${site.nom}` : 'Ajouter un site'} onFermer={onFermer} actions={<><button className="bouton" onClick={onFermer}>Annuler</button><button className="bouton principal" disabled={!f.nom || envoi.isPending} onClick={() => envoi.mutate()}>{site ? 'Enregistrer' : 'Ajouter'}</button></>}>
      <Erreur message={envoi.error && messageErreur(envoi.error)} />
      <div className="grille-form">
        <Champ label="Nom du site" plein><input value={f.nom} onChange={maj('nom')} /></Champ>
        <Champ label="Ville"><input value={f.ville} onChange={maj('ville')} /></Champ>
        <Champ label="Quartier"><input value={f.quartier} onChange={maj('quartier')} placeholder="Ouaga 2000, Koulouba…" /></Champ>
        <Champ label="Adresse" plein><input value={f.adresse} onChange={maj('adresse')} /></Champ>
        <div className="plein" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span className="petit muet" style={{ fontWeight: 600 }}>Position (pour la place de marché)</span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button type="button" className="bouton" onClick={ici}>Utiliser ma position actuelle</button>
            <span className="petit muet">{f.latitude && f.longitude ? `${Number(f.latitude).toFixed(4)}, ${Number(f.longitude).toFixed(4)}` : 'Non renseignée'}</span>
          </div>
          {position && <span className="petit muet">{position}</span>}
        </div>
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
  const [siteEdite, setSiteEdite] = useState(null);
  const [lot, setLot] = useState(false);
  const [photos, setPhotos] = useState(null);
  const [params, setParams] = useSearchParams();
  const supprimerSite = useMutation({ mutationFn: (id) => api.delete('/sites/' + id), onSuccess: () => client.invalidateQueries() });
  useEffect(() => {
    const action = params.get('action');
    if (!action || role !== 'proprietaire') return;
    if (action === 'site') setNouveauSite(true);
    if (action === 'lot' && sites.length) setLot(true);
    if (action === 'lot' && !sites.length) setNouveauSite(true);
    setParams({}, { replace: true });
  }, [params, sites.length, role, setParams]);
  const etat = useMutation({ mutationFn: ({ id, etat }) => api.patch('/biens/' + id, { etat }), onSuccess: () => client.invalidateQueries() });
  if (isLoading) return <Chargement />;
  const proprio = role === 'proprietaire';

  return (
    <main className="page">
      <div className="tete-page">
        <div><div className="sur-titre">{biens.length} biens · {sites.length} sites</div><h1 className="titre-page">Biens</h1></div>
        {proprio && <button className="bouton" onClick={() => setNouveauSite(true)}><Plus size={16} />Site</button>}
        {proprio && <button className="bouton" onClick={() => setLot(true)} disabled={!sites.length}><Plus size={16} />Plusieurs biens</button>}
        {proprio && <button className="bouton principal" onClick={() => setEdition('nouveau')} disabled={!sites.length}><Plus size={16} />Bien</button>}
      </div>
      <Erreur message={supprimerSite.error && messageErreur(supprimerSite.error)} />
      {!sites.length && <Vide>Commencez par créer un site (une résidence, un immeuble), puis ajoutez ses biens.{proprio && <><br /><button className="bouton principal" style={{ marginTop: 12 }} onClick={() => setNouveauSite(true)}>Créer un site</button></>}</Vide>}
      {sites.map(s => {
        const liste = biens.filter(b => b.site_id === s.id);
        return (
          <section key={s.id} className="carte">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
              <h2>{s.nom}</h2>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="petit muet">{[s.quartier, s.ville, `${liste.length} bien${liste.length > 1 ? 's' : ''}`, liste.some(b => b.publie) ? `${liste.filter(b => b.publie).length} en ligne` : ''].filter(Boolean).join(' · ')}</span>
                {proprio && <button className="bouton discret petit" onClick={() => setSiteEdite(s)}>Modifier</button>}
                {proprio && !liste.length && <button className="bouton discret danger petit" onClick={() => window.confirm(`Supprimer le site ${s.nom} ?`) && supprimerSite.mutate(s.id)}>Supprimer</button>}
              </span>
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
                          <button className="bouton discret" onClick={() => setPhotos(b.id)} aria-label={`Photos de ${b.reference}`}><Camera size={15} />{b.photos?.length || (role === 'comptable' ? 0 : '+')}</button>
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
      {siteEdite && <FormulaireSite site={siteEdite} onFermer={() => setSiteEdite(null)} />}
      {lot && <FormulaireLot sites={sites} onFermer={() => setLot(false)} />}
      {photos && <PhotosBien bienId={photos} onFermer={() => setPhotos(null)} />}
    </main>
  );
}
