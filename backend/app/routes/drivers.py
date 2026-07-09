from flask import Blueprint, request
from flask_jwt_extended import jwt_required, get_jwt_identity
from ..extensions import db
from ..models import User, Driver
from ..utils import ok, error, not_found, forbidden

drivers_bp = Blueprint("drivers", __name__)


# ── GET /api/drivers/available ──────────────────────────
@drivers_bp.get("/available")
@jwt_required()
def available_drivers():
    drivers = (
        Driver.query
        .filter_by(status="available", is_verified=True)
        .all()
    )
    return ok([d.to_dict() for d in drivers])


# ── GET /api/drivers ────────────────────────────────────
@drivers_bp.get("/")
@jwt_required()
def list_drivers():
    phone = get_jwt_identity()
    user  = User.query.get(phone)
    if user.role != "admin":
        return forbidden("Admin uniquement")

    drivers = Driver.query.all()
    return ok([d.to_dict() for d in drivers])


# ── GET /api/drivers/<phone> ────────────────────────────
@drivers_bp.get("/<driver_phone>")
@jwt_required()
def get_driver(driver_phone):
    driver = Driver.query.get(driver_phone)
    if not driver:
        return not_found("Chauffeur introuvable")
    return ok(driver.to_dict())


# ── PUT /api/drivers/status ─────────────────────────────
@drivers_bp.put("/status")
@jwt_required()
def update_status():
    """Le chauffeur change son statut (offline/available)."""
    phone  = get_jwt_identity()
    user   = User.query.get(phone)
    driver = user.driver_profile if user else None
    if not driver:
        return forbidden("Seuls les chauffeurs peuvent changer leur statut")

    data   = request.get_json(silent=True) or {}
    status = data.get("status")
    if status not in ("offline", "available"):
        return error("Statut invalide (offline ou available)")

    driver.status = status
    db.session.commit()
    return ok(driver.to_dict(), f"Statut mis à jour : {status}")


# ── PUT /api/drivers/location ───────────────────────────
@drivers_bp.put("/location")
@jwt_required()
def update_location():
    """Met à jour la position GPS du chauffeur."""
    phone  = get_jwt_identity()
    user   = User.query.get(phone)
    driver = user.driver_profile if user else None
    if not driver:
        return forbidden()

    data = request.get_json(silent=True) or {}
    lat  = data.get("lat")
    lng  = data.get("lng")

    if lat is None or lng is None:
        return error("lat et lng sont obligatoires")

    driver.current_lat = float(lat)
    driver.current_lng = float(lng)
    db.session.commit()
    return ok({"lat": float(lat), "lng": float(lng)})


# ── PUT /api/drivers/<phone>/verify ─────────────────────
@drivers_bp.put("/<driver_phone>/verify")
@jwt_required()
def verify_driver(driver_phone):
    """Admin valide un chauffeur."""
    me   = User.query.get(get_jwt_identity())
    if not me or me.role != "admin":
        return forbidden()

    driver = Driver.query.get(driver_phone)
    if not driver:
        return not_found()

    driver.is_verified = True
    db.session.commit()
    return ok(driver.to_dict(), "Chauffeur validé")
