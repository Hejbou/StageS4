"""
ChatIA — Backend Flask
Entry point : python run.py

Pour démarrer :
  1. Créer la base MySQL :    mysql -u root < database/schema.sql
  2. Init tables + admin :    python scripts/init_db.py
  3. Lancer le serveur :      python run.py
  4. Ouvrir le frontend :     http://localhost:5000/
"""
import os
from dotenv import load_dotenv

load_dotenv()

from app import create_app

app = create_app()

if __name__ == "__main__":
    port  = int(os.getenv("APP_PORT", 5000))
    debug = os.getenv("FLASK_DEBUG", "1") == "1"
    print(f"\n  ChatIA API & Frontend  =>  http://localhost:{port}")
    print(f"  Sante                  =>  http://localhost:{port}/api/health")
    print(f"  Mode                   =>  {'DEBUG' if debug else 'PRODUCTION'}\n")
    app.run(host="0.0.0.0", port=port, debug=debug)
