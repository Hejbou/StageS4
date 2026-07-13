# ChatIA — Backend Flask + MySQL

API REST pour l'application de transport mauritanienne.  
Inspirée de **Heetch**, **Careem** et des apps locales mauritaniennes.

---

## Stack

| Composant | Technologie |
|-----------|------------|
| Langage | Python 3.10+ |
| Framework | Flask 3.x |
| Base de données | MySQL 8.x |
| ORM | Flask-SQLAlchemy |
| Auth | JWT (Flask-JWT-Extended) |
| Mots de passe | bcrypt (Flask-Bcrypt) |
| CORS | Flask-CORS |
| Cartes / géocodage | Google Maps (optionnel) avec fallback table `locations` + Nominatim |

---

## Identifiant utilisateur

> Le numéro de téléphone mauritanien est utilisé comme **clé primaire** (8 chiffres).

| Opérateur | Préfixe |
|-----------|---------|
| Mauritel / Moov Africa | **2**xxxxxxx |
| Mattel | **3**xxxxxxx |
| Chinguitel | **4**xxxxxxx |

Exemples valides : `22345678`, `36789012`, `46001234`

---

## Installation

```bash
# 1. Aller dans le dossier backend
cd backend

# 2. Créer un environnement virtuel Python
python -m venv venv
venv\Scripts\activate          # Windows
# source venv/bin/activate     # Linux/Mac

# 3. Installer les dépendances
pip install -r requirements.txt

# 4. Configurer les variables d'environnement
copy .env.example .env
# Éditer .env avec vos identifiants MySQL

# 5. Créer la base de données MySQL (tables vides)
mysql -u root -p < database/schema.sql

# 6. Initialiser les tables + créer l'admin par défaut
#    (recrée les tables depuis les modèles SQLAlchemy — schema.sql
#    sert surtout de référence lisible du schéma)
python scripts/init_db.py

# 7. Peupler le catalogue de lieux (41 lieux de Nouakchott)
python scripts/seed_locations.py

# 8. Lancer le serveur
python run.py
```

L'API et le frontend statique sont servis sur : **http://localhost:5000**

---

## Endpoints API

### Auth (`/api/auth`)
| Méthode | URL | Description |
|---------|-----|-------------|
| POST | `/api/auth/register` | Inscription client ou chauffeur |
| POST | `/api/auth/login` | Connexion → JWT |
| POST | `/api/auth/refresh` | Renouveler le token (non consommé par le frontend actuel) |
| GET  | `/api/auth/me` | Profil connecté (non consommé par le frontend actuel) |
| POST | `/api/auth/lookup` | Retrouver un compte par nom |
| PUT  | `/api/auth/profile` | Modifier le profil |

### Courses (`/api/trips`)
| Méthode | URL | Description |
|---------|-----|-------------|
| POST | `/api/trips/` | Créer une course |
| GET  | `/api/trips/` | Lister les courses (filtrable par statut/téléphone) |
| GET  | `/api/trips/my` | Mes courses (JWT) |
| GET  | `/api/trips/<id>` | Détail d'une course |
| PUT  | `/api/trips/<id>/cancel` | Annuler |
| PUT  | `/api/trips/<id>/accept` | Chauffeur accepte (JWT) |
| PUT  | `/api/trips/<id>/complete` | Terminer la course (JWT) |

> Seuls `POST /api/trips/` et `PUT /api/trips/<id>/cancel` sont actuellement appelés par le frontend (`transport.js`). Les autres routes sont fonctionnelles mais destinées à un futur espace chauffeur/admin connecté aux vraies courses.

### Lieux (`/api/locations` — public, lecture seule)
| Méthode | URL | Description |
|---------|-----|-------------|
| GET | `/api/locations/` | Tous les lieux actifs (table `locations`, gérée depuis le dashboard admin) |
| GET | `/api/locations/nearby?lat=&lng=&radius_m=&type=` | Recherche de proximité (100–500 m) |

Gestion (créer/modifier/désactiver/supprimer) : voir `/api/admin/locations` ci-dessous.

### Maps (`/api/maps`)
| Méthode | URL | Description |
|---------|-----|-------------|
| GET | `/api/maps/autocomplete?q=` | Suggestions de lieux pendant la saisie |
| GET | `/api/maps/geocode?address=` | Texte libre → coordonnées GPS |
| GET | `/api/maps/distance?origin_lat=&origin_lng=&dest_lat=&dest_lng=` | Distance/durée routière |
| POST | `/api/maps/resolve` | Résout origine + destination en une fois (utilisé par le chat) |

### Admin (`/api/admin` — JWT + rôle admin requis)
| Méthode | URL | Description |
|---------|-----|-------------|
| GET | `/api/admin/stats` | Statistiques globales |
| GET | `/api/admin/users` | Liste des utilisateurs |
| DELETE | `/api/admin/users/<phone>` | Supprimer un utilisateur |
| PUT | `/api/admin/users/<phone>/toggle` | Activer/désactiver un compte |
| GET | `/api/admin/trips` | Liste des courses (filtrable) |
| GET | `/api/admin/locations` | Tous les lieux (actifs + désactivés) |
| POST | `/api/admin/locations` | Créer un lieu (reverse geocoding auto pour quartier/alias) |
| PUT | `/api/admin/locations/<id>` | Modifier un lieu |
| PUT | `/api/admin/locations/<id>/toggle` | Activer/désactiver un lieu |
| DELETE | `/api/admin/locations/<id>` | Supprimer un lieu (uniquement ceux ajoutés par un admin — le catalogue de base ne se supprime pas) |

> Le dashboard admin (`admin.js`) consomme aujourd'hui `users` et `locations` en direct depuis l'API. Le tableau de bord et la section "Courses" affichent encore des données locales (`localStorage`) — `GET /api/admin/stats`/`GET /api/admin/trips` existent côté backend mais ne sont pas encore branchés côté dashboard.

### Chauffeurs, Chat, Notifications (`/api/drivers`, `/api/chat`, `/api/notifications`)
Ces trois blueprints sont entièrement implémentés côté backend (modèles + routes JWT) mais **non consommés par le frontend actuel** : la recherche de chauffeur est simulée côté client (`transport.js`), l'historique de conversation reste en mémoire navigateur, et les notifications sont un système de toasts local. Ce sont des bases prêtes pour un futur espace chauffeur / historique serveur / notifications push, pas du code à supprimer à la légère.

---

## Tarification (MRU — Ouguiya mauritanien)

```
Prix = 100 MRU (base) + 50 MRU par tranche de 4 km complète
```

Formule fixe dans `app/utils/pricing.py::calculate_price()` (pas de surcharge horaire).

---

## Comptes

Seul le compte **admin** est créé automatiquement par `scripts/init_db.py`, à partir de `ADMIN_PHONE`/`ADMIN_PASSWORD`/`ADMIN_NAME` (voir `.env`) :

| Rôle | Téléphone (défaut) | Mot de passe (défaut) |
|------|-----------|-------------|
| Admin | 20000000 | admin123 |

Les comptes client/chauffeur se créent via `POST /api/auth/register` (page d'inscription du frontend) — il n'y a pas de jeu de données de test préchargé.
