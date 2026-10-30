# Loka — gestion locative multi-bailleurs (par eYamTech)

Loka gère des biens loués à la nuit (villas meublées) ou au mois (appartements, magasins) pour plusieurs bailleurs.
Chaque bailleur a son espace, ses sites, ses biens et ses gérants. Toi, tu administres la plateforme au-dessus.

| Dossier | Contenu |
|---|---|
| `backend/` | API Express + Sequelize + PostgreSQL |
| `frontend/` | Site React (Vite), aussi emballé en application Android (Capacitor) dans `frontend/android/` |
| `maquettes/` | Maquettes graphiques (canevas Design) |
| `video/` | Pub motion design et ses sources |

## Démarrer en local

1. Base de données : PostgreSQL 18 de la machine, réglé dans `backend/.env` (voir `backend/.env.example`).
   Première fois, ou pour repartir des données de démonstration :
   ```bash
   npm --prefix backend run db:seed
   ```
   (`db:creer` prépare la base sans données de démonstration.)
2. API : `npm --prefix backend start` → http://localhost:4100
3. Site : `npm --prefix frontend run dev` → http://localhost:5174

Comptes de démonstration : en tête de `backend/src/scripts/seed.js`.

Tests : `npm --prefix backend test`

## Séparation des bailleurs

Deux protections :
- le code filtre toujours par espace bailleur (et par sites pour un gérant) ;
- PostgreSQL applique lui-même la séparation (Row Level Security) : l'API se connecte avec un compte limité
  (`DB_APP_USER`) et chaque requête déclare son espace. Une requête mal filtrée ne voit rien d'un autre bailleur.
  `npm run db:creer` crée ce compte et ces règles ; le compte propriétaire (`DB_USER`) ne sert qu'aux scripts.

## Application Android (gérants)

Prérequis : Android Studio et un **JDK 21** (le projet Android ne compile pas avec Java 25).
```bash
npm --prefix frontend run build
cd frontend && npx cap sync android && npx cap open android
```
L'application appelle l'API indiquée par `VITE_API_URL` (`frontend/.env`, voir `.env.example`) au moment du `build`.

Sans réseau, l'application garde les encaissements et les dépenses (photos comprises) sur le téléphone et les envoie
au retour de la connexion, sans doublon. Les réservations demandent le réseau, pour ne jamais vendre deux fois la même nuit.

## Inscription en libre-service et e-mails

Un bailleur peut créer son espace depuis l'écran de connexion (« Créer mon espace ») : il reçoit un code à 6 chiffres
par e-mail, et son espace s'ouvre en essai de 14 jours. L'activation reste faite par l'administration Loka.
« Mot de passe oublié » fonctionne de la même façon pour tout compte qui a une adresse e-mail.

Les e-mails partent par l'API de Brevo (`BREVO_API_KEY`), depuis `COURRIEL_EXPEDITEUR` sous le nom `COURRIEL_NOM`.
Chaque nouvel espace est signalé à `ADMIN_COURRIEL`. Sans clé, en local, les e-mails s'affichent dans la console de l'API.

## Mise en ligne (gratuite)

- API et site : Render, offre gratuite (`render.yaml`). L'API s'appelle elle-même de 6 h à 23 h pour rester éveillée.
  La nuit, elle s'endort après 15 minutes sans visite ; la première ouverture prend alors plus d'une minute.
- Base : Neon, offre gratuite (0,5 Go). Les logos et photos y sont rangés, compressés sur le téléphone avant l'envoi.

Étapes : créer le projet Neon, connecter le dépôt dans Render (New → Blueprint), renseigner `DATABASE_URL`,
`FRONTEND_URL`, `VITE_API_URL` et `ADMIN_NOM` / `ADMIN_TELEPHONE` / `ADMIN_MOT_DE_PASSE`.
Au démarrage, l'API prépare la base et crée le compte d'administration (la console n'existe pas en offre gratuite).
