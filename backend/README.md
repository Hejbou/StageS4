# NaqlaBot — Backend Flask + MySQL

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

# 5. Créer la base de données MySQL
mysql -u root -p < database/schema.sql

# 6. Initialiser les données (lieux + admin)
python scripts/init_db.py

# 7. Lancer le serveur
python run.py
```

L'API sera disponible sur : **http://localhost:5000**

---

## Endpoints API

### Auth
| Méthode | URL | Description |
|---------|-----|-------------|
| POST | `/api/auth/register` | Inscription client ou chauffeur |
| POST | `/api/auth/login` | Connexion → JWT |
| POST | `/api/auth/refresh` | Renouveler le token |
| GET  | `/api/auth/me` | Profil connecté |
| PUT  | `/api/auth/profile` | Modifier le profil |

### Courses
| Méthode | URL | Description |
|---------|-----|-------------|
| POST | `/api/trips/` | Créer une course |
| GET  | `/api/trips/` | Mes courses |
| GET  | `/api/trips/<id>` | Détail d'une course |
| GET  | `/api/trips/by-phone/<phone>` | Courses d'un client |
| PUT  | `/api/trips/<id>/cancel` | Annuler |
| PUT  | `/api/trips/<id>/accept` | Chauffeur accepte |
| PUT  | `/api/trips/<id>/complete` | Terminer la course |
| POST | `/api/trips/<id>/rate` | Noter 1-5 étoiles |

### Lieux (Nouakchott)
| Méthode | URL | Description |
|---------|-----|-------------|
| GET | `/api/locations/` | 18 zones de Nouakchott |
| GET | `/api/locations/search?q=ksar` | Recherche |
| GET | `/api/locations/<id>` | Détail d'un lieu |
| GET | `/api/locations/estimate?origin_id=1&dest_id=5` | Estimation prix |

### Chauffeurs
| Méthode | URL | Description |
|---------|-----|-------------|
| GET | `/api/drivers/available` | Chauffeurs disponibles |
| PUT | `/api/drivers/status` | Changer statut (offline/available) |
| PUT | `/api/drivers/location` | Mettre à jour GPS |
| PUT | `/api/drivers/<phone>/verify` | Admin valide un chauffeur |

### Chat (historique)
| Méthode | URL | Description |
|---------|-----|-------------|
| POST | `/api/chat/sessions` | Ouvrir une session |
| GET  | `/api/chat/sessions` | Mes sessions |
| POST | `/api/chat/sessions/<id>/messages` | Ajouter un message |
| GET  | `/api/chat/sessions/<id>/messages` | Historique |
| PUT  | `/api/chat/sessions/<id>/end` | Fermer la session |

### Notifications
| Méthode | URL | Description |
|---------|-----|-------------|
| GET | `/api/notifications/` | Mes notifications |
| PUT | `/api/notifications/<id>/read` | Marquer comme lu |
| PUT | `/api/notifications/read-all` | Tout marquer lu |

---

## Tarification (MRU — Ouguiya mauritanien)

```
Prix = max(50 + distance_km × 25, 80)
Surcharge nuit (22h–6h) : +20%
```

---

## Comptes de test

| Rôle | Téléphone | Mot de passe |
|------|-----------|-------------|
| Admin | 22000000 | Admin1234 |
| Client | 22111111 | Test1234 |
| Client | 36222222 | Test1234 |
| Chauffeur | 22777001 | Test1234 |
| Chauffeur | 36777002 | Test1234 |
| Chauffeur | 46777003 | Test1234 |
