from flask import Blueprint, request
from flask_jwt_extended import (
    create_access_token, create_refresh_token,
    jwt_required, get_jwt_identity,
)
from ..extensions import db, bcrypt
from ..models import User, Driver
from ..utils import ok, created, error, unauthorized, normalize_phone, validate_phone

auth_bp = Blueprint("auth", __name__)


# ── POST /api/auth/register ─────────────────────────────
@auth_bp.post("/register")
def register():
    data = request.get_json(silent=True) or {}

    phone = data.get("phone", "").strip()
    name  = data.get("name",  "").strip()
    pwd   = data.get("password", "")
    role  = data.get("role", "client")

    # Validation
    if not phone or not name or not pwd:
        return error("phone, name et password sont obligatoires")

    if not validate_phone(phone):
        return error("Numéro mauritanien invalide (8 chiffres, commence par 2, 3 ou 4)")

    if len(pwd) < 6:
        return error("Le mot de passe doit avoir au moins 6 caractères")

    if role not in ("client", "driver"):
        role = "client"

    if User.query.get(phone):
        return error("Ce numéro est déjà enregistré", 409)

    # Création
    phone = normalize_phone(phone)
    pw_hash = bcrypt.generate_password_hash(pwd).decode("utf-8")

    user = User(
        phone         = phone,
        name          = name,
        email         = data.get("email") or None,
        password_hash = pw_hash,
        role          = role,
        language      = data.get("language", "fr"),
    )
    db.session.add(user)

    # Si chauffeur → créer profil driver
    if role == "driver":
        plate = data.get("vehicle_plate", "").strip()
        if not plate:
            return error("vehicle_plate est obligatoire pour les chauffeurs")
        driver = Driver(
            phone         = phone,
            vehicle_type  = data.get("vehicle_type", "taxi"),
            vehicle_plate = plate,
            vehicle_model = data.get("vehicle_model") or None,
            vehicle_color = data.get("vehicle_color") or None,
        )
        db.session.add(driver)

    db.session.commit()

    access_token  = create_access_token(identity=phone)
    refresh_token = create_refresh_token(identity=phone)

    return created({
        "user":          user.to_dict(include_private=True),
        "access_token":  access_token,
        "refresh_token": refresh_token,
    }, "Compte créé avec succès")


# ── POST /api/auth/login ────────────────────────────────
@auth_bp.post("/login")
def login():
    data = request.get_json(silent=True) or {}

    phone = data.get("phone", "").strip()
    pwd   = data.get("password", "")

    if not phone or not pwd:
        return error("phone et password obligatoires")

    if not validate_phone(phone):
        return error("Numéro mauritanien invalide")

    user = User.query.get(normalize_phone(phone))

    if not user or not bcrypt.check_password_hash(user.password_hash, pwd):
        return unauthorized("Numéro ou mot de passe incorrect")

    if not user.is_active:
        return unauthorized("Compte désactivé. Contactez le support.")

    access_token  = create_access_token(identity=user.phone)
    refresh_token = create_refresh_token(identity=user.phone)

    return ok({
        "user":          user.to_dict(include_private=True),
        "access_token":  access_token,
        "refresh_token": refresh_token,
    }, "Connexion réussie")


# ── POST /api/auth/refresh ──────────────────────────────
@auth_bp.post("/refresh")
@jwt_required(refresh=True)
def refresh():
    phone        = get_jwt_identity()
    access_token = create_access_token(identity=phone)
    return ok({"access_token": access_token})


# ── GET /api/auth/me ────────────────────────────────────
@auth_bp.get("/me")
@jwt_required()
def me():
    phone = get_jwt_identity()
    user  = User.query.get(phone)
    if not user:
        return unauthorized("Utilisateur introuvable")
    data = user.to_dict(include_private=True)
    if user.driver_profile:
        data["driver"] = user.driver_profile.to_dict()
    return ok(data)


# ── POST /api/auth/lookup ──────────────────────────────
# Résout un nom d'utilisateur → numéro de téléphone (pour loginByIdentifier)
@auth_bp.post("/lookup")
def lookup_user():
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip().lower()
    if not name:
        return error("name est obligatoire")

    user = User.query.filter(db.func.lower(User.name) == name).first()
    if not user:
        return error("Utilisateur introuvable", 404)

    return ok({"phone": user.phone})


# ── PUT /api/auth/profile ───────────────────────────────
@auth_bp.put("/profile")
@jwt_required()
def update_profile():
    phone = get_jwt_identity()
    user  = User.query.get(phone)
    if not user:
        return unauthorized()

    data = request.get_json(silent=True) or {}

    if "name"     in data: user.name     = data["name"].strip()
    if "email"    in data: user.email    = data["email"] or None
    if "language" in data and data["language"] in ("fr", "ar", "ha"):
        user.language = data["language"]

    # Changement de mot de passe
    if "new_password" in data and "old_password" in data:
        if not bcrypt.check_password_hash(user.password_hash, data["old_password"]):
            return error("Ancien mot de passe incorrect")
        if len(data["new_password"]) < 6:
            return error("Nouveau mot de passe trop court")
        user.password_hash = bcrypt.generate_password_hash(data["new_password"]).decode("utf-8")

    db.session.commit()
    return ok(user.to_dict(include_private=True), "Profil mis à jour")
