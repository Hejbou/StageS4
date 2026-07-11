"""
/api/admin/llm-settings — Configuration du futur provider LLM.

Table singleton (voir models/llm_settings.py) : lue/écrite uniquement par
le dashboard admin pour l'instant. Aucun provider LLM n'est encore branché
sur ces valeurs — cette route prépare la structure pour que l'intégration
n'ait qu'à la lire, sans nouvelle migration.

La clé API n'est JAMAIS renvoyée en clair par GET (voir LlmSettings.to_dict) :
seul un booléen `apiKeySet` indique si une clé est enregistrée.
"""
from flask import Blueprint, request
from flask_jwt_extended import jwt_required
from ..extensions import db
from ..models import LlmSettings
from ..models.llm_settings import SUPPORTED_LANGUAGES
from ..utils import ok, error
from ..utils.auth_helpers import require_admin

llm_settings_bp = Blueprint("llm_settings", __name__)


def _get_settings() -> LlmSettings:
    """Récupère l'unique ligne de config, la crée avec les valeurs par
    défaut du modèle si elle n'existe pas encore."""
    settings = LlmSettings.query.get(1)
    if not settings:
        settings = LlmSettings(id=1)
        db.session.add(settings)
        db.session.commit()
    return settings


def _validate_payload(data):
    """Valide et normalise le payload. Retourne (clean, error_msg)."""
    clean = {}

    if "provider" in data:
        provider = (data.get("provider") or "").strip()
        if not provider:
            return None, "provider ne peut pas être vide"
        clean["provider"] = provider

    if "modelName" in data:
        clean["model_name"] = (data.get("modelName") or "").strip() or None

    # Clé API : chaîne vide explicite = effacer la clé ; absente = ne pas
    # toucher à la clé déjà enregistrée (évite de l'écraser à chaque save
    # du formulaire, qui n'affiche jamais la valeur réelle côté client).
    if "apiKey" in data:
        clean["api_key"] = (data.get("apiKey") or "").strip() or None

    if "temperature" in data:
        try:
            temperature = float(data["temperature"])
        except (TypeError, ValueError):
            return None, "temperature doit être un nombre"
        if not (0 <= temperature <= 2):
            return None, "temperature doit être entre 0 et 2"
        clean["temperature"] = temperature

    if "maxTokens" in data:
        try:
            max_tokens = int(data["maxTokens"])
        except (TypeError, ValueError):
            return None, "maxTokens doit être un entier"
        if max_tokens < 1:
            return None, "maxTokens doit être positif"
        clean["max_tokens"] = max_tokens

    if "systemPrompt" in data:
        clean["system_prompt"] = (data.get("systemPrompt") or "").strip() or None

    if "enabledLanguages" in data:
        langs = data.get("enabledLanguages")
        if not isinstance(langs, list) or not langs:
            return None, "enabledLanguages doit être une liste non vide"
        if any(l not in SUPPORTED_LANGUAGES for l in langs):
            return None, f"enabledLanguages doit contenir uniquement : {', '.join(SUPPORTED_LANGUAGES)}"
        clean["enabled_languages"] = langs

    if "historySize" in data:
        try:
            history_size = int(data["historySize"])
        except (TypeError, ValueError):
            return None, "historySize doit être un entier"
        if not (1 <= history_size <= 50):
            return None, "historySize doit être entre 1 et 50"
        clean["history_size"] = history_size

    if "strictTransportMode" in data:
        clean["strict_transport_mode"] = bool(data.get("strictTransportMode"))

    return clean, None


# ── GET /api/admin/llm-settings ─────────────────────────────────────────
@llm_settings_bp.get("/")
@jwt_required()
def get_llm_settings():
    _, err = require_admin()
    if err: return err

    return ok(_get_settings().to_dict())


# ── PUT /api/admin/llm-settings ─────────────────────────────────────────
@llm_settings_bp.put("/")
@jwt_required()
def update_llm_settings():
    _, err = require_admin()
    if err: return err

    data = request.get_json(silent=True) or {}
    clean, msg = _validate_payload(data)
    if msg:
        return error(msg)

    settings = _get_settings()
    for key, value in clean.items():
        setattr(settings, key, value)
    db.session.commit()
    return ok(settings.to_dict(), "Configuration LLM mise à jour")
