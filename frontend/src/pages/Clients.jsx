// Fichier clients : recherche, filtres (fidèles, à éviter, impayés), fiche, et message WhatsApp aux anciens clients.
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MessageCircle, Search } from 'lucide-react';
import { api } from '../lib/api';
import { useSession } from '../lib/session';
import { dateCourte, fcfa } from '../lib/format';
import { ouvrirWhatsApp } from '../lib/partage';
import { Avatar, Chargement, Champ, Modale, Vide } from '../composants/Ui';
import { Badges, FicheClient } from '../composants/Clients';

const FILTRES = [['tous', 'Tous'], ['fideles', 'Fidèles'], ['impayes', 'Doivent de l’argent'], ['a_eviter', 'À éviter']];
const garder = { tous: () => true, fideles: c => c.bilan.fidele, impayes: c => c.bilan.reste > 0, a_eviter: c => c.statut === 'a_eviter' };

function MessageGroupe({ clients, onFermer }) {
  const { espace } = useSession();
  const [texte, setTexte] = useState(`Bonjour {nom}, des villas sont libres ce week-end chez ${espace?.nom || 'nous'}. Contactez-nous pour réserver !`);
  const [envoyes, setEnvoyes] = useState([]);
  const cibles = clients.filter(c => c.telephone && c.statut !== 'a_eviter');
  return (
    <Modale titre="Écrire à vos clients" onFermer={onFermer} actions={<button className="bouton" onClick={onFermer}>Terminé</button>}>
      <p className="petit muet" style={{ margin: 0 }}>WhatsApp s’ouvre client par client avec ce message ; {'{nom}'} est remplacé par son nom. Les clients signalés « à éviter » sont exclus.</p>
      <Champ label="Message"><textarea rows={3} value={texte} onChange={e => setTexte(e.target.value)} /></Champ>
      <div className="liste-lignes">
        {cibles.map(c => (
          <div key={c.id}>
            <Avatar nom={c.nom} taille={34} />
            <span style={{ flex: 1, minWidth: 0 }}><b>{c.nom}</b><div className="petit muet">{c.telephone}</div></span>
            <button type="button" className={'bouton' + (envoyes.includes(c.id) ? '' : ' principal')} onClick={() => { ouvrirWhatsApp(c.telephone, texte.replaceAll('{nom}', c.nom)); setEnvoyes([...envoyes, c.id]); }}>
              <MessageCircle size={15} />{envoyes.includes(c.id) ? 'Envoyé' : 'Envoyer'}
            </button>
          </div>
        ))}
        {!cibles.length && <Vide>Aucun client à contacter dans cette sélection.</Vide>}
      </div>
    </Modale>
  );
}

export default function Clients() {
  const { role } = useSession();
  const [q, setQ] = useState('');
  const [filtre, setFiltre] = useState('tous');
  const [fiche, setFiche] = useState(null);
  const [groupe, setGroupe] = useState(false);
  const { data = [], isLoading } = useQuery({ queryKey: ['clients'], queryFn: () => api.get('/clients').then(r => r.data) });
  if (isLoading) return <Chargement />;
  const recherche = q.trim().toLowerCase();
  const liste = data.filter(garder[filtre]).filter(c => !recherche || c.nom.toLowerCase().includes(recherche) || (c.telephone || '').replace(/\s/g, '').includes(recherche.replace(/\s/g, '')))
    .sort((a, b) => (b.bilan.dernier || '').localeCompare(a.bilan.dernier || '') || a.nom.localeCompare(b.nom));
  const compte = (k) => data.filter(garder[k]).length;
  return (
    <main className="page">
      <div className="tete-page">
        <div><div className="sur-titre">{data.length} clients · {compte('fideles')} fidèles</div><h1 className="titre-page">Clients</h1></div>
        {role !== 'comptable' && <button className="bouton" onClick={() => setGroupe(true)}><MessageCircle size={16} />Écrire aux clients</button>}
      </div>
      <div className="recherche-clients">
        <label className="champ-recherche"><Search size={17} /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Nom ou téléphone" aria-label="Rechercher un client" /></label>
        <div className="segment" role="tablist">
          {FILTRES.map(([k, v]) => <button key={k} type="button" role="tab" aria-selected={filtre === k} className={filtre === k ? 'actif' : ''} onClick={() => setFiltre(k)}>{v} <span className="muet">{compte(k)}</span></button>)}
        </div>
      </div>
      <section className="carte">
        {liste.length ? (
          <div className="liste-lignes">
            {liste.map(c => (
              <button key={c.id} type="button" className="ligne-client" onClick={() => setFiche(c.id)}>
                <Avatar nom={c.nom} taille={40} />
                <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                  <b>{c.nom}</b>
                  <div className="petit muet">{[c.telephone, c.bilan.sejours ? `${c.bilan.sejours} séjour${c.bilan.sejours > 1 ? 's' : ''}` : '', c.bilan.baux ? 'bail en cours' : '', c.bilan.dernier ? `dernier le ${dateCourte(c.bilan.dernier)}` : ''].filter(Boolean).join(' · ')}</div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}><Badges client={c} /></div>
                </span>
                <b className="chiffre" style={{ whiteSpace: 'nowrap' }}>{fcfa(c.bilan.paye)}</b>
              </button>
            ))}
          </div>
        ) : <Vide>{data.length ? 'Aucun client ne correspond.' : 'Vos clients apparaîtront ici dès la première réservation.'}</Vide>}
      </section>
      {fiche && <FicheClient clientId={fiche} onFermer={() => setFiche(null)} />}
      {groupe && <MessageGroupe clients={data.filter(garder[filtre])} onFermer={() => setGroupe(false)} />}
    </main>
  );
}
