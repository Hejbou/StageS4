from datetime import datetime
from ..extensions import db


class Driver(db.Model):
    __tablename__ = "drivers"

    phone         = db.Column(db.String(8), db.ForeignKey("users.phone"), primary_key=True)
    vehicle_type  = db.Column(
        db.Enum("taxi", "minibus", "moto", "4x4"),
        nullable=False, default="taxi"
    )
    vehicle_plate = db.Column(db.String(20),  nullable=False)
    vehicle_model = db.Column(db.String(100), nullable=True)
    vehicle_color = db.Column(db.String(40),  nullable=True)
    vehicle_year  = db.Column(db.SmallInteger, nullable=True)

    rating      = db.Column(db.Numeric(3, 2), nullable=False, default=5.00)
    total_trips = db.Column(db.Integer,        nullable=False, default=0)

    status      = db.Column(
        db.Enum("offline", "available", "busy"),
        nullable=False, default="offline"
    )
    current_lat = db.Column(db.Numeric(10, 8), nullable=True)
    current_lng = db.Column(db.Numeric(11, 8), nullable=True)

    is_verified = db.Column(db.Boolean,  nullable=False, default=False)
    created_at  = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at  = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relations
    user = db.relationship("User", back_populates="driver_profile")

    def to_dict(self):
        return {
            "phone":         self.phone,
            "name":          self.user.name if self.user else None,
            "vehicle_type":  self.vehicle_type,
            "vehicle_plate": self.vehicle_plate,
            "vehicle_model": self.vehicle_model,
            "vehicle_color": self.vehicle_color,
            "vehicle_year":  self.vehicle_year,
            "rating":        float(self.rating) if self.rating else 5.0,
            "total_trips":   self.total_trips,
            "status":        self.status,
            "is_verified":   self.is_verified,
        }

    def __repr__(self):
        return f"<Driver {self.phone} — {self.vehicle_plate} [{self.status}]>"
