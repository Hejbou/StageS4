from datetime import datetime
from ..extensions import db


class Moughataa(db.Model):
    """Moughataa — subdivision d'une Wilaya, parent direct des Lieux dans
    la hiérarchie géographique (Ville -> Wilaya -> Moughataa -> Lieu)."""
    __tablename__ = "moughataas"

    id         = db.Column(db.Integer, primary_key=True, autoincrement=True)
    wilaya_id  = db.Column(db.Integer, db.ForeignKey("wilayas.id"), nullable=False)
    name       = db.Column(db.String(100), nullable=False)
    name_ar    = db.Column(db.String(100), nullable=True)
    name_ha    = db.Column(db.String(100), nullable=True)
    # Centroïde approximatif de la moughataa — sert uniquement à détecter
    # automatiquement la wilaya/moughataa correspondant à un point GPS
    # dans le formulaire "Ajouter un lieu" (nearest-centroid). Nullable :
    # une moughataa sans centroïde reste utilisable normalement, seule la
    # détection automatique ne la propose pas.
    lat        = db.Column(db.Numeric(10, 8), nullable=True)
    lng        = db.Column(db.Numeric(11, 8), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            "id":       self.id,
            "wilayaId": self.wilaya_id,
            "name":     self.name,
            "nameAr":   self.name_ar,
            "nameHa":   self.name_ha,
            "lat":      float(self.lat) if self.lat is not None else None,
            "lng":      float(self.lng) if self.lng is not None else None,
        }

    def __repr__(self):
        return f"<Moughataa {self.id} — {self.name}>"
