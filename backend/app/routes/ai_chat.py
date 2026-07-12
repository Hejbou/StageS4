"""
routes/ai_chat.py — POST /api/chat/ai : réponse générée par OpenAI.

Route INDÉPENDANTE du moteur de règles actuel (routes/chat.py + ChatSession/
ChatMessage en base, consommés par frontend/js/chat.js). Rien ici ne modifie
ces fichiers : c'est un nouveau blueprint, monté à côté, que le frontend ne
consomme pas encore (voir consigne "ne connecter aucun fichier JavaScript").

Pipeline de la route :
    1. valider le corps JSON de la requête
    2. détecter la langue automatiquement si absente (LanguageDetector)
    3. détecter l'intention du message (IntentDetector, informatif)
    4. charger l'historique de la conversation (ConversationMemory) et y
       injecter le prompt système si c'est le premier message
    5. appeler OpenAI (OpenAIService)
    6. sauvegarder la réponse dans l'historique
    7. renvoyer un JSON avec la forme exacte attendue par le consommateur
       de cette API (voir _success_response ci-dessous)
"""
import logging

from flask import Blueprint, request, current_app, jsonify

from ..ai import OpenAIService, OpenAIServiceError, ConversationMemory, LanguageDetector, IntentDetector
from ..ai.prompts import build_system_prompt
from ..utils import error

logger = logging.getLogger(__name__)

ai_chat_bp = Blueprint("ai_chat", __name__)

# ── État du module ────────────────────────────────────────────────
# Mémoire de conversation partagée par ce process, indexée par
# conversation_id. Volontairement simple (dict en RAM, voir
# ai/conversation_memory.py) : suffisant pour cette étape, remplaçable plus
# tard par un stockage partagé sans changer cette route.
_memory             = ConversationMemory(max_history=6)
_language_detector  = LanguageDetector()
_intent_detector    = IntentDetector()

_SUPPORTED_LANGUAGES = ("fr", "ar", "ha")


def _success_response(language, intent, response_text, conversation_id, usage):
    """Construit le JSON de succès avec la forme EXACTE demandée par le
    cahier des charges de cette route (pas le format {success, data,
    message} utilisé par utils/responses.ok — volontairement différent ici
    car imposé par le consommateur de cette API spécifique).
    """
    return jsonify({
        "success":         True,
        "language":        language,
        "intent":          intent,
        "response":        response_text,
        "conversation_id": conversation_id,
        "usage":           usage,
    }), 200


@ai_chat_bp.post("/ai")
def ai_reply():
    """POST /api/chat/ai

    Corps attendu :
        {
            "message": "...",          (obligatoire)
            "language": "fr",          (optionnel — auto-détecté sinon)
            "conversation_id": "...",  (optionnel — généré sinon)
            "user_id": "..."           (optionnel — pour les logs)
        }
    """
    # ── 1. Validation de la requête ──────────────────────────────
    # get_json(silent=True) ne lève pas d'exception sur un corps absent ou
    # mal formé : on peut donc distinguer proprement "pas de JSON du tout"
    # d'un JSON valide mais incomplet.
    data = request.get_json(silent=True)
    if data is None or not isinstance(data, dict):
        logger.warning("POST /api/chat/ai : corps de requête absent ou JSON invalide")
        return error("JSON invalide : le corps de la requête doit être un objet JSON", 400)

    message = (data.get("message") or "").strip()
    if not message:
        return error("Le champ 'message' est obligatoire et ne peut pas être vide", 400)

    conversation_id = str(data.get("conversation_id") or "").strip()
    if not conversation_id:
        # Pas d'ID fourni : chaque appel sans conversation_id démarre sa
        # propre conversation isolée plutôt que de partager un historique.
        conversation_id = f"session-{id(object())}"

    user_id = data.get("user_id")

    # ── 2. Langue : respecte la valeur fournie si elle est valide,
    #    sinon détection automatique (LanguageDetector, même logique que
    #    frontend/js/lang-detect.js) ────────────────────────────────
    language = data.get("language")
    if language not in _SUPPORTED_LANGUAGES:
        language = _language_detector.detect(message, fallback_lang="fr")
        logger.info(
            "POST /api/chat/ai [%s] : langue auto-détectée = %s", conversation_id, language
        )

    # ── 3. Détection d'intention — informatif, n'altère pas le message
    #    envoyé au LLM (voir INTENT_PATTERNS dans ai/intent_detector.py) ──
    intent = _intent_detector.detect_intent(message, language)

    # ── 4. Historique de conversation + prompt système ───────────
    existing_history = _memory.get_history(conversation_id)
    if not any(m["role"] == "system" for m in existing_history):
        system_prompt = build_system_prompt(language=language, strict_transport_mode=True)
        _memory.add_message(conversation_id, "system", system_prompt)

    _memory.add_message(conversation_id, "user", message)
    messages_payload = _memory.get_history(conversation_id)

    # ── 5. Appel à OpenAI ──────────────────────────────────────────
    service = OpenAIService.from_app(current_app)
    if not service.is_configured():
        logger.error(
            "POST /api/chat/ai [%s] : OPENAI_API_KEY absente côté serveur", conversation_id
        )
        return error("Service IA indisponible : clé API OpenAI non configurée", 503)

    try:
        result = service.send_chat(messages_payload)
    except OpenAIServiceError as exc:
        # Regroupe timeout / erreur réseau / erreur HTTP OpenAI / JSON
        # invalide — tous levés comme OpenAIServiceError par send_chat.
        logger.error(
            "POST /api/chat/ai [%s] : échec de l'appel OpenAI — %s", conversation_id, exc
        )
        return error(f"Échec de l'appel au service IA : {exc}", 502)

    ai_text = result["content"]
    usage   = result["usage"]

    # ── 6. Sauvegarde de la réponse dans l'historique ─────────────
    _memory.add_message(conversation_id, "assistant", ai_text)

    logger.info(
        "POST /api/chat/ai [%s] : user_id=%s intent=%s lang=%s "
        "tokens(prompt=%s, completion=%s)",
        conversation_id, user_id, intent, language,
        usage.get("prompt_tokens"), usage.get("completion_tokens"),
    )

    # ── 7. Réponse JSON ───────────────────────────────────────────
    return _success_response(language, intent, ai_text, conversation_id, usage)
