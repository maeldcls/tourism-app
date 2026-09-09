# Sillage

Application web de tourisme permettant de découvrir des monuments et points d'intérêt, de les noter et commenter, de planifier des trajets/voyages (seul ou entre amis) et de recevoir des recommandations personnalisées grâce à un service d'IA (NLP).

## Sommaire

- [Objectif du projet](#objectif-du-projet)
- [Fonctionnalités](#fonctionnalités)
- [Architecture](#architecture)
- [Stack technique](#stack-technique)
- [Installation](#installation)
- [Configuration](#configuration)
- [Usage](#usage)
- [Structure du projet](#structure-du-projet)
- [Tests](#tests)
- [CI/CD](#cicd)
- [Documentation](#documentation)

## Objectif du projet

Ce projet a été réalisé dans le cadre d'une formation pour le titre profesionnel Concepteur et Développeur d'application sur une période d'environ 6 mois. Le but étant d'approfondir mes connaisances en développement, avec un code mieux structuré et SOLID ainsi que d'arriver à concevoir ce projet avec une analyse complète des besoins, choix de technologies, organisation...


Sillage est une application touristique visant à aider un utilisateur à explorer des monuments (musées, châteaux, sites historiques, nature...), à organiser ses visites sous forme de trajets, et à découvrir de nouveaux lieux via un moteur de recommandation basé sur l'analyse sémantique des descriptions et des goûts de l'utilisateur.

## Fonctionnalités

- **Authentification** : inscription/connexion classique + connexion via Google OAuth
- **Monuments** : consultation, recherche, photos, notes (ratings), commentaires modérés automatiquement (détection de toxicité multilingue)
- **Trajets (trips)** : création de trajets personnalisés avec étapes (monuments ou points personnalisés), collaboration à plusieurs (trip collaborators), photos de voyage
- **Amis** : système de demandes d'amis et notifications
- **Profil** : statistiques de visites, galerie de photos, profil public
- **Tags & thèmes** : classification thématique des monuments (musée, art, nature, médiéval, gastronomie...) via embeddings sémantiques
- **Recommandations** : suggestions de monuments basées sur la similarité sémantique (sentence-transformers)
- **Modération** : filtrage automatique des commentaires toxiques (Detoxify)
- **Administration** : gestion des monuments, photos, tags, destinations mises en avant

## Architecture

Le projet est composé de 4 services orchestrés via Docker Compose :

```
┌─────────────┐      ┌──────────────┐      ┌─────────────────┐
│  Frontend   │─────▶│   API REST   │─────▶│   PostgreSQL     │
│  (React)    │      │  (FastAPI)   │      │                  │
│  port 3000  │      │  port 8000   │      │  port 15432      │
└─────────────┘      └──────┬───────┘      └─────────────────┘
                             │
                             ▼
                      ┌──────────────┐
                      │ Service IA   │
                      │  (FastAPI)   │
                      │  port 8001   │
                      └──────────────┘
```

- **frontend** : Single Page Application React qui consomme l'API REST
- **api** : API REST FastAPI, logique métier principale (auth, monuments, trajets, amis, admin...), persistance PostgreSQL via SQLAlchemy/Alembic
- **ai** : microservice FastAPI dédié au NLP — génère des embeddings (sentence-transformers), calcule la similarité thématique et modère les commentaires (Detoxify)
- **db** : base de données PostgreSQL

Un script ETL (`backend/etl/import_osm.py`) permet également d'importer des monuments depuis des exports OpenStreetMap (.osm.pbf) avec résolution automatique des images (tags OSM, Wikipedia, Wikimedia Commons).

Pour le détail des modèles de données et des diagrammes UML, voir [Documentation](#documentation).

## Stack technique

**Backend**
- Python, FastAPI, SQLAlchemy, Alembic (migrations)
- PostgreSQL
- sentence-transformers (`all-MiniLM-L6-v2`) pour les embeddings sémantiques
- Detoxify (modèle multilingue) pour la modération de commentaires
- JWT (python-jose) + bcrypt pour l'authentification

**Frontend**
- React 19, React Router
- Leaflet / react-leaflet (cartographie)
- @react-oauth/google (connexion Google)
- @dnd-kit (drag & drop, ex. réorganisation des étapes d'un trajet)
- Axios

**Infra**
- Docker / Docker Compose
- GitHub Actions (CI/CD)

## Installation

### Prérequis

- [Docker](https://docs.docker.com/get-docker/) et Docker Compose
- Node.js ≥ 18 et Python ≥ 3.11 (uniquement pour un développement hors Docker)

### Option 1 — Avec Docker Compose (recommandé)

```bash
git clone <url-du-repo>
cd tourism-app
```

Créer un fichier `.env` à la racine (voir [Configuration](#configuration)), puis :

```bash
docker compose up --build
```

Cela démarre les 4 services :
- Frontend : http://localhost:3000
- API : http://localhost:8000
- Service IA : http://localhost:8001
- PostgreSQL : localhost:15432

### Option 2 — En local (développement)

**Backend API**
```bash
cd backend/api
python -m venv venv
venv\Scripts\activate          # Windows
pip install -r requirements.txt
alembic upgrade head
uvicorn main:app --reload --port 8000
```

**Service IA**
```bash
cd backend/ai
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8001
```

**Frontend**
```bash
cd frontend/tourism-frontend
npm install
npm start
```

## Configuration

Variables d'environnement attendues dans le fichier `.env` (racine du projet, utilisé par `docker-compose.yml`) :

| Variable | Description |
|---|---|
| `DATABASE_URL` | URL de connexion PostgreSQL (ex. `postgresql://postgres:admin@db:5432/tourism_app_db`) |
| `SECRET_KEY` | Clé secrète utilisée pour signer les tokens JWT |
| `GOOGLE_CLIENT_ID` | Client ID Google OAuth (côté API, pour valider les tokens) |
| `REACT_APP_GOOGLE_CLIENT_ID` | Client ID Google OAuth (côté frontend) |
| `REACT_APP_API_URL` | URL de l'API consommée par le frontend (ex. `http://localhost:8000`) |
| `ORS_API_KEY` | Clé API [OpenRouteService](https://openrouteservice.org/) utilisée pour le calcul d'itinéraires des trajets |



Pour le service IA (`tag_all_monuments.py`), une variable optionnelle `AI_SERVICE_URL` permet de pointer vers une autre instance (défaut : `http://localhost:8001`).

## Usage

Une fois les services démarrés :

1. Ouvrir http://localhost:3000
2. Créer un compte (ou se connecter via Google)
3. Parcourir les monuments, consulter leurs fiches, laisser une note/un commentaire
4. Créer un trajet et y ajouter des étapes (monuments existants ou points personnalisés)
5. Ajouter des amis et collaborer sur un trajet à plusieurs

La documentation interactive de l'API (Swagger) est disponible sur http://localhost:8000/docs.

### Import de données (optionnel)

Pour peupler la base à partir d'un export OpenStreetMap :

```bash
cd backend
python etl/import_osm.py "chemin/vers/export.osm.pbf"
```

Puis, pour générer les tags thématiques et embeddings des monuments importés :

```bash
cd backend/ai
python tag_all_monuments.py
```

## Structure du projet

```
tourism-app/
├── backend/
│   ├── api/                # API REST FastAPI (routes, modèles, migrations Alembic)
│   │   ├── routes/         # Endpoints (auth, monuments, trips, friends, admin...)
│   │   ├── services/       # Logique métier (photos, amis, trajets, visites)
│   │   ├── repositories/   # Accès aux données
│   │   └── migrations/     # Migrations Alembic
│   ├── ai/                 # Microservice NLP (recommandations, modération)
│   └── etl/                # Import de données OpenStreetMap
├── frontend/tourism-frontend/  # Application React
├── docker-compose.yml        # Environnement de développement
├── docker-compose.prod.yml   # Environnement de production
└── .github/workflows/        # Pipelines CI/CD
```

## Tests

```bash
# API
cd backend/api
pip install -r requirements-test.txt
pytest

# Service IA
cd backend/ai
pytest
```

```bash
# Frontend
cd frontend/tourism-frontend
npm test
```

## CI/CD

Le pipeline GitHub Actions (`.github/workflows/pipeline.yml`) :
1. Détecte les services modifiés (frontend / api / ai)
2. Lance les tests correspondants
3. Sur `main`, build et pousse les images Docker sur Docker Hub (`maeldcls/tourism-api`, `maeldcls/tourism-ai`, `maeldcls/tourism-frontend`)



## Documentation

Les diagrammes UML du projet (classes, MCD, MPD, séquence, déploiement, cas d'usage...) sont disponibles dans [`docs/uml/`](docs/uml/) au format PlantUML. Pour les visualiser, ouvrir le contenu d'un fichier `.puml` sur [PlantText](https://www.planttext.com/).

auteur : maeldcls
