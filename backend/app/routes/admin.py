"""
/api/admin — Routes réservées aux administrateurs.
Requiert JWT avec role='admin'.
"""
from flask import Blueprint, request
from flask_jwt_extended import jwt_required, get_jwt_identity
from ..extensions import db
from ..models import User, Trip, Driver
from ..utils import ok, error, not_found, forbidden, unauthorized

admin_bp = Blueprint("admin", __name__)


def _require_admin():
    phone = get_jwt_identity()
    user  = User.query.get(phone)
    if not user or user.role != "admin":
        return None, forbidden("Accès réservé aux administrateurs")
    return user, None


# ── GET /api/admin/stats ───────────────────────────────────────────────
@admin_bp.get("/stats")
@jwt_required()
def stats():
    _, err = _require_admin()
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
    _, err = _require_admin()
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
    me, err = _require_admin()
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
    _, err = _require_admin()
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
    _, err = _require_admin()
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
