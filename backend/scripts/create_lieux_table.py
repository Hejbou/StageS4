"""
Étape 2 -- Crée la table `lieux` (nœud final de la hiérarchie
Ville -> Wilaya -> Moughataa -> Lieu), utilisée par la nouvelle gestion
des lieux de l'espace admin.

Ne crée que cette table (les autres -- cities/wilayas/moughataas --
existent déjà) ; ne touche à rien d'autre, en particulier pas à
`locations` (catalogue historique du chat/prix/carte).

Usage :
  cd backend
  python scripts/create_lieux_table.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))

from app import create_app
from app.extensions import db

app = create_app()

with app.app_context():
    db.create_all()  # ne crée que les tables manquantes (ici : `lieux`)
    print("OK - table `lieux` prête.")
