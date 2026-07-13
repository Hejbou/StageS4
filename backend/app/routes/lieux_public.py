"""
/api/lieux — Lecture publique des lieux de la nouvelle hiérarchie
(Ville -> Wilaya -> Moughataa -> Lieu), pas réservée à l'admin.

C'est cette route que le frontend (lieu-db.js) consomme au démarrage pour
que le chat IA comprenne/recherche les lieux exclusivement dans cette base
(voir lieu-db.js). La gestion (créer / modifier / désactiver) se fait via
/api/admin/lieux (voir routes/admin.py) et reste inchangée.

Indépendante de /api/locations (catalogue historique `locations`, toujours
utilisé par le calcul du prix et la carte) : les deux coexistent sans
interférence.
"""
from flask import Blueprint, request
from ..models import Lieu
from ..utils import ok, error
from ..utils.pricing import haversine_km

lieux_bp = Blueprint("lieux", __name__)


# ── GET /api/lieux/ — tous les lieux actifs ──────────────────────────────
@lieux_bp.get("/")
def list_lieux():
    # Tri par id (ordre d'insertion), comme /api/locations/ : évite un
    # biais alphabétique quand lieu-db.js complète ses suggestions.
    lieux = Lieu.query.filter_by(is_active=True).order_by(Lieu.id.asc()).all()
    return ok([l.to_dict() for l in lieux])


# ── GET /api/lieux/nearby?lat=..&lng=..&radius_m=300&type=carrefour ─────
@lieux_bp.get("/nearby")
def nearby_lieux():
    """
    Recherche de proximité pour la phase de précision du chat : renvoie les
    lieux actifs dans un rayon donné (mètres) autour d'un point, triés du
    plus proche au plus loin. `radius_m` élargit progressivement si non
    fourni explicitement (200m -> 350m -> 500m) jusqu'à trouver `limit`
    résultats — même contrat que /api/locations/nearby.
    """
    try:
        lat = float(request.args["lat"])
        lng = float(request.args["lng"])
    except (KeyError, ValueError):
        return error("lat et lng sont obligatoires (float)")

    type_filter  = request.args.get("type")
    limit        = min(int(request.args.get("limit", 5)), 20)
    explicit_radius = request.args.get("radius_m")

    query = Lieu.query.filter_by(is_active=True)
    if type_filter:
        query = query.filter_by(type=type_filter)
    candidates = query.all()

    def _within(radius_m):
        found = []
        for lieu in candidates:
            dist_m = haversine_km(lat, lng, float(lieu.lat), float(lieu.lng)) * 1000
            if dist_m <= radius_m:
                found.append((dist_m, lieu))
        found.sort(key=lambda x: x[0])
        return found

    if explicit_radius:
        results = _within(float(explicit_radius))
    else:
        results = []
        for radius_m in (200, 350, 500):
            results = _within(radius_m)
            if len(results) >= limit:
                break

    results = results[:limit]
    return ok([{**lieu.to_dict(), "distance_m": round(dist_m, 1)} for dist_m, lieu in results])
