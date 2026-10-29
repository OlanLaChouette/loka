import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, messageErreur } from '../lib/api';
import { useSession } from '../lib/session';
import { dateCourte, fcfa, MOYENS } from '../lib/format';
import { Chargement, Champ, Erreur, Modale, Puce, Vide } from '../composants/Ui';
import { NouvelleDepense, useBiens, useSites } from '../composants/Formulaires';
import { ouvrirPdf } from '../lib/partage';

function Encaissements() {
  const { data = [], isLoading } = useQuery({ queryKey: ['paiements'], queryFn: () => api.get('/paiements').then(r => r.data) });
  if (isLoading) return <Chargement />;
  const total = data.reduce((s, p) => s + p.montant, 0);
  return (
    <section className="carte">
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}><h2>Derniers encaissements</h2><span className="muet">{data.length} · {fcfa(total)}</span></div>
      {data.length ? (
        <div className="tableau-boite"><table className="tableau">
          <thead><tr><th>Date</th><th>Reçu</th><th>Pour</th><th>Moyen</th><th className="nombre">Montant</th><th aria-label="Reçu PDF" /></tr></thead>
          <tbody>{data.map(p => {
            const cible = p.Reservation || p.Bail;
            return (
              <tr key={p.id}>
                <td>{dateCourte(p.date_paiement)}</td>
                <td className="petit muet">{p.numero_recu}</td>
                <td>{cible?.Bien?.reference} · {cible?.Client?.nom}{p.periode && <span className="petit muet"> · loyer {p.periode}</span>}</td>
                <td>{MOYENS[p.moyen]}{p.reference && <div className="petit muet">{p.reference}</div>}</td>
                <td className="nombre"><b>{fcfa(p.montant)}</b></td>
                <td style={{ textAlign: 'right' }}><button className="bouton discret" onClick={() => ouvrirPdf(`/paiements/${p.id}/recu.pdf`)}>Reçu PDF</button></td>
              </tr>
            );
          })}</tbody>
        </table></div>
      ) : <Vide>Aucun encaissement.</Vide>}
    </section>
  );
}

function Depenses() {
  const { role } = useSession();
  const client = useQueryClient();
  const [nouvelle, setNouvelle] = useState(false);
  const [image, setImage] = useState(null);
  const { data = [], isLoading } = useQuery({ queryKey: ['depenses'], queryFn: () => api.get('/depenses').then(r => r.data) });
  const decision = useMutation({ mutationFn: ({ id, d, motif }) => api.post(`/depenses/${id}/${d}`, { motif }), onSuccess: () => client.invalidateQueries() });
  // Le justificatif est protégé : on le télécharge avec la session, puis on l'affiche.
  const voir = async (d) => {
    const r = await api.get(d.justificatif.replace(/^\/api/, ''), { responseType: 'blob' });
    setImage({ url: URL.createObjectURL(r.data), type: r.data.type, titre: `${d.categorie} · ${fcfa(d.montant)}` });
  };
  if (isLoading) return <Chargement />;
  const enAttente = data.filter(d => d.statut === 'en_attente');
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>{role !== 'comptable' && <button className="bouton principal" onClick={() => setNouvelle(true)}>+ Noter une dépense</button>}</div>
      <Erreur message={decision.error && messageErreur(decision.error)} />
      {enAttente.length > 0 && role === 'proprietaire' && (
        <section className="carte" style={{ borderColor: 'var(--alerte)' }}>
          <h2>À valider</h2>
          <div className="liste-lignes">
            {enAttente.map(d => (
              <div key={d.id} style={{ flexWrap: 'wrap' }}>
                <span style={{ flex: 1, minWidth: 200 }}><b>{d.categorie} · {d.Bien?.reference || d.Site?.nom}</b><div className="petit muet">{d.auteur?.nom} · {dateCourte(d.date_depense)}{d.note ? ' · ' + d.note : ''}</div></span>
                <b className="chiffre">{fcfa(d.montant)}</b>
                <span className="actions-ligne">
                  {d.justificatif ? <button className="bouton" onClick={() => voir(d)}>Justificatif</button> : <span className="puce alerte">Sans justificatif</span>}
                  <button className="bouton" onClick={() => { const motif = window.prompt('Motif du refus ?'); if (motif !== null) decision.mutate({ id: d.id, d: 'refuser', motif }); }}>Refuser</button>
                  <button className="bouton principal" onClick={() => decision.mutate({ id: d.id, d: 'accepter' })}>Accepter</button>
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
      <section className="carte">
        <h2 style={{ marginBottom: 8 }}>Toutes les dépenses</h2>
        {data.length ? (
          <div className="tableau-boite"><table className="tableau">
            <thead><tr><th>Date</th><th>Catégorie</th><th>Pour</th><th>Saisie par</th><th>Statut</th><th className="nombre">Montant</th><th aria-label="Justificatif" /></tr></thead>
            <tbody>{data.map(d => (
              <tr key={d.id}>
                <td>{dateCourte(d.date_depense)}</td><td>{d.categorie}</td><td>{d.Bien?.reference || d.Site?.nom}</td><td>{d.auteur?.nom}</td>
                <td><Puce statut={d.statut} /></td><td className="nombre"><b>{fcfa(d.montant)}</b></td>
                <td>{d.justificatif && <button className="bouton discret" onClick={() => voir(d)}>Voir</button>}</td>
              </tr>
            ))}</tbody>
          </table></div>
        ) : <Vide>Aucune dépense.</Vide>}
      </section>
      {nouvelle && <NouvelleDepense onFermer={() => setNouvelle(false)} />}
      {image && (
        <Modale titre={image.titre} onFermer={() => { URL.revokeObjectURL(image.url); setImage(null); }}>
          {image.type === 'application/pdf' ? <a className="bouton" href={image.url} target="_blank" rel="noreferrer">Ouvrir le PDF</a> : <img src={image.url} alt="Justificatif" style={{ width: '100%', borderRadius: 12 }} />}
        </Modale>
      )}
    </>
  );
}

function Charges() {
  const { role } = useSession();
  const client = useQueryClient();
  const { data: sites = [] } = useSites();
  const { data: biens = [] } = useBiens();
  const { data = [], isLoading } = useQuery({ queryKey: ['charges'], queryFn: () => api.get('/charges').then(r => r.data) });
  const [edition, setEdition] = useState(null);
  const enregistrer = useMutation({
    mutationFn: (c) => {
      const corps = { ...c, montant: Number(c.montant), site_id: c.portee === 'site' ? c.site_id : null, bien_id: c.portee === 'bien' ? c.bien_id : null };
      return c.id ? api.patch('/charges/' + c.id, corps) : api.post('/charges', corps);
    },
    onSuccess: () => { client.invalidateQueries(); setEdition(null); },
  });
  const retirer = useMutation({ mutationFn: (id) => api.delete('/charges/' + id), onSuccess: () => client.invalidateQueries() });
  if (isLoading) return <Chargement />;
  const proprio = role === 'proprietaire';
  const portee = (c) => c.portee === 'tous' ? 'Tous les sites' : c.portee === 'site' ? sites.find(s => s.id === c.site_id)?.nom : biens.find(b => b.id === c.bien_id)?.reference;
  const PER = { mensuelle: 'par mois', trimestrielle: 'par trimestre', annuelle: 'par an' };
  return (
    <section className="carte">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <h2>Charges fixes</h2>
        {proprio && <button className="bouton principal" onClick={() => setEdition({ nom: '', montant: '', periodicite: 'mensuelle', portee: 'tous', site_id: sites[0]?.id, bien_id: biens[0]?.id })}>+ Ajouter une charge</button>}
      </div>
      <p className="petit muet" style={{ marginTop: 0 }}>Gaz, Wi-Fi, gardiennage… Une charge retirée reste comptée dans les mois passés.</p>
      <div className="tableau-boite"><table className="tableau">
        <thead><tr><th>Charge</th><th>Concerne</th><th className="nombre">Montant</th><th>État</th><th aria-label="Actions" /></tr></thead>
        <tbody>{data.map(c => (
          <tr key={c.id} style={{ opacity: c.actif ? 1 : .55 }}>
            <td><b>{c.nom}</b></td><td>{portee(c)}</td><td className="nombre">{fcfa(c.montant)} <span className="petit muet">{PER[c.periodicite]}</span></td>
            <td>{c.actif ? <Puce ton="violet">Active</Puce> : <Puce>Retirée</Puce>}</td>
            <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{proprio && c.actif && <><button className="bouton discret" onClick={() => setEdition(c)}>Modifier</button><button className="bouton discret danger" onClick={() => window.confirm(`Retirer « ${c.nom} » ?`) && retirer.mutate(c.id)}>Retirer</button></>}</td>
          </tr>
        ))}</tbody>
      </table></div>
      {edition && (
        <Modale titre={edition.id ? 'Modifier la charge' : 'Nouvelle charge fixe'} onFermer={() => setEdition(null)} actions={<><button className="bouton" onClick={() => setEdition(null)}>Annuler</button><button className="bouton principal" disabled={!edition.nom || !Number(edition.montant)} onClick={() => enregistrer.mutate(edition)}>Enregistrer</button></>}>
          <Erreur message={enregistrer.error && messageErreur(enregistrer.error)} />
          <div className="grille-form">
            <Champ label="Nom" plein><input value={edition.nom} onChange={e => setEdition({ ...edition, nom: e.target.value })} placeholder="Wi-Fi, gaz, gardiennage…" /></Champ>
            <Champ label="Montant (FCFA)"><input value={edition.montant} onChange={e => setEdition({ ...edition, montant: e.target.value.replace(/\D/g, '') })} inputMode="numeric" /></Champ>
            <Champ label="Fréquence"><select value={edition.periodicite} onChange={e => setEdition({ ...edition, periodicite: e.target.value })}><option value="mensuelle">Chaque mois</option><option value="trimestrielle">Chaque trimestre</option><option value="annuelle">Chaque année</option></select></Champ>
            <Champ label="Concerne"><select value={edition.portee} onChange={e => setEdition({ ...edition, portee: e.target.value })}><option value="tous">Tous les sites</option><option value="site">Un site</option><option value="bien">Un bien</option></select></Champ>
            {edition.portee === 'site' && <Champ label="Site"><select value={edition.site_id || ''} onChange={e => setEdition({ ...edition, site_id: e.target.value })}>{sites.map(s => <option key={s.id} value={s.id}>{s.nom}</option>)}</select></Champ>}
            {edition.portee === 'bien' && <Champ label="Bien"><select value={edition.bien_id || ''} onChange={e => setEdition({ ...edition, bien_id: e.target.value })}>{biens.map(b => <option key={b.id} value={b.id}>{b.Site?.nom} · {b.reference}</option>)}</select></Champ>}
          </div>
        </Modale>
      )}
    </section>
  );
}

export default function Argent() {
  const [params, setParams] = useSearchParams();
  const onglet = params.get('onglet') || 'encaissements';
  const ONGLETS = [['encaissements', 'Encaissements'], ['depenses', 'Dépenses'], ['charges', 'Charges fixes']];
  return (
    <main className="page">
      <div className="tete-page">
        <div><div className="sur-titre">Ce qui entre et ce qui sort</div><h1 className="titre-page">Argent</h1></div>
        <div className="segment" role="tablist">
          {ONGLETS.map(([k, v]) => <button key={k} type="button" role="tab" aria-selected={onglet === k} className={onglet === k ? 'actif' : ''} onClick={() => setParams({ onglet: k })}>{v}</button>)}
        </div>
      </div>
      {onglet === 'encaissements' && <Encaissements />}
      {onglet === 'depenses' && <Depenses />}
      {onglet === 'charges' && <Charges />}
    </main>
  );
}
