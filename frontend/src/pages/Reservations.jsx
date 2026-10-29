import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, messageErreur } from '../lib/api';
import { useSession } from '../lib/session';
import { DemandesEnAttente } from '../composants/Demandes';
import { DetailSejour } from '../composants/Sejour';
import { ajouterJours, aujourdhui, dateCourte, fcfa } from '../lib/format';
import { Chargement, Erreur, Modale, Puce, Vide } from '../composants/Ui';
import { Encaisser, NouvelleReservation, useBiens, useSites } from '../composants/Formulaires';

const JOURS = 14;
const LETTRES = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];

export default function Reservations() {
  const { role } = useSession();
  const [debut, setDebut] = useState(ajouterJours(aujourdhui(), -3));
  const fin = ajouterJours(debut, JOURS);
  const [nouvelle, setNouvelle] = useState(false);
  const [detail, setDetail] = useState(null);
  const { data: biens = [], isLoading } = useBiens();
  const { data: sites = [] } = useSites();
  const { data: resas = [] } = useQuery({ queryKey: ['reservations', debut], queryFn: () => api.get('/reservations', { params: { du: debut, au: fin } }).then(r => r.data) });
  const { data: enAttente = [] } = useQuery({ queryKey: ['reservations', 'attente'], queryFn: () => api.get('/reservations', { params: { statut: 'attente_validation' } }).then(r => r.data) });
  if (isLoading) return <Chargement />;

  const jours = Array.from({ length: JOURS }, (_, i) => ajouterJours(debut, i));
  const ecart = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);
  const auj = aujourdhui();

  return (
    <main className="page">
      <div className="tete-page">
        <div><div className="sur-titre">Location à la nuit</div><h1 className="titre-page">Réservations</h1></div>
        <div className="segment" role="group" aria-label="Période">
          <button type="button" onClick={() => setDebut(ajouterJours(debut, -7))} aria-label="Semaine précédente">‹</button>
          <button type="button" className="actif" onClick={() => setDebut(ajouterJours(aujourdhui(), -3))}>{dateCourte(debut)} → {dateCourte(ajouterJours(fin, -1))}</button>
          <button type="button" onClick={() => setDebut(ajouterJours(debut, 7))} aria-label="Semaine suivante">›</button>
        </div>
        {role !== 'comptable' && <button className="bouton principal" onClick={() => setNouvelle(true)}>+ Nouvelle réservation</button>}
      </div>

      <DemandesEnAttente />
      {enAttente.length > 0 && (
        <section className="carte" style={{ borderColor: 'var(--alerte)' }}>
          <h2>Réductions à valider</h2>
          <div className="liste-lignes">
            {enAttente.map(r => (
              <div key={r.id}>
                <span style={{ flex: 1 }}><b>{r.Bien?.reference} · {r.Client?.nom}</b><div className="petit muet">{dateCourte(r.arrivee)} → {dateCourte(r.depart)} · {r.reduction_motif}</div></span>
                <span className="chiffre" style={{ color: 'var(--negatif)' }}>− {fcfa(r.reduction)} ({Math.round(r.reduction / r.prix_normal * 100)} %)</span>
                <button className="bouton" onClick={() => setDetail(r)}>{role === 'proprietaire' ? 'Examiner' : 'Voir'}</button>
              </div>
            ))}
          </div>
        </section>
      )}

      {sites.map(s => {
        const liste = biens.filter(b => b.site_id === s.id && b.mode === 'nuit' && b.etat !== 'retire');
        if (!liste.length) return null;
        return (
          <section key={s.id} className="carte">
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 10, flexWrap: 'wrap' }}>
              <h2 style={{ flex: 1 }}>Planning · {s.nom}</h2>
              <span className="petit muet" style={{ display: 'flex', gap: 12 }}>
                <span><span className="puce violet" style={{ padding: '0 6px', marginRight: 4 }}>&nbsp;</span>Payé</span>
                <span><span className="puce alerte" style={{ padding: '0 6px', marginRight: 4 }}>&nbsp;</span>À valider</span>
              </span>
            </div>
            <div className="tableau-boite">
              <div className="planning" style={{ minWidth: 760 }}>
                <div className="ligne">
                  <span />
                  <div style={{ display: 'grid', gridTemplateColumns: `repeat(${JOURS}, 1fr)` }}>
                    {jours.map(j => <span key={j} className="petit" style={{ textAlign: 'center', fontWeight: j === auj ? 700 : 500, color: j === auj ? 'var(--violet-texte)' : 'var(--muet)' }}>{LETTRES[new Date(j + 'T00:00:00').getDay()]} {+j.slice(8)}</span>)}
                  </div>
                </div>
                {liste.map(b => (
                  <div className="ligne" key={b.id}>
                    <span style={{ fontWeight: 600, fontSize: 14 }}>{b.reference}{b.etat === 'travaux' && <span className="petit" style={{ color: 'var(--alerte)' }}> · travaux</span>}</span>
                    <div className="piste">
                      {resas.filter(r => r.bien_id === b.id && r.statut !== 'annulee').map(r => {
                        const g = Math.max(0, ecart(debut, r.arrivee));
                        const d = Math.min(JOURS, ecart(debut, r.depart));
                        if (d <= g) return null;
                        const classe = r.statut === 'attente_validation' ? 'attente' : r.paye < r.total ? 'impaye' : '';
                        return (
                          <button key={r.id} type="button" className={'sejour ' + classe} style={{ left: `calc(${g} * 100% / ${JOURS})`, width: `calc(${d - g} * 100% / ${JOURS} - 3px)` }} onClick={() => setDetail(r)} title={`${r.Client?.nom} · ${fcfa(r.total)}`}>
                            {r.Client?.nom}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <p className="petit muet" style={{ margin: '10px 0 0' }}>Les barres hachurées ne sont pas encore entièrement payées.</p>
          </section>
        );
      })}
      {!biens.some(b => b.mode === 'nuit') && <Vide>Aucun bien en location à la nuit.</Vide>}
      {nouvelle && <NouvelleReservation onFermer={() => setNouvelle(false)} />}
      {detail && <DetailSejour r={detail} onFermer={() => setDetail(null)} />}
    </main>
  );
}
