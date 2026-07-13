-- ═══════════════════════════════════════════════════════════════════
--  ChatIA — Schéma MySQL complet
--  Base : chatBot_db
--  Tables : users, drivers, chat_sessions, chat_messages, trips, notifications, locations
-- ═══════════════════════════════════════════════════════════════════

CREATE DATABASE IF NOT EXISTS chatBot_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE chatBot_db;


-- ───────────────────────────────────────────────────────────────────
--  UTILISATEURS
--  Numéro mauritanien 8 chiffres, commence par 2, 3 ou 4.
-- ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    phone         VARCHAR(8)                         NOT NULL COMMENT 'Numéro mauritanien 8 chiffres',
    name          VARCHAR(100)                       NOT NULL,
    email         VARCHAR(150)                       NULL UNIQUE,
    password_hash VARCHAR(255)                       NOT NULL,
    role          ENUM('client','driver','admin')    NOT NULL DEFAULT 'client',
    language      ENUM('fr','ar','ha')               NOT NULL DEFAULT 'fr',
    is_active     BOOLEAN                            NOT NULL DEFAULT TRUE,
    created_at    DATETIME                           NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME                           NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (phone),
    INDEX idx_user_role  (role),
    INDEX idx_user_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Comptes utilisateurs (clients, chauffeurs, admins)';


-- ───────────────────────────────────────────────────────────────────
--  PROFILS CHAUFFEURS
-- ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS drivers (
    phone         VARCHAR(8)                         NOT NULL,
    vehicle_type  ENUM('taxi','minibus','moto','4x4') NOT NULL DEFAULT 'taxi',
    vehicle_plate VARCHAR(20)                        NOT NULL,
    vehicle_model VARCHAR(100)                       NULL,
    vehicle_color VARCHAR(40)                        NULL,
    vehicle_year  SMALLINT                           NULL,
    rating        DECIMAL(3,2)                       NOT NULL DEFAULT 5.00,
    total_trips   INT UNSIGNED                       NOT NULL DEFAULT 0,
    status        ENUM('offline','available','busy') NOT NULL DEFAULT 'offline',
    current_lat   DECIMAL(10,8)                      NULL,
    current_lng   DECIMAL(11,8)                      NULL,
    is_verified   BOOLEAN                            NOT NULL DEFAULT FALSE,
    created_at    DATETIME                           NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME                           NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (phone),
    CONSTRAINT fk_driver_user FOREIGN KEY (phone) REFERENCES users(phone) ON DELETE CASCADE,
    INDEX idx_driver_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Profils et véhicules des chauffeurs';


-- ───────────────────────────────────────────────────────────────────
--  SESSIONS DE CHAT
-- ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chat_sessions (
    id           INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    client_phone VARCHAR(8)    NULL COMMENT 'Client connecté (nullable pour sessions anonymes)',
    language     ENUM('fr','ar','ha') NOT NULL DEFAULT 'fr',
    summary      VARCHAR(255)  NULL COMMENT 'Premier message utilisateur (sert de titre)',
    status       ENUM('active','closed') NOT NULL DEFAULT 'active',
    started_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ended_at     DATETIME      NULL,

    PRIMARY KEY (id),
    CONSTRAINT fk_session_user FOREIGN KEY (client_phone) REFERENCES users(phone) ON DELETE SET NULL,
    INDEX idx_session_client (client_phone)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ───────────────────────────────────────────────────────────────────
--  MESSAGES DE CHAT
-- ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chat_messages (
    id         INT UNSIGNED      NOT NULL AUTO_INCREMENT,
    session_id INT UNSIGNED      NOT NULL,
    sender     ENUM('user','ai') NOT NULL,
    content    TEXT              NOT NULL,
    created_at DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    CONSTRAINT fk_msg_session FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE,
    INDEX idx_msg_session (session_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ───────────────────────────────────────────────────────────────────
--  COURSES (TRIPS)
-- ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS trips (
    id               VARCHAR(20)   NOT NULL COMMENT 'Format REQ-XXXXXX',
    session_id       INT UNSIGNED  NULL     COMMENT 'Session chat source',
    client_phone     VARCHAR(8)    NULL,
    driver_phone     VARCHAR(8)    NULL,

    origin           VARCHAR(300)  NOT NULL COMMENT 'Texte brut départ',
    destination      VARCHAR(300)  NOT NULL COMMENT 'Texte brut arrivée',
    origin_formatted VARCHAR(300)  NULL COMMENT 'Adresse formatée départ',
    dest_formatted   VARCHAR(300)  NULL COMMENT 'Adresse formatée arrivée',

    origin_lat       DECIMAL(10,8) NULL,
    origin_lng       DECIMAL(11,8) NULL,
    dest_lat         DECIMAL(10,8) NULL,
    dest_lng         DECIMAL(11,8) NULL,

    distance_km      DECIMAL(8,2)  NULL,
    duration_min     INT           NULL,

    estimated_price  DECIMAL(10,2) NOT NULL DEFAULT 100 COMMENT 'Prix calculé : 100 + 50/4km',
    final_price      DECIMAL(10,2) NULL     COMMENT 'Prix final après course',
    currency         VARCHAR(3)    NOT NULL DEFAULT 'MRU',

    status           ENUM('pending','accepted','completed','cancelled','refused')
                     NOT NULL DEFAULT 'pending',
    language         ENUM('fr','ar','ha') NOT NULL DEFAULT 'fr',
    cancel_reason    VARCHAR(255)  NULL,

    created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    accepted_at      DATETIME NULL,
    completed_at     DATETIME NULL,
    cancelled_at     DATETIME NULL,

    PRIMARY KEY (id),
    CONSTRAINT fk_trip_session FOREIGN KEY (session_id)
        REFERENCES chat_sessions(id) ON DELETE SET NULL,
    CONSTRAINT fk_trip_client  FOREIGN KEY (client_phone)
        REFERENCES users(phone) ON DELETE SET NULL,
    CONSTRAINT fk_trip_driver  FOREIGN KEY (driver_phone)
        REFERENCES users(phone) ON DELETE SET NULL,
    INDEX idx_trip_status       (status),
    INDEX idx_trip_client       (client_phone),
    INDEX idx_trip_created      (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Courses créées par le chatbot IA';


-- ───────────────────────────────────────────────────────────────────
--  NOTIFICATIONS
-- ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
    id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_phone  VARCHAR(8)   NOT NULL,
    title       VARCHAR(200) NOT NULL,
    message     TEXT         NOT NULL,
    type        ENUM('info','success','warning','danger') NOT NULL DEFAULT 'info',
    icon        VARCHAR(10)  NULL COMMENT 'Emoji icône',
    is_read     BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    CONSTRAINT fk_notif_user FOREIGN KEY (user_phone) REFERENCES users(phone) ON DELETE CASCADE,
    INDEX idx_notif_user   (user_phone),
    INDEX idx_notif_unread (user_phone, is_read)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ───────────────────────────────────────────────────────────────────
--  HIÉRARCHIE GÉOGRAPHIQUE — Ville -> Wilaya -> Moughataa -> Lieu
--  Nouveau système de gestion des lieux (espace admin), indépendant de
--  `locations` (`quartier`, `lat`, `lng`, etc., inchangée) qui reste la
--  seule source utilisée par le chat, le calcul du prix et la carte.
--  Une seule ville existe aujourd'hui (Nouakchott) ; la structure est
--  prête à en accueillir d'autres.
-- ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cities (
    id          INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    name        VARCHAR(100)  NOT NULL,
    name_ar     VARCHAR(100)  NULL,
    name_ha     VARCHAR(100)  NULL,
    created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    UNIQUE KEY uq_city_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Ville — racine de la hiérarchie géographique des lieux';

CREATE TABLE IF NOT EXISTS wilayas (
    id          INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    city_id     INT UNSIGNED  NOT NULL,
    name        VARCHAR(100)  NOT NULL,
    name_ar     VARCHAR(100)  NULL,
    name_ha     VARCHAR(100)  NULL,
    created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    CONSTRAINT fk_wilaya_city FOREIGN KEY (city_id) REFERENCES cities(id) ON DELETE CASCADE,
    INDEX idx_wilaya_city (city_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Wilaya — subdivision d''une Ville';

CREATE TABLE IF NOT EXISTS moughataas (
    id          INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    wilaya_id   INT UNSIGNED  NOT NULL,
    name        VARCHAR(100)  NOT NULL,
    name_ar     VARCHAR(100)  NULL,
    name_ha     VARCHAR(100)  NULL,
    lat         DECIMAL(10,8) NULL COMMENT 'Centroïde approximatif -- détection GPS <-> hiérarchie dans le formulaire Lieu',
    lng         DECIMAL(11,8) NULL COMMENT 'Centroïde approximatif -- détection GPS <-> hiérarchie dans le formulaire Lieu',
    created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    CONSTRAINT fk_moughataa_wilaya FOREIGN KEY (wilaya_id) REFERENCES wilayas(id) ON DELETE CASCADE,
    INDEX idx_moughataa_wilaya (wilaya_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Moughataa — subdivision d''une Wilaya, parent direct des Lieux';

-- ───────────────────────────────────────────────────────────────────
--  LIEUX (nouvelle hiérarchie) — saisis depuis la gestion "Lieux" de
--  l'espace admin. Indépendante de `locations` (catalogue historique
--  utilisé par le chat/le calcul du prix/la carte) : coexistence
--  volontaire tant que le chat n'a pas basculé sur cette table.
-- ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lieux (
    id            INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    moughataa_id  INT UNSIGNED  NOT NULL,
    name_fr       VARCHAR(150)  NOT NULL COMMENT 'Nom en français',
    name_ar       VARCHAR(150)  NOT NULL COMMENT 'Nom en arabe',
    names_ha      JSON          NULL     COMMENT 'Liste de noms en hassaniya (0..n)',
    type          ENUM('quartier','marche','hopital','clinique','mosquee','ecole','universite','carrefour','station','admin','hotel','autre')
                  NOT NULL DEFAULT 'autre',
    lat           DECIMAL(10,8) NOT NULL,
    lng           DECIMAL(11,8) NOT NULL,
    is_active     BOOLEAN       NOT NULL DEFAULT TRUE,
    created_by    VARCHAR(8)    NULL     COMMENT 'Téléphone de l''admin qui a créé le lieu',
    created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    CONSTRAINT fk_lieu_moughataa FOREIGN KEY (moughataa_id) REFERENCES moughataas(id) ON DELETE RESTRICT,
    CONSTRAINT fk_lieu_creator   FOREIGN KEY (created_by) REFERENCES users(phone) ON DELETE SET NULL,
    INDEX idx_lieu_moughataa (moughataa_id),
    INDEX idx_lieu_active    (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Lieux (nouvelle hiérarchie Ville/Wilaya/Moughataa) — gestion admin';


-- ───────────────────────────────────────────────────────────────────
--  LIEUX (POI) — source unique pour le chat IA ET le géocodage backend
--  Remplace le fichier statique frontend/js/poi-db.js et le
--  dictionnaire Python _NOUAKCHOTT_ZONES (jusque-là non synchronisés).
-- ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS locations (
    id          INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    name        VARCHAR(150)  NOT NULL COMMENT 'Nom canonique (français)',
    name_ar     VARCHAR(150)  NULL     COMMENT 'Nom en arabe',
    name_ha     VARCHAR(150)  NULL     COMMENT 'Nom en hassaniya',
    type        ENUM('quartier','marche','hopital','mosquee','ecole','carrefour','station','admin','hotel','autre')
                NOT NULL DEFAULT 'autre',
    quartier    VARCHAR(100)  NULL     COMMENT 'Quartier parent (regroupement pour les suggestions)',
    lat         DECIMAL(10,8) NOT NULL,
    lng         DECIMAL(11,8) NOT NULL,
    aliases     JSON          NULL     COMMENT 'Tableau de noms alternatifs / populaires (FR+AR+HA)',
    is_active   BOOLEAN       NOT NULL DEFAULT TRUE,
    created_by  VARCHAR(8)    NULL     COMMENT 'Téléphone de l''admin qui a créé le lieu',
    created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    CONSTRAINT fk_location_creator FOREIGN KEY (created_by) REFERENCES users(phone) ON DELETE SET NULL,
    INDEX idx_location_type     (type),
    INDEX idx_location_quartier (quartier),
    INDEX idx_location_active   (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Lieux/points de repère — chat IA (précision de localisation) et géocodage';


-- ───────────────────────────────────────────────────────────────────
--  CONFIGURATION LLM — table singleton (1 seule ligne, id=1)
--  Préparée à l'avance pour le futur provider LLM (voir nlu.js) : lue et
--  écrite uniquement par le dashboard admin pour l'instant, aucun
--  provider ne consomme encore ces valeurs.
-- ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS llm_settings (
    id                     INT UNSIGNED   NOT NULL,
    provider               VARCHAR(40)    NOT NULL DEFAULT 'rules' COMMENT 'rules | gemini | groq | openrouter | openai | anthropic | autre',
    model_name             VARCHAR(120)   NULL,
    api_key                VARCHAR(255)   NULL     COMMENT 'Jamais renvoyée en clair par l''API (voir to_dict)',
    temperature            DECIMAL(3,2)   NOT NULL DEFAULT 0.30,
    max_tokens             INT UNSIGNED   NOT NULL DEFAULT 512,
    system_prompt          TEXT           NULL,
    enabled_languages      JSON           NOT NULL,
    history_size           INT UNSIGNED   NOT NULL DEFAULT 6 COMMENT 'Nombre de derniers messages envoyés au LLM',
    strict_transport_mode  BOOLEAN        NOT NULL DEFAULT TRUE,
    updated_at             DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Configuration du futur provider LLM — singleton, non consommée avant intégration';
