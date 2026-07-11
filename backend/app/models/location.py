from datetime import datetime
from ..extensions import db

# Seule source de vérité pour les types de lieu — réutilisé tel quel par
# routes/admin.py pour la validation, afin de ne jamais désynchroniser
# la colonne Enum et la liste acceptée côté API.
LOCATION_TYPES = ("quartier", "marche", "hopital", "mosquee", "ecole",
                  "carrefour", "station", "admin", "hotel", "autre")


class Location(db.Model):
    """Lieu / point de repère — source unique pour le chat IA (précision de
    localisation) et le géocodage backend. Remplace le fichier statique
    frontend/js/poi-db.js et le dictionnaire Python _NOUAKCHOTT_ZONES."""
    __tablename__ = "locations"

    id       = db.Column(db.Integer, primary_key=True, autoincrement=True)
    name     = db.Column(db.String(150), nullable=False)
    name_ar  = db.Column(db.String(150), nullable=True)
    name_ha  = db.Column(db.String(150), nullable=True)
    type     = db.Column(
        db.Enum(*LOCATION_TYPES),
        nullable=False, default="autre"
    )
    quartier = db.Column(db.String(100), nullable=True)
    lat      = db.Column(db.Numeric(10, 8), nullable=False)
    lng      = db.Column(db.Numeric(11, 8), nullable=False)
    aliases  = db.Column(db.JSON, nullable=True)

    is_active  = db.Column(db.Boolean, nullable=False, default=True)
    created_by = db.Column(db.String(8), db.ForeignKey("users.phone"), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            "id":        self.id,
            "name":      self.name,
            "nameAr":    self.name_ar,
            "nameHa":    self.name_ha,
            "type":      self.type,
            "quartier":  self.quartier,
            "lat":       float(self.lat),
            "lng":       float(self.lng),
            "aliases":   self.aliases or [],
            "is_active": self.is_active,
            "created_by": self.created_by,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }

    def __repr__(self):
        return f"<Location {self.id} — {self.name} [{self.type}]>"
