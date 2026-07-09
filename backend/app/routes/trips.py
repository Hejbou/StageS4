from datetime import datetime
from flask import Blueprint, request
from flask_jwt_extended import jwt_required, get_jwt_identity, verify_jwt_in_request
from ..extensions import db
from ..models import Trip
from ..utils import ok, created, error, not_found
from ..utils.pricing import calculate_price
from ..utils.maps import geocode, distance_matrix

trips_bp = Blueprint("trips", __name__)


# ── POST /api/trips/ — create a new trip ──────────────────────────────
@trips_bp.post("/")
def create_trip():
    data         = request.get_json(silent=True) or {}
    origin_text  = (data.get("origin")      or "").strip()
    dest_text    = (data.get("destination") or "").strip()
    lang         = data.get("lang", "fr")
    session_id   = data.get("session_id")
    client_phone = (data.get("client_phone") or "").strip() or None

    # Try to get client_phone from JWT if not provided
    if not client_phone:
        try:
            verify_jwt_in_request(optional=True)
            identity = get_jwt_identity()
            if identity:
                client_phone = identity
        except Exception:
            pass

    if not origin_text or not dest_text:
        return error("origin et destination sont obligatoires")

    # Resolve coordinates (with fallback)
    origin_geo = geocode(origin_text, language=lang)
    dest_geo   = geocode(dest_text,   language=lang)

    if origin_geo and dest_geo:
        dist_info = distance_matrix(
            origin_geo["lat"], origin_geo["lng"],
            dest_geo["lat"],   dest_geo["lng"],
            language=lang,
        )
        price = calculate_price(dist_info["distance_km"])
    else:
        dist_info = {"distance_km": 0, "duration_min": 0, "distance_text": "—", "duration_text": "—"}
        price     = 100.0

    trip = Trip(
        session_id       = session_id,
        client_phone     = client_phone,
        origin           = origin_text,
        destination      = dest_text,
        origin_formatted = origin_geo.get("formatted_address") if origin_geo else None,
        dest_formatted   = dest_geo.get("formatted_address")   if dest_geo   else None,
        origin_lat       = origin_geo["lat"]  if origin_geo else None,
        origin_lng       = origin_geo["lng"]  if origin_geo else None,
        dest_lat         = dest_geo["lat"]    if dest_geo   else None,
        dest_lng         = dest_geo["lng"]    if dest_geo   else None,
        distance_km      = dist_info["distance_km"],
        duration_min     = dist_info["duration_min"],
        estimated_price  = price,
        language         = lang if lang in ("fr", "ar", "ha") else "fr",
        status           = "pending",
    )
    db.session.add(trip)
    db.session.commit()
    return created(trip.to_dict(), "Course créée")


# ── GET /api/trips/ ────────────────────────────────────────────────────
@trips_bp.get("/")
def list_trips():
    status       = request.args.get("status")
    client_phone = request.args.get("client_phone")
    q = Trip.query
    if status:
        q = q.filter_by(status=status)
    if client_phone:
        q = q.filter_by(client_phone=client_phone)
    trips = q.order_by(Trip.created_at.desc()).limit(100).all()
    return ok([t.to_dict() for t in trips])


# ── GET /api/trips/my ─── trips of logged-in user ─────────────────────
@trips_bp.get("/my")
@jwt_required()
def my_trips():
    phone = get_jwt_identity()
    trips = (
        Trip.query
        .filter_by(client_phone=phone)
        .order_by(Trip.created_at.desc())
        .limit(50)
        .all()
    )
    return ok([t.to_dict() for t in trips])


# ── GET /api/trips/<id> ────────────────────────────────────────────────
@trips_bp.get("/<trip_id>")
def get_trip(trip_id):
    trip = Trip.query.get(trip_id)
    if not trip:
        return not_found("Course introuvable")
    return ok(trip.to_dict())


# ── PUT /api/trips/<id>/cancel ─────────────────────────────────────────
@trips_bp.put("/<trip_id>/cancel")
def cancel_trip(trip_id):
    trip = Trip.query.get(trip_id)
    if not trip:
        return not_found()
    if trip.status in ("cancelled", "refused", "completed"):
        return error(f"Course déjà en état '{trip.status}'")

    data   = request.get_json(silent=True) or {}
    reason = data.get("reason", "Annulé par l'utilisateur")

    trip.status        = "cancelled"
    trip.cancel_reason = reason
    trip.cancelled_at  = datetime.utcnow()
    db.session.commit()
    return ok(trip.to_dict(), "Course annulée")


# ── PUT /api/trips/<id>/accept — driver accepts (admin/driver only) ────
@trips_bp.put("/<trip_id>/accept")
@jwt_required()
def accept_trip(trip_id):
    trip = Trip.query.get(trip_id)
    if not trip:
        return not_found()
    if trip.status != "pending":
        return error(f"La course n'est pas en attente (état: {trip.status})")

    driver_phone     = get_jwt_identity()
    trip.status       = "accepted"
    trip.driver_phone = driver_phone
    trip.accepted_at  = datetime.utcnow()
    db.session.commit()
    return ok(trip.to_dict(), "Course acceptée")


# ── PUT /api/trips/<id>/complete ───────────────────────────────────────
@trips_bp.put("/<trip_id>/complete")
@jwt_required()
def complete_trip(trip_id):
    trip = Trip.query.get(trip_id)
    if not trip:
        return not_found()
    if trip.status != "accepted":
        return error(f"La course n'est pas acceptée (état: {trip.status})")

    data = request.get_json(silent=True) or {}
    trip.status       = "completed"
    trip.completed_at = datetime.utcnow()
    if "final_price" in data:
        trip.final_price = float(data["final_price"])
    db.session.commit()
    return ok(trip.to_dict(), "Course terminée")
