import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, messageErreur } from '../lib/api';
import { useSession } from '../lib/session';
import { aujourdhui, dateCourte, fcfa, nomMois } from '../lib/format';
import { Chargement, Champ, Erreur, Modale, Puce, Vide } from '../composants/Ui';
import { Encaisser, useBiens } from '../composants/Formulaires';
import { messages, ouvrirPdf, ouvrirWhatsApp } from '../lib/partage';

function NouveauBail({ onFermer }) {
  const client = useQueryClient();
  const { data: biens = [] } = useBiens();
  const { data: baux = [] } = useQuery({ queryKey: ['baux'], queryFn: () => api.get('/baux').then(r => r.data) });
  const occupes = new Set(baux.filter(b => b.statut === 'actif').map(b => b.bien_id));
  const libres = biens.filter(b => b.mode === 'mois' && b.etat === 'disponible' && !occupes.has(b.id));
  const [f, setF] = useState({ bien_id: '', nom: '', telephone: '', debut: aujourdhui(), loyer: '', jour_echeance: 5, caution: '' });
  const maj = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const bien = libres.find(b => b.id === f.bien_id);
  const envoi = useMutation({
    mutationFn: () => api.post('/baux', { bien_id: f.bien_id, client: { nom: f.nom, telephone: f.telephone }, debut: f.debut, loyer: Number(f.loyer || bien?.prix_mois), jour_echeance: Number(f.jour_echeance), caution: Number(f.caution || 0) }),
    onSuccess: () => { client.invalidateQueries(); onFermer(); },
  });
  return (
    <Modale titre="Nouveau bail" onFermer={onFermer} actions={<><button className="bouton" onClick={onFermer}>Annuler</button><button className="bouton principal" disabled={!bien || !f.nom || envoi.isPending} onClick={() => envoi.mutate()}>Créer le bail</button></>}>
      <Erreur message={envoi.error && messageErreur(envoi.error)} />
      <div className="grille-form">
        <Champ label="Bien" plein>
          <select value={f.bien_id} onChange={e => { const b = libres.find(x => x.id === e.target.value); setF({ ...f, bien_id: e.target.value, loyer: b?.prix_mois || '', caution: b ? b.prix_mois * 2 : '' }); }}>
            <option value="">Choisir…</option>
            {libres.map(b => <option key={b.id} value={b.id}>{b.Site?.nom} · {b.reference} · {fcfa(b.prix_mois)} / mois</option>)}
          </select>
        </Champ>
        <Champ label="Locataire" plein><input value={f.nom} onChange={maj('nom')} /></Champ>
        <Champ label="Téléphone"><input value={f.telephone} onChange={maj('telephone')} inputMode="tel" /></Champ>
        <Champ label="Début"><input type="date" value={f.debut} onChange={maj('debut')} /></Champ>
        <Champ label="Loyer mensuel (FCFA)"><input value={f.loyer} onChange={maj('loyer')} inputMode="numeric" /></Champ>
        <Champ label="Jour d’échéance"><input value={f.jour_echeance} onChange={maj('jour_echeance')} inputMode="numeric" /></Champ>
        <Champ label="Caution (FCFA)" plein><input value={f.caution} onChange={maj('caution')} inputMode="numeric" /></Champ>
      </div>
      {!libres.length && <div className="info">Aucun bien au mois n’est libre. Ajoutez-en un dans « Biens ».</div>}
    </Modale>
  );
}

export default function Baux() {
  const { role, espace } = useSession();
  const mois = aujourdhui().slice(0, 7);
  const [nouveau, setNouveau] = useState(false);
  const [encaisser, setEncaisser] = useState(null);
  const { data: baux, isLoading } = useQuery({ queryKey: ['baux'], queryFn: () => api.get('/baux').then(r => r.data) });
  if (isLoading) return <Chargement />;
  const actifs = baux.filter(b => b.statut === 'actif');
  const payeMois = (b) => b.Paiements.filter(p => p.periode === mois).reduce((s, p) => s + p.montant, 0);
  const jour = Number(aujourdhui().slice(8));

  return (
    <main className="page">
      <div className="tete-page">
        <div><div className="sur-titre">Location au mois · loyers de {nomMois(mois)}</div><h1 className="titre-page">Baux</h1></div>
        {['proprietaire', 'gerant'].includes(role) && <button className="bouton principal" onClick={() => setNouveau(true)}>+ Nouveau bail</button>}
      </div>
      <section className="carte">
        {actifs.length ? (() => {
          // Même contenu en tableau (ordinateur) et en cartes (téléphone, où le tableau serait trop large).
          const lignes = actifs.map(b => {
            const paye = payeMois(b);
            // Premier loyer dû à la première échéance qui suit le début du bail.
            const du = b.debut <= `${mois}-${String(b.jour_echeance).padStart(2, '0')}`;
            const retard = du && jour >= b.jour_echeance && paye < b.loyer;
            const statut = paye >= b.loyer ? <Puce ton="violet">Payé</Puce> : !du ? <Puce>1er loyer le {b.jour_echeance} du mois prochain</Puce> : retard ? <Puce ton="negatif">En retard · reste {fcfa(b.loyer - paye)}</Puce> : <Puce>Échéance le {b.jour_echeance}</Puce>;
            const actions = <>
              <button className="bouton discret" onClick={() => ouvrirPdf(`/baux/${b.id}/contrat.pdf`)}>Contrat</button>
              {retard && b.Client?.telephone && role !== 'comptable' && <button className="bouton discret" onClick={() => ouvrirWhatsApp(b.Client.telephone, messages.relanceLoyer({ client: b.Client.nom, montant: b.loyer - paye, mois, bailleur: espace?.nom }))}>Relancer</button>}
              {paye < b.loyer && role !== 'comptable' && <button className="bouton" onClick={() => setEncaisser({ bail: b, reste: b.loyer - paye })}>Encaisser</button>}
            </>;
            return { b, statut, actions };
          });
          return <>
            <div className="tableau-boite masquer-mobile">
              <table className="tableau">
                <thead><tr><th>Bien</th><th>Locataire</th><th>Depuis</th><th className="nombre">Loyer</th><th>{nomMois(mois)}</th><th aria-label="Actions" /></tr></thead>
                <tbody>
                  {lignes.map(({ b, statut, actions }) => (
                    <tr key={b.id}>
                      <td><b className="chiffre">{b.Bien?.reference}</b></td>
                      <td>{b.Client?.nom}<div className="petit muet">{b.Client?.telephone}</div></td>
                      <td>{dateCourte(b.debut)}</td>
                      <td className="nombre">{fcfa(b.loyer)}</td>
                      <td>{statut}</td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{actions}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="liste-baux seulement-mobile">
              {lignes.map(({ b, statut, actions }) => (
                <div key={b.id} className="bail-carte">
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    <span className="avatar" style={{ borderRadius: 10, width: 44, height: 44 }}>{b.Bien?.reference}</span>
                    <span style={{ flex: 1, minWidth: 0 }}><b>{b.Client?.nom}</b><div className="petit muet">{b.Client?.telephone} · depuis le {dateCourte(b.debut)}</div></span>
                    <b className="chiffre" style={{ whiteSpace: 'nowrap' }}>{fcfa(b.loyer)}</b>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>{statut}<span style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>{actions}</span></div>
                </div>
              ))}
            </div>
          </>;
        })() : <Vide>Aucun bail en cours.</Vide>}
      </section>
      {nouveau && <NouveauBail onFermer={() => setNouveau(false)} />}
      {encaisser && <Encaisser bail={encaisser.bail} reste={encaisser.reste} periode={mois} onFermer={() => setEncaisser(null)} />}
    </main>
  );
}
