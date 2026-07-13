"""
Ajoute les colonnes `lat`/`lng` (centroïde) à `moughataas` et renseigne
les 9 moughataas officielles avec un point de référence approximatif.

Sert uniquement à la détection automatique Wilaya/Moughataa <-> GPS dans
le formulaire "Ajouter un lieu" (nearest-centroid) -- ne touche à rien
d'autre (`locations`, le chat, le prix, la carte restent inchangés).

Usage :
  cd backend
  python scripts/add_moughataa_centroids.py

Rejouable sans risque : ajoute la colonne seulement si absente, et ne
(re)renseigne que les moughataas dont lat/lng sont encore vides.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))

from sqlalchemy import inspect, text

from app import create_app
from app.extensions import db
from app.models import Moughataa

app = create_app()

# Centroïdes approximatifs (mêmes valeurs que celles utilisées à l'origine
# pour ces mêmes zones dans le catalogue historique `locations`).
CENTROIDS = {
    "Ksar":          (18.0762, -15.9582),
    "Tevragh Zeina": (18.0890, -15.9680),
    "Sebkha":        (18.0600, -15.9740),
    "Toujounine":    (18.0350, -16.0400),
    "Dar Naim":      (18.1100, -15.9700),
    "Teyarett":      (18.0910, -15.9600),
    "Arafat":        (18.0420, -16.0200),
    "Riyad":         (18.0870, -15.9570),
    "El Mina":       (18.0820, -15.9950),
}

with app.app_context():
    print("\nChatIA -- Centroïdes des moughataas (détection GPS <-> hiérarchie)")
    print("-" * 70)

    inspector = inspect(db.engine)
    existing_cols = {c["name"] for c in inspector.get_columns("moughataas")}
    if "lat" not in existing_cols:
        print("Ajout des colonnes moughataas.lat / moughataas.lng ...")
        db.session.execute(text(
            "ALTER TABLE moughataas "
            "ADD COLUMN lat DECIMAL(10,8) NULL, "
            "ADD COLUMN lng DECIMAL(11,8) NULL"
        ))
        db.session.commit()
        print("OK - colonnes ajoutées")
    else:
        print("Colonnes lat/lng déjà présentes -- rien à faire")

    updated = 0
    for m in Moughataa.query.all():
        if m.lat is not None and m.lng is not None:
            continue
        centroid = CENTROIDS.get(m.name)
        if not centroid:
            print(f"ATTENTION -- pas de centroïde connu pour {m.name!r}, laissé vide")
            continue
        m.lat, m.lng = centroid
        updated += 1
    db.session.commit()

    print(f"OK - {updated} moughataa(s) renseignée(s) avec un centroïde")
    print("Terminé.\n")
