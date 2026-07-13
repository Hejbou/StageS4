from datetime import datetime
from ..extensions import db


class City(db.Model):
    """Ville — racine de la hiérarchie géographique des lieux
    (Ville -> Wilaya -> Moughataa -> Lieu). Une seule ville existe
    aujourd'hui (Nouakchott) ; la structure est prête à en accueillir
    d'autres plus tard."""
    __tablename__ = "cities"

    id         = db.Column(db.Integer, primary_key=True, autoincrement=True)
    name       = db.Column(db.String(100), nullable=False, unique=True)
    name_ar    = db.Column(db.String(100), nullable=True)
    name_ha    = db.Column(db.String(100), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    wilayas = db.relationship("Wilaya", backref="city", lazy=True)

    def to_dict(self):
        return {
            "id":     self.id,
            "name":   self.name,
            "nameAr": self.name_ar,
            "nameHa": self.name_ha,
        }

    def __repr__(self):
        return f"<City {self.id} — {self.name}>"
