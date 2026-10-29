import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, messageErreur, urlFichier } from '../lib/api';
import { useSession } from '../lib/session';
import { Chargement, Champ, Erreur, Puce } from '../composants/Ui';
import { compresserImage } from '../lib/image';
import { partagerLien, SITE_PUBLIC } from '../lib/partage';

const CHAMPS = [
  ['nom', 'Nom de l’entreprise', true], ['forme_juridique', 'Forme juridique'], ['rccm', 'RCCM'], ['ifu', 'IFU'],
  ['adresse', 'Adresse', true], ['ville', 'Ville'], ['pays', 'Pays'], ['telephone', 'Téléphone'], ['email', 'E-mail'],
];
// Règles de séjour : affichées aux clients, appliquées aux clés, départs et annulations.
const REGLES = [
  ['heure_arrivee', 'Arrivées à partir de', 'time'], ['heure_depart', 'Départs avant', 'time'],
  ['acompte_pourcent', 'Acompte avant la remise des clés (%)'], ['delai_annulation_heures', 'Annulation gratuite jusqu’à (heures avant l’arrivée)'],
  ['penalite_nuits', 'Pénalité (annulation tardive, absence, départ en retard), en nuits'], ['tolerance_depart_minutes', 'Tolérance au départ (minutes)'],
  ['numero_paiement', 'Numéro Mobile Money pour les acomptes'], ['titulaire_paiement', 'Nom du titulaire de ce numéro'],
];

export default function Parametres() {
  const client = useQueryClient();
  const { recharger } = useSession();
  const { data, isLoading } = useQuery({ queryKey: ['profil'], queryFn: () => api.get('/profil').then(r => r.data) });
  const [f, setF] = useState(null);
  const [ok, setOk] = useState('');
  useEffect(() => { if (data) setF(data); }, [data]);
  const enregistrer = useMutation({
    mutationFn: () => api.patch('/profil', { ...Object.fromEntries(CHAMPS.map(([k]) => [k, f[k]])), ...Object.fromEntries(REGLES.map(([k]) => [k, f[k]])), limite_reduction_defaut: Number(f.limite_reduction_defaut) }),
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
          <p className="petit muet">PNG, JPEG ou WebP. L’image est réduite automatiquement. Il apparaît dans l’application, sur les reçus et les contrats.</p>
          <Erreur message={logo.error && messageErreur(logo.error)} />
          <label className="bouton" style={{ cursor: 'pointer' }}>
            {logo.isPending ? 'Envoi…' : data.logo ? 'Changer le logo' : 'Ajouter un logo'}
            <input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={async e => e.target.files[0] && logo.mutate(await compresserImage(e.target.files[0], { cote: 600, type: 'image/png' }))} />
          </label>
        </div>
      </section>
      {data.page && (
        <section className="carte page-publique">
          <div style={{ flex: 1, minWidth: 220 }}>
            <h2>Votre page publique</h2>
            <p className="petit muet" style={{ margin: '4px 0 0' }}>Vos villas publiées, avec photos et dates libres. Partagez-la sur Facebook, dans vos statuts et groupes WhatsApp : les clients vous envoient leurs demandes dans Loka.</p>
            <a className="lien-public" href={`${SITE_PUBLIC}/r/${data.page}`} target="_blank" rel="noreferrer">{SITE_PUBLIC.replace('https://', '')}/r/{data.page}</a>
          </div>
          <button type="button" className="bouton principal" onClick={() => partagerLien(`/r/${data.page}`, `Découvrez nos villas meublées à louer — ${data.nom}`)}>Partager</button>
        </section>
      )}
      <section className="carte">
        <Erreur message={enregistrer.error && messageErreur(enregistrer.error)} />
        <div className="grille-form" style={{ marginTop: enregistrer.error ? 12 : 0 }}>
          {CHAMPS.map(([k, label, plein]) => <Champ key={k} label={label} plein={plein}><input value={f[k] || ''} onChange={e => setF({ ...f, [k]: e.target.value })} /></Champ>)}
          <div className="plein" style={{ marginTop: 6 }}><h2 style={{ fontSize: 16 }}>Règles de séjour</h2><p className="petit muet" style={{ margin: '4px 0 0' }}>Affichées aux clients ; Loka les applique aux clés, aux départs et aux annulations.</p></div>
          {REGLES.map(([k, label, type]) => <Champ key={k} label={label}><input type={type || 'text'} value={f[k] ?? ''} onChange={e => setF({ ...f, [k]: e.target.value })} inputMode={type ? undefined : (/heure|pourcent|nuits|minutes/.test(k) ? 'numeric' : k === 'numero_paiement' ? 'tel' : undefined)} /></Champ>)}
          <Champ label="Réduction maximale d’un gérant sans votre accord (%)" plein><input value={f.limite_reduction_defaut} onChange={e => setF({ ...f, limite_reduction_defaut: e.target.value.replace(/\D/g, '') })} inputMode="numeric" /></Champ>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
          <button className="bouton principal" disabled={!f.nom || enregistrer.isPending} onClick={() => { setOk(''); enregistrer.mutate(); }}>Enregistrer</button>
        </div>
      </section>
    </main>
  );
}
