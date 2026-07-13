from datetime import datetime
from ..extensions import db


class Wilaya(db.Model):
    """Wilaya — subdivision d'une Ville dans la hiérarchie géographique
    des lieux (Ville -> Wilaya -> Moughataa -> Lieu)."""
    __tablename__ = "wilayas"

    id         = db.Column(db.Integer, primary_key=True, autoincrement=True)
    city_id    = db.Column(db.Integer, db.ForeignKey("cities.id"), nullable=False)
    name       = db.Column(db.String(100), nullable=False)
    name_ar    = db.Column(db.String(100), nullable=True)
    name_ha    = db.Column(db.String(100), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    moughataas = db.relationship("Moughataa", backref="wilaya", lazy=True)

    def to_dict(self):
        return {
            "id":     self.id,
            "cityId": self.city_id,
            "name":   self.name,
            "nameAr": self.name_ar,
            "nameHa": self.name_ha,
        }

    def __repr__(self):
        return f"<Wilaya {self.id} — {self.name}>"
