"""
/api/maps — Endpoints Google Maps pour le chat et le frontend.

Le chatbot appelle ces endpoints pour :
  1. Suggérer des lieux pendant la frappe (autocomplete)
  2. Convertir un texte en coordonnées GPS (geocode)
  3. Calculer la vraie distance routière entre 2 points (distance)
  4. Résoudre en une seule requête un texte libre (resolve)
"""

from flask import Blueprint, request
from ..utils.maps import autocomplete, geocode, distance_matrix, resolve_location
from ..utils.pricing import calculate_price
from ..utils.responses import ok, error

maps_bp = Blueprint("maps", __name__)


# ── GET /api/maps/autocomplete?q=ksar&lang=fr ──────────────
@maps_bp.get("/autocomplete")
def maps_autocomplete():
    """
    Suggestions de lieux en temps réel pendant la saisie.
    Utilisé par le chat pour proposer des lieux à l'utilisateur.

    Paramètres :
      q    : texte partiel (min 2 caractères)
      lang : fr | ar | ha  (défaut: fr)

    Exemple : GET /api/maps/autocomplete?q=ksar
    Réponse :
      [{"description": "Ksar, Nouakchott", "place_id": "...", "lat": 18.08, "lng": -15.97}]
    """
    q    = (request.args.get("q") or "").strip()
    lang = request.args.get("lang", "fr")

    if len(q) < 2:
        return ok([])

    results = autocomplete(q, language=lang)
    return ok(results)


# ── GET /api/maps/geocode?address=Ksar&lang=fr ─────────────
@maps_bp.get("/geocode")
def maps_geocode():
    """
    Convertit un texte d'adresse en coordonnées GPS (lat/lng).
    Utilisé par le chat quand l'utilisateur confirme son lieu de départ/arrivée.

    Paramètres :
      address : texte de l'adresse
      lang    : fr | ar | ha

    Exemple : GET /api/maps/geocode?address=Tevragh+Zeina
    Réponse :
      {"lat": 18.09, "lng": -15.97, "formatted_address": "Tevragh Zeina, Nouakchott", "place_id": "..."}
    """
    address = (request.args.get("address") or "").strip()
    lang    = request.args.get("lang", "fr")

    if not address:
        return error("Le paramètre 'address' est obligatoire")

    result = geocode(address, language=lang)
    if not result:
        return error(f"Lieu introuvable : '{address}'", 404)

    return ok(result)


# ── GET /api/maps/distance ──────────────────────────────────
@maps_bp.get("/distance")
def maps_distance():
    """
    Calcule la distance routière réelle et la durée entre 2 points GPS.
    Retourne aussi le prix estimé de la course.

    Paramètres :
      origin_lat, origin_lng   : coordonnées du départ
      dest_lat,   dest_lng     : coordonnées de l'arrivée
      lang                     : fr | ar | ha

    Exemple :
      GET /api/maps/distance?origin_lat=18.08&origin_lng=-15.97&dest_lat=18.09&dest_lng=-15.96
    Réponse :
      {"distance_km": 2.1, "duration_min": 8, "price": 102.5, "currency": "MRU", ...}
    """
    try:
        origin_lat = float(request.args["origin_lat"])
        origin_lng = float(request.args["origin_lng"])
        dest_lat   = float(request.args["dest_lat"])
        dest_lng   = float(request.args["dest_lng"])
    except (KeyError, ValueError):
        return error("origin_lat, origin_lng, dest_lat, dest_lng sont obligatoires (float)")

    lang   = request.args.get("lang", "fr")
    result = distance_matrix(origin_lat, origin_lng, dest_lat, dest_lng, language=lang)
    price  = calculate_price(result["distance_km"])

    return ok({
        **result,
        "price":    price,
        "currency": "MRU",
    })


# ── POST /api/maps/resolve ──────────────────────────────────
@maps_bp.post("/resolve")
def maps_resolve():
    """
    Endpoint principal utilisé par le chatbot.

    Prend le texte brut écrit par l'utilisateur (ex: "je pars de Ksar")
    et retourne le lieu résolu avec coordonnées + estimation de prix si
    origine ET destination sont fournies.

    Body JSON :
      {
        "origin_text":      "Ksar",           ← texte départ (obligatoire)
        "destination_text": "Tevragh Zeina",  ← texte arrivée (optionnel)
        "lang": "fr"
      }

    Réponse :
      {
        "origin":      {"lat": ..., "lng": ..., "formatted_address": "..."},
        "destination": {"lat": ..., "lng": ..., "formatted_address": "..."},
        "distance_km": 2.1,
        "duration_min": 8,
        "price": 102.5,
        "currency": "MRU"
      }
    """
    data         = request.get_json(silent=True) or {}
    origin_text  = (data.get("origin_text")      or "").strip()
    dest_text    = (data.get("destination_text")  or "").strip()
    lang         = data.get("lang", "fr")

    if not origin_text:
        return error("origin_text est obligatoire")

    # Résolution du départ
    origin = resolve_location(origin_text, language=lang)
    if not origin:
        return error(f"Départ introuvable : '{origin_text}'", 404)

    response = {"origin": origin}

    # Résolution de l'arrivée + calcul distance/prix
    if dest_text:
        destination = resolve_location(dest_text, language=lang)
        if not destination:
            return error(f"Destination introuvable : '{dest_text}'", 404)

        dist_info = distance_matrix(
            origin["lat"],      origin["lng"],
            destination["lat"], destination["lng"],
            language=lang,
        )
        price = calculate_price(dist_info["distance_km"])

        response.update({
            "destination":  destination,
            "distance_km":  dist_info["distance_km"],
            "duration_min": dist_info["duration_min"],
            "distance_text":dist_info["distance_text"],
            "duration_text":dist_info["duration_text"],
            "price":        price,
            "currency":     "MRU",
        })

    return ok(response)
