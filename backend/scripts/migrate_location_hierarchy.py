"""
Étape 1 -- Hiérarchie administrative géographique : Ville -> Wilaya ->
Moughataa (uniquement -- pas de Lieu, pas de migration des locations
existantes ; cette étape ne fait que préparer la structure).

Crée les tables `cities`, `wilayas`, `moughataas` et les remplit avec :

  Nouakchott
  ├── Nouakchott-Nord   -> Dar Naim, Teyarett, Toujounine
  ├── Nouakchott-Ouest  -> Tevragh Zeina, Ksar, Sebkha
  └── Nouakchott-Sud    -> Arafat, El Mina, Riyad

Ne crée aucun Lieu et ne touche à rien dans `locations` : le chat, le
calcul du prix, la carte et l'admin restent 100% inchangés.

Usage :
  cd backend
  python scripts/migrate_location_hierarchy.py

Rejouable sans risque : Ville/Wilayas/Moughataas sont récupérées si
elles existent déjà (get-or-create). Si une exécution précédente avait
ajouté la colonne `locations.moughataa_id` ou des moughataas hors de la
liste officielle ci-dessus, ce script les retire pour revenir strictement
à la portée demandée.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))

from sqlalchemy import inspect, text

from app import create_app
from app.extensions import db
from app.models import City, Wilaya, Moughataa

app = create_app()

# Structure administrative officielle demandée -- rien d'autre.
MOUGHATAA_WILAYA = {
    "Dar Naim":      "Nouakchott-Nord",
    "Teyarett":      "Nouakchott-Nord",
    "Toujounine":    "Nouakchott-Nord",
    "Tevragh Zeina": "Nouakchott-Ouest",
    "Ksar":          "Nouakchott-Ouest",
    "Sebkha":        "Nouakchott-Ouest",
    "Arafat":        "Nouakchott-Sud",
    "El Mina":       "Nouakchott-Sud",
    "Riyad":         "Nouakchott-Sud",
}

MOUGHATAA_NAME_AR = {
    "Dar Naim": "دار النعيم", "Teyarett": "تيارت", "Toujounine": "تجكجه",
    "Tevragh Zeina": "تيفرغ زين", "Ksar": "الكار", "Sebkha": "السبخة",
    "Arafat": "أرفات", "El Mina": "المينة", "Riyad": "الرياض",
}

WILAYA_NAME_AR = {
    "Nouakchott-Nord":  "نواكشوط الشمالية",
    "Nouakchott-Ouest": "نواكشوط الغربية",
    "Nouakchott-Sud":   "نواكشوط الجنوبية",
}


def get_or_create(model, defaults=None, **kwargs):
    inst = model.query.filter_by(**kwargs).first()
    if inst:
        return inst
    params = dict(kwargs)
    params.update(defaults or {})
    inst = model(**params)
    db.session.add(inst)
    db.session.flush()
    return inst


with app.app_context():
    print("\nChatIA -- Hiérarchie administrative Ville / Wilaya / Moughataa")
    print("-" * 65)

    db.create_all()  # crée cities / wilayas / moughataas si absentes

    # Corrige une exécution précédente qui avait (à tort) ajouté un lien
    # vers `locations` -- cette étape ne doit toucher à rien d'autre que
    # la hiérarchie administrative elle-même.
    inspector = inspect(db.engine)
    existing_cols = {c["name"] for c in inspector.get_columns("locations")}
    if "moughataa_id" in existing_cols:
        print("Retrait de locations.moughataa_id (hors de la portée de cette étape) ...")
        db.session.execute(text(
            "ALTER TABLE locations "
            "DROP FOREIGN KEY fk_location_moughataa, "
            "DROP INDEX idx_location_moughataa, "
            "DROP COLUMN moughataa_id"
        ))
        db.session.commit()
        print("OK - colonne retirée, `locations` inchangée")

    # 1) Ville
    nouakchott = get_or_create(City, name="Nouakchott",
                                defaults={"name_ar": "نواكشوط", "name_ha": "نواكشوط"})
    db.session.commit()

    # 2) Wilayas
    wilaya_rows = {}
    for w_name in ("Nouakchott-Nord", "Nouakchott-Ouest", "Nouakchott-Sud"):
        wilaya_rows[w_name] = get_or_create(
            Wilaya, city_id=nouakchott.id, name=w_name,
            defaults={"name_ar": WILAYA_NAME_AR[w_name]}
        )
    db.session.commit()

    # 3) Moughataas -- exactement les 9 demandées, rien de plus
    moughataa_rows = {}
    for m_name, w_name in MOUGHATAA_WILAYA.items():
        moughataa_rows[m_name] = get_or_create(
            Moughataa, wilaya_id=wilaya_rows[w_name].id, name=m_name,
            defaults={"name_ar": MOUGHATAA_NAME_AR.get(m_name)}
        )
    db.session.commit()

    # Retire toute moughataa hors de la liste officielle, laissée par une
    # exécution précédente (ex. "Cinquième", "Zaatar", "PK 10").
    extra = Moughataa.query.filter(~Moughataa.name.in_(MOUGHATAA_WILAYA.keys())).all()
    if extra:
        print("Retrait des moughataas hors périmètre (ajoutées précédemment à tort) : "
              + ", ".join(m.name for m in extra))
        for m in extra:
            db.session.delete(m)
        db.session.commit()

    print(f"OK - {len(wilaya_rows)} wilaya(s), {len(moughataa_rows)} moughataa(s) sous {nouakchott.name}")
    print("Aucun Lieu créé, `locations` totalement inchangée.")
    print("Terminé.\n")
