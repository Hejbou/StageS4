-- ═══════════════════════════════════════════════════════════════════
--  NaqlaBot — Données initiales (seed)
--  À exécuter après schema.sql
--
--  ⚠️  Les localisations viennent de Google Maps, pas d'une table fixe.
--     Les courses ci-dessous ont des adresses textuelles + coordonnées
--     qui auraient été résolues par le geocodage Maps.
-- ═══════════════════════════════════════════════════════════════════

USE chatBot_db;

-- ───────────────────────────────────────────────────────────────────
--  UTILISATEURS DE TEST
--  Mots de passe : tous "Test1234" (bcrypt hash cost 12)
--  Hash bcrypt de "Test1234" :
--    $2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LeIgxeKzLCDOIB7Gy
--  Hash bcrypt de "Admin1234" :
--    $2b$12$8K1p/a7bSIiOLEn1pR.O6OeWXezXHqGJgQJXX8j0X7pPmlbgZMBQm
-- ───────────────────────────────────────────────────────────────────
INSERT INTO users (phone, name, email, password_hash, role, language) VALUES
-- Admin
('22000000', 'Admin NaqlaBot',  'admin@naqlabot.mr',
 '$2b$12$8K1p/a7bSIiOLEn1pR.O6OeWXezXHqGJgQJXX8j0X7pPmlbgZMBQm', 'admin', 'fr'),

-- Clients
('22111111', 'Fatimetou Mint Ahmed',    NULL,
 '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LeIgxeKzLCDOIB7Gy', 'client', 'ar'),
('36222222', 'Mohamed Vall Ould Sid',   NULL,
 '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LeIgxeKzLCDOIB7Gy', 'client', 'fr'),
('46333333', 'Mariem Mint Sidi',        NULL,
 '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LeIgxeKzLCDOIB7Gy', 'client', 'ha'),
('22444444', 'Cheikh Ould Brahim',      NULL,
 '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LeIgxeKzLCDOIB7Gy', 'client', 'fr'),
('36555555', 'Khadijetou Mint Moulaye', NULL,
 '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LeIgxeKzLCDOIB7Gy', 'client', 'ar'),

-- Chauffeurs
('22777001', 'Abdallahi Ould Isselmou', NULL,
 '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LeIgxeKzLCDOIB7Gy', 'driver', 'fr'),
('36777002', 'Ahmedou Ould Mokhtar',    NULL,
 '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LeIgxeKzLCDOIB7Gy', 'driver', 'ar'),
('46777003', 'Sidi Ould Baba',          NULL,
 '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LeIgxeKzLCDOIB7Gy', 'driver', 'ha'),
('22777004', 'Lemrabott Ould Yahya',    NULL,
 '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LeIgxeKzLCDOIB7Gy', 'driver', 'fr'),
('36777005', 'Mohameden Ould Ahmed',    NULL,
 '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LeIgxeKzLCDOIB7Gy', 'driver', 'fr');


-- ───────────────────────────────────────────────────────────────────
--  PROFILS CHAUFFEURS
-- ───────────────────────────────────────────────────────────────────
INSERT INTO drivers
  (phone, vehicle_type, vehicle_plate, vehicle_model, vehicle_color,
   vehicle_year, rating, total_trips, status, is_verified, current_lat, current_lng)
VALUES
('22777001', 'taxi',    'MR-4821-A', 'Toyota Corolla',     'Blanc',      2018, 4.80, 312, 'available', 1, 18.09200, -15.97400),
('36777002', 'taxi',    'MR-7743-B', 'Peugeot 504',        'Jaune',      2015, 4.65, 187, 'available', 1, 18.08700, -15.96800),
('46777003', 'minibus', 'MR-1190-C', 'Toyota Hiace',       'Blanc/Bleu', 2016, 4.72, 543, 'available', 1, 18.08100, -15.97000),
('22777004', 'taxi',    'MR-3356-D', 'Renault Logan',      'Gris',       2020, 4.91,  98, 'offline',   1,     NULL,       NULL),
('36777005', '4x4',     'MR-9812-E', 'Toyota Land Cruiser','Blanc',      2019, 4.88, 225, 'available', 1, 18.09500, -15.96100);


-- ───────────────────────────────────────────────────────────────────
--  COURSES D'EXEMPLE
--  Adresses résolues par Google Maps (lat/lng simulés pour le seed)
-- ───────────────────────────────────────────────────────────────────
INSERT INTO trips
  (id, client_phone, driver_phone,
   origin, destination,
   origin_formatted, destination_formatted,
   origin_place_id, dest_place_id,
   origin_lat, origin_lng, dest_lat, dest_lng,
   distance_km, duration_min,
   estimated_price, final_price, currency,
   status, language, accepted_at, completed_at)
VALUES
(
  'REQ-AAA001', '22111111', '22777001',
  'Tevragh Zeina', 'Ksar',
  'Tevragh Zeina, Nouakchott, Mauritanie', 'Ksar, Nouakchott, Mauritanie',
  'ChIJTZ0001TevreghZeina', 'ChIJTZ0002Ksar',
  18.09240, -15.97450,  18.08690, -15.97180,
  0.92, 4,
  80.00, 80.00, 'MRU',
  'completed', 'ar', NOW(), NOW()
),
(
  'REQ-AAA002', '36222222', '36777002',
  'Sebkha', 'Marché Capital',
  'Sebkha, Nouakchott, Mauritanie', 'Marché Capital, Ksar, Nouakchott, Mauritanie',
  'ChIJTZ0003Sebkha', 'ChIJTZ0004MarcheCapital',
  18.08150, -15.97350,  18.08800, -15.97300,
  1.55, 7,
  88.75, 88.75, 'MRU',
  'completed', 'fr', NOW(), NOW()
),
(
  'REQ-AAA003', '46333333', NULL,
  'Arafat', 'Université de Nouakchott',
  'Arafat, Nouakchott, Mauritanie', 'Université de Nouakchott Al-Asriya, Mauritanie',
  'ChIJTZ0005Arafat', 'ChIJTZ0006Universite',
  18.06700, -15.95200,  18.09500, -15.96300,
  4.05, 15,
  151.25, NULL, 'MRU',
  'pending', 'ha', NULL, NULL
),
(
  'REQ-AAA004', '22444444', '46777003',
  'Dar Naim', 'Aéroport de Nouakchott',
  'Dar Naim, Nouakchott, Mauritanie', 'Aéroport Oumtounsy, Nouakchott, Mauritanie',
  'ChIJTZ0007DarNaim', 'ChIJTZ0008Aeroport',
  18.10850, -15.96300,  18.09850, -15.94800,
  2.80, 10,
  120.00, 120.00, 'MRU',
  'completed', 'fr', NOW(), NOW()
),
(
  'REQ-AAA005', '36555555', NULL,
  'El Mina', 'Hôpital National',
  'El Mina, Nouakchott, Mauritanie', 'Centre Hospitalier National, Nouakchott, Mauritanie',
  'ChIJTZ0009ElMina', 'ChIJTZ0010Hopital',
  18.07600, -16.00200,  18.09000, -15.97400,
  5.80, 22,
  195.00, NULL, 'MRU',
  'pending', 'ar', NULL, NULL
);


-- ───────────────────────────────────────────────────────────────────
--  NOTES DES COURSES TERMINÉES
-- ───────────────────────────────────────────────────────────────────
INSERT INTO trip_ratings (trip_id, rated_by, rating, comment) VALUES
('REQ-AAA001', '22111111', 5, 'Excellent chauffeur, très ponctuel'),
('REQ-AAA002', '36222222', 4, 'Bien, voiture propre'),
('REQ-AAA004', '22444444', 5, 'Parfait, je recommande');


-- ───────────────────────────────────────────────────────────────────
--  NOTIFICATIONS D'EXEMPLE
-- ───────────────────────────────────────────────────────────────────
INSERT INTO notifications (user_phone, title, message, type, icon) VALUES
('22111111', 'Bienvenue dans NaqlaBot', 'Votre compte client est activé. Bonne course !', 'success', '🎉'),
('36222222', 'Bienvenue dans NaqlaBot', 'Votre compte client est activé. Bonne course !', 'success', '🎉'),
('46333333', 'Bienvenue dans NaqlaBot', 'Votre compte client est activé. Bonne course !', 'success', '🎉'),
('22777001', 'Compte vérifié', 'Votre profil chauffeur a été validé par l''équipe NaqlaBot.', 'success', '✅'),
('36777002', 'Compte vérifié', 'Votre profil chauffeur a été validé.', 'success', '✅'),
('46777003', 'Compte vérifié', 'Votre profil chauffeur a été validé.', 'success', '✅');
