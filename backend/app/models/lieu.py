from datetime import datetime
from ..extensions import db

# Types de lieu propres à la nouvelle hiérarchie (indépendants de
# LOCATION_TYPES/`locations`, qui reste inchangée pour le chat) — "Hôpital"
# et "Clinique" d'une part, "École" et "Université" d'autre part, sont
# des types distincts ici plutôt que des libellés combinés.
LIEU_TYPES = ("quartier", "marche", "hopital", "clinique", "mosquee", "ecole",
              "universite", "carrefour", "station", "admin", "hotel", "autre")


class Lieu(db.Model):
    """Lieu — nœud final de la hiérarchie géographique
    (Ville -> Wilaya -> Moughataa -> Lieu), saisi depuis la nouvelle
    gestion des lieux de l'espace admin. Indépendant de la table
    `locations` (catalogue historique utilisé par le chat, le calcul du
    prix et la carte) : les deux coexistent sans interférence tant que
    le chat n'a pas basculé sur celui-ci."""
    __tablename__ = "lieux"

    id           = db.Column(db.Integer, primary_key=True, autoincrement=True)
    moughataa_id = db.Column(db.Integer, db.ForeignKey("moughataas.id"), nullable=False)
    name_fr      = db.Column(db.String(150), nullable=False)
    name_ar      = db.Column(db.String(150), nullable=False)
    names_ha     = db.Column(db.JSON, nullable=True)  # liste de noms hassaniya (0..n)
    type         = db.Column(db.Enum(*LIEU_TYPES), nullable=False, default="autre")
    lat          = db.Column(db.Numeric(10, 8), nullable=False)
    lng          = db.Column(db.Numeric(11, 8), nullable=False)
    is_active    = db.Column(db.Boolean, nullable=False, default=True)
    created_by   = db.Column(db.String(8), db.ForeignKey("users.phone"), nullable=True)
    created_at   = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at   = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    moughataa = db.relationship("Moughataa", backref="lieux", lazy=True)

    def to_dict(self):
        moughataa = self.moughataa
        wilaya = moughataa.wilaya if moughataa else None
        return {
            "id":            self.id,
            "moughataaId":   self.moughataa_id,
            "moughataaName": moughataa.name if moughataa else None,
            "wilayaId":      wilaya.id if wilaya else None,
            "wilayaName":    wilaya.name if wilaya else None,
            "nameFr":        self.name_fr,
            "nameAr":        self.name_ar,
            "namesHa":       self.names_ha or [],
            "type":          self.type,
            "lat":           float(self.lat),
            "lng":           float(self.lng),
            "is_active":     self.is_active,
            "created_by":    self.created_by,
            "created_at":    self.created_at.isoformat() if self.created_at else None,
        }

    def __repr__(self):
        return f"<Lieu {self.id} — {self.name_fr}>"
