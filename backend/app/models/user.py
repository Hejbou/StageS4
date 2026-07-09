from datetime import datetime
from ..extensions import db


class User(db.Model):
    __tablename__ = "users"

    phone         = db.Column(db.String(8),   primary_key=True)
    name          = db.Column(db.String(100),  nullable=False)
    email         = db.Column(db.String(150),  nullable=True, unique=True)
    password_hash = db.Column(db.String(255),  nullable=False)
    role          = db.Column(
        db.Enum("client", "driver", "admin"),
        nullable=False, default="client"
    )
    language      = db.Column(
        db.Enum("fr", "ar", "ha"),
        nullable=False, default="fr"
    )
    is_active     = db.Column(db.Boolean,  nullable=False, default=True)
    created_at    = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at    = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relations
    trips_as_client  = db.relationship(
        "Trip", foreign_keys="Trip.client_phone",
        back_populates="client", lazy="dynamic"
    )
    trips_as_driver  = db.relationship(
        "Trip", foreign_keys="Trip.driver_phone",
        back_populates="driver_user", lazy="dynamic"
    )
    driver_profile   = db.relationship("Driver", back_populates="user", uselist=False)
    notifications    = db.relationship("Notification", back_populates="user", lazy="dynamic")
    chat_sessions    = db.relationship("ChatSession", back_populates="client", lazy="dynamic")

    def to_dict(self, include_private=False):
        d = {
            "phone":      self.phone,
            "name":       self.name,
            "role":       self.role,
            "language":   self.language,
            "is_active":  self.is_active,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
        if include_private:
            d["email"] = self.email
        return d

    def __repr__(self):
        return f"<User {self.phone} ({self.role})>"
