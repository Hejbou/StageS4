from flask import Blueprint
from flask_jwt_extended import jwt_required, get_jwt_identity
from ..extensions import db
from ..models import Notification
from ..utils import ok, not_found, forbidden

notif_bp = Blueprint("notifications", __name__)


# ── GET /api/notifications ──────────────────────────────
@notif_bp.get("/")
@jwt_required()
def list_notifications():
    phone = get_jwt_identity()
    notifs = (
        Notification.query
        .filter_by(user_phone=phone)
        .order_by(Notification.created_at.desc())
        .limit(50)
        .all()
    )
    unread = sum(1 for n in notifs if not n.is_read)
    return ok({"notifications": [n.to_dict() for n in notifs], "unread": unread})


# ── PUT /api/notifications/<id>/read ───────────────────
@notif_bp.put("/<int:notif_id>/read")
@jwt_required()
def mark_read(notif_id):
    phone = get_jwt_identity()
    notif = Notification.query.get(notif_id)
    if not notif:
        return not_found()
    if notif.user_phone != phone:
        return forbidden()

    notif.is_read = True
    db.session.commit()
    return ok(notif.to_dict())


# ── PUT /api/notifications/read-all ────────────────────
@notif_bp.put("/read-all")
@jwt_required()
def mark_all_read():
    phone = get_jwt_identity()
    Notification.query.filter_by(user_phone=phone, is_read=False).update({"is_read": True})
    db.session.commit()
    return ok(None, "Toutes les notifications marquées comme lues")
