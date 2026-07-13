"""
/api/nlu — Proxy backend vers le provider NLU actif (LLM ou "rules").

Rôle strictement limité à la compréhension du langage — jamais de logique
métier ici : pas de prix, pas de chauffeur, pas de réservation, pas de
lieu validé. Voir la proposition d'architecture validée : le contrat
échangé (`_validate_analysis`) ne contient que des champs de
compréhension générique (intent / entities / route / locationAnswer /
confidence / language / onTopic), jamais un champ spécifique au
transport qui figerait le contrat à un seul domaine.

La clé API du fournisseur ne quitte jamais ce module : le frontend
n'envoie que le texte + le contexte conversationnel, jamais la config
LLM elle-même (voir GET /api/nlu/config, qui ne renvoie que ce dont le
frontend a besoin pour décider s'il doit même tenter cet appel).
"""
import time
from flask import Blueprint, current_app, request
from flask_jwt_extended import jwt_required

from ..models import LlmSettings
from ..models.llm_settings import SUPPORTED_LANGUAGES
from ..utils import ok, error
from ..utils.intents import KNOWN_INTENTS
from ..utils.location_search import find_location_context
from ..utils.llm_providers import (
    get_adapter, LlmTimeoutError, LlmQuotaError, LlmApiError, LlmInvalidResponseError,
)

nlu_bp = Blueprint("nlu", __name__)

# ── Disjoncteur (circuit breaker) ───────────────────────────────────────
# État en mémoire du process — après N échecs consécutifs, on arrête
# d'appeler le LLM pendant un court délai pour ne pas ajouter de latence
# inutile lors d'une panne/quota prolongé. Un succès réinitialise tout.
_CIRCUIT_THRESHOLD = 3
_CIRCUIT_COOLDOWN_S = 60
_circuit = {"consecutive_failures": 0, "open_until": 0.0}


def _circuit_is_open() -> bool:
    return time.time() < _circuit["open_until"]


def _record_failure():
    _circuit["consecutive_failures"] += 1
    if _circuit["consecutive_failures"] >= _CIRCUIT_THRESHOLD:
        _circuit["open_until"] = time.time() + _CIRCUIT_COOLDOWN_S


def _record_success():
    _circuit["consecutive_failures"] = 0
    _circuit["open_until"] = 0.0


# ── Point d'appel LLM partagé par /analyze et /reply ────────────────────
def _prepare_call(settings: LlmSettings):
    """Vérifie que ce provider peut être appelé maintenant. Renvoie
    (adapter, None) si oui, ou (None, réponse_erreur) sinon."""
    if settings.provider == "rules":
        return None, error("Le provider actif est 'rules' — cette route ne doit pas être appelée", 400)
    if not settings.api_key:
        return None, error("Aucune clé API configurée pour ce provider", 400)
    adapter = get_adapter(settings.provider)
    if not adapter:
        return None, error(f"Provider '{settings.provider}' non supporté côté serveur", 400)
    if _circuit_is_open():
        current_app.logger.warning(f"[NLU] {settings.provider}: disjoncteur ouvert, appel refusé")
        return None, error("LLM temporairement indisponible (trop d'échecs récents)", 503)
    return adapter, None


def _complete_or_error(settings: LlmSettings, adapter, system_prompt: str, user_prompt: str):
    """Appelle l'adaptateur, journalise et gère le disjoncteur de façon
    identique pour toute route qui appelle un LLM. Renvoie (raw_dict, None)
    si l'appel a réussi, ou (None, réponse_erreur) sinon."""
    try:
        raw = adapter.complete(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            api_key=settings.api_key,
            model=settings.model_name,
            temperature=float(settings.temperature),
            max_tokens=settings.max_tokens,
        )
    except LlmTimeoutError as e:
        _record_failure()
        current_app.logger.warning(f"[NLU] {settings.provider}: timeout — {e}")
        return None, error(str(e), 504)
    except LlmQuotaError as e:
        _record_failure()
        current_app.logger.warning(f"[NLU] {settings.provider}: quota dépassé — {e}")
        return None, error(str(e), 429)
    except (LlmApiError, LlmInvalidResponseError) as e:
        _record_failure()
        current_app.logger.warning(f"[NLU] {settings.provider}: échec — {e}")
        return None, error(str(e), 502)
    return raw, None


# ── Construction du prompt ───────────────────────────────────────────────
# {intents} est rempli dynamiquement depuis KNOWN_INTENTS (utils/intents.py,
# lui-même lu depuis frontend/js/intents.js) — jamais recopié à la main ici,
# pour qu'un intent ajouté à intents.js apparaisse aussi dans le prompt sans
# toucher ce fichier.
_FIXED_INSTRUCTIONS = """Tu es un module de compréhension du langage (NLU) pour un chatbot de réservation de transport à Nouakchott, Mauritanie. Tu ne parles JAMAIS directement à l'utilisateur et tu n'as accès à aucune information sur les prix, les chauffeurs, les courses en cours ou la carte. Ton seul rôle est de comprendre le message et de répondre EXCLUSIVEMENT avec un objet JSON valide, sans aucun texte avant ou après, respectant EXACTEMENT ce schéma :

{{
  "intent": une valeur parmi [{intents}],
  "entities": {{}},
  "route": {{ "origin": string ou null, "destination": string ou null }} ou null,
  "locationAnswer": {{ "cleaned": string, "typeHint": string ou null }} ou null,
  "confidence": {{ "intent": nombre entre 0 et 1, "route": nombre entre 0 et 1 ou null, "locationAnswer": nombre entre 0 et 1 ou null }},
  "language": "fr" ou "ar" ou "ha",
  "onTopic": true ou false
}}

Règles strictes :
- "route" : uniquement si l'utilisateur mentionne un départ et/ou une destination dans CE message, en texte brut (jamais de coordonnées, jamais un lieu déjà vérifié).
- "locationAnswer" : uniquement si l'état de la conversation indique une phase de précision de lieu (state contient "PRECISION") — "cleaned" est le texte du repère nettoyé de toute formule de politesse ou préposition, "typeHint" une catégorie devinée (hopital, mosquee, ecole, marche, station, carrefour, hotel, admin) si aucune instance précise n'est nommée.
- Si une information (origine ou destination) est déjà connue (voir "Origine déjà connue" / "Destination déjà connue" ci-dessous), ne la répète pas dans "route" sauf si l'utilisateur la corrige explicitement dans CE message.
- Si le message est bref et ressemble à un simple nom de lieu (quartier, repère...), sans autre contenu, et qu'aucune origine/destination n'est encore connue : traite-le comme probablement "REQUEST_TRANSPORT" avec ce lieu en "route.origin" plutôt que "UNKNOWN" — un client qui commence une conversation en donnant juste un nom d'endroit est presque toujours en train d'indiquer son point de départ, pas hors-sujet.
- Le message peut être écrit en français, arabe standard ou hassaniya (arabe dialectal mauritanien), avec des fautes d'orthographe, une graphie phonétique ou un mélange des trois (ex: latin/arabe) — comprends le sens malgré ces variations.
- Pour "route.origin", "route.destination" et "locationAnswer.cleaned" : normalise le nom de lieu mentionné (corrige les fautes de frappe évidentes, la graphie phonétique) en gardant le nom le plus proche de ce que l'utilisateur a réellement dit — mais n'invente JAMAIS un lieu qu'il n'a pas mentionné, et ne remplace jamais son repère par un autre lieu de ton choix : ce n'est pas toi qui valides l'existence du lieu, seul le moteur (base de données réelle) en a l'autorité.
- Si le message n'a clairement aucun rapport avec le transport ou la réservation, mets "onTopic": false et "intent": "UNKNOWN".
- Ne mentionne, n'invente et ne suppose jamais de prix, de chauffeur, de coordonnées GPS ou de statut de réservation.
- Réponds uniquement avec le JSON demandé, rien d'autre.""".format(intents=", ".join(KNOWN_INTENTS))


def _build_system_prompt(settings: LlmSettings) -> str:
    langs = ", ".join(settings.enabled_languages or list(SUPPORTED_LANGUAGES))
    strict_note = (
        "Mode strict transport actif : si le message n'a clairement aucun rapport avec le transport, "
        "réponds avec onTopic=false et intent=UNKNOWN, même si tu pourrais répondre à la question toi-même."
        if settings.strict_transport_mode else
        "Classe l'intention du mieux que tu peux même si le message semble hors-sujet."
    )
    custom = (settings.system_prompt or "").strip()
    parts = [_FIXED_INSTRUCTIONS, f"Langues à comprendre : {langs}.", strict_note]
    if custom:
        parts.append(f"Contexte additionnel fourni par l'administrateur : {custom}")
    return "\n\n".join(parts)


def _build_user_prompt(text: str, context: dict, settings: LlmSettings) -> str:
    history = context.get("history") or []
    size = settings.history_size or 6
    trimmed = history[-size:] if isinstance(history, list) else []
    history_lines = "\n".join(
        f"- {h.get('role', '?')}: {h.get('text', '')}"
        for h in trimmed if isinstance(h, dict)
    ) or "(aucun)"

    return (
        f"Canal : {context.get('channel') or 'chat'}\n"
        f"État de la conversation : {context.get('state') or 'IDLE'}\n"
        f"Origine déjà connue : {context.get('pendingOrigin') or 'aucune'}\n"
        f"Destination déjà connue : {context.get('pendingDest') or 'aucune'}\n"
        f"Lieux déjà proposés à ne pas répéter : {', '.join(context.get('proposedPlaces') or []) or 'aucun'}\n"
        f"Historique récent (du plus ancien au plus récent) :\n{history_lines}\n\n"
        f"Message de l'utilisateur à analyser : \"{text}\""
    )


# ── Validation stricte de la réponse ────────────────────────────────────
def _clamp01(value):
    try:
        return max(0.0, min(1.0, float(value)))
    except (TypeError, ValueError):
        return None


def _validate_analysis(raw) -> dict | None:
    """Ne fait JAMAIS confiance au JSON renvoyé par le LLM tel quel :
    toute valeur hors schéma est ignorée ou ramenée à un état sûr.
    Retourne None si la réponse est trop malformée pour être exploitable
    (déclenche un repli côté appelant)."""
    if not isinstance(raw, dict):
        return None

    on_topic = bool(raw.get("onTopic", True))
    intent = raw.get("intent")
    if intent not in KNOWN_INTENTS or not on_topic:
        intent = "UNKNOWN"

    route = raw.get("route")
    if isinstance(route, dict):
        origin = route.get("origin")
        destination = route.get("destination")
        origin = origin.strip() if isinstance(origin, str) and origin.strip() else None
        destination = destination.strip() if isinstance(destination, str) and destination.strip() else None
        route = {"origin": origin, "destination": destination} if (origin or destination) else None
    else:
        route = None

    location_answer = raw.get("locationAnswer")
    if isinstance(location_answer, dict) and isinstance(location_answer.get("cleaned"), str) and location_answer["cleaned"].strip():
        type_hint = location_answer.get("typeHint")
        location_answer = {
            "cleaned": location_answer["cleaned"].strip(),
            "typeHint": type_hint.strip() if isinstance(type_hint, str) and type_hint.strip() else None,
        }
    else:
        location_answer = None

    confidence_raw = raw.get("confidence") if isinstance(raw.get("confidence"), dict) else {}
    confidence = {
        "intent": _clamp01(confidence_raw.get("intent")) or 0.5,
        "route": _clamp01(confidence_raw.get("route")),
        "locationAnswer": _clamp01(confidence_raw.get("locationAnswer")),
    }

    language = raw.get("language")
    language = language if language in SUPPORTED_LANGUAGES else None

    entities = raw.get("entities") if isinstance(raw.get("entities"), dict) else {}

    return {
        "intent": intent, "entities": entities, "route": route,
        "locationAnswer": location_answer, "confidence": confidence,
        "language": language, "onTopic": on_topic,
    }


# ── GET /api/nlu/config — ce dont le frontend a besoin, rien de sensible ─
@nlu_bp.get("/config")
@jwt_required()
def get_config():
    settings = LlmSettings.get_current()
    return ok({
        "provider": settings.provider,
        "historySize": settings.history_size,
        "enabledLanguages": settings.enabled_languages,
        "strictTransportMode": settings.strict_transport_mode,
    })


# ── POST /api/nlu/analyze — le seul endroit qui appelle le LLM ─────────
@nlu_bp.post("/analyze")
@jwt_required()
def analyze():
    data = request.get_json(silent=True) or {}
    text = (data.get("text") or "").strip()
    if not text:
        return error("text est obligatoire")
    context = data.get("context") or {}
    if not isinstance(context, dict):
        context = {}

    settings = LlmSettings.get_current()
    adapter, err = _prepare_call(settings)
    if err:
        return err

    system_prompt = _build_system_prompt(settings)
    user_prompt = _build_user_prompt(text, context, settings)

    raw, err = _complete_or_error(settings, adapter, system_prompt, user_prompt)
    if err:
        return err

    validated = _validate_analysis(raw)
    if validated is None:
        _record_failure()
        current_app.logger.warning(f"[NLU] {settings.provider}: réponse invalide (schéma non respecté)")
        return error("Réponse LLM invalide (schéma non respecté)", 502)

    _record_success()
    current_app.logger.info(
        f"[NLU] {settings.provider}: réponse OK — intent={validated['intent']} "
        f"onTopic={validated['onTopic']} route={'oui' if validated['route'] else 'non'} "
        f"locationAnswer={'oui' if validated['locationAnswer'] else 'non'}"
    )
    return ok(validated)


# ── POST /api/nlu/reply — le LLM formule le message de précision de lieu ─
# Contrairement à /analyze (compréhension), cette route sert à FORMULER
# une phrase pour l'utilisateur — mais toujours sans logique métier : le
# LLM ne reçoit que des lieux déjà vérifiés en base (voir location_search)
# et doit les utiliser tels quels, jamais en inventer d'autres. Le moteur
# (chat.js) reste seul responsable de la validation finale du point de
# prise en charge, du prix et de la réservation — inchangé.
_REPLY_SITUATIONS = (
    "zone_detected", "ask_landmarks", "confirmed", "giveup",
    "match_declined", "modify_choice", "modify_ask_origin", "modify_ask_dest",
    "cancel_kept", "booking_cancelled", "flow_abandoned", "confirm_options",
    "booking_confirmed", "price_announce", "retry_origin", "retry_dest", "ask_destination",
    "global_no_active", "global_active_trip", "global_help", "global_history",
    "global_map", "driver_found", "no_driver", "status_pending", "match_confirm_ask",
)

_REPLY_SYSTEM_PROMPT = """Tu aides un chatbot de réservation de transport à Nouakchott, Mauritanie, à formuler UNE SEULE réponse courte et naturelle à l'utilisateur, dans sa langue — jamais de logique métier, jamais de calcul, jamais de recherche : toutes les valeurs (lieux, prix, chauffeur...) te sont données déjà vérifiées, tu dois les utiliser EXACTEMENT telles quelles dans ta phrase, sans jamais en inventer, en modifier ou en omettre une.

Réponds EXCLUSIVEMENT avec un objet JSON valide, sans aucun texte avant ou après :
{"message": "ta phrase ici"}

Selon la situation donnée :
- "zone_detected" : le lieu mentionné est une grande zone/quartier, pas un point précis. Explique-le brièvement et, si des lieux proches sont fournis, demande duquel il est le plus proche en les citant. Sinon demande un repère (mosquée, marché, clinique...).
- "ask_landmarks" : une tentative précédente n'a pas été comprise. Reformule la demande de repère avec les nouveaux lieux fournis (ou demande un autre repère si aucun), sans répéter mot pour mot la question précédente.
- "confirmed" : le point exact a été identifié — confirme-le brièvement.
- "giveup" : après plusieurs tentatives infructueuses, le moteur retient un lieu comme position approximative — explique-le avec bienveillance.
- "match_declined" : l'utilisateur a refusé une proposition de lieu — demande-lui de préciser autrement, brièvement.
- "modify_choice" : demande s'il veut modifier le départ ou la destination (répondre 1 ou 2, ou le dire directement).
- "modify_ask_origin" : demande la nouvelle origine.
- "modify_ask_dest" : demande la nouvelle destination.
- "cancel_kept" : l'utilisateur a choisi de garder sa course active malgré une demande d'annulation — rassure-le brièvement et demande comment l'aider.
- "booking_cancelled" : une course active vient d'être annulée avec succès — confirme-le.
- "flow_abandoned" : la réservation en cours (pas encore confirmée) vient d'être abandonnée à la demande de l'utilisateur — confirme brièvement, sans mentionner de course active.
- "confirm_options" : l'utilisateur devait répondre 1 (confirmer), 2 (annuler) ou 3 (modifier) et sa réponse n'a pas été comprise — redemande clairement ces 3 options.
- "booking_confirmed" : la réservation vient d'être confirmée et envoyée aux chauffeurs — annonce-le avec enthousiasme, sans jamais mentionner un prix ou un chauffeur (pas encore connu à ce stade).
- "price_announce" : annonce le trajet et son prix estimé EXACTEMENT tels que donnés (from, to, price) — ne recalcule et n'arrondis jamais toi-même, utilise la valeur donnée telle quelle.
- "retry_origin" / "retry_dest" : le lieu donné n'a pas été trouvé — si une suggestion est fournie, propose-la ; sinon demande de préciser le nom du quartier. Reste bref et bienveillant, ce n'est jamais une erreur de l'utilisateur.
- "ask_destination" : l'origine vient d'être validée — demande naturellement la destination.
- "global_no_active" : l'utilisateur demande le statut/annulation d'une course mais n'en a aucune active — informe-le simplement.
- "global_active_trip" : introduis brièvement la carte de course active qui va suivre (contextType précise "cancel" ou "status").
- "global_help" : explique brièvement comment utiliser le service.
- "global_history" : annonce que l'historique des conversations va s'afficher.
- "global_map" : annonce que la carte va s'afficher.
- "driver_found" : un chauffeur vient d'être trouvé — annonce-le chaleureusement avec EXACTEMENT les informations données (nom, ETA, véhicule, plaque, note) sans en inventer ou changer aucune.
- "no_driver" : aucun chauffeur n'est disponible pour l'instant — informe-en l'utilisateur avec bienveillance, sans donner de fausse date/heure.
- "status_pending" : une réservation est déjà en cours de recherche de chauffeur — informe l'utilisateur qu'il faut patienter, sans proposer d'en commencer une nouvelle.
- "match_confirm_ask" : le lieu donné ressemble à un lieu connu ("place") mais sans certitude totale — demande une confirmation simple (oui/non), en citant exactement ce nom.

Ne mentionne, n'invente et ne suppose JAMAIS une donnée qui ne t'a pas été fournie explicitement (prix, nom de chauffeur, heure, statut...)."""


def _build_reply_system_prompt(settings: LlmSettings) -> str:
    # Même principe que _build_system_prompt (/analyze) : le contexte
    # additionnel défini par l'admin (Paramètres IA > Prompt système)
    # s'applique à TOUS les appels LLM, pas seulement à /analyze — sinon
    # ce réglage n'aurait plus d'effet réel dès que la conversation passe
    # par /reply ou /decide (ce qui est le cas pour la quasi-totalité du
    # dialogue depuis l'introduction de decideNext/generateReply).
    custom = (settings.system_prompt or "").strip()
    if not custom:
        return _REPLY_SYSTEM_PROMPT
    return _REPLY_SYSTEM_PROMPT + f"\n\nContexte additionnel fourni par l'administrateur : {custom}"


def _build_reply_user_prompt(situation: str, lang: str, location_ctx: dict | None, place: str | None, extra: dict | None = None) -> str:
    lang_label = {"fr": "français", "ar": "arabe", "ha": "hassaniya (arabe dialectal mauritanien)"}.get(lang, "français")
    lines = [f"Situation : {situation}", f"Langue de réponse : {lang_label}"]
    extra = extra or {}

    if situation in ("zone_detected", "ask_landmarks"):
        zone = (location_ctx or {}).get("location") or place or "cette zone"
        nearby = (location_ctx or {}).get("nearby_places") or []
        lines.append(f"Zone concernée : {zone}")
        if nearby:
            places_txt = ", ".join(f'{p["name"]} ({p["type"]})' for p in nearby)
            lines.append(f"Lieux réels proches à proposer (utilise EXACTEMENT ces noms, rien d'autre) : {places_txt}")
        else:
            lines.append("Aucun lieu proche disponible en base — demande un repère à l'utilisateur.")
    elif situation in ("confirmed", "giveup", "match_confirm_ask"):
        lines.append(f"Lieu retenu : {place or 'inconnu'}")
    else:
        # Situations génériques : chaque champ de `extra` (déjà vérifié
        # côté moteur — prix, chauffeur, suggestion...) est listé tel
        # quel, jamais recalculé ni réinterprété ici.
        for key, value in extra.items():
            if value is None or value == "":
                continue
            lines.append(f"{key} : {value}")

    return "\n".join(lines)


def _validate_reply(raw) -> str | None:
    if not isinstance(raw, dict):
        return None
    message = raw.get("message")
    if not isinstance(message, str) or not message.strip():
        return None
    return message.strip()


@nlu_bp.post("/reply")
@jwt_required()
def reply():
    data = request.get_json(silent=True) or {}
    situation = data.get("situation")
    if situation not in _REPLY_SITUATIONS:
        return error(f"situation doit être l'une de : {', '.join(_REPLY_SITUATIONS)}")
    lang = data.get("lang") if data.get("lang") in SUPPORTED_LANGUAGES else "fr"
    location_text = (data.get("locationText") or "").strip() or None
    place = (data.get("place") or "").strip() or None
    exclude_names = data.get("excludeNames") if isinstance(data.get("excludeNames"), list) else []
    extra = data.get("data") if isinstance(data.get("data"), dict) else {}

    settings = LlmSettings.get_current()
    adapter, err = _prepare_call(settings)
    if err:
        return err

    location_ctx = None
    if situation in ("zone_detected", "ask_landmarks"):
        search_text = location_text or place
        location_ctx = find_location_context(search_text, lang=lang, exclude_names=exclude_names) if search_text else None

    system_prompt = _build_reply_system_prompt(settings)
    user_prompt = _build_reply_user_prompt(situation, lang, location_ctx, place, extra)

    raw, err = _complete_or_error(settings, adapter, system_prompt, user_prompt)
    if err:
        return err

    message = _validate_reply(raw)
    if message is None:
        _record_failure()
        current_app.logger.warning(f"[NLU] {settings.provider}: réponse /reply invalide (pas de message)")
        return error("Réponse LLM invalide (pas de message)", 502)

    _record_success()
    current_app.logger.info(f"[NLU] {settings.provider}: /reply OK — situation={situation}")
    return ok({
        "message": message,
        "nearbyPlaces": (location_ctx or {}).get("nearby_places", []),
    })


# ── POST /api/nlu/decide — le LLM devient gestionnaire de dialogue ──────
# Portée volontairement limitée à 3 états (IDLE, AWAITING_ORIGIN,
# AWAITING_DEST) — voir chat.js::_dispatchViaDecide. Le LLM choisit
# l'ACTION à mener et peut phraser une question naturelle (accueil,
# demande d'origine, clarification), mais ne valide JAMAIS un lieu
# lui-même : toute extraction de lieu part en texte brut vers le moteur
# (_handleOriginText/_handleDestText, inchangés), qui reste seul maître
# de la validation PoiDB, du prix et de la réservation. Les actions
# "métier" (CANCEL_TRIP, STATUS, CANCEL) déclenchent le même code engine
# qu'avant — le LLM ne fait ici que remplacer la classification figée
# (detectIntent) par un choix tenant compte du contexte complet.
_DECIDE_ACTIONS = (
    "GREET", "REQUEST_TRANSPORT", "CANCEL_TRIP", "CANCEL",
    "STATUS", "HELP", "HISTORY", "MAP", "CLARIFY", "OFF_TOPIC",
)

_DECIDE_SYSTEM_PROMPT = """Tu es le gestionnaire de dialogue d'un chatbot de réservation de transport à Nouakchott, Mauritanie. Tu ne parles JAMAIS de prix, de chauffeur, de course en cours ou de carte — tu n'y as pas accès. Ton rôle : comprendre le message dans son contexte complet (état de la conversation, historique, ce qui est déjà connu) et décider quoi faire ensuite. Réponds EXCLUSIVEMENT avec un objet JSON valide, sans aucun texte avant ou après, respectant EXACTEMENT ce schéma :

{{
  "action": une valeur parmi [{actions}],
  "route": {{ "origin": string ou null, "destination": string ou null }} ou null,
  "confidence": nombre entre 0 et 1,
  "language": "fr" ou "ar" ou "ha",
  "message": string ou null
}}

Règles strictes :
- "route" : uniquement si l'utilisateur mentionne un lieu dans CE message, en texte brut (jamais de coordonnées, jamais un lieu déjà vérifié) — tu extrais le texte, tu ne le valides JAMAIS toi-même : seul le moteur (base de données réelle) a l'autorité sur l'existence d'un lieu.
- Si le message est bref et ressemble à un simple nom de lieu (quartier, repère...), sans autre contenu, et qu'aucune origine n'est encore connue : traite-le comme "REQUEST_TRANSPORT" avec ce lieu en "route.origin" plutôt que "CLARIFY" ou "OFF_TOPIC" — un client qui commence par donner un nom d'endroit indique presque toujours son point de départ.
- Si une origine ou destination est déjà connue (voir contexte ci-dessous), ne la redemande jamais dans "route" sauf correction explicite de l'utilisateur.
- "message" : UNIQUEMENT pour "GREET" (accueil chaleureux), "REQUEST_TRANSPORT" sans lieu extrait (demande naturellement d'où il souhaite partir), et "CLARIFY" (question de clarification naturelle et brève, dans un français/arabe/hassaniya courant, comme le ferait un agent humain) — laisse "message" à null pour toutes les autres actions, le moteur s'en charge. Ne mentionne jamais de prix, de lieu inventé ou de statut de réservation dans "message".
- "CLARIFY" : le message reste probablement lié au transport mais n'est ni un lieu, ni une des actions listées — pose UNE question naturelle et courte pour faire avancer la conversation (jamais "je n'ai pas compris").
- "OFF_TOPIC" : le message n'a clairement aucun rapport avec le transport ou la réservation.
- Le message peut être écrit en français, arabe standard ou hassaniya, avec fautes d'orthographe ou graphie phonétique — comprends malgré ces variations, et normalise un lieu mentionné sans jamais en inventer un autre.
- Réponds uniquement avec le JSON demandé, rien d'autre.""".format(actions=", ".join(_DECIDE_ACTIONS))


def _build_decide_system_prompt(settings: LlmSettings) -> str:
    # Voir _build_reply_system_prompt : même raccordement du prompt
    # personnalisé admin, pour /decide (IDLE / AWAITING_ORIGIN / AWAITING_DEST).
    custom = (settings.system_prompt or "").strip()
    if not custom:
        return _DECIDE_SYSTEM_PROMPT
    return _DECIDE_SYSTEM_PROMPT + f"\n\nContexte additionnel fourni par l'administrateur : {custom}"


def _build_decide_user_prompt(text: str, context: dict, settings: LlmSettings) -> str:
    # Réutilise exactement la même construction d'historique que /analyze —
    # une seule source de vérité pour "comment on résume le contexte".
    return _build_user_prompt(text, context, settings)


def _validate_decide(raw) -> dict | None:
    if not isinstance(raw, dict):
        return None

    action = raw.get("action")
    if action not in _DECIDE_ACTIONS:
        action = "CLARIFY"

    route = raw.get("route")
    if isinstance(route, dict):
        origin = route.get("origin")
        destination = route.get("destination")
        origin = origin.strip() if isinstance(origin, str) and origin.strip() else None
        destination = destination.strip() if isinstance(destination, str) and destination.strip() else None
        route = {"origin": origin, "destination": destination} if (origin or destination) else None
    else:
        route = None

    confidence = _clamp01(raw.get("confidence")) or 0.5

    language = raw.get("language")
    language = language if language in SUPPORTED_LANGUAGES else None

    message = raw.get("message")
    message = message.strip() if isinstance(message, str) and message.strip() else None

    return {
        "action": action, "route": route, "confidence": confidence,
        "language": language, "message": message,
    }


@nlu_bp.post("/decide")
@jwt_required()
def decide():
    data = request.get_json(silent=True) or {}
    text = (data.get("text") or "").strip()
    if not text:
        return error("text est obligatoire")
    context = data.get("context") or {}
    if not isinstance(context, dict):
        context = {}

    settings = LlmSettings.get_current()
    adapter, err = _prepare_call(settings)
    if err:
        return err

    system_prompt = _build_decide_system_prompt(settings)
    user_prompt = _build_decide_user_prompt(text, context, settings)

    raw, err = _complete_or_error(settings, adapter, system_prompt, user_prompt)
    if err:
        return err

    validated = _validate_decide(raw)
    if validated is None:
        _record_failure()
        current_app.logger.warning(f"[NLU] {settings.provider}: réponse /decide invalide (schéma non respecté)")
        return error("Réponse LLM invalide (schéma non respecté)", 502)

    _record_success()
    current_app.logger.info(
        f"[NLU] {settings.provider}: /decide OK — action={validated['action']} "
        f"route={'oui' if validated['route'] else 'non'}"
    )
    return ok(validated)
