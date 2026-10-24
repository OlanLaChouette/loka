import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useSession } from '../lib/session';
import { dateLongue, fcfa, heure, initiales, montant, nomMois, aujourdhui } from '../lib/format';
import { Chargement, Erreur } from '../composants/Ui';
import { NouvelleReservation, useBiens } from '../composants/Formulaires';
import { MessageCircle } from 'lucide-react';
import { messages, ouvrirWhatsApp } from '../lib/partage';

const MOIS_LETTRE = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

function decalerMois(aaaamm, n) {
  const d = new Date(Date.UTC(+aaaamm.slice(0, 4), +aaaamm.slice(5, 7) - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

export default function Apercu() {
  const { utilisateur, role, espace } = useSession();
  const [mois, setMois] = useState(aujourdhui().slice(0, 7));
  const [resa, setResa] = useState(false);
  const { data: t, isLoading, error } = useQuery({ queryKey: ['tableau', mois], queryFn: () => api.get('/tableau-de-bord', { params: { mois } }).then(r => r.data) });
  const { data: biens = [] } = useBiens();
  if (isLoading) return <Chargement />;
  if (error) return <div className="page"><Erreur message="Impossible de charger le tableau de bord." /></div>;

  const maxBarre = Math.max(1, ...t.evolution.map(e => e.total));
  const precedent = t.evolution[10]?.total || 0;
  const variation = precedent ? Math.round((t.encaisse - precedent) / precedent * 100) : null;
  const refBien = (id) => biens.find(b => b.id === id)?.reference || '';
  const occ = t.occupation ?? 0;

  return (
    <main className="page">
      <div className="tete-page">
        <div>
          <div className="sur-titre">{dateLongue(new Date())}</div>
          <h1 className="titre-page">Bonjour {utilisateur.nom.split(' ')[0]}, voici vos biens.</h1>
        </div>
        <div className="segment" role="group" aria-label="Mois affiché">
          <button type="button" onClick={() => setMois(decalerMois(mois, -1))} aria-label="Mois précédent">‹</button>
          <button type="button" className="actif" style={{ textTransform: 'capitalize', minWidth: 130 }}>{nomMois(mois)}</button>
          <button type="button" onClick={() => setMois(decalerMois(mois, 1))} aria-label="Mois suivant" disabled={mois >= aujourdhui().slice(0, 7)}>›</button>
        </div>
        {role !== 'comptable' && <button className="bouton principal" onClick={() => setResa(true)}>+ Nouvelle réservation</button>}
      </div>

      <div className="blocs">
        <section className="carte b6" style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <h2 className="etiquette">Encaissé en {nomMois(mois).split(' ')[0]}</h2>
            {variation !== null && <span className={'puce ' + (variation >= 0 ? 'violet' : 'negatif')}>{variation >= 0 ? '+' : ''}{variation} %</span>}
          </div>
          <div className="chiffre" style={{ fontSize: 44, marginTop: 6 }}>{montant(t.encaisse)} <span className="muet" style={{ fontFamily: 'var(--police)', fontSize: 16, fontWeight: 500, letterSpacing: 0 }}>FCFA</span></div>
          <div className="barres" style={{ marginTop: 14 }} role="img" aria-label="Encaissements des 12 derniers mois">
            {t.evolution.map((e, i) => (
              <div key={e.mois} title={`${nomMois(e.mois)} : ${fcfa(e.total)}`}>
                <span className={'b' + (i === 11 ? ' courant' : '')} style={{ height: `${Math.round(e.total / maxBarre * 100)}%` }} />
                <span className="petit muet">{MOIS_LETTRE[+e.mois.slice(5, 7) - 1]}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="carte b3" style={{ background: 'var(--violet)', borderColor: 'var(--violet)', color: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <h2 className="etiquette" style={{ color: '#E4E0FF', alignSelf: 'flex-start' }}>Taux d’occupation</h2>
          <svg width="150" height="150" viewBox="0 0 150 150" role="img" aria-label={`${occ} pour cent d’occupation`} style={{ margin: '10px 0 4px' }}>
            <circle cx="75" cy="75" r="60" fill="none" stroke="rgba(255,255,255,.22)" strokeWidth="14" />
            <circle cx="75" cy="75" r="60" fill="none" stroke="#fff" strokeWidth="14" strokeLinecap="round" strokeDasharray={`${377 * occ / 100} 377`} transform="rotate(-90 75 75)" />
            <text x="75" y="85" textAnchor="middle" fontFamily="Sora" fontWeight="700" fontSize="32" fill="#fff">{t.occupation === null ? '–' : occ + ' %'}</text>
          </svg>
          <span className="petit" style={{ color: '#E4E0FF' }}>{t.nuits_vendues} nuits vendues sur {t.capacite_nuits}</span>
        </section>

        <section className="carte b3" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <h2 className="etiquette">Reste à encaisser</h2>
          <div className="chiffre" style={{ fontSize: 34, color: t.reste_a_encaisser ? 'var(--negatif)' : 'var(--texte)' }}>{montant(t.reste_a_encaisser)}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 'auto' }}>
            {t.impayes.slice(0, 3).map(i => (
              <div key={i.type + i.id} className="petit" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                <span style={{ flex: 1 }}>{i.type === 'loyer' ? 'Loyer · ' : 'Séjour · '}{i.reference || refBien(i.bien_id)}</span><b>{montant(i.montant)}</b>
                {i.telephone && role !== 'comptable' && (
                  <button type="button" className="bouton discret" style={{ minHeight: 28, padding: '2px 6px' }} aria-label={`Relancer ${i.client} par WhatsApp`}
                    onClick={() => ouvrirWhatsApp(i.telephone, i.type === 'loyer'
                      ? messages.relanceLoyer({ client: i.client, montant: i.montant, mois: i.mois, bailleur: espace?.nom })
                      : messages.relanceSejour({ client: i.client, montant: i.montant, bien: i.reference, bailleur: espace?.nom }))}>
                    <MessageCircle size={15} />
                  </button>
                )}
              </div>
            ))}
            {!t.impayes.length && <span className="petit muet">Tout est encaissé.</span>}
          </div>
          <Link className="bouton" to="/argent">Voir le détail</Link>
        </section>

        <section className="carte b5" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <h2>Vos sites</h2>
          {t.sites.map(s => (
            <div key={s.id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, gap: 10 }}>
                <span style={{ fontWeight: 600 }}>{s.nom}</span>
                <span className="muet">
                  {s.biens_nuit > 0 && `${s.biens_nuit} à la nuit · ${s.occupation ?? 0} %`}
                  {s.biens_nuit > 0 && s.baux_actifs > 0 && ' · '}
                  {s.baux_actifs > 0 && `${s.loyers_payes}/${s.baux_actifs} loyers`}
                </span>
              </div>
              <div className="jauge"><span style={{ width: `${s.biens_nuit ? s.occupation ?? 0 : (s.baux_actifs ? s.loyers_payes / s.baux_actifs * 100 : 0)}%`, background: s.biens_nuit ? 'var(--violet)' : 'var(--inverse)' }} /></div>
            </div>
          ))}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginTop: 'auto', paddingTop: 6, borderTop: '1px solid var(--bord)' }}>
            <div><div className="petit muet">Charges</div><b>{montant(t.charges)}</b></div>
            <div><div className="petit muet">Dépenses</div><b>{montant(t.depenses)}</b></div>
            <div><div className="petit muet">Bénéfice</div><b style={{ color: t.benefice >= 0 ? 'var(--violet-texte)' : 'var(--negatif)' }}>{montant(t.benefice)}</b></div>
          </div>
        </section>

        <section className="carte b7" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <h2>En direct de vos gérants</h2>
            {(t.a_traiter.depenses + t.a_traiter.reductions) > 0 && <Link to="/argent?onglet=depenses" className="puce alerte" style={{ textDecoration: 'none' }}>{t.a_traiter.depenses + t.a_traiter.reductions} à traiter</Link>}
          </div>
          <div className="liste-lignes">
            {t.fil.map((f, i) => (
              <div key={i}>
                <span className="petit muet" style={{ width: 44 }}>{heure(f.quand)}</span>
                <span className="avatar">{initiales(f.qui)}</span>
                <span style={{ flex: 1, fontSize: 14 }}><b style={{ fontWeight: 600 }}>{f.qui?.split(' ')[0]}</b> {f.texte}{f.details?.categorie ? ' · ' + f.details.categorie : ''}</span>
                <span className="chiffre" style={{ fontSize: 14 }}>{f.details?.montant ? (/dépense/.test(f.texte) ? '− ' : '') + montant(f.details.montant) : f.details?.reduction ? '− ' + montant(f.details.reduction) : ''}</span>
              </div>
            ))}
            {!t.fil.length && <span className="muet">Aucune activité pour l’instant.</span>}
          </div>
        </section>
      </div>
      {resa && <NouvelleReservation onFermer={() => setResa(false)} />}
    </main>
  );
}
