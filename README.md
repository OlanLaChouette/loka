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

## Mise en ligne (Render)

`render.yaml` décrit l'API et le site. Créer d'abord une base PostgreSQL **dédiée à Loka**, renseigner `DATABASE_URL`,
puis lancer une fois `npm run db:creer` dans le Shell du service API.
Les logos et justificatifs sont stockés sur un disque persistant (`UPLOADS_DIR`).
