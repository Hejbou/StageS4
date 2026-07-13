"""
/api/admin — Routes réservées aux administrateurs.
Requiert JWT avec role='admin'.
"""
from flask import Blueprint, request
from flask_jwt_extended import jwt_required, get_jwt_identity
from ..extensions import db
from ..models import User, Trip, Driver, Location, City, Wilaya, Moughataa, Lieu
from ..models.location import LOCATION_TYPES
from ..models.lieu import LIEU_TYPES
from ..utils import ok, created, error, not_found
from ..utils.auth_helpers import require_admin
from ..utils.maps import reverse_geocode, generate_aliases
from ..utils.pricing import haversine_km

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


# ═══════════════════════════════════════════════════════════════════
#  NOUVELLE GESTION DES LIEUX — hiérarchie Ville / Wilaya / Moughataa /
#  Lieu. Indépendante de /api/admin/locations ci-dessus (catalogue
#  historique utilisé par le chat/le calcul du prix/la carte) : les deux
#  coexistent volontairement tant que le chat n'a pas basculé sur celle-ci.
# ═══════════════════════════════════════════════════════════════════

# ── GET /api/admin/geo/wilayas — wilayas + leurs moughataas, pour peupler
# les listes déroulantes en cascade du formulaire d'ajout de lieu, et pour
# la page de gestion Wilayas/Moughataas ci-dessous (inclut le nombre de
# lieux par moughataa, pour empêcher une suppression qui casserait des
# lieux existants) ───────────────────────────────────────────────────────
@admin_bp.get("/geo/wilayas")
@jwt_required()
def admin_list_wilayas():
    _, err = require_admin()
    if err: return err

    wilayas = Wilaya.query.order_by(Wilaya.name.asc()).all()
    result = []
    for w in wilayas:
        d = w.to_dict()
        moughataas = []
        for m in sorted(w.moughataas, key=lambda m: m.name):
            md = m.to_dict()
            md["lieuxCount"] = len(m.lieux)
            moughataas.append(md)
        d["moughataas"] = moughataas
        d["moughataasCount"] = len(moughataas)
        result.append(d)
    return ok(result)


# Distance au-delà de laquelle un point n'est plus considéré comme
# appartenant à une moughataa connue (évite de rattacher n'importe quel
# point du monde à la moughataa la plus proche par défaut).
_GEO_DETECT_MAX_KM = 50


def _detect_moughataa(lat, lng):
    """Trouve la moughataa dont le centroïde est le plus proche du point
    donné (nearest-centroid). Retourne (moughataa, distance_km) ou None
    si aucune moughataa n'a de centroïde, ou si la plus proche est trop
    loin pour être pertinente."""
    candidates = Moughataa.query.filter(
        Moughataa.lat.isnot(None), Moughataa.lng.isnot(None)
    ).all()
    best, best_dist = None, None
    for m in candidates:
        dist = haversine_km(lat, lng, float(m.lat), float(m.lng))
        if best is None or dist < best_dist:
            best, best_dist = m, dist
    if best is None or best_dist > _GEO_DETECT_MAX_KM:
        return None
    return best, best_dist


# ── GET /api/admin/geo/detect?lat=..&lng=.. — détecte la Wilaya/Moughataa
# la plus probable pour un point GPS donné (formulaire "Ajouter un lieu")
@admin_bp.get("/geo/detect")
@jwt_required()
def admin_detect_geo():
    _, err = require_admin()
    if err: return err

    try:
        lat = float(request.args["lat"])
        lng = float(request.args["lng"])
    except (KeyError, ValueError):
        return error("lat et lng sont obligatoires (nombres décimaux)")

    result = _detect_moughataa(lat, lng)
    if not result:
        return ok(None)

    moughataa, dist_km = result
    wilaya = moughataa.wilaya
    return ok({
        "wilayaId":     wilaya.id,
        "wilayaName":   wilaya.name,
        "moughataaId":  moughataa.id,
        "moughataaName": moughataa.name,
        "distanceKm":   round(dist_km, 2),
    })


def _validate_wilaya_payload(data, partial=False):
    clean = {}
    if "name" in data or not partial:
        name = (data.get("name") or "").strip()
        if not name:
            return None, "Le nom de la wilaya est obligatoire"
        clean["name"] = name
    if "name_ar" in data: clean["name_ar"] = (data.get("name_ar") or "").strip() or None
    if "name_ha" in data: clean["name_ha"] = (data.get("name_ha") or "").strip() or None
    return clean, None


# ── POST /api/admin/geo/wilayas — créer une wilaya ──────────────────────
@admin_bp.post("/geo/wilayas")
@jwt_required()
def admin_create_wilaya():
    _, err = require_admin()
    if err: return err

    city = City.query.first()
    if not city:
        return error("Aucune ville configurée — impossible de créer une wilaya")

    data = request.get_json(silent=True) or {}
    clean, msg = _validate_wilaya_payload(data)
    if msg:
        return error(msg)

    wilaya = Wilaya(city_id=city.id, **clean)
    db.session.add(wilaya)
    db.session.commit()
    return created(wilaya.to_dict(), "Wilaya créée")


# ── PUT /api/admin/geo/wilayas/<id> — modifier une wilaya ───────────────
@admin_bp.put("/geo/wilayas/<int:wilaya_id>")
@jwt_required()
def admin_update_wilaya(wilaya_id):
    _, err = require_admin()
    if err: return err

    wilaya = Wilaya.query.get(wilaya_id)
    if not wilaya:
        return not_found("Wilaya introuvable")

    data = request.get_json(silent=True) or {}
    clean, msg = _validate_wilaya_payload(data, partial=True)
    if msg:
        return error(msg)

    for key, value in clean.items():
        setattr(wilaya, key, value)
    db.session.commit()
    return ok(wilaya.to_dict(), "Wilaya mise à jour")


# ── DELETE /api/admin/geo/wilayas/<id> — supprimer une wilaya ───────────
# Bloquée tant que la wilaya contient encore des moughataas, pour ne
# jamais perdre de données silencieusement.
@admin_bp.delete("/geo/wilayas/<int:wilaya_id>")
@jwt_required()
def admin_delete_wilaya(wilaya_id):
    _, err = require_admin()
    if err: return err

    wilaya = Wilaya.query.get(wilaya_id)
    if not wilaya:
        return not_found("Wilaya introuvable")

    count = Moughataa.query.filter_by(wilaya_id=wilaya_id).count()
    if count:
        return error(f"Cette wilaya contient encore {count} moughataa(s) — "
                     "supprimez-les ou déplacez-les d'abord.")

    db.session.delete(wilaya)
    db.session.commit()
    return ok(None, "Wilaya supprimée")


def _validate_moughataa_payload(data, partial=False):
    clean = {}
    if "name" in data or not partial:
        name = (data.get("name") or "").strip()
        if not name:
            return None, "Le nom de la moughataa est obligatoire"
        clean["name"] = name
    if "name_ar" in data: clean["name_ar"] = (data.get("name_ar") or "").strip() or None
    if "name_ha" in data: clean["name_ha"] = (data.get("name_ha") or "").strip() or None
    if "wilaya_id" in data or not partial:
        try:
            wilaya_id = int(data.get("wilaya_id"))
        except (TypeError, ValueError):
            return None, "La wilaya est obligatoire"
        if not Wilaya.query.get(wilaya_id):
            return None, "Wilaya introuvable"
        clean["wilaya_id"] = wilaya_id
    return clean, None


# ── POST /api/admin/geo/moughataas — créer une moughataa ────────────────
@admin_bp.post("/geo/moughataas")
@jwt_required()
def admin_create_moughataa():
    _, err = require_admin()
    if err: return err

    data = request.get_json(silent=True) or {}
    clean, msg = _validate_moughataa_payload(data)
    if msg:
        return error(msg)

    moughataa = Moughataa(**clean)
    db.session.add(moughataa)
    db.session.commit()
    return created(moughataa.to_dict(), "Moughataa créée")


# ── PUT /api/admin/geo/moughataas/<id> — modifier une moughataa (nom,
# ou la rattacher à une autre wilaya) ────────────────────────────────────
@admin_bp.put("/geo/moughataas/<int:moughataa_id>")
@jwt_required()
def admin_update_moughataa(moughataa_id):
    _, err = require_admin()
    if err: return err

    moughataa = Moughataa.query.get(moughataa_id)
    if not moughataa:
        return not_found("Moughataa introuvable")

    data = request.get_json(silent=True) or {}
    clean, msg = _validate_moughataa_payload(data, partial=True)
    if msg:
        return error(msg)

    for key, value in clean.items():
        setattr(moughataa, key, value)
    db.session.commit()
    return ok(moughataa.to_dict(), "Moughataa mise à jour")


# ── DELETE /api/admin/geo/moughataas/<id> — supprimer une moughataa ─────
# Bloquée tant que des lieux y sont encore rattachés.
@admin_bp.delete("/geo/moughataas/<int:moughataa_id>")
@jwt_required()
def admin_delete_moughataa(moughataa_id):
    _, err = require_admin()
    if err: return err

    moughataa = Moughataa.query.get(moughataa_id)
    if not moughataa:
        return not_found("Moughataa introuvable")

    count = Lieu.query.filter_by(moughataa_id=moughataa_id).count()
    if count:
        return error(f"Cette moughataa contient encore {count} lieu(x) — "
                     "supprimez-les ou déplacez-les d'abord.")

    db.session.delete(moughataa)
    db.session.commit()
    return ok(None, "Moughataa supprimée")


def _validate_lieu_payload(data, partial=False):
    """Valide et normalise le payload d'un Lieu. Retourne (clean, error_msg)."""
    clean = {}

    if "moughataa_id" in data or not partial:
        try:
            moughataa_id = int(data.get("moughataa_id"))
        except (TypeError, ValueError):
            return None, "La Moughataa est obligatoire"
        if not Moughataa.query.get(moughataa_id):
            return None, "Moughataa introuvable"
        clean["moughataa_id"] = moughataa_id

    if "name_fr" in data or not partial:
        name_fr = (data.get("name_fr") or "").strip()
        if not name_fr:
            return None, "Le nom en français est obligatoire"
        clean["name_fr"] = name_fr

    if "name_ar" in data or not partial:
        name_ar = (data.get("name_ar") or "").strip()
        if not name_ar:
            return None, "Le nom en arabe est obligatoire"
        clean["name_ar"] = name_ar

    if "names_ha" in data:
        names_ha = data.get("names_ha")
        if names_ha is None:
            clean["names_ha"] = []
        elif isinstance(names_ha, list):
            clean["names_ha"] = [str(n).strip() for n in names_ha if str(n).strip()]
        else:
            return None, "names_ha doit être une liste de noms"

    if "type" in data or not partial:
        lieu_type = data.get("type") or "autre"
        if lieu_type not in LIEU_TYPES:
            return None, f"type doit être l'un de : {', '.join(LIEU_TYPES)}"
        clean["type"] = lieu_type

    if "lat" in data or not partial:
        try:
            clean["lat"] = float(data["lat"])
            clean["lng"] = float(data["lng"])
        except (KeyError, TypeError, ValueError):
            return None, "lat et lng sont obligatoires (nombres décimaux)"
        if not (-90 <= clean["lat"] <= 90) or not (-180 <= clean["lng"] <= 180):
            return None, "lat doit être entre -90 et 90, lng entre -180 et 180"

    return clean, None


# ── GET /api/admin/lieux — tous les lieux (actifs + désactivés) ────────
@admin_bp.get("/lieux")
@jwt_required()
def admin_list_lieux():
    _, err = require_admin()
    if err: return err

    q = request.args.get("q", "").strip()
    query = Lieu.query
    if q:
        query = query.filter(
            Lieu.name_fr.like(f"%{q}%") |
            Lieu.name_ar.like(f"%{q}%")
        )
    lieux = query.order_by(Lieu.name_fr.asc()).all()
    return ok([l.to_dict() for l in lieux])


# ── POST /api/admin/lieux — créer un lieu ───────────────────────────────
@admin_bp.post("/lieux")
@jwt_required()
def admin_create_lieu():
    me, err = require_admin()
    if err: return err

    data = request.get_json(silent=True) or {}
    clean, msg = _validate_lieu_payload(data)
    if msg:
        return error(msg)

    lieu = Lieu(created_by=me.phone, is_active=True, **clean)
    db.session.add(lieu)
    db.session.commit()
    return created(lieu.to_dict(), "Lieu créé")


# ── PUT /api/admin/lieux/<id> — modifier un lieu ────────────────────────
@admin_bp.put("/lieux/<int:lieu_id>")
@jwt_required()
def admin_update_lieu(lieu_id):
    _, err = require_admin()
    if err: return err

    lieu = Lieu.query.get(lieu_id)
    if not lieu:
        return not_found("Lieu introuvable")

    data = request.get_json(silent=True) or {}
    clean, msg = _validate_lieu_payload(data, partial=True)
    if msg:
        return error(msg)

    for key, value in clean.items():
        setattr(lieu, key, value)
    db.session.commit()
    return ok(lieu.to_dict(), "Lieu mis à jour")


# ── PUT /api/admin/lieux/<id>/toggle — activer/désactiver ──────────────
@admin_bp.put("/lieux/<int:lieu_id>/toggle")
@jwt_required()
def admin_toggle_lieu(lieu_id):
    _, err = require_admin()
    if err: return err

    lieu = Lieu.query.get(lieu_id)
    if not lieu:
        return not_found("Lieu introuvable")

    lieu.is_active = not lieu.is_active
    db.session.commit()
    status = "activé" if lieu.is_active else "désactivé"
    return ok(lieu.to_dict(), f"Lieu {status}")


# ── DELETE /api/admin/lieux/<id> — supprimer un lieu ────────────────────
@admin_bp.delete("/lieux/<int:lieu_id>")
@jwt_required()
def admin_delete_lieu(lieu_id):
    _, err = require_admin()
    if err: return err

    lieu = Lieu.query.get(lieu_id)
    if not lieu:
        return not_found("Lieu introuvable")

    db.session.delete(lieu)
    db.session.commit()
    return ok(None, "Lieu supprimé")
