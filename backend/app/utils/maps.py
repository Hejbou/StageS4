"""
Intégration Google Maps API.

3 fonctions principales :
  - autocomplete(query)           → suggestions de lieux
  - geocode(address)              → lat/lng depuis un texte libre
  - distance_matrix(o, d)        → distance routière réelle + durée

Si GOOGLE_MAPS_API_KEY est vide, un fallback hardcodé sur
les 18 quartiers de Nouakchott est utilisé automatiquement.
"""

import math
import re
from flask import current_app

# ── Fallback : 18 zones connues de Nouakchott ────────────────────
_NOUAKCHOTT_ZONES = {
    "tevragh zeina":    (18.09240, -15.97450),
    "ksar":             (18.08690, -15.97180),
    "sebkha":           (18.08150, -15.97350),
    "el mina":          (18.07600, -16.00200),
    "dar naim":         (18.10850, -15.96300),
    "toujounine":       (18.12500, -15.97600),
    "arafat":           (18.06700, -15.95200),
    "riad":             (18.08100, -15.96000),
    "teyarett":         (18.09100, -15.96000),
    "socogim":          (18.09600, -15.96800),
    "pk 12":            (18.12200, -15.98500),
    "pk12":             (18.12200, -15.98500),
    "carrefour":        (18.08700, -15.97100),
    "port de peche":    (18.06800, -16.01300),
    "port":             (18.06800, -16.01300),
    "marche capital":   (18.08800, -15.97300),
    "marché capital":   (18.08800, -15.97300),
    "marche cinquieme": (18.08300, -15.97000),
    "marché cinquième": (18.08300, -15.97000),
    "universite":       (18.09500, -15.96300),
    "université":       (18.09500, -15.96300),
    "hopital national": (18.09000, -15.97400),
    "hôpital national": (18.09000, -15.97400),
    "hopital":          (18.09000, -15.97400),
    "aeroport":         (18.09850, -15.94800),
    "aéroport":         (18.09850, -15.94800),
    "airport":          (18.09850, -15.94800),
}


def _get_client():
    """Retourne un client googlemaps ou None si pas de clé."""
    key = current_app.config.get("GOOGLE_MAPS_API_KEY", "")
    if not key or key == "YOUR_GOOGLE_MAPS_API_KEY_HERE":
        return None
    try:
        import googlemaps
        return googlemaps.Client(key=key)
    except Exception:
        return None


def _normalize(text: str) -> str:
    """Normalise le texte pour la recherche dans le fallback."""
    return re.sub(r"\s+", " ", text.strip().lower())


def _haversine(lat1, lng1, lat2, lng2) -> float:
    """Distance à vol d'oiseau en km."""
    R = 6371
    d_lat = math.radians(lat2 - lat1)
    d_lng = math.radians(lng2 - lng1)
    a = (math.sin(d_lat / 2) ** 2
         + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2))
         * math.sin(d_lng / 2) ** 2)
    return R * 2 * math.asin(math.sqrt(a))


# ═══════════════════════════════════════════════════════════════════
#  AUTOCOMPLETE  — suggestions pendant la saisie
# ═══════════════════════════════════════════════════════════════════
def autocomplete(query: str, language: str = "fr") -> list[dict]:
    """
    Retourne jusqu'à 5 suggestions de lieux pour un texte partiel.

    Retourne :
      [{"description": "Ksar, Nouakchott", "place_id": "ChIJ...", "lat": ..., "lng": ...}, ...]
    """
    query = query.strip()
    if not query:
        return []

    client = _get_client()

    # ── Mode Google Maps ─────────────────────────────
    if client:
        try:
            cfg = current_app.config
            results = client.places_autocomplete(
                query,
                location=(cfg["MAPS_DEFAULT_LAT"], cfg["MAPS_DEFAULT_LNG"]),
                radius=cfg["MAPS_RADIUS_M"],
                language=language,
                components={"country": cfg["MAPS_COUNTRY"]},
                types=["geocode", "establishment"],
            )
            out = []
            for r in results[:5]:
                item = {
                    "description": r.get("description", ""),
                    "place_id":    r.get("place_id", ""),
                    "lat": None,
                    "lng": None,
                }
                # Enrichir avec les coordonnées si disponibles
                try:
                    geo = client.place(r["place_id"], fields=["geometry"])
                    loc = geo["result"]["geometry"]["location"]
                    item["lat"] = loc["lat"]
                    item["lng"] = loc["lng"]
                except Exception:
                    pass
                out.append(item)
            return out
        except Exception as e:
            current_app.logger.warning(f"Maps autocomplete error: {e}")

    # ── Fallback zones Nouakchott ────────────────────
    q = _normalize(query)
    results = []
    for name, (lat, lng) in _NOUAKCHOTT_ZONES.items():
        if q in name or name.startswith(q):
            results.append({
                "description": name.title() + ", Nouakchott, Mauritanie",
                "place_id":    None,
                "lat":         lat,
                "lng":         lng,
            })
    # Dédupliquer par (lat, lng)
    seen = set()
    unique = []
    for r in results:
        key = (r["lat"], r["lng"])
        if key not in seen:
            seen.add(key)
            unique.append(r)
    return unique[:5]


# ═══════════════════════════════════════════════════════════════════
#  GEOCODE  — texte libre → coordonnées GPS
# ═══════════════════════════════════════════════════════════════════
def geocode(address: str, language: str = "fr") -> dict | None:
    """
    Convertit un texte d'adresse en coordonnées GPS.

    Retourne :
      {"lat": 18.08, "lng": -15.97, "formatted_address": "Ksar, Nouakchott", "place_id": "..."}
    ou None si introuvable.
    """
    if not address or not address.strip():
        return None

    client = _get_client()

    # ── Mode Google Maps ─────────────────────────────
    if client:
        try:
            cfg     = current_app.config
            # Ajouter "Nouakchott Mauritanie" si l'adresse ne le mentionne pas
            query   = address.strip()
            if "mauritanie" not in query.lower() and "nouakchott" not in query.lower():
                query = f"{query}, Nouakchott, Mauritanie"

            results = client.geocode(
                query,
                region=cfg["MAPS_COUNTRY"],
                language=language,
                bounds={
                    "southwest": (17.8, -16.2),
                    "northeast": (18.3, -15.7),
                },
            )
            if results:
                loc = results[0]["geometry"]["location"]
                return {
                    "lat":               loc["lat"],
                    "lng":               loc["lng"],
                    "formatted_address": results[0].get("formatted_address", address),
                    "place_id":          results[0].get("place_id"),
                }
        except Exception as e:
            current_app.logger.warning(f"Maps geocode error: {e}")

    # ── Fallback zones Nouakchott ────────────────────
    q = _normalize(address)
    # Correspondance exacte d'abord
    if q in _NOUAKCHOTT_ZONES:
        lat, lng = _NOUAKCHOTT_ZONES[q]
        return {"lat": lat, "lng": lng, "formatted_address": address.title() + ", Nouakchott", "place_id": None}
    # Correspondance partielle
    for name, (lat, lng) in _NOUAKCHOTT_ZONES.items():
        if q in name or name in q:
            return {"lat": lat, "lng": lng, "formatted_address": name.title() + ", Nouakchott", "place_id": None}

    return None


# ═══════════════════════════════════════════════════════════════════
#  DISTANCE MATRIX  — distance routière réelle entre 2 points
# ═══════════════════════════════════════════════════════════════════
def distance_matrix(
    origin_lat: float, origin_lng: float,
    dest_lat: float,   dest_lng: float,
    language: str = "fr",
) -> dict:
    """
    Calcule la distance routière et la durée de trajet via Google Maps.

    Retourne :
      {"distance_km": 3.4, "duration_min": 12, "distance_text": "3.4 km", "duration_text": "12 min"}
    """
    client = _get_client()

    # ── Mode Google Maps ─────────────────────────────
    if client:
        try:
            result = client.distance_matrix(
                origins=      [(origin_lat, origin_lng)],
                destinations= [(dest_lat,   dest_lng)],
                mode=         "driving",
                language=     language,
            )
            element = result["rows"][0]["elements"][0]
            if element["status"] == "OK":
                km  = round(element["distance"]["value"] / 1000, 2)
                min = element["duration"]["value"] // 60
                return {
                    "distance_km":   km,
                    "duration_min":  min,
                    "distance_text": element["distance"]["text"],
                    "duration_text": element["duration"]["text"],
                }
        except Exception as e:
            current_app.logger.warning(f"Maps distance_matrix error: {e}")

    # ── Fallback Haversine (×1.35 pour route réelle approx.) ────
    crow = _haversine(origin_lat, origin_lng, dest_lat, dest_lng)
    road = round(crow * 1.35, 2)
    mins = max(5, int(road / 30 * 60))   # vitesse moyenne 30 km/h en ville
    return {
        "distance_km":   road,
        "duration_min":  mins,
        "distance_text": f"{road} km",
        "duration_text": f"{mins} min",
    }


# ═══════════════════════════════════════════════════════════════════
#  RESOLVE  — résoudre un texte en lieu complet (geocode + coords)
# ═══════════════════════════════════════════════════════════════════
def resolve_location(text: str, language: str = "fr") -> dict | None:
    """
    Fonction principale utilisée par le chat :
    Prend un texte libre ("je pars de Ksar") et retourne
    lat, lng, adresse formatée.
    """
    # Nettoyer le texte des mots parasites
    clean = re.sub(
        r"\b(je|pars|viens|suis|part|depuis|de|du|la|le|les|à|a|au|aux|vers|pour|aller|veux|vais)\b",
        " ", text, flags=re.IGNORECASE
    )
    clean = re.sub(r"\s+", " ", clean).strip()
    if not clean:
        clean = text

    return geocode(clean, language)
