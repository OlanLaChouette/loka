import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Receipt } from 'lucide-react';
import { api } from '../lib/api';
import { useSession } from '../lib/session';
import { ajouterJours, aujourdhui, fcfa, dateLongue } from '../lib/format';
import { Chargement, Modale, Puce, Vide } from '../composants/Ui';
import { Encaisser, NouvelleDepense, NouvelleReservation, useBiens, useSites } from '../composants/Formulaires';

export default function Terrain() {
  const { utilisateur, role } = useSession();
  const auj = aujourdhui();
  const [fenetre, setFenetre] = useState(null);
  const [aEncaisser, setAEncaisser] = useState(null);
  const { data: biens = [], isLoading } = useBiens();
  const { data: sites = [] } = useSites();
  const { data: resas = [] } = useQuery({ queryKey: ['reservations', 'terrain'], queryFn: () => api.get('/reservations', { params: { du: ajouterJours(auj, -60), au: ajouterJours(auj, 2) } }).then(r => r.data) });
  if (isLoading) return <Chargement />;
  if (!biens.length) return (
    <main className="page" style={{ maxWidth: 720 }}>
      <div className="carte"><Vide>Aucun bien n’est encore enregistré sur vos sites.<br />Le propriétaire doit d’abord ajouter ses biens dans Loka ; ils apparaîtront ici aussitôt.</Vide></div>
    </main>
  );

  const actives = resas.filter(r => r.statut !== 'annulee');
  const occupe = (b) => actives.find(r => r.bien_id === b.id && r.arrivee <= auj && r.depart > auj);
  const biensNuit = biens.filter(b => b.mode === 'nuit');
  const libres = biensNuit.filter(b => b.etat === 'disponible' && !occupe(b));
  const mouvements = actives.filter(r => r.arrivee === auj || r.depart === auj);
  const nonSoldes = actives.filter(r => r.statut === 'confirmee' && r.total - r.paye > 0 && r.arrivee <= ajouterJours(auj, 1));
  const lecture = role === 'comptable';

  return (
    <main className="page" style={{ maxWidth: 720 }}>
      <div className="terrain-haut">
        <div className="petit" style={{ color: '#E4E0FF' }}>{dateLongue(new Date())} · {sites.map(s => s.nom).join(', ')}</div>
        <h1 style={{ fontSize: 22, marginTop: 4 }}>{libres.length} bien{libres.length > 1 ? 's' : ''} libre{libres.length > 1 ? 's' : ''} ce soir</h1>
        <div className="petit" style={{ color: '#E4E0FF', marginTop: 4 }}>Bonjour {utilisateur.nom.split(' ')[0]}</div>
        {!lecture && (
          <div className="terrain-actions">
            <button className="bouton blanc" onClick={() => setFenetre('resa')}>Réserver</button>
            <button className="bouton" onClick={() => setFenetre('encaisser')}>Encaisser</button>
            <button className="bouton" style={{ flex: '0 0 48px' }} onClick={() => setFenetre('depense')} aria-label="Noter une dépense"><Receipt size={20} /></button>
          </div>
        )}
      </div>

      {nonSoldes.length > 0 && (
        <section className="carte">
          <h2>À encaisser</h2>
          <div className="liste-lignes">
            {nonSoldes.map(r => (
              <div key={r.id}>
                <span style={{ flex: 1 }}><b>{r.Bien?.reference} · {r.Client?.nom}</b><div className="petit muet">Reste {fcfa(r.total - r.paye)}</div></span>
                {!lecture && <button className="bouton principal" onClick={() => setAEncaisser(r)}>Encaisser</button>}
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="carte">
        <h2>Aujourd’hui</h2>
        <div className="liste-lignes">
          {mouvements.map(r => (
            <div key={r.id}>
              <span className="avatar" style={{ borderRadius: 10, width: 44, height: 44 }}>{r.Bien?.reference}</span>
              <span style={{ flex: 1 }}><b>{r.arrivee === auj ? 'Arrivée' : 'Départ'} · {r.Client?.nom}</b><div className="petit muet">{r.nuits} nuit{r.nuits > 1 ? 's' : ''} · {fcfa(r.total)}</div></span>
              {r.total - r.paye > 0 ? <Puce ton="negatif">Reste {fcfa(r.total - r.paye)}</Puce> : <Puce ton="violet">Payé</Puce>}
            </div>
          ))}
          {!mouvements.length && <span className="muet">Aucune arrivée ni aucun départ aujourd’hui.</span>}
        </div>
      </section>

      <section className="carte">
        <h2>Biens</h2>
        <div className="liste-lignes">
          {biens.map(b => {
            const r = occupe(b);
            return (
              <div key={b.id}>
                <span className="chiffre" style={{ width: 46, fontSize: 20 }}>{b.reference}</span>
                <span style={{ flex: 1 }}><b style={{ fontWeight: 600 }}>{b.standing || b.type}{b.pieces ? ` · ${b.pieces} ch.` : ''}</b><div className="petit muet">{b.mode === 'nuit' ? fcfa(b.prix_nuit) + ' / nuit' : fcfa(b.prix_mois) + ' / mois'}</div></span>
                {b.etat !== 'disponible' ? <Puce statut={b.etat} /> : b.mode === 'mois' ? <Puce>Au mois</Puce> : r ? <Puce>Occupé</Puce> : <Puce ton="violet">Libre</Puce>}
              </div>
            );
          })}
        </div>
      </section>

      {fenetre === 'resa' && <NouvelleReservation onFermer={() => setFenetre(null)} />}
      {fenetre === 'depense' && <NouvelleDepense onFermer={() => setFenetre(null)} />}
      {fenetre === 'encaisser' && (
        <Modale titre="Quel séjour encaisser ?" onFermer={() => setFenetre(null)}>
          {nonSoldes.length ? (
            <div className="liste-lignes">
              {nonSoldes.map(r => (
                <button key={r.id} type="button" className="bouton" style={{ justifyContent: 'space-between', width: '100%' }} onClick={() => { setFenetre(null); setAEncaisser(r); }}>
                  <span>{r.Bien?.reference} · {r.Client?.nom}</span><b>{fcfa(r.total - r.paye)}</b>
                </button>
              ))}
            </div>
          ) : <Vide>Aucun séjour à encaisser. Créez d’abord une réservation.</Vide>}
        </Modale>
      )}
      {aEncaisser && <Encaisser reservation={aEncaisser} reste={aEncaisser.total - aEncaisser.paye} onFermer={() => setAEncaisser(null)} />}
    </main>
  );
}
