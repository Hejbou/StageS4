import os
from datetime import timedelta


class Config:
    SECRET_KEY     = os.getenv("SECRET_KEY", "chatia-secret-mauritanie-2024-change-me")
    DEBUG          = os.getenv("FLASK_DEBUG", "1") == "1"

    # ── Database ────────────────────────────────────────────
    _user = os.getenv("DB_USER", "root")
    _pwd  = os.getenv("DB_PASSWORD", "")
    _host = os.getenv("DB_HOST", "localhost")
    _port = os.getenv("DB_PORT", "3306")
    _name = os.getenv("DB_NAME", "chatBot_db")

    SQLALCHEMY_DATABASE_URI = (
        f"mysql+pymysql://{_user}:{_pwd}@{_host}:{_port}/{_name}?charset=utf8mb4"
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ENGINE_OPTIONS = {
        "pool_recycle": 280,
        "pool_pre_ping": True,
    }

    # ── JWT ─────────────────────────────────────────────────
    JWT_SECRET_KEY                = os.getenv("JWT_SECRET_KEY", "chatia-jwt-secret-mauritanie-2024")
    JWT_ACCESS_TOKEN_EXPIRES      = timedelta(hours=int(os.getenv("JWT_ACCESS_TOKEN_EXPIRES_HOURS", "24")))
    JWT_REFRESH_TOKEN_EXPIRES     = timedelta(days=int(os.getenv("JWT_REFRESH_TOKEN_EXPIRES_DAYS", "30")))
    JWT_TOKEN_LOCATION            = ["headers"]
    JWT_HEADER_NAME               = "Authorization"
    JWT_HEADER_TYPE               = "Bearer"

    # ── CORS ─────────────────────────────────────────────────
    _origins = os.getenv(
        "CORS_ORIGINS",
        "http://localhost:5000,http://127.0.0.1:5000,http://localhost:5500,http://127.0.0.1:5500,null"
    )
    CORS_ORIGINS = [o.strip() for o in _origins.split(",")]

    # ── Google Maps ──────────────────────────────────────────
    GOOGLE_MAPS_API_KEY = os.getenv("GOOGLE_MAPS_API_KEY", "")
    MAPS_DEFAULT_LAT    = 18.0735
    MAPS_DEFAULT_LNG    = -15.9582
    MAPS_COUNTRY        = "mr"
    MAPS_RADIUS_M       = 50000
