from datetime import datetime
import random
import string
from ..extensions import db


def generate_trip_id():
    suffix = "".join(random.choices(string.ascii_uppercase + string.digits, k=6))
    return f"REQ-{suffix}"


class Trip(db.Model):
    __tablename__ = "trips"

    id           = db.Column(db.String(20), primary_key=True, default=generate_trip_id)
    session_id   = db.Column(db.Integer, db.ForeignKey("chat_sessions.id"), nullable=True)
    client_phone = db.Column(db.String(8),  db.ForeignKey("users.phone"), nullable=True)
    driver_phone = db.Column(db.String(8),  db.ForeignKey("users.phone"), nullable=True)

    origin           = db.Column(db.String(300), nullable=False)
    destination      = db.Column(db.String(300), nullable=False)
    origin_formatted = db.Column(db.String(300), nullable=True)
    dest_formatted   = db.Column(db.String(300), nullable=True)

    origin_lat  = db.Column(db.Numeric(10, 8), nullable=True)
    origin_lng  = db.Column(db.Numeric(11, 8), nullable=True)
    dest_lat    = db.Column(db.Numeric(10, 8), nullable=True)
    dest_lng    = db.Column(db.Numeric(11, 8), nullable=True)

    distance_km  = db.Column(db.Numeric(8, 2),  nullable=True)
    duration_min = db.Column(db.Integer,         nullable=True)

    estimated_price = db.Column(db.Numeric(10, 2), nullable=False, default=100)
    final_price     = db.Column(db.Numeric(10, 2), nullable=True)
    currency        = db.Column(db.String(3),       nullable=False, default="MRU")

    status = db.Column(
        db.Enum("pending", "accepted", "completed", "cancelled", "refused"),
        nullable=False, default="pending"
    )
    language      = db.Column(db.Enum("fr", "ar", "ha"), nullable=False, default="fr")
    cancel_reason = db.Column(db.String(255), nullable=True)

    created_at   = db.Column(db.DateTime, default=datetime.utcnow)
    accepted_at  = db.Column(db.DateTime, nullable=True)
    completed_at = db.Column(db.DateTime, nullable=True)
    cancelled_at = db.Column(db.DateTime, nullable=True)

    # Relations
    client = db.relationship(
        "User", foreign_keys=[client_phone],
        back_populates="trips_as_client"
    )
    driver_user = db.relationship(
        "User", foreign_keys=[driver_phone],
        back_populates="trips_as_driver"
    )

    def to_dict(self):
        return {
            "id":               self.id,
            "session_id":       self.session_id,
            "client_phone":     self.client_phone,
            "driver_phone":     self.driver_phone,
            "origin":           self.origin,
            "destination":      self.destination,
            "origin_formatted": self.origin_formatted,
            "dest_formatted":   self.dest_formatted,
            "origin_lat":       float(self.origin_lat)  if self.origin_lat  else None,
            "origin_lng":       float(self.origin_lng)  if self.origin_lng  else None,
            "dest_lat":         float(self.dest_lat)    if self.dest_lat    else None,
            "dest_lng":         float(self.dest_lng)    if self.dest_lng    else None,
            "distance_km":      float(self.distance_km) if self.distance_km else None,
            "duration_min":     self.duration_min,
            "estimated_price":  float(self.estimated_price),
            "final_price":      float(self.final_price) if self.final_price else None,
            "currency":         self.currency,
            "status":           self.status,
            "language":         self.language,
            "cancel_reason":    self.cancel_reason,
            "created_at":       self.created_at.isoformat()   if self.created_at   else None,
            "accepted_at":      self.accepted_at.isoformat()  if self.accepted_at  else None,
            "completed_at":     self.completed_at.isoformat() if self.completed_at else None,
            "cancelled_at":     self.cancelled_at.isoformat() if self.cancelled_at else None,
        }
