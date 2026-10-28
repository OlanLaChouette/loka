// Photos d'un bien : galerie (6 au plus), ajout depuis l'appareil photo ou la galerie, couverture,
// suppression, et envoi au client (WhatsApp…) en un geste.
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, ImagePlus, Send, Star, Trash2 } from 'lucide-react';
import { api, messageErreur } from '../lib/api';
import { useSession } from '../lib/session';
import { compresserImage } from '../lib/image';
import { partagerImages } from '../lib/partage';
import { fcfa } from '../lib/format';
import { Erreur, Modale, Vide } from './Ui';
import { useBiens } from './Formulaires';

export const PHOTOS_MAX = 6;

// Les photos sont protégées : on les télécharge avec la session, une fois, puis on les garde en mémoire.
function usePhoto(bienId, photoId) {
  return useQuery({
    queryKey: ['photo', photoId], staleTime: Infinity, gcTime: 30 * 60000,
    queryFn: async () => {
      const r = await api.get(`/fichiers/photo/${bienId}/${photoId}`, { responseType: 'blob' });
      return { blob: r.data, url: URL.createObjectURL(r.data) };
    },
  });
}

function Vignette({ bien, photoId, couverture, onOuvrir }) {
  const { data } = usePhoto(bien.id, photoId);
  return (
    <button type="button" className="photo-vignette" onClick={onOuvrir} aria-label="Agrandir la photo">
      {data ? <img src={data.url} alt="" /> : <span className="petit muet">…</span>}
      {couverture && <span className="photo-couverture"><Star size={12} />Couverture</span>}
    </button>
  );
}

function Visionneuse({ bien, index, setIndex, peutModifier, action }) {
  const photoId = bien.photos[index];
  const { data } = usePhoto(bien.id, photoId);
  const n = bien.photos.length;
  return (
    <div className="photo-visionneuse">
      <div className="photo-grande">
        {data && <img src={data.url} alt={`Photo ${index + 1} de ${bien.reference}`} />}
        {n > 1 && <>
          <button type="button" className="bouton-rond photo-fleche gauche" onClick={() => setIndex((index - 1 + n) % n)} aria-label="Photo précédente"><ChevronLeft size={20} /></button>
          <button type="button" className="bouton-rond photo-fleche droite" onClick={() => setIndex((index + 1) % n)} aria-label="Photo suivante"><ChevronRight size={20} /></button>
        </>}
        <span className="photo-compteur">{index + 1} / {n}</span>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" className="bouton" onClick={() => setIndex(null)}><ChevronLeft size={16} />Toutes les photos</button>
        {peutModifier && index > 0 && <button type="button" className="bouton" onClick={() => action.mutate({ quoi: 'couverture', photoId })}><Star size={16} />En couverture</button>}
        {peutModifier && <button type="button" className="bouton danger" style={{ marginLeft: 'auto' }} onClick={() => window.confirm('Supprimer cette photo ?') && action.mutate({ quoi: 'supprimer', photoId })}><Trash2 size={16} />Supprimer</button>}
      </div>
    </div>
  );
}

export function PhotosBien({ bienId, onFermer }) {
  const { role, espace } = useSession();
  const client = useQueryClient();
  const { data: biens = [] } = useBiens();
  const bien = biens.find(b => b.id === bienId);
  const [index, setIndex] = useState(null);
  const [envoi, setEnvoi] = useState('');
  const [partage, setPartage] = useState('');
  const peutModifier = role === 'proprietaire' || role === 'gerant';

  const ajouter = useMutation({
    mutationFn: async (fichiers) => {
      const place = PHOTOS_MAX - bien.photos.length;
      const liste = [...fichiers].slice(0, place);
      for (const [i, f] of liste.entries()) {
        setEnvoi(`Envoi ${i + 1} / ${liste.length}…`);
        const d = new FormData();
        d.append('photo', await compresserImage(f, { cote: 1600, qualite: 0.75 }));
        await api.post(`/biens/${bien.id}/photos`, d);
      }
      if (fichiers.length > place) throw new Error(`Seules ${place} photo(s) ont été ajoutées : ${PHOTOS_MAX} au plus par bien.`);
    },
    onSettled: () => { setEnvoi(''); client.invalidateQueries({ queryKey: ['biens'] }); },
  });
  const action = useMutation({
    mutationFn: ({ quoi, photoId }) => quoi === 'couverture' ? api.post(`/biens/${bien.id}/photos/${photoId}/couverture`) : api.delete(`/biens/${bien.id}/photos/${photoId}`),
    onSuccess: (r, { quoi }) => { client.invalidateQueries({ queryKey: ['biens'] }); setIndex(quoi === 'couverture' ? 0 : null); },
  });

  async function envoyer() {
    setPartage('Préparation…');
    try {
      const fichiers = await Promise.all(bien.photos.map(async (id, i) => {
        const d = client.getQueryData(['photo', id]) || await client.fetchQuery({ queryKey: ['photo', id], queryFn: async () => { const r = await api.get(`/fichiers/photo/${bien.id}/${id}`, { responseType: 'blob' }); return { blob: r.data, url: URL.createObjectURL(r.data) }; } });
        return new File([d.blob], `${bien.reference}-${i + 1}.${d.blob.type === 'image/png' ? 'png' : 'jpg'}`, { type: d.blob.type });
      }));
      const prix = bien.mode === 'nuit' ? `${fcfa(bien.prix_nuit)} / nuit` : `${fcfa(bien.prix_mois)} / mois`;
      const texte = [`${bien.Site?.nom || ''} · ${bien.reference}`, [bien.standing, bien.pieces ? `${bien.pieces} chambres` : ''].filter(Boolean).join(' · '), prix, espace?.nom].filter(Boolean).join('\n');
      const r = await partagerImages(fichiers, texte);
      setPartage(r === 'telecharge' ? 'Photos téléchargées : joignez-les dans WhatsApp.' : '');
    } catch (e) { setPartage(messageErreur(e)); }
  }

  if (!bien) return null;
  const n = bien.photos.length;
  return (
    <Modale titre={`Photos · ${bien.reference}`} onFermer={onFermer} actions={n > 0 && index === null && (
      <button type="button" className="bouton principal" onClick={envoyer} disabled={partage === 'Préparation…'}><Send size={16} />Envoyer au client</button>
    )}>
      <Erreur message={(ajouter.error || action.error) && messageErreur(ajouter.error || action.error)} />
      {partage && partage !== 'Préparation…' && <div className="info petit" role="status">{partage}</div>}
      {index !== null && n > 0 ? (
        <Visionneuse bien={bien} index={Math.min(index, n - 1)} setIndex={setIndex} peutModifier={peutModifier} action={action} />
      ) : (
        <>
          {n === 0 && !peutModifier && <Vide>Aucune photo pour ce bien.</Vide>}
          <div className="photo-grille">
            {bien.photos.map((id, i) => <Vignette key={id} bien={bien} photoId={id} couverture={i === 0 && n > 1} onOuvrir={() => setIndex(i)} />)}
            {peutModifier && n < PHOTOS_MAX && (
              <label className="photo-vignette photo-ajout">
                <ImagePlus size={26} />
                <span>{envoi || (n ? 'Ajouter' : 'Ajouter des photos')}</span>
                <input type="file" accept="image/*" multiple hidden disabled={!!envoi} onChange={e => { const choisis = [...e.target.files]; e.target.value = ''; if (choisis.length) ajouter.mutate(choisis); }} />
              </label>
            )}
          </div>
          <p className="petit muet" style={{ margin: 0 }}>{n} / {PHOTOS_MAX} photos{peutModifier ? ' · prises au téléphone ou choisies dans la galerie, réduites automatiquement.' : '.'}</p>
        </>
      )}
    </Modale>
  );
}
