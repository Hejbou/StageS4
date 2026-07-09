"""
Initialise la base de données ChatIA.
Crée toutes les tables et insère l'admin par défaut.

Usage :
  cd backend
  python scripts/init_db.py
"""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))

from app import create_app
from app.extensions import db, bcrypt
from app.models import User

app = create_app()

with app.app_context():
    print("\nChatIA -- Initialisation de la base de donnees")
    print("-" * 50)

    # Drop all and recreate
    print("Suppression des anciennes tables...")
    db.drop_all()
    print("Creation des tables...")
    db.create_all()
    print("OK - Tables creees : users, drivers, chat_sessions, chat_messages, trips, notifications")

    # Seed admin user
    admin_phone = os.getenv("ADMIN_PHONE", "20000000")
    admin_pwd   = os.getenv("ADMIN_PASSWORD", "admin123")
    admin_name  = os.getenv("ADMIN_NAME",     "Administrateur ChatIA")

    pw_hash = bcrypt.generate_password_hash(admin_pwd).decode("utf-8")
    admin   = User(
        phone         = admin_phone,
        name          = admin_name,
        password_hash = pw_hash,
        role          = "admin",
        language      = "fr",
        is_active     = True,
    )
    db.session.add(admin)
    db.session.commit()

    print(f"\nAdmin cree :")
    print(f"  Telephone : +222 {admin_phone}")
    print(f"  Mot de passe : {admin_pwd}")
    print(f"\nLancer le serveur : python run.py")
    print(f"Frontend          : http://localhost:5000/\n")
