import os
from flask import Flask, send_from_directory
from .config     import Config
from .extensions import db, cors, bcrypt, jwt

# Frontend directory (../frontend relative to this file)
_FRONTEND = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "frontend")
)


def create_app(config_class=Config):
    app = Flask(
        __name__,
        static_folder=_FRONTEND,
        static_url_path="",
    )
    app.config.from_object(config_class)

    # ── Extensions ──────────────────────────────────────────
    db.init_app(app)
    bcrypt.init_app(app)
    jwt.init_app(app)
    cors.init_app(app, resources={
        r"/api/*": {
            "origins":            app.config["CORS_ORIGINS"],
            "supports_credentials": True,
        }
    })

    # ── API Blueprints ───────────────────────────────────────
    from .routes.auth          import auth_bp
    from .routes.trips         import trips_bp
    from .routes.maps          import maps_bp
    from .routes.chat          import chat_bp
    from .routes.drivers       import drivers_bp
    from .routes.notifications import notif_bp
    from .routes.admin         import admin_bp
    from .routes.locations     import locations_bp

    app.register_blueprint(auth_bp,   url_prefix="/api/auth")
    app.register_blueprint(trips_bp,  url_prefix="/api/trips")
    app.register_blueprint(maps_bp,   url_prefix="/api/maps")
    app.register_blueprint(chat_bp,   url_prefix="/api/chat")
    app.register_blueprint(drivers_bp,url_prefix="/api/drivers")
    app.register_blueprint(notif_bp,  url_prefix="/api/notifications")
    app.register_blueprint(admin_bp,  url_prefix="/api/admin")
    app.register_blueprint(locations_bp, url_prefix="/api/locations")

    # ── Health check ─────────────────────────────────────────
    @app.get("/api/health")
    def health():
        key     = app.config.get("GOOGLE_MAPS_API_KEY", "")
        maps_ok = key and key != "YOUR_GOOGLE_MAPS_API_KEY_HERE"
        return {
            "status": "ok",
            "app":    "ChatIA — Assistant IA Transport Mauritanie",
            "maps":   "Google Maps" if maps_ok else "fallback (zones Nouakchott)",
            "db":     app.config["SQLALCHEMY_DATABASE_URI"].split("@")[-1],
        }

    # ── Serve frontend static files ──────────────────────────
    @app.get("/")
    def serve_index():
        return send_from_directory(_FRONTEND, "index.html")

    @app.get("/<path:path>")
    def serve_static(path):
        full = os.path.join(_FRONTEND, path)
        if os.path.isfile(full):
            return send_from_directory(_FRONTEND, path)
        # SPA fallback
        return send_from_directory(_FRONTEND, "index.html")

    return app
