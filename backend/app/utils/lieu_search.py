"""Recherche de lieu côté serveur — pour donner au LLM une base réelle
(jamais inventée) sur laquelle phraser une réponse pendant la précision de
localisation. Interroge directement la table `lieux` (nouvelle hiérarchie
Ville -> Wilaya -> Moughataa -> Lieu, voir /api/lieux et lieu-db.js côté
frontend) — jamais de données fictives, et jamais la table `locations`
historique.

Ne remplace PAS la logique de correspondance du moteur (LieuDB côté
frontend, voir chat.js::_matchPrecisionAnswer) qui reste seule autorité
pour valider un point de prise en charge réel — cette recherche ne sert
qu'à fournir un contexte de formulation au LLM.
"""
from ..models import Lieu


def _candidates(lieu: Lieu) -> list[str]:
    names = [lieu.name_fr, lieu.name_ar] + list(lieu.names_ha or [])
    return [n.strip().lower() for n in names if n]


def _localized_name(lieu: Lieu, lang: str) -> str:
    """Nom canonique déjà traduit en base — jamais une traduction inventée
    par le LLM, qui reçoit directement le bon nom dans la langue voulue."""
    if lang == "ar" and lieu.name_ar:
        return lieu.name_ar
    if lang == "ha" and lieu.names_ha:
        return lieu.names_ha[0]
    return lieu.name_fr


def find_lieu_context(text: str, lang: str = "fr", exclude_names=None, limit: int = 5) -> dict | None:
    """Cherche `text` parmi les lieux actifs. Si trouvé et que c'est un
    quartier/zone, renvoie aussi les lieux voisins (même moughataa, hors
    exclusions), avec leur nom déjà dans la langue demandée. Renvoie None
    si rien ne correspond — jamais un lieu inventé pour combler l'absence
    de résultat."""
    if not text or not text.strip():
        return None
    needle = text.strip().lower()
    exclude = {n.strip().lower() for n in (exclude_names or []) if n}

    lieux = Lieu.query.filter_by(is_active=True).all()

    matched = None
    for lieu in lieux:
        cands = _candidates(lieu)
        if needle in cands:
            matched = lieu
            break
    if not matched:
        for lieu in lieux:
            cands = _candidates(lieu)
            if any(needle in c or c in needle for c in cands if len(c) >= 3):
                matched = lieu
                break
    if not matched:
        return None

    if matched.type == "quartier":
        nearby = [
            lieu for lieu in lieux
            if lieu.moughataa_id == matched.moughataa_id
            and lieu.id != matched.id
            and lieu.type != "quartier"
            and _localized_name(lieu, lang).strip().lower() not in exclude
        ][:limit]
        return {
            "location": _localized_name(matched, lang),
            "type": "district",
            "nearby_places": [{"name": _localized_name(lieu, lang), "type": lieu.type} for lieu in nearby],
        }

    return {"location": _localized_name(matched, lang), "type": matched.type, "nearby_places": []}
