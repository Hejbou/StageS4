"""Registre des adaptateurs LLM — un module par fournisseur, même
signature pour tous : complete(*, system_prompt, user_prompt, api_key,
model, temperature, max_tokens, timeout) -> dict.

Ajouter un fournisseur = un nouveau module ici + une entrée dans _ADAPTERS.
Rien d'autre à changer (routes/nlu.py, chat.js, nlu.js restent intacts).
"""
from . import gemini, openrouter
from .errors import (
    LlmProviderError, LlmTimeoutError, LlmQuotaError,
    LlmApiError, LlmInvalidResponseError,
)

_ADAPTERS = {
    "gemini": gemini,
    "openrouter": openrouter,
}


def get_adapter(provider: str):
    """Retourne le module adaptateur pour ce provider, ou None si inconnu
    (ex: 'rules', ou un fournisseur pas encore implémenté)."""
    return _ADAPTERS.get(provider)


__all__ = [
    "get_adapter",
    "LlmProviderError", "LlmTimeoutError", "LlmQuotaError",
    "LlmApiError", "LlmInvalidResponseError",
]
