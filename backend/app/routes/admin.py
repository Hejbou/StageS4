"""
/api/admin — Routes réservées aux administrateurs.
Requiert JWT avec role='admin'.
"""
from flask import Blueprint, request
from flask_jwt_extended import jwt_required, get_jwt_identity
from ..extensions import db
from ..models import User, Trip, Driver, Location
from ..models.location import LOCATION_TYPES
from ..utils import ok, created, error, not_found
from ..utils.auth_helpers import require_admin
from ..utils.maps import reverse_geocode, generate_aliases

admin_bp = Blueprint("admin", __name__)


# ── GET /api/admin/stats ───────────────────────────────────────────────
@admin_bp.get("/stats")
@jwt_required()
def stats():
    _, err = require_admin()
    if err: return err

    total_users    = User.query.count()
    total_trips    = Trip.query.count()
    pending_trips  = Trip.query.filter_by(status="pending").count()
    accepted_trips = Trip.query.filter_by(status="accepted").count()
    total_drivers  = Driver.query.count()

    return ok({
        "users":          total_users,
        "trips":          total_trips,
        "trips_pending":  pending_trips,
        "trips_accepted": accepted_trips,
        "drivers":        total_drivers,
    })


# ── GET /api/admin/users ───────────────────────────────────────────────
@admin_bp.get("/users")
@jwt_required()
def list_users():
    _, err = require_admin()
    if err: return err

    q    = request.args.get("q", "").strip()
    role = request.args.get("role")

    query = User.query
    if role in ("client", "driver", "admin"):
        query = query.filter_by(role=role)
    if q:
        query = query.filter(
            User.phone.like(f"%{q}%") | User.name.like(f"%{q}%")
        )

    users = query.order_by(User.created_at.desc()).all()
    return ok([u.to_dict(include_private=True) for u in users])


# ── DELETE /api/admin/users/<phone> ───────────────────────────────────
@admin_bp.delete("/users/<phone>")
@jwt_required()
def delete_user(phone):
    me, err = require_admin()
    if err: return err

    if phone == me.phone:
        return error("Vous ne pouvez pas supprimer votre propre compte")

    user = User.query.get(phone)
    if not user:
        return not_found("Utilisateur introuvable")
    if user.role == "admin":
        return error("Impossible de supprimer un admin")

    db.session.delete(user)
    db.session.commit()
    return ok(None, f"Utilisateur {phone} supprimé")


# ── PUT /api/admin/users/<phone>/toggle ───────────────────────────────
@admin_bp.put("/users/<phone>/toggle")
@jwt_required()
def toggle_user(phone):
    _, err = require_admin()
    if err: return err

    user = User.query.get(phone)
    if not user:
        return not_found()

    user.is_active = not user.is_active
    db.session.commit()
    status = "activé" if user.is_active else "désactivé"
    return ok(user.to_dict(), f"Compte {status}")


# ── GET /api/admin/trips ───────────────────────────────────────────────
@admin_bp.get("/trips")
@jwt_required()
def admin_trips():
    _, err = require_admin()
    if err: return err

    status = request.args.get("status")
    q      = request.args.get("q", "").strip()

    query = Trip.query
    if status:
        query = query.filter_by(status=status)
    if q:
        query = query.filter(
            Trip.origin.like(f"%{q}%") |
            Trip.destination.like(f"%{q}%") |
            Trip.client_phone.like(f"%{q}%") |
            Trip.id.like(f"%{q}%")
        )

    trips = query.order_by(Trip.created_at.desc()).limit(200).all()
    return ok([t.to_dict() for t in trips])


# ── Lieux (POI) — gestion complète depuis le dashboard ─────────────────
# Lecture publique (chat IA) : voir routes/locations.py (/api/locations).

def _validate_location_payload(data, partial=False):
    """
    Valide et normalise le payload d'un lieu. Retourne (clean, error_msg).

    L'admin ne saisit que le nom (FR/AR/HA), le type (optionnel) et le
    point GPS — le quartier et les alias de recherche sont déduits
    automatiquement par reverse geocoding (voir _apply_geo_fields ci-dessous),
    jamais saisis à la main.
    """
    clean = {}

    name = (data.get("name") or "").strip()
    if not name and not partial:
        return None, "Le nom (français) est obligatoire"
    if name:
        clean["name"] = name

    if "name_ar" in data: clean["name_ar"] = (data.get("name_ar") or "").strip() or None
    if "name_ha" in data: clean["name_ha"] = (data.get("name_ha") or "").strip() or None

    if "type" in data or not partial:
        loc_type = data.get("type") or "autre"
        if loc_type not in LOCATION_TYPES:
            return None, f"type doit être l'un de : {', '.join(LOCATION_TYPES)}"
        clean["type"] = loc_type

    if "lat" in data or not partial:
        try:
            clean["lat"] = float(data["lat"])
            clean["lng"] = float(data["lng"])
        except (KeyError, TypeError, ValueError):
            return None, "lat et lng sont obligatoires (nombres décimaux)"
        if not (-90 <= clean["lat"] <= 90) or not (-180 <= clean["lng"] <= 180):
            return None, "lat doit être entre -90 et 90, lng entre -180 et 180"

    return clean, None


def _apply_geo_fields(location):
    """
    Reverse geocode le point GPS du lieu pour déduire son quartier, puis
    (re)génère ses alias de recherche à partir des noms FR/AR/HA et des
    informations trouvées. Appelé à chaque création/modification, donc le
    quartier et les alias restent toujours cohérents avec le nom et les
    coordonnées actuelles du lieu, sans aucune saisie manuelle.
    """
    geo = reverse_geocode(float(location.lat), float(location.lng))
    location.quartier = geo.get("quartier") or location.quartier
    # `city` (toujours "Nouakchott" ici) est délibérément exclu des alias :
    # le géocodage de secours ajoute systématiquement ", Nouakchott,
    # Mauritanie" à tout texte non résolu (voir geocode() ci-dessus), donc
    # ce terme ne discrimine rien et ferait matcher n'importe quel texte
    # inconnu avec le premier lieu qui l'aurait comme alias.
    location.aliases = generate_aliases(
        name=location.name, name_ar=location.name_ar, name_ha=location.name_ha,
        quartier=location.quartier, road=geo.get("road"),
    )


# ── GET /api/admin/locations — tous les lieux (actifs + désactivés) ────
@admin_bp.get("/locations")
@jwt_required()
def admin_list_locations():
    _, err = require_admin()
    if err: return err

    q = request.args.get("q", "").strip()
    query = Location.query
    if q:
        query = query.filter(
            Location.name.like(f"%{q}%") |
            Location.name_ar.like(f"%{q}%") |
            Location.quartier.like(f"%{q}%")
        )
    locations = query.order_by(Location.name.asc()).all()
    return ok([l.to_dict() for l in locations])


# ── POST /api/admin/locations — créer un lieu ──────────────────────────
@admin_bp.post("/locations")
@jwt_required()
def admin_create_location():
    me, err = require_admin()
    if err: return err

    data = request.get_json(silent=True) or {}
    clean, msg = _validate_location_payload(data)
    if msg:
        return error(msg)

    location = Location(created_by=me.phone, is_active=True, **clean)
    _apply_geo_fields(location)
    db.session.add(location)
    db.session.commit()
    return created(location.to_dict(), "Lieu créé")


# ── PUT /api/admin/locations/<id> — modifier un lieu ───────────────────
@admin_bp.put("/locations/<int:location_id>")
@jwt_required()
def admin_update_location(location_id):
    _, err = require_admin()
    if err: return err

    location = Location.query.get(location_id)
    if not location:
        return not_found("Lieu introuvable")

    data = request.get_json(silent=True) or {}
    clean, msg = _validate_location_payload(data, partial=True)
    if msg:
        return error(msg)

    for key, value in clean.items():
        setattr(location, key, value)
    _apply_geo_fields(location)
    db.session.commit()
    return ok(location.to_dict(), "Lieu mis à jour")


# ── PUT /api/admin/locations/<id>/toggle — activer/désactiver ──────────
@admin_bp.put("/locations/<int:location_id>/toggle")
@jwt_required()
def admin_toggle_location(location_id):
    _, err = require_admin()
    if err: return err

    location = Location.query.get(location_id)
    if not location:
        return not_found("Lieu introuvable")

    location.is_active = not location.is_active
    db.session.commit()
    status = "activé" if location.is_active else "désactivé"
    return ok(location.to_dict(), f"Lieu {status}")


# ── DELETE /api/admin/locations/<id> — supprimer un lieu ajouté par un
# admin. Le catalogue de base (créé par le script de migration, sans
# created_by) ne peut pas être supprimé ici pour ne pas casser les repères
# dont dépend la précision du chat — seulement désactivé (voir /toggle).
@admin_bp.delete("/locations/<int:location_id>")
@jwt_required()
def admin_delete_location(location_id):
    _, err = require_admin()
    if err: return err

    location = Location.query.get(location_id)
    if not location:
        return not_found("Lieu introuvable")

    if not location.created_by:
        return error("Ce lieu fait partie du catalogue de base — il peut être désactivé mais pas supprimé.")

    db.session.delete(location)
    db.session.commit()
    return ok(None, "Lieu supprimé")
