"""
/api/locations — Lecture publique des lieux (pas réservée à l'admin).

C'est cette route que le frontend (poi-db.js) consomme au démarrage pour
remplacer la liste statique, et que le chat IA peut utiliser pour une
recherche de proximité pendant la phase de précision de localisation.
La gestion (créer / modifier / désactiver) se fait via /api/admin/locations
(voir routes/admin.py).
"""
from flask import Blueprint, request
from ..models import Location
from ..utils import ok, error
from ..utils.pricing import haversine_km

locations_bp = Blueprint("locations", __name__)


# ── GET /api/locations/ — tous les lieux actifs ─────────────────────────
@locations_bp.get("/")
def list_locations():
    # Tri par id (ordre d'insertion), pas alphabétique : poi-db.js s'en
    # sert pour compléter ses suggestions avec des repères "variés" quand
    # une zone n'en a pas assez — l'ordre alphabétique biaiserait toujours
    # vers les mêmes lettres. Les lieux ajoutés depuis l'admin s'ajoutent
    # naturellement à la suite des lieux historiques.
    locations = Location.query.filter_by(is_active=True).order_by(Location.id.asc()).all()
    return ok([l.to_dict() for l in locations])


# ── GET /api/locations/nearby?lat=..&lng=..&radius_m=300&type=mosquee ───
@locations_bp.get("/nearby")
def nearby_locations():
    """
    Recherche de proximité pour la phase de précision du chat : renvoie les
    lieux actifs dans un rayon donné (mètres) autour d'un point, triés du
    plus proche au plus loin. `radius_m` élargit progressivement si non
    fourni explicitement (200m -> 350m -> 500m) jusqu'à trouver `limit`
    résultats, pour rester dans la fourchette 100-500m demandée.
    """
    try:
        lat = float(request.args["lat"])
        lng = float(request.args["lng"])
    except (KeyError, ValueError):
        return error("lat et lng sont obligatoires (float)")

    type_filter  = request.args.get("type")
    limit        = min(int(request.args.get("limit", 5)), 20)
    explicit_radius = request.args.get("radius_m")

    query = Location.query.filter_by(is_active=True)
    if type_filter:
        query = query.filter_by(type=type_filter)
    candidates = query.all()

    def _within(radius_m):
        found = []
        for loc in candidates:
            dist_m = haversine_km(lat, lng, float(loc.lat), float(loc.lng)) * 1000
            if dist_m <= radius_m:
                found.append((dist_m, loc))
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
    return ok([{**loc.to_dict(), "distance_m": round(dist_m, 1)} for dist_m, loc in results])
