import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, messageErreur, urlFichier } from '../lib/api';
import { useSession } from '../lib/session';
import { Chargement, Champ, Erreur, Puce } from '../composants/Ui';

const CHAMPS = [
  ['nom', 'Nom de l’entreprise', true], ['forme_juridique', 'Forme juridique'], ['rccm', 'RCCM'], ['ifu', 'IFU'],
  ['adresse', 'Adresse', true], ['ville', 'Ville'], ['pays', 'Pays'], ['telephone', 'Téléphone'], ['email', 'E-mail'],
];

export default function Parametres() {
  const client = useQueryClient();
  const { recharger } = useSession();
  const { data, isLoading } = useQuery({ queryKey: ['profil'], queryFn: () => api.get('/profil').then(r => r.data) });
  const [f, setF] = useState(null);
  const [ok, setOk] = useState('');
  useEffect(() => { if (data) setF(data); }, [data]);
  const enregistrer = useMutation({
    mutationFn: () => api.patch('/profil', { ...Object.fromEntries(CHAMPS.map(([k]) => [k, f[k]])), limite_reduction_defaut: Number(f.limite_reduction_defaut) }),
    onSuccess: () => { client.invalidateQueries(); recharger(); setOk('Informations enregistrées.'); },
  });
  const logo = useMutation({
    mutationFn: (fichier) => { const d = new FormData(); d.append('logo', fichier); return api.post('/profil/logo', d); },
    onSuccess: () => { client.invalidateQueries(); recharger(); setOk('Logo mis à jour.'); },
  });
  if (isLoading || !f) return <Chargement />;
  return (
    <main className="page" style={{ maxWidth: 900 }}>
      <div className="tete-page">
        <div><div className="sur-titre">Ces informations figurent sur vos reçus et vos contrats</div><h1 className="titre-page">Votre entreprise</h1></div>
        <Puce statut={data.statut} />
      </div>
      {ok && <div className="info" role="status">{ok}</div>}
      <section className="carte" style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ width: 120, height: 120, borderRadius: 18, background: 'var(--champ)', border: '1px dashed var(--bord)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          {data.logo ? <img src={urlFichier(data.logo) + '?v=' + data.modifie_le} alt="Logo actuel" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', background: '#fff' }} /> : <span className="petit muet">Pas de logo</span>}
        </div>
        <div style={{ flex: 1, minWidth: 220 }}>
          <h2>Logo</h2>
          <p className="petit muet">PNG, JPEG ou WebP, 2 Mo maximum. Il apparaît dans l’application, sur les reçus et les contrats.</p>
          <Erreur message={logo.error && messageErreur(logo.error)} />
          <label className="bouton" style={{ cursor: 'pointer' }}>
            {logo.isPending ? 'Envoi…' : data.logo ? 'Changer le logo' : 'Ajouter un logo'}
            <input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={e => e.target.files[0] && logo.mutate(e.target.files[0])} />
          </label>
        </div>
      </section>
      <section className="carte">
        <Erreur message={enregistrer.error && messageErreur(enregistrer.error)} />
        <div className="grille-form" style={{ marginTop: enregistrer.error ? 12 : 0 }}>
          {CHAMPS.map(([k, label, plein]) => <Champ key={k} label={label} plein={plein}><input value={f[k] || ''} onChange={e => setF({ ...f, [k]: e.target.value })} /></Champ>)}
          <Champ label="Réduction maximale d’un gérant sans votre accord (%)" plein><input value={f.limite_reduction_defaut} onChange={e => setF({ ...f, limite_reduction_defaut: e.target.value.replace(/\D/g, '') })} inputMode="numeric" /></Champ>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
          <button className="bouton principal" disabled={!f.nom || enregistrer.isPending} onClick={() => { setOk(''); enregistrer.mutate(); }}>Enregistrer</button>
        </div>
      </section>
    </main>
  );
}
