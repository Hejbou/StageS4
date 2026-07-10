"""
Migre les lieux jusque-là câblés en dur dans frontend/js/poi-db.js vers la
table `locations` — source unique désormais partagée par le chat IA
(frontend, via /api/locations) et le géocodage backend.

Usage :
  cd backend
  python scripts/seed_locations.py

Rejouable sans risque : ne touche qu'à la table `locations` (vidée puis
réinsérée), aucune autre table n'est affectée.
"""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))

from app import create_app
from app.extensions import db
from app.models import Location

app = create_app()

# Transcrit fidèlement depuis frontend/js/poi-db.js (POIS[]) — même noms,
# mêmes types, mêmes coordonnées, mêmes alias.
LOCATIONS = [
    # ── Quartiers ──────────────────────────────────────────────
    {"name": "Ksar", "name_ar": "الكار", "name_ha": "الكار", "type": "quartier", "quartier": "Ksar",
     "lat": 18.0762, "lng": -15.9582,
     "aliases": ["ksar", "القصر", "الكار", "car", "le ksar", "quartier ksar"]},
    {"name": "Tevragh Zeina", "name_ar": "تيفرغ زين", "name_ha": "تيفرغ زين", "type": "quartier", "quartier": "Tevragh Zeina",
     "lat": 18.0890, "lng": -15.9680,
     "aliases": ["tevragh zeina", "tevragh", "tzvzeina", "tv zeina", "تيفرغ", "تيفرغ زين", "تفرغ زين", "tifrig"]},
    {"name": "Sebkha", "name_ar": "السبخة", "name_ha": "السبخة", "type": "quartier", "quartier": "Sebkha",
     "lat": 18.0600, "lng": -15.9740,
     "aliases": ["sebkha", "sébkha", "السبخه", "السبخة"]},
    {"name": "Arafat", "name_ar": "أرفات", "name_ha": "أرفات", "type": "quartier", "quartier": "Arafat",
     "lat": 18.0420, "lng": -16.0200,
     "aliases": ["arafat", "عرفات", "أرفات", "arfat"]},
    {"name": "El Mina", "name_ar": "المينة", "name_ha": "المينة", "type": "quartier", "quartier": "El Mina",
     "lat": 18.0820, "lng": -15.9950,
     "aliases": ["el mina", "elmina", "mina", "المين", "المينه", "المينة"]},
    {"name": "Dar Naim", "name_ar": "دار النعيم", "name_ha": "دار النعيم", "type": "quartier", "quartier": "Dar Naim",
     "lat": 18.1100, "lng": -15.9700,
     "aliases": ["dar naim", "darnaim", "دار نعيم", "دار النعيم"]},
    {"name": "Toujounine", "name_ar": "تجكجه", "name_ha": "تجكجه", "type": "quartier", "quartier": "Toujounine",
     "lat": 18.0350, "lng": -16.0400,
     "aliases": ["toujounine", "tujunin", "تجكجه", "تجكجة"]},
    {"name": "Riyad", "name_ar": "الرياض", "name_ha": "الرياض", "type": "quartier", "quartier": "Riyad",
     "lat": 18.0870, "lng": -15.9570,
     "aliases": ["riyad", "riyadh", "الرياض", "رياض"]},
    {"name": "Cinquième", "name_ar": "الخامسة", "name_ha": "الخامسة", "type": "quartier", "quartier": "Cinquième",
     "lat": 18.0650, "lng": -15.9820,
     "aliases": ["cinquième", "cinquieme", "5eme", "5ème", "الخامسة", "الخامسه", "خامسة"]},
    {"name": "Socogim", "name_ar": "سوكوجيم", "name_ha": "سوكوجيم", "type": "quartier", "quartier": "Tevragh Zeina",
     "lat": 18.0780, "lng": -15.9630,
     "aliases": ["socogim", "soco", "سوكوجيم", "سوكو"]},
    {"name": "PK 10", "name_ar": "بي كا 10", "name_ha": "PK 10", "type": "quartier", "quartier": "PK 10",
     "lat": 18.0540, "lng": -15.9550,
     "aliases": ["pk10", "pk 10", "pk-10", "بكا 10", "بي كا"]},
    {"name": "Centre-ville", "name_ar": "وسط المدينة", "name_ha": "وسط المدينة", "type": "quartier", "quartier": "Ksar",
     "lat": 18.0800, "lng": -15.9700,
     "aliases": ["centre ville", "centre-ville", "centre", "centreville", "وسط المدينه", "وسط المدينة", "وسط", "المركز"]},
    {"name": "Teyarett", "name_ar": "تيارت", "name_ha": "تيارت", "type": "quartier", "quartier": "Teyarett",
     "lat": 18.0910, "lng": -15.9600,
     "aliases": ["teyarett", "teyaret", "tayarett", "تيارت"]},

    # ── Marchés ────────────────────────────────────────────────
    {"name": "Marché Capitale", "name_ar": "سوق الكابيتال", "name_ha": "السوق", "type": "marche", "quartier": "Tevragh Zeina",
     "lat": 18.0798, "lng": -15.9650,
     "aliases": ["marché capitale", "marche capitale", "capitale", "souk capitale", "سوق الكابيتال", "كابيتال", "السوق الكبير", "السوق"]},
    {"name": "Marché de la Cinquième", "name_ar": "سوق الخامسة", "name_ha": "سوق الخامسة", "type": "marche", "quartier": "Cinquième",
     "lat": 18.0660, "lng": -15.9810,
     "aliases": ["marché cinquième", "marche 5", "سوق الخامسة", "سوق خامسة"]},
    {"name": "Marché de Riyad", "name_ar": "سوق الرياض", "name_ha": "سوق الرياض", "type": "marche", "quartier": "Riyad",
     "lat": 18.0875, "lng": -15.9560,
     "aliases": ["marché riyad", "سوق الرياض", "سوق رياض"]},
    {"name": "Marché d'Arafat", "name_ar": "سوق أرفات", "name_ha": "سوق أرفات", "type": "marche", "quartier": "Arafat",
     "lat": 18.0430, "lng": -16.0190,
     "aliases": ["marché arafat", "سوق أرفات", "سوق عرفات"]},

    # ── Hôpitaux & cliniques ─────────────────────────────────────
    {"name": "CHN (Hôpital National)", "name_ar": "المستشفى الوطني", "name_ha": "المستشفى", "type": "hopital", "quartier": "Ksar",
     "lat": 18.0759, "lng": -15.9638,
     "aliases": ["chn", "hôpital national", "hopital national", "centre hospitalier", "hôpital", "المستشفى الوطني", "المستشفى", "المصحة الوطنية", "مستشفى وطني"]},
    {"name": "Hôpital de l'Amitié", "name_ar": "مستشفى الصداقة", "name_ha": "مستشفى الصداقة", "type": "hopital", "quartier": "Tevragh Zeina",
     "lat": 18.0870, "lng": -15.9600,
     "aliases": ["hôpital amitié", "hopital amitie", "amitié", "مستشفى الصداقه", "مستشفى الصداقة", "الصداقة"]},
    {"name": "Centre Mère-Enfant", "name_ar": "مركز الأم والطفل", "name_ha": "مركز الأم والطفل", "type": "hopital", "quartier": "Tevragh Zeina",
     "lat": 18.0860, "lng": -15.9610,
     "aliases": ["centre mère enfant", "mère enfant", "cme", "مركز الام والطفل", "مركز الأم"]},
    {"name": "Polyclinique", "name_ar": "البولي كلينيك", "name_ha": "البولي كلينيك", "type": "hopital", "quartier": "Tevragh Zeina",
     "lat": 18.0880, "lng": -15.9670,
     "aliases": ["polyclinique", "poly clinique", "البوليكلينيك", "البولي كلينيك", "بولي"]},

    # ── Mosquées ─────────────────────────────────────────────────
    {"name": "Grande Mosquée de Nouakchott", "name_ar": "الجامع الكبير", "name_ha": "الجامع الكبير", "type": "mosquee", "quartier": "Ksar",
     "lat": 18.0777, "lng": -15.9618,
     "aliases": ["grande mosquée", "grande mosquee", "mosquée principale", "الجامع الكبير", "المسجد الكبير", "جامع كبير"]},
    {"name": "Mosquée Saoudienne", "name_ar": "مسجد السعودية", "name_ha": "مسجد السعودية", "type": "mosquee", "quartier": "Tevragh Zeina",
     "lat": 18.0890, "lng": -15.9640,
     "aliases": ["mosquée saoudienne", "mosquée saudiyya", "saudiyya", "مسجد السعوديه", "مسجد السعودية", "السعودية"]},
    {"name": "Mosquée Bilal", "name_ar": "مسجد بلال", "name_ha": "مسجد بلال", "type": "mosquee", "quartier": "Ksar",
     "lat": 18.0745, "lng": -15.9600,
     "aliases": ["mosquée bilal", "bilal", "مسجد بلال", "بلال"]},

    # ── Écoles & universités ───────────────────────────────────
    {"name": "Université de Nouakchott", "name_ar": "جامعة نواكشوط", "name_ha": "الجامعة", "type": "ecole", "quartier": "Tevragh Zeina",
     "lat": 18.0875, "lng": -15.9737,
     "aliases": ["université", "universite", "fac", "campus", "univ", "جامعة نواكشوط", "الجامعة", "الجامعه", "جامعه"]},
    {"name": "ISG (Institut Supérieur de Gestion)", "name_ar": "المعهد العالي للتسيير", "name_ha": "ISG", "type": "ecole", "quartier": "Tevragh Zeina",
     "lat": 18.0860, "lng": -15.9720,
     "aliases": ["isg", "institut supérieur", "institut gestion", "المعهد العالي", "معهد التسيير"]},
    {"name": "Lycée Technique", "name_ar": "الثانوية التقنية", "name_ha": "الثانوية التقنية", "type": "ecole", "quartier": "Ksar",
     "lat": 18.0740, "lng": -15.9620,
     "aliases": ["lycée technique", "lycee technique", "technique", "الثانوية التقنيه", "الثانوية التقنية"]},

    # ── Carrefours & points de repère ────────────────────────────
    {"name": "Carrefour Madrid", "name_ar": "كارفور مدريد", "name_ha": "كارفور مدريد", "type": "carrefour", "quartier": "Tevragh Zeina",
     "lat": 18.0850, "lng": -15.9650,
     "aliases": ["carrefour madrid", "madrid", "rondpoint madrid", "rond-point madrid", "كارفور مدريد", "مدريد"]},
    {"name": "Carrefour Chinguetti", "name_ar": "كارفور شنقيط", "name_ha": "كارفور شنقيط", "type": "carrefour", "quartier": "Ksar",
     "lat": 18.0780, "lng": -15.9730,
     "aliases": ["carrefour chinguetti", "chinguetti", "شنقيط", "كارفور شنقيط"]},
    {"name": "Carrefour KM5", "name_ar": "كارفور كيلومتر 5", "name_ha": "كيلو 5", "type": "carrefour", "quartier": "Sebkha",
     "lat": 18.0580, "lng": -15.9760,
     "aliases": ["km5", "km 5", "kilo 5", "kilomètre 5", "كيلومتر 5", "كيلو 5", "كيلو"]},
    {"name": "Stade de Nouakchott", "name_ar": "ملعب نواكشوط", "name_ha": "الملعب", "type": "carrefour", "quartier": "Tevragh Zeina",
     "lat": 18.0850, "lng": -15.9550,
     "aliases": ["stade", "stade olympique", "stade nouakchott", "ملعب", "الملعب", "ملعب نواكشوط"]},

    # ── Aéroport & transport ───────────────────────────────────
    {"name": "Aéroport Oumtounsy", "name_ar": "مطار أم تونسي", "name_ha": "المطار", "type": "autre", "quartier": "Dar Naim",
     "lat": 18.0985, "lng": -15.9494,
     "aliases": ["aéroport", "aeroport", "airport", "oumtounsy", "umtounsy", "مطار", "المطار", "مطار نواكشوط", "مطار أم تونسي"]},
    {"name": "Gare Routière", "name_ar": "محطة الحافلات", "name_ha": "المحطة", "type": "autre", "quartier": "Ksar",
     "lat": 18.0720, "lng": -15.9600,
     "aliases": ["gare routière", "gare routiere", "gare", "محطة الحافلات", "المحطة", "محطة"]},

    # ── Administration ───────────────────────────────────────────
    {"name": "Présidence de la République", "name_ar": "رئاسة الجمهورية", "name_ha": "الرئاسة", "type": "admin", "quartier": "Tevragh Zeina",
     "lat": 18.0875, "lng": -15.9597,
     "aliases": ["présidence", "presidence", "palais présidentiel", "رئاسة", "الرئاسة", "قصر الرئاسة"]},
    {"name": "Mairie de Nouakchott", "name_ar": "بلدية نواكشوط", "name_ha": "البلدية", "type": "admin", "quartier": "Ksar",
     "lat": 18.0762, "lng": -15.9632,
     "aliases": ["mairie", "municipalité", "بلدية", "البلدية", "بلدية نواكشوط"]},

    # ── Hôtels connus ────────────────────────────────────────────
    {"name": "Hôtel Marhaba", "name_ar": "فندق مرحبا", "name_ha": "فندق مرحبا", "type": "hotel", "quartier": "Tevragh Zeina",
     "lat": 18.0870, "lng": -15.9660,
     "aliases": ["marhaba", "hôtel marhaba", "hotel marhaba", "فندق مرحبا", "مرحبا"]},
    {"name": "Hôtel Monotel", "name_ar": "فندق مونوتيل", "name_ha": "مونوتيل", "type": "hotel", "quartier": "Tevragh Zeina",
     "lat": 18.0860, "lng": -15.9650,
     "aliases": ["monotel", "hôtel monotel", "فندق مونوتيل", "مونوتيل"]},

    # ── Stations-service ─────────────────────────────────────────
    {"name": "Station SOMELEC", "name_ar": "محطة سوميلك", "name_ha": "سوميلك", "type": "station", "quartier": "Ksar",
     "lat": 18.0755, "lng": -15.9655,
     "aliases": ["somelec", "station somelec", "محطة سوميلك", "سوميلك"]},
    {"name": "Station El Karazi", "name_ar": "محطة الكرازي", "name_ha": "الكرازي", "type": "station", "quartier": "Ksar",
     "lat": 18.0740, "lng": -15.9640,
     "aliases": ["el karazi", "karazi", "station karazi", "محطة الكرازي", "الكرازي"]},

    # ── Épiceries & commerces connus ─────────────────────────────
    {"name": "Épicerie Al Wilayat", "name_ar": "بقالة الولايات", "name_ha": "الولايات", "type": "autre", "quartier": "Tevragh Zeina",
     "lat": 18.0880, "lng": -15.9680,
     "aliases": ["al wilayat", "wilayat", "épicerie wilayat", "بقالة الولايات", "الولايات", "ولايات"]},
    {"name": "Supermarché Géant", "name_ar": "سوبرماركت جيان", "name_ha": "جيان", "type": "autre", "quartier": "Tevragh Zeina",
     "lat": 18.0890, "lng": -15.9700,
     "aliases": ["géant", "geant", "supermarché géant", "سوبرماركت جيان", "جيان"]},
]

with app.app_context():
    print("\nChatIA -- Migration des lieux vers la table `locations`")
    print("-" * 55)

    db.create_all()  # ne crée que les tables manquantes, ne touche pas aux autres

    existing = Location.query.count()
    if existing:
        print(f"Table locations : {existing} ligne(s) existante(s) -> vidage avant réinsertion")
        Location.query.delete()
        db.session.commit()

    for entry in LOCATIONS:
        db.session.add(Location(
            name=entry["name"], name_ar=entry["name_ar"], name_ha=entry["name_ha"],
            type=entry["type"], quartier=entry["quartier"],
            lat=entry["lat"], lng=entry["lng"], aliases=entry["aliases"],
            is_active=True,
        ))
    db.session.commit()

    print(f"OK - {len(LOCATIONS)} lieux insérés dans `locations`")
    print("\nAPI publique  : GET http://localhost:5000/api/locations/")
    print("API proximité : GET http://localhost:5000/api/locations/nearby?lat=..&lng=..\n")
