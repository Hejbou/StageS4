"""Recherche de lieu côté serveur — pour donner au LLM une base réelle
(jamais inventée) sur laquelle phraser une réponse pendant la précision de
localisation. Interroge directement la table `locations` (même source que
`/api/locations` et que PoiDB côté frontend, qui n'en est qu'un cache
synchronisé) — jamais de données fictives.

Ne remplace PAS la logique de correspondance du moteur (PoiDB côté
frontend, voir chat.js::_matchPrecisionAnswer) qui reste seule autorité
pour valider un point de prise en charge réel — cette recherche ne sert
qu'à fournir un contexte de formulation au LLM.
"""
from ..models import Location


def _candidates(loc: Location) -> list[str]:
    names = [loc.name, loc.name_ar, loc.name_ha] + list(loc.aliases or [])
    return [n.strip().lower() for n in names if n]


def _localized_name(loc: Location, lang: str) -> str:
    """Nom canonique déjà traduit en base — jamais une traduction inventée
    par le LLM, qui reçoit directement le bon nom dans la langue voulue."""
    if lang == "ar" and loc.name_ar:
        return loc.name_ar
    if lang == "ha" and loc.name_ha:
        return loc.name_ha
    return loc.name


def find_location_context(text: str, lang: str = "fr", exclude_names=None, limit: int = 5) -> dict | None:
    """Cherche `text` parmi les lieux actifs. Si trouvé et que c'est un
    quartier/zone, renvoie aussi les lieux voisins (même quartier, hors
    exclusions), avec leur nom déjà dans la langue demandée. Renvoie None
    si rien ne correspond — jamais un lieu inventé pour combler l'absence
    de résultat."""
    if not text or not text.strip():
        return None
    needle = text.strip().lower()
    exclude = {n.strip().lower() for n in (exclude_names or []) if n}

    locations = Location.query.filter_by(is_active=True).all()

    matched = None
    for loc in locations:
        cands = _candidates(loc)
        if needle in cands:
            matched = loc
            break
    if not matched:
        for loc in locations:
            cands = _candidates(loc)
            if any(needle in c or c in needle for c in cands if len(c) >= 3):
                matched = loc
                break
    if not matched:
        return None

    if matched.type == "quartier":
        nearby = [
            loc for loc in locations
            if loc.quartier == matched.quartier
            and loc.id != matched.id
            and loc.type != "quartier"
            and _localized_name(loc, lang).strip().lower() not in exclude
        ][:limit]
        return {
            "location": _localized_name(matched, lang),
            "type": "district",
            "nearby_places": [{"name": _localized_name(loc, lang), "type": loc.type} for loc in nearby],
        }

    return {"location": _localized_name(matched, lang), "type": matched.type, "nearby_places": []}
