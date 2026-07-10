"""
Intégration Google Maps API.

3 fonctions principales :
  - autocomplete(query)           → suggestions de lieux
  - geocode(address)              → lat/lng depuis un texte libre
  - distance_matrix(o, d)        → distance routière réelle + durée

Si GOOGLE_MAPS_API_KEY est vide, le fallback interroge la table
`locations` (même source que /api/locations, consommée par le chat
frontend) — plus de liste séparée codée en dur ici.
"""

import math
import re
import requests
from flask import current_app

from ..models import Location


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


# ── Fallback sans clé Google Maps : recherche dans la table `locations` ──
# Même source que /api/locations (frontend) — voir routes/locations.py.
def _match_locations(query: str, limit: int = 5) -> list[Location]:
    """Correspondance exacte puis partielle sur nom/alias (FR/AR/HA)."""
    q = _normalize(query)
    if not q:
        return []

    exact, partial = [], []
    for loc in Location.query.filter_by(is_active=True).all():
        names = [n for n in (loc.name, loc.name_ar, loc.name_ha, *(loc.aliases or [])) if n]
        normalized = [_normalize(n) for n in names]
        if q in normalized:
            exact.append(loc)
        elif any(q in n or n in q for n in normalized):
            partial.append(loc)

    ordered, seen = [], set()
    for loc in exact + partial:
        if loc.id in seen:
            continue
        seen.add(loc.id)
        ordered.append(loc)
        if len(ordered) >= limit:
            break
    return ordered


def _localized_name(loc: Location, language: str) -> str:
    return {"ar": loc.name_ar, "ha": loc.name_ha}.get(language) or loc.name


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

    # ── Fallback : table locations ───────────────────
    # `name` = nom canonique SEUL (pas de suffixe ville) : c'est le texte
    # inséré tel quel dans le champ de saisie au clic (voir suggestions-panel
    # côté frontend) — il doit rematcher EXACTEMENT ce même lieu ensuite,
    # sans quoi le clic redéclencherait une confirmation "vous voulez dire ?".
    matches = _match_locations(query, limit=8)
    return [
        {
            "name":            _localized_name(loc, language),
            "secondary_text":  loc.quartier or "Nouakchott",
            "place_id":        None,
            "lat":             float(loc.lat),
            "lng":             float(loc.lng),
        }
        for loc in matches
    ]


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

    # ── Fallback : table locations ───────────────────
    matches = _match_locations(address, limit=1)
    if matches:
        loc = matches[0]
        return {
            "lat": float(loc.lat), "lng": float(loc.lng),
            "formatted_address": f"{_localized_name(loc, language)}, Nouakchott",
            "place_id": None,
        }

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
#  REVERSE GEOCODE  — coordonnées GPS → quartier / ville / adresse
# ═══════════════════════════════════════════════════════════════════
def reverse_geocode(lat: float, lng: float, language: str = "fr") -> dict:
    """
    Déduit le quartier, la ville et une adresse formatée à partir de
    coordonnées GPS. Utilisé par le dashboard admin pour compléter
    automatiquement la fiche d'un lieu (l'admin ne saisit que le nom
    et le point GPS — voir routes/admin.py).

    Retourne toujours un dict (jamais None) :
      {"quartier": str|None, "city": str|None, "road": str|None, "formatted_address": str|None}
    """
    client = _get_client()

    # ── Mode Google Maps ─────────────────────────────
    if client:
        try:
            results = client.reverse_geocode((lat, lng), language=language)
            if results:
                comps = {c["types"][0]: c["long_name"] for c in results[0].get("address_components", []) if c.get("types")}
                quartier = comps.get("sublocality") or comps.get("neighborhood") or comps.get("sublocality_level_1")
                city     = comps.get("locality") or comps.get("administrative_area_level_2")
                road     = comps.get("route")
                return {
                    "quartier": quartier, "city": city, "road": road,
                    "formatted_address": results[0].get("formatted_address"),
                }
        except Exception as e:
            current_app.logger.warning(f"Maps reverse_geocode error: {e}")

    # ── Fallback : Nominatim (OpenStreetMap, gratuit, sans clé) ──────
    try:
        nom_lang = "ar" if language == "ar" else "fr"
        r = requests.get(
            "https://nominatim.openstreetmap.org/reverse",
            params={"lat": lat, "lon": lng, "format": "json", "accept-language": nom_lang, "zoom": 16},
            headers={"User-Agent": "ChatIA-Admin/1.0"},
            timeout=4,
        )
        if r.ok:
            data = r.json()
            addr = data.get("address") or {}
            # OSM modélise les quartiers de Nouakchott tantôt en "suburb"/
            # "neighbourhood", tantôt en "county" (ex: Ksar, Toujounine) —
            # on essaie toutes les variantes avant d'abandonner.
            quartier = (addr.get("suburb") or addr.get("neighbourhood") or addr.get("quarter")
                        or addr.get("residential") or addr.get("county"))
            city     = addr.get("city") or addr.get("town") or addr.get("village")
            road     = addr.get("road")
            if quartier or city:
                return {
                    "quartier": quartier, "city": city, "road": road,
                    "formatted_address": data.get("display_name"),
                }
    except Exception as e:
        current_app.logger.warning(f"Nominatim reverse_geocode error: {e}")

    # ── Fallback final : quartier du lieu catalogué le plus proche ───
    nearest, best_dist = None, None
    for loc in Location.query.filter_by(is_active=True).all():
        if not loc.quartier:
            continue
        d = _haversine(lat, lng, float(loc.lat), float(loc.lng))
        if best_dist is None or d < best_dist:
            nearest, best_dist = loc, d
    if nearest and best_dist is not None and best_dist <= 3:  # 3 km
        return {"quartier": nearest.quartier, "city": None, "road": None, "formatted_address": None}

    return {"quartier": None, "city": None, "road": None, "formatted_address": None}


# ═══════════════════════════════════════════════════════════════════
#  ALIASES  — génère les alias de recherche d'un lieu automatiquement
# ═══════════════════════════════════════════════════════════════════
def generate_aliases(name=None, name_ar=None, name_ha=None, quartier=None, road=None) -> list[str]:
    """
    Construit la liste d'alias de recherche à partir du nom (FR/AR/HA)
    et des informations de géocodage, pour que le chat retrouve le lieu
    sans que l'admin ait à taper des alias à la main.

    Le nom de ville (toujours "Nouakchott" dans cette app) n'est volontairement
    pas inclus : voir le commentaire dans _apply_geo_fields (routes/admin.py).
    """
    terms = [name, name_ar, name_ha, quartier, road]
    aliases, seen = [], set()
    for term in terms:
        if not term:
            continue
        cleaned = _normalize(term)
        if cleaned and cleaned not in seen:
            seen.add(cleaned)
            aliases.append(cleaned)
    return aliases


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
