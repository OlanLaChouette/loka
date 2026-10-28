// Page d'accueil publique (site web) : présente Loka et mène à la connexion ou à la création d'un espace.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart3, CalendarCheck, Camera, Check, ChevronDown, FileText, Building2, Menu, MessageCircle, ShieldCheck, Smartphone, Users, Wallet, WifiOff, X } from 'lucide-react';
import '../styles/vitrine.css';

const FONCTIONS = [
  { icone: CalendarCheck, titre: 'Réservations sans doublon', texte: 'Un planning par site. Loka refuse de louer deux fois la même nuit.' },
  { icone: Wallet, titre: 'Encaissements tracés', texte: 'Espèces, Mobile Money ou virement : chaque franc a son reçu numéroté.' },
  { icone: MessageCircle, titre: 'Photos et reçus par WhatsApp', texte: 'Les photos de la villa avant de réserver, puis le reçu PDF à votre logo : en un geste.' },
  { icone: Camera, titre: 'Dépenses avec photo', texte: 'Le gérant photographie le reçu ; vous acceptez ou refusez.' },
  { icone: BarChart3, titre: 'Bénéfice réel', texte: 'Encaissé, charges fixes, dépenses : votre bénéfice du mois, site par site.' },
  { icone: FileText, titre: 'Baux et loyers', texte: 'Contrats PDF, loyers en retard signalés, relance WhatsApp prête.' },
];

const ETAPES = [
  { titre: 'Créez votre espace', texte: 'Votre nom, votre entreprise, votre e-mail : deux minutes, sans engagement.' },
  { titre: 'Ajoutez sites et biens', texte: 'Une résidence, ses villas : V1 à V10 se créent en une fois.' },
  { titre: 'Invitez vos gérants', texte: 'Ils réservent et encaissent depuis leur téléphone. Vous suivez tout en direct.' },
];

const QUESTIONS = [
  ['Faut-il un ordinateur ?', 'Non. Loka fonctionne sur téléphone Android (application) et dans n’importe quel navigateur, sur téléphone comme sur ordinateur.'],
  ['Et quand le réseau coupe ?', 'Le gérant continue d’encaisser et de noter ses dépenses : tout part automatiquement au retour de la connexion.'],
  ['Mes gérants voient-ils tout ?', 'Non. Chaque gérant ne voit que les sites que vous lui confiez, et il ne peut pas changer vos prix. Les réductions au-delà de votre limite attendent votre accord.'],
  ['Mes données sont-elles protégées ?', 'Chaque bailleur est cloisonné dans la base de données elle-même : personne d’autre ne voit vos chiffres.'],
  ['Que se passe-t-il après 14 jours ?', 'Nous vous contactons pour activer l’abonnement. Vos données restent intactes.'],
];

function Telephone({ src, alt, className = '' }) {
  return <div className={'vt-tel ' + className}><img src={src} alt={alt} loading="lazy" width="585" height="1266" /></div>;
}

export default function Vitrine() {
  const [menu, setMenu] = useState(false);
  const [ouverte, setOuverte] = useState(0);
  return (
    <div className="vitrine">
      <header className="vt-entete">
        <div className="vt-cadre vt-entete-ligne">
          <Link to="/bienvenue" className="vt-marque"><img src="/logo.svg" width="32" height="32" alt="" />Loka</Link>
          <nav className={'vt-nav' + (menu ? ' ouvert' : '')} aria-label="Sections">
            <a href="#fonctions" onClick={() => setMenu(false)}>Fonctionnalités</a>
            <a href="#comment" onClick={() => setMenu(false)}>Comment ça marche</a>
            <a href="#tarif" onClick={() => setMenu(false)}>Tarif</a>
            <a href="#questions" onClick={() => setMenu(false)}>Questions</a>
            <Link to="/connexion" className="vt-nav-connexion">Se connecter</Link>
          </nav>
          <Link to="/inscription" className="vt-bouton petit masquer-petit">Essai gratuit</Link>
          <button type="button" className="vt-burger" onClick={() => setMenu(!menu)} aria-label={menu ? 'Fermer le menu' : 'Ouvrir le menu'} aria-expanded={menu}>{menu ? <X size={22} /> : <Menu size={22} />}</button>
        </div>
      </header>

      <main>
        <section className="vt-heros">
          <div className="vt-cadre vt-heros-grille">
            <div>
              <span className="vt-pastille">Villas meublées · appartements · baux</span>
              <h1>Vos biens, vos loyers, <em>vos chiffres.</em></h1>
              <p className="vt-chapeau">Loka réunit les réservations, les encaissements et les dépenses de tous vos sites. Vos gérants travaillent depuis leur téléphone, vous suivez tout en direct.</p>
              <div className="vt-actions">
                <Link to="/inscription" className="vt-bouton">Créer mon espace · 14 jours gratuits</Link>
                <Link to="/connexion" className="vt-bouton clair">J’ai déjà un compte</Link>
              </div>
              <ul className="vt-garanties">
                <li><Check size={16} />Sans engagement</li>
                <li><Check size={16} />Android et web</li>
                <li><Check size={16} />Formation à distance</li>
              </ul>
            </div>
            <div className="vt-heros-visuel" aria-hidden="true">
              <div className="vt-halo" />
              <Telephone src="/vitrine/terrain.webp" alt="" className="arriere" />
              <Telephone src="/vitrine/apercu.webp" alt="" className="avant" />
              <div className="vt-bulle b1"><Wallet size={18} />Paiement reçu · 54 000 F</div>
              <div className="vt-bulle b2"><CalendarCheck size={18} />B2 réservée · 2 nuits</div>
            </div>
          </div>
        </section>

        <section className="vt-bande">
          <div className="vt-cadre vt-bande-grille">
            <div><b>Plusieurs sites</b><span>un seul tableau de bord</span></div>
            <div><b>À la nuit et au mois</b><span>villas, appartements, baux</span></div>
            <div><b>Reçus PDF</b><span>à votre logo, par WhatsApp</span></div>
            <div><b>Hors connexion</b><span>le terrain ne s’arrête pas</span></div>
          </div>
        </section>

        <section id="fonctions" className="vt-section">
          <div className="vt-cadre">
            <div className="vt-titre-section">
              <span className="vt-surtitre">Fonctionnalités</span>
              <h2>Fini le cahier, les reçus perdus et les calculs du soir.</h2>
            </div>
            <div className="vt-fonctions">
              {FONCTIONS.map(({ icone: Icone, titre, texte }) => (
                <article key={titre} className="vt-fonction">
                  <span className="vt-icone"><Icone size={22} /></span>
                  <h3>{titre}</h3>
                  <p>{texte}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="vt-section vt-duo-section">
          <div className="vt-cadre vt-duo">
            <div className="vt-duo-visuel"><Telephone src="/vitrine/encaisser.webp" alt="Encaisser un séjour dans Loka" /><img className="vt-recu" src="/vitrine/recu.webp" alt="Reçu PDF généré par Loka" loading="lazy" /></div>
            <div>
              <span className="vt-surtitre">Pour vos gérants</span>
              <h2>Sur le terrain, trois boutons suffisent.</h2>
              <ul className="vt-liste">
                <li><Smartphone size={20} /><span><b>Réserver</b> un bien libre en quelques secondes, avec les réductions encadrées par vos règles.</span></li>
                <li><Wallet size={20} /><span><b>Encaisser</b> et envoyer le reçu au client sur WhatsApp.</span></li>
                <li><Camera size={20} /><span><b>Noter une dépense</b> avec la photo du reçu du fournisseur.</span></li>
                <li><WifiOff size={20} /><span>Même <b>sans réseau</b> : tout part dès que la connexion revient.</span></li>
              </ul>
            </div>
          </div>
        </section>

        <section className="vt-section">
          <div className="vt-cadre vt-duo inverse">
            <div>
              <span className="vt-surtitre">Pour vous, le propriétaire</span>
              <h2>Tout votre parc, d’un coup d’œil.</h2>
              <ul className="vt-liste">
                <li><BarChart3 size={20} /><span><b>Encaissé, occupation, bénéfice</b> du mois, site par site.</span></li>
                <li><Users size={20} /><span><b>Vos gérants en direct</b> : chaque réservation, paiement et dépense, au moment où il est fait.</span></li>
                <li><ShieldCheck size={20} /><span><b>Vous validez</b> les réductions hors limite et les dépenses, justificatif à l’appui.</span></li>
                <li><Building2 size={20} /><span><b>Gaz, Wi-Fi, gardiennage</b> : déclarés une fois, comptés chaque mois.</span></li>
              </ul>
            </div>
            <div className="vt-duo-visuel"><Telephone src="/vitrine/planning.webp" alt="Planning des réservations dans Loka" /></div>
          </div>
        </section>

        <section id="comment" className="vt-section vt-fonce">
          <div className="vt-cadre">
            <div className="vt-titre-section">
              <span className="vt-surtitre">Comment ça marche</span>
              <h2>Opérationnel le jour même.</h2>
            </div>
            <ol className="vt-etapes">
              {ETAPES.map((e, i) => (
                <li key={e.titre}><span className="vt-numero">{i + 1}</span><h3>{e.titre}</h3><p>{e.texte}</p></li>
              ))}
            </ol>
            <div className="vt-centre"><Link to="/inscription" className="vt-bouton blanc">Commencer maintenant</Link></div>
          </div>
        </section>

        <section id="tarif" className="vt-section">
          <div className="vt-cadre">
            <div className="vt-titre-section">
              <span className="vt-surtitre">Tarif</span>
              <h2>Un abonnement simple, selon votre parc.</h2>
            </div>
            <div className="vt-tarif">
              <div className="vt-tarif-carte">
                <span className="vt-pastille">14 jours gratuits</span>
                <div className="vt-prix"><small>dès</small> 25 000 <small>FCFA / mois</small></div>
                <p>Le montant dépend du nombre de biens enregistrés. Paiement mensuel ou annuel : l’année est facturée 10 mois au lieu de 12.</p>
                <ul>
                  <li><Check size={18} />Sites, biens et gérants illimités</li>
                  <li><Check size={18} />Application Android et site web</li>
                  <li><Check size={18} />Reçus et contrats PDF à votre logo</li>
                  <li><Check size={18} />Formation et assistance à distance (WhatsApp, Zoom, Meet)</li>
                </ul>
                <Link to="/inscription" className="vt-bouton">Essayer gratuitement</Link>
              </div>
            </div>
          </div>
        </section>

        <section id="questions" className="vt-section vt-gris">
          <div className="vt-cadre vt-etroit">
            <div className="vt-titre-section"><span className="vt-surtitre">Questions</span><h2>Vous vous demandez peut-être…</h2></div>
            <div className="vt-questions">
              {QUESTIONS.map(([q, r], i) => (
                <div key={q} className={'vt-question' + (ouverte === i ? ' ouverte' : '')}>
                  <button type="button" onClick={() => setOuverte(ouverte === i ? -1 : i)} aria-expanded={ouverte === i}>{q}<ChevronDown size={20} /></button>
                  {ouverte === i && <p>{r}</p>}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="vt-section">
          <div className="vt-cadre">
            <div className="vt-appel">
              <div>
                <h2>Prêt à y voir clair ?</h2>
                <p>Créez votre espace en deux minutes. Nous vous accompagnons à distance pour la mise en route.</p>
              </div>
              <div className="vt-actions">
                <Link to="/inscription" className="vt-bouton blanc">Créer mon espace</Link>
                <a href="https://wa.me/22662826702" className="vt-bouton contour" target="_blank" rel="noreferrer"><MessageCircle size={18} />Nous écrire</a>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="vt-pied">
        <div className="vt-cadre vt-pied-ligne">
          <span className="vt-marque petit"><img src="/logo.svg" width="24" height="24" alt="" />Loka</span>
          <span>Une application éditée par eYamTech · +226 62 82 67 02 · <a href="mailto:contact@eyamtech.com">contact@eyamtech.com</a></span>
          <Link to="/connexion">Se connecter</Link>
        </div>
      </footer>
    </div>
  );
}
