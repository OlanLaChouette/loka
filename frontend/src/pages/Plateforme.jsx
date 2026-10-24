// Administration Loka : tous les bailleurs, leurs biens enregistrés (base de l'abonnement) et leur statut.
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, messageErreur } from '../lib/api';
import { dateCourte, fcfa } from '../lib/format';
import { Chargement, Champ, Erreur, Modale, Puce } from '../composants/Ui';

function NouveauBailleur({ onFermer }) {
  const client = useQueryClient();
  const [b, setB] = useState({ nom: '', ville: '', telephone: '' });
  const [p, setP] = useState({ nom: '', telephone: '', email: '', mot_de_passe: '' });
  const envoi = useMutation({ mutationFn: () => api.post('/plateforme/bailleurs', { bailleur: b, proprietaire: p }), onSuccess: () => { client.invalidateQueries(); onFermer(); } });
  return (
    <Modale titre="Nouveau bailleur" onFermer={onFermer} actions={<><button className="bouton" onClick={onFermer}>Annuler</button><button className="bouton principal" disabled={!b.nom || !p.nom || !p.telephone || p.mot_de_passe.length < 8 || envoi.isPending} onClick={() => envoi.mutate()}>Créer l’espace</button></>}>
      <Erreur message={envoi.error && messageErreur(envoi.error)} />
      <div className="grille-form">
        <Champ label="Entreprise" plein><input value={b.nom} onChange={e => setB({ ...b, nom: e.target.value })} /></Champ>
        <Champ label="Ville"><input value={b.ville} onChange={e => setB({ ...b, ville: e.target.value })} /></Champ>
        <Champ label="Téléphone de l’entreprise"><input value={b.telephone} onChange={e => setB({ ...b, telephone: e.target.value })} /></Champ>
        <Champ label="Propriétaire" plein><input value={p.nom} onChange={e => setP({ ...p, nom: e.target.value })} /></Champ>
        <Champ label="Téléphone (identifiant)"><input value={p.telephone} onChange={e => setP({ ...p, telephone: e.target.value.replace(/\s/g, '') })} inputMode="tel" /></Champ>
        <Champ label="E-mail"><input value={p.email} onChange={e => setP({ ...p, email: e.target.value })} /></Champ>
        <Champ label="Mot de passe provisoire" plein><input value={p.mot_de_passe} onChange={e => setP({ ...p, mot_de_passe: e.target.value })} placeholder="8 caractères minimum" /></Champ>
      </div>
      <p className="petit muet" style={{ margin: 0 }}>L’espace démarre en essai de 30 jours.</p>
    </Modale>
  );
}

export default function Plateforme() {
  const client = useQueryClient();
  const [nouveau, setNouveau] = useState(false);
  const { data, isLoading } = useQuery({ queryKey: ['plateforme'], queryFn: () => api.get('/plateforme/bailleurs').then(r => r.data) });
  const statut = useMutation({ mutationFn: ({ id, statut }) => api.patch(`/plateforme/bailleurs/${id}/statut`, { statut }), onSuccess: () => client.invalidateQueries() });
  if (isLoading) return <Chargement />;
  const totalMensuel = data.filter(b => b.statut === 'actif').reduce((s, b) => s + b.abonnement_mensuel, 0);
  return (
    <main className="page">
      <div className="tete-page">
        <div><div className="sur-titre">Administration Loka</div><h1 className="titre-page">Bailleurs</h1></div>
        <button className="bouton principal" onClick={() => setNouveau(true)}>+ Nouveau bailleur</button>
      </div>
      <div className="blocs">
        <section className="carte b4"><div className="etiquette">Bailleurs</div><div className="chiffre" style={{ fontSize: 34, marginTop: 6 }}>{data.length}</div></section>
        <section className="carte b4"><div className="etiquette">Biens enregistrés</div><div className="chiffre" style={{ fontSize: 34, marginTop: 6 }}>{data.reduce((s, b) => s + b.biens_enregistres, 0)}</div></section>
        <section className="carte b4"><div className="etiquette">Abonnements actifs / mois</div><div className="chiffre" style={{ fontSize: 34, marginTop: 6 }}>{fcfa(totalMensuel)}</div></section>
      </div>
      <section className="carte">
        <Erreur message={statut.error && messageErreur(statut.error)} />
        <div className="tableau-boite"><table className="tableau">
          <thead><tr><th>Bailleur</th><th>Sites</th><th>Biens enregistrés</th><th className="nombre">Abonnement</th><th>Statut</th><th aria-label="Actions" /></tr></thead>
          <tbody>{data.map(b => (
            <tr key={b.id}>
              <td><b>{b.nom}</b><div className="petit muet">{b.ville}{b.statut === 'essai' && b.essai_fin ? ` · essai jusqu’au ${dateCourte(b.essai_fin)}` : ''}</div></td>
              <td>{b.sites}</td><td>{b.biens_enregistres}</td><td className="nombre">{fcfa(b.abonnement_mensuel)}</td>
              <td><Puce statut={b.statut} /></td>
              <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                {b.statut !== 'actif' && <button className="bouton discret" onClick={() => statut.mutate({ id: b.id, statut: 'actif' })}>Activer</button>}
                {b.statut !== 'suspendu' && <button className="bouton discret danger" onClick={() => window.confirm(`Suspendre ${b.nom} ? Ses équipes ne pourront plus que consulter.`) && statut.mutate({ id: b.id, statut: 'suspendu' })}>Suspendre</button>}
              </td>
            </tr>
          ))}</tbody>
        </table></div>
      </section>
      {nouveau && <NouveauBailleur onFermer={() => setNouveau(false)} />}
    </main>
  );
}
